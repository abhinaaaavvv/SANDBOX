-- ============================================================
-- Phase 4 of docs/REMEDIATION_PLAN.md — Team Manager backend
--
-- Locked decisions:
--   * Blocked teams stay visible on the leaderboard with a badge,
--     but cannot write any financial state.
--   * Starting cash locks after a team's first trade; mid-run
--     changes go through adjust_team_cash instead.
--   * remove_team archives nothing silently — destructive delete
--     requires explicit force when history exists.
-- ============================================================

-- ------------------------------------------------------------
-- 1. blocked flag
-- ------------------------------------------------------------
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS blocked boolean NOT NULL DEFAULT false;

-- ------------------------------------------------------------
-- 2. Block enforcement at the database boundary.
--    Trigger guards every financial INSERT/UPDATE so a blocked
--    team cannot trade, receive dividends, or be adjusted.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_team_not_blocked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blocked boolean;
BEGIN
  SELECT t.blocked INTO v_blocked
  FROM public.teams t
  WHERE t.id = NEW.team_id;

  IF v_blocked IS TRUE THEN
    RAISE EXCEPTION 'TEAM_BLOCKED: team % is blocked from trading', NEW.team_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trades_not_blocked ON public.trades;
CREATE TRIGGER trg_trades_not_blocked
  BEFORE INSERT OR UPDATE OF quantity ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.enforce_team_not_blocked();

DROP TRIGGER IF EXISTS trg_holdings_not_blocked ON public.holdings;
CREATE TRIGGER trg_holdings_not_blocked
  BEFORE INSERT OR UPDATE OF quantity ON public.holdings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_team_not_blocked();

DROP TRIGGER IF EXISTS trg_cash_ledger_not_blocked ON public.cash_ledger;
CREATE TRIGGER trg_cash_ledger_not_blocked
  BEFORE INSERT ON public.cash_ledger
  FOR EACH ROW EXECUTE FUNCTION public.enforce_team_not_blocked();

DROP TRIGGER IF EXISTS trg_dividend_payments_not_blocked ON public.dividend_payments;
CREATE TRIGGER trg_dividend_payments_not_blocked
  BEFORE INSERT ON public.dividend_payments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_team_not_blocked();

-- ------------------------------------------------------------
-- 3. block_team / unblock_team
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_team_blocked(p_team_id uuid, p_blocked boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin();

  IF p_team_id = auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN: admins cannot block themselves';
  END IF;

  UPDATE public.teams
  SET blocked = p_blocked, updated_at = now()
  WHERE id = p_team_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TEAM_NOT_FOUND: %', p_team_id;
  END IF;

  PERFORM public.notify_realtime(
    'team:' || p_team_id::text,
    'PORTFOLIO_CHANGED',
    p_team_id,
    jsonb_build_object('reason', CASE WHEN p_blocked THEN 'blocked' ELSE 'unblocked' END, 'occurred_at', now())
  );

  RETURN jsonb_build_object('ok', true, 'team_id', p_team_id, 'blocked', p_blocked);
END;
$$;

-- ------------------------------------------------------------
-- 4. rename_team
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rename_team(p_team_id uuid, p_new_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := trim(p_new_name);
BEGIN
  PERFORM public.assert_admin();

  IF char_length(v_name) = 0 THEN
    RAISE EXCEPTION 'INVALID_TEAM_NAME: name cannot be empty';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.teams
    WHERE lower(name) = lower(v_name) AND id <> p_team_id
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_TEAM_NAME: % is already taken', v_name;
  END IF;

  UPDATE public.teams
  SET name = v_name, display_name = v_name, updated_at = now()
  WHERE id = p_team_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TEAM_NOT_FOUND: %', p_team_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'team_id', p_team_id, 'name', v_name);
END;
$$;

-- ------------------------------------------------------------
-- 5. set_team_starting_cash — allowed only before first trade
--    (locked decision #4). Mid-run changes must use
--    adjust_team_cash so the ledger stays auditable.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_team_starting_cash(p_team_id uuid, p_amount_paise bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trade_count bigint;
  v_run record;
BEGIN
  PERFORM public.assert_admin();

  IF p_amount_paise IS NULL OR p_amount_paise <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: starting cash must be positive';
  END IF;

  SELECT count(*) INTO v_trade_count
  FROM public.trades WHERE team_id = p_team_id;

  IF v_trade_count > 0 THEN
    RAISE EXCEPTION 'STARTING_CASH_LOCKED: team has % executed trade(s); use adjust_team_cash instead', v_trade_count;
  END IF;

  -- Upsert initial_capital in every run the team is funded in;
  -- if none yet, fund into the single active run.
  FOR v_run IN
    SELECT DISTINCT competition_run_id
    FROM public.cash_ledger
    WHERE team_id = p_team_id
  LOOP
    UPDATE public.cash_ledger
    SET amount_paise = p_amount_paise,
        description  = 'Initial capital'
    WHERE team_id = p_team_id
      AND competition_run_id = v_run.competition_run_id
      AND entry_type = 'initial_capital';

    IF NOT FOUND THEN
      INSERT INTO public.cash_ledger
        (team_id, competition_run_id, entry_type, amount_paise, description, created_by)
      VALUES
        (p_team_id, v_run.competition_run_id, 'initial_capital', p_amount_paise,
         'Initial capital', auth.uid());
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM public.cash_ledger WHERE team_id = p_team_id
  ) THEN
    INSERT INTO public.cash_ledger
      (team_id, competition_run_id, entry_type, amount_paise, description, created_by)
    SELECT p_team_id, cr.id, 'initial_capital', p_amount_paise, 'Initial capital', auth.uid()
    FROM public.competition_runs cr
    WHERE cr.status = 'active'
    LIMIT 1;
  END IF;

  PERFORM public.notify_realtime(
    'team:' || p_team_id::text,
    'PORTFOLIO_CHANGED',
    p_team_id,
    jsonb_build_object('reason', 'starting_cash_updated', 'occurred_at', now())
  );

  RETURN jsonb_build_object('ok', true, 'team_id', p_team_id, 'starting_cash_paise', p_amount_paise);
END;
$$;

-- ------------------------------------------------------------
-- 6. remove_team — destructive; requires force when history exists.
--    Cleans all referencing rows (RESTRICT FKs) then deletes the
--    team row. Auth-user deletion is performed separately via the
--    admin API route (service role).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remove_team(p_team_id uuid, p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trades bigint;
  v_batches record;
BEGIN
  PERFORM public.assert_admin();

  IF p_team_id = auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN: admins cannot remove themselves';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.teams WHERE id = p_team_id) THEN
    RAISE EXCEPTION 'TEAM_NOT_FOUND: %', p_team_id;
  END IF;

  SELECT count(*) INTO v_trades FROM public.trades WHERE team_id = p_team_id;

  IF v_trades > 0 AND NOT p_force THEN
    RAISE EXCEPTION 'TEAM_HAS_HISTORY: team has % trade(s); pass force=true to permanently delete', v_trades;
  END IF;

  -- Price-change batches created by this team (created_by FK is RESTRICT).
  FOR v_batches IN
    SELECT id FROM public.price_change_batches WHERE created_by = p_team_id
  LOOP
    DELETE FROM public.pending_price_changes WHERE batch_id = v_batches.id;
  END LOOP;
  DELETE FROM public.pending_price_changes
  WHERE batch_id IN (SELECT id FROM public.price_change_batches WHERE created_by = p_team_id);
  DELETE FROM public.price_change_batches WHERE created_by = p_team_id;

  DELETE FROM public.dividends        WHERE created_by = p_team_id;
  DELETE FROM public.dividend_payments WHERE team_id = p_team_id;
  DELETE FROM public.trades           WHERE team_id = p_team_id OR created_by = p_team_id;
  DELETE FROM public.holdings         WHERE team_id = p_team_id;
  DELETE FROM public.cash_ledger      WHERE team_id = p_team_id OR created_by = p_team_id;
  DELETE FROM public.idempotency_keys WHERE team_id = p_team_id;
  DELETE FROM public.realtime_notifications WHERE team_id = p_team_id;

  DELETE FROM public.teams WHERE id = p_team_id;

  RETURN jsonb_build_object('ok', true, 'team_id', p_team_id, 'forced', COALESCE(p_force, false));
END;
$$;

-- ------------------------------------------------------------
-- 7. Privileges — admin-only, authenticated callers.
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.set_team_blocked(uuid, boolean)     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rename_team(uuid, text)             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_team_starting_cash(uuid, bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remove_team(uuid, boolean)          FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_team_blocked(uuid, boolean)     TO authenticated;
GRANT  EXECUTE ON FUNCTION public.rename_team(uuid, text)             TO authenticated;
GRANT  EXECUTE ON FUNCTION public.set_team_starting_cash(uuid, bigint) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.remove_team(uuid, boolean)          TO authenticated;

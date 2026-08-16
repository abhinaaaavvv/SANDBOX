-- Fix remaining functions broken by teams_are_users migration.
-- get_team_portfolio still referenced profiles + team_members.
-- Orphaned parameterized overloads of is_admin(uuid) and user_team_ids(uuid) also need cleanup.

-- ============================================================================
-- 1. get_team_portfolio() — replace profiles/team_members with teams
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_team_portfolio(
  p_competition_run_id uuid,
  p_team_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id         uuid;
  v_team_id         uuid;
  v_cash_balance    bigint;
  v_holdings_value  bigint;
  v_portfolio_value bigint;
  v_initial_capital bigint;
  v_pnl             bigint;
  v_return_bp       bigint;
  v_missing_count   int;
BEGIN
  -- 1. Authenticate
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: authentication required';
  END IF;

  -- 2. Resolve team_id (team IS the user)
  IF p_team_id IS NULL THEN
    v_team_id := v_user_id;
  ELSE
    v_team_id := p_team_id;
    -- If participant requests another team's portfolio, reject
    IF NOT EXISTS (
      SELECT 1 FROM public.teams
      WHERE id = v_user_id AND role = 'admin'
    ) THEN
      -- Participant can only access their own team
      IF v_team_id <> v_user_id THEN
        RAISE EXCEPTION 'FORBIDDEN: participants can only access their own portfolio';
      END IF;
    END IF;
  END IF;

  -- 3. Check for holdings without market quotes
  SELECT COUNT(*) INTO v_missing_count
  FROM public.holdings h
  LEFT JOIN public.market_quotes mq
    ON mq.stock_id = h.stock_id
    AND mq.competition_run_id = h.competition_run_id
  WHERE h.team_id = v_team_id
    AND h.competition_run_id = p_competition_run_id
    AND h.quantity > 0
    AND mq.price_paise IS NULL;

  IF v_missing_count > 0 THEN
    RAISE EXCEPTION 'MISSING_MARKET_QUOTE: % holding(s) exist without market quotes for this competition run', v_missing_count;
  END IF;

  -- 4. Calculate cash balance
  SELECT COALESCE(SUM(amount_paise), 0) INTO v_cash_balance
  FROM public.cash_ledger
  WHERE team_id = v_team_id
    AND competition_run_id = p_competition_run_id;

  -- 5. Calculate holdings value using current market prices
  SELECT COALESCE(SUM(h.quantity * mq.price_paise), 0) INTO v_holdings_value
  FROM public.holdings h
  INNER JOIN public.market_quotes mq
    ON mq.stock_id = h.stock_id
    AND mq.competition_run_id = h.competition_run_id
  WHERE h.team_id = v_team_id
    AND h.competition_run_id = p_competition_run_id
    AND h.quantity > 0;

  -- 6. Calculate portfolio value
  v_portfolio_value := v_cash_balance + v_holdings_value;

  -- 7. Get initial capital
  SELECT COALESCE(SUM(amount_paise), 0) INTO v_initial_capital
  FROM public.cash_ledger
  WHERE team_id = v_team_id
    AND competition_run_id = p_competition_run_id
    AND entry_type = 'initial_capital';

  -- 8. Calculate P/L
  v_pnl := v_portfolio_value - v_initial_capital;

  -- 9. Calculate return in basis points (1 bp = 0.01%)
  IF v_initial_capital = 0 THEN
    v_return_bp := 0;
  ELSE
    v_return_bp := (v_pnl * 10000) / v_initial_capital;
  END IF;

  RETURN jsonb_build_object(
    'ok',                     true,
    'team_id',                v_team_id,
    'competition_run_id',     p_competition_run_id,
    'cash_balance_paise',     v_cash_balance,
    'holdings_value_paise',   v_holdings_value,
    'portfolio_value_paise',  v_portfolio_value,
    'initial_capital_paise',  v_initial_capital,
    'pnl_paise',              v_pnl,
    'return_basis_points',    v_return_bp
  );
END;
$$;

COMMENT ON FUNCTION public.get_team_portfolio(uuid, uuid)
  IS 'Returns portfolio state for a team. Team IS the user (teams-are-users). Detects missing market quotes.';

-- ============================================================================
-- 2. Drop orphaned parameterized overloads that still reference old tables
-- ============================================================================
DROP FUNCTION IF EXISTS public.is_admin(uuid);
DROP FUNCTION IF EXISTS public.user_team_ids(uuid);

-- ============================================================================
-- 3. Re-grant EXECUTE to authenticated role
-- ============================================================================
REVOKE EXECUTE ON FUNCTION public.get_team_portfolio(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_portfolio(uuid, uuid) TO authenticated;

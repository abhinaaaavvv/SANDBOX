-- ============================================================
-- Follow-up fix: blocked teams vs competition reset
--
--   * enforce_team_not_blocked: exempt system funding
--     (entry_type='initial_capital') so reset/provisioning can
--     always fund teams; all other writes stay blocked.
--   * reset_competition_run: unblocks every team (fresh-start
--     semantics) before re-funding at ₹1,00,000.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_team_not_blocked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blocked boolean;
  v_entry   text;
BEGIN
  SELECT t.blocked INTO v_blocked
  FROM public.teams t
  WHERE t.id = NEW.team_id;

  IF v_blocked IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'cash_ledger' THEN
    v_entry := (to_jsonb(NEW) ->> 'entry_type');
    IF v_entry = 'initial_capital' THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'TEAM_BLOCKED: team % is blocked from trading', NEW.team_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_competition_run(p_competition_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team record;
BEGIN
  PERFORM public.assert_admin();

  IF NOT EXISTS (
    SELECT 1 FROM public.competition_runs WHERE id = p_competition_run_id
  ) THEN
    RAISE EXCEPTION 'COMPETITION_RUN_NOT_FOUND: %', p_competition_run_id;
  END IF;

  UPDATE public.rounds
  SET status = 'pending',
      started_at = NULL,
      ends_at = NULL,
      market_status = 'closed',
      trading_status = 'paused',
      paused_at = NULL,
      accumulated_pause_duration = interval '0',
      updated_at = now()
  WHERE competition_run_id = p_competition_run_id;

  DELETE FROM public.idempotency_keys WHERE competition_run_id = p_competition_run_id;
  DELETE FROM public.dividend_payments WHERE competition_run_id = p_competition_run_id;
  DELETE FROM public.dividends        WHERE competition_run_id = p_competition_run_id;
  DELETE FROM public.trades           WHERE competition_run_id = p_competition_run_id;
  DELETE FROM public.holdings         WHERE competition_run_id = p_competition_run_id;
  DELETE FROM public.cash_ledger      WHERE competition_run_id = p_competition_run_id;

  DELETE FROM public.pending_price_changes
  WHERE batch_id IN (
    SELECT id FROM public.price_change_batches
    WHERE competition_run_id = p_competition_run_id
      AND status <> 'applied'
  );

  UPDATE public.price_change_batches
  SET status = 'cancelled'
  WHERE competition_run_id = p_competition_run_id
    AND status <> 'applied';

  UPDATE public.market_quotes q
  SET price_paise = s.initial_price_paise,
      updated_at  = now()
  FROM public.stocks s
  WHERE s.id = q.stock_id
    AND q.competition_run_id = p_competition_run_id;

  UPDATE public.stocks
  SET is_active = true, updated_at = now()
  WHERE is_active = false;

  UPDATE public.teams SET blocked = false WHERE blocked IS TRUE;

  FOR v_team IN SELECT id FROM public.teams WHERE role = 'participant'
  LOOP
    INSERT INTO public.cash_ledger
      (team_id, competition_run_id, entry_type, amount_paise, description, created_by)
    VALUES
      (v_team.id, p_competition_run_id, 'initial_capital', 10000000,
       'Initial capital (reset)', auth.uid());
  END LOOP;

  FOR v_team IN SELECT id FROM public.teams WHERE role = 'participant'
  LOOP
    PERFORM public.notify_realtime(
      'team:' || v_team.id::text,
      'PORTFOLIO_CHANGED',
      v_team.id,
      jsonb_build_object(
        'competition_run_id', p_competition_run_id,
        'reason', 'reset',
        'occurred_at', now()
      )
    );
  END LOOP;

  PERFORM public.notify_realtime(
    'run:' || p_competition_run_id::text,
    'ROUND_STATE_CHANGED',
    NULL,
    jsonb_build_object(
      'competition_run_id', p_competition_run_id,
      'status', 'pending',
      'market_status', 'closed',
      'trading_status', 'paused',
      'occurred_at', now()
    )
  );

  PERFORM public.notify_realtime(
    'run:' || p_competition_run_id::text,
    'PRICES_CHANGED',
    NULL,
    jsonb_build_object(
      'competition_run_id', p_competition_run_id,
      'reason', 'reset_to_opening_prices',
      'occurred_at', now()
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'competition_run_id', p_competition_run_id,
    'starting_cash_paise', 10000000,
    'market_repriced', true
  );
END;
$$;

COMMENT ON FUNCTION public.reset_competition_run(uuid) IS
  'Admin: atomic competition reset — rounds pending, financials cleared, teams unblocked and re-funded ₹1,00,000, market repriced to opening prices, all stocks reactivated.';

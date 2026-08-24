-- ============================================================
-- Phase 1 of docs/REMEDIATION_PLAN.md — reset_competition_run()
--
-- Full atomic competition reset promised by the admin Reset dialog:
--   rounds -> pending, financial state cleared, every participant
--   team re-funded ₹1,00,000, realtime signals emitted.
-- ============================================================

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

  -- 1. Rounds back to pending.
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

  -- 2. Clear financial + operational state for this run.
  DELETE FROM public.idempotency_keys WHERE competition_run_id = p_competition_run_id;
  DELETE FROM public.dividend_payments WHERE competition_run_id = p_competition_run_id;
  DELETE FROM public.dividends        WHERE competition_run_id = p_competition_run_id;
  DELETE FROM public.trades           WHERE competition_run_id = p_competition_run_id;
  DELETE FROM public.holdings         WHERE competition_run_id = p_competition_run_id;
  DELETE FROM public.cash_ledger      WHERE competition_run_id = p_competition_run_id;

  -- 3. Drop pending/draft price-change state (keep applied history).
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

  -- 4. Re-fund every participant team at ₹1,00,000 (10,000,000 paise).
  FOR v_team IN
    SELECT id FROM public.teams WHERE role = 'participant'
  LOOP
    INSERT INTO public.cash_ledger
      (team_id, competition_run_id, entry_type, amount_paise, description, created_by)
    VALUES
      (v_team.id, p_competition_run_id, 'initial_capital', 10000000,
       'Initial capital (reset)', auth.uid());
  END LOOP;

  -- 5. Realtime wake-up signals (identifiers only).
  FOR v_team IN
    SELECT id FROM public.teams WHERE role = 'participant'
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

  RETURN jsonb_build_object(
    'ok', true,
    'competition_run_id', p_competition_run_id,
    'starting_cash_paise', 10000000
  );
END;
$$;

COMMENT ON FUNCTION public.reset_competition_run(uuid) IS
  'Admin: atomic competition reset — rounds to pending, financials cleared, teams re-funded ₹1,00,000.';

REVOKE EXECUTE ON FUNCTION public.reset_competition_run(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_competition_run(uuid) TO authenticated;

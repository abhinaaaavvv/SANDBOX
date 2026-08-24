-- ============================================================
-- Auto-end expired rounds (REMEDIATION_PLAN Phase 1 follow-up)
--
-- Two layers, per BACKEND.md §46:
--   1. Correctness: execute_trade rejects any trade arriving at or
--      after the round's authoritative ends_at, even if the round
--      row has not been finalized yet.
--   2. Finalization: auto_end_expired_rounds() flips expired active
--      rounds to completed (keeping the ORIGINAL ends_at), closes
--      the market and pauses trading, and notifies clients. Fired
--      by pg_cron every 30s AND callable by any authenticated user
--      so an open browser finalizes instantly at 00:00.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ------------------------------------------------------------
-- 1. execute_trade: hard expiry guard
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_trade(p_competition_run_id uuid, p_stock_id uuid, p_side text, p_quantity bigint, p_idempotency_key text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id     uuid;
  v_team_id     uuid;
  v_run         record;
  v_round       record;
  v_stock       record;
  v_quote       record;
  v_holding     record;
  v_cash_balance bigint;
  v_total_value  bigint;
  v_trade_id    uuid;
  v_now         timestamptz := now();
  v_idem_record record;
  v_request_hash text;
  v_lock_row    record;
  v_is_replay   boolean := false;
BEGIN
  -- 1. Authenticate
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: authentication required';
  END IF;

  -- 2. Resolve team (one team per user)
  v_team_id := public.resolve_user_team(v_user_id, p_competition_run_id);

  -- 3. Validate competition run
  SELECT * INTO v_run
  FROM public.competition_runs
  WHERE id = p_competition_run_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMPETITION_RUN_NOT_FOUND: %', p_competition_run_id;
  END IF;

  IF v_run.status <> 'active' THEN
    RAISE EXCEPTION 'INVALID_STATE: competition run status is %, expected active', v_run.status;
  END IF;

  -- 4. Validate team is participating in this run (has initial capital)
  IF NOT EXISTS (
    SELECT 1 FROM public.cash_ledger
    WHERE team_id = v_team_id
      AND competition_run_id = p_competition_run_id
      AND entry_type = 'initial_capital'
  ) THEN
    RAISE EXCEPTION 'TEAM_NOT_PARTICIPATING: team % has not been initialized for run %', v_team_id, p_competition_run_id;
  END IF;

  -- 5. Validate stock
  SELECT * INTO v_stock
  FROM public.stocks
  WHERE id = p_stock_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'STOCK_NOT_FOUND: %', p_stock_id;
  END IF;

  IF NOT v_stock.is_active THEN
    RAISE EXCEPTION 'STOCK_INACTIVE: % (%)', v_stock.symbol, p_stock_id;
  END IF;

  -- 6. Validate round state (any active round with trading enabled and market open)
  SELECT * INTO v_round
  FROM public.rounds
  WHERE competition_run_id = p_competition_run_id
    AND status = 'active'
    AND trading_status = 'enabled'
    AND market_status = 'open';

  -- 6a. Authoritative expiry check: the database wins over any browser timer.
  IF FOUND AND v_round.ends_at IS NOT NULL AND v_round.ends_at <= v_now THEN
    RAISE EXCEPTION 'ROUND_EXPIRED: round % ended at %', v_round.round_number, v_round.ends_at;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TRADING_NOT_ALLOWED: no active round with trading enabled and market open';
  END IF;

  -- 7. Validate side
  IF p_side NOT IN ('buy', 'sell') THEN
    RAISE EXCEPTION 'INVALID_SIDE: side must be buy or sell, got %', p_side;
  END IF;

  -- 8. Validate quantity
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY: quantity must be positive, got %', p_quantity;
  END IF;

  -- 9. Read authoritative market price
  SELECT * INTO v_quote
  FROM public.market_quotes
  WHERE stock_id = p_stock_id
    AND competition_run_id = p_competition_run_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_MARKET_QUOTE: stock % has no price quote for run %', v_stock.symbol, p_competition_run_id;
  END IF;

  -- 10. Calculate total value (integer arithmetic)
  v_total_value := p_quantity * v_quote.price_paise;

  -- 11. Idempotency check
  IF p_idempotency_key IS NOT NULL AND p_idempotency_key <> '' THEN
    v_request_hash := md5(p_competition_run_id::text || p_stock_id::text || p_side || p_quantity::text);

    SELECT * INTO v_idem_record
    FROM public.idempotency_keys
    WHERE team_id = v_team_id
      AND competition_run_id = p_competition_run_id
      AND operation_type = 'execute_trade'
      AND idempotency_key = p_idempotency_key;

    IF FOUND THEN
      IF v_idem_record.request_hash <> v_request_hash THEN
        RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: idempotency key % reused with different parameters', p_idempotency_key;
      END IF;

      IF v_idem_record.result_status = 'completed' THEN
        RETURN jsonb_build_object(
          'ok',         true,
          'trade_id',   v_idem_record.result_id,
          'message',    'Trade already executed (idempotent)',
          'idempotency_key', p_idempotency_key
        );
      ELSIF v_idem_record.result_status = 'failed' THEN
        DELETE FROM public.idempotency_keys WHERE id = v_idem_record.id;
      END IF;
    ELSE
      INSERT INTO public.idempotency_keys (team_id, competition_run_id, operation_type, idempotency_key, request_hash, result_status, created_at)
      VALUES (v_team_id, p_competition_run_id, 'execute_trade', p_idempotency_key, v_request_hash, 'pending', v_now);
    END IF;
  END IF;

  -- 12. CRITICAL: Lock the initial_capital row to serialize all financial operations
  SELECT * INTO v_lock_row
  FROM public.cash_ledger
  WHERE team_id = v_team_id
    AND competition_run_id = p_competition_run_id
    AND entry_type = 'initial_capital'
  FOR UPDATE;

  -- Re-check expiry while holding the lock (round may have expired mid-wait).
  IF v_round.ends_at IS NOT NULL AND v_round.ends_at <= clock_timestamp() THEN
    UPDATE public.idempotency_keys
    SET result_status = 'failed', completed_at = clock_timestamp()
    WHERE team_id = v_team_id
      AND competition_run_id = p_competition_run_id
      AND operation_type = 'execute_trade'
      AND idempotency_key = p_idempotency_key;
    RAISE EXCEPTION 'ROUND_EXPIRED: round % ended at %', v_round.round_number, v_round.ends_at;
  END IF;

  -- 13. Validate and execute based on side
  IF p_side = 'buy' THEN
    SELECT COALESCE(SUM(amount_paise), 0) INTO v_cash_balance
    FROM public.cash_ledger
    WHERE team_id = v_team_id
      AND competition_run_id = p_competition_run_id;

    IF v_cash_balance < v_total_value THEN
      RAISE EXCEPTION 'INSUFFICIENT_CASH: available % paise, required % paise', v_cash_balance, v_total_value;
    END IF;

    SELECT * INTO v_holding
    FROM public.holdings
    WHERE team_id = v_team_id
      AND competition_run_id = p_competition_run_id
      AND stock_id = p_stock_id;

    IF FOUND THEN
      UPDATE public.holdings
      SET quantity = quantity + p_quantity
      WHERE id = v_holding.id;
    ELSE
      INSERT INTO public.holdings (team_id, competition_run_id, stock_id, quantity, created_at, updated_at)
      VALUES (v_team_id, p_competition_run_id, p_stock_id, p_quantity, v_now, v_now);
    END IF;

  ELSIF p_side = 'sell' THEN
    SELECT * INTO v_holding
    FROM public.holdings
    WHERE team_id = v_team_id
      AND competition_run_id = p_competition_run_id
      AND stock_id = p_stock_id;

    IF NOT FOUND OR v_holding.quantity < p_quantity THEN
      RAISE EXCEPTION 'INSUFFICIENT_HOLDINGS: requested % shares, available %', p_quantity, COALESCE(v_holding.quantity, 0);
    END IF;

    UPDATE public.holdings
    SET quantity = quantity - p_quantity
    WHERE id = v_holding.id;
  END IF;

  -- 14. Create trade record
  INSERT INTO public.trades (team_id, competition_run_id, stock_id, side, quantity, executed_price_paise, total_value_paise, executed_at, created_by, idempotency_key)
  VALUES (v_team_id, p_competition_run_id, p_stock_id, p_side, p_quantity, v_quote.price_paise, v_total_value, v_now, v_user_id, p_idempotency_key)
  RETURNING id INTO v_trade_id;

  -- 15. Create cash ledger entry
  INSERT INTO public.cash_ledger (team_id, competition_run_id, entry_type, amount_paise, reference_type, reference_id, description, created_by, created_at)
  VALUES (
    v_team_id,
    p_competition_run_id,
    CASE WHEN p_side = 'buy' THEN 'trade_buy' ELSE 'trade_sell' END,
    CASE WHEN p_side = 'buy' THEN -v_total_value ELSE v_total_value END,
    'trade',
    v_trade_id,
    FORMAT('%s %s %s shares at %s paise each', UPPER(p_side), v_stock.symbol, p_quantity, v_quote.price_paise),
    v_user_id,
    v_now
  );

  -- 16. Update idempotency record
  IF p_idempotency_key IS NOT NULL AND p_idempotency_key <> '' THEN
    UPDATE public.idempotency_keys
    SET result_id = v_trade_id,
        result_status = 'completed',
        completed_at = v_now
    WHERE team_id = v_team_id
      AND competition_run_id = p_competition_run_id
      AND operation_type = 'execute_trade'
      AND idempotency_key = p_idempotency_key;
  END IF;

  -- 17. Notify: portfolio changed (team-scoped, only this team sees)
  PERFORM public.notify_realtime(
    'team:' || v_team_id::text,
    'PORTFOLIO_CHANGED',
    v_team_id,
    jsonb_build_object(
      'competition_run_id', p_competition_run_id,
      'reason', 'trade',
      'trade_id', v_trade_id,
      'occurred_at', v_now
    )
  );

  -- 18. Notify: leaderboard changed (run-scoped, all participants see)
  PERFORM public.notify_realtime(
    'run:' || p_competition_run_id::text,
    'LEADERBOARD_CHANGED',
    NULL,
    jsonb_build_object(
      'competition_run_id', p_competition_run_id,
      'reason', 'trade',
      'occurred_at', v_now
    )
  );

  RETURN jsonb_build_object(
    'ok',                 true,
    'trade_id',           v_trade_id,
    'side',               p_side,
    'stock_id',           p_stock_id,
    'stock_symbol',       v_stock.symbol,
    'quantity',           p_quantity,
    'executed_price_paise', v_quote.price_paise,
    'total_value_paise',  v_total_value,
    'executed_at',        v_now,
    'idempotency_key',    p_idempotency_key
  );
END;
$function$;

-- ------------------------------------------------------------
-- 2. auto_end_expired_rounds()
--    Idempotent finalizer. No auth requirement inside — safe for
--    both pg_cron (postgres) and authenticated browser callers.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_end_expired_rounds()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round record;
  v_count integer := 0;
BEGIN
  FOR v_round IN
    SELECT *
    FROM public.rounds
    WHERE status = 'active'
      AND ends_at IS NOT NULL
      AND ends_at <= now()
  LOOP
    UPDATE public.rounds
    SET status         = 'completed',
        market_status  = 'closed',
        trading_status = 'paused',
        paused_at      = NULL,
        updated_at     = now()
    WHERE id = v_round.id;

    PERFORM public.notify_realtime(
      'run:' || v_round.competition_run_id::text,
      'ROUND_STATE_CHANGED',
      NULL,
      jsonb_build_object(
        'competition_run_id', v_round.competition_run_id,
        'round_id', v_round.id,
        'round_number', v_round.round_number,
        'status', 'completed',
        'market_status', 'closed',
        'trading_status', 'paused',
        'ended_at', v_round.ends_at,
        'auto_ended', true,
        'occurred_at', now()
      )
    );

    PERFORM public.notify_realtime(
      'run:' || v_round.competition_run_id::text,
      'LEADERBOARD_CHANGED',
      NULL,
      jsonb_build_object(
        'competition_run_id', v_round.competition_run_id,
        'reason', 'round_auto_ended',
        'occurred_at', now()
      )
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'ended_rounds', v_count);
END;
$$;

COMMENT ON FUNCTION public.auto_end_expired_rounds() IS
  'Finalizes any active round whose authoritative ends_at has passed: marks completed, closes market, pauses trading, notifies clients. Safe to call repeatedly.';

REVOKE EXECUTE ON FUNCTION public.auto_end_expired_rounds() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_end_expired_rounds() TO authenticated;

-- ------------------------------------------------------------
-- 3. Schedule: every 30 seconds covers the nobody-watching case.
-- ------------------------------------------------------------
SELECT cron.schedule(
  'sandbox-auto-end-rounds',
  '30 seconds',
  $$SELECT public.auto_end_expired_rounds()$$
)
WHERE NOT EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'sandbox-auto-end-rounds'
);

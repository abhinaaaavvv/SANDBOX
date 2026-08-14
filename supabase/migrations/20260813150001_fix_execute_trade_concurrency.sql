-- ============================================================
-- Phase 4 Fix: Concurrency Safety for execute_trade()
-- ============================================================
-- Issue: execute_trade() did not use proper serialization.
-- Two concurrent trades could read the same cash balance/holdings
-- and both pass validation, leading to double-spending or overselling.
--
-- Solution: Use SELECT FOR UPDATE on the initial_capital row in
-- cash_ledger to serialize all financial operations for a team/run.
-- This row is guaranteed to exist for participating teams and is
-- specific to the team/run combination.
-- ============================================================

-- -----------------------------------------------------------
-- 1. Replace execute_trade() with proper locking
-- -----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.execute_trade(
  p_competition_run_id uuid,
  p_stock_id uuid,
  p_side text,
  p_quantity bigint,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    -- Compute request hash (SHA-256 would be ideal, but PostgreSQL doesn't have native SHA-256)
    -- Using MD5 for now; can upgrade later if needed
    v_request_hash := md5(p_competition_run_id::text || p_stock_id::text || p_side || p_quantity::text);

    -- Check for existing idempotency record
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
        -- Return original result (trade already executed)
        RETURN jsonb_build_object(
          'ok',         true,
          'trade_id',   v_idem_record.result_id,
          'message',    'Trade already executed (idempotent)',
          'idempotency_key', p_idempotency_key
        );
      ELSIF v_idem_record.result_status = 'failed' THEN
        -- Allow retry (previous attempt failed and rolled back)
        DELETE FROM public.idempotency_keys WHERE id = v_idem_record.id;
      END IF;
    ELSE
      -- Create idempotency record
      INSERT INTO public.idempotency_keys (team_id, competition_run_id, operation_type, idempotency_key, request_hash, result_status, created_at)
      VALUES (v_team_id, p_competition_run_id, 'execute_trade', p_idempotency_key, v_request_hash, 'pending', v_now);
    END IF;
  END IF;

  -- 12. CRITICAL: Lock the initial_capital row to serialize all financial operations
  -- This row is guaranteed to exist for participating teams and is specific to team/run.
  -- SELECT FOR UPDATE will block concurrent transactions from proceeding until this
  -- transaction commits or rolls back.
  SELECT * INTO v_lock_row
  FROM public.cash_ledger
  WHERE team_id = v_team_id
    AND competition_run_id = p_competition_run_id
    AND entry_type = 'initial_capital'
  FOR UPDATE;

  -- 13. Validate and execute based on side
  IF p_side = 'buy' THEN
    -- Validate cash availability (now with lock held)
    SELECT COALESCE(SUM(amount_paise), 0) INTO v_cash_balance
    FROM public.cash_ledger
    WHERE team_id = v_team_id
      AND competition_run_id = p_competition_run_id;

    IF v_cash_balance < v_total_value THEN
      RAISE EXCEPTION 'INSUFFICIENT_CASH: available % paise, required % paise', v_cash_balance, v_total_value;
    END IF;

    -- Update or create holding
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
    -- Validate holdings (now with lock held)
    SELECT * INTO v_holding
    FROM public.holdings
    WHERE team_id = v_team_id
      AND competition_run_id = p_competition_run_id
      AND stock_id = p_stock_id;

    IF NOT FOUND OR v_holding.quantity < p_quantity THEN
      RAISE EXCEPTION 'INSUFFICIENT_HOLDINGS: requested % shares, available %', p_quantity, COALESCE(v_holding.quantity, 0);
    END IF;

    -- Decrease holding
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
$$;

COMMENT ON FUNCTION public.execute_trade(uuid, uuid, text, bigint, text)
  IS 'Authoritative trade execution. Atomic: trade + holding update + cash ledger entry. Uses SELECT FOR UPDATE on initial_capital row to serialize concurrent trades for the same team/run.';

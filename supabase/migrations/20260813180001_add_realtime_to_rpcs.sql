-- ============================================================
-- Phase 7: Add Realtime notifications to existing RPCs
-- ============================================================
-- Each RPC inserts a notification AFTER the main operation.
-- The notification is committed atomically with the RPC transaction.
-- If the RPC rolls back, no notification is sent.
--
-- Event types:
--   ROUND_STATE_CHANGED  - round status/market/trading changed
--   MARKET_STATE_CHANGED - market or trading status changed
--   PRICES_CHANGED       - price batch applied
--   PORTFOLIO_CHANGED    - trade/dividend/cash adjustment for a team
--   LEADERBOARD_CHANGED  - leaderboard may have changed
--   DIVIDENDS_PAID       - dividend applied (run-scoped)
--
-- Payloads contain IDENTIFIERS only, never financial truth.
-- ============================================================;

-- -----------------------------------------------------------
-- Helper: resolve run_id from a round_id
-- -----------------------------------------------------------

CREATE OR REPLACE FUNCTION public._get_run_id_from_round(p_round_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT competition_run_id FROM public.rounds WHERE id = p_round_id;
$$;

-- -----------------------------------------------------------
-- 1. start_round() — add notification
-- -----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.start_round(p_round_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round record;
  v_run   record;
  v_now   timestamptz := now();
  v_duration interval := '15 minutes';
  v_run_id uuid;
BEGIN
  -- Authorize
  PERFORM public.assert_admin();

  -- Lock the round row to prevent concurrent transitions
  SELECT * INTO v_round
  FROM public.rounds
  WHERE id = p_round_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROUND_NOT_FOUND: %', p_round_id;
  END IF;

  IF v_round.status <> 'pending' THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION: round status is %, expected pending', v_round.status;
  END IF;

  -- Load parent run
  SELECT * INTO v_run
  FROM public.competition_runs
  WHERE id = v_round.competition_run_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMPETITION_RUN_NOT_FOUND: %', v_round.competition_run_id;
  END IF;

  -- Only an active run can have rounds started
  IF v_run.status <> 'active' THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION: run status is %, expected active', v_run.status;
  END IF;

  -- Enforce round exclusivity: no other round in this run may be active
  IF EXISTS (
    SELECT 1 FROM public.rounds
    WHERE competition_run_id = v_round.competition_run_id
      AND status = 'active'
      AND id <> v_round.id
  ) THEN
    RAISE EXCEPTION 'ROUND_CONFLICT: another round is already active in this run';
  END IF;

  -- Enforce sequential ordering: earlier rounds must be completed
  IF EXISTS (
    SELECT 1 FROM public.rounds
    WHERE competition_run_id = v_round.competition_run_id
      AND round_number < v_round.round_number
      AND status <> 'completed'
  ) THEN
    RAISE EXCEPTION 'ROUND_ORDER: all preceding rounds must be completed before starting round %', v_round.round_number;
  END IF;

  -- Apply authoritative timestamps (server-side only)
  UPDATE public.rounds
  SET status        = 'active',
      started_at    = v_now,
      ends_at       = v_now + v_duration,
      market_status = 'closed',
      trading_status= 'paused'
  WHERE id = p_round_id;

  v_run_id := v_round.competition_run_id;

  -- Notify: round state changed
  PERFORM public.notify_realtime(
    'run:' || v_run_id::text,
    'ROUND_STATE_CHANGED',
    NULL,
    jsonb_build_object(
      'competition_run_id', v_run_id,
      'round_id', p_round_id,
      'round_number', v_round.round_number,
      'status', 'active',
      'market_status', 'closed',
      'trading_status', 'paused',
      'started_at', v_now,
      'ends_at', v_now + v_duration,
      'occurred_at', v_now
    )
  );

  RETURN jsonb_build_object(
    'ok',         true,
    'round_id',   p_round_id,
    'started_at', v_now,
    'ends_at',    v_now + v_duration
  );
END;
$$;

-- -----------------------------------------------------------
-- 2. end_round() — add notification
-- -----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.end_round(p_round_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round record;
  v_now   timestamptz := now();
  v_run_id uuid;
BEGIN
  PERFORM public.assert_admin();

  SELECT * INTO v_round
  FROM public.rounds
  WHERE id = p_round_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROUND_NOT_FOUND: %', p_round_id;
  END IF;

  IF v_round.status <> 'active' THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION: round status is %, expected active', v_round.status;
  END IF;

  UPDATE public.rounds
  SET status         = 'completed',
      ends_at        = v_now,
      market_status  = 'closed',
      trading_status = 'paused'
  WHERE id = p_round_id;

  v_run_id := v_round.competition_run_id;

  -- Notify: round state changed
  PERFORM public.notify_realtime(
    'run:' || v_run_id::text,
    'ROUND_STATE_CHANGED',
    NULL,
    jsonb_build_object(
      'competition_run_id', v_run_id,
      'round_id', p_round_id,
      'round_number', v_round.round_number,
      'status', 'completed',
      'market_status', 'closed',
      'trading_status', 'paused',
      'ended_at', v_now,
      'occurred_at', v_now
    )
  );

  -- Notify: leaderboard may have changed (round ended)
  PERFORM public.notify_realtime(
    'run:' || v_run_id::text,
    'LEADERBOARD_CHANGED',
    NULL,
    jsonb_build_object(
      'competition_run_id', v_run_id,
      'reason', 'round_ended',
      'occurred_at', v_now
    )
  );

  RETURN jsonb_build_object(
    'ok',       true,
    'round_id', p_round_id,
    'ended_at', v_now
  );
END;
$$;

-- -----------------------------------------------------------
-- 3. open_market() — add notification
-- -----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.open_market(p_round_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round record;
  v_now   timestamptz := now();
  v_run_id uuid;
BEGIN
  PERFORM public.assert_admin();

  SELECT * INTO v_round
  FROM public.rounds
  WHERE id = p_round_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROUND_NOT_FOUND: %', p_round_id;
  END IF;

  IF v_round.status <> 'active' THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION: round status is %, expected active', v_round.status;
  END IF;

  IF v_round.market_status <> 'closed' THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION: market_status is %, expected closed', v_round.market_status;
  END IF;

  UPDATE public.rounds
  SET market_status = 'open'
  WHERE id = p_round_id;

  v_run_id := v_round.competition_run_id;

  -- Notify: market state changed
  PERFORM public.notify_realtime(
    'run:' || v_run_id::text,
    'MARKET_STATE_CHANGED',
    NULL,
    jsonb_build_object(
      'competition_run_id', v_run_id,
      'round_id', p_round_id,
      'market_status', 'open',
      'trading_status', v_round.trading_status,
      'occurred_at', v_now
    )
  );

  RETURN jsonb_build_object(
    'ok',           true,
    'round_id',     p_round_id,
    'market_status','open'
  );
END;
$$;

-- -----------------------------------------------------------
-- 4. close_market() — add notification
-- -----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.close_market(p_round_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round record;
  v_now   timestamptz := now();
  v_run_id uuid;
BEGIN
  PERFORM public.assert_admin();

  SELECT * INTO v_round
  FROM public.rounds
  WHERE id = p_round_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROUND_NOT_FOUND: %', p_round_id;
  END IF;

  IF v_round.status <> 'active' THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION: round status is %, expected active', v_round.status;
  END IF;

  IF v_round.market_status <> 'open' THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION: market_status is %, expected open', v_round.market_status;
  END IF;

  UPDATE public.rounds
  SET market_status = 'closed'
  WHERE id = p_round_id;

  v_run_id := v_round.competition_run_id;

  -- Notify: market state changed
  PERFORM public.notify_realtime(
    'run:' || v_run_id::text,
    'MARKET_STATE_CHANGED',
    NULL,
    jsonb_build_object(
      'competition_run_id', v_run_id,
      'round_id', p_round_id,
      'market_status', 'closed',
      'trading_status', v_round.trading_status,
      'occurred_at', v_now
    )
  );

  RETURN jsonb_build_object(
    'ok',           true,
    'round_id',     p_round_id,
    'market_status','closed'
  );
END;
$$;

-- -----------------------------------------------------------
-- 5. pause_trading() — add notification
-- -----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pause_trading(p_round_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round record;
  v_now   timestamptz := now();
  v_run_id uuid;
BEGIN
  PERFORM public.assert_admin();

  SELECT * INTO v_round
  FROM public.rounds
  WHERE id = p_round_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROUND_NOT_FOUND: %', p_round_id;
  END IF;

  IF v_round.status <> 'active' THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION: round status is %, expected active', v_round.status;
  END IF;

  IF v_round.trading_status <> 'enabled' THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION: trading_status is %, expected enabled', v_round.trading_status;
  END IF;

  UPDATE public.rounds
  SET trading_status = 'paused'
  WHERE id = p_round_id;

  v_run_id := v_round.competition_run_id;

  -- Notify: market state changed (trading paused)
  PERFORM public.notify_realtime(
    'run:' || v_run_id::text,
    'MARKET_STATE_CHANGED',
    NULL,
    jsonb_build_object(
      'competition_run_id', v_run_id,
      'round_id', p_round_id,
      'market_status', v_round.market_status,
      'trading_status', 'paused',
      'occurred_at', v_now
    )
  );

  RETURN jsonb_build_object(
    'ok',             true,
    'round_id',       p_round_id,
    'trading_status', 'paused'
  );
END;
$$;

-- -----------------------------------------------------------
-- 6. resume_trading() — add notification
-- -----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resume_trading(p_round_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round record;
  v_now   timestamptz := now();
  v_run_id uuid;
BEGIN
  PERFORM public.assert_admin();

  SELECT * INTO v_round
  FROM public.rounds
  WHERE id = p_round_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROUND_NOT_FOUND: %', p_round_id;
  END IF;

  IF v_round.status <> 'active' THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION: round status is %, expected active', v_round.status;
  END IF;

  IF v_round.trading_status <> 'paused' THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION: trading_status is %, expected paused', v_round.trading_status;
  END IF;

  UPDATE public.rounds
  SET trading_status = 'enabled'
  WHERE id = p_round_id;

  v_run_id := v_round.competition_run_id;

  -- Notify: market state changed (trading resumed)
  PERFORM public.notify_realtime(
    'run:' || v_run_id::text,
    'MARKET_STATE_CHANGED',
    NULL,
    jsonb_build_object(
      'competition_run_id', v_run_id,
      'round_id', p_round_id,
      'market_status', v_round.market_status,
      'trading_status', 'enabled',
      'occurred_at', v_now
    )
  );

  RETURN jsonb_build_object(
    'ok',             true,
    'round_id',       p_round_id,
    'trading_status', 'enabled'
  );
END;
$$;

-- -----------------------------------------------------------
-- 7. execute_trade() — add notifications
-- -----------------------------------------------------------
-- Sends two notifications:
--   1. PORTFOLIO_CHANGED on team channel (only affected team sees)
--   2. LEADERBOARD_CHANGED on run channel (all participants)

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
        -- Return original result (trade already executed)
        -- Still send notifications for idempotent replays (client may have missed original)
        PERFORM public.notify_realtime(
          'team:' || v_team_id::text,
          'PORTFOLIO_CHANGED',
          v_team_id,
          jsonb_build_object(
            'competition_run_id', p_competition_run_id,
            'reason', 'trade',
            'trade_id', v_idem_record.result_id,
            'occurred_at', now()
          )
        );

        PERFORM public.notify_realtime(
          'run:' || p_competition_run_id::text,
          'LEADERBOARD_CHANGED',
          NULL,
          jsonb_build_object(
            'competition_run_id', p_competition_run_id,
            'reason', 'trade',
            'occurred_at', now()
          )
        );

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
$$;

-- -----------------------------------------------------------
-- 8. apply_price_changes() — add notification
-- -----------------------------------------------------------
-- Sends PRICES_CHANGED on run channel after batch is applied.
-- Participants refetch market_quotes and portfolio/leaderboard.

CREATE OR REPLACE FUNCTION public.apply_price_changes(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch    record;
  v_change   record;
  v_quote    record;
  v_now      timestamptz := now();
  v_applied  int := 0;
BEGIN
  -- 1. Authorize
  PERFORM public.assert_admin();

  -- 2. Load and lock the batch
  SELECT * INTO v_batch
  FROM public.price_change_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BATCH_NOT_FOUND: %', p_batch_id;
  END IF;

  -- 3. Validate batch status
  IF v_batch.status = 'applied' THEN
    RAISE EXCEPTION 'BATCH_ALREADY_APPLIED: batch % was applied at %', p_batch_id, v_batch.applied_at;
  END IF;

  IF v_batch.status = 'cancelled' THEN
    RAISE EXCEPTION 'BATCH_CANCELLED: batch % has been cancelled', p_batch_id;
  END IF;

  IF v_batch.status <> 'pending' THEN
    RAISE EXCEPTION 'INVALID_BATCH_STATUS: batch status is %, expected pending', v_batch.status;
  END IF;

  -- 4. Validate all pending changes (old price must still match current)
  FOR v_change IN
    SELECT ppc.*, s.symbol
    FROM public.pending_price_changes ppc
    JOIN public.stocks s ON s.id = ppc.stock_id
    WHERE ppc.batch_id = p_batch_id
  LOOP
    SELECT * INTO v_quote
    FROM public.market_quotes
    WHERE stock_id = v_change.stock_id
      AND competition_run_id = v_batch.competition_run_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'NO_MARKET_QUOTE: stock % has no price quote for this run', v_change.symbol;
    END IF;

    IF v_quote.price_paise <> v_change.old_price_paise THEN
      RAISE EXCEPTION 'STALE_PRICE: % current price is % paise, expected % paise. Batch rejected.',
        v_change.symbol, v_quote.price_paise, v_change.old_price_paise;
    END IF;
  END LOOP;

  -- 5. Apply all price changes
  FOR v_change IN
    SELECT ppc.*
    FROM public.pending_price_changes ppc
    WHERE ppc.batch_id = p_batch_id
  LOOP
    UPDATE public.market_quotes
    SET price_paise = v_change.new_price_paise,
        updated_at  = v_now
    WHERE stock_id = v_change.stock_id
      AND competition_run_id = v_batch.competition_run_id;

    v_applied := v_applied + 1;
  END LOOP;

  -- 6. Mark batch as applied
  UPDATE public.price_change_batches
  SET status     = 'applied',
      applied_at = v_now
  WHERE id = p_batch_id;

  -- 7. Notify: prices changed (run-scoped)
  PERFORM public.notify_realtime(
    'run:' || v_batch.competition_run_id::text,
    'PRICES_CHANGED',
    NULL,
    jsonb_build_object(
      'competition_run_id', v_batch.competition_run_id,
      'batch_id', p_batch_id,
      'applied_count', v_applied,
      'occurred_at', v_now
    )
  );

  -- 8. Notify: leaderboard changed (prices affect portfolio values)
  PERFORM public.notify_realtime(
    'run:' || v_batch.competition_run_id::text,
    'LEADERBOARD_CHANGED',
    NULL,
    jsonb_build_object(
      'competition_run_id', v_batch.competition_run_id,
      'reason', 'prices_changed',
      'occurred_at', v_now
    )
  );

  RETURN jsonb_build_object(
    'ok',           true,
    'batch_id',     p_batch_id,
    'applied_count', v_applied,
    'applied_at',   v_now
  );
END;
$$;

-- -----------------------------------------------------------
-- 9. apply_dividend() — add notifications
-- -----------------------------------------------------------
-- Sends PORTFOLIO_CHANGED on each affected team's channel
-- Sends LEADERBOARD_CHANGED on run channel.

CREATE OR REPLACE FUNCTION public.apply_dividend(p_dividend_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dividend      record;
  v_holding       record;
  v_lock_row      record;
  v_now           timestamptz := now();
  v_payment_count int := 0;
  v_total_paid    bigint := 0;
  v_payment_id    uuid;
  v_ledger_id     uuid;
BEGIN
  -- 1. Authorize
  PERFORM public.assert_admin();

  -- 2. Lock the dividend row to prevent concurrent application
  SELECT * INTO v_dividend
  FROM public.dividends
  WHERE id = p_dividend_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DIVIDEND_NOT_FOUND: %', p_dividend_id;
  END IF;

  -- 3. Verify dividend is pending
  IF v_dividend.status = 'applied' THEN
    RAISE EXCEPTION 'DIVIDEND_ALREADY_APPLIED: dividend % was applied at %', p_dividend_id, v_dividend.applied_at;
  END IF;

  IF v_dividend.status = 'cancelled' THEN
    RAISE EXCEPTION 'DIVIDEND_CANCELLED: dividend % has been cancelled', p_dividend_id;
  END IF;

  IF v_dividend.status <> 'pending' THEN
    RAISE EXCEPTION 'INVALID_DIVIDEND_STATUS: dividend status is %, expected pending', v_dividend.status;
  END IF;

  -- 4. Verify competition run is valid
  IF NOT EXISTS (
    SELECT 1 FROM public.competition_runs
    WHERE id = v_dividend.competition_run_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'INVALID_STATE: competition run is not active';
  END IF;

  -- 5. Process dividend for each team with holdings
  FOR v_holding IN
    SELECT h.team_id, h.quantity
    FROM public.holdings h
    WHERE h.competition_run_id = v_dividend.competition_run_id
      AND h.stock_id = v_dividend.stock_id
      AND h.quantity > 0
    ORDER BY h.team_id
  LOOP
    -- Lock the team's initial_capital row to serialize financial operations
    SELECT * INTO v_lock_row
    FROM public.cash_ledger
    WHERE team_id = v_holding.team_id
      AND competition_run_id = v_dividend.competition_run_id
      AND entry_type = 'initial_capital'
    FOR UPDATE;

    -- Create dividend payment
    INSERT INTO public.dividend_payments (
      dividend_id, team_id, competition_run_id, stock_id,
      shares_held, amount_per_share_paise, total_amount_paise,
      created_at
    )
    VALUES (
      p_dividend_id, v_holding.team_id, v_dividend.competition_run_id, v_dividend.stock_id,
      v_holding.quantity, v_dividend.amount_per_share_paise, v_holding.quantity * v_dividend.amount_per_share_paise,
      v_now
    )
    RETURNING id INTO v_payment_id;

    -- Create cash ledger entry
    INSERT INTO public.cash_ledger (
      team_id, competition_run_id, entry_type, amount_paise,
      reference_type, reference_id, description,
      created_by, created_at
    )
    VALUES (
      v_holding.team_id, v_dividend.competition_run_id, 'dividend',
      v_holding.quantity * v_dividend.amount_per_share_paise,
      'dividend_payment', v_payment_id,
      FORMAT('Dividend: %s paise per share x %s shares', v_dividend.amount_per_share_paise, v_holding.quantity),
      auth.uid(), v_now
    )
    RETURNING id INTO v_ledger_id;

    -- Update payment with ledger entry reference
    UPDATE public.dividend_payments
    SET cash_ledger_entry_id = v_ledger_id
    WHERE id = v_payment_id;

    -- Notify: portfolio changed (team-scoped)
    PERFORM public.notify_realtime(
      'team:' || v_holding.team_id::text,
      'PORTFOLIO_CHANGED',
      v_holding.team_id,
      jsonb_build_object(
        'competition_run_id', v_dividend.competition_run_id,
        'reason', 'dividend',
        'dividend_id', p_dividend_id,
        'occurred_at', v_now
      )
    );

    v_payment_count := v_payment_count + 1;
    v_total_paid := v_total_paid + (v_holding.quantity * v_dividend.amount_per_share_paise);
  END LOOP;

  -- 6. Mark dividend as applied
  UPDATE public.dividends
  SET status = 'applied',
      applied_at = v_now
  WHERE id = p_dividend_id;

  -- 7. Notify: leaderboard changed (dividends affect portfolio values)
  PERFORM public.notify_realtime(
    'run:' || v_dividend.competition_run_id::text,
    'LEADERBOARD_CHANGED',
    NULL,
    jsonb_build_object(
      'competition_run_id', v_dividend.competition_run_id,
      'reason', 'dividend',
      'dividend_id', p_dividend_id,
      'occurred_at', v_now
    )
  );

  RETURN jsonb_build_object(
    'ok',                     true,
    'dividend_id',            p_dividend_id,
    'applied_at',             v_now,
    'payment_count',          v_payment_count,
    'total_paid_paise',       v_total_paid
  );
END;
$$;

-- -----------------------------------------------------------
-- 10. adjust_team_cash() — add notifications
-- -----------------------------------------------------------
-- Sends PORTFOLIO_CHANGED on team channel
-- Sends LEADERBOARD_CHANGED on run channel.

CREATE OR REPLACE FUNCTION public.adjust_team_cash(
  p_team_id uuid,
  p_competition_run_id uuid,
  p_amount_paise bigint,
  p_reason text,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team         record;
  v_run          record;
  v_lock_row     record;
  v_cash_balance bigint;
  v_new_balance  bigint;
  v_ledger_id    uuid;
  v_now          timestamptz := now();
  v_request_hash text;
  v_idem_record  record;
BEGIN
  -- 1. Authorize
  PERFORM public.assert_admin();

  -- 2. Validate team exists
  SELECT * INTO v_team
  FROM public.teams
  WHERE id = p_team_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TEAM_NOT_FOUND: %', p_team_id;
  END IF;

  -- 3. Validate competition run exists and is pending or active
  SELECT * INTO v_run
  FROM public.competition_runs
  WHERE id = p_competition_run_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMPETITION_RUN_NOT_FOUND: %', p_competition_run_id;
  END IF;

  IF v_run.status NOT IN ('pending', 'active') THEN
    RAISE EXCEPTION 'INVALID_STATE: competition run status is %, expected pending or active', v_run.status;
  END IF;

  -- 4. Validate amount is non-zero
  IF p_amount_paise IS NULL OR p_amount_paise = 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: amount_paise must be non-zero, got %', p_amount_paise;
  END IF;

  -- 5. Validate reason is non-empty
  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RAISE EXCEPTION 'INVALID_REASON: reason must be non-empty';
  END IF;

  -- 6. Handle idempotency if key provided
  IF p_idempotency_key IS NOT NULL THEN
    v_request_hash := md5(
      p_team_id::text || p_competition_run_id::text || p_amount_paise::text || p_reason
    );

    SELECT * INTO v_idem_record
    FROM public.idempotency_keys
    WHERE team_id = p_team_id
      AND competition_run_id = p_competition_run_id
      AND operation_type = 'admin_cash_adjustment'
      AND idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF FOUND THEN
      IF v_idem_record.request_hash != v_request_hash THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED: idempotency_key % was used with different parameters', p_idempotency_key;
      END IF;

      IF v_idem_record.result_status = 'completed' THEN
        SELECT id INTO v_ledger_id
        FROM public.cash_ledger
        WHERE team_id = p_team_id
          AND competition_run_id = p_competition_run_id
          AND entry_type = 'admin_adjustment'
          AND created_at >= v_idem_record.created_at
          AND created_at <= v_idem_record.completed_at
        LIMIT 1;

        RETURN jsonb_build_object(
          'ok',                    true,
          'idempotent',            true,
          'ledger_id',             v_ledger_id,
          'team_id',               p_team_id,
          'competition_run_id',    p_competition_run_id,
          'amount_paise',          p_amount_paise,
          'reason',                p_reason,
          'message',               'Request already processed'
        );
      END IF;

      DELETE FROM public.idempotency_keys WHERE id = v_idem_record.id;
    END IF;

    INSERT INTO public.idempotency_keys (
      team_id, competition_run_id, operation_type, idempotency_key, request_hash, result_status, created_at
    )
    VALUES (
      p_team_id, p_competition_run_id, 'admin_cash_adjustment', p_idempotency_key, v_request_hash, 'pending', v_now
    );
  END IF;

  -- 7. Lock the team's initial_capital row to serialize financial operations
  SELECT * INTO v_lock_row
  FROM public.cash_ledger
  WHERE team_id = p_team_id
    AND competition_run_id = p_competition_run_id
    AND entry_type = 'initial_capital'
  FOR UPDATE;

  -- 8. Calculate current authoritative cash balance
  SELECT COALESCE(SUM(amount_paise), 0) INTO v_cash_balance
  FROM public.cash_ledger
  WHERE team_id = p_team_id
    AND competition_run_id = p_competition_run_id;

  -- 9. If amount is negative, ensure resulting balance remains >= 0
  v_new_balance := v_cash_balance + p_amount_paise;

  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_CASH: current balance % paise, adjustment % paise would result in % paise',
      v_cash_balance, p_amount_paise, v_new_balance;
  END IF;

  -- 10. Create ledger entry
  INSERT INTO public.cash_ledger (
    team_id, competition_run_id, entry_type, amount_paise,
    reference_type, reference_id, description,
    created_by, created_at
  )
  VALUES (
    p_team_id, p_competition_run_id, 'admin_adjustment', p_amount_paise,
    NULL, NULL, p_reason,
    auth.uid(), v_now
  )
  RETURNING id INTO v_ledger_id;

  -- 11. Update idempotency key if present
  IF p_idempotency_key IS NOT NULL THEN
    UPDATE public.idempotency_keys
    SET result_status = 'completed',
        result_id = v_ledger_id,
        completed_at = now()
    WHERE team_id = p_team_id
      AND competition_run_id = p_competition_run_id
      AND operation_type = 'admin_cash_adjustment'
      AND idempotency_key = p_idempotency_key;
  END IF;

  -- 12. Notify: portfolio changed (team-scoped)
  PERFORM public.notify_realtime(
    'team:' || p_team_id::text,
    'PORTFOLIO_CHANGED',
    p_team_id,
    jsonb_build_object(
      'competition_run_id', p_competition_run_id,
      'reason', 'admin_adjustment',
      'occurred_at', v_now
    )
  );

  -- 13. Notify: leaderboard changed (cash adjustment affects portfolio)
  PERFORM public.notify_realtime(
    'run:' || p_competition_run_id::text,
    'LEADERBOARD_CHANGED',
    NULL,
    jsonb_build_object(
      'competition_run_id', p_competition_run_id,
      'reason', 'admin_adjustment',
      'occurred_at', v_now
    )
  );

  RETURN jsonb_build_object(
    'ok',               true,
    'ledger_id',        v_ledger_id,
    'team_id',          p_team_id,
    'competition_run_id', p_competition_run_id,
    'amount_paise',     p_amount_paise,
    'previous_balance_paise', v_cash_balance,
    'new_balance_paise', v_new_balance,
    'reason',           p_reason,
    'created_at',       v_now
  );
END;
$$;

-- ============================================================
-- Summary of notification additions:
--
-- start_round():       ROUND_STATE_CHANGED  (run-scoped)
-- end_round():         ROUND_STATE_CHANGED  + LEADERBOARD_CHANGED (run-scoped)
-- open_market():       MARKET_STATE_CHANGED (run-scoped)
-- close_market():      MARKET_STATE_CHANGED (run-scoped)
-- pause_trading():     MARKET_STATE_CHANGED (run-scoped)
-- resume_trading():    MARKET_STATE_CHANGED (run-scoped)
-- execute_trade():     PORTFOLIO_CHANGED (team-scoped) + LEADERBOARD_CHANGED (run-scoped)
-- apply_price_changes(): PRICES_CHANGED + LEADERBOARD_CHANGED (run-scoped)
-- apply_dividend():    PORTFOLIO_CHANGED (per team) + LEADERBOARD_CHANGED (run-scoped)
-- adjust_team_cash():  PORTFOLIO_CHANGED (team-scoped) + LEADERBOARD_CHANGED (run-scoped)
--
-- All notifications:
--   - Are committed atomically with the RPC transaction
--   - Contain identifiers only, never financial truth
--   - Are visible only to authorized users (via RLS)
--   - Fire ONLY after successful commit (if RPC rolls back, no notification)
-- ============================================================

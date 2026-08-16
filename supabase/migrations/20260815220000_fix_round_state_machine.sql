-- ============================================================
-- Fix Round/Market/Trading State Machine
-- ============================================================
-- 1. Add timer pause/resume support columns to rounds table
-- 2. Fix start_round to begin with market OPEN, trading ENABLED
-- 3. Update pause_trading to record paused_at
-- 4. Update resume_trading to extend ends_at by pause duration
-- ============================================================

-- -----------------------------------------------------------
-- 1. Add pause tracking columns to rounds table
-- -----------------------------------------------------------

ALTER TABLE public.rounds
ADD COLUMN IF NOT EXISTS paused_at timestamptz,
ADD COLUMN IF NOT EXISTS accumulated_pause_duration interval NOT NULL DEFAULT '0 seconds';

COMMENT ON COLUMN public.rounds.paused_at IS 'Timestamp when trading was last paused. NULL when not paused.';
COMMENT ON COLUMN public.rounds.accumulated_pause_duration IS 'Total accumulated pause duration for this round. Used to extend ends_at on resume.';

-- -----------------------------------------------------------
-- 2. Fix start_round - begin with market OPEN, trading ENABLED
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

  IF v_round.status NOT IN ('pending', 'completed') THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION: round status is %, expected pending or completed', v_round.status;
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
  -- Round starts with market OPEN and trading ENABLED
  UPDATE public.rounds
  SET status        = 'active',
      started_at    = v_now,
      ends_at       = v_now + v_duration,
      market_status = 'open',
      trading_status= 'enabled',
      paused_at     = NULL,
      accumulated_pause_duration = '0 seconds'
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
      'market_status', 'open',
      'trading_status', 'enabled',
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

COMMENT ON FUNCTION public.start_round(uuid)
  IS 'Admin RPC: transition a pending/completed round to active. Sets authoritative started_at/ends_at. Market opens, trading enabled, timer starts. Enforces round exclusivity and ordering.';

-- -----------------------------------------------------------
-- 3. Update pause_trading - record paused_at timestamp
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

  -- Record pause time and pause trading
  UPDATE public.rounds
  SET trading_status = 'paused',
      paused_at = v_now
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

COMMENT ON FUNCTION public.pause_trading(uuid)
  IS 'Admin RPC: pause trading for an active round. Requires trading_status=enabled. Records paused_at for timer pause.';

-- -----------------------------------------------------------
-- 4. Update resume_trading - calculate pause duration and extend ends_at
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
  v_pause_duration interval;
  v_new_ends_at timestamptz;
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

  -- Calculate pause duration
  IF v_round.paused_at IS NOT NULL THEN
    v_pause_duration := v_now - v_round.paused_at;
    v_new_ends_at := v_round.ends_at + v_pause_duration;
  ELSE
    v_pause_duration := '0 seconds';
    v_new_ends_at := v_round.ends_at;
  END IF;

  -- Resume trading, clear paused_at, accumulate pause duration, extend ends_at
  UPDATE public.rounds
  SET trading_status = 'enabled',
      paused_at = NULL,
      accumulated_pause_duration = v_round.accumulated_pause_duration + v_pause_duration,
      ends_at = v_new_ends_at
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
    'trading_status', 'enabled',
    'ends_at',        v_new_ends_at
  );
END;
$$;

COMMENT ON FUNCTION public.resume_trading(uuid)
  IS 'Admin RPC: resume trading for an active round. Requires trading_status=paused. Extends ends_at by pause duration.';

-- -----------------------------------------------------------
-- 5. Update open_market - should not affect timer
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

COMMENT ON FUNCTION public.open_market(uuid)
  IS 'Admin RPC: open market for an active round. Requires market_status=closed. Does not affect timer.';

-- -----------------------------------------------------------
-- 6. Update close_market - should not affect timer
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

COMMENT ON FUNCTION public.close_market(uuid)
  IS 'Admin RPC: close market for an active round. Requires market_status=open. Does not affect timer.';

-- -----------------------------------------------------------
-- 7. Update end_round - reset pause tracking
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

  -- If currently paused, account for final pause duration before ending
  IF v_round.trading_status = 'paused' AND v_round.paused_at IS NOT NULL THEN
    UPDATE public.rounds
    SET status         = 'completed',
        ends_at        = v_now,
        market_status  = 'closed',
        trading_status = 'paused',
        paused_at      = NULL,
        accumulated_pause_duration = v_round.accumulated_pause_duration + (v_now - v_round.paused_at)
    WHERE id = p_round_id;
  ELSE
    UPDATE public.rounds
    SET status         = 'completed',
        ends_at        = v_now,
        market_status  = 'closed',
        trading_status = 'paused',
        paused_at      = NULL
    WHERE id = p_round_id;
  END IF;

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

COMMENT ON FUNCTION public.end_round(uuid)
  IS 'Admin RPC: transition an active round to completed. Sets authoritative ended_at. Accounts for any final pause duration.';
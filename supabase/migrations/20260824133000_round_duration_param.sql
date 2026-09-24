-- Configurable round duration.
--
-- start_round() previously hardcoded a 15-minute round. It now accepts an
-- optional duration in minutes (default 15, so existing callers are unaffected).
-- Everything downstream (auto-end, countdowns, ends_at displays) already reads
-- the authoritative ends_at, so no other changes are required.

-- Drop the old single-arg signature first: CREATE OR REPLACE cannot change a
-- function's argument list, and keeping both would create an ambiguous overload
-- now that the new parameter has a default.
DROP FUNCTION IF EXISTS public.start_round(uuid);

CREATE OR REPLACE FUNCTION public.start_round(p_round_id uuid, p_duration_minutes int DEFAULT 15)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round record;
  v_run   record;
  v_now   timestamptz := now();
  v_duration interval;
  v_run_id uuid;
BEGIN
  -- Authorize
  PERFORM public.assert_admin();

  -- Validate duration: 1 minute minimum, 3 hours maximum.
  IF p_duration_minutes IS NULL OR p_duration_minutes < 1 OR p_duration_minutes > 180 THEN
    RAISE EXCEPTION 'INVALID_DURATION: duration must be between 1 and 180 minutes, got %', p_duration_minutes;
  END IF;
  v_duration := make_interval(mins => p_duration_minutes);

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

COMMENT ON FUNCTION public.start_round(uuid, int)
  IS 'Admin RPC: transition a pending/completed round to active. Sets authoritative started_at/ends_at from p_duration_minutes (1-180, default 15). Market opens, trading enabled, timer starts. Enforces round exclusivity and ordering.';

-- DROP wiped the old grants — re-apply per 20260813190002 precedent.
REVOKE EXECUTE ON FUNCTION public.start_round(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_round(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_round(uuid, int) TO service_role;

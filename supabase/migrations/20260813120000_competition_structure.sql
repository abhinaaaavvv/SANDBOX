-- ============================================================
-- Phase 2: Competition Structure
-- ============================================================

-- -----------------------------------------------------------
-- 0. Helper: assert admin role
-- -----------------------------------------------------------
-- Used by every RPC to gate admin-only operations at the
-- database level. SECURITY DEFINER + SET search_path = public
-- keeps the check inside the trusted function boundary.

CREATE OR REPLACE FUNCTION public.assert_admin()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: admin role required';
  END IF;
END;
$$;

-- -----------------------------------------------------------
-- 1. competitions
-- -----------------------------------------------------------

CREATE TABLE public.competitions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (char_length(trim(name)) > 0),
  description text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.competitions IS 'Top-level competition/event definition.';

CREATE INDEX idx_competitions_status ON public.competitions (status);

CREATE TRIGGER competitions_set_updated_at
  BEFORE UPDATE ON public.competitions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------
-- 2. competition_runs
-- -----------------------------------------------------------

CREATE TABLE public.competition_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id  uuid NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  name            text NOT NULL CHECK (char_length(trim(name)) > 0),
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'active', 'completed', 'cancelled')),
  started_at      timestamptz,
  ended_at        timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.competition_runs IS 'A single run/session within a competition. History is preserved.';

CREATE INDEX idx_competition_runs_competition_id ON public.competition_runs (competition_id);
CREATE INDEX idx_competition_runs_status ON public.competition_runs (status);

CREATE TRIGGER competition_runs_set_updated_at
  BEFORE UPDATE ON public.competition_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------
-- 3. rounds
-- -----------------------------------------------------------

CREATE TABLE public.rounds (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_run_id  uuid NOT NULL REFERENCES public.competition_runs(id) ON DELETE CASCADE,
  round_number        integer NOT NULL CHECK (round_number IN (1, 2, 3)),
  round_type          text NOT NULL CHECK (round_type IN ('portfolio', 'newspaper', 'video')),
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'active', 'completed')),
  started_at          timestamptz,
  ends_at             timestamptz,
  market_status       text NOT NULL DEFAULT 'closed'
                        CHECK (market_status IN ('closed', 'open')),
  trading_status      text NOT NULL DEFAULT 'paused'
                        CHECK (trading_status IN ('paused', 'enabled')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_rounds_run_number UNIQUE (competition_run_id, round_number)
);

COMMENT ON TABLE public.rounds IS 'Exactly 3 rounds per competition run. Authoritative timing source.';

CREATE INDEX idx_rounds_competition_run_id ON public.rounds (competition_run_id);
CREATE INDEX idx_rounds_status ON public.rounds (status);

CREATE TRIGGER rounds_set_updated_at
  BEFORE UPDATE ON public.rounds
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------
-- 4. RPC: start_round
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
  UPDATE public.rounds
  SET status        = 'active',
      started_at    = v_now,
      ends_at       = v_now + v_duration,
      market_status = 'open',
      trading_status= 'enabled'
  WHERE id = p_round_id;

  RETURN jsonb_build_object(
    'ok',         true,
    'round_id',   p_round_id,
    'started_at', v_now,
    'ends_at',    v_now + v_duration
  );
END;
$$;

COMMENT ON FUNCTION public.start_round(uuid)
  IS 'Admin RPC: transition a pending round to active. Sets authoritative started_at/ends_at. Enforces round exclusivity and ordering.';

-- -----------------------------------------------------------
-- 5. RPC: end_round
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

  RETURN jsonb_build_object(
    'ok',       true,
    'round_id', p_round_id,
    'ended_at', v_now
  );
END;
$$;

COMMENT ON FUNCTION public.end_round(uuid)
  IS 'Admin RPC: transition an active round to completed. Sets authoritative ended_at.';

-- -----------------------------------------------------------
-- 6. RPC: open_market
-- -----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.open_market(p_round_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round record;
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

  RETURN jsonb_build_object(
    'ok',           true,
    'round_id',     p_round_id,
    'market_status','open'
  );
END;
$$;

COMMENT ON FUNCTION public.open_market(uuid)
  IS 'Admin RPC: open market for an active round. Requires market_status=closed.';

-- -----------------------------------------------------------
-- 7. RPC: close_market
-- -----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.close_market(p_round_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round record;
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

  RETURN jsonb_build_object(
    'ok',           true,
    'round_id',     p_round_id,
    'market_status','closed'
  );
END;
$$;

COMMENT ON FUNCTION public.close_market(uuid)
  IS 'Admin RPC: close market for an active round. Requires market_status=open.';

-- -----------------------------------------------------------
-- 8. RPC: pause_trading
-- -----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pause_trading(p_round_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round record;
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

  RETURN jsonb_build_object(
    'ok',             true,
    'round_id',       p_round_id,
    'trading_status', 'paused'
  );
END;
$$;

COMMENT ON FUNCTION public.pause_trading(uuid)
  IS 'Admin RPC: pause trading for an active round. Requires trading_status=enabled.';

-- -----------------------------------------------------------
-- 9. RPC: resume_trading
-- -----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resume_trading(p_round_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round record;
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

  RETURN jsonb_build_object(
    'ok',             true,
    'round_id',       p_round_id,
    'trading_status', 'enabled'
  );
END;
$$;

COMMENT ON FUNCTION public.resume_trading(uuid)
  IS 'Admin RPC: resume trading for an active round. Requires trading_status=paused.';

-- -----------------------------------------------------------
-- 10. Row Level Security
-- -----------------------------------------------------------

ALTER TABLE public.competitions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rounds           ENABLE ROW LEVEL SECURITY;

-- ---- competitions policies ----

-- All authenticated users can read competitions (needed for UI).
CREATE POLICY "competitions_select_authenticated"
  ON public.competitions
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only admins can insert competitions.
CREATE POLICY "competitions_insert_admin"
  ON public.competitions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- NOTE: Direct UPDATE/DELETE on competitions is NOT allowed via RLS.
-- Admin metadata changes should go through migrations or future RPCs.
-- SECURITY DEFINER functions bypass RLS, so authorized operations can
-- still UPDATE/DELETE as needed.

-- ---- competition_runs policies ----

-- All authenticated users can read competition runs.
CREATE POLICY "competition_runs_select_authenticated"
  ON public.competition_runs
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only admins can insert competition runs.
CREATE POLICY "competition_runs_insert_admin"
  ON public.competition_runs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- NOTE: Direct UPDATE/DELETE on competition_runs is NOT allowed via RLS.
-- Run lifecycle (status, started_at, ended_at) should be managed
-- through RPCs. SECURITY DEFINER functions bypass RLS.

-- ---- rounds policies ----

-- All authenticated users can read rounds (needed for participant UI).
CREATE POLICY "rounds_select_authenticated"
  ON public.rounds
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- NOTE: Direct INSERT/UPDATE/DELETE on rounds is NOT allowed via RLS.
-- All state transitions must go through the authoritative RPC functions:
--   start_round(), end_round(), open_market(), close_market(),
--   pause_trading(), resume_trading()
--
-- Round creation should happen via migrations or seed data.
-- SECURITY DEFINER functions bypass RLS, so the RPCs can still
-- UPDATE/INSERT/DELETE as needed.

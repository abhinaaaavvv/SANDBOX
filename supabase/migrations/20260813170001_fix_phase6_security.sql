-- ============================================================
-- Phase 6 Security & Correctness Fixes
-- ============================================================
-- Fixes:
-- 1. Missing market quotes: detect and report, not silently ignore
-- 2. Leaderboard EXECUTE privileges: restrict to authenticated
-- 3. Leaderboard authorization: verify user is authorized for run
-- ============================================================

-- -----------------------------------------------------------
-- Fix 1: Missing market quotes detection
-- -----------------------------------------------------------
-- CRITICAL: If a holding exists but market_quotes is missing,
-- the portfolio must NOT silently value it at zero.
-- This fix adds explicit detection and error reporting.

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

  -- 2. Resolve team_id
  IF p_team_id IS NULL THEN
    v_team_id := public.resolve_user_team(v_user_id, p_competition_run_id);
  ELSE
    v_team_id := p_team_id;
    -- If participant requests another team's portfolio, reject
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = v_user_id AND role = 'admin'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.team_members
        WHERE user_id = v_user_id AND team_id = v_team_id
      ) THEN
        RAISE EXCEPTION 'FORBIDDEN: participants can only access their own portfolio';
      END IF;
    END IF;
  END IF;

  -- 3. CRITICAL: Check for holdings without market quotes
  -- If any holding exists without a market quote, raise an error
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

  -- 4. Calculate cash balance (RLS on cash_ledger filters by team)
  SELECT COALESCE(SUM(amount_paise), 0) INTO v_cash_balance
  FROM public.cash_ledger
  WHERE team_id = v_team_id
    AND competition_run_id = p_competition_run_id;

  -- 5. Calculate holdings value using current market prices
  -- Uses market_quotes (never pending_price_changes)
  -- INNER JOIN is safe now because we checked for missing quotes above
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
  -- Avoid division by zero
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
  IS 'Returns portfolio state for a team. SECURITY INVOKER uses RLS on cash_ledger/holdings. Detects missing market quotes and raises error instead of silently valuing at zero.';

-- -----------------------------------------------------------
-- Fix 2: Leaderboard security
-- -----------------------------------------------------------
-- Restrict EXECUTE to authenticated users only
-- Add authorization check: user must be authorized for the competition run

-- Revoke from PUBLIC and anon
REVOKE EXECUTE ON FUNCTION public.get_leaderboard(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_leaderboard(uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.get_leaderboard(
  p_competition_run_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_result  jsonb;
BEGIN
  -- 1. Authenticate
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: authentication required';
  END IF;

  -- 2. Authorize: user must be authorized for this competition run
  -- Either: user is a member of a team in this run, OR user is an admin
  IF NOT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.user_id = v_user_id
      AND EXISTS (
        SELECT 1 FROM public.cash_ledger cl
        WHERE cl.team_id = tm.team_id
          AND cl.competition_run_id = p_competition_run_id
      )
  ) AND NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: not authorized for this competition run';
  END IF;

  -- 3. Build leaderboard from team_portfolio_view
  -- Uses ROW_NUMBER() for deterministic ranking
  SELECT jsonb_agg(
    jsonb_build_object(
      'rank',                    lp.rank,
      'team_id',                 lp.team_id,
      'team_name',               lp.team_name,
      'competition_run_id',      lp.competition_run_id,
      'cash_balance_paise',      lp.cash_balance_paise,
      'holdings_value_paise',    lp.holdings_value_paise,
      'portfolio_value_paise',   lp.portfolio_value_paise,
      'initial_capital_paise',   lp.initial_capital_paise,
      'pnl_paise',               lp.pnl_paise,
      'return_basis_points',     lp.return_basis_points
    )
    ORDER BY lp.rank
  ) INTO v_result
  FROM (
    SELECT
      ROW_NUMBER() OVER (
        ORDER BY pv.portfolio_value_paise DESC, pv.team_id ASC
      )::bigint AS rank,
      pv.team_id,
      t.name AS team_name,
      pv.competition_run_id,
      pv.cash_balance_paise,
      pv.holdings_value_paise,
      pv.portfolio_value_paise,
      pv.initial_capital_paise,
      pv.pnl_paise,
      pv.return_basis_points
    FROM public.team_portfolio_view pv
    INNER JOIN public.teams t ON t.id = pv.team_id
    WHERE pv.competition_run_id = p_competition_run_id
  ) lp;

  -- 4. Return empty array if no data
  IF v_result IS NULL THEN
    v_result := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'ok',                    true,
    'competition_run_id',    p_competition_run_id,
    'leaderboard',           v_result
  );
END;
$$;

COMMENT ON FUNCTION public.get_leaderboard(uuid)
  IS 'Returns leaderboard for a competition run. SECURITY DEFINER to show all teams. Verifies user is authorized for the run. Ranked by portfolio_value_paise DESC with deterministic tie-breaking (team_id ASC).';

-- -----------------------------------------------------------
-- Fix 3: get_team_holdings missing quote detection
-- -----------------------------------------------------------
-- Similar to get_team_portfolio, detect missing quotes

CREATE OR REPLACE FUNCTION public.get_team_holdings(
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
  v_user_id   uuid;
  v_team_id   uuid;
  v_result    jsonb;
  v_missing_count int;
BEGIN
  -- 1. Authenticate
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: authentication required';
  END IF;

  -- 2. Resolve team_id
  IF p_team_id IS NULL THEN
    v_team_id := public.resolve_user_team(v_user_id, p_competition_run_id);
  ELSE
    v_team_id := p_team_id;
    -- If participant requests another team's holdings, reject
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = v_user_id AND role = 'admin'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.team_members
        WHERE user_id = v_user_id AND team_id = v_team_id
      ) THEN
        RAISE EXCEPTION 'FORBIDDEN: participants can only access their own team holdings';
      END IF;
    END IF;
  END IF;

  -- 3. CRITICAL: Check for holdings without market quotes
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

  -- 4. Get holdings breakdown with current market prices
  -- INNER JOIN is safe now because we checked for missing quotes above
  SELECT jsonb_agg(
    jsonb_build_object(
      'stock_id', h.stock_id,
      'stock_symbol', s.symbol,
      'stock_company_name', s.company_name,
      'quantity', h.quantity,
      'current_price_paise', mq.price_paise,
      'market_value_paise', h.quantity * mq.price_paise
    )
  ) INTO v_result
  FROM public.holdings h
  INNER JOIN public.stocks s ON s.id = h.stock_id
  INNER JOIN public.market_quotes mq
    ON mq.stock_id = h.stock_id
    AND mq.competition_run_id = h.competition_run_id
  WHERE h.team_id = v_team_id
    AND h.competition_run_id = p_competition_run_id
    AND h.quantity > 0;

  -- 5. Return empty array if no holdings
  IF v_result IS NULL THEN
    v_result := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'team_id', v_team_id,
    'competition_run_id', p_competition_run_id,
    'holdings', v_result
  );
END;
$$;

COMMENT ON FUNCTION public.get_team_holdings(uuid, uuid)
  IS 'Returns holdings breakdown for a team. SECURITY INVOKER uses RLS on holdings. Detects missing market quotes and raises error.';

-- ============================================================
-- Summary of fixes:
--
-- 1. get_team_portfolio(): detects missing market quotes
--    - Raises MISSING_MARKET_QUOTE error if any holding has no quote
--    - Prevents silent valuation at zero
--
-- 2. get_leaderboard(): restricted EXECUTE privileges
--    - Revoked from PUBLIC and anon
--    - Added authorization check: user must be in a team in the run, or admin
--
-- 3. get_team_holdings(): detects missing market quotes
--    - Raises MISSING_MARKET_QUOTE error if any holding has no quote
--    - Uses INNER JOIN (safe after check)
--
-- ============================================================

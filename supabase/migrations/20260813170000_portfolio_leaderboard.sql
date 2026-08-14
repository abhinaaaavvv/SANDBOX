-- ============================================================
-- Phase 6: Portfolio & Leaderboard
-- ============================================================
-- Functions: get_team_portfolio(), get_leaderboard(), get_team_holdings()
-- Security: Team isolation enforced via RLS on underlying tables
--           (cash_ledger, holdings) + SECURITY INVOKER functions
--           Leaderboard uses SECURITY DEFINER to show all teams
-- ============================================================

-- -----------------------------------------------------------
-- 1. RPC: get_team_portfolio()
-- -----------------------------------------------------------
-- Returns portfolio state for a team in a competition run.
-- SECURITY INVOKER: uses RLS on underlying tables (cash_ledger, holdings).
-- Participants see only their own team; admins see any team.
--
-- Fields:
--   team_id, competition_run_id
--   cash_balance_paise, holdings_value_paise, portfolio_value_paise
--   initial_capital_paise, pnl_paise, return_basis_points
--
-- Formulas:
--   cash_balance = SUM(cash_ledger.amount_paise)
--   holdings_value = SUM(holdings.quantity × market_quotes.price_paise)
--   portfolio_value = cash_balance + holdings_value
--   initial_capital = SUM(cash_ledger WHERE entry_type = 'initial_capital')
--   pnl = portfolio_value - initial_capital
--   return_basis_points = (pnl × 10000) / initial_capital (0 if initial_capital = 0)

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

  -- 3. Calculate cash balance (RLS on cash_ledger filters by team)
  SELECT COALESCE(SUM(amount_paise), 0) INTO v_cash_balance
  FROM public.cash_ledger
  WHERE team_id = v_team_id
    AND competition_run_id = p_competition_run_id;

  -- 4. Calculate holdings value using current market prices
  -- Uses market_quotes (never pending_price_changes)
  SELECT COALESCE(SUM(h.quantity * mq.price_paise), 0) INTO v_holdings_value
  FROM public.holdings h
  INNER JOIN public.market_quotes mq
    ON mq.stock_id = h.stock_id
    AND mq.competition_run_id = h.competition_run_id
  WHERE h.team_id = v_team_id
    AND h.competition_run_id = p_competition_run_id
    AND h.quantity > 0;

  -- 5. Calculate portfolio value
  v_portfolio_value := v_cash_balance + v_holdings_value;

  -- 6. Get initial capital
  SELECT COALESCE(SUM(amount_paise), 0) INTO v_initial_capital
  FROM public.cash_ledger
  WHERE team_id = v_team_id
    AND competition_run_id = p_competition_run_id
    AND entry_type = 'initial_capital';

  -- 7. Calculate P/L
  v_pnl := v_portfolio_value - v_initial_capital;

  -- 8. Calculate return in basis points (1 bp = 0.01%)
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
  IS 'Returns portfolio state for a team. SECURITY INVOKER uses RLS on cash_ledger/holdings. Returns cash, holdings value, portfolio value, initial capital, P/L, and return in basis points.';

-- -----------------------------------------------------------
-- 2. RPC: get_leaderboard()
-- -----------------------------------------------------------
-- Returns leaderboard for a competition run.
-- SECURITY DEFINER: bypasses RLS to show all teams.
-- All authenticated users can see the leaderboard (shared within run).
--
-- Ranking: portfolio_value_paise DESC, team_id ASC (deterministic tie-breaking)
-- Uses ROW_NUMBER() for ranking.

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

  -- 2. Build leaderboard from team_portfolio_view
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

  -- 3. Return empty array if no data
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
  IS 'Returns leaderboard for a competition run. SECURITY DEFINER to show all teams. Ranked by portfolio_value_paise DESC with deterministic tie-breaking (team_id ASC).';

-- -----------------------------------------------------------
-- 3. RPC: get_team_holdings()
-- -----------------------------------------------------------
-- Returns holdings breakdown for a team in a competition run.
-- SECURITY INVOKER: uses RLS on holdings table.
-- Uses market_quotes for current price (never pending_price_changes).

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

  -- 3. Get holdings breakdown with current market prices
  SELECT jsonb_agg(
    jsonb_build_object(
      'stock_id', h.stock_id,
      'stock_symbol', s.symbol,
      'stock_company_name', s.company_name,
      'quantity', h.quantity,
      'current_price_paise', COALESCE(mq.price_paise, 0),
      'market_value_paise', h.quantity * COALESCE(mq.price_paise, 0)
    )
  ) INTO v_result
  FROM public.holdings h
  INNER JOIN public.stocks s ON s.id = h.stock_id
  LEFT JOIN public.market_quotes mq
    ON mq.stock_id = h.stock_id
    AND mq.competition_run_id = h.competition_run_id
  WHERE h.team_id = v_team_id
    AND h.competition_run_id = p_competition_run_id
    AND h.quantity > 0;

  -- 4. Return empty array if no holdings
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
  IS 'Returns holdings breakdown for a team. SECURITY INVOKER uses RLS on holdings. Uses market_quotes for current price.';

-- -----------------------------------------------------------
-- 4. Indexes for performance
-- -----------------------------------------------------------
-- These indexes support the portfolio and leaderboard queries.

-- Index for cash_ledger aggregation (cash balance + initial capital)
CREATE INDEX IF NOT EXISTS idx_cash_ledger_team_run_entry
  ON public.cash_ledger (team_id, competition_run_id, entry_type);

-- Index for holdings + market_quotes join
CREATE INDEX IF NOT EXISTS idx_holdings_run_stock_team_qty
  ON public.holdings (competition_run_id, stock_id, team_id)
  WHERE quantity > 0;

-- ============================================================
-- Summary of Phase 6 implementation:
--
-- 1. get_team_portfolio(): returns portfolio state for a team
--    - SECURITY INVOKER: uses RLS on cash_ledger, holdings
--    - Formulas:
--      cash_balance = SUM(cash_ledger.amount_paise)
--      holdings_value = SUM(holdings.quantity × market_quotes.price_paise)
--      portfolio_value = cash_balance + holdings_value
--      initial_capital = SUM(cash_ledger WHERE entry_type = 'initial_capital')
--      pnl = portfolio_value - initial_capital
--      return_basis_points = (pnl × 10000) / initial_capital (0 if initial_capital = 0)
--
-- 2. get_leaderboard(): returns leaderboard for a competition run
--    - SECURITY DEFINER: bypasses RLS to show all teams
--    - Ranking: portfolio_value_paise DESC, team_id ASC
--    - Uses ROW_NUMBER() for deterministic ranking
--
-- 3. get_team_holdings(): returns holdings breakdown with current market prices
--    - SECURITY INVOKER: uses RLS on holdings
--    - Uses market_quotes (never pending_price_changes)
--
-- 4. Indexes:
--    - cash_ledger(team_id, competition_run_id, entry_type)
--    - holdings(competition_run_id, stock_id, team_id) WHERE quantity > 0
--
-- Design decisions:
--   - Functions chosen over views for proper RLS behavior
--   - SECURITY INVOKER for portfolio/holdings (team isolation via RLS)
--   - SECURITY DEFINER for leaderboard (shared within competition run)
--   - All calculations use BIGINT integer arithmetic
--   - Return percentage in basis points (1 bp = 0.01%)
--   - Zero initial_capital returns 0 basis points
--   - Pending prices never used in portfolio calculations
--   - Historical runs remain queryable
--   - Empty holdings teams still have valid portfolios
--
-- ============================================================

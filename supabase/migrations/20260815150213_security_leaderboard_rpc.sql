-- -----------------------------------------------------------
-- 2. RPC: get_leaderboard() — SECURITY FIX
-- -----------------------------------------------------------
-- Problem: get_leaderboard() was SECURITY DEFINER with no
--   authorization check inside the function. The frontend
--   competition context provided run isolation, but frontend
--   validation is NOT a security boundary. An authenticated
--   participant could directly call the RPC with another
--   competition run ID and receive that run's leaderboard data.
--
-- Fix: Enforce authorization INSIDE the SECURITY DEFINER
--   function.  Only authorized users (admins or participants
--   with a team in the requested run) may read the leaderboard.
--   This eliminates the dependency on frontend context for
--   security.
--
--  Authorized:
--   - Admin users (profiles.role = 'admin')
--   - Participants who have a team with initial_capital
--     in the requested competition_run_id
--
--  Forbidden:
--   - Unauthenticated users (already handled by existing
--     AUTH_REQUIRED check)
--   - Participants without a team in the requested run
--
--  Preserved:
--   - ORDER BY portfolio_value_paise DESC, team_id ASC
--   - ROW_NUMBER() deterministic ranking
--   - No exposure of raw holdings / trades / cash ledger details
--   - No service_role key used in the browser

-- 5. Authorization inside SECURITY DEFINER function
-- -----------------------------------------------------------
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
  v_is_admin boolean;
  v_authorized boolean;
  v_result  jsonb;
BEGIN
  -- 1. Authenticate
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: authentication required';
  END IF;

  -- 2. Authorization inside SECURITY DEFINER:
  --    Admins are always authorized.
  --    Participants must have a team with initial_capital in the requested run.
  SELECT INTO v_is_admin role = 'admin'
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_is_admin THEN
    -- Admins are authorized for any run.
    NULL;
  ELSE
    -- Participants must have a team with initial_capital in this run.
    SELECT INTO v_authorized EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.cash_ledger cl ON cl.team_id = tm.team_id
      WHERE tm.user_id = v_user_id
        AND cl.competition_run_id = p_competition_run_id
        AND cl.entry_type = 'initial_capital'
    );
    IF NOT v_authorized THEN
      RAISE EXCEPTION 'FORBIDDEN: not authorized for this competition run';
    END IF;
  END IF;

  -- 3. Build leaderboard from authoritative financial state
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
        ORDER BY computed.portfolio_value_paise DESC, computed.team_id ASC
      )::bigint AS rank,
      computed.*
    FROM (
      SELECT
        t.id AS team_id,
        t.name AS team_name,
        p_competition_run_id AS competition_run_id,
        COALESCE(cl_sum.cash_balance, 0) AS cash_balance_paise,
        COALESCE(hv.holdings_value, 0) AS holdings_value_paise,
        COALESCE(cl_sum.cash_balance, 0) + COALESCE(hv.holdings_value, 0) AS portfolio_value_paise,
        COALESCE(ic.initial_capital, 0) AS initial_capital_paise,
        (COALESCE(cl_sum.cash_balance, 0) + COALESCE(hv.holdings_value, 0)) - COALESCE(ic.initial_capital, 0) AS pnl_paise,
        CASE
          WHEN COALESCE(ic.initial_capital, 0) = 0 THEN 0
          ELSE ((COALESCE(cl_sum.cash_balance, 0) + COALESCE(hv.holdings_value, 0)) - COALESCE(ic.initial_capital, 0)) * 10000 / ic.initial_capital
        END AS return_basis_points
      FROM public.teams t
      -- Teams that participate in this run (have initial capital)
      INNER JOIN public.cash_ledger ic
        ON ic.team_id = t.id
        AND ic.competition_run_id = p_competition_run_id
        AND ic.entry_type = 'initial_capital'
      -- Cash balance (sum of all ledger entries)
      LEFT JOIN (
        SELECT team_id, SUM(amount_paise) AS cash_balance
        FROM public.cash_ledger
        WHERE competition_run_id = p_competition_run_id
        GROUP BY team_id
      ) cl_sum ON cl_sum.team_id = t.id
      -- Holdings value (quantity × current market price)
      LEFT JOIN (
        SELECT
          h.team_id,
          SUM(h.quantity * mq.price_paise) AS holdings_value
        FROM public.holdings h
        INNER JOIN public.market_quotes mq
          ON mq.stock_id = h.stock_id
          AND mq.competition_run_id = h.competition_run_id
        WHERE h.competition_run_id = p_competition_run_id
          AND h.quantity > 0
        GROUP BY h.team_id
      ) hv ON hv.team_id = t.id
    ) computed
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

-- 6. Update the comment to document the security change
COMMENT ON FUNCTION public.get_leaderboard(uuid)
  IS 'Returns leaderboard for a competition run. SECURITY DEFINER.
Authorized users: admins (profiles.role = ''admin''), participants with a team
having initial_capital in the requested competition_run_id.
Unauthenticated: AUTH_REQUIRED.  Forbidden: participant without a team in the
requested run.  Runs isolation enforced inside the function; no reliance on
frontend context.  Ranking: portfolio_value_paise DESC, team_id ASC with
ROW_NUMBER() for deterministic tie-breaking.  No exposure of raw holdings /
trades / cash ledger details.';

-- -----------------------------------------------------------
-- Summary of Phase 6 implementation (unchanged):
-- 1. get_team_portfolio(): returns portfolio state for a team
--    - SECURITY INVOKER: uses RLS on cash_ledger, holdings
--    - Formulas: (same as before)
-- 2. get_leaderboard(): returns leaderboard for a competition run
--    - SECURITY DEFINER: authorization enforced inside function
--    - Ranking: portfolio_value_paise DESC, team_id ASC
--    - Uses ROW_NUMBER() for deterministic ranking
-- 3. get_team_holdings(): returns holdings breakdown with current market prices
--    - SECURITY INVOKER: uses RLS on holdings
--    - Uses market_quotes (never pending_price_changes)
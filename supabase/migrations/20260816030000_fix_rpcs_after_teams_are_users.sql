-- Fix RPCs broken by teams_are_users migration.
-- The dropped `profiles` and `team_members` tables were still referenced by
-- resolve_user_team(), get_leaderboard(), and get_team_holdings().

-- ============================================================================
-- 1. resolve_user_team() — team IS the user, so just return the user's own id
-- ============================================================================
CREATE OR REPLACE FUNCTION public.resolve_user_team(
  p_user_id uuid,
  p_competition_run_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- With teams-are-users, the user's team_id IS their auth.uid.
  -- Verify the team exists in the teams table.
  IF NOT EXISTS (
    SELECT 1 FROM public.teams WHERE id = p_user_id
  ) THEN
    RAISE EXCEPTION 'NO_TEAM: user % does not have a team', p_user_id;
  END IF;

  RETURN p_user_id;
END;
$$;

-- ============================================================================
-- 2. get_leaderboard() — replace profiles/team_members lookups with teams
-- ============================================================================
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

  -- 2. Authorization: check teams table directly (teams-are-users)
  SELECT INTO v_is_admin role = 'admin'
  FROM public.teams
  WHERE id = v_user_id;

  IF v_is_admin THEN
    NULL;  -- Admins are authorized for any run
  ELSE
    -- Participants must have initial_capital in this run (their team_id = their user_id)
    SELECT INTO v_authorized EXISTS (
      SELECT 1 FROM public.cash_ledger cl
      WHERE cl.team_id = v_user_id
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
        t.display_name AS team_name,
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
      INNER JOIN public.cash_ledger ic
        ON ic.team_id = t.id
        AND ic.competition_run_id = p_competition_run_id
        AND ic.entry_type = 'initial_capital'
      LEFT JOIN (
        SELECT team_id, SUM(amount_paise) AS cash_balance
        FROM public.cash_ledger
        WHERE competition_run_id = p_competition_run_id
        GROUP BY team_id
      ) cl_sum ON cl_sum.team_id = t.id
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

-- ============================================================================
-- 3. get_team_holdings() — replace profiles/team_members with teams
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_team_holdings(
  p_competition_run_id uuid,
  p_team_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
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

  -- 2. Resolve team_id (team IS the user)
  IF p_team_id IS NULL THEN
    v_team_id := v_user_id;
  ELSE
    v_team_id := p_team_id;
    -- If participant requests another team's holdings, reject
    IF NOT EXISTS (
      SELECT 1 FROM public.teams
      WHERE id = v_user_id AND role = 'admin'
    ) THEN
      -- Participant can only access their own team
      IF v_team_id <> v_user_id THEN
        RAISE EXCEPTION 'FORBIDDEN: participants can only access their own team holdings';
      END IF;
    END IF;
  END IF;

  -- 3. Check for holdings without market quotes
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

  -- 4. Get holdings with current market prices and average buy price from trades
  SELECT jsonb_agg(
    jsonb_build_object(
      'stock_id', h.stock_id,
      'stock_symbol', s.symbol,
      'stock_name', s.name,
      'quantity', h.quantity,
      'current_price_paise', mq.price_paise,
      'market_value_paise', h.quantity * mq.price_paise,
      'average_buy_price_paise', COALESCE(avg_buy.avg_price_paise, mq.price_paise)
    )
  ) INTO v_result
  FROM public.holdings h
  INNER JOIN public.stocks s ON s.id = h.stock_id
  INNER JOIN public.market_quotes mq
    ON mq.stock_id = h.stock_id
    AND mq.competition_run_id = h.competition_run_id
  LEFT JOIN LATERAL (
    SELECT
      CASE
        WHEN SUM(t.quantity) > 0
        THEN SUM(t.total_value_paise) / SUM(t.quantity)
        ELSE mq.price_paise
      END AS avg_price_paise
    FROM public.trades t
    WHERE t.team_id = v_team_id
      AND t.competition_run_id = p_competition_run_id
      AND t.stock_id = h.stock_id
      AND t.side = 'buy'
  ) avg_buy ON true
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
$function$;

-- ============================================================================
-- Re-grant EXECUTE to authenticated role (SECURITY DEFINER functions)
-- ============================================================================
REVOKE EXECUTE ON FUNCTION public.resolve_user_team(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_user_team(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_leaderboard(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_team_holdings(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_holdings(uuid, uuid) TO authenticated;

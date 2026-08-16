-- Fix get_leaderboard: ic.initial_capital doesn't exist on cash_ledger.
-- The alias `ic` points to cash_ledger which has `amount_paise`, not `initial_capital`.

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
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: authentication required';
  END IF;

  SELECT INTO v_is_admin role = 'admin'
  FROM public.teams
  WHERE id = v_user_id;

  IF NOT v_is_admin THEN
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
        COALESCE(ic.amount_paise, 0) AS initial_capital_paise,
        (COALESCE(cl_sum.cash_balance, 0) + COALESCE(hv.holdings_value, 0)) - COALESCE(ic.amount_paise, 0) AS pnl_paise,
        CASE
          WHEN COALESCE(ic.amount_paise, 0) = 0 THEN 0
          ELSE ((COALESCE(cl_sum.cash_balance, 0) + COALESCE(hv.holdings_value, 0)) - COALESCE(ic.amount_paise, 0)) * 10000 / ic.amount_paise
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

REVOKE EXECUTE ON FUNCTION public.get_leaderboard(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(uuid) TO authenticated;

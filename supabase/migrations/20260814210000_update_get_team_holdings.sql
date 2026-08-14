-- Update get_team_holdings() to include average_buy_price computed from trades
-- This replaces the existing function to add the missing field.

CREATE OR REPLACE FUNCTION public.get_team_holdings(p_competition_run_id uuid, p_team_id uuid DEFAULT NULL::uuid)
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

-- ============================================================
-- Stock lifecycle completion (REMEDIATION_PLAN follow-up)
--
--   1. stocks.initial_price_paise: authoritative opening price per
--      stock. Backfilled from current active-run quotes.
--   2. add_stock: persists the opening price on the stock row so
--      competition reset can reprice the market.
--   3. remove_stock(p_stock_id): HARD delete — purges quotes,
--      holdings, trades (+ their ledger entries), dividend history
--      and pending price changes, then removes the stock row and
--      broadcasts STOCK_DEACTIVATED. Admin-only.
--   4. reset_competition_run: now also reprices every market quote
--      back to its stock's opening price and reactivates any
--      deactivated stocks.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Opening price column + backfill
-- ------------------------------------------------------------
ALTER TABLE public.stocks ADD COLUMN IF NOT EXISTS initial_price_paise bigint;

UPDATE public.stocks s
SET initial_price_paise = q.price_paise
FROM public.market_quotes q
JOIN public.competition_runs cr ON cr.id = q.competition_run_id AND cr.status = 'active'
WHERE q.stock_id = s.id
  AND s.initial_price_paise IS NULL;

ALTER TABLE public.stocks ALTER COLUMN initial_price_paise SET DEFAULT 100000;
ALTER TABLE public.stocks ALTER COLUMN initial_price_paise SET NOT NULL;
ALTER TABLE public.stocks ADD CONSTRAINT stocks_initial_price_positive CHECK (initial_price_paise > 0);

-- ------------------------------------------------------------
-- 2. add_stock — persist opening price
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_stock(p_symbol text, p_name text, p_description text DEFAULT ''::text, p_initial_price_paise bigint DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_stock_id uuid;
  v_now      timestamptz := now();
  v_run      record;
  v_created  int := 0;
  v_symbol   text;
BEGIN
  -- 1. Authorize
  PERFORM public.assert_admin();

  -- 2. Validate inputs
  v_symbol := upper(trim(p_symbol));
  IF char_length(v_symbol) = 0 THEN
    RAISE EXCEPTION 'INVALID_SYMBOL: symbol cannot be empty';
  END IF;

  IF char_length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'INVALID_NAME: name cannot be empty';
  END IF;

  IF p_initial_price_paise <= 0 THEN
    RAISE EXCEPTION 'INVALID_PRICE: initial_price_paise must be positive, got %', p_initial_price_paise;
  END IF;

  IF EXISTS (SELECT 1 FROM public.stocks WHERE symbol = v_symbol) THEN
    RAISE EXCEPTION 'DUPLICATE_SYMBOL: % is already listed', v_symbol;
  END IF;

  -- 3. Insert the stock with its opening price
  INSERT INTO public.stocks (symbol, name, description, is_active, initial_price_paise, created_at, updated_at)
  VALUES (v_symbol, trim(p_name), p_description, true, p_initial_price_paise, v_now, v_now)
  RETURNING id INTO v_stock_id;

  -- 4. Create market_quotes for ALL live competition runs
  FOR v_run IN
    SELECT id FROM public.competition_runs WHERE status IN ('pending', 'active')
  LOOP
    INSERT INTO public.market_quotes (stock_id, competition_run_id, price_paise, updated_at)
    VALUES (v_stock_id, v_run.id, p_initial_price_paise, v_now);
    v_created := v_created + 1;
  END LOOP;

  -- 5. Notify each live run
  FOR v_run IN
    SELECT id FROM public.competition_runs WHERE status IN ('pending', 'active')
  LOOP
    PERFORM public.notify_realtime(
      'run:' || v_run.id::text,
      'STOCK_CREATED',
      NULL,
      jsonb_build_object(
        'competition_run_id', v_run.id,
        'stock_id', v_stock_id,
        'symbol', v_symbol,
        'name', trim(p_name),
        'initial_price_paise', p_initial_price_paise,
        'occurred_at', v_now
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok',             true,
    'stock_id',       v_stock_id,
    'symbol',         v_symbol,
    'quotes_created', v_created,
    'created_at',     v_now
  );
END;
$function$;

-- ------------------------------------------------------------
-- 3. remove_stock — hard delete with full purge
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remove_stock(p_stock_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock record;
BEGIN
  PERFORM public.assert_admin();

  SELECT * INTO v_stock FROM public.stocks WHERE id = p_stock_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'STOCK_NOT_FOUND: %', p_stock_id;
  END IF;

  -- Purge money movement tied to this stock's trades so team balances
  -- stay consistent with SUM(cash_ledger) after the purge.
  DELETE FROM public.cash_ledger
  WHERE reference_type = 'trade'
    AND reference_id IN (SELECT id FROM public.trades WHERE stock_id = p_stock_id);

  DELETE FROM public.cash_ledger
  WHERE entry_type = 'dividend'
    AND reference_type = 'dividend_payment'
    AND reference_id IN (SELECT id FROM public.dividend_payments WHERE stock_id = p_stock_id);

  DELETE FROM public.dividend_payments WHERE stock_id = p_stock_id;
  DELETE FROM public.dividends          WHERE stock_id = p_stock_id;
  DELETE FROM public.pending_price_changes WHERE stock_id = p_stock_id;
  DELETE FROM public.trades             WHERE stock_id = p_stock_id;
  DELETE FROM public.holdings           WHERE stock_id = p_stock_id;
  DELETE FROM public.market_quotes      WHERE stock_id = p_stock_id;
  DELETE FROM public.stocks             WHERE id = p_stock_id;

  -- Broadcast to every live run so participant markets update instantly.
  PERFORM public.notify_realtime(
    'run:' || run.id::text,
    'STOCK_DEACTIVATED',
    NULL,
    jsonb_build_object(
      'competition_run_id', run.id,
      'stock_id', p_stock_id,
      'symbol', v_stock.symbol,
      'occurred_at', now()
    )
  )
  FROM (
    SELECT id FROM public.competition_runs WHERE status IN ('pending', 'active')
  ) AS run;

  RETURN jsonb_build_object(
    'ok', true,
    'stock_id', p_stock_id,
    'symbol', v_stock.symbol,
    'removed_at', now()
  );
END;
$$;

COMMENT ON FUNCTION public.remove_stock(uuid) IS
  'Admin: permanently deletes a stock and all its quotes, holdings, trades, ledger entries and dividend history. Destructive.';

REVOKE EXECUTE ON FUNCTION public.remove_stock(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_stock(uuid) TO authenticated;

-- ------------------------------------------------------------
-- 4. reset_competition_run — reprice market to opening prices
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reset_competition_run(p_competition_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team record;
BEGIN
  PERFORM public.assert_admin();

  IF NOT EXISTS (
    SELECT 1 FROM public.competition_runs WHERE id = p_competition_run_id
  ) THEN
    RAISE EXCEPTION 'COMPETITION_RUN_NOT_FOUND: %', p_competition_run_id;
  END IF;

  -- 1. Rounds back to pending.
  UPDATE public.rounds
  SET status = 'pending',
      started_at = NULL,
      ends_at = NULL,
      market_status = 'closed',
      trading_status = 'paused',
      paused_at = NULL,
      accumulated_pause_duration = interval '0',
      updated_at = now()
  WHERE competition_run_id = p_competition_run_id;

  -- 2. Clear financial + operational state for this run.
  DELETE FROM public.idempotency_keys WHERE competition_run_id = p_competition_run_id;
  DELETE FROM public.dividend_payments WHERE competition_run_id = p_competition_run_id;
  DELETE FROM public.dividends        WHERE competition_run_id = p_competition_run_id;
  DELETE FROM public.trades           WHERE competition_run_id = p_competition_run_id;
  DELETE FROM public.holdings         WHERE competition_run_id = p_competition_run_id;
  DELETE FROM public.cash_ledger      WHERE competition_run_id = p_competition_run_id;

  -- 3. Drop pending/draft price-change state (keep applied history).
  DELETE FROM public.pending_price_changes
  WHERE batch_id IN (
    SELECT id FROM public.price_change_batches
    WHERE competition_run_id = p_competition_run_id
      AND status <> 'applied'
  );

  UPDATE public.price_change_batches
  SET status = 'cancelled'
  WHERE competition_run_id = p_competition_run_id
    AND status <> 'applied';

  -- 3b. Market back to opening prices; reactivate any deactivated stocks.
  UPDATE public.market_quotes q
  SET price_paise = s.initial_price_paise,
      updated_at  = now()
  FROM public.stocks s
  WHERE s.id = q.stock_id
    AND q.competition_run_id = p_competition_run_id;

  UPDATE public.stocks
  SET is_active = true, updated_at = now()
  WHERE is_active = false;

  -- 4. Re-fund every participant team at ₹1,00,000 (10,000,000 paise).
  FOR v_team IN
    SELECT id FROM public.teams WHERE role = 'participant'
  LOOP
    INSERT INTO public.cash_ledger
      (team_id, competition_run_id, entry_type, amount_paise, description, created_by)
    VALUES
      (v_team.id, p_competition_run_id, 'initial_capital', 10000000,
       'Initial capital (reset)', auth.uid());
  END LOOP;

  -- 5. Realtime wake-up signals (identifiers only).
  FOR v_team IN
    SELECT id FROM public.teams WHERE role = 'participant'
  LOOP
    PERFORM public.notify_realtime(
      'team:' || v_team.id::text,
      'PORTFOLIO_CHANGED',
      v_team.id,
      jsonb_build_object(
        'competition_run_id', p_competition_run_id,
        'reason', 'reset',
        'occurred_at', now()
      )
    );
  END LOOP;

  PERFORM public.notify_realtime(
    'run:' || p_competition_run_id::text,
    'ROUND_STATE_CHANGED',
    NULL,
    jsonb_build_object(
      'competition_run_id', p_competition_run_id,
      'status', 'pending',
      'market_status', 'closed',
      'trading_status', 'paused',
      'occurred_at', now()
    )
  );

  PERFORM public.notify_realtime(
    'run:' || p_competition_run_id::text,
    'PRICES_CHANGED',
    NULL,
    jsonb_build_object(
      'competition_run_id', p_competition_run_id,
      'reason', 'reset_to_opening_prices',
      'occurred_at', now()
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'competition_run_id', p_competition_run_id,
    'starting_cash_paise', 10000000,
    'market_repriced', true
  );
END;
$$;

COMMENT ON FUNCTION public.reset_competition_run(uuid) IS
  'Admin: atomic competition reset — rounds pending, financials cleared, teams re-funded ₹1,00,000, market repriced to opening prices, all stocks reactivated.';

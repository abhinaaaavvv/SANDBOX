-- ============================================================
-- Phase 3 Review: Add setup_initial_prices() RPC
-- ============================================================
-- Issue: The Phase 3 report assumed an admin INSERT policy exists
-- on market_quotes for initial price setup, but no such policy
-- was created. This is actually correct - we don't want broad
-- write access. However, we need a controlled mechanism for
-- initial price setup.
--
-- Solution: Create a setup_initial_prices() RPC that:
-- 1. Requires admin authorization
-- 2. Validates competition run exists and is pending
-- 3. Validates each stock exists and is active
-- 4. Checks no quote already exists for this stock+run
-- 5. Inserts initial prices atomically
-- ============================================================

CREATE OR REPLACE FUNCTION public.setup_initial_prices(
  p_competition_run_id uuid,
  p_prices jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run      record;
  v_price    jsonb;
  v_stock_id uuid;
  v_price_paise bigint;
  v_stock    record;
  v_existing record;
  v_now      timestamptz := now();
  v_inserted int := 0;
BEGIN
  -- 1. Authorize
  PERFORM public.assert_admin();

  -- 2. Validate competition run exists and is pending
  SELECT * INTO v_run
  FROM public.competition_runs
  WHERE id = p_competition_run_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMPETITION_RUN_NOT_FOUND: %', p_competition_run_id;
  END IF;

  IF v_run.status <> 'pending' THEN
    RAISE EXCEPTION 'INVALID_STATE: competition run status is %, expected pending', v_run.status;
  END IF;

  -- 3. Validate input array is non-empty
  IF jsonb_array_length(p_prices) = 0 THEN
    RAISE EXCEPTION 'EMPTY_PRICES: at least one price is required';
  END IF;

  -- 4. Process each price
  FOR v_price IN SELECT * FROM jsonb_array_elements(p_prices)
  LOOP
    v_stock_id := (v_price->>'stock_id')::uuid;
    v_price_paise := (v_price->>'price_paise')::bigint;

    -- Validate stock exists and is active
    SELECT * INTO v_stock
    FROM public.stocks
    WHERE id = v_stock_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'STOCK_NOT_FOUND: %', v_stock_id;
    END IF;

    IF NOT v_stock.is_active THEN
      RAISE EXCEPTION 'STOCK_INACTIVE: % (%)', v_stock.symbol, v_stock_id;
    END IF;

    -- Validate price is positive (initial prices must be > 0)
    IF v_price_paise IS NULL OR v_price_paise <= 0 THEN
      RAISE EXCEPTION 'INVALID_PRICE: price_paise must be positive, got %', v_price_paise;
    END IF;

    -- Check no quote already exists for this stock+run
    SELECT * INTO v_existing
    FROM public.market_quotes
    WHERE stock_id = v_stock_id
      AND competition_run_id = p_competition_run_id;

    IF FOUND THEN
      RAISE EXCEPTION 'QUOTE_EXISTS: stock % already has a price quote for this run', v_stock.symbol;
    END IF;

    -- Insert initial price
    INSERT INTO public.market_quotes (stock_id, competition_run_id, price_paise, created_at, updated_at)
    VALUES (v_stock_id, p_competition_run_id, v_price_paise, v_now, v_now);

    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',           true,
    'prices_set',   v_inserted,
    'created_at',   v_now
  );
END;
$$;

COMMENT ON FUNCTION public.setup_initial_prices(uuid, jsonb)
  IS 'Admin RPC: set initial market prices for a pending competition run. Validates stock exists, is active, and has no existing quote. Prices must be positive.';

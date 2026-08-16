-- 2. RPC: rename_stock()
-- -----------------------------------------------------------
-- Renames a stock (name and symbol). Symbol change is allowed.
-- Fires STOCK_UPDATED realtime notification.

CREATE OR REPLACE FUNCTION public.rename_stock(
  p_stock_id uuid,
  p_new_name text,
  p_new_symbol text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock record;
  v_now   timestamptz := now();
  v_run   record;
  v_count integer;
BEGIN
  -- 1. Authorize
  PERFORM public.assert_admin();

  -- 2. Validate inputs
  IF char_length(trim(p_new_name)) = 0 THEN
    RAISE EXCEPTION 'INVALID_NAME: name cannot be empty';
  END IF;

  IF char_length(trim(p_new_symbol)) = 0 THEN
    RAISE EXCEPTION 'INVALID_SYMBOL: symbol cannot be empty';
  END IF;

  -- Check symbol uniqueness (exclude current stock)
  SELECT count(*) INTO v_count
  FROM public.stocks
  WHERE symbol = trim(p_new_symbol) AND id != p_stock_id;

  IF v_count > 0 THEN
    RAISE EXCEPTION 'DUPLICATE_SYMBOL: symbol already exists';
  END IF;

  -- 3. Load and lock the stock
  SELECT * INTO v_stock
  FROM public.stocks
  WHERE id = p_stock_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'STOCK_NOT_FOUND: %', p_stock_id;
  END IF;

  -- 4. Update the name and symbol
  UPDATE public.stocks
  SET name       = trim(p_new_name),
      symbol     = trim(p_new_symbol),
      updated_at = v_now
  WHERE id = p_stock_id;

  -- 5. Notify: stock updated (all active runs)
  FOR v_run IN
    SELECT id FROM public.competition_runs WHERE status IN ('pending', 'active')
  LOOP
    PERFORM public.notify_realtime(
      'run:' || v_run.id::text,
      'STOCK_UPDATED',
      NULL,
      jsonb_build_object(
        'competition_run_id', v_run.id,
        'stock_id', p_stock_id,
        'symbol', trim(p_new_symbol),
        'name', trim(p_new_name),
        'occurred_at', v_now
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok',       true,
    'stock_id', p_stock_id,
    'symbol',   trim(p_new_symbol),
    'name',     trim(p_new_name),
    'updated_at', v_now
  );
END;
$$;

COMMENT ON FUNCTION public.rename_stock(uuid, text, text)
  IS 'Admin RPC: rename a stock with new symbol. Fires STOCK_UPDATED realtime notification.';

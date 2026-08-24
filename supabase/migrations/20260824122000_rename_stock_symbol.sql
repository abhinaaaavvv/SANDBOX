-- ============================================================
-- Phase 3 of docs/REMEDIATION_PLAN.md — rename_stock supports
-- symbol changes (locked decision: rename name AND symbol).
--
-- Backwards compatible: p_new_symbol is optional; omitting it
-- preserves previous behaviour (name/description only).
-- ============================================================

CREATE OR REPLACE FUNCTION public.rename_stock(
  p_stock_id   uuid,
  p_new_name   text,
  p_new_symbol text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock      record;
  v_now        timestamptz := now();
  v_run        record;
  v_symbol     text;
  v_final_name text;
BEGIN
  -- 1. Authorize
  PERFORM public.assert_admin();

  -- 2. Validate inputs
  v_final_name := trim(p_new_name);
  IF char_length(v_final_name) = 0 THEN
    RAISE EXCEPTION 'INVALID_NAME: name cannot be empty';
  END IF;

  IF p_new_symbol IS NOT NULL THEN
    v_symbol := upper(trim(p_new_symbol));
    IF char_length(v_symbol) = 0 THEN
      RAISE EXCEPTION 'INVALID_SYMBOL: symbol cannot be empty';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.stocks
      WHERE symbol = v_symbol AND id <> p_stock_id
    ) THEN
      RAISE EXCEPTION 'DUPLICATE_SYMBOL: % is already in use', v_symbol;
    END IF;
  END IF;

  -- 3. Load and lock the stock
  SELECT * INTO v_stock
  FROM public.stocks
  WHERE id = p_stock_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'STOCK_NOT_FOUND: %', p_stock_id;
  END IF;

  -- 4. Update (symbol only when explicitly provided)
  UPDATE public.stocks
  SET name       = v_final_name,
      symbol     = COALESCE(v_symbol, v_stock.symbol),
      updated_at = v_now
  WHERE id = p_stock_id;

  -- 5. Notify: stock updated (all live runs)
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
        'symbol', COALESCE(v_symbol, v_stock.symbol),
        'name', v_final_name,
        'occurred_at', v_now
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok',         true,
    'stock_id',   p_stock_id,
    'symbol',     COALESCE(v_symbol, v_stock.symbol),
    'name',       v_final_name,
    'updated_at', v_now
  );
END;
$$;

COMMENT ON FUNCTION public.rename_stock(uuid, text, text) IS
  'Admin: rename a stock; optional third argument changes the ticker symbol (uniqueness enforced).';

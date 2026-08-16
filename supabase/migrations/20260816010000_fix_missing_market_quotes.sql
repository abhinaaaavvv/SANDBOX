-- Fix: Add missing market_quotes for stocks that lack one
-- Sets price to ₹1000 (100000 paise) for any stock missing a quote

DO $$
DECLARE
  v_run record;
  v_stock record;
  v_inserted int := 0;
BEGIN
  FOR v_run IN
    SELECT id FROM public.competition_runs WHERE status IN ('pending', 'active')
  LOOP
    FOR v_stock IN
      SELECT s.id, s.symbol
      FROM public.stocks s
      WHERE s.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM public.market_quotes mq
          WHERE mq.stock_id = s.id
            AND mq.competition_run_id = v_run.id
        )
    LOOP
      INSERT INTO public.market_quotes (stock_id, competition_run_id, price_paise)
      VALUES (v_stock.id, v_run.id, 100000)
      ON CONFLICT DO NOTHING;

      v_inserted := v_inserted + 1;
      RAISE NOTICE 'Created market quote for % at ₹1000', v_stock.symbol;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Created % missing market quotes', v_inserted;
END $$;

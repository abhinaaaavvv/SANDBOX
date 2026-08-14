-- ============================================================
-- Phase 3: Market System
-- ============================================================
-- Tables: stocks, market_quotes, price_change_batches, pending_price_changes
-- RPCs: prepare_price_batch(), apply_price_changes()
-- Security: RLS enforces participant read-only on active prices,
--           admin-only on pending prices and batch management
-- ============================================================

-- -----------------------------------------------------------
-- 1. stocks
-- -----------------------------------------------------------
-- Global stock definitions. Not per-competition-run.
-- Current prices live in market_quotes, not here.

CREATE TABLE public.stocks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol      text NOT NULL,
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_stocks_symbol UNIQUE (symbol),
  CONSTRAINT chk_stocks_symbol_not_empty CHECK (char_length(trim(symbol)) > 0),
  CONSTRAINT chk_stocks_name_not_empty CHECK (char_length(trim(name)) > 0)
);

COMMENT ON TABLE public.stocks IS 'Global stock definitions. Prices are in market_quotes, not here.';

CREATE INDEX idx_stocks_symbol ON public.stocks (symbol);
CREATE INDEX idx_stocks_is_active ON public.stocks (is_active) WHERE is_active = true;

CREATE TRIGGER stocks_set_updated_at
  BEFORE UPDATE ON public.stocks
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------
-- 2. market_quotes
-- -----------------------------------------------------------
-- The currently active authoritative market price.
-- One quote per stock per competition run.
-- Participants read this. Nobody writes directly via RLS.

CREATE TABLE public.market_quotes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id          uuid NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  competition_run_id uuid NOT NULL REFERENCES public.competition_runs(id) ON DELETE CASCADE,
  price_paise       bigint NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_market_quotes_stock_run UNIQUE (stock_id, competition_run_id),
  CONSTRAINT chk_market_quotes_price_non_negative CHECK (price_paise >= 0)
);

COMMENT ON TABLE public.market_quotes IS 'Currently active authoritative market price. One per stock per competition run.';

CREATE INDEX idx_market_quotes_run_id ON public.market_quotes (competition_run_id);
CREATE INDEX idx_market_quotes_stock_id ON public.market_quotes (stock_id);

CREATE TRIGGER market_quotes_set_updated_at
  BEFORE UPDATE ON public.market_quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------
-- 3. price_change_batches
-- -----------------------------------------------------------
-- An administrator-created group of pending price changes.
-- Status: pending -> applied | cancelled
-- Applied batches retain their historical record.

CREATE TABLE public.price_change_batches (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_run_id uuid NOT NULL REFERENCES public.competition_runs(id) ON DELETE CASCADE,
  created_by        uuid NOT NULL REFERENCES public.profiles(id),
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'applied', 'cancelled')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  applied_at        timestamptz
);

COMMENT ON TABLE public.price_change_batches IS 'Admin-created batch of pending price changes. Applied atomically.';

CREATE INDEX idx_price_change_batches_run_id ON public.price_change_batches (competition_run_id);
CREATE INDEX idx_price_change_batches_status ON public.price_change_batches (status);

-- -----------------------------------------------------------
-- 4. pending_price_changes
-- -----------------------------------------------------------
-- Individual price changes within a batch.
-- Stores both old (authoritative) and new (requested) prices.
-- One stock per batch max (enforced by unique constraint).

CREATE TABLE public.pending_price_changes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id        uuid NOT NULL REFERENCES public.price_change_batches(id) ON DELETE CASCADE,
  stock_id        uuid NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  old_price_paise bigint NOT NULL,
  new_price_paise bigint NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_pending_price_changes_batch_stock UNIQUE (batch_id, stock_id),
  CONSTRAINT chk_pending_old_price_non_negative CHECK (old_price_paise >= 0),
  CONSTRAINT chk_pending_new_price_non_negative CHECK (new_price_paise >= 0)
);

COMMENT ON TABLE public.pending_price_changes IS 'Individual pending price changes within a batch. Stores old and new prices.';

CREATE INDEX idx_pending_price_changes_batch_id ON public.pending_price_changes (batch_id);

-- -----------------------------------------------------------
-- 5. RPC: prepare_price_batch()
-- -----------------------------------------------------------
-- Creates a pending price-change batch with validated entries.
-- Reads authoritative current prices from market_quotes.
-- Clients must not claim the old price.

CREATE OR REPLACE FUNCTION public.prepare_price_batch(
  p_competition_run_id uuid,
  p_changes jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id uuid;
  v_run      record;
  v_change   jsonb;
  v_stock_id uuid;
  v_new_price bigint;
  v_stock    record;
  v_quote    record;
  v_now      timestamptz := now();
  v_inserted int := 0;
BEGIN
  -- 1. Authorize
  PERFORM public.assert_admin();

  -- 2. Validate competition run exists and is pending or active
  SELECT * INTO v_run
  FROM public.competition_runs
  WHERE id = p_competition_run_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMPETITION_RUN_NOT_FOUND: %', p_competition_run_id;
  END IF;

  IF v_run.status NOT IN ('pending', 'active') THEN
    RAISE EXCEPTION 'INVALID_STATE: competition run status is %, expected pending or active', v_run.status;
  END IF;

  -- 3. Validate input array is non-empty
  IF jsonb_array_length(p_changes) = 0 THEN
    RAISE EXCEPTION 'EMPTY_BATCH: at least one price change is required';
  END IF;

  -- 4. Create the batch
  INSERT INTO public.price_change_batches (competition_run_id, created_by, status, created_at)
  VALUES (p_competition_run_id, auth.uid(), 'pending', v_now)
  RETURNING id INTO v_batch_id;

  -- 5. Process each change
  FOR v_change IN SELECT * FROM jsonb_array_elements(p_changes)
  LOOP
    v_stock_id := (v_change->>'stock_id')::uuid;
    v_new_price := (v_change->>'new_price_paise')::bigint;

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

    -- Validate new price is non-negative
    IF v_new_price IS NULL OR v_new_price < 0 THEN
      RAISE EXCEPTION 'INVALID_PRICE: new_price_paise must be non-negative, got %', v_new_price;
    END IF;

    -- Read authoritative current price from market_quotes
    SELECT * INTO v_quote
    FROM public.market_quotes
    WHERE stock_id = v_stock_id
      AND competition_run_id = p_competition_run_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'NO_MARKET_QUOTE: stock % has no price quote for run %', v_stock.symbol, p_competition_run_id;
    END IF;

    -- Insert pending change with authoritative old price
    INSERT INTO public.pending_price_changes (batch_id, stock_id, old_price_paise, new_price_paise, created_at)
    VALUES (v_batch_id, v_stock_id, v_quote.price_paise, v_new_price, v_now);

    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',           true,
    'batch_id',     v_batch_id,
    'changes_count', v_inserted,
    'created_at',   v_now
  );
END;
$$;

COMMENT ON FUNCTION public.prepare_price_batch(uuid, jsonb)
  IS 'Admin RPC: create a pending price-change batch. Reads authoritative old prices from market_quotes. Validates stock exists, is active, and has a quote for the run.';

-- -----------------------------------------------------------
-- 6. RPC: apply_price_changes()
-- -----------------------------------------------------------
-- Atomically applies all price changes in a pending batch.
-- Validates old prices still match current market_prices.
-- Uses row-level locking to prevent concurrent application.
-- All-or-nothing: if any change fails, nothing changes.

CREATE OR REPLACE FUNCTION public.apply_price_changes(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch    record;
  v_change   record;
  v_quote    record;
  v_now      timestamptz := now();
  v_applied  int := 0;
BEGIN
  -- 1. Authorize
  PERFORM public.assert_admin();

  -- 2. Load and lock the batch
  SELECT * INTO v_batch
  FROM public.price_change_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BATCH_NOT_FOUND: %', p_batch_id;
  END IF;

  -- 3. Validate batch status
  IF v_batch.status = 'applied' THEN
    RAISE EXCEPTION 'BATCH_ALREADY_APPLIED: batch % was applied at %', p_batch_id, v_batch.applied_at;
  END IF;

  IF v_batch.status = 'cancelled' THEN
    RAISE EXCEPTION 'BATCH_CANCELLED: batch % has been cancelled', p_batch_id;
  END IF;

  IF v_batch.status <> 'pending' THEN
    RAISE EXCEPTION 'INVALID_BATCH_STATUS: batch status is %, expected pending', v_batch.status;
  END IF;

  -- 4. Validate all pending changes (old price must still match current)
  FOR v_change IN
    SELECT ppc.*, s.symbol
    FROM public.pending_price_changes ppc
    JOIN public.stocks s ON s.id = ppc.stock_id
    WHERE ppc.batch_id = p_batch_id
  LOOP
    -- Lock the market_quote row to prevent concurrent modification
    SELECT * INTO v_quote
    FROM public.market_quotes
    WHERE stock_id = v_change.stock_id
      AND competition_run_id = v_batch.competition_run_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'NO_MARKET_QUOTE: stock % has no price quote for this run', v_change.symbol;
    END IF;

    -- Validate stale price protection
    IF v_quote.price_paise <> v_change.old_price_paise THEN
      RAISE EXCEPTION 'STALE_PRICE: % current price is % paise, expected % paise. Batch rejected.',
        v_change.symbol, v_quote.price_paise, v_change.old_price_paise;
    END IF;
  END LOOP;

  -- 5. Apply all price changes
  FOR v_change IN
    SELECT ppc.*
    FROM public.pending_price_changes ppc
    WHERE ppc.batch_id = p_batch_id
  LOOP
    UPDATE public.market_quotes
    SET price_paise = v_change.new_price_paise,
        updated_at  = v_now
    WHERE stock_id = v_change.stock_id
      AND competition_run_id = v_batch.competition_run_id;

    v_applied := v_applied + 1;
  END LOOP;

  -- 6. Mark batch as applied
  UPDATE public.price_change_batches
  SET status     = 'applied',
      applied_at = v_now
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'ok',           true,
    'batch_id',     p_batch_id,
    'applied_count', v_applied,
    'applied_at',   v_now
  );
END;
$$;

COMMENT ON FUNCTION public.apply_price_changes(uuid)
  IS 'Admin RPC: atomically apply all pending price changes in a batch. Validates old prices match current. Rolls back entirely on any failure.';

-- -----------------------------------------------------------
-- 7. RPC: cancel_price_batch()
-- -----------------------------------------------------------
-- Cancels a pending batch. Cannot cancel an already-applied batch.

CREATE OR REPLACE FUNCTION public.cancel_price_batch(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch record;
  v_now   timestamptz := now();
BEGIN
  PERFORM public.assert_admin();

  SELECT * INTO v_batch
  FROM public.price_change_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BATCH_NOT_FOUND: %', p_batch_id;
  END IF;

  IF v_batch.status <> 'pending' THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION: batch status is %, expected pending', v_batch.status;
  END IF;

  UPDATE public.price_change_batches
  SET status = 'cancelled'
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'ok',       true,
    'batch_id', p_batch_id,
    'status',   'cancelled'
  );
END;
$$;

COMMENT ON FUNCTION public.cancel_price_batch(uuid)
  IS 'Admin RPC: cancel a pending price-change batch. Cannot cancel an already-applied batch.';

-- -----------------------------------------------------------
-- 8. Row Level Security
-- -----------------------------------------------------------

ALTER TABLE public.stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_change_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_price_changes ENABLE ROW LEVEL SECURITY;

-- ---- stocks policies ----

-- All authenticated users can read stocks (needed for trading UI).
CREATE POLICY "stocks_select_authenticated"
  ON public.stocks
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only admins can insert/update/delete stocks.
-- Stock management is admin-only via migrations or future RPCs.
-- No INSERT/UPDATE/DELETE policies for participants.

-- ---- market_quotes policies ----

-- All authenticated users can read active market prices.
CREATE POLICY "market_quotes_select_authenticated"
  ON public.market_quotes
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- No direct INSERT/UPDATE/DELETE policies.
-- Prices are managed exclusively through:
--   apply_price_changes() RPC (SECURITY DEFINER bypasses RLS)
--   Initial price setup via migrations/seed data

-- ---- price_change_batches policies ----

-- Admins can read all batches (for admin UI).
CREATE POLICY "price_change_batches_select_admin"
  ON public.price_change_batches
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- No participant SELECT: pending batch data is admin-only.
-- No direct INSERT/UPDATE/DELETE: managed through RPCs.

-- ---- pending_price_changes policies ----

-- Admins can read pending changes (for admin review UI).
CREATE POLICY "pending_price_changes_select_admin"
  ON public.pending_price_changes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- No participant SELECT: pending price data must be invisible to participants.
-- No direct INSERT/UPDATE/DELETE: managed through RPCs.

-- ============================================================
-- Summary of RLS policies:
--
-- stocks:
--   stocks_select_authenticated (SELECT) - all authenticated users
--
-- market_quotes:
--   market_quotes_select_authenticated (SELECT) - all authenticated users
--
-- price_change_batches:
--   price_change_batches_select_admin (SELECT) - admin only
--
-- pending_price_changes:
--   pending_price_changes_select_admin (SELECT) - admin only
--
-- All writes go through SECURITY DEFINER RPCs:
--   prepare_price_batch() - creates batch + pending changes
--   apply_price_changes() - atomically applies all changes
--   cancel_price_batch() - cancels a pending batch
-- ============================================================

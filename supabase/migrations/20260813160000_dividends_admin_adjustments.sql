-- ============================================================
-- Phase 5: Dividends & Admin Cash Adjustments
-- ============================================================
-- Tables: dividends, dividend_payments
-- RPCs: create_dividend(), apply_dividend(), adjust_team_cash()
-- Security: RLS enforces team isolation, all writes via RPCs
-- ============================================================

-- -----------------------------------------------------------
-- 1. Extend cash_ledger.entry_type constraint
-- -----------------------------------------------------------
-- Add 'dividend' and 'admin_adjustment' to allowed entry types.
-- Must drop and recreate the CHECK constraint.

ALTER TABLE public.cash_ledger
  DROP CONSTRAINT IF EXISTS cash_ledger_entry_type_check;

ALTER TABLE public.cash_ledger
  ADD CONSTRAINT cash_ledger_entry_type_check CHECK (entry_type IN (
    'initial_capital',
    'trade_buy',
    'trade_sell',
    'dividend',
    'admin_adjustment'
  ));

-- -----------------------------------------------------------
-- 2. dividends
-- -----------------------------------------------------------
-- Administrator-declared dividend for a stock within a competition run.
-- Status: pending -> applied | cancelled
-- Applied dividends retain their historical record.

CREATE TABLE public.dividends (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_run_id    uuid NOT NULL REFERENCES public.competition_runs(id) ON DELETE CASCADE,
  stock_id              uuid NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  amount_per_share_paise bigint NOT NULL,
  status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'applied', 'cancelled')),
  created_by            uuid NOT NULL REFERENCES public.profiles(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  applied_at            timestamptz,

  CONSTRAINT chk_dividends_amount_non_negative CHECK (amount_per_share_paise >= 0)
);

COMMENT ON TABLE public.dividends IS 'Administrator-declared dividend for a stock within a competition run.';

CREATE INDEX idx_dividends_competition_run_id ON public.dividends (competition_run_id);
CREATE INDEX idx_dividends_stock_id ON public.dividends (stock_id);
CREATE INDEX idx_dividends_status ON public.dividends (status);

-- -----------------------------------------------------------
-- 3. dividend_payments
-- -----------------------------------------------------------
-- Records the actual amount paid to each team for a dividend.
-- One payment per dividend per team (enforced by unique constraint).
-- Payment records are immutable.

CREATE TABLE public.dividend_payments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dividend_id           uuid NOT NULL REFERENCES public.dividends(id) ON DELETE CASCADE,
  team_id               uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  competition_run_id    uuid NOT NULL REFERENCES public.competition_runs(id) ON DELETE CASCADE,
  stock_id              uuid NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  shares_held           bigint NOT NULL CHECK (shares_held >= 0),
  amount_per_share_paise bigint NOT NULL,
  total_amount_paise    bigint NOT NULL CHECK (total_amount_paise >= 0),
  cash_ledger_entry_id  uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_dividend_payments_dividend_team UNIQUE (dividend_id, team_id),
  CONSTRAINT chk_dividend_payments_total CHECK (total_amount_paise = shares_held * amount_per_share_paise)
);

COMMENT ON TABLE public.dividend_payments IS 'Records the actual amount paid to each team for a dividend.';

CREATE INDEX idx_dividend_payments_dividend_id ON public.dividend_payments (dividend_id);
CREATE INDEX idx_dividend_payments_team_id ON public.dividend_payments (team_id);
CREATE INDEX idx_dividend_payments_competition_run_id ON public.dividend_payments (competition_run_id);
CREATE INDEX idx_dividend_payments_team_run ON public.dividend_payments (team_id, competition_run_id);

-- -----------------------------------------------------------
-- 4. RPC: create_dividend()
-- -----------------------------------------------------------
-- Admin RPC: create a pending dividend for a stock in a competition run.
-- Does not create payments or modify cash ledger.

CREATE OR REPLACE FUNCTION public.create_dividend(
  p_competition_run_id uuid,
  p_stock_id uuid,
  p_amount_per_share_paise bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run   record;
  v_stock record;
  v_quote record;
  v_now   timestamptz := now();
  v_dividend_id uuid;
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

  -- 3. Validate stock
  SELECT * INTO v_stock
  FROM public.stocks
  WHERE id = p_stock_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'STOCK_NOT_FOUND: %', p_stock_id;
  END IF;

  IF NOT v_stock.is_active THEN
    RAISE EXCEPTION 'STOCK_INACTIVE: % (%)', v_stock.symbol, p_stock_id;
  END IF;

  -- 4. Validate stock has a market quote for the run
  SELECT * INTO v_quote
  FROM public.market_quotes
  WHERE stock_id = p_stock_id
    AND competition_run_id = p_competition_run_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_MARKET_QUOTE: stock % has no price quote for run %', v_stock.symbol, p_competition_run_id;
  END IF;

  -- 5. Validate dividend amount
  IF p_amount_per_share_paise IS NULL OR p_amount_per_share_paise < 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: amount_per_share_paise must be non-negative, got %', p_amount_per_share_paise;
  END IF;

  -- 6. Create dividend in pending state
  INSERT INTO public.dividends (competition_run_id, stock_id, amount_per_share_paise, status, created_by, created_at)
  VALUES (p_competition_run_id, p_stock_id, p_amount_per_share_paise, 'pending', auth.uid(), v_now)
  RETURNING id INTO v_dividend_id;

  RETURN jsonb_build_object(
    'ok',                     true,
    'dividend_id',            v_dividend_id,
    'competition_run_id',     p_competition_run_id,
    'stock_id',               p_stock_id,
    'stock_symbol',           v_stock.symbol,
    'amount_per_share_paise', p_amount_per_share_paise,
    'status',                 'pending',
    'created_at',             v_now
  );
END;
$$;

COMMENT ON FUNCTION public.create_dividend(uuid, uuid, bigint)
  IS 'Admin RPC: create a pending dividend for a stock in a competition run. Does not create payments or modify cash ledger.';

-- -----------------------------------------------------------
-- 5. RPC: apply_dividend()
-- -----------------------------------------------------------
-- Admin RPC: atomically apply a pending dividend.
-- Creates dividend_payments and cash_ledger entries for all eligible teams.
-- Uses SELECT FOR UPDATE on initial_capital rows to serialize financial operations.

CREATE OR REPLACE FUNCTION public.apply_dividend(p_dividend_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dividend      record;
  v_holding       record;
  v_payment       record;
  v_lock_row      record;
  v_now           timestamptz := now();
  v_payment_count int := 0;
  v_total_paid    bigint := 0;
  v_payment_id    uuid;
  v_ledger_id     uuid;
BEGIN
  -- 1. Authorize
  PERFORM public.assert_admin();

  -- 2. Lock the dividend row to prevent concurrent application
  SELECT * INTO v_dividend
  FROM public.dividends
  WHERE id = p_dividend_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DIVIDEND_NOT_FOUND: %', p_dividend_id;
  END IF;

  -- 3. Verify dividend is pending
  IF v_dividend.status = 'applied' THEN
    RAISE EXCEPTION 'DIVIDEND_ALREADY_APPLIED: dividend % was applied at %', p_dividend_id, v_dividend.applied_at;
  END IF;

  IF v_dividend.status = 'cancelled' THEN
    RAISE EXCEPTION 'DIVIDEND_CANCELLED: dividend % has been cancelled', p_dividend_id;
  END IF;

  IF v_dividend.status <> 'pending' THEN
    RAISE EXCEPTION 'INVALID_DIVIDEND_STATUS: dividend status is %, expected pending', v_dividend.status;
  END IF;

  -- 4. Verify competition run is valid
  IF NOT EXISTS (
    SELECT 1 FROM public.competition_runs
    WHERE id = v_dividend.competition_run_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'INVALID_STATE: competition run is not active';
  END IF;

  -- 5. Process dividend for each team with holdings
  FOR v_holding IN
    SELECT h.team_id, h.quantity
    FROM public.holdings h
    WHERE h.competition_run_id = v_dividend.competition_run_id
      AND h.stock_id = v_dividend.stock_id
      AND h.quantity > 0
  LOOP
    -- Lock the team's initial_capital row to serialize financial operations
    -- This prevents concurrent trades/dividends from racing
    SELECT * INTO v_lock_row
    FROM public.cash_ledger
    WHERE team_id = v_holding.team_id
      AND competition_run_id = v_dividend.competition_run_id
      AND entry_type = 'initial_capital'
    FOR UPDATE;

    -- Create dividend payment
    INSERT INTO public.dividend_payments (
      dividend_id, team_id, competition_run_id, stock_id,
      shares_held, amount_per_share_paise, total_amount_paise,
      created_at
    )
    VALUES (
      p_dividend_id, v_holding.team_id, v_dividend.competition_run_id, v_dividend.stock_id,
      v_holding.quantity, v_dividend.amount_per_share_paise, v_holding.quantity * v_dividend.amount_per_share_paise,
      v_now
    )
    RETURNING id INTO v_payment_id;

    -- Create cash ledger entry
    INSERT INTO public.cash_ledger (
      team_id, competition_run_id, entry_type, amount_paise,
      reference_type, reference_id, description,
      created_by, created_at
    )
    VALUES (
      v_holding.team_id, v_dividend.competition_run_id, 'dividend',
      v_holding.quantity * v_dividend.amount_per_share_paise,
      'dividend_payment', v_payment_id,
      FORMAT('Dividend: %s paise per share × %s shares', v_dividend.amount_per_share_paise, v_holding.quantity),
      auth.uid(), v_now
    )
    RETURNING id INTO v_ledger_id;

    -- Update payment with ledger entry reference
    UPDATE public.dividend_payments
    SET cash_ledger_entry_id = v_ledger_id
    WHERE id = v_payment_id;

    v_payment_count := v_payment_count + 1;
    v_total_paid := v_total_paid + (v_holding.quantity * v_dividend.amount_per_share_paise);
  END LOOP;

  -- 6. Mark dividend as applied
  UPDATE public.dividends
  SET status = 'applied',
      applied_at = v_now
  WHERE id = p_dividend_id;

  RETURN jsonb_build_object(
    'ok',                     true,
    'dividend_id',            p_dividend_id,
    'applied_at',             v_now,
    'payment_count',          v_payment_count,
    'total_paid_paise',       v_total_paid
  );
END;
$$;

COMMENT ON FUNCTION public.apply_dividend(uuid)
  IS 'Admin RPC: atomically apply a pending dividend. Creates dividend_payments and cash_ledger entries for all eligible teams. Uses SELECT FOR UPDATE on initial_capital rows to serialize financial operations.';

-- -----------------------------------------------------------
-- 6. RPC: adjust_team_cash()
-- -----------------------------------------------------------
-- Admin RPC: adjust a team's cash balance.
-- Creates a single ledger entry (positive or negative adjustment).
-- Negative adjustments must not cause cash balance to become negative.

CREATE OR REPLACE FUNCTION public.adjust_team_cash(
  p_team_id uuid,
  p_competition_run_id uuid,
  p_amount_paise bigint,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team         record;
  v_run          record;
  v_lock_row     record;
  v_cash_balance bigint;
  v_new_balance  bigint;
  v_ledger_id    uuid;
  v_now          timestamptz := now();
BEGIN
  -- 1. Authorize
  PERFORM public.assert_admin();

  -- 2. Validate team exists
  SELECT * INTO v_team
  FROM public.teams
  WHERE id = p_team_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TEAM_NOT_FOUND: %', p_team_id;
  END IF;

  -- 3. Validate competition run exists and is pending or active
  SELECT * INTO v_run
  FROM public.competition_runs
  WHERE id = p_competition_run_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMPETITION_RUN_NOT_FOUND: %', p_competition_run_id;
  END IF;

  IF v_run.status NOT IN ('pending', 'active') THEN
    RAISE EXCEPTION 'INVALID_STATE: competition run status is %, expected pending or active', v_run.status;
  END IF;

  -- 4. Validate amount is non-zero
  IF p_amount_paise IS NULL OR p_amount_paise = 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: amount_paise must be non-zero, got %', p_amount_paise;
  END IF;

  -- 5. Validate reason is non-empty
  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RAISE EXCEPTION 'INVALID_REASON: reason must be non-empty';
  END IF;

  -- 6. Lock the team's initial_capital row to serialize financial operations
  SELECT * INTO v_lock_row
  FROM public.cash_ledger
  WHERE team_id = p_team_id
    AND competition_run_id = p_competition_run_id
    AND entry_type = 'initial_capital'
  FOR UPDATE;

  -- 7. Calculate current authoritative cash balance
  SELECT COALESCE(SUM(amount_paise), 0) INTO v_cash_balance
  FROM public.cash_ledger
  WHERE team_id = p_team_id
    AND competition_run_id = p_competition_run_id;

  -- 8. If amount is negative, ensure resulting balance remains >= 0
  v_new_balance := v_cash_balance + p_amount_paise;

  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_CASH: current balance % paise, adjustment % paise would result in % paise',
      v_cash_balance, p_amount_paise, v_new_balance;
  END IF;

  -- 9. Create ledger entry
  INSERT INTO public.cash_ledger (
    team_id, competition_run_id, entry_type, amount_paise,
    reference_type, reference_id, description,
    created_by, created_at
  )
  VALUES (
    p_team_id, p_competition_run_id, 'admin_adjustment', p_amount_paise,
    NULL, NULL, p_reason,
    auth.uid(), v_now
  )
  RETURNING id INTO v_ledger_id;

  RETURN jsonb_build_object(
    'ok',               true,
    'ledger_id',        v_ledger_id,
    'team_id',          p_team_id,
    'competition_run_id', p_competition_run_id,
    'amount_paise',     p_amount_paise,
    'previous_balance_paise', v_cash_balance,
    'new_balance_paise', v_new_balance,
    'reason',           p_reason,
    'created_at',       v_now
  );
END;
$$;

COMMENT ON FUNCTION public.adjust_team_cash(uuid, uuid, bigint, text)
  IS 'Admin RPC: adjust a team cash balance. Creates a single ledger entry. Negative adjustments must not cause cash balance to become negative.';

-- -----------------------------------------------------------
-- 7. Row Level Security
-- -----------------------------------------------------------

ALTER TABLE public.dividends         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dividend_payments ENABLE ROW LEVEL SECURITY;

-- ---- dividends policies ----

-- All authenticated users can read applied dividends (needed for UI).
CREATE POLICY "dividends_select_authenticated"
  ON public.dividends
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- No participant write policies. Dividends are managed by admin RPCs.

-- ---- dividend_payments policies ----

-- Participants can read their own team's dividend payments.
CREATE POLICY "dividend_payments_select_own_team"
  ON public.dividend_payments
  FOR SELECT
  USING (
    team_id IN (
      SELECT tm.team_id FROM public.team_members tm
      WHERE tm.user_id = auth.uid()
    )
  );

-- Admins can read all dividend payments.
CREATE POLICY "dividend_payments_select_admin"
  ON public.dividend_payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- No participant write policies. Dividend payments are created by RPCs.

-- ============================================================
-- Summary of RLS policies:
--
-- dividends:
--   dividends_select_authenticated (SELECT) - all authenticated users
--
-- dividend_payments:
--   dividend_payments_select_own_team (SELECT) - team members
--   dividend_payments_select_admin (SELECT) - admin only
--
-- All writes go through SECURITY DEFINER RPCs:
--   create_dividend() - creates pending dividend
--   apply_dividend() - atomically applies dividend
--   adjust_team_cash() - creates admin cash adjustment
-- ============================================================

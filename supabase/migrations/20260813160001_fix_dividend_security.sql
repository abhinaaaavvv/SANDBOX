-- ============================================================
-- Phase 5 Security & Correctness Fixes
-- ============================================================
-- Fixes:
-- 1. Pending dividend visibility: participants can only see applied dividends
-- 2. Deterministic dividend locking: ORDER BY team_id in apply_dividend()
-- 3. Admin adjustment idempotency: using idempotency_keys table
-- 4. Documentation: dividend_payments ↔ cash_ledger integrity note
-- ============================================================

-- -----------------------------------------------------------
-- Fix 1: Pending dividend visibility
-- -----------------------------------------------------------
-- CRITICAL: The original policy let all authenticated users see
-- pending dividends, leaking future competition info (stock, amount, run).
-- Fix: participants see ONLY applied dividends; admins see all.

DROP POLICY IF EXISTS "dividends_select_authenticated" ON public.dividends;

-- Participants can only see applied dividends (for UI display).
CREATE POLICY "dividends_select_participant_applied"
  ON public.dividends
  FOR SELECT
  USING (
    status = 'applied'
    AND auth.uid() IS NOT NULL
  );

-- Admins can see all dividends (pending, applied, cancelled).
CREATE POLICY "dividends_select_admin"
  ON public.dividends
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- -----------------------------------------------------------
-- Fix 2: Deterministic dividend locking
-- -----------------------------------------------------------
-- Original apply_dividend() iterated teams without ORDER BY,
-- risking non-deterministic lock acquisition order and deadlocks.
-- Fix: add ORDER BY team_id to the holdings query.

CREATE OR REPLACE FUNCTION public.apply_dividend(p_dividend_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dividend      record;
  v_holding       record;
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
  -- CRITICAL: ORDER BY team_id ensures deterministic lock acquisition order,
  -- preventing deadlocks when multiple dividends are applied concurrently.
  FOR v_holding IN
    SELECT h.team_id, h.quantity
    FROM public.holdings h
    WHERE h.competition_run_id = v_dividend.competition_run_id
      AND h.stock_id = v_dividend.stock_id
      AND h.quantity > 0
    ORDER BY h.team_id
  LOOP
    -- Lock the team's initial_capital row to serialize financial operations
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
  IS 'Admin RPC: atomically apply a pending dividend. Uses ORDER BY team_id for deterministic lock acquisition to prevent deadlocks.';

-- -----------------------------------------------------------
-- Fix 3: Admin adjustment idempotency
-- -----------------------------------------------------------
-- add_admin_cash_adjustment_idempotency_key: add idempotency key column to track admin adjustments.

CREATE OR REPLACE FUNCTION public.adjust_team_cash(
  p_team_id uuid,
  p_competition_run_id uuid,
  p_amount_paise bigint,
  p_reason text,
  p_idempotency_key text DEFAULT NULL
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
  v_request_hash text;
  v_idem_record  record;
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

  -- 6. Handle idempotency if key provided
  IF p_idempotency_key IS NOT NULL THEN
    -- Compute request hash for deduplication
    v_request_hash := md5(
      p_team_id::text || p_competition_run_id::text || p_amount_paise::text || p_reason
    );

    -- Check for existing idempotency key (locks the row)
    SELECT * INTO v_idem_record
    FROM public.idempotency_keys
    WHERE team_id = p_team_id
      AND competition_run_id = p_competition_run_id
      AND operation_type = 'admin_cash_adjustment'
      AND idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF FOUND THEN
      -- Key exists: check request hash for replay detection
      IF v_idem_record.request_hash != v_request_hash THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED: idempotency_key % was used with different parameters', p_idempotency_key;
      END IF;

      -- Same request: return existing result if completed
      IF v_idem_record.result_status = 'completed' THEN
        -- Fetch the existing ledger entry
        SELECT id INTO v_ledger_id
        FROM public.cash_ledger
        WHERE team_id = p_team_id
          AND competition_run_id = p_competition_run_id
          AND entry_type = 'admin_adjustment'
          AND created_at >= v_idem_record.created_at
          AND created_at <= v_idem_record.completed_at
        LIMIT 1;

        RETURN jsonb_build_object(
          'ok',                    true,
          'idempotent',            true,
          'ledger_id',             v_ledger_id,
          'team_id',               p_team_id,
          'competition_run_id',    p_competition_run_id,
          'amount_paise',          p_amount_paise,
          'reason',                p_reason,
          'message',               'Request already processed'
        );
      END IF;

      -- Key exists but pending/failed: delete and reprocess
      DELETE FROM public.idempotency_keys WHERE id = v_idem_record.id;
    END IF;

    -- Insert new idempotency key
    INSERT INTO public.idempotency_keys (
      team_id, competition_run_id, operation_type, idempotency_key, request_hash, result_status, created_at
    )
    VALUES (
      p_team_id, p_competition_run_id, 'admin_cash_adjustment', p_idempotency_key, v_request_hash, 'pending', v_now
    );
  END IF;

  -- 7. Lock the team's initial_capital row to serialize financial operations
  SELECT * INTO v_lock_row
  FROM public.cash_ledger
  WHERE team_id = p_team_id
    AND competition_run_id = p_competition_run_id
    AND entry_type = 'initial_capital'
  FOR UPDATE;

  -- 8. Calculate current authoritative cash balance
  SELECT COALESCE(SUM(amount_paise), 0) INTO v_cash_balance
  FROM public.cash_ledger
  WHERE team_id = p_team_id
    AND competition_run_id = p_competition_run_id;

  -- 9. If amount is negative, ensure resulting balance remains >= 0
  v_new_balance := v_cash_balance + p_amount_paise;

  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_CASH: current balance % paise, adjustment % paise would result in % paise',
      v_cash_balance, p_amount_paise, v_new_balance;
  END IF;

  -- 10. Create ledger entry
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

  -- 11. Update idempotency key if present
  IF p_idempotency_key IS NOT NULL THEN
    UPDATE public.idempotency_keys
    SET result_status = 'completed',
        result_id = v_ledger_id,
        completed_at = now()
    WHERE team_id = p_team_id
      AND competition_run_id = p_competition_run_id
      AND operation_type = 'admin_cash_adjustment'
      AND idempotency_key = p_idempotency_key;
  END IF;

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

COMMENT ON FUNCTION public.adjust_team_cash(uuid, uuid, bigint, text, text)
  IS 'Admin RPC: adjust a team cash balance with optional idempotency key. Uses idempotency_keys table for replay protection.';

-- -----------------------------------------------------------
-- Fix 4: Document dividend_payments ↔ cash_ledger integrity
-- -----------------------------------------------------------
-- cash_ledger_entry_id is intentionally nullable because
-- dividend_payments is inserted BEFORE cash_ledger in apply_dividend().
-- The FK cannot be added at the DB level due to insertion order,
-- but the link is maintained by the RPC (updates payment after ledger insert).
-- This comment documents the invariant.

COMMENT ON COLUMN public.dividend_payments.cash_ledger_entry_id IS
  'FK to cash_ledger.id. Nullable because dividend_payments is inserted before cash_ledger in apply_dividend(). The link is always populated by the RPC — NULL values indicate a bug or incomplete migration.';

-- -----------------------------------------------------------
-- Fix 5: Add admin_adjustment to idempotency_keys RLS
-- -----------------------------------------------------------
-- Allow admin_cash_adjustment operations to be tracked.

-- No new RLS needed — existing idempotency_keys_select_admin policy
-- already covers admin access. The insert/update happens via SECURITY DEFINER.

-- ============================================================
-- Summary of fixes:
--
-- 1. dividends RLS: participants see ONLY applied dividends
--    - dividends_select_participant_applied (status = 'applied')
--    - dividends_select_admin (admin sees all)
--
-- 2. apply_dividend(): ORDER BY team_id for deterministic locking
--
-- 3. adjust_team_cash(): optional p_idempotency_key parameter
--    - Uses idempotency_keys table for replay protection
--    - Detects duplicate requests via request_hash
--
-- 4. dividend_payments.cash_ledger_entry_id: documented as intentionally nullable
--
-- ============================================================

-- ============================================================
-- Phase 4 Concurrency Tests
-- ============================================================
-- These tests verify the concurrency safety of execute_trade().
-- Note: Actual concurrent testing requires multiple authenticated
-- sessions (application UI or test suite). These tests verify
-- the locking mechanism and document expected behavior.
-- ============================================================

-- -----------------------------------------------------------
-- Test 1: Verify locking mechanism exists
-- -----------------------------------------------------------
-- Check that execute_trade() uses SELECT FOR UPDATE on initial_capital

SELECT 
  CASE 
    WHEN prosrc LIKE '%FOR UPDATE%' THEN 'PASS: execute_trade() uses SELECT FOR UPDATE'
    ELSE 'FAIL: execute_trade() does not use SELECT FOR UPDATE'
  END as test_1_result
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname = 'execute_trade';

-- -----------------------------------------------------------
-- Test 2: Verify initial_capital row exists for participating teams
-- -----------------------------------------------------------
-- This is the row that gets locked to serialize concurrent trades

SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM public.cash_ledger 
      WHERE entry_type = 'initial_capital'
    ) THEN 'PASS: initial_capital entries exist (locking rows available)'
    ELSE 'INFO: No initial_capital entries yet (create teams before testing)'
  END as test_2_result;

-- -----------------------------------------------------------
-- Test 3: Verify idempotency constraint
-- -----------------------------------------------------------
-- Same key + same parameters = same result
-- Same key + different parameters = rejected

SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'uq_idempotency_keys_team_run_op'
    ) THEN 'PASS: Idempotency unique constraint exists'
    ELSE 'FAIL: Idempotency unique constraint missing'
  END as test_3_result;

-- -----------------------------------------------------------
-- Test 4: Verify holdings cannot go negative
-- -----------------------------------------------------------

SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.check_constraints 
      WHERE constraint_name = 'chk_holdings_quantity_non_negative'
    ) THEN 'PASS: Holdings quantity non-negative constraint exists'
    ELSE 'FAIL: Holdings quantity non-negative constraint missing'
  END as test_4_result;

-- -----------------------------------------------------------
-- Test 5: Verify trades have correct total_value
-- -----------------------------------------------------------

SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.check_constraints 
      WHERE constraint_name = 'chk_trades_total_value'
    ) THEN 'PASS: Trade total_value constraint exists'
    ELSE 'FAIL: Trade total_value constraint missing'
  END as test_5_result;

-- -----------------------------------------------------------
-- Test 6: Verify cash ledger is append-only (no UPDATE/DELETE policies)
-- -----------------------------------------------------------

SELECT 
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'cash_ledger' 
        AND cmd IN ('UPDATE', 'DELETE')
    ) THEN 'PASS: Cash ledger has no UPDATE/DELETE policies'
    ELSE 'FAIL: Cash ledger has UPDATE/DELETE policies'
  END as test_6_result;

-- -----------------------------------------------------------
-- Test 7: Verify trades are immutable (no UPDATE/DELETE policies)
-- -----------------------------------------------------------

SELECT 
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'trades' 
        AND cmd IN ('UPDATE', 'DELETE')
    ) THEN 'PASS: Trades have no UPDATE/DELETE policies'
    ELSE 'FAIL: Trades have UPDATE/DELETE policies'
  END as test_7_result;

-- -----------------------------------------------------------
-- Test 8: Verify holdings have no participant write policies
-- -----------------------------------------------------------

SELECT 
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'holdings' 
        AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
        AND qual NOT LIKE '%admin%'
    ) THEN 'PASS: Holdings have no participant write policies'
    ELSE 'FAIL: Holdings have participant write policies'
  END as test_8_result;

-- ============================================================
-- Concurrency Test Documentation
-- ============================================================

/*
CONCURRENT BUY TEST SCENARIO:

Setup:
- Team A has cash balance = ₹10,000,000 (10000000 paise)
- Stock X price = ₹1000 per share (100000 paise)
- BUY 8 shares = ₹8000 per trade (800000 paise)

Request A: BUY 8 shares of Stock X (cost: ₹8000)
Request B: BUY 8 shares of Stock X (cost: ₹8000)

Expected with locking:
1. Request A acquires lock on initial_capital row
2. Request A reads cash balance = 10000000
3. Request A validates 800000 <= 10000000 (PASS)
4. Request A updates holdings, creates trade, creates ledger entry
5. Request A commits, releases lock
6. Request B acquires lock on initial_capital row
7. Request B reads cash balance = 9200000 (after Request A's debit)
8. Request B validates 800000 <= 9200000 (PASS)
9. Request B updates holdings, creates trade, creates ledger entry
10. Request B commits, releases lock

Final state:
- Cash balance = 8400000 (correct)
- Two trades executed
- No double-spending

Without locking (BROKEN):
1. Request A reads cash balance = 10000000
2. Request B reads cash balance = 10000000
3. Request A validates 800000 <= 10000000 (PASS)
4. Request B validates 800000 <= 10000000 (PASS)
5. Request A commits (cash = 9200000)
6. Request B commits (cash = 8400000)
7. Both succeed, but this is actually correct in this case

BROKEN scenario with insufficient cash:
- Starting cash = ₹1000
- BUY 800 (cost: ₹800)
- BUY 800 (cost: ₹800)
- Both read cash = 1000, both validate 800 <= 1000
- Both commit, final cash = -600 (INVALID!)

With locking:
- Request A acquires lock, reads cash = 1000, validates, commits (cash = 200)
- Request B acquires lock, reads cash = 200, validates 800 <= 200 (FAILS)
- Only Request A succeeds
*/

-- ============================================================

/*
CONCURRENT SELL TEST SCENARIO:

Setup:
- Team A holds 10 shares of Stock X
- SELL 8 shares
- SELL 8 shares

Expected with locking:
1. Request A acquires lock on initial_capital row
2. Request A reads holdings.quantity = 10
3. Request A validates 8 <= 10 (PASS)
4. Request A updates holdings (quantity = 2)
5. Request A commits, releases lock
6. Request B acquires lock on initial_capital row
7. Request B reads holdings.quantity = 2
8. Request B validates 8 <= 2 (FAILS)
9. Only Request A succeeds

Without locking (BROKEN):
1. Request A reads holdings.quantity = 10
2. Request B reads holdings.quantity = 10
3. Request A validates 8 <= 10 (PASS)
4. Request B validates 8 <= 10 (PASS)
5. Request A updates holdings (quantity = 2)
6. Request B updates holdings (quantity = -6) (INVALID!)
*/

-- ============================================================

/*
BUY/SELL CONCURRENCY TEST SCENARIO:

Setup:
- Team A has cash = ₹10,000,000
- Team A holds 10 shares of Stock X (price = ₹1000)
- BUY 8 shares (cost: ₹8000)
- SELL 8 shares (credit: ₹8000)

Expected with locking:
1. BUY request acquires lock, validates, executes, commits
2. SELL request acquires lock, validates, executes, commits
OR
1. SELL request acquires lock, validates, executes, commits
2. BUY request acquires lock, validates, executes, commits

Final state (either order):
- Cash balance = ₹10,000,000 (no net change)
- Holdings = 10 shares (no net change)
- Two trades executed

Without locking (BROKEN):
- Both could execute concurrently
- Cash and holdings could become inconsistent
*/

-- ============================================================

/*
IDEMPOTENCY TEST SCENARIO:

Setup:
- Trade with idempotency_key = 'trade-123'

Test 1: Same key + same parameters
1. Request A: execute_trade(..., idempotency_key = 'trade-123')
2. Request A succeeds, trade_id = 'uuid-1'
3. Request B: execute_trade(..., idempotency_key = 'trade-123')
4. Request B returns original result (trade_id = 'uuid-1')
5. No duplicate trade executed

Test 2: Same key + different parameters
1. Request A: execute_trade(..., idempotency_key = 'trade-123', quantity = 8)
2. Request A succeeds
3. Request B: execute_trade(..., idempotency_key = 'trade-123', quantity = 10)
4. Request B fails with IDEMPOTENCY_CONFLICT

Test 3: Failed transaction + retry
1. Request A: execute_trade(..., idempotency_key = 'trade-123')
2. Request A fails (e.g., insufficient cash)
3. Idempotency record status = 'failed'
4. Request B: execute_trade(..., idempotency_key = 'trade-123')
5. Request B retries (idempotency record deleted)
6. If now succeeds, trade executes
*/

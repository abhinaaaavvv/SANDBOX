-- ============================================================
-- Phase 2 Review: Verification Test Script
-- ============================================================
-- Run this after applying the fix migration to verify:
-- 1. Direct UPDATE on rounds is blocked (RLS prevents it)
-- 2. Direct UPDATE on competitions is blocked (RLS prevents it)
-- 3. Direct UPDATE on competition_runs is blocked (RLS prevents it)
-- 4. RPCs still work correctly
-- 5. All invariants are enforced
-- ============================================================

-- Test 1: Verify policies after fix
-- Expected: Only SELECT + INSERT policies remain
SELECT 
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('competitions', 'competition_runs', 'rounds')
ORDER BY tablename, cmd, policyname;

-- Test 2: Verify RPCs still exist and are SECURITY DEFINER
SELECT 
  p.proname as function_name,
  CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END as security_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN ('assert_admin', 'start_round', 'end_round', 'open_market', 'close_market', 'pause_trading', 'resume_trading')
ORDER BY p.proname;

-- Test 3: Verify that SELECT still works for authenticated users
-- (Run as authenticated user)
SELECT count(*) FROM public.competitions;
SELECT count(*) FROM public.competition_runs;
SELECT count(*) FROM public.rounds;

-- ============================================================
-- MANUAL VERIFICATION STEPS:
--
-- 1. Create test data as admin:
--    INSERT INTO competitions (name, status) VALUES ('Test', 'draft');
--    INSERT INTO competition_runs (competition_id, name, status) 
--      SELECT id, 'Run 1', 'draft' FROM competitions WHERE name = 'Test';
--    INSERT INTO rounds (competition_run_id, round_number, round_type)
--      SELECT id, 1, 'portfolio' FROM competition_runs WHERE name = 'Run 1';
--
-- 2. Try direct UPDATE as admin (should FAIL with RLS error):
--    UPDATE rounds SET status = 'active' WHERE round_number = 1;
--    Expected: new row for violating row-level security policy
--
-- 3. Try RPC as admin (should SUCCEED):
--    SELECT start_round(id) FROM rounds WHERE round_number = 1;
--    Expected: {"ok": true, "round_id": "...", ...}
--
-- 4. Try to start round 2 while round 1 is active (should FAIL):
--    SELECT start_round(id) FROM rounds WHERE round_number = 2;
--    Expected: ROUND_CONFLICT error
--
-- 5. End round 1, then start round 2 (should SUCCEED):
--    SELECT end_round(id) FROM rounds WHERE round_number = 1;
--    SELECT start_round(id) FROM rounds WHERE round_number = 2;
--
-- 6. Try to start round 2 again (should FAIL - already active):
--    SELECT start_round(id) FROM rounds WHERE round_number = 2;
--    Expected: INVALID_STATE_TRANSITION error
-- ============================================================

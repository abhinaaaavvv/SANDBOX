-- ============================================================
-- Phase 2 Review: State-Machine Invariant Tests
-- ============================================================
-- Run this script against the database to verify that:
-- 1. Direct UPDATE on rounds is blocked for non-admins
-- 2. Admin direct UPDATE bypasses RPC validation (this is the issue)
-- 3. RPCs enforce all invariants correctly
-- ============================================================

-- Setup: Create test data
-- NOTE: Run as authenticated admin user, not as superuser

-- Test 1: Verify RLS policies exist
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd,
  CASE WHEN qual IS NOT NULL THEN 'YES' ELSE 'NO' END as has_using,
  CASE WHEN with_check IS NOT NULL THEN 'YES' ELSE 'NO' END as has_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('competitions', 'competition_runs', 'rounds')
ORDER BY tablename, cmd, policyname;

-- Test 2: Verify function security
SELECT 
  p.proname as function_name,
  CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END as security_type,
  pg_get_userbyid(p.proowner) as owner
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN ('assert_admin', 'start_round', 'end_round', 'open_market', 'close_market', 'pause_trading', 'resume_trading');

-- Test 3: Check if anon/authenticated can execute these functions
-- (They should be able to, but assert_admin should reject non-admins)
SELECT 
  p.proname as function_name,
  r.rolname as role_name,
  has_function_privilege(r.oid, p.oid, 'EXECUTE') as can_execute
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
CROSS JOIN pg_roles r
WHERE n.nspname = 'public'
  AND p.proname IN ('assert_admin', 'start_round', 'end_round', 'open_market', 'close_market', 'pause_trading', 'resume_trading')
  AND r.rolname IN ('anon', 'authenticated')
ORDER BY p.proname, r.rolname;

-- ============================================================
-- ISSUE VERIFICATION:
-- 
-- The following tests demonstrate the vulnerability:
-- An admin can bypass RPC validation by directly updating rounds.
-- 
-- To test this, you would need to:
-- 1. Create a competition with a run and 3 rounds
-- 2. As an admin, directly UPDATE rounds SET status = 'active'
--    WITHOUT checking exclusivity or ordering
-- 3. Verify that two rounds can be active simultaneously
--    (violating the invariant)
-- ============================================================

-- Test 4: Demonstrate the issue (run as admin user via PostgREST)
-- This should FAIL if the RPC is used correctly:
-- SELECT start_round(round_id) FROM rounds WHERE round_number = 2;
-- (should fail if round 1 is not completed)

-- But this should SUCCEED (the vulnerability):
-- UPDATE rounds SET status = 'active' WHERE round_number = 2;
-- (bypasses all RPC validation)

-- Test 5: Verify that SECURITY DEFINER functions bypass RLS
-- When a SECURITY DEFINER function runs, it runs as the owner (typically postgres)
-- The owner has bypassrls privilege, so RLS is bypassed inside the function
-- This means the RPC can UPDATE rounds even without an UPDATE policy

-- CONCLUSION:
-- The current design allows admins to bypass RPC validation via direct UPDATE.
-- The fix is to remove UPDATE/INSERT/DELETE policies on rounds,
-- forcing all modifications through the RPCs.

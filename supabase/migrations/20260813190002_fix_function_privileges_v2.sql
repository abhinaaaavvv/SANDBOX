-- ============================================================
-- Phase 8 Fix: Revoke dangerous EXECUTE privileges
-- ============================================================
-- Problem: All SECURITY DEFINER functions had EXECUTE granted to
-- PUBLIC and anon (Supabase grants anon directly). This means
-- anonymous users could call admin-only functions like start_round(),
-- execute_trade(), etc. While internal auth checks (assert_admin,
-- auth.uid()) would reject unauthorized calls, this violates
-- defense-in-depth.
--
-- Solution: Explicitly REVOKE EXECUTE from PUBLIC and anon on all
-- functions that require authentication or admin role. Then GRANT
-- EXECUTE only to the intended roles (authenticated, service_role).
--
-- Note: We do NOT revoke from postgres (superuser) or
-- service_role (bypasses RLS). We keep authenticated for
-- client-callable RPCs.
-- ============================================================

-- -----------------------------------------------------------
-- 1. Admin-only RPCs: Revoke from PUBLIC+anon, grant to authenticated+service_role
-- -----------------------------------------------------------
-- These should ONLY be callable by admin users via service_role
-- or through the authenticated role with internal assert_admin() check.

REVOKE EXECUTE ON FUNCTION public.assert_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.start_round(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.end_round(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.open_market(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.close_market(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pause_trading(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.resume_trading(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.setup_initial_prices(uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.prepare_price_batch(uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.apply_price_changes(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_price_batch(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.initialize_team_cash(uuid, uuid, bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_dividend(uuid, uuid, bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.apply_dividend(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.adjust_team_cash(uuid, uuid, bigint, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.adjust_team_cash(uuid, uuid, bigint, text, text) FROM PUBLIC, anon;

-- Grant to authenticated (for client-side admin calls with assert_admin check)
GRANT EXECUTE ON FUNCTION public.assert_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_round(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_round(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_market(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_market(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pause_trading(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resume_trading(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.setup_initial_prices(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_price_batch(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_price_changes(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_price_batch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.initialize_team_cash(uuid, uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_dividend(uuid, uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_dividend(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_team_cash(uuid, uuid, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_team_cash(uuid, uuid, bigint, text, text) TO authenticated;

-- Grant to service_role (for server-side/admin API calls)
GRANT EXECUTE ON FUNCTION public.assert_admin() TO service_role;
GRANT EXECUTE ON FUNCTION public.start_round(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.end_round(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.open_market(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.close_market(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pause_trading(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.resume_trading(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.setup_initial_prices(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.prepare_price_batch(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_price_changes(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_price_batch(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.initialize_team_cash(uuid, uuid, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_dividend(uuid, uuid, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_dividend(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.adjust_team_cash(uuid, uuid, bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.adjust_team_cash(uuid, uuid, bigint, text, text) TO service_role;

-- -----------------------------------------------------------
-- 2. Client-callable RPCs: Revoke from PUBLIC+anon, grant to authenticated+service_role
-- -----------------------------------------------------------
-- These require authentication (auth.uid() check) but are not admin-only.

REVOKE EXECUTE ON FUNCTION public.execute_trade(uuid, uuid, text, bigint, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_leaderboard(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.resolve_user_team(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_team_holdings(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_team_portfolio(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.execute_trade(uuid, uuid, text, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_user_team(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_holdings(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_portfolio(uuid, uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.execute_trade(uuid, uuid, text, bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_user_team(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_team_holdings(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_team_portfolio(uuid, uuid) TO service_role;

-- -----------------------------------------------------------
-- 3. Internal/helper functions: Revoke from PUBLIC+anon
-- -----------------------------------------------------------
-- These are called by other functions, not by clients directly.
-- Cleanup should only be called by cron/service_role.

REVOKE EXECUTE ON FUNCTION public.notify_realtime(text, text, uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public._get_run_id_from_round(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_notifications(interval) FROM PUBLIC, anon;

-- Grant to authenticated (for internal use by other RPCs)
GRANT EXECUTE ON FUNCTION public.notify_realtime(text, text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public._get_run_id_from_round(uuid) TO authenticated;
-- cleanup_old_notifications: only service_role (cron), NOT authenticated
GRANT EXECUTE ON FUNCTION public.cleanup_old_notifications(interval) TO service_role;

-- -----------------------------------------------------------
-- 4. Trigger/utility functions: Keep accessible (needed by triggers)
-- -----------------------------------------------------------
-- handle_new_user is a trigger function, must remain accessible
-- handle_updated_at is a trigger function, must remain accessible
-- rls_auto_enable is a utility, keep accessible

-- These remain with PUBLIC access for trigger functionality

-- ============================================================
-- Summary of privilege changes:
--
-- REVOKED from PUBLIC+anon:
--   Admin RPCs: assert_admin, start_round, end_round, open_market,
--   close_market, pause_trading, resume_trading, setup_initial_prices,
--   prepare_price_batch, apply_price_changes, cancel_price_batch,
--   initialize_team_cash, create_dividend, apply_dividend, adjust_team_cash
--
--   Client RPCs: execute_trade, get_leaderboard, resolve_user_team,
--   get_team_holdings, get_team_portfolio
--
--   Internal: notify_realtime, _get_run_id_from_round, cleanup_old_notifications
--
-- GRANTED to: authenticated + service_role (or service_role only for cleanup)
--
-- KEPT accessible (triggers): handle_new_user, handle_updated_at, rls_auto_enable
-- ============================================================

-- Harden is_admin() and user_team_ids() to operate only on auth.uid()
--
-- Problem: Both SECURITY DEFINER helpers accepted an arbitrary uuid parameter.
-- An authenticated user could call is_admin(<another-uuid>) or
-- user_team_ids(<another-uuid>) directly to probe another account's role
-- or team membership.
--
-- Fix: Replace with parameterless versions that internally call auth.uid().
-- All RLS policies that previously passed auth.uid() as an argument are
-- rewritten to call the parameterless versions. Old parameterized overloads
-- are dropped.

-- ============================================================
-- 1. Create parameterless is_admin() — used by policies
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
$$;

-- ============================================================
-- 2. Create parameterless user_team_ids() — used by policies
-- ============================================================
CREATE OR REPLACE FUNCTION public.user_team_ids()
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(tm.team_id), ARRAY[]::uuid[])
  FROM public.team_members tm
  WHERE tm.user_id = auth.uid();
$$;

-- ============================================================
-- 3. Rewrite RLS policies to use parameterless helpers
-- ============================================================
-- profiles_select_admin (from 20260814200000_fix_profiles_rls_recursion.sql)
DROP POLICY IF EXISTS profiles_select_admin ON public.profiles;
CREATE POLICY profiles_select_admin ON public.profiles
  FOR SELECT
  USING (public.is_admin());

-- ============================================================
-- 4. Rewrite remaining RLS policies that called user_team_ids(auth.uid())
-- ============================================================

-- team_members_select_teammates (from 20260814230000)
DROP POLICY IF EXISTS team_members_select_teammates ON public.team_members;
CREATE POLICY team_members_select_teammates ON public.team_members
  FOR SELECT
  USING (team_id = ANY (public.user_team_ids()));

-- holdings_select_own_team (from 20260814230000)
DROP POLICY IF EXISTS holdings_select_own_team ON public.holdings;
CREATE POLICY holdings_select_own_team ON public.holdings
  FOR SELECT
  USING (team_id = ANY (public.user_team_ids()));

-- cash_ledger_select_own_team (from 20260814230000)
DROP POLICY IF EXISTS cash_ledger_select_own_team ON public.cash_ledger;
CREATE POLICY cash_ledger_select_own_team ON public.cash_ledger
  FOR SELECT
  USING (team_id = ANY (public.user_team_ids()));

-- trades_select_own_team (from 20260814230000)
DROP POLICY IF EXISTS trades_select_own_team ON public.trades;
CREATE POLICY trades_select_own_team ON public.trades
  FOR SELECT
  USING (team_id = ANY (public.user_team_ids()));

-- dividend_payments_select_own_team (from 20260814230000)
DROP POLICY IF EXISTS dividend_payments_select_own_team ON public.dividend_payments;
CREATE POLICY dividend_payments_select_own_team ON public.dividend_payments
  FOR SELECT
  USING (team_id = ANY (public.user_team_ids()));

-- realtime_notifications_select (from 20260814230000) — uses both helpers
DROP POLICY IF EXISTS realtime_notifications_select ON public.realtime_notifications;
CREATE POLICY realtime_notifications_select ON public.realtime_notifications
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      (channel LIKE 'team:%' AND team_id IS NOT NULL AND team_id = ANY (public.user_team_ids()))
      OR
      (channel LIKE 'run:%' AND (
        public.is_admin()
        OR EXISTS (
          SELECT 1
          FROM public.cash_ledger cl
          WHERE cl.team_id = ANY (public.user_team_ids())
            AND cl.competition_run_id = (regexp_replace(channel, '^run:', ''))::uuid
            AND cl.entry_type = 'initial_capital'
        )
      ))
    )
  );

-- profiles_select_admin (from 20260814200000_fix_profiles_rls_recursion.sql)
DROP POLICY IF EXISTS profiles_select_admin ON public.profiles;
CREATE POLICY profiles_select_admin ON public.profiles
  FOR SELECT
  USING (public.is_admin());

-- ============================================================
-- 4. Rewrite RLS policies that called user_team_ids(auth.uid())
-- ============================================================

-- team_members_select_teammates (from 20260814230000)
DROP POLICY IF EXISTS team_members_select_teammates ON public.team_members;
CREATE POLICY team_members_select_teammates ON public.team_members
  FOR SELECT
  USING (team_id = ANY (public.user_team_ids()));

-- holdings_select_own_team (from 20260814230000)
DROP POLICY IF EXISTS holdings_select_own_team ON public.holdings;
CREATE POLICY holdings_select_own_team ON public.holdings
  FOR SELECT
  USING (team_id = ANY (public.user_team_ids()));

-- cash_ledger_select_own_team (from 20260814230000)
DROP POLICY IF EXISTS cash_ledger_select_own_team ON public.cash_ledger;
CREATE POLICY cash_ledger_select_own_team ON public.cash_ledger
  FOR SELECT
  USING (team_id = ANY (public.user_team_ids()));

-- trades_select_own_team (from 20260814230000)
DROP POLICY IF EXISTS trades_select_own_team ON public.trades;
CREATE POLICY trades_select_own_team ON public.trades
  FOR SELECT
  USING (team_id = ANY (public.user_team_ids()));

-- dividend_payments_select_own_team (from 20260814230000)
DROP POLICY IF EXISTS dividend_payments_select_own_team ON public.dividend_payments;
CREATE POLICY dividend_payments_select_own_team ON public.dividend_payments
  FOR SELECT
  USING (team_id = ANY (public.user_team_ids()));

-- realtime_notifications_select (from 20260814230000) — uses both helpers
DROP POLICY IF EXISTS realtime_notifications_select ON public.realtime_notifications;
CREATE POLICY realtime_notifications_select ON public.realtime_notifications
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      (channel LIKE 'team:%' AND team_id IS NOT NULL AND team_id = ANY (public.user_team_ids()))
      OR
      (channel LIKE 'run:%' AND (
        public.is_admin()
        OR EXISTS (
          SELECT 1
          FROM public.cash_ledger cl
          WHERE cl.team_id = ANY (public.user_team_ids())
            AND cl.competition_run_id = (regexp_replace(channel, '^run:', ''))::uuid
            AND cl.entry_type = 'initial_capital'
        )
      ))
    )
  );

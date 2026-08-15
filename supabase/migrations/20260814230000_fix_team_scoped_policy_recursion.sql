-- Fix infinite recursion (42P17) in team-scoped RLS policies
--
-- Problem: policies that resolve a user's teams via
--   team_id IN (SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid())
-- recurse. When the inner SELECT on team_members is evaluated under RLS, the
-- team_members_select_teammates policy fires again (its qual contains the same
-- subquery), so Postgres aborts with "infinite recursion detected in policy
-- for relation \"team_members\"".
--
-- As a result no authenticated participant can read holdings, cash_ledger,
-- trades, dividend_payments, realtime_notifications or call
-- get_team_portfolio()/get_team_holdings() — a hard blocker for Phase 9.5.
--
-- Fix: mirror the is_admin() pattern from 20260814200000. A SECURITY DEFINER
-- helper resolves the user's team ids once, bypassing RLS on its own table
-- read, and every recursive policy delegates to it. Access semantics are
-- identical: a user can only ever see rows for teams they belong to.

-- 1. Helper function — runs as owner, bypasses RLS on team_members
CREATE OR REPLACE FUNCTION public.user_team_ids(uid uuid)
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(tm.team_id), ARRAY[]::uuid[])
  FROM public.team_members tm
  WHERE tm.user_id = uid;
$$;

-- 2. Rewrite team_members_select_teammates (non-recursive)
DROP POLICY IF EXISTS team_members_select_teammates ON public.team_members;
CREATE POLICY team_members_select_teammates ON public.team_members
  FOR SELECT
  USING (team_id = ANY (public.user_team_ids(auth.uid())));

-- 3. Rewrite holdings_select_own_team
DROP POLICY IF EXISTS holdings_select_own_team ON public.holdings;
CREATE POLICY holdings_select_own_team ON public.holdings
  FOR SELECT
  USING (team_id = ANY (public.user_team_ids(auth.uid())));

-- 4. Rewrite cash_ledger_select_own_team
DROP POLICY IF EXISTS cash_ledger_select_own_team ON public.cash_ledger;
CREATE POLICY cash_ledger_select_own_team ON public.cash_ledger
  FOR SELECT
  USING (team_id = ANY (public.user_team_ids(auth.uid())));

-- 5. Rewrite trades_select_own_team
DROP POLICY IF EXISTS trades_select_own_team ON public.trades;
CREATE POLICY trades_select_own_team ON public.trades
  FOR SELECT
  USING (team_id = ANY (public.user_team_ids(auth.uid())));

-- 6. Rewrite dividend_payments_select_own_team
DROP POLICY IF EXISTS dividend_payments_select_own_team ON public.dividend_payments;
CREATE POLICY dividend_payments_select_own_team ON public.dividend_payments
  FOR SELECT
  USING (team_id = ANY (public.user_team_ids(auth.uid())));

-- 7. Rewrite realtime_notifications_select
--   team: channel is a team the user belongs to
--   run:  user is an admin, OR the user's team has an initial_capital entry for the run
DROP POLICY IF EXISTS realtime_notifications_select ON public.realtime_notifications;
CREATE POLICY realtime_notifications_select ON public.realtime_notifications
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      (channel LIKE 'team:%' AND team_id IS NOT NULL AND team_id = ANY (public.user_team_ids(auth.uid())))
      OR
      (channel LIKE 'run:%' AND (
        public.is_admin(auth.uid())
        OR EXISTS (
          SELECT 1
          FROM public.cash_ledger cl
          WHERE cl.team_id = ANY (public.user_team_ids(auth.uid()))
            AND cl.competition_run_id = (regexp_replace(channel, '^run:', ''))::uuid
            AND cl.entry_type = 'initial_capital'
        )
      ))
    )
  );

-- Fix RLS: admins need to see ALL teams' financial data.
-- Current policies only allow (team_id = ANY(user_team_ids())) which = own team.
-- Add admin bypass policies for SELECT on cash_ledger, holdings, trades.

-- ============================================================================
-- cash_ledger: add admin SELECT policy
-- ============================================================================
CREATE POLICY cash_ledger_select_admin ON public.cash_ledger
  FOR SELECT
  TO public
  USING (is_admin());

-- ============================================================================
-- holdings: add admin SELECT policy
-- ============================================================================
CREATE POLICY holdings_select_admin ON public.holdings
  FOR SELECT
  TO public
  USING (is_admin());

-- ============================================================================
-- trades: add admin SELECT policy
-- ============================================================================
CREATE POLICY trades_select_admin ON public.trades
  FOR SELECT
  TO public
  USING (is_admin());

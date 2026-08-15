-- ============================================================
-- Phase 9.8: Fix Realtime RLS for Admin Channels
-- ============================================================
-- Fixes:
-- 1. Add explicit admin:% channel authorization
-- 2. Allow admins to access team:% channels
-- 3. Ensure fail-closed behavior for malformed channel values
-- ============================================================

-- Drop the existing policy
DROP POLICY IF EXISTS "realtime_notifications_select" ON public.realtime_notifications;

-- Create the updated policy with all three channel types
CREATE POLICY "realtime_notifications_select"
  ON public.realtime_notifications
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      -- ============================================================
      -- Admin-scoped events: only admins can read
      -- ============================================================
      (
        channel LIKE 'admin:%'
        AND EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() AND role = 'admin'
        )
      )
      OR
      -- ============================================================
      -- Team-scoped events: team members OR admins
      -- ============================================================
      (
        channel LIKE 'team:%'
        AND team_id IS NOT NULL
        AND (
          -- Team members can access their own team's events
          EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.user_id = auth.uid()
              AND tm.team_id = realtime_notifications.team_id
          )
          OR
          -- Admins can access any team's events
          EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
          )
        )
      )
      OR
      -- ============================================================
      -- Run-scoped events: participants in the run OR admins
      -- ============================================================
      (
        channel LIKE 'run:%'
        AND (
          -- Admin can see all run-scoped events
          EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
          )
          OR
          -- Participant can see run-scoped events for runs they participate in
          -- Participation = team has initial capital in cash_ledger for this run
          EXISTS (
            SELECT 1 FROM public.team_members tm
            INNER JOIN public.cash_ledger cl
              ON cl.team_id = tm.team_id
              AND cl.competition_run_id = (
                -- Extract run_id from channel: 'run:<uuid>'
                -- Fail closed: invalid UUID will cause exception, preventing access
                (regexp_replace(channel, '^run:', ''))::uuid
              )
              AND cl.entry_type = 'initial_capital'
            WHERE tm.user_id = auth.uid()
          )
        )
      )
    )
  );

-- ============================================================
-- Summary of authorization model:
--
-- admin:<run_id>
--   → only admins (profiles.role = 'admin')
--
-- team:<team_id>
--   → team members (via team_members table)
--   → admins (profiles.role = 'admin')
--
-- run:<run_id>
--   → participants who have a team with initial_capital in this run
--   → admins (profiles.role = 'admin')
--
-- Fail-closed behavior:
--   - Invalid UUID in channel → exception → access denied
--   - Missing auth.uid() → access denied
--   - Unknown channel prefix → no matching branch → access denied
-- ============================================================

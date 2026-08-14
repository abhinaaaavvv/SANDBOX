-- ============================================================
-- Phase 7: Realtime State Distribution & Client Reconciliation
-- ============================================================
-- Strategy: Postgres Changes on a notification table
--
-- Architecture:
--   PostgreSQL (authoritative state)
--       ↓ committed transaction
--   INSERT INTO realtime_notifications
--       ↓ WAL replication
--   Supabase Realtime (postgres_changes)
--       ↓ client receives INSERT
--   Client refetches authoritative state via RPC
--       ↓
--   UI updates
--
-- Key principles:
--   1. Realtime payloads are NEVER authoritative financial state
--   2. Notifications are signals to refetch, not data to display
--   3. Pending admin state (price_change_batches, pending_price_changes)
--      must NEVER appear in notifications
--   4. Team-scoped events are only visible to that team
--   5. Run-scoped events are visible to all participants in the run
-- ============================================================

-- -----------------------------------------------------------
-- 1. realtime_notifications table
-- -----------------------------------------------------------
-- Lightweight notification table. Each row is a signal that
-- committed state has changed. The payload contains identifiers,
-- NOT authoritative financial data.

CREATE TABLE public.realtime_notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel       text NOT NULL,        -- 'run:<run_id>' or 'team:<team_id>'
  event_type    text NOT NULL,        -- e.g. 'ROUND_STATE_CHANGED', 'PRICES_CHANGED'
  team_id       uuid,                 -- NULL for run-scoped events
  payload       jsonb NOT NULL DEFAULT '{}',  -- identifiers only, no financial truth
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.realtime_notifications IS
  'Lightweight notification table for Realtime distribution. Each row signals that committed state has changed. Payloads contain identifiers only — never authoritative financial data.';

-- Index for client subscriptions: filter by channel + ordering by recency
CREATE INDEX idx_realtime_notifications_channel_created
  ON public.realtime_notifications (channel, created_at DESC);

-- Index for cleanup: delete old rows
CREATE INDEX idx_realtime_notifications_created_at
  ON public.realtime_notifications (created_at);

-- -----------------------------------------------------------
-- 2. RLS policies
-- -----------------------------------------------------------
-- Run-scoped events (channel LIKE 'run:%'): visible to all authenticated users
-- Team-scoped events (channel LIKE 'team:%'): visible only to team members

ALTER TABLE public.realtime_notifications ENABLE ROW LEVEL SECURITY;

-- SELECT: run-scoped visible to all authenticated; team-scoped visible to team members
CREATE POLICY "realtime_notifications_select"
  ON public.realtime_notifications
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      -- Run-scoped events: visible to all authenticated users
      channel LIKE 'run:%'
      OR
      -- Team-scoped events: visible only to team members
      (
        channel LIKE 'team:%'
        AND team_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.user_id = auth.uid()
            AND tm.team_id = realtime_notifications.team_id
        )
      )
    )
  );

-- INSERT: only SECURITY DEFINER functions (RPCs) can insert
-- No INSERT policy for anon/authenticated — they cannot write directly.
-- INSERT happens via SECURITY DEFINER notify_realtime() function.

-- DELETE: admin cleanup (optional, for purging old notifications)
CREATE POLICY "realtime_notifications_delete_admin"
  ON public.realtime_notifications
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- -----------------------------------------------------------
-- 3. Helper function: notify_realtime()
-- -----------------------------------------------------------
-- Called by RPCs to insert a notification atomically.
-- SECURITY DEFINER to bypass RLS on INSERT.
-- The notification is committed only if the RPC transaction commits.

CREATE OR REPLACE FUNCTION public.notify_realtime(
  p_channel text,
  p_event_type text,
  p_team_id uuid DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.realtime_notifications (channel, event_type, team_id, payload)
  VALUES (p_channel, p_event_type, p_team_id, p_payload);
END;
$$;

COMMENT ON FUNCTION public.notify_realtime(text, text, uuid, jsonb) IS
  'Inserts a realtime notification. Called by RPCs after committing state changes. SECURITY DEFINER bypasses RLS on INSERT.';

-- -----------------------------------------------------------
-- 4. Cleanup function: cleanup_old_notifications()
-- -----------------------------------------------------------
-- Deletes notifications older than a specified interval.
-- Can be called by admin or scheduled via pg_cron.

CREATE OR REPLACE FUNCTION public.cleanup_old_notifications(
  p_max_age interval DEFAULT interval '1 hour'
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted bigint;
BEGIN
  DELETE FROM public.realtime_notifications
  WHERE created_at < now() - p_max_age;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.cleanup_old_notifications(interval) IS
  'Deletes realtime notifications older than max_age. Default 1 hour. Can be scheduled via pg_cron or called by admin.';

-- -----------------------------------------------------------
-- 5. Add tables to supabase_realtime publication
-- -----------------------------------------------------------
-- Required for Postgres Changes to work on these tables.
-- Only the notification table needs to be in the publication
-- for client subscriptions.

ALTER PUBLICATION supabase_realtime ADD TABLE public.realtime_notifications;

-- Also add read-only tables that clients may want to subscribe to
-- for granular updates (optional, for future use):
ALTER PUBLICATION supabase_realtime ADD TABLE public.rounds;
ALTER PUBLICATION supabase_realtime ADD TABLE public.market_quotes;

-- -----------------------------------------------------------
-- 6. Grant usage
-- -----------------------------------------------------------
-- authenticated can read (via RLS) and call cleanup
GRANT SELECT ON public.realtime_notifications TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_notifications(interval) TO authenticated;

-- -----------------------------------------------------------
-- Summary:
--
-- Table: realtime_notifications
--   - channel: 'run:<run_id>' or 'team:<team_id>'
--   - event_type: domain event type
--   - team_id: NULL for run-scoped, UUID for team-scoped
--   - payload: identifiers only, no financial truth
--   - RLS: run-scoped visible to all auth; team-scoped to team members
--
-- Function: notify_realtime(channel, event_type, team_id, payload)
--   - SECURITY DEFINER, called by RPCs
--   - Inserts atomically with the RPC transaction
--
-- Function: cleanup_old_notifications(max_age)
--   - Deletes old notifications
--   - Default 1 hour retention
--
-- Publication: supabase_realtime
--   - realtime_notifications (primary)
--   - rounds, market_quotes (for granular subscriptions)
-- ============================================================

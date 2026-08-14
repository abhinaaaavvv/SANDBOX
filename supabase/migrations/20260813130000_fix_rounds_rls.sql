-- ============================================================
-- Phase 2 Review: Fix RLS policies to enforce RPC-only state transitions
-- ============================================================
-- Issue: Admin-level UPDATE/INSERT/DELETE policies on competitions,
-- competition_runs, and rounds allow direct table modifications that
-- bypass the authoritative state-transition RPCs.
--
-- Fix: Remove direct write policies. All modifications must go through
-- SECURITY DEFINER RPCs which enforce:
-- - Admin authorization (assert_admin)
-- - State-transition validation
-- - Round exclusivity
-- - Sequential ordering
-- - Authoritative timestamps
--
-- SECURITY DEFINER functions run as the owner (postgres) and bypass RLS,
-- so the RPCs can still UPDATE/INSERT/DELETE as needed.
-- ============================================================

-- ---- rounds ----
-- Remove direct INSERT/UPDATE/DELETE on rounds.
-- All state transitions must go through:
--   start_round(), end_round(), open_market(), close_market(),
--   pause_trading(), resume_trading()
-- Round creation should happen via migrations/seed data.

DROP POLICY IF EXISTS "rounds_insert_admin" ON public.rounds;
DROP POLICY IF EXISTS "rounds_update_admin" ON public.rounds;
DROP POLICY IF EXISTS "rounds_delete_admin" ON public.rounds;

-- ---- competitions ----
-- Remove direct UPDATE/DELETE on competitions.
-- Admin metadata changes (name, description) should go through
-- migrations or a future admin RPC if needed.

DROP POLICY IF EXISTS "competitions_update_admin" ON public.competitions;
DROP POLICY IF EXISTS "competitions_delete_admin" ON public.competitions;

-- ---- competition_runs ----
-- Remove direct UPDATE/DELETE on competition_runs.
-- Run lifecycle (status, started_at, ended_at) should be managed
-- through RPCs. Admin creation is handled via migrations/seed data.

DROP POLICY IF EXISTS "competition_runs_update_admin" ON public.competition_runs;
DROP POLICY IF EXISTS "competition_runs_delete_admin" ON public.competition_runs;

-- ============================================================
-- Summary of remaining policies:
--
-- competitions:
--   competitions_select_authenticated (SELECT)
--   competitions_insert_admin (INSERT) - kept for admin creation via PostgREST
--
-- competition_runs:
--   competition_runs_select_authenticated (SELECT)
--   competition_runs_insert_admin (INSERT) - kept for admin creation via PostgREST
--
-- rounds:
--   rounds_select_authenticated (SELECT)
-- ============================================================

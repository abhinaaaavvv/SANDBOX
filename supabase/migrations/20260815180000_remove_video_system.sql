-- Migration: Remove video system
-- Round 3 videos are played externally on a TV, not in the website.
-- This migration removes all video-specific database objects.

-- 1. Drop video RPCs (order matters: dependent functions first)
-- Drop all possible overloads for each function
DO $$
DECLARE
  func RECORD;
BEGIN
  FOR func IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'get_video_playback_state', 'select_video', 'start_video',
        'pause_video', 'resume_video', 'seek_video', 'stop_video'
      )
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS public.%I(%s) CASCADE', func.proname, func.args);
    RAISE NOTICE 'Dropped function: public.%(%)', func.proname, func.args;
  END LOOP;
END $$;

-- 2. Drop video tables (dependent tables first)
DROP TABLE IF EXISTS public.video_playback_state CASCADE;
DROP TABLE IF EXISTS public.videos CASCADE;

-- 3. Clean up video-related trigger functions if any exist
DROP FUNCTION IF EXISTS public.notify_video_state_changed() CASCADE;

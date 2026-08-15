# Video Subsystem Removal Report

**Date**: August 15, 2026  
**Reason**: Round 3 videos are played externally on a TV, not within the SANDBOX website.

## Summary

The entire video subsystem has been removed from the SANDBOX website. This includes:
- Video playback components
- Video state management
- Video RPC functions
- Video database tables
- Video Realtime events
- Video documentation

Round 3 remains a normal competition round — only the video playback mechanism has changed to external TV.

## Changes Made

### Database
- **Migration**: `20260815180000_remove_video_system.sql`
  - Dropped tables: `videos`, `video_playback_state`
  - Dropped RPCs: `get_video_playback_state`, `select_video`, `start_video`, `pause_video`, `resume_video`, `seek_video`, `stop_video`
  - Dropped trigger function: `notify_video_state_changed()`
  - Removed all RLS policies for video tables

### Types
- **`src/types/supabase.ts`**: Regenerated — zero video references
- **`src/types/sandbox.ts`**: Removed `VideoItem` type
- **`src/types/realtime.ts`**: Removed `VIDEO_PLAY`, `VIDEO_STOP`, `VIDEO_STATE_CHANGED` events

### Competition Engine
- **`src/lib/competition/types.ts`**: Removed video fields from types
- **`src/lib/competition/state.ts`**: Removed video state initialization
- **`src/lib/competition/engine.ts`**: Removed video methods

### Realtime System
- **`src/lib/realtime/events.ts`**: Removed video event types

### Mock Engine
- **`src/lib/mockData.ts`**: Removed `PRESET_VIDEOS` constant

### Context
- **`src/context/SandboxContext.tsx`**: Removed video state and operations

### UI Components
- **`src/components/admin/AdminPanel.tsx`**: Removed video UI section
- **`src/app/participant/(console)/layout.tsx`**: Removed VideoOverlay import
- **`src/app/admin/(console)/layout.tsx`**: Removed VideoOverlay import

### Deleted Files
- `src/components/shared/VideoOverlay.tsx`
- `src/hooks/useVideoPlayback.ts`
- `supabase/migrations/20260815170000_video_system.sql`
- `docs/VIDEO_ARCHITECTURE.md`

### Documentation
- **`docs/BACKEND.md`**: Updated Round 3 and Supabase Storage sections to reflect external TV playback

## Build Status
- ✅ Build passes (`npm run build`)
- ✅ Typecheck passes
- ⚠️ Pre-existing lint warnings in `useLeaderboard.ts` (unrelated to video removal)

## Verification
- Zero video references in generated Supabase types
- Zero video subsystem code in `src/`
- Remaining "video" mentions are only Round 3 round-type descriptions (correct behavior)
- Build compiles successfully
- No TypeScript errors

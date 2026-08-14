/**
 * SANDBOX Realtime Module
 *
 * Provides Supabase Realtime integration for real-time state distribution.
 *
 * Architecture:
 *   PostgreSQL (authoritative state)
 *       ↓ committed transaction
 *   INSERT INTO realtime_notifications
 *       ↓ WAL replication
 *   Supabase Realtime (postgres_changes)
 *       ↓ client receives INSERT
 *   Client refetches authoritative state via RPC
 *       ↓
 *   UI updates
 *
 * Key principles:
 *   1. Realtime payloads are NEVER authoritative financial state
 *   2. Notifications are signals to refetch, not data to display
 *   3. Pending admin state never leaks through notifications
 *   4. Team-scoped events are only visible to that team
 *   5. Run-scoped events are visible to all participants in the run
 *
 * Usage:
 * ```tsx
 * // Wrap app with provider
 * import { RealtimeProvider } from "@/lib/realtime";
 * <RealtimeProvider>{children}</RealtimeProvider>
 *
 * // Subscribe to events
 * import { useRealtimeRefetch } from "@/lib/realtime";
 * useRealtimeRefetch(runId, teamId,
 *   ["PRICES_CHANGED", "LEADERBOARD_CHANGED"],
 *   ["PORTFOLIO_CHANGED"],
 *   () => refetchAll()
 * );
 * ```
 */

export { RealtimeProvider, useRealtime } from "./provider";
export {
  useRunEvent,
  useTeamEvent,
  useRunEvents,
  useTeamEvents,
  useRunRealtime,
  useTeamRealtime,
  useRealtimeRefetch,
  useReconcile,
  useRealtimeSync,
} from "./hooks";
export { runChannel, teamChannel, channelType, channelId } from "./channels";
export type {
  RealtimeEventType,
  RealtimeEventMap,
  RealtimeHandler,
  RoundStateChangedPayload,
  MarketStateChangedPayload,
  PricesChangedPayload,
  PortfolioChangedPayload,
  LeaderboardChangedPayload,
  DividendsPaidPayload,
} from "./events";

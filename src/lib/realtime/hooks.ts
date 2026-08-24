"use client";

import { useEffect, useCallback, useRef } from "react";
import { useRealtime } from "./provider";
import type { RealtimeEventType } from "./events";

/**
 * Subscribe to run-scoped Realtime events with automatic refetch.
 */
export function useRunRealtime(
  runId: string | null,
  eventTypes: RealtimeEventType[],
  onEvent: (eventType: RealtimeEventType, payload: unknown) => void
): void {
  const { onRunEvent } = useRealtime();
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!runId) return;

    const unsubscribes = eventTypes.map((eventType) =>
      onRunEvent(runId, eventType, (payload) => {
        onEventRef.current(eventType, payload);
      })
    );

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, ...eventTypes, onRunEvent]);
}

/**
 * Subscribe to team-scoped Realtime events with automatic refetch.
 */
export function useTeamRealtime(
  teamId: string | null,
  eventTypes: RealtimeEventType[],
  onEvent: (eventType: RealtimeEventType, payload: unknown) => void
): void {
  const { onTeamEvent } = useRealtime();
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!teamId) return;

    const unsubscribes = eventTypes.map((eventType) =>
      onTeamEvent(teamId, eventType, (payload) => {
        onEventRef.current(eventType, payload);
      })
    );

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, ...eventTypes, onTeamEvent]);
}

/**
 * Subscribe to a single run-scoped event.
 */
export function useRunEvent(
  runId: string | null,
  eventType: RealtimeEventType,
  handler: (payload: unknown) => void
): void {
  const { onRunEvent } = useRealtime();
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!runId) return;

    return onRunEvent(runId, eventType, (payload) => {
      handlerRef.current(payload);
    });
  }, [runId, eventType, onRunEvent]);
}

/**
 * Subscribe to a single team-scoped event.
 */
export function useTeamEvent(
  teamId: string | null,
  eventType: RealtimeEventType,
  handler: (payload: unknown) => void
): void {
  const { onTeamEvent } = useRealtime();
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!teamId) return;

    return onTeamEvent(teamId, eventType, (payload) => {
      handlerRef.current(payload);
    });
  }, [teamId, eventType, onTeamEvent]);
}

/**
 * Subscribe to all Realtime events on a run channel.
 */
export function useRunEvents(
  runId: string | null,
  handler: (eventType: RealtimeEventType, payload: unknown) => void
): void {
  const { onRunEvents } = useRealtime();
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!runId) return;

    return onRunEvents(runId, (eventType, payload) => {
      handlerRef.current(eventType, payload);
    });
  }, [runId, onRunEvents]);
}

/**
 * Subscribe to all Realtime events on a team channel.
 */
export function useTeamEvents(
  teamId: string | null,
  handler: (eventType: RealtimeEventType, payload: unknown) => void
): void {
  const { onTeamEvents } = useRealtime();
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!teamId) return;

    return onTeamEvents(teamId, (eventType, payload) => {
      handlerRef.current(eventType, payload);
    });
  }, [teamId, onTeamEvents]);
}

const REFETCH_KEY = "__sandbox_realtime_refetch";

/**
 * Realtime-aware refetch hook.
 *
 * Coalesces rapid events across BOTH channels into a single flush, but
 * keeps every distinct event type seen during the window so targeted
 * reconciliations are never swallowed (e.g. a team-scoped
 * PORTFOLIO_CHANGED arriving alongside a run-scoped LEADERBOARD_CHANGED
 * must still refetch transactions).
 */
export function useRealtimeRefetch(
  runId: string | null,
  teamId: string | null,
  runEvents: RealtimeEventType[],
  teamEvents: RealtimeEventType[],
  refetch: (eventType?: string) => void | Promise<void>
): void {
  const refetchRef = useRef(refetch);

  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  const schedule = useCallback((eventType?: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = globalThis as any;
    if (!g[REFETCH_KEY]) {
      g[REFETCH_KEY] = { timer: null, types: new Set<string>() };
    }
    const slot = g[REFETCH_KEY];
    if (eventType) slot.types.add(eventType);
    if (slot.timer) clearTimeout(slot.timer);
    slot.timer = setTimeout(() => {
      const types = Array.from(slot.types) as string[];
      slot.types.clear();
      slot.timer = null;
      if (types.length === 0) {
        void refetchRef.current();
        return;
      }
      // One targeted reconciliation per distinct event type, in arrival order.
      for (const t of types) {
        void refetchRef.current(t);
      }
    }, 50);
  }, []);

  useRunRealtime(runId, runEvents, (eventType) => {
    schedule(eventType);
  });

  useTeamRealtime(teamId, teamEvents, (eventType) => {
    schedule(eventType);
  });
}

/**
 * Register a reconciliation handler with the Realtime provider.
 *
 * This handler fires on:
 * - Initial subscription (first SUBSCRIBED)
 * - Reconnection after disconnect (SUBSCRIBED after CLOSED/CHANNEL_ERROR)
 *
 * The handler should refetch authoritative state via RPC.
 *
 * Usage:
 * ```tsx
 * useReconcile(() => {
 *   refetchRoundState();
 *   refetchPortfolio();
 *   refetchLeaderboard();
 * });
 * ```
 */
export function useReconcile(handler: () => void | Promise<void>): void {
  const { onReconcile } = useRealtime();
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    return onReconcile(() => {
      handlerRef.current();
    });
  }, [onReconcile]);
}

/**
 * Combined Realtime hook with reconciliation.
 *
 * Subscribes to run + team events AND registers a reconciliation handler.
 * The reconciliation fires on initial subscribe and reconnect.
 * Event-triggered refetches pass the event type for targeted reconciliation.
 *
 * This is the recommended hook for most components that need Realtime.
 *
 * Usage:
 * ```tsx
 * useRealtimeSync({
 *   runId,
 *   teamId,
 *   runEvents: ["PRICES_CHANGED", "LEADERBOARD_CHANGED"],
 *   teamEvents: ["PORTFOLIO_CHANGED"],
 *   onReconcile: (eventType?) => refetchAll(),
 * });
 * ```
 */
export function useRealtimeSync(options: {
  runId: string | null;
  teamId: string | null;
  runEvents: RealtimeEventType[];
  teamEvents: RealtimeEventType[];
  onReconcile: (eventType?: string) => void | Promise<void>;
}): void {
  const { runId, teamId, runEvents, teamEvents, onReconcile } = options;

  useRealtimeRefetch(runId, teamId, runEvents, teamEvents, onReconcile);
  useReconcile(() => onReconcile());
}

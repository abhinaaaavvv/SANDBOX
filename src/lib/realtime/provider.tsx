"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import {
  RealtimeEventType,
  RealtimeEventMap,
  RealtimeHandler,
} from "./events";
import { runChannel, teamChannel } from "./channels";

// ============================================================
// Types
// ============================================================

type WildcardHandler = (eventType: RealtimeEventType, payload: unknown) => void;

type ReconcileHandler = () => void | Promise<void>;

interface RealtimeContextValue {
  onRunEvent: <T extends keyof RealtimeEventMap>(
    runId: string,
    eventType: T,
    handler: RealtimeHandler<T>
  ) => () => void;

  onTeamEvent: <T extends keyof RealtimeEventMap>(
    teamId: string,
    eventType: T,
    handler: RealtimeHandler<T>
  ) => () => void;

  onRunEvents: (
    runId: string,
    handler: WildcardHandler
  ) => () => void;

  onTeamEvents: (
    teamId: string,
    handler: WildcardHandler
  ) => () => void;

  /**
   * Register a reconciliation handler that fires on:
   * - Initial subscription (first SUBSCRIBED)
   * - Reconnection after disconnect (SUBSCRIBED after CLOSED/CHANNEL_ERROR)
   *
   * The handler should refetch authoritative state via RPC.
   * Multiple registrations are supported; all handlers fire on reconcile.
   */
  onReconcile: (handler: ReconcileHandler) => () => void;

  isConnected: boolean;
}

// ============================================================
// Context
// ============================================================

const RealtimeContext = createContext<RealtimeContextValue | undefined>(
  undefined
);

// ============================================================
// Event coalescing
// ============================================================

function useCoalescedDispatch(ms: number = 300) {
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );
  const callbacksRef = useRef<Map<string, Set<() => void>>>(new Map());

  const dispatch = useCallback(
    (key: string, callback: () => void) => {
      const existing = timersRef.current.get(key);
      if (existing) {
        clearTimeout(existing);
      }

      if (!callbacksRef.current.has(key)) {
        callbacksRef.current.set(key, new Set());
      }
      callbacksRef.current.get(key)!.add(callback);

      const timer = setTimeout(() => {
        timersRef.current.delete(key);
        const callbacks = callbacksRef.current.get(key);
        callbacksRef.current.delete(key);
        if (callbacks) {
          callbacks.forEach((cb) => cb());
          callbacks.clear();
        }
      }, ms);

      timersRef.current.set(key, timer);
    },
    [ms]
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  return dispatch;
}

// ============================================================
// Provider
// ============================================================

interface RealtimeProviderProps {
  children: React.ReactNode;
}

export function RealtimeProvider({ children }: RealtimeProviderProps) {
  const [isConnected, setIsConnected] = useState(false);

  const channelInstancesRef = useRef<Map<string, ReturnType<typeof createClient.prototype.channel>>>(
    new Map()
  );

  // Typed event handlers: channelName -> eventType -> Set<handler>
  const handlersRef = useRef<
    Map<string, Map<string, Set<(payload: unknown) => void>>>
  >(new Map());

  // Wildcard handlers: channelName -> Set<handler>
  const wildcardHandlersRef = useRef<
    Map<string, Set<WildcardHandler>>
  >(new Map());

  // Reconciliation handlers
  const reconcileHandlersRef = useRef<Set<ReconcileHandler>>(new Set());

  const coalescedDispatch = useCoalescedDispatch(300);

  // Track previous connection state for reconnect detection
  const wasConnectedRef = useRef(false);

  /**
   * Fire all reconciliation handlers.
   * Called on initial subscribe and on reconnect.
   */
  const fireReconcile = useCallback(() => {
    reconcileHandlersRef.current.forEach((handler) => {
      try {
        handler();
      } catch (err) {
        console.error("[Realtime] Error in reconcile handler:", err);
      }
    });
  }, []);

  const ensureChannel = useCallback(
    (channelName: string) => {
      if (channelInstancesRef.current.has(channelName)) {
        return channelInstancesRef.current.get(channelName)!;
      }

      const supabase = createClient();
      const channel = supabase.channel(channelName);

      channel.on(
        "postgres_changes" as never,
        {
          event: "INSERT",
          schema: "public",
          table: "realtime_notifications",
          filter: `channel=eq.${channelName}`,
        } as never,
        (payload: { new?: { event_type?: string; payload?: unknown } }) => {
          const row = payload.new;
          if (!row?.event_type) return;

          const eventType = row.event_type;
          const eventPayload = row.payload;

          // Dispatch to typed handlers
          const channelHandlers = handlersRef.current.get(channelName);
          if (channelHandlers) {
            const typeHandlers = channelHandlers.get(eventType);
            if (typeHandlers) {
              typeHandlers.forEach((handler) => {
                try {
                  handler(eventPayload);
                } catch (err) {
                  console.error(
                    `[Realtime] Error in handler for ${eventType}:`,
                    err
                  );
                }
              });
            }
          }

          // Dispatch to wildcard handlers
          const wildcardHandlers = wildcardHandlersRef.current.get(channelName);
          if (wildcardHandlers) {
            wildcardHandlers.forEach((handler) => {
              try {
                handler(eventType as RealtimeEventType, eventPayload);
              } catch (err) {
                console.error(
                  `[Realtime] Error in wildcard handler:`,
                  err
                );
              }
            });
          }
        }
      );

      channel.subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          const wasConnected = wasConnectedRef.current;
          setIsConnected(true);
          wasConnectedRef.current = true;

          if (wasConnected) {
            // RECONNECT: channel was previously connected, then lost, now re-established
            // Fire reconcile to refetch authoritative state
            fireReconcile();
          } else {
            // INITIAL SUBSCRIBE: first time connecting
            // Fire reconcile to ensure initial state is fetched after subscription is active
            // This prevents the race condition where events fire between initial fetch and subscribe
            fireReconcile();
          }
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          setIsConnected(false);
        }
      });
      channelInstancesRef.current.set(channelName, channel);
      return channel;
    },
    [fireReconcile]
  );

  // Subscribe to a specific event type on a channel
  const subscribe = useCallback(
    (
      channelName: string,
      eventType: string,
      handler: (payload: unknown) => void
    ): (() => void) => {
      ensureChannel(channelName);

      if (!handlersRef.current.has(channelName)) {
        handlersRef.current.set(channelName, new Map());
      }
      const channelHandlers = handlersRef.current.get(channelName)!;
      if (!channelHandlers.has(eventType)) {
        channelHandlers.set(eventType, new Set());
      }
      channelHandlers.get(eventType)!.add(handler);

      return () => {
        const handlers = handlersRef.current.get(channelName);
        if (handlers) {
          const typeHandlers = handlers.get(eventType);
          if (typeHandlers) {
            typeHandlers.delete(handler);
            if (typeHandlers.size === 0) {
              handlers.delete(eventType);
            }
          }
          if (handlers.size === 0) {
            handlersRef.current.delete(channelName);
          }
        }
      };
    },
    [ensureChannel]
  );

  // Subscribe to wildcard events on a channel
  const subscribeWildcard = useCallback(
    (
      channelName: string,
      handler: WildcardHandler
    ): (() => void) => {
      ensureChannel(channelName);

      if (!wildcardHandlersRef.current.has(channelName)) {
        wildcardHandlersRef.current.set(channelName, new Set());
      }
      wildcardHandlersRef.current.get(channelName)!.add(handler);

      return () => {
        const handlers = wildcardHandlersRef.current.get(channelName);
        if (handlers) {
          handlers.delete(handler);
          if (handlers.size === 0) {
            wildcardHandlersRef.current.delete(channelName);
          }
        }
      };
    },
    [ensureChannel]
  );

  const onRunEvent = useCallback(
    <T extends keyof RealtimeEventMap>(
      runId: string,
      eventType: T,
      handler: RealtimeHandler<T>
    ): (() => void) => {
      const channelName = runChannel(runId);
      return subscribe(channelName, eventType, (payload: unknown) => {
        coalescedDispatch(`${channelName}:${eventType}`, () => {
          handler(payload as RealtimeEventMap[T]);
        });
      });
    },
    [subscribe, coalescedDispatch]
  );

  const onTeamEvent = useCallback(
    <T extends keyof RealtimeEventMap>(
      teamId: string,
      eventType: T,
      handler: RealtimeHandler<T>
    ): (() => void) => {
      const channelName = teamChannel(teamId);
      return subscribe(channelName, eventType, (payload: unknown) => {
        coalescedDispatch(`${channelName}:${eventType}`, () => {
          handler(payload as RealtimeEventMap[T]);
        });
      });
    },
    [subscribe, coalescedDispatch]
  );

  const onRunEvents = useCallback(
    (
      runId: string,
      handler: WildcardHandler
    ): (() => void) => {
      const channelName = runChannel(runId);
      return subscribeWildcard(channelName, handler);
    },
    [subscribeWildcard]
  );

  const onTeamEvents = useCallback(
    (
      teamId: string,
      handler: WildcardHandler
    ): (() => void) => {
      const channelName = teamChannel(teamId);
      return subscribeWildcard(channelName, handler);
    },
    [subscribeWildcard]
  );

  const onReconcile = useCallback(
    (handler: ReconcileHandler): (() => void) => {
      reconcileHandlersRef.current.add(handler);
      return () => {
        reconcileHandlersRef.current.delete(handler);
      };
    },
    []
  );

  useEffect(() => {
    const channels = channelInstancesRef.current;
    const handlers = handlersRef.current;
    const wildcardHandlers = wildcardHandlersRef.current;
    const reconcileHandlers = reconcileHandlersRef.current;
    return () => {
      channels.forEach((channel) => {
        try {
          (channel as { unsubscribe?: () => void }).unsubscribe?.();
        } catch {
          // Ignore cleanup errors
        }
      });
      channels.clear();
      handlers.clear();
      wildcardHandlers.clear();
      reconcileHandlers.clear();
    };
  }, []);

  const value = useMemo<RealtimeContextValue>(
    () => ({
      onRunEvent,
      onTeamEvent,
      onRunEvents,
      onTeamEvents,
      onReconcile,
      isConnected,
    }),
    [onRunEvent, onTeamEvent, onRunEvents, onTeamEvents, onReconcile, isConnected]
  );

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime(): RealtimeContextValue {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error("useRealtime must be used within a RealtimeProvider");
  }
  return context;
}

export { runChannel, teamChannel } from "./channels";
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

"use client";

import { useEffect } from "react";
import { RealtimeEventPayload } from "@/types/realtime";

/**
 * Backend Realtime Service adapter interface.
 * Connects directly to Supabase Realtime / WebSockets / Server-Sent Events.
 */
export function useRealtimeSubscription(
  onEventReceived?: (event: RealtimeEventPayload) => void
) {
  useEffect(() => {
    // Backend integration boundary:
    // When connecting to Supabase:
    // const channel = supabase.channel('sandbox_room')
    //   .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => ...)
    //   .subscribe();
    // return () => { supabase.removeChannel(channel); }

    // Mock listener hook point for testing realtime dispatches:
    const handleCustomEvent = (e: Event) => {
      const custom = e as CustomEvent<RealtimeEventPayload>;
      if (custom.detail && onEventReceived) {
        onEventReceived(custom.detail);
      }
    };

    window.addEventListener("sandbox-realtime-event", handleCustomEvent);
    return () => {
      window.removeEventListener("sandbox-realtime-event", handleCustomEvent);
    };
  }, [onEventReceived]);
}

/**
 * Helper function to dispatch mock realtime events locally for demo/testing
 */
export function dispatchMockRealtimeEvent(payload: RealtimeEventPayload) {
  if (typeof window !== "undefined") {
    const event = new CustomEvent<RealtimeEventPayload>("sandbox-realtime-event", {
      detail: payload,
    });
    window.dispatchEvent(event);
  }
}

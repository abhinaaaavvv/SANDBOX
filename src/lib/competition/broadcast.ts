import { RealtimeEventPayload } from "@/types/realtime";

const CHANNEL_NAME = "sandbox-competition-v1";

/**
 * Browser-side realtime transport for the mock engine.
 *
 * BroadcastChannel mirrors the semantics of a competition-wide realtime topic:
 * every event committed by one tab is delivered to every other tab that is
 * open (the sender does not receive its own message). The eventual backend
 * replaces this with a Supabase Realtime channel subscription without touching
 * the engine's event flow.
 */
export class BroadcastSync {
  private channel: BroadcastChannel | null = null;

  constructor(onMessage: (event: RealtimeEventPayload) => void) {
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = (message: MessageEvent) => {
        const payload = message.data as RealtimeEventPayload;
        if (payload && typeof payload.type === "string") onMessage(payload);
      };
    }
  }

  post(event: RealtimeEventPayload) {
    this.channel?.postMessage(event);
  }

  close() {
    this.channel?.close();
    this.channel = null;
  }
}

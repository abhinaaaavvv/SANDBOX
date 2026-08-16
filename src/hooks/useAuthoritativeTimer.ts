"use client";

import { useState, useEffect } from "react";

/**
 * Custom hook to calculate display time from an authoritative server end timestamp.
 * Prevents client-side timer drift and ensures exact synchronization across all client screens.
 *
 * Timer runs when trading is ENABLED.
 * Timer pauses when trading is PAUSED.
 * Timer continues when trading is DISABLED (market closed but round active).
 *
 * The countdown is always derived from `ends_at - now()`.
 * No per-second database writes are performed.
 * When paused, the interval stops and the displayed value freezes.
 * When resumed, `ends_at` is extended server-side and the client picks up the new value.
 */
export function useAuthoritativeTimer(
  serverEndTimestampISO: string | null,
  tradingStatus: "ENABLED" | "PAUSED" | "DISABLED"
): number {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => {
    if (!serverEndTimestampISO) return 0;
    const endMs = new Date(serverEndTimestampISO).getTime();
    const diff = Math.max(0, Math.floor((endMs - Date.now()) / 1000));
    return diff;
  });

  useEffect(() => {
    if (!serverEndTimestampISO) return;

    // Only run interval when trading is ENABLED.
    // When PAUSED or DISABLED, we keep the current secondsRemaining value frozen.
    // The server extends `ends_at` by the pause duration when resume_trading() is called,
    // so the next time trading becomes ENABLED the interval will compute the correct
    // remaining time from the updated `ends_at`.
    if (tradingStatus !== "ENABLED") return;

    const updateTimer = () => {
      const endMs = new Date(serverEndTimestampISO).getTime();
      const nowMs = Date.now();
      const remaining = Math.max(0, Math.floor((endMs - nowMs) / 1000));
      setSecondsRemaining(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [serverEndTimestampISO, tradingStatus]);

  return secondsRemaining;
}

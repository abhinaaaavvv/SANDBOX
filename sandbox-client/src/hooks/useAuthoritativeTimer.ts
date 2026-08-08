"use client";

import { useState, useEffect } from "react";

/**
 * Custom hook to calculate display time from an authoritative server end timestamp.
 * Prevents client-side timer drift and ensures exact synchronization across all client screens.
 */
export function useAuthoritativeTimer(
  serverEndTimestampISO: string | null,
  isMarketOpen: boolean
): number {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => {
    if (!serverEndTimestampISO) return 900; // 15 mins default
    const endMs = new Date(serverEndTimestampISO).getTime();
    const diff = Math.max(0, Math.floor((endMs - Date.now()) / 1000));
    return diff;
  });

  useEffect(() => {
    if (!serverEndTimestampISO || !isMarketOpen) return;

    const updateTimer = () => {
      const endMs = new Date(serverEndTimestampISO).getTime();
      const nowMs = Date.now();
      const remaining = Math.max(0, Math.floor((endMs - nowMs) / 1000));
      setSecondsRemaining(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [serverEndTimestampISO, isMarketOpen]);

  return secondsRemaining;
}

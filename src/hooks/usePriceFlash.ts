"use client";

import { useEffect, useRef, useState } from "react";

export type PriceDirection = "up" | "down" | null;

/**
 * Returns the direction of the most recent change of `value`, then clears
 * after `duration` ms. Used for subtle price-update highlights.
 */
export function usePriceFlash(value: number, duration = 700): PriceDirection {
  const [flash, setFlash] = useState<PriceDirection>(null);
  const prevRef = useRef(value);

  useEffect(() => {
    const prev = prevRef.current;
    if (prev !== value) {
      prevRef.current = value;
      setFlash(value > prev ? "up" : "down");
      const t = window.setTimeout(() => setFlash(null), duration);
      return () => window.clearTimeout(t);
    }
  }, [value, duration]);

  return flash;
}

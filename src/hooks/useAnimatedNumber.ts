"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Smoothly animates toward `target` whenever it changes (ease-out cubic).
 * Used for live financial figures so value updates glide instead of jump.
 */
export function useAnimatedNumber(target: number, duration = 650): number {
  const [value, setValue] = useState(target);
  const valueRef = useRef(target);
  const rafRef = useRef(0);

  useEffect(() => {
    const from = valueRef.current;
    if (from === target) return;

    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = from + (target - from) * eased;
      valueRef.current = next;
      setValue(next);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return value;
}

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatINR(val: number): string {
  const isNegative = val < 0;
  const absVal = Math.abs(val);
  const formatted = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(absVal);
  return isNegative ? `-${formatted}` : formatted;
}

/**
 * Format paise (integer) to INR display string with 2 decimal places.
 * Uses the exact integer paise value — no floating-point rounding.
 *
 * 320000 paise → ₹3,200.00
 * 320050 paise → ₹3,200.50
 * 320099 paise → ₹3,200.99
 * 0 paise      → ₹0.00
 */
export function formatPaise(paise: number): string {
  const isNegative = paise < 0;
  const absPaise = Math.abs(paise);
  const rupees = Math.floor(absPaise / 100);
  const paiseRemainder = absPaise % 100;
  const paiseStr = paiseRemainder.toString().padStart(2, "0");
  const formatted = new Intl.NumberFormat("en-IN").format(rupees);
  return isNegative ? `-₹${formatted}.${paiseStr}` : `₹${formatted}.${paiseStr}`;
}

export function formatPercent(val: number): string {
  const sign = val > 0 ? "+" : "";
  return `${sign}${val.toFixed(2)}%`;
}

export function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

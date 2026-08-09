import { NextResponse } from "next/server";

export const ERROR_STATUS: Record<string, number> = {
  AUTH_REQUIRED: 401,
  FORBIDDEN: 403,
  TEAM_NOT_FOUND: 404,
  ROUND_NOT_ACTIVE: 409,
  MARKET_CLOSED: 409,
  TRADING_PAUSED: 409,
  INSUFFICIENT_CASH: 409,
  INSUFFICIENT_HOLDINGS: 409,
  INVALID_QUANTITY: 400,
  INVALID_PRICE: 400,
  INVALID_REQUEST: 400,
  DUPLICATE_REQUEST: 409,
  PRICE_BATCH_NOT_FOUND: 404,
  PRICE_BATCH_ALREADY_APPLIED: 409,
  INVALID_STATE_TRANSITION: 409,
};

export function getErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const anyError = error as { message?: unknown; details?: unknown; code?: unknown };
  const candidates = [anyError.message, anyError.details, anyError.code];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    for (const code of Object.keys(ERROR_STATUS)) {
      if (candidate.includes(code)) return code;
    }
  }
  return null;
}

export function toErrorResponse(error: unknown, fallback = 500) {
  if (error && typeof error === "object" && (error as { name?: string }).name === "ZodError") {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "INVALID_REQUEST" } },
      { status: 400 }
    );
  }

  const code = getErrorCode(error);
  const status = code ? ERROR_STATUS[code] ?? fallback : fallback;
  const message = code ?? (error instanceof Error ? error.message : "Internal server error");
  return NextResponse.json({ error: { code: message, message } }, { status });
}

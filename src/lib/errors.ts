/**
 * Error sanitization utilities.
 *
 * Raw Supabase/Postgres errors can leak implementation details:
 * table names, column names, constraint names, SQL syntax.
 *
 * These utilities map raw errors to generic, user-friendly messages
 * while preserving useful distinctions (auth failure, market data
 * unavailable, etc.).
 */

/** Check if an error message looks like a raw database/Postgres error. */
function isRawDatabaseError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("relation") ||
    lower.includes("column") ||
    lower.includes("constraint") ||
    lower.includes("syntax error") ||
    lower.includes("permission denied") ||
    lower.includes("does not exist") ||
    lower.includes("null value") ||
    lower.includes("duplicate key") ||
    lower.includes("foreign key") ||
    lower.includes("check violation") ||
    lower.includes("type ") ||
    lower.includes("function ") ||
    lower.includes("pg_") ||
    lower.includes("supabase")
  );
}

/**
 * Sanitize a Supabase RPC error into a user-friendly message.
 *
 * Maps known error patterns to specific messages. Falls back to a
 * generic message for unrecognized or raw database errors.
 */
export function mapRpcError(rawMessage: string, context?: string): string {
  const lower = rawMessage.toLowerCase();

  // Auth / session errors
  if (lower.includes("auth_required") || lower.includes("not authenticated"))
    return "You must be signed in to continue.";
  if (lower.includes("jwt") || lower.includes("token") || lower.includes("session"))
    return "Your session has expired. Please sign in again.";

  // Team errors
  if (lower.includes("team_not_found"))
    return "No team found for your account.";
  if (lower.includes("team_not_participating"))
    return "Your team is not participating in this competition.";

  // Competition errors
  if (lower.includes("competition_run_not_found"))
    return "Competition not found.";
  if (lower.includes("invalid_state") && lower.includes("competition run"))
    return "This competition run is no longer active.";

  // Trading errors
  if (lower.includes("trading_not_allowed"))
    return "Trading is not currently allowed.";
  if (lower.includes("market_closed") || lower.includes("market_status"))
    return "The market is currently closed.";
  if (lower.includes("trading_paused"))
    return "Trading is currently paused.";
  if (lower.includes("round"))
    return "No active round for trading.";
  if (lower.includes("stock_not_found"))
    return "Stock not found.";
  if (lower.includes("stock_inactive"))
    return "This stock is no longer active.";
  if (lower.includes("no_market_quote"))
    return "No price available for this stock.";
  if (lower.includes("invalid_side"))
    return "Invalid trade side.";
  if (lower.includes("invalid_quantity"))
    return "Enter a valid quantity.";
  if (lower.includes("insufficient_cash"))
    return "Insufficient cash for this purchase.";
  if (lower.includes("insufficient_holdings"))
    return "You don't own enough shares to sell.";
  if (lower.includes("idempotency_conflict"))
    return "A trade with this request is already being processed.";

  // Raw database errors — never expose these
  if (isRawDatabaseError(rawMessage)) {
    return context
      ? `Unable to load ${context}. Please try again.`
      : "Something went wrong. Please try again.";
  }

  // Unknown but not obviously a raw DB error — still sanitize
  return context
    ? `Unable to load ${context}. Please try again.`
    : "Something went wrong. Please try again.";
}

/**
 * Sanitize a PostgREST/Supabase query error (from .from() queries).
 * These often contain table/column names in the message.
 */
export function mapQueryError(rawMessage: string, context?: string): string {
  // Query errors are almost always raw DB details — always sanitize
  return mapRpcError(rawMessage, context);
}

/**
 * Realtime event types for SANDBOX.
 *
 * These events are SIGNALS ONLY — they indicate that committed state has
 * changed. The client must NEVER use the event payload as authoritative
 * financial data. Instead, the client refetches authoritative state via RPC.
 *
 * Payloads contain identifiers (run_id, team_id, etc.) but never:
 * - cash balances
 * - holdings quantities
 * - stock prices
 * - portfolio values
 * - P/L values
 * - leaderboard positions
 */

export type RealtimeEventType =
  | "ROUND_STATE_CHANGED"
  | "MARKET_STATE_CHANGED"
  | "PRICES_CHANGED"
  | "PORTFOLIO_CHANGED"
  | "LEADERBOARD_CHANGED"
  | "DIVIDENDS_PAID";

/** Payload for ROUND_STATE_CHANGED events. */
export interface RoundStateChangedPayload {
  competition_run_id: string;
  round_id: string;
  round_number: number;
  status: string;
  market_status: string;
  trading_status: string;
  started_at?: string;
  ends_at?: string;
  ended_at?: string;
  occurred_at: string;
}

/** Payload for MARKET_STATE_CHANGED events. */
export interface MarketStateChangedPayload {
  competition_run_id: string;
  round_id: string;
  market_status: string;
  trading_status: string;
  occurred_at: string;
}

/** Payload for PRICES_CHANGED events. */
export interface PricesChangedPayload {
  competition_run_id: string;
  batch_id: string;
  applied_count: number;
  occurred_at: string;
}

/** Payload for PORTFOLIO_CHANGED events. */
export interface PortfolioChangedPayload {
  competition_run_id: string;
  reason: "trade" | "dividend" | "admin_adjustment";
  trade_id?: string;
  dividend_id?: string;
  occurred_at: string;
}

/** Payload for LEADERBOARD_CHANGED events. */
export interface LeaderboardChangedPayload {
  competition_run_id: string;
  reason: string;
  occurred_at: string;
}

/** Payload for DIVIDENDS_PAID events. */
export interface DividendsPaidPayload {
  competition_run_id: string;
  dividend_id: string;
  stock_id: string;
  amount_per_share_paise: number;
  occurred_at: string;
}

/** Union of all event payloads. */
export type RealtimeEventPayload =
  | RoundStateChangedPayload
  | MarketStateChangedPayload
  | PricesChangedPayload
  | PortfolioChangedPayload
  | LeaderboardChangedPayload
  | DividendsPaidPayload;

/** Typed event map for type-safe handlers. */
export interface RealtimeEventMap {
  ROUND_STATE_CHANGED: RoundStateChangedPayload;
  MARKET_STATE_CHANGED: MarketStateChangedPayload;
  PRICES_CHANGED: PricesChangedPayload;
  PORTFOLIO_CHANGED: PortfolioChangedPayload;
  LEADERBOARD_CHANGED: LeaderboardChangedPayload;
  DIVIDENDS_PAID: DividendsPaidPayload;
}

/** Handler function type for a specific event. */
export type RealtimeHandler<T extends keyof RealtimeEventMap> = (
  payload: RealtimeEventMap[T]
) => void;

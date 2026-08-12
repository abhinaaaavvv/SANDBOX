import {
  RoundNumber,
  MarketStatus,
  Stock,
  Holding,
  Transaction,
  LeaderboardEntry,
  PendingPriceChange,
  VideoItem,
} from "@/types/sandbox";

/**
 * Realtime event schema shared by the mock competition engine and the future
 * Supabase/WebSocket backend. The engine emits these events locally and over
 * BroadcastChannel; the eventual backend can broadcast the same shapes over
 * Supabase Realtime without any UI rewrite.
 */
export type RealtimeEventType =
  | "ROUND_STARTED"
  | "ROUND_ENDED"
  | "MARKET_OPENED"
  | "MARKET_CLOSED"
  | "TRADING_PAUSED"
  | "TRADING_RESUMED"
  | "TRADE_EXECUTED"
  | "PRICE_CHANGES_APPLIED"
  | "DIVIDENDS_PAID"
  | "CASH_UPDATED"
  | "HOLDINGS_UPDATED"
  | "LEADERBOARD_UPDATED"
  | "VIDEO_PLAY"
  | "VIDEO_STOP"
  | "COMPETITION_RESET";

/** Per-team payout record carried by a DIVIDENDS_PAID event. */
export interface DividendPayment {
  teamId: string;
  quantity: number;
  payout: number;
  transaction: Transaction;
}

export interface RealtimeEventPayload {
  type: RealtimeEventType;
  timestamp: string;
  round?: RoundNumber;
  marketStatus?: MarketStatus;
  timerEndTimestamp?: string; // Authoritative timestamp (ISO 8601)
  stocks?: Stock[];
  holdings?: Holding[];
  cash?: number;
  leaderboard?: LeaderboardEntry[];
  transaction?: Transaction;
  videoId?: string;

  // ---- Engine operation fields (used to apply events idempotently) ----
  teamId?: string;
  side?: "BUY" | "SELL";
  stockId?: string;
  quantity?: number;
  executionPrice?: number;
  amountPerShare?: number;
  payments?: DividendPayment[];
  reason?: string;
  playbackStartedAt?: string | null;
}

/**
 * Authoritative Competition State payload returned by backend API
 */
export interface CompetitionStateResponse {
  teamId: string;
  teamName: string;
  currentRound: RoundNumber;
  marketStatus: MarketStatus;
  serverTimestamp: string;
  roundEndTimestamp: string; // Used to calculate remaining timer cleanly
  cash: number;
  stocks: Stock[];
  holdings: Holding[];
  transactions: Transaction[];
  leaderboard: LeaderboardEntry[];
  videos: VideoItem[];
  activeVideoId?: string | null;
  isVideoPlaying?: boolean;
  pendingPriceChanges?: PendingPriceChange[]; // Admin context only
}

/**
  Trade Request DTO sent to server
 */
export interface TradeRequestDto {
  stockId: string;
  quantity: number;
  type: "BUY" | "SELL";
}

/**
  Trade Execution Response from server
 */
export interface TradeResponseDto {
  success: boolean;
  message: string;
  transaction?: Transaction;
  updatedCash?: number;
  updatedHoldings?: Holding[];
}

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
  Realtime payloads matching backend Supabase/WebSocket event schema
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
  | "VIDEO_STOP";

export interface RealtimeEventPayload {
  type: RealtimeEventType;
  timestamp: string;
  round?: RoundNumber;
  marketStatus?: MarketStatus;
  timerEndTimestamp?: string; // Authoritative server timestamp (ISO 8601)
  stocks?: Stock[];
  holdings?: Holding[];
  cash?: number;
  leaderboard?: LeaderboardEntry[];
  transaction?: Transaction;
  videoId?: string;
}

/**
  Authoritative Competition State payload returned by backend API
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

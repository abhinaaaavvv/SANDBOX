export type RoundNumber = 1 | 2 | 3;

export type MarketStatus =
  | "NOT_STARTED"
  | "MARKET_OPEN"
  | "TRADING_PAUSED"
  | "MARKET_CLOSED"
  | "ROUND_ENDED";

export interface Stock {
  id: string;
  symbol: string;
  name: string;
  description?: string;
  /** Authoritative price in paise (BIGINT from market_quotes.price_paise). Never rounded. */
  currentPricePaise: number;
  /** Derived from currentPricePaise / 100. Display-only — never use for calculations. */
  currentPrice: number;
  /** Whether a market quote exists for this stock in the current run. */
  quoteAvailable: boolean;
  /** Undefined when unavailable (not in database). */
  previousPrice?: number;
  /** Undefined when unavailable (not in database). */
  change?: number;
  /** Undefined when unavailable (not in database). */
  changePercent?: number;
  /** Undefined when unavailable (not in database). */
  high?: number;
  /** Undefined when unavailable (not in database). */
  low?: number;
  /** Undefined when unavailable (not in database). */
  volume?: number;
  /** Undefined when unavailable (not in database). */
  sector?: string;
}

export interface Holding {
  stockId: string;
  symbol: string;
  name: string;
  quantity: number;
  averageBuyPrice: number;
  currentPrice: number;
  totalValue: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
}

export interface Transaction {
  id: string;
  timestamp: string;
  symbol: string;
  companyName: string;
  type: "BUY" | "SELL" | "DIVIDEND";
  quantity: number;
  price: number;
  total: number;
}

export interface LeaderboardEntry {
  rank: number;
  teamId: string;
  teamName: string;
  portfolioValue: number;
  profitLoss: number;
  profitLossPercent: number;
  isCurrentTeam?: boolean;
}

export interface PendingPriceChange {
  stockId: string;
  symbol: string;
  companyName: string;
  currentPrice: number;
  newPrice: number;
  changeAmount: number;
  changePercent: number;
}

export interface VideoItem {
  id: string;
  title: string;
  description: string;
  url: string;
  durationSeconds: number;
  roundRequirement?: number;
}

export interface ToastMessage {
  id: string;
  type: "success" | "warning" | "error" | "info";
  title: string;
  message: string;
  timestamp: string;
}

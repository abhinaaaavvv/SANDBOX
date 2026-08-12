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
  sector: string;
  currentPrice: number;
  previousPrice: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  volume: number;
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

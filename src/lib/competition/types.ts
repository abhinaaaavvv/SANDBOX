import {
  RoundNumber,
  MarketStatus,
  TradingStatus,
  Stock,
  Holding,
  Transaction,
  LeaderboardEntry,
  PendingPriceChange,
} from "@/types/sandbox";

/** One simulated team's financial state (the engine's private ledger). */
export interface TeamState {
  id: string;
  name: string;
  cash: number;
  holdings: { stockId: string; quantity: number; averageBuyPrice: number }[];
  transactions: Transaction[];
  /** Cumulative dividend income, tracked for the admin team ledger. */
  dividendsReceived: number;
}

/**
 * Full serializable competition state owned by the mock engine.
 *
 * This is the single source of truth for the simulation. Every mutation flows
 * through {@link applyEventToState}, so a real backend can replace the engine
 * by persisting the same event stream / state shape.
 */
export interface MockCompetitionState {
  currentRound: RoundNumber;
  marketStatus: MarketStatus;
  roundStartedAt: string | null;
  roundEndsAt: string | null; // authoritative timer end — never a decrementing counter
  stocks: Stock[]; // current market prices (single quote source)
  pendingPriceChanges: PendingPriceChange[]; // admin-private, never broadcast
  teams: TeamState[];
  activeTeamId: string; // the team the local participant controls
}

/** Public, role-filtered read model handed to the React tree. */
export interface TeamOverview {
  id: string;
  name: string;
  cash: number;
  portfolioValue: number;
  profitLoss: number;
  holdingsCount: number;
  dividendsReceived: number;
}

export interface CompetitionSnapshot {
  currentRound: RoundNumber;
  marketStatus: MarketStatus;
  tradingStatus: TradingStatus;
  roundStartedAt: string | null;
  roundEndsAt: string | null;
  stocks: Stock[];
  /** Only present for admin views; empty otherwise. */
  pendingPriceChanges: PendingPriceChange[];
  activeTeamId: string;
  teamName: string;
  cash: number;
  holdings: Holding[];
  transactions: Transaction[];
  totalPortfolioValue: number;
  totalProfitLoss: number;
  totalProfitLossPercent: number;
  leaderboard: LeaderboardEntry[];
  teams: TeamOverview[];
}

/** Which console is currently viewing the state. */
export type ViewRole = "participant" | "admin" | null;

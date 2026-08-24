import type { LeaderboardEntry } from "@/types/sandbox";

/**
 * Public, role-filtered read model for the admin Team Manager /
 * cash-ledger panels. Cash is the SUM of a team's cash_ledger entries;
 * portfolio value and P/L are merged from the server-derived
 * leaderboard RPC.
 */
export interface TeamOverview {
  id: string;
  name: string;
  cash: number;
  portfolioValue: number;
  profitLoss: number;
  holdingsCount: number;
  dividendsReceived: number;
  /** Blocked teams cannot trade; still visible with a badge. */
  blocked?: boolean;
}

export type { LeaderboardEntry };

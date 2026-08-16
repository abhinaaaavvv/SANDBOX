/**
 * useLeaderboard Hook
 *
 * Fetches the authoritative leaderboard from the Phase 6 get_leaderboard() RPC.
 * PostgreSQL is the source of truth — no mock engine, no client-side calculations.
 *
 * The returned integer fields (portfolioValuePaise, pnlPaise, returnBasisPoints)
 * are in paise / basis-points. Convert to display formats only at the UI boundary
 * using formatPaise() and basisPointsToPercent().
 *
 * Do NOT calculate rankings or financial values in React.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCompetitionContext } from "@/lib/competition-context";
import { mapRpcError } from "@/lib/errors";

interface LeaderboardEntry {
  rank: number;
  teamId: string;
  teamName: string;
  portfolioValuePaise: number;
  pnlPaise: number;
  returnBasisPoints: number;
  isCurrentTeam?: boolean;
}

interface UseLeaderboardResult {
  leaderboard: LeaderboardEntry[];
  isLoading: boolean;
  error: string | null;
  isRefetching: boolean;
  refetch: () => Promise<void>;
}

interface LeaderboardRpcEntry {
  rank: number;
  team_id: string;
  team_name: string;
  portfolio_value_paise: number;
  pnl_paise: number;
  return_basis_points: number;
}

interface LeaderboardRpcResponse {
  ok: boolean;
  leaderboard: LeaderboardRpcEntry[];
}

function parseLeaderboardEntries(
  jsonEntries: LeaderboardRpcEntry[]
): LeaderboardEntry[] {
  if (!jsonEntries) return [];
  return jsonEntries.map((e) => ({
    rank: e.rank != null ? Number(e.rank) : 0,
    teamId: e.team_id != null ? String(e.team_id) : "",
    teamName: e.team_name != null ? String(e.team_name) : "Unknown Team",
    portfolioValuePaise:
      e.portfolio_value_paise != null ? Number(e.portfolio_value_paise) : 0,
    pnlPaise: e.pnl_paise != null ? Number(e.pnl_paise) : 0,
    returnBasisPoints:
      e.return_basis_points != null ? Number(e.return_basis_points) : 0,
    isCurrentTeam: undefined,
  }));
}

export function useLeaderboard(): UseLeaderboardResult {
  // Extract competition run ID and user's team ID from the competition context.
  // Must be called from a React component (hook rule).
  const { context } = useCompetitionContext();
  const competitionRunId = (context?.competitionRun?.id ?? null);
  let userTeamId: string | null = null;
  if (context?.role === "participant") {
    userTeamId = context.userId ?? null;
  }

  const supabase = useMemo(() => createClient(), []);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefetching, setIsRefetching] = useState(false);
  const firstFetchRef = useRef(true);

  const fetchLeaderboard = useCallback(
    async () => {
      if (!competitionRunId) {
        setLeaderboard([]);
        setError(null);
        setIsLoading(false);
        return;
      }

      if (firstFetchRef.current) {
        setIsLoading(true);
      }
      setIsRefetching(true);
      setError(null);

      try {
        const { data, error: rpcError } = await supabase.rpc("get_leaderboard", {
          p_competition_run_id: competitionRunId,
        });

        if (rpcError) throw new Error(mapRpcError(rpcError.message, "the leaderboard"));

        const response = data as LeaderboardRpcResponse;
        if (!response || !response.ok) {
          throw new Error("Unable to load the leaderboard. Please try again.");
        }

        const parsed = parseLeaderboardEntries(response.leaderboard);
        const marked = parsed.map((entry) => ({
          ...entry,
          isCurrentTeam: entry.teamId === userTeamId,
        }));
        setLeaderboard(marked);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unable to load the leaderboard. Please try again.";
        setError(message);
        setLeaderboard([]);
      } finally {
        setIsLoading(false);
        setIsRefetching(false);
      }
    },
    [competitionRunId, userTeamId, supabase]
  );

  useEffect(() => {
    if (firstFetchRef.current) {
      firstFetchRef.current = false;
      fetchLeaderboard();
    }
  }, [fetchLeaderboard]);

  const refetch = useCallback(() => {
    return fetchLeaderboard();
  }, [fetchLeaderboard]);

  // Polling fallback: refetch every 10 seconds while a run is active
  useEffect(() => {
    if (!competitionRunId) return;
    const id = setInterval(() => fetchLeaderboard(), 10_000);
    return () => clearInterval(id);
  }, [competitionRunId, fetchLeaderboard]);

  return {
    leaderboard,
    isLoading,
    error,
    isRefetching,
    refetch,
  };
}
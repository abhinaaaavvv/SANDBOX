/**
 * useHoldings Hook
 *
 * Fetches real holdings from Supabase via get_team_holdings() RPC.
 * Returns data in the existing Holding type format.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCompetitionContext } from "@/lib/competition-context";
import { Holding } from "@/types/sandbox";
import { mapRpcError } from "@/lib/errors";

interface HoldingsRpcRow {
  stock_id: string;
  stock_symbol: string;
  stock_name: string;
  quantity: number;
  current_price_paise: number;
  market_value_paise: number;
  average_buy_price_paise: number;
}

interface HoldingsRpcResponse {
  ok: boolean;
  team_id: string;
  competition_run_id: string;
  holdings: HoldingsRpcRow[];
  error?: string;
}

function transformHolding(row: HoldingsRpcRow): Holding {
  const currentPrice = row.current_price_paise / 100;
  const averageBuyPrice = row.average_buy_price_paise / 100;
  const totalValue = row.market_value_paise / 100;
  const unrealizedPL = totalValue - row.quantity * averageBuyPrice;
  const unrealizedPLPercent =
    row.quantity > 0 && averageBuyPrice > 0
      ? (unrealizedPL / (row.quantity * averageBuyPrice)) * 100
      : 0;

  return {
    stockId: row.stock_id,
    symbol: row.stock_symbol,
    name: row.stock_name,
    quantity: row.quantity,
    averageBuyPrice,
    currentPrice,
    totalValue,
    unrealizedPL,
    unrealizedPLPercent,
  };
}

export function useHoldings() {
  const { context } = useCompetitionContext();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefetching, setIsRefetching] = useState(false);

  const supabase = useMemo(() => createClient(), []);
  const competitionRunId = context?.competitionRun?.id;
  const prevRunIdRef = useRef<string | undefined>(competitionRunId);

  const fetchHoldings = useCallback(async () => {
    if (!competitionRunId) return;
    setIsRefetching(true);
    try {
      const { data, error: rpcError } = await supabase.rpc("get_team_holdings", {
        p_competition_run_id: competitionRunId,
      });

      if (rpcError) throw new Error(mapRpcError(rpcError.message, "your holdings"));

      const response = data as HoldingsRpcResponse;
      if (!response.ok) {
        throw new Error(mapRpcError(response.error || "Failed to fetch holdings", "your holdings"));
      }

      setHoldings(response.holdings.map(transformHolding));
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load your holdings. Please try again.";
      setError(message);
    } finally {
      setIsRefetching(false);
    }
  }, [supabase, competitionRunId]);

  useEffect(() => {
    if (!competitionRunId) {
      return;
    }

    if (prevRunIdRef.current === competitionRunId && holdings.length > 0) {
      return;
    }
    prevRunIdRef.current = competitionRunId;

    let cancelled = false;

    const load = async () => {
      try {
        setError(null);
        const { data, error: rpcError } = await supabase.rpc("get_team_holdings", {
          p_competition_run_id: competitionRunId,
        });

        if (rpcError) throw new Error(mapRpcError(rpcError.message, "your holdings"));

        const response = data as HoldingsRpcResponse;
        if (!response.ok) {
          throw new Error(mapRpcError(response.error || "Failed to fetch holdings", "your holdings"));
        }

        if (!cancelled) {
          setHoldings(response.holdings.map(transformHolding));
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Unable to load your holdings. Please try again.";
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [supabase, competitionRunId]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasRun = Boolean(competitionRunId);

  // Polling fallback: refetch every 10 seconds while a run is active
  useEffect(() => {
    if (!competitionRunId || isLoading) return;
    const id = setInterval(() => fetchHoldings(), 2_000);
    return () => clearInterval(id);
  }, [competitionRunId, isLoading, fetchHoldings]);

  return {
    holdings: hasRun ? holdings : [],
    isLoading: hasRun ? isLoading : false,
    error: hasRun ? error : null,
    refetch: fetchHoldings,
    isRefetching,
  };
}

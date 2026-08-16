/**
 * useTradeHistory Hook
 *
 * Fetches real trade history from Supabase trades table.
 * Returns data in the existing Transaction type format.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCompetitionContext } from "@/lib/competition-context";
import { Transaction } from "@/types/sandbox";

interface DbTrade {
  id: string;
  stock_id: string;
  side: string;
  quantity: number;
  executed_price_paise: number;
  total_value_paise: number;
  executed_at: string;
}

interface StockInfo {
  symbol: string;
  name: string;
}

function transformTrade(trade: DbTrade, stockMap: Map<string, StockInfo>): Transaction {
  const stock = stockMap.get(trade.stock_id);
  return {
    id: trade.id,
    timestamp: new Date(trade.executed_at).toLocaleTimeString(),
    symbol: stock?.symbol ?? "???",
    companyName: stock?.name ?? "Unknown",
    type: trade.side === "buy" ? "BUY" : "SELL",
    quantity: trade.quantity,
    price: trade.executed_price_paise / 100,
    total: trade.total_value_paise / 100,
  };
}

export function useTradeHistory(stockMap?: Map<string, StockInfo>) {
  const { context } = useCompetitionContext();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefetching, setIsRefetching] = useState(false);

  const supabase = useMemo(() => createClient(), []);
  const competitionRunId = context?.competitionRun?.id;
  const prevRunIdRef = useRef<string | undefined>(competitionRunId);

  const fetchTrades = useCallback(async () => {
    if (!competitionRunId) return;
    setIsRefetching(true);
    try {
      const { data, error: queryError } = await supabase
        .from("trades")
        .select(`
          id,
          stock_id,
          side,
          quantity,
          executed_price_paise,
          total_value_paise,
          executed_at
        `)
        .eq("competition_run_id", competitionRunId)
        .order("executed_at", { ascending: false });

      if (queryError) throw new Error(queryError.message);

      setTransactions((data as DbTrade[]).map((t) => transformTrade(t, stockMap ?? new Map())));
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch trade history";
      setError(message);
    } finally {
      setIsRefetching(false);
    }
  }, [supabase, competitionRunId, stockMap]);

  useEffect(() => {
    if (!competitionRunId) {
      return;
    }

    if (prevRunIdRef.current === competitionRunId && transactions.length > 0) {
      return;
    }
    prevRunIdRef.current = competitionRunId;

    let cancelled = false;

    const load = async () => {
      try {
        setError(null);
        const { data, error: queryError } = await supabase
          .from("trades")
          .select(`
            id,
            stock_id,
            side,
            quantity,
            executed_price_paise,
            total_value_paise,
            executed_at
          `)
          .eq("competition_run_id", competitionRunId)
          .order("executed_at", { ascending: false });

        if (queryError) throw new Error(queryError.message);

        if (!cancelled) {
          setTransactions((data as DbTrade[]).map((t) => transformTrade(t, stockMap ?? new Map())));
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Failed to fetch trade history";
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
  }, [supabase, competitionRunId, stockMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasRun = Boolean(competitionRunId);

  return {
    transactions: hasRun ? transactions : [],
    isLoading: hasRun ? isLoading : false,
    error: hasRun ? error : null,
    refetch: fetchTrades,
    isRefetching,
  };
}

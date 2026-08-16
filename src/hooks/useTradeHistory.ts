/**
 * useTradeHistory Hook
 *
 * Fetches real trade history + dividend payments from Supabase.
 * Returns data in the existing Transaction type format, sorted by time descending.
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

interface DbDividendPayment {
  id: string;
  stock_id: string;
  shares_held: number;
  amount_per_share_paise: number;
  total_amount_paise: number;
  created_at: string;
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
    _sortTime: new Date(trade.executed_at).getTime(),
  };
}

function transformDividend(payment: DbDividendPayment, stockMap: Map<string, StockInfo>): Transaction {
  const stock = stockMap.get(payment.stock_id);
  return {
    id: payment.id,
    timestamp: new Date(payment.created_at).toLocaleTimeString(),
    symbol: stock?.symbol ?? "???",
    companyName: stock?.name ?? "Unknown",
    type: "DIVIDEND",
    quantity: payment.shares_held,
    price: payment.amount_per_share_paise / 100,
    total: payment.total_amount_paise / 100,
    _sortTime: new Date(payment.created_at).getTime(),
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
  const teamId = context?.role === "participant" ? context.userId : null;
  const prevRunIdRef = useRef<string | undefined>(competitionRunId);

  const fetchTrades = useCallback(async () => {
    if (!competitionRunId) return;
    setIsRefetching(true);
    try {
      const [tradesResult, dividendsResult] = await Promise.all([
        supabase
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
          .order("executed_at", { ascending: false }),
        teamId
          ? supabase
              .from("dividend_payments")
              .select(`
                id,
                stock_id,
                shares_held,
                amount_per_share_paise,
                total_amount_paise,
                created_at
              `)
              .eq("competition_run_id", competitionRunId)
              .eq("team_id", teamId)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (tradesResult.error) throw new Error(tradesResult.error.message);
      if (dividendsResult.error) throw new Error(dividendsResult.error.message);

      const sm = stockMap ?? new Map();
      const tradeTxs = (tradesResult.data as DbTrade[]).map((t) => transformTrade(t, sm));
      const dividendTxs = (dividendsResult.data as DbDividendPayment[]).map((d) => transformDividend(d, sm));

      const merged = [...tradeTxs, ...dividendTxs].sort((a, b) => (b._sortTime ?? 0) - (a._sortTime ?? 0));
      setTransactions(merged);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch trade history";
      setError(message);
    } finally {
      setIsRefetching(false);
    }
  }, [supabase, competitionRunId, teamId, stockMap]);

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
        const [tradesResult, dividendsResult] = await Promise.all([
          supabase
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
            .order("executed_at", { ascending: false }),
          teamId
            ? supabase
                .from("dividend_payments")
                .select(`
                  id,
                  stock_id,
                  shares_held,
                  amount_per_share_paise,
                  total_amount_paise,
                  created_at
                `)
                .eq("competition_run_id", competitionRunId)
                .eq("team_id", teamId)
                .order("created_at", { ascending: false })
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (tradesResult.error) throw new Error(tradesResult.error.message);
        if (dividendsResult.error) throw new Error(dividendsResult.error.message);

        if (!cancelled) {
          const sm = stockMap ?? new Map();
          const tradeTxs = (tradesResult.data as DbTrade[]).map((t) => transformTrade(t, sm));
          const dividendTxs = (dividendsResult.data as DbDividendPayment[]).map((d) => transformDividend(d, sm));

          const merged = [...tradeTxs, ...dividendTxs].sort((a, b) => (b._sortTime ?? 0) - (a._sortTime ?? 0));
          setTransactions(merged);
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
  }, [supabase, competitionRunId, teamId, stockMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasRun = Boolean(competitionRunId);

  // Polling fallback: refetch every 10 seconds while a run is active
  useEffect(() => {
    if (!hasRun || isLoading) return;
    const id = setInterval(() => fetchTrades(), 2_000);
    return () => clearInterval(id);
  }, [hasRun, isLoading, fetchTrades]);

  return {
    transactions: hasRun ? transactions : [],
    isLoading: hasRun ? isLoading : false,
    error: hasRun ? error : null,
    refetch: fetchTrades,
    isRefetching,
  };
}

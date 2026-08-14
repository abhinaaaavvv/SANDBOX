/**
 * useMarketData Hook
 *
 * Fetches authoritative market data from Supabase:
 * - stocks (global stock definitions)
 * - market_quotes (current prices for the active competition run)
 *
 * Returns data in the existing Stock type format for backward compatibility.
 *
 * Does NOT handle:
 * - Pending price changes (admin-only)
 * - Price change batches (admin-only)
 * - Holdings, trades, portfolio (later phases)
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCompetitionContext } from "@/lib/competition-context";
import { Stock } from "@/types/sandbox";
import { dbStocksToStocks } from "@/lib/market-adapter";

// ---------------------------------------------------------------------------
// Query functions
// ---------------------------------------------------------------------------

/**
 * Fetch all active stocks with current market prices for the active competition run.
 *
 * Uses a LEFT JOIN to include ALL active stocks, even those without a market
 * quote for the current run. Stocks without quotes are returned with
 * quoteAvailable: false so the UI shows an appropriate unavailable state.
 *
 * Does NOT filter out stocks with missing quotes — that would silently hide
 * a data-integrity problem.
 */
async function fetchMarketStocks(
  supabase: ReturnType<typeof createClient>,
  competitionRunId: string
): Promise<Stock[]> {
  const { data, error } = await supabase
    .from("stocks")
    .select(`
      id,
      symbol,
      name,
      description,
      is_active,
      market_quotes(
        price_paise,
        updated_at,
        competition_run_id
      )
    `)
    .eq("is_active", true)
    .eq("market_quotes.competition_run_id", competitionRunId);

  if (error) {
    throw new Error(`Failed to fetch market data: ${error.message}`);
  }

  if (!data) {
    return [];
  }

  return dbStocksToStocks(data);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook for fetching authoritative market data from Supabase.
 *
 * Usage:
 * ```tsx
 * const { stocks, isLoading, error, refetch } = useMarketData();
 *
 * if (isLoading) return <Loading />;
 * if (error) return <Error message={error} />;
 *
 * // stocks is Stock[] compatible with existing components
 * ```
 */
export function useMarketData() {
  const { context } = useCompetitionContext();
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefetching, setIsRefetching] = useState(false);

  const supabase = useMemo(() => createClient(), []);
  const competitionRunId = context?.competitionRun?.id;
  const prevRunIdRef = useRef<string | undefined>(competitionRunId);

  // Refetch function (exposed to components)
  const refetch = useCallback(async () => {
    if (!competitionRunId) return;
    setIsRefetching(true);
    try {
      const data = await fetchMarketStocks(supabase, competitionRunId);
      setStocks(data);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch market data";
      setError(message);
    } finally {
      setIsRefetching(false);
    }
  }, [supabase, competitionRunId]);

  // Fetch when competition run changes
  useEffect(() => {
    if (!competitionRunId) {
      // Reset state via ref to avoid setState in effect body
      return;
    }

    // Skip if run ID hasn't changed
    if (prevRunIdRef.current === competitionRunId && stocks.length > 0) {
      return;
    }
    prevRunIdRef.current = competitionRunId;

    let cancelled = false;

    const load = async () => {
      try {
        setError(null);
        const data = await fetchMarketStocks(supabase, competitionRunId);
        if (!cancelled) {
          setStocks(data);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Failed to fetch market data";
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

  // Reset stocks when there's no competition run
  const hasRun = Boolean(competitionRunId);
  const effectiveStocks = hasRun ? stocks : [];
  const effectiveIsLoading = hasRun ? isLoading : false;

  return {
    stocks: effectiveStocks,
    isLoading: effectiveIsLoading,
    error: hasRun ? error : null,
    refetch,
    isRefetching,
  };
}

// ---------------------------------------------------------------------------
// Selector hooks
// ---------------------------------------------------------------------------

/**
 * Get a single stock by ID.
 */
export function useStock(stockId: string | null) {
  const { stocks, isLoading, error } = useMarketData();
  return useMemo(
    () => ({
      stock: stocks.find((s) => s.id === stockId) ?? null,
      isLoading,
      error,
    }),
    [stocks, stockId, isLoading, error]
  );
}

/**
 * Get a stock by symbol.
 */
export function useStockBySymbol(symbol: string | null) {
  const { stocks, isLoading, error } = useMarketData();
  return useMemo(
    () => ({
      stock: stocks.find((s) => s.symbol === symbol) ?? null,
      isLoading,
      error,
    }),
    [stocks, symbol, isLoading, error]
  );
}

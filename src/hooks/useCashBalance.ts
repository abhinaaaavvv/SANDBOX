/**
 * useCashBalance Hook
 *
 * Fetches the participant's authoritative cash balance from the
 * cash_ledger table. Cash = SUM(amount_paise) across all ledger entries
 * for the team's competition run.
 *
 * Supabase Realtime events trigger `refetch()`; the interval here is only
 * a low-frequency availability fallback per SANDBOX_REALTIME_ARCHITECTURE.md.
 */

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCompetitionContext } from "@/lib/competition-context";
import { mapQueryError } from "@/lib/errors";

/** Fallback poll cadence while Realtime is unavailable. */
const FALLBACK_POLL_MS = 15_000;

interface LedgerTotals {
  totalPaise: number;
  initCapitalPaise: number;
}

export function useCashBalance() {
  const { context } = useCompetitionContext();
  const [cash, setCash] = useState(0);
  const [initialCapital, setInitialCapital] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefetching, setIsRefetching] = useState(false);

  const supabase = useCallback(() => createClient(), [])();
  const competitionRunId = context?.competitionRun?.id;
  const teamId = context?.role === "participant" ? context.userId : undefined;
  const hasData = Boolean(competitionRunId && teamId);

  /** Pure fetch — resolves totals without touching state. */
  const fetchLedgerTotals = useCallback(async (): Promise<LedgerTotals | null> => {
    if (!competitionRunId || !teamId) return null;
    try {
      const { data, error: queryError } = await supabase
        .from("cash_ledger")
        .select("amount_paise, entry_type")
        .eq("competition_run_id", competitionRunId)
        .eq("team_id", teamId);

      if (queryError) throw new Error(mapQueryError(queryError.message, "your cash balance"));

      let totalPaise = 0;
      let initCapitalPaise = 0;
      for (const row of data ?? []) {
        totalPaise += row.amount_paise ?? 0;
        if (row.entry_type === "initial_capital") {
          initCapitalPaise = row.amount_paise ?? 0;
        }
      }
      return { totalPaise, initCapitalPaise };
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load your cash balance. Please try again."
      );
      return null;
    }
  }, [supabase, competitionRunId, teamId]);

  // Initial + identity-change load.
  useEffect(() => {
    if (!hasData) return;
    let cancelled = false;
    void (async () => {
      const totals = await fetchLedgerTotals();
      if (cancelled) return;
      if (totals) {
        setCash(totals.totalPaise / 100);
        setInitialCapital(totals.initCapitalPaise / 100);
        setError(null);
      }
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [hasData, fetchLedgerTotals]);

  // Low-frequency fallback poll — never the primary sync mechanism.
  useEffect(() => {
    if (!hasData) return;
    let cancelled = false;
    const id = setInterval(() => {
      void (async () => {
        const totals = await fetchLedgerTotals();
        if (cancelled || !totals) return;
        setCash(totals.totalPaise / 100);
        setInitialCapital(totals.initCapitalPaise / 100);
      })();
    }, FALLBACK_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [hasData, fetchLedgerTotals]);

  /** Manual refetch (realtime handlers, pull-to-refresh). */
  const refetch = useCallback(async () => {
    if (!hasData) return;
    setIsRefetching(true);
    const totals = await fetchLedgerTotals();
    if (totals) {
      setCash(totals.totalPaise / 100);
      setInitialCapital(totals.initCapitalPaise / 100);
      setError(null);
    }
    setIsRefetching(false);
    setIsLoading(false);
  }, [hasData, fetchLedgerTotals]);

  return {
    cash: hasData ? cash : 0,
    initialCapital: hasData ? initialCapital : 0,
    isLoading: hasData ? isLoading : false,
    error: hasData ? error : null,
    refetch,
    isRefetching,
  };
}

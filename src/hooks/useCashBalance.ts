/**
 * useCashBalance Hook
 *
 * Fetches real cash balance from Supabase cash_ledger table.
 * Cash = SUM(amount_paise) for the team's competition run.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCompetitionContext } from "@/lib/competition-context";
import { mapQueryError } from "@/lib/errors";

export function useCashBalance() {
  const { context } = useCompetitionContext();
  const [cash, setCash] = useState(0);
  const [initialCapital, setInitialCapital] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefetching, setIsRefetching] = useState(false);

  const supabase = useMemo(() => createClient(), []);
  const competitionRunId = context?.competitionRun?.id;
  const teamId = context?.role === "participant" ? context.userId : undefined;
  const prevRunIdRef = useRef<string | undefined>(competitionRunId);

  const fetchCash = useCallback(async () => {
    if (!competitionRunId || !teamId) return;
    setIsRefetching(true);
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
      setCash(totalPaise / 100);
      setInitialCapital(initCapitalPaise / 100);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load your cash balance. Please try again.";
      setError(message);
    } finally {
      setIsRefetching(false);
    }
  }, [supabase, competitionRunId, teamId]);

  useEffect(() => {
    if (!competitionRunId || !teamId) {
      return;
    }

    if (prevRunIdRef.current === competitionRunId) {
      return;
    }
    prevRunIdRef.current = competitionRunId;

    let cancelled = false;

    const load = async () => {
      try {
        setError(null);
        const { data, error: queryError } = await supabase
          .from("cash_ledger")
          .select("amount_paise, entry_type")
          .eq("competition_run_id", competitionRunId)
          .eq("team_id", teamId);

        if (queryError) throw new Error(mapQueryError(queryError.message, "your cash balance"));

        if (!cancelled) {
          let totalPaise = 0;
          let initCapitalPaise = 0;
          for (const row of data ?? []) {
            totalPaise += row.amount_paise ?? 0;
            if (row.entry_type === "initial_capital") {
              initCapitalPaise = row.amount_paise ?? 0;
            }
          }
          setCash(totalPaise / 100);
          setInitialCapital(initCapitalPaise / 100);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Unable to load your cash balance. Please try again.";
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
  }, [supabase, competitionRunId, teamId]);

  const hasData = Boolean(competitionRunId && teamId);

  return {
    cash: hasData ? cash : 0,
    initialCapital: hasData ? initialCapital : 0,
    isLoading: hasData ? isLoading : false,
    error: hasData ? error : null,
    refetch: fetchCash,
    isRefetching,
  };
}

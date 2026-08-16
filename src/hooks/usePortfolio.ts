/**
 * usePortfolio Hook
 *
 * Authoritative portfolio data from get_team_portfolio() RPC.
 * Returns integer paise values — no floating-point conversion.
 *
 * Formulas (Phase 6):
 *   cash_balance_paise     = SUM(cash_ledger.amount_paise)
 *   holdings_value_paise   = SUM(holdings.quantity × market_quotes.price_paise)
 *   portfolio_value_paise  = cash_balance_paise + holdings_value_paise
 *   initial_capital_paise  = SUM(cash_ledger.amount_paise WHERE entry_type = 'initial_capital')
 *   pnl_paise              = portfolio_value_paise - initial_capital_paise
 *   return_basis_points    = (pnl_paise × 10000) / initial_capital_paise
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCompetitionContext } from "@/lib/competition-context";
import { mapRpcError } from "@/lib/errors";

export interface Portfolio {
  cashBalancePaise: number;
  holdingsValuePaise: number;
  portfolioValuePaise: number;
  initialCapitalPaise: number;
  pnlPaise: number;
  returnBasisPoints: number;
}

interface PortfolioRpcResponse {
  ok: boolean;
  team_id: string;
  competition_run_id: string;
  cash_balance_paise: number;
  holdings_value_paise: number;
  portfolio_value_paise: number;
  initial_capital_paise: number;
  pnl_paise: number;
  return_basis_points: number;
  error?: string;
}

export function usePortfolio() {
  const { context } = useCompetitionContext();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefetching, setIsRefetching] = useState(false);

  const supabase = useMemo(() => createClient(), []);
  const competitionRunId = context?.competitionRun?.id;
  const prevRunIdRef = useRef<string | undefined>(competitionRunId);

  const fetchPortfolio = useCallback(async () => {
    if (!competitionRunId) return;
    setIsRefetching(true);
    try {
      const { data, error: rpcError } = await supabase.rpc("get_team_portfolio", {
        p_competition_run_id: competitionRunId,
      });

      if (rpcError) throw new Error(mapRpcError(rpcError.message, "your portfolio"));

      const response = data as PortfolioRpcResponse;
      if (!response.ok) {
        throw new Error(mapRpcError(response.error || "Failed to fetch portfolio", "your portfolio"));
      }

      setPortfolio({
        cashBalancePaise: response.cash_balance_paise,
        holdingsValuePaise: response.holdings_value_paise,
        portfolioValuePaise: response.portfolio_value_paise,
        initialCapitalPaise: response.initial_capital_paise,
        pnlPaise: response.pnl_paise,
        returnBasisPoints: response.return_basis_points,
      });
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load your portfolio. Please try again.";
      setError(message);
    } finally {
      setIsRefetching(false);
    }
  }, [supabase, competitionRunId]);

  useEffect(() => {
    if (!competitionRunId) {
      return;
    }

    if (prevRunIdRef.current === competitionRunId && portfolio !== null) {
      return;
    }
    prevRunIdRef.current = competitionRunId;

    let cancelled = false;

    const load = async () => {
      try {
        setError(null);
        const { data, error: rpcError } = await supabase.rpc("get_team_portfolio", {
          p_competition_run_id: competitionRunId,
        });

        if (rpcError) throw new Error(mapRpcError(rpcError.message, "your portfolio"));

        const response = data as PortfolioRpcResponse;
        if (!response.ok) {
          throw new Error(mapRpcError(response.error || "Failed to fetch portfolio", "your portfolio"));
        }

        if (!cancelled) {
          setPortfolio({
            cashBalancePaise: response.cash_balance_paise,
            holdingsValuePaise: response.holdings_value_paise,
            portfolioValuePaise: response.portfolio_value_paise,
            initialCapitalPaise: response.initial_capital_paise,
            pnlPaise: response.pnl_paise,
            returnBasisPoints: response.return_basis_points,
          });
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Unable to load your portfolio. Please try again.";
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

  return {
    portfolio: hasRun ? portfolio : null,
    isLoading: hasRun ? isLoading : false,
    error: hasRun ? error : null,
    refetch: fetchPortfolio,
    isRefetching,
  };
}

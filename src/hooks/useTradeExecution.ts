/**
 * useTradeExecution Hook
 *
 * Executes trades via the real execute_trade() RPC.
 * Returns a function that calls the RPC and maps errors to user-friendly messages.
 */

import { useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCompetitionContext } from "@/lib/competition-context";
import { TradeResponseDto } from "@/types/realtime";

interface ExecuteTradeRpcResponse {
  ok: boolean;
  trade_id?: string;
  side?: string;
  stock_id?: string;
  stock_symbol?: string;
  quantity?: number;
  executed_price_paise?: number;
  total_value_paise?: number;
  executed_at?: string;
  idempotency_key?: string;
  error?: string;
}

/** Map backend error codes to user-friendly messages. */
function mapTradeError(error: string): string {
  const lower = error.toLowerCase();
  if (lower.includes("auth_required")) return "You must be signed in to trade.";
  if (lower.includes("team_not_found")) return "No team found for your account.";
  if (lower.includes("team_not_participating")) return "Your team is not participating in this competition.";
  if (lower.includes("competition_run_not_found")) return "Competition not found.";
  if (lower.includes("invalid_state") && lower.includes("competition run"))
    return "This competition run is no longer active.";
  if (lower.includes("trading_not_allowed")) return "Trading is not currently allowed.";
  if (lower.includes("market_closed") || lower.includes("market_status"))
    return "The market is currently closed.";
  if (lower.includes("trading_paused")) return "Trading is currently paused.";
  if (lower.includes("round")) return "No active round for trading.";
  if (lower.includes("stock_not_found")) return "Stock not found.";
  if (lower.includes("stock_inactive")) return "This stock is no longer active.";
  if (lower.includes("no_market_quote")) return "No price available for this stock.";
  if (lower.includes("invalid_side")) return "Invalid trade side.";
  if (lower.includes("invalid_quantity")) return "Enter a valid quantity.";
  if (lower.includes("insufficient_cash")) return "Insufficient cash for this purchase.";
  if (lower.includes("insufficient_holdings")) return "You don't own enough shares to sell.";
  if (lower.includes("idempotency_conflict")) return "A trade with this request is already being processed.";
  // Generic fallback — do not expose raw SQL errors
  return "Trade failed. Please try again.";
}

export function useTradeExecution() {
  const { context } = useCompetitionContext();
  const supabase = useMemo(() => createClient(), []);
  const competitionRunId = context?.competitionRun?.id;

  const executeTrade = useCallback(
    async (
      stockId: string,
      side: "buy" | "sell",
      quantity: number,
      idempotencyKey?: string
    ): Promise<TradeResponseDto> => {
      if (!competitionRunId) {
        return { success: false, message: "No active competition." };
      }

      try {
        const { data, error: rpcError } = await supabase.rpc("execute_trade", {
          p_competition_run_id: competitionRunId,
          p_stock_id: stockId,
          p_side: side,
          p_quantity: quantity,
          p_idempotency_key: idempotencyKey ?? null,
        });

        if (rpcError) {
          return { success: false, message: mapTradeError(rpcError.message) };
        }

        const response = data as ExecuteTradeRpcResponse;
        if (!response.ok) {
          return { success: false, message: mapTradeError(response.error ?? "Unknown error") };
        }

        return {
          success: true,
          message: `${side === "buy" ? "Bought" : "Sold"} ${quantity} share(s) of ${response.stock_symbol ?? ""}.`,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Trade failed unexpectedly.";
        return { success: false, message: mapTradeError(message) };
      }
    },
    [supabase, competitionRunId]
  );

  const executeBuy = useCallback(
    (stockId: string, quantity: number) =>
      executeTrade(stockId, "buy", quantity),
    [executeTrade]
  );

  const executeSell = useCallback(
    (stockId: string, quantity: number) =>
      executeTrade(stockId, "sell", quantity),
    [executeTrade]
  );

  return { executeBuy, executeSell };
}

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
import { mapRpcError } from "@/lib/errors";

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
      const key = idempotencyKey ?? crypto.randomUUID();

      try {
        const { data, error: rpcError } = await supabase.rpc("execute_trade", {
          p_competition_run_id: competitionRunId,
          p_stock_id: stockId,
          p_side: side,
          p_quantity: quantity,
          p_idempotency_key: key,
        });

        if (rpcError) {
          return { success: false, message: mapRpcError(rpcError.message) };
        }

        const response = data as ExecuteTradeRpcResponse;
        if (!response.ok) {
          return { success: false, message: mapRpcError(response.error ?? "Unknown error") };
        }

        return {
          success: true,
          message: `${side === "buy" ? "Bought" : "Sold"} ${quantity} share(s) of ${response.stock_symbol ?? ""}.`,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Trade failed unexpectedly.";
        return { success: false, message: mapRpcError(message) };
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

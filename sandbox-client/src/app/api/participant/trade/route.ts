import { NextResponse } from "next/server";
import { requireParticipantContext } from "@/lib/backend/session";
import { tradeRequestSchema } from "@/lib/backend/schema";
import { toErrorResponse } from "@/lib/backend/errors";

export async function POST(request: Request) {
  try {
    const ctx = await requireParticipantContext();

    const body = tradeRequestSchema.parse(await request.json());
    const { error } = await ctx.supabase.rpc("execute_trade", {
      p_side: body.type,
      p_stock_id: body.stockId,
      p_quantity: body.quantity,
      p_idempotency_key: body.idempotencyKey,
    });
    if (error) throw error;

    const { data: state, error: stateError } = await ctx.supabase.rpc("get_participant_state");
    if (stateError) throw stateError;

    const snapshot = state as Record<string, unknown>;
    const transactions = Array.isArray(snapshot.transactions) ? snapshot.transactions : [];
    const transaction = transactions[0] ?? undefined;

    return NextResponse.json({
      success: true,
      message: "Success",
      transaction,
      updatedCash: snapshot.cash,
      updatedHoldings: snapshot.holdings,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

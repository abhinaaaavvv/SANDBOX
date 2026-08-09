import { NextResponse } from "next/server";
import { getRequestContext } from "@/lib/backend/session";
import { cashAdjustmentSchema } from "@/lib/backend/schema";
import { rupeesToPaise } from "@/lib/backend/money";
import { toErrorResponse } from "@/lib/backend/errors";

export async function POST(request: Request) {
  try {
    const ctx = await getRequestContext();
    if (ctx.role !== "admin") throw new Error("FORBIDDEN");

    const body = cashAdjustmentSchema.parse(await request.json());
    const amount = Number(rupeesToPaise(body.amount));
    const fn = body.action === "CREDIT" ? "credit_cash" : "debit_cash";
    const { data, error } = await ctx.supabase.rpc(fn, {
      p_team_id: body.teamId,
      p_amount: amount,
      p_reason: body.reason,
      p_idempotency_key: body.idempotencyKey,
    });
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return toErrorResponse(error);
  }
}

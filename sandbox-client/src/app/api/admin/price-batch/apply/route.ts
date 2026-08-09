import { NextResponse } from "next/server";
import { getRequestContext } from "@/lib/backend/session";
import { applyPriceBatchSchema } from "@/lib/backend/schema";
import { toErrorResponse } from "@/lib/backend/errors";

export async function POST(request: Request) {
  try {
    const ctx = await getRequestContext();
    if (ctx.role !== "admin") throw new Error("FORBIDDEN");

    const body = applyPriceBatchSchema.parse(await request.json());
    const { data, error } = await ctx.supabase.rpc("apply_price_changes", {
      p_batch_id: body.batchId,
      p_idempotency_key: body.idempotencyKey,
    });
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return toErrorResponse(error);
  }
}

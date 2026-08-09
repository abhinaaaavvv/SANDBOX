import { NextResponse } from "next/server";
import { getRequestContext } from "@/lib/backend/session";
import { createPriceBatchSchema } from "@/lib/backend/schema";
import { rupeesToPaise } from "@/lib/backend/money";
import { toErrorResponse } from "@/lib/backend/errors";

export async function POST(request: Request) {
  try {
    const ctx = await getRequestContext();
    if (ctx.role !== "admin") throw new Error("FORBIDDEN");

    const body = createPriceBatchSchema.parse(await request.json());
    const changes = body.changes.map((change) => ({
      stockId: change.stockId,
      newPrice: Number(rupeesToPaise(change.newPrice)),
    }));

    const { data, error } = await ctx.supabase.rpc("create_price_batch", {
      p_changes: changes,
      p_idempotency_key: body.idempotencyKey,
    });
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return toErrorResponse(error);
  }
}

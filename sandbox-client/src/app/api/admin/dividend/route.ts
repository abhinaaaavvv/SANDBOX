import { NextResponse } from "next/server";
import { getRequestContext } from "@/lib/backend/session";
import { dividendSchema } from "@/lib/backend/schema";
import { rupeesToPaise } from "@/lib/backend/money";
import { toErrorResponse } from "@/lib/backend/errors";

export async function POST(request: Request) {
  try {
    const ctx = await getRequestContext();
    if (ctx.role !== "admin") throw new Error("FORBIDDEN");

    const body = dividendSchema.parse(await request.json());
    const { data, error } = await ctx.supabase.rpc("pay_dividend", {
      p_stock_id: body.stockId,
      p_amount_per_share: Number(rupeesToPaise(body.amountPerShare)),
      p_idempotency_key: body.idempotencyKey,
    });
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return toErrorResponse(error);
  }
}

import { NextResponse } from "next/server";
import { getRequestContext } from "@/lib/backend/session";
import { resetSchema } from "@/lib/backend/schema";
import { toErrorResponse } from "@/lib/backend/errors";

export async function POST(request: Request) {
  try {
    const ctx = await getRequestContext();
    if (ctx.role !== "admin") throw new Error("FORBIDDEN");

    const body = resetSchema.parse(await request.json());
    const { data, error } = await ctx.supabase.rpc("new_competition_run", {
      p_confirm: body.confirm,
      p_idempotency_key: body.idempotencyKey,
    });
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return toErrorResponse(error);
  }
}

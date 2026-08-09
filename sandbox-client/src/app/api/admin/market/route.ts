import { NextResponse } from "next/server";
import { getRequestContext } from "@/lib/backend/session";
import { marketActionSchema } from "@/lib/backend/schema";
import { toErrorResponse } from "@/lib/backend/errors";

export async function POST(request: Request) {
  try {
    const ctx = await getRequestContext();
    if (ctx.role !== "admin") throw new Error("FORBIDDEN");

    const body = marketActionSchema.parse(await request.json());
    const fn =
      body.action === "OPEN"
        ? "open_market"
        : body.action === "CLOSED"
          ? "close_market"
          : body.action === "PAUSED"
            ? "pause_trading"
            : "resume_trading";

    const { data, error } = await ctx.supabase.rpc(fn);
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return toErrorResponse(error);
  }
}

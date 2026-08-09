import { NextResponse } from "next/server";
import { getRequestContext } from "@/lib/backend/session";
import { toErrorResponse } from "@/lib/backend/errors";

export async function POST() {
  try {
    const ctx = await getRequestContext();
    if (ctx.role !== "admin") throw new Error("FORBIDDEN");

    const { data, error } = await ctx.supabase.rpc("stop_video");
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return toErrorResponse(error);
  }
}

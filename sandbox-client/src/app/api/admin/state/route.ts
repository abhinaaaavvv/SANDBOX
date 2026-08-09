import { NextResponse } from "next/server";
import { getRequestContext } from "@/lib/backend/session";
import { signVideoUrls } from "@/lib/backend/media";
import { toErrorResponse } from "@/lib/backend/errors";

export async function GET() {
  try {
    const ctx = await getRequestContext();
    if (ctx.role !== "admin") {
      throw new Error("FORBIDDEN");
    }

    const { data, error } = await ctx.supabase.rpc("get_admin_state");
    if (error) throw error;

    const payload = data as { participantState?: Record<string, unknown>; pendingPriceChanges?: unknown[] };
    const participantState = payload.participantState ?? {};
    const videos = Array.isArray(participantState.videos)
      ? await signVideoUrls(ctx.admin, participantState.videos as Array<Record<string, unknown>>)
      : [];

    return NextResponse.json({
      ...payload,
      participantState: {
        ...participantState,
        videos,
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

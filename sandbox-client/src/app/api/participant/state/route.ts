import { NextResponse } from "next/server";
import { requireParticipantContext } from "@/lib/backend/session";
import { signVideoUrls } from "@/lib/backend/media";
import { toErrorResponse } from "@/lib/backend/errors";

export async function GET() {
  try {
    const ctx = await requireParticipantContext();
    const { data, error } = await ctx.supabase.rpc("get_participant_state");
    if (error) throw error;

    const payload = data as Record<string, unknown>;
    const videos = Array.isArray(payload.videos)
      ? await signVideoUrls(ctx.admin, payload.videos as Array<Record<string, unknown>>)
      : [];

    return NextResponse.json({
      ...payload,
      videos,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

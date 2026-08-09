import { NextResponse } from "next/server";
import { getRequestContext } from "@/lib/backend/session";
import { playVideoSchema } from "@/lib/backend/schema";
import { toErrorResponse } from "@/lib/backend/errors";

export async function POST(request: Request) {
  try {
    const ctx = await getRequestContext();
    if (ctx.role !== "admin") throw new Error("FORBIDDEN");

    const body = playVideoSchema.parse(await request.json());
    const { data, error } = await ctx.supabase.rpc("play_video", {
      p_video_id: body.videoId,
    });
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return toErrorResponse(error);
  }
}

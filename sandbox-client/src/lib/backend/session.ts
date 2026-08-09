import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { paiseToRupees } from "@/lib/backend/money";

export interface RequestContext {
  supabase: Awaited<ReturnType<typeof createServerClient>>;
  admin: ReturnType<typeof createAdminClient>;
  userId: string;
  role: "participant" | "admin";
  teamId: string | null;
  teamName: string | null;
}

export async function getRequestContext(): Promise<RequestContext> {
  const supabase = await createServerClient();
  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("AUTH_REQUIRED");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, team_id, display_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    throw new Error("FORBIDDEN");
  }

  if (profile.role !== "admin" && profile.role !== "participant") {
    throw new Error("FORBIDDEN");
  }

  const teamId = profile.team_id ?? null;
  let teamName: string | null = profile.display_name ?? null;
  if (teamId) {
    const { data: team } = await supabase.from("teams").select("name").eq("id", teamId).maybeSingle();
    teamName = team?.name ?? teamName;
  }

  return {
    supabase,
    admin,
    userId: user.id,
    role: profile.role,
    teamId,
    teamName,
  };
}

export async function requireParticipantContext() {
  const ctx = await getRequestContext();
  if (ctx.role !== "participant" || !ctx.teamId) {
    throw new Error("FORBIDDEN");
  }
  return ctx as RequestContext & { role: "participant"; teamId: string; teamName: string };
}

export async function requireAdminContext() {
  const ctx = await getRequestContext();
  if (ctx.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
  return ctx;
}

export function toRupeeDisplay(value: number | bigint | string | null | undefined): number {
  return paiseToRupees(value ?? 0);
}

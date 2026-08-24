import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient as createServerClient } from "@/lib/supabase/server";

const createTeamSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email(),
  password: z.string().min(8).max(72),
  startingCashRupees: z.number().positive().finite(),
});

const deleteTeamSchema = z.object({
  teamId: z.string().uuid(),
  force: z.boolean().optional().default(false),
});

async function assertAdminFromSession() {
  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return { error: NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 }) };
  }

  const { data: team, error: teamError } = await supabase
    .from("teams")
    .select("id, role, blocked")
    .eq("id", user.id)
    .single();

  if (teamError || !team || team.role !== "admin" || team.blocked) {
    return { error: NextResponse.json({ ok: false, code: "FORBIDDEN" }, { status: 403 }) };
  }

  return { supabase, adminTeamId: team.id as string };
}

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(request: NextRequest) {
  const gate = await assertAdminFromSession();
  if ("error" in gate && gate.error) return gate.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_REQUEST" }, { status: 400 });
  }

  const parsed = createTeamSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, code: "INVALID_REQUEST", message: parsed.error.issues[0]?.message },
      { status: 400 }
    );
  }
  const { name, email, password, startingCashRupees } = parsed.data;

  const admin = serviceClient();

  const duplicate = await admin.from("teams").select("id").ilike("name", name).limit(1);
  if (duplicate.data && duplicate.data.length > 0) {
    return NextResponse.json(
      { ok: false, code: "DUPLICATE_TEAM_NAME", message: `Team name "${name}" is already taken` },
      { status: 409 }
    );
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    return NextResponse.json(
      { ok: false, code: "CREATE_USER_FAILED", message: createError?.message ?? "Unknown error" },
      { status: 400 }
    );
  }
  const userId = created.user.id;

  // NOTE: a trigger on auth.users (handle_new_user) already inserts a
  // placeholder team row when the auth user is created. Adopt that row
  // instead of inserting a conflicting one.
  const { error: insertError } = await admin
    .from("teams")
    .upsert(
      {
        id: userId,
        name,
        display_name: name,
        role: "participant",
        blocked: false,
      },
      { onConflict: "id" }
    );
  if (insertError) {
    // Roll back the orphaned auth user so retries start clean.
    await admin.auth.admin.deleteUser(userId);
    return NextResponse.json(
      { ok: false, code: "CREATE_TEAM_FAILED", message: insertError.message },
      { status: 500 }
    );
  }

  const activeRun = await admin
    .from("competition_runs")
    .select("id")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (activeRun.data) {
    // Insert the opening ledger entry directly — initialize_team_cash()
    // enforces an admin JWT context, which a service-role call does not have.
    const { error: fundError } = await admin.from("cash_ledger").insert({
      team_id: userId,
      competition_run_id: activeRun.data.id,
      entry_type: "initial_capital",
      amount_paise: Math.round(startingCashRupees * 100),
      description: "Initial capital",
      created_by: userId,
    });
    if (fundError) {
      return NextResponse.json(
        {
          ok: true,
          teamId: userId,
          warning: `Team created but funding failed: ${fundError.message}`,
        },
        { status: 201 }
      );
    }
  }

  return NextResponse.json({ ok: true, teamId: userId }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const gate = await assertAdminFromSession();
  if ("error" in gate && gate.error) return gate.error;
  const { supabase } = gate;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_REQUEST" }, { status: 400 });
  }

  const parsed = deleteTeamSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, code: "INVALID_REQUEST" }, { status: 400 });
  }
  const { teamId, force } = parsed.data;

  // DB-side cleanup + authorization via the SECURITY DEFINER RPC.
  const { error: rpcError } = await supabase.rpc("remove_team", {
    p_team_id: teamId,
    p_force: force,
  });
  if (rpcError) {
    return NextResponse.json(
      { ok: false, code: "REMOVE_TEAM_FAILED", message: rpcError.message },
      { status: 400 }
    );
  }

  // Best-effort auth-user removal (service role).
  const admin = serviceClient();
  await admin.auth.admin.deleteUser(teamId);

  return NextResponse.json({ ok: true, teamId });
}

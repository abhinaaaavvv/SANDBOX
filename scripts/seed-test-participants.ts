/**
 * SANDBOX — Development Test Participants & Teams
 *
 * Provisions dev/test participant accounts and teams using the Supabase Admin API.
 * This script is for local/integration testing ONLY. It must never create admin users
 * or modify the existing real admin account.
 *
 * Environment variables required (server-side only):
 *   SUPABASE_URL              — project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service role key (NEVER print this)
 *
 * Optional:
 *   SANDBOX_TEST_PASSWORD     — password for all test accounts (default: generated)
 *
 * Usage:
 *   bun run scripts/seed-test-participants.ts
 *   # or
 *   bun run seed:test-participants
 *
 * Idempotent: safe to run multiple times. Reuses existing accounts, teams, and memberships.
 *
 * Creates:
 *   5 test participant accounts (sandbox-test-{alpha-1,alpha-2,beta-1,beta-2,gamma-1}@dev.local)
 *   3 test teams (SANDBOX Test — Alpha, Beta, Gamma)
 *   5 team memberships
 */

import { createClient } from "@supabase/supabase-js";

// ── Environment validation ──────────────────────────────────────────

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`ERROR: Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

// ── Admin client ────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Types ───────────────────────────────────────────────────────────

interface TestUser {
  email: string;
  displayName: string;
}

interface TestTeam {
  name: string;
  members: string[]; // emails
}

// ── Configuration ───────────────────────────────────────────────────

const TEST_DOMAIN = "dev.local";
const TEAM_PREFIX = "SANDBOX Test —";

const TEST_USERS: TestUser[] = [
  { email: `sandbox-test-alpha-1@${TEST_DOMAIN}`, displayName: "Test Alpha 1" },
  { email: `sandbox-test-alpha-2@${TEST_DOMAIN}`, displayName: "Test Alpha 2" },
  { email: `sandbox-test-beta-1@${TEST_DOMAIN}`, displayName: "Test Beta 1" },
  { email: `sandbox-test-beta-2@${TEST_DOMAIN}`, displayName: "Test Beta 2" },
  { email: `sandbox-test-gamma-1@${TEST_DOMAIN}`, displayName: "Test Gamma 1" },
];

const TEST_TEAMS: TestTeam[] = [
  { name: `${TEAM_PREFIX} Alpha`, members: ["sandbox-test-alpha-1@dev.local", "sandbox-test-alpha-2@dev.local"] },
  { name: `${TEAM_PREFIX} Beta`, members: ["sandbox-test-beta-1@dev.local", "sandbox-test-beta-2@dev.local"] },
  { name: `${TEAM_PREFIX} Gamma`, members: ["sandbox-test-gamma-1@dev.local"] },
];

// ── Helpers ─────────────────────────────────────────────────────────

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const specials = "!@#$%^&*";
  let password = "";
  for (let i = 0; i < 16; i++) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }
  password += specials[Math.floor(Math.random() * specials.length)];
  password += Math.floor(Math.random() * 90 + 10); // 2 digits
  return password;
}

/**
 * Ensure an auth user exists for the given test user.
 * Strategy:
 *   1. Try listUsers (fast path when API works)
 *   2. Fall back to profile lookup by display_name (works when listUsers is broken)
 *   3. Try createUser; if "already exists" error, use profile lookup as last resort
 */
async function ensureAuthUser(
  user: TestUser,
  password: string,
): Promise<{ id: string; isNew: boolean }> {
  // Strategy 1: Try listUsers
  try {
    const { data: listData, error: listError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (!listError && listData?.users) {
      const match = listData.users.find(
        (u) => u.email?.toLowerCase() === user.email.toLowerCase(),
      );
      if (match?.id) {
        return { id: match.id, isNew: false };
      }
    }
  } catch {
    // listUsers failed, continue to fallback
  }

  // Strategy 2: Look up existing profile by display_name (profile.id = auth.users.id)
  // This works because the handle_new_user trigger creates profiles with the auth user's ID
  const { data: profileByDisplayName } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("display_name", user.displayName)
    .eq("role", "participant")
    .maybeSingle();

  if (profileByDisplayName) {
    return { id: profileByDisplayName.id, isNew: false };
  }

  // Strategy 3: Try to create the auth user
  const { data: createData, error: createError } = await supabase.auth.admin.createUser({
    email: user.email,
    password,
    email_confirm: true,
    user_metadata: { display_name: user.displayName },
  });

  if (!createError && createData?.user) {
    return { id: createData.user.id, isNew: true };
  }

  // If createUser says "already exists", try profile lookup one more time
  if (createError && /already/i.test(createError.message)) {
    // Retry profile lookup (might have been created between our check and now)
    const { data: retryProfile } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("display_name", user.displayName)
      .eq("role", "participant")
      .maybeSingle();

    if (retryProfile) {
      return { id: retryProfile.id, isNew: false };
    }

    throw new Error(
      `Auth user ${user.email} already exists but could not be resolved. ` +
      `Manual intervention may be required. Error: ${createError.message}`,
    );
  }

  throw new Error(`Failed to create auth user ${user.email}: ${createError?.message ?? "unknown"}`);
}

// ── Phase 1: Auth Users & Profiles ──────────────────────────────────

async function provisionUsers(
  password: string,
): Promise<Map<string, string>> {
  console.log("\n── Phase 1: Auth Users & Profiles ──────────────────────\n");

  const emailToId = new Map<string, string>();

  for (const user of TEST_USERS) {
    const { id: userId, isNew } = await ensureAuthUser(user, password);

    emailToId.set(user.email, userId);

    if (isNew) {
      console.log(`   ✓ Auth user created: ${user.email} (${userId.slice(0, 8)}…)`);

      // Wait for profile trigger
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify profile was auto-created by trigger
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .single();

      if (profileError || !profile) {
        console.log(`   → Profile not created by trigger, creating manually...`);
        const { error: insertError } = await supabase.from("profiles").upsert(
          { id: userId, display_name: user.displayName, role: "participant" },
          { onConflict: "id" },
        );
        if (insertError) {
          console.error(`   ✗ Failed to create profile for ${user.email}:`, insertError.message);
          process.exit(1);
        }
        console.log(`   ✓ Profile created manually for ${user.email}`);
      } else {
        console.log(`   ✓ Profile auto-created by trigger for ${user.email}`);
      }
    } else {
      console.log(`   ✓ Auth user exists: ${user.email} (${userId.slice(0, 8)}…)`);

      // Always update password to match current SANDBOX_TEST_PASSWORD
      const { error: pwError } = await supabase.auth.admin.updateUserById(userId, {
        password,
      });
      if (pwError) {
        console.error(`   ✗ Failed to update password for ${user.email}:`, pwError.message);
        process.exit(1);
      }
      console.log(`   → Password updated for ${user.email}`);

      // Verify profile exists and has correct role
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();

      if (profile && profile.role !== "participant") {
        console.error(`   ⚠ WARNING: ${user.email} has role '${profile.role}' (expected 'participant'). Skipping — not modifying.`);
      } else if (!profile) {
        console.log(`   → Profile missing, creating...`);
        const { error } = await supabase.from("profiles").upsert(
          { id: userId, display_name: user.displayName, role: "participant" },
          { onConflict: "id" },
        );
        if (error) {
          console.error(`   ✗ Failed to create profile for ${user.email}:`, error.message);
          process.exit(1);
        }
        console.log(`   ✓ Profile created for ${user.email}`);
      }
    }
  }

  console.log(`\n   Users provisioned: ${emailToId.size}`);
  return emailToId;
}

// ── Phase 2: Teams ──────────────────────────────────────────────────

async function provisionTeams(): Promise<Map<string, string>> {
  console.log("\n── Phase 2: Teams ──────────────────────────────────────\n");

  const teamNameToId = new Map<string, string>();

  // Fetch all existing test teams (those with our prefix)
  const { data: existingTeams } = await supabase
    .from("teams")
    .select("id, name")
    .like("name", `${TEAM_PREFIX}%`);

  if (existingTeams) {
    for (const team of existingTeams) {
      teamNameToId.set(team.name, team.id);
    }
  }

  for (const team of TEST_TEAMS) {
    if (teamNameToId.has(team.name)) {
      console.log(`   ✓ Team exists: ${team.name} (${teamNameToId.get(team.name)!.slice(0, 8)}…)`);
      continue;
    }

    console.log(`   → Creating team: ${team.name}`);
    const { data, error } = await supabase
      .from("teams")
      .insert({ name: team.name })
      .select("id")
      .single();

    if (error) {
      console.error(`   ✗ Failed to create team '${team.name}':`, error.message);
      process.exit(1);
    }

    teamNameToId.set(team.name, data.id);
    console.log(`   ✓ Team created: ${team.name} (${data.id.slice(0, 8)}…)`);
  }

  console.log(`\n   Teams provisioned: ${teamNameToId.size}`);
  return teamNameToId;
}

// ── Phase 3: Team Memberships ───────────────────────────────────────

async function provisionMemberships(
  emailToId: Map<string, string>,
  teamNameToId: Map<string, string>,
): Promise<void> {
  console.log("\n── Phase 3: Team Memberships ────────────────────────────\n");

  let created = 0;
  let existing = 0;

  for (const team of TEST_TEAMS) {
    const teamId = teamNameToId.get(team.name);
    if (!teamId) {
      console.error(`   ✗ Team not found: ${team.name}`);
      process.exit(1);
    }

    for (const email of team.members) {
      const userId = emailToId.get(email);
      if (!userId) {
        console.error(`   ✗ User not found: ${email}`);
        process.exit(1);
      }

      // Check existing membership
      const { data: existingMember } = await supabase
        .from("team_members")
        .select("id")
        .eq("user_id", userId)
        .eq("team_id", teamId)
        .maybeSingle();

      if (existingMember) {
        existing++;
        continue;
      }

      // Insert membership
      const { error } = await supabase.from("team_members").insert({
        team_id: teamId,
        user_id: userId,
        role: "member",
      });

      if (error) {
        // Handle unique constraint violation (race condition / concurrent run)
        if (error.code === "23505") {
          existing++;
          continue;
        }
        console.error(`   ✗ Failed to add ${email} to ${team.name}:`, error.message);
        process.exit(1);
      }

      created++;
      console.log(`   ✓ ${email} → ${team.name}`);
    }
  }

  console.log(`\n   Memberships: ${created} created, ${existing} existing`);
}

// ── Main ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("SANDBOX — Development Test Participants & Teams");
  console.log("==============================================");

  // Check that we're not about to accidentally touch the real admin
  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();

  if (adminProfile) {
    console.log(`   Real admin detected (${adminProfile.id.slice(0, 8)}…). Will NOT modify.`);
  } else {
    console.warn("   ⚠ No admin profile found. Ensure bootstrap:admin has been run.");
  }

  // Generate or use provided password
  const password = process.env.SANDBOX_TEST_PASSWORD || generatePassword();

  console.log(`   Test accounts password: ${password}`);
  console.log("   ⚠ IMPORTANT: These are test-only credentials. Do not use in production.");

  const emailToId = await provisionUsers(password);
  const teamNameToId = await provisionTeams();
  await provisionMemberships(emailToId, teamNameToId);

  // ── Summary ─────────────────────────────────────────────────────

  console.log("\n═════════════════════════════════════════════════════════════");
  console.log(" Development Test Accounts Ready");
  console.log("═════════════════════════════════════════════════════════════\n");
  console.log(" Teams:");
  for (const team of TEST_TEAMS) {
    const teamId = teamNameToId.get(team.name);
    console.log(`   ${team.name} (${teamId?.slice(0, 8)}…)`);
  }
  console.log("\n Participants:");
  for (const user of TEST_USERS) {
    const userId = emailToId.get(user.email);
    console.log(`   ${user.email} (${userId?.slice(0, 8)}…)`);
  }
  console.log(`\n Password: ${password}`);
  console.log("\n Use these credentials for development/testing only.");
  console.log(" Do NOT commit this password or expose it in frontend code.\n");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});

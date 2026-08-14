/**
 * SANDBOX — One-time Admin Bootstrap Script
 *
 * Creates the initial administrator account using the Supabase Admin API.
 * This script MUST be run server-side only. It requires:
 *
 *   SANDBOX_ADMIN_EMAIL     — admin email address
 *   SANDBOX_ADMIN_PASSWORD  — admin password (not echoed)
 *   SUPABASE_URL            — project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service role key (server-only)
 *
 * Usage:
 *   bun run scripts/bootstrap-admin.ts
 *   # or
 *   bun run bootstrap:admin
 *
 * Idempotent: safe to run multiple times. Reuses existing accounts.
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
const ADMIN_EMAIL = requireEnv("SANDBOX_ADMIN_EMAIL");
const ADMIN_PASSWORD = requireEnv("SANDBOX_ADMIN_PASSWORD");

if (ADMIN_PASSWORD.length < 8) {
  console.error("ERROR: SANDBOX_ADMIN_PASSWORD must be at least 8 characters.");
  process.exit(1);
}

// ── Admin client ────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Helper: find auth user by email ────────────────────────────────

async function findAuthUserByEmail(
  email: string,
): Promise<{ id: string; email: string } | null> {
  // listUsers paginates; scan up to 1000 users (sufficient for bootstrap)
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) {
    // listUsers can return 500 on some Supabase projects — treat as "not found"
    // so the script falls through to createUser.
    console.warn("   Warning: listUsers failed, will attempt to create user:", error.message);
    return null;
  }
  const match = data?.users?.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );
  if (!match?.email) return null;
  return { id: match.id, email: match.email };
}

// ── Main bootstrap logic ───────────────────────────────────────────

async function bootstrap(): Promise<void> {
  console.log("SANDBOX Admin Bootstrap");
  console.log("=======================\n");

  // Step 1: Check if an admin profile already exists
  console.log("1. Checking for existing admin...");
  const { data: existingAdmin, error: lookupError } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    console.error("   Database error during lookup:", lookupError.message);
    process.exit(1);
  }

  if (existingAdmin) {
    console.log(
      `   Admin profile exists (id: ${existingAdmin.id.slice(0, 8)}…). Updating password...`,
    );

    // Find auth user by email — profile id may not match auth user id
    const authUser = await findAuthUserByEmail(ADMIN_EMAIL);
    if (!authUser) {
      console.error(`   No auth user found for ${ADMIN_EMAIL}. Recreating...`);
      // Fall through to Step 3 to create the auth user
    } else {
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        authUser.id,
        { password: ADMIN_PASSWORD }
      );

      if (updateError) {
        console.error("   Failed to update password:", updateError.message);
        process.exit(1);
      }

      console.log("   Password updated.");
      console.log("\nBootstrap complete. Admin account is ready.");
      return;
    }
  }

  // Step 2: Check if auth user with this email already exists
  console.log("2. Checking for existing auth user...");
  const existingUser = await findAuthUserByEmail(ADMIN_EMAIL);

  if (existingUser) {
    console.log(
      `   Auth user exists (id: ${existingUser.id.slice(0, 8)}…). Updating password and ensuring profile...`,
    );

    // Update password to match current SANDBOX_ADMIN_PASSWORD
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      existingUser.id,
      { password: ADMIN_PASSWORD }
    );

    if (updateError) {
      console.error("   Failed to update password:", updateError.message);
      process.exit(1);
    }

    console.log("   Password updated.");

    // Upsert profile as admin
    const { error: upsertError } = await supabase.from("profiles").upsert(
      {
        id: existingUser.id,
        display_name: "Administrator",
        role: "admin",
      },
      { onConflict: "id" },
    );

    if (upsertError) {
      console.error("   Failed to create/update profile:", upsertError.message);
      process.exit(1);
    }

    console.log("   Profile ensured with admin role.");
    console.log("\nBootstrap complete. Admin account is ready.");
    return;
  }

  // Step 3: Create the auth user
  console.log("3. Creating Supabase Auth user...");

  const { data: newUser, error: createError } =
    await supabase.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true, // Skip email verification for bootstrap
      user_metadata: {
        display_name: "Administrator",
      },
    });

  if (createError) {
    console.error("   Failed to create auth user:", createError.message);
    process.exit(1);
  }

  if (!newUser?.user) {
    console.error("   User creation returned no user data.");
    process.exit(1);
  }

  console.log(`   Auth user created (id: ${newUser.user.id.slice(0, 8)}…).`);

  // Step 4: The handle_new_user trigger should have created the profile.
  // Wait briefly and then verify.
  console.log("4. Waiting for profile trigger...");
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", newUser.user.id)
    .single();

  if (profileError || !profile) {
    // Trigger may not have fired — create profile manually
    console.log("   Profile not found via trigger. Creating manually...");
    const { error: insertError } = await supabase.from("profiles").upsert(
      {
        id: newUser.user.id,
        display_name: "Administrator",
        role: "admin",
      },
      { onConflict: "id" },
    );

    if (insertError) {
      console.error("   Failed to create profile:", insertError.message);
      process.exit(1);
    }
    console.log("   Profile created manually.");
  } else if (profile.role !== "admin") {
    // Step 5: Promote to admin (default trigger creates as participant)
    console.log("5. Promoting profile to admin...");
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", newUser.user.id);

    if (updateError) {
      console.error("   Failed to promote profile:", updateError.message);
      process.exit(1);
    }
    console.log("   Profile promoted to admin.");
  } else {
    console.log("   Profile already has admin role.");
  }

  console.log("\n=======================");
  console.log("Bootstrap complete.");
  console.log(`Admin email: ${ADMIN_EMAIL}`);
  console.log("The administrator can now log in at /admin/login");
}

bootstrap().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});

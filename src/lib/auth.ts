import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

/**
 * Real Supabase Auth boundary.
 *
 * Maintains the same public API as the mock auth module so AuthGuard,
 * and LoginForm continue working with minimal changes.
 *
 * Session state is managed via Supabase Auth's onAuthStateChange listener.
 * Profile and team membership are resolved from the database after auth.
 */

export type AuthRole = "admin" | "participant";

export interface SignInResult {
  ok: boolean;
  error?: string;
  /** The role resolved for the session; present when ok. */
  role?: AuthRole;
}

export interface UserProfile {
  id: string;
  display_name: string;
  role: string;
}

export interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  teamId: string | null;
  role: AuthRole | null;
  ready: boolean;
  loading: boolean;
}

const initial: AuthState = {
  user: null,
  profile: null,
  teamId: null,
  role: null,
  ready: false,
  loading: true,
};

let state: AuthState = { ...initial };
const listeners = new Set<() => void>();

function setState(next: Partial<AuthState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

let initialized = false;
let unsubscribeFn: (() => void) | null = null;

async function resolveProfile(user: User): Promise<UserProfile | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("teams")
    .select("id, display_name, role")
    .eq("id", user.id)
    .single();

  if (error || !data) return null;
  return data as UserProfile;
}

function deriveRole(profile: UserProfile | null): AuthRole | null {
  if (!profile) return null;
  if (profile.role === "admin") return "admin";
  if (profile.role === "participant") return "participant";
  return null;
}

async function handleAuthChange(user: User | null) {
  if (!user) {
    setState({
      user: null,
      profile: null,
      teamId: null,
      role: null,
      ready: true,
      loading: false,
    });
    return;
  }

  const profile = await resolveProfile(user);
  const role = deriveRole(profile);

  setState({
    user,
    profile,
    teamId: user.id,
    role,
    ready: true,
    loading: false,
  });
}

function ensureInitialized() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  const supabase = createClient();

  // Subscribe to auth state changes
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(async (_event, session) => {
    await handleAuthChange(session?.user ?? null);
  });

  unsubscribeFn = () => subscription.unsubscribe();

  // Check for existing session
  supabase.auth.getSession().then(({ data: { session } }) => {
    handleAuthChange(session?.user ?? null);
  });
}

export function subscribeToSession(subscriber: () => void): () => void {
  ensureInitialized();
  listeners.add(subscriber);
  return () => {
    listeners.delete(subscriber);
  };
}

/** True when a signed-in session holds the given role. */
export function getSession(role: AuthRole): boolean {
  ensureInitialized();
  return state.ready && !state.loading && state.user !== null && state.role === role;
}

/** Get the full auth state. */
export function getAuthState(): AuthState {
  ensureInitialized();
  return state;
}

export async function signIn(
  email: string,
  password: string
): Promise<SignInResult> {
  ensureInitialized();

  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // Map Supabase error messages to user-friendly messages
    const msg = error.message.toLowerCase();
    if (msg.includes("invalid login credentials")) {
      return { ok: false, error: "Invalid email or password." };
    }
    if (msg.includes("email not confirmed")) {
      return { ok: false, error: "Please confirm your email before signing in." };
    }
    return { ok: false, error: error.message };
  }

  if (!data.user) {
    return { ok: false, error: "Sign in failed — no user returned." };
  }

  // Profile will be resolved by onAuthStateChange listener
  // Wait briefly for state to update
  const profile = await resolveProfile(data.user);
  const role = deriveRole(profile);

  if (!role) {
    // Sign out if profile is missing or has invalid role
    await supabase.auth.signOut();
    return {
      ok: false,
      error:
        "Account does not have a valid role. Contact your administrator.",
    };
  }

  return { ok: true, role };
}

export async function signOut(): Promise<void> {
  ensureInitialized();

  const supabase = createClient();
  await supabase.auth.signOut();

  setState({
    user: null,
    profile: null,
    teamId: null,
    role: null,
    ready: true,
    loading: false,
  });
}

/** Cleanup function for when the module is no longer needed. */
export function cleanupAuth(): void {
  unsubscribeFn?.();
  unsubscribeFn = null;
  initialized = false;
}

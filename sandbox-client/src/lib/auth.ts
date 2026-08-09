import { createClient } from "@/lib/supabase/client";
import {
  clearDemoRole,
  demoRoleFromCredentials,
  getDemoRoleFromDocument,
  setDemoRole,
  type DemoRole,
} from "@/lib/demo-session";

/**
 * Supabase-backed authentication boundary.
 *
 * The role is derived from the authenticated user's `profiles` row (never
 * from client input or mutable user metadata). Authorization is enforced
 * server-side (middleware + RLS + RPCs); these helpers are the client-side
 * UX boundary.
 *
 * Session state is exposed through a tiny external store so components react
 * via useSyncExternalStore (the same pattern the mock used, so AuthGuard and
 * friends keep working unchanged).
 */

export type AuthRole = DemoRole;

export interface SignInResult {
  ok: boolean;
  error?: string;
  /** The role resolved from profiles; present when ok. */
  role?: AuthRole;
}

interface SessionState {
  userId: string | null;
  role: AuthRole | null;
  ready: boolean;
}

let supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!supabase) supabase = createClient();
  return supabase;
}

let state: SessionState = { userId: null, role: null, ready: false };
const listeners = new Set<() => void>();

function setState(next: SessionState) {
  state = next;
  listeners.forEach((listener) => listener());
}

/** Resolve the role from profiles; null means "not provisioned" (fail closed). */
async function fetchRole(userId: string): Promise<AuthRole | null> {
  const { data } = await getSupabase()
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (data?.role === "admin") return "admin";
  if (data?.role === "participant") return "participant";
  return null;
}

let initialized = false;
function ensureInitialized() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  // Keep the store in sync with auth lifecycle events (sign-in, sign-out,
  // token refresh). The INITIAL_SESSION event is ignored: the initial
  // snapshot is driven by getUser() below, which avoids a transient
  // "signed out" flash and a duplicate role fetch on load.
  getSupabase().auth.onAuthStateChange((event, session) => {
    if (event === "INITIAL_SESSION") return;
    if (!session?.user) {
      const demoRole = getDemoRoleFromDocument();
      setState({ userId: demoRole ? `demo-${demoRole}` : null, role: demoRole, ready: true });
      return;
    }
    fetchRole(session.user.id).then(
      (role) => setState({ userId: session.user.id, role, ready: true }),
      // Fail closed: a role-fetch failure must not leave the guard hanging.
      () => setState({ userId: session.user.id, role: null, ready: true })
    );
  });

  // Resolve the initial session snapshot (restored from cookies).
  getSupabase()
    .auth.getUser()
    .then(({ data }) => {
      if (!data.user) {
        const demoRole = getDemoRoleFromDocument();
        setState({ userId: demoRole ? `demo-${demoRole}` : null, role: demoRole, ready: true });
        return;
      }
      fetchRole(data.user.id).then(
        (role) => setState({ userId: data.user.id, role, ready: true }),
        // Fail closed, as above.
        () => setState({ userId: data.user.id, role: null, ready: true })
      );
    });
}

export function subscribeToSession(subscriber: () => void): () => void {
  ensureInitialized();
  listeners.add(subscriber);
  return () => {
    listeners.delete(subscriber);
  };
}

/** True when a signed-in user holds the given role. */
export function getSession(role: AuthRole): boolean {
  ensureInitialized();
  return state.ready && state.userId !== null && state.role === role;
}

export async function signIn(email: string, password: string): Promise<SignInResult> {
  ensureInitialized();

  const demoRole = demoRoleFromCredentials(email, password);
  if (demoRole) {
    clearDemoRole();
    setDemoRole(demoRole);
    setState({ userId: `demo-${demoRole}`, role: demoRole, ready: true });
    return { ok: true, role: demoRole };
  }

  const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };

  const profileRole = await fetchRole(data.user.id);
  if (!profileRole) {
    // Fail closed: the account exists but has no provisioned role.
    await getSupabase().auth.signOut();
    return {
      ok: false,
      error: "This account is not provisioned for the competition.",
    };
  }

  clearDemoRole();
  setState({ userId: data.user.id, role: profileRole, ready: true });
  return { ok: true, role: profileRole };
}

export function signInDemo(role: AuthRole): SignInResult {
  ensureInitialized();
  clearDemoRole();
  setDemoRole(role);
  setState({ userId: `demo-${role}`, role, ready: true });
  return { ok: true, role };
}

export async function signOut(): Promise<void> {
  await getSupabase().auth.signOut();
  clearDemoRole();
  // The SIGNED_OUT auth event already clears state; reset directly as well so
  // guards react even if the event listener is somehow not attached.
  setState({ userId: null, role: null, ready: true });
}

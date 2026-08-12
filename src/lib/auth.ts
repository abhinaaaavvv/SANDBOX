import {
  clearDemoRole,
  demoRoleFromCredentials,
  getDemoRoleFromDocument,
  setDemoRole,
  type DemoRole,
} from "@/lib/demo-session";

/**
 * Mock frontend-only authentication boundary.
 *
 * This phase has no backend: sessions are simulated credentials stored in a
 * cookie (see lib/demo-session.ts). The public API mirrors what Supabase Auth
 * will provide later, so AuthGuard, LoginForm, and AppHeader keep working
 * unchanged when the real auth layer replaces this module.
 *
 * This is NOT secure authentication — it is a frontend simulation only.
 */

export type AuthRole = DemoRole;

export interface SignInResult {
  ok: boolean;
  error?: string;
  /** The role resolved for the session; present when ok. */
  role?: AuthRole;
}

interface SessionState {
  userId: string | null;
  role: AuthRole | null;
  ready: boolean;
}

let state: SessionState = { userId: null, role: null, ready: false };
const listeners = new Set<() => void>();

function setState(next: SessionState) {
  state = next;
  listeners.forEach((listener) => listener());
}

let initialized = false;
function ensureInitialized() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  // Restore a previously stored demo session from the cookie.
  const demoRole = getDemoRoleFromDocument();
  setState({ userId: demoRole ? `demo-${demoRole}` : null, role: demoRole, ready: true });
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

  return {
    ok: false,
    error: "Invalid credentials. Use one of the demo accounts shown below.",
  };
}

export function signInDemo(role: AuthRole): SignInResult {
  ensureInitialized();
  clearDemoRole();
  setDemoRole(role);
  setState({ userId: `demo-${role}`, role, ready: true });
  return { ok: true, role };
}

export async function signOut(): Promise<void> {
  clearDemoRole();
  setState({ userId: null, role: null, ready: true });
}

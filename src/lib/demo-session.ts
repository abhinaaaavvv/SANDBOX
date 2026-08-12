export type DemoRole = "admin" | "participant";

export const DEMO_SESSION_COOKIE = "sandbox_demo_role";
export const DEMO_ACCOUNTS: Record<DemoRole, { email: string; password: string }> = {
  admin: {
    email: "admin@demo.local",
    password: "demo-admin",
  },
  participant: {
    email: "participant@demo.local",
    password: "demo-participant",
  },
};

export function demoRoleFromCredentials(email: string, password: string): DemoRole | null {
  for (const [role, creds] of Object.entries(DEMO_ACCOUNTS) as Array<[DemoRole, { email: string; password: string }]>) {
    if (creds.email === email && creds.password === password) return role;
  }
  return null;
}

export function getDemoRoleFromCookieString(cookieString: string | null | undefined): DemoRole | null {
  if (!cookieString) return null;
  const match = cookieString.match(new RegExp(`(?:^|;\\s*)${DEMO_SESSION_COOKIE}=([^;]+)`));
  const value = match?.[1];
  return value === "admin" || value === "participant" ? value : null;
}

export function getDemoRoleFromDocument(): DemoRole | null {
  if (typeof document === "undefined") return null;
  return getDemoRoleFromCookieString(document.cookie);
}

export function setDemoRole(role: DemoRole) {
  if (typeof document === "undefined") return;
  document.cookie = `${DEMO_SESSION_COOKIE}=${role}; path=/; max-age=86400; samesite=lax`;
}

export function clearDemoRole() {
  if (typeof document === "undefined") return;
  document.cookie = `${DEMO_SESSION_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

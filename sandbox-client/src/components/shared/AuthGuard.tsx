"use client";

import React, { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { getSession, subscribeToSession, type AuthRole } from "@/lib/auth";

interface AuthGuardProps {
  role: AuthRole;
  children: React.ReactNode;
}

const LOGIN_PATHS: Record<AuthRole, string> = {
  participant: "/participant/login",
  admin: "/admin/login",
};

/**
 * Client-side session boundary for the console route groups.
 *
 * Authorization is ultimately enforced server-side (Supabase RLS + API routes);
 * this guard prevents rendering any console UI for a role that has not signed
 * in, and keeps participant and admin sessions strictly separate.
 */
export const AuthGuard: React.FC<AuthGuardProps> = ({ role, children }) => {
  const router = useRouter();

  // External-store read: SSR/prerender snapshot is false (no session storage),
  // so protected UI is never server-rendered or flashed before the check.
  const authed = useSyncExternalStore(
    subscribeToSession,
    () => getSession(role),
    () => false
  );

  useEffect(() => {
    if (!authed) {
      router.replace(LOGIN_PATHS[role]);
    }
  }, [authed, role, router]);

  if (!authed) return null;

  return <>{children}</>;
};

"use client";

import React, { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { getSession, subscribeToSession, type AuthRole } from "@/lib/auth";
import { useSandboxStore } from "@/context/SandboxContext";

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
 * This phase uses mock sessions (lib/auth); the guard prevents rendering any
 * console UI for a role that has not signed in, and keeps participant and
 * admin sessions strictly separate. Real authorization will be enforced
 * server-side once a backend exists.
 */
export const AuthGuard: React.FC<AuthGuardProps> = ({ role, children }) => {
  const router = useRouter();
  const { setViewRole } = useSandboxStore();

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

  // Tell the mock engine which console is viewing state so admin-private data
  // (pending price changes) is filtered out of participant snapshots.
  useEffect(() => {
    if (authed) setViewRole(role);
  }, [authed, role, setViewRole]);

  if (!authed) return null;

  return <>{children}</>;
};

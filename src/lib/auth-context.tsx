"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  getAuthState,
  subscribeToSession,
  type AuthState,
  type AuthRole,
} from "@/lib/auth";

interface AuthContextValue extends AuthState {
  /** The role guard: true when authenticated as the specified role. */
  isAuthenticated: (role: AuthRole) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Provides reactive auth state to the component tree.
 *
 * Uses the same subscribeToSession mechanism as AuthGuard, so there is
 * a single source of truth for auth state across the application.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(getAuthState);

  useEffect(() => {
    return subscribeToSession(() => {
      setState(getAuthState());
    });
  }, []);

  const isAuthenticated = (role: AuthRole): boolean => {
    return state.ready && !state.loading && state.user !== null && state.role === role;
  };

  return (
    <AuthContext.Provider value={{ ...state, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Access the current auth state.
 * Must be used within an AuthProvider.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

"use client";

import React from "react";
import { SandboxProvider } from "@/context/SandboxContext";
import { RealtimeProvider } from "@/lib/realtime";
import { AuthProvider } from "@/lib/auth-context";
import { CompetitionContextProvider } from "@/lib/competition-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

/**
 * Provider stack for the authenticated console route groups
 * (/participant, /admin). Kept out of the root layout so public routes
 * (landing, login) don't ship or hydrate Supabase/realtime/store code.
 */
export function ConsoleProviders({ children }: { children: React.ReactNode }) {
  return (
    <RealtimeProvider>
      <AuthProvider>
        <CompetitionContextProvider>
          <SandboxProvider>
            <TooltipProvider>
              {children}
              <Toaster />
            </TooltipProvider>
          </SandboxProvider>
        </CompetitionContextProvider>
      </AuthProvider>
    </RealtimeProvider>
  );
}

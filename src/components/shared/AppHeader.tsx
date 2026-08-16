"use client";

import React from "react";
import { useSandboxStore } from "@/context/SandboxContext";
import { formatTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { signOut, type AuthRole } from "@/lib/auth";
import { MarketStatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Clock, LogOut } from "lucide-react";

interface AppHeaderProps {
  role: AuthRole;
}

export const AppHeader: React.FC<AppHeaderProps> = ({ role }) => {
  const { currentRound, marketStatus, roundStatus, serverEndTimestamp, timerSeconds, teamName, pendingPriceChanges } =
    useSandboxStore();

  // Timer shows whenever there's an active round with an authoritative end timestamp.
  // This covers: market open, market closed, trading paused — any state where the round is running.
  const hasLiveTimer =
    serverEndTimestamp != null && roundStatus === "active";
  const isTimerWarning = timerSeconds <= 120 && timerSeconds > 0;
  const isAdmin = role === "admin";

  const handleSignOut = () => {
    // Clearing the session notifies the AuthGuard, whose single redirect to the
    // role's login page is the one navigation source — no competing router calls.
    void signOut();
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm lg:px-6">
      <div className="mx-auto flex max-w-[1800px] flex-col items-center justify-between gap-3 md:flex-row">
        {/* Brand + round metadata */}
        <div className="flex w-full items-center gap-6 md:w-auto">
          <div className="flex items-baseline gap-3">
            <span className="font-garamond text-2xl font-semibold tracking-tight text-foreground select-none">
              SANDBOX
            </span>
            <span className="hidden text-xs text-muted-foreground sm:block">
              {isAdmin ? "Competition Control Center" : "Live Market Simulation"}
            </span>
          </div>

          <div className="hidden h-4 w-px bg-border md:block" />

          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">
              Round {String(currentRound).padStart(2, "0")}
            </span>

            <MarketStatusBadge status={marketStatus} />

            <div
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-semibold tabular-nums transition-colors",
                isTimerWarning
                  ? "animate-pulse border-warn/25 bg-warn/10 text-warn"
                  : "border-border bg-muted text-foreground"
              )}
            >
              <Clock className="size-3.5 text-muted-foreground" />
              <span>{hasLiveTimer ? formatTime(timerSeconds) : "--:--"}</span>
            </div>
          </div>
        </div>

        {/* Role-specific identity & session controls */}
        <div className="flex w-full items-center justify-end gap-3 md:w-auto">
          {isAdmin && pendingPriceChanges.length > 0 && (
            <Badge variant="warn">
              {pendingPriceChanges.length} pending price changes
            </Badge>
          )}

          {!isAdmin && (
            <div className="hidden items-center gap-2 rounded-md border border-border bg-muted px-3 py-1 text-xs sm:flex">
              <span className="text-muted-foreground">Team:</span>
              <span className="font-semibold text-foreground">{teamName}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleSignOut}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-3.5" />
            Sign Out
          </button>
        </div>
      </div>
    </header>
  );
};

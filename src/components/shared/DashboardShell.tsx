"use client";

import React from "react";
import { LogOut, type LucideIcon } from "lucide-react";
import { useSandboxStore } from "@/context/SandboxContext";
import { formatTime, cn } from "@/lib/utils";
import { signOut } from "@/lib/auth";
import { MarketStatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Clock3 } from "lucide-react";

export interface ShellNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Small count rendered on the trailing edge (e.g. pending changes). */
  badge?: number;
}

interface DashboardShellProps {
  role: "participant" | "admin";
  /** Section title shown in the topbar for the active view. */
  activeLabel: string;
  nav: ShellNavItem[];
  activeId: string;
  onNavigate: (id: string) => void;
  children: React.ReactNode;
}

/**
 * SANDBOX dashboard shell.
 *
 * Fixed left sidebar (wordmark → section nav → identity pinned bottom)
 * and a sticky topbar carrying the competition-critical strip:
 * round · market status · authoritative timer · IST clock.
 *
 * The sidebar collapses to an icon rail below `lg`.
 */
export const DashboardShell: React.FC<DashboardShellProps> = ({
  role,
  activeLabel,
  nav,
  activeId,
  onNavigate,
  children,
}) => {
  const {
    currentRound,
    marketStatus,
    roundStatus,
    serverEndTimestamp,
    timerSeconds,
    teamName,
    pendingPriceChanges,
  } = useSandboxStore();

  const isAdmin = role === "admin";
  const hasLiveTimer = serverEndTimestamp != null && roundStatus === "active";
  const isTimerCritical = timerSeconds <= 60 && timerSeconds > 0;
  const roundLabel = `Round ${String(currentRound).padStart(2, "0")}`;

  const handleSignOut = () => {
    void signOut();
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className="flex w-[68px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:w-[248px]">
        {/* Wordmark */}
        <div className="flex h-[60px] items-center justify-center border-b border-sidebar-border px-4 lg:justify-start">
          {/* Compact monogram on the icon rail */}
          <span className="font-bodoni text-lg font-semibold tracking-wide text-foreground select-none lg:hidden">
            SB
          </span>
          <div className="hidden flex-col items-center lg:flex lg:flex-row lg:items-baseline lg:gap-2.5">
            <span className="font-bodoni text-xl font-semibold tracking-wide text-foreground select-none">
              SANDBOX
            </span>
            <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {isAdmin ? "Control" : "Live Market"}
            </span>
          </div>
        </div>

        {/* Section nav */}
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2.5 pt-4">
          <span className="mb-1 hidden px-2.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70 lg:block">
            {isAdmin ? "Console" : "Workspace"}
          </span>
          {nav.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === activeId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={isActive ? "page" : undefined}
                title={item.label}
                className={cn(
                  "group relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors lg:px-3",
                  isActive
                    ? "bg-sidebar-accent font-medium text-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                )}
              >
                {/* Active rail */}
                <span
                  className={cn(
                    "absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-foreground transition-opacity",
                    isActive ? "opacity-100" : "opacity-0"
                  )}
                />
                <Icon className="size-4 shrink-0" />
                <span className="hidden truncate lg:block">{item.label}</span>
                {typeof item.badge === "number" && item.badge > 0 && (
                  <span className="ml-auto hidden items-center rounded-full bg-warn/15 px-1.5 py-px text-[10px] font-semibold tabular-nums text-warn lg:flex">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Identity + session (pinned) */}
        <div className="border-t border-sidebar-border p-2.5">
          <div
            className={cn(
              "mb-1 hidden rounded-md bg-sidebar-accent/60 px-3 py-2 lg:block",
              isAdmin && pendingPriceChanges.length > 0 && "lg:block"
            )}
          >
            <span className="block text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {isAdmin ? "Administrator" : "Team"}
            </span>
            <span className="block truncate text-sm font-semibold text-foreground">
              {isAdmin ? "Control Center" : teamName}
            </span>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            title="Sign Out"
            className={cn(
              "flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground lg:px-3",
              isAdmin && pendingPriceChanges.length > 0 && "justify-center lg:justify-start"
            )}
          >
            <LogOut className="size-4 shrink-0" />
            <span className="hidden lg:block">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ── Main column ─────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar — competition-critical strip */}
        <header className="flex h-[60px] shrink-0 items-center justify-between gap-4 border-b border-border bg-background px-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <span className="truncate text-sm font-medium text-muted-foreground">
              {activeLabel}
            </span>
            {isAdmin && pendingPriceChanges.length > 0 && (
              <Badge variant="warn" className="hidden sm:inline-flex">
                {pendingPriceChanges.length} pending
              </Badge>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            {!isAdmin && (
              <span className="hidden items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs md:flex">
                <span className="text-muted-foreground">Team</span>
                <span className="max-w-[140px] truncate font-semibold">{teamName}</span>
              </span>
            )}

            <span className="hidden rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium tabular-nums text-muted-foreground sm:block">
              {roundLabel}
            </span>

            <MarketStatusBadge status={marketStatus} />

            <div
              className={cn(
                "flex min-w-[84px] items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-semibold tabular-nums transition-colors",
                isTimerCritical
                  ? "animate-pulse border-warn/30 bg-warn/10 text-warn"
                  : hasLiveTimer
                    ? "border-border bg-card text-foreground"
                    : "border-border bg-card text-muted-foreground"
              )}
              aria-live="off"
            >
              <Clock3 className="size-3.5 opacity-60" />
              <span>{hasLiveTimer ? formatTime(timerSeconds) : "--:--"}</span>
            </div>
          </div>
        </header>

        {/* Scrollable content region */}
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1700px] p-4 md:p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
};

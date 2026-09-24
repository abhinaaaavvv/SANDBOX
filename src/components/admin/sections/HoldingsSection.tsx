"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import dynamic from "next/dynamic";
import { useSandboxStore } from "@/context/SandboxContext";
import { useCompetitionContext } from "@/lib/competition-context";
import { useRunEvent } from "@/lib/realtime";
import { formatINR, formatPercent, cn } from "@/lib/utils";
import type { Holding } from "@/types/sandbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { ALLOCATION_COLORS } from "@/components/participant/AllocationChart";

interface HoldingsSectionProps {
  teamId: string | null;
  onTeamChange: (teamId: string) => void;
}

// Chart library is heavy (~100 KB gz) — fetch it only when this panel renders.
// The slot keeps a fixed h-44 height so loading causes no layout shift.
const AllocationChart = dynamic(
  () => import("@/components/participant/AllocationChart"),
  {
    ssr: false,
    loading: () => (
      <div className="skeleton-shimmer size-40 rounded-full self-center" />
    ),
  }
);

/**
 * Admin read-only view of a single participant's open positions.
 * Team picker + summary strip + holdings table (no trade actions).
 */
export const HoldingsSection: React.FC<HoldingsSectionProps> = ({ teamId, onTeamChange }) => {
  const { teams, fetchTeamHoldings } = useSandboxStore();
  const { context } = useCompetitionContext();
  const runId = context?.competitionRun?.id ?? null;

  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Default to the first team when nothing is selected yet.
  const activeTeamId = teamId ?? teams[0]?.id ?? null;
  const activeTeam = teams.find((t) => t.id === activeTeamId) ?? null;

  const chartData = holdings.map((h) => ({
    name: h.symbol,
    value: h.totalValue,
  }));

  // Team switch: loading flag is raised in the select handler (event context),
  // the effect below only performs async work — no synchronous setState.
  const handleTeamChange = useCallback(
    (id: string) => {
      setIsLoading(true);
      setLoadError(null);
      onTeamChange(id);
    },
    [onTeamChange]
  );

  useEffect(() => {
    if (!activeTeamId) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchTeamHoldings(activeTeamId);
        if (!cancelled) {
          setHoldings(rows);
          setLoadError(null);
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Unable to load holdings.");
          setHoldings([]);
          setIsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTeamId, fetchTeamHoldings]);

  // Realtime: every holdings-affecting mutation (trade, dividend, cash
  // adjustment) emits run-scoped LEADERBOARD_CHANGED; price updates emit
  // PRICES_CHANGED. Reload the selected team on either. A trailing throttle
  // collapses busy-room bursts into a single RPC refetch. Background refreshes
  // never touch isLoading, so current rows stay visible (no skeleton flicker);
  // errors keep stale rows instead of wiping them.
  const lastReloadRef = useRef(0);
  const trailingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (trailingTimerRef.current) clearTimeout(trailingTimerRef.current);
    };
  }, []);

  const scheduleReload = useCallback(() => {
    if (!activeTeamId) return;
    const runSilent = async (id: string) => {
      try {
        const rows = await fetchTeamHoldings(id);
        setHoldings(rows);
      } catch {
        // Keep stale rows on background refresh failure.
      }
    };
    const now = Date.now();
    const elapsed = now - lastReloadRef.current;
    if (elapsed >= 1000) {
      lastReloadRef.current = now;
      void runSilent(activeTeamId);
      return;
    }
    if (trailingTimerRef.current) clearTimeout(trailingTimerRef.current);
    trailingTimerRef.current = setTimeout(() => {
      lastReloadRef.current = Date.now();
      void runSilent(activeTeamId);
    }, 1000 - elapsed);
  }, [activeTeamId, fetchTeamHoldings]);

  useRunEvent(runId, "LEADERBOARD_CHANGED", scheduleReload);
  useRunEvent(runId, "PRICES_CHANGED", scheduleReload);

  return (
    <Panel className="flex flex-col">
      <PanelHeader className="flex-wrap">
        <div className="flex flex-col gap-0.5">
          <PanelTitle>Participant Holdings</PanelTitle>
          <span className="text-xs text-muted-foreground">
            Read-only view of a team&apos;s open positions.
          </span>
        </div>
        <div className="w-full sm:w-64">
          <Select value={activeTeamId ?? ""} onValueChange={handleTeamChange}>
            <SelectTrigger aria-label="Select team">
              <SelectValue placeholder="Select team" />
            </SelectTrigger>
            <SelectContent>
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </PanelHeader>

      {/* Summary strip */}
      {activeTeam && (
        <div className="mx-4 mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          <span className="font-medium text-foreground">{activeTeam.name}</span>
          {activeTeam.blocked && <Badge variant="warn">Blocked</Badge>}
          <span className="text-muted-foreground">|</span>
          <span>
            Cash{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {formatINR(activeTeam.cash)}
            </span>
          </span>
          <span className="text-muted-foreground">|</span>
          <span>
            Portfolio{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {formatINR(activeTeam.portfolioValue)}
            </span>
          </span>
          <span className="text-muted-foreground">|</span>
          <span>
            P/L{" "}
            <span
              className={cn(
                "font-semibold tabular-nums",
                activeTeam.profitLoss >= 0 ? "text-up" : "text-down"
              )}
            >
              {activeTeam.profitLoss >= 0 ? "+" : ""}
              {formatINR(activeTeam.profitLoss)}
            </span>
          </span>
          <span className="text-muted-foreground">|</span>
          <span>
            <span className="font-semibold tabular-nums text-foreground">{holdings.length}</span>{" "}
            <span className="text-muted-foreground">
              position{holdings.length === 1 ? "" : "s"}
            </span>
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {isLoading && activeTeamId !== null ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton-shimmer h-12 rounded-md" />
              ))}
            </div>
        ) : loadError ? (
          <p className="py-8 text-center text-sm text-down">{loadError}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Security</TableHead>
                <TableHead className="text-center">Qty</TableHead>
                <TableHead className="text-right">Avg Buy</TableHead>
                <TableHead className="text-right">Current</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Unrealized P/L</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {holdings.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    No open positions.
                  </TableCell>
                </TableRow>
              ) : (
                holdings.map((h) => {
                  const isPositive = h.unrealizedPL >= 0;
                  return (
                    <TableRow key={h.stockId}>
                      <TableCell>
                        <div className="font-semibold text-foreground">{h.symbol}</div>
                        <div className="max-w-40 truncate text-xs text-muted-foreground">
                          {h.name}
                        </div>
                      </TableCell>

                      <TableCell className="text-center font-medium tabular-nums text-foreground">
                        {h.quantity}
                      </TableCell>

                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatINR(h.averageBuyPrice)}
                      </TableCell>

                      <TableCell className="text-right font-semibold tabular-nums text-foreground">
                        {formatINR(h.currentPrice)}
                      </TableCell>

                      <TableCell className="text-right font-semibold tabular-nums text-foreground">
                        {formatINR(h.totalValue)}
                      </TableCell>

                      <TableCell className="text-right font-medium tabular-nums">
                        <span
                          className={cn(
                            "inline-flex items-center gap-0.5",
                            isPositive ? "text-up" : "text-down"
                          )}
                        >
                          {isPositive ? (
                            <TrendingUp className="size-3.5" />
                          ) : (
                            <TrendingDown className="size-3.5" />
                          )}
                          {formatINR(h.unrealizedPL)} ({formatPercent(h.unrealizedPLPercent)})
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}
        </div>

        {/* Allocation visualizer */}
        <Panel className="flex flex-col p-4">
          <PanelHeader className="px-0 pb-3">
            <PanelTitle>Asset Allocation</PanelTitle>
          </PanelHeader>

          <div className="my-2 h-44 w-full">
            {holdings.length > 0 ? (
              <AllocationChart chartData={chartData} />
            ) : (
              <div className="font-bodoni flex h-full items-center justify-center text-sm italic text-muted-foreground">
                No allocation data
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
            {chartData.map((item, idx) => (
              <div key={item.name} className="flex items-center gap-1.5 text-xs">
                <span
                  className="size-2 shrink-0 rounded-sm"
                  style={{ backgroundColor: ALLOCATION_COLORS[idx % ALLOCATION_COLORS.length] }}
                />
                <span className="truncate font-medium text-muted-foreground">{item.name}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </Panel>
  );
};

"use client";

import React, { useEffect, useRef, useState } from "react";
import { useSandboxStore } from "@/context/SandboxContext";
import { formatINR, formatPercent } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Panel, PanelHeader, PanelMeta, PanelTitle } from "@/components/ui/panel";

export const LeaderboardTable: React.FC = () => {
  const { leaderboard } = useSandboxStore();

  // Subtle flash when an entry's rank changes.
  const [moved, setMoved] = useState<Record<string, true>>({});
  const prevRanksRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const prev = prevRanksRef.current;
    const next: Record<string, number> = {};
    const changes: Record<string, true> = {};

    leaderboard.forEach((entry) => {
      next[entry.teamId] = entry.rank;
      if (prev[entry.teamId] !== undefined && prev[entry.teamId] !== entry.rank) {
        changes[entry.teamId] = true;
      }
    });
    prevRanksRef.current = next;

    if (Object.keys(changes).length > 0) {
      setMoved(changes);
      const t = window.setTimeout(() => setMoved({}), 900);
      return () => window.clearTimeout(t);
    }
  }, [leaderboard]);

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Live Leaderboard</PanelTitle>
        <PanelMeta>By portfolio value</PanelMeta>
      </PanelHeader>

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-12 text-center">Rank</TableHead>
            <TableHead>Team</TableHead>
            <TableHead className="text-right">Portfolio Value</TableHead>
            <TableHead className="text-right">Total P/L</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leaderboard.map((entry) => {
            const isPositive = entry.profitLoss >= 0;
            const isUser = entry.isCurrentTeam;

            return (
              <TableRow
                key={entry.teamId}
                className={cn(isUser && "bg-muted/50", moved[entry.teamId] && "rank-move")}
              >
                <TableCell
                  className={cn(
                    "font-bodoni text-center text-base font-semibold",
                    isUser ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {entry.rank}
                </TableCell>

                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className={cn("font-medium", isUser ? "text-foreground" : "text-foreground/80")}>
                      {entry.teamName}
                    </span>
                    {isUser && (
                      <span className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        You
                      </span>
                    )}
                  </div>
                </TableCell>

                <TableCell className="text-right font-semibold tabular-nums text-foreground">
                  {formatINR(entry.portfolioValue)}
                </TableCell>

                <TableCell className="text-right font-medium tabular-nums">
                  <span className={cn(isPositive ? "text-up" : "text-down")}>
                    {isPositive ? "+" : ""}
                    {formatINR(entry.profitLoss)} ({formatPercent(entry.profitLossPercent)})
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Panel>
  );
};

"use client";

import React, { useState } from "react";
import { useSandboxStore } from "@/context/SandboxContext";
import { cn } from "@/lib/utils";
import type { RoundNumber } from "@/types/sandbox";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { LeaderboardTable } from "@/components/shared/LeaderboardTable";

const ROUND_DESCRIPTIONS: Record<RoundNumber, string> = {
  1: "Round 01 — Portfolio Building (15m)",
  2: "Round 02 — Newspaper Trading (15m)",
  3: "Round 03 — Video Trading (15m)",
};

/**
 * Competition lifecycle: live market controls, the round manager and
 * the destructive competition reset. Everything here broadcasts
 * instantly to all participant dashboards.
 */
export const CompetitionSection: React.FC = () => {
  const {
    roundStatus,
    marketStatusDb,
    tradingStatusDb,
    rounds,
    startRound,
    endRound,
    setMarketStatus,
    resumeTrading,
    resetCompetition,
  } = useSandboxStore();

  const [showResetConfirmation, setShowResetConfirmation] = useState(false);

  const isRoundActive = roundStatus === "active";

  return (
    <div className="space-y-5">
      {/* Market controls */}
      <Panel>
        <PanelHeader>
          <PanelTitle>Market Controls</PanelTitle>
          <span className="text-xs text-muted-foreground">
            Broadcast instantly to every participant dashboard
          </span>
        </PanelHeader>
        <div className="flex flex-wrap items-center gap-2 p-4">
          <Button
            variant="buy"
            size="sm"
            disabled={!isRoundActive || marketStatusDb === "open"}
            onClick={() => setMarketStatus("MARKET_OPEN")}
          >
            Open Market
          </Button>
          <Button
            variant="warn"
            size="sm"
            disabled={!isRoundActive || tradingStatusDb === "paused"}
            onClick={() => setMarketStatus("TRADING_PAUSED")}
          >
            Pause Trading
          </Button>
          <Button
            variant="buy"
            size="sm"
            disabled={!isRoundActive || tradingStatusDb !== "paused"}
            onClick={() => resumeTrading()}
          >
            Resume Trading
          </Button>
          <Button
            variant="sell"
            size="sm"
            disabled={!isRoundActive || marketStatusDb === "closed"}
            onClick={() => setMarketStatus("MARKET_CLOSED")}
          >
            Close Market
          </Button>

          <span className="mx-1 hidden h-5 w-px bg-border sm:block" />

          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowResetConfirmation(true)}
          >
            Reset Competition
          </Button>
        </div>
      </Panel>

      {/* Round manager */}
      <Panel>
        <PanelHeader>
          <PanelTitle>Round Manager</PanelTitle>
          <span className="text-xs text-muted-foreground">
            Rounds auto-end when their timer expires
          </span>
        </PanelHeader>
        <div className="flex flex-col gap-2 p-4">
          {[1, 2, 3].map((rNum) => {
            const roundVal = rNum as RoundNumber;
            const dbRound = rounds.find((r) => r.round_number === rNum);
            const status = dbRound?.status ?? "pending";
            const isActive = status === "active";
            const isCompleted = status === "completed";

            return (
              <div
                key={rNum}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md border px-3 py-2.5",
                  isActive ? "border-ring bg-muted" : "border-border bg-card"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {ROUND_DESCRIPTIONS[roundVal]}
                  </span>
                  {isCompleted && (
                    <span className="rounded bg-up/15 px-1.5 py-0.5 text-[10px] font-medium text-up">
                      Done
                    </span>
                  )}
                  {isActive && (
                    <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                      Active
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="buy"
                    size="sm"
                    disabled={isActive || isRoundActive}
                    onClick={() => startRound(roundVal)}
                  >
                    {isCompleted ? "Restart" : "Start"}
                  </Button>
                  <Button
                    variant="sell"
                    size="sm"
                    disabled={!isActive || !isRoundActive}
                    onClick={() => endRound(roundVal)}
                  >
                    End
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <LeaderboardTable />

      {/* Reset confirmation */}
      <AlertDialog open={showResetConfirmation} onOpenChange={setShowResetConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset the entire competition?</AlertDialogTitle>
            <AlertDialogDescription>
              This restores all teams to ₹1,00,000 cash, clears holdings and
              transactions, resets all rounds to pending, resets every stock back to
              its opening price, and reactivates deactivated stocks. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                await resetCompetition();
                setShowResetConfirmation(false);
              }}
            >
              Reset Competition
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

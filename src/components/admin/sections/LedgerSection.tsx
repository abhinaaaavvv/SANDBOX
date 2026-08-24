"use client";

import React, { useState } from "react";
import { useSandboxStore } from "@/context/SandboxContext";
import { formatINR } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
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

/**
 * Live cash balances across all teams plus admin credit/debit
 * adjustments. Every adjustment is an audited ledger entry.
 */
export const LedgerSection: React.FC = () => {
  const { teams, creditCash, debitCash, addToast } = useSandboxStore();

  const [cashTeamId, setCashTeamId] = useState("");
  const [cashAmount, setCashAmount] = useState("1000");
  const [cashReason, setCashReason] = useState("");

  const activeCashTeamId = teams.some((t) => t.id === cashTeamId)
    ? cashTeamId
    : teams[0]?.id ?? "";

  const handleCashAdjust = (kind: "credit" | "debit") => {
    const amt = parseFloat(cashAmount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    const res =
      kind === "credit"
        ? creditCash(activeCashTeamId, amt, cashReason.trim() || undefined)
        : debitCash(activeCashTeamId, amt, cashReason.trim() || undefined);
    if (!res.ok) {
      addToast("error", "Cash Adjustment Failed", res.message ?? "Unable to adjust cash.");
      return;
    }
    // Keep the amount so repeat adjustments are quick; clear the reason.
    setCashReason("");
  };

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Team Cash Ledger</PanelTitle>
        <span className="text-xs text-muted-foreground">
          Live balances across all teams
        </span>
      </PanelHeader>

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Team</TableHead>
            <TableHead className="text-right">Cash</TableHead>
            <TableHead className="text-right">Holdings</TableHead>
            <TableHead className="text-right">Dividends</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {teams.map((team) => (
            <TableRow
              key={team.id}
              className={team.id === activeCashTeamId ? "bg-muted/50" : undefined}
            >
              <TableCell className="font-medium text-foreground">{team.name}</TableCell>
              <TableCell className="text-right tabular-nums text-foreground">
                {formatINR(team.cash)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {team.holdingsCount}
              </TableCell>
              <TableCell className="text-right tabular-nums text-up">
                {formatINR(team.dividendsReceived)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex flex-col gap-3 border-t border-border p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cash-team">Team</Label>
            <Select value={activeCashTeamId} onValueChange={setCashTeamId}>
              <SelectTrigger id="cash-team">
                <SelectValue placeholder="Select team" />
              </SelectTrigger>
              <SelectContent>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cash-amount">Amount (₹)</Label>
            <NumberInput
              id="cash-amount"
              min={1}
              value={cashAmount}
              onChange={(e) => setCashAmount(e.target.value)}
              className="font-semibold tabular-nums"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cash-reason">Reason (optional)</Label>
            <Input
              id="cash-reason"
              type="text"
              placeholder="e.g. Round 1 prize"
              value={cashReason}
              onChange={(e) => setCashReason(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="buy" className="flex-1" onClick={() => handleCashAdjust("credit")}>
            Credit Cash
          </Button>
          <Button variant="sell" className="flex-1" onClick={() => handleCashAdjust("debit")}>
            Debit Cash
          </Button>
        </div>
      </div>
    </Panel>
  );
};

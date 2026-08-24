"use client";

import React, { useState } from "react";
import { useSandboxStore } from "@/context/SandboxContext";
import { formatINR } from "@/lib/utils";
import type { TeamOverview } from "@/lib/competition/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";

const DEFAULT_STARTING_CASH = "100000";

export const TeamManager: React.FC = () => {
  const {
    teams,
    createTeam,
    renameTeam,
    setTeamBlocked,
    removeTeam,
    setTeamStartingCash,
  } = useSandboxStore();

  // Add team dialog state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newCash, setNewCash] = useState(DEFAULT_STARTING_CASH);
  const [isAdding, setIsAdding] = useState(false);

  // Per-team dialog state
  const [renameTarget, setRenameTarget] = useState<TeamOverview | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [cashTarget, setCashTarget] = useState<TeamOverview | null>(null);
  const [cashValue, setCashValue] = useState(DEFAULT_STARTING_CASH);
  const [removeTarget, setRemoveTarget] = useState<TeamOverview | null>(null);

  const handleAdd = async () => {
    if (!newName.trim() || !newEmail.trim() || newPassword.length < 8) return;
    const amount = parseFloat(newCash);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setIsAdding(true);
    const res = await createTeam({
      name: newName.trim(),
      email: newEmail.trim(),
      password: newPassword,
      startingCashRupees: amount,
    });
    setIsAdding(false);
    if (!res.ok) return;
    setShowAddDialog(false);
    setNewName("");
    setNewEmail("");
    setNewPassword("");
    setNewCash(DEFAULT_STARTING_CASH);
  };

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Team Manager</PanelTitle>
        <span className="text-xs text-muted-foreground">
          {teams.length} team{teams.length === 1 ? "" : "s"} · starting cash locks after a
          team&rsquo;s first trade
        </span>
      </PanelHeader>

      <div className="p-4 space-y-4">
        <Button variant="buy" size="sm" onClick={() => setShowAddDialog(true)}>
          Add Team
        </Button>

        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Team</TableHead>
              <TableHead className="text-right">Cash</TableHead>
              <TableHead className="text-right">Portfolio</TableHead>
              <TableHead className="text-right">Holdings</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teams.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                  No funded teams yet.
                </TableCell>
              </TableRow>
            )}
            {teams.map((team) => (
              <TableRow key={team.id}>
                <TableCell className="font-medium text-foreground">{team.name}</TableCell>
                <TableCell className="text-right tabular-nums">{formatINR(team.cash)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatINR(team.portfolioValue)}
                  <span
                    className={`ml-1.5 text-xs ${team.profitLoss >= 0 ? "text-up" : "text-down"}`}
                  >
                    {team.profitLoss >= 0 ? "+" : ""}
                    {formatINR(team.profitLoss)}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{team.holdingsCount}</TableCell>
                <TableCell className="text-center">
                  {team.blocked ? (
                    <Badge variant="warn">Blocked</Badge>
                  ) : (
                    <Badge variant="secondary">Active</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="secondary" size="xs" onClick={() => {
                      setRenameTarget(team);
                      setRenameValue(team.name);
                    }}>
                      Rename
                    </Button>
                    <Button variant="secondary" size="xs" onClick={() => {
                      setCashTarget(team);
                      setCashValue(String(Math.round(team.cash)));
                    }}>
                      Cash
                    </Button>
                    <Button
                      variant={team.blocked ? "buy" : "warn"}
                      size="xs"
                      onClick={() => setTeamBlocked(team.id, !team.blocked)}
                    >
                      {team.blocked ? "Unblock" : "Block"}
                    </Button>
                    <Button variant="destructive" size="xs" onClick={() => setRemoveTarget(team)}>
                      Remove
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Add team */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Team</DialogTitle>
            <DialogDescription>
              Creates a sign-in account for this team and funds it with the starting cash.
              Share the credentials with the team — they sign in on the participant login page.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-team-name">Team name</Label>
              <Input
                id="new-team-name"
                placeholder="Team Alpha"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-team-email">Email</Label>
              <Input
                id="new-team-email"
                type="email"
                placeholder="alpha@sandbox.local"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-team-password">Password (min 8 chars)</Label>
              <Input
                id="new-team-password"
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-team-cash">Starting cash (₹)</Label>
              <NumberInput
                id="new-team-cash"
                min={1}
                value={newCash}
                onChange={(e) => setNewCash(e.target.value)}
                className="tabular-nums"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button variant="buy" disabled={isAdding} onClick={handleAdd}>
              {isAdding ? "CREATING…" : "Create Team"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename team */}
      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename {renameTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rename-team-input">New name</Label>
            <Input
              id="rename-team-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="buy"
              onClick={async () => {
                if (!renameTarget || !renameValue.trim()) return;
                const ok = await renameTeam(renameTarget.id, renameValue.trim());
                if (ok) setRenameTarget(null);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Starting cash */}
      <Dialog open={!!cashTarget} onOpenChange={(open) => !open && setCashTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Starting cash — {cashTarget?.name}</DialogTitle>
            <DialogDescription>
              Editable only while the team has no executed trades. Mid-run adjustments should use
              Credit/Debit in the ledger panel so history stays auditable.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="starting-cash-input">Starting cash (₹)</Label>
            <NumberInput
              id="starting-cash-input"
              min={1}
              value={cashValue}
              onChange={(e) => setCashValue(e.target.value)}
              className="tabular-nums"
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCashTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="buy"
              onClick={async () => {
                if (!cashTarget) return;
                const amount = parseFloat(cashValue);
                if (!Number.isFinite(amount) || amount <= 0) return;
                const ok = await setTeamStartingCash(cashTarget.id, amount);
                if (ok) setCashTarget(null);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirmation (two-step force when history exists) */}
      <AlertDialog
        open={!!removeTarget}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the team account, its holdings, transactions, cash ledger,
              and dividend history. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (!removeTarget) return;
                const res = await removeTeam(removeTarget.id, false);
                if (!res.ok && res.needsForce) {
                  const confirmed = window.confirm(
                    `${res.message}\n\nRemove anyway? ALL trade history for this team will be permanently deleted.`
                  );
                  if (!confirmed) return;
                  const forced = await removeTeam(removeTarget.id, true);
                  if (forced.ok) setRemoveTarget(null);
                  return;
                }
                if (res.ok) setRemoveTarget(null);
              }}
            >
              Remove Team
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
};

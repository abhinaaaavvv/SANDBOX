"use client";

import React, { useState } from "react";
import { useSandboxStore } from "@/context/SandboxContext";
import { formatPaise, formatINR, formatPercent, cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
import { LeaderboardTable } from "@/components/shared/LeaderboardTable";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";

export const AdminPanel: React.FC = () => {
  const {
    currentRound,
    roundStatus,
    marketStatusDb,
    tradingStatusDb,
    roundEndsAt,
    stocks,
    pendingPriceChanges,
    teams,
    startRound,
    endRound,
    setMarketStatus,
    resumeTrading,
    setPendingPriceChange,
    clearPendingPriceChange,
    applyPriceChanges,
    payDividends,
    creditCash,
    debitCash,
    resetCompetition,
    addStock,
    editStock,
    toggleStockActive,
    addToast,
  } = useSandboxStore();

  // Drafts are stored as raw strings so admins can freely clear and retype prices.
  const [editedPrices, setEditedPrices] = useState<Record<string, string>>({});
  const [showApplyConfirmation, setShowApplyConfirmation] = useState(false);
  const [showResetConfirmation, setShowResetConfirmation] = useState(false);

  const [dividendStockId, setDividendStockId] = useState<string>(stocks[0]?.id || "");
  const [dividendAmount, setDividendAmount] = useState<string>("25");

  const [cashTeamId, setCashTeamId] = useState<string>(teams[0]?.id ?? "");
  const [cashAmount, setCashAmount] = useState<string>("1000");
  const [cashReason, setCashReason] = useState<string>("");

  // Stock Management state
  const [showAddStockDialog, setShowAddStockDialog] = useState(false);
  const [showEditStockDialog, setShowEditStockDialog] = useState(false);
  const [showToggleStockDialog, setShowToggleStockDialog] = useState(false);
  const [selectedStockForEdit, setSelectedStockForEdit] = useState<{ id: string; symbol: string; name: string; description: string; isActive: boolean } | null>(null);
  const [newStockSymbol, setNewStockSymbol] = useState("");
  const [newStockName, setNewStockName] = useState("");
  const [newStockDescription, setNewStockDescription] = useState("");
  const [newStockPrice, setNewStockPrice] = useState("1000");
  const [editStockName, setEditStockName] = useState("");
  const [editStockDescription, setEditStockDescription] = useState("");

  // Stock Management handlers
  const handleAddStock = async () => {
    const price = parseFloat(newStockPrice);
    if (!newStockSymbol.trim() || !newStockName.trim() || !Number.isFinite(price) || price <= 0) {
      addToast("error", "Invalid Input", "Symbol, name, and a valid price are required.");
      return;
    }
    await addStock({
      symbol: newStockSymbol.trim().toUpperCase(),
      name: newStockName.trim(),
      description: newStockDescription.trim(),
      currentPrice: price,
    });
    setNewStockSymbol("");
    setNewStockName("");
    setNewStockDescription("");
    setNewStockPrice("1000");
    setShowAddStockDialog(false);
  };

  const handleEditStock = async () => {
    if (!selectedStockForEdit || !editStockName.trim()) {
      addToast("error", "Invalid Input", "Stock name is required.");
      return;
    }
    await editStock(selectedStockForEdit.id, {
      name: editStockName.trim(),
      description: editStockDescription.trim(),
    });
    setEditStockName("");
    setEditStockDescription("");
    setSelectedStockForEdit(null);
    setShowEditStockDialog(false);
  };

  const handleToggleStock = async () => {
    if (!selectedStockForEdit) return;
    await toggleStockActive(selectedStockForEdit.id, !selectedStockForEdit.isActive);
    setSelectedStockForEdit(null);
    setShowToggleStockDialog(false);
  };

  const openEditStockDialog = (stock: { id: string; symbol: string; name: string; description: string; isActive: boolean }) => {
    setSelectedStockForEdit(stock);
    setEditStockName(stock.name);
    setEditStockDescription(stock.description);
    setShowEditStockDialog(true);
  };

  const openToggleStockDialog = (stock: { id: string; symbol: string; name: string; description: string; isActive: boolean }) => {
    setSelectedStockForEdit(stock);
    setShowToggleStockDialog(true);
  };

  const handlePriceInput = (stockId: string, val: string) => {
    setEditedPrices((prev) => {
      // Clearing the field removes the draft so the row falls back to the
      // current/pending price instead of showing a permanently empty input.
      if (val.trim() === "") {
        const next = { ...prev };
        delete next[stockId];
        return next;
      }
      return { ...prev, [stockId]: val };
    });
  };

  const savePendingPrice = (stockId: string) => {
    const parsed = parseFloat(editedPrices[stockId] ?? "");
    if (Number.isFinite(parsed) && parsed > 0) {
      setPendingPriceChange(stockId, parsed);
    }
  };

  const applyPresetShift = (stockId: string, pct: number) => {
    const stock = stocks.find((s) => s.id === stockId);
    if (!stock) return;
    // Shock relative to the pending price when one is already queued, so
    // stacking a shift refines the queued value instead of discarding it.
    const pending = pendingPriceChanges.find((p) => p.stockId === stockId);
    // Admin UI works in rupees (mock engine format). pending.newPrice is rupees.
    const base = pending ? pending.newPrice : stock.currentPrice;
    const newP = Math.round(base * (1 + pct / 100));
    setEditedPrices((prev) => ({ ...prev, [stockId]: String(newP) }));
    setPendingPriceChange(stockId, newP);
  };

  const dispatchDividend = () => {
    const amt = parseFloat(dividendAmount);
    if (Number.isFinite(amt) && amt > 0) {
      payDividends(dividendStockId, amt);
    }
  };

  const handleCashAdjust = (kind: "credit" | "debit") => {
    const amt = parseFloat(cashAmount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    const res =
      kind === "credit"
        ? creditCash(cashTeamId, amt, cashReason.trim() || undefined)
        : debitCash(cashTeamId, amt, cashReason.trim() || undefined);
    if (!res.ok) {
      addToast("error", "Cash Adjustment Failed", res.message ?? "Unable to adjust cash.");
      return;
    }
    // Keep the amount so repeat adjustments are quick; clear the reason.
    setCashReason("");
  };

  const isRoundActive = roundStatus === "active";
  const roundEndsLabel = roundEndsAt
    ? new Date(roundEndsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  return (
    <div className="mx-auto max-w-[1800px] space-y-5 p-4 md:p-6">
      {/* Master operational bar */}
      <div className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-card p-5 lg:flex-row lg:items-center">
        <div>
          <span className="block text-base font-semibold text-foreground">
            Administrator Control Center
          </span>
          <span className="text-sm text-muted-foreground">
            Central command console. Operations broadcast live to all participant dashboards.
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
          <Button variant="destructive" size="sm" onClick={() => setShowResetConfirmation(true)}>
            Reset Competition
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left column */}
        <div className="space-y-4 lg:col-span-5">
          {/* Round manager */}
          <Panel>
            <PanelHeader>
              <PanelTitle>Round Manager</PanelTitle>
              {roundEndsLabel && (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {isRoundActive ? `Trading ends ${roundEndsLabel}` : `Last window ended ${roundEndsLabel}`}
                </span>
              )}
            </PanelHeader>
            <div className="flex flex-col gap-2 p-4">
              {[1, 2, 3].map((rNum) => {
                const roundVal = rNum as 1 | 2 | 3;
                const isActive = currentRound === roundVal;
                const desc =
                  rNum === 1
                    ? "Round 01 — Portfolio Building (15m)"
                    : rNum === 2
                    ? "Round 02 — Newspaper Trading (15m)"
                    : "Round 03 — Video Trading (15m)";

                return (
                  <div
                    key={rNum}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-md border px-3 py-2.5",
                      isActive ? "border-ring bg-muted" : "border-border bg-card"
                    )}
                  >
                    <span className="text-sm font-medium text-foreground">{desc}</span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="buy"
                        size="sm"
                        disabled={isActive && isRoundActive}
                        onClick={() => startRound(roundVal)}
                      >
                        Start
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

          {/* Dividend dispatcher */}
          <Panel>
            <PanelHeader>
              <PanelTitle>Dividend Dispatcher</PanelTitle>
            </PanelHeader>
            <div className="flex flex-col gap-3 p-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="dividend-stock">Security</Label>
                  <Select value={dividendStockId} onValueChange={setDividendStockId}>
                    <SelectTrigger id="dividend-stock">
                      <SelectValue placeholder="Select security" />
                    </SelectTrigger>
                    <SelectContent>
                      {stocks.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.symbol} — {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="dividend-amount">Payout (₹ / share)</Label>
                  <NumberInput
                    id="dividend-amount"
                    min={1}
                    value={dividendAmount}
                    onChange={(e) => setDividendAmount(e.target.value)}
                    className="font-semibold tabular-nums"
                  />
                </div>
              </div>
              <Button variant="warn" onClick={dispatchDividend}>
                Dispatch Dividend Payout
              </Button>
            </div>
          </Panel>

          {/* Team cash ledger & adjustments */}
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
                    className={team.id === cashTeamId ? "bg-muted/50" : undefined}
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
                  <Select value={cashTeamId} onValueChange={setCashTeamId}>
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

          {/* Leaderboard (admin oversight) */}
          <LeaderboardTable />
        </div>

        {/* Right column: private price editor */}
        <Panel className="flex flex-col lg:col-span-7">
          <PanelHeader className="flex-wrap">
            <div className="flex flex-col gap-0.5">
              <PanelTitle>Private Price Editor</PanelTitle>
              <span className="text-xs text-muted-foreground">
                Pending changes remain strictly private until broadcast.
              </span>
            </div>
            {pendingPriceChanges.length > 0 && (
              <Badge variant="warn">{pendingPriceChanges.length} pending</Badge>
            )}
          </PanelHeader>

          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Security</TableHead>
                <TableHead className="text-right">Current</TableHead>
                <TableHead className="text-center">Shocks</TableHead>
                <TableHead className="text-right">New Price</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Save</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stocks
        .filter((stock) => stock.isActive)
        .map((stock) => {
                const pending = pendingPriceChanges.find((p) => p.stockId === stock.id);
                const currentEditVal =
                  editedPrices[stock.id] ?? String(pending ? pending.newPrice : stock.currentPrice);

                return (
                  <TableRow key={stock.id}>
                    <TableCell>
                      <span className="text-sm font-semibold text-foreground">{stock.symbol}</span>
                    </TableCell>

                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {stock.quoteAvailable ? formatPaise(stock.currentPricePaise) : "N/A"}
                    </TableCell>

                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="sell" size="xs" onClick={() => applyPresetShift(stock.id, -10)}>
                          -10%
                        </Button>
                        <Button variant="sell" size="xs" onClick={() => applyPresetShift(stock.id, -5)}>
                          -5%
                        </Button>
                        <Button variant="buy" size="xs" onClick={() => applyPresetShift(stock.id, 5)}>
                          +5%
                        </Button>
                        <Button variant="buy" size="xs" onClick={() => applyPresetShift(stock.id, 10)}>
                          +10%
                        </Button>
                      </div>
                    </TableCell>

                    <TableCell className="text-right">
                      <NumberInput
                        value={currentEditVal}
                        onChange={(e) => handlePriceInput(stock.id, e.target.value)}
                        containerClassName="inline-flex"
                        className="w-24 text-right font-semibold tabular-nums"
                        aria-label={`New price for ${stock.symbol}`}
                      />
                    </TableCell>

                    <TableCell className="text-center">
                      {pending ? (
                        <Badge variant="warn">Pending</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Current</span>
                      )}
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="secondary" size="xs" onClick={() => savePendingPrice(stock.id)}>
                          Queue
                        </Button>
                        {pending && (
                          <Button
                            variant="destructive"
                            size="xs"
                            onClick={() => clearPendingPriceChange(stock.id)}
                            aria-label={`Clear pending price change for ${stock.symbol}`}
                          >
                            ✕
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <div className="mt-auto space-y-2 border-t border-border p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total queued price modifications:</span>
              <span className="font-semibold text-warn">{pendingPriceChanges.length} securities</span>
            </div>
            <Button
              variant="warn"
              className="w-full"
              disabled={pendingPriceChanges.length === 0}
              onClick={() => setShowApplyConfirmation(true)}
            >
              Apply All Price Changes To Competition
            </Button>
          </div>

          {/* Stock Management */}
          <Panel className="flex flex-col">
            <PanelHeader>
              <PanelTitle>Stock Management</PanelTitle>
              <span className="text-xs text-muted-foreground">
                Add, rename, or toggle stock activation. Changes broadcast live.
              </span>
            </PanelHeader>
            <div className="p-4 space-y-4">
              {/* Add Stock */}
              <div className="flex items-center gap-2">
                <Button variant="buy" onClick={() => setShowAddStockDialog(true)}>
                  Add Stock
                </Button>
              </div>

              {/* Stocks Table */}
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Symbol</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stocks.map((stock) => (
                    <TableRow key={stock.id}>
                      <TableCell>
                        <span className="text-sm font-semibold text-foreground">{stock.symbol}</span>
                      </TableCell>
                      <TableCell className="text-foreground">{stock.name}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={stock.isActive ? "buy" : "secondary"}>
                          {stock.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="secondary" size="xs" onClick={() => openEditStockDialog({ id: stock.id, symbol: stock.symbol, name: stock.name, description: stock.description ?? "", isActive: stock.isActive })}>
                            Edit
                          </Button>
                          <Button
                            variant={stock.isActive ? "warn" : "buy"}
                            size="xs"
                            onClick={() => openToggleStockDialog({ id: stock.id, symbol: stock.symbol, name: stock.name, description: stock.description ?? "", isActive: stock.isActive })}
                          >
                            {stock.isActive ? "Deactivate" : "Activate"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Panel>
        </Panel>
      </div>

      {/* Apply price changes confirmation */}
      <AlertDialog open={showApplyConfirmation} onOpenChange={setShowApplyConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Broadcast price changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Applying these {pendingPriceChanges.length} price modifications will immediately
              update market valuations, portfolio values, and leaderboard rankings across all
              participant screens.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border bg-muted/60 p-2.5 text-sm">
            {pendingPriceChanges.map((p) => {
              // Prefer the live quote as the "from" price — the queued item's
              // stored currentPrice may be stale if a batch was applied since.
              const fromPrice =
                stocks.find((s) => s.id === p.stockId)?.currentPrice ?? p.currentPrice;
              const changeAmount = p.newPrice - fromPrice;
              const changePercent = fromPrice > 0 ? (changeAmount / fromPrice) * 100 : 0;
              return (
                <div key={p.stockId} className="flex items-center justify-between py-0.5">
                  <span className="font-semibold text-foreground">{p.symbol}</span>
                  <div className="flex items-center gap-1.5 tabular-nums">
                    <span className="text-muted-foreground">{formatINR(fromPrice)}</span>
                    <ArrowRight className="size-3 text-muted-foreground" />
                    <span className="font-semibold text-foreground">{formatINR(p.newPrice)}</span>
                    <span className={changeAmount >= 0 ? "text-up" : "text-down"}>
                      ({formatPercent(changePercent)})
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="warn"
              onClick={async () => {
                const appliedStockIds = pendingPriceChanges.map((p) => p.stockId);
                await applyPriceChanges();
                // Drop stale drafts so rows fall back to the newly applied market prices.
                setEditedPrices((prev) => {
                  const next = { ...prev };
                  appliedStockIds.forEach((id) => delete next[id]);
                  return next;
                });
                setShowApplyConfirmation(false);
              }}
            >
              Confirm &amp; Broadcast
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset competition confirmation */}
      <AlertDialog open={showResetConfirmation} onOpenChange={setShowResetConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset the entire competition?</AlertDialogTitle>
            <AlertDialogDescription>
              This restores all teams to ₹1,00,000 cash, clears holdings, transactions, pending
              price changes, and stops any video broadcast. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Separator />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                await resetCompetition();
                setEditedPrices({});
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

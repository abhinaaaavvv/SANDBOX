"use client";

import React, { useState } from "react";
import { ArrowRight } from "lucide-react";
import { useSandboxStore } from "@/context/SandboxContext";
import { formatINR, formatPaise, formatPercent } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NumberInput } from "@/components/ui/number-input";
import { Separator } from "@/components/ui/separator";
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
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";

/**
 * Private price editor. Queued changes stay strictly admin-side until
 * "Apply" atomically reprices the market for everyone.
 */
export const PriceEditorSection: React.FC = () => {
  const {
    stocks,
    pendingPriceChanges,
    setPendingPriceChange,
    clearPendingPriceChange,
    applyPriceChanges,
  } = useSandboxStore();

  // Drafts are stored as raw strings so admins can freely clear and retype prices.
  const [editedPrices, setEditedPrices] = useState<Record<string, string>>({});
  const [showApplyConfirmation, setShowApplyConfirmation] = useState(false);

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

    // Typing or stepping a price queues it immediately — same behaviour as
    // the shock buttons, so the Pending badge and ✕ always appear together.
    const parsed = parseFloat(val);
    if (Number.isFinite(parsed) && parsed > 0) {
      setPendingPriceChange(stockId, parsed);
    }
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
    const base = pending ? pending.newPrice : stock.currentPrice;
    const newP = Math.round(base * (1 + pct / 100));
    setEditedPrices((prev) => ({ ...prev, [stockId]: String(newP) }));
    setPendingPriceChange(stockId, newP);
  };

  return (
    <>
      <Panel className="flex flex-col">
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

        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[22%]">Security</TableHead>
              <TableHead className="w-[13%] text-right">Current</TableHead>
              <TableHead className="w-[34%] text-center">Shocks</TableHead>
              <TableHead className="w-[13%] text-right">New Price</TableHead>
              <TableHead className="w-[8%] text-center">Status</TableHead>
              <TableHead className="w-[10%] text-right">Save</TableHead>
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
                      <div className="flex flex-wrap items-center justify-center gap-1">
                        <Button variant="sell" size="xs" onClick={() => applyPresetShift(stock.id, -10)}>
                          -10%
                        </Button>
                        <Button variant="sell" size="xs" onClick={() => applyPresetShift(stock.id, -8)}>
                          -8%
                        </Button>
                        <Button variant="sell" size="xs" onClick={() => applyPresetShift(stock.id, -5)}>
                          -5%
                        </Button>
                        <Button variant="sell" size="xs" onClick={() => applyPresetShift(stock.id, -2)}>
                          -2%
                        </Button>
                        <Button variant="buy" size="xs" onClick={() => applyPresetShift(stock.id, 2)}>
                          +2%
                        </Button>
                        <Button variant="buy" size="xs" onClick={() => applyPresetShift(stock.id, 5)}>
                          +5%
                        </Button>
                        <Button variant="buy" size="xs" onClick={() => applyPresetShift(stock.id, 8)}>
                          +8%
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
      </Panel>

      {/* Apply confirmation */}
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

          <Separator />

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
    </>
  );
};

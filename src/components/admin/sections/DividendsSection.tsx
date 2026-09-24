"use client";

import React, { useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { useSandboxStore } from "@/context/SandboxContext";
import { formatINR } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
 * Batch dividend dispatcher: queue per-share payouts across multiple
 * securities, then dispatch them all at once — same queue-confirm-broadcast
 * mechanism as the private price editor.
 */
export const DividendsSection: React.FC = () => {
  const { stocks, payDividendsBatch } = useSandboxStore();

  // Drafts are stored as raw strings so admins can freely clear and retype amounts.
  const [editedDividends, setEditedDividends] = useState<Record<string, string>>({});
  const [showDispatchConfirmation, setShowDispatchConfirmation] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const activeStocks = stocks
    .filter((stock) => stock.isActive)
    .filter((stock) => {
      const q = searchTerm.trim().toLowerCase();
      if (!q) return true;
      return (
        stock.symbol.toLowerCase().includes(q) || stock.name.toLowerCase().includes(q)
      );
    });

  // Queued list derives from ALL active stocks (not the search-filtered view)
  // so hidden rows keep their queued payouts while searching.
  const queuedDividends = stocks
    .filter((stock) => stock.isActive)
    .map((stock) => {
      const parsed = parseFloat(editedDividends[stock.id] ?? "");
      return Number.isFinite(parsed) && parsed > 0
        ? { stockId: stock.id, symbol: stock.symbol, amountPerShare: parsed }
        : null;
    })
    .filter((d): d is { stockId: string; symbol: string; amountPerShare: number } => d !== null);

  const handlePayoutInput = (stockId: string, val: string) => {
    setEditedDividends((prev) => {
      // Clearing the field removes the draft so the row falls back to unqueued.
      if (val.trim() === "") {
        const next = { ...prev };
        delete next[stockId];
        return next;
      }
      return { ...prev, [stockId]: val };
    });
  };

  const clearQueuedDividend = (stockId: string) => {
    setEditedDividends((prev) => {
      const next = { ...prev };
      delete next[stockId];
      return next;
    });
  };

  return (
    <>
      <Panel className="flex flex-col">
        <PanelHeader className="flex-wrap">
          <div className="flex flex-col gap-0.5">
            <PanelTitle>Dividend Dispatcher</PanelTitle>
            <span className="text-xs text-muted-foreground">
              Queue payouts across securities, then broadcast them together.
            </span>
          </div>
          <div className="flex items-center gap-2">
            {queuedDividends.length > 0 && (
              <Badge variant="warn">{queuedDividends.length} queued</Badge>
            )}
            <div className="relative w-full sm:w-64">
              <Search className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search ticker or name…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
                aria-label="Search securities"
              />
            </div>
          </div>
        </PanelHeader>

        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[30%]">Security</TableHead>
              <TableHead className="w-[20%] text-right">Current Price</TableHead>
              <TableHead className="w-[22%] text-right">Payout (₹ / share)</TableHead>
              <TableHead className="w-[13%] text-center">Status</TableHead>
              <TableHead className="w-[15%] text-right">Clear</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activeStocks.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  No securities match your search.
                </TableCell>
              </TableRow>
            ) : (
              activeStocks.map((stock) => {
              const parsed = parseFloat(editedDividends[stock.id] ?? "");
              const queued = Number.isFinite(parsed) && parsed > 0;
              const currentEditVal = editedDividends[stock.id] ?? "";

              return (
                <TableRow key={stock.id}>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold text-foreground">{stock.symbol}</span>
                      <span className="truncate text-xs text-muted-foreground">{stock.name}</span>
                    </div>
                  </TableCell>

                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {stock.quoteAvailable ? formatINR(stock.currentPrice) : "N/A"}
                  </TableCell>

                  <TableCell className="text-right">
                    <NumberInput
                      value={currentEditVal}
                      onChange={(e) => handlePayoutInput(stock.id, e.target.value)}
                      containerClassName="inline-flex"
                      className="w-24 text-right font-semibold tabular-nums"
                      aria-label={`Dividend payout for ${stock.symbol}`}
                    />
                  </TableCell>

                  <TableCell className="text-center">
                    {queued ? (
                      <Badge variant="warn">Queued</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  <TableCell className="text-right">
                    {queued && (
                      <Button
                        variant="destructive"
                        size="xs"
                        onClick={() => clearQueuedDividend(stock.id)}
                        aria-label={`Clear queued dividend for ${stock.symbol}`}
                      >
                        ✕
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
              })
            )}
          </TableBody>
        </Table>

        <div className="mt-auto space-y-2 border-t border-border p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total queued dividends:</span>
            <span className="font-semibold text-warn">{queuedDividends.length} securities</span>
          </div>
          <Button
            variant="warn"
            className="w-full"
            disabled={queuedDividends.length === 0}
            onClick={() => setShowDispatchConfirmation(true)}
          >
            Dispatch All Dividends
          </Button>
        </div>
      </Panel>

      {/* Dispatch confirmation */}
      <AlertDialog open={showDispatchConfirmation} onOpenChange={setShowDispatchConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Broadcast dividends?</AlertDialogTitle>
            <AlertDialogDescription>
              Dispatching these {queuedDividends.length} dividends will immediately pay every
              holding team and update cash balances across all participant screens.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border bg-muted/60 p-2.5 text-sm">
            {queuedDividends.map((d) => (
              <div key={d.stockId} className="flex items-center justify-between py-0.5">
                <span className="font-semibold text-foreground">{d.symbol}</span>
                <div className="flex items-center gap-1.5 tabular-nums">
                  <ArrowRight className="size-3 text-muted-foreground" />
                  <span className="font-semibold text-foreground">
                    {formatINR(d.amountPerShare)} / share
                  </span>
                </div>
              </div>
            ))}
          </div>

          <Separator />

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="warn"
              onClick={async () => {
                const dispatchedStockIds = queuedDividends.map((d) => d.stockId);
                await payDividendsBatch(
                  queuedDividends.map((d) => ({
                    stockId: d.stockId,
                    amountPerShare: d.amountPerShare,
                  }))
                );
                // Drop drafts so rows fall back to unqueued.
                setEditedDividends((prev) => {
                  const next = { ...prev };
                  dispatchedStockIds.forEach((id) => delete next[id]);
                  return next;
                });
                setShowDispatchConfirmation(false);
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

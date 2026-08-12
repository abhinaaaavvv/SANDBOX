"use client";

import React, { useState } from "react";
import { Stock } from "@/types/sandbox";
import { useSandboxStore } from "@/context/SandboxContext";
import { formatINR } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { ShieldAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Badge } from "@/components/ui/badge";

interface TradeModalProps {
  stock: Stock;
  mode: "BUY" | "SELL";
  onClose: () => void;
}

export const TradeModal: React.FC<TradeModalProps> = ({ stock, mode, onClose }) => {
  const { cash, holdings, stocks, marketStatus, executeBuy, executeSell } = useSandboxStore();
  const [quantity, setQuantity] = useState<number>(10);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Track the live quote while the modal is open — prices can move via
  // broadcast (e.g. an applied price batch) while the participant decides.
  const liveStock = stocks.find((s) => s.id === stock.id) ?? stock;

  const holding = holdings.find((h) => h.stockId === stock.id);
  const ownedQty = holding ? holding.quantity : 0;
  const estimatedTotal = liveStock.currentPrice * quantity;
  const maxBuyQty = Math.floor(cash / liveStock.currentPrice);
  const maxSellQty = ownedQty;
  const maxQty = mode === "BUY" ? maxBuyQty : maxSellQty;

  const handleTrade = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg("");

    // Explicit validation — readable error instead of native constraint blocking.
    if (!Number.isInteger(quantity) || quantity < 1) {
      setErrorMsg("Please enter a valid quantity.");
      return;
    }

    setIsSubmitting(true);
    const res =
      mode === "BUY"
        ? await executeBuy(liveStock.id, quantity)
        : await executeSell(liveStock.id, quantity);
    setIsSubmitting(false);

    if (res.success) {
      onClose();
    } else {
      setErrorMsg(res.message);
    }
  };

  const setMaxQuantity = () => setQuantity(Math.max(1, maxQty));
  const isMarketDisabled = marketStatus !== "MARKET_OPEN";
  const hasMaxQty = maxQty > 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader className="border-b border-border pb-4">
          <div className="flex items-center gap-2 pr-8">
            <Badge variant={mode === "BUY" ? "buy" : "sell"}>
              {mode === "BUY" ? "Buy" : "Sell"} order
            </Badge>
            <DialogTitle className="text-base">{liveStock.symbol}</DialogTitle>
            <span className="text-xs text-muted-foreground">{liveStock.name}</span>
          </div>            <DialogDescription className="sr-only">
              {mode} order for {liveStock.symbol}
            </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleTrade} className="flex flex-col gap-4 pt-1">
          {/* Price details grid */}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border">
            <div className="bg-muted/60 p-3">
              <span className="block text-xs text-muted-foreground">Current Price</span>
              <span className="mt-0.5 block text-lg font-semibold tabular-nums text-foreground">
                {formatINR(liveStock.currentPrice)}
              </span>
            </div>
            <div className="bg-muted/60 p-3">
              <span className="block text-xs text-muted-foreground">24H Change</span>
              <span
                className={cn(
                  "mt-0.5 block text-base font-semibold tabular-nums",
                  liveStock.change >= 0 ? "text-up" : "text-down"
                )}
              >
                {liveStock.change >= 0 ? "+" : ""}
                {liveStock.change.toFixed(0)} ({liveStock.changePercent.toFixed(2)}%)
              </span>
            </div>
          </div>

          {/* Cash / holdings context */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {mode === "BUY" ? "Available cash" : "Owned quantity"}
            </span>
            <span className="font-semibold tabular-nums text-foreground">
              {mode === "BUY" ? formatINR(cash) : `${ownedQty} shares`}
            </span>
          </div>

          {/* Quantity */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="trade-qty">Quantity</Label>
              <button
                type="button"
                onClick={setMaxQuantity}
                disabled={!hasMaxQty}
                className="text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              >
                Max ({Math.max(0, maxQty)})
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
              >
                −
              </Button>
              <NumberInput
                id="trade-qty"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 0))}
                className="h-10 text-center text-base font-semibold tabular-nums"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setQuantity((q) => Math.min(q + 1, Math.max(1, maxQty)))}
                aria-label="Increase quantity"
              >
                +
              </Button>
            </div>
            <div className="flex gap-1.5">
              {[5, 10, 25, 50, 100].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setQuantity(num)}
                  className={cn(
                    "flex-1 rounded-md border px-1 py-1.5 text-xs font-medium transition-colors",
                    quantity === num
                      ? "border-ring bg-muted text-foreground"
                      : "border-border bg-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Order summary */}
          <div className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/60 p-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Price per share</span>
              <span className="tabular-nums">{formatINR(liveStock.currentPrice)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Brokerage / fee</span>
              <span className="text-up">₹0</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2 font-semibold text-foreground">
              <span>Estimated total</span>
              <span className="text-base tabular-nums">{formatINR(estimatedTotal)}</span>
            </div>
          </div>

          {/* Error / warning */}
          {errorMsg && (
            <div className="flex items-center gap-2 rounded-md border border-down/25 bg-down/10 px-3 py-2.5 text-sm text-down">
              <ShieldAlert className="size-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          {isMarketDisabled && (
            <div className="rounded-md border border-warn/25 bg-warn/10 px-3 py-2.5 text-center text-sm text-warn">
              Trading is currently paused or closed.
            </div>
          )}

          {/* Actions */}
          <DialogFooter className="pt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={mode === "BUY" ? "buy" : "sell"}
              disabled={isMarketDisabled || isSubmitting}
            >
              {isSubmitting ? "Processing…" : `Confirm ${mode === "BUY" ? "Buy" : "Sell"}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

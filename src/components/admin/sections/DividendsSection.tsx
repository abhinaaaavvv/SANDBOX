"use client";

import React, { useState } from "react";
import { useSandboxStore } from "@/context/SandboxContext";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";

/**
 * Dividend dispatcher: pays a per-share amount to every team holding the
 * selected security. Payments land in team cash and transaction history
 * in realtime.
 */
export const DividendsSection: React.FC = () => {
  const { stocks, payDividends } = useSandboxStore();

  const [dividendStockId, setDividendStockId] = useState("");
  const [dividendAmount, setDividendAmount] = useState("25");

  // Keep the selection valid once async stock data arrives.
  const activeDividendStockId = stocks.some((s) => s.id === dividendStockId)
    ? dividendStockId
    : stocks[0]?.id ?? "";

  const dispatchDividend = () => {
    const amt = parseFloat(dividendAmount);
    if (Number.isFinite(amt) && amt > 0) {
      payDividends(activeDividendStockId, amt);
    }
  };

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Dividend Dispatcher</PanelTitle>
        <span className="text-xs text-muted-foreground">
          Pays every holding team instantly
        </span>
      </PanelHeader>
      <div className="flex flex-col gap-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dividend-stock">Security</Label>
            <Select value={activeDividendStockId} onValueChange={setDividendStockId}>
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
  );
};

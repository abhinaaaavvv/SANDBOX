"use client";

import React, { useState } from "react";
import { Stock } from "@/types/sandbox";
import { useSandboxStore } from "@/context/SandboxContext";
import { formatPaise, cn } from "@/lib/utils";
import { usePriceFlash } from "@/hooks/usePriceFlash";
import { Search, ArrowUpDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";

interface MarketTableProps {
  onTrade: (stock: Stock, mode: "BUY" | "SELL") => void;
}

const PriceCell: React.FC<{ stock: Stock }> = ({ stock }) => {
  const flash = usePriceFlash(stock.currentPricePaise);

  if (!stock.quoteAvailable) {
    return (
      <span className="tabular-nums text-muted-foreground italic">
        N/A
      </span>
    );
  }

  return (
    <span
      className={cn(
        "tabular-nums",
        flash === "up" && "price-flash-up",
        flash === "down" && "price-flash-down"
      )}
    >
      {formatPaise(stock.currentPricePaise)}
    </span>
  );
};

export const MarketTable: React.FC<MarketTableProps> = ({ onTrade }) => {
  const { stocks, holdings, marketStatus } = useSandboxStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<"symbol" | "currentPricePaise" | "changePercent">(
    "symbol"
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const filtered = stocks.filter(
    (s) =>
      s.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.sector?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
  );

  const sorted = [...filtered].sort((a, b) => {
    let valA: string | number | undefined = a[sortField];
    let valB: string | number | undefined = b[sortField];
    // Undefined sorts to end
    if (valA === undefined && valB === undefined) return 0;
    if (valA === undefined) return 1;
    if (valB === undefined) return -1;
    if (typeof valA === "string") {
      valA = valA.toLowerCase();
      valB = (valB as string).toLowerCase();
    }
    if (valA < valB) return sortOrder === "asc" ? -1 : 1;
    if (valA > valB) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  const toggleSort = (field: "symbol" | "currentPricePaise" | "changePercent") => {
    if (sortField === field) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const sortKeyHandler =
    (field: "symbol" | "currentPricePaise" | "changePercent") =>
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleSort(field);
      }
    };

  const isTradingDisabled = marketStatus !== "MARKET_OPEN";

  return (
    <Panel>
      {/* Table header controls */}
      <PanelHeader className="flex-col gap-3 sm:flex-row">
        <div className="flex items-baseline gap-2">
          <PanelTitle>Market Securities</PanelTitle>
          <span className="text-xs text-muted-foreground">({stocks.length} securities)</span>
        </div>

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
      </PanelHeader>

      {/* Dense financial table */}
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead
              scope="col"
              aria-sort={sortField === "symbol" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
              className="cursor-pointer select-none"
              onClick={() => toggleSort("symbol")}
            >
              <span
                role="button"
                tabIndex={0}
                className="flex items-center gap-1"
                onKeyDown={sortKeyHandler("symbol")}
              >
                Security <ArrowUpDown className="size-3 opacity-60" />
              </span>
            </TableHead>
            <TableHead
              scope="col"
              aria-sort={sortField === "currentPricePaise" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
              className="cursor-pointer select-none text-right"
              onClick={() => toggleSort("currentPricePaise")}
            >
              <span
                role="button"
                tabIndex={0}
                className="flex items-center justify-end gap-1"
                onKeyDown={sortKeyHandler("currentPricePaise")}
              >
                Price <ArrowUpDown className="size-3 opacity-60" />
              </span>
            </TableHead>
            <TableHead
              scope="col"
              aria-sort={sortField === "changePercent" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
              className="cursor-pointer select-none text-right"
              onClick={() => toggleSort("changePercent")}
            >
              <span
                role="button"
                tabIndex={0}
                className="flex items-center justify-end gap-1"
                onKeyDown={sortKeyHandler("changePercent")}
              >
                Change <ArrowUpDown className="size-3 opacity-60" />
              </span>
            </TableHead>
            <TableHead className="text-center">Owned</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((stock) => {
            const holding = holdings.find((h) => h.stockId === stock.id);
            const ownedQty = holding ? holding.quantity : 0;
            const changeAvailable = stock.change != null && stock.changePercent != null;
            const isPositive = changeAvailable && stock.change! >= 0;

            return (
              <TableRow key={stock.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{stock.symbol}</span>
                    <span className="hidden text-xs text-muted-foreground lg:inline">
                      {stock.name}
                    </span>
                    {!stock.quoteAvailable && (
                      <span className="text-xs text-yellow-500" title="No market quote available">⚠</span>
                    )}
                  </div>
                </TableCell>

                <TableCell className="text-right font-semibold tabular-nums text-foreground">
                  <PriceCell stock={stock} />
                </TableCell>

                <TableCell className="text-right font-medium tabular-nums">
                  {changeAvailable ? (
                    <span className={cn(isPositive ? "text-up" : "text-down")}>
                      {isPositive ? "+" : ""}
                      {stock.change!.toFixed(0)} ({stock.changePercent!.toFixed(2)}%)
                    </span>
                  ) : (
                    <span className="text-muted-foreground italic">N/A</span>
                  )}
                </TableCell>

                <TableCell className="text-center text-sm tabular-nums">
                  {ownedQty > 0 ? (
                    <span className="font-medium text-foreground">
                      {ownedQty} <span className="text-xs text-muted-foreground">shares</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>

                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      variant="buy"
                      size="sm"
                      disabled={isTradingDisabled || !stock.quoteAvailable}
                      onClick={() => onTrade(stock, "BUY")}
                    >
                      Buy
                    </Button>
                    <Button
                      variant="sell"
                      size="sm"
                      disabled={isTradingDisabled || ownedQty === 0 || !stock.quoteAvailable}
                      onClick={() => onTrade(stock, "SELL")}
                    >
                      Sell
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}

          {sorted.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                No securities found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Panel>
  );
};

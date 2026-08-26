"use client";

import React from "react";
import { useSandboxStore } from "@/context/SandboxContext";
import { formatINR, formatPercent } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Stock } from "@/types/sandbox";
import { usePriceFlash } from "@/hooks/usePriceFlash";
import { TrendingUp, TrendingDown } from "lucide-react";
import dynamic from "next/dynamic";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader, PanelMeta, PanelTitle } from "@/components/ui/panel";
import { CHARCOAL_COLORS } from "@/components/participant/AllocationChart";

interface PortfolioSectionProps {
  onTrade: (stock: Stock, mode: "BUY" | "SELL") => void;
}

// Chart library is heavy (~100 KB gz) — fetch it only when this panel renders.
// The slot keeps a fixed h-44 height so loading causes no layout shift.
const AllocationChart = dynamic(
  () => import("@/components/participant/AllocationChart"),
  {
    ssr: false,
    loading: () => (
      <div className="skeleton-shimmer size-40 rounded-full self-center" />
    ),
  }
);

const HoldingPrice: React.FC<{ price: number }> = ({ price }) => {
  const flash = usePriceFlash(price);
  return (
    <span
      className={cn(
        "tabular-nums",
        flash === "up" && "price-flash-up",
        flash === "down" && "price-flash-down"
      )}
    >
      {formatINR(price)}
    </span>
  );
};

export const PortfolioSection: React.FC<PortfolioSectionProps> = ({ onTrade }) => {
  const { holdings, stocks, marketStatus, isTeamBlocked } = useSandboxStore();
  const isTradingDisabled = marketStatus !== "MARKET_OPEN" || isTeamBlocked;

  const chartData = holdings.map((h) => ({
    name: h.symbol,
    value: h.totalValue,
  }));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Holdings table */}
      <Panel className="lg:col-span-2">
        <PanelHeader>
          <PanelTitle>Active Positions</PanelTitle>
          <PanelMeta>{holdings.length} positions</PanelMeta>
        </PanelHeader>

        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Security</TableHead>
              <TableHead className="text-center">Qty</TableHead>
              <TableHead className="text-right">Avg Buy</TableHead>
              <TableHead className="text-right">Current</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="text-right">Unrealized P/L</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {holdings.map((h) => {
              const stock = stocks.find((s) => s.id === h.stockId);
              const isPositive = h.unrealizedPL >= 0;

              return (
                <TableRow key={h.stockId}>
                  <TableCell>
                    <div className="font-semibold text-foreground">{h.symbol}</div>
                    <div className="max-w-40 truncate text-xs text-muted-foreground">
                      {h.name}
                    </div>
                  </TableCell>

                  <TableCell className="text-center font-medium tabular-nums text-foreground">
                    {h.quantity}
                  </TableCell>

                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatINR(h.averageBuyPrice)}
                  </TableCell>

                  <TableCell className="text-right font-semibold tabular-nums text-foreground">
                    <HoldingPrice price={h.currentPrice} />
                  </TableCell>

                  <TableCell className="text-right font-semibold tabular-nums text-foreground">
                    {formatINR(h.totalValue)}
                  </TableCell>

                  <TableCell className="text-right font-medium tabular-nums">
                    <span
                      className={cn(
                        "inline-flex items-center gap-0.5",
                        isPositive ? "text-up" : "text-down"
                      )}
                    >
                      {isPositive ? (
                        <TrendingUp className="size-3.5" />
                      ) : (
                        <TrendingDown className="size-3.5" />
                      )}
                      {formatINR(h.unrealizedPL)} ({formatPercent(h.unrealizedPLPercent)})
                    </span>
                  </TableCell>

                  <TableCell className="text-right">
                    {stock && (
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="buy"
                          size="sm"
                          disabled={isTradingDisabled}
                          onClick={() => onTrade(stock, "BUY")}
                        >
                          Buy
                        </Button>
                        <Button
                          variant="sell"
                          size="sm"
                          disabled={isTradingDisabled}
                          onClick={() => onTrade(stock, "SELL")}
                        >
                          Sell
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}

            {holdings.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="font-bodoni py-8 text-center text-sm italic text-muted-foreground">
                  No active holdings in portfolio
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Panel>

      {/* Allocation visualizer */}
      <Panel className="flex flex-col p-4">
        <PanelHeader className="px-0 pb-3">
          <PanelTitle>Asset Allocation</PanelTitle>
        </PanelHeader>

        <div className="my-2 h-44 w-full">
          {holdings.length > 0 ? (
            <AllocationChart chartData={chartData} />
          ) : (
            <div className="font-bodoni flex h-full items-center justify-center text-sm italic text-muted-foreground">
              No allocation data
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
          {chartData.map((item, idx) => (
            <div key={item.name} className="flex items-center gap-1.5 text-xs">
              <span
                className="size-2 shrink-0 rounded-sm"
                style={{ backgroundColor: CHARCOAL_COLORS[idx % CHARCOAL_COLORS.length] }}
              />
              <span className="truncate font-medium text-muted-foreground">{item.name}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
};

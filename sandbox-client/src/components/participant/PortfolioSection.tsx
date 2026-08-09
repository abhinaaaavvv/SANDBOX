"use client";

import React from "react";
import { useSandboxStore } from "@/context/SandboxContext";
import { formatINR, formatPercent } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Stock } from "@/types/sandbox";
import { usePriceFlash } from "@/hooks/usePriceFlash";
import { TrendingUp, TrendingDown } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
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

interface PortfolioSectionProps {
  onTrade: (stock: Stock, mode: "BUY" | "SELL") => void;
}

// Neutral palette for the allocation pie.
const CHARCOAL_COLORS = ["#a1a1aa", "#71717a", "#52525b", "#3f3f46", "#d4d4d8", "#27272a"];

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
  const { holdings, stocks, marketStatus } = useSandboxStore();
  const isTradingDisabled = marketStatus !== "MARKET_OPEN";

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
                    <div className="max-w-[160px] truncate text-xs text-muted-foreground">
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
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
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
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={65}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="var(--card)"
                  strokeWidth={1}
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${entry.name}`}
                      fill={CHARCOAL_COLORS[index % CHARCOAL_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val) => formatINR(Number(val) || 0)}
                  contentStyle={{
                    backgroundColor: "#0a0a0b",
                    border: "1px solid #1c1c1f",
                    borderRadius: "6px",
                    color: "#fafafa",
                    fontSize: "12px",
                    fontFamily: "var(--font-sans)",
                  }}
                  itemStyle={{ color: "#e4e4e7" }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
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

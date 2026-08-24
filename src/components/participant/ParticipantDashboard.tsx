"use client";

import React, { useState } from "react";
import { useSandboxStore } from "@/context/SandboxContext";
import { formatINR, formatPercent } from "@/lib/utils";
import { MarketTable } from "@/components/participant/MarketTable";
import { PortfolioSection } from "@/components/participant/PortfolioSection";
import { LeaderboardTable } from "@/components/shared/LeaderboardTable";
import { TransactionHistory } from "@/components/participant/TransactionHistory";
import { TradeModal } from "@/components/participant/TradeModal";
import { Stat } from "@/components/ui/stat";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Stock } from "@/types/sandbox";
import { Pause, AlertTriangle, Clock, Hourglass } from "lucide-react";

type DashboardTab = "market" | "portfolio" | "leaderboard" | "transactions";

export const ParticipantDashboard: React.FC = () => {
  const {
    cash,
    totalPortfolioValue,
    totalProfitLoss,
    totalProfitLossPercent,
    marketStatus,
    currentRound,
    isInitializing,
  } = useSandboxStore();

  const [activeTab, setActiveTab] = useState<DashboardTab>("market");
  const [selectedTrade, setSelectedTrade] = useState<{
    stock: Stock;
    mode: "BUY" | "SELL";
  } | null>(null);

  const isPositivePL = totalProfitLoss >= 0;

  return (
    <div className="mx-auto max-w-[1800px] space-y-5 p-4 md:p-6">
      {/* Important competition state alerts */}
      {marketStatus === "NOT_STARTED" && (
        <div className="flex items-center gap-3 rounded-md border border-border bg-muted px-4 py-3 text-sm">
          <Hourglass className="size-4 shrink-0 text-muted-foreground" />
          <div>
            <span className="block font-medium text-foreground">
              Competition Not Started
            </span>
            <span className="text-xs text-muted-foreground">
              Awaiting the administrator to begin Round {currentRound}. Prepare your strategy.
            </span>
          </div>
        </div>
      )}

      {marketStatus === "TRADING_PAUSED" && (
        <div className="flex items-center gap-3 rounded-md border border-warn/25 bg-warn/10 px-4 py-3 text-sm">
          <Pause className="size-4 shrink-0 text-warn" />
          <div>
            <span className="block font-medium text-warn">
              Trading Paused By Administrator
            </span>
            <span className="text-xs text-muted-foreground">
              Market inspection active. Orders currently disabled.
            </span>
          </div>
        </div>
      )}

      {marketStatus === "MARKET_CLOSED" && (
        <div className="flex items-center gap-3 rounded-md border border-down/25 bg-down/10 px-4 py-3 text-sm">
          <AlertTriangle className="size-4 shrink-0 text-down" />
          <div>
            <span className="block font-medium text-down">Market Closed</span>
            <span className="text-xs text-muted-foreground">
              Market is closed for Round {currentRound}. Order submissions inactive.
            </span>
          </div>
        </div>
      )}

      {marketStatus === "ROUND_ENDED" && (
        <div className="flex items-center gap-3 rounded-md border border-border bg-muted px-4 py-3 text-sm">
          <Clock className="size-4 shrink-0 text-muted-foreground" />
          <div>
            <span className="block font-medium text-foreground">
              Round {currentRound} Complete
            </span>
            <span className="text-xs text-muted-foreground">
              Round complete. Inspect holdings and final standings below.
            </span>
          </div>
        </div>
      )}

      {/* Primary financial metric bar */}
      {isInitializing ? (
        <div className="grid grid-cols-1 divide-y divide-border rounded-lg border border-border bg-card md:grid-cols-3 md:divide-x md:divide-y-0">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2 p-5 md:p-6">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-3 w-40" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 divide-y divide-border rounded-lg border border-border bg-card md:grid-cols-3 md:divide-x md:divide-y-0">
          <Stat
            label="Cash Available"
            value={formatINR(cash)}
            sub="Liquid capital for order execution"
          />
          <Stat
            label="Portfolio Value"
            value={formatINR(totalPortfolioValue)}
            sub="Cash + active market positions"
          />
          <Stat
            label="Total Profit / Loss"
            value={`${isPositivePL ? "+" : ""}${formatINR(totalProfitLoss)}`}
            positive={isPositivePL}
            sub={`${formatPercent(totalProfitLossPercent)} vs ₹1,00,000 base`}
          />
        </div>
      )}

      {/* Workspace tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DashboardTab)} className="w-full">
        <TabsList>
          <TabsTrigger value="market">Market Desk</TabsTrigger>
          <TabsTrigger value="portfolio">Holdings &amp; Portfolio</TabsTrigger>
          <TabsTrigger value="leaderboard">Live Leaderboard</TabsTrigger>
          <TabsTrigger value="transactions">Transaction Log</TabsTrigger>
        </TabsList>

        {isInitializing ? (
          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="space-y-4 xl:col-span-8">
              <div className="rounded-lg border border-border bg-card p-4">
                <Skeleton className="mb-4 h-4 w-40" />
                <div className="space-y-3">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-9 w-full" />
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-4 xl:col-span-4">
              <div className="rounded-lg border border-border bg-card p-4">
                <Skeleton className="mb-4 h-4 w-36" />
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-9 w-full" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <TabsContent value="market" className="mt-4">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                <div className="xl:col-span-8">
                  <MarketTable onTrade={(stock, mode) => setSelectedTrade({ stock, mode })} />
                </div>
                <div className="space-y-4 xl:col-span-4">
                  <LeaderboardTable />
                  <TransactionHistory />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="portfolio" className="mt-4">
              <div className="space-y-4">
                <PortfolioSection onTrade={(stock, mode) => setSelectedTrade({ stock, mode })} />
                <TransactionHistory />
              </div>
            </TabsContent>

            <TabsContent value="leaderboard" className="mt-4">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                <div className="xl:col-span-7">
                  <LeaderboardTable />
                </div>
                <div className="xl:col-span-5">
                  <PortfolioSection onTrade={(stock, mode) => setSelectedTrade({ stock, mode })} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="transactions" className="mt-4">
              <TransactionHistory />
            </TabsContent>
          </>
        )}
      </Tabs>

      {/* Trade modal */}
      {selectedTrade && (
        <TradeModal
          stock={selectedTrade.stock}
          mode={selectedTrade.mode}
          onClose={() => setSelectedTrade(null)}
        />
      )}
    </div>
  );
};

"use client";

import React, { useState } from "react";
import { useSandboxStore } from "@/context/SandboxContext";
import { formatINR, formatPercent } from "@/lib/utils";
import { MarketTable } from "@/components/MarketTable";
import { PortfolioSection } from "@/components/PortfolioSection";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { TransactionHistory } from "@/components/TransactionHistory";
import { TradeModal } from "@/components/TradeModal";
import { Stock } from "@/types/sandbox";
import {
  TrendingUp,
  TrendingDown,
  Pause,
  AlertTriangle,
  Clock,
} from "lucide-react";

export const ParticipantDashboard: React.FC = () => {
  const {
    cash,
    totalPortfolioValue,
    totalProfitLoss,
    totalProfitLossPercent,
    marketStatus,
    currentRound,
  } = useSandboxStore();

  const [activeTab, setActiveTab] = useState<"market" | "portfolio" | "leaderboard" | "transactions">("market");
  const [selectedTrade, setSelectedTrade] = useState<{ stock: Stock; mode: "BUY" | "SELL" } | null>(null);

  const isPositivePL = totalProfitLoss >= 0;

  return (
    <div className="space-y-4 max-w-[1800px] mx-auto p-4 md:p-6 font-mono">
      {/* Important Competition State Alerts */}
      {marketStatus === "TRADING_PAUSED" && (
        <div className="p-3 bg-[#1f1300] border border-[#78350f] text-[#f59e0b] flex items-center gap-3 text-xs tracking-wide">
          <Pause className="h-4 w-4 shrink-0" />
          <div>
            <span className="font-bold uppercase block">TRADING PAUSED BY ADMINISTRATOR</span>
            <span className="text-[11px] text-[#d4d4d8]">Market inspection active. Orders currently disabled.</span>
          </div>
        </div>
      )}

      {marketStatus === "MARKET_CLOSED" && (
        <div className="p-3 bg-[#1a060a] border border-[#7f1d1d] text-[#ef4444] flex items-center gap-3 text-xs tracking-wide">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div>
            <span className="font-bold uppercase block">MARKET CLOSED</span>
            <span className="text-[11px] text-[#d4d4d8]">Market is closed for Round {currentRound}. Order submissions inactive.</span>
          </div>
        </div>
      )}

      {marketStatus === "ROUND_ENDED" && (
        <div className="p-3 bg-[#111218] border border-[#27272a] text-[#a1a1aa] flex items-center gap-3 text-xs tracking-wide">
          <Clock className="h-4 w-4 shrink-0 text-[#f4f4f5]" />
          <div>
            <span className="font-bold uppercase block text-[#f4f4f5]">ROUND {currentRound} COMPLETE</span>
            <span className="text-[11px]">Round complete. Inspect holdings and final standings below.</span>
          </div>
        </div>
      )}

      {/* Primary Financial Metric Bar - Clean typographical emphasis */}
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#27272a] bg-[#0d0e14] border border-[#27272a]">
        {/* Cash Available */}
        <div className="p-4 md:p-5">
          <span className="font-garamond text-base text-[#a1a1aa] tracking-wide block mb-1">
            Cash Available
          </span>
          <div className="font-mono text-2xl lg:text-3xl font-extrabold text-[#f4f4f5]">
            {formatINR(cash)}
          </div>
          <span className="font-garamond text-xs text-[#71717a] italic mt-1 block">
            Liquid capital for order execution
          </span>
        </div>

        {/* Total Portfolio Value */}
        <div className="p-4 md:p-5">
          <span className="font-garamond text-base text-[#a1a1aa] tracking-wide block mb-1">
            Portfolio Value
          </span>
          <div className="font-mono text-2xl lg:text-3xl font-extrabold text-[#f4f4f5]">
            {formatINR(totalPortfolioValue)}
          </div>
          <span className="font-garamond text-xs text-[#71717a] italic mt-1 block">
            Cash + Active market positions
          </span>
        </div>

        {/* Total Profit / Loss */}
        <div className="p-4 md:p-5">
          <span className="font-garamond text-base text-[#a1a1aa] tracking-wide block mb-1">
            Total Profit / Loss
          </span>
          <div
            className={`font-mono text-2xl lg:text-3xl font-extrabold flex items-center gap-2 ${
              isPositivePL ? "text-[#10b981]" : "text-[#ef4444]"
            }`}
          >
            {isPositivePL ? (
              <TrendingUp className="h-5 w-5 shrink-0" />
            ) : (
              <TrendingDown className="h-5 w-5 shrink-0" />
            )}
            <span>
              {isPositivePL ? "+" : ""}
              {formatINR(totalProfitLoss)}
            </span>
          </div>
          <span
            className={`font-mono text-xs font-bold mt-1 block ${
              isPositivePL ? "text-[#10b981]" : "text-[#ef4444]"
            }`}
          >
            {formatPercent(totalProfitLossPercent)} vs ₹1,00,000 base
          </span>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-1 border-b border-[#18181b] pb-2 font-garamond text-base">
        <button
          onClick={() => setActiveTab("market")}
          className={`px-4 py-1.5 font-semibold tracking-wide transition-all border ${
            activeTab === "market"
              ? "bg-[#27272a] text-[#f4f4f5] border-[#3f3f46]"
              : "bg-[#0d0e14] text-[#a1a1aa] border-[#18181b] hover:text-[#f4f4f5]"
          }`}
        >
          Market Desk
        </button>

        <button
          onClick={() => setActiveTab("portfolio")}
          className={`px-4 py-1.5 font-semibold tracking-wide transition-all border ${
            activeTab === "portfolio"
              ? "bg-[#27272a] text-[#f4f4f5] border-[#3f3f46]"
              : "bg-[#0d0e14] text-[#a1a1aa] border-[#18181b] hover:text-[#f4f4f5]"
          }`}
        >
          Holdings & Portfolio
        </button>

        <button
          onClick={() => setActiveTab("leaderboard")}
          className={`px-4 py-1.5 font-semibold tracking-wide transition-all border ${
            activeTab === "leaderboard"
              ? "bg-[#27272a] text-[#f4f4f5] border-[#3f3f46]"
              : "bg-[#0d0e14] text-[#a1a1aa] border-[#18181b] hover:text-[#f4f4f5]"
          }`}
        >
          Live Leaderboard
        </button>

        <button
          onClick={() => setActiveTab("transactions")}
          className={`px-4 py-1.5 font-semibold tracking-wide transition-all border ${
            activeTab === "transactions"
              ? "bg-[#27272a] text-[#f4f4f5] border-[#3f3f46]"
              : "bg-[#0d0e14] text-[#a1a1aa] border-[#18181b] hover:text-[#f4f4f5]"
          }`}
        >
          Transaction Log
        </button>
      </div>

      {/* Main Tab Content */}
      <div className="space-y-4">
        {activeTab === "market" && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-8">
              <MarketTable
                onTrade={(stock, mode) => setSelectedTrade({ stock, mode })}
              />
            </div>
            <div className="xl:col-span-4 space-y-4">
              <LeaderboardTable />
              <TransactionHistory />
            </div>
          </div>
        )}

        {activeTab === "portfolio" && (
          <div className="space-y-4">
            <PortfolioSection
              onTrade={(stock, mode) => setSelectedTrade({ stock, mode })}
            />
            <TransactionHistory />
          </div>
        )}

        {activeTab === "leaderboard" && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-7">
              <LeaderboardTable />
            </div>
            <div className="xl:col-span-5">
              <PortfolioSection
                onTrade={(stock, mode) => setSelectedTrade({ stock, mode })}
              />
            </div>
          </div>
        )}

        {activeTab === "transactions" && (
          <div className="space-y-4">
            <TransactionHistory />
          </div>
        )}
      </div>

      {/* Trade Modal */}
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

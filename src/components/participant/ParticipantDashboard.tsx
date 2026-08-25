"use client";

import React, { useState } from "react";
import {
  LineChart,
  Wallet,
  Trophy,
  ReceiptText,
  Pause,
  AlertTriangle,
  Clock,
  Hourglass,
  type LucideIcon,
} from "lucide-react";
import { useSandboxStore } from "@/context/SandboxContext";
import { formatINR, formatPercent } from "@/lib/utils";
import { MarketTable } from "@/components/participant/MarketTable";
import { PortfolioSection } from "@/components/participant/PortfolioSection";
import { LeaderboardTable } from "@/components/shared/LeaderboardTable";
import { TransactionHistory } from "@/components/participant/TransactionHistory";
import { TradeModal } from "@/components/participant/TradeModal";
import { Stat } from "@/components/ui/stat";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardShell, type ShellNavItem } from "@/components/shared/DashboardShell";
import { Stock } from "@/types/sandbox";

type SectionId = "market" | "portfolio" | "leaderboard" | "transactions";

const NAV: (ShellNavItem & { id: SectionId })[] = [
  { id: "market", label: "Market Desk", icon: LineChart },
  { id: "portfolio", label: "Holdings", icon: Wallet },
  { id: "leaderboard", label: "Leaderboard", icon: Trophy },
  { id: "transactions", label: "Transactions", icon: ReceiptText },
];

const SECTION_LABELS: Record<SectionId, string> = {
  market: "Market Desk",
  portfolio: "Holdings & Portfolio",
  leaderboard: "Live Leaderboard",
  transactions: "Transaction Log",
};

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

  const [section, setSection] = useState<SectionId>("market");
  const [selectedTrade, setSelectedTrade] = useState<{
    stock: Stock;
    mode: "BUY" | "SELL";
  } | null>(null);

  const isPositivePL = totalProfitLoss >= 0;
  const openTrade = (stock: Stock, mode: "BUY" | "SELL") =>
    setSelectedTrade({ stock, mode });

  return (
    <DashboardShell
      role="participant"
      activeLabel={SECTION_LABELS[section]}
      nav={NAV as ShellNavItem[]}
      activeId={section}
      onNavigate={(id) => setSection(id as SectionId)}
    >
      <div className="space-y-5">
        {/* Competition state banners */}
        {marketStatus === "NOT_STARTED" && (
          <StateBanner
            icon={<Hourglass className="size-4 shrink-0 text-muted-foreground" />}
            title="Competition Not Started"
            description={`Awaiting the administrator to begin Round ${currentRound}. Prepare your strategy.`}
          />
        )}

        {marketStatus === "TRADING_PAUSED" && (
          <StateBanner
            tone="warn"
            icon={<Pause className="size-4 shrink-0 text-warn" />}
            title="Trading Paused By Administrator"
            description="Market inspection active. Orders currently disabled."
          />
        )}

        {marketStatus === "MARKET_CLOSED" && (
          <StateBanner
            tone="down"
            icon={<AlertTriangle className="size-4 shrink-0 text-down" />}
            title="Market Closed"
            description={`Market is closed for Round ${currentRound}. Order submissions inactive.`}
          />
        )}

        {marketStatus === "ROUND_ENDED" && (
          <StateBanner
            icon={<Clock className="size-4 shrink-0 text-muted-foreground" />}
            title={`Round ${currentRound} Complete`}
            description="Round complete. Inspect holdings and final standings below."
          />
        )}

        {/* Financial metric strip — always visible */}
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
              countTo={cash}
              format={formatINR}
              sub="Liquid capital for order execution"
            />
            <Stat
              label="Portfolio Value"
              countTo={totalPortfolioValue}
              format={formatINR}
              sub="Cash + active market positions"
            />
            <Stat
              label="Total Profit / Loss"
              countTo={totalProfitLoss}
              format={(n) => `${n >= 0 ? "+" : "-"}${formatINR(Math.abs(n))}`}
              positive={isPositivePL}
              sub={`${formatPercent(totalProfitLossPercent)} vs ₹1,00,000 base`}
            />
          </div>
        )}

        {/* Active section */}
        {section === "market" && (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
            <div className="min-w-0 xl:col-span-8">
              <MarketTable onTrade={openTrade} />
            </div>
            <div className="xl:col-span-4">
              <LeaderboardTable />
            </div>
          </div>
        )}

        {section === "portfolio" && (
          <div className="space-y-5">
            <PortfolioSection onTrade={openTrade} />
            <TransactionHistory />
          </div>
        )}

        {section === "leaderboard" && (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
            <div className="xl:col-span-7">
              <LeaderboardTable />
            </div>
            <div className="xl:col-span-5">
              <PortfolioSection onTrade={openTrade} />
            </div>
          </div>
        )}

        {section === "transactions" && <TransactionHistory />}
      </div>

      {/* Trade modal */}
      {selectedTrade && (
        <TradeModal
          stock={selectedTrade.stock}
          mode={selectedTrade.mode}
          onClose={() => setSelectedTrade(null)}
        />
      )}
    </DashboardShell>
  );
};

/* ── State banner ─────────────────────────────────────────────── */

function StateBanner({
  icon,
  title,
  description,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  tone?: "neutral" | "warn" | "down";
}) {
  const toneClass =
    tone === "warn"
      ? "border-warn/25 bg-warn/10"
      : tone === "down"
        ? "border-down/25 bg-down/10"
        : "border-border bg-muted";
  const titleClass =
    tone === "warn" ? "text-warn" : tone === "down" ? "text-down" : "text-foreground";

  return (
    <div
      className={`flex items-center gap-3 rounded-md border px-4 py-3 text-sm ${toneClass}`}
    >
      {icon}
      <div>
        <span className={`font-bodoni block text-base font-semibold tracking-wide ${titleClass}`}>
          {title}
        </span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>
    </div>
  );
}

/* Re-exported for potential external nav reuse */
export type { LucideIcon };

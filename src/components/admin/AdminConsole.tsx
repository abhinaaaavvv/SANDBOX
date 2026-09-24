"use client";

import React, { useState } from "react";
import { LayoutDashboard, TrendingUp, Landmark, Users, ScrollText, HandCoins, Briefcase, type LucideIcon } from "lucide-react";
import { useSandboxStore } from "@/context/SandboxContext";
import {
  DashboardShell,
  type ShellNavItem,
} from "@/components/shared/DashboardShell";
import { CompetitionSection } from "./sections/CompetitionSection";
import { PriceEditorSection } from "./sections/PriceEditorSection";
import { StocksSection } from "./sections/StocksSection";
import { DividendsSection } from "./sections/DividendsSection";
import { HoldingsSection } from "./sections/HoldingsSection";
import { LedgerSection } from "./sections/LedgerSection";
import { TeamManager } from "./TeamManager";

type SectionId =
  | "competition"
  | "prices"
  | "stocks"
  | "ledger"
  | "dividends"
  | "holdings"
  | "teams";

const SECTION_LABELS: Record<SectionId, string> = {
  competition: "Competition Control",
  prices: "Private Price Editor",
  stocks: "Stock Management",
  ledger: "Cash Ledger",
  dividends: "Dividend Dispatcher",
  holdings: "Participant Holdings",
  teams: "Team Manager",
};

/**
 * Administrator console. The competition is operated entirely from
 * these sections; every action broadcasts live to participants.
 */
export const AdminConsole: React.FC = () => {
  const { pendingPriceChanges } = useSandboxStore();
  const [section, setSection] = useState<SectionId>("competition");
  const [holdingsTeamId, setHoldingsTeamId] = useState<string | null>(null);

  // Grouped by purpose: "Operations" runs the live competition,
  // "Configuration" manages the teams and stocks being traded.
  const nav: (ShellNavItem & { id: SectionId })[] = [
    { id: "competition", label: "Competition", icon: LayoutDashboard, group: "Operations" },
    { id: "prices", label: "Price Editor", icon: TrendingUp, badge: pendingPriceChanges.length, group: "Operations" },
    { id: "ledger", label: "Cash Ledger", icon: ScrollText, group: "Operations" },
    { id: "dividends", label: "Dividends", icon: HandCoins, group: "Operations" },
    { id: "holdings", label: "Holdings", icon: Briefcase, group: "Operations" },
    { id: "stocks", label: "Stocks", icon: Landmark, group: "Configuration" },
    { id: "teams", label: "Teams", icon: Users, group: "Configuration" },
  ];

  return (
    <DashboardShell
      role="admin"
      activeLabel={SECTION_LABELS[section]}
      nav={nav as ShellNavItem[]}
      activeId={section}
      onNavigate={(id) => setSection(id as SectionId)}
    >
      {/* Active section — only this region transitions on switch */}
      <div key={section} className="animate-page-enter">
        {section === "competition" && <CompetitionSection />}
        {section === "prices" && <PriceEditorSection />}
        {section === "stocks" && <StocksSection />}
        {section === "ledger" && <LedgerSection />}
        {section === "dividends" && <DividendsSection />}
        {section === "holdings" && (
          <HoldingsSection teamId={holdingsTeamId} onTeamChange={setHoldingsTeamId} />
        )}
        {section === "teams" && (
          <TeamManager
            onViewHoldings={(id) => {
              setHoldingsTeamId(id);
              setSection("holdings");
            }}
          />
        )}
      </div>
    </DashboardShell>
  );
};

export type { LucideIcon };

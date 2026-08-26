"use client";

import React, { useState } from "react";
import { LayoutDashboard, TrendingUp, Landmark, Users, ScrollText, type LucideIcon } from "lucide-react";
import { useSandboxStore } from "@/context/SandboxContext";
import {
  DashboardShell,
  type ShellNavItem,
} from "@/components/shared/DashboardShell";
import { CompetitionSection } from "./sections/CompetitionSection";
import { PriceEditorSection } from "./sections/PriceEditorSection";
import { StocksSection } from "./sections/StocksSection";
import { DividendsSection } from "./sections/DividendsSection";
import { LedgerSection } from "./sections/LedgerSection";
import { TeamManager } from "./TeamManager";

type SectionId =
  | "competition"
  | "prices"
  | "stocks"
  | "ledger"
  | "teams";

const SECTION_LABELS: Record<SectionId, string> = {
  competition: "Competition Control",
  prices: "Private Price Editor",
  stocks: "Stock Management",
  ledger: "Cash & Dividends",
  teams: "Team Manager",
};

/**
 * Administrator console. The competition is operated entirely from
 * these sections; every action broadcasts live to participants.
 */
export const AdminConsole: React.FC = () => {
  const { pendingPriceChanges } = useSandboxStore();
  const [section, setSection] = useState<SectionId>("competition");

  // Grouped by purpose: "Operations" runs the live competition,
  // "Configuration" manages the teams and stocks being traded.
  const nav: (ShellNavItem & { id: SectionId })[] = [
    { id: "competition", label: "Competition", icon: LayoutDashboard, group: "Operations" },
    { id: "prices", label: "Price Editor", icon: TrendingUp, badge: pendingPriceChanges.length, group: "Operations" },
    { id: "ledger", label: "Cash & Dividends", icon: ScrollText, group: "Operations" },
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
        {section === "ledger" && (
          <div className="space-y-5">
            <LedgerSection />
            <DividendsSection />
          </div>
        )}
        {section === "teams" && <TeamManager />}
      </div>
    </DashboardShell>
  );
};

export type { LucideIcon };

"use client";

import React from "react";
import { useSandboxStore } from "@/context/SandboxContext";
import { formatTime } from "@/lib/utils";
import { Pause, Clock, Activity, Sliders } from "lucide-react";

export const Header: React.FC = () => {
  const {
    currentRound,
    marketStatus,
    timerSeconds,
    teamName,
    activeTab,
    setActiveTab,
    pendingPriceChanges,
  } = useSandboxStore();

  const getStatusBadge = () => {
    switch (marketStatus) {
      case "MARKET_OPEN":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-mono font-bold bg-[#051c14] text-[#10b981] border border-[#064e3b] tracking-wider uppercase">
            <span className="h-1.5 w-1.5 bg-[#10b981] animate-pulse" />
            MARKET OPEN
          </span>
        );
      case "TRADING_PAUSED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-mono font-bold bg-[#1f1300] text-[#f59e0b] border border-[#78350f] tracking-wider uppercase">
            <Pause className="h-3 w-3" />
            TRADING PAUSED
          </span>
        );
      case "MARKET_CLOSED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-mono font-bold bg-[#1a060a] text-[#ef4444] border border-[#7f1d1d] tracking-wider uppercase">
            <span className="h-1.5 w-1.5 bg-[#ef4444]" />
            MARKET CLOSED
          </span>
        );
      case "ROUND_ENDED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-mono font-bold bg-[#18181b] text-[#a1a1aa] border border-[#27272a] tracking-wider uppercase">
            <Clock className="h-3 w-3" />
            ROUND COMPLETE
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-mono font-bold bg-[#18181b] text-[#a1a1aa] border border-[#27272a] tracking-wider uppercase">
            NOT STARTED
          </span>
        );
    }
  };

  const getRoundLabel = (r: number) => {
    if (r === 1) return "ROUND 01";
    if (r === 2) return "ROUND 02";
    if (r === 3) return "ROUND 03";
    return `ROUND 0${r}`;
  };

  const isTimerWarning = timerSeconds <= 120 && timerSeconds > 0;

  return (
    <header className="sticky top-0 z-40 bg-[#090a0f] border-b border-[#18181b] px-4 lg:px-6 py-2.5 font-mono">
      <div className="max-w-[1800px] mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Brand in EB Garamond & Round Metadata in JetBrains Mono */}
        <div className="flex items-center gap-5 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-baseline gap-3">
            <span className="font-garamond text-2xl font-bold tracking-wider text-[#f4f4f5] uppercase select-none">
              SANDBOX
            </span>
            <span className="text-[10px] tracking-widest text-[#71717a] uppercase border-l border-[#27272a] pl-3 py-0.5">
              TERMINAL
            </span>
          </div>

          <div className="h-4 w-px bg-[#27272a] hidden md:block" />

          {/* Round & Timer */}
          <div className="flex items-center gap-4">
            <div className="text-xs text-[#a1a1aa] font-bold tracking-widest uppercase">
              {getRoundLabel(currentRound)}
            </div>

            {getStatusBadge()}

            <div
              className={`flex items-center gap-1.5 px-2.5 py-0.5 text-sm font-bold border transition-colors ${
                isTimerWarning
                  ? "bg-[#1f0006] text-[#ef4444] border-[#7f1d1d] animate-pulse"
                  : "bg-[#111218] text-[#f4f4f5] border-[#27272a]"
              }`}
            >
              <Clock className="h-3.5 w-3.5 text-[#71717a]" />
              <span>{formatTime(timerSeconds)}</span>
            </div>
          </div>
        </div>

        {/* Console Navigation & Indicators */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end text-xs">
          {pendingPriceChanges.length > 0 && activeTab === "admin" && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-[#1f1300] text-[#f59e0b] border border-[#78350f] font-bold text-[11px] uppercase tracking-wider">
              {pendingPriceChanges.length} PENDING PRICE CHANGES
            </div>
          )}

          {/* Team Identifier */}
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 bg-[#111218] border border-[#27272a] text-[11px]">
            <span className="text-[#71717a] uppercase tracking-wider">TEAM:</span>
            <span className="font-bold text-[#f4f4f5]">{teamName}</span>
          </div>

          {/* Interface Mode Switcher - Sharp rectangular design */}
          <div className="flex items-center bg-[#0d0e14] p-0.5 border border-[#27272a]">
            <button
              onClick={() => setActiveTab("participant")}
              className={`flex items-center gap-1.5 px-3 py-1 font-bold text-[11px] uppercase tracking-wider transition-all ${
                activeTab === "participant"
                  ? "bg-[#27272a] text-[#f4f4f5]"
                  : "text-[#a1a1aa] hover:text-[#f4f4f5] hover:bg-[#18181b]"
              }`}
            >
              <Activity className="h-3 w-3" />
              PARTICIPANT
            </button>
            <button
              onClick={() => setActiveTab("admin")}
              className={`flex items-center gap-1.5 px-3 py-1 font-bold text-[11px] uppercase tracking-wider transition-all ${
                activeTab === "admin"
                  ? "bg-[#27272a] text-[#f4f4f5]"
                  : "text-[#a1a1aa] hover:text-[#f4f4f5] hover:bg-[#18181b]"
              }`}
            >
              <Sliders className="h-3 w-3" />
              ADMIN
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

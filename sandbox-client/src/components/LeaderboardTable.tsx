"use client";

import React from "react";
import { useSandboxStore } from "@/context/SandboxContext";
import { formatINR, formatPercent } from "@/lib/utils";

export const LeaderboardTable: React.FC = () => {
  const { leaderboard } = useSandboxStore();

  return (
    <div className="bg-[#0d0e14] border border-[#27272a] font-mono">
      <div className="p-3 border-b border-[#18181b] flex items-center justify-between">
        <span className="font-garamond text-lg font-bold text-[#f4f4f5] tracking-wide">
          Live Leaderboard
        </span>
        <span className="text-[11px] text-[#71717a]">
          RANKED BY PORTFOLIO VALUE
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead className="bg-[#111218] text-[#a1a1aa] uppercase text-[11px] border-b border-[#18181b]">
            <tr>
              <th className="py-2.5 px-3 w-12 text-center">RANK</th>
              <th className="py-2.5 px-3">TEAM</th>
              <th className="py-2.5 px-3 text-right">PORTFOLIO VALUE</th>
              <th className="py-2.5 px-3 text-right">TOTAL P/L</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#18181b]">
            {leaderboard.map((entry) => {
              const isPositive = entry.profitLoss >= 0;
              const isUser = entry.isCurrentTeam;

              return (
                <tr
                  key={entry.teamId}
                  className={`transition-colors ${
                    isUser
                      ? "bg-[#18181b] border-l-2 border-l-[#f4f4f5]"
                      : "hover:bg-[#14151c]"
                  }`}
                >
                  <td className="py-2.5 px-3 text-center font-bold text-[#a1a1aa]">
                    #{entry.rank}
                  </td>

                  <td className="py-2.5 px-3 font-mono">
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-bold ${
                          isUser ? "text-[#f4f4f5]" : "text-[#d4d4d8]"
                        }`}
                      >
                        {entry.teamName}
                      </span>
                      {isUser && (
                        <span className="text-[9px] bg-[#27272a] text-[#f4f4f5] px-1 py-0.2 uppercase border border-[#3f3f46]">
                          YOU
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="py-2.5 px-3 text-right font-bold text-[#f4f4f5]">
                    {formatINR(entry.portfolioValue)}
                  </td>

                  <td className="py-2.5 px-3 text-right font-bold">
                    <span
                      className={isPositive ? "text-[#10b981]" : "text-[#ef4444]"}
                    >
                      {isPositive ? "+" : ""}
                      {formatINR(entry.profitLoss)} ({formatPercent(entry.profitLossPercent)})
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

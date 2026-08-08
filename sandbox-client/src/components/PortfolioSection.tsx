"use client";

import React from "react";
import { useSandboxStore } from "@/context/SandboxContext";
import { formatINR, formatPercent } from "@/lib/utils";
import { Stock } from "@/types/sandbox";
import { TrendingUp, TrendingDown } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface PortfolioSectionProps {
  onTrade: (stock: Stock, mode: "BUY" | "SELL") => void;
}

// Neutral dark color palette for pie chart segments
const CHARCOAL_COLORS = ["#71717a", "#52525b", "#a1a1aa font-mono", "#3f3f46", "#d4d4d8", "#27272a"];

export const PortfolioSection: React.FC<PortfolioSectionProps> = ({ onTrade }) => {
  const { holdings, stocks } = useSandboxStore();

  const chartData = holdings.map((h) => ({
    name: h.symbol,
    value: h.totalValue,
  }));

  return (
    <div className="space-y-4 font-mono">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Holdings Table */}
        <div className="lg:col-span-2 bg-[#0d0e14] border border-[#27272a]">
          <div className="p-3 border-b border-[#18181b] flex items-center justify-between">
            <span className="font-garamond text-lg font-bold text-[#f4f4f5] tracking-wide">
              Active Positions
            </span>
            <span className="text-[11px] text-[#71717a] font-mono">
              {holdings.length} POSITIONS
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[#111218] text-[#a1a1aa] uppercase text-[11px] border-b border-[#18181b]">
                <tr>
                  <th className="py-2.5 px-3">SECURITY</th>
                  <th className="py-2.5 px-3 text-center">QTY</th>
                  <th className="py-2.5 px-3 text-right">AVG BUY</th>
                  <th className="py-2.5 px-3 text-right">CURRENT</th>
                  <th className="py-2.5 px-3 text-right">VALUE</th>
                  <th className="py-2.5 px-3 text-right">UNREALIZED P/L</th>
                  <th className="py-2.5 px-3 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#18181b]">
                {holdings.map((h) => {
                  const stock = stocks.find((s) => s.id === h.stockId);
                  const isPositive = h.unrealizedPL >= 0;

                  return (
                    <tr key={h.stockId} className="hover:bg-[#14151c] transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-[#f4f4f5] text-xs">
                          {h.symbol}
                        </div>
                        <div className="text-[#71717a] text-[10px] uppercase truncate max-w-[120px]">
                          {h.name}
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-center font-bold text-[#f4f4f5]">
                        {h.quantity}
                      </td>

                      <td className="py-2.5 px-3 text-right text-[#a1a1aa]">
                        {formatINR(h.averageBuyPrice)}
                      </td>

                      <td className="py-2.5 px-3 text-right font-bold text-[#f4f4f5]">
                        {formatINR(h.currentPrice)}
                      </td>

                      <td className="py-2.5 px-3 text-right font-bold text-[#f4f4f5]">
                        {formatINR(h.totalValue)}
                      </td>

                      <td className="py-2.5 px-3 text-right font-bold">
                        <div
                          className={`inline-flex items-center gap-0.5 ${
                            isPositive ? "text-[#10b981]" : "text-[#ef4444]"
                          }`}
                        >
                          {isPositive ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          <span>
                            {formatINR(h.unrealizedPL)} ({formatPercent(h.unrealizedPLPercent)})
                          </span>
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        {stock && (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => onTrade(stock, "BUY")}
                              className="px-2 py-0.5 bg-[#051c14] text-[#10b981] border border-[#064e3b] hover:bg-[#064e3b] text-[10px] font-bold uppercase"
                            >
                              +BUY
                            </button>
                            <button
                              onClick={() => onTrade(stock, "SELL")}
                              className="px-2 py-0.5 bg-[#1a060a] text-[#ef4444] border border-[#7f1d1d] hover:bg-[#7f1d1d] text-[10px] font-bold uppercase"
                            >
                              -SELL
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {holdings.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-[#71717a] text-xs">
                      NO ACTIVE HOLDINGS IN PORTFOLIO
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Portfolio Allocation Pie Visualizer */}
        <div className="bg-[#0d0e14] border border-[#27272a] p-3 flex flex-col justify-between">
          <div className="border-b border-[#18181b] pb-2">
            <span className="font-garamond text-lg font-bold text-[#f4f4f5] tracking-wide">
              Asset Allocation
            </span>
          </div>

          <div className="h-44 w-full my-2">
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
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHARCOAL_COLORS[index % CHARCOAL_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: any) => formatINR(Number(val) || 0)}
                    contentStyle={{
                      backgroundColor: "#111218",
                      borderColor: "#27272a",
                      borderRadius: "0px",
                      color: "#f4f4f5",
                      fontSize: "11px",
                      fontFamily: "monospace",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-[#52525b] text-xs font-mono">
                NO ALLOCATION DATA
              </div>
            )}
          </div>

          {/* Allocation Legend */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#18181b]">
            {chartData.map((item, idx) => (
              <div key={item.name} className="flex items-center gap-1.5 text-[11px] font-mono">
                <span
                  className="h-2 w-2 shrink-0"
                  style={{ backgroundColor: CHARCOAL_COLORS[idx % CHARCOAL_COLORS.length] }}
                />
                <span className="text-[#a1a1aa] font-bold truncate">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

"use client";

import React, { useState } from "react";
import { Stock } from "@/types/sandbox";
import { useSandboxStore } from "@/context/SandboxContext";
import { formatINR } from "@/lib/utils";
import { Search, TrendingUp, TrendingDown, ArrowUpDown } from "lucide-react";

interface MarketTableProps {
  onTrade: (stock: Stock, mode: "BUY" | "SELL") => void;
}

export const MarketTable: React.FC<MarketTableProps> = ({ onTrade }) => {
  const { stocks, holdings, marketStatus } = useSandboxStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<"symbol" | "currentPrice" | "changePercent">("symbol");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const filtered = stocks.filter(
    (s) =>
      s.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.sector.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    let valA = a[sortField];
    let valB = b[sortField];
    if (typeof valA === "string") {
      valA = valA.toLowerCase();
      valB = (valB as string).toLowerCase();
    }
    if (valA < valB) return sortOrder === "asc" ? -1 : 1;
    if (valA > valB) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  const toggleSort = (field: "symbol" | "currentPrice" | "changePercent") => {
    if (sortField === field) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const isTradingDisabled = marketStatus !== "MARKET_OPEN";

  return (
    <div className="bg-[#0d0e14] border border-[#27272a] font-mono">
      {/* Table Header Controls */}
      <div className="p-3 border-b border-[#18181b] flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="font-garamond text-lg font-bold text-[#f4f4f5] tracking-wide">
            Market Securities
          </span>
          <span className="text-[11px] text-[#71717a] font-mono">
            ({stocks.length} SECURITIES)
          </span>
        </div>

        {/* Minimal Search bar */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-[#71717a]" />
          <input
            type="text"
            placeholder="SEARCH TICKER, NAME..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#111218] border border-[#27272a] pl-8 pr-2.5 py-1 text-xs text-[#f4f4f5] placeholder:text-[#52525b] focus:outline-none focus:border-[#52525b] font-mono uppercase"
          />
        </div>
      </div>

      {/* High density financial table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead className="bg-[#111218] text-[#a1a1aa] uppercase text-[11px] border-b border-[#18181b]">
            <tr>
              <th
                onClick={() => toggleSort("symbol")}
                className="py-2.5 px-3 cursor-pointer hover:text-[#f4f4f5] transition-colors"
              >
                <div className="flex items-center gap-1">
                  SECURITY
                  <ArrowUpDown className="h-3 w-3 opacity-60" />
                </div>
              </th>
              <th
                onClick={() => toggleSort("currentPrice")}
                className="py-2.5 px-3 text-right cursor-pointer hover:text-[#f4f4f5] transition-colors"
              >
                <div className="flex items-center justify-end gap-1">
                  CURRENT PRICE
                  <ArrowUpDown className="h-3 w-3 opacity-60" />
                </div>
              </th>
              <th
                onClick={() => toggleSort("changePercent")}
                className="py-2.5 px-3 text-right cursor-pointer hover:text-[#f4f4f5] transition-colors"
              >
                <div className="flex items-center justify-end gap-1">
                  CHANGE
                  <ArrowUpDown className="h-3 w-3 opacity-60" />
                </div>
              </th>
              <th className="py-2.5 px-3 text-center">OWNED</th>
              <th className="py-2.5 px-3 text-right">ACTIONS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#18181b]">
            {sorted.map((stock) => {
              const holding = holdings.find((h) => h.stockId === stock.id);
              const ownedQty = holding ? holding.quantity : 0;
              const isPositive = stock.change >= 0;

              return (
                <tr key={stock.id} className="hover:bg-[#14151c] transition-colors">
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#f4f4f5] text-xs font-mono">
                        {stock.symbol}
                      </span>
                      <span className="text-[10px] text-[#71717a] font-normal uppercase">
                        {stock.name}
                      </span>
                    </div>
                  </td>

                  <td className="py-2.5 px-3 text-right font-bold text-[#f4f4f5]">
                    {formatINR(stock.currentPrice)}
                  </td>

                  <td className="py-2.5 px-3 text-right font-bold">
                    <span className={isPositive ? "text-[#10b981]" : "text-[#ef4444]"}>
                      {isPositive ? "+" : ""}
                      {stock.change} ({stock.changePercent.toFixed(2)}%)
                    </span>
                  </td>

                  <td className="py-2.5 px-3 text-center font-bold">
                    {ownedQty > 0 ? (
                      <span className="text-[#f4f4f5]">{ownedQty} SH</span>
                    ) : (
                      <span className="text-[#52525b]">0</span>
                    )}
                  </td>

                  <td className="py-2.5 px-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => onTrade(stock, "BUY")}
                        disabled={isTradingDisabled}
                        className={`px-2.5 py-1 text-[11px] font-bold uppercase transition-all border ${
                          isTradingDisabled
                            ? "bg-[#18181b] text-[#52525b] border-[#27272a] cursor-not-allowed"
                            : "bg-[#051c14] text-[#10b981] border-[#064e3b] hover:bg-[#064e3b] hover:text-[#f4f4f5]"
                        }`}
                      >
                        BUY
                      </button>
                      <button
                        onClick={() => onTrade(stock, "SELL")}
                        disabled={isTradingDisabled || ownedQty === 0}
                        className={`px-2.5 py-1 text-[11px] font-bold uppercase transition-all border ${
                          isTradingDisabled || ownedQty === 0
                            ? "bg-[#18181b] text-[#52525b] border-[#27272a] cursor-not-allowed"
                            : "bg-[#1a060a] text-[#ef4444] border-[#7f1d1d] hover:bg-[#7f1d1d] hover:text-[#f4f4f5]"
                        }`}
                      >
                        SELL
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-[#71717a] font-mono text-xs">
                  NO SECURITIES FOUND
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

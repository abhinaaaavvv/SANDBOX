"use client";

import React from "react";
import { useSandboxStore } from "@/context/SandboxContext";
import { formatINR } from "@/lib/utils";

export const TransactionHistory: React.FC = () => {
  const { transactions } = useSandboxStore();

  return (
    <div className="bg-[#0d0e14] border border-[#27272a] font-mono">
      <div className="p-3 border-b border-[#18181b] flex items-center justify-between">
        <span className="font-garamond text-lg font-bold text-[#f4f4f5] tracking-wide">
          Transaction History
        </span>
        <span className="text-[11px] text-[#71717a]">
          {transactions.length} LOGS
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead className="bg-[#111218] text-[#a1a1aa] uppercase text-[11px] border-b border-[#18181b]">
            <tr>
              <th className="py-2.5 px-3">TIME</th>
              <th className="py-2.5 px-3">TYPE</th>
              <th className="py-2.5 px-3">SECURITY</th>
              <th className="py-2.5 px-3 text-center">QTY</th>
              <th className="py-2.5 px-3 text-right">EXEC PRICE</th>
              <th className="py-2.5 px-3 text-right">TOTAL</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#18181b]">
            {transactions.map((tx) => {
              const isBuy = tx.type === "BUY";
              const isDividend = tx.type === "DIVIDEND";

              return (
                <tr key={tx.id} className="hover:bg-[#14151c] transition-colors">
                  <td className="py-2.5 px-3 text-[#71717a] text-[11px]">
                    {tx.timestamp}
                  </td>

                  <td className="py-2.5 px-3">
                    {isBuy ? (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold bg-[#051c14] text-[#10b981] border border-[#064e3b] uppercase">
                        BUY
                      </span>
                    ) : isDividend ? (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold bg-[#1f1300] text-[#f59e0b] border border-[#78350f] uppercase">
                        DIVIDEND
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold bg-[#1a060a] text-[#ef4444] border border-[#7f1d1d] uppercase">
                        SELL
                      </span>
                    )}
                  </td>

                  <td className="py-2.5 px-3 font-bold text-[#f4f4f5]">
                    {tx.symbol}
                  </td>

                  <td className="py-2.5 px-3 text-center font-bold text-[#f4f4f5]">
                    {tx.quantity}
                  </td>

                  <td className="py-2.5 px-3 text-right text-[#a1a1aa]">
                    {formatINR(tx.price)}
                  </td>

                  <td className="py-2.5 px-3 text-right font-bold text-[#f4f4f5]">
                    {formatINR(tx.total)}
                  </td>
                </tr>
              );
            })}

            {transactions.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-[#71717a] text-xs">
                  NO TRANSACTIONS LOGGED
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

"use client";

import React, { useState } from "react";
import { Stock } from "@/types/sandbox";
import { useSandboxStore } from "@/context/SandboxContext";
import { formatINR } from "@/lib/utils";
import { X, ShieldAlert } from "lucide-react";

interface TradeModalProps {
  stock: Stock;
  mode: "BUY" | "SELL";
  onClose: () => void;
}

export const TradeModal: React.FC<TradeModalProps> = ({ stock, mode, onClose }) => {
  const { cash, holdings, marketStatus, executeBuy, executeSell } = useSandboxStore();
  const [quantity, setQuantity] = useState<number>(10);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const holding = holdings.find((h) => h.stockId === stock.id);
  const ownedQty = holding ? holding.quantity : 0;
  const estimatedTotal = stock.currentPrice * quantity;

  const maxBuyQty = Math.floor(cash / stock.currentPrice);
  const maxSellQty = ownedQty;

  const handleTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (mode === "BUY") {
      const res = await executeBuy(stock.id, quantity);
      if (res.success) {
        onClose();
      } else {
        setErrorMsg(res.message);
      }
    } else {
      const res = await executeSell(stock.id, quantity);
      if (res.success) {
        onClose();
      } else {
        setErrorMsg(res.message);
      }
    }
  };

  const setMaxQuantity = () => {
    if (mode === "BUY") {
      setQuantity(Math.max(1, maxBuyQty));
    } else {
      setQuantity(Math.max(1, maxSellQty));
    }
  };

  const isMarketDisabled = marketStatus !== "MARKET_OPEN";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#090a0f]/90 font-mono animate-in fade-in duration-100">
      <div className="bg-[#0d0e14] border border-[#27272a] w-full max-w-md text-[#d4d4d8]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#18181b] bg-[#111218]">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 border ${
              mode === "BUY" ? "bg-[#051c14] text-[#10b981] border-[#064e3b]" : "bg-[#1a060a] text-[#ef4444] border-[#7f1d1d]"
            }`}>
              {mode} ORDER
            </span>
            <span className="font-bold text-[#f4f4f5] text-sm uppercase">
              {stock.symbol}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-[#71717a] hover:text-[#f4f4f5] p-1 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleTrade} className="p-4 space-y-4">
          {/* Price details grid */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-[#111218] border border-[#18181b]">
            <div>
              <span className="text-[10px] text-[#71717a] uppercase block">CURRENT PRICE</span>
              <span className="text-base font-bold text-[#f4f4f5]">
                {formatINR(stock.currentPrice)}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-[#71717a] uppercase block">24H CHANGE</span>
              <span className={`text-sm font-bold ${stock.change >= 0 ? "text-[#10b981]" : "text-[#ef4444]"}`}>
                {stock.change >= 0 ? "+" : ""}{stock.change} ({stock.changePercent.toFixed(2)}%)
              </span>
            </div>
          </div>

          {/* Holdings Context */}
          <div className="flex justify-between items-center text-xs text-[#a1a1aa] px-1">
            <span>{mode === "BUY" ? "AVAILABLE CASH:" : "OWNED QUANTITY:"}</span>
            <span className="font-bold text-[#f4f4f5]">
              {mode === "BUY" ? formatINR(cash) : `${ownedQty} SHARES`}
            </span>
          </div>

          {/* Quantity Controls */}
          <div>
            <div className="flex justify-between items-center mb-1 text-xs">
              <label className="text-[#a1a1aa] font-bold uppercase">QUANTITY</label>
              <button
                type="button"
                onClick={setMaxQuantity}
                className="text-[10px] font-bold text-[#a1a1aa] hover:text-[#f4f4f5] uppercase underline tracking-wider"
              >
                MAX ({mode === "BUY" ? maxBuyQty : maxSellQty})
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="px-3 py-2 bg-[#111218] hover:bg-[#18181b] text-[#f4f4f5] font-bold border border-[#27272a]"
              >
                -
              </button>
              <input
                type="number"
                min="1"
                max={mode === "BUY" ? Math.max(1, maxBuyQty) : Math.max(1, maxSellQty)}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 0))}
                className="w-full bg-[#111218] border border-[#27272a] px-3 py-2 text-center font-bold text-[#f4f4f5] text-base focus:outline-none focus:border-[#52525b]"
              />
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                className="px-3 py-2 bg-[#111218] hover:bg-[#18181b] text-[#f4f4f5] font-bold border border-[#27272a]"
              >
                +
              </button>
            </div>
          </div>

          {/* Presets */}
          <div className="flex gap-2">
            {[5, 10, 25, 50, 100].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setQuantity(num)}
                className={`flex-1 py-1 text-[11px] font-bold border uppercase transition-all ${
                  quantity === num
                    ? "bg-[#27272a] text-[#f4f4f5] border-[#3f3f46]"
                    : "bg-[#111218] text-[#71717a] border-[#18181b] hover:text-[#d4d4d8]"
                }`}
              >
                {num}
              </button>
            ))}
          </div>

          {/* Summary */}
          <div className="p-3 bg-[#111218] border border-[#18181b] space-y-1 text-xs font-mono">
            <div className="flex justify-between text-[#71717a]">
              <span>PRICE PER SHARE</span>
              <span>{formatINR(stock.currentPrice)}</span>
            </div>
            <div className="flex justify-between text-[#71717a]">
              <span>BROKERAGE / FEE</span>
              <span className="text-[#10b981]">₹0</span>
            </div>
            <div className="border-t border-[#18181b] pt-1.5 flex justify-between font-bold text-[#f4f4f5]">
              <span>ESTIMATED TOTAL</span>
              <span className="text-base">{formatINR(estimatedTotal)}</span>
            </div>
          </div>

          {/* Error / Warning Alert */}
          {errorMsg && (
            <div className="flex items-center gap-2 p-2 bg-[#1a060a] border border-[#7f1d1d] text-[#ef4444] text-xs">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {isMarketDisabled && (
            <div className="p-2 bg-[#1f1300] border border-[#78350f] text-[#f59e0b] text-xs text-center">
              TRADING IS CURRENTLY PAUSED OR CLOSED.
            </div>
          )}

          {/* Modal Actions */}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 bg-[#111218] hover:bg-[#18181b] text-[#d4d4d8] font-bold text-xs border border-[#27272a] uppercase tracking-wider"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={isMarketDisabled}
              className={`flex-1 py-2 font-bold text-xs uppercase tracking-wider transition-all border ${
                isMarketDisabled
                  ? "bg-[#18181b] text-[#52525b] border-[#27272a] cursor-not-allowed"
                  : mode === "BUY"
                  ? "bg-[#051c14] text-[#10b981] border-[#064e3b] hover:bg-[#064e3b] hover:text-[#f4f4f5]"
                  : "bg-[#1a060a] text-[#ef4444] border-[#7f1d1d] hover:bg-[#7f1d1d] hover:text-[#f4f4f5]"
              }`}
            >
              CONFIRM {mode}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

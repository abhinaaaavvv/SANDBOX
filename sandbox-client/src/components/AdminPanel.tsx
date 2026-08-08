"use client";

import React, { useState } from "react";
import { useSandboxStore } from "@/context/SandboxContext";
import { formatINR, formatPercent } from "@/lib/utils";
import { ArrowRight } from "lucide-react";

export const AdminPanel: React.FC = () => {
  const {
    currentRound,
    marketStatus,
    stocks,
    pendingPriceChanges,
    videos,
    activeVideo,
    isVideoPlaying,
    startRound,
    endRound,
    setMarketStatus,
    setPendingPriceChange,
    clearPendingPriceChange,
    applyPriceChanges,
    payDividends,
    selectVideo,
    playVideo,
    stopVideo,
    resetCompetition,
  } = useSandboxStore();

  const [editedPrices, setEditedPrices] = useState<Record<string, number>>({});
  const [showApplyConfirmation, setShowApplyConfirmation] = useState(false);

  const [dividendStockId, setDividendStockId] = useState<string>(stocks[0]?.id || "");
  const [dividendAmount, setDividendAmount] = useState<number>(25);

  const handlePriceInput = (stockId: string, val: string) => {
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      setEditedPrices((prev) => ({ ...prev, [stockId]: num }));
    }
  };

  const savePendingPrice = (stockId: string) => {
    const targetPrice = editedPrices[stockId];
    if (targetPrice) {
      setPendingPriceChange(stockId, targetPrice);
    }
  };

  const applyPresetShift = (stockId: string, pct: number) => {
    const stock = stocks.find((s) => s.id === stockId);
    if (!stock) return;
    const newP = Math.round(stock.currentPrice * (1 + pct / 100));
    setEditedPrices((prev) => ({ ...prev, [stockId]: newP }));
    setPendingPriceChange(stockId, newP);
  };

  return (
    <div className="space-y-4 max-w-[1800px] mx-auto p-4 md:p-6 font-mono">
      {/* Top Banner / Master Operational Control Bar */}
      <div className="bg-[#0d0e14] border border-[#27272a] p-4 flex flex-col lg:flex-row items-center justify-between gap-4">
        <div>
          <span className="font-garamond text-xl font-bold tracking-wider text-[#f4f4f5] uppercase block">
            ADMINISTRATOR CONTROL CENTER
          </span>
          <span className="text-[11px] text-[#71717a]">
            Central command console. Operations broadcast live to all participant dashboards.
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setMarketStatus("MARKET_OPEN")}
            disabled={marketStatus === "MARKET_OPEN"}
            className="px-3 py-1.5 font-bold text-xs bg-[#051c14] text-[#10b981] border border-[#064e3b] hover:bg-[#064e3b] hover:text-[#f4f4f5] disabled:opacity-40 disabled:cursor-not-allowed uppercase"
          >
            OPEN MARKET
          </button>
          <button
            onClick={() => setMarketStatus("TRADING_PAUSED")}
            disabled={marketStatus === "TRADING_PAUSED"}
            className="px-3 py-1.5 font-bold text-xs bg-[#1f1300] text-[#f59e0b] border border-[#78350f] hover:bg-[#78350f] hover:text-[#f4f4f5] disabled:opacity-40 disabled:cursor-not-allowed uppercase"
          >
            PAUSE TRADING
          </button>
          <button
            onClick={() => setMarketStatus("MARKET_CLOSED")}
            disabled={marketStatus === "MARKET_CLOSED"}
            className="px-3 py-1.5 font-bold text-xs bg-[#1a060a] text-[#ef4444] border border-[#7f1d1d] hover:bg-[#7f1d1d] hover:text-[#f4f4f5] disabled:opacity-40 disabled:cursor-not-allowed uppercase"
          >
            CLOSE MARKET
          </button>
          <button
            onClick={resetCompetition}
            className="px-3 py-1.5 font-bold text-xs bg-[#18181b] text-[#a1a1aa] border border-[#27272a] hover:bg-[#27272a] hover:text-[#f4f4f5] uppercase"
          >
            RESET COMPETITION
          </button>
        </div>
      </div>

      {/* Grid Layout: Left Column (Round Controls + Video + Dividends) | Right Column (Price Editor) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column Controls */}
        <div className="lg:col-span-5 space-y-4">
          {/* Round Controls */}
          <div className="bg-[#0d0e14] border border-[#27272a] p-4 space-y-3">
            <div className="border-b border-[#18181b] pb-2">
              <span className="font-garamond text-lg font-bold text-[#f4f4f5] tracking-wide">
                Round Manager
              </span>
            </div>

            <div className="space-y-2 text-xs">
              {[1, 2, 3].map((rNum) => {
                const roundVal = rNum as 1 | 2 | 3;
                const isActive = currentRound === roundVal;
                let desc = "";
                if (rNum === 1) desc = "ROUND 01 — PORTFOLIO BUILDING (15M)";
                if (rNum === 2) desc = "ROUND 02 — NEWSPAPER TRADING (15M)";
                if (rNum === 3) desc = "ROUND 03 — VIDEO TRADING (15M)";

                return (
                  <div
                    key={rNum}
                    className={`p-2.5 border flex items-center justify-between ${
                      isActive
                        ? "bg-[#18181b] border-[#3f3f46]"
                        : "bg-[#111218] border-[#18181b]"
                    }`}
                  >
                    <div>
                      <div className="font-bold text-[#f4f4f5] text-[11px]">
                        {desc}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => startRound(roundVal)}
                        disabled={isActive && marketStatus === "MARKET_OPEN"}
                        className="px-2 py-0.5 bg-[#051c14] text-[#10b981] border border-[#064e3b] hover:bg-[#064e3b] hover:text-[#f4f4f5] font-bold text-[10px] uppercase disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        START
                      </button>
                      <button
                        onClick={() => endRound(roundVal)}
                        disabled={!isActive || marketStatus === "ROUND_ENDED"}
                        className="px-2 py-0.5 bg-[#1a060a] text-[#ef4444] border border-[#7f1d1d] hover:bg-[#7f1d1d] hover:text-[#f4f4f5] font-bold text-[10px] uppercase disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        END
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Video Control Panel */}
          <div className="bg-[#0d0e14] border border-[#27272a] p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-[#18181b] pb-2">
              <span className="font-garamond text-lg font-bold text-[#f4f4f5] tracking-wide">
                Round 3 Video Broadcast Engine
              </span>
              {isVideoPlaying && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 bg-[#18181b] text-[#f4f4f5] border border-[#3f3f46] uppercase">
                  BROADCAST ACTIVE
                </span>
              )}
            </div>

            <div className="space-y-2 text-xs font-mono">
              {videos.map((vid) => {
                const isSelected = activeVideo?.id === vid.id;
                return (
                  <div
                    key={vid.id}
                    className={`p-2.5 border ${
                      isSelected
                        ? "bg-[#18181b] border-[#3f3f46]"
                        : "bg-[#111218] border-[#18181b]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-[#f4f4f5] text-[11px] uppercase">{vid.title}</div>
                        <div className="text-[#71717a] text-[10px] leading-tight mt-0.5">{vid.description}</div>
                      </div>
                      <button
                        onClick={() => selectVideo(vid.id)}
                        className={`px-2 py-0.5 font-bold text-[10px] uppercase shrink-0 border ${
                          isSelected
                            ? "bg-[#f4f4f5] text-[#090a0f] border-[#f4f4f5]"
                            : "bg-[#111218] text-[#a1a1aa] border-[#27272a] hover:text-[#f4f4f5]"
                        }`}
                      >
                        {isSelected ? "SELECTED" : "SELECT"}
                      </button>
                    </div>
                  </div>
                );
              })}

              <div className="pt-1 flex items-center gap-2">
                <button
                  onClick={playVideo}
                  disabled={!activeVideo || isVideoPlaying}
                  className="flex-1 py-2 bg-[#27272a] text-[#f4f4f5] border border-[#3f3f46] hover:bg-[#3f3f46] font-bold text-xs uppercase disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  PLAY VIDEO
                </button>
                <button
                  onClick={stopVideo}
                  disabled={!isVideoPlaying}
                  className="py-2 px-3 bg-[#1a060a] text-[#ef4444] border border-[#7f1d1d] hover:bg-[#7f1d1d] font-bold text-xs uppercase disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  STOP
                </button>
              </div>
            </div>
          </div>

          {/* Dividends Dispatcher */}
          <div className="bg-[#0d0e14] border border-[#27272a] p-4 space-y-3">
            <div className="border-b border-[#18181b] pb-2">
              <span className="font-garamond text-lg font-bold text-[#f4f4f5] tracking-wide">
                Dividend Dispatcher
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[#71717a] uppercase block mb-1">SECURITY</label>
                <select
                  value={dividendStockId}
                  onChange={(e) => setDividendStockId(e.target.value)}
                  className="w-full bg-[#111218] border border-[#27272a] px-2 py-1.5 text-[#f4f4f5] focus:outline-none focus:border-[#52525b] uppercase"
                >
                  {stocks.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.symbol} ({s.name})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[#71717a] uppercase block mb-1">PAYOUT (₹ / SHARE)</label>
                <input
                  type="number"
                  min="1"
                  value={dividendAmount}
                  onChange={(e) => setDividendAmount(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#111218] border border-[#27272a] px-2 py-1.5 text-[#f4f4f5] focus:outline-none focus:border-[#52525b] font-bold"
                />
              </div>
            </div>

            <button
              onClick={() => payDividends(dividendStockId, dividendAmount)}
              className="w-full py-2 bg-[#1f1300] text-[#f59e0b] border border-[#78350f] hover:bg-[#78350f] hover:text-[#f4f4f5] font-bold text-xs uppercase"
            >
              DISPATCH DIVIDEND PAYOUT
            </button>
          </div>
        </div>

        {/* Right Column: Private Price Editor */}
        <div className="lg:col-span-7 bg-[#0d0e14] border border-[#27272a] p-4 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between border-b border-[#18181b] pb-2">
              <div>
                <span className="font-garamond text-xl font-bold text-[#f4f4f5] tracking-wide block">
                  Private Price Editor
                </span>
                <span className="text-[11px] font-mono text-[#71717a]">
                  Pending changes remain strictly private until broadcast.
                </span>
              </div>

              {pendingPriceChanges.length > 0 && (
                <span className="px-2 py-0.5 bg-[#1f1300] text-[#f59e0b] border border-[#78350f] font-bold text-[10px] uppercase">
                  {pendingPriceChanges.length} PENDING
                </span>
              )}
            </div>

            {/* Price Table Editor */}
            <div className="overflow-x-auto my-3">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-[#111218] text-[#a1a1aa] uppercase text-[11px] border-b border-[#18181b]">
                  <tr>
                    <th className="py-2.5 px-2">SECURITY</th>
                    <th className="py-2.5 px-2 text-right">CURRENT</th>
                    <th className="py-2.5 px-2 text-center">SHOCKS</th>
                    <th className="py-2.5 px-2 text-right">NEW PRICE</th>
                    <th className="py-2.5 px-2 text-center">STATUS</th>
                    <th className="py-2.5 px-2 text-right">SAVE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#18181b]">
                  {stocks.map((stock) => {
                    const pending = pendingPriceChanges.find((p) => p.stockId === stock.id);
                    const currentEditVal = editedPrices[stock.id] ?? (pending ? pending.newPrice : stock.currentPrice);

                    return (
                      <tr key={stock.id} className="hover:bg-[#14151c] transition-colors">
                        <td className="py-2.5 px-2">
                          <div className="font-bold text-[#f4f4f5] text-xs">
                            {stock.symbol}
                          </div>
                        </td>

                        <td className="py-2.5 px-2 text-right text-[#a1a1aa]">
                          {formatINR(stock.currentPrice)}
                        </td>

                        <td className="py-2.5 px-2 text-center">
                          <div className="flex items-center justify-center gap-1 text-[10px]">
                            <button
                              onClick={() => applyPresetShift(stock.id, -10)}
                              className="px-1.5 py-0.5 bg-[#1a060a] text-[#ef4444] border border-[#7f1d1d] font-bold"
                            >
                              -10%
                            </button>
                            <button
                              onClick={() => applyPresetShift(stock.id, -5)}
                              className="px-1.5 py-0.5 bg-[#1a060a] text-[#ef4444] border border-[#7f1d1d] font-bold"
                            >
                              -5%
                            </button>
                            <button
                              onClick={() => applyPresetShift(stock.id, 5)}
                              className="px-1.5 py-0.5 bg-[#051c14] text-[#10b981] border border-[#064e3b] font-bold"
                            >
                              +5%
                            </button>
                            <button
                              onClick={() => applyPresetShift(stock.id, 10)}
                              className="px-1.5 py-0.5 bg-[#051c14] text-[#10b981] border border-[#064e3b] font-bold"
                            >
                              +10%
                            </button>
                          </div>
                        </td>

                        <td className="py-2.5 px-2 text-right">
                          <input
                            type="number"
                            value={currentEditVal}
                            onChange={(e) => handlePriceInput(stock.id, e.target.value)}
                            className="w-20 bg-[#111218] border border-[#27272a] px-2 py-1 text-right font-bold text-[#f4f4f5] focus:outline-none focus:border-[#52525b]"
                          />
                        </td>

                        <td className="py-2.5 px-2 text-center">
                          {pending ? (
                            <span className="px-1.5 py-0.5 bg-[#1f1300] text-[#f59e0b] border border-[#78350f] text-[10px] font-bold uppercase">
                              PENDING
                            </span>
                          ) : (
                            <span className="text-[#52525b] text-[10px]">CURRENT</span>
                          )}
                        </td>

                        <td className="py-2.5 px-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => savePendingPrice(stock.id)}
                              className="px-2 py-1 bg-[#18181b] text-[#f4f4f5] border border-[#27272a] hover:bg-[#27272a] text-[10px] font-bold uppercase"
                            >
                              QUEUE
                            </button>
                            {pending && (
                              <button
                                onClick={() => clearPendingPriceChange(stock.id)}
                                className="px-1.5 py-1 bg-[#1a060a] text-[#ef4444] border border-[#7f1d1d] text-[10px] font-bold"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Broadcast Price Changes Bar */}
          <div className="border-t border-[#18181b] pt-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#71717a]">TOTAL QUEUED PRICE MODIFICATIONS:</span>
              <span className="font-bold text-[#f59e0b]">
                {pendingPriceChanges.length} SECURITIES
              </span>
            </div>

            <button
              onClick={() => setShowApplyConfirmation(true)}
              disabled={pendingPriceChanges.length === 0}
              className="w-full py-2.5 bg-[#1f1300] text-[#f59e0b] border border-[#78350f] hover:bg-[#78350f] hover:text-[#f4f4f5] font-bold text-xs uppercase disabled:opacity-40 disabled:cursor-not-allowed"
            >
              APPLY ALL PRICE CHANGES TO COMPETITION
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Applying Price Changes */}
      {showApplyConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#090a0f]/90 font-mono">
          <div className="bg-[#0d0e14] border border-[#27272a] w-full max-w-lg p-5 space-y-3 text-[#d4d4d8]">
            <div className="border-b border-[#18181b] pb-2">
              <span className="font-bold text-[#f59e0b] text-sm uppercase block">
                BROADCAST PRICE CHANGES?
              </span>
            </div>

            <p className="text-xs text-[#a1a1aa] leading-relaxed">
              Applying these {pendingPriceChanges.length} price modifications will immediately update market valuations, portfolio values, and leaderboard rankings across all participant screens.
            </p>

            <div className="max-h-40 overflow-y-auto space-y-1 p-2.5 bg-[#111218] border border-[#18181b] text-xs">
              {pendingPriceChanges.map((p) => (
                <div key={p.stockId} className="flex justify-between items-center py-0.5">
                  <span className="font-bold text-[#f4f4f5]">{p.symbol}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#71717a]">{formatINR(p.currentPrice)}</span>
                    <ArrowRight className="h-3 w-3 text-[#52525b]" />
                    <span className="font-bold text-[#f4f4f5]">{formatINR(p.newPrice)}</span>
                    <span className={p.changeAmount >= 0 ? "text-[#10b981]" : "text-[#ef4444]"}>
                      ({formatPercent(p.changePercent)})
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setShowApplyConfirmation(false)}
                className="flex-1 py-2 bg-[#111218] text-[#a1a1aa] font-bold text-xs border border-[#27272a] uppercase"
              >
                CANCEL
              </button>
              <button
                onClick={() => {
                  applyPriceChanges();
                  setShowApplyConfirmation(false);
                }}
                className="flex-1 py-2 bg-[#1f1300] text-[#f59e0b] border border-[#78350f] hover:bg-[#78350f] hover:text-[#f4f4f5] font-bold text-xs uppercase"
              >
                CONFIRM & BROADCAST
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

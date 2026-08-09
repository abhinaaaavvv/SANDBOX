"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
  RoundNumber,
  MarketStatus,
  Stock,
  Holding,
  Transaction,
  LeaderboardEntry,
  PendingPriceChange,
  VideoItem,
  ToastMessage,
} from "@/types/sandbox";
import {
  RealtimeEventPayload,
  TradeResponseDto,
} from "@/types/realtime";
import {
  INITIAL_CASH,
  INITIAL_STOCKS,
  INITIAL_LEADERBOARD,
  PRESET_VIDEOS,
} from "@/lib/mockData";
import { useAuthoritativeTimer } from "@/hooks/useAuthoritativeTimer";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";

interface SandboxContextType {
  // Competition State
  currentRound: RoundNumber;
  marketStatus: MarketStatus;
  serverEndTimestamp: string | null;
  timerSeconds: number;
  teamName: string;

  // Trading State (Participant)
  cash: number;
  stocks: Stock[];
  holdings: Holding[];
  transactions: Transaction[];
  leaderboard: LeaderboardEntry[];
  totalPortfolioValue: number;
  totalProfitLoss: number;
  totalProfitLossPercent: number;

  // Admin Context
  pendingPriceChanges: PendingPriceChange[];
  videos: VideoItem[];
  activeVideo: VideoItem | null;
  isVideoPlaying: boolean;

  // Notifications (rendered via Sonner)
  addToast: (type: ToastMessage["type"], title: string, message: string) => void;

  // Initial authoritative-state sync (drives dashboard loading skeletons)
  isInitializing: boolean;

  // Admin Actions (Ready for API integration)
  startRound: (round: RoundNumber) => Promise<void>;
  endRound: (round: RoundNumber) => Promise<void>;
  setMarketStatus: (status: MarketStatus) => Promise<void>;
  setPendingPriceChange: (stockId: string, newPrice: number) => void;
  clearPendingPriceChange: (stockId: string) => void;
  applyPriceChanges: () => Promise<void>;
  payDividends: (stockId: string, amountPerShare: number) => Promise<void>;
  selectVideo: (videoId: string | null) => void;
  playVideo: () => Promise<void>;
  stopVideo: () => Promise<void>;
  resetCompetition: () => Promise<void>;

  // Participant Trade Actions (Ready for API integration)
  executeBuy: (stockId: string, quantity: number) => Promise<TradeResponseDto>;
  executeSell: (stockId: string, quantity: number) => Promise<TradeResponseDto>;

  // Direct backend sync boundary method
  syncStateFromBackend: (payload: Partial<RealtimeEventPayload>) => void;
}

const SandboxContext = createContext<SandboxContextType | undefined>(undefined);

export const SandboxProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Core Competition State
  const [currentRound, setCurrentRound] = useState<RoundNumber>(1);
  const [marketStatus, setMarketStatusState] = useState<MarketStatus>("MARKET_OPEN");
  const [teamName] = useState<string>("Nexus Traders");

  // Authoritative server timestamp for timer
  const [serverEndTimestamp, setServerEndTimestamp] = useState<string | null>(() => {
    return new Date(Date.now() + 15 * 60 * 1000).toISOString();
  });

  const timerSeconds = useAuthoritativeTimer(serverEndTimestamp, marketStatus === "MARKET_OPEN");

  // Data States
  const [cash, setCash] = useState<number>(42500);
  const [stocks, setStocks] = useState<Stock[]>(INITIAL_STOCKS);
  const [holdings, setHoldings] = useState<Holding[]>([
    {
      stockId: "stk-1",
      symbol: "REL",
      name: "Reliance Industries",
      quantity: 20,
      averageBuyPrice: 2450,
      currentPrice: 2840,
      totalValue: 56800,
      unrealizedPL: 7800,
      unrealizedPLPercent: 15.92,
    },
    {
      stockId: "stk-3",
      symbol: "INFY",
      name: "Infosys Ltd",
      quantity: 10,
      averageBuyPrice: 1912,
      currentPrice: 1920,
      totalValue: 19120,
      unrealizedPL: 80,
      unrealizedPLPercent: 0.42,
    },
  ]);

  const [transactions, setTransactions] = useState<Transaction[]>([
    {
      id: "tx-1",
      timestamp: "16:12:42",
      symbol: "REL",
      companyName: "Reliance Industries",
      type: "BUY",
      quantity: 20,
      price: 2450,
      total: 49000,
    },
    {
      id: "tx-2",
      timestamp: "16:10:08",
      symbol: "TCS",
      companyName: "Tata Consultancy Services",
      type: "SELL",
      quantity: 10,
      price: 3200,
      total: 32000,
    },
  ]);

  const [pendingPriceChanges, setPendingPriceChanges] = useState<PendingPriceChange[]>([]);
  const [leaderboardOverride, setLeaderboardOverride] = useState<LeaderboardEntry[] | null>(null);
  const [videos] = useState<VideoItem[]>(PRESET_VIDEOS);
  const [activeVideo, setActiveVideo] = useState<VideoItem | null>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState<boolean>(false);
  const addToast = useCallback((type: ToastMessage["type"], title: string, message: string) => {
    if (type === "success") toast.success(title, { description: message });
    else if (type === "warning") toast.warning(title, { description: message });
    else if (type === "error") toast.error(title, { description: message });
    else toast.info(title, { description: message });
  }, []);

  // Simulates the initial authoritative-state sync so dashboard skeletons render once.
  const [isInitializing, setIsInitializing] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setIsInitializing(false), 500);
    return () => window.clearTimeout(t);
  }, []);

  // Sync state from backend realtime payloads cleanly
  const syncStateFromBackend = useCallback((payload: Partial<RealtimeEventPayload>) => {
    if (payload.round) setCurrentRound(payload.round);
    if (payload.marketStatus) setMarketStatusState(payload.marketStatus);
    if (payload.timerEndTimestamp) setServerEndTimestamp(payload.timerEndTimestamp);
    if (payload.stocks) setStocks(payload.stocks);
    if (payload.holdings) setHoldings(payload.holdings);
    if (typeof payload.cash === "number") setCash(payload.cash);
    if (payload.transaction) {
      setTransactions((prev) => [payload.transaction!, ...prev]);
    }
    if (payload.leaderboard) {
      setLeaderboardOverride(payload.leaderboard);
    }
    if (payload.videoId) {
      const v = videos.find((item) => item.id === payload.videoId);
      if (v) setActiveVideo(v);
    }
    if (payload.type === "VIDEO_PLAY") {
      setIsVideoPlaying(true);
    } else if (payload.type === "VIDEO_STOP") {
      setIsVideoPlaying(false);
    }
  }, [videos]);

  // Connect realtime adapter hook (stable callback so the subscription is not re-created every render)
  const handleRealtimeEvent = useCallback(
    (event: RealtimeEventPayload) => {
      syncStateFromBackend(event);
      if (event.type === "PRICE_CHANGES_APPLIED") {
        addToast("success", "Price Changes Applied", "New market prices broadcast by admin.");
      } else if (event.type === "TRADING_PAUSED") {
        addToast("warning", "Trading Paused", "The admin paused trading activity.");
      }
    },
    [syncStateFromBackend, addToast]
  );

  useRealtimeSubscription(handleRealtimeEvent);

  // Derived Calculations
  const holdingsValue = useMemo(() => {
    return holdings.reduce((sum, h) => {
      const stock = stocks.find((s) => s.id === h.stockId);
      const price = stock ? stock.currentPrice : h.currentPrice;
      return sum + h.quantity * price;
    }, 0);
  }, [holdings, stocks]);

  const totalPortfolioValue = useMemo(() => cash + holdingsValue, [cash, holdingsValue]);
  const totalProfitLoss = useMemo(() => totalPortfolioValue - INITIAL_CASH, [totalPortfolioValue]);
  const totalProfitLossPercent = useMemo(
    () => (totalProfitLoss / INITIAL_CASH) * 100,
    [totalProfitLoss]
  );

  const updatedHoldings = useMemo(() => {
    return holdings.map((h) => {
      const st = stocks.find((s) => s.id === h.stockId);
      const currentPrice = st ? st.currentPrice : h.currentPrice;
      const totalValue = h.quantity * currentPrice;
      const unrealizedPL = totalValue - h.quantity * h.averageBuyPrice;
      const unrealizedPLPercent = h.quantity > 0 && h.averageBuyPrice > 0
        ? (unrealizedPL / (h.quantity * h.averageBuyPrice)) * 100
        : 0;
      return { ...h, currentPrice, totalValue, unrealizedPL, unrealizedPLPercent };
    });
  }, [holdings, stocks]);

  const leaderboard = useMemo(() => {
    // Backend-broadcast leaderboard is authoritative when provided; otherwise derive locally.
    if (leaderboardOverride) return leaderboardOverride;
    const list = INITIAL_LEADERBOARD.map((item) => {
      if (item.isCurrentTeam) {
        return {
          ...item,
          portfolioValue: totalPortfolioValue,
          profitLoss: totalProfitLoss,
          profitLossPercent: totalProfitLossPercent,
        };
      }
      return item;
    });
    const sorted = [...list].sort((a, b) => b.portfolioValue - a.portfolioValue);
    return sorted.map((entry, idx) => ({ ...entry, rank: idx + 1 }));
  }, [leaderboardOverride, totalPortfolioValue, totalProfitLoss, totalProfitLossPercent]);

  // Actions Interface (Async Ready for API Fetch Calls)
  const startRound = useCallback(async (round: RoundNumber) => {
    // API endpoint call boundary: await fetch('/api/admin/round/start', { method: 'POST', body: JSON.stringify({ round }) })
    setCurrentRound(round);
    setMarketStatusState("MARKET_OPEN");
    setServerEndTimestamp(new Date(Date.now() + 15 * 60 * 1000).toISOString());
    addToast("info", `Round ${round} Started`, `Trading is now OPEN.`);
  }, [addToast]);

  const endRound = useCallback(async (round: RoundNumber) => {
    // API endpoint call boundary: await fetch('/api/admin/round/end', { method: 'POST', body: JSON.stringify({ round }) })
    setMarketStatusState("ROUND_ENDED");
    addToast("warning", `Round ${round} Ended`, "Trading closed by administrator.");
  }, [addToast]);

  const setMarketStatus = useCallback(async (status: MarketStatus) => {
    setMarketStatusState(status);
    addToast(status === "MARKET_OPEN" ? "success" : "warning", "Market Status Changed", `Market is now ${status}`);
  }, [addToast]);

  const setPendingPriceChange = useCallback((stockId: string, newPrice: number) => {
    const stock = stocks.find((s) => s.id === stockId);
    if (!stock) return;
    const changeAmount = newPrice - stock.currentPrice;
    const changePercent = (changeAmount / stock.currentPrice) * 100;
    const item: PendingPriceChange = {
      stockId,
      symbol: stock.symbol,
      companyName: stock.name,
      currentPrice: stock.currentPrice,
      newPrice,
      changeAmount,
      changePercent,
    };
    setPendingPriceChanges((prev) => {
      const idx = prev.findIndex((p) => p.stockId === stockId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = item;
        return next;
      }
      return [...prev, item];
    });
  }, [stocks]);

  const clearPendingPriceChange = useCallback((stockId: string) => {
    setPendingPriceChanges((prev) => prev.filter((p) => p.stockId !== stockId));
  }, []);

  const applyPriceChanges = useCallback(async () => {
    if (pendingPriceChanges.length === 0) return;
    setStocks((prev) =>
      prev.map((s) => {
        const pending = pendingPriceChanges.find((p) => p.stockId === s.id);
        if (!pending) return s;
        const newPrice = pending.newPrice;
        return {
          ...s,
          previousPrice: s.currentPrice,
          currentPrice: newPrice,
          change: newPrice - s.currentPrice,
          changePercent: ((newPrice - s.currentPrice) / s.currentPrice) * 100,
        };
      })
    );
    setPendingPriceChanges([]);
    addToast("success", "Price Changes Applied", "Broadcasted updated stock prices.");
  }, [pendingPriceChanges, addToast]);

  const payDividends = useCallback(async (stockId: string, amountPerShare: number) => {
    const stock = stocks.find((s) => s.id === stockId);
    if (!stock) return;
    // Guard against non-positive or non-finite payout amounts (e.g. empty admin input).
    if (!Number.isFinite(amountPerShare) || amountPerShare <= 0) return;
    const holding = holdings.find((h) => h.stockId === stockId);
    const qty = holding ? holding.quantity : 0;
    if (qty > 0) {
      const payout = qty * amountPerShare;
      setCash((c) => c + payout);
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setTransactions((txs) => [
        {
          id: `tx-${Date.now()}`,
          timestamp: now,
          symbol: stock.symbol,
          companyName: stock.name,
          type: "DIVIDEND",
          quantity: qty,
          price: amountPerShare,
          total: payout,
        },
        ...txs,
      ]);
    }
    addToast("info", "Dividend Dispatched", `Paid ₹${amountPerShare}/share for ${stock.symbol}`);
  }, [stocks, holdings, addToast]);

  const selectVideo = useCallback((videoId: string | null) => {
    if (!videoId) {
      setActiveVideo(null);
      setIsVideoPlaying(false);
      return;
    }
    const found = videos.find((v) => v.id === videoId);
    if (found) setActiveVideo(found);
  }, [videos]);

  const playVideo = useCallback(async () => {
    if (activeVideo) {
      setIsVideoPlaying(true);
      addToast("info", "Video Broadcast Started", `Playing "${activeVideo.title}".`);
    }
  }, [activeVideo, addToast]);

  const stopVideo = useCallback(async () => {
    setIsVideoPlaying(false);
    addToast("info", "Video Broadcast Stopped", "Video overlay closed.");
  }, [addToast]);

  const resetCompetition = useCallback(async () => {
    setCash(INITIAL_CASH);
    setStocks(INITIAL_STOCKS);
    setHoldings([]);
    setTransactions([]);
    setCurrentRound(1);
    setMarketStatusState("MARKET_OPEN");
    setServerEndTimestamp(new Date(Date.now() + 15 * 60 * 1000).toISOString());
    setPendingPriceChanges([]);
    setLeaderboardOverride(null);
    setActiveVideo(null);
    setIsVideoPlaying(false);
    addToast("warning", "Competition Reset", "Restored initial market state.");
  }, [addToast]);

  const executeBuy = useCallback(async (stockId: string, quantity: number): Promise<TradeResponseDto> => {
    if (marketStatus !== "MARKET_OPEN") {
      return { success: false, message: "Trading is currently closed or paused." };
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { success: false, message: "Quantity must be a positive whole number." };
    }
    const stock = stocks.find((s) => s.id === stockId);
    if (!stock) return { success: false, message: "Stock not found." };
    const totalCost = Math.round(stock.currentPrice * quantity);
    if (cash < totalCost) {
      return { success: false, message: `Insufficient cash balance. Needs ₹${totalCost.toLocaleString()}` };
    }

    setCash((c) => c - totalCost);
    setHoldings((prev) => {
      const existing = prev.find((h) => h.stockId === stockId);
      if (existing) {
        const newQty = existing.quantity + quantity;
        const newAvg = (existing.quantity * existing.averageBuyPrice + totalCost) / newQty;
        return prev.map((h) => (h.stockId === stockId ? { ...h, quantity: newQty, averageBuyPrice: newAvg } : h));
      }
      return [
        ...prev,
        {
          stockId: stock.id,
          symbol: stock.symbol,
          name: stock.name,
          quantity,
          averageBuyPrice: stock.currentPrice,
          currentPrice: stock.currentPrice,
          totalValue: totalCost,
          unrealizedPL: 0,
          unrealizedPLPercent: 0,
        },
      ];
    });

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const tx: Transaction = {
      id: `tx-${Date.now()}`,
      timestamp: now,
      symbol: stock.symbol,
      companyName: stock.name,
      type: "BUY",
      quantity,
      price: stock.currentPrice,
      total: totalCost,
    };
    setTransactions((prev) => [tx, ...prev]);
    addToast("success", "Trade Executed", `Bought ${quantity} shares of ${stock.symbol}`);
    return { success: true, message: "Success", transaction: tx };
  }, [marketStatus, stocks, cash, addToast]);

  const executeSell = useCallback(async (stockId: string, quantity: number): Promise<TradeResponseDto> => {
    if (marketStatus !== "MARKET_OPEN") {
      return { success: false, message: "Trading is currently closed or paused." };
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { success: false, message: "Quantity must be a positive whole number." };
    }
    const stock = stocks.find((s) => s.id === stockId);
    if (!stock) return { success: false, message: "Stock not found." };
    const holding = holdings.find((h) => h.stockId === stockId);
    if (!holding || holding.quantity < quantity) {
      return { success: false, message: "Cannot sell more than owned." };
    }
    const totalRevenue = Math.round(stock.currentPrice * quantity);
    setCash((c) => c + totalRevenue);
    setHoldings((prev) =>
      prev
        .map((h) => (h.stockId === stockId ? { ...h, quantity: h.quantity - quantity } : h))
        .filter((h) => h.quantity > 0)
    );

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const tx: Transaction = {
      id: `tx-${Date.now()}`,
      timestamp: now,
      symbol: stock.symbol,
      companyName: stock.name,
      type: "SELL",
      quantity,
      price: stock.currentPrice,
      total: totalRevenue,
    };
    setTransactions((prev) => [tx, ...prev]);
    addToast("success", "Trade Executed", `Sold ${quantity} shares of ${stock.symbol}`);
    return { success: true, message: "Success", transaction: tx };
  }, [marketStatus, stocks, holdings, addToast]);

  return (
    <SandboxContext.Provider
      value={{
        currentRound,
        marketStatus,
        serverEndTimestamp,
        timerSeconds,
        teamName,
        cash,
        stocks,
        holdings: updatedHoldings,
        transactions,
        leaderboard,
        totalPortfolioValue,
        totalProfitLoss,
        totalProfitLossPercent,
        pendingPriceChanges,
        videos,
        activeVideo,
        isVideoPlaying,
        addToast,
        isInitializing,
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
        executeBuy,
        executeSell,
        syncStateFromBackend,
      }}
    >
      {children}
    </SandboxContext.Provider>
  );
};

export const useSandboxStore = () => {
  const context = useContext(SandboxContext);
  if (!context) {
    throw new Error("useSandboxStore must be used within a SandboxProvider");
  }
  return context;
};

"use client";

import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
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
import { RealtimeEventPayload, TradeResponseDto } from "@/types/realtime";
import { getMockEngine } from "@/lib/competition/engine";
import {
  CompetitionSnapshot,
  TeamOverview,
  ViewRole,
} from "@/lib/competition/types";
import { useAuthoritativeTimer } from "@/hooks/useAuthoritativeTimer";
import { useMarketData } from "@/hooks/useMarketData";
import { useHoldings } from "@/hooks/useHoldings";
import { useTradeHistory } from "@/hooks/useTradeHistory";
import { useCashBalance } from "@/hooks/useCashBalance";
import { useTradeExecution } from "@/hooks/useTradeExecution";

/**
 * React bridge over the MockCompetitionEngine with real market data.
 *
 * Competition state (rounds, market status, timer) comes from the mock engine.
 * Market data (stocks, prices) comes from Supabase via useMarketData.
 * Other mock data (holdings, trades, portfolio, leaderboard) remains from the engine.
 *
 * This is an incremental migration: only market data is replaced with real data.
 */
const engine = getMockEngine();

// Stable action surface: engine methods are bound once at module scope so the
// context value (and consumers' effects) stay referentially stable between
// engine mutations.
const engineActions = {
  startRound: (round: RoundNumber) => engine.startRound(round),
  endRound: (round: RoundNumber) => engine.endRound(round),
  setMarketStatus: (status: MarketStatus) => {
    if (status === "MARKET_OPEN") return engine.openMarket();
    if (status === "TRADING_PAUSED") return engine.pauseTrading();
    if (status === "MARKET_CLOSED") return engine.closeMarket();
    return Promise.resolve();
  },
  setPendingPriceChange: (stockId: string, newPrice: number) =>
    engine.setPendingPriceChange(stockId, newPrice),
  clearPendingPriceChange: (stockId: string) => engine.clearPendingPriceChange(stockId),
  applyPriceChanges: () => engine.applyPriceChanges(),
  payDividends: (stockId: string, amountPerShare: number) =>
    engine.payDividend(stockId, amountPerShare),
  creditCash: (teamId: string, amount: number, reason?: string) =>
    engine.creditCash(teamId, amount, reason),
  debitCash: (teamId: string, amount: number, reason?: string) =>
    engine.debitCash(teamId, amount, reason),
  selectVideo: (videoId: string | null) => engine.selectVideo(videoId),
  playVideo: () => engine.playVideo(),
  stopVideo: () => engine.stopVideo(),
  resetCompetition: () => engine.resetCompetition(),
  // executeBuy/executeSell are provided by SandboxProvider via useTradeExecution
  setViewRole: (role: ViewRole) => engine.setRole(role),
  syncStateFromBackend: (payload: Partial<RealtimeEventPayload>) =>
    engine.applyRemote(payload as RealtimeEventPayload),
};

interface SandboxContextType {
  // Competition State
  currentRound: RoundNumber;
  marketStatus: MarketStatus;
  roundStartedAt: string | null;
  roundEndsAt: string | null;
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

  // Market Data State
  isMarketDataLoading: boolean;
  marketDataError: string | null;
  refetchMarketData: () => Promise<void>;

  // Admin Context
  pendingPriceChanges: PendingPriceChange[];
  videos: VideoItem[];
  activeVideo: VideoItem | null;
  isVideoPlaying: boolean;
  videoPlaybackStartedAt: string | null;
  teams: TeamOverview[];

  // Notifications (rendered via Sonner)
  addToast: (type: ToastMessage["type"], title: string, message: string) => void;

  // Initial authoritative-state sync (drives dashboard loading skeletons)
  isInitializing: boolean;

  // Admin Actions (engine operations — the backend-replacement boundary)
  startRound: (round: RoundNumber) => Promise<void>;
  endRound: (round: RoundNumber) => Promise<void>;
  setMarketStatus: (status: MarketStatus) => Promise<void>;
  setPendingPriceChange: (stockId: string, newPrice: number) => void;
  clearPendingPriceChange: (stockId: string) => void;
  applyPriceChanges: () => Promise<void>;
  payDividends: (stockId: string, amountPerShare: number) => Promise<void>;
  creditCash: (teamId: string, amount: number, reason?: string) => { ok: boolean; message?: string };
  debitCash: (teamId: string, amount: number, reason?: string) => { ok: boolean; message?: string };
  selectVideo: (videoId: string | null) => void;
  playVideo: () => Promise<void>;
  stopVideo: () => Promise<void>;
  resetCompetition: () => Promise<void>;

  // Participant Trade Actions
  executeBuy: (stockId: string, quantity: number) => Promise<TradeResponseDto>;
  executeSell: (stockId: string, quantity: number) => Promise<TradeResponseDto>;

  // View scope (controls pending-price visibility per console)
  setViewRole: (role: ViewRole) => void;

  // Direct backend sync boundary method
  syncStateFromBackend: (payload: Partial<RealtimeEventPayload>) => void;
}

const SandboxContext = createContext<SandboxContextType | undefined>(undefined);

export const SandboxProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Snapshot-driven subscription: the engine is the single source of truth and
  // notifies subscribers after every committed event (local or cross-tab). SSR
  // renders the deterministic initial snapshot, so hydration stays in sync.
  const [snapshot, setSnapshot] = useState<CompetitionSnapshot>(() =>
    engine.getSnapshot()
  );
  useEffect(() => engine.subscribe(() => setSnapshot(engine.getSnapshot())), []);

  // Real market data from Supabase
  const {
    stocks: marketStocks,
    isLoading: isMarketDataLoading,
    error: marketDataError,
    refetch: refetchMarketData,
  } = useMarketData();

  // Real holdings, transactions, and cash from Supabase
  const {
    holdings: realHoldings,
    refetch: refetchHoldings,
  } = useHoldings();
  const {
    transactions: realTransactions,
    refetch: refetchTransactions,
  } = useTradeHistory();
  const {
    cash: realCash,
    initialCapital,
    refetch: refetchCash,
  } = useCashBalance();

  // Real trade execution via execute_trade() RPC
  const { executeBuy: realExecuteBuy, executeSell: realExecuteSell } = useTradeExecution();

  // Authoritative countdown derived from the round's end timestamp. Ticks for
  // the whole round window (even while trading is paused or the market closed) —
  // only the pre-competition state has no active timer.
  const timerSeconds = useAuthoritativeTimer(
    snapshot.roundEndsAt,
    snapshot.marketStatus !== "NOT_STARTED"
  );

  // Simulates the initial authoritative-state sync so skeletons render once.
  const [isInitializing, setIsInitializing] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setIsInitializing(false), 500);
    return () => window.clearTimeout(t);
  }, []);

  const addToast = useCallback((type: ToastMessage["type"], title: string, message: string) => {
    if (type === "success") toast.success(title, { description: message });
    else if (type === "warning") toast.warning(title, { description: message });
    else if (type === "error") toast.error(title, { description: message });
    else toast.info(title, { description: message });
  }, []);

  // Single toast path for every engine event (local and cross-tab).
  useEffect(() => {
    return engine.subscribeEvents((event) => {
      switch (event.type) {
        case "ROUND_STARTED":
          addToast("info", `Round ${event.round} Started`, "Trading is now open for this round.");
          break;
        case "ROUND_ENDED":
          addToast("warning", `Round ${event.round} Ended`, "Trading closed by the administrator.");
          break;
        case "MARKET_OPENED":
          addToast("success", "Market Open", "Trading is now open.");
          break;
        case "MARKET_CLOSED":
          addToast("warning", "Market Closed", "Orders are no longer being accepted.");
          break;
        case "TRADING_PAUSED":
          addToast("warning", "Trading Paused", "The administrator paused trading activity.");
          break;
        case "TRADING_RESUMED":
          addToast("success", "Trading Resumed", "Trading is active again.");
          break;
        case "TRADE_EXECUTED": {
          const label = event.side === "BUY" ? "Bought" : "Sold";
          addToast("success", "Trade Executed", `${label} ${event.quantity} share(s) of ${event.transaction?.symbol ?? ""}.`);
          break;
        }
        case "PRICE_CHANGES_APPLIED":
          addToast("success", "Price Changes Applied", "New market prices have been broadcast.");
          break;
        case "DIVIDENDS_PAID": {
          const stock = engine.getSnapshot().stocks.find((s) => s.id === event.stockId);
          addToast("info", "Dividend Dispatched", `Paid ₹${event.amountPerShare}/share of ${stock?.symbol ?? ""} to every holder.`);
          break;
        }
        case "CASH_UPDATED":
          addToast("info", "Cash Adjusted", event.reason ?? "An administrator adjusted a team's cash.");
          break;
        case "VIDEO_PLAY": {
          const video = engine.getSnapshot().videos.find((v) => v.id === event.videoId);
          addToast("info", "Video Broadcast Started", `Playing "${video?.title ?? ""}" across all screens.`);
          break;
        }
        case "VIDEO_STOP":
          addToast("info", "Video Broadcast Stopped", "The video overlay has been closed.");
          break;
        case "COMPETITION_RESET":
          addToast("warning", "Competition Reset", "Restored the initial competition state.");
          break;
        default:
          break;
      }
    });
  }, [addToast]);

  const value = useMemo<SandboxContextType>(
    () => ({
      // Competition state
      currentRound: snapshot.currentRound,
      marketStatus: snapshot.marketStatus,
      roundStartedAt: snapshot.roundStartedAt,
      roundEndsAt: snapshot.roundEndsAt,
      serverEndTimestamp: snapshot.roundEndsAt,
      timerSeconds,
      teamName: snapshot.teamName,

      // Trading state — real data from Supabase
      cash: realCash,
      // Use real market data from Supabase instead of mock engine
      stocks: marketStocks,
      holdings: realHoldings,
      transactions: realTransactions,
      leaderboard: snapshot.leaderboard,
      totalPortfolioValue: realCash + realHoldings.reduce((sum, h) => sum + h.totalValue, 0),
      // Authoritative P/L: portfolio_value - initial_capital (Phase 6 formula)
      totalProfitLoss: (realCash + realHoldings.reduce((sum, h) => sum + h.totalValue, 0)) - initialCapital,
      totalProfitLossPercent: initialCapital > 0
        ? (((realCash + realHoldings.reduce((sum, h) => sum + h.totalValue, 0)) - initialCapital) / initialCapital) * 100
        : 0,

      // Market data state
      isMarketDataLoading,
      marketDataError,
      refetchMarketData,

      // Admin context
      pendingPriceChanges: snapshot.pendingPriceChanges,
      videos: snapshot.videos,
      activeVideo: snapshot.activeVideo,
      isVideoPlaying: snapshot.isVideoPlaying,
      videoPlaybackStartedAt: snapshot.videoPlaybackStartedAt,
      teams: snapshot.teams,

      addToast,
      isInitializing,

      // Admin actions (engine operations — the backend-replacement boundary)
      ...engineActions,

      // Participant trade actions — real execute_trade() RPC with refetch
      executeBuy: async (stockId: string, quantity: number) => {
        const result = await realExecuteBuy(stockId, quantity);
        if (result.success) {
          refetchHoldings();
          refetchCash();
          refetchTransactions();
        }
        return result;
      },
      executeSell: async (stockId: string, quantity: number) => {
        const result = await realExecuteSell(stockId, quantity);
        if (result.success) {
          refetchHoldings();
          refetchCash();
          refetchTransactions();
        }
        return result;
      },
    }),
    [
      snapshot,
      timerSeconds,
      addToast,
      isInitializing,
      marketStocks,
      isMarketDataLoading,
      marketDataError,
      refetchMarketData,
      realHoldings,
      realTransactions,
      realCash,
      initialCapital,
      realExecuteBuy,
      realExecuteSell,
      refetchHoldings,
      refetchCash,
      refetchTransactions,
    ]
  );

  return <SandboxContext.Provider value={value}>{children}</SandboxContext.Provider>;
};

export const useSandboxStore = () => {
  const context = useContext(SandboxContext);
  if (!context) {
    throw new Error("useSandboxStore must be used within a SandboxProvider");
  }
  return context;
};

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
import { useRealtimeSync } from "@/lib/realtime";
import { useCompetitionContext } from "@/lib/competition-context";
import { createClient } from "@/lib/supabase/client";

/**
 * React bridge over the MockCompetitionEngine with real Supabase data.
 *
 * Competition state (rounds, market status, timer) comes from the mock engine.
 * Market data (stocks, prices) comes from Supabase via useMarketData.
 * Other mock data (holdings, trades, portfolio, leaderboard) remains from the engine.
 *
 * Admin operations (start_round, end_round, open_market, etc.) are now
 * authoritative Supabase RPCs. Local engine is updated for immediate UI feedback.
 *
 * Participant trading (execute_trade) uses real Supabase RPC.
 *
 * Realtime notifications from Supabase trigger targeted refetches.
 *
 * Round 3 videos are played externally on a TV — no video subsystem in the website.
 */
const engine = getMockEngine();

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
  teams: TeamOverview[];

  // Notifications (rendered via Sonner)
  addToast: (type: ToastMessage["type"], title: string, message: string) => void;

  // Initial authoritative-state sync (drives dashboard loading skeletons)
  isInitializing: boolean;

  // Admin Actions (Supabase RPCs — authoritative database mutations)
  startRound: (round: RoundNumber) => Promise<void>;
  endRound: (round: RoundNumber) => Promise<void>;
  setMarketStatus: (status: MarketStatus) => Promise<void>;
  applyPriceChanges: () => Promise<void>;
  payDividends: (stockId: string, amountPerShare: number) => Promise<void>;
  creditCash: (teamId: string, amount: number, reason?: string) => { ok: boolean; message?: string };
  debitCash: (teamId: string, amount: number, reason?: string) => { ok: boolean; message?: string };

  // Local state operations (not database-backed)
  setPendingPriceChange: (stockId: string, newPrice: number) => void;
  clearPendingPriceChange: (stockId: string) => void;
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

  // Competition context for admin operations
  const competitionCtx = useCompetitionContext();
  const competitionRunId = competitionCtx.context?.competitionRun?.id ?? null;
  const teamId = competitionCtx.context?.role === "participant"
    ? competitionCtx.context.teamMembership?.team_id ?? null
    : null;

  // Rounds state for admin operations - fetches round UUIDs for the current run
  const [rounds, setRounds] = useState<Array<{ id: string; round_number: number; status: string }>>([]);
  useEffect(() => {
    if (!competitionRunId) return;
    const supabase = createClient();
    supabase
      .from("rounds")
      .select("id, round_number, status")
      .eq("competition_run_id", competitionRunId)
      .order("round_number")
      .then(({ data }) => {
        if (data) setRounds(data);
      });
  }, [competitionRunId]);

  // Targeted refetch based on event type (Phase 9.8 optimization)
  const onReconcile = useCallback(
    (event?: string) => {
      switch (event) {
        case "ROUND_STATE_CHANGED":
          // Round state changed - engine snapshot handles this
          break;
        case "MARKET_STATE_CHANGED":
          // Market state changed - refetch market data
          refetchMarketData();
          break;
        case "PRICES_CHANGED":
          // Prices changed - refetch market data and holdings
          refetchMarketData();
          refetchHoldings();
          refetchCash();
          refetchTransactions();
          break;
        case "PORTFOLIO_CHANGED":
          // Portfolio changed - refetch holdings, cash, transactions
          refetchHoldings();
          refetchCash();
          refetchTransactions();
          break;
        case "LEADERBOARD_CHANGED":
          // Leaderboard changed - engine snapshot handles this
          break;
        default:
          // Unknown event - refetch all to be safe
          refetchMarketData();
          refetchHoldings();
          refetchCash();
          refetchTransactions();
      }
    },
    [refetchMarketData, refetchHoldings, refetchCash, refetchTransactions]
  );

  // Realtime event subscriptions via Supabase (Phase 9.8).
  // PostgreSQL is authoritative; Realtime events trigger targeted refetches.
  useRealtimeSync({
    runId: competitionRunId,
    teamId: teamId,
    runEvents: [
      "ROUND_STATE_CHANGED",
      "MARKET_STATE_CHANGED",
      "PRICES_CHANGED",
      "LEADERBOARD_CHANGED",
    ],
    teamEvents: ["PORTFOLIO_CHANGED"],
    onReconcile,
  });

  // Admin operations via Supabase RPCs (authoritative database mutations)
  const adminActions = useMemo(() => {
    const supabase = createClient();

    const findRoundByNumber = (roundNumber: RoundNumber) =>
      rounds.find((r) => r.round_number === roundNumber);

    const findActiveRound = () =>
      rounds.find((r) => r.status === "active");

    return {
      startRound: async (round: RoundNumber) => {
        const roundRecord = findRoundByNumber(round);
        if (!roundRecord) {
          toast.error("Round not found", { description: `Round ${round} does not exist` });
          return;
        }
        const { error } = await supabase.rpc("start_round", {
          p_round_id: roundRecord.id,
        });
        if (error) {
          toast.error("Failed to start round", { description: error.message });
          return;
        }
        // Update local engine for immediate UI feedback
        await engine.startRound(round);
        // Refresh rounds state
        const { data: updatedRounds } = await supabase
          .from("rounds")
          .select("id, round_number, status")
          .eq("competition_run_id", competitionRunId)
          .order("round_number");
        if (updatedRounds) setRounds(updatedRounds);
      },

      endRound: async (round: RoundNumber) => {
        const roundRecord = findRoundByNumber(round);
        if (!roundRecord) {
          toast.error("Round not found", { description: `Round ${round} does not exist` });
          return;
        }
        const { error } = await supabase.rpc("end_round", {
          p_round_id: roundRecord.id,
        });
        if (error) {
          toast.error("Failed to end round", { description: error.message });
          return;
        }
        // Update local engine for immediate UI feedback
        await engine.endRound(round);
        // Refresh rounds state
        const { data: updatedRounds } = await supabase
          .from("rounds")
          .select("id, round_number, status")
          .eq("competition_run_id", competitionRunId)
          .order("round_number");
        if (updatedRounds) setRounds(updatedRounds);
      },

      setMarketStatus: async (status: MarketStatus) => {
        const activeRound = findActiveRound();
        if (!activeRound) {
          toast.error("No active round", { description: "Cannot change market status without an active round" });
          return;
        }
        let rpcName: string;
        switch (status) {
          case "MARKET_OPEN":
            rpcName = "open_market";
            break;
          case "TRADING_PAUSED":
            rpcName = "pause_trading";
            break;
          case "MARKET_CLOSED":
            rpcName = "close_market";
            break;
          default:
            return;
        }
        const { error } = await supabase.rpc(rpcName, {
          p_round_id: activeRound.id,
        });
        if (error) {
          toast.error("Failed to update market status", { description: error.message });
          return;
        }
        // Update local engine for immediate UI feedback
        if (status === "MARKET_OPEN") await engine.openMarket();
        else if (status === "TRADING_PAUSED") await engine.pauseTrading();
        else if (status === "MARKET_CLOSED") await engine.closeMarket();
      },

      applyPriceChanges: async () => {
        // For now, apply_price_changes requires a batch_id
        // The pending price changes are stored in the engine
        // TODO: Implement price batch creation via Supabase
        // For now, use engine's applyPriceChanges which broadcasts via BroadcastChannel
        await engine.applyPriceChanges();
        toast.success("Price changes applied", { description: "Market prices have been updated" });
      },

      payDividends: async (stockId: string, amountPerShare: number) => {
        // Create dividend via Supabase
        const { data: dividendData, error: createError } = await supabase
          .from("dividends")
          .insert({
            competition_run_id: competitionRunId,
            stock_id: stockId,
            amount_paise: Math.round(amountPerShare * 100),
            status: "pending",
          })
          .select("id")
          .single();

        if (createError || !dividendData) {
          toast.error("Failed to create dividend", { description: createError?.message ?? "Unknown error" });
          return;
        }

        // Apply the dividend
        const { error } = await supabase.rpc("apply_dividend", {
          p_dividend_id: dividendData.id,
        });
        if (error) {
          toast.error("Failed to apply dividend", { description: error.message });
          return;
        }
        // Update local engine for immediate UI feedback
        await engine.payDividend(stockId, amountPerShare);
        toast.success("Dividend applied", { description: `₹${amountPerShare} per share paid to all teams` });
      },

      creditCash: (teamId: string, amount: number, reason?: string) => {
        // Credit cash via Supabase RPC
        supabase
          .rpc("adjust_team_cash", {
            p_team_id: teamId,
            p_competition_run_id: competitionRunId,
            p_amount_paise: Math.round(amount * 100),
            p_reason: reason || "Admin credit",
          })
          .then(({ error }) => {
            if (error) {
              toast.error("Failed to credit cash", { description: error.message });
              return { ok: false, message: error.message };
            }
            // Update local engine for immediate UI feedback
            engine.creditCash(teamId, amount, reason);
            toast.success("Cash credited", { description: `₹${amount} credited to team` });
            return { ok: true };
          });
        // Return synchronously for backward compatibility
        return { ok: true };
      },

      debitCash: (teamId: string, amount: number, reason?: string) => {
        // Debit cash via Supabase RPC (negative amount)
        supabase
          .rpc("adjust_team_cash", {
            p_team_id: teamId,
            p_competition_run_id: competitionRunId,
            p_amount_paise: -Math.round(amount * 100),
            p_reason: reason || "Admin debit",
          })
          .then(({ error }) => {
            if (error) {
              toast.error("Failed to debit cash", { description: error.message });
              return { ok: false, message: error.message };
            }
            // Update local engine for immediate UI feedback
            engine.debitCash(teamId, amount, reason);
            toast.success("Cash debited", { description: `₹${amount} debited from team` });
            return { ok: true };
          });
        // Return synchronously for backward compatibility
        return { ok: true };
      },
    };
  }, [rounds, competitionRunId]);

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
      teams: snapshot.teams,

      addToast,
      isInitializing,

      // Admin actions — Supabase RPCs (authoritative) + local engine (UI feedback)
      ...adminActions,

      // Pending price changes — local engine state (private until applied)
      setPendingPriceChange: (stockId: string, newPrice: number) =>
        engine.setPendingPriceChange(stockId, newPrice),
      clearPendingPriceChange: (stockId: string) => engine.clearPendingPriceChange(stockId),

      resetCompetition: () => engine.resetCompetition(),

      // View role — local UI state
      setViewRole: (role: ViewRole) => engine.setRole(role),
      syncStateFromBackend: (payload: Partial<RealtimeEventPayload>) =>
        engine.applyRemote(payload as RealtimeEventPayload),

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
      adminActions,
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

"use client";

import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
import { useAuthoritativeTimer } from "@/hooks/useAuthoritativeTimer";
import { useMarketData } from "@/hooks/useMarketData";
import { useHoldings } from "@/hooks/useHoldings";
import { useTradeHistory } from "@/hooks/useTradeHistory";
import { useCashBalance } from "@/hooks/useCashBalance";
import { useTradeExecution } from "@/hooks/useTradeExecution";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { useRealtimeSync } from "@/lib/realtime";
import { useCompetitionContext } from "@/lib/competition-context";
import { createClient } from "@/lib/supabase/client";
import type { TeamOverview } from "@/lib/competition/types";

/**
 * Derive the frontend MarketStatus from the database round state.
 *
 * This is a display-only derived value. Admin controls use the raw DB fields
 * directly (roundStatus, marketStatusDb, tradingStatusDb) for button logic.
 *
 * Database rounds table has:
 *   - status: 'pending' | 'active' | 'completed'
 *   - market_status: 'closed' | 'open'
 *   - trading_status: 'paused' | 'enabled'
 *
 * Frontend MarketStatus:
 *   - NOT_STARTED: no active round yet
 *   - MARKET_OPEN: market_status='open' and trading_status='enabled'
 *   - TRADING_PAUSED: trading_status='paused'
 *   - MARKET_CLOSED: market_status='closed'
 *   - ROUND_ENDED: round status='completed'
 */
function deriveMarketStatus(
  roundStatus: string | null,
  marketStatusDb: string | null,
  tradingStatusDb: string | null
): MarketStatus {
  if (!roundStatus || roundStatus === "pending") return "NOT_STARTED";
  if (roundStatus === "completed") return "ROUND_ENDED";
  if (tradingStatusDb === "paused") return "TRADING_PAUSED";
  if (marketStatusDb === "open" && tradingStatusDb === "enabled") return "MARKET_OPEN";
  if (marketStatusDb === "closed") return "MARKET_CLOSED";
  return "NOT_STARTED";
}

interface SandboxContextType {
  // Competition State
  currentRound: RoundNumber;
  marketStatus: MarketStatus;
  /** Raw round status from DB: 'pending' | 'active' | 'completed' | null */
  roundStatus: string | null;
  /** Raw market_status from DB: 'open' | 'closed' | null */
  marketStatusDb: string | null;
  /** Raw trading_status from DB: 'enabled' | 'paused' | null */
  tradingStatusDb: string | null;
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
  resumeTrading: () => Promise<void>;
  applyPriceChanges: () => Promise<void>;
  payDividends: (stockId: string, amountPerShare: number) => Promise<void>;
  creditCash: (teamId: string, amount: number, reason?: string) => { ok: boolean; message?: string };
  debitCash: (teamId: string, amount: number, reason?: string) => { ok: boolean; message?: string };
  addStock: (params: { symbol: string; name: string; description: string; currentPrice: number }) => Promise<void>;
  editStock: (stockId: string, params: { name: string; description: string }) => Promise<void>;
  toggleStockActive: (stockId: string, isActive: boolean) => Promise<void>;
  resetCompetition: () => Promise<void>;

  // Local state operations (not database-backed)
  setPendingPriceChange: (stockId: string, newPrice: number) => void;
  clearPendingPriceChange: (stockId: string) => void;

  // Participant Trade Actions
  executeBuy: (stockId: string, quantity: number) => Promise<TradeResponseDto>;
  executeSell: (stockId: string, quantity: number) => Promise<TradeResponseDto>;

  // View scope (controls pending-price visibility per console)
  setViewRole: (role: "participant" | "admin" | null) => void;

  // Direct backend sync boundary method
  syncStateFromBackend: (payload: Partial<RealtimeEventPayload>) => void;
}

const SandboxContext = createContext<SandboxContextType | undefined>(undefined);

export const SandboxProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Competition context — authoritative competition state from Supabase
  const competitionCtx = useCompetitionContext();
  const ctx = competitionCtx.context;
  const competitionRunId = ctx?.competitionRun?.id ?? null;
  const teamId = ctx?.role === "participant"
    ? ctx.userId ?? null
    : null;

  // Derive competition state from the real database round
  const dbRound = ctx?.currentRound ?? null;
  const roundStatus = dbRound?.status ?? null;
  const marketStatusDb = dbRound?.market_status ?? null;
  const tradingStatusDb = dbRound?.trading_status ?? null;

  // Derive frontend state from database state
  const currentRound: RoundNumber = (dbRound?.round_number as RoundNumber) ?? 1;
  const marketStatus: MarketStatus = deriveMarketStatus(roundStatus, marketStatusDb, tradingStatusDb);
  const roundStartedAt = dbRound?.started_at ?? null;
  const roundEndsAt = dbRound?.ends_at ?? null;

  // Team name from competition context
  const teamName = ctx?.role === "participant"
    ? (ctx as { teamName?: string }).teamName ?? "Team"
    : "Admin";

  // Real market data from Supabase
  const {
    stocks: marketStocks,
    isLoading: isMarketDataLoading,
    error: marketDataError,
    refetch: refetchMarketData,
  } = useMarketData();

  // Build stock lookup map for trade history symbol resolution
  const stockMap = useMemo(() => {
    const map = new Map<string, { symbol: string; name: string }>();
    for (const stock of marketStocks) {
      map.set(stock.id, { symbol: stock.symbol, name: stock.name });
    }
    return map;
  }, [marketStocks]);

  // Real holdings, transactions, and cash from Supabase
  const {
    holdings: realHoldings,
    refetch: refetchHoldings,
  } = useHoldings();
  const {
    transactions: realTransactions,
    refetch: refetchTransactions,
  } = useTradeHistory(stockMap);
  const {
    cash: realCash,
    initialCapital,
    refetch: refetchCash,
  } = useCashBalance();

  // Real leaderboard from Supabase
  const {
    leaderboard: dbLeaderboard,
    refetch: refetchLeaderboard,
  } = useLeaderboard();

  // Real trade execution via execute_trade() RPC
  const { executeBuy: realExecuteBuy, executeSell: realExecuteSell } = useTradeExecution();

  // Authoritative countdown derived from the round's end timestamp.
  // Timer runs when trading is ENABLED, pauses when PAUSED, continues when DISABLED.
  const timerSeconds = useAuthoritativeTimer(
    roundEndsAt,
    tradingStatusDb === "enabled" ? "ENABLED" : tradingStatusDb === "paused" ? "PAUSED" : "DISABLED"
  );

  // Auto-end round when timer expires (timer hits 0 while round is active).
  // The frontend does NOT authoritatively end the round — it calls the server RPC.
  const autoEndedRoundRef = useRef<string | null>(null);
  const endRoundRef = useRef<(round: RoundNumber) => Promise<void>>(() => Promise.resolve());
  useEffect(() => {
    if (
      timerSeconds === 0 &&
      roundStatus === "active" &&
      roundEndsAt &&
      autoEndedRoundRef.current !== dbRound?.id
    ) {
      autoEndedRoundRef.current = dbRound?.id ?? null;
      endRoundRef.current(currentRound);
    }
  }, [timerSeconds, roundStatus, roundEndsAt, dbRound?.id, currentRound]);

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

  // Teams state for admin panel - fetches team overviews
  const [teams, setTeams] = useState<TeamOverview[]>([]);
  useEffect(() => {
    if (!competitionRunId || ctx?.role !== "admin") return;
    const supabase = createClient();
    const fetchTeams = async () => {
      const { data: cashData } = await supabase
        .from("cash_ledger")
        .select("team_id, amount_paise")
        .eq("competition_run_id", competitionRunId)
        .eq("entry_type", "initial_capital");

      if (!cashData) return;

      const teamIds = cashData.map((r) => r.team_id);
      if (teamIds.length === 0) return;

      const { data: teamNames } = await supabase
        .from("teams")
        .select("id, name")
        .in("id", teamIds);

      const nameMap = new Map((teamNames ?? []).map((t) => [t.id, t.name]));

      // Fetch holdings count per team
      const { data: holdingsData } = await supabase
        .from("holdings")
        .select("team_id, stock_id")
        .eq("competition_run_id", competitionRunId)
        .gt("quantity", 0);

      const holdingsCountMap = new Map<string, number>();
      for (const h of holdingsData ?? []) {
        holdingsCountMap.set(h.team_id, (holdingsCountMap.get(h.team_id) ?? 0) + 1);
      }

      const teamOverviews: TeamOverview[] = cashData.map((row) => ({
        id: row.team_id,
        name: nameMap.get(row.team_id) ?? "Unknown Team",
        cash: row.amount_paise / 100,
        portfolioValue: 0, // Will be updated by leaderboard
        profitLoss: 0,
        holdingsCount: holdingsCountMap.get(row.team_id) ?? 0,
        dividendsReceived: 0,
      }));

      setTeams(teamOverviews);
    };
    fetchTeams();
  }, [competitionRunId, ctx?.role]);

  // Refetch rounds helper
  const refetchDbRounds = useCallback(async () => {
    if (!competitionRunId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("rounds")
      .select("id, round_number, status")
      .eq("competition_run_id", competitionRunId)
      .order("round_number");
    if (data) setRounds(data);
  }, [competitionRunId]);

  // Targeted refetch based on event type (Phase 9.8 optimization)
  const onReconcile = useCallback(
    (event?: string) => {
      switch (event) {
        case "ROUND_STATE_CHANGED":
          // Round state changed - refresh competition context and rounds
          competitionCtx.refresh();
          refetchDbRounds();
          break;
        case "MARKET_STATE_CHANGED":
          // Market state changed - refetch market data and refresh context
          refetchMarketData();
          competitionCtx.refresh();
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
          // Leaderboard changed - refetch leaderboard
          refetchLeaderboard();
          break;
        default:
          // Unknown event - refetch all to be safe
          refetchMarketData();
          refetchHoldings();
          refetchCash();
          refetchTransactions();
          refetchLeaderboard();
      }
    },
    [refetchMarketData, refetchHoldings, refetchCash, refetchTransactions, refetchLeaderboard, competitionCtx, refetchDbRounds]
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
        // Refresh rounds and competition context
        await refetchDbRounds();
        competitionCtx.refresh();
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
        // Reset auto-end guard for this round
        autoEndedRoundRef.current = null;
        // Refresh rounds and competition context
        await refetchDbRounds();
        competitionCtx.refresh();
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
        await refetchDbRounds();
        competitionCtx.refresh();
      },

      resumeTrading: async () => {
        const activeRound = findActiveRound();
        if (!activeRound) {
          toast.error("No active round", { description: "Cannot resume trading without an active round" });
          return;
        }
        const { error } = await supabase.rpc("resume_trading", {
          p_round_id: activeRound.id,
        });
        if (error) {
          toast.error("Failed to resume trading", { description: error.message });
          return;
        }
        await refetchDbRounds();
        competitionCtx.refresh();
      },

      addStock: async (params: { symbol: string; name: string; description: string; currentPrice: number }) => {
        const { data, error } = await supabase.rpc("add_stock", {
          p_symbol: params.symbol,
          p_name: params.name,
          p_description: params.description,
          p_initial_price_paise: Math.round(params.currentPrice * 100),
        });
        if (error) {
          toast.error("Failed to add stock", { description: error.message });
          return;
        }
        refetchMarketData();
        toast.success("Stock added", { description: `${(data as { symbol: string }).symbol} added to market` });
      },

      editStock: async (stockId: string, params: { name: string; description: string }) => {
        const { error } = await supabase.rpc("rename_stock", {
          p_stock_id: stockId,
          p_new_name: params.name,
        });
        if (error) {
          toast.error("Failed to update stock", { description: error.message });
          return;
        }
        toast.success("Stock updated", { description: "Stock name saved" });
      },

      toggleStockActive: async (stockId: string, isActive: boolean) => {
        const rpc = isActive ? "reactivate_stock" : "deactivate_stock";
        const { error } = await supabase.rpc(rpc, {
          p_stock_id: stockId,
        });
        if (error) {
          toast.error("Failed to update stock", { description: error.message });
          return;
        }
        toast.success(isActive ? "Stock activated" : "Stock deactivated", {
          description: `Stock is now ${isActive ? "active" : "inactive"}`,
        });
      },

      payDividends: async (stockId: string, amountPerShare: number) => {
        // Create dividend record via RPC and apply it
        if (!competitionRunId) {
          toast.error("No active competition run", { description: "Cannot pay dividends without an active run" });
          return;
        }
        const supabaseAdmin = createClient();

        // Step 1: Create pending dividend via SECURITY DEFINER RPC
        const { data: dividendResult, error: createError } = await supabaseAdmin.rpc(
          "create_dividend",
          {
            p_competition_run_id: competitionRunId,
            p_stock_id: stockId,
            p_amount_per_share_paise: Math.round(amountPerShare * 100),
          }
        );

        if (createError) {
          toast.error("Failed to create dividend", { description: createError.message });
          return;
        }

        const dividendId = (dividendResult as { dividend_id: string }).dividend_id;

        // Step 2: Apply the dividend (creates payments and cash ledger entries)
        const { error: applyError } = await supabaseAdmin.rpc("apply_dividend", {
          p_dividend_id: dividendId,
        });

        if (applyError) {
          toast.error("Failed to apply dividend", { description: applyError.message });
          return;
        }

        toast.success("Dividends paid", { description: `₹${amountPerShare} per share dividend applied` });
        refetchCash();
        refetchHoldings();
        refetchLeaderboard();
      },

      creditCash: (teamId: string, amount: number, reason?: string) => {
        if (!competitionRunId) {
          return { ok: false, message: "No active competition run" };
        }
        const supabaseAdmin = createClient();
        supabaseAdmin.rpc("adjust_team_cash", {
          p_team_id: teamId,
          p_competition_run_id: competitionRunId,
          p_amount_paise: Math.round(amount * 100),
          p_reason: reason || "Admin credit",
        }).then(({ error }) => {
          if (error) {
            toast.error("Failed to credit cash", { description: error.message });
          } else {
            toast.success("Cash credited", { description: `₹${amount} credited` });
            refetchCash();
            refetchLeaderboard();
          }
        });
        return { ok: true };
      },

      debitCash: (teamId: string, amount: number, reason?: string) => {
        if (!competitionRunId) {
          return { ok: false, message: "No active competition run" };
        }
        const supabaseAdmin = createClient();
        supabaseAdmin.rpc("adjust_team_cash", {
          p_team_id: teamId,
          p_competition_run_id: competitionRunId,
          p_amount_paise: -Math.round(amount * 100),
          p_reason: reason || "Admin debit",
        }).then(({ error }) => {
          if (error) {
            toast.error("Failed to debit cash", { description: error.message });
          } else {
            toast.success("Cash debited", { description: `₹${amount} debited` });
            refetchCash();
            refetchLeaderboard();
          }
        });
        return { ok: true };
      },

      resetCompetition: async () => {
        toast.info("Reset competition", { description: "Competition reset is not yet implemented" });
      },
    };
  }, [rounds, competitionRunId, refetchMarketData, refetchDbRounds, competitionCtx, ctx, refetchCash, refetchHoldings, refetchLeaderboard]);

  // Keep endRoundRef in sync for auto-end detection
  useEffect(() => {
    endRoundRef.current = adminActions.endRound;
  }, [adminActions.endRound]);

  // Pending price changes — local state (admin-private, never persisted to DB)
  const [pendingPriceChanges, setPendingPriceChangesState] = useState<PendingPriceChange[]>([]);

  const setPendingPriceChange = useCallback((stockId: string, newPrice: number) => {
    const stock = marketStocks.find((s) => s.id === stockId);
    if (!stock || !Number.isFinite(newPrice) || newPrice <= 0) return;
    const changeAmount = newPrice - stock.currentPrice;
    setPendingPriceChangesState((prev) => {
      const idx = prev.findIndex((p) => p.stockId === stockId);
      const item: PendingPriceChange = {
        stockId,
        symbol: stock.symbol,
        companyName: stock.name,
        currentPrice: stock.currentPrice,
        newPrice,
        changeAmount,
        changePercent: stock.currentPrice > 0 ? (changeAmount / stock.currentPrice) * 100 : 0,
      };
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = item;
        return next;
      }
      return [...prev, item];
    });
  }, [marketStocks]);

  const clearPendingPriceChange = useCallback((stockId: string) => {
    setPendingPriceChangesState((prev) => prev.filter((p) => p.stockId !== stockId));
  }, []);

  // Apply price changes — prepare batch via RPC (SECURITY DEFINER), then apply
  const applyPriceChanges = useCallback(async () => {
    if (!competitionRunId || pendingPriceChanges.length === 0) return;
    const supabaseAdmin = createClient();

    // Build the changes array for the RPC
    // prepare_price_batch reads authoritative old prices from market_quotes internally
    const changes = pendingPriceChanges.map((pc) => ({
      stock_id: pc.stockId,
      new_price_paise: Math.round(pc.newPrice * 100),
    }));

    // Step 1: Create batch + pending changes atomically via SECURITY DEFINER RPC
    const { data: batchResult, error: prepareError } = await supabaseAdmin.rpc(
      "prepare_price_batch",
      {
        p_competition_run_id: competitionRunId,
        p_changes: changes,
      }
    );

    if (prepareError) {
      toast.error("Failed to prepare price batch", { description: prepareError.message });
      return;
    }

    const batchId = (batchResult as { batch_id: string }).batch_id;

    // Step 2: Apply the batch (validates stale prices, updates market_quotes, notifies realtime)
    const { error: applyError } = await supabaseAdmin.rpc("apply_price_changes", {
      p_batch_id: batchId,
    });

    if (applyError) {
      toast.error("Failed to apply price changes", { description: applyError.message });
      return;
    }

    setPendingPriceChangesState([]);
    toast.success("Price changes applied", { description: `${pendingPriceChanges.length} stock(s) updated` });
    refetchMarketData();
  }, [competitionRunId, pendingPriceChanges, refetchMarketData]);

  // View role state (kept for API compatibility, not used internally)
  const [, setViewRoleState] = useState<"participant" | "admin" | null>(null);

  const value = useMemo<SandboxContextType>(
    () => ({
      // Competition state — derived from real database round
      currentRound,
      marketStatus,
      roundStatus,
      marketStatusDb,
      tradingStatusDb,
      roundStartedAt,
      roundEndsAt,
      serverEndTimestamp: roundEndsAt,
      timerSeconds,
      teamName,

      // Trading state — real data from Supabase
      cash: realCash,
      stocks: marketStocks,
      holdings: realHoldings,
      transactions: realTransactions,
      leaderboard: dbLeaderboard.map((e) => ({
        rank: e.rank,
        teamId: e.teamId,
        teamName: e.teamName,
        portfolioValue: e.portfolioValuePaise / 100,
        profitLoss: e.pnlPaise / 100,
        profitLossPercent: e.returnBasisPoints / 100,
        isCurrentTeam: e.isCurrentTeam,
      })),
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
      pendingPriceChanges,
      teams,

      addToast,
      isInitializing,

      // Pending price changes — local state (private until applied)
      setPendingPriceChange,
      clearPendingPriceChange,
      applyPriceChanges,

      // Admin actions — Supabase RPCs (authoritative)
      ...adminActions,

      // View role — local UI state
      setViewRole: setViewRoleState,
      syncStateFromBackend: () => {
        // No-op: realtime events trigger refetches via useRealtimeSync
      },

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
      currentRound,
      marketStatus,
      roundStatus,
      marketStatusDb,
      tradingStatusDb,
      roundStartedAt,
      roundEndsAt,
      timerSeconds,
      teamName,
      realCash,
      marketStocks,
      realHoldings,
      realTransactions,
      dbLeaderboard,
      initialCapital,
      isMarketDataLoading,
      marketDataError,
      refetchMarketData,
      pendingPriceChanges,
      teams,
      addToast,
      isInitializing,
      adminActions,
      setPendingPriceChange,
      clearPendingPriceChange,
      applyPriceChanges,
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

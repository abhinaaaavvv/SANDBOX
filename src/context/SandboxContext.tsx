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
  rounds: Array<{ id: string; round_number: number; status: string }>;

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
  // Team Manager (admin)
  createTeam: (
    params: { name: string; email: string; password: string; startingCashRupees: number }
  ) => Promise<{ ok: boolean; message?: string }>;
  renameTeam: (teamId: string, name: string) => Promise<boolean>;
  setTeamBlocked: (teamId: string, blocked: boolean) => Promise<void>;
  removeTeam: (
    teamId: string,
    force?: boolean
  ) => Promise<{ ok: boolean; needsForce?: boolean; message?: string }>;
  setTeamStartingCash: (teamId: string, amountRupees: number) => Promise<boolean>;

  // Stock Management handlers used by the admin UI
  creditCash: (teamId: string, amount: number, reason?: string) => { ok: boolean; message?: string };
  debitCash: (teamId: string, amount: number, reason?: string) => { ok: boolean; message?: string };
  addStock: (params: { symbol: string; name: string; description: string; currentPrice: number }) => Promise<void>;
  editStock: (stockId: string, params: { name: string; description: string; symbol?: string }) => Promise<void>;
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

  // Auto-end round removed — admin must manually end rounds via the RPC.
  // Timer expiry does NOT end the round automatically.

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

  // Teams state for admin panel — live team overviews.
  // Cash = SUM of ALL cash_ledger entries (authoritative), enriched with
  // holdings count + dividends received. Portfolio value / P/L are merged
  // from the server-derived leaderboard below.
  const [teamBase, setTeamBase] = useState<TeamOverview[]>([]);
  const buildTeamOverviews = useCallback(async (): Promise<TeamOverview[] | null> => {
    if (!competitionRunId || ctx?.role !== "admin") return null;
    const supabase = createClient();

    const { data: ledgerRows, error: ledgerError } = await supabase
      .from("cash_ledger")
      .select("team_id, amount_paise")
      .eq("competition_run_id", competitionRunId);
    if (ledgerError || !ledgerRows) return null;

    const cashByTeam = new Map<string, number>();
    for (const row of ledgerRows) {
      cashByTeam.set(row.team_id, (cashByTeam.get(row.team_id) ?? 0) + (row.amount_paise ?? 0));
    }
    const teamIds = [...cashByTeam.keys()];
    if (teamIds.length === 0) return [];

    const [{ data: teamNames }, { data: holdingsData }, { data: dividendData }] = await Promise.all([
      supabase.from("teams").select("id, name, blocked").in("id", teamIds),
      supabase
        .from("holdings")
        .select("team_id, stock_id")
        .eq("competition_run_id", competitionRunId)
        .gt("quantity", 0),
      supabase
        .from("dividend_payments")
        .select("team_id, total_amount_paise")
        .eq("competition_run_id", competitionRunId),
    ]);

    const nameMap = new Map((teamNames ?? []).map((t) => [t.id, t.name]));

    const holdingsCountMap = new Map<string, number>();
    for (const h of holdingsData ?? []) {
      holdingsCountMap.set(h.team_id, (holdingsCountMap.get(h.team_id) ?? 0) + 1);
    }

    const dividendsMap = new Map<string, number>();
    for (const d of dividendData ?? []) {
      dividendsMap.set(d.team_id, (dividendsMap.get(d.team_id) ?? 0) + d.total_amount_paise);
    }

    return teamIds.map((id) => ({
      id,
      name: nameMap.get(id) ?? "Unknown Team",
      cash: (cashByTeam.get(id) ?? 0) / 100,
      portfolioValue: 0, // Merged from leaderboard below
      profitLoss: 0, // Merged from leaderboard below
      holdingsCount: holdingsCountMap.get(id) ?? 0,
      dividendsReceived: (dividendsMap.get(id) ?? 0) / 100,
      blocked: (teamNames ?? []).find((t) => t.id === id)?.blocked ?? false,
    }));
  }, [competitionRunId, ctx?.role]);

  const refreshTeams = useCallback(async () => {
    const rows = await buildTeamOverviews();
    if (rows) setTeamBase(rows);
  }, [buildTeamOverviews]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await buildTeamOverviews();
      if (!cancelled && rows) setTeamBase(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [buildTeamOverviews]);

  // Merge authoritative leaderboard-derived portfolio value & P/L into team overviews.
  const teams = useMemo<TeamOverview[]>(() => {
    if (teamBase.length === 0) return [];
    const lbById = new Map(dbLeaderboard.map((e) => [e.teamId, e]));
    return teamBase.map((t) => {
      const lb = lbById.get(t.id);
      return lb
        ? { ...t, portfolioValue: lb.portfolioValuePaise / 100, profitLoss: lb.pnlPaise / 100 }
        : t;
    });
  }, [teamBase, dbLeaderboard]);

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
    async (event?: string) => {
      switch (event) {
        case "ROUND_STATE_CHANGED":
          // Round state changed - refresh competition context and rounds
          await competitionCtx.refresh();
          await refetchDbRounds();
          break;
        case "MARKET_STATE_CHANGED":
          // Market state changed - refetch market data and refresh context
          await refetchMarketData();
          await competitionCtx.refresh();
          break;
        case "PRICES_CHANGED":
          // Prices changed - refetch market data and holdings
          await Promise.all([
            refetchMarketData(),
            refetchHoldings(),
            refetchCash(),
            refetchTransactions(),
          ]);
          break;
        case "PORTFOLIO_CHANGED":
          // Portfolio changed - refetch holdings, cash, transactions + admin team overviews
          await Promise.all([
            refetchHoldings(),
            refetchCash(),
            refetchTransactions(),
            refreshTeams(),
          ]);
          break;
        case "LEADERBOARD_CHANGED":
          // Leaderboard changed - refetch leaderboard and holdings
          await Promise.all([
            refetchLeaderboard(),
            refetchHoldings(),
            refetchCash(),
            refreshTeams(),
          ]);
          break;
        default:
          // Unknown event type - refetch everything for safety
          await Promise.all([
            refetchMarketData(),
            refetchHoldings(),
            refetchCash(),
            refetchTransactions(),
            refetchLeaderboard(),
            refreshTeams(),
            competitionCtx.refresh(),
          ]);
      }
    },
    [refetchMarketData, refetchHoldings, refetchCash, refetchTransactions, refetchLeaderboard, competitionCtx, refetchDbRounds, refreshTeams]
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

  // Pending price changes — local admin-private UI state. Declared before
  // adminActions because resetCompetition clears it.
  const [pendingPriceChanges, setPendingPriceChangesState] = useState<PendingPriceChange[]>([]);

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
        await competitionCtx.refresh();
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
        // Refresh rounds and competition context (await both)
        await refetchDbRounds();
        await competitionCtx.refresh();
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
        await competitionCtx.refresh();
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
        await competitionCtx.refresh();
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

      editStock: async (
        stockId: string,
        params: { name: string; description: string; symbol?: string }
      ) => {
        const { error } = await supabase.rpc("rename_stock", {
          p_stock_id: stockId,
          p_new_name: params.name,
          p_new_symbol: params.symbol?.trim() ? params.symbol.trim().toUpperCase() : null,
        });
        if (error) {
          toast.error("Failed to update stock", { description: error.message });
          return;
        }
        refetchMarketData();
        toast.success("Stock updated", { description: "Changes saved and broadcast" });
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
          p_idempotency_key: null,
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
          p_idempotency_key: null,
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
        if (!competitionRunId) {
          toast.error("Reset failed", { description: "No active competition run" });
          return;
        }
        const { error } = await supabase.rpc("reset_competition_run", {
          p_competition_run_id: competitionRunId,
        });
        if (error) {
          toast.error("Reset failed", { description: error.message });
          return;
        }
        // Clear local admin drafts (pending price changes are admin-private UI state).
        setPendingPriceChangesState([]);
        await Promise.all([
          refetchDbRounds(),
          refetchMarketData(),
          refetchHoldings(),
          refetchCash(),
          refetchTransactions(),
          refetchLeaderboard(),
        ]);
        await competitionCtx.refresh();
        toast.success("Competition reset", {
          description: "All rounds pending · teams re-funded ₹1,00,000",
        });
      },

      // ---- Team Manager (admin) ----
      createTeam: async (params: {
        name: string;
        email: string;
        password: string;
        startingCashRupees: number;
      }) => {
        const { name, email, password, startingCashRupees } = params;
        try {
          const res = await fetch("/api/admin/teams", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password, startingCashRupees }),
          });
          const json = (await res.json()) as { ok: boolean; message?: string; warning?: string };
          if (!res.ok || !json.ok) {
            return { ok: false, message: json.message ?? "Unable to create team." };
          }
          await refreshTeams();
          toast.success("Team created", {
            description: json.warning ?? `${name} can sign in with the credentials you set.`,
          });
          return { ok: true };
        } catch {
          return { ok: false, message: "Network error while creating team." };
        }
      },

      renameTeam: async (teamId: string, name: string) => {
        const { error } = await supabase.rpc("rename_team", {
          p_team_id: teamId,
          p_new_name: name,
        });
        if (error) {
          toast.error("Rename failed", { description: error.message });
          return false;
        }
        await refreshTeams();
        toast.success("Team renamed");
        return true;
      },

      setTeamBlocked: async (teamId: string, blocked: boolean) => {
        const { error } = await supabase.rpc("set_team_blocked", {
          p_team_id: teamId,
          p_blocked: blocked,
        });
        if (error) {
          toast.error(blocked ? "Block failed" : "Unblock failed", { description: error.message });
          return;
        }
        await refreshTeams();
        toast.success(blocked ? "Team blocked" : "Team unblocked", {
          description: blocked
            ? "They can no longer trade until unblocked."
            : "Trading re-enabled for this team.",
        });
      },

      removeTeam: async (teamId: string, force = false) => {
        let res: Response;
        try {
          res = await fetch("/api/admin/teams", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ teamId, force }),
          });
        } catch {
          return { ok: false, message: "Network error while removing team." };
        }
        const json = (await res.json()) as { ok: boolean; message?: string; code?: string };
        if (!res.ok || !json.ok) {
          const needsForce = json.code === "TEAM_HAS_HISTORY";
          return {
            ok: false,
            needsForce,
            message: json.message ?? "Unable to remove team.",
          };
        }
        await refreshTeams();
        toast.success("Team removed");
        return { ok: true };
      },

      setTeamStartingCash: async (teamId: string, amountRupees: number) => {
        const { error } = await supabase.rpc("set_team_starting_cash", {
          p_team_id: teamId,
          p_amount_paise: Math.round(amountRupees * 100),
        });
        if (error) {
          toast.error("Update failed", { description: error.message });
          return false;
        }
        await refreshTeams();
        toast.success("Starting cash updated", {
          description: `Baseline set to ₹${amountRupees.toLocaleString("en-IN")}`,
        });
        return true;
      },
    };
  }, [rounds, competitionRunId, refetchMarketData, refetchDbRounds, competitionCtx, ctx, refetchCash, refetchHoldings, refetchLeaderboard, refreshTeams]);

  // Pending price changes — local state (admin-private, never persisted to DB)

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
      rounds,

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
      rounds,
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

  // ── Change-detection toasts for participants ──────────────────────────
  // Tracks previous values and fires a toast when polling/realtime delivers new data.
  const prevStocksRef = useRef(marketStocks);
  const prevCashRef = useRef(realCash);
  const prevHoldingsRef = useRef(realHoldings);
  const prevTxCountRef = useRef(realTransactions.length);
  const prevLeaderboardRef = useRef(dbLeaderboard);
  const mountedRef = useRef(false);

  useEffect(() => {
    // Skip the very first render — we only notify on CHANGES after mount
    if (!mountedRef.current) {
      mountedRef.current = true;
      prevStocksRef.current = marketStocks;
      prevCashRef.current = realCash;
      prevHoldingsRef.current = realHoldings;
      prevTxCountRef.current = realTransactions.length;
      prevLeaderboardRef.current = dbLeaderboard;
      return;
    }

    const prevStocks = prevStocksRef.current;
    const prevCash = prevCashRef.current;
    const prevHoldings = prevHoldingsRef.current;
    const prevTxCount = prevTxCountRef.current;
    const prevLb = prevLeaderboardRef.current;

    // Stock prices changed
    const priceChanged = marketStocks.some((s, i) => {
      const p = prevStocks[i];
      return !p || s.currentPricePaise !== p.currentPricePaise;
    }) || marketStocks.length !== prevStocks.length;

    if (priceChanged) {
      toast.info("Prices updated", { description: "Market data has been refreshed" });
    }

    // Cash changed
    if (realCash !== prevCash) {
      const diff = realCash - prevCash;
      if (diff > 0) {
        toast.success("Cash credited", { description: `₹${diff.toFixed(2)} added to your balance` });
      } else if (diff < 0) {
        toast.info("Cash debited", { description: `₹${Math.abs(diff).toFixed(2)} deducted from your balance` });
      }
    }

    // Holdings changed (new position, quantity change, or position closed)
    if (realHoldings.length !== prevHoldings.length) {
      toast.info("Holdings updated", { description: "Your portfolio positions have changed" });
    } else {
      const holdingChanged = realHoldings.some((h, i) => {
        const p = prevHoldings[i];
        return p && (h.quantity !== p.quantity || h.currentPrice !== p.currentPrice);
      });
      if (holdingChanged) {
        toast.info("Holdings updated", { description: "Your portfolio values have changed" });
      }
    }

    // New transaction or dividend
    if (realTransactions.length > prevTxCount) {
      const newTx = realTransactions[0]; // most recent
      if (newTx.type === "DIVIDEND") {
        toast.success("Dividend received", {
          description: `${newTx.symbol}: ₹${newTx.total.toFixed(2)} (${newTx.quantity} shares × ₹${newTx.price.toFixed(2)})`,
        });
      } else {
        toast.success(`${newTx.type === "BUY" ? "Buy" : "Sell"} executed`, {
          description: `${newTx.quantity} × ${newTx.symbol} @ ₹${newTx.price.toFixed(2)}`,
        });
      }
    }

    // Update refs
    prevStocksRef.current = marketStocks;
    prevCashRef.current = realCash;
    prevHoldingsRef.current = realHoldings;
    prevTxCountRef.current = realTransactions.length;
    prevLeaderboardRef.current = dbLeaderboard;
  }, [marketStocks, realCash, realHoldings, realTransactions, dbLeaderboard]);

  return <SandboxContext.Provider value={value}>{children}</SandboxContext.Provider>;
};

export const useSandboxStore = () => {
  const context = useContext(SandboxContext);
  if (!context) {
    throw new Error("useSandboxStore must be used within a SandboxProvider");
  }
  return context;
};

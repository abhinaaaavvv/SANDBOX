import { RoundNumber, Transaction } from "@/types/sandbox";
import { RealtimeEventPayload, TradeResponseDto } from "@/types/realtime";
import { ROUND_DURATION_SECONDS } from "@/lib/mockData";
import { formatINR } from "@/lib/utils";
import { BroadcastSync } from "@/lib/competition/broadcast";
import {
  applyEventToState,
  buildSnapshot,
  createInitialState,
} from "@/lib/competition/state";
import {
  CompetitionSnapshot,
  MockCompetitionState,
  ViewRole,
} from "@/lib/competition/types";

let uidCounter = 0;
function uid(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${(uidCounter++).toString(36)}-${random}`;
}

export interface CashAdjustmentResult {
  ok: boolean;
  message?: string;
}

/**
 * MockCompetitionEngine
 *
 * The single source of truth for the frontend competition simulation. The UI
 * never calculates or mutates competition state directly — every operation
 * goes through these domain methods, which validate, mutate through
 * {@link applyEventToState}, notify subscribers, and broadcast the event to
 * other tabs via BroadcastChannel.
 *
 * The public surface is deliberately shaped like the future backend API
 * (see docs/AGENTS.md §29), so swapping in a real backend means replacing the
 * engine internals — not rewriting components.
 */
export class MockCompetitionEngine {
  private state: MockCompetitionState;
  private role: ViewRole = null;
  private snapshot: CompetitionSnapshot;
  private stateListeners = new Set<() => void>();
  private eventListeners = new Set<(event: RealtimeEventPayload) => void>();
  private broadcast: BroadcastSync | null = null;

  constructor() {
    this.state = createInitialState();
    this.snapshot = buildSnapshot(this.state, this.role);
    if (typeof window !== "undefined") {
      this.broadcast = new BroadcastSync((event) => this.applyRemote(event));
    }
  }

  // -------------------------------------------------------------------------
  // React store surface
  // -------------------------------------------------------------------------

  subscribe(listener: () => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  getSnapshot(): CompetitionSnapshot {
    return this.snapshot;
  }

  subscribeEvents(listener: (event: RealtimeEventPayload) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /** Which console is viewing state (controls pending-price visibility). */
  setRole(role: ViewRole) {
    if (this.role === role) return;
    this.role = role;
    this.snapshot = buildSnapshot(this.state, this.role);
    this.stateListeners.forEach((l) => l());
  }

  /**
   * Apply an event that originated outside this tab (BroadcastChannel today,
   * Supabase Realtime later). Never re-broadcast to avoid event loops.
   */
  applyRemote(event: RealtimeEventPayload) {
    if (!event || typeof event.type !== "string") return;
    applyEventToState(this.state, event);
    this.snapshot = buildSnapshot(this.state, this.role);
    this.stateListeners.forEach((l) => l());
    this.eventListeners.forEach((l) => l(event));
  }

  // -------------------------------------------------------------------------
  // Internal commit paths
  // -------------------------------------------------------------------------

  /** Commit a domain event locally, notify, and broadcast to other tabs. */
  private commit(event: RealtimeEventPayload) {
    applyEventToState(this.state, event);
    this.snapshot = buildSnapshot(this.state, this.role);
    this.stateListeners.forEach((l) => l());
    this.eventListeners.forEach((l) => l(event));
    this.broadcast?.post(event);
  }

  /** Apply a local-only mutation (admin-private data such as pending prices). */
  private mutateLocal(mutator: (state: MockCompetitionState) => void) {
    mutator(this.state);
    this.snapshot = buildSnapshot(this.state, this.role);
    this.stateListeners.forEach((l) => l());
  }

  private nowIso(): string {
    return new Date().toISOString();
  }

  // -------------------------------------------------------------------------
  // Round / market / trading controls
  // -------------------------------------------------------------------------

  async startRound(round: RoundNumber): Promise<void> {
    // State machine guard: never restart a round that is already in progress
    // (this would silently reset the timer). Other transitions (e.g. jumping
    // to a later round) remain allowed for demo flexibility.
    const inProgress =
      this.state.currentRound === round &&
      this.state.marketStatus !== "NOT_STARTED" &&
      this.state.marketStatus !== "ROUND_ENDED";
    if (inProgress) return;

    const endsAt = new Date(Date.now() + ROUND_DURATION_SECONDS[round] * 1000);
    this.commit({
      type: "ROUND_STARTED",
      timestamp: this.nowIso(),
      round,
      marketStatus: "MARKET_OPEN",
      timerEndTimestamp: endsAt.toISOString(),
    });
  }

  async endRound(round: RoundNumber): Promise<void> {
    this.commit({
      type: "ROUND_ENDED",
      timestamp: this.nowIso(),
      round,
      marketStatus: "ROUND_ENDED",
      timerEndTimestamp: this.nowIso(),
    });
  }

  async openMarket(): Promise<void> {
    this.commit({ type: "MARKET_OPENED", timestamp: this.nowIso(), marketStatus: "MARKET_OPEN" });
  }

  async closeMarket(): Promise<void> {
    this.commit({ type: "MARKET_CLOSED", timestamp: this.nowIso(), marketStatus: "MARKET_CLOSED" });
  }

  async pauseTrading(): Promise<void> {
    this.commit({ type: "TRADING_PAUSED", timestamp: this.nowIso(), marketStatus: "TRADING_PAUSED" });
  }

  async resumeTrading(): Promise<void> {
    this.commit({ type: "TRADING_RESUMED", timestamp: this.nowIso(), marketStatus: "MARKET_OPEN" });
  }

  // -------------------------------------------------------------------------
  // Pending price changes (admin-private, applied atomically)
  // -------------------------------------------------------------------------

  setPendingPriceChange(stockId: string, newPrice: number) {
    const stock = this.state.stocks.find((s) => s.id === stockId);
    if (!stock || !Number.isFinite(newPrice) || newPrice <= 0) return;
    const changeAmount = newPrice - stock.currentPrice;
    const item = {
      stockId,
      symbol: stock.symbol,
      companyName: stock.name,
      currentPrice: stock.currentPrice,
      newPrice,
      changeAmount,
      changePercent: (changeAmount / stock.currentPrice) * 100,
    };
    this.mutateLocal((state) => {
      const idx = state.pendingPriceChanges.findIndex((p) => p.stockId === stockId);
      if (idx >= 0) state.pendingPriceChanges[idx] = item;
      else state.pendingPriceChanges.push(item);
    });
  }

  clearPendingPriceChange(stockId: string) {
    this.mutateLocal((state) => {
      state.pendingPriceChanges = state.pendingPriceChanges.filter(
        (p) => p.stockId !== stockId
      );
    });
  }

  async applyPriceChanges(): Promise<void> {
    const pending = [...this.state.pendingPriceChanges];
    if (pending.length === 0) return;
    const nextStocks = this.state.stocks.map((s) => {
      const change = pending.find((p) => p.stockId === s.id);
      if (!change) return s;
      const newPrice = change.newPrice;
      return {
        ...s,
        previousPrice: s.currentPrice,
        currentPrice: newPrice,
        change: newPrice - s.currentPrice,
        changePercent: ((newPrice - s.currentPrice) / s.currentPrice) * 100,
      };
    });
    this.commit({
      type: "PRICE_CHANGES_APPLIED",
      timestamp: this.nowIso(),
      stocks: nextStocks,
    });
  }

  // -------------------------------------------------------------------------
  // Trading
  // -------------------------------------------------------------------------

  private validateTradingWindow(): TradeResponseDto | null {
    const { marketStatus, roundEndsAt } = this.state;
    if (marketStatus === "NOT_STARTED") {
      return { success: false, message: "The competition has not started yet." };
    }
    if (marketStatus === "TRADING_PAUSED") {
      return { success: false, message: "Trading is currently paused by the administrator." };
    }
    if (marketStatus === "MARKET_CLOSED") {
      return { success: false, message: "The market is currently closed." };
    }
    if (marketStatus === "ROUND_ENDED") {
      return { success: false, message: "This round has ended. Trading is closed." };
    }
    if (marketStatus !== "MARKET_OPEN") {
      return { success: false, message: "Trading is currently unavailable." };
    }
    if (roundEndsAt && Date.now() >= new Date(roundEndsAt).getTime()) {
      return { success: false, message: "This round's trading window has expired." };
    }
    return null;
  }

  async executeBuy(stockId: string, quantity: number): Promise<TradeResponseDto> {
    const windowError = this.validateTradingWindow();
    if (windowError) return windowError;
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { success: false, message: "Quantity must be a positive whole number." };
    }
    const stock = this.state.stocks.find((s) => s.id === stockId);
    if (!stock) return { success: false, message: "Stock not found." };

    const team = this.state.teams.find((t) => t.id === this.state.activeTeamId);
    if (!team) return { success: false, message: "Team not found." };

    const totalCost = Math.round(stock.currentPrice * quantity);
    if (team.cash < totalCost) {
      return {
        success: false,
        message: `Insufficient cash balance. Needs ${formatINR(totalCost)}.`,
      };
    }

    const transaction: Transaction = {
      id: uid("tx"),
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      symbol: stock.symbol,
      companyName: stock.name,
      type: "BUY",
      quantity,
      price: stock.currentPrice,
      total: totalCost,
    };

    this.commit({
      type: "TRADE_EXECUTED",
      timestamp: this.nowIso(),
      teamId: team.id,
      stockId,
      side: "BUY",
      quantity,
      executionPrice: stock.currentPrice,
      transaction,
    });
    return { success: true, message: "Success", transaction };
  }

  async executeSell(stockId: string, quantity: number): Promise<TradeResponseDto> {
    const windowError = this.validateTradingWindow();
    if (windowError) return windowError;
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { success: false, message: "Quantity must be a positive whole number." };
    }
    const stock = this.state.stocks.find((s) => s.id === stockId);
    if (!stock) return { success: false, message: "Stock not found." };

    const team = this.state.teams.find((t) => t.id === this.state.activeTeamId);
    if (!team) return { success: false, message: "Team not found." };

    const holding = team.holdings.find((h) => h.stockId === stockId);
    if (!holding || holding.quantity < quantity) {
      return { success: false, message: "Cannot sell more shares than owned." };
    }

    const totalRevenue = Math.round(stock.currentPrice * quantity);
    const transaction: Transaction = {
      id: uid("tx"),
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      symbol: stock.symbol,
      companyName: stock.name,
      type: "SELL",
      quantity,
      price: stock.currentPrice,
      total: totalRevenue,
    };

    this.commit({
      type: "TRADE_EXECUTED",
      timestamp: this.nowIso(),
      teamId: team.id,
      stockId,
      side: "SELL",
      quantity,
      executionPrice: stock.currentPrice,
      transaction,
    });
    return { success: true, message: "Success", transaction };
  }

  // -------------------------------------------------------------------------
  // Dividends — paid to EVERY team holding the stock
  // -------------------------------------------------------------------------

  async payDividend(stockId: string, amountPerShare: number): Promise<void> {
    const stock = this.state.stocks.find((s) => s.id === stockId);
    if (!stock || !Number.isFinite(amountPerShare) || amountPerShare <= 0) return;

    const payments = this.state.teams
      .map((team) => {
        const holding = team.holdings.find((h) => h.stockId === stockId);
        const quantity = holding ? holding.quantity : 0;
        if (quantity <= 0) return null;
        const payout = quantity * amountPerShare;
        return {
          teamId: team.id,
          quantity,
          payout,
          transaction: {
            id: uid("tx"),
            timestamp: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
            symbol: stock.symbol,
            companyName: stock.name,
            type: "DIVIDEND" as const,
            quantity,
            price: amountPerShare,
            total: payout,
          },
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    if (payments.length === 0) return;

    this.commit({
      type: "DIVIDENDS_PAID",
      timestamp: this.nowIso(),
      stockId,
      amountPerShare,
      payments,
    });
  }

  // -------------------------------------------------------------------------
  // Admin cash adjustments
  // -------------------------------------------------------------------------

  creditCash(teamId: string, amount: number, reason?: string): CashAdjustmentResult {
    return this.adjustCash(teamId, amount, reason);
  }

  debitCash(teamId: string, amount: number, reason?: string): CashAdjustmentResult {
    return this.adjustCash(teamId, -amount, reason);
  }

  private adjustCash(teamId: string, signedAmount: number, reason?: string): CashAdjustmentResult {
    if (!Number.isFinite(signedAmount) || signedAmount === 0) {
      return { ok: false, message: "Enter an amount greater than zero." };
    }
    const team = this.state.teams.find((t) => t.id === teamId);
    if (!team) return { ok: false, message: "Team not found." };

    const nextCash = Math.round(team.cash + signedAmount);
    if (nextCash < 0) {
      return { ok: false, message: "Debit exceeds the team's available cash." };
    }

    this.commit({
      type: "CASH_UPDATED",
      timestamp: this.nowIso(),
      teamId,
      cash: nextCash,
      reason,
    });
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // Competition
  // -------------------------------------------------------------------------

  async resetCompetition(): Promise<void> {
    this.commit({ type: "COMPETITION_RESET", timestamp: this.nowIso() });
  }
}

// Module-level singleton: one engine per tab (browser context). BroadcastSync
// keeps every open tab's engine converged.
let singleton: MockCompetitionEngine | null = null;
export function getMockEngine(): MockCompetitionEngine {
  if (!singleton) singleton = new MockCompetitionEngine();
  return singleton;
}

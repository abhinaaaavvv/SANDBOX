import { Holding, LeaderboardEntry, Stock } from "@/types/sandbox";
import { RealtimeEventPayload } from "@/types/realtime";
import {
  DEFAULT_TEAM_ID,
  INITIAL_CASH,
  INITIAL_STOCKS,
  INITIAL_TEAMS,
} from "@/lib/mockData";
import {
  CompetitionSnapshot,
  MockCompetitionState,
  TeamOverview,
  TeamState,
  ViewRole,
} from "@/lib/competition/types";

/** Build the engine's opening state. Deterministic so every tab starts in sync. */
export function createInitialState(): MockCompetitionState {
  return {
    currentRound: 1,
    marketStatus: "NOT_STARTED",
    roundStartedAt: null,
    roundEndsAt: null,
    stocks: INITIAL_STOCKS.map((s) => ({ ...s })),
    pendingPriceChanges: [],
    teams: INITIAL_TEAMS.map((seed) => ({
      id: seed.id,
      name: seed.name,
      cash: seed.cash,
      holdings: seed.holdings.map((h) => ({ ...h })),
      transactions: seed.transactions ? seed.transactions.map((t) => ({ ...t })) : [],
      dividendsReceived: 0,
    })),
    activeTeamId: DEFAULT_TEAM_ID,
  };
}

// ---------------------------------------------------------------------------
// Event application — the ONLY place competition state mutates.
// ---------------------------------------------------------------------------

export function applyEventToState(state: MockCompetitionState, event: RealtimeEventPayload) {
  switch (event.type) {
    case "ROUND_STARTED": {
      state.currentRound = event.round ?? 1;
      state.marketStatus = "MARKET_OPEN";
      state.roundStartedAt = event.timestamp;
      state.roundEndsAt = event.timerEndTimestamp ?? null;
      break;
    }
    case "ROUND_ENDED": {
      state.marketStatus = "ROUND_ENDED";
      // Snap the end time to "now" so the timer reads 00:00.
      state.roundEndsAt = event.timerEndTimestamp ?? event.timestamp;
      break;
    }
    case "MARKET_OPENED":
      state.marketStatus = "MARKET_OPEN";
      break;
    case "MARKET_CLOSED":
      state.marketStatus = "MARKET_CLOSED";
      break;
    case "TRADING_PAUSED":
      state.marketStatus = "TRADING_PAUSED";
      break;
    case "TRADING_RESUMED":
      state.marketStatus = "MARKET_OPEN";
      break;
    case "PRICE_CHANGES_APPLIED":
      if (event.stocks) state.stocks = event.stocks;
      state.pendingPriceChanges = [];
      break;
    case "TRADE_EXECUTED":
      applyTrade(state, event);
      break;
    case "DIVIDENDS_PAID":
      applyDividends(state, event);
      break;
    case "CASH_UPDATED":
      if (event.teamId && typeof event.cash === "number") {
        const team = state.teams.find((t) => t.id === event.teamId);
        if (team) team.cash = event.cash;
      }
      break;
    case "COMPETITION_RESET": {
      const fresh = createInitialState();
      state.currentRound = fresh.currentRound;
      state.marketStatus = fresh.marketStatus;
      state.roundStartedAt = fresh.roundStartedAt;
      state.roundEndsAt = fresh.roundEndsAt;
      state.stocks = fresh.stocks;
      state.pendingPriceChanges = fresh.pendingPriceChanges;
      state.teams = fresh.teams;
      break;
    }
    default:
      break; // informational events (HOLDINGS_UPDATED, LEADERBOARD_UPDATED, ...) mutate nothing
  }
}

function applyTrade(state: MockCompetitionState, event: RealtimeEventPayload) {
  const team = state.teams.find((t) => t.id === event.teamId);
  if (!team || !event.stockId || !event.quantity || !event.executionPrice) return;

  const holding = team.holdings.find((h) => h.stockId === event.stockId);
  const quantity = event.quantity;

  if (event.side === "BUY") {
    const totalCost = Math.round(event.executionPrice * quantity);
    // Clamp at zero: concurrent buys from multiple tabs of the same team could
    // both pass the local cash check; the real backend owns concurrency later.
    team.cash = Math.max(0, team.cash - totalCost);
    if (holding) {
      const newQty = holding.quantity + quantity;
      const newAvg =
        (holding.quantity * holding.averageBuyPrice + totalCost) / newQty;
      holding.quantity = newQty;
      holding.averageBuyPrice = Math.round(newAvg * 100) / 100;
    } else {
      team.holdings.push({
        stockId: event.stockId,
        quantity,
        averageBuyPrice: event.executionPrice,
      });
    }
  } else {
    const revenue = Math.round(event.executionPrice * quantity);
    team.cash += revenue;
    if (holding) {
      holding.quantity -= quantity;
      if (holding.quantity <= 0) {
        team.holdings = team.holdings.filter((h) => h.stockId !== event.stockId);
      }
    }
  }

  if (event.transaction) team.transactions.unshift(event.transaction);
}

function applyDividends(state: MockCompetitionState, event: RealtimeEventPayload) {
  for (const payment of event.payments ?? []) {
    const team = state.teams.find((t) => t.id === payment.teamId);
    if (!team) continue;
    team.cash += payment.payout;
    team.dividendsReceived += payment.payout;
    team.transactions.unshift(payment.transaction);
  }
}

// ---------------------------------------------------------------------------
// Derived read models
// ---------------------------------------------------------------------------

function currentPriceOf(stockId: string, stocks: Stock[], fallback: number): number {
  return stocks.find((s) => s.id === stockId)?.currentPrice ?? fallback;
}

function teamPortfolioValue(team: TeamState, stocks: Stock[]): number {
  const holdingsValue = team.holdings.reduce(
    (sum, h) => sum + h.quantity * currentPriceOf(h.stockId, stocks, h.averageBuyPrice),
    0
  );
  return team.cash + holdingsValue;
}

export function buildHoldings(team: TeamState, stocks: Stock[]): Holding[] {
  return team.holdings.map((h) => {
    const stock = stocks.find((s) => s.id === h.stockId);
    const currentPrice = currentPriceOf(h.stockId, stocks, h.averageBuyPrice);
    const totalValue = h.quantity * currentPrice;
    const unrealizedPL = totalValue - h.quantity * h.averageBuyPrice;
    const unrealizedPLPercent =
      h.quantity > 0 && h.averageBuyPrice > 0
        ? (unrealizedPL / (h.quantity * h.averageBuyPrice)) * 100
        : 0;
    return {
      stockId: h.stockId,
      symbol: stock?.symbol ?? h.stockId,
      name: stock?.name ?? h.stockId,
      quantity: h.quantity,
      averageBuyPrice: h.averageBuyPrice,
      currentPrice,
      totalValue,
      unrealizedPL,
      unrealizedPLPercent,
    };
  });
}

function buildLeaderboard(
  state: MockCompetitionState,
  markTeamId: string | null
): LeaderboardEntry[] {
  const entries = state.teams.map((team) => {
    const portfolioValue = teamPortfolioValue(team, state.stocks);
    const profitLoss = portfolioValue - INITIAL_CASH;
    return {
      rank: 0,
      teamId: team.id,
      teamName: team.name,
      portfolioValue,
      profitLoss,
      profitLossPercent: (profitLoss / INITIAL_CASH) * 100,
      isCurrentTeam: markTeamId != null && team.id === markTeamId,
    };
  });
  entries.sort(
    (a, b) =>
      b.portfolioValue - a.portfolioValue || a.teamId.localeCompare(b.teamId)
  );
  return entries.map((entry, idx) => ({ ...entry, rank: idx + 1 }));
}

function buildTeamOverviews(state: MockCompetitionState): TeamOverview[] {
  return state.teams.map((team) => {
    const portfolioValue = teamPortfolioValue(team, state.stocks);
    return {
      id: team.id,
      name: team.name,
      cash: team.cash,
      portfolioValue,
      profitLoss: portfolioValue - INITIAL_CASH,
      holdingsCount: team.holdings.length,
      dividendsReceived: team.dividendsReceived,
    };
  });
}

export function buildSnapshot(
  state: MockCompetitionState,
  role: ViewRole
): CompetitionSnapshot {
  const isAdminView = role === "admin";
  const active = state.teams.find((t) => t.id === state.activeTeamId) ?? state.teams[0];

  const holdings = buildHoldings(active, state.stocks);
  const holdingsValue = holdings.reduce((sum, h) => sum + h.totalValue, 0);
  const totalPortfolioValue = active.cash + holdingsValue;
  const totalProfitLoss = totalPortfolioValue - INITIAL_CASH;

  return {
    currentRound: state.currentRound,
    marketStatus: state.marketStatus,
    roundStartedAt: state.roundStartedAt,
    roundEndsAt: state.roundEndsAt,
    stocks: state.stocks,
    // Pending prices are strictly admin-private — participants never see them.
    pendingPriceChanges: isAdminView ? state.pendingPriceChanges : [],
    activeTeamId: active.id,
    teamName: active.name,
    cash: active.cash,
    holdings,
    transactions: active.transactions,
    totalPortfolioValue,
    totalProfitLoss,
    totalProfitLossPercent: (totalProfitLoss / INITIAL_CASH) * 100,
    leaderboard: buildLeaderboard(state, isAdminView ? null : state.activeTeamId),
    teams: buildTeamOverviews(state),
  };
}

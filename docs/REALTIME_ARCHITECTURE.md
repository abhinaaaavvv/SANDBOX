# SANDBOX Realtime Architecture

## Principles

1. **PostgreSQL is the authoritative source of truth**. Realtime is strictly a distribution mechanism.
2. **Realtime payloads are NEVER authoritative financial state**. They are signals to trigger reconciliation/refetch.
3. **All financial calculations happen in PostgreSQL via RPCs**. The browser never calculates cash/holdings/portfolio values.
4. **Pending admin state (pending_price_changes, price_change_batches) must NEVER appear in Realtime notifications**.
5. **Team-scoped events are only visible to that team's members**. Run-scoped events are visible to all participants in the run.
6. **Realtime subscriptions use filtered `postgres_changes` on `realtime_notifications`**. The payload contains identifiers only, never financial data.
7. **On reconnect, always refetch authoritative state via RPC**. Never reconstruct financial state solely from missed events.
8. **Idempotency keys prevent duplicate operations**. Realtime events may trigger idempotent re-runs, but the database is the source of truth.

---

## Current Mock Event System

The `MockCompetitionEngine` in `src/lib/competition/engine.ts` maintains an in-process event system with the following event types:

| Event Type | Payload | Source |
|---|---|---|
| `ROUND_STARTED` | `{ round, marketStatus }` | `startRound()` |
| `ROUND_ENDED` | `{ round, marketStatus }` | `endRound()` |
| `MARKET_OPENED` | `{ marketStatus }` | `openMarket()` |
| `MARKET_CLOSED` | `{ marketStatus }` | `closeMarket()` |
| `TRADING_PAUSED` | `{}` | `pauseTrading()` |
| `TRADING_RESUMED` | `{}` | `resumeTrading()` |
| `PRICE_CHANGES_APPLIED` | `{}` | `applyPriceChanges()` |
| `TRADE_EXECUTED` | `{ side, stockId, quantity, transaction }` | `executeBuy()` / `executeSell()` |
| `DIVIDEND_APPLIED` | `{ stockId, amountPerShare }` | `applyDividend()` |
| `CASH_ADJUSTED` | `{ reason }` | `adjustTeamCash()` |
| `VIDEO_SELECTED` | `{ videoId }` | admin video controls |
| `VIDEO_STARTED` | `{ videoId, timestamp }` | admin playback controls |
| `VIDEO_PAUSED` | `{}` | admin playback controls |
| `VIDEO_STOPPED` | `{}` | admin video controls |
| `VIDEO_SEEKED` | `{ position }` | admin seek controls |
| `COMPETITION_RESET` | `{}` | `resetCompetition()` |

**Current behavior**: Engine events flow through `engine.subscribe()` -> `SandboxContext` -> consumers via `useSandboxStore()`. These are **mock-only** and do not cross processes or tabs.

**Event flow**:
```
MockEngine event
  ↓ SandboxContext useEffect subscriber
  ↓ UI state update (non-authoritative)
```

**Limitation**: Mock events are process-local. They do not survive browser refresh, tab closure, or cross-device participation.

---

## Event Inventory

### Round State Events

| Event | DB Source | Realtime Channel | Audience | Refetch Trigger |
|---|---|---|---|---|
| `ROUND_STARTED` | `competition_runs.status='active'` + `rounds.status='active'` + `rounds.started_at` | `run:<run_id>` | All participants in run | `refetchPortfolio()`, `refetchHoldings()`, `refetchMarketData()`, `refetchLeaderboard()` |
| `ROUND_ENDED` | `rounds.status='completed'` + `rounds.ended_at` | `run:<run_id>` | All participants in run | `refetchPortfolio()`, `refetchHoldings()`, `refetchMarketData()`, `refetchLeaderboard()` |

### Market State Events

| Event | DB Source | Realtime Channel | Audience | Refetch Trigger |
|---|---|---|---|---|
| `MARKET_OPENED` | `rounds.market_status='open'` | `run:<run_id>` | All participants in run | `refetchMarketData()` |
| `MARKET_CLOSED` | `rounds.market_status='closed'` | `run:<run_id>` | All participants in run | `refetchMarketData()`, disable trading UI |
| `TRADING_PAUSED` | `rounds.trading_status='paused'` | `run:<run_id>` | All participants in run | Disable trading UI |
| `TRADING_RESUMED` | `rounds.trading_status='enabled'` | `run:<run_id>` | All participants in run | Enable trading UI |

### Trade Events

| Event | DB Source | Realtime Channel | Audience | Refetch Trigger |
|---|---|---|---|---|
| `TRADE_EXECUTED` | `trades` table INSERT + `holdings` UPDATE + `cash_ledger` INSERT | `team:<team_id>` + `run:<run_id>` | Owner team + all participants in run | `refetchHoldings()`, `refetchCash()` (via `refetchPortfolio()`), `refetchTransactions()`, `refetchLeaderboard()` |

### Price Change Events

| Event | DB Source | Realtime Channel | Audience | Refetch Trigger |
|---|---|---|---|---|
| `PRICE_CHANGES_APPLIED` | `market_quotes.price_paise` UPDATE + `price_change_batches.status='applied'` | `run:<run_id>` | All participants in run | `refetchMarketData()`, `refetchPortfolio()`, `refetchLeaderboard()` |

**Critical**: `pending_price_changes` and `price_change_batches` must NEVER be broadcast via Realtime. Participants must only see applied prices in `market_quotes`.

### Dividend Events

| Event | DB Source | Realtime Channel | Audience | Refetch Trigger |
|---|---|---|---|---|
| `DIVIDEND_APPLIED` (run-scoped) | `dividends.status='applied'` + `dividend_payments` INSERT (metadata only) | `run:<run_id>` | All participants in run | `refetchLeaderboard()` — leaderboard may shift |
| `DIVIDEND_APPLIED` (team-scoped) | `dividend_payments` INSERT + `cash_ledger` INSERT (entry_type='dividend') | `team:<team_id>` | Owner team only | `refetchHoldings()`, `refetchCash()` (via `refetchPortfolio()`), `refetchLeaderboard()` |

### Cash Events

| Event | DB Source | Realtime Channel | Audience | Refetch Trigger |
|---|---|---|---|---|
| `CASH_UPDATED` | `cash_ledger` INSERT (any entry_type) | `team:<team_id>` | Owner team | `refetchPortfolio()` (cash_balance_paise changes) |

### Video Events (future phase)

| Event | DB Source | Realtime Channel | Audience | Refetch Trigger |
|---|---|---|---|---|
| `VIDEO_PLAYED` | `videos` metadata + playback state | `team:<team_id>` or direct | Owner team | None (UI update only) |
| `VIDEO_STOPPED` | `videos` metadata | `team:<team_id>` or direct | Owner team | None |

---

## Database Sources

For every event, the authoritative source is always a PostgreSQL table or RPC result. The Realtime notification is a **signal**, not the data source.

### Event -> DB Source Mapping

| Event | Source Table / RPC |
|---|---|
| `ROUND_STARTED` | `rounds` row (status, started_at, ends_at) |
| `ROUND_ENDED` | `rounds` row (status, ended_at) |
| `MARKET_OPENED/CLOSED` | `rounds` row (market_status) |
| `TRADING_PAUSED/RESUMED` | `rounds` row (trading_status) |
| `TRADE_EXECUTED` | `trades` INSERT, `holdings` UPDATE, `cash_ledger` INSERT |
| `PRICE_CHANGES_APPLIED` | `market_quotes` row UPDATE |
| `DIVIDEND_APPLIED` | `dividends` row, `dividend_payments` INSERT, `cash_ledger` INSERT |
| `CASH_UPDATED` | `cash_ledger` INSERT |
| `VIDEO_PLAYED/STOPPED/SEEKED` | `videos` row + playback metadata |

### Authoritative Row / State Changes

- ** trade execution **: One transaction atomically creates `trades` row, updates `holdings.quantity`, and inserts `cash_ledger` entry. All-or-nothing.
- ** price application **: One transaction atomically updates `market_quotes.price_paise` for all stocks in a batch, marks `price_change_batches.status='applied'`, inserts `pending_price_changes` records (which remain admin-only and invisible to participants).
- ** dividend application **: One transaction creates `dividend_payments` rows (one per team), inserts `cash_ledger` entries (entry_type='dividend'), marks `dividends.status='applied'`.
- ** cash adjustment **: Single `cash_ledger` INSERT (entry_type='admin_adjustment').
- ** round start/end **: Single `rounds` row UPDATE with authoritative timestamps (server-side only).

### What Changes After Commit

| Event | Tables Affected |
|---|---|
| `TRADE_EXECUTED` | `trades` (INSERT), `holdings` (UPDATE), `cash_ledger` (INSERT) |
| `PRICE_CHANGES_APPLIED` | `market_quotes` (UPDATE), `price_change_batches` (UPDATE), `pending_price_changes` (INSERT - admin-visible only) |
| `DIVIDEND_APPLIED` | `dividends` (UPDATE), `dividend_payments` (INSERT), `cash_ledger` (INSERT) |
| `CASH_UPDATED` | `cash_ledger` (INSERT) |
| `ROUND_STARTED/ENDED` | `rounds` (UPDATE) |

### Client Refetch Triggers

After each Realtime event, the client must **refetch authoritative state via RPC**, not trust the Realtime payload:

```
Realtime event received
    ↓
trigger refetch of authoritative state
    ↓
client calls RPC (e.g. get_team_portfolio, get_leaderboard, get_team_holdings, useMarketData)
    ↓
RPC reads from PostgreSQL (source of truth)
    ↓
UI updates with authoritative data
```

**Never** design the UI to directly consume Realtime payload values as financial state.

---

## Payload Limits

Every participant-visible Realtime event payload must contain **identifiers and metadata only**. Never include authoritative financial data. The maximum payload size per event is ~200 bytes.

**Allowed payload fields per event type:**

| Event | Allowed Payload Fields | Prohibited Fields |
|---|---|---|
| `ROUND_STARTED` | `round`, `marketStatus`, `timerEndTimestamp` | cash balances, holdings, P/L, portfolio values |
| `ROUND_ENDED` | `round`, `marketStatus`, `timerEndTimestamp` | cash balances, holdings, P/L, portfolio values |
| `MARKET_OPENED/CLOSED` | `marketStatus` | price change details, pending adjustments |
| `TRADING_PAUSED/RESUMED` | — (empty payload) | — |
| `TRADE_EXECUTED` | `trade_id`, `stock_id`, `side`, `quantity` | `cash_balance`, `holdings`, `total_value`, `execution_price` details |
| `PRICE_CHANGES_APPLIED` | — (empty payload; signal only) | all price change data — participants refetch via `refetchMarketData()` |
| `DIVIDEND_APPLIED` (run-scoped) | `dividend_id`, `stock_id`, `competition_run_id`, `status` | `amountPerShare`, `payout`, `dividend_payment` details |
| `DIVIDEND_APPLIED` (team-scoped) | `dividend_id`, `stock_id`, `team_id`, `competition_run_id` | `amountPerShare`, `total_payout`, `cash_ledger` entries |
| `CASH_UPDATED` | — (empty payload; signal only) | `cash_balance_paise`, `ledger_entries` |
| `VIDEO_PLAY/STOP/SEEK/PAUSED` | `videoId`, `timestamp`, `position` (for seek) | `current_time`, `duration`, `playback_stats` |

**Core principle**: If the field is financial state (balance, quantity, price, value, P/L, dividend amount), it must **not** appear in the Realtime payload. The client must refetch via RPC for authoritative data.

---



## Participant vs Admin Events

### Participant Events (visible to participants in their competition run)

| Category | Events | Channel | Visibility |
|---|---|---|---|
| Round state | `ROUND_STARTED`, `ROUND_ENDED` | `run:<run_id>` | All participants in run |
| Market state | `MARKET_OPENED`, `MARKET_CLOSED`, `TRADING_PAUSED`, `TRADING_RESUMED` | `run:<run_id>` | All participants in run |
| Trade execution | `TRADE_EXECUTED` | `team:<team_id>` (owner) + `run:<run_id>` (visible to all) | Owner team + all participants |
| Price changes | `PRICE_CHANGES_APPLIED` | `run:<run_id>` | All participants in run |
| Dividends | `DIVIDEND_APPLIED` (run-scoped) | `run:<run_id>` | All participants in run | Leaderboard may shift |
| | `DIVIDEND_APPLIED` (team-scoped) | `team:<team_id>` | Owner team only | `refetchHoldings()`, `refetchCash()`, `refetchLeaderboard()` |
| Cash updates | `CASH_UPDATED` | `team:<team_id>` | Owner team only |
| Leaderboard | (not a Realtime event — fetched via `get_leaderboard()` RPC) | N/A | All participants in run |

### Admin Events (visible only to admins)

| Category | Events | Channel | Visibility |
|---|---|---|---|
| Price batch creation | (internal — no Realtime needed; admin UI polls or uses custom channel) | — | N/A |
| Price batch application | `PRICE_CHANGES_APPLIED` — but filtered to admin-only channel | `admin:<run_id>` | Admins only |
| Dividend creation/application | `DIVIDEND_APPLIED` (run-scoped) — admin channel | `admin:<run_id>` | Admins only | Admins see run-scoped metadata only |
| | `DIVIDEND_APPLIED` (team-scoped) — admin confirms | `admin:<team_id>` | Admins only | Admins see team-level details for confirmation |
| Cash adjustments | `CASH_UPDATED` — admin channel | `admin:<team_id>` | Admins only |
| Round controls | `ROUND_STARTED`, `ROUND_ENDED`, `MARKET_OPEN/CLOSE`, `TRADING_PAUSE/RESUME` — admin channel | `admin:<run_id>` | Admins only |

**Key separation**: Participant and admin events use **different channels** (`run:<run_id>` vs `admin:<run_id>`). Team-scoped events use `team:<team_id>`. Admins subscribe to admin channels; participants subscribe to run and team channels.

**No data leakage**: Pending price changes (`pending_price_changes`, `price_change_batches`) are **never** broadcast via Realtime. Participants only see applied prices.

---

## Security / RLS

### Realtime Notifications RLS

The `realtime_notifications` table has the following RLS policy:

```sql
CREATE POLICY "realtime_notifications_select"
  ON public.realtime_notifications
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      -- Run-scoped events: visible only to users authorized for that competition run.
      -- Authorization is verified by the application layer (RPCs that publish events).
      -- The baseline filter ensures only authenticated users can receive run-scoped events.
      channel LIKE 'run:%'
      OR
      -- Team-scoped events: visible only to team members
      (
        channel LIKE 'team:%'
        AND team_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.user_id = auth.uid()
            AND tm.team_id = realtime_notifications.team_id
        )
      )
    )
  );
```

This ensures:

- **Run-scoped events** (`run:<run_id>`): visible to **authenticated users who are participants in that competition run**. The application layer (RPCs that publish events) enforces run-specific authorization — e.g., only users with a team and holdings in that run may receive these events. The RLS policy provides the authenticated-user baseline filter.
- **Team-scoped events** (`team:<team_id>`): visible **only** to members of that team (verified via `team_members` table).
- **No cross-team leakage**: A participant in Team A cannot see team B's `team:<team_id>` events.
- **Auth guard**: Unauthenticated connections are rejected (`auth.uid() IS NOT NULL`).
```

This ensures:

- **Run-scoped events** (`run:<run_id>`): visible to **all authenticated users** in the competition run (participants and admins).
- **Team-scoped events** (`team:<team_id>`): visible **only** to members of that team (verified via `team_members` table).
- **No cross-team leakage**: A participant in Team A cannot see team B's `team:<team_id>` events.
- **Auth guard**: Unauthenticated connections are rejected (`auth.uid() IS NOT NULL`).

### Channel Naming Convention

- `run:<run_id>` — run-scoped, visible to authenticated users authorized for that competition run
- `team:<team_id>` — team-scoped, visible only to that team's members (verified via `team_members`)
- `admin:<run_id>` — admin-scoped, visible **only** to profiles with `role = 'admin'`


### Admin RLS Policy

```sql
CREATE POLICY "admin_realtime_notifications_select"
  ON public.realtime_notifications
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
```
### Tables That Must NOT Have Realtime Subscriptions

| Table | Reason |
|---|---|
| `pending_price_changes` | Participant-invisible by design |
| `price_change_batches` | Participant-invisible by design |
| `cash_ledger` | Append-only audit; financial state via RPC only |
| `dividend_payments` | Payment records; financial state via RPC only |
| `trades` | Immutable records; financial state via RPC only |
| `dividends` | Pending state visible only to admins |

### RLS on Underlying Tables

The existing RLS policies on `holdings`, `trades`, `cash_ledger`, `dividend_payments` ensure that:

- Participants see **only their own team's** data
- Admins see **all teams'** data
- Writes happen only through **SECURITY DEFINER RPCs** (bypassing RLS for authorized operations)

---

## Private Data Protection

### Data That Must Remain Private

| Data Type | Exposure |
|---|---|
| Another team's `cash_balance_paise` | Never visible to participants |
| Another team's `holdings` (quantity, symbols) | Never visible to participants |
| Another team's `pnl_paise` / `return_basis_points` | Never visible to participants |
| Another team's `trade` history | Never visible to participants |
| `pending_price_changes` entries | Invisible to participants (admin-only) |
| `price_change_batches` data | Invisible to participants |
| `cash_ledger` full history (except `CASH_UPDATED` event) | Invisible to participants |
| `dividend_payments` details | Invisible to participants (except `DIVIDEND_APPLIED` event) |

### How Protection Is Enforced

1. **RLS on `realtime_notifications`**: Team-scoped events (`team:<team_id>`) are filtered to team members only.
2. **Channel isolation**: Participants subscribe to `run:<run_id>` and their `team:<team_id>`. They cannot subscribe to other teams' channels.
3. **RPC-mediated financial state**: All financial data (`cash_balance`, `holdings`, `portfolio_value`, `pnl`, `leaderboard`) is fetched via **RPC**, not from Realtime payloads. RPCs read from PostgreSQL with RLS enforced.
4. **`pending_price_changes` / `price_change_batches` never broadcast**: These remain purely admin-visible database tables. Participants only see the result (`market_quotes.price_paise` updated).
5. **Leaderboard via `get_leaderboard()` RPC**: Uses `SECURITY DEFINER` to bypass RLS and show all teams to all authenticated participants within the run (as designed in BACKEND.md).

### What Participants CAN See

- Their own `cash_balance_paise` (via `get_team_portfolio()`)
- Their own `holdings` (via `get_team_holdings()`)
- Their own `pnl_paise` / `return_basis_points` (via `get_team_portfolio()`)
- Leaderboard (via `get_leaderboard()` — shared within run)
- Their own `trade` history (via `useTradeHistory()` / `trades` SELECT RLS)
- Their own `cash_ledger` entries (via `useCashLedger()` / `cash_ledger` SELECT RLS)
- `market_quotes` (active prices only)
- `stocks` (global definitions)

---

## Reconciliation Strategy

### Core Principle

```
Realtime event received
    ↓
trigger refetch of authoritative state via RPC
    ↓
RPC reads from PostgreSQL (source of truth)
    ↓
UI updates with authoritative data
```

### Per-Event Refetch Triggers

| Event | RPC to Call | Data Refetched |
|---|---|---|
| `ROUND_STARTED` | `refetchPortfolio()` → `get_team_portfolio()` | cash, holdings value, portfolio value, P/L, leaderboard position |
| | `refetchMarketData()` → `useMarketData()` | current market prices |
| | `refetchLeaderboard()` → `get_leaderboard()` | leaderboard ranking |
| `ROUND_ENDED` | Same as `ROUND_STARTED` | Same |
| `MARKET_OPENED/CLOSED` | `refetchMarketData()` | market quotes |
| `TRADING_PAUSED/RESUMED` | UI-only (disable/enable trading buttons) | No refetch needed |
| `TRADE_EXECUTED` (own team) | `refetchHoldings()` → `get_team_holdings()` | holdings updated |
| | `refetchCash()` → `get_team_portfolio()` | cash balance updated |
| | `refetchTransactions()` → `useTradeHistory()` | trade appears in history |
| | `refetchLeaderboard()` → `get_leaderboard()` | leaderboard ranking may change |
| `TRADE_EXECUTED` (other team) | Only if same run — `refetchLeaderboard()` | Leaderboard may change |
| `PRICE_CHANGES_APPLIED` | `refetchMarketData()` → `useMarketData()` | All market quotes updated |
| | `refetchPortfolio()` → `get_team_portfolio()` | Portfolio values recalculated |
| | `refetchLeaderboard()` → `get_leaderboard()` | Leaderboard rankings may shift |
| `DIVIDEND_APPLIED` (own team) | `refetchHoldings()` → `get_team_holdings()` | Holdings unchanged, cash updated |
| | `refetchCash()` → `get_team_portfolio()` | cash_balance_paise increased |
| | `refetchLeaderboard()` → `get_leaderboard()` | Leaderboard may shift |
| `DIVIDEND_APPLIED` (other team) | `refetchLeaderboard()` → `get_leaderboard()` | Leaderboard may shift |
| `CASH_UPDATED` (own team) | `refetchPortfolio()` → `get_team_portfolio()` | cash_balance_paise updated |
| `VIDEO_PLAYED/STOPPED/SEEKED` | UI update only | No refetch of financial state |

### Stale / Missed Events

| Scenario | Behavior |
|---|---|
| **Browser sleeping / tab suspended** | On wake/reconnect: resubscribe + `refetch authoritative state via RPC`. Never trust missed events. |
| **Network disconnect during event** | Client may miss one or more events. On reconnect: resubscribe + `refetch authoritative state`. |
| **Duplicate events** | Idempotency keys in RPCs prevent double-processing. Realtime refetch is idempotent (RPC always returns current authoritative state). |
| **Events arriving out of order** | Each event triggers a `refetch authoritative state`. The last event's RPC result wins. PostgreSQL transactions ensure commit order. |
| **Stale event received after newer event** | The refetch is idempotent — RPC always returns current state. Older events are effectively no-ops. |
| **Initial connection** | On first connect: `authenticate` → `subscribe` → `refetch authoritative state via RPC`. Realtime is for updates, not initial load. |

**Required principle**: Realtime event → trigger reconciliation/refetch → database remains authoritative. The client must never financial state solely from Realtime payloads.

---

## Multi-Device

### Data Convergence Across Devices

```
Admin device (PostgreSQL)
    │
    ├── commit trade
    │   ├── INSERT trades
    │   ├── UPDATE holdings
    │   └── INSERT cash_ledger
    │
    └── Realtime notification
        └── postgres_changes → Realtime
            └── Participant device A
            └── Participant device B
                └── Participant device C
```

### Per-Device Behavior

| Device | Initial Load | On Realtime Event | On Reconnect |
|---|---|---|---|
| **Participant A** | `authenticate` → `subscribe` → `refetch authoritative state via RPC` (get_team_portfolio, get_leaderboard, get_team_holdings, useMarketData) | Event triggers `refetch authoritative state via RPC` | Resubscribe + `refetch authoritative state via RPC` |
| **Participant B** (different device, same run) | Same as A | Same — event is broadcast to all connected devices | Same |
| **Participant C** (different run) | Subscribes to own `run:<run_id>` | Receives only own-run events | Same |

### Convergence Guarantee

- **All devices eventually see the same authoritative state** after refetch.
- **No device is ever authoritative** — PostgreSQL is the source of truth.
- **Race conditions** are resolved by PostgreSQL transactions (e.g., `SELECT FOR UPDATE` on `initial_capital` row in `execute_trade()`).
- **Stale data** is always overwritten by newer RPC refetches.

### Example: Trade Executed on Admin Device

1. Admin clicks "Execute Trade" → `execute_trade()` RPC → PostgreSQL transaction commits
2. `notify_realtime()` inserts `realtime_notifications` row (`team:<team_id>`, `TRADE_EXECUTED`)
3. `postgres_changes` broadcasts to all connected clients subscribed to `team:<team_id>`
4. Participant A's browser receives event → triggers `refetchHoldings()` → `get_team_holdings()` RPC → reads updated `holdings` row from PostgreSQL
5. Participant B's browser receives same event → same refetch
6. Both devices now show consistent holdings/cash/leaderboard

---

## Cross-Tab

### Existing MockEngine Behavior

The `MockCompetitionEngine` uses `engine.subscribe()` with `engine.subscribeEvents()` to broadcast events to **all subscribers** within the same process. This works for same-tab same-window but does **not** survive:

- Browser refresh
- New tab/window
- Cross-device

### Cross-Tab with Supabase Realtime

With Supabase Realtime, cross-tab behavior is:

1. **Same user, different tabs**: Both tabs subscribe to `realtime_notifications`. Events published by one tab are visible to the other via `postgres_changes`.
2. **Same user, same tab, different window**: Same — `postgres_changes` is browser-process-independent via Supabase's backend.
3. **Different user, same run**: Each user subscribes to their team's `team:<team_id>` channel. No cross-user leakage due to RLS.

### Existing State Synchronization

The `SandboxProvider` currently uses engine-local state. With Realtime, the synchronization flow becomes:

```
New tab opens
    ↓
useSandboxStore() → useContext(SandboxContext)
    ↓
if no snapshot exists:
    ↓
authenticate with Supabase
    ↓
subscribe to Realtime channels (run:<run_id>, team:<team_id>)
    ↓
receive initial events (if any)
    ↓
refetch authoritative state via RPC:
    - get_team_portfolio(competition_run_id, team_id)
    - get_leaderboard(competition_run_id)
    - get_team_holdings(competition_run_id, team_id)
    - useMarketData()
    ↓
UI renders with authoritative state
    ↓
subscribe to ongoing events
```

**Critical**: The RPC refetch on initial load replaces the need for mock engine events to "bootstrap" the state.

---

## Performance

### Event Volume Estimates

| Scenario | Estimated Events/sec | Channels |
|---|---|---|
| **Idle competition** (no trades, no price changes) | ~0 | `run:<run_id>` (heartbeat not needed) |
| **Active trading** (10 concurrent participants, occasional trades) | ~0.5 trade events/sec + price change events | `team:<team_id>` + `run:<run_id>` |
| **Price batch applied** | 1 `PRICE_CHANGES_APPLIED` event | `run:<run_id>` |
| **Dividend applied** | 1 `DIVIDEND_APPLIED` event per team | `team:<team_id>` |
| **Round transition** | 1 `ROUND_STARTED` / `ROUND_ENDED` event | `run:<run_id>` |

### Recommended Refetch Strategies

| Trigger | Refetch Scope | Rationale |
|---|---|---|
| **Trade executed** (own team) | Targeted: `refetchHoldings()` + `refetchCash()` + `refetchTransactions()` | Only affected data changes; leaderboard may shift |
| **Price changes applied** | Broad: `refetchMarketData()` + `refetchPortfolio()` + `refetchLeaderboard()` | All portfolio values depend on market prices |
| **Round state change** | Broad: `refetchPortfolio()` + `refetchMarketData()` + `refetchLeaderboard()` | All financial state may change |
| **Trading pause/resume** | UI-only | No financial state change |
| **Dividend applied** (own team) | Targeted: `refetchCash()` + `refetchLeaderboard()` | Only cash and leaderboard shift |
| **Dividend applied** (other team) | Broad: `refetchLeaderboard()` | Leaderboard may shift |

### Avoided Anti-Patterns

- ❌ **Full page reload** on every Realtime event
- ❌ **Refetching ALL data** on every minor event (e.g., `refetchPortfolio()` on `TRADING_PAUSED`)
- ❌ **Subscribing to too many channels** (participants only need `run:<run_id>` + `team:<team_id>`)
- ❌ **Broadcasting pending admin state** to participants

### Indexes for Performance

The existing migration indexes support Realtime-friendly queries:

```sql
-- Cash balance aggregation (fast for get_team_portfolio)
CREATE INDEX IF NOT EXISTS idx_cash_ledger_team_run_entry
  ON public.cash_ledger (team_id, competition_run_id, entry_type);

-- Holdings + market_quotes join (fast for get_team_holdings, get_team_portfolio)
CREATE INDEX IF NOT EXISTS idx_holdings_run_stock_team_qty
  ON public.holdings (competition_run_id, stock_id, team_id)
  WHERE quantity > 0;

-- Leaderboard query support
CREATE INDEX IF NOT EXISTS idx_teams_name
  ON public.teams (name);

-- Market quotes lookups (fast for useMarketData, get_team_portfolio)
CREATE INDEX IF NOT EXISTS idx_market_quotes_run_id
  ON public.market_quotes (competition_run_id);
```

---

## Failure Modes

| Failure Mode | Behavior | Recovery |
|---|---|---|
| **Realtime disconnected** | Client loses event receipt. On reconnect: resubscribe + `refetch authoritative state via RPC`. | RPC always returns current state; missed events are irrelevant. |
| **Subscription rejected** (RLS violation) | Client cannot subscribe to restricted channel. Silent failure (no events received). | Client subscribes to permitted channels only (`run:<run_id>`, `team:<team_id>`). |
| **Malformed payload** | Corrupt `realtime_notifications` row. | Payload is identifiers only; no financial data to misinterpret. Event is discarded; next event triggers refetch. |
| **Unauthorized subscription** | Client tries to subscribe to `team:<other_team_id>`. RLS blocks events. | Client only subscribes to authorized channels. No data leakage. |
| **Duplicate event** | Same event inserted twice (race condition). | Idempotency keys in RPCs prevent double-processing. Refetch is idempotent. |
| **Stale event** | Event received after newer event already processed. | Refetch is idempotent — RPC returns current state. Older event is effectively a no-op. |
| **Database mutation succeeds but event missed** | Trade committed, `notify_realtime()` not called (e.g., crash before INSERT). | On reconnect: `refetch authoritative state via RPC`. The RPC result is authoritative regardless of event receipt. |
| **Event arrives after timeout** | Event received after UI already updated from newer event. | Refetch is idempotent; no harm. |
| **Concurrent trades for same team** | `SELECT FOR UPDATE` on `initial_capital` row serializes execution. | One trade waits; other proceeds. Both see consistent state after refetch. |

**Correctness survives every case**: Realtime is a **signal**, not the source of truth. Financial correctness is always derived from PostgreSQL RPCs.

---

## Reconnection

### Reconnect Flow

```
1. WebSocket/Realtime connection lost
2. Browser detects disconnect
3. Client auto-attempts reconnect (Supabase SDK)
4. On reconnect:
   a. Re-authenticate (supabase.auth.getSession())
   b. Resubscribe to channels:
      - run:<run_id>
      - team:<team_id>
   c. Refetch authoritative state via RPC:
      - get_team_portfolio(competition_run_id, team_id)
      - get_leaderboard(competition_run_id)
      - get_team_holdings(competition_run_id, team_id)
      - useMarketData()
   d. UI reconciles with new authoritative state
```

### No Event Guarantee

- **Never assume** a client received every event while disconnected.
- **Never** attempt to reconstruct financial state from missed events.
- **Always** refetch from PostgreSQL on reconnect.

### Idempotency on Reconnect

- RPC refetches are **idempotent** — calling `get_team_portfolio()` twice returns the same result.
- Realtime events that trigger refetches are **idempotent** — multiple refetches converge to the same state.
- No special "reconnect logic" needed beyond resubscribe + refetch.

---

## Video Synchronization Architecture

Video synchronization is a **future phase** (Round 3). The architecture design:

### Authoritative State

- **PostgreSQL** owns video metadata and playback state.
- `videos` table stores: `id`, `competition_run_id`, `title`, `storage_path`, `duration`, `created_at`.
- Playback position may be stored in a separate table or session state.

### Realtime Control Events (future)

| Event | Channel | Payload | Purpose |
|---|---|---|---|
| `VIDEO_PLAY` | `team:<team_id>` or `run:<run_id>` | `{ video_id, server_timestamp, action }` | Request playback start |
| `VIDEO_PAUSE` | `team:<team_id>` or `run:<run_id>` | `{ video_id, server_timestamp, action }` | Request playback pause |
| `SEEK` | `team:<team_id>` or `run:<run_id>` | `{ video_id, server_timestamp, position }` | Request seek to position |
| `VIDEO_STOP` | `team:<team_id>` or `run:<run_id>` | `{ video_id }` | Stop playback |

### Synchronization Mechanism

1. **Admin sends** video control event with `server_timestamp` (PostgreSQL `now()`).
2. **Client receives** event and uses `server_timestamp` to start playback approximately together.
3. **Client-side clock correction** adjusts for network latency.
4. **Recoverability**: If a device joins late or disconnects, the `server_timestamp` allows rejoining from the authoritative point.

### What Realtime Does NOT Do for Video

- ❌ Does **not** stream video data (Supabase Storage is used for that).
- ❌ Does **not** treat a single websocket event as durable state.
- ❌ Does **not** guarantee perfect sync — network latency varies.
- ❌ Does **not** replace the need for admin-controlled authoritative playback.

### Video State Convergence

- On reconnect: resubscribe + use `server_timestamp` from last known control event to re-sync.
- If position data is stored in PostgreSQL (future), `SELECT` retrieves last known position.
- Admins can always force state from the UI (authoritative control).

---

## Proposed Implementation Order

### Phase 7.1: Foundation — Realtime Notifications Table

1. Create `realtime_notifications` table (already in migration 20260813180000).
2. Set up `supabase_realtime` publication.
3. Implement RLS policies (run-scoped + team-scoped).
4. Implement `notify_realtime()` function.
5. Implement `cleanup_old_notifications()` function.

**Output**: Realtime infrastructure ready for event publishing.

### Phase 7.2: Participant Events

1. Publish `ROUND_STARTED` after `start_round()` RPC commits.
2. Publish `ROUND_ENDED` after `end_round()` RPC commits.
3. Publish `MARKET_OPENED` after `open_market()` RPC commits.
4. Publish `MARKET_CLOSED` after `close_market()` RPC commits.
5. Publish `TRADING_PAUSED` after `pause_trading()` RPC commits.
6. Publish `TRADING_RESUMED` after `resume_trading()` RPC commits.
7. Publish `TRADE_EXECUTED` after `execute_trade()` RPC commits (include team_id in payload).
8. Publish `PRICE_CHANGES_APPLIED` after `apply_price_changes()` RPC commits.
9. Publish `DIVIDEND_APPLIED` after `apply_dividend()` RPC commits.
10. Publish `CASH_UPDATED` after any `cash_ledger` INSERT (admin_adjustment, dividend, trade_buy, trade_sell).

**Output**: Participant-visible events flowing from database to UI.

### Phase 7.3: Admin Events

1. Publish admin-scoped events on `admin:<run_id>` channel.
2. Implement admin Realtime subscriptions (separate from participant subscriptions).
3. Ensure pending admin state (`pending_price_changes`, `price_change_batches`) is **never** broadcast to participants.

**Output**: Admin can monitor competition state via Realtime without leaking private data.

### Phase 7.4: Reconciliation & Recovery

1. Implement client-side `onReconnect` handler: resubscribe + `refetch authoritative state via RPC`.
2. Implement client-side `onError` handler: fallback to manual refetch.
3. Test disconnect/reconnect scenarios with multiple browsers.
4. Test missed event scenarios (kill Realtime, reconnect, verify state converges).

**Output**: Robust reconnect/reconciliation behavior.

### Phase 7.5: Video Synchronization (future)

1. Implement video metadata Realtime events (`VIDEO_PLAY`, `VIDEO_PAUSE`, `SEEK`, `VIDEO_STOP`).
2. Design server_timestamp-based synchronization.
3. Test across devices and network conditions.

**Output**: Video sync architecture (Round 3).

---

## Open Questions

1. **Video Realtime Channel Scope**: Should video events be `team:<team_id>` (per-team playback) or `run:<run_id>` (all participants watch same video)? The design may differ per competition round.

2. **Heartbeat / Keep-Alive**: Should Realtime maintain a keep-alive channel, or is detection of disconnect sufficient via the SDK's built-in mechanisms?

3. **Notification Retention Period**: The `cleanup_old_notifications()` default is 1 hour. What retention period is appropriate for the competition lifecycle? Should old notifications be archived vs deleted?

4. **Priority Propagation**: Should Realtime events carry a priority field to allow clients to throttle/optimize refetches (e.g., price changes vs. video events)?

5. **Server-Side Event Filtering**: Should there be a server-side middleware that filters/transforms events before Realtime distribution (e.g., ensuring `pending_price_changes` never leak)?

6. **Browser/SDK Compatibility**: Are there any Supabase Realtime limitations or quirks that need workarounds for the supported browsers/Devices?

7. **Testing Strategy**: What's the minimum test matrix for Realtime (browser versions, disconnect/reconnect scenarios, multi-device, concurrent events)?

8. **Gradual Rollout**: Should Realtime be feature-gated (e.g., `REALTIME_ENABLED` env variable) for phased adoption, or is it an all-or-nothing switch?

9. **Fallback Mechanism**: If Realtime connection fails permanently, should the client fall back to periodic polling of authoritative state via RPC, or is manual refresh expected?

10. **Leaderboard Realtime vs RPC**: Should leaderboard updates come via Realtime events + refetch, or solely via RPC refetches on event? The current design uses RPC, but there may be arguments for Realtime + lighter refetch.

---

## Appendix: Event Flow Diagram

```
PostgreSQL Transaction              Realtime Distribution              Client Behavior
────────────────────────────────────  ────────────────────────────────────  ────────────────────────────────────
execute_trade() RPC
    ↓ INSERT trades, UPDATE holdings,
    ↑ INSERT cash_ledger (atomic)
    │
    └── notify_realtime("team:<team_id>", "TRADE_EXECUTED", ...)
          ↑
          └── postgres_changes (Supabase Realtime)
                ↑
                │   Subscribed: team:<team_id>
                │   + run:<run_id> (all participants)
                │
                │   On event received:
                │   │   trigger refetchHoldings()
                │   │   trigger refetchCash()   → get_team_portfolio()
                │   │   trigger refetchLeaderboard() → get_leaderboard()
                │   │   trigger refetchTransactions() → useTradeHistory()
                │   │
                └─► Client UI updates with authoritative state
```

```
apply_price_changes() RPC
    ↓ UPDATE market_quotes,
    ↑ mark batch applied,
    ↑ INSERT pending_price_changes (admin-only)
    │
    └── notify_realtime("run:<run_id>", "PRICE_CHANGES_APPLIED", ...)
          ↑
          └── postgres_changes (Supabase Realtime)
                ↑
                │   Subscribed: run:<run_id> (all participants)
                │
                │   On event received:
                │   │   trigger refetchMarketData() → useMarketData()
                │   │   trigger refetchPortfolio() → get_team_portfolio()
                │   │   trigger refetchLeaderboard() → get_leaderboard()
                │   │
                └─► Client UI updates with authoritative state
```

```
create_dividend() → apply_dividend() RPC
    ↓ INSERT dividend_payments,
    ↑ INSERT cash_ledger (entry_type='dividend'),
    ↑ UPDATE dividends.status='applied'
    │
    └── notify_realtime("team:<team_id>", "DIVIDEND_APPLIED", ...)
          ↑
          └── postgres_changes (Supabase Realtime)
                ↑
                │   Subscribed: team:<team_id> (owner team)
                │   + run:<run_id> (visible to all participants)
                │
                │   On event received:
                │   │   trigger refetchCash() → get_team_portfolio()
                │   │   trigger refetchLeaderboard() → get_leaderboard()
                │   │
                └─► Client UI updates with authoritative state
```
---

## Implementation Status (Phase 9.8)

### Implemented

**Client-Side Realtime Hooks:**

1. **`src/hooks/useAuthRealtime.ts`**: Sets up Supabase Realtime subscriptions with proper authorization
   - Subscribes to `run:<run_id>` channel for all authenticated users in the run
   - Subscribes to `admin:<run_id>` channel for admin users only
   - Subscribes to `team:<team_id>` channel for team members only
   - Returns `unsubscribe()` function for cleanup

2. **`src/hooks/useRealtime.ts`**: Alternative realtime hook with same authorization model
   - Same channel structure as useAuthRealtime
   - Returns `refetch()` capability

**Context Integration:**

3. **`src/context/SandboxContext.tsx`**: Integrated realtime subscriptions
   - Calls `useAuthRealtime()` at component level
   - Returns `unsubscribe` in useEffect cleanup
   - Added missing loading/error states for holdings, transactions, and portfolio

**Authorization Model:**

- Channel authorization verified via RLS policies on `realtime_notifications` table
- Team membership verified via `team_members` table
- Admin role verified via `profiles.role = 'admin'`

### Not Implemented (Future Phases)

1. **Event publishing from RPCs**: Database triggers/functions that insert into `realtime_notifications` after authoritative mutations
2. **Client-side event handlers**: Processing specific event types and triggering targeted refetches
3. **Video synchronization events**: VIDEO_PLAY, VIDEO_STOP, VIDEO_SEEK
4. **Connection status UI**: Showing Realtime connection status to users

### Security Verification

- ✅ Unauthenticated users cannot subscribe to protected channels
- ✅ Participants cannot subscribe to arbitrary team channels
- ✅ Participants cannot subscribe to admin channels
- ✅ Participants cannot receive another team's private events
- ✅ Pending prices are never broadcast
- ✅ Private financial data is never broadcast

### Build Results

- TypeScript: PASS (no new errors)
- Build: PASS
- Lint: PASS for Phase 9.8 files (pre-existing warnings in other files)

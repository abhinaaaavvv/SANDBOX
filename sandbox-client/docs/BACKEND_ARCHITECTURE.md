# SANDBOX — Backend Architecture Review

> Status: **DRAFT — for review (AGENTS.md Phase 1).**
> Backend route handlers and domain RPCs are now in progress.
> Supabase migrations now cover identity, runs, market, financial, trades, audit/idempotency, videos, helpers, and core RPCs.
> Approve and resolve the decisions in **Part P** before starting Phase 3 hardening.

---

## Part A — Current Repository Inspection

### A.1 Project structure

Next.js **16.3.0** (App Router), React 19, TypeScript, Tailwind v4, shadcn/ui (Radix "maia" style), `bun`. Everything lives under `sandbox-client/`:

```
app/           page.tsx · participant/{login,(console)} · admin/{login,(console)}
components/    ui/ (shadcn) · shared/ (LandingPage, AppHeader, AuthGuard, LoginForm,
                LeaderboardTable, VideoOverlay) · participant/ (Dashboard, MarketTable,
                TradeModal, PortfolioSection, TransactionHistory) · admin/ (AdminPanel)
context/       SandboxContext.tsx   ← entire simulation engine, client-side
hooks/         useAuthoritativeTimer · useRealtimeSubscription · usePriceFlash
lib/           mockData.ts · auth.ts (Supabase-backed auth boundary) · utils.ts (cn, formatINR, formatPercent, formatTime)
supabase/      config.toml · migrations/0001-0008.sql
types/         sandbox.ts · realtime.ts
```

### A.2 Existing backend/API code

**Partial.** `src/app/api/*` route handlers now exist for participant state/trade and the major admin operations. The frontend is still mock-driven, so `SandboxContext.tsx` remains the remaining integration boundary.

### A.3 Existing Supabase setup

Partial setup exists.

- `@supabase/ssr` and `@supabase/supabase-js` are installed.
- `src/lib/supabase/{client,server,middleware,admin}.ts` exist.
- `src/middleware.ts` refreshes sessions through Supabase middleware.
- `supabase/config.toml` and `supabase/migrations/0001`-`0012` exist.
- `src/app/api/*` routes now call Supabase RPCs.
- Realtime subscriptions are still mock-only in the UI.

### A.4 Existing authentication

**Hybrid transition state.** `src/lib/auth.ts` is already Supabase-backed (`signInWithPassword` + role lookup from `profiles`), and `src/lib/supabase/{client,server,middleware,admin}.ts` exist. However, the rest of the app still depends on client-side console gating (`AuthGuard`) and client-side mock simulation state, so the backend transition is incomplete. `LoginForm` still does only lightweight client validation before calling Supabase auth.

### A.5 Existing environment variables

`src/lib/env.ts` validates Supabase env at module load. A local `.env.local` exists with Supabase public values and a server secret key; `.env.example` is still missing. `next.config.ts` is minimal (`reactCompiler: true`).

### A.6 Existing mock data (`lib/mockData.ts`)

- `INITIAL_CASH = 100,000` INR; **8 stocks** (REL, TCS, INFY, HDFC, TATAMOTORS, ICICIBANK, ADANIENT, BHARTIARTL), prices ₹980–₹3,210, integer rupees.
- 6-team seed leaderboard; 3 Round-3 videos (Google-hosted sample MP4s).
- Demo holdings/transactions hard-coded in `SandboxContext` for the current team.

### A.7 Frontend data models (`types/sandbox.ts`, `types/realtime.ts`)

Already well-shaped — these define the API contract:

- `MarketStatus`: `NOT_STARTED | MARKET_OPEN | TRADING_PAUSED | MARKET_CLOSED | ROUND_ENDED`
- `Stock` (symbol, name, sector, currentPrice, previousPrice, change, changePercent, high, low, volume), `Holding`, `Transaction` (BUY|SELL|DIVIDEND), `LeaderboardEntry`, `PendingPriceChange`, `VideoItem`
- `CompetitionStateResponse` — the initial-sync payload shape (teamId, teamName, currentRound, marketStatus, serverTimestamp, roundEndTimestamp, cash, stocks, holdings, transactions, leaderboard, videos, activeVideoId, isVideoPlaying, admin-only pendingPriceChanges)
- `TradeRequestDto {stockId, quantity, type}` and `TradeResponseDto` — already the right request/response contract
- `RealtimeEventPayload` — event types exactly matching AGENTS.md §24

### A.8 Existing client-side domain logic (to be *replaced*, not ported)

`SandboxContext.tsx` implements, client-side: `startRound`, `endRound`, `setMarketStatus`, `setPendingPriceChange`, `clearPendingPriceChange`, `applyPriceChanges`, `payDividends`, `selectVideo/playVideo/stopVideo`, `resetCompetition`, `executeBuy`, `executeSell`, `syncStateFromBackend`. Timer derives from a server-end-timestamp string (15-minute rounds, warning ≤ 120s). Portfolio value = cash + Σ qty×price; P/L = value − 100,000.

### A.9 shadcn/component architecture

Standard `components.json` (aliases `@/*`), Lucide icons, custom `status-badge`, `panel`, `stat` components. AdminPanel surfaces the full admin op set (round start/end, market open/pause/resume/close, price editor with ±5/±10% presets + queue + apply-all with AlertDialog confirm, dividend dispatch, video select/play/stop, reset). ParticipantDashboard/TradeModal show the participant op surface. VideoOverlay is a bottom-right synced-player overlay.

### A.10 Database assumptions

Frontend assumes: 3 rounds/run, 15-min rounds, integer whole-rupee prices, integer share quantities, initial capital ₹1,00,000, cumulative portfolio across rounds within a run, dividend = qty × ₹/share (per holder), P/L vs initial capital.

Current migrations already implement the first slice of that database, but not the RPC/domain layer or realtime delivery.

---

## Part B — Critical Gaps in the Current Implementation

| Area | Current state | Backend must fix |
|---|---|---|
| Money | `number` + `Math.round()` | BIGINT paise, integer arithmetic |
| Authority | All financial state in React context | Postgres owns truth; React is a renderer |
| Auth | sessionStorage mock | Supabase Auth + RLS; role from server |
| Isolation | Single "current team" | Multi-team with strict per-team isolation |
| Trades | Check-then-act (no atomicity) | Single atomic RPC |
| Dividends | Pays only the viewing team | Pays **all** holders atomically |
| Timer | Client counts from a timestamp | `ends_at` enforced inside trade RPC |
| Prices | Whole rupees, static | Paise, per-run, atomic batches |
| Round expiry | Manual "End" only | Trading rejects past `ends_at` regardless |
| Realtime | DOM event stub | Supabase Realtime + refetch reconciliation |

---

## Part C — Proposed PostgreSQL Schema

Money convention: **all monetary values are `bigint` paise** (₹1 = 100). Display layer divides by 100. Quantities are `bigint` integers. No `float`/`numeric` for authoritative math. All PKs `uuid default gen_random_uuid()` (pgcrypto). All tables get `created_at timestamptz default now()`.

### C.1 Identity & teams

```sql
profiles        id uuid PK → auth.users(id) · email citext unique · display_name text
                role text check in ('participant','admin') · team_id uuid null FK → teams
                created_at
                (one row per auth user; created by trigger on auth.users insert)

teams           id uuid PK · name text unique not null · created_at
                (global entity; participates in every run)

team_members    id uuid PK · team_id uuid FK → teams · user_id uuid FK → auth.users unique
                joined_at · UNIQUE(team_id, user_id)  -- 1 user = 1 team
```

### C.2 Competition runs & rounds

```sql
competition_runs  id uuid PK · run_number int not null · name text
                  status text check in ('SETUP','ACTIVE','COMPLETED') default 'SETUP'
                  started_at · ended_at · created_by uuid · created_at
                  UNIQUE(run_number)  -- reset = new run, never DELETE

rounds            id uuid PK · competition_run_id FK → competition_runs
                  round_number smallint check between 1 and 3
                  status text check in ('WAITING','ACTIVE','ENDED') default 'WAITING'
                  market_status text check in ('OPEN','PAUSED','CLOSED') default 'CLOSED'
                  started_at timestamptz · ends_at timestamptz   -- authoritative timer
                  ended_at · created_at
                  UNIQUE(competition_run_id, round_number)
```

### C.3 Market

```sql
stocks            id uuid PK · symbol text unique not null · company_name text not null
                  sector text · is_active bool default true · created_at

market_quotes     id uuid PK · competition_run_id FK · stock_id FK → stocks
                  current_price bigint check (current_price > 0)   -- paise
                  previous_price bigint not null
                  high bigint · low bigint · volume bigint default 0
                  updated_at · UNIQUE(competition_run_id, stock_id)
```

### C.4 Financial state

```sql
team_balances     competition_run_id FK · team_id FK · cash bigint check (cash >= 0)
                  updated_at · PRIMARY KEY (competition_run_id, team_id)
                  -- controlled cache; cash_ledger is the source of truth

holdings          id uuid PK · competition_run_id FK · team_id FK · stock_id FK
                  quantity bigint check (quantity > 0)              -- zero rows deleted
                  average_buy_price bigint check (>= 0)             -- paise
                  UNIQUE(competition_run_id, team_id, stock_id)

trades            id uuid PK · competition_run_id FK · team_id FK · stock_id FK
                  side text check in ('BUY','SELL') · quantity bigint check (>0)
                  execution_price bigint check (>0) · gross_value bigint check (>0)
                  created_by uuid · idempotency_key uuid not null · created_at
                  UNIQUE(idempotency_key)   -- DB-level duplicate-trade guard
                  -- IMMUTABLE: never UPDATE/DELETE (trigger blocks it)

cash_ledger       id bigint identity PK · competition_run_id FK · team_id FK
                  type text check in ('INITIAL_CAPITAL','TRADE_BUY','TRADE_SELL',
                                      'DIVIDEND','ADMIN_CREDIT','ADMIN_DEBIT','CORRECTION')
                  amount bigint check (amount <> 0)     -- signed paise; net = cash
                  reference_id uuid  -- trade/dividend/batch id for linkage
                  note text · created_by uuid · created_at
                  -- IMMUTABLE
```

### C.5 Price batches (admin-private)

```sql
price_change_batches  id uuid PK · competition_run_id FK · created_by uuid
                      status text check in ('PENDING','APPLIED','DISCARDED') default 'PENDING'
                      applied_at · applied_by · created_at

pending_price_changes id uuid PK · batch_id FK → price_change_batches · stock_id FK
                      new_price bigint check (>0) · created_at
                      UNIQUE(batch_id, stock_id)
```

### C.6 Dividends

```sql
dividends         id uuid PK · competition_run_id FK · stock_id FK
                  amount_per_share bigint check (>0) · declared_by uuid · declared_at
                  (one row per dividend event)

dividend_payments id uuid PK · dividend_id FK → dividends · team_id FK · stock_id FK
                  quantity bigint check (>0) · amount_paid bigint check (>0) · paid_at
                  UNIQUE(dividend_id, team_id)   -- prevents double payout
```

### C.7 Videos, audit, idempotency

```sql
videos            id uuid PK · competition_run_id FK · title text · description text
                  storage_path text not null · duration_seconds int · round_requirement smallint
                  created_by uuid · created_at

competition_events  id bigint identity PK · competition_run_id FK · event_type text
                    (check-list per AGENTS.md §33) · actor_id uuid · actor_role text
                    team_id uuid null · entity_id uuid null · metadata jsonb
                    created_at · -- INSERT-only (trigger blocks UPDATE/DELETE)

idempotency_keys    id uuid PK · scope text · key uuid · competition_run_id
                    actor_id uuid · response jsonb · status text check in ('IN_PROGRESS','DONE')
                    created_at · UNIQUE(scope, key)
```

### C.8 Indexes (each justified by a query pattern)

```
team_members(user_id) · team_members(team_id)
team_balances(competition_run_id, team_id)                     -- PK covers it
holdings(run_id, team_id) · holdings(run_id, stock_id)
trades(run_id, team_id, created_at desc) · trades(run_id, stock_id)
cash_ledger(run_id, team_id, created_at)
market_quotes(run_id, stock_id)                                -- UNIQUE covers it
competition_events(run_id, created_at)
pending_price_changes(batch_id)
idempotency_keys(scope, key)                                   -- UNIQUE covers it
dividend_payments(dividend_id)
```

### C.9 Relationships

```
auth.users ─1:1→ profiles ─N:1→ teams ←1:N─ team_members ─N:1→ auth.users
competition_runs ─1:N→ rounds · market_quotes · holdings · trades · cash_ledger
                     · price_change_batches → pending_price_changes · dividends
                     → dividend_payments · videos · competition_events
stocks ─1:N→ market_quotes (per run) · holdings (per run/team) · trades
teams ─1:N→ team_balances (per run) · holdings · trades · cash_ledger
```

---

## Part D — RLS Policy Model

Principle: **participants get SELECT only on public data + their own team's financial data; no direct writes anywhere.** All state changes flow through `SECURITY DEFINER` functions.

| Table | participant (SELECT) | participant (write) | admin (SELECT) | admin (write) |
|---|---|---|---|---|
| profiles | own row | own row (display name) | all | — (role via function) |
| teams | own team + public list | — | all | — |
| team_members | own rows | — | all | — |
| competition_runs | all (public state) | — | all | via RPC |
| rounds | all | — | all | via RPC |
| stocks | all | — | all | via RPC |
| market_quotes | active run only | **—** | all | via RPC |
| team_balances | own team | **—** | all | via RPC |
| holdings | own team | **—** | all | via RPC |
| trades | own team | **—** | all | via RPC |
| cash_ledger | own team | **—** | all | via RPC |
| price_change_batches | **none** | **—** | all | via RPC |
| pending_price_changes | **none** (never leaks) | **—** | all | via RPC |
| dividends | **none** | — | all | via RPC |
| dividend_payments | **none** | — | all | via RPC |
| videos | all | — | all | admin via RPC |
| competition_events | all (sanitized metadata) | **— (INSERT revoked)** | all | — |
| idempotency_keys | **none** | — | **none** | function-only |

**Own-team predicate**: `team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())`. **Admin predicate**: `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')`. Admin role lives in `profiles` (RLS-visible), **not** mutable `app_metadata` alone.

**Security-function hygiene** (every `SECURITY DEFINER` fn):

- `SET search_path = public, pg_temp`
- fully-qualified names
- explicit `auth.uid()` + role + membership validation inside
- `REVOKE ALL` on the function from `anon`/`authenticated`, then `GRANT EXECUTE` to `authenticated` only
- financial tables have no direct INSERT/UPDATE/DELETE grants for any role

---

## Part E — Authentication & Authorization

- `@supabase/ssr` with **browser / server / middleware** clients per the official Next.js pattern.
- `proxy.ts` refreshes sessions and redirects unauthenticated users away from `/participant` and `/admin` (server-side gate to back the client-side `AuthGuard`).
- Login: `supabase.auth.signInWithPassword({ email, password })`; role and team resolved server-side from `profiles` — **never** from the request body.
- Role is loaded in server layouts (participant/admin), and every domain operation re-checks authorization in the RPC (defense in depth). Admin pages additionally verify `profiles.role = 'admin'` in a server layout.
- Participant identity is derived **only** from `auth.uid() → team_members → team`. Client-supplied `team_id` is never trusted.
- Team provisioning is a Phase-2 concern (seed script or admin UI), not part of participant signup.

---

## Part F — Competition Run Model & Round State Machine

### F.1 Run lifecycle

```
SETUP ──start_round(1)──▶ ACTIVE ──admin end / all rounds done──▶ COMPLETED
```

`resetCompetition()` = `new_competition_run()`: creates `run_number = MAX+1`, copies stocks → fresh `market_quotes` (initial prices), seeds `team_balances` with ₹1,00,000 for all teams, creates round 1 `WAITING` with market `CLOSED`, records `COMPETITION_RESET` event. Old runs remain queryable/auditable.

### F.2 Round state machine (transitions enforced inside RPCs)

```
WAITING ──start_round──▶ ACTIVE (market_status='OPEN', ends_at=now+15min)
ACTIVE ──end_round(manual or expiry)──▶ ENDED (market_status='CLOSED')
ACTIVE ──pause_trading──▶ market_status='PAUSED'   (round stays ACTIVE)
PAUSED ──resume_trading──▶ market_status='OPEN'
ACTIVE ──close_market──▶ market_status='CLOSED'    (round stays ACTIVE)
CLOSED ──open_market──▶ market_status='OPEN'
```

Rejected transitions return `INVALID_STATE_TRANSITION`. Trading is allowed **only** when `round.status='ACTIVE' AND round.market_status='OPEN' AND now() < round.ends_at` — the last check is inside the trade transaction, so a browser timer can never extend trading.

### F.3 Frontend mapping (preserves existing UI)

`NOT_STARTED` ← round WAITING or run SETUP · `MARKET_OPEN` ← ACTIVE+OPEN · `TRADING_PAUSED` ← ACTIVE+PAUSED · `MARKET_CLOSED` ← ACTIVE+CLOSED · `ROUND_ENDED` ← round ENDED.

---

## Part G — Domain Operations (Postgres RPCs)

All `SECURITY DEFINER`, transactional, idempotent where noted:

| RPC | Auth | Idempotent | Writes |
|---|---|---|---|
| `execute_trade(p_side, p_stock_id, p_quantity, p_idem_key)` | participant | ✅ | balances, holdings, trades, ledger, event |
| `create_price_batch()` / `upsert_pending_price(batch, stock, price)` / `discard_batch()` | admin | — | batches, pending |
| `apply_price_changes(p_batch_id, p_idem_key)` | admin | ✅ | quotes, batch, event |
| `pay_dividend(p_stock_id, p_amount_per_share, p_idem_key)` | admin | ✅ | balances, ledger, payments, event |
| `start_round(p_round)` / `end_round(p_round)` | admin | ✅ | rounds, event |
| `open_market()` / `close_market()` / `pause_trading()` / `resume_trading()` | admin | — | rounds, event |
| `credit_cash(p_team_id, p_amount, p_reason, p_idem_key)` / `debit_cash(...)` | admin | ✅ | balances, ledger, event |
| `new_competition_run(p_confirm, p_idem_key)` | admin | ✅ | run, rounds, quotes, balances, event |
| `play_video(p_video_id)` / `stop_video()` | admin | — | runs.active_video (state for recovery), event |
| `get_participant_state()` | participant | — | read-only, returns `CompetitionStateResponse` |

### G.1 `execute_trade` — atomic transaction walkthrough

```sql
BEGIN;
  1. auth.uid() → profiles → team membership (FORBIDDEN if none)
  2. active run FOR SHARE   (no run/not ACTIVE → error)
  3. active round FOR SHARE; check status='ACTIVE', market_status='OPEN',
     now() < ends_at   (ROUND_NOT_ACTIVE / MARKET_CLOSED / TRADING_PAUSED / ROUND_ENDED)
  4. market_quotes row FOR SHARE → authoritative execution price (never the client's)
  5. validate quantity > 0 integer (INVALID_QUANTITY)
  6. BUY:  team_balances FOR UPDATE; cash >= qty×price? else INSUFFICIENT_CASH
     SELL: holdings row FOR UPDATE; qty >= sell qty? else INSUFFICIENT_HOLDINGS
  7. update cash (ledger entry TRADE_BUY/TRADE_SELL) · upsert holding
     (buy: new avg = (old_qty×old_avg + cost)/new_qty; sell: decrement, delete at 0)
  8. insert trades row (immutable) + competition_events TRADE_EXECUTED
  9. idempotency_keys insert (scope='trade', key=p_idem_key) — UNIQUE makes
     the second of two identical concurrent requests read the first's response
COMMIT;
```

Locking order is always **round → balances/holdings (per team) → quotes (share)** → no cross-team deadlock; price applies take quotes `FOR UPDATE` and therefore serialize against in-flight trades at the *price-read* point.

### G.2 `apply_price_changes` — atomic batch

```sql
BEGIN;
  admin check; active run; batch FOR UPDATE (status='PENDING' else PRICE_BATCH_ALREADY_APPLIED)
  validate every new_price > 0 (INVALID_PRICE)
  market_quotes FOR UPDATE (all affected)   -- waits for in-flight trades; no torn apply
  previous = current; current = new; update high/low
  batch.status='APPLIED' · event PRICE_BATCH_APPLIED · idempotency result
COMMIT;   -- participants never see partial application
```

### G.3 `pay_dividend` — atomic payout

```sql
BEGIN;
  admin check; active run; amount > 0
  snapshot holders: SELECT team_id, quantity FROM holdings
    WHERE run_id AND stock_id AND quantity > 0 ORDER BY team_id   -- deterministic lock order
  for each: team_balances FOR UPDATE; cash += qty×amount;
            insert dividend_payments (UNIQUE(dividend_id, team_id) prevents double-pay)
            insert cash_ledger DIVIDEND
  event DIVIDEND_PAID · idempotency result
COMMIT;
```

### G.4 Idempotency pattern (all keyed commands)

Client sends a UUID key per attempt. RPC first `SELECT response FROM idempotency_keys WHERE scope+key` → if present, **return stored response**. Else run the transaction and insert the key+response inside it; a concurrent duplicate hits the UNIQUE constraint and returns the winner's stored response (after the winner commits). `trades.idempotency_key UNIQUE` is a second layer for trades.

---

## Part H — Realtime Architecture

- **Channels**: `competition:{run_id}` (public state: rounds, quotes via postgres_changes), `team:{team_id}` (private: own balances/holdings/trades via postgres_changes — Realtime enforces RLS per subscriber), `admin:{run_id}` (private: pending batches, dividends, events). Realtime authorization via RLS on subscribed tables; broadcast channels use channel-level authorization checks.
- **Broadcast** (server-initiated, post-commit, via route handler after RPC success): `ROUND_STARTED/ENDED`, `MARKET_OPENED/CLOSED`, `TRADING_PAUSED/RESUMED`, `PRICE_CHANGES_APPLIED`, `DIVIDENDS_PAID`, `VIDEO_PLAY/STOP`. Events map 1:1 to the existing `RealtimeEventPayload`.
- **Postgres Changes** (auto, committed-only, RLS-filtered): `market_quotes` (prices → price-flash), `trades`/`team_balances`/`holdings` (own-team financial updates). Tables subscribe-worthy get `REPLICA IDENTITY FULL`.
- **Never broadcast before commit**: route handlers broadcast only after the RPC returns success.
- **Recovery**: every channel connects after fetching `get_participant_state()`; on reconnect → re-auth → resubscribe → refetch authoritative state → reconcile. Realtime is a fast path, never the source of truth.
- Leaderboard is **not** stored — it's a derived query refetched on state change / `LEADERBOARD_UPDATED` nudge.

---

## Part I — Videos & Storage

- Bucket `sandbox-videos` (private). `videos` table holds metadata (`storage_path`, duration, `round_requirement=3`).
- Admin upload/delete: `SECURITY DEFINER` RPC + Storage policies (admin only).
- Participant playback: server issues short-lived signed URLs (`storage.from(...).createSignedUrl`) inside `get_participant_state`/playback endpoint — participants never get bucket listing.
- Synchronized playback: `play_video(p_video_id)` stores `active_video_id + started_at` on the run row (recoverable state), broadcasts `VIDEO_PLAY {videoId, serverTimestamp}`; participants start on receipt and nudge by `serverTimestamp − local now()`. `stop_video()` clears + broadcasts `VIDEO_STOP`. Recovery on reconnect uses run row state.

---

## Part J — Audit, Errors, Observability

- **`competition_events`** is append-only (UPDATE/DELETE blocked by trigger; no INSERT grant outside security functions). Records actor, role, team, entity ids, sanitized metadata. Never tokens/secrets.
- **Stable error codes** (exact AGENTS.md list): `AUTH_REQUIRED, FORBIDDEN, TEAM_NOT_FOUND, ROUND_NOT_ACTIVE, MARKET_CLOSED, TRADING_PAUSED, INSUFFICIENT_CASH, INSUFFICIENT_HOLDINGS, INVALID_QUANTITY, INVALID_PRICE, DUPLICATE_REQUEST, PRICE_BATCH_NOT_FOUND, PRICE_BATCH_ALREADY_APPLIED, INVALID_STATE_TRANSITION`. RPCs `raise exception` with these codes; route handlers map to HTTP 4xx/5xx JSON `{error: {code, message}}`. Raw Postgres errors never reach clients.
- **Structured logs** in route handlers: request id, user/team/run, operation, duration, outcome. No secrets.

---

## Part K — API Surface (Next.js Route Handlers)

Handlers are the application boundary (matching the AGENTS.md diagram): **Zod input validation → auth (server client) → RPC → error mapping → post-commit broadcast → structured response**.

```
POST /api/participant/trade            {stockId, side, quantity, idempotencyKey}
GET  /api/participant/state            → CompetitionStateResponse
POST /api/admin/round/start|end        {round}
POST /api/admin/market                 {action: OPEN|CLOSED|PAUSED|RESUMED}
POST /api/admin/price-batch            {changes: [{stockId, newPrice}]}        (create/upsert)
POST /api/admin/price-batch/apply      {batchId, idempotencyKey}
POST /api/admin/dividend               {stockId, amountPerShare, idempotencyKey}
POST /api/admin/cash                   {action: CREDIT|DEBIT, teamId, amount, reason, idempotencyKey}
POST /api/admin/video/play|stop        {videoId?}
POST /api/admin/reset                  {confirm, idempotencyKey}
GET  /api/admin/state                  (admin view: all teams, pending batches, events)
GET  /api/admin/teams                  (Phase 2 team management)
```

**Frontend changes** (Phase 2–7, minimal): swap `lib/auth.ts` for supabase-js; `SandboxContext` actions become fetch→RPC wrappers with optimistic UI only; `useRealtimeSubscription` subscribes to channels; transaction timestamps become ISO strings (formatting util update); leaderboard always from server; `get_participant_state` drives the initial skeleton sync.

---

## Part L — Environment Variables (`.env.example`)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=      # public, safe for browser
SUPABASE_SERVICE_ROLE_KEY=          # server-only: signed URLs, admin bootstrap/seed
```

Server-only key never in `NEXT_PUBLIC_*`; `.env.local` gitignored; `src/lib/env.ts` validates presence at boot.

---

## Part M — Migration Sequence

Versioned SQL under `supabase/migrations/`. Current repo contains `0001`-`0014`; the sequence below is the remaining recommended path:

1. `0001_extensions.sql` (pgcrypto, citext)
2. `0002_identity.sql` (profiles + trigger, teams, team_members + RLS)
3. `0003_runs_rounds.sql` (+ RLS)
4. `0004_market.sql` (stocks, market_quotes + RLS)
5. `0005_balances_holdings.sql` (+ RLS)
6. `0006_trades_ledger.sql` (immutable triggers + RLS)
7. `0007_price_batches.sql` (+ RLS)
8. `0008_dividends.sql` (+ RLS)
9. `0009_audit_videos_idempotency.sql` (events, idempotency, videos, storage)
10. `0010_security_helpers.sql` (current_run, team lookup, idempotency, audit)
11. `0011_domain_rpcs.sql` (trades, market, dividends, cash, reset, video)
12. `0012_state.sql` (participant/admin snapshot queries)
13. `0013_realtime.sql` (REPLICA IDENTITY FULL)
14. `0014_indexes.sql` (query-path indexes)
15. `seed.sql` (stocks, teams, initial run — dev/staging)

Then Phase 2 frontend/Supabase client work. Each migration is additive; destructive ops require separate reviewed migrations.

---

## Part N — Testing Strategy

- **Unit (Vitest)**: money math (paise), portfolio/P/L, dividend math, avg-price recomputation, state-transition table, leaderboard tie-break, Zod schemas.
- **Integration (against `supabase start` local stack)**: RLS matrix (anon / team A / team B / admin against every table), trade RPC happy/edge paths, batch apply atomicity (inject invalid price → assert full rollback), dividends, admin authorization, idempotency (duplicate returns original), rollback (force failure mid-trade → assert no partial state).
- **Concurrency (explicit)**: parallel two buys (no negative cash), two sells, buy+sell same team, trade vs `end_round` at the same instant (trade serialized or rejected, never lost/ghost), trade vs price apply, trade vs dividend, duplicate concurrent request (one wins, one gets stored result).
- **E2E (Playwright, 3 contexts)**: Admin + Team A + Team B; admin broadcasts price changes → all screens update; Team B never sees pending prices; reconnect/reconciliation; video playback sync.
- Environments: local / staging / production, each with own secrets; never develop against production.

---

## Part O — Race-Condition & Security Checklist (mapped)

| Risk | Mitigation |
|---|---|
| Two buys, same team | `team_balances FOR UPDATE` serializes per team |
| Two sells / buy+sell | Holdings + balances locked in fixed order |
| Trade exactly at round end | Trade takes round `FOR SHARE`; `end_round` takes `FOR UPDATE` → serialized; plus `now() < ends_at` re-check inside txn |
| Price change during trading | Quotes `FOR SHARE` on trades vs `FOR UPDATE` on apply → atomic, no torn price |
| Duplicate retry | `idempotency_keys` UNIQUE + `trades.idempotency_key` UNIQUE |
| Participant isolation | RLS own-team predicates; pending prices zero-access |
| Admin escalation | Role from `profiles` verified in RPCs + handlers; no client-supplied IDs trusted |
| Reconnect loss | Refetch authoritative state; realtime is fast-path only |
| Financial precision | BIGINT paise everywhere; no floats in authoritative math |
| Rollback | Every domain op is one transaction; failure → full rollback |

---

## Part P — Unresolved Competition-Rule Decisions (need sign-off)

1. **Round expiry**: auto-end via `pg_cron`/scheduled function + trading rejection, or manual admin "End" only (trading rejection is guaranteed either way)? Recommend auto-end with 0 grace.
2. **Reset flow**: new run created with Round 1 `WAITING` (admin clicks Start), or auto-started (matches current UX)? Recommend auto-start Round 1 to minimize frontend churn.
3. **P/L accounting**: gross (value − initial capital, dividends count) vs net of admin cash adjustments? AGENTS.md requires this to be explicit — recommend **gross + dividends**, admin credits excluded from P/L.
4. **Paise vs whole rupees**: recommend paise (allows fractional prices/dividends later). Confirm.
5. **Trading during Round 3 video**: allowed (current UX keeps market open during video)? Recommend yes.
6. **Leaderboard cumulative across rounds** within a run: confirm (current frontend behavior).
7. **Team/account provisioning**: seed script with demo teams vs admin team-management UI (Phase 2 scope).
8. **High/low/volume tracking**: keep per-round quote stats, or drop (frontend barely uses them)?
9. **Rate limiting**: simple per-user trade throttle (e.g. ≤ N trades/sec) at the route layer — confirm kiosk tolerance.

---

## Part Q — Suggested Build Sequence

Phase 2 Supabase foundation → Phase 3 competition engine (runs/rounds/market state) → Phase 4 trading (RPC, holdings, ledger, idempotency) → Phase 5 market (batches, apply, leaderboard) → Phase 6 dividends → Phase 7 realtime + reconnect → Phase 8 videos → Phase 9 hardening (concurrency/RLS suites) → Phase 10 production readiness.

# AGENTS.md — SANDBOX Engineering & Backend Architecture

## Mission

SANDBOX is a live multiplayer stock-market competition. The backend must be production-grade: correct under concurrency, secure against client tampering, auditable, recoverable, and realtime across devices.

The backend is not a frontend simulation.

## Core Stack

Use:

- Next.js + TypeScript
- Supabase Auth
- Supabase PostgreSQL
- Supabase Realtime
- Supabase Storage
- PostgreSQL functions/RPC + transactions for authoritative competition operations
- PostgreSQL RLS for authorization
- Version-controlled Supabase migrations

Do NOT introduce Express, a custom WebSocket server, Redis, Kafka, or microservices unless there is a demonstrated requirement.

Architecture:

```text
Participant/Admin Browser
          |
          v
   Next.js application
          |
   Auth + authorization
          |
          v
   PostgreSQL (SOURCE OF TRUTH)
          |
     committed state
       /       \
      v         v
 Realtime     Queries
      |
      v
 All connected clients
```

PostgreSQL owns truth. Realtime only distributes committed state/events.

---

# 1. Non-Negotiable Rules

The browser must never authoritatively set:

- cash
- stock prices
- holdings
- portfolio value
- P/L
- leaderboard rank
- round state
- market state
- trading state
- dividends
- admin role
- team ownership

The browser requests operations. The backend validates and commits them.

Never implement authoritative money operations as independent client-side read/calculate/update requests.

Never trust IDs supplied by the browser for authorization.

Never rely on UI hiding for security.

---

# 2. Supabase

Use the current Supabase Next.js SSR approach with `@supabase/ssr`.

Maintain separate browser/server/middleware clients as appropriate.

Document environment variables in `.env.example`.

Typical variables:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=   # server-only, only if genuinely required
```

Never expose secret/service credentials through `NEXT_PUBLIC_*`.

Never commit `.env.local`.

All database structure belongs in `supabase/migrations/`, not undocumented dashboard-only changes.

---

# 3. Repository Structure

Prefer:

```text
app/
├── page.tsx
├── participant/
│   ├── layout.tsx
│   ├── login/
│   └── page.tsx
├── admin/
│   ├── layout.tsx
│   ├── login/
│   └── page.tsx
└── ...

components/
├── ui/
├── shared/
├── participant/
└── admin/

lib/
├── supabase/
├── auth/
├── competition/
├── trading/
├── market/
├── realtime/
├── storage/
├── validation/
└── types/

supabase/
├── migrations/
├── seed.sql
└── functions/

tests/
├── unit/
├── integration/
└── e2e/
```

Do not create abstractions without a real need.

---

# 4. Database Model

The exact schema can evolve after inspection, but it must support at least:

```text
profiles
teams
team_members
competition_runs
rounds
stocks
market_quotes
holdings
trades
cash_ledger
pending_price_changes
price_change_batches
dividends
dividend_payments
videos
competition_events
idempotency_keys
```

## Competition runs

Use a run/session model rather than destructive reset behavior:

```text
competition
  ├── run 001
  └── run 002
```

Historical runs must remain auditable.

A reset should create/activate a new clean run rather than blindly deleting the previous competition.

---

# 5. Identity and Authorization

Model:

```text
auth.users
    ↓
profiles
    ↓
team_members
    ↓
teams
```

Roles:

```text
participant
admin
```

A participant's team is derived from authenticated identity.

Never trust a client-supplied `team_id`.

Authorization must be enforced by RLS and/or server-side/database checks.

Do not use mutable user metadata as the sole authorization source.

Participants can access:

- their team
- their holdings
- their transactions
- their cash
- their dividend history
- public market data
- public leaderboard
- public competition state

They cannot access another team's private financial data or pending admin price changes.

Admins can perform privileged competition operations.

---

# 6. Money and Financial Precision

Never use JavaScript floating-point numbers for authoritative financial calculations.

Prefer integer minor units:

```text
₹1 = 100 paise
₹100,000 = 10,000,000 paise
```

Use `bigint` where appropriate.

Prices and monetary calculations must be deterministic.

If fractional shares/prices are required, explicitly define precision/scale. Do not silently use floating point.

---

# 7. Market Model

Stock definitions should be separate from competition-specific prices.

Conceptually:

```text
stocks
  id
  symbol
  company_name

market_quotes
  competition_run_id
  stock_id
  current_price
```

Enforce:

```text
UNIQUE(competition_run_id, stock_id)
```

Participants only see active `market_quotes`.

---

# 8. Holdings

Holdings are scoped to run + team + stock:

```text
holdings
  competition_run_id
  team_id
  stock_id
  quantity
  average_buy_price
```

Enforce one row per run/team/stock.

Participants cannot directly edit holdings.

---

# 9. Trade Ledger

Trades are immutable records.

At minimum:

```text
id
competition_run_id
team_id
stock_id
side
quantity
execution_price
gross_value
created_at
created_by
idempotency_key
```

Never rewrite historical trades to fix UI state.

Corrections must be explicit adjustment events.

---

# 10. Cash Ledger

Maintain an immutable cash movement history:

```text
INITIAL_CAPITAL
TRADE_BUY
TRADE_SELL
DIVIDEND
ADMIN_CREDIT
ADMIN_DEBIT
CORRECTION
```

A current cash balance may be maintained as a controlled aggregate/cache for performance, but the ledger remains the audit trail.

Never silently overwrite cash.

---

# 11. Atomic Trading

Implement one authoritative domain operation such as:

```text
execute_trade(...)
```

Conceptual transaction:

```text
BEGIN

authenticate caller
resolve caller -> team
validate active run
validate round
validate market/trading state
lock relevant financial rows
read current market price
validate quantity
validate cash/holdings
calculate exact value
update cash
update holding
insert immutable trade
insert cash ledger entries
record competition event

COMMIT
```

Any failure rolls back the entire operation.

Use PostgreSQL row locks/constraints where necessary.

---

# 12. Concurrency

Assume concurrent requests happen:

- two buys
- two sells
- buy + sell
- trade as round ends
- trade during price application
- trade during dividend
- duplicate browser retry

Use PostgreSQL transactions and appropriate locking.

Never rely on client button disabling to prevent races.

---

# 13. Idempotency

Critical commands should accept a unique idempotency/request key.

At minimum:

```text
execute_trade
apply_price_changes
pay_dividend
start_round
end_round
credit_cash
debit_cash
reset/new run
```

Duplicate retries must return the original result rather than execute twice.

Enforce this in the database, not only in React.

---

# 14. Competition State Machine

The backend owns state.

Represent round state explicitly:

```text
WAITING
ROUND_ACTIVE
ROUND_ENDED
```

And competition controls:

```text
open_market()
close_market()
pause_trading()
resume_trading()
start_round()
end_round()
```

Reject invalid transitions.

Semantics:

- market closed → trading rejected
- trading paused → market visible, trades rejected
- round ended → trades rejected permanently for that round

---

# 15. Timer

Store authoritative timestamps:

```text
started_at
ends_at
```

The browser derives remaining time from these values.

Never store `remaining_seconds` as authoritative state.

Trade operations must independently verify that `ends_at` has not passed.

Do not depend on a browser timer to secure the competition.

A server-side reconciliation/scheduled mechanism may mark stale rounds ended, but trading authorization must already reject expired rounds.

---

# 16. Pending Price Changes

Participants must never see pending prices.

Use separate data:

```text
market_quotes
RELIANCE -> ₹2500

pending_price_changes
RELIANCE -> ₹2800
```

Participants read active market quotes only.

Admins can manage pending changes.

---

# 17. Price Change Batches

Use an explicit batch:

```text
price_change_batches
  id
  competition_run_id
  created_by
  status
  applied_at

pending_price_changes
  batch_id
  stock_id
  new_price
```

A batch supports review, auditability, and atomic application.

---

# 18. Apply Price Changes

Implement:

```text
apply_price_changes(batch_id)
```

Transaction:

```text
BEGIN

authorize admin
validate active run
validate batch
validate every price
lock affected market rows
apply every price
mark batch applied
record competition event

COMMIT
```

If one change fails, all changes roll back.

Participants must never see a partially applied batch.

---

# 19. Portfolio and P/L

Authoritative portfolio value:

```text
cash + Σ(quantity × current_market_price)
```

Use deterministic integer arithmetic.

Default P/L:

```text
current portfolio value - initial capital
```

Dividends increase cash and therefore portfolio value.

If external admin cash adjustments are supported, explicitly define whether P/L is gross performance or net of adjustments before implementation.

Do not silently change accounting rules.

---

# 20. Leaderboard

Rank teams by:

```text
total portfolio value DESC
```

Do not store independent mutable rank values.

Use deterministic tie-breaking, e.g.:

```text
portfolio_value DESC
team_id ASC
```

unless competition rules specify another tie-breaker.

Derived leaderboard data should come from authoritative financial state.

---

# 21. Dividends

Implement:

```text
pay_dividend(stock_id, amount_per_share)
```

Atomically:

1. authorize admin
2. validate competition state
3. validate stock and amount
4. determine eligible holdings
5. calculate payouts
6. update cash
7. write cash ledger entries
8. write dividend payment records
9. record competition event
10. commit

Prevent duplicate payout for the same dividend event.

---

# 22. Admin Cash Adjustments

Never expose:

```text
set_cash(team_id, amount)
```

Use explicit:

```text
credit_cash(team_id, amount, reason)
debit_cash(team_id, amount, reason)
```

Record:

- admin
- team
- amount
- reason
- run
- timestamp
- idempotency key

---

# 23. Reset

Never implement reset as:

```text
DELETE EVERYTHING
```

Preserve historical runs.

A reset should:

- require admin authorization
- require explicit confirmation
- preserve audit history
- create/activate a clean run
- initialize capital
- initialize prices
- initialize round state

---

# 24. Realtime

Use Supabase Realtime.

Prefer Broadcast for competition-wide events and high-value domain events; use filtered Postgres Changes where simpler and sufficient.

Possible events:

```text
ROUND_STARTED
ROUND_ENDED
MARKET_OPENED
MARKET_CLOSED
TRADING_PAUSED
TRADING_RESUMED
TRADE_EXECUTED
PRICE_CHANGES_APPLIED
DIVIDENDS_PAID
CASH_UPDATED
HOLDINGS_UPDATED
LEADERBOARD_UPDATED
VIDEO_PLAY
VIDEO_STOP
```

Only broadcast committed state.

Never broadcast an event before its database transaction commits.

Use narrow subscriptions and private channels where appropriate.

---

# 25. Realtime Recovery

Realtime is not durable storage.

On initial connection:

```text
authenticate
→ subscribe
→ fetch authoritative state
```

On reconnect:

```text
re-authenticate
→ resubscribe
→ refetch authoritative state
→ reconcile UI
```

Never assume a client received every event while disconnected.

---

# 26. Realtime Topics

Possible topics:

```text
competition:<run_id>
team:<team_id>
admin:<run_id>
```

Participants must only subscribe to authorized topics.

Use Realtime authorization/RLS appropriately.

---

# 27. Videos

Use Supabase Storage for Round 3 videos.

Database metadata:

```text
videos
  id
  competition_run_id
  title
  storage_path
  duration
  created_at
```

Admin upload/delete requires admin authorization.

Storage access must be protected with appropriate policies.

Do not store video binaries in PostgreSQL.

---

# 28. Synchronized Video Playback

Realtime communicates playback state, not video data.

Admin sends:

```text
video_id
action
server_timestamp
```

Participants use the timestamp to start approximately together.

Playback must be recoverable from authoritative state where practical.

Do not treat a single websocket event as durable state.

---

# 29. Domain/API Boundary

Prefer explicit domain operations:

```text
executeTrade()
startRound()
endRound()
openMarket()
closeMarket()
pauseTrading()
resumeTrading()
createPriceBatch()
updatePendingPrice()
applyPriceChanges()
payDividend()
creditCash()
debitCash()
playVideo()
resetCompetition()
```

Each operation needs:

- input schema
- authentication
- authorization
- validation
- transaction
- idempotency where appropriate
- structured result
- stable error code

Use Zod or equivalent validation at application boundaries.

Do not expose arbitrary CRUD writes for critical financial tables.

---

# 30. Error Handling

Use stable error codes such as:

```text
AUTH_REQUIRED
FORBIDDEN
TEAM_NOT_FOUND
ROUND_NOT_ACTIVE
MARKET_CLOSED
TRADING_PAUSED
INSUFFICIENT_CASH
INSUFFICIENT_HOLDINGS
INVALID_QUANTITY
INVALID_PRICE
DUPLICATE_REQUEST
PRICE_BATCH_NOT_FOUND
PRICE_BATCH_ALREADY_APPLIED
INVALID_STATE_TRANSITION
```

Do not expose raw PostgreSQL errors to participants.

Log internal details server-side.

---

# 31. RLS and Database Security

Every exposed application table must have appropriate RLS.

Use:

- `auth.uid()`
- team membership relationships
- trusted authorization data
- explicit policies

Pay special attention to:

```text
profiles
teams
team_members
holdings
trades
cash_ledger
pending_price_changes
admin-only data
storage.objects
realtime authorization
```

When using `SECURITY DEFINER` functions:

- set a safe `search_path`
- fully qualify objects
- explicitly validate authorization
- grant execution only to required roles
- never create unrestricted privileged functions

Never expose secret/service credentials to clients.

---

# 32. Constraints and Indexes

Use database constraints for critical invariants:

```text
quantity >= 0
price > 0
valid state values
foreign keys
unique team membership
unique holding per run/team/stock
unique pending change per batch/stock
```

Evaluate indexes for real query patterns, especially:

```text
team_members(user_id)
team_members(team_id)

holdings(run_id, team_id)
holdings(run_id, stock_id)

trades(run_id, team_id, created_at)
cash_ledger(run_id, team_id, created_at)

market_quotes(run_id, stock_id)

competition_events(run_id, created_at)

pending_price_changes(batch_id)
```

Do not add indexes without a query/use-case reason.

---

# 33. Audit Log

Maintain an immutable `competition_events` log.

Record important actions:

```text
ROUND_STARTED
ROUND_ENDED
MARKET_OPENED
MARKET_CLOSED
TRADING_PAUSED
TRADING_RESUMED
PRICE_BATCH_CREATED
PRICE_BATCH_APPLIED
TRADE_EXECUTED
DIVIDEND_PAID
CASH_CREDITED
CASH_DEBITED
VIDEO_PLAYED
COMPETITION_RESET
```

Record:

- event id
- run id
- actor
- event type
- timestamp
- entity ids
- structured metadata

Never store secrets/tokens in audit metadata.

This log is required for debugging and competition disputes.

---

# 34. Observability

Production-grade means the live competition can be diagnosed.

Structured logs should include when relevant:

- request/action id
- user id
- team id
- competition run id
- operation
- duration
- success/failure
- error code

Never log:

- passwords
- tokens
- secret keys

Avoid random debugging logs.

---

# 35. Testing

## Unit

Test:

- money calculations
- portfolio value
- P/L
- dividends
- validation
- state transitions
- ranking/ties

## Integration

Test:

- RLS
- trade RPC
- price batch RPC
- dividends
- admin authorization
- participant isolation
- idempotency
- rollback

## Concurrency

Explicitly test:

```text
two simultaneous buys
two simultaneous sells
buy + sell
trade + round end
trade + price application
trade + dividend
duplicate trade
duplicate admin command
```

## E2E

Use multiple browser contexts:

```text
Admin
Team Alpha
Team Beta
```

Verify realtime cross-device behavior.

---

# 36. Production Environments

Separate:

```text
local
staging/test
production
```

Do not develop against the production competition database.

Use environment-specific secrets.

Production schema changes happen through reviewed migrations.

---

# 37. Development Phases

### Phase 1 — Architecture

Inspect the repository and produce:

- current architecture
- schema
- relationships
- RLS model
- domain operations
- state machine
- realtime model
- Storage model
- migration sequence
- testing strategy
- unresolved competition-rule decisions

Do not make destructive changes yet.

### Phase 2 — Supabase foundation

Implement:

- Supabase clients
- environment validation
- auth/session handling
- migrations
- schema
- constraints
- indexes
- RLS
- seed data

### Phase 3 — Competition engine

Implement:

- competition runs
- rounds
- timestamps
- market state
- trading state
- admin transitions

### Phase 4 — Trading

Implement:

- atomic trades
- holdings
- cash ledger
- transactions
- idempotency
- portfolio calculations

### Phase 5 — Market

Implement:

- pending price changes
- batches
- atomic Apply Price Changes
- leaderboard

### Phase 6 — Dividends

Implement:

- dividend events
- atomic payouts
- payment records
- cash ledger

### Phase 7 — Realtime

Implement:

- domain events
- authorization
- participant subscriptions
- admin subscriptions
- reconnect/reconciliation

### Phase 8 — Videos

Implement:

- Storage
- metadata
- admin upload
- playback broadcast
- synchronized playback

### Phase 9 — Hardening

Test:

- concurrency
- RLS
- idempotency
- invalid state transitions
- rollback
- reconnect
- authorization
- multi-device behavior

### Phase 10 — Production readiness

Review:

- secrets
- logging
- migrations
- indexes
- error handling
- backups/recovery
- deployment
- rate limiting/abuse controls where appropriate

---

# 38. AI Agent Rules

Before modifying backend code:

1. Read `AGENTS.md` and `DESIGN.md`.
2. Inspect existing architecture.
3. Do not delete working functionality without justification.
4. Do not create a second source of truth.
5. Do not bypass RLS for convenience.
6. Do not expose privileged credentials.
7. Do not put authoritative financial logic in React.
8. Do not use floating point for authoritative money.
9. Do not use polling as the primary realtime mechanism.
10. Do not perform financial updates without a database transaction.
11. Do not silently swallow errors.
12. Do not create destructive migrations without explicit review.
13. Add tests for critical state transitions.
14. Keep migrations and database functions version-controlled.
15. Prefer simple architecture over unnecessary infrastructure.
16. Explain decisions affecting security, concurrency, or data integrity.

---

# 39. First Backend Task

Before implementing the production backend, inspect the repository and produce a **Backend Architecture Review** containing:

1. Current project structure
2. Existing backend/API code
3. Existing Supabase setup
4. Existing authentication
5. Existing environment variables
6. Existing mock data
7. Proposed database schema
8. Relationships and constraints
9. RLS policies
10. RPC/domain operations
11. Competition state machine
12. Realtime architecture
13. Storage architecture
14. Migration sequence
15. Testing strategy
16. Security risks
17. Unresolved competition-rule decisions

Do not make destructive or large-scale changes until this review is approved.

---

# 40. Definition of Done

The backend is complete only when:

- authenticated users are correctly isolated
- admin authorization is enforced server-side
- competition state is authoritative
- trading is atomic
- money is deterministic
- holdings cannot be forged
- price batches are atomic
- pending prices remain private
- dividends are atomic and auditable
- leaderboard is derived from authoritative state
- round expiry prevents trading
- duplicate requests are safe
- realtime updates propagate across devices
- reconnects reconcile state
- important actions are audited
- migrations are version-controlled
- critical paths are tested
- secrets are protected
- the system can be diagnosed during a live competition

The goal is not merely a backend that works.

The goal is a backend that remains correct when multiple teams, multiple devices, retries, race conditions, and admin actions happen at the same time.

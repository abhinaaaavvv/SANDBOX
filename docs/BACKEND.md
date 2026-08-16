# SANDBOX Backend Architecture

> **Canonical Realtime Architecture:** `SANDBOX_REALTIME_ARCHITECTURE.md` is the authoritative source for SANDBOX realtime implementation. It defines the event inventory, payload rules, channel model, RLS authorization, transactional notification publication, reconciliation, reconnect behavior, fallback behavior, and realtime testing requirements. Backend changes involving realtime must follow that document. If `BACKEND.md` conflicts with it on realtime behavior, the realtime architecture document wins.
>
> **Round 3:** Round 3 is a 15-minute trading round. No video functionality exists inside SANDBOX; external video/content is outside the website/backend.


## 1. Project Overview

SANDBOX is a Business Club stock-market competition web application.

The application has two interfaces:

- Participant
- Admin

The frontend is already implemented using:

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Lucide
- Google Sans
- EB Garamond

The backend is being implemented with:

- Supabase
- PostgreSQL
- Supabase Auth
- Supabase Realtime
- Supabase Storage
- PostgreSQL functions/RPCs
- PostgreSQL transactions
- Row Level Security (RLS)

There is intentionally **no Express backend** unless a concrete requirement emerges that cannot reasonably be handled by Supabase/PostgreSQL/Next.js server functionality.

---

# 2. Core Architecture Principle

PostgreSQL is the authoritative source of truth.

The frontend must never be trusted for:

- cash balances
- holdings
- stock prices
- portfolio value
- profit/loss
- leaderboard ranking
- round state
- market state
- trading permissions
- dividend calculations

The frontend displays state and requests operations.

The database validates and performs authoritative operations.

Conceptually:

```text
Next.js
   │
   │ authenticated request
   ▼
Supabase
   │
   ├── Auth
   ├── PostgREST / RPC
   ├── Realtime
   └── Storage
        │
        ▼
   PostgreSQL
        │
        ├── constraints
        ├── RLS
        ├── transactions
        ├── functions/RPCs
        └── triggers
```

---

# 3. Competition Rules

The competition contains three rounds.

## Round 1

Portfolio/trading round.

Participants trade stocks using the currently active market prices.

## Round 2

Physical newspaper round.

Administrators manually control stock price changes.

## Round 3

Video trading round.

Administrators control stock price changes while participants trade based on video content played externally on a TV.

Each round lasts 15 minutes.

The authoritative round timing must use database timestamps:

```text
started_at
ends_at
```

The browser countdown is only a display.

The browser must never determine whether a round has ended.

---

# 4. Market Price Model

Stock prices NEVER change automatically.

There are two concepts:

### Active prices

The prices currently visible to participants.

Stored in:

```text
market_quotes
```

### Pending prices

Prices prepared by an administrator but not yet active.

Stored in:

```text
pending_price_changes
```

Pending prices must be completely invisible to participants.

The workflow is:

```text
Admin prepares changes
        ↓
pending_price_changes
        ↓
Participants continue seeing old prices
        ↓
Admin clicks "Apply Price Changes"
        ↓
PostgreSQL transaction
        ↓
All affected market prices update atomically
        ↓
Portfolio values recalculate
        ↓
Leaderboard reflects new values
        ↓
Realtime distributes committed state
```

There must never be a state where only some of the intended price changes have been applied.

---

# 5. Identity Architecture

Supabase Auth owns authentication identities.

Application identity is represented through:

```text
auth.users
    │
    ▼
profiles
    │
    ▼
teams
    ▲
    │
team_members
```

## `profiles`

One profile per authenticated user.

Expected fields include:

```text
id
display_name
role
created_at
updated_at
```

Roles:

```text
participant
admin
```

New users must default to:

```text
participant
```

Users must never be able to promote themselves to admin.

## `teams`

Represents competition teams.

## `team_members`

Associates authenticated users with teams.

Membership roles:

```text
member
captain
```

Duplicate membership for the same user/team is prohibited.

---

# 6. Planned Database Tables

The planned core schema is:

```text
profiles
teams
team_members

competitions
competition_runs
rounds

stocks
market_quotes

holdings
trades
cash_ledger

price_change_batches
pending_price_changes

dividends
dividend_payments

competition_events

idempotency_keys
```

These tables should NOT all be created at once.

Implement them in controlled phases.

---

# 7. Planned Relationships

Conceptual relationship graph:

```text
auth.users
    │
    ▼
profiles
    │
    ├──────────────┐
    ▼              ▼
team_members     audit/event context
    │
    ▼
teams
    │
    ▼
competition_runs
    │
    ▼
rounds
    │
    ├───────────────┐
    │               │
    ▼               ▼
trades           holdings
    │               │
    └───────┬───────┘
            ▼
        cash_ledger

stocks
    │
    ▼
market_quotes
    ▲
    │
pending_price_changes
    ▲
    │
price_change_batches
```

The exact foreign-key relationships should be finalized before each implementation phase.

---

# 8. Money Representation

Never use floating-point values for financial amounts.

Money must use integer paise.

Example:

```text
₹100.50
```

is represented as:

```text
10050
```

using:

```text
BIGINT
```

This applies to:

- cash
- trade values
- dividends
- administrative cash adjustments
- prices
- portfolio calculations where monetary precision is required

Never use JavaScript floating-point arithmetic as the authoritative financial calculation.

---

# 9. Trading Architecture

A trade must be an atomic database operation.

Conceptually:

```text
Participant requests BUY
        ↓
PostgreSQL function/RPC
        ↓
Validate authenticated user
        ↓
Validate team membership
        ↓
Validate competition/run
        ↓
Validate current round
        ↓
Validate market open
        ↓
Validate trading not paused
        ↓
Validate stock
        ↓
Read authoritative market price
        ↓
Validate quantity
        ↓
Validate available cash
        ↓
Create trade
        ↓
Update holdings
        ↓
Create cash ledger entry
        ↓
Commit transaction
```

If any validation fails:

```text
NO STATE CHANGE
```

The client must never calculate the final cash/holdings state and submit it as authoritative data.

---

# 10. Idempotency

Important operations must support idempotency.

Examples:

- trade submission
- applying price changes
- dividend distribution
- administrative cash adjustment
- important round-control actions

The purpose is to prevent duplicate operations when:

- the user double-clicks
- the network retries
- a request times out after the database commits
- a client reconnects
- an API request is accidentally repeated

Planned table:

```text
idempotency_keys
```

Each operation must define its idempotency strategy before implementation.

---

# 11. Cash Ledger

Cash should have an auditable history.

Prefer append-only ledger entries over opaque balance mutations.

Conceptually:

```text
+ initial capital
- BUY
+ SELL
+ dividend
+ admin adjustment
```

The system should be able to explain why a team's cash balance has its current value.

Destructive manipulation of historical financial records should be avoided.

---

# 12. Holdings

Holdings represent the authoritative number of shares owned by a team.

The system must ensure that:

```text
quantity >= 0
```

unless short selling is explicitly introduced later.

Holdings must be updated atomically with trades.

---

# 13. Portfolio Value

Portfolio value is derived from authoritative state.

Conceptually:

```text
portfolio value =
cash
+
Σ(
    shares owned
    × current authoritative market price
)
```

P/L is derived from the appropriate starting capital/baseline.

Do not store redundant portfolio values unless there is a concrete performance reason.

If cached/derived values are introduced later, PostgreSQL remains the source of truth and the cache must be safely invalidatable/recomputable.

---

# 14. Leaderboard

The leaderboard must be derived from authoritative portfolio values.

It must respond to:

- trades
- price changes
- dividends
- cash adjustments

A participant should not need to trade for their leaderboard value to change after an administrator applies a price change.

---

# 15. Price Change System

Price changes are a two-stage process.

## Stage 1 — Prepare

Admin creates a price-change batch.

Example:

```text
Batch #12

TCS   ₹3200 → ₹3300
INFY  ₹1400 → ₹1375
HDFC  ₹1650 → ₹1700
```

These values are pending.

Participants cannot see them.

## Stage 2 — Apply

Admin invokes an authoritative database operation:

```text
apply_price_changes()
```

The operation must:

1. Validate admin authorization.
2. Validate batch state.
3. Validate competition/run/round state.
4. Validate all requested changes.
5. Update all affected active prices atomically.
6. Mark the batch applied.
7. Record an auditable event.
8. Commit as one transaction.

If any part fails:

```text
no price changes are applied
```

---

# 16. Market State

The admin controls:

- market open
- market closed
- trading pause
- trading resume

These controls must be authoritative database state.

The participant UI only reflects that state.

A participant must not be able to bypass a closed/paused market by directly calling a database endpoint.

Every trade operation must independently verify the relevant market state.

---

# 17. Round State

The admin controls round transitions.

The database must maintain authoritative:

```text
status
started_at
ends_at
```

A client-side timer is not authoritative.

If a browser says:

```text
00:03 remaining
```

but PostgreSQL says the round has ended:

```text
trade rejected
```

The database wins.

---

# 18. Dividends

Planned tables:

```text
dividends
dividend_payments
```

Dividend distribution must be authoritative and atomic.

The system must prevent accidental duplicate distributions.

Dividend payments should be auditable.

---

# 19. Administrative Cash Adjustments

Administrators may need to adjust team cash.

These operations must:

- require admin authorization
- use integer paise/BIGINT
- create an auditable ledger entry
- support idempotency where appropriate
- not silently overwrite financial history

---

# 20. Audit Events

Important administrative and competition actions should be auditable.

Planned table:

```text
competition_events
```

Examples:

```text
competition created
run started
round started
round ended
market opened
market closed
trading paused
trading resumed
price batch created
price batch applied
dividend distributed
cash adjusted
video started
video paused
video seeked
```

The exact event schema should be designed when the relevant feature is implemented.

---

# 21. Realtime Architecture

Realtime is a distribution mechanism, not the source of truth.

Conceptually:

```text
PostgreSQL
    │
    │ committed state
    ▼
Supabase Realtime
    │
    ├── Participant device
    ├── Participant device
    └── Admin device
```

When a client receives realtime data, it updates its UI.

When a client reconnects:

```text
reconnect
    ↓
refetch authoritative state
    ↓
reconcile UI
```

Do not attempt to reconstruct financial state solely from missed realtime events.

Realtime subscriptions should be designed after the underlying database schema and RLS policies are established.

---

# 22. Round 3 Architecture

Round 3 remains a full competition round, but **there is no video shown, hosted, or
controlled inside the SANDBOX website**.

The website/backend must still support Round 3 as an active trading round.

Round 3 uses the same authoritative competition mechanisms as the other rounds:

- round lifecycle
- 15-minute server-authoritative timer
- market open/closed state
- trading pause/resume
- stock prices
- BUY/SELL execution
- holdings
- cash
- portfolio value
- P/L
- leaderboard
- admin price changes
- realtime synchronization

The external video/content used by organizers is outside the SANDBOX system.

Therefore SANDBOX must NOT implement:

- video hosting
- video upload
- video playback UI
- video playback synchronization
- video play/stop/seek commands
- video storage
- video-specific realtime events
- competition metadata management

Round 3 flow:

```text
Admin starts Round 3
        ↓
15-minute server-authoritative round begins
        ↓
Market/trading state becomes authoritative
        ↓
Participants trade normally
        ↓
Admin prepares price changes privately
        ↓
Admin applies price changes
        ↓
PostgreSQL commits new prices
        ↓
Realtime broadcasts authoritative market state
        ↓
Participants' portfolios / P&L / leaderboard update
        ↓
Admin ends Round 3 or timer expires
```

The external video/content may influence what prices the administrator chooses, but the
SANDBOX backend does not need to know about or synchronize that content.

# 23. Supabase Storage

Supabase Storage may be used for unrelated future application assets, but it is **not
part of the Round 3 implementation**.

Do not add video storage or video-related tables, buckets, policies, APIs, or realtime
events.

# 24. Security Principles

Always assume the client is hostile.

Never trust:

```text
client cash
client holdings
client prices
client role
client team ID
client P/L
client leaderboard position
client round state
client market state
```

All sensitive operations must be validated server-side/database-side.

RLS is mandatory on application tables where appropriate.

Admin UI visibility is not an authorization mechanism.

---

# 25. RLS Principles

Every application table should have an explicit RLS strategy.

Avoid blindly using:

```sql
USING (true)
```

or:

```sql
WITH CHECK (true)
```

Policies should be based on authenticated identity, team membership, competition state, and/or admin authorization as appropriate.

Do not rely on hidden frontend routes for security.

---

# 26. Database Functions / RPC

Use PostgreSQL functions/RPCs for operations that require:

- multiple related writes
- atomicity
- financial calculations
- locking
- idempotency
- authorization checks
- state transitions

Likely RPC operations include:

```text
execute_trade()
apply_price_changes()
start_round()
end_round()
open_market()
close_market()
pause_trading()
resume_trading()
distribute_dividend()
adjust_team_cash()
```

Names are provisional and should be finalized during implementation.

Do not create RPCs merely to wrap simple reads.

---

# 27. Transactions

Any operation where partial completion would create an invalid competition state must be transactional.

Examples:

```text
trade
price application
dividend distribution
cash adjustment
important round transitions
```

Desired behavior:

```text
operation starts
     ↓
validation
     ↓
all writes
     ↓
commit
```

or:

```text
operation starts
     ↓
failure
     ↓
rollback
```

Never leave half-applied financial state.

---

# 28. Competition History

Do not design the database around destructive resets.

Competition history should remain queryable.

Avoid approaches such as:

```text
DELETE everything
INSERT new competition
```

for normal competition lifecycle operations.

Use:

```text
competitions
competition_runs
rounds
```

to separate competition definitions/runs and preserve historical data.

---

# 29. Development Workflow

Database schema changes must be version-controlled.

Preferred structure:

```text
supabase/
├── config.toml
├── migrations/
│   ├── 001_identity.sql
│   ├── 002_competitions.sql
│   ├── 003_market.sql
│   └── ...
├── functions/
└── seed.sql
```

Exact migration naming is flexible.

Every schema change should be represented by a migration.

Do not make undocumented production-only database changes through the dashboard.

---

# 30. Implementation Phases

Backend development should proceed in this order.

## Phase 0 — Foundation

- Supabase project
- Supabase CLI
- local development
- environment variables
- Next.js Supabase clients
- migration workflow
- connection verification

Status:

```text
[COMPLETE WHEN VERIFIED]
```

---

## Phase 1 — Identity

Implement:

```text
auth.users
profiles
teams
team_members
```

Implement:

- profile creation
- roles
- team membership
- RLS
- basic authentication verification

No competition logic.

Status:

```text
[COMPLETE]
```

---

## Phase 2 — Competition Structure

Implement:

```text
competitions
competition_runs
rounds
```

Implement:

- competition lifecycle
- run lifecycle
- round lifecycle
- authoritative timestamps
- admin controls
- round state validation

Status:

```text
[COMPLETE]
```

---

## Phase 3 — Market

Implement:

```text
stocks
market_quotes
price_change_batches
pending_price_changes
```

Implement:

- stock definitions
- active prices
- pending prices
- price batches
- atomic price application
- admin authorization
- audit events

Participants must never see pending prices.

Status:

```text
[COMPLETE]
```

---

## Phase 4 — Trading

Implement:

```text
holdings
trades
cash_ledger
idempotency_keys
```

Implement:

- buy
- sell
- atomic transactions
- cash validation
- holdings validation
- market validation
- round validation
- idempotency
- auditability

---

## Phase 5 — Dividends & Adjustments

Implement:

```text
dividends
dividend_payments
```

and administrative cash adjustments.

Ensure:

- atomicity
- idempotency
- auditability
- correct portfolio impact

---

## Phase 6 — Portfolio & Leaderboard

Implement authoritative queries/views/functions for:

```text
cash
holdings
portfolio value
P/L
leaderboard
```

Ensure price changes immediately affect derived portfolio values.

---

## Phase 7 — Realtime

> **Canonical implementation reference:** `SANDBOX_REALTIME_ARCHITECTURE.md`. Follow its exact event, channel, RLS, transaction/outbox, reconciliation, and reconnect requirements.

Add:

- market updates
- portfolio updates
- leaderboard updates
- round state updates
- admin state updates

Implement reconnect/reconciliation behavior.

Realtime is never treated as authoritative state.

---

## Phase 8 — Round 3 Integration

Implement and verify Round 3 as a normal trading round:

- 15-minute server-authoritative timer
- round start/end
- market/trading state
- participant trading
- admin price preparation
- atomic price application
- realtime market updates
- portfolio/P&L/leaderboard updates

No website video functionality is required.

---

# 31. Agent Rules

Agents working on SANDBOX backend must:

1. Read `BACKEND.md` before modifying backend architecture.
2. Work only on the requested phase.
3. Do not implement future phases prematurely.
4. Do not introduce Express without explicit architectural justification.
5. Do not bypass PostgreSQL for authoritative financial operations.
6. Do not trust client-provided financial state.
7. Do not weaken RLS to make frontend development easier.
8. Do not expose Supabase service-role/secret keys to the browser.
9. Use migrations for schema changes.
10. Preserve existing competition history.
11. Add constraints at the database level where possible.
12. Prefer atomic PostgreSQL functions for multi-step financial operations.
13. Add idempotency to important operations.
14. Test authorization independently of frontend UI.
15. Report architectural assumptions before making significant deviations.
16. Do not modify unrelated frontend code.
17. Do not silently change existing schema decisions.
18. If a requirement conflicts with this document, stop and report the conflict.

---

# 32. Source of Truth Hierarchy

When deciding where a piece of state belongs:

```text
PostgreSQL
    ↓
authoritative state

Supabase Realtime
    ↓
state distribution

Next.js server/client
    ↓
application interface

React state
    ↓
temporary UI representation
```

Never reverse this hierarchy for authoritative competition state.

---


---

# 34. Production Backend Contract

This section is mandatory for all backend implementation work. It supersedes any
earlier section that describes a requirement less strictly.

SANDBOX is a real-time distributed competition system. The backend must remain correct
under concurrent requests, duplicate requests, stale browsers, reconnects, and malicious
clients.

The authoritative sequence is:

```text
CLIENT REQUEST
      ↓
AUTHENTICATE
      ↓
AUTHORIZE
      ↓
VALIDATE
      ↓
DATABASE TRANSACTION / LOCK
      ↓
AUTHORITATIVE STATE CHANGE
      ↓
AUDIT + DURABLE EVENT
      ↓
COMMIT
      ↓
REALTIME DISTRIBUTION
      ↓
CLIENT RECONCILIATION
```

Realtime is a distribution mechanism. PostgreSQL is the source of truth.

---

# 35. Authoritative Competition State

Competition state must be represented as an explicit state machine.

Recommended fields:

```text
competition_id
current_run_id
current_round
round_status
market_status
trading_status
round_started_at
round_ends_at
version
```

Recommended values:

```text
round_status:
NOT_STARTED
ACTIVE
ENDED

market_status:
OPEN
CLOSED

trading_status:
OPEN
PAUSED
```

A trade is permitted only when:

```text
round_status = ACTIVE
AND current server time < round_ends_at
AND market_status = OPEN
AND trading_status = OPEN
```

The frontend may disable controls for UX, but the database must independently enforce the
same conditions.

Do not model the timer as a database counter that decrements every second.

---

# 36. Required Database Model

The existing planned schema remains valid, with the following production additions.

Required logical entities:

```text
profiles
teams
team_members

competitions
competition_runs
rounds

stocks
market_quotes

holdings
trades
cash_ledger

price_change_batches
pending_price_changes

dividends
dividend_payments

competition_events
idempotency_keys

admin_actions
```

Every competition-scoped table must carry a competition/run relationship that makes
cross-competition data leakage impossible.

Where a `competition_run_id` exists, mutations for a live competition must resolve the
active run server-side rather than trusting a browser-supplied run ID.

---

# 37. Money and Numeric Precision

Keep the existing integer-paise rule.

All authoritative monetary values must use:

```text
BIGINT
```

where one unit represents one paise.

Examples:

```text
₹1.00   -> 100
₹100.50 -> 10050
₹1,00,000 -> 10000000
```

Quantities should use:

```text
BIGINT
```

Never use JavaScript `number` arithmetic for authoritative money calculations.

The server/database converts stored paise to display rupees only at the presentation
boundary.

All calculations must avoid overflow within the supported competition limits.

---

# 38. Atomic Trade Execution

`execute_trade()` is a critical transactional operation.

The transaction must:

1. Authenticate the caller.
2. Resolve the caller's team from trusted identity/membership.
3. Resolve the active competition/run server-side.
4. Lock the competition/run state.
5. Lock the authoritative market quote.
6. Lock the relevant holding row.
7. Validate round status and `round_ends_at` using database/server time.
8. Validate market status.
9. Validate trading status.
10. Validate stock availability.
11. Validate positive integer quantity.
12. Read the authoritative current price.
13. Calculate gross trade value server-side.
14. For BUY, lock/read the team's cash state and verify sufficient cash.
15. For SELL, verify sufficient shares.
16. Update holdings.
17. Update/create authoritative cash state through the ledger mechanism.
18. Insert an immutable trade record.
19. Record idempotency result.
20. Create the durable competition event.
21. Write an audit record where appropriate.
22. Commit atomically.

If any step fails:

```text
ROLLBACK EVERYTHING
```

There must never be a partial trade.

## 38.1 Concurrency

Two simultaneous requests must not be able to spend the same cash or sell the same
shares.

Use PostgreSQL row locks and transactional isolation. Do not use frontend locks,
React state, or browser mutexes as financial concurrency controls.

## 38.2 Execution Price

The execution price is always the authoritative `market_quotes` price read inside the
transaction.

The client may send:

```text
stock_id
side
quantity
client_request_id
```

The client must not send an authoritative:

```text
execution_price
gross_value
balance_after
portfolio_value
```

---

# 39. Idempotency Contract

Every important mutation must define an idempotency key.

For trades:

```text
client_request_id UUID
```

must be unique for the actor/operation.

If a request is retried after a timeout:

```text
same request
    ↓
existing idempotency record
    ↓
return original result
    ↓
do NOT execute again
```

Required idempotency coverage:

```text
execute_trade
apply_price_changes
distribute_dividend
adjust_team_cash
start_round
end_round
open_market
close_market
pause_trading
resume_trading
reset_competition
```

Database uniqueness is the final protection against duplicate execution.

---

# 40. Cash Ledger and Balance Invariants

The ledger remains append-only.

Required invariant:

```text
current_cash =
starting_cash
+ SUM(all applicable ledger entries)
```

If a cached/current balance is stored for performance, it must be updated atomically with
the ledger and be rebuildable from the ledger.

Never silently overwrite a team's financial history.

Required invariants:

```text
cash >= 0
holding quantity >= 0
trade quantity > 0
trade execution price > 0
trade gross value = execution price × quantity
```

A reconciliation operation must be available to compare derived balances against any
cached balances.

---

# 41. Holdings and Average Cost

Holdings must be updated atomically with trades.

For BUY:

```text
new_quantity = old_quantity + bought_quantity

new_average_buy_price =
    (
      old_quantity * old_average_buy_price
      +
      bought_quantity * execution_price
    )
    / new_quantity
```

All calculations must use integer-safe/rational database arithmetic appropriate to the
competition's precision rules.

For SELL, the average buy price of the remaining shares must follow one explicitly
defined accounting rule and remain consistent across the application.

Do not allow the frontend to calculate or submit the authoritative average cost.

---

# 42. Portfolio and P/L

Portfolio value must be derived from:

```text
cash
+
Σ(quantity × current_authoritative_price)
```

The exact P/L baseline must be defined once and used everywhere.

At minimum, the implementation must distinguish:

```text
cash
market value of holdings
portfolio value
unrealized P/L
realized cash movements
dividend income
```

Do not create multiple competing P/L formulas in different components or endpoints.

Prefer database views/RPC read models so the frontend consumes one authoritative definition.

---

# 43. Leaderboard

Leaderboard ranking must be server-derived.

Primary ordering:

```text
portfolio value DESC
```

Define a deterministic tie-break rule. Recommended:

```text
portfolio value DESC
P/L DESC
team name ASC
```

The leaderboard must change after:

- trades
- applied price changes
- dividends
- authorized cash adjustments

A price change must update leaderboard visibility without requiring participants to
perform another trade.

Never trust a client-provided rank or portfolio value.

---

# 44. Price Change Batches

Pending prices remain admin-only.

A batch should have an explicit lifecycle:

```text
DRAFT
PENDING
APPLIED
CANCELLED
```

Each batch must identify:

```text
competition/run
created_by
created_at
applied_at
applied_by
status
```

Each pending item must identify:

```text
stock
old/reference price
new price
```

The authoritative apply operation must:

1. authenticate and authorize admin
2. lock the batch
3. verify batch status
4. lock affected market quotes
5. validate every requested price
6. ensure the batch still references the expected state
7. update all quotes atomically
8. mark the batch applied
9. create one coherent market event
10. commit

Participants must never be able to query draft/pending values through RLS.

---

# 45. Round and Market State Transitions

Use explicit transactional functions:

```text
start_round()
end_round()
open_market()
close_market()
pause_trading()
resume_trading()
```

Every function must:

- authenticate
- authorize
- lock the relevant competition/run
- validate the current state
- apply the transition
- increment the authoritative version
- create an audit record
- create a durable event
- commit

Invalid transitions must return stable application errors.

Examples:

```text
START_ROUND_2 while Round 1 is active -> INVALID_STATE_TRANSITION
RESUME_TRADING when already open -> INVALID_STATE_TRANSITION
TRADE after ends_at -> ROUND_ENDED
TRADE while market closed -> MARKET_CLOSED
TRADE while paused -> TRADING_PAUSED
```

Do not let a browser decide which transition is legal.

---

# 46. Round Expiry Correctness

A scheduler may finalize UI-facing state, but correctness must never depend on a
scheduler firing at the exact deadline.

Every trade checks:

```text
current_server_time < round_ends_at
```

inside the transaction.

Therefore:

```text
round_ends_at = 12:30:00
trade arrives at 12:30:00.100
=> reject
```

The displayed browser timer is informational.

---

# 47. Realtime Event Contract

Every important committed state change must create a durable event.

Recommended event fields:

```text
id UUID
competition_id UUID
run_id UUID
sequence BIGINT
event_type TEXT
entity_type TEXT NULL
entity_id UUID NULL
payload JSONB
created_at TIMESTAMPTZ
```

Sequence numbers must be monotonic within the relevant competition/run.

Recommended events:

```text
ROUND_STARTED
ROUND_ENDED
MARKET_OPENED
MARKET_CLOSED
TRADING_PAUSED
TRADING_RESUMED
TRADE_EXECUTED
PRICE_CHANGES_APPLIED
DIVIDEND_PAID
CASH_UPDATED
HOLDINGS_UPDATED
LEADERBOARD_UPDATED
VIDEO_PLAY
VIDEO_STOP
COMPETITION_RESET
```

Do not broadcast an event as authoritative before the underlying transaction commits.

---

# 48. Realtime Visibility

Use separate visibility boundaries.

Public:

```text
round state
market state
authoritative current prices
leaderboard
public video playback state
```

Team-scoped:

```text
own cash
own holdings
own trades
own transaction history
own dividend results
own trade result
```

Admin-only:

```text
pending price changes
draft batches
internal operational data
audit data
```

A participant must never be able to alter a channel identifier and subscribe to another
team's private state.

---

# 49. Realtime Recovery

A websocket connection is not a durable source of state.

On reconnect:

```text
CONNECT
  ↓
AUTHENTICATE
  ↓
SUBSCRIBE
  ↓
FETCH AUTHORITATIVE SNAPSHOT
  ↓
COMPARE LAST EVENT SEQUENCE
  ↓
REPLAY MISSING EVENTS OR ACCEPT FRESH SNAPSHOT
  ↓
RESUME LIVE UPDATES
```

If a client detects:

```text
incoming.sequence > lastSequence + 1
```

it must reconcile rather than guessing what happened.

A fresh authoritative snapshot wins over stale local state.

---

# 50. Initial Snapshot APIs

The application must support a complete role-appropriate initial state.

Participant snapshot:

```text
competition/run state
round state
market state
server timestamps
current market prices
own cash
own holdings
own transaction history
leaderboard
active video playback state
```

Admin snapshot:

```text
competition/run state
round state
market state
server timestamps
current prices
pending price batches
active playback state
leaderboard
operational status
```

Never include admin-only pending data in the participant snapshot.

---

# 51. Server Time

Expose authoritative timestamps:

```text
server_now
round_started_at
round_ends_at
```

The frontend derives the display countdown from those values.

Do not persist a decrementing `seconds_remaining`.

Where client/server clock drift matters, estimate server time from request timing and
periodically reconcile.

---

# 52. Authentication and Authorization

## Admin

Use Supabase Auth.

Admin access must come from trusted server-side role/authorization state.

Never trust a request field such as:

```text
isAdmin: true
role: "admin"
```

## Participant

Participant identity must be bound to a specific team and competition/run.

A participant must not be able to change:

```text
team_id
competition_id
run_id
```

simply by changing request JSON or query parameters.

Authorization must be tested independently from the frontend.

---

# 53. RLS Requirements

RLS is mandatory for every Supabase-exposed application table.

Default posture:

```text
DENY
```

then explicitly grant required access.

Participants:

- may read public competition state
- may read current market prices
- may read leaderboard
- may read their own team data
- may read their own trades/ledger
- may not read pending prices
- may not read other teams' financial state
- may not read admin actions
- may not write authoritative financial tables directly

Admins:

- may access operational data permitted by their role
- privileged mutations should still use explicit server-side functions/RPCs

Do not weaken RLS because a frontend component is inconvenient to implement.

---

# 54. API and Validation Boundary

Every mutation must use a typed request schema.

Recommended validation:

```text
Zod
```

Validate:

- UUIDs
- enum values
- quantities
- prices
- round numbers
- IDs
- request/idempotency keys
- string lengths
- required fields

Reject unexpected input where practical.

Never interpolate user input into SQL.

The database must remain the final integrity boundary even when API validation exists.

---

# 55. Standard Error Contract

Never expose raw PostgreSQL/Supabase errors.

Use stable application codes.

Minimum set:

```text
UNAUTHORIZED
FORBIDDEN
INVALID_REQUEST
INVALID_STATE_TRANSITION
ROUND_NOT_ACTIVE
ROUND_ENDED
MARKET_CLOSED
TRADING_PAUSED
STOCK_UNAVAILABLE
INVALID_QUANTITY
INSUFFICIENT_CASH
INSUFFICIENT_SHARES
DUPLICATE_REQUEST
STALE_STATE
PRICE_CHANGE_INVALID
NO_PENDING_CHANGES
DIVIDEND_INVALID
VIDEO_NOT_FOUND
COMPETITION_RESETTING
RATE_LIMITED
INTERNAL_ERROR
```

Response shape:

```json
{
  "ok": false,
  "requestId": "uuid",
  "code": "TRADING_PAUSED",
  "message": "Trading is currently paused."
}
```

Successful mutations should return the authoritative result and, where applicable, the
event sequence:

```json
{
  "ok": true,
  "requestId": "uuid",
  "data": {},
  "eventSequence": 123
}
```

---

# 56. Admin Concurrency

Two admin browsers must not be able to corrupt competition state.

Use:

- row locks
- explicit state validation
- version checks
- idempotency

Where useful:

```text
expected_version
```

can be submitted by the admin UI.

If the version has changed:

```text
STALE_STATE
```

and the UI must refetch authoritative state.

---

# 57. Dividends

`distribute_dividend()` must:

1. authenticate admin
2. authorize admin
3. validate stock and amount
4. lock relevant holdings
5. snapshot eligible quantities
6. calculate each team's payment server-side
7. insert immutable payment records
8. create cash ledger entries
9. update balances atomically
10. create team/public realtime events as appropriate
11. write audit data
12. commit

A dividend must never be paid twice because of a retry.

Do not determine historical eligibility later from mutable holdings.

---

# 58. Administrative Cash Adjustments

Every manual adjustment must include:

```text
team
amount in paise
reason
admin actor
request/idempotency ID
timestamp
```

Adjustments are ledger entries, not silent balance overwrites.

Negative adjustments must not make cash negative unless an explicitly approved
administrative correction mechanism exists and is documented.

---

# 60. Competition Reset

Reset is destructive and must be explicit.

Recommended behavior:

```text
active run -> closed/archived
new run -> initialized
```

Historical data must remain queryable.

Do not implement production reset as:

```text
DELETE everything
INSERT everything again
```

The reset operation must be transactional and auditable.

It must initialize:

- rounds
- prices
- pending changes
- holdings
- starting cash
- leaderboard
- playback state
- event state

and emit:

```text
COMPETITION_RESET
```

---

# 61. Audit Logging

Create an append-only `admin_actions`/audit mechanism.

Audit at minimum:

```text
start/end round
open/close market
pause/resume trading
create/edit/cancel/apply price batch
pay dividend
adjust team cash
play/stop video
reset run
authorization changes
```

Each record should contain:

```text
actor
competition/run
operation
request_id
timestamp
non-sensitive metadata
```

Never log:

- passwords
- access tokens
- service-role keys
- secrets
- full authorization headers

---

# 62. Rate Limiting

Rate-limit:

- participant session creation
- trade requests
- repeated failed requests
- admin mutations
- playback commands

Rate limits are abuse protection, not financial correctness.

A rate limiter must never replace transactional locking or idempotency.

---

# 63. Database Constraints and Indexes

Use database constraints for invariants.

Examples:

```text
price > 0
quantity >= 0
trade_quantity > 0
round_number IN (1,2,3)
valid enum/status values
unique team membership
unique stock symbol per competition
unique holding per team/stock/run
unique idempotency key per actor/operation
```

Index common access paths:

```text
rounds(competition_run_id, round_number)
market_quotes(competition_run_id, stock_id)
pending_price_changes(batch_id, status)
holdings(competition_run_id, team_id, stock_id)
trades(competition_run_id, team_id, created_at DESC)
cash_ledger(competition_run_id, team_id, created_at DESC)
competition_events(competition_run_id, sequence)
idempotency_keys(actor_id, operation, request_key)
team_members(user_id, team_id)
```

Use query plans before adding redundant indexes.

---

# 64. Event/Outbox Reliability

For important events, prefer an outbox-style record.

Within the same transaction:

```text
BEGIN
  update authoritative state
  insert competition_event
COMMIT
```

This guarantees that the durable event and state mutation succeed or fail together.

Realtime publication may happen after commit.

If realtime delivery fails, clients recover through snapshot/reconciliation.

The event table is not itself a replacement for the database source of truth.

---

# 65. Derived Read Models

Prefer database views/read models for:

```text
current_competition_state
participant_portfolio
participant_holdings
leaderboard
market
```

Derived data must have one definition.

If a cache/materialized table exists:

- document its source of truth
- document invalidation
- make it rebuildable
- test reconciliation

Never create an unrecoverable derived balance.

---

# 66. Security and Secrets

Expected environment variables may include:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Only the public keys may reach browser code.

The service-role key is server-only.

Never use:

```text
NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
```

Never commit secrets.

Use separate development/staging/production environments.

---

# 67. Testing Requirements

Backend implementation is not complete without tests.

## Unit

Test:

- state transitions
- trade calculations
- average cost
- portfolio value
- P/L
- leaderboard sorting
- dividend calculations
- validation/error mapping

## Integration

Test:

- BUY
- SELL
- insufficient cash
- insufficient shares
- market closed
- trading paused
- round ended
- price batch apply
- dividends
- cash adjustment
- reset
- authorization
- RLS

## Concurrency

At minimum:

```text
two simultaneous BUYs against the same cash
two simultaneous SELLs against the same shares
duplicate trade request
two simultaneous price applies
admin ends round while trade arrives
trade at/after round expiry
duplicate dividend request
duplicate admin transition
```

## Realtime

Test:

```text
admin transition -> all clients converge
trade -> correct team state updates
price apply -> all participants receive new price
leaderboard -> ranks converge
video command -> playback converges
disconnect -> reconnect -> authoritative recovery
sequence gap -> snapshot/reconciliation
```

---

# 68. Production Observability

Use structured logs containing:

```text
request_id
competition_id
run_id
actor_id
operation
result
duration_ms
timestamp
```

Metrics should cover at least:

```text
trade success/failure count
trade latency
database transaction failures
realtime connection/reconnect rate
event publication failures
API error rate
RLS/auth failures
```

Do not log sensitive credentials or participant session secrets.

---

# 69. Backup and Recovery

Production must have a tested database backup/restore strategy.

Before a live competition:

- verify backups exist
- verify restoration works
- verify migrations can rebuild the schema
- verify seed/configuration procedures
- document recovery ownership and steps

Do not consider backups complete merely because the provider advertises backups.
A restore test is required.

---

# 70. Migration Discipline

Every schema change must be a migration.

Never make undocumented production-only edits through the Supabase dashboard.

Migrations must be:

- ordered
- version-controlled
- tested against a fresh database
- tested against an upgrade path where required
- safe to deploy

Seed data must be separated from schema migrations.

---

# 71. Backend Agent Rules

Agents implementing this backend must:

1. Read this file before backend changes.
2. Read `AGENTS.md` for the corresponding frontend contract, and read `SANDBOX_REALTIME_ARCHITECTURE.md` for the canonical realtime contract.
3. Treat PostgreSQL as authoritative.
4. Never bypass transactional financial operations.
5. Never trust client financial state.
6. Never weaken RLS to fix a UI problem.
7. Never expose service-role secrets.
8. Use migrations for schema changes.
9. Preserve competition history.
10. Add database constraints where possible.
11. Use idempotency for important mutations.
12. Test authorization without relying on UI controls.
13. Test concurrency for financial mutations.
14. Keep realtime as distribution, not authority.
15. Reconcile state after reconnects.
16. Do not modify unrelated frontend code unless the backend contract requires it.
17. Do not silently change established schema decisions.
18. If requirements conflict, identify the conflict before implementation.
19. Do not mark a phase complete until its acceptance criteria and tests pass.
20. Prefer the smallest production-safe implementation over unnecessary infrastructure.

---

# 72. Implementation Order

The existing phase order remains:

```text
Phase 0 — Foundation
Phase 1 — Identity
Phase 2 — Competition Structure
Phase 3 — Market
Phase 4 — Trading
Phase 5 — Dividends & Adjustments
Phase 6 — Portfolio & Leaderboard
Phase 7 — Realtime
Phase 8 — Round 3 Integration
Phase 9 — Production Hardening
```

However, realtime contracts, RLS, idempotency, and test infrastructure must be designed
during the relevant earlier phases rather than postponed until the end.

Do not build a fake backend first and "secure it later."

---

# 73. Production Definition of Done

The backend is production-ready only when all of the following are true:

```text
[ ] Schema is migration-driven
[ ] RLS is enabled and tested
[ ] Admin authorization is server-enforced
[ ] Participant identity is team-scoped
[ ] Competition/run state is authoritative
[ ] Round timing uses server timestamps
[ ] Trade execution is transactional
[ ] BUY is concurrency-safe
[ ] SELL is concurrency-safe
[ ] Cash cannot become invalid
[ ] Holdings cannot become negative
[ ] Trade requests are idempotent
[ ] Prices are server-authoritative
[ ] Pending prices are admin-only
[ ] Price application is atomic
[ ] Portfolio/P&L is server-derived
[ ] Leaderboard is server-derived
[ ] Dividends are atomic and idempotent
[ ] Admin adjustments are auditable
[ ] Realtime events are durable
[ ] Realtime events are ordered
[ ] Reconnect reconciliation works
[ ] Private data is not exposed through public channels
[ ] Reset preserves historical runs
[ ] Audit logs exist
[ ] Structured logging exists
[ ] Rate limiting exists
[ ] Backups are verified
[ ] Restore has been tested
[ ] Unit tests pass
[ ] Integration tests pass
[ ] RLS tests pass
[ ] Concurrency tests pass
[ ] Realtime tests pass
[ ] Full three-round end-to-end simulation passes
```

---

# 74. Final Backend Principle

The backend is not complete when CRUD operations work.

It is complete when the entire competition can run from start to finish while surviving:

```text
duplicate requests
concurrent trades
stale browsers
network disconnects
reconnects
admin races
round expiry races
malicious clients
database rollbacks
server restarts
```

The final architecture is:

```text
                 ┌──────────────────────┐
                 │       CLIENTS        │
                 │ Participant / Admin  │
                 └──────────┬───────────┘
                            │
                     authenticated
                       mutations
                            │
                            ▼
                 ┌──────────────────────┐
                 │      NEXT.JS API     │
                 │ validation / auth    │
                 └──────────┬───────────┘
                            │
                            ▼
                 ┌──────────────────────┐
                 │ POSTGRESQL / RPC     │
                 │ transactions / locks │
                 │ constraints / RLS    │
                 └───────┬──────────────┘
                         │
                committed authoritative
                         state
                         │
              ┌──────────┴───────────┐
              ▼                      ▼
      ┌──────────────┐      ┌────────────────┐
      │ competition  │      │ durable events │
      │ state        │      │ / audit        │
      └──────────────┘      └───────┬────────┘
                                    │
                                    ▼
                           ┌────────────────┐
                           │ Supabase       │
                           │ Realtime       │
                           └───────┬────────┘
                                   │
                                   ▼
                              ALL RELEVANT
                                CLIENTS
```

**The database decides. Realtime distributes. The frontend displays.**

For all realtime implementation details, defer to `SANDBOX_REALTIME_ARCHITECTURE.md`.

# 33. Current Status

| Phase | Status |
|---|---|
| Phase 0 — Foundation | Complete |
| Phase 1 — Identity | Complete |
| Phase 2 — Competition | Complete |
| Phase 3 — Market | Complete |
| Phase 4 — Trading | Not started |
| Phase 5 — Dividends/Adjustments | Not started |
| Phase 6 — Portfolio/Leaderboard | Not started |
| Phase 7 — Realtime | Not started |
| Phase 8 — Videos | Not started |
| Phase 9 — Production Hardening | Not started |

This document should be updated when an architectural decision is finalized.

Individual agent prompts should reference this document rather than redefining the entire backend architecture.

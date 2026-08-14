# SANDBOX Backend Architecture

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

Administrators control stock price changes while participants trade based on synchronized video content.

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

videos

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

# 22. Round 3 Video Architecture

Round 3 requires synchronized video playback.

The admin is authoritative for playback state.

Relevant state may include:

```text
video
playing/paused
position
started_at
updated_at
```

The exact synchronization mechanism will be designed during the Round 3 implementation phase.

Do not make each browser independently authoritative.

The system must tolerate:

- network latency
- reconnects
- devices joining late
- paused playback
- seeks

---

# 23. Supabase Storage

Round 3 videos will use Supabase Storage.

Videos should not be stored directly inside PostgreSQL.

The database should store metadata/reference information in:

```text
videos
```

Storage access must be controlled appropriately.

Participants should only receive access to videos they are authorized to view.

---

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

Add:

- market updates
- portfolio updates
- leaderboard updates
- round state updates
- admin state updates

Implement reconnect/reconciliation behavior.

Realtime is never treated as authoritative state.

---

## Phase 8 — Round 3 Videos

Implement:

```text
videos
```

plus:

- Storage
- video authorization
- admin playback controls
- synchronized playback
- pause/resume
- seek
- reconnect handling

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

This document should be updated when an architectural decision is finalized.

Individual agent prompts should reference this document rather than redefining the entire backend architecture.
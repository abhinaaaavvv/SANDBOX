# SANDBOX — COMPLETE PRODUCTION BACKEND IMPLEMENTATION

Repository:
https://github.com/abhinaaaavvv/SANDBOX

You are responsible for taking the existing SANDBOX application from its current
frontend/prototype state to a fully functional, production-ready competition platform.

The frontend/UI already exists. Preserve it.

The backend, database, authentication, authorization, competition engine, trading,
Realtime synchronization, security, and production reliability must be implemented
and connected to the existing UI.

This is NOT a request to build a demo backend.

The goal is to make the existing SANDBOX product actually work end-to-end.

---

# 1. READ THE PROJECT CONTRACT FIRST

Before modifying code, read:

1. `AGENTS.md`
2. `BACKEND.md`
3. `SANDBOX_REALTIME_ARCHITECTURE.md`

Also inspect:

- complete source tree
- existing Supabase integration
- migrations
- scripts
- environment configuration
- frontend state management
- API/server actions
- authentication
- admin UI
- participant UI
- existing database code
- existing Realtime code
- existing tests
- `.agents/skills/`
- Supabase/Postgres-specific skills

The documents define the intended architecture.

The repository defines the current implementation.

Your task is to bring the current implementation into compliance with the architecture.

Do not blindly rewrite everything.

---

# 2. FIRST: AUDIT THE CODEBASE

Before implementing substantial functionality, inspect the repository.

Identify:

- what already works
- what is mocked
- what is hardcoded
- what is incomplete
- what is broken
- duplicated logic
- dead code
- frontend-only state that should be server-authoritative
- existing database tables
- existing migrations
- existing RPCs
- existing API routes
- existing Realtime code
- authentication implementation
- authorization implementation
- admin functionality
- participant functionality

Search for prototype behavior:

```text
TODO
FIXME
mock
dummy
fake
placeholder
hardcoded
setInterval
setTimeout
console.log
localStorage
sessionStorage
simulation
```

Do not blindly remove legitimate UI constants.

Determine what is prototype behavior and replace only what needs to become real.

After auditing, implement the system. Do not stop at an audit report.

---

# 3. PRESERVE THE EXISTING FRONTEND

The existing UI is the product.

Do NOT:

- redesign the application
- replace the existing layout
- rebuild the frontend
- replace working components unnecessarily
- introduce unnecessary frameworks
- change the visual design without a functional reason

Instead:

```text
existing UI
    ↓
connect it to real backend state
    ↓
remove fake/mock behavior
    ↓
make every interaction functional
```

Only modify frontend code when necessary for backend integration.

The goal is:

> Same product, now actually functional.

---

# 4. CORE ARCHITECTURE

The final architecture must be:

```text
                    FRONTEND
                       │
                       │ authenticated requests
                       ▼
                 SERVER/API
                       │
                       │ validation / authorization
                       ▼
                  POSTGRESQL
                       │
                authoritative state
                       │
             ┌─────────┴─────────┐
             │                   │
             ▼                   ▼
       database state      durable notification
                                 │
                                 ▼
                        SUPABASE REALTIME
                                 │
                                 ▼
                              clients
```

Core rule:

> PostgreSQL decides.
> The server validates/orchestrates.
> Realtime distributes.
> The frontend displays.

The browser is never authoritative.

Realtime is never authoritative.

React state is never authoritative.

The client must never determine:

- cash
- holdings
- execution price
- portfolio value
- P/L
- leaderboard rank
- competition state
- round state
- trading state
- market state
- authoritative timer

---

# 5. DATABASE FIRST

Implement the actual PostgreSQL database through Supabase migrations.

Do not rely on manually configuring the Supabase dashboard.

The final schema must support the concepts specified in `BACKEND.md`, including:

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

admin_actions
idempotency_keys

realtime_notifications
```

Adapt exact names/types to the existing codebase where appropriate.

Do not create duplicate competing concepts.

---

# 6. DATABASE INTEGRITY

Use PostgreSQL constraints wherever possible.

Enforce:

```text
positive stock prices
positive trade quantities
non-negative holdings
valid foreign keys
valid competition states
valid round numbers
unique team membership
unique team/stock holdings
unique stock symbols where appropriate
unique idempotency keys
```

Add appropriate indexes.

Use integer smallest units such as paise for authoritative monetary values.

Never use floating point for authoritative money.

---

# 7. AUTHENTICATION

Use the existing Supabase Auth integration.

Inspect the current:

- client
- server
- middleware
- session handling

before changing it.

Implement reliable:

```text
participant login
admin login
session persistence
protected routes
server-side identity resolution
logout
```

Never trust identity information supplied by the browser.

Never trust request fields such as:

```text
userId
teamId
role
isAdmin
```

Derive identity from the authenticated Supabase session.

---

# 8. AUTHORIZATION

Participants may:

```text
access their own team
trade for their own team
view allowed competition state
view public market state
view their portfolio
view leaderboard
```

Participants may NOT:

```text
modify prices
modify cash
modify holdings
modify competition state
access another team's private data
access admin state
perform admin operations
```

Admins may perform only authorized competition-management operations.

Never rely on UI visibility as a security mechanism.

---

# 9. RLS

Enable and correctly configure Row Level Security.

Default:

```text
DENY
```

Then explicitly grant required access.

Run-scoped access must verify actual membership in the exact competition/run.

Team-scoped access must verify actual membership in the exact team.

Admin-scoped access must verify trusted admin identity and run authorization.

Do not use:

```text
authenticated users can read everything
```

as a shortcut.

Explicitly test:

```text
participant A cannot access participant B's private data
team A cannot access team B's private data
participant cannot access admin data
participant cannot access another competition/run
```

---

# 10. COMPETITION STATE MACHINE

Implement the competition engine specified in `BACKEND.md`.

The database owns:

```text
competition
competition run
current round
round status
market status
trading status
round start timestamp
round end timestamp
version
```

Round states:

```text
NOT_STARTED
ACTIVE
ENDED
```

Market:

```text
OPEN
CLOSED
```

Trading:

```text
OPEN
PAUSED
```

Implement transactional operations:

```text
start_round()
end_round()
open_market()
close_market()
pause_trading()
resume_trading()
reset_competition()
```

Every mutation must:

1. authenticate
2. authorize
3. lock relevant state
4. validate current state
5. perform the transition
6. increment version where appropriate
7. create the durable notification
8. commit atomically

Invalid transitions must fail cleanly.

---

# 11. SERVER-AUTHORITATIVE TIMER

Every competition round is 15 minutes.

Do NOT use a frontend countdown as the authoritative timer.

Persist:

```text
round_started_at
round_ends_at
```

Use server/database time.

A trade is valid only if:

```text
round is ACTIVE
AND server time < round_ends_at
AND market is OPEN
AND trading is OPEN
```

The frontend timer is display-only.

If the browser thinks there is time remaining but the database says the round ended,
the trade is rejected.

If the browser timer is behind the database, the database still decides.

Do not persist a decrementing `seconds_remaining` counter.

---

# 12. TRADING ENGINE

Implement real BUY and SELL execution.

The client sends only:

```text
stock_id
side
quantity
client_request_id
```

The client must NOT send authoritative:

```text
execution_price
gross_value
balance_after
portfolio_value
```

The backend/database calculates those values.

## BUY

Inside one transaction:

```text
lock authoritative team balance
lock relevant holding
lock authoritative market quote
validate competition/round/market/trading state
validate quantity
calculate cost
verify cash
deduct cash
increase holding
update average cost
insert trade
insert cash ledger entry
insert durable realtime notification
commit
```

## SELL

Inside one transaction:

```text
lock authoritative team balance
lock relevant holding
lock authoritative market quote
validate competition/round/market/trading state
validate quantity
verify shares
decrease holding
credit cash
insert trade
insert cash ledger entry
insert durable realtime notification
commit
```

If anything fails:

```text
ROLLBACK EVERYTHING
```

There must never be a partial trade.

---

# 13. CONCURRENCY

The system must remain correct under concurrent requests.

Test:

```text
two simultaneous BUYs
two simultaneous SELLs
BUY + SELL simultaneously
trade + round expiry
trade + trading pause
trade + price update
duplicate request
```

Use PostgreSQL row locks on the actual mutable authoritative rows.

Do NOT use:

```text
React state
browser mutexes
frontend locks
initial_capital
```

as financial concurrency controls.

Acquire locks in a consistent order to minimize deadlocks.

The lock must protect the actual mutable balance/holding/quote state.

---

# 14. IDEMPOTENCY

All critical mutations must be idempotent.

At minimum:

```text
execute_trade
start_round
end_round
open_market
close_market
pause_trading
resume_trading
apply_price_changes
distribute_dividend
adjust_team_cash
reset_competition
```

For trades, use:

```text
client_request_id
```

with a database uniqueness guarantee.

If the same request arrives twice:

```text
execute once
return the original result
```

Never double-charge or double-credit because of retries.

---

# 15. CASH LEDGER

Implement an append-only financial ledger.

Track at minimum:

```text
starting capital
BUY
SELL
DIVIDEND
ADMIN_ADJUSTMENT
```

Never silently overwrite financial history.

The authoritative balance must remain mathematically consistent with the ledger.

If a cached balance exists:

- update it atomically
- make it rebuildable
- periodically reconcile it against the ledger if appropriate

---

# 16. HOLDINGS

Implement authoritative holdings:

```text
team
stock
quantity
average_buy_price
```

BUY:

```text
increase quantity
recalculate weighted average cost
```

SELL:

```text
verify sufficient quantity
decrease quantity
```

Never allow negative holdings.

The browser never determines authoritative holdings.

---

# 17. MARKET

Implement authoritative market quotes.

Participants can read current prices.

Only authorized admins can modify prices.

All authoritative prices come from PostgreSQL.

---

# 18. PRICE CHANGE SYSTEM

Implement the price-change workflow specified in `BACKEND.md`.

Use a pending/draft mechanism:

```text
DRAFT
↓
PENDING
↓
APPLIED
```

Admin workflow:

```text
enter prices
↓
save pending changes
↓
review
↓
Apply Price Changes
↓
atomic transaction
↓
new prices become authoritative
↓
durable realtime notification
```

Participants must NEVER see pending prices.

Applying a batch twice must be impossible.

The Apply operation must lock the batch and affected market rows.

---

# 19. DIVIDENDS

Implement dividend distribution transactionally.

Process:

```text
authenticate admin
↓
authorize admin
↓
lock/snapshot eligible holdings
↓
calculate payout
↓
insert immutable dividend payment records
↓
insert cash ledger entries
↓
update balances
↓
create durable realtime notifications
↓
commit
```

The same dividend must never be distributed twice.

---

# 20. PORTFOLIO / P&L

Portfolio value must be server-derived.

Conceptually:

```text
portfolio_value =
cash
+
sum(quantity × current_market_price)
```

Define P/L exactly once.

Use the same definition everywhere.

Do not create different P/L formulas in different components.

Prefer database views/RPC read models for authoritative portfolio data.

---

# 21. LEADERBOARD

Leaderboard is server-derived.

Do not calculate authoritative ranking in React.

Use deterministic ordering, for example:

```text
portfolio_value DESC
```

with a deterministic tie-breaker.

Leaderboard must converge after:

```text
trade
price change
dividend
cash adjustment
```

The client never submits rank or portfolio value.

---

# 22. REALTIME

`SANDBOX_REALTIME_ARCHITECTURE.md` is the canonical Realtime contract.

Follow it exactly.

Do NOT invent another Realtime architecture.

Realtime events are signals that tell clients that authoritative state may have changed.

They are NOT authoritative financial payloads.

Use:

```text
PostgreSQL transaction
        ↓
authoritative mutation
        ↓
insert durable realtime notification
        ↓
COMMIT
        ↓
Supabase Realtime
        ↓
client receives signal
        ↓
client refetches authoritative state
```

Mutation and notification insertion must be atomic.

If Realtime delivery fails:

```text
database remains correct
reconnect performs authoritative refetch
```

The durable notification table acts as a transactional outbox for Realtime signals.

It is NOT the source of financial truth.

---

# 23. REALTIME CHANNEL SECURITY

Use the channels defined by `SANDBOX_REALTIME_ARCHITECTURE.md`:

```text
run:<run_id>
team:<team_id>
admin:<run_id>
```

RLS must enforce:

```text
run channel
→ exact competition/run authorization

team channel
→ exact team membership

admin channel
→ trusted admin role + authorized run
```

A participant must not be able to access another team's channel simply by changing
the channel name.

Explicitly test:

```text
cross-team subscription
cross-run subscription
participant → admin channel
unauthenticated → any channel
```

---

# 24. REALTIME RECOVERY

When a browser reconnects:

```text
authenticate
↓
subscribe
↓
fetch authoritative snapshot
↓
replace stale local state
↓
resume Realtime
```

Do not reconstruct financial state solely from missed events.

Duplicate notifications must not cause duplicate financial mutations.

Missed notifications must be recoverable through authoritative refetch.

Multiple tabs and multiple devices must converge.

---

# 25. ROUND 3 — IMPORTANT PRODUCT RULE

Round 3 EXISTS.

Round 3 is a normal 15-minute trading round.

There is NO video functionality inside SANDBOX.

Do NOT implement:

```text
video player
video upload
video storage
video playback
video synchronization
video realtime events
VIDEO_* events
```

Any external video/content used by organizers is completely outside SANDBOX.

SANDBOX only manages:

```text
Round 3 timer
market
trading
prices
price changes
portfolio
P/L
leaderboard
admin controls
Realtime
```

---

# 26. SERVER API / RPC LAYER

Create a clean server boundary.

Critical transactional operations should use appropriate PostgreSQL RPCs/server operations:

```text
execute_trade
start_round
end_round
open_market
close_market
pause_trading
resume_trading
apply_price_changes
distribute_dividend
adjust_team_cash
reset_competition
```

Validate inputs at the application boundary.

Use Zod where appropriate.

Never expose raw database errors to the client.

---

# 27. ERROR CONTRACT

Use stable application errors:

```text
UNAUTHORIZED
FORBIDDEN
INVALID_REQUEST
INVALID_STATE_TRANSITION
ROUND_NOT_ACTIVE
ROUND_ENDED
MARKET_CLOSED
TRADING_PAUSED
INSUFFICIENT_CASH
INSUFFICIENT_SHARES
INVALID_QUANTITY
DUPLICATE_REQUEST
STALE_STATE
PRICE_CHANGE_INVALID
DIVIDEND_INVALID
RATE_LIMITED
INTERNAL_ERROR
```

Never expose:

```text
SQL errors
stack traces
database internals
service-role credentials
secrets
```

---

# 28. ADMIN UI

Connect the existing admin UI to real backend functionality.

Existing controls such as:

```text
Start Round
End Round
Open Market
Close Market
Pause Trading
Resume Trading
Apply Price Changes
Dividend
Cash Adjustment
Reset Competition
```

must perform real operations.

Every operation needs:

- loading state
- success handling
- error handling
- duplicate-click protection
- authoritative state update
- Realtime convergence

No fake handlers.

No `console.log()` pretending to perform an operation.

---

# 29. PARTICIPANT UI

Connect the existing participant UI to real:

```text
current round
timer
market
prices
cash
holdings
portfolio
P/L
trade history
leaderboard
```

BUY/SELL must perform real transactions.

After a successful trade, the system must correctly converge on:

```text
cash
holdings
portfolio
P/L
leaderboard
trade history
```

---

# 30. REMOVE PROTOTYPE BEHAVIOR

Find all fake backend behavior.

Replace it with real functionality.

Do not leave production flows depending on:

```text
fake trades
fake prices
fake leaderboard
fake portfolio
fake timers
fake admin actions
fake authentication
mock database state
```

Static UI configuration is fine.

Prototype behavior is not.

---

# 31. ENVIRONMENT / SECRETS

Use environment variables.

At minimum, inspect and correctly configure the existing Supabase environment setup.

Never expose the Supabase service-role key to client code.

Never create:

```text
NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
```

Verify:

```text
.gitignore
server/client boundaries
environment configuration
```

No secrets may be committed.

---

# 32. MIGRATIONS

All database changes must be represented by migrations.

Do not rely on manual dashboard changes.

A fresh database must be reproducible from repository migrations.

Include:

- schema
- indexes
- constraints
- RLS
- functions
- triggers where required
- Realtime notification infrastructure
- safe seed/configuration where appropriate

---

# 33. SEED / BOOTSTRAP

Inspect the existing bootstrap and development seed scripts.

Make them work with the final schema.

Provide a safe development setup capable of creating:

```text
admin
competition
competition run
teams
participants
stocks
initial prices
starting capital
rounds
```

Do not automatically create fake production users.

---

# 34. TESTING

Add proper automated tests.

## Unit tests

Test:

```text
trade calculations
average cost
portfolio calculation
P/L
leaderboard sorting
dividend calculation
state transitions
validation
```

## Integration tests

Test:

```text
BUY
SELL
insufficient cash
insufficient shares
market closed
trading paused
round ended
price changes
dividends
cash adjustments
reset
authentication
authorization
RLS
```

## Concurrency tests

Test:

```text
simultaneous BUYs
simultaneous SELLs
BUY + SELL
duplicate trade request
trade + round expiry
trade + pause
trade + price change
duplicate dividend
duplicate admin transition
```

## Realtime tests

Test:

```text
trade notification
price change notification
admin state notification
leaderboard convergence
disconnect/reconnect
missed notification recovery
duplicate notification handling
multiple tabs
multiple devices
cross-team isolation
cross-run isolation
```

---

# 35. FULL END-TO-END TEST

Before declaring completion, verify:

```text
1. Create competition
2. Create competition run
3. Create teams
4. Create participants
5. Authenticate participant
6. Authenticate admin
7. Start Round 1
8. Open market
9. BUY
10. Verify cash
11. Verify holdings
12. Verify portfolio
13. Verify P/L
14. Verify leaderboard
15. Pause trading
16. Verify trading is rejected
17. Resume trading
18. Close market
19. Verify trading is rejected
20. Prepare price changes
21. Verify participants cannot see pending prices
22. Apply price changes
23. Verify participants converge on new prices
24. Run another round
25. Run Round 3
26. Verify Round 3 is a normal 15-minute trading round
27. End competition
28. Verify final leaderboard
29. Verify financial history
30. Test reconnect
31. Test duplicate requests
32. Test concurrent requests
```

---

# 36. PRODUCTION VERIFICATION

Run:

```bash
bun run lint
bun run build
```

Run the complete test suite.

Fix every error.

Do not merely report failures.

If a test runner does not exist, introduce an appropriate minimal testing setup.

Also verify:

```text
fresh database migrations
bootstrap
admin authentication
participant authentication
competition lifecycle
trading
Realtime
reconnect
authorization
RLS
```

---

# 37. IMPLEMENTATION ORDER

Follow this dependency order:

```text
PHASE 0
Repository audit
        ↓
PHASE 1
Database + migrations + constraints + indexes + RLS
        ↓
PHASE 2
Authentication + authorization
        ↓
PHASE 3
Competition/run/round state machine
        ↓
PHASE 4
Market + price management
        ↓
PHASE 5
Trading + holdings + cash ledger
        ↓
PHASE 6
Portfolio + P/L + leaderboard
        ↓
PHASE 7
Dividends + admin adjustments
        ↓
PHASE 8
Realtime + reconnect/reconciliation
        ↓
PHASE 9
Connect existing frontend
        ↓
PHASE 10
Testing + concurrency + security
        ↓
PHASE 11
Production hardening
        ↓
FINAL
Full end-to-end competition test
```

After every phase:

```text
implement
↓
test
↓
fix
↓
verify
↓
continue
```

Do not knowingly carry broken functionality into the next phase.

---

# 38. DO NOT ASK ME TO IMPLEMENT THE NEXT STEP

You have:

```text
AGENTS.md
BACKEND.md
SANDBOX_REALTIME_ARCHITECTURE.md
the existing repository
```

Use them.

Do not stop after saying:

> "The database should be implemented next."

Actually implement it.

Do not ask:

> "Should I start with Supabase?"

Start.

Only ask a question if there is a genuinely unresolved PRODUCT requirement that cannot be
determined from the repository or specification documents.

For implementation decisions, choose the smallest architecture-consistent solution and
continue.

---

# 39. DO NOT DECLARE SUCCESS PREMATURELY

The application is NOT complete merely because:

```text
the page loads
the build passes
buttons don't crash
```

Completion means:

```text
authentication works
authorization works
RLS works
database works
competition engine works
round timer is authoritative
market works
trading works
cash ledger works
holdings work
portfolio works
P/L works
leaderboard works
price changes work
dividends work
admin operations work
participant operations work
Realtime works
reconnect works
idempotency works
concurrency works
auditability works
migrations work
tests pass
lint passes
build passes
```

---

# 40. FINAL RULE

Build the system as if the competition is going live and real participants will use it.

Assume:

- users refresh randomly
- users disconnect
- requests are duplicated
- requests arrive concurrently
- the frontend can be manipulated
- client clocks disagree
- Realtime events can be missed
- Realtime events can be duplicated
- admins double-click controls
- participants attempt unauthorized requests
- requests arrive late
- browsers become completely untrusted

The database must remain correct under all of these conditions.

Start with the repository audit.

Then implement the complete system.

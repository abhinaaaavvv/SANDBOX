# Phase 9.7 — Real Admin Operations Integration

## Objective

Replace the remaining MOCK admin operations in the frontend with authoritative Supabase/PostgreSQL operations. PostgreSQL is the source of truth. The frontend must never become the source of truth for round status, market status, trading status, stock prices, dividends, team cash, or competition state.

## Existing RPC Inventory (Phase 2 + Phase 3 + Phase 5)

### Phase 2 — Round Lifecycle RPCs

| Function | Signature | Status |
|---|---|---|
| `start_round(p_round_id uuid)` | `RETURNS jsonb` · `STABLE` · `SECURITY DEFINER` | ✅ Exists |
| `end_round(p_round_id uuid)` | `RETURns jsonb` · `STABLE` · `SECURITY DEFINER` | ✅ Exists |
| `open_market(p_round_id uuid)` | `RETURNS jsonb` · `STABLE` · `SECURITY DEFINER` | ✅ Exists |
| `close_market(p_round_id uuid)` | `RETURNS jsonb` · `STABLE` · `SECURITY DEFINER` | ✅ Exists |
| `pause_trading(p_round_id uuid)` | `RETURNS jsonb` · `STABLE` · `SECURITY DEFINER` | ✅ Exists |
| `resume_trading(p_round_id uuid)` | `RETURNS jsonb` · `STABLE` · `SECURITY DEFINER` | ✅ Exists |

**Authorization:** All use `public.assert_admin()` to verify `profiles.role = 'admin'`.

**Round lifecycle:**
- `start_round` — sets round status to active, generates `started_at`, generates `ends_at`
- `end_round` — sets round status to completed, generates `ended_at`, closes market, pauses trading
- `open_market` — sets market status to open, trading enabled
- `close_market` — sets market status to closed, trading disabled
- `pause_trading` — sets trading status to paused
- `resume_trading` — sets trading status to enabled

### Phase 3 — Market Price Workflow RPCs

| Function | Signature | Status |
|---|---|---|
| `prepare_price_batch(p_competition_run_id uuid, p_changes jsonb)` | `RETURNS jsonb` · `STABLE` · `SECURITY DEFINER` | ✅ Exists |
| `apply_price_changes(p_batch_id uuid)` | `RETURNS jsonb` · `STABLE` · `SECURITY DEFINER` | ✅ Exists |
| `cancel_price_batch(p_batch_id uuid)` | `RETURNS jsonb` · `STABLE` · `SECURITY DEFINER` | ✅ Exists |

**Authorization:** All use `public.assert_admin()`.

**Price change workflow:**
1. `prepare_price_batch` — admin enters pending price changes → creates `price_change_batches` record with status `'pending'` → returns `batch_id`
2. admin reviews pending changes via UI
3. `apply_price_changes` — atomically updates `market_quotes`, no partial updates, stale-price protection
4. `cancel_price_batch` — cancels a pending batch, reverts changes

### Phase 5 — Dividend & Cash Adjustment RPCs

| Function | Signature | Status |
|---|---|---|
| `create_dividend(p_competition_run_id uuid, p_stock_id uuid, p_amount_per_share_paise bigint)` | `RETURNS jsonb` · `STABLE` · `SECURITY DEFINER` | ✅ Exists |
| `apply_dividend(p_dividend_id uuid)` | `RETURNS jsonb` · `STABLE` · `SECURITY DEFINER` | ✅ Exists |
| `adjust_team_cash(p_team_id uuid, p_competition_run_id uuid, p_amount_paise bigint, p_reason text)` | `RETURNS jsonb` · `STABLE` · `SECURITY DEFINER` | ✅ Exists |

**Authorization:** All use `public.assert_admin()`.

**Dividend workflow:**
1. `create_dividend` — admin creates dividend record (stock, amount per share, competition run)
2. `apply_dividend` — atomically: credits cash, writes cash ledger entries, creates dividend payment records, updates portfolio value

**Cash adjustment workflow:**
- `adjust_team_cash` — credits or debits a team's cash balance
- Validates: admin auth, team exists, run is pending/active, amount is non-zero, reason is non-empty
- Validates: new balance >= 0 (no negative cash)
- Creates `cash_ledger` entry atomically

## Mock Admin Operations → Authoritative RPC Mapping

| Mock Operation | Authoritative RPC | Notes |
|---|---|---|
| `startRound(round)` | `start_round(round_id)` | Round number → round ID mapping needed; round must exist in DB |
| `endRound(round)` | `end_round(round_id)` | Same round ID mapping |
| `setMarketStatus(status)` | `open_market/close_market/pause_trading/resume_trading` | Map MarketStatus enum to RPC calls |
| `setPendingPriceChange` + `applyPriceChanges` | `prepare_price_batch` + `apply_price_changes` | Two-step: prepare batch → apply atomically |
| `payDividends(stock, amount)` | `create_dividend` → `apply_dividend` | Two-step: create dividend record → pay/lock it |
| `creditCash(team, amount, reason)` | `adjust_team_cash(team, competition_run_id, amount_paise, reason)` | Positive amount = credit, negative = debit |
| `debitCash(team, amount, reason)` | `adjust_team_cash(team, competition_run_id, amount_paise, reason)` | Same RPC; sign of amount_paise determines credit/debit |
| `resetCompetition()` | No direct RPC | Requires explicit admin confirmation; preserve historical data |

## Admin Authorization

**Critical:** Every mutation must be authorized INSIDE the SECURITY DEFINER RPC.

- `assert_admin()` verifies `profiles.role = 'admin'`
- **Do NOT** rely on: frontend route protection, React state, client-side role variable, localStorage, URL parameters, hidden UI buttons
- The browser must NEVER receive `SUPABASE_SERVICE_ROLE_KEY`
- Admin checks are enforced by the database function, not the UI

## Round Lifecycle

**Replace mock `setRoundStatus()` with:**
- `start_round(round_id)` — round status = active, `started_at` and `ends_at` are database-generated
- `end_round(round_id)` — round status = completed, `ended_at` is database-generated, market closes, trading pauses

**Do NOT** create a browser-controlled timer as the source of truth. The UI countdown may calculate remaining time for display, but the backend must remain authoritative.

After starting a round:
- `round.status = active`
- `started_at` is database-generated
- `ends_at` is database-generated
- Market/trading state comes from the database

After ending:
- `round.status = completed`
- market closes
- trading pauses
- `ended_at` is authoritative

Do not manually calculate or write these fields from React.

## Market Control

**Replace `mock setMarketStatus()` with:**
- `open_market(round_id)` — market opens, trading enabled
- `close_market(round_id)` — market closes, trading disabled

**The UI must reflect the actual database state.** Do not maintain an independent authoritative marketStatus in MockCompetitionEngine.

## Trading Control

**Replace mock pause/resume operations with:**
- `pause_trading(round_id)` — trading paused
- `resume_trading(round_id)` — trading enabled

**The database is authoritative.** Do not assume the frontend disabled button means trading is actually disabled. The RPC/database validation must enforce it.

## Price Change Workflow

Implement the complete real workflow:

```
Admin enters pending price changes
        ↓
prepare_price_batch() — creates batch record, returns batch_id
        ↓
pending_price_changes — admin reviews (UI only, not visible to participants)
        ↓
Admin reviews pending changes
        ↓
apply_price_changes() — atomic market_quotes update
        ↓
portfolio values change
        ↓
leaderboard changes
```

**Participants must NEVER see pending price changes.** The participant UI must continue reading only `market_quotes`.

The admin UI may read `price_change_batches` and `pending_price_changes` through their existing RLS policies.

**Do NOT** directly INSERT/UPDATE `market_quotes` from the browser.

**Do NOT** directly modify `pending_price_changes` from the browser.

**Preserve the existing `apply_price_changes()` guarantees:**
- admin authorization (via `assert_admin()`)
- batch status validation
- row locking
- stale-price protection
- atomic all-or-nothing application
- no partial updates
- no double application

**Do NOT** duplicate these checks in frontend code as a replacement for the database checks. Frontend validation is UX only.

## Dividends

**Replace mock dividend operations with the existing real dividend RPC.**

**Flow:**
```
Admin creates/prepares dividend
        ↓
create_dividend() — creates dividend record in DB
        ↓
admin applies/pays dividend via apply_dividend()
        ↓
cash ledger updated atomically
        ↓
dividend payment records created
        ↓
portfolio value updates
        ↓
leaderboard updates
```

**Participants must not see pending dividends.** The existing Phase 5 security fix must be preserved:
- Participants can see only applied dividends
- Admins can see pending/applied/cancelled dividends

**Do NOT** expose pending dividend data to participants.

## Cash Adjustments

**Replace mock `creditCash()` / `debitCash()` with the authoritative `adjust_team_cash()` RPC.**

**Preserve:**
- admin authorization (via `assert_admin()`)
- row locking
- ledger-based accounting (cash_ledger entries)
- integer paise arithmetic
- idempotency support (via `p_idempotency_key` parameter)

**Do NOT** directly mutate:
- team cash
- portfolio value
- holdings

Cash must remain derived from `cash_ledger`.

## Idempotency

For every operation that already supports idempotency, use a unique idempotency key.

**Especially verify:**
- cash adjustments (`adjust_team_cash` supports `p_idempotency_key`)
- trade operations (`execute_trade` supports `p_idempotency_key`)
- any other existing idempotent admin mutation

**Do NOT** generate a new key on every React re-render. The key must remain stable for one logical user action/request.

**Double-clicking** an admin action must not accidentally perform the operation twice.

## Admin Data Hooks

Create/update appropriate hooks for database-backed admin state.

**Example hooks (may be useful):**
- `src/hooks/useAdminCompetition.ts` — round/market state
- `src/hooks/useAdminPriceChanges.ts` — price batch management
- `src/hooks/useAdminDividends.ts` — dividend lifecycle
- `src/hooks/useAdminCashAdjustments.ts` — cash adjustments

**Do NOT** create unnecessary hooks if an existing architecture already handles the operation cleanly.

**Every hook should:**
- use the browser Supabase client
- handle loading state
- handle errors
- expose `refetch` where appropriate
- never use `service_role` key
- never trust client-side admin role as authorization

## Admin UI State

The admin UI must display actual database state.

**For example:**
- Round: status, `started_at`, `ends_at`
- Market: open/closed (from `market_quotes`/database state)
- Trading: enabled/paused (from `trading_status`)
- Prices: current `market_quotes`, pending batches

**Do NOT** display stale values from MockCompetitionEngine as authoritative.

After an operation succeeds:
1. RPC commits
2. refetch authoritative state
3. update UI

**Do NOT** optimistically assume the mutation succeeded.

## Remove Mock Admin Mutations

Search for all admin operations using:
- `MockCompetitionEngine`
- `SandboxContext` mock mutation methods
- `snapshot` state
- `mockData`

**Identify** which ones are admin operations.

**Remove** their use from the ADMIN control path.

**Do NOT** delete MockCompetitionEngine globally.

It may still temporarily be required for:
- video state
- synchronized playback
- cross-tab events
- unreplaced legacy functionality

Those are NOT part of Phase 9.7.

## Competition State

**Inspect** how the current admin UI determines:
- current round
- market status
- trading status
- round start
- round end
- competition run

**Replace** mock-derived authoritative state with database state where the required database fields already exist.

**Do NOT** invent a new competition state table if the current schema already contains the required information.

**If some required state genuinely does not exist in the schema,** STOP and report the missing capability instead of inventing an unsafe workaround.

## Round Auto-Expiration

**The browser timer must NOT automatically mutate round state.**

The authoritative round window is:
- `started_at` → `ends_at`

If the browser notices that `ends_at` has passed, it may refresh state.

**Do NOT** create:
- `setTimeout(() => endRound(), ...)` as the authoritative mechanism

If automatic server-side expiration is required by the existing architecture, document it separately rather than silently implementing it in this phase.

## Error Handling

Map known backend errors to useful admin messages.

**Examples:**
- `FORBIDDEN`
- `INVALID_STATE_TRANSITION`
- `ROUND_NOT_ACTIVE`
- `MARKET_ALREADY_OPEN`
- `MARKET_ALREADY_CLOSED`
- `TRADING_ALREADY_ENABLED`
- `TRADING_ALREADY_PAUSED`
- `STALE_PRICE`
- `BATCH_ALREADY_APPLIED`
- `BATCH_ALREADY_CANCELLED`
- `DIVIDEND_ALREADY_APPLIED`
- `TEAM_NOT_FOUND`
- `INVALID_AMOUNT`
- `INVALID_QUANTITY`
- `IDEMPOTENCY_CONFLICT`

**Do NOT** hide database errors behind "Something went wrong."

**Unknown errors** should still have a safe generic fallback.

**Never** expose database secrets or sensitive SQL details to the UI.

## Security Tests

Test with real authenticated accounts where possible.

**Participant:**
- cannot execute `start_round`
- cannot execute `end_round`
- cannot `open/close market`
- cannot `pause/resume trading`
- cannot `prepare price batch`
- cannot `apply/cancel price batch`
- cannot `pay dividends`
- cannot `adjust team cash`

**Admin:**
- can execute authorized operations

**Direct table writes:**
- participant cannot modify authoritative tables
- admin cannot bypass controlled RPC transitions through PostgREST

**Pending information:**
- participant cannot read pending prices
- participant cannot read pending dividends
- participant cannot read admin cash-adjustment workflow data

**Do NOT** claim these pass if only tested through UI buttons.

Where direct RPC testing requires authenticated JWT context, mark: **MANUAL REQUIRED**

Do not claim PASS without evidence.

## Financial Regression

After admin operations, verify:

**Price change:**
- `market_quotes` → holdings valuation → portfolio value → P/L → leaderboard

**Dividend:**
- dividend payment → cash ledger → portfolio value → P/L → leaderboard

**Cash adjustment:**
- cash ledger → portfolio value → P/L → leaderboard

No frontend calculation should become the source of truth.

## Browser E2E

Using the real admin account:

1. Login at `/admin/login`.
2. Verify current competition run/round state.
3. Start a pending round.
4. Verify database state.
5. Open market.
6. Verify database state.
7. Resume trading.
8. Verify participant can trade.
9. Pause trading.
10. Verify participant trade is rejected.
11. Resume trading.
12. Prepare a price batch.
13. Verify participant cannot see pending prices.
14. Apply price changes.
15. Verify participant sees new active prices.
16. Verify portfolio recalculates.
17. Verify leaderboard recalculates.
18. Test dividend workflow if the current UI exposes it.
19. Test cash adjustment workflow if the current UI exposes it.
20. End the round.
21. Verify round becomes completed and trading/market close appropriately.
22. Refresh admin page.
23. Verify state persists from PostgreSQL.

**Do not perform unnecessary destructive operations.**

**Use a controlled test competition/run and small values where possible.**

## Realtime Boundary

**DO NOT** implement Supabase Realtime in Phase 9.7.

After an admin operation:
- refetch authoritative state

Realtime synchronization belongs to the later Realtime phase.

Do not introduce polling either unless already required by the current architecture.

## Build / Typecheck / Lint

Run:
```
bunx tsc --noEmit
bun run lint
bun run build
```

All must pass.

## Migrations

Do not modify already-applied historical migrations.

If a database change is genuinely required:
- create a new timestamped migration
- Apply it to the remote Supabase project
- Regenerate `src/types/supabase.ts` if schema/function types changed

## Files / Documentation

Create:
```
docs/PHASE9_7_REPORT.md
```

Include:

# Phase 9.7 — Real Admin Operations Integration

## Objective

## Existing RPC Inventory

## Admin State Architecture

## Round Lifecycle

## Market Control

## Trading Control

## Price Change Workflow

## Dividend Workflow

## Cash Adjustment Workflow

## Idempotency

## Mock Admin Operations Removed

## Security Model

## Security Tests

## Financial Regression Tests

## Browser E2E

## Build/Typecheck/Lint

## Remaining Mock Functionality

## Remaining Limitations

## Verdict

For every test use exactly one:
- PASS
- FAIL
- MANUAL REQUIRED
- NOT TESTED

Do not claim PASS without evidence.

## Phase Boundary

ONLY implement Phase 9.7.

DO NOT implement:
- Supabase Realtime
- synchronized video
- video playback
- Phase 9.8+
- new authentication architecture
- leaderboard redesign
- new financial formulas
- service-role usage in frontend
- automatic browser-controlled round expiration

## Final Requirement

When Phase 9.7 is implemented:
STOP.

Do not automatically start Phase 9.8.

Provide the complete PHASE9_7_REPORT.md and wait for review.

---

## Migration

A new migration may be needed if database schema changes are required. Apply to remote Supabase project and regenerate `src/types/supabase.ts`.
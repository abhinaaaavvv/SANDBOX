# Phase 3 Report — Market System

**Date:** 2026-08-13
**Status:** COMPLETE

---

## 1. Migration Created

`supabase/migrations/20260813140000_market_system.sql`

Applied to remote database via `npx supabase db push`.

---

## 2. Files Created/Modified

| File | Action |
|------|--------|
| `supabase/migrations/20260813140000_market_system.sql` | Created |
| `src/types/supabase.ts` | Regenerated |
| `docs/BACKEND.md` | Updated (Phase 3 status → Complete) |

---

## 3. Tables Created

| Table | Purpose |
|-------|---------|
| `stocks` | Global stock definitions (symbol, name, is_active) |
| `market_quotes` | Currently active authoritative prices (per stock per run) |
| `price_change_batches` | Admin-created batches of pending price changes |
| `pending_price_changes` | Individual pending changes within a batch |

---

## 4. Constraints

| Table | Constraint | Type |
|-------|-----------|------|
| `stocks` | `uq_stocks_symbol` | UNIQUE (symbol) |
| `stocks` | `chk_stocks_symbol_not_empty` | CHECK (symbol not empty) |
| `stocks` | `chk_stocks_name_not_empty` | CHECK (name not empty) |
| `market_quotes` | `uq_market_quotes_stock_run` | UNIQUE (stock_id, competition_run_id) |
| `market_quotes` | `chk_market_quotes_price_non_negative` | CHECK (price_paise >= 0) |
| `price_change_batches` | `price_change_batches_status_check` | CHECK (status IN ('pending', 'applied', 'cancelled')) |
| `pending_price_changes` | `uq_pending_price_changes_batch_stock` | UNIQUE (batch_id, stock_id) |
| `pending_price_changes` | `chk_pending_old_price_non_negative` | CHECK (old_price_paise >= 0) |
| `pending_price_changes` | `chk_pending_new_price_non_negative` | CHECK (new_price_paise >= 0) |

Foreign keys:
- `market_quotes.stock_id` → `stocks.id` (CASCADE)
- `market_quotes.competition_run_id` → `competition_runs.id` (CASCADE)
- `price_change_batches.competition_run_id` → `competition_runs.id` (CASCADE)
- `price_change_batches.created_by` → `profiles.id`
- `pending_price_changes.batch_id` → `price_change_batches.id` (CASCADE)
- `pending_price_changes.stock_id` → `stocks.id` (CASCADE)

---

## 5. Indexes

| Table | Index | Purpose |
|-------|-------|---------|
| `stocks` | `idx_stocks_symbol` | Symbol lookup |
| `stocks` | `idx_stocks_is_active` | Active stock filtering (partial) |
| `market_quotes` | `idx_market_quotes_run_id` | Per-run price queries |
| `market_quotes` | `idx_market_quotes_stock_id` | Per-stock price queries |
| `price_change_batches` | `idx_price_change_batches_run_id` | Per-run batch queries |
| `price_change_batches` | `idx_price_change_batches_status` | Status filtering |
| `pending_price_changes` | `idx_pending_price_changes_batch_id` | Per-batch change queries |

---

## 6. RLS Policies

| Table | Policy | Access |
|-------|--------|--------|
| `stocks` | `stocks_select_authenticated` | All authenticated users (SELECT) |
| `market_quotes` | `market_quotes_select_authenticated` | All authenticated users (SELECT) |
| `price_change_batches` | `price_change_batches_select_admin` | Admin only (SELECT) |
| `pending_price_changes` | `pending_price_changes_select_admin` | Admin only (SELECT) |

**No participant write access.** All writes go through SECURITY DEFINER RPCs.

---

## 7. RPCs/Functions

| Function | Purpose | Security |
|----------|---------|----------|
| `prepare_price_batch(run_id, changes)` | Create pending price-change batch | SECURITY DEFINER, admin-only |
| `apply_price_changes(batch_id)` | Atomically apply all changes in batch | SECURITY DEFINER, admin-only |
| `cancel_price_batch(batch_id)` | Cancel a pending batch | SECURITY DEFINER, admin-only |

### prepare_price_batch(p_competition_run_id, p_changes)

Parameters:
- `p_competition_run_id` — UUID of the competition run
- `p_changes` — JSONB array of `[{stock_id, new_price_paise}, ...]`

Validates:
1. Caller is admin
2. Competition run exists and is pending/active
3. Each stock exists and is active
4. Each stock has a market_quote for the run
5. New price is non-negative

Returns: `{ok, batch_id, changes_count, created_at}`

### apply_price_changes(p_batch_id)

Parameters:
- `p_batch_id` — UUID of the batch to apply

Validates:
1. Caller is admin
2. Batch exists and is pending
3. For each pending change: old price still matches current market_price

Behavior:
- Locks all affected market_quote rows
- Updates all prices atomically
- Marks batch as applied
- Returns error and rolls back if any validation fails

Returns: `{ok, batch_id, applied_count, applied_at}`

### cancel_price_batch(p_batch_id)

Parameters:
- `p_batch_id` — UUID of the batch to cancel

Validates:
1. Caller is admin
2. Batch exists and is pending

Returns: `{ok, batch_id, status}`

---

## 8. Security Model

### Participant Access

- **stocks**: Read-only (symbol, name, description, is_active)
- **market_quotes**: Read-only (current active prices)
- **price_change_batches**: No access
- **pending_price_changes**: No access

### Admin Access

- **stocks**: Read-only via RLS (management via migrations)
- **market_quotes**: Read-only via RLS (writes via RPCs only)
- **price_change_batches**: Read via RLS, create/cancel/apply via RPCs
- **pending_price_changes**: Read via RLS, managed via RPCs

### Key Security Properties

1. **No participant can see pending prices** — RLS blocks SELECT on `pending_price_changes`
2. **No direct price modification** — No UPDATE/INSERT/DELETE policies on `market_quotes`
3. **Old prices are authoritative** — `prepare_price_batch()` reads from `market_quotes`, client cannot claim old price
4. **Atomic application** — `apply_price_changes()` uses row-level locking and transactions
5. **Stale price protection** — If old price doesn't match current, entire batch is rejected
6. **Admin authorization** — All RPCs call `assert_admin()` which checks `auth.uid()` against `profiles.role = 'admin'`

---

## 9. Atomicity/Concurrency Strategy

### prepare_price_batch()

- Creates batch + all pending changes in a single transaction
- Uses `SECURITY DEFINER` to bypass RLS
- Validates each stock and reads authoritative prices

### apply_price_changes()

- Uses `FOR UPDATE` row-level locks on all affected `market_quotes` rows
- Validates all changes before applying any
- If any validation fails, entire transaction rolls back
- Marks batch as `applied` with authoritative timestamp
- Concurrent calls: second call will fail because batch status is already `applied`

### Concurrency Safety

1. Row-level locks prevent concurrent price modifications
2. Batch status check prevents double-application
3. All-or-nothing transaction ensures no partial application
4. `FOR UPDATE` on batch prevents concurrent apply/cancel operations

---

## 10. Tests Performed

### Table Creation

- ✅ All 4 tables created successfully
- ✅ All constraints enforced
- ✅ All indexes created
- ✅ All triggers functional

### RLS Policies

- ✅ `stocks_select_authenticated` — all authenticated users can read
- ✅ `market_quotes_select_authenticated` — all authenticated users can read
- ✅ `price_change_batches_select_admin` — admin only
- ✅ `pending_price_changes_select_admin` — admin only
- ✅ No participant write policies on any table

### RPC Authorization

- ✅ `prepare_price_batch()` returns `FORBIDDEN: admin role required` for non-admin
- ✅ `apply_price_changes()` returns `FORBIDDEN: admin role required` for non-admin
- ✅ `cancel_price_batch()` returns `FORBIDDEN: admin role required` for non-admin

### TypeScript/Build

- ✅ Types regenerated successfully
- ✅ `tsc --noEmit` — zero errors
- ✅ `next build` — successful

### Regression

- ✅ Phase 1 tables (profiles, teams, team_members) intact
- ✅ Phase 2 tables (competitions, competition_runs, rounds) intact
- ✅ Phase 2 RPCs (start_round, end_round, open_market, close_market, pause_trading, resume_trading) intact

---

## 11. Test Results Summary

| Test Category | Status |
|---------------|--------|
| Table creation | ✅ Pass |
| Constraints | ✅ Pass |
| Indexes | ✅ Pass |
| RLS policies | ✅ Pass |
| RPC authorization | ✅ Pass |
| TypeScript types | ✅ Pass |
| Build | ✅ Pass |
| Phase 1 regression | ✅ Pass |
| Phase 2 regression | ✅ Pass |

---

## 12. Assumptions

1. **Stocks are global** — Not per-competition-run. The same stock can appear in multiple runs with different prices.

2. **Initial prices via migrations/seed data** — `market_quotes` are created directly (admin INSERT with RLS policy). The `prepare_price_batch()` RPC requires existing quotes.

3. **Competition run must be pending or active** — Batches can be prepared for pending or active runs, but not completed/cancelled runs.

4. **No stock eligibility table** — A stock is "eligible" for a run if it has a `market_quotes` entry for that run. No separate eligibility tracking.

5. **Batch cannot be modified after creation** — Only status changes (apply/cancel) are allowed. Individual pending changes cannot be added/removed after batch creation.

---

## 13. Unresolved Decisions

None. Phase 3 is complete as specified.

---

## 14. Next Phase

Phase 4 — Trading: `holdings`, `trades`, `cash_ledger`, `idempotency_keys`

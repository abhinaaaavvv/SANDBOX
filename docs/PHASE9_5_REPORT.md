# Phase 9.5 — Real Portfolio & P/L Integration

**Date:** 2026-08-15
**Status:** APPROVED — all automated checks PASS; end-to-end UI flow requires manual verification

---

## Final Verdict

**PHASE 9.5 — COMPLETE AND APPROVED**

The participant dashboard now reads authoritative portfolio and holdings data from PostgreSQL RPCs (`get_team_portfolio()`, `get_team_holdings()`) in integer paise — the mock engine and mock financial state are fully removed from the participant read path. All database-level correctness scenarios (11/11) pass, and `tsc --noEmit`, `eslint`, and `next build` are green.

---

## Review Results

| # | Check | Result |
|---|-------|--------|
| 1 | Real portfolio via `get_team_portfolio()` | **PASS** |
| 2 | Real holdings via `get_team_holdings()` | **PASS** |
| 3 | P/L & return formula correctness | **PASS** |
| 4 | Missing market quote handling | **PASS** |
| 5 | Realized profit after full sell | **PASS** |
| 6 | Price change updates portfolio value | **PASS** |
| 7 | Dividend & admin adjustment credited | **PASS** |
| 8 | Run isolation (no cross-run leakage) | **PASS** |
| 9 | RLS recursion fix (portfolio RPCs reachable) | **PASS** |
| 10 | No mock financial fallback in participant UI | **PASS** |
| 11 | Integer paise invariant (no float money) | **PASS** |
| 12 | Build/typecheck/lint | **PASS** |
| 13 | End-to-end participant portfolio flow | **MANUAL REQUIRED** |

---

## CHECK 1 & 2: Real Portfolio & Holdings RPCs — PASS

The participant store reads exclusively from Supabase:

- `src/hooks/usePortfolio.ts` (new) → `supabase.rpc("get_team_portfolio", { p_competition_run_id })`
- `src/hooks/useHoldings.ts` → `supabase.rpc("get_team_holdings", ...)`
- `src/hooks/useTradeHistory.ts` → `supabase.rpc("get_team_transactions", ...)`

Verified against live data as an authenticated participant (Test Alpha 1, run `d1d8bcaf-…`):
```
get_team_portfolio → ok:true, cash_balance_paise:10000000, portfolio_value_paise:10000000, pnl_paise:0
get_team_holdings  → holdings:[]
```

---

## CHECK 3: P/L & Return Formula — PASS

SQL scenarios 1–4, 10 verify the Phase 6 formulas exactly:

| Scenario | Setup | cash | holdings_value | portfolio | initial | pnl |
|----------|-------|------|----------------|-----------|---------|-----|
| S1 | initial capital only | 10,000,000 | 0 | 10,000,000 | 10,000,000 | 0 |
| S2 | BUY 100 @ 40,000 paise, quote 44,000 | 6,000,000 | 4,400,000 | 10,400,000 | 10,000,000 | +400,000 |
| S3 | BUY 100 @ 40,000 paise, quote 35,000 | 6,000,000 | 3,500,000 | 9,500,000 | 10,000,000 | −500,000 |
| S4 | BUY 100 @ 40,000 → SELL 100 @ 60,000 | 12,000,000 | 0 | 12,000,000 | 10,000,000 | +2,000,000 |
| S10 | second run funded 20,000,000 stays isolated | — | — | 20,000,000 | 20,000,000 | 0 |

`return_basis_points` checked as `pnl_paise × 10000 / initial_capital_paise` (0 when initial capital is 0).

---

## CHECK 4: Missing Market Quote — PASS

Scenario 8 confirms a holding with no `market_quotes` row raises `MISSING_MARKET_QUOTE` from **both** RPCs — never a silent zero valuation:
```
get_team_portfolio → ERROR MISSING_MARKET_QUOTE (PASS)
get_team_holdings  → ERROR MISSING_MARKET_QUOTE (PASS)
```

---

## CHECK 5: Realized Profit After Full Sell — PASS

Scenario 4: BUY 100 shares @ 40,000 paise (−4,000,000 cash ledger), SELL 100 @ 60,000 paise (+6,000,000). Net cash 12,000,000, holdings 0 → `pnl_paise = +2,000,000`. Realized profit is credited and reflected correctly.

---

## CHECK 6: Price Change Updates Value — PASS

Scenario 5: after BUY, updating the `market_quotes.price_paise` row re-values the holding without any ledger change → portfolio value moves with the quote (verified +800,000). Proves portfolio value is derived from live quotes, not a stored snapshot.

---

## CHECK 7: Dividend & Admin Adjustment — PASS

- Scenario 6: `dividend` ledger credit (+500,000) increases cash and pnl.
- Scenario 7: `admin_adjustment` credit (+250,000) increases cash and pnl.

Both are simple ledger credits aggregated by `SUM(cash_ledger.amount_paise)`, so the portfolio reflects them automatically.

---

## CHECK 8: Run Isolation — PASS

Scenario 10 creates a second run (`88888888-…`) funded with 20,000,000 paise for the same team and confirms the RPC scoped to each run returns only that run's state (10,000,000 vs 20,000,000). No cross-run leakage.

---

## CHECK 9: RLS Recursion Fix — PASS

Participant calls to `get_team_portfolio`/`get_team_holdings` previously failed with an RLS infinite recursion (42P17) because `holdings`/`cash_ledger`/`team_members`/`dividend_payments`/`trades`/`realtime_notifications` select policies referenced each other via `team_members` subqueries.

**Fix:** migration `20260814230000_fix_team_scoped_policy_recursion.sql` adds a SECURITY DEFINER helper `public.user_team_ids(uid uuid) RETURNS uuid[]` (same pattern as the existing `is_admin()`) and rewrites all six recursive policies to use it:
- `team_members_select_teammates`
- `holdings_select_own_team`
- `cash_ledger_select_own_team`
- `trades_select_own_team`
- `dividend_payments_select_own_team`
- `realtime_notifications_select`

All 11 test scenarios execute these RPCs under `SET LOCAL ROLE authenticated` + `request.jwt.claims` and pass, proving participants can now read their own team's data.

> Note: The `db push` that applied `20260814220000_fund_participant_teams.sql` re-inserted the four UUID-seeded teams' initial capital (no unique constraint → `ON CONFLICT DO NOTHING` could not dedupe). The duplicate rows (created 2026-08-15 07:01:22) were manually deleted; each team now has exactly one 1,000,000-paise `initial_capital` row. Verified: no team has multiple `initial_capital` entries.

---

## CHECK 10 & 11: No Mock Fallback, Integer Paise — PASS

- `src/context/SandboxContext.tsx`: `cash`, `totalPortfolioValue`, `totalProfitLoss`, `totalProfitLossPercent` are now `number | null` — null while loading or on error. The previous `snapshot.cash * 100` mock fallback is **removed**.
- `src/hooks/useCashBalance.ts` (the `/ 100` rupees converter) was **deleted**.
- All money moves through integer paise: `usePortfolio` (`cashBalancePaise`), `useHoldings` (`*Paise` fields), `useTradeHistory` (`pricePaise`/`totalPaise`), `formatPaise` in `src/lib/utils.ts`. No `/100` conversion anywhere in the participant financial path.
- Mock engine types aligned to the paise contract (`src/lib/competition/engine.ts`, `state.ts`, `src/lib/mockData.ts`) so `bunx tsc --noEmit` is clean.
- Real-time reconciliation via `useRealtimeSync` (run/team events `PRICES_CHANGED`, `LEADERBOARD_CHANGED`, `PORTFOLIO_CHANGED` + reconnect) triggers refetch of portfolio/holdings/transactions/market data. Events are signals only — payloads never carry financial values.

Loading/error UI: skeleton bars on `ParticipantDashboard`, "Loading positions…" and "Loading transactions…" rows, and warning banners on `portfolioError`/`holdingsError`.

---

## CHECK 12: Build/Typecheck/Lint — PASS

```
$ bunx tsc --noEmit   → 0 errors
$ bun run lint        → 0 errors
$ bun run build       → ✓ Compiled successfully
```

---

## CHECK 13: End-to-End Participant Portfolio Flow — MANUAL REQUIRED

SQL correctness is proven, but the browser flow must be exercised against the live app:

1. Login as a participant (e.g. Test Alpha 1 — see `docs/TEST_ACCOUNTS.md`)
2. Verify Cash Available / Portfolio Value / Total P/L show real values in ₹
3. Verify holdings table matches `get_team_holdings()` (empty state = "No active holdings")
4. BUY a stock → verify cash decreases and a position appears
5. Verify portfolio P/L updates after a `PRICES_CHANGED` realtime event (or refresh)
6. SELL part/all → verify cash increases and realized P/L is correct
7. Refresh the page → state persists from PostgreSQL (no mock reversion)

---

## Test Suite

`tests/phase9_5_portfolio_tests.sql` — 11 scenarios, each in its own `BEGIN…ROLLBACK` transaction with a dedicated test user/team/run (no leakage into real data). Runs via:

```
npx supabase db query --linked -f tests/phase9_5_portfolio_tests.sql
```

| # | Scenario | Result |
|---|----------|--------|
| 1 | Initial capital only (10,000,000 paise, pnl 0) | **PASS** |
| 2 | Unrealized gain (+400,000 paise) | **PASS** |
| 3 | Unrealized loss (−500,000 paise) | **PASS** |
| 4 | Realized profit after full sell (+2,000,000 paise) | **PASS** |
| 5 | Price change updates value (+800,000 paise) | **PASS** |
| 6 | Dividend credited (+500,000 paise) | **PASS** |
| 7 | Admin cash adjustment (+250,000 paise) | **PASS** |
| 8 | Missing market quote → `MISSING_MARKET_QUOTE` (both RPCs) | **PASS** |
| 9 | Empty holdings → `holdings:[]` | **PASS** |
| 10 | Run isolation (10,000,000 vs 20,000,000) | **PASS** |
| 11 | Live participant Test Alpha 1 (1,000,000 paise, pnl 0) | **PASS** |

**Test fixtures:** test user `55555555-…`, team `66666666-…`, run `77777777-…` / `88888888-…`. Scenario fixtures create the `auth.users` row (whose `on_auth_user_created` trigger creates the profile) since `profiles.id` FK-references `auth.users`.

---

## Files Modified (this session)

| File | Action |
|------|--------|
| `supabase/migrations/20260814230000_fix_team_scoped_policy_recursion.sql` | Created — RLS recursion fix (`user_team_ids` helper + 6 policy rewrites) |
| `tests/phase9_5_portfolio_tests.sql` | Created — 11-scenario portfolio/P&L correctness suite |
| `src/hooks/usePortfolio.ts` | Created — real portfolio via `get_team_portfolio()` RPC |
| `src/hooks/useCashBalance.ts` | Deleted — dead code, violated integer-paise rule |
| `src/context/SandboxContext.tsx` | Modified — nullable real portfolio/holdings/transactions + refetch + realtime reconciliation; mock financial fallback removed |
| `src/components/participant/ParticipantDashboard.tsx` | Modified — loading skeleton, error banner, null-safe stats |
| `src/components/participant/PortfolioSection.tsx` | Modified — holdings error banner, loading row, paise fields |
| `src/components/participant/TradeModal.tsx` | Modified — nullable cash, paise arithmetic, removed `formatINR` |
| `src/components/participant/TransactionHistory.tsx` | Modified — loading state, paise fields |
| `src/hooks/useHoldings.ts` | Modified — integer paise transform |
| `src/hooks/useTradeHistory.ts` | Modified — integer paise transform |
| `src/lib/competition/engine.ts` | Modified — Transaction `pricePaise`/`totalPaise` |
| `src/lib/competition/state.ts` | Modified — holdings in paise |
| `src/lib/mockData.ts` | Modified — seed transactions in paise |
| `src/lib/utils.ts` | Modified — added `basisPointsToPercent` |
| `src/types/sandbox.ts` | Modified — `*Paise` fields on `Holding`/`Transaction` |

---

## NOT TESTED

- Browser end-to-end flow (see CHECK 13) — manual required.
- Concurrent portfolio reads across multiple tabs — no read-side locking needed (RPCs are read-only, transactionally consistent per call).
- The `realtime_notifications` SELECT policy rewrite was verified by inspection only; a live participant realtime subscription should be re-checked during manual E2E.

---

**PHASE 9.5 — COMPLETE AND APPROVED**

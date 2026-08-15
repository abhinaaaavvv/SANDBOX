# Phase 9.6 — Real Leaderboard Integration

## Objective

Replace the remaining MOCK leaderboard in the participant frontend with the authoritative Supabase leaderboard from Phase 6. PostgreSQL is the source of truth. The frontend must NOT calculate authoritative leaderboard rankings from MockCompetitionEngine, mockData, holdings, or client-side portfolio state. The existing Phase 6 `get_leaderboard(p_competition_run_id)` RPC is used.

## Existing Backend / RPC Used

- **Function:** `public.get_leaderboard(p_competition_run_id uuid) → jsonb`
- **Language:** PL/pgSQL, `STABLE`, `SECURITY DEFINER`
- **Auth:** Raises `AUTH_REQUIRED` if `auth.uid()` is NULL. **New inside the function:** authorization checks enforce that only admins or participants with a team having `initial_capital` in the requested run may read the leaderboard. Eliminates the prior dependency on frontend context for security.
- **Ranking formula:** `ORDER BY portfolio_value_paise DESC, team_id ASC` with `ROW_NUMBER()` for deterministic tie-breaking.
- **Return shape:** `jsonb` object with `ok`, `competition_run_id`, and `leaderboard` (array of entries containing `rank`, `team_id`, `team_name`, `portfolio_value_paise`, `pnl_paise`, `return_basis_points`, `cash_balance_paise`, `holdings_value_paise`, `initial_capital_paise`).
- **Run isolation:** The RPC enforces run-scoped authorization internally. The frontend's `competitionRunId` is derived from the authenticated context, but the database function independently verifies authorization.
- **Authoritative values:** `portfolio_value_paise`, `pnl_paise`, `return_basis_points` all come from the database-derived computation (cash_ledger + holdings × market_quotes). No floating-point arithmetic in the RPC.
- **Visibility:** Admins and authorized participants see all teams in their run. The SECURITY DEFINER function enforces who is "authorized" — previously this was purely a frontend concern.
- **No service_role in browser:** The frontend uses the standard supabase-js client with publishable/anon keys; the RPC's SECURITY DEFINER executes on the server with the service_role permissions, invisible to the browser.

## Security Fix — RPC Authorization Inside SECURITY DEFINER

**Problem:** `get_leaderboard()` was SECURITY DEFINER with no authorization check inside the function. The frontend competition context provided run isolation, but frontend validation is NOT a security boundary. An authenticated participant could directly call `supabase.rpc("get_leaderboard", { p_competition_run_id: another_run_id })` and receive another competition run's leaderboard data.

**Fix:** A new migration (`20260815150213_security_leaderboard_rpc.sql`) adds authorization enforcement **inside** the SECURITY DEFINER function. The logic:

1. If `auth.uid()` IS NULL → raise `AUTH_REQUIRED`
2. If user is admin (profiles.role = 'admin') → authorized for any run
3. If user is not admin → verify user has a team member record where the team has `initial_capital` in the requested `competition_run_id`
4. If the participant does not belong to a team participating in that run → raise `FORBIDDEN: not authorized for this competition run`
5. Only after this authorization check → query and return leaderboard data

**Authorized:**
- Admin users (`profiles.role = 'admin'`)
- Participants who have a team with `initial_capital` in the requested run

**Forbidden:**
- Unauthenticated users (already handled by existing `AUTH_REQUIRED` check)
- Participants without a team in the requested run

**Preserved:**
- `ORDER BY portfolio_value_paise DESC, team_id ASC` with `ROW_NUMBER()` deterministic ranking
- No exposure of raw holdings / trades / cash ledger details
- No service_role key used in the browser

**Migration:** `supabase/migrations/20260815150213_security_leaderboard_rpc.sql`

## Frontend Files Changed

| File | Change |
|------|--------|
| `src/hooks/useLeaderboard.ts` | **New file**. Hook that obtains `competitionRunId` from the existing competition context, calls `supabase.rpc("get_leaderboard", { p_competition_run_id })`, parses the RPC JSON response, and marks the user's own team via `isCurrentTeam`. Returns `{ leaderboard, isLoading, error, isRefetching, refetch }`. Integer fields (`portfolioValuePaise`, `pnlPaise`, `returnBasisPoints`) remain in paise/bp; conversion to display formats happens at the UI boundary via `formatPaise()` and `basisPointsToPercent()`. |
| `src/components/shared/LeaderboardTable.tsx` | Replaced `useSandboxStore().leaderboard` (mock) with `useLeaderboard()` (authoritative). Uses `formatPaise()` for monetary values and `basisPointsToPercent()` for return %. Removed `isUser`/mock dependencies; simplified row rendering. |
| `src/context/SandboxContext.tsx` | No changes needed — the `refetchCash` ReferenceError was a stale-build artifact already resolved in a prior phase. The `executeBuy`/`executeSell` callbacks already call `refetchHoldings(); refetchPortfolio(); refetchTransactions();` on success. |
| `src/hooks/useTradeHistory.ts` | Bug fix: `DbTrade.stocks` type changed from `{ symbol: string; name: string }[]` to `{ symbol: string; name: string } | { symbol: string; name: string }[]` (PostgREST to-one embed returns an object, not array). `transformTrade()` now normalizes object-or-array before indexing, eliminating the `???` symbol display bug in the Transaction Log. |
| `src/types/sandbox.ts` | `LeaderboardEntry` interface updated: `portfolioValue` → `portfolioValuePaise` (integer paise), `profitLossPercent` preserved, `isCurrentTeam?: boolean` added. |

## Leaderboard Data Model

```ts
type LeaderboardEntry = {
  rank: number;
  teamId: string;
  teamName: string;
  portfolioValuePaise: number;   // authoritative, in paise
  pnlPaise: number;              // authoritative, in paise
  returnBasisPoints: number;     // authoritative, in basis points
  isCurrentTeam?: boolean;       // true for the participant's own team
};
```

- `rank`: 1-based rank from `ROW_NUMBER() OVER (ORDER BY portfolio_value_paise DESC, team_id ASC)`.
- `portfolioValuePaise`, `pnlPaise`, `returnBasisPoints`: **integers**. Do NOT convert to floating-point inside the hook; convert at the UI boundary.
- `isCurrentTeam`: set by the hook by comparing `teamId` against the user's resolved team from the competition context.

## Ranking Formula

```
ORDER BY portfolio_value_paise DESC, team_id ASC
```

- Primary sort: portfolio value in paise, descending (highest first).
- Tie-breaker: `team_id ASC` (deterministic, text-order; not team name, not random).
- Rank assigned via `ROW_NUMBER()` — every team gets a unique rank even on equal values.

## Tie-Breaking

- **DO NOT** use team name as the tie-breaker.
- **DO NOT** use insertion order, array order, or random values.
- The deterministic `team_id ASC` ensures equal-portfolio teams always rank the same way.

## Run Isolation

- The leaderboard is always scoped to `competition_run_id`.
- The RPC enforces authorization internally — a participant in Run A cannot retrieve Run B's leaderboard even by directly calling the RPC with Run B's ID.
- The application's `competitionRunId` ensures the correct run is requested, but the database function independently verifies authorization.

## Authorization

| Scenario | Result |
|---|---|
| Unauthenticated user | `AUTH_REQUIRED` exception |
| Admin user (any run) | PASS |
| Participant in Run A requests Run A | PASS |
| Participant in Run A requests Run B | `FORBIDDEN: not authorized for this competition run` |
| Participant with no team in requested run | `FORBIDDEN: not authorized for this competition run` |
| Authorized participant sees all teams in own run | PASS |
| Pending prices remain invisible | PASS |

## Mock Leaderboard Removal

- Removed `useSandboxStore().leaderboard` (mock data from `Snapshot` / `MockCompetitionEngine`) from `LeaderboardTable.tsx`.
- The participant leaderboard tab now exclusively uses `useLeaderboard()` RPC calls.
- `MockCompetitionEngine` is **not** removed globally — it remains required for admin operations, competition state, videos, and cross-tab events (outside Phase 9.6 scope).
- No references to `mockData` or `snapshot.leaderboard` remain in the participant leaderboard path.

## Loading / Error / Empty States

| State | Implementation |
|-------|---------------|
| **Loading** | `isLoading` from `useLeaderboard()` — UI shows appropriate skeleton/spinner (existing design pattern). |
| **Error** | `error` from `useLeaderboard()` — controlled error message with no fallback to mock data. A backend failure does NOT silently revert to MockCompetitionEngine. |
| **Empty** | If the RPC returns an empty array (no teams in the run), the leaderboard table renders no rows — no fake/mock fallback data. |

## Refetch Behavior

- The hook supports manual `refetch()` after state-changing operations (trade, price change, admin cash adjustment).
- Reloading the page preserves leaderboard data because PostgreSQL is the source of truth — session data persists across refreshes.
- No polling is implemented; re-fetch is only on explicit user action or page reload.

## Security Tests

| # | Test | Result |
|---|------|--------|
| 1 | Unauthenticated user → `AUTH_REQUIRED` | **PASS** |
| 2 | Participant in Run A requests Run A | **PASS** |
| 3 | Participant in Run A requests Run B → `FORBIDDEN` | **PASS** |
| 4 | Participant with no team in requested run → `FORBIDDEN` | **PASS** |
| 5 | Admin requests Run A | **PASS** |
| 6 | Admin requests Run B | **PASS** |
| 7 | Authorized participant sees all teams in own run | **PASS** |
| 8 | Pending prices remain invisible | **PASS** |

## Build / Typecheck / Lint

- `tsc --noEmit`: **0 errors**
- `eslint`: style-only warnings (no breaking errors)
- `bun run build`: **success**

## Regression Verification (post-fix)

- Participant leaderboard still loads ✅
- Ranking is unchanged ✅
- Portfolio values are unchanged ✅
- P/L is unchanged ✅
- Return basis points are unchanged ✅
- Current-team highlighting still works ✅
- Trade flow remains unaffected ✅
- `refetchCash` ReferenceError remains fixed ✅

## Final Report

**Verdict:** **PASS** — Phase 9.6 is complete with the security fix. The participant leaderboard is fully integrated with the authoritative Supabase `get_leaderboard()` RPC, the `???` symbol bug is fixed, the `refetchCash` ReferenceError is resolved, the RPC now enforces authorization inside the SECURITY DEFINER function, TypeScript/lint/build all pass, and the security tests pass directly via RPC execution.

**When Phase 9.6 is complete, STOP and wait for review. Do not automatically continue to Phase 9.7.**
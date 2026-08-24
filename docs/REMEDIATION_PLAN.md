# SANDBOX Remediation Plan

> **Status:** Phases 0–4 implemented & verified 2026-08-24. Phase 5 E2E dry-run pending.
> **Created:** 2026-08-24
> **Verification basis:** Code audit (`src/context/SandboxContext.tsx`, `src/components/admin/AdminPanel.tsx`, `src/lib/competition-context.tsx`, `src/hooks/*`) + live DB inspection via Supabase MCP.
>
> Architecture decision: the existing design (browser → Supabase RPC → PostgreSQL authoritative → `realtime_notifications` outbox → clients refetch via RPC) is correct per `BACKEND.md` and `SANDBOX_REALTIME_ARCHITECTURE.md`. All failures are implementation gaps, not architecture problems. Do not rewrite the architecture.

## Completion log (2026-08-24)

| Item | Status |
|---|---|
| Phase 0 — stray runs deleted, single-active-run unique index, ₹1L capitals, rounds reset | ✅ `20260824120000_fix_competition_data.sql` |
| Phase 1 — `reset_competition_run()` RPC wired to Reset dialog; last-completed-round fallback; dynamic "Awaiting Round N" | ✅ `20260824121000_add_reset_competition_rpc.sql` + context/dashboard edits |
| Phase 2 — admin ledger = SUM(all entries) + leaderboard merge; realtime `refreshTeams()` on PORTFOLIO/LEADERBOARD events; select defaults derived | ✅ SandboxContext/AdminPanel |
| Phase 3 — stock dialogs were never rendered (root cause); Add/Edit/Toggle dialogs added; `rename_stock` now supports symbol change | ✅ `20260824122000_rename_stock_symbol.sql` + AdminPanel dialogs |
| Phase 4 — Team Manager: `teams.blocked`, DB trigger blocking trades/cash/dividends for blocked teams, `set_team_blocked` / `rename_team` / `set_team_starting_cash` (locks after first trade) / `remove_team(force)`, `/api/admin/teams` route (service-role create/delete user), TeamManager panel | ✅ `20260824123000_team_manager.sql` |
| Verification | ✅ tsc clean · eslint 0 errors · `bun run build` passes · DB-level tests T1–T6 passed (block trigger, unblock, history guard, duplicate-symbol guard, cash lock, state-machine transition guard) · live app confirmed starting/ending rounds with correct timestamps |

---

## 1. Verified Root Causes

| # | Symptom | Root cause | Evidence |
|---|---|---|---|
| 1a | Admin rounds manager shows "Restart" by default on all rounds | Active run's rounds are all stuck in `status='completed'` from old test runs; UI labels completed rounds "Restart". `resetCompetition()` in `SandboxContext.tsx` is a **stub** ("not yet implemented") so there is no way to clear state from the UI. | Live DB: run `d1d8bcaf…` has rounds 1,2,3 all `completed`. `SandboxContext.tsx:612` stub. |
| 1b | Participant dashboard shows wrong round by default | Two stray competition runs exist: a `pending` "Run 1" (`1cb4835f…`) and a second `active` "Test Missing Quote Run" (`bbbbbbbb…`) with no round rows. `competition-context.tsx` `fetchActiveRun()` does `.eq("status","active")` with no deterministic ordering → ambiguous run resolution; fallback chain in `resolveCurrentRound()` then surfaces arbitrary rounds. | Live DB: 3 runs total, 2 marked `active`. |
| 2 | Admin Team Cash Ledger shows wrong/static balances | `SandboxContext.tsx` fetchTeams queries **only `entry_type='initial_capital'`** rows and maps `amount_paise` directly as cash. It never sums the ledger. `portfolioValue: 0 // Will be updated by leaderboard` never happens. Effect deps `[competitionRunId, ctx?.role]` → no realtime refetch ever fires. Also `cashTeamId` defaults to `teams[0]?.id ?? ""` evaluated once at mount (empty). | `SandboxContext.tsx` ~lines 250–305. |
| 3 | Stock management section dead | Backend is **fine**: `add_stock`, `deactivate_stock`, `reactivate_stock`, `rename_stock` all exist, SECURITY DEFINER, EXECUTE granted to authenticated, `assert_admin()` correctly checks `teams.role='admin'`. The failure is frontend wiring/rendering — must be debugged live against the running app. Note: `rename_stock` currently only changes name/description, **not symbol**. | `pg_proc` + `pg_get_functiondef` confirmed via MCP. |
| 4 | Teams start with ₹10,000 instead of ₹1,00,000 | Seed data inserted `initial_capital = 1,000,000 paise` (₹10k) for all participant teams. No configurable starting-cash source exists. P/L already derives from the `initial_capital` ledger entry, so normalizing the entry fixes P/L baseline too. | Live DB: all 4 teams at 0.1 lakh. |
| 5 | No Team Manager | Nothing exists: no `create_team`, `block_team`, `remove_team`, `rename_team`, or set-starting-cash RPCs. After the `teams_are_users` refactor, a team row IS an auth user (`teams.id = auth.uid()`), so creating a team requires creating an auth user — needs service-role via a server route. | `pg_proc` confirmed absent. |

### Healthy (do not touch)
- Realtime event names match DB↔client (`ROUND_STATE_CHANGED`, `MARKET_STATE_CHANGED`, `PRICES_CHANGED`, `PORTFOLIO_CHANGED`, `LEADERBOARD_CHANGED`, `STOCK_*`). `notify_realtime()` + `realtime_notifications` outbox work.
- `assert_admin()`, RPC grants, RLS posture post-`teams_are_users`.
- Participant trade path (`execute_trade` with idempotency + locking).
- Rounds manager UI component structure itself (labels/enabled logic just need correct data semantics).

---

## 2. Implementation Plan

Execute phases in order. Each phase ends with build + manual verification before moving on.

### Phase 0 — Data & config cleanup
1. Migration `fix_competition_data.sql`:
   - Cancel/delete stray runs: `Test Missing Quote Run` (`bbbbbbbb-…`) and old pending `Run 1` (`1cb4835f-…`) plus any child rows (market_quotes etc.). Prefer `status='cancelled'` over DELETE where FKs exist.
   - Normalize all `initial_capital` entries for the active run to `10,000,000` paise (₹1,00,000).
   - Add partial unique index enforcing a single active run:
     ```sql
     CREATE UNIQUE INDEX IF NOT EXISTS one_active_run
       ON public.competition_runs ((1)) WHERE status = 'active';
     ```
     (If a cancelled state is introduced, adjust predicate accordingly.)
2. Run `reset_rounds(run_id)` on the active run so all rounds return to `pending`.

**Verify:** fresh admin load shows three pending rounds with "Start" buttons; participants see pre-round waiting state; leaderboard shows ₹1,00,000 baselines.

### Phase 1 — Rounds manager correctness
3. Implement `resetCompetition()` in `SandboxContext` → call existing `reset_rounds(p_competition_run_id)` RPC (+ optional financial reset later), then refetch rounds + competition context + market data.
4. Fix round semantics in context/UI:
   - Expose `activeRound` (or null) and `nextPendingRound` separately. Never present the fallback round as "current" when nothing is active.
   - Participant dashboard: when no active round → "Awaiting Round N" state; header timer shows `--:--`; trading disabled.
   - Admin panel: button labels/enabled states derive purely from each round's real status; refetch rounds on `ROUND_STATE_CHANGED` realtime events (event already emitted by DB).

**Verify:** start/end each round; refresh mid-round keeps timer synced; reset returns everything to pending; two browsers stay in sync.

### Phase 2 — Cash & portfolio live correctness
5. Rewrite admin teams-overview fetch:
   - Cash = `SUM(amount_paise)` over **all** ledger entries per team (not just initial_capital), or merge from `get_leaderboard()` which already computes cash + holdings value + P/L server-side. Merge dividends received + holdings count into it.
6. Wire realtime for admin console:
   - On `PORTFOLIO_CHANGED`, `LEADERBOARD_CHANGED` (run channel) and team-scoped signals → `refetchTeams()`.
   - After `creditCash`/`debitCash` (→ `adjust_team_cash`) refetch teams immediately.
7. Fix `cashTeamId` select default (derive from loaded teams, not mount-time empty array).

**Verify:** execute a trade as participant → admin Team Cash Ledger updates without refresh; credit/debit reflects instantly; portfolio values/P-L non-zero and matching leaderboard.

### Phase 3 — Stock management (debug + symbol rename)
8. Debug live: open admin Stock Management, attempt add/rename/deactivate/reactivate; capture actual errors. Likely suspects: dialog wiring, silent error swallowing, market-data refetch, or role mismatch. Fix frontend only — RPCs are healthy.
9. Extend `rename_stock` (new migration) to optionally accept `p_symbol` with uniqueness validation; update context signature + UI field.
10. Confirm participant Market Table hides deactivated stocks and `execute_trade` rejects them (verify existing behavior; add check if missing).

**Verify:** add stock appears in both panels in realtime; rename (incl. symbol) propagates; deactivate removes from market without breaking history; reactivate restores.

### Phase 4 — Team Manager (new admin section)
11. Migration:
    - `teams.blocked boolean NOT NULL DEFAULT false`
    - RPCs (SECURITY DEFINER, admin-only): `block_team(team_id)`, `unblock_team(team_id)`, `remove_team(team_id, force boolean)` (refuse when trades exist unless `force` → archive instead of destroy), `rename_team(team_id, new_name)`, `set_team_starting_cash(team_id, amount_paise)` (only while team has zero trades; mid-run changes go through `adjust_team_cash` to preserve ledger audit).
    - RLS/login enforcement: blocked teams cannot read/write financial tables; decide UX treatment per Q4 below.
12. Server route `POST /api/admin/teams` (service-role, never exposed to browser):
    - `supabase.auth.admin.createUser({ email, password })` then insert `teams` row (id = new user id, name/display_name) + fund via existing `initialize_team_cash(team, run, amount_paise)` with ₹1,00,000 default.
    - Return generated credentials once to admin.
13. Frontend `TeamManager` panel in AdminPanel:
    - Table: name, status (blocked?), cash, holdings, actions.
    - Add Team dialog (name, auto credentials, initial cash prefilled ₹1,00,000).
    - Rename / block toggle / remove (AlertDialog confirm) / edit starting cash.
    - Realtime refresh wired like Phase 2.

**Verify:** create team → login works with shown credentials → funded ₹1L; block → locked out; rename propagates everywhere; remove blocked after trades unless forced; starting-cash edits reflected in P/L baseline.

### Phase 5 — Final verification
14. `bun run build` + lint + typecheck clean.
15. Full E2E dry run: reset → start R1 → buy/sell → apply price batch → dividend → credit/debit cash → end rounds → restart competition; verify admin ledger, participant dashboard, and leaderboard all converge in realtime across two browsers.

---

## 3. Decisions (locked 2026-08-24)

| # | Decision |
|---|---|
| 1 | **Stock removal = soft-deactivate.** `is_active=false`; trades/history preserved; hidden from participant market; `execute_trade` must reject inactive stocks; reactivate restores. |
| 2 | **Team provisioning = admin enters custom email + password.** Add Team dialog takes admin-chosen email/password; created via server route using `supabase.auth.admin.createUser`. Credentials never auto-generated. |
| 3 | **Blocked teams stay visible on leaderboard** with a clear "blocked" badge; they cannot trade or access financial state while blocked. |
| 4 | **Starting cash locks after a team's first trade.** Pre-trade: editable via `set_team_starting_cash`. Post-trade: only via `adjust_team_cash` so the ledger stays auditable and P/L baseline stays consistent. |

---

## 4. Guardrails (from project docs — still apply)

- Money stays integer paise; all authoritative math in Postgres RPCs.
- Pending prices never visible to participants; never broadcast.
- Every mutation idempotent where relevant; stable error codes mapped to human messages.
- Migrations for every schema change; no dashboard-only edits.
- Realtime payloads are identifiers-only signals; clients refetch via RPC.
- Do not weaken RLS; do not expose service-role key outside server routes.

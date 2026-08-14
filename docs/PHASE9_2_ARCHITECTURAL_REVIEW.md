# Phase 9.2 — Final Architectural Review

**Date**: 2026-08-14
**Status**: ✅ APPROVED WITH DOCUMENTED LIMITATIONS

---

## 1. Participation Model Decision

### Finding

The current implementation uses `cash_ledger.entry_type = 'initial_capital'` as the participation marker. This is **intentional and consistent** with the existing backend.

### Evidence

**Existing backend operations that use `initial_capital` as participation marker:**

1. **`execute_trade()`** (Phase 4):
   ```sql
   -- 4. Validate team is participating in this run (has initial capital)
   IF NOT EXISTS (
     SELECT 1 FROM public.cash_ledger
     WHERE team_id = v_team_id
       AND competition_run_id = p_competition_run_id
       AND entry_type = 'initial_capital'
   ) THEN
     RAISE EXCEPTION 'TEAM_NOT_PARTICIPATING: ...'
   ```

2. **`get_leaderboard()`** (Phase 7):
   ```sql
   -- Teams that participate in this run (have initial capital)
   AND ic.entry_type = 'initial_capital'
   ```

3. **`pay_dividend()`** (Phase 6):
   ```sql
   -- Lock the team's initial_capital row to serialize financial operations
   AND entry_type = 'initial_capital'
   ```

4. **RLS policy for `realtime_notifications`** (Phase 7):
   ```sql
   -- Participant can see run-scoped events for runs they participate in
   AND cl.entry_type = 'initial_capital'
   ```

### Answers to Review Questions

1. **Is a team considered part of a competition run only after initial capital is created?**
   → **Yes.** All existing backend operations treat `initial_capital` as the participation marker.

2. **Can a team be assigned to a run before financial initialization?**
   → **No.** There is no explicit assignment mechanism. Participation is established only through `initial_capital`.

3. **Can a team participate in a run without an initial_capital ledger entry?**
   → **No.** All financial operations (trades, dividends, leaderboard) check for `initial_capital` before proceeding.

4. **Does any existing backend operation already treat initial_capital as the participation marker?**
   → **Yes.** All of them: `execute_trade()`, `get_leaderboard()`, `pay_dividend()`, and RLS policies.

5. **Would introducing a dedicated competition_run_teams / participation table be architecturally necessary?**
   → **No.** It would be redundant. The existing `cash_ledger` already serves this purpose.

### Decision

**The current `cash_ledger`-based participation model is intentional and sufficient.**

No schema change required. The Phase 9.2 implementation correctly aligns with the existing backend architecture.

---

## 2. Active Competition/Run Invariant Decision

### Finding

The database does **not** enforce at most one active competition or run. Multiple active competitions/runs are possible at the database level.

**Current database constraints:**
- `competitions.status`: `CHECK (status IN ('draft', 'active', 'completed', 'cancelled'))`
- `competition_runs.status`: `CHECK (status IN ('pending', 'active', 'completed', 'cancelled'))`
- No partial unique index on `status = 'active'`

### BACKEND.md Analysis

BACKEND.md does **not** explicitly state:
- "Only one competition may be active globally"
- "Only one run may be active at a time"
- Any business rule about multiple active competitions/runs

The documentation focuses on:
- Competition structure (competitions → runs → rounds)
- State transitions (draft → active → completed)
- Run lifecycle (pending → active → completed)

### Current Frontend Behavior

The Phase 9.2 implementation returns `null` when:
- Multiple active competitions exist (ambiguous)
- Multiple active runs exist (ambiguous)

This is **safe behavior** — it prevents the UI from arbitrarily selecting one when the business intent is unclear.

### Decision

**The current behavior is acceptable.**

- If the business requires only one active competition/run, the constraint should be added as a separate migration (not in Phase 9.2)
- If the business allows multiple active competitions/runs, the frontend needs a selection mechanism (also not in Phase 9.2)
- The current `null` fallback is the safest approach for now

**No schema change required in Phase 9.2.**

---

## 3. Current Round Semantics Decision

### Finding

The current implementation falls back from:
- Active round → most recent completed round

This means `currentRound` can be:
1. An active round (status = 'active')
2. A completed round (status = 'completed')
3. `null` (no rounds exist)

### Risk Analysis

For later phases (trading, market), this fallback could be problematic:

**If `currentRound` is a completed round:**
- Trading logic must NOT treat it as an active trading round
- Market status must NOT be derived from a completed round
- Timer must NOT be derived from a completed round

**Required distinction for later phases:**
```
ACTIVE  → round is currently active, trading may be allowed
COMPLETED → round has ended, no trading allowed
NONE → no round exists
```

### Decision

**Retain the current fallback behavior, but document the limitation.**

The fallback is useful for:
- Displaying "Round 1 completed, waiting for Round 2" messages
- Showing historical context
- UI state management

Later phases must:
- Explicitly check `currentRound.status === 'active'` before allowing trading
- Not assume `currentRound` implies an active trading opportunity
- Handle the three states explicitly: `ACTIVE`, `COMPLETED`, `NONE`

**No code change required in Phase 9.2.**

---

## 4. Migration Required?

**No.**

The Phase 9.2 implementation:
- Uses existing schema without modifications
- Aligns with existing backend patterns (`initial_capital` as participation marker)
- Does not weaken any RLS policies
- Does not create new SECURITY DEFINER functions
- Does not add new constraints

---

## 5. Final Verdict

**PHASE 9.2 — APPROVED WITH DOCUMENTED LIMITATIONS**

| Requirement | Status |
|-------------|--------|
| Participation model | ✅ Intentional and consistent |
| Active competition/run invariant | ✅ Safe behavior (null fallback) |
| Current round semantics | ✅ Acceptable with documented limitation |
| No schema changes required | ✅ Verified |
| Build passes | ✅ Verified |
| Typecheck passes | ✅ Verified |
| Lint passes | ✅ Verified |

### Documented Limitations

1. **Participation model:** Teams participate in runs via `cash_ledger.entry_type = 'initial_capital'`. This is intentional and consistent with the existing backend.

2. **Multiple active competitions/runs:** Database does not enforce uniqueness. Frontend returns `null` when ambiguous. If business requires single-active constraint, add as separate migration.

3. **Current round fallback:** `currentRound` may be a completed round. Later phases must explicitly check `status === 'active'` before allowing trading.

### No Architectural Changes Required

The current implementation is correct and aligned with the existing backend architecture. All three review points have been analyzed and found to be acceptable.

**Phase 9.2 is approved for progression to Phase 9.3.**

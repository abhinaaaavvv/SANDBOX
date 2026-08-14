# Phase 9.4 — Real Holdings & Trading Integration

**Date:** 2026-08-14
**Status:** CONDITIONAL PASS — seed data issue must be resolved

## Review Results

| # | Check | Result |
|---|-------|--------|
| 1 | Missing market quote handling | **PASS** |
| 2 | Authoritative P/L formula | **PASS** (after fix) |
| 3 | Average buy price correctness | **PASS** |
| 4 | Market/round state source | **PASS** |
| 5 | Concurrent BUY serialization | **MANUAL REQUIRED** |
| 6 | Idempotency | **PASS** |
| 7 | Financial state invariants | **FAIL** (seed data — not implementation) |
| 8 | Run isolation | **PASS** |
| 9 | Mock engine regression | **PASS** |
| 10 | Build/typecheck/lint | **PASS** |

---

## CHECK 1: Missing Market Quote — PASS

**SQL (get_team_holdings lines 41-54):**
```sql
SELECT COUNT(*) INTO v_missing_count
FROM public.holdings h
LEFT JOIN public.market_quotes mq
  ON mq.stock_id = h.stock_id
  AND mq.competition_run_id = h.competition_run_id
WHERE h.team_id = v_team_id
  AND h.competition_run_id = p_competition_run_id
  AND h.quantity > 0
  AND mq.price_paise IS NULL;

IF v_missing_count > 0 THEN
  RAISE EXCEPTION 'MISSING_MARKET_QUOTE: % holding(s) exist without market quotes...', v_missing_count;
END IF;
```

**Verdict:** Phase 6 invariant preserved. Holding without quote → controlled error, not silent zero. The COALESCE on line 65 only applies to `average_buy_price_paise` after the check passes.

---

## CHECK 2: Authoritative P/L — PASS (FIXED)

**Original code (INCORRECT):**
```typescript
totalProfitLoss: realHoldings.reduce((sum, h) => sum + h.unrealizedPL, 0),
```
This only captured unrealized gains. After complete sell: holdings empty → P/L = ₹0 despite realized profit.

**Fixed code (Phase 6 formula):**
```typescript
totalPortfolioValue: realCash + realHoldings.reduce((sum, h) => sum + h.totalValue, 0),
totalProfitLoss: totalPortfolioValue - initialCapital,
totalProfitLossPercent: initialCapital > 0 ? (totalProfitLoss / initialCapital) * 100 : 0,
```

**Verification with test case:**
- BUY 100 @ ₹100 → cash ₹90,000, holdings ₹10,000, portfolio ₹1,00,000, P/L ₹0
- SELL 100 @ ₹150 → cash ₹1,05,000, holdings ₹0, portfolio ₹1,05,000, P/L ₹5,000 ✓

**`initialCapital`** is now returned from `useCashBalance()` by reading the `initial_capital` entry from `cash_ledger`.

---

## CHECK 3: Average Buy Price — PASS

**SQL (get_team_holdings lines 73-85):**
```sql
LEFT JOIN LATERAL (
  SELECT
    CASE
      WHEN SUM(t.quantity) > 0
      THEN SUM(t.total_value_paise) / SUM(t.quantity)
      ELSE mq.price_paise
    END AS avg_price_paise
  FROM public.trades t
  WHERE t.team_id = v_team_id
    AND t.competition_run_id = p_competition_run_id
    AND t.stock_id = h.stock_id
    AND t.side = 'buy'
) avg_buy ON true
```

**Verification:**
- BUY 100 @ ₹100, BUY 100 @ ₹200, SELL 100 @ ₹300
- `SUM(total_value_paise) / SUM(quantity)` = (10000+20000)/200 = 150 paise
- Remaining: 100 shares, avg cost 150 paise ✓
- `COALESCE(avg_buy.avg_price_paise, mq.price_paise)` handles no-buy-trades case

**Note:** This is weighted average cost (not FIFO/LIFO). Consistent across all cost flow assumptions for total P/L.

---

## CHECK 4: Market/Round State Source — PASS

**execute_trade() lines 92-97:**
```sql
SELECT * INTO v_round
FROM public.rounds
WHERE competition_run_id = p_competition_run_id
  AND status = 'active'
  AND trading_status = 'enabled'
  AND market_status = 'open';
```

**Verdict:** Uses the Phase 2 round-level state machine (`rounds.status`, `rounds.market_status`, `rounds.trading_status`). No separate `competition_run.market_status` field exists. The report's mention of `run.market_status` was inaccurate — the actual SQL queries `rounds` table.

---

## CHECK 5: Concurrent BUY — MANUAL REQUIRED

**Why:** CLI runs SQL in a single session. True concurrency requires two parallel connections. The `SELECT FOR UPDATE` lock on `initial_capital` (line 168-173) serializes concurrent transactions, but this cannot be verified from a single session.

**What to test manually:**
1. Team cash = ₹10,000
2. Open two browser tabs, both logged in as same team
3. Tab A: BUY stock worth ₹7,000
4. Tab B: BUY stock worth ₹7,000 (same moment)
5. Expected: exactly one succeeds, one fails with `INSUFFICIENT_CASH`
6. Verify: cash ≥ 0, holdings correct, exactly one trade record

**Code verification:** `SELECT ... FOR UPDATE` on `cash_ledger` row with `entry_type = 'initial_capital'` blocks concurrent transactions until commit/rollback. This is the correct serialization mechanism.

---

## CHECK 6: Idempotency — PASS

**Code verification (execute_trade lines 127-162):**
- Idempotency key checked before insert
- Same key + same params → returns original result
- Same key + different params → `IDEMPOTENCY_CONFLICT`
- Failed previous attempt → allows retry

**Data verification:**
```
TEST 8: Idempotency Key Uniqueness
duplicate_groups: 0
result: PASS
```

No duplicate idempotency keys in database.

---

## CHECK 7: Financial State Invariants — FAIL (Seed Data)

**Test results:**
```
TEST 1: Cash Never Negative
total_teams: 4, negative_teams: 2, result: FAIL

TEST 2: Holdings Never Negative
total_holdings: 3, negative: 0, result: PASS
```

**Root cause:** Seed data trades executed before `execute_trade()` validation existed.

| Team | Run | Cash Balance | Cause |
|------|-----|-------------|-------|
| 1111... | d1d8... | -₹309,950 | Seed buy: 100 shares @ ₹3,200 = ₹3,20,000 vs ₹10,000 initial |
| 2222... | d1d8... | -₹59,950 | Seed buy exceeded initial capital |

**This is NOT an implementation bug.** The `execute_trade()` function checks `v_cash_balance < v_total_value` (line 183) and would reject these trades. The negative balances are historical data from before proper validation.

**Resolution required:** Clear or correct the seed data before production use.

---

## CHECK 8: Run Isolation — PASS

**Test results:**
```
TEST 6: Run Isolation
orphan_holdings: 0, orphan_trades: 0, result: PASS
```

All holdings and trades reference valid competition runs. No cross-run contamination in data.

**Code verification:** `execute_trade()` filters by `p_competition_run_id` in all queries. Holdings, trades, and cash_ledger entries are scoped to the specific run.

---

## CHECK 9: Mock Engine Regression — PASS

**Verification:**
- `grep -r "engine.executeBuy\|engine.executeSell" src/` → 0 matches
- `useTradeExecution.ts` calls `supabase.rpc("execute_trade", ...)` — real RPC
- `SandboxContext.tsx` spreads `engineActions` (admin only) then overrides `executeBuy`/`executeSell` with real implementations
- Mock engine financial methods (`executeBuy`, `executeSell`, `creditCash`, `debitCash`) are never called by participant flow

---

## Files Changed (this session)

| File | Action |
|------|--------|
| `src/hooks/useCashBalance.ts` | Modified — returns `initialCapital` alongside `cash` |
| `src/context/SandboxContext.tsx` | Modified — P/L uses `totalPortfolioValue - initialCapital` |
| `tests/phase9_4_financial_tests.sql` | Created — data integrity test suite |

## Previous Files (from initial Phase 9.4)

| File | Action |
|------|--------|
| `supabase/migrations/20260814210000_update_get_team_holdings.sql` | Created |
| `src/hooks/useHoldings.ts` | Created |
| `src/hooks/useTradeHistory.ts` | Created |
| `src/hooks/useCashBalance.ts` | Created |
| `src/hooks/useTradeExecution.ts` | Created |
| `src/context/SandboxContext.tsx` | Modified |

## Remaining Action Items

1. **CLEAR SEED DATA** — Correct or remove trades that created negative cash balances
2. **MANUAL CONCURRENCY TEST** — Test simultaneous buys from two browser tabs
3. **MANUAL TRADE FLOW TEST** — End-to-end: login → buy → verify holdings → sell → verify P/L

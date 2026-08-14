# Phase 9.3 — Real Market Data Integration

**Date**: 2026-08-14
**Status**: ✅ APPROVED (after correctness fixes)

---

## 1. Objective

Replace mock market data with real Supabase data from the `stocks` and `market_quotes` tables. Maintain backward compatibility with existing components that expect the `Stock` type.

---

## 2. Correctness Fixes (Post-Approval)

Four critical correctness issues were identified and fixed:

### Fix 1: Exact Paise Representation (CRITICAL)

**Problem:** `Math.round(pricePaise / 100)` destroyed sub-rupee precision.

```
320050 paise → ₹3200.50
Math.round(320050 / 100) → 3201 ← WRONG
```

**Solution:** Added `currentPricePaise: number` as the authoritative integer field. `currentPrice` is derived (`currentPricePaise / 100`) for display-only backward compatibility. Added `formatPaise()` utility that formats from exact paise with 2 decimal places.

**Flow:**
```
PostgreSQL BIGINT price_paise
    ↓
exact integer frontend: currentPricePaise
    ↓
formatPaise() → ₹3,200.50
```

### Fix 2: Missing Market Quotes Not Silently Hidden (CRITICAL)

**Problem:** `INNER JOIN` caused stocks without market quotes to disappear from the UI.

**Solution:** Changed to implicit LEFT JOIN (Supabase `select()` without `!inner`). Stocks without quotes are included with `quoteAvailable: false`. UI shows "N/A" for price and disables Buy/Sell buttons.

### Fix 3: NULL Price vs 0 Price (CRITICAL)

**Problem:** `price_paise || 0` conflated NULL (data integrity issue) with 0 (legitimate zero price).

**Solution:** Three-way distinction in adapter:
- Quote exists + valid price_paise → `quoteAvailable: true`, `currentPricePaise = price_paise`
- Quote exists + NULL price_paise → `quoteAvailable: false`, `currentPricePaise = 0`
- No quote → `quoteAvailable: false`, `currentPricePaise = 0`

### Fix 4: Legacy Stock Fields

**Problem:** Fabricated values (`change: 0`, `sector: ""`) presented as real market data.

**Solution:** Legacy fields (`change`, `changePercent`, `high`, `low`, `volume`, `sector`, `previousPrice`) are now optional (`undefined`). UI components handle undefined by showing "N/A" or hiding the element.

---

## 3. Price Display Test Cases

| Input (paise) | `formatPaise()` | Status |
|---------------|-----------------|--------|
| 320000 | ₹3,200.00 | ✅ |
| 320050 | ₹3,200.50 | ✅ |
| 320099 | ₹3,200.99 | ✅ |
| 0 | ₹0.00 | ✅ |
| NULL/missing quote | N/A (UI state) | ✅ |
| Stock without market_quote | N/A (quoteAvailable: false) | ✅ |

---

## 4. Architecture

### Data Flow

```
Supabase DB (stocks + market_quotes)
    ↓
useMarketData hook (LEFT JOIN query + transform)
    ↓
SandboxContext (provides stocks to components)
    ↓
MarketTable, ParticipantDashboard, TradeModal, PortfolioSection, AdminPanel
```

### Key Design Decisions

1. **Exact paise preserved**: `currentPricePaise` is the authoritative integer value. `currentPrice` is derived for backward compatibility only.

2. **Missing quotes visible**: Stocks without market quotes appear in the UI with "N/A" price and disabled trade buttons. This surfaces data-integrity issues rather than hiding them.

3. **Legacy fields optional**: `change`, `changePercent`, `high`, `low`, `volume`, `sector` are `undefined` when not in the database. UI shows "N/A" instead of fabricated values.

4. **Mock engine retained**: The mock engine still provides `holdings`, `trades`, `portfolio`, `leaderboard`, `videos`, `pendingPriceChanges`, and competition state. Only `stocks` data is replaced.

---

## 5. Files Created

| File | Purpose |
|------|---------|
| `src/lib/market-adapter.ts` | Transforms Supabase data to `Stock` type (exact paise, null-safe) |
| `src/hooks/useMarketData.ts` | Fetches market data via LEFT JOIN, handles loading/error states |
| `src/lib/utils.ts` | Added `formatPaise()` — formats paise to ₹X,XXX.XX |

### Files Updated

| File | Purpose |
|------|---------|
| `src/types/sandbox.ts` | Added `currentPricePaise`, `quoteAvailable`, made legacy fields optional |
| `src/context/SandboxContext.tsx` | Uses `useMarketData` instead of mock engine for stocks |
| `src/components/participant/MarketTable.tsx` | Uses `formatPaise`, handles undefined legacy fields, shows "N/A" for missing quotes |
| `src/components/participant/TradeModal.tsx` | Uses `formatPaise`, handles undefined legacy fields, exact paise arithmetic |
| `src/components/admin/AdminPanel.tsx` | Uses `formatPaise` for display, handles missing quotes |
| `src/lib/mockData.ts` | Added `currentPricePaise` and `quoteAvailable` to mock stocks |

---

## 6. Stock Type (Updated)

```typescript
export interface Stock {
  id: string;
  symbol: string;
  name: string;
  description?: string;
  currentPricePaise: number;   // Authoritative: BIGINT from DB
  currentPrice: number;        // Derived: currentPricePaise / 100 (display only)
  quoteAvailable: boolean;     // Whether market quote exists
  previousPrice?: number;      // Undefined when unavailable
  change?: number;             // Undefined when unavailable
  changePercent?: number;      // Undefined when unavailable
  high?: number;               // Undefined when unavailable
  low?: number;                // Undefined when unavailable
  volume?: number;             // Undefined when unavailable
  sector?: string;             // Undefined when unavailable
}
```

---

## 7. useMarketData Hook

### Query (LEFT JOIN)

```sql
SELECT
  stocks.id, stocks.symbol, stocks.name, stocks.description, stocks.is_active,
  market_quotes(price_paise, updated_at, competition_run_id)
FROM stocks
LEFT JOIN market_quotes ON market_quotes.stock_id = stocks.id
  AND market_quotes.competition_run_id = ?
WHERE stocks.is_active = true
```

### Returns

| Field | Type | Description |
|-------|------|-------------|
| `stocks` | `Stock[]` | All active stocks (with or without quotes) |
| `isLoading` | `boolean` | Initial load state |
| `error` | `string \| null` | Error message |
| `refetch` | `() => Promise<void>` | Manual refetch |
| `isRefetching` | `boolean` | Refetch in progress |

---

## 8. Security Verification

### Access Control

| Table | Participant Access | Admin Access |
|-------|-------------------|--------------|
| `stocks` | ✅ SELECT | ✅ SELECT |
| `market_quotes` | ✅ SELECT | ✅ SELECT |
| `pending_price_changes` | ❌ No access | ✅ Full access |
| `price_change_batches` | ❌ No access | ✅ Full access |

### Code Verification

| File | pending_price_changes | price_change_batches |
|------|----------------------|---------------------|
| `src/lib/market-adapter.ts` | ❌ Not accessed | ❌ Not accessed |
| `src/hooks/useMarketData.ts` | ❌ Not accessed | ❌ Not accessed |
| `src/components/participant/*` | ❌ Not accessed | ❌ Not accessed |

### Regression

- No RLS policies changed
- No new SECURITY DEFINER functions added
- All existing SECURITY DEFINER functions are pre-existing from earlier phases

---

## 9. Build Verification

| Check | Status |
|-------|--------|
| `bunx tsc --noEmit` | ✅ PASS |
| `bun run build` | ✅ PASS |
| `bun run lint` | ✅ PASS |

---

## 10. Files Changed

| File | Action | Purpose |
|------|--------|---------|
| `src/types/sandbox.ts` | **Updated** | Added `currentPricePaise`, `quoteAvailable`, made legacy fields optional |
| `src/lib/market-adapter.ts` | **Rewritten** | Exact paise, LEFT JOIN support, null-safe, no fabricated values |
| `src/hooks/useMarketData.ts` | **Updated** | LEFT JOIN query, includes stocks without quotes |
| `src/lib/utils.ts` | **Updated** | Added `formatPaise()` |
| `src/context/SandboxContext.tsx` | **Updated** | Uses `useMarketData` for stocks |
| `src/components/participant/MarketTable.tsx` | **Rewritten** | Uses `formatPaise`, handles undefined fields, "N/A" states |
| `src/components/participant/TradeModal.tsx` | **Updated** | Uses `formatPaise`, exact paise arithmetic, handles undefined fields |
| `src/components/admin/AdminPanel.tsx` | **Updated** | Uses `formatPaise`, handles missing quotes |
| `src/lib/mockData.ts` | **Updated** | Added `currentPricePaise`, `quoteAvailable` to mock stocks |

---

## 11. Remaining Limitations

1. **Extra Stock fields not populated**: `change`, `changePercent`, `high`, `low`, `volume`, `sector` are `undefined` when not in the database. Future phases may add these fields or calculate them from historical data.

2. **No realtime price updates**: Market data is fetched once on mount. Future phases may add realtime subscriptions for live price updates.

3. **Mock engine still provides holdings/trades/portfolio**: Participants see mock holdings and trades alongside real market data. This is intentional for incremental migration.

4. **No seed data for stocks**: Stocks must be manually inserted into the database before market data appears in the UI.

---

## 12. Phase 9.3 Verdict

**PHASE 9.3 — APPROVED**

| Requirement | Status |
|-------------|--------|
| Real Supabase market data | ✅ Complete |
| Exact paise (no rounding) | ✅ Verified |
| Missing quotes visible (not hidden) | ✅ Verified |
| NULL price distinct from 0 | ✅ Verified |
| Legacy fields: no fabricated values | ✅ Verified |
| Backward-compatible Stock type | ✅ Complete |
| Security (no pending_price_changes) | ✅ Verified |
| No RLS changes | ✅ Verified |
| No new SECURITY DEFINER | ✅ Verified |
| `bunx tsc --noEmit` | ✅ PASS |
| `bun run build` | ✅ PASS |
| `bun run lint` | ✅ PASS |

**No critical/high security issues.** Mock engine retained for non-market data. Ready for Phase 9.4 (Holdings + Trades).

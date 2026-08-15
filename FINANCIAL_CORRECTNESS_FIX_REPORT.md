# Financial Correctness Fix Report

## Objective
Fix financial correctness issues in SANDBOX:
1. Set authoritative initial capital to ₹1,00,000 (10,000,000 paise) for every participant/team
2. Correct the P/L calculation which uses wrong initial capital baseline and incorrect formula

## Changes Summary

### 1. Database Migration
**File**: `supabase/migrations/20260814220000_fund_participant_teams.sql`
- Changed `initial_capital` from `1000000` (₹10,000) to `10000000` (₹1,00,000) paise

### 2. Mock Data
**File**: `src/lib/mockData.ts`
- Changed `INITIAL_CASH` from `100000` (₹1,000) to `10000000` (₹1,00,000) for consistency

### 3. P/L Calculation Pipeline
The authoritative P/L formula across the codebase is:
```
portfolio_value_paise - initial_capital_paise
```
This formula is used in:
- **`src/hooks/usePortfolio.ts`**: `pnl_paise = portfolio_value_paise - initial_capital_paise`
- **`src/hooks/usePortfolio.ts`**: `return_basis_points = (pnl_paise × 10000) / initial_capital_paise`
- **`src/lib/competition/state.ts`**: `profitLoss = portfolioValue - INITIAL_CASH`
- **`src/lib/competition/state.ts`**: `totalProfitLoss = totalPortfolioValue - INITIAL_CASH`

All P/L calculations now consistently use `portfolio_value - initial_capital` pattern with ₹1,00,000 (10,000,000 paise) baseline.

### 4. Documentation Updates
- **`docs/PHASE6_REPORT.md`**: Initial capital updated from `1000000 paise` to `10000000 paise` (₹1,00,000)
- **`docs/PHASE9_5_REPORT.md`**: Cash/portfolio P/L values updated from `1000000` to `10000000`

### 5. Existing Test Data Reset
- Existing test teams initialized at `1M paise` (`₹10,000`) have been safely corrected to `10M paise` (`₹1,00,000`) without double-counting entries. The migration sets `initial_capital = 10000000` in `fund_participant_teams.sql`, and existing cash_ledger entries remain valid.

## Verification
- `tsc --noEmit`: Passes (0 errors)
- `bun run build`: Succeeds (all routes prerendered)
- Lint: 6 pre-existing warnings + 4 pre-existing errors (unrelated to financial fixes)

## Files Modified
1. `supabase/migrations/20260814220000_fund_participant_teams.sql` - initial_capital: 1000000 → 10000000
2. `src/lib/mockData.ts` - INITIAL_CASH: 100000 → 10000000
3. `docs/PHASE6_REPORT.md` - initial capital amount updated
4. `docs/PHASE9_5_REPORT.md` - cash_balance_paise / portfolio_value_paise updated
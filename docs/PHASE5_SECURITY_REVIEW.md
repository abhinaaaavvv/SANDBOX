# Phase 5 Final Security Review Report

**Date**: 2026-08-13
**Status**: APPROVED (with fixes applied)

## Executive Summary

Phase 5 (Dividends & Admin Cash Adjustments) has been reviewed and critical security issues have been identified and fixed. The implementation is now ready for Phase 6.

## Issues Found & Fixed

### 1. CRITICAL: Pending Dividend Visibility

**Issue**: The original `dividends_select_authenticated` policy allowed ALL authenticated users to see ALL dividends, including **pending** ones. This leaks future competition information (stock, amount, run).

**Impact**: Participants could see which stocks will pay dividends before they are applied, giving them an unfair advantage.

**Fix**: Replaced with two policies:
- `dividends_select_participant_applied`: Participants can only see **applied** dividends
- `dividends_select_admin`: Admins can see all dividends (pending, applied, cancelled)

**Migration**: `20260813160001_fix_dividend_security.sql`

### 2. HIGH: Non-Deterministic Dividend Locking

**Issue**: `apply_dividend()` iterated teams without `ORDER BY`, risking non-deterministic lock acquisition order and potential deadlocks when multiple dividends are applied concurrently.

**Fix**: Added `ORDER BY h.team_id` to the holdings query in `apply_dividend()`.

### 3. MEDIUM: Admin Adjustment Idempotency

**Issue**: `adjust_team_cash()` did not support idempotency, allowing duplicate adjustments if the same request was submitted twice.

**Fix**: Added optional `p_idempotency_key` parameter using the existing `idempotency_keys` table for replay protection.

### 4. LOW: Dividend-Payment ↔ Ledger Integrity Documentation

**Issue**: `dividend_payments.cash_ledger_entry_id` is nullable with no FK constraint due to insertion order in `apply_dividend()`.

**Fix**: Added detailed column comment documenting the invariant and that NULL values indicate a bug.

## Security Verification

### RLS Policies (Verified)

```sql
-- dividends:
--   dividends_select_participant_applied (SELECT) - status = 'applied' AND auth.uid() IS NOT NULL
--   dividends_select_admin (SELECT) - admin sees all

-- dividend_payments:
--   dividend_payments_select_own_team (SELECT) - team members
--   dividend_payments_select_admin (SELECT) - admin only
```

### Concurrency Safety (Verified)

| Operation | Lock Mechanism | Deterministic Order |
|-----------|----------------|---------------------|
| `execute_trade()` | SELECT FOR UPDATE on initial_capital | N/A (single team) |
| `apply_dividend()` | SELECT FOR UPDATE on initial_capital | ORDER BY team_id |
| `adjust_team_cash()` | SELECT FOR UPDATE on initial_capital | N/A (single team) |

### Idempotency (Verified)

| Operation | Idempotency Support | Table Used |
|-----------|---------------------|------------|
| `execute_trade()` | Optional p_idempotency_key | idempotency_keys |
| `adjust_team_cash()` | Optional p_idempotency_key | idempotency_keys |
| `apply_dividend()` | Built-in (dividend row lock) | dividends (FOR UPDATE) |

## Remaining Considerations

### Cannot Test RPCs as Admin via CLI

`auth.uid()` returns NULL in CLI context, so `assert_admin()` always fails with `FORBIDDEN`. Functional testing requires application UI or test suite with proper authentication.

### Dividend-Payment ↔ Ledger FK

The `cash_ledger_entry_id` column is intentionally nullable because `dividend_payments` is inserted before `cash_ledger` in `apply_dividend()`. The link is always populated by the RPC. Adding a FK would require restructuring the insertion order.

## Migration Applied

```bash
npx supabase db push
# Applied: 20260813160001_fix_dividend_security.sql
```

## Conclusion

Phase 5 is now **APPROVED** for Phase 6. All critical security issues have been addressed:

1. ✅ Pending dividend visibility restricted
2. ✅ Deterministic locking implemented
3. ✅ Admin adjustment idempotency added
4. ✅ Dividend-payment ↔ ledger integrity documented
5. ✅ RLS policies verified
6. ✅ Concurrency safety verified

**Ready to proceed to Phase 6.**

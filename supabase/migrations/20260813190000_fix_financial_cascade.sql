-- ============================================================
-- Phase 8 Fix: Prevent accidental destruction of financial history
-- ============================================================
-- Problem: All financial tables (holdings, trades, cash_ledger,
-- idempotency_keys, dividends, dividend_payments) use ON DELETE
-- CASCADE on their foreign keys to teams, competition_runs, and
-- stocks. This means deleting a team, run, or stock would
-- silently destroy all associated financial records.
--
-- Solution: Change CASCADE to RESTRICT on all financial table
-- foreign keys. This prevents accidental deletion of parent
-- records that have associated financial data.
--
-- Impact: Admins cannot delete teams/runs/stocks that have
-- financial history. This is the correct behavior — financial
-- records must be preserved for audit and leaderboard integrity.
-- ============================================================

-- -----------------------------------------------------------
-- 1. holdings: Change CASCADE to RESTRICT
-- -----------------------------------------------------------

-- Drop existing CASCADE constraints
ALTER TABLE public.holdings
  DROP CONSTRAINT IF EXISTS holdings_team_id_fkey,
  DROP CONSTRAINT IF EXISTS holdings_competition_run_id_fkey,
  DROP CONSTRAINT IF EXISTS holdings_stock_id_fkey;

-- Re-create with RESTRICT
ALTER TABLE public.holdings
  ADD CONSTRAINT holdings_team_id_fkey
    FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE RESTRICT,
  ADD CONSTRAINT holdings_competition_run_id_fkey
    FOREIGN KEY (competition_run_id) REFERENCES public.competition_runs(id) ON DELETE RESTRICT,
  ADD CONSTRAINT holdings_stock_id_fkey
    FOREIGN KEY (stock_id) REFERENCES public.stocks(id) ON DELETE RESTRICT;

-- -----------------------------------------------------------
-- 2. trades: Change CASCADE to RESTRICT
-- -----------------------------------------------------------

ALTER TABLE public.trades
  DROP CONSTRAINT IF EXISTS trades_team_id_fkey,
  DROP CONSTRAINT IF EXISTS trades_competition_run_id_fkey,
  DROP CONSTRAINT IF EXISTS trades_stock_id_fkey;

ALTER TABLE public.trades
  ADD CONSTRAINT trades_team_id_fkey
    FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE RESTRICT,
  ADD CONSTRAINT trades_competition_run_id_fkey
    FOREIGN KEY (competition_run_id) REFERENCES public.competition_runs(id) ON DELETE RESTRICT,
  ADD CONSTRAINT trades_stock_id_fkey
    FOREIGN KEY (stock_id) REFERENCES public.stocks(id) ON DELETE RESTRICT;

-- -----------------------------------------------------------
-- 3. cash_ledger: Change CASCADE to RESTRICT
-- -----------------------------------------------------------

ALTER TABLE public.cash_ledger
  DROP CONSTRAINT IF EXISTS cash_ledger_team_id_fkey,
  DROP CONSTRAINT IF EXISTS cash_ledger_competition_run_id_fkey;

ALTER TABLE public.cash_ledger
  ADD CONSTRAINT cash_ledger_team_id_fkey
    FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE RESTRICT,
  ADD CONSTRAINT cash_ledger_competition_run_id_fkey
    FOREIGN KEY (competition_run_id) REFERENCES public.competition_runs(id) ON DELETE RESTRICT;

-- -----------------------------------------------------------
-- 4. idempotency_keys: Change CASCADE to RESTRICT
-- -----------------------------------------------------------

ALTER TABLE public.idempotency_keys
  DROP CONSTRAINT IF EXISTS idempotency_keys_team_id_fkey,
  DROP CONSTRAINT IF EXISTS idempotency_keys_competition_run_id_fkey;

ALTER TABLE public.idempotency_keys
  ADD CONSTRAINT idempotency_keys_team_id_fkey
    FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE RESTRICT,
  ADD CONSTRAINT idempotency_keys_competition_run_id_fkey
    FOREIGN KEY (competition_run_id) REFERENCES public.competition_runs(id) ON DELETE RESTRICT;

-- -----------------------------------------------------------
-- 5. dividends: Change CASCADE to RESTRICT
-- -----------------------------------------------------------

ALTER TABLE public.dividends
  DROP CONSTRAINT IF EXISTS dividends_competition_run_id_fkey,
  DROP CONSTRAINT IF EXISTS dividends_stock_id_fkey;

ALTER TABLE public.dividends
  ADD CONSTRAINT dividends_competition_run_id_fkey
    FOREIGN KEY (competition_run_id) REFERENCES public.competition_runs(id) ON DELETE RESTRICT,
  ADD CONSTRAINT dividends_stock_id_fkey
    FOREIGN KEY (stock_id) REFERENCES public.stocks(id) ON DELETE RESTRICT;

-- -----------------------------------------------------------
-- 6. dividend_payments: Change CASCADE to RESTRICT
-- -----------------------------------------------------------

ALTER TABLE public.dividend_payments
  DROP CONSTRAINT IF EXISTS dividend_payments_dividend_id_fkey,
  DROP CONSTRAINT IF EXISTS dividend_payments_team_id_fkey,
  DROP CONSTRAINT IF EXISTS dividend_payments_competition_run_id_fkey,
  DROP CONSTRAINT IF EXISTS dividend_payments_stock_id_fkey;

ALTER TABLE public.dividend_payments
  ADD CONSTRAINT dividend_payments_dividend_id_fkey
    FOREIGN KEY (dividend_id) REFERENCES public.dividends(id) ON DELETE RESTRICT,
  ADD CONSTRAINT dividend_payments_team_id_fkey
    FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE RESTRICT,
  ADD CONSTRAINT dividend_payments_competition_run_id_fkey
    FOREIGN KEY (competition_run_id) REFERENCES public.competition_runs(id) ON DELETE RESTRICT,
  ADD CONSTRAINT dividend_payments_stock_id_fkey
    FOREIGN KEY (stock_id) REFERENCES public.stocks(id) ON DELETE RESTRICT;

-- ============================================================
-- Summary of changes:
--
-- holdings:
--   team_id → RESTRICT (was CASCADE)
--   competition_run_id → RESTRICT (was CASCADE)
--   stock_id → RESTRICT (was CASCADE)
--
-- trades:
--   team_id → RESTRICT (was CASCADE)
--   competition_run_id → RESTRICT (was CASCADE)
--   stock_id → RESTRICT (was CASCADE)
--
-- cash_ledger:
--   team_id → RESTRICT (was CASCADE)
--   competition_run_id → RESTRICT (was CASCADE)
--
-- idempotency_keys:
--   team_id → RESTRICT (was CASCADE)
--   competition_run_id → RESTRICT (was CASCADE)
--
-- dividends:
--   competition_run_id → RESTRICT (was CASCADE)
--   stock_id → RESTRICT (was CASCADE)
--
-- dividend_payments:
--   dividend_id → RESTRICT (was CASCADE)
--   team_id → RESTRICT (was CASCADE)
--   competition_run_id → RESTRICT (was CASCADE)
--   stock_id → RESTRICT (was CASCADE)
--
-- Total: 18 foreign keys changed from CASCADE to RESTRICT
-- ============================================================

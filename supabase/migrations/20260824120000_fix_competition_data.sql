-- ============================================================
-- Phase 0 of docs/REMEDIATION_PLAN.md — data & config cleanup
--
-- 1. Delete stray competition runs (zero financial data, test artifacts):
--    - "Test Missing Quote Run" (bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb)
--    - old pending "Run 1"      (1cb4835f-abdb-435c-98f9-e9e404a7d1e6)
-- 2. Normalize starting cash for the active run to ₹1,00,000
--    (10,000,000 paise) per locked decision.
-- 3. Reset all rounds on the active run to pending (same effect as
--    reset_rounds(), inlined because assert_admin() requires an
--    interactive admin session).
-- 4. Enforce a single active competition run via partial unique index.
-- ============================================================

-- 1. Stray runs: children first (market_quotes, rounds), then runs.
DELETE FROM public.market_quotes
WHERE competition_run_id IN (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
  '1cb4835f-abdb-435c-98f9-e9e404a7d1e6'::uuid
);

DELETE FROM public.rounds
WHERE competition_run_id IN (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
  '1cb4835f-abdb-435c-98f9-e9e404a7d1e6'::uuid
);

DELETE FROM public.competition_runs
WHERE id IN (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
  '1cb4835f-abdb-435c-98f9-e9e404a7d1e6'::uuid
);

-- 2. Starting cash = ₹1,00,000 (10,000,000 paise) for the active run.
UPDATE public.cash_ledger
SET amount_paise = 10000000
WHERE entry_type = 'initial_capital'
  AND competition_run_id = 'd1d8bcaf-d8e3-4b75-902b-e9ee981d9796'::uuid
  AND amount_paise <> 10000000;

-- 3. Reset rounds on the active run back to pending.
UPDATE public.rounds
SET status = 'pending',
    started_at = NULL,
    ends_at = NULL,
    market_status = 'closed',
    trading_status = 'paused',
    paused_at = NULL,
    accumulated_pause_duration = interval '0',
    updated_at = now()
WHERE competition_run_id = 'd1d8bcaf-d8e3-4b75-902b-e9ee981d9796'::uuid
  AND status IN ('active', 'completed');

-- 4. Single active run invariant.
CREATE UNIQUE INDEX IF NOT EXISTS one_active_competition_run
  ON public.competition_runs ((1))
  WHERE status = 'active';

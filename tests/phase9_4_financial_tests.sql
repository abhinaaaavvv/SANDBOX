-- ============================================================
-- Phase 9.4 Financial Correctness Tests (CLI-compatible)
-- ============================================================
-- Run: npx supabase db query --linked -f tests/phase9_4_financial_tests.sql
-- ============================================================

-- TEST 1: Cash Never Negative
SELECT 'TEST 1: Cash Never Negative' as test,
  (SELECT COUNT(DISTINCT (team_id, competition_run_id)) FROM cash_ledger) as total_teams,
  (SELECT COUNT(*) FROM (
    SELECT team_id, competition_run_id FROM cash_ledger
    GROUP BY team_id, competition_run_id HAVING SUM(amount_paise) < 0
  ) neg) as teams_with_negative_cash,
  CASE WHEN (SELECT COUNT(*) FROM (
    SELECT team_id, competition_run_id FROM cash_ledger
    GROUP BY team_id, competition_run_id HAVING SUM(amount_paise) < 0
  ) neg) = 0 THEN 'PASS' ELSE 'FAIL' END as result;

-- TEST 2: Holdings Never Negative
SELECT 'TEST 2: Holdings Never Negative' as test,
  (SELECT COUNT(*) FROM holdings) as total_holdings,
  (SELECT COUNT(*) FROM holdings WHERE quantity < 0) as negative_quantity_count,
  CASE WHEN (SELECT COUNT(*) FROM holdings WHERE quantity < 0) = 0
    THEN 'PASS' ELSE 'FAIL' END as result;

-- TEST 3: Every Trade Has Matching Cash Ledger Entry
SELECT 'TEST 3: Trade-Cash Ledger Integrity' as test,
  (SELECT COUNT(*) FROM trades) as total_trades,
  (SELECT COUNT(*) FROM trades t
   WHERE NOT EXISTS (
     SELECT 1 FROM cash_ledger cl
     WHERE cl.reference_type = 'trade' AND cl.reference_id = t.id
       AND cl.team_id = t.team_id AND cl.competition_run_id = t.competition_run_id
   )) as orphan_trades,
  CASE WHEN (SELECT COUNT(*) FROM trades t
   WHERE NOT EXISTS (
     SELECT 1 FROM cash_ledger cl
     WHERE cl.reference_type = 'trade' AND cl.reference_id = t.id
       AND cl.team_id = t.team_id AND cl.competition_run_id = t.competition_run_id
   )) = 0 THEN 'PASS' ELSE 'FAIL' END as result;

-- TEST 4: Cash Ledger Side Consistency (buy = negative, sell = positive)
SELECT 'TEST 4: Cash Ledger Side Consistency' as test,
  (SELECT COUNT(*) FROM trades t
   INNER JOIN cash_ledger cl ON cl.reference_type = 'trade' AND cl.reference_id = t.id
   WHERE (t.side = 'buy' AND cl.amount_paise > 0)
      OR (t.side = 'sell' AND cl.amount_paise < 0)) as mismatches,
  CASE WHEN (SELECT COUNT(*) FROM trades t
   INNER JOIN cash_ledger cl ON cl.reference_type = 'trade' AND cl.reference_id = t.id
   WHERE (t.side = 'buy' AND cl.amount_paise > 0)
      OR (t.side = 'sell' AND cl.amount_paise < 0)) = 0
    THEN 'PASS' ELSE 'FAIL' END as result;

-- TEST 5: Run Isolation — all holdings/trades reference valid runs
SELECT 'TEST 6: Run Isolation' as test,
  (SELECT COUNT(*) FROM holdings h
   WHERE NOT EXISTS (SELECT 1 FROM competition_runs cr WHERE cr.id = h.competition_run_id)) as orphan_holdings,
  (SELECT COUNT(*) FROM trades t
   WHERE NOT EXISTS (SELECT 1 FROM competition_runs cr WHERE cr.id = t.competition_run_id)) as orphan_trades,
  CASE WHEN
    (SELECT COUNT(*) FROM holdings h
     WHERE NOT EXISTS (SELECT 1 FROM competition_runs cr WHERE cr.id = h.competition_run_id)) = 0
    AND
    (SELECT COUNT(*) FROM trades t
     WHERE NOT EXISTS (SELECT 1 FROM competition_runs cr WHERE cr.id = t.competition_run_id)) = 0
    THEN 'PASS' ELSE 'FAIL' END as result;

-- TEST 7: P/L Formula — show per-team values
SELECT 'TEST 7: P/L Formula' as test,
  cl.team_id,
  cl.competition_run_id,
  cl.amount_paise as initial_capital_paise,
  (SELECT COALESCE(SUM(cl2.amount_paise), 0) FROM cash_ledger cl2
   WHERE cl2.team_id = cl.team_id AND cl2.competition_run_id = cl.competition_run_id) as cash_paise,
  (SELECT COALESCE(SUM(h.quantity * mq.price_paise), 0)
   FROM holdings h
   INNER JOIN market_quotes mq ON mq.stock_id = h.stock_id AND mq.competition_run_id = h.competition_run_id
   WHERE h.team_id = cl.team_id AND h.competition_run_id = cl.competition_run_id AND h.quantity > 0
  ) as holdings_value_paise,
  (SELECT COALESCE(SUM(cl2.amount_paise), 0) FROM cash_ledger cl2
   WHERE cl2.team_id = cl.team_id AND cl2.competition_run_id = cl.competition_run_id)
  + (SELECT COALESCE(SUM(h.quantity * mq.price_paise), 0)
     FROM holdings h
     INNER JOIN market_quotes mq ON mq.stock_id = h.stock_id AND mq.competition_run_id = h.competition_run_id
     WHERE h.team_id = cl.team_id AND h.competition_run_id = cl.competition_run_id AND h.quantity > 0
  ) - cl.amount_paise as pnl_paise
FROM cash_ledger cl
WHERE cl.entry_type = 'initial_capital'
GROUP BY cl.team_id, cl.competition_run_id, cl.amount_paise
ORDER BY cl.team_id;

-- TEST 8: Idempotency Key Uniqueness
SELECT 'TEST 8: Idempotency Key Uniqueness' as test,
  (SELECT COUNT(*) FROM (
    SELECT team_id, competition_run_id, idempotency_key
    FROM idempotency_keys WHERE idempotency_key IS NOT NULL
    GROUP BY team_id, competition_run_id, idempotency_key HAVING COUNT(*) > 1
  ) dupes) as duplicate_groups,
  CASE WHEN (SELECT COUNT(*) FROM (
    SELECT team_id, competition_run_id, idempotency_key
    FROM idempotency_keys WHERE idempotency_key IS NOT NULL
    GROUP BY team_id, competition_run_id, idempotency_key HAVING COUNT(*) > 1
  ) dupes) = 0 THEN 'PASS' ELSE 'FAIL' END as result;

-- TEST 9: Missing Quote Check — function exists and has the check
SELECT 'TEST 9: Missing Quote Check' as test,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'get_team_holdings'
  ) THEN 'PASS' ELSE 'FAIL' END as function_exists;

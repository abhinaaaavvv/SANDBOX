-- ============================================================
-- Phase 9.5 Portfolio & P/L Correctness Tests (CLI-compatible)
-- ============================================================
-- Run: npx supabase db query --linked -f tests/phase9_5_portfolio_tests.sql
--
-- Every scenario runs inside its own transaction that ends with
-- ROLLBACK, so no test data leaks into the real competition data.
-- A dedicated test user/team/run is created per scenario.
-- ============================================================

-- Test fixtures (fixed UUIDs, distinct from real data)
--   test user : 55555555-5555-4555-8555-555555555555
--   test team : 66666666-6666-4666-8666-666666666666
--   test run  : 77777777-7777-4777-8777-777777777777
-- Stocks (real): HDFC 321590fb-261c-4c1b-80de-945e5f3f0778
--                 INFY 3ae909d7-a1c2-42c6-8179-ad0cb875bae6
--                 TCS  b2ff7586-27ec-42c8-97a0-4cb6e9fc9c50

-- ============================================================
-- SCENARIO 1: Initial capital, no holdings, no trades
-- Expect: cash=10,000,000, holdings_value=0, portfolio=10,000,000
--         initial_capital=10,000,000, pnl=0, return_bp=0
-- ============================================================
BEGIN;
INSERT INTO public.competition_runs (id, competition_id, name, status)
VALUES ('77777777-7777-4777-8777-777777777777',
        (SELECT competition_id FROM public.competition_runs WHERE status='active' LIMIT 1),
        'Phase9.5 Test Run', 'active');
INSERT INTO auth.users (id) VALUES ('55555555-5555-4555-8555-555555555555');
INSERT INTO public.teams (id, name)
VALUES ('66666666-6666-4666-8666-666666666666', 'Phase9.5 Test Team');
INSERT INTO public.team_members (team_id, user_id, role)
VALUES ('66666666-6666-4666-8666-666666666666', '55555555-5555-4555-8555-555555555555', 'member');
INSERT INTO public.cash_ledger (team_id, competition_run_id, entry_type, amount_paise, description, created_by)
VALUES ('66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777',
        'initial_capital', 10000000, 'Initial capital', '55555555-5555-4555-8555-555555555555');

SELECT set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT 'SCENARIO 1: Initial Capital Only' as test,
  (p->>'cash_balance_paise')::bigint = 10000000 AND
  (p->>'holdings_value_paise')::bigint = 0 AND
  (p->>'portfolio_value_paise')::bigint = 10000000 AND
  (p->>'initial_capital_paise')::bigint = 10000000 AND
  (p->>'pnl_paise')::bigint = 0 AND
  (p->>'return_basis_points')::bigint = 0
  AS ok,
  CASE WHEN (p->>'cash_balance_paise')::bigint = 10000000 AND
    (p->>'holdings_value_paise')::bigint = 0 AND
    (p->>'portfolio_value_paise')::bigint = 10000000 AND
    (p->>'initial_capital_paise')::bigint = 10000000 AND
    (p->>'pnl_paise')::bigint = 0 AND
    (p->>'return_basis_points')::bigint = 0
  THEN 'PASS' ELSE 'FAIL' END as result
FROM public.get_team_portfolio('77777777-7777-4777-8777-777777777777') p;
ROLLBACK;

-- ============================================================
-- SCENARIO 2: Unrealized GAIN (price above avg buy)
-- Buy 100 @ 40,000 paise, market price 44,000 paise
-- Expect: cash=6,000,000, holdings_value=4,400,000,
--         portfolio=10,400,000, pnl=+400,000, return_bp=400
-- ============================================================
BEGIN;
INSERT INTO public.competition_runs (id, competition_id, name, status)
VALUES ('77777777-7777-4777-8777-777777777777',
        (SELECT competition_id FROM public.competition_runs WHERE status='active' LIMIT 1),
        'Phase9.5 Test Run', 'active');
INSERT INTO auth.users (id) VALUES ('55555555-5555-4555-8555-555555555555');
INSERT INTO public.teams (id, name)
VALUES ('66666666-6666-4666-8666-666666666666', 'Phase9.5 Test Team');
INSERT INTO public.team_members (team_id, user_id, role)
VALUES ('66666666-6666-4666-8666-666666666666', '55555555-5555-4555-8555-555555555555', 'member');
INSERT INTO public.cash_ledger (team_id, competition_run_id, entry_type, amount_paise, description, created_by)
VALUES ('66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777',
        'initial_capital', 10000000, 'Initial capital', '55555555-5555-4555-8555-555555555555');
INSERT INTO public.cash_ledger (team_id, competition_run_id, entry_type, amount_paise, reference_type, reference_id, description, created_by)
VALUES ('66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777',
        'trade_buy', -4000000, 'trade', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'Buy 100 TCS', '55555555-5555-4555-8555-555555555555');
INSERT INTO public.holdings (team_id, competition_run_id, stock_id, quantity)
VALUES ('66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777',
        'b2ff7586-27ec-42c8-97a0-4cb6e9fc9c50', 100);
INSERT INTO public.market_quotes (stock_id, competition_run_id, price_paise)
VALUES ('b2ff7586-27ec-42c8-97a0-4cb6e9fc9c50', '77777777-7777-4777-8777-777777777777', 44000);

SELECT set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT 'SCENARIO 2: Unrealized Gain' as test,
  (p->>'cash_balance_paise')::bigint = 6000000 AND
  (p->>'holdings_value_paise')::bigint = 4400000 AND
  (p->>'portfolio_value_paise')::bigint = 10400000 AND
  (p->>'pnl_paise')::bigint = 400000 AND
  (p->>'return_basis_points')::bigint = 400
  AS ok,
  CASE WHEN (p->>'cash_balance_paise')::bigint = 6000000 AND
    (p->>'holdings_value_paise')::bigint = 4400000 AND
    (p->>'portfolio_value_paise')::bigint = 10400000 AND
    (p->>'pnl_paise')::bigint = 400000 AND
    (p->>'return_basis_points')::bigint = 400
  THEN 'PASS' ELSE 'FAIL' END as result
FROM public.get_team_portfolio('77777777-7777-4777-8777-777777777777') p;
ROLLBACK;

-- ============================================================
-- SCENARIO 3: Unrealized LOSS (price below avg buy)
-- Buy 100 @ 40,000 paise, market price 35,000 paise
-- Expect: cash=6,000,000, holdings_value=3,500,000,
--         portfolio=9,500,000, pnl=-500,000, return_bp=-500
-- ============================================================
BEGIN;
INSERT INTO public.competition_runs (id, competition_id, name, status)
VALUES ('77777777-7777-4777-8777-777777777777',
        (SELECT competition_id FROM public.competition_runs WHERE status='active' LIMIT 1),
        'Phase9.5 Test Run', 'active');
INSERT INTO auth.users (id) VALUES ('55555555-5555-4555-8555-555555555555');
INSERT INTO public.teams (id, name)
VALUES ('66666666-6666-4666-8666-666666666666', 'Phase9.5 Test Team');
INSERT INTO public.team_members (team_id, user_id, role)
VALUES ('66666666-6666-4666-8666-666666666666', '55555555-5555-4555-8555-555555555555', 'member');
INSERT INTO public.cash_ledger (team_id, competition_run_id, entry_type, amount_paise, description, created_by)
VALUES ('66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777',
        'initial_capital', 10000000, 'Initial capital', '55555555-5555-4555-8555-555555555555');
INSERT INTO public.cash_ledger (team_id, competition_run_id, entry_type, amount_paise, reference_type, reference_id, description, created_by)
VALUES ('66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777',
        'trade_buy', -4000000, 'trade', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        'Buy 100 TCS', '55555555-5555-4555-8555-555555555555');
INSERT INTO public.holdings (team_id, competition_run_id, stock_id, quantity)
VALUES ('66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777',
        'b2ff7586-27ec-42c8-97a0-4cb6e9fc9c50', 100);
INSERT INTO public.market_quotes (stock_id, competition_run_id, price_paise)
VALUES ('b2ff7586-27ec-42c8-97a0-4cb6e9fc9c50', '77777777-7777-4777-8777-777777777777', 35000);

SELECT set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT 'SCENARIO 3: Unrealized Loss' as test,
  (p->>'cash_balance_paise')::bigint = 6000000 AND
  (p->>'holdings_value_paise')::bigint = 3500000 AND
  (p->>'portfolio_value_paise')::bigint = 9500000 AND
  (p->>'pnl_paise')::bigint = -500000 AND
  (p->>'return_basis_points')::bigint = -500
  AS ok,
  CASE WHEN (p->>'cash_balance_paise')::bigint = 6000000 AND
    (p->>'holdings_value_paise')::bigint = 3500000 AND
    (p->>'portfolio_value_paise')::bigint = 9500000 AND
    (p->>'pnl_paise')::bigint = -500000 AND
    (p->>'return_basis_points')::bigint = -500
  THEN 'PASS' ELSE 'FAIL' END as result
FROM public.get_team_portfolio('77777777-7777-4777-8777-777777777777') p;
ROLLBACK;

-- ============================================================
-- SCENARIO 4: Realized PROFIT after full sell
-- Buy 100 @ 40,000 paise (cash -4,000,000), Sell 100 @ 60,000
-- paise (cash +6,000,000). No holdings remain.
-- Expect: cash=12,000,000, holdings_value=0, portfolio=12,000,000,
--         pnl=+2,000,000, return_bp=2000
-- ============================================================
BEGIN;
INSERT INTO public.competition_runs (id, competition_id, name, status)
VALUES ('77777777-7777-4777-8777-777777777777',
        (SELECT competition_id FROM public.competition_runs WHERE status='active' LIMIT 1),
        'Phase9.5 Test Run', 'active');
INSERT INTO auth.users (id) VALUES ('55555555-5555-4555-8555-555555555555');
INSERT INTO public.teams (id, name)
VALUES ('66666666-6666-4666-8666-666666666666', 'Phase9.5 Test Team');
INSERT INTO public.team_members (team_id, user_id, role)
VALUES ('66666666-6666-4666-8666-666666666666', '55555555-5555-4555-8555-555555555555', 'member');
INSERT INTO public.cash_ledger (team_id, competition_run_id, entry_type, amount_paise, description, created_by)
VALUES ('66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777',
        'initial_capital', 10000000, 'Initial capital', '55555555-5555-4555-8555-555555555555');
INSERT INTO public.cash_ledger (team_id, competition_run_id, entry_type, amount_paise, reference_type, reference_id, description, created_by)
VALUES ('66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777',
        'trade_buy', -4000000, 'trade', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        'Buy 100 TCS', '55555555-5555-4555-8555-555555555555');
INSERT INTO public.cash_ledger (team_id, competition_run_id, entry_type, amount_paise, reference_type, reference_id, description, created_by)
VALUES ('66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777',
        'trade_sell', 6000000, 'trade', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        'Sell 100 TCS', '55555555-5555-4555-8555-555555555555');

SELECT set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT 'SCENARIO 4: Realized Profit After Full Sell' as test,
  (p->>'cash_balance_paise')::bigint = 12000000 AND
  (p->>'holdings_value_paise')::bigint = 0 AND
  (p->>'portfolio_value_paise')::bigint = 12000000 AND
  (p->>'pnl_paise')::bigint = 2000000 AND
  (p->>'return_basis_points')::bigint = 2000
  AS ok,
  CASE WHEN (p->>'cash_balance_paise')::bigint = 12000000 AND
    (p->>'holdings_value_paise')::bigint = 0 AND
    (p->>'portfolio_value_paise')::bigint = 12000000 AND
    (p->>'pnl_paise')::bigint = 2000000 AND
    (p->>'return_basis_points')::bigint = 2000
  THEN 'PASS' ELSE 'FAIL' END as result
FROM public.get_team_portfolio('77777777-7777-4777-8777-777777777777') p;
ROLLBACK;

-- ============================================================
-- SCENARIO 5: Price change moves portfolio value
-- Buy 100 @ 40,000. Quote changed to 48,000.
-- Expect: holdings_value=4,800,000, portfolio=10,800,000, pnl=+800,000
-- ============================================================
BEGIN;
INSERT INTO public.competition_runs (id, competition_id, name, status)
VALUES ('77777777-7777-4777-8777-777777777777',
        (SELECT competition_id FROM public.competition_runs WHERE status='active' LIMIT 1),
        'Phase9.5 Test Run', 'active');
INSERT INTO auth.users (id) VALUES ('55555555-5555-4555-8555-555555555555');
INSERT INTO public.teams (id, name)
VALUES ('66666666-6666-4666-8666-666666666666', 'Phase9.5 Test Team');
INSERT INTO public.team_members (team_id, user_id, role)
VALUES ('66666666-6666-4666-8666-666666666666', '55555555-5555-4555-8555-555555555555', 'member');
INSERT INTO public.cash_ledger (team_id, competition_run_id, entry_type, amount_paise, description, created_by)
VALUES ('66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777',
        'initial_capital', 10000000, 'Initial capital', '55555555-5555-4555-8555-555555555555');
INSERT INTO public.cash_ledger (team_id, competition_run_id, entry_type, amount_paise, reference_type, reference_id, description, created_by)
VALUES ('66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777',
        'trade_buy', -4000000, 'trade', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        'Buy 100 TCS', '55555555-5555-4555-8555-555555555555');
INSERT INTO public.holdings (team_id, competition_run_id, stock_id, quantity)
VALUES ('66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777',
        'b2ff7586-27ec-42c8-97a0-4cb6e9fc9c50', 100);
INSERT INTO public.market_quotes (stock_id, competition_run_id, price_paise)
VALUES ('b2ff7586-27ec-42c8-97a0-4cb6e9fc9c50', '77777777-7777-4777-8777-777777777777', 48000);

SELECT set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT 'SCENARIO 5: Price Change Updates Value' as test,
  (p->>'holdings_value_paise')::bigint = 4800000 AND
  (p->>'portfolio_value_paise')::bigint = 10800000 AND
  (p->>'pnl_paise')::bigint = 800000 AND
  (p->>'return_basis_points')::bigint = 800
  AS ok,
  CASE WHEN (p->>'holdings_value_paise')::bigint = 4800000 AND
    (p->>'portfolio_value_paise')::bigint = 10800000 AND
    (p->>'pnl_paise')::bigint = 800000 AND
    (p->>'return_basis_points')::bigint = 800
  THEN 'PASS' ELSE 'FAIL' END as result
FROM public.get_team_portfolio('77777777-7777-4777-8777-777777777777') p;
ROLLBACK;

-- ============================================================
-- SCENARIO 6: Dividend credited increases cash and P/L
-- Funded 10,000,000. Dividend +500,000 (50 paise/share × 10,000).
-- Expect: cash=10,500,000, pnl=+500,000, return_bp=500
-- ============================================================
BEGIN;
INSERT INTO public.competition_runs (id, competition_id, name, status)
VALUES ('77777777-7777-4777-8777-777777777777',
        (SELECT competition_id FROM public.competition_runs WHERE status='active' LIMIT 1),
        'Phase9.5 Test Run', 'active');
INSERT INTO auth.users (id) VALUES ('55555555-5555-4555-8555-555555555555');
INSERT INTO public.teams (id, name)
VALUES ('66666666-6666-4666-8666-666666666666', 'Phase9.5 Test Team');
INSERT INTO public.team_members (team_id, user_id, role)
VALUES ('66666666-6666-4666-8666-666666666666', '55555555-5555-4555-8555-555555555555', 'member');
INSERT INTO public.cash_ledger (team_id, competition_run_id, entry_type, amount_paise, description, created_by)
VALUES ('66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777',
        'initial_capital', 10000000, 'Initial capital', '55555555-5555-4555-8555-555555555555');
INSERT INTO public.cash_ledger (team_id, competition_run_id, entry_type, amount_paise, description, created_by)
VALUES ('66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777',
        'dividend', 500000, 'Dividend paid', '55555555-5555-4555-8555-555555555555');

SELECT set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT 'SCENARIO 6: Dividend Credited' as test,
  (p->>'cash_balance_paise')::bigint = 10500000 AND
  (p->>'pnl_paise')::bigint = 500000 AND
  (p->>'return_basis_points')::bigint = 500
  AS ok,
  CASE WHEN (p->>'cash_balance_paise')::bigint = 10500000 AND
    (p->>'pnl_paise')::bigint = 500000 AND
    (p->>'return_basis_points')::bigint = 500
  THEN 'PASS' ELSE 'FAIL' END as result
FROM public.get_team_portfolio('77777777-7777-4777-8777-777777777777') p;
ROLLBACK;

-- ============================================================
-- SCENARIO 7: Admin cash adjustment changes cash and P/L
-- Funded 10,000,000. Admin credits +250,000.
-- Expect: cash=10,250,000, pnl=+250,000
-- ============================================================
BEGIN;
INSERT INTO public.competition_runs (id, competition_id, name, status)
VALUES ('77777777-7777-4777-8777-777777777777',
        (SELECT competition_id FROM public.competition_runs WHERE status='active' LIMIT 1),
        'Phase9.5 Test Run', 'active');
INSERT INTO auth.users (id) VALUES ('55555555-5555-4555-8555-555555555555');
INSERT INTO public.teams (id, name)
VALUES ('66666666-6666-4666-8666-666666666666', 'Phase9.5 Test Team');
INSERT INTO public.team_members (team_id, user_id, role)
VALUES ('66666666-6666-4666-8666-666666666666', '55555555-5555-4555-8555-555555555555', 'member');
INSERT INTO public.cash_ledger (team_id, competition_run_id, entry_type, amount_paise, description, created_by)
VALUES ('66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777',
        'initial_capital', 10000000, 'Initial capital', '55555555-5555-4555-8555-555555555555');
INSERT INTO public.cash_ledger (team_id, competition_run_id, entry_type, amount_paise, description, created_by)
VALUES ('66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777',
        'admin_adjustment', 250000, 'Admin credit', '55555555-5555-4555-8555-555555555555');

SELECT set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT 'SCENARIO 7: Admin Cash Adjustment' as test,
  (p->>'cash_balance_paise')::bigint = 10250000 AND
  (p->>'pnl_paise')::bigint = 250000
  AS ok,
  CASE WHEN (p->>'cash_balance_paise')::bigint = 10250000 AND
    (p->>'pnl_paise')::bigint = 250000
  THEN 'PASS' ELSE 'FAIL' END as result
FROM public.get_team_portfolio('77777777-7777-4777-8777-777777777777') p;
ROLLBACK;

-- ============================================================
-- SCENARIO 8: MISSING_MARKET_QUOTE — holding with no quote
-- Buy 100 TCS but NO market_quotes row for TCS in this run.
-- get_team_portfolio AND get_team_holdings must raise
-- MISSING_MARKET_QUOTE (never silently value at ₹0).
-- ============================================================
BEGIN;
INSERT INTO public.competition_runs (id, competition_id, name, status)
VALUES ('77777777-7777-4777-8777-777777777777',
        (SELECT competition_id FROM public.competition_runs WHERE status='active' LIMIT 1),
        'Phase9.5 Test Run', 'active');
INSERT INTO auth.users (id) VALUES ('55555555-5555-4555-8555-555555555555');
INSERT INTO public.teams (id, name)
VALUES ('66666666-6666-4666-8666-666666666666', 'Phase9.5 Test Team');
INSERT INTO public.team_members (team_id, user_id, role)
VALUES ('66666666-6666-4666-8666-666666666666', '55555555-5555-4555-8555-555555555555', 'member');
INSERT INTO public.cash_ledger (team_id, competition_run_id, entry_type, amount_paise, description, created_by)
VALUES ('66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777',
        'initial_capital', 10000000, 'Initial capital', '55555555-5555-4555-8555-555555555555');
INSERT INTO public.cash_ledger (team_id, competition_run_id, entry_type, amount_paise, reference_type, reference_id, description, created_by)
VALUES ('66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777',
        'trade_buy', -4000000, 'trade', 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        'Buy 100 TCS', '55555555-5555-4555-8555-555555555555');
INSERT INTO public.holdings (team_id, competition_run_id, stock_id, quantity)
VALUES ('66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777',
        'b2ff7586-27ec-42c8-97a0-4cb6e9fc9c50', 100);
-- NOTE: no market_quotes row inserted for this run/stock.

DO $$
DECLARE
  v_portfolio_msg text;
  v_holdings_msg text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;

  BEGIN
    PERFORM public.get_team_portfolio('77777777-7777-4777-8777-777777777777');
    v_portfolio_msg := 'NO_ERROR';
  EXCEPTION WHEN OTHERS THEN
    v_portfolio_msg := SQLERRM;
  END;

  BEGIN
    PERFORM public.get_team_holdings('77777777-7777-4777-8777-777777777777');
    v_holdings_msg := 'NO_ERROR';
  EXCEPTION WHEN OTHERS THEN
    v_holdings_msg := SQLERRM;
  END;

  CREATE TEMP TABLE scenario8_result (ok text, test text, result text);

  IF v_portfolio_msg LIKE '%MISSING_MARKET_QUOTE%' AND v_holdings_msg LIKE '%MISSING_MARKET_QUOTE%' THEN
    INSERT INTO scenario8_result VALUES ('true', 'SCENARIO 8: MISSING_MARKET_QUOTE', 'PASS');
  ELSE
    INSERT INTO scenario8_result VALUES ('false', 'SCENARIO 8: MISSING_MARKET_QUOTE',
      'portfolio=' || v_portfolio_msg || ' holdings=' || v_holdings_msg);
  END IF;
END $$;

SELECT ok, test, result FROM scenario8_result;
ROLLBACK;

-- ============================================================
-- SCENARIO 9: Empty holdings — get_team_holdings returns []
-- Funded only, no holdings. Expect holdings array empty.
-- ============================================================
BEGIN;
INSERT INTO public.competition_runs (id, competition_id, name, status)
VALUES ('77777777-7777-4777-8777-777777777777',
        (SELECT competition_id FROM public.competition_runs WHERE status='active' LIMIT 1),
        'Phase9.5 Test Run', 'active');
INSERT INTO auth.users (id) VALUES ('55555555-5555-4555-8555-555555555555');
INSERT INTO public.teams (id, name)
VALUES ('66666666-6666-4666-8666-666666666666', 'Phase9.5 Test Team');
INSERT INTO public.team_members (team_id, user_id, role)
VALUES ('66666666-6666-4666-8666-666666666666', '55555555-5555-4555-8555-555555555555', 'member');
INSERT INTO public.cash_ledger (team_id, competition_run_id, entry_type, amount_paise, description, created_by)
VALUES ('66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777',
        'initial_capital', 10000000, 'Initial capital', '55555555-5555-4555-8555-555555555555');

SELECT set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT 'SCENARIO 9: Empty Holdings Returns []' as test,
  (p->>'ok')::boolean = true AND
  jsonb_array_length(p->'holdings') = 0
  AS ok,
  CASE WHEN (p->>'ok')::boolean = true AND jsonb_array_length(p->'holdings') = 0
  THEN 'PASS' ELSE 'FAIL' END as result
FROM public.get_team_holdings('77777777-7777-4777-8777-777777777777') p;
ROLLBACK;

-- ============================================================
-- SCENARIO 10: Run isolation — portfolio independent per run
-- Team funded in run A (10,000,000) AND run B (20,000,000).
-- get_team_portfolio(run A) must return 10,000,000; run B 20,000,000.
-- ============================================================
BEGIN;
INSERT INTO public.competition_runs (id, competition_id, name, status)
VALUES ('77777777-7777-4777-8777-777777777777',
        (SELECT competition_id FROM public.competition_runs WHERE status='active' LIMIT 1),
        'Phase9.5 Run A', 'active');
INSERT INTO public.competition_runs (id, competition_id, name, status)
VALUES ('88888888-8888-4888-8888-888888888888',
        (SELECT competition_id FROM public.competition_runs WHERE status='active' LIMIT 1),
        'Phase9.5 Run B', 'active');
INSERT INTO auth.users (id) VALUES ('55555555-5555-4555-8555-555555555555');
INSERT INTO public.teams (id, name)
VALUES ('66666666-6666-4666-8666-666666666666', 'Phase9.5 Test Team');
INSERT INTO public.team_members (team_id, user_id, role)
VALUES ('66666666-6666-4666-8666-666666666666', '55555555-5555-4555-8555-555555555555', 'member');
INSERT INTO public.cash_ledger (team_id, competition_run_id, entry_type, amount_paise, description, created_by)
VALUES ('66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777',
        'initial_capital', 10000000, 'Initial capital A', '55555555-5555-4555-8555-555555555555');
INSERT INTO public.cash_ledger (team_id, competition_run_id, entry_type, amount_paise, description, created_by)
VALUES ('66666666-6666-4666-8666-666666666666', '88888888-8888-4888-8888-888888888888',
        'initial_capital', 20000000, 'Initial capital B', '55555555-5555-4555-8555-555555555555');

SELECT set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT 'SCENARIO 10: Run Isolation' as test,
  (pa->>'cash_balance_paise')::bigint = 10000000 AND
  (pb->>'cash_balance_paise')::bigint = 20000000 AND
  (pa->>'initial_capital_paise')::bigint = 10000000 AND
  (pb->>'initial_capital_paise')::bigint = 20000000
  AS ok,
  CASE WHEN (pa->>'cash_balance_paise')::bigint = 10000000 AND
    (pb->>'cash_balance_paise')::bigint = 20000000 AND
    (pa->>'initial_capital_paise')::bigint = 10000000 AND
    (pb->>'initial_capital_paise')::bigint = 20000000
  THEN 'PASS' ELSE 'FAIL' END as result
FROM public.get_team_portfolio('77777777-7777-4777-8777-777777777777') pa,
     public.get_team_portfolio('88888888-8888-4888-8888-888888888888') pb;
ROLLBACK;

-- ============================================================
-- SCENARIO 11: Real-world check — live active run as real participant
-- Test Alpha 1 (6c57516b) belongs to SANDBOX Test — Alpha
-- (4af2d7f5) funded with ₹10,000 in run d1d8bcaf.
-- Expect ok=true, cash=1,000,000, portfolio=1,000,000, pnl=0.
-- ============================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"6c57516b-ab24-4645-9b1c-5f4064d407d1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT 'SCENARIO 11: Live Participant (Test Alpha 1)' as test,
  (p->>'ok')::boolean = true AND
  (p->>'cash_balance_paise')::bigint = 1000000 AND
  (p->>'portfolio_value_paise')::bigint = 1000000 AND
  (p->>'pnl_paise')::bigint = 0
  AS ok,
  CASE WHEN (p->>'ok')::boolean = true AND
    (p->>'cash_balance_paise')::bigint = 1000000 AND
    (p->>'portfolio_value_paise')::bigint = 1000000 AND
    (p->>'pnl_paise')::bigint = 0
  THEN 'PASS' ELSE 'FAIL' END as result
FROM public.get_team_portfolio('d1d8bcaf-d8e3-4b75-902b-e9ee981d9796') p;
ROLLBACK;

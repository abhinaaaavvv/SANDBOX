-- 0017_seed.sql
-- Demo seed — DEV/STAGING ONLY (BACKEND_ARCHITECTURE.md Part M #17).
--
-- Creates: demo auth accounts (1 admin + 6 participants), 6 demo teams,
-- one ACTIVE competition run (round 1 WAITING — the admin starts it), the
-- 8-stock market from the frontend mock data, and ₹1,00,000 initial capital
-- per team (cash + INITIAL_CAPITAL ledger entries).
--
-- Demo accounts (deterministic UUIDs; password for ALL: sandbox123):
--   email                    role         team
--   admin@sandbox.local      admin        (no team)
--   alpha@sandbox.local      participant  Alpha
--   beta@sandbox.local       participant  Beta
--   gamma@sandbox.local      participant  Gamma
--   delta@sandbox.local      participant  Delta
--   sigma@sandbox.local      participant  Sigma
--   phoenix@sandbox.local    participant  Phoenix
--
-- Safety:
--   * Guarded: if competition data already exists (runs, stocks, teams, or
--     any profiles — i.e. real user signups), the seed skips entirely:
--     re-applying is a no-op, and it never injects demo accounts into a
--     database that already has real users. Still DEV/STAGING ONLY — do not
--     push to a production project (see header note).
--   * auth.users insert adapts to the environment: full GoTrue-compatible
--     rows (bcrypt password via pgcrypto crypt(), confirmed email) on a real
--     Supabase auth schema, or minimal (id, email) rows on a stub schema.
--     crypt()/gen_salt() are intentionally UNQUALIFIED: pgcrypto resolves via
--     search_path (the `extensions` schema on Supabase, `public` in a plain
--     Postgres harness) — qualifying would break one environment or the other.
--   * Profiles are auto-provisioned by the 0002 handle_new_user trigger;
--     team membership syncs profiles.team_id via the 0002 trigger.
--   * Round 1 is seeded WAITING/market CLOSED by design (architecture F.1):
--     the admin clicks START ROUND. To make the demo immediately tradeable,
--     flip rounds row 1 to status='ACTIVE', market_status='OPEN' with ends_at.
--
-- Money: BIGINT paise (₹1 = 100). Stock prices mirror src/lib/mockData.ts ×100.

do $$
declare
  v_has_encrypted_password boolean;
  v_run_id uuid := 'c0000000-0000-0000-0000-000000000001';
begin
  -- -------------------------------------------------------------------------
  -- Guard: never re-seed a database that already has competition data.
  -- -------------------------------------------------------------------------
  if exists (select 1 from public.competition_runs)
     or exists (select 1 from public.stocks)
     or exists (select 1 from public.teams)
     or exists (select 1 from public.profiles) then
    raise notice '0017_seed: competition data or profiles already present; skipping seed.';
    return;
  end if;

  -- -------------------------------------------------------------------------
  -- 1. Demo auth accounts
  -- -------------------------------------------------------------------------
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'auth'
      and table_name = 'users'
      and column_name = 'encrypted_password'
  ) into v_has_encrypted_password;

  if v_has_encrypted_password then
    -- Full Supabase auth.users rows: bcrypt password, confirmed email.
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values
      ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'admin@sandbox.local',    crypt('sandbox123', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
      ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'alpha@sandbox.local',   crypt('sandbox123', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
      ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'beta@sandbox.local',    crypt('sandbox123', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
      ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'gamma@sandbox.local',   crypt('sandbox123', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
      ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated', 'delta@sandbox.local',   crypt('sandbox123', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
      ('00000000-0000-0000-0000-000000000000', '55555555-5555-5555-5555-555555555555', 'authenticated', 'authenticated', 'sigma@sandbox.local',   crypt('sandbox123', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
      ('00000000-0000-0000-0000-000000000000', '66666666-6666-6666-6666-666666666666', 'authenticated', 'authenticated', 'phoenix@sandbox.local', crypt('sandbox123', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now());
  else
    -- Minimal stub auth schema (e.g. local test harness): id + email only.
    insert into auth.users (id, email) values
      ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@sandbox.local'),
      ('11111111-1111-1111-1111-111111111111', 'alpha@sandbox.local'),
      ('22222222-2222-2222-2222-222222222222', 'beta@sandbox.local'),
      ('33333333-3333-3333-3333-333333333333', 'gamma@sandbox.local'),
      ('44444444-4444-4444-4444-444444444444', 'delta@sandbox.local'),
      ('55555555-5555-5555-5555-555555555555', 'sigma@sandbox.local'),
      ('66666666-6666-6666-6666-666666666666', 'phoenix@sandbox.local');
  end if;

  -- Profiles are auto-created by the 0002 trigger; refine role/display names.
  update public.profiles set role = 'admin', display_name = 'Admin'
  where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  update public.profiles set display_name = 'Alpha'
  where id = '11111111-1111-1111-1111-111111111111';
  update public.profiles set display_name = 'Beta'
  where id = '22222222-2222-2222-2222-222222222222';
  update public.profiles set display_name = 'Gamma'
  where id = '33333333-3333-3333-3333-333333333333';
  update public.profiles set display_name = 'Delta'
  where id = '44444444-4444-4444-4444-444444444444';
  update public.profiles set display_name = 'Sigma'
  where id = '55555555-5555-5555-5555-555555555555';
  update public.profiles set display_name = 'Phoenix'
  where id = '66666666-6666-6666-6666-666666666666';

  -- -------------------------------------------------------------------------
  -- 2. Teams + membership (team_members is the source of truth; profiles.team_id
  --    is synced by the 0002 trigger)
  -- -------------------------------------------------------------------------
  insert into public.teams (id, name) values
    ('a0000000-0000-0000-0000-000000000001', 'Alpha'),
    ('a0000000-0000-0000-0000-000000000002', 'Beta'),
    ('a0000000-0000-0000-0000-000000000003', 'Gamma'),
    ('a0000000-0000-0000-0000-000000000004', 'Delta'),
    ('a0000000-0000-0000-0000-000000000005', 'Sigma'),
    ('a0000000-0000-0000-0000-000000000006', 'Phoenix');

  insert into public.team_members (team_id, user_id) values
    ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
    ('a0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222'),
    ('a0000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333'),
    ('a0000000-0000-0000-0000-000000000004', '44444444-4444-4444-4444-444444444444'),
    ('a0000000-0000-0000-0000-000000000005', '55555555-5555-5555-5555-555555555555'),
    ('a0000000-0000-0000-0000-000000000006', '66666666-6666-6666-6666-666666666666');

  -- -------------------------------------------------------------------------
  -- 3. Competition run + rounds (round 1 WAITING — admin starts it)
  -- -------------------------------------------------------------------------
  insert into public.competition_runs (id, run_number, name, status)
  values (v_run_id, 1, 'Run 001', 'ACTIVE');

  insert into public.rounds (competition_run_id, round_number, status, market_status)
  values
    (v_run_id, 1, 'WAITING', 'CLOSED'),
    (v_run_id, 2, 'WAITING', 'CLOSED'),
    (v_run_id, 3, 'WAITING', 'CLOSED');

  -- -------------------------------------------------------------------------
  -- 4. Stocks (security master)
  --    opening_price (paise) is the reset anchor: new_competition_run() seeds
  --    fresh runs' market_quotes from it.
  -- -------------------------------------------------------------------------
  insert into public.stocks (id, symbol, company_name, sector, opening_price) values
    ('b0000000-0000-0000-0000-000000000001', 'REL',        'Reliance Industries',      'Energy & Conglomerate', 284000),
    ('b0000000-0000-0000-0000-000000000002', 'TCS',        'Tata Consultancy Services', 'Technology',           321000),
    ('b0000000-0000-0000-0000-000000000003', 'INFY',       'Infosys Ltd',              'Technology',           192000),
    ('b0000000-0000-0000-0000-000000000004', 'HDFC',       'HDFC Bank',                'Financial Services',   163000),
    ('b0000000-0000-0000-0000-000000000005', 'TATAMOTORS', 'Tata Motors',              'Automobile',            98000),
    ('b0000000-0000-0000-0000-000000000006', 'ICICIBANK',  'ICICI Bank',               'Financial Services',   112000),
    ('b0000000-0000-0000-0000-000000000007', 'ADANIENT',   'Adani Enterprises',        'Infrastructure',       314000),
    ('b0000000-0000-0000-0000-000000000008', 'BHARTIARTL', 'Bharti Airtel',            'Telecom',              145000);

  -- -------------------------------------------------------------------------
  -- 5. Market quotes for the active run (BIGINT paise; mirrors mockData ×100)
  -- -------------------------------------------------------------------------
  insert into public.market_quotes (
    competition_run_id, stock_id, current_price, previous_price, high, low, volume
  ) values
    (v_run_id, 'b0000000-0000-0000-0000-000000000001', 284000, 275000, 289000, 274000, 142500),
    (v_run_id, 'b0000000-0000-0000-0000-000000000002', 321000, 325500, 328000, 319000,  89400),
    (v_run_id, 'b0000000-0000-0000-0000-000000000003', 192000, 188000, 194500, 187000, 112000),
    (v_run_id, 'b0000000-0000-0000-0000-000000000004', 163000, 164300, 165500, 162000, 204000),
    (v_run_id, 'b0000000-0000-0000-0000-000000000005',  98000,  94000,  99500,  93500, 310000),
    (v_run_id, 'b0000000-0000-0000-0000-000000000006', 112000, 110500, 113200, 110000, 165000),
    (v_run_id, 'b0000000-0000-0000-0000-000000000007', 314000, 302000, 319000, 300000,  98000),
    (v_run_id, 'b0000000-0000-0000-0000-000000000008', 145000, 146500, 147500, 144000,  77000);

  -- -------------------------------------------------------------------------
  -- 6. Initial capital: cash cache + immutable ledger entry (₹1,00,000 = 10,000,000 paise)
  -- -------------------------------------------------------------------------
  insert into public.team_balances (competition_run_id, team_id, cash)
  select v_run_id, id, 10000000 from public.teams;

  insert into public.cash_ledger (competition_run_id, team_id, type, amount, note)
  select v_run_id, id, 'INITIAL_CAPITAL', 10000000, 'Initial capital (seed)'
  from public.teams;
end $$;

-- supabase/seed.sql
-- Deterministic demo data for local/staging environments.

insert into public.stocks (symbol, company_name, sector, opening_price)
values
  ('REL', 'Reliance Industries', 'Energy & Conglomerate', 284000),
  ('TCS', 'Tata Consultancy Services', 'Technology', 321000),
  ('INFY', 'Infosys Ltd', 'Technology', 192000),
  ('HDFC', 'HDFC Bank', 'Financial Services', 163000),
  ('TATAMOTORS', 'Tata Motors', 'Automobile', 98000),
  ('ICICIBANK', 'ICICI Bank', 'Financial Services', 112000),
  ('ADANIENT', 'Adani Enterprises', 'Infrastructure', 314000),
  ('BHARTIARTL', 'Bharti Airtel', 'Telecom', 145000)
on conflict (symbol) do update
set company_name = excluded.company_name,
    sector = excluded.sector,
    opening_price = excluded.opening_price,
    is_active = true;

insert into public.teams (name)
values
  ('Alpha Capital'),
  ('Nexus Traders'),
  ('Sigma Quant'),
  ('Phoenix Ventures'),
  ('Nova Arbitrage'),
  ('Zenith Holdings')
on conflict (name) do nothing;

do $$
declare
  v_run_id uuid;
begin
  if not exists (select 1 from public.competition_runs) then
    insert into public.competition_runs (run_number, name, status, started_at, created_at)
    values (1, 'Run 1', 'ACTIVE', now(), now())
    returning id into v_run_id;

    insert into public.rounds (competition_run_id, round_number, status, market_status, started_at, ends_at)
    values
      (v_run_id, 1, 'ACTIVE', 'OPEN', now(), now() + interval '15 minutes'),
      (v_run_id, 2, 'WAITING', 'CLOSED', null, null),
      (v_run_id, 3, 'WAITING', 'CLOSED', null, null);

    insert into public.market_quotes (competition_run_id, stock_id, current_price, previous_price, high, low, volume)
    select v_run_id, s.id, s.opening_price, s.opening_price, s.opening_price, s.opening_price, 0
    from public.stocks s
    where s.is_active and s.opening_price is not null;

    insert into public.team_balances (competition_run_id, team_id, cash)
    select v_run_id, t.id, 10000000
    from public.teams t;

    insert into public.cash_ledger (competition_run_id, team_id, type, amount, note)
    select v_run_id, t.id, 'INITIAL_CAPITAL', 10000000, 'Initial seed capital'
    from public.teams t;
  end if;
end
$$;

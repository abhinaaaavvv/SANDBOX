-- 0004_market.sql
-- Market: stocks (static security master) and market_quotes (per-run prices).
--
-- Money convention (AGENTS.md §6): all prices are BIGINT paise (₹1 = 100).
--
-- RLS model (architecture review Part D):
--   stocks        -> readable by every authenticated user; writes via RPC only
--   market_quotes -> participants see ONLY the active run's quotes; admins see
--                    all; writes via RPC only (apply_price_changes)

-- ---------------------------------------------------------------------------
-- RLS helper: resolve the active competition run
-- (defined here because market_quotes RLS needs it; the review's 0011 covers
-- the remaining domain helpers)
-- ---------------------------------------------------------------------------

create or replace function public.current_run_id()
returns uuid
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select r.id
  from public.competition_runs r
  where r.status = 'ACTIVE'
  order by r.run_number desc
  limit 1;
$$;

revoke all on function public.current_run_id() from public;
grant execute on function public.current_run_id() to authenticated;

-- ---------------------------------------------------------------------------
-- Shared updated_at trigger
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public;

-- ---------------------------------------------------------------------------
-- stocks
-- ---------------------------------------------------------------------------

create table public.stocks (
  id uuid primary key default gen_random_uuid(),
  symbol text not null unique,
  company_name text not null,
  sector text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- market_quotes
-- ---------------------------------------------------------------------------

create table public.market_quotes (
  id uuid primary key default gen_random_uuid(),
  competition_run_id uuid not null
    references public.competition_runs(id) on delete cascade,
  stock_id uuid not null references public.stocks(id) on delete cascade,
  current_price bigint not null check (current_price > 0),
  previous_price bigint not null check (previous_price > 0),
  high bigint check (high is null or high > 0),
  low bigint check (low is null or low > 0),
  volume bigint not null default 0 check (volume >= 0),
  updated_at timestamptz not null default now(),
  constraint market_quotes_run_stock_unique unique (competition_run_id, stock_id)
);

create trigger market_quotes_set_updated_at
  before update on public.market_quotes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.stocks enable row level security;
alter table public.market_quotes enable row level security;

-- stocks: public security master (names/symbols); writes via RPC only.
create policy stocks_select_authenticated on public.stocks
  for select to authenticated using (true);

-- market_quotes: participants only see the ACTIVE run (AGENTS.md §7);
-- admins see every run's quotes; writes via RPC only.
create policy market_quotes_select_active_or_admin on public.market_quotes
  for select to authenticated
  using (public.is_admin() or competition_run_id = public.current_run_id());

-- Table-level hardening: TRUNCATE and DML bypass RLS, and Supabase default
-- privileges grant ALL to anon/authenticated. Every write is RPC-only
-- (SECURITY DEFINER bypasses grants), so these roles need SELECT only.
revoke all on table public.stocks, public.market_quotes from anon, authenticated;
grant select on table public.stocks to authenticated;
grant select on table public.market_quotes to authenticated;

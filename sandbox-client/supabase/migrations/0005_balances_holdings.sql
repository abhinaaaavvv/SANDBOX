-- 0005_balances_holdings.sql
-- Financial state: team_balances (cash cache) and holdings.
--
-- `team_balances.cash` is a controlled aggregate; the immutable cash_ledger
-- (0006) is the source of truth and is updated in the same transactions.
-- All monetary values are BIGINT paise.
--
-- RLS (architecture review Part D):
--   participants SELECT their own team's rows only; admins SELECT all;
--   writes flow through SECURITY DEFINER RPCs only (no direct write policies).

create table public.team_balances (
  competition_run_id uuid not null
    references public.competition_runs(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  cash bigint not null check (cash >= 0),
  updated_at timestamptz not null default now(),
  constraint team_balances_pkey primary key (competition_run_id, team_id)
);

create trigger team_balances_set_updated_at
  before update on public.team_balances
  for each row execute function public.set_updated_at();

create table public.holdings (
  id uuid primary key default gen_random_uuid(),
  competition_run_id uuid not null
    references public.competition_runs(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  stock_id uuid not null references public.stocks(id) on delete cascade,
  quantity bigint not null check (quantity > 0),
  average_buy_price bigint not null check (average_buy_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint holdings_run_team_stock_unique unique (competition_run_id, team_id, stock_id)
);

create trigger holdings_set_updated_at
  before update on public.holdings
  for each row execute function public.set_updated_at();

-- Used by dividends (holders of a stock) and the leaderboard valuation query.
create index holdings_run_stock_idx on public.holdings(competition_run_id, stock_id);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.team_balances enable row level security;
alter table public.holdings enable row level security;

-- team_balances: own team or admin; no direct writes (RPC-only).
create policy team_balances_select_own_or_admin on public.team_balances
  for select to authenticated
  using (public.is_admin() or team_id = public.current_team_id());

-- holdings: own team or admin; no direct writes (RPC-only).
create policy holdings_select_own_or_admin on public.holdings
  for select to authenticated
  using (public.is_admin() or team_id = public.current_team_id());

-- Table-level hardening: TRUNCATE and DML bypass RLS, and Supabase default
-- privileges grant ALL to anon/authenticated. Every write is RPC-only
-- (SECURITY DEFINER bypasses grants), so these roles need SELECT only.
revoke all on table public.team_balances, public.holdings from anon, authenticated;
grant select on table public.team_balances to authenticated;
grant select on table public.holdings to authenticated;

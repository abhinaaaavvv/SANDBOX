-- 0008_dividends.sql
-- Dividends: dividend events + per-team payout records.
--
-- pay_dividend() (Phase 6 RPC) declares one dividend event and atomically pays
-- every holder; dividend_payments.UNIQUE(dividend_id, team_id) prevents a
-- double payout. Amounts are BIGINT paise.
--
-- Participants see dividends only through their own cash_ledger / transaction
-- history; these tables are admin-visibility only.

create table public.dividends (
  id uuid primary key default gen_random_uuid(),
  competition_run_id uuid not null
    references public.competition_runs(id) on delete cascade,
  stock_id uuid not null references public.stocks(id) on delete cascade,
  amount_per_share bigint not null check (amount_per_share > 0),
  declared_by uuid references auth.users(id) on delete set null,
  declared_at timestamptz not null default now()
);

create index dividends_run_stock_idx on public.dividends(competition_run_id, stock_id);

create table public.dividend_payments (
  id uuid primary key default gen_random_uuid(),
  dividend_id uuid not null references public.dividends(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  stock_id uuid not null references public.stocks(id) on delete cascade,
  quantity bigint not null check (quantity > 0),
  amount_paid bigint not null check (amount_paid > 0),
  paid_at timestamptz not null default now(),
  constraint dividend_payments_dividend_team_unique unique (dividend_id, team_id)
);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.dividends enable row level security;
alter table public.dividend_payments enable row level security;

-- Admin-only visibility (participants see payouts via their own ledger).
create policy dividends_select_admin on public.dividends
  for select to authenticated using (public.is_admin());

create policy dividend_payments_select_admin on public.dividend_payments
  for select to authenticated using (public.is_admin());

-- Table-level hardening: SELECT only for authenticated; no DML/TRUNCATE
-- (writes are RPC-only via SECURITY DEFINER, which bypasses grants).
revoke all on table public.dividends, public.dividend_payments from anon, authenticated;
grant select on table public.dividends to authenticated;
grant select on table public.dividend_payments to authenticated;

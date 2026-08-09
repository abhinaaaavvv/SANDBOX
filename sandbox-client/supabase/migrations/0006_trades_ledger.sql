-- 0006_trades_ledger.sql
-- Immutable financial records: trades and cash_ledger.
--
-- Both tables are APPEND-ONLY (AGENTS.md §9, §10): UPDATE and DELETE are
-- blocked by triggers for every role. Corrections must be explicit adjustment
-- events (CORRECTION ledger entries / ADMIN_CREDIT / ADMIN_DEBIT), never
-- rewrites. All monetary values are BIGINT paise.
--
-- RLS (architecture review Part D):
--   participants SELECT their own team's rows; admins SELECT all;
--   INSERT happens exclusively inside SECURITY DEFINER RPCs (no direct
--   write policies for any role).

create table public.trades (
  id uuid primary key default gen_random_uuid(),
  competition_run_id uuid not null
    references public.competition_runs(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  stock_id uuid not null references public.stocks(id) on delete cascade,
  side text not null check (side in ('BUY', 'SELL')),
  quantity bigint not null check (quantity > 0),
  execution_price bigint not null check (execution_price > 0),
  gross_value bigint not null check (gross_value > 0),
  created_by uuid references auth.users(id) on delete set null,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  -- Row-level invariant: the recorded value must equal qty * price.
  constraint trades_gross_value_matches check (gross_value = quantity * execution_price),
  constraint trades_idempotency_key_unique unique (idempotency_key)
);

create index trades_run_team_created_idx
  on public.trades(competition_run_id, team_id, created_at desc);
create index trades_run_stock_idx on public.trades(competition_run_id, stock_id);

create table public.cash_ledger (
  id bigint generated always as identity primary key,
  competition_run_id uuid not null
    references public.competition_runs(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  type text not null check (type in (
    'INITIAL_CAPITAL', 'TRADE_BUY', 'TRADE_SELL', 'DIVIDEND',
    'ADMIN_CREDIT', 'ADMIN_DEBIT', 'CORRECTION'
  )),
  amount bigint not null check (amount <> 0),   -- signed paise; net = cash
  reference_id uuid,                            -- trade / dividend / batch id
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index cash_ledger_run_team_created_idx
  on public.cash_ledger(competition_run_id, team_id, created_at);

-- ---------------------------------------------------------------------------
-- Append-only enforcement
-- ---------------------------------------------------------------------------

create or replace function public.prevent_append_only_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'append-only table: rows cannot be updated or deleted; issue an explicit correction/adjustment event instead';
end;
$$;

create trigger trades_prevent_mutation
  before update or delete on public.trades
  for each row execute function public.prevent_append_only_mutation();

create trigger cash_ledger_prevent_mutation
  before update or delete on public.cash_ledger
  for each row execute function public.prevent_append_only_mutation();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.trades enable row level security;
alter table public.cash_ledger enable row level security;

-- trades: own team or admin; no direct writes (RPC-only).
create policy trades_select_own_or_admin on public.trades
  for select to authenticated
  using (public.is_admin() or team_id = public.current_team_id());

-- cash_ledger: own team or admin; no direct writes (RPC-only).
create policy cash_ledger_select_own_or_admin on public.cash_ledger
  for select to authenticated
  using (public.is_admin() or team_id = public.current_team_id());

-- Table-level hardening: TRUNCATE and DML bypass RLS, and Supabase default
-- privileges grant ALL to anon/authenticated. Every write is RPC-only
-- (SECURITY DEFINER bypasses grants), so these roles need SELECT only.
revoke all on table public.trades, public.cash_ledger from anon, authenticated;
grant select on table public.trades to authenticated;
grant select on table public.cash_ledger to authenticated;

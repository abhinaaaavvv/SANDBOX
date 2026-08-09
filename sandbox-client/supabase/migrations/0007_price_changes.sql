-- 0007_price_changes.sql
-- Admin-private price editing: price_change_batches + pending_price_changes.
--
-- Participants must never see pending prices (AGENTS.md §16): these tables
-- carry admin-only SELECT policies and no direct write policies — every
-- change flows through SECURITY DEFINER RPCs (create/upsert/discard/apply,
-- Phase 5). Prices are BIGINT paise.

create table public.price_change_batches (
  id uuid primary key default gen_random_uuid(),
  competition_run_id uuid not null
    references public.competition_runs(id) on delete cascade,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'APPLIED', 'DISCARDED')),
  created_by uuid references auth.users(id) on delete set null,
  applied_at timestamptz,
  applied_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  -- Cross-column invariant: an applied timestamp implies the APPLIED status.
  constraint price_change_batches_applied_requires_status
    check (applied_at is null or status = 'APPLIED')
);

create index price_change_batches_run_idx on public.price_change_batches(competition_run_id);

create table public.pending_price_changes (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.price_change_batches(id) on delete cascade,
  stock_id uuid not null references public.stocks(id) on delete cascade,
  new_price bigint not null check (new_price > 0),
  created_at timestamptz not null default now(),
  -- (batch_id) prefix of this index covers per-batch lookups
  constraint pending_price_changes_batch_stock_unique unique (batch_id, stock_id)
);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.price_change_batches enable row level security;
alter table public.pending_price_changes enable row level security;

-- Admin-only visibility. Admins and participants share the `authenticated`
-- role, so the policy (not the grant) is the gate: participants get 0 rows.
create policy price_change_batches_select_admin on public.price_change_batches
  for select to authenticated using (public.is_admin());

create policy pending_price_changes_select_admin on public.pending_price_changes
  for select to authenticated using (public.is_admin());

-- Table-level hardening: SELECT only for authenticated; no DML/TRUNCATE
-- (writes are RPC-only via SECURITY DEFINER, which bypasses grants).
revoke all on table public.price_change_batches, public.pending_price_changes from anon, authenticated;
grant select on table public.price_change_batches to authenticated;
grant select on table public.pending_price_changes to authenticated;

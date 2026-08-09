-- 0009_audit_videos_idempotency.sql
-- Audit log, idempotency, opening prices, and storage metadata for videos.

alter table public.stocks
  add column if not exists opening_price bigint check (opening_price > 0);

create table public.competition_events (
  id bigint generated always as identity primary key,
  competition_run_id uuid not null references public.competition_runs(id) on delete cascade,
  event_type text not null check (event_type in (
    'ROUND_STARTED', 'ROUND_ENDED', 'MARKET_OPENED', 'MARKET_CLOSED',
    'TRADING_PAUSED', 'TRADING_RESUMED', 'PRICE_BATCH_CREATED',
    'PRICE_BATCH_APPLIED', 'PRICE_BATCH_DISCARDED', 'TRADE_EXECUTED', 'DIVIDEND_PAID',
    'CASH_CREDITED', 'CASH_DEBITED', 'VIDEO_PLAYED', 'VIDEO_STOPPED',
    'COMPETITION_RESET'
  )),
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text not null default 'system' check (actor_role in ('participant', 'admin', 'system')),
  team_id uuid references public.teams(id) on delete set null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index competition_events_run_created_idx
  on public.competition_events(competition_run_id, created_at desc);

create or replace function public.prevent_append_only_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'append-only table: rows cannot be updated or deleted; issue an explicit correction or adjustment event instead';
end;
$$;

create trigger competition_events_prevent_mutation
  before update or delete on public.competition_events
  for each row execute function public.prevent_append_only_mutation();

create table public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  request_key uuid not null,
  competition_run_id uuid references public.competition_runs(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  status text not null default 'IN_PROGRESS' check (status in ('IN_PROGRESS', 'DONE')),
  response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint idempotency_keys_scope_request_unique unique (scope, request_key)
);

create trigger idempotency_keys_set_updated_at
  before update on public.idempotency_keys
  for each row execute function public.set_updated_at();

create table public.videos (
  id uuid primary key default gen_random_uuid(),
  competition_run_id uuid not null references public.competition_runs(id) on delete cascade,
  title text not null,
  description text,
  storage_path text not null,
  duration_seconds int not null check (duration_seconds > 0),
  round_requirement smallint check (round_requirement between 1 and 3),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint videos_storage_path_unique unique (storage_path)
);

create index videos_run_idx on public.videos(competition_run_id);

alter table public.competition_events enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.videos enable row level security;

create policy competition_events_select_authenticated on public.competition_events
  for select to authenticated using (true);

create policy videos_select_authenticated on public.videos
  for select to authenticated using (true);

revoke all on table public.competition_events, public.idempotency_keys, public.videos from anon, authenticated;
grant select on table public.competition_events to authenticated;
grant select on table public.videos to authenticated;

-- Seed the private storage bucket used for round 3 videos.
insert into storage.buckets (id, name, public)
values ('sandbox-videos', 'sandbox-videos', false)
on conflict (id) do update
set public = excluded.public;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'sandbox_videos_select_admin'
  ) then
    create policy sandbox_videos_select_admin on storage.objects
      for select to authenticated
      using (bucket_id = 'sandbox-videos' and public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'sandbox_videos_insert_admin'
  ) then
    create policy sandbox_videos_insert_admin on storage.objects
      for insert to authenticated
      with check (bucket_id = 'sandbox-videos' and public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'sandbox_videos_update_admin'
  ) then
    create policy sandbox_videos_update_admin on storage.objects
      for update to authenticated
      using (bucket_id = 'sandbox-videos' and public.is_admin())
      with check (bucket_id = 'sandbox-videos' and public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'sandbox_videos_delete_admin'
  ) then
    create policy sandbox_videos_delete_admin on storage.objects
      for delete to authenticated
      using (bucket_id = 'sandbox-videos' and public.is_admin());
  end if;
end
$$;

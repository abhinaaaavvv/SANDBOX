-- 0011_security_helpers.sql
-- Domain security helpers + audit/idempotency infrastructure.
--
-- NOTE — pull-forward: `competition_events` and `idempotency_keys` were planned
-- as 0010_events_idempotency.sql (docs/BACKEND_ARCHITECTURE.md Part M §C.7).
-- They are created HERE because execute_trade (0012) depends on both: the
-- TRADE_EXECUTED audit event and the DB-enforced idempotency guard. If 0010 is
-- written later, skip these two tables (or re-home them then).
--
-- Already defined in earlier migrations (not redefined here):
--   is_admin()             -> 0002   current_team_id() -> 0002
--   current_run_id()       -> 0004   set_updated_at()  -> 0004
--   prevent_append_only_mutation()   -> 0006
--
-- Every SECURITY DEFINER helper: SET search_path, fully-qualified names,
-- REVOKE ALL from public, GRANT only where a policy or RPC chain requires it.

-- ---------------------------------------------------------------------------
-- Stable application error
-- ---------------------------------------------------------------------------
-- Raises a machine-parseable error: message = 'SBX ' || json
--   {"code":"<STABLE_CODE>","message":"<human text>"}
-- Route handlers strip the SBX prefix, JSON-parse, and map codes to HTTP
-- responses (AGENTS.md §30). Raw PostgreSQL errors never reach clients.

create or replace function public.app_error(p_code text, p_message text)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'SBX %', json_build_object('code', p_code, 'message', p_message)::text;
end;
$$;

revoke all on function public.app_error(text, text) from public;

-- ---------------------------------------------------------------------------
-- Identity helpers
-- ---------------------------------------------------------------------------
-- team_of: authoritative team resolution from team_members (the single source
-- of truth per 0002). Client-supplied team_id is NEVER trusted (AGENTS.md §5).

create or replace function public.team_of(p_user_id uuid)
returns uuid
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select team_id from public.team_members where user_id = p_user_id;
$$;

revoke all on function public.team_of(uuid) from public;
grant execute on function public.team_of(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Guards (fail-closed, stable codes)
-- ---------------------------------------------------------------------------

create or replace function public.require_authenticated()
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    perform public.app_error('AUTH_REQUIRED', 'You must be signed in to perform this action.');
  end if;
end;
$$;

create or replace function public.require_admin()
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    perform public.app_error('FORBIDDEN', 'Admin privileges are required for this action.');
  end if;
end;
$$;

create or replace function public.require_team()
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.team_of(auth.uid()) is null then
    perform public.app_error('TEAM_NOT_FOUND', 'Your account is not linked to a team.');
  end if;
end;
$$;

revoke all on function public.require_authenticated() from public;
revoke all on function public.require_admin() from public;
revoke all on function public.require_team() from public;

-- ---------------------------------------------------------------------------
-- Money utility
-- ---------------------------------------------------------------------------
-- round_div: nearest-integer division for paise math (e.g. average buy price
-- recomputation). Deterministic BIGINT arithmetic only — no floating point
-- (AGENTS.md §6).

create or replace function public.round_div(p_numerator bigint, p_denominator bigint)
returns bigint
language sql
immutable
set search_path = public, pg_temp
as $$
  select (p_numerator + p_denominator / 2) / p_denominator;
$$;

revoke all on function public.round_div(bigint, bigint) from public;

-- ---------------------------------------------------------------------------
-- competition_events — immutable audit log (AGENTS.md §33)
-- ---------------------------------------------------------------------------
-- INSERT-only. UPDATE/DELETE blocked by the same guard used for trades and the
-- cash ledger (0006). Participants may SELECT all rows; metadata is written
-- only by SECURITY DEFINER RPCs and must stay sanitized (no tokens/secrets).

create table public.competition_events (
  id bigint generated always as identity primary key,
  competition_run_id uuid not null
    references public.competition_runs(id) on delete cascade,
  event_type text not null
    check (event_type in (
      'ROUND_STARTED', 'ROUND_ENDED',
      'MARKET_OPENED', 'MARKET_CLOSED',
      'TRADING_PAUSED', 'TRADING_RESUMED',
      'PRICE_BATCH_CREATED', 'PRICE_BATCH_APPLIED',
      'TRADE_EXECUTED',
      'DIVIDEND_PAID',
      'CASH_CREDITED', 'CASH_DEBITED',
      'VIDEO_PLAYED',
      'COMPETITION_RESET'
    )),
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text not null default 'admin'
    check (actor_role in ('admin', 'participant', 'system')),
  team_id uuid references public.teams(id) on delete set null,
  entity_id uuid,                              -- trade / batch / dividend id
  metadata jsonb not null default '{}'::jsonb, -- sanitized, structured detail
  created_at timestamptz not null default now()
);

create index competition_events_run_created_idx
  on public.competition_events(competition_run_id, created_at);

create trigger competition_events_prevent_mutation
  before update or delete on public.competition_events
  for each row execute function public.prevent_append_only_mutation();

alter table public.competition_events enable row level security;

create policy competition_events_select_authenticated on public.competition_events
  for select to authenticated using (true);

revoke all on table public.competition_events from anon, authenticated;
grant select on table public.competition_events to authenticated;

-- ---------------------------------------------------------------------------
-- idempotency_keys — DB-enforced duplicate-request guard (AGENTS.md §13)
-- ---------------------------------------------------------------------------
-- Function-only table: RLS enabled with NO policies and NO grants for
-- anon/authenticated. Only SECURITY DEFINER RPCs (owner role, which bypasses
-- RLS) read/write it. A committed row is always status='DONE' with the stored
-- response; an 'IN_PROGRESS' row is only ever visible inside its own
-- transaction and vanishes on rollback.

create table public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  scope text not null
    check (scope in ('trade', 'price_batch', 'dividend', 'round', 'cash', 'reset')),
  key uuid not null,
  competition_run_id uuid
    references public.competition_runs(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  response jsonb,
  status text not null default 'IN_PROGRESS'
    check (status in ('IN_PROGRESS', 'DONE')),
  created_at timestamptz not null default now(),
  constraint idempotency_keys_scope_key_unique unique (scope, key)
);

alter table public.idempotency_keys enable row level security;

revoke all on table public.idempotency_keys from anon, authenticated;

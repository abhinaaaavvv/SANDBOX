-- 0010_security_helpers.sql
-- Shared authorization, idempotency, and audit helpers for SECURITY DEFINER RPCs.

create or replace function public.current_role()
returns text
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select p.role from public.profiles p where p.id = auth.uid();
$$;

revoke all on function public.current_role() from public;
grant execute on function public.current_role() to authenticated;

create or replace function public.current_team_or_raise()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_team_id uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select p.team_id into v_team_id
  from public.profiles p
  where p.id = auth.uid();

  if v_team_id is null then
    raise exception 'TEAM_NOT_FOUND';
  end if;

  return v_team_id;
end;
$$;

revoke all on function public.current_team_or_raise() from public;
grant execute on function public.current_team_or_raise() to authenticated;

create or replace function public.current_run_or_raise()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_run_id uuid;
begin
  select public.current_run_id() into v_run_id;
  if v_run_id is null then
    raise exception 'ROUND_NOT_ACTIVE';
  end if;
  return v_run_id;
end;
$$;

revoke all on function public.current_run_or_raise() from public;
grant execute on function public.current_run_or_raise() to authenticated;

create or replace function public.active_round_row()
returns public.rounds
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_row public.rounds;
begin
  select r.* into v_row
  from public.rounds r
  where r.competition_run_id = public.current_run_or_raise()
    and r.status = 'ACTIVE'
  order by r.round_number asc
  limit 1;

  if not found then
    raise exception 'ROUND_NOT_ACTIVE';
  end if;

  return v_row;
end;
$$;

revoke all on function public.active_round_row() from public;
grant execute on function public.active_round_row() to authenticated;

create or replace function public.round_row_or_raise(p_round_number smallint)
returns public.rounds
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_row public.rounds;
begin
  select r.* into v_row
  from public.rounds r
  where r.competition_run_id = public.current_run_or_raise()
    and r.round_number = p_round_number;

  if not found then
    raise exception 'ROUND_NOT_ACTIVE';
  end if;

  return v_row;
end;
$$;

revoke all on function public.round_row_or_raise(smallint) from public;
grant execute on function public.round_row_or_raise(smallint) to authenticated;

create or replace function public.claim_idempotency_key(
  p_scope text,
  p_request_key uuid,
  p_run_id uuid default null
)
returns public.idempotency_keys
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.idempotency_keys;
begin
  insert into public.idempotency_keys (scope, request_key, competition_run_id, actor_id, status)
  values (p_scope, p_request_key, p_run_id, auth.uid(), 'IN_PROGRESS')
  on conflict (scope, request_key) do nothing;

  select * into v_row
  from public.idempotency_keys
  where scope = p_scope and request_key = p_request_key
  for update;

  return v_row;
end;
$$;

revoke all on function public.claim_idempotency_key(text, uuid, uuid) from public;
grant execute on function public.claim_idempotency_key(text, uuid, uuid) to authenticated;

create or replace function public.complete_idempotency_key(
  p_scope text,
  p_request_key uuid,
  p_response jsonb
)
returns public.idempotency_keys
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.idempotency_keys;
begin
  update public.idempotency_keys
  set status = 'DONE', response = p_response, updated_at = now()
  where scope = p_scope and request_key = p_request_key
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.complete_idempotency_key(text, uuid, jsonb) from public;
grant execute on function public.complete_idempotency_key(text, uuid, jsonb) to authenticated;

create or replace function public.record_competition_event(
  p_run_id uuid,
  p_event_type text,
  p_metadata jsonb default '{}'::jsonb,
  p_team_id uuid default null,
  p_entity_id uuid default null,
  p_actor_role text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.competition_events (
    competition_run_id,
    event_type,
    actor_id,
    actor_role,
    team_id,
    entity_id,
    metadata
  )
  values (
    p_run_id,
    p_event_type,
    auth.uid(),
    coalesce(p_actor_role, coalesce(public.current_role(), 'system')),
    p_team_id,
    p_entity_id,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.record_competition_event(uuid, text, jsonb, uuid, uuid, text) from public;
grant execute on function public.record_competition_event(uuid, text, jsonb, uuid, uuid, text) to authenticated;

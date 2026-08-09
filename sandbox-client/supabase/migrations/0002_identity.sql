-- 0002_identity.sql
-- Identity & teams: profiles, teams, team_members + RLS.
--
-- Membership model (AGENTS.md §5):
--   auth.users -> profiles (1:1, auto-provisioned)
--   auth.users -> team_members (1:N) -> teams
--
-- `profiles.team_id` is a derived cache of team_members membership (kept in
-- sync by trigger). `team_members` is the single source of truth.
--
-- Note on migration ordering vs the architecture review: the RLS helper
-- functions (is_admin, current_team_id) are defined in this migration
-- (after the profiles table) because the policies below require them; the
-- review's 0011_security_helpers covers the domain-level helpers
-- (current_run, etc.).

-- ---------------------------------------------------------------------------
-- teams
-- ---------------------------------------------------------------------------

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- team_members
-- ---------------------------------------------------------------------------

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  constraint team_members_user_id_unique unique (user_id),
  constraint team_members_team_user_unique unique (team_id, user_id)
);

create index team_members_team_id_idx on public.team_members(team_id);

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null unique,
  display_name text,
  role text not null default 'participant'
    check (role in ('participant', 'admin')),
  team_id uuid references public.teams(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Auto-provision a profile row when a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles.team_id consistent with team_members.
create or replace function public.sync_profile_team()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    update public.profiles set team_id = new.team_id where id = new.user_id;
  elsif tg_op = 'DELETE' then
    update public.profiles set team_id = null
    where id = old.user_id and team_id = old.team_id;
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function public.sync_profile_team() from public;

create trigger team_members_sync_profile
  after insert or update or delete on public.team_members
  for each row execute function public.sync_profile_team();

-- ---------------------------------------------------------------------------
-- RLS helper functions
-- (defined here, after profiles exists: LANGUAGE sql bodies are analyzed at
-- CREATE FUNCTION time, so they cannot reference tables created later)
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create or replace function public.current_team_id()
returns uuid
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select p.team_id from public.profiles p where p.id = auth.uid();
$$;

revoke all on function public.current_team_id() from public;
grant execute on function public.current_team_id() to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.profiles enable row level security;

-- Supabase default privileges grant ALL to authenticated/service_role on new
-- public tables; RLS policies below are the enforcement boundary. For
-- profiles we additionally restrict UPDATE to display_name only (participants
-- must never be able to change their own role or team_id).

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;

-- Table-level hardening (same rationale as 0004-0006): TRUNCATE bypasses
-- RLS, so strip DML grants from anon/authenticated on the remaining tables;
-- writes flow through SECURITY DEFINER RPCs (grant-independent).
revoke all on table public.teams, public.team_members from anon, authenticated;
grant select on table public.teams to authenticated;
grant select on table public.team_members to authenticated;

-- teams: public roster readable by every authenticated user. No direct write
-- policies — team management flows through SECURITY DEFINER RPCs only
-- (matching the approved RLS matrix, architecture review Part D).
create policy teams_select_authenticated on public.teams
  for select to authenticated using (true);

-- team_members: users see their own membership. No direct write policies.
create policy team_members_select_own_or_admin on public.team_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- profiles: users read/update their own row; admins read all.
create policy profiles_select_own_or_admin on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

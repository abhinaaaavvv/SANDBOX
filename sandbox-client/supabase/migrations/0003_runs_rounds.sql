-- 0003_runs_rounds.sql
-- Competition runs & rounds — the authoritative competition state machine.
--
-- Run lifecycle:   SETUP --start_round(1)--> ACTIVE --all rounds done--> COMPLETED
-- Round states:    WAITING --start_round--> ACTIVE --end_round--> ENDED
-- Market states:   OPEN / PAUSED / CLOSED  (round stays ACTIVE while paused)
--
-- Writes are performed exclusively by SECURITY DEFINER RPCs (Phase 3+);
-- every authenticated user gets SELECT on public competition state only.

create table public.competition_runs (
  id uuid primary key default gen_random_uuid(),
  run_number int not null,
  name text,
  status text not null default 'SETUP'
    check (status in ('SETUP', 'ACTIVE', 'COMPLETED')),
  started_at timestamptz,
  ended_at timestamptz,
  -- Recoverable video-broadcast state (architecture review Part I). FK to
  -- videos is added with the videos table (0009).
  active_video_id uuid,
  video_started_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint competition_runs_run_number_unique unique (run_number),
  constraint competition_runs_run_number_positive check (run_number > 0)
);

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  competition_run_id uuid not null
    references public.competition_runs(id) on delete cascade,
  round_number smallint not null check (round_number between 1 and 3),
  status text not null default 'WAITING'
    check (status in ('WAITING', 'ACTIVE', 'ENDED')),
  market_status text not null default 'CLOSED'
    check (market_status in ('OPEN', 'PAUSED', 'CLOSED')),
  started_at timestamptz,
  ends_at timestamptz,      -- authoritative round-end timestamp (timer source)
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint rounds_run_round_unique unique (competition_run_id, round_number),
  constraint rounds_ends_at_requires_start
    check (ends_at is null or started_at is not null)
);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.competition_runs enable row level security;
alter table public.rounds enable row level security;

-- Public competition state: readable by every authenticated user.
-- No direct write policies — state changes flow through RPCs only.
create policy competition_runs_select_authenticated on public.competition_runs
  for select to authenticated using (true);

create policy rounds_select_authenticated on public.rounds
  for select to authenticated using (true);

-- Table-level hardening: TRUNCATE bypasses RLS; Supabase default privileges
-- grant ALL to anon/authenticated. State changes flow through RPCs only, so
-- these roles need SELECT only.
revoke all on table public.competition_runs, public.rounds from anon, authenticated;
grant select on table public.competition_runs to authenticated;
grant select on table public.rounds to authenticated;

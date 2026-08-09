-- 0015_fn_admin.sql
-- Admin controls: round lifecycle, market/trading toggles, cash adjustments,
-- and competition reset.
--
-- Extracted from 0011_domain_rpcs.sql so the admin RPCs are independently
-- reviewable (0011 documents this move). Depends on helpers from 0010/0011
-- (current_role, current_run_or_raise, active_round_row,
-- claim_idempotency_key, complete_idempotency_key, record_competition_event).
--
-- Conventions (AGENTS.md §30, stable error codes):
--   * every mutating RPC is admin-only (FORBIDDEN) and current-run scoped
--   * claim-first idempotency: duplicate key -> identical stored result
--   * NULL idempotency key -> INVALID_REQUEST (mirrors execute_trade/pay_dividend)
--   * money is BIGINT paise (₹1 = 100)
--
-- State machine (architecture review F):
--   start_round:   ends any ACTIVE round, activates target, market OPEN, 15min
--   end_round:     ends round; run COMPLETED when no rounds remain
--   open/close market, pause/resume trading: toggle current round's status
--   new_competition_run: COMPLETEs the active run, creates a fresh ACTIVE run
--                        (rounds 1-3, quotes from opening_price, ₹1,00,000
--                        balances + INITIAL_CAPITAL ledger)

create or replace function public.credit_cash(
  p_team_id uuid,
  p_amount bigint,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run_id uuid;
  v_current_cash bigint;
  v_response jsonb;
  v_existing public.idempotency_keys;
begin
  if public.current_role() is distinct from 'admin' then
    raise exception 'FORBIDDEN';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_QUANTITY';
  end if;

  if p_idempotency_key is null then
    -- a NULL key would let duplicate requests double-credit
    raise exception 'INVALID_REQUEST';
  end if;

  v_run_id := public.current_run_or_raise();
  v_existing := public.claim_idempotency_key('credit_cash', p_idempotency_key, v_run_id);
  if v_existing.response is not null then
    return v_existing.response;
  end if;

  select cash into v_current_cash
  from public.team_balances
  where competition_run_id = v_run_id and team_id = p_team_id
  for update;

  if v_current_cash is null then
    raise exception 'TEAM_NOT_FOUND';
  end if;

  update public.team_balances
    set cash = cash + p_amount
    where competition_run_id = v_run_id and team_id = p_team_id;

  insert into public.cash_ledger (competition_run_id, team_id, type, amount, note, created_by)
  values (v_run_id, p_team_id, 'ADMIN_CREDIT', p_amount, p_reason, auth.uid());

  perform public.record_competition_event(
    v_run_id,
    'CASH_CREDITED',
    jsonb_build_object('teamId', p_team_id::text, 'amountPaise', p_amount, 'reason', p_reason),
    p_team_id,
    null,
    'admin'
  );

  v_response := jsonb_build_object('success', true);
  perform public.complete_idempotency_key('credit_cash', p_idempotency_key, v_response);
  return v_response;
end;
$$;

revoke all on function public.credit_cash(uuid, bigint, text, uuid) from public;
grant execute on function public.credit_cash(uuid, bigint, text, uuid) to authenticated;

create or replace function public.debit_cash(
  p_team_id uuid,
  p_amount bigint,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run_id uuid;
  v_current_cash bigint;
  v_response jsonb;
  v_existing public.idempotency_keys;
begin
  if public.current_role() is distinct from 'admin' then
    raise exception 'FORBIDDEN';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_QUANTITY';
  end if;

  if p_idempotency_key is null then
    -- a NULL key would let duplicate requests double-debit
    raise exception 'INVALID_REQUEST';
  end if;

  v_run_id := public.current_run_or_raise();
  v_existing := public.claim_idempotency_key('debit_cash', p_idempotency_key, v_run_id);
  if v_existing.response is not null then
    return v_existing.response;
  end if;

  select cash into v_current_cash
  from public.team_balances
  where competition_run_id = v_run_id and team_id = p_team_id
  for update;

  if v_current_cash is null then
    raise exception 'TEAM_NOT_FOUND';
  end if;

  if v_current_cash < p_amount then
    raise exception 'INSUFFICIENT_CASH';
  end if;

  update public.team_balances
    set cash = cash - p_amount
    where competition_run_id = v_run_id and team_id = p_team_id;

  insert into public.cash_ledger (competition_run_id, team_id, type, amount, note, created_by)
  values (v_run_id, p_team_id, 'ADMIN_DEBIT', -p_amount, p_reason, auth.uid());

  perform public.record_competition_event(
    v_run_id,
    'CASH_DEBITED',
    jsonb_build_object('teamId', p_team_id::text, 'amountPaise', p_amount, 'reason', p_reason),
    p_team_id,
    null,
    'admin'
  );

  v_response := jsonb_build_object('success', true);
  perform public.complete_idempotency_key('debit_cash', p_idempotency_key, v_response);
  return v_response;
end;
$$;

revoke all on function public.debit_cash(uuid, bigint, text, uuid) from public;
grant execute on function public.debit_cash(uuid, bigint, text, uuid) to authenticated;

create or replace function public.start_round(
  p_round_number smallint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run_id uuid;
  v_target_round public.rounds;
  v_active_count int;
  v_response jsonb;
  v_existing public.idempotency_keys;
begin
  if public.current_role() is distinct from 'admin' then
    raise exception 'FORBIDDEN';
  end if;

  if p_idempotency_key is null then
    raise exception 'INVALID_REQUEST';
  end if;

  v_run_id := coalesce(public.current_run_id(), (select id from public.competition_runs order by run_number desc limit 1));
  if v_run_id is null then
    raise exception 'ROUND_NOT_ACTIVE';
  end if;

  v_existing := public.claim_idempotency_key('start_round', p_idempotency_key, v_run_id);
  if v_existing.response is not null then
    return v_existing.response;
  end if;

  select * into v_target_round
  from public.rounds
  where competition_run_id = v_run_id and round_number = p_round_number
  for update;

  if not found then
    raise exception 'ROUND_NOT_ACTIVE';
  end if;

  update public.rounds
  set status = 'ENDED', market_status = 'CLOSED', ended_at = coalesce(ended_at, now())
  where competition_run_id = v_run_id and round_number <> p_round_number and status = 'ACTIVE';

  update public.rounds
  set status = 'ACTIVE', market_status = 'OPEN', started_at = coalesce(started_at, now()), ends_at = coalesce(ends_at, now() + interval '15 minutes'), ended_at = null
  where id = v_target_round.id;

  update public.competition_runs
  set status = 'ACTIVE', started_at = coalesce(started_at, now())
  where id = v_run_id;

  perform public.record_competition_event(
    v_run_id,
    'ROUND_STARTED',
    jsonb_build_object('roundNumber', p_round_number),
    null,
    v_target_round.id,
    'admin'
  );

  v_response := jsonb_build_object('success', true, 'round', p_round_number);
  perform public.complete_idempotency_key('start_round', p_idempotency_key, v_response);
  return v_response;
end;
$$;

revoke all on function public.start_round(smallint, uuid) from public;
grant execute on function public.start_round(smallint, uuid) to authenticated;

create or replace function public.end_round(
  p_round_number smallint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run_id uuid;
  v_round public.rounds;
  v_remaining int;
  v_response jsonb;
  v_existing public.idempotency_keys;
begin
  if public.current_role() is distinct from 'admin' then
    raise exception 'FORBIDDEN';
  end if;

  if p_idempotency_key is null then
    raise exception 'INVALID_REQUEST';
  end if;

  v_run_id := coalesce(public.current_run_id(), (select id from public.competition_runs order by run_number desc limit 1));
  if v_run_id is null then
    raise exception 'ROUND_NOT_ACTIVE';
  end if;

  v_existing := public.claim_idempotency_key('end_round', p_idempotency_key, v_run_id);
  if v_existing.response is not null then
    return v_existing.response;
  end if;

  select * into v_round
  from public.rounds
  where competition_run_id = v_run_id and round_number = p_round_number
  for update;

  if not found then
    raise exception 'ROUND_NOT_ACTIVE';
  end if;

  update public.rounds
  set status = 'ENDED', market_status = 'CLOSED', ended_at = now()
  where id = v_round.id;

  select count(*) into v_remaining
  from public.rounds
  where competition_run_id = v_run_id and status <> 'ENDED';

  if v_remaining = 0 then
    update public.competition_runs
    set status = 'COMPLETED', ended_at = now()
    where id = v_run_id;
  end if;

  perform public.record_competition_event(
    v_run_id,
    'ROUND_ENDED',
    jsonb_build_object('roundNumber', p_round_number),
    null,
    v_round.id,
    'admin'
  );

  v_response := jsonb_build_object('success', true, 'round', p_round_number);
  perform public.complete_idempotency_key('end_round', p_idempotency_key, v_response);
  return v_response;
end;
$$;

revoke all on function public.end_round(smallint, uuid) from public;
grant execute on function public.end_round(smallint, uuid) to authenticated;

create or replace function public.open_market()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run_id uuid;
  v_round public.rounds;
begin
  if public.current_role() is distinct from 'admin' then
    raise exception 'FORBIDDEN';
  end if;

  v_run_id := public.current_run_or_raise();
  select * into v_round from public.active_round_row();

  if not found then
    raise exception 'ROUND_NOT_ACTIVE';
  end if;

  update public.rounds set market_status = 'OPEN' where id = v_round.id;
  perform public.record_competition_event(v_run_id, 'MARKET_OPENED', jsonb_build_object('roundNumber', v_round.round_number), null, v_round.id, 'admin');
  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.open_market() from public;
grant execute on function public.open_market() to authenticated;

create or replace function public.close_market()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run_id uuid;
  v_round public.rounds;
begin
  if public.current_role() is distinct from 'admin' then
    raise exception 'FORBIDDEN';
  end if;

  v_run_id := public.current_run_or_raise();
  select * into v_round from public.active_round_row();

  if not found then
    raise exception 'ROUND_NOT_ACTIVE';
  end if;

  update public.rounds set market_status = 'CLOSED' where id = v_round.id;
  perform public.record_competition_event(v_run_id, 'MARKET_CLOSED', jsonb_build_object('roundNumber', v_round.round_number), null, v_round.id, 'admin');
  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.close_market() from public;
grant execute on function public.close_market() to authenticated;

create or replace function public.pause_trading()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run_id uuid;
  v_round public.rounds;
begin
  if public.current_role() is distinct from 'admin' then
    raise exception 'FORBIDDEN';
  end if;

  v_run_id := public.current_run_or_raise();
  select * into v_round from public.active_round_row();

  if not found then
    raise exception 'ROUND_NOT_ACTIVE';
  end if;

  update public.rounds set market_status = 'PAUSED' where id = v_round.id;
  perform public.record_competition_event(v_run_id, 'TRADING_PAUSED', jsonb_build_object('roundNumber', v_round.round_number), null, v_round.id, 'admin');
  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.pause_trading() from public;
grant execute on function public.pause_trading() to authenticated;

create or replace function public.resume_trading()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run_id uuid;
  v_round public.rounds;
begin
  if public.current_role() is distinct from 'admin' then
    raise exception 'FORBIDDEN';
  end if;

  v_run_id := public.current_run_or_raise();
  select * into v_round from public.active_round_row();

  if not found then
    raise exception 'ROUND_NOT_ACTIVE';
  end if;

  update public.rounds set market_status = 'OPEN' where id = v_round.id;
  perform public.record_competition_event(v_run_id, 'TRADING_RESUMED', jsonb_build_object('roundNumber', v_round.round_number), null, v_round.id, 'admin');
  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.resume_trading() from public;
grant execute on function public.resume_trading() to authenticated;

create or replace function public.new_competition_run(
  p_confirm boolean,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run_number int;
  v_run_id uuid;
  v_stock_count int;
  v_team_count int;
  v_response jsonb;
  v_existing public.idempotency_keys;
begin
  if public.current_role() is distinct from 'admin' then
    raise exception 'FORBIDDEN';
  end if;

  if not p_confirm then
    raise exception 'INVALID_STATE_TRANSITION';
  end if;

  if p_idempotency_key is null then
    -- a NULL key would let duplicate resets create multiple runs
    raise exception 'INVALID_REQUEST';
  end if;

  v_existing := public.claim_idempotency_key('new_competition_run', p_idempotency_key, null);
  if v_existing.response is not null then
    return v_existing.response;
  end if;

  select coalesce(max(run_number), 0) + 1 into v_run_number from public.competition_runs;

  update public.rounds
  set status = 'ENDED', market_status = 'CLOSED', ended_at = coalesce(ended_at, now())
  where competition_run_id in (select id from public.competition_runs where status = 'ACTIVE');

  update public.competition_runs
  set status = 'COMPLETED', ended_at = coalesce(ended_at, now())
  where status = 'ACTIVE';

  insert into public.competition_runs (run_number, name, status, started_at, created_by)
  values (v_run_number, concat('Run ', v_run_number), 'ACTIVE', now(), auth.uid())
  returning id into v_run_id;

  select count(*) into v_stock_count from public.stocks where is_active and opening_price is not null;
  select count(*) into v_team_count from public.teams;

  if v_stock_count = 0 then
    raise exception 'INVALID_PRICE';
  end if;

  insert into public.rounds (competition_run_id, round_number, status, market_status, started_at, ends_at)
  values
    (v_run_id, 1, 'ACTIVE', 'OPEN', now(), now() + interval '15 minutes'),
    (v_run_id, 2, 'WAITING', 'CLOSED', null, null),
    (v_run_id, 3, 'WAITING', 'CLOSED', null, null);

  insert into public.market_quotes (competition_run_id, stock_id, current_price, previous_price, high, low, volume)
  select v_run_id, s.id, s.opening_price, s.opening_price, s.opening_price, s.opening_price, 0
  from public.stocks s
  where s.is_active and s.opening_price is not null;

  insert into public.team_balances (competition_run_id, team_id, cash)
  select v_run_id, t.id, 10000000
  from public.teams t;

  insert into public.cash_ledger (competition_run_id, team_id, type, amount, note, created_by)
  select v_run_id, t.id, 'INITIAL_CAPITAL', 10000000, 'Initial capital allocation', auth.uid()
  from public.teams t;

  perform public.record_competition_event(
    v_run_id,
    'COMPETITION_RESET',
    jsonb_build_object('runNumber', v_run_number, 'teams', v_team_count, 'stocks', v_stock_count),
    null,
    v_run_id,
    'admin'
  );

  v_response := jsonb_build_object('success', true, 'runId', v_run_id::text, 'runNumber', v_run_number);
  perform public.complete_idempotency_key('new_competition_run', p_idempotency_key, v_response);
  return v_response;
end;
$$;

revoke all on function public.new_competition_run(boolean, uuid) from public;
grant execute on function public.new_competition_run(boolean, uuid) to authenticated;

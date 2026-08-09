-- 0011_domain_rpcs.sql
-- Authoritative domain operations for competition runs, trading, market updates, dividends,
-- cash adjustments, price batches, and video playback.

create or replace function public.create_price_batch(
  p_changes jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run_id uuid;
  v_batch_id uuid;
  v_existing public.idempotency_keys;
  v_change jsonb;
  v_count int := 0;
  v_done public.idempotency_keys;
begin
  if public.current_role() is distinct from 'admin' then
    raise exception 'FORBIDDEN';
  end if;

  v_run_id := public.current_run_or_raise();
  v_existing := public.claim_idempotency_key('create_price_batch', p_idempotency_key, v_run_id);
  if v_existing.response is not null then
    return v_existing.response;
  end if;

  if p_changes is null or jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) = 0 then
    raise exception 'INVALID_PRICE';
  end if;

  insert into public.price_change_batches (competition_run_id, created_by)
  values (v_run_id, auth.uid())
  returning id into v_batch_id;

  -- Validate every change UP FRONT so apply can never fail mid-batch:
  -- price present and positive, stock present and actually trading in this run.
  for v_change in select * from jsonb_array_elements(p_changes) loop
    if (v_change->>'stockId') is null or (v_change->>'newPrice') is null
       or (v_change->>'newPrice')::bigint is null
       or (v_change->>'newPrice')::bigint <= 0 then
      raise exception 'INVALID_PRICE';
    end if;

    if not exists (
      select 1 from public.market_quotes
      where competition_run_id = v_run_id and stock_id = (v_change->>'stockId')::uuid
    ) then
      raise exception 'INVALID_PRICE';
    end if;

    insert into public.pending_price_changes (batch_id, stock_id, new_price)
    values (
      v_batch_id,
      (v_change->>'stockId')::uuid,
      (v_change->>'newPrice')::bigint
    );
    v_count := v_count + 1;
  end loop;

  perform public.record_competition_event(
    v_run_id,
    'PRICE_BATCH_CREATED',
    jsonb_build_object('batchId', v_batch_id, 'count', v_count),
    null,
    v_batch_id,
    'admin'
  );

  v_done := public.complete_idempotency_key(
    'create_price_batch',
    p_idempotency_key,
    jsonb_build_object('success', true, 'batchId', v_batch_id::text, 'count', v_count)
  );
  return v_done.response;
end;
$$;

revoke all on function public.create_price_batch(jsonb, uuid) from public;
grant execute on function public.create_price_batch(jsonb, uuid) to authenticated;

create or replace function public.upsert_pending_price(
  p_batch_id uuid,
  p_stock_id uuid,
  p_new_price bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch public.price_change_batches;
begin
  if public.current_role() is distinct from 'admin' then
    raise exception 'FORBIDDEN';
  end if;

  if p_new_price is null or p_new_price <= 0 then
    raise exception 'INVALID_PRICE';
  end if;

  select * into v_batch
  from public.price_change_batches
  where id = p_batch_id and competition_run_id = public.current_run_or_raise()
  for update;

  if not found then
    raise exception 'PRICE_BATCH_NOT_FOUND';
  end if;

  if v_batch.status <> 'PENDING' then
    raise exception 'PRICE_BATCH_ALREADY_APPLIED';
  end if;

  -- the stock must actually trade in this run, or apply would fail mid-batch
  if not exists (
    select 1 from public.market_quotes
    where competition_run_id = public.current_run_or_raise() and stock_id = p_stock_id
  ) then
    raise exception 'INVALID_PRICE';
  end if;

  insert into public.pending_price_changes (batch_id, stock_id, new_price)
  values (p_batch_id, p_stock_id, p_new_price)
  on conflict (batch_id, stock_id) do update
  set new_price = excluded.new_price;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.upsert_pending_price(uuid, uuid, bigint) from public;
grant execute on function public.upsert_pending_price(uuid, uuid, bigint) to authenticated;

create or replace function public.discard_price_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch public.price_change_batches;
begin
  if public.current_role() is distinct from 'admin' then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_batch
  from public.price_change_batches
  where id = p_batch_id and competition_run_id = public.current_run_or_raise()
  for update;

  if not found then
    raise exception 'PRICE_BATCH_NOT_FOUND';
  end if;

  if v_batch.status <> 'PENDING' then
    raise exception 'PRICE_BATCH_ALREADY_APPLIED';
  end if;

  update public.price_change_batches set status = 'DISCARDED' where id = p_batch_id;
  perform public.record_competition_event(public.current_run_or_raise(), 'PRICE_BATCH_DISCARDED', jsonb_build_object('batchId', p_batch_id::text, 'status', 'DISCARDED'), null, p_batch_id, 'admin');
  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.discard_price_batch(uuid) from public;
grant execute on function public.discard_price_batch(uuid) to authenticated;

create or replace function public.execute_trade(
  p_side text,
  p_stock_id uuid,
  p_quantity bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run_id uuid;
  v_team_id uuid;
  v_role text;
  v_round public.rounds;
  v_quote public.market_quotes;
  v_holding public.holdings;
  v_trade_id uuid;
  v_cash bigint;
  v_total bigint;
  v_response jsonb;
  v_existing public.idempotency_keys;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_side not in ('BUY', 'SELL') then
    raise exception 'INVALID_QUANTITY';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'INVALID_QUANTITY';
  end if;

  if p_idempotency_key is null then
    -- a NULL key would bypass the trades.idempotency_key UNIQUE guard and
    -- allow duplicate execution
    raise exception 'INVALID_REQUEST';
  end if;

  v_role := coalesce(public.current_role(), 'participant');
  v_team_id := public.current_team_or_raise();
  v_run_id := public.current_run_or_raise();

  -- idempotency: claim-first, matching the other keyed RPCs. A concurrent
  -- duplicate blocks on the claim row and returns the winner's stored result;
  -- a completed request short-circuits here.
  v_existing := public.claim_idempotency_key('trade', p_idempotency_key, v_run_id);
  if v_existing.response is not null then
    return v_existing.response;
  end if;

  -- FOR SHARE: concurrent trades share the round lock; start_round/end_round
  -- take it FOR UPDATE and therefore serialize against in-flight trades.
  select * into v_round
  from public.rounds
  where competition_run_id = v_run_id and status = 'ACTIVE'
  order by round_number asc
  limit 1
  for share;

  if not found then
    raise exception 'ROUND_NOT_ACTIVE';
  end if;

  if v_round.market_status <> 'OPEN' then
    if v_round.market_status = 'PAUSED' then
      raise exception 'TRADING_PAUSED';
    end if;
    raise exception 'MARKET_CLOSED';
  end if;

  if now() >= v_round.ends_at then
    raise exception 'ROUND_NOT_ACTIVE';
  end if;

  -- FOR SHARE: apply_price_changes takes the same rows FOR UPDATE and therefore
  -- serializes at the price-read point; concurrent same-stock trades stay parallel.
  select * into v_quote
  from public.market_quotes
  where competition_run_id = v_run_id and stock_id = p_stock_id
  for share;

  if not found then
    raise exception 'INVALID_PRICE';
  end if;

  v_total := p_quantity * v_quote.current_price;

  -- Lock financial rows in a FIXED order: team_balances -> holdings (both sides).
  -- BUY used to lock balance then holding, SELL holding then balance — an
  -- AB-BA deadlock under concurrent same-team trades. The team balance row is
  -- the per-team serialization point; acquire it first, always.
  select cash into v_cash
  from public.team_balances
  where competition_run_id = v_run_id and team_id = v_team_id
  for update;

  if v_cash is null then
    raise exception 'TEAM_NOT_FOUND';
  end if;

  if p_side = 'BUY' then
    if v_cash < v_total then
      raise exception 'INSUFFICIENT_CASH';
    end if;

    update public.team_balances
      set cash = cash - v_total
      where competition_run_id = v_run_id and team_id = v_team_id;

    select * into v_holding
    from public.holdings
    where competition_run_id = v_run_id and team_id = v_team_id and stock_id = p_stock_id
    for update;

    if found then
      update public.holdings
      set quantity = v_holding.quantity + p_quantity,
          average_buy_price = round(((v_holding.quantity * v_holding.average_buy_price) + (p_quantity * v_quote.current_price))::numeric / (v_holding.quantity + p_quantity))::bigint
      where id = v_holding.id;
    else
      insert into public.holdings (competition_run_id, team_id, stock_id, quantity, average_buy_price)
      values (v_run_id, v_team_id, p_stock_id, p_quantity, v_quote.current_price);
    end if;

    insert into public.trades (
      competition_run_id,
      team_id,
      stock_id,
      side,
      quantity,
      execution_price,
      gross_value,
      created_by,
      idempotency_key
    )
    values (
      v_run_id,
      v_team_id,
      p_stock_id,
      'BUY',
      p_quantity,
      v_quote.current_price,
      v_total,
      auth.uid(),
      p_idempotency_key
    )
    returning id into v_trade_id;

    insert into public.cash_ledger (
      competition_run_id,
      team_id,
      type,
      amount,
      reference_id,
      created_by
    )
    values (v_run_id, v_team_id, 'TRADE_BUY', -v_total, v_trade_id, auth.uid());
  else
    select * into v_holding
    from public.holdings
    where competition_run_id = v_run_id and team_id = v_team_id and stock_id = p_stock_id
    for update;

    if not found or v_holding.quantity < p_quantity then
      raise exception 'INSUFFICIENT_HOLDINGS';
    end if;

    update public.team_balances
      set cash = cash + v_total
      where competition_run_id = v_run_id and team_id = v_team_id;

    if v_holding.quantity = p_quantity then
      delete from public.holdings where id = v_holding.id;
    else
      update public.holdings
      set quantity = v_holding.quantity - p_quantity
      where id = v_holding.id;
    end if;

    insert into public.trades (
      competition_run_id,
      team_id,
      stock_id,
      side,
      quantity,
      execution_price,
      gross_value,
      created_by,
      idempotency_key
    )
    values (
      v_run_id,
      v_team_id,
      p_stock_id,
      'SELL',
      p_quantity,
      v_quote.current_price,
      v_total,
      auth.uid(),
      p_idempotency_key
    )
    returning id into v_trade_id;

    insert into public.cash_ledger (
      competition_run_id,
      team_id,
      type,
      amount,
      reference_id,
      created_by
    )
    values (v_run_id, v_team_id, 'TRADE_SELL', v_total, v_trade_id, auth.uid());
  end if;

  perform public.record_competition_event(
    v_run_id,
    'TRADE_EXECUTED',
    jsonb_build_object('tradeId', v_trade_id::text, 'side', p_side, 'stockId', p_stock_id::text, 'quantity', p_quantity, 'pricePaise', v_quote.current_price, 'grossValuePaise', v_total),
    v_team_id,
    v_trade_id,
    v_role
  );

  v_response := jsonb_build_object(
    'success', true,
    'message', 'Success',
    'tradeId', v_trade_id::text,
    'side', p_side,
    'stockId', p_stock_id::text,
    'quantity', p_quantity,
    'executionPricePaise', v_quote.current_price,
    'grossValuePaise', v_total
  );

  perform public.complete_idempotency_key('trade', p_idempotency_key, v_response);
  return v_response;
end;
$$;

revoke all on function public.execute_trade(text, uuid, bigint, uuid) from public;
grant execute on function public.execute_trade(text, uuid, bigint, uuid) to authenticated;

create or replace function public.apply_price_changes(
  p_batch_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run_id uuid;
  v_batch public.price_change_batches;
  v_change record;
  v_quote public.market_quotes;
  v_count int := 0;
  v_response jsonb;
  v_existing public.idempotency_keys;
begin
  if public.current_role() is distinct from 'admin' then
    raise exception 'FORBIDDEN';
  end if;

  v_run_id := public.current_run_or_raise();
  v_existing := public.claim_idempotency_key('apply_price_changes', p_idempotency_key, v_run_id);
  if v_existing.response is not null then
    return v_existing.response;
  end if;

  select * into v_batch
  from public.price_change_batches
  where id = p_batch_id and competition_run_id = v_run_id
  for update;

  if not found then
    raise exception 'PRICE_BATCH_NOT_FOUND';
  end if;

  if v_batch.status = 'APPLIED' then
    raise exception 'PRICE_BATCH_ALREADY_APPLIED';
  end if;

  if v_batch.status <> 'PENDING' then
    raise exception 'PRICE_BATCH_ALREADY_APPLIED';
  end if;

  for v_change in
    select p.stock_id, p.new_price
    from public.pending_price_changes p
    where p.batch_id = p_batch_id
    order by p.stock_id
  loop
    if v_change.new_price is null or v_change.new_price <= 0 then
      raise exception 'INVALID_PRICE';
    end if;

    select * into v_quote
    from public.market_quotes
    where competition_run_id = v_run_id and stock_id = v_change.stock_id
    for update;

    if not found then
      raise exception 'INVALID_PRICE';
    end if;

    update public.market_quotes
    set previous_price = v_quote.current_price,
        current_price = v_change.new_price,
        high = greatest(coalesce(v_quote.high, v_quote.current_price), v_change.new_price),
        low = least(coalesce(v_quote.low, v_quote.current_price), v_change.new_price)
    where competition_run_id = v_run_id and stock_id = v_change.stock_id;

    v_count := v_count + 1;
  end loop;

  update public.price_change_batches
    set status = 'APPLIED', applied_at = now(), applied_by = auth.uid()
    where id = p_batch_id;

  perform public.record_competition_event(
    v_run_id,
    'PRICE_BATCH_APPLIED',
    jsonb_build_object('batchId', p_batch_id::text, 'count', v_count),
    null,
    p_batch_id,
    'admin'
  );

  v_response := jsonb_build_object('success', true, 'batchId', p_batch_id::text, 'count', v_count);
  perform public.complete_idempotency_key('apply_price_changes', p_idempotency_key, v_response);
  return v_response;
end;
$$;

revoke all on function public.apply_price_changes(uuid, uuid) from public;
grant execute on function public.apply_price_changes(uuid, uuid) to authenticated;

-- pay_dividend was moved to 0014_fn_dividends.sql (single source of truth).

-- Admin controls (credit_cash, debit_cash, start_round, end_round,
-- open_market, close_market, pause_trading, resume_trading,
-- new_competition_run) were moved to 0015_fn_admin.sql (single source
-- of truth).

create or replace function public.play_video(p_video_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run_id uuid;
begin
  if public.current_role() is distinct from 'admin' then
    raise exception 'FORBIDDEN';
  end if;

  v_run_id := public.current_run_or_raise();

  if not exists (
    select 1 from public.videos
    where id = p_video_id and competition_run_id = v_run_id
  ) then
    raise exception 'FORBIDDEN';
  end if;

  update public.competition_runs
  set active_video_id = p_video_id,
      video_started_at = now()
  where id = v_run_id;

  perform public.record_competition_event(v_run_id, 'VIDEO_PLAYED', jsonb_build_object('videoId', p_video_id::text, 'serverTimestamp', now()), null, p_video_id, 'admin');
  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.play_video(uuid) from public;
grant execute on function public.play_video(uuid) to authenticated;

create or replace function public.stop_video()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run_id uuid;
begin
  if public.current_role() is distinct from 'admin' then
    raise exception 'FORBIDDEN';
  end if;

  v_run_id := public.current_run_or_raise();

  update public.competition_runs
  set active_video_id = null,
      video_started_at = null
  where id = v_run_id;

  perform public.record_competition_event(v_run_id, 'VIDEO_STOPPED', jsonb_build_object('serverTimestamp', now()), null, v_run_id, 'admin');
  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.stop_video() from public;
grant execute on function public.stop_video() to authenticated;

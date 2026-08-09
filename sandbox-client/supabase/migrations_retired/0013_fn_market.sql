-- 0013_fn_market.sql
-- Admin price editing RPCs (AGENTS.md §16-18, architecture Part G.2):
--   create_price_batch()                     admin   -> new PENDING batch
--   upsert_pending_price(batch, stock, px)   admin   -> add/update a pending change
--   discard_batch(batch)                     admin   -> mark a PENDING batch DISCARDED
--   apply_price_changes(batch, idem_key)     admin   -> atomic quotes update (idempotent)
--
-- Participants must never see pending prices (AGENTS.md §16): these functions
-- are admin-only (require_admin), and the tables carry admin-only SELECT
-- policies — participants get 0 rows from every path.
--
-- apply_price_changes atomicity & locking:
--   1. require_admin -> active run -> idempotency claim (scope 'price_batch')
--   2. batch row FOR UPDATE   (serializes concurrent applies of the same batch;
--      status must be PENDING else PRICE_BATCH_ALREADY_APPLIED)
--   3. market_quotes rows FOR UPDATE in stock_id order — a concurrent
--      execute_trade holds at most ONE quote FOR SHARE (0012), so trades and
--      applies serialize at the price-read point with no deadlock cycle, and
--      participants never observe a torn price or a partially applied batch.
--   4. previous = old current; current = new; high/low updated; batch APPLIED;
--      PRICE_BATCH_APPLIED audit event; idempotency DONE (all one transaction).
--
-- Applying an EMPTY batch is allowed as a no-op (appliedCount = 0) — keep the
-- error-code set canonical.
--
-- Error codes: FORBIDDEN, ROUND_NOT_ACTIVE, PRICE_BATCH_NOT_FOUND,
-- PRICE_BATCH_ALREADY_APPLIED, INVALID_PRICE, STOCK_NOT_FOUND (documented
-- extension), DUPLICATE_REQUEST, INVALID_REQUEST (documented extension).
-- Money is BIGINT paise.

-- ---------------------------------------------------------------------------
-- create_price_batch
-- ---------------------------------------------------------------------------

create or replace function public.create_price_batch()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run_id uuid;
  v_batch_id uuid;
begin
  perform public.require_admin();

  v_run_id := public.current_run_id();
  if v_run_id is null then
    perform public.app_error('ROUND_NOT_ACTIVE', 'The competition is not active.');
  end if;

  insert into public.price_change_batches (competition_run_id, created_by)
  values (v_run_id, auth.uid())
  returning id into v_batch_id;

  insert into public.competition_events (
    competition_run_id, event_type, actor_id, actor_role, entity_id, metadata
  ) values (
    v_run_id, 'PRICE_BATCH_CREATED', auth.uid(), 'admin', v_batch_id,
    jsonb_build_object('batchId', v_batch_id)
  );

  return jsonb_build_object('batchId', v_batch_id, 'status', 'PENDING', 'competitionRunId', v_run_id);
end;
$$;

revoke all on function public.create_price_batch() from public;
grant execute on function public.create_price_batch() to authenticated;

-- ---------------------------------------------------------------------------
-- upsert_pending_price
-- ---------------------------------------------------------------------------

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
  v_run_id uuid;
  v_batch public.price_change_batches%rowtype;
  v_has_quote boolean;
  v_pending_id uuid;
begin
  perform public.require_admin();

  if p_new_price is null or p_new_price < 1 then
    perform public.app_error('INVALID_PRICE', 'New price must be greater than zero.');
  end if;

  v_run_id := public.current_run_id();
  if v_run_id is null then
    perform public.app_error('ROUND_NOT_ACTIVE', 'The competition is not active.');
  end if;

  select * into v_batch
  from public.price_change_batches
  where id = p_batch_id
  for update;

  if not found then
    perform public.app_error('PRICE_BATCH_NOT_FOUND', 'No price batch with that id exists.');
  end if;

  if v_batch.status <> 'PENDING' then
    perform public.app_error('PRICE_BATCH_ALREADY_APPLIED',
      case when v_batch.status = 'APPLIED'
           then 'This batch has already been applied.'
           else 'This batch has been discarded.' end);
  end if;

  if v_batch.competition_run_id <> v_run_id then
    perform public.app_error('PRICE_BATCH_NOT_FOUND', 'This batch does not belong to the active run.');
  end if;

  -- The stock must be trading in the batch's run — otherwise apply would fail
  -- mid-batch and the whole transaction would roll back (no partial apply).
  select exists (
    select 1 from public.market_quotes
    where competition_run_id = v_batch.competition_run_id and stock_id = p_stock_id
  ) into v_has_quote;

  if not v_has_quote then
    perform public.app_error('STOCK_NOT_FOUND', 'This stock is not trading in the batch run.');
  end if;

  insert into public.pending_price_changes (batch_id, stock_id, new_price)
  values (p_batch_id, p_stock_id, p_new_price)
  on conflict (batch_id, stock_id)
  do update set new_price = excluded.new_price
  returning id into v_pending_id;

  return jsonb_build_object(
    'pendingPriceId', v_pending_id,
    'batchId', p_batch_id,
    'stockId', p_stock_id,
    'newPricePaise', p_new_price
  );
end;
$$;

revoke all on function public.upsert_pending_price(uuid, uuid, bigint) from public;
grant execute on function public.upsert_pending_price(uuid, uuid, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- discard_batch
-- ---------------------------------------------------------------------------

create or replace function public.discard_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run_id uuid;
  v_batch public.price_change_batches%rowtype;
begin
  perform public.require_admin();

  v_run_id := public.current_run_id();
  if v_run_id is null then
    perform public.app_error('ROUND_NOT_ACTIVE', 'The competition is not active.');
  end if;

  select * into v_batch
  from public.price_change_batches
  where id = p_batch_id
  for update;

  if not found then
    perform public.app_error('PRICE_BATCH_NOT_FOUND', 'No price batch with that id exists.');
  end if;

  if v_batch.status <> 'PENDING' then
    perform public.app_error('PRICE_BATCH_ALREADY_APPLIED',
      case when v_batch.status = 'APPLIED'
           then 'This batch has already been applied.'
           else 'This batch has already been discarded.' end);
  end if;

  if v_batch.competition_run_id <> v_run_id then
    perform public.app_error('PRICE_BATCH_NOT_FOUND', 'This batch does not belong to the active run.');
  end if;

  update public.price_change_batches
  set status = 'DISCARDED'
  where id = p_batch_id;

  return jsonb_build_object('batchId', p_batch_id, 'status', 'DISCARDED');
end;
$$;

revoke all on function public.discard_batch(uuid) from public;
grant execute on function public.discard_batch(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- apply_price_changes
-- ---------------------------------------------------------------------------

create or replace function public.apply_price_changes(p_batch_id uuid, p_idem_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run_id uuid;
  v_batch public.price_change_batches%rowtype;
  v_pending record;
  v_quote public.market_quotes%rowtype;
  v_stored jsonb;
  v_result jsonb;
  v_count int := 0;
  v_changes jsonb := '[]'::jsonb;
begin
  perform public.require_admin();

  v_run_id := public.current_run_id();
  if v_run_id is null then
    perform public.app_error('ROUND_NOT_ACTIVE', 'The competition is not active.');
  end if;

  -- validate the request BEFORE claiming the key or acquiring any locks
  -- (a NULL key would bypass the UNIQUE(scope,key) dedupe and pollute the
  -- idempotency table)
  if p_idem_key is null then
    perform public.app_error('INVALID_REQUEST', 'An idempotency key is required.');
  end if;

  -- idempotency fast path: an already-completed request returns its result
  select response into v_stored
  from public.idempotency_keys
  where scope = 'price_batch' and key = p_idem_key and status = 'DONE';
  if v_stored is not null then
    return v_stored;
  end if;

  -- claim the request key (concurrent duplicate blocks, then returns the
  -- winner's stored result)
  begin
    insert into public.idempotency_keys (scope, key, competition_run_id, actor_id, status)
    values ('price_batch', p_idem_key, v_run_id, auth.uid(), 'IN_PROGRESS');
  exception
    when unique_violation then
      select response into v_stored
      from public.idempotency_keys
      where scope = 'price_batch' and key = p_idem_key;
      if v_stored is not null then
        return v_stored;
      end if;
      perform public.app_error('DUPLICATE_REQUEST', 'This request is already being processed.');
  end;

  -- lock the batch; only a PENDING batch of the active run may be applied
  select * into v_batch
  from public.price_change_batches
  where id = p_batch_id
  for update;

  if not found then
    perform public.app_error('PRICE_BATCH_NOT_FOUND', 'No price batch with that id exists.');
  end if;

  if v_batch.status <> 'PENDING' then
    perform public.app_error('PRICE_BATCH_ALREADY_APPLIED',
      case when v_batch.status = 'APPLIED'
           then 'This batch has already been applied.'
           else 'This batch has been discarded.' end);
  end if;

  if v_batch.competition_run_id <> v_run_id then
    perform public.app_error('PRICE_BATCH_NOT_FOUND', 'This batch does not belong to the active run.');
  end if;

  -- apply every pending change: quotes FOR UPDATE in stock_id order (fixed
  -- lock order, no deadlock with execute_trade), all-or-nothing
  for v_pending in
    select p.stock_id, p.new_price
    from public.pending_price_changes p
    where p.batch_id = p_batch_id
    order by p.stock_id
  loop
    if v_pending.new_price < 1 then
      perform public.app_error('INVALID_PRICE', 'Every pending price must be greater than zero.');
    end if;

    select * into v_quote
    from public.market_quotes
    where competition_run_id = v_run_id and stock_id = v_pending.stock_id
    for update;

    if not found then
      perform public.app_error('STOCK_NOT_FOUND',
        'A pending change references a stock that is not trading in this run.');
    end if;

    update public.market_quotes
    set current_price = v_pending.new_price,
        previous_price = v_quote.current_price,
        high = case
          when v_quote.high is null then v_pending.new_price
          else greatest(v_quote.high, v_pending.new_price)
        end,
        low = case
          when v_quote.low is null then v_pending.new_price
          else least(v_quote.low, v_pending.new_price)
        end
    where id = v_quote.id;

    v_changes := v_changes || jsonb_build_object(
      'stockId', v_pending.stock_id,
      'previousPricePaise', v_quote.current_price,
      'newPricePaise', v_pending.new_price
    );
    v_count := v_count + 1;
  end loop;

  -- an empty batch applies as a no-op (appliedCount = 0)
  update public.price_change_batches
  set status = 'APPLIED', applied_at = now(), applied_by = auth.uid()
  where id = p_batch_id;

  insert into public.competition_events (
    competition_run_id, event_type, actor_id, actor_role, entity_id, metadata
  ) values (
    v_run_id, 'PRICE_BATCH_APPLIED', auth.uid(), 'admin', p_batch_id,
    jsonb_build_object('batchId', p_batch_id, 'appliedCount', v_count)
  );

  v_result := jsonb_build_object(
    'batchId', p_batch_id,
    'status', 'APPLIED',
    'appliedCount', v_count,
    'changes', v_changes
  );

  update public.idempotency_keys
  set status = 'DONE', response = v_result
  where scope = 'price_batch' and key = p_idem_key;

  return v_result;
end;
$$;

revoke all on function public.apply_price_changes(uuid, uuid) from public;
grant execute on function public.apply_price_changes(uuid, uuid) to authenticated;

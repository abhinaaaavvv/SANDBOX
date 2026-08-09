-- 0012_fn_trading.sql
-- execute_trade: the single authoritative trade path (AGENTS.md §11, §12).
--
-- Atomicity: one transaction; any failure rolls back the entire operation
-- (cash, holdings, trades, ledger, event, idempotency claim).
--
-- Locking (fixed order, deadlock-free — Part G.1):
--   1. competition_runs  FOR SHARE  (serializes vs reset/new run)
--   2. rounds            FOR SHARE  (serializes vs end_round; round expiry
--                                    re-checked inside the txn, so a browser
--                                    timer can never extend trading)
--   3. market_quotes     FOR SHARE  (authoritative price — never the client's;
--                                    apply_price_changes takes the same rows
--                                    FOR UPDATE, so no torn prices)
--   4. team_balances     FOR UPDATE (serializes every financial op per team)
--   5. holdings          FOR UPDATE (always after balances — fixed order)
-- apply_price_changes acquires only 1–3; pay_dividend only 1,4,5 (by team_id).
-- No operation acquires these in a conflicting order, so no deadlock cycles.
--
-- Idempotency (Part G.4): claim-first. The key is INSERTed at the start of the
-- work; UNIQUE(scope,key) makes a concurrent duplicate block on the index until
-- the winner commits, then raise unique_violation -> the loser reads and
-- returns the winner's stored response. A completed request is short-circuited
-- on entry. Reusing a key with different parameters returns the original
-- result (key == request identity).
--
-- Error codes (AGENTS.md §30 + documented extensions):
--   canonical: AUTH_REQUIRED, FORBIDDEN, TEAM_NOT_FOUND, ROUND_NOT_ACTIVE,
--              MARKET_CLOSED, TRADING_PAUSED, ROUND_ENDED, INVALID_QUANTITY,
--              INSUFFICIENT_CASH, INSUFFICIENT_HOLDINGS, DUPLICATE_REQUEST
--   extensions (not in the §30 list, used where the list has no fit):
--              INVALID_REQUEST (missing stock / idempotency key)
--              INVALID_SIDE    (side not BUY/SELL)
--              STOCK_NOT_FOUND (no quote for stock in the active run)
--
-- Money: all amounts are BIGINT paise (₹1 = 100). Returned as *Paise fields;
-- the application layer converts for display.

create or replace function public.execute_trade(
  p_side text,
  p_stock_id uuid,
  p_quantity bigint,
  p_idem_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team_id uuid;
  v_run_id uuid;
  v_run public.competition_runs%rowtype;
  v_round public.rounds%rowtype;
  v_quote public.market_quotes%rowtype;
  v_balance public.team_balances%rowtype;
  v_holding public.holdings%rowtype;
  v_stored jsonb;
  v_gross bigint;
  v_new_cash bigint;
  v_new_qty bigint;
  v_new_avg bigint;
  v_trade_id uuid;
  v_result jsonb;
  v_last_round_status text;
begin
  -- 1. authenticate + resolve team from identity (never from client input)
  perform public.require_authenticated();
  v_team_id := public.team_of(auth.uid());
  if v_team_id is null then
    perform public.app_error('TEAM_NOT_FOUND', 'Your account is not linked to a team.');
  end if;

  -- 2. resolve the active run
  v_run_id := public.current_run_id();
  if v_run_id is null then
    perform public.app_error('ROUND_NOT_ACTIVE', 'The competition is not active.');
  end if;

  -- 3. validate the request BEFORE claiming the key or acquiring any locks
  if p_stock_id is null or p_idem_key is null then
    perform public.app_error('INVALID_REQUEST', 'Stock and idempotency key are required.');
  end if;

  if p_side is null or p_side not in ('BUY', 'SELL') then
    perform public.app_error('INVALID_SIDE', 'Side must be BUY or SELL.');
  end if;

  if p_quantity is null or p_quantity < 1 then
    perform public.app_error('INVALID_QUANTITY', 'Quantity must be a positive integer.');
  end if;

  -- 4. idempotency fast path: an already-completed request returns its result
  select response into v_stored
  from public.idempotency_keys
  where scope = 'trade' and key = p_idem_key and status = 'DONE';
  if v_stored is not null then
    return v_stored;
  end if;

  -- 5. claim the request key; a concurrent duplicate blocks here on the
  --    unique index and, once the winner commits, returns its stored result
  begin
    insert into public.idempotency_keys (scope, key, competition_run_id, actor_id, status)
    values ('trade', p_idem_key, v_run_id, auth.uid(), 'IN_PROGRESS');
  exception
    when unique_violation then
      select response into v_stored
      from public.idempotency_keys
      where scope = 'trade' and key = p_idem_key;
      if v_stored is not null then
        return v_stored;
      end if;
      perform public.app_error('DUPLICATE_REQUEST', 'This request is already being processed.');
  end;

  -- 6. lock the run + current round (FOR SHARE)
  select * into v_run
  from public.competition_runs
  where id = v_run_id
  for share;

  if not found or v_run.status <> 'ACTIVE' then
    perform public.app_error('ROUND_NOT_ACTIVE', 'The competition is not active.');
  end if;

  -- Select the ACTIVE round (rounds 1..3 exist for the run; exactly one is
  -- ACTIVE at a time). If none is active, classify via the most advanced
  -- round: all rounds done -> ROUND_ENDED, otherwise not started yet.
  select * into v_round
  from public.rounds
  where competition_run_id = v_run_id and status = 'ACTIVE'
  limit 1
  for share;

  if not found then
    select status into v_last_round_status
    from public.rounds
    where competition_run_id = v_run_id
    order by round_number desc
    limit 1;
    if found and v_last_round_status = 'ENDED' then
      perform public.app_error('ROUND_ENDED', 'All rounds of the current run have ended.');
    end if;
    perform public.app_error('ROUND_NOT_ACTIVE', 'The current round has not started yet.');
  end if;

  -- Authoritative expiry: an ACTIVE round whose ends_at has passed is closed,
  -- even if a reconciliation job has not yet flipped its status.
  if v_round.ends_at is not null and now() >= v_round.ends_at then
    perform public.app_error('ROUND_ENDED', 'The current round has ended.');
  end if;

  if v_round.market_status = 'CLOSED' then
    perform public.app_error('MARKET_CLOSED', 'The market is closed.');
  end if;

  if v_round.market_status = 'PAUSED' then
    perform public.app_error('TRADING_PAUSED', 'Trading is paused.');
  end if;

  -- 7. authoritative execution price (never the client's)
  select * into v_quote
  from public.market_quotes
  where competition_run_id = v_run_id and stock_id = p_stock_id
  for share;

  if not found then
    perform public.app_error('STOCK_NOT_FOUND', 'This stock is not trading in the active market.');
  end if;

  v_gross := p_quantity * v_quote.current_price;

  -- 8. lock financial rows in a FIXED order: balances -> holdings
  select * into v_balance
  from public.team_balances
  where competition_run_id = v_run_id and team_id = v_team_id
  for update;

  if not found then
    perform public.app_error('INSUFFICIENT_CASH', 'No cash balance has been initialized for your team.');
  end if;

  select * into v_holding
  from public.holdings
  where competition_run_id = v_run_id and team_id = v_team_id and stock_id = p_stock_id
  for update;

  if p_side = 'BUY' then
    if v_balance.cash < v_gross then
      perform public.app_error('INSUFFICIENT_CASH', 'You do not have enough cash for this trade.');
    end if;
    v_new_cash := v_balance.cash - v_gross;

    if found then
      v_new_qty := v_holding.quantity + p_quantity;
      v_new_avg := public.round_div(
        v_holding.quantity * v_holding.average_buy_price + v_gross,
        v_new_qty
      );
      update public.holdings
      set quantity = v_new_qty, average_buy_price = v_new_avg
      where id = v_holding.id;
    else
      v_new_qty := p_quantity;
      v_new_avg := v_quote.current_price;
      insert into public.holdings (competition_run_id, team_id, stock_id, quantity, average_buy_price)
      values (v_run_id, v_team_id, p_stock_id, p_quantity, v_quote.current_price);
    end if;
  else
    if not found then
      perform public.app_error('INSUFFICIENT_HOLDINGS', 'You do not hold this stock.');
    end if;
    if v_holding.quantity < p_quantity then
      perform public.app_error('INSUFFICIENT_HOLDINGS', 'You do not hold enough shares to sell.');
    end if;
    v_new_cash := v_balance.cash + v_gross;
    v_new_qty := v_holding.quantity - p_quantity;
    v_new_avg := v_holding.average_buy_price;
    if v_new_qty = 0 then
      delete from public.holdings where id = v_holding.id;
    else
      update public.holdings set quantity = v_new_qty where id = v_holding.id;
    end if;
  end if;

  -- 10. commit the money movement
  update public.team_balances
  set cash = v_new_cash
  where competition_run_id = v_run_id and team_id = v_team_id;

  -- 11. immutable records + audit event (all in the same transaction)
  insert into public.trades (
    competition_run_id, team_id, stock_id, side, quantity,
    execution_price, gross_value, created_by, idempotency_key
  ) values (
    v_run_id, v_team_id, p_stock_id, p_side, p_quantity,
    v_quote.current_price, v_gross, auth.uid(), p_idem_key
  )
  returning id into v_trade_id;

  insert into public.cash_ledger (
    competition_run_id, team_id, type, amount, reference_id, note, created_by
  ) values (
    v_run_id, v_team_id,
    case when p_side = 'BUY' then 'TRADE_BUY' else 'TRADE_SELL' end,
    case when p_side = 'BUY' then -v_gross else v_gross end,
    v_trade_id,
    'Trade ' || p_side || ' ' || p_quantity || ' @ ' || v_quote.current_price,
    auth.uid()
  );

  insert into public.competition_events (
    competition_run_id, event_type, actor_id, actor_role, team_id, entity_id, metadata
  ) values (
    v_run_id, 'TRADE_EXECUTED', auth.uid(), 'participant', v_team_id, v_trade_id,
    jsonb_build_object(
      'side', p_side,
      'stockId', p_stock_id,
      'quantity', p_quantity,
      'executionPricePaise', v_quote.current_price,
      'grossValuePaise', v_gross
    )
  );

  -- 12. finalize the idempotency record (atomic with the trade)
  v_result := jsonb_build_object(
    'tradeId', v_trade_id,
    'side', p_side,
    'stockId', p_stock_id,
    'quantity', p_quantity,
    'executionPricePaise', v_quote.current_price,
    'grossValuePaise', v_gross,
    'cashPaise', v_new_cash,
    'holding', case
      when v_new_qty > 0 then
        jsonb_build_object('quantity', v_new_qty, 'averageBuyPricePaise', v_new_avg)
      else null
    end
  );

  update public.idempotency_keys
  set status = 'DONE', response = v_result
  where scope = 'trade' and key = p_idem_key;

  return v_result;
end;
$$;

revoke all on function public.execute_trade(text, uuid, bigint, uuid) from public;
grant execute on function public.execute_trade(text, uuid, bigint, uuid) to authenticated;

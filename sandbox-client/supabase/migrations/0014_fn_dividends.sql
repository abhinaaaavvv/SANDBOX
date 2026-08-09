-- 0014_fn_dividends.sql
-- pay_dividend: declare one dividend event and atomically pay every holder.
--
-- Extracted from 0011_domain_rpcs.sql into its own migration so the dividends
-- RPC is independently reviewable (0011 now documents this move). Depends on
-- helpers from 0010/0011 (current_role, current_run_or_raise,
-- claim_idempotency_key, complete_idempotency_key, record_competition_event).
-- Behavior is unchanged and fully validated:
--   * admin-only (FORBIDDEN), current-run scoped
--   * claim-first idempotency: duplicate key -> identical stored result, no
--     double payout (dividend_payments.UNIQUE(dividend_id, team_id) is the
--     schema-level backstop)
--   * one transaction: insert dividend -> per-holder loop (atomic
--     cash = cash + payout, dividend_payments row, cash_ledger DIVIDEND
--     entry) -> DIVIDEND_PAID event -> idempotency completion
--   * fail-closed: missing team_balances row raises BALANCE_NOT_FOUND and
--     rolls back the entire dividend (no silent invariant break)
--   * NULL key -> INVALID_REQUEST (mirrors execute_trade's guard)
-- Money convention (AGENTS.md §6): BIGINT paise (₹1 = 100).

create or replace function public.pay_dividend(
  p_stock_id uuid,
  p_amount_per_share bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run_id uuid;
  v_dividend_id uuid;
  v_team_id uuid;
  v_qty bigint;
  v_payout bigint;
  v_count int := 0;
  v_response jsonb;
  v_existing public.idempotency_keys;
begin
  if public.current_role() is distinct from 'admin' then
    raise exception 'FORBIDDEN';
  end if;

  if p_amount_per_share is null or p_amount_per_share <= 0 then
    raise exception 'INVALID_PRICE';
  end if;

  if p_idempotency_key is null then
    -- a NULL key would let duplicate requests re-pay the dividend
    raise exception 'INVALID_REQUEST';
  end if;

  v_run_id := public.current_run_or_raise();
  v_existing := public.claim_idempotency_key('pay_dividend', p_idempotency_key, v_run_id);
  if v_existing.response is not null then
    return v_existing.response;
  end if;

  if not exists (
    select 1 from public.market_quotes
    where competition_run_id = v_run_id and stock_id = p_stock_id
  ) then
    raise exception 'INVALID_PRICE';
  end if;

  insert into public.dividends (competition_run_id, stock_id, amount_per_share, declared_by)
  values (v_run_id, p_stock_id, p_amount_per_share, auth.uid())
  returning id into v_dividend_id;

  for v_team_id, v_qty in
    select h.team_id, h.quantity
    from public.holdings h
    where h.competition_run_id = v_run_id and h.stock_id = p_stock_id and h.quantity > 0
    order by h.team_id
  loop
    v_payout := v_qty * p_amount_per_share;

    update public.team_balances
      set cash = cash + v_payout
      where competition_run_id = v_run_id and team_id = v_team_id;

    if not found then
      -- a holder without a balance row would break the balance = ledger
      -- invariant (payment recorded, credit silently lost); fail closed
      raise exception 'BALANCE_NOT_FOUND';
    end if;

    insert into public.dividend_payments (dividend_id, team_id, stock_id, quantity, amount_paid)
    values (v_dividend_id, v_team_id, p_stock_id, v_qty, v_payout);

    insert into public.cash_ledger (
      competition_run_id,
      team_id,
      type,
      amount,
      reference_id,
      created_by
    )
    values (v_run_id, v_team_id, 'DIVIDEND', v_payout, v_dividend_id, auth.uid());

    v_count := v_count + 1;
  end loop;

  perform public.record_competition_event(
    v_run_id,
    'DIVIDEND_PAID',
    jsonb_build_object('dividendId', v_dividend_id::text, 'stockId', p_stock_id::text, 'amountPerSharePaise', p_amount_per_share, 'recipients', v_count),
    null,
    v_dividend_id,
    'admin'
  );

  v_response := jsonb_build_object('success', true, 'dividendId', v_dividend_id::text, 'recipients', v_count);
  perform public.complete_idempotency_key('pay_dividend', p_idempotency_key, v_response);
  return v_response;
end;
$$;

revoke all on function public.pay_dividend(uuid, bigint, uuid) from public;
grant execute on function public.pay_dividend(uuid, bigint, uuid) to authenticated;

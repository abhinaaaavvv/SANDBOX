-- 0012_state.sql
-- Read-side competition snapshots for participant and admin views.

create or replace function public.get_participant_state()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
stable
as $$
with run_row as (
  select r.*
  from public.competition_runs r
  where r.id = public.current_run_or_raise()
  limit 1
),
team_row as (
  select t.id as team_id, t.name as team_name
  from public.profiles p
  join public.teams t on t.id = p.team_id
  where p.id = auth.uid()
),
active_round as (
  select r.*
  from public.rounds r
  where r.competition_run_id = (select id from run_row)
    and r.status = 'ACTIVE'
  order by r.round_number asc
  limit 1
),
quotes as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id::text,
        'symbol', s.symbol,
        'name', s.company_name,
        'sector', coalesce(s.sector, ''),
        'currentPrice', (mq.current_price / 100),
        'previousPrice', (mq.previous_price / 100),
        'change', ((mq.current_price - mq.previous_price) / 100),
        'changePercent', case when mq.previous_price > 0 then round((((mq.current_price - mq.previous_price)::numeric / mq.previous_price) * 100), 2) else 0 end,
        'high', (coalesce(mq.high, mq.current_price) / 100),
        'low', (coalesce(mq.low, mq.current_price) / 100),
        'volume', mq.volume
      )
      order by s.symbol
    ),
    '[]'::jsonb
  ) as payload
  from public.market_quotes mq
  join public.stocks s on s.id = mq.stock_id
  where mq.competition_run_id = (select id from run_row)
),
holdings as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'stockId', h.stock_id::text,
        'symbol', s.symbol,
        'name', s.company_name,
        'quantity', h.quantity,
        'averageBuyPrice', (h.average_buy_price / 100),
        'currentPrice', (mq.current_price / 100),
        'totalValue', ((h.quantity * mq.current_price) / 100),
        'unrealizedPL', (((h.quantity * mq.current_price) - (h.quantity * h.average_buy_price)) / 100),
        'unrealizedPLPercent', case
          when h.average_buy_price > 0 then round(((((h.quantity * mq.current_price) - (h.quantity * h.average_buy_price))::numeric / (h.quantity * h.average_buy_price)) * 100), 2)
          else 0
        end
      )
      order by s.symbol
    ),
    '[]'::jsonb
  ) as payload
  from public.holdings h
  join public.stocks s on s.id = h.stock_id
  join public.market_quotes mq on mq.competition_run_id = h.competition_run_id and mq.stock_id = h.stock_id
  where h.competition_run_id = (select id from run_row)
    and h.team_id = (select team_id from team_row)
),
transaction_rows as (
  select * from (
    select
      t.id,
      t.created_at,
      t.stock_id,
      t.side as type,
      t.quantity,
      t.execution_price as price_paise,
      t.gross_value as total_paise
    from public.trades t
    where t.competition_run_id = (select id from run_row)
      and t.team_id = (select team_id from team_row)

    union all

    select
      dp.id,
      dp.paid_at as created_at,
      dp.stock_id,
      'DIVIDEND'::text as type,
      dp.quantity,
      d.amount_per_share as price_paise,
      dp.amount_paid as total_paise
    from public.dividend_payments dp
    join public.dividends d on d.id = dp.dividend_id
    where d.competition_run_id = (select id from run_row)
      and dp.team_id = (select team_id from team_row)
  ) tx
  order by created_at desc
),
transactions as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id::text,
        'timestamp', to_char(t.created_at, 'HH24:MI:SS'),
        'symbol', s.symbol,
        'companyName', s.company_name,
        'type', t.type,
        'quantity', t.quantity,
        'price', (t.price_paise / 100),
        'total', (t.total_paise / 100)
      )
      order by t.created_at desc
    ),
    '[]'::jsonb
  ) as payload
  from transaction_rows t
  join public.stocks s on s.id = t.stock_id
),
leaderboard_rows as (
  select
    tb.team_id,
    tm.name as team_name,
    tb.cash + coalesce(sum(h.quantity * mq.current_price), 0) as portfolio_value_paise
  from public.team_balances tb
  join public.teams tm on tm.id = tb.team_id
  left join public.holdings h on h.competition_run_id = tb.competition_run_id and h.team_id = tb.team_id
  left join public.market_quotes mq on mq.competition_run_id = tb.competition_run_id and mq.stock_id = h.stock_id
  where tb.competition_run_id = (select id from run_row)
  group by tb.team_id, tm.name, tb.cash
),
leaderboard_ranked as (
  select
    l.*,
    row_number() over (order by l.portfolio_value_paise desc, l.team_id asc) as rank
  from leaderboard_rows l
),
leaderboard as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'rank', l.rank,
        'teamId', l.team_id::text,
        'teamName', l.team_name,
        'portfolioValue', (l.portfolio_value_paise / 100),
        'profitLoss', ((l.portfolio_value_paise - 10000000) / 100),
        'profitLossPercent', case when 10000000 > 0 then round((((l.portfolio_value_paise - 10000000)::numeric / 10000000) * 100), 2) else 0 end,
        'isCurrentTeam', l.team_id = (select team_id from team_row)
      )
      order by l.portfolio_value_paise desc, l.team_id asc
    ),
    '[]'::jsonb
  ) as payload
  from leaderboard_ranked l
),
videos as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', v.id::text,
        'title', v.title,
        'description', v.description,
        'url', v.storage_path,
        'durationSeconds', v.duration_seconds,
        'roundRequirement', v.round_requirement
      )
      order by v.created_at asc
    ),
    '[]'::jsonb
  ) as payload
  from public.videos v
  where v.competition_run_id = (select id from run_row)
)
select jsonb_build_object(
  'teamId', (select team_id::text from team_row),
  'teamName', (select team_name from team_row),
  'currentRound', coalesce((select round_number from active_round), 1),
  'marketStatus', coalesce((select market_status from active_round), 'NOT_STARTED'),
  'serverTimestamp', now(),
  'roundEndTimestamp', (select ends_at from active_round),
  'cash', ((select cash from public.team_balances where competition_run_id = (select id from run_row) and team_id = (select team_id from team_row)) / 100),
  'stocks', (select payload from quotes),
  'holdings', (select payload from holdings),
  'transactions', (select payload from transactions),
  'leaderboard', (select payload from leaderboard),
  'videos', (select payload from videos),
  'activeVideoId', (select active_video_id::text from run_row),
  'isVideoPlaying', (select active_video_id is not null from run_row)
);
$$;

revoke all on function public.get_participant_state() from public;
grant execute on function public.get_participant_state() to authenticated;

create or replace function public.get_admin_state()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
stable
as $$
select jsonb_build_object(
  'participantState', public.get_participant_state(),
  'pendingPriceChanges', coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'batchId', p.batch_id::text,
          'stockId', p.stock_id::text,
          'newPrice', (p.new_price / 100)
        )
        order by p.created_at asc
      )
      from public.pending_price_changes p
      join public.price_change_batches b on b.id = p.batch_id
      where b.competition_run_id = public.current_run_or_raise()
        and b.status = 'PENDING'
    ),
    '[]'::jsonb
  )
);
$$;

revoke all on function public.get_admin_state() from public;
grant execute on function public.get_admin_state() to authenticated;

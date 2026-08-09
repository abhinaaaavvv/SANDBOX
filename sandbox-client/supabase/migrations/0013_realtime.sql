-- 0013_realtime.sql
-- Replica identity settings for realtime/postgres_changes consumers.

alter table public.competition_runs replica identity full;
alter table public.rounds replica identity full;
alter table public.market_quotes replica identity full;
alter table public.team_balances replica identity full;
alter table public.holdings replica identity full;
alter table public.trades replica identity full;
alter table public.cash_ledger replica identity full;
alter table public.price_change_batches replica identity full;
alter table public.pending_price_changes replica identity full;
alter table public.dividends replica identity full;
alter table public.dividend_payments replica identity full;
alter table public.competition_events replica identity full;
alter table public.videos replica identity full;

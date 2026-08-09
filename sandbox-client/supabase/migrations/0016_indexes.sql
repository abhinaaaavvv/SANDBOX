-- 0014_indexes.sql
-- Final query-path indexes for the competition backend.

create index if not exists rounds_run_status_idx
  on public.rounds(competition_run_id, status, round_number);

create index if not exists rounds_run_market_status_idx
  on public.rounds(competition_run_id, market_status);

create index if not exists price_change_batches_run_status_idx
  on public.price_change_batches(competition_run_id, status);

create index if not exists pending_price_changes_stock_idx
  on public.pending_price_changes(stock_id);

create index if not exists dividend_payments_team_idx
  on public.dividend_payments(team_id);

create index if not exists videos_run_created_idx
  on public.videos(competition_run_id, created_at desc);

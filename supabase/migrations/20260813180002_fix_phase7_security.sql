-- ============================================================
-- Phase 7: Security & Correctness Fixes
-- ============================================================
-- Fixes:
-- 1. CRITICAL: Run-scoped RLS authorization (participation check)
-- 2. get_leaderboard() — remove team_portfolio_view dependency
-- 3. get_team_holdings() — fix company_name → name
-- 4. Idempotent trade replay — suppress duplicate notifications
-- 5. get_leaderboard() — verify run authorization
-- ============================================================

-- -----------------------------------------------------------
-- Fix 1: Run-scoped RLS authorization
-- -----------------------------------------------------------
-- CRITICAL: The old policy allowed ALL authenticated users to
-- see run-scoped notifications. A participant in Run A must not
-- receive run-scoped events for Run B.
--
-- Authorization rule:
--   User can see run:<run_id> notifications IF:
--   - User is a member of a team that participates in the run
--     (has initial capital in cash_ledger for that run), OR
--   - User is an admin

-- Drop the old permissive policy
DROP POLICY IF EXISTS "realtime_notifications_select" ON public.realtime_notifications;

-- Create the new restrictive policy
CREATE POLICY "realtime_notifications_select"
  ON public.realtime_notifications
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      -- Team-scoped events: visible only to team members
      (
        channel LIKE 'team:%'
        AND team_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.user_id = auth.uid()
            AND tm.team_id = realtime_notifications.team_id
        )
      )
      OR
      -- Run-scoped events: visible only if user participates in the run OR is admin
      (
        channel LIKE 'run:%'
        AND (
          -- Admin can see all run-scoped events
          EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
          )
          OR
          -- Participant can see run-scoped events for runs they participate in
          -- Participation = team has initial capital in cash_ledger for this run
          EXISTS (
            SELECT 1 FROM public.team_members tm
            INNER JOIN public.cash_ledger cl
              ON cl.team_id = tm.team_id
              AND cl.competition_run_id = (
                -- Extract run_id from channel: 'run:<uuid>'
                (regexp_replace(channel, '^run:', ''))::uuid
              )
              AND cl.entry_type = 'initial_capital'
            WHERE tm.user_id = auth.uid()
          )
        )
      )
    )
  );

-- -----------------------------------------------------------
-- Fix 2: get_leaderboard() — remove team_portfolio_view dependency
-- -----------------------------------------------------------
-- The original get_leaderboard() referenced public.team_portfolio_view
-- which was never created. Rewrite to compute portfolio inline
-- from authoritative sources: cash_ledger + holdings + market_quotes.
-- This is the same calculation as get_team_portfolio() but for all teams.

CREATE OR REPLACE FUNCTION public.get_leaderboard(
  p_competition_run_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_result  jsonb;
BEGIN
  -- 1. Authenticate
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: authentication required';
  END IF;

  -- 2. Authorize: user must be authorized for this competition run
  IF NOT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.user_id = v_user_id
      AND EXISTS (
        SELECT 1 FROM public.cash_ledger cl
        WHERE cl.team_id = tm.team_id
          AND cl.competition_run_id = p_competition_run_id
          AND cl.entry_type = 'initial_capital'
      )
  ) AND NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: not authorized for this competition run';
  END IF;

  -- 3. Build leaderboard from authoritative financial state
  -- Computes portfolio_value inline for each team in the run
  SELECT jsonb_agg(
    jsonb_build_object(
      'rank',                    lp.rank,
      'team_id',                 lp.team_id,
      'team_name',               lp.team_name,
      'competition_run_id',      lp.competition_run_id,
      'cash_balance_paise',      lp.cash_balance_paise,
      'holdings_value_paise',    lp.holdings_value_paise,
      'portfolio_value_paise',   lp.portfolio_value_paise,
      'initial_capital_paise',   lp.initial_capital_paise,
      'pnl_paise',               lp.pnl_paise,
      'return_basis_points',     lp.return_basis_points
    )
    ORDER BY lp.rank
  ) INTO v_result
  FROM (
    SELECT
      ROW_NUMBER() OVER (
        ORDER BY computed.portfolio_value_paise DESC, computed.team_id ASC
      )::bigint AS rank,
      computed.*
    FROM (
      SELECT
        t.id AS team_id,
        t.name AS team_name,
        p_competition_run_id AS competition_run_id,
        COALESCE(cl_sum.cash_balance, 0) AS cash_balance_paise,
        COALESCE(hv.holdings_value, 0) AS holdings_value_paise,
        COALESCE(cl_sum.cash_balance, 0) + COALESCE(hv.holdings_value, 0) AS portfolio_value_paise,
        COALESCE(ic.initial_capital, 0) AS initial_capital_paise,
        (COALESCE(cl_sum.cash_balance, 0) + COALESCE(hv.holdings_value, 0)) - COALESCE(ic.initial_capital, 0) AS pnl_paise,
        CASE
          WHEN COALESCE(ic.initial_capital, 0) = 0 THEN 0
          ELSE ((COALESCE(cl_sum.cash_balance, 0) + COALESCE(hv.holdings_value, 0)) - COALESCE(ic.initial_capital, 0)) * 10000 / ic.initial_capital
        END AS return_basis_points
      FROM public.teams t
      -- Teams that participate in this run (have initial capital)
      INNER JOIN public.cash_ledger ic
        ON ic.team_id = t.id
        AND ic.competition_run_id = p_competition_run_id
        AND ic.entry_type = 'initial_capital'
      -- Cash balance (sum of all ledger entries)
      LEFT JOIN (
        SELECT team_id, SUM(amount_paise) AS cash_balance
        FROM public.cash_ledger
        WHERE competition_run_id = p_competition_run_id
        GROUP BY team_id
      ) cl_sum ON cl_sum.team_id = t.id
      -- Holdings value (quantity × current market price)
      LEFT JOIN (
        SELECT
          h.team_id,
          SUM(h.quantity * mq.price_paise) AS holdings_value
        FROM public.holdings h
        INNER JOIN public.market_quotes mq
          ON mq.stock_id = h.stock_id
          AND mq.competition_run_id = h.competition_run_id
        WHERE h.competition_run_id = p_competition_run_id
          AND h.quantity > 0
        GROUP BY h.team_id
      ) hv ON hv.team_id = t.id
    ) computed
  ) lp;

  -- 4. Return empty array if no data
  IF v_result IS NULL THEN
    v_result := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'ok',                    true,
    'competition_run_id',    p_competition_run_id,
    'leaderboard',           v_result
  );
END;
$$;

COMMENT ON FUNCTION public.get_leaderboard(uuid)
  IS 'Returns leaderboard for a competition run. SECURITY DEFINER to show all teams. Verifies run authorization. Computes portfolio inline from cash_ledger + holdings + market_quotes (no view dependency).';

-- -----------------------------------------------------------
-- Fix 3: get_team_holdings() — fix company_name → name
-- -----------------------------------------------------------
-- The stocks table has columns: symbol, name
-- The old query referenced s.company_name which does not exist.
-- Fix to use s.name.

CREATE OR REPLACE FUNCTION public.get_team_holdings(
  p_competition_run_id uuid,
  p_team_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id   uuid;
  v_team_id   uuid;
  v_result    jsonb;
  v_missing_count int;
BEGIN
  -- 1. Authenticate
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: authentication required';
  END IF;

  -- 2. Resolve team_id
  IF p_team_id IS NULL THEN
    v_team_id := public.resolve_user_team(v_user_id, p_competition_run_id);
  ELSE
    v_team_id := p_team_id;
    -- If participant requests another team's holdings, reject
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = v_user_id AND role = 'admin'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.team_members
        WHERE user_id = v_user_id AND team_id = v_team_id
      ) THEN
        RAISE EXCEPTION 'FORBIDDEN: participants can only access their own team holdings';
      END IF;
    END IF;
  END IF;

  -- 3. CRITICAL: Check for holdings without market quotes
  SELECT COUNT(*) INTO v_missing_count
  FROM public.holdings h
  LEFT JOIN public.market_quotes mq
    ON mq.stock_id = h.stock_id
    AND mq.competition_run_id = h.competition_run_id
  WHERE h.team_id = v_team_id
    AND h.competition_run_id = p_competition_run_id
    AND h.quantity > 0
    AND mq.price_paise IS NULL;

  IF v_missing_count > 0 THEN
    RAISE EXCEPTION 'MISSING_MARKET_QUOTE: % holding(s) exist without market quotes for this competition run', v_missing_count;
  END IF;

  -- 4. Get holdings breakdown with current market prices
  SELECT jsonb_agg(
    jsonb_build_object(
      'stock_id', h.stock_id,
      'stock_symbol', s.symbol,
      'stock_name', s.name,
      'quantity', h.quantity,
      'current_price_paise', mq.price_paise,
      'market_value_paise', h.quantity * mq.price_paise
    )
  ) INTO v_result
  FROM public.holdings h
  INNER JOIN public.stocks s ON s.id = h.stock_id
  INNER JOIN public.market_quotes mq
    ON mq.stock_id = h.stock_id
    AND mq.competition_run_id = h.competition_run_id
  WHERE h.team_id = v_team_id
    AND h.competition_run_id = p_competition_run_id
    AND h.quantity > 0;

  -- 5. Return empty array if no holdings
  IF v_result IS NULL THEN
    v_result := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'team_id', v_team_id,
    'competition_run_id', p_competition_run_id,
    'holdings', v_result
  );
END;
$$;

COMMENT ON FUNCTION public.get_team_holdings(uuid, uuid)
  IS 'Returns holdings breakdown for a team. SECURITY INVOKER uses RLS on holdings. Uses s.name (correct column). Detects missing market quotes.';

-- -----------------------------------------------------------
-- Fix 4: Idempotent trade replay — suppress duplicate notifications
-- -----------------------------------------------------------
-- When a trade is replayed via idempotency, the original Phase 7
-- code sent duplicate notifications. This is not financially
-- dangerous (client only refetches) but causes unnecessary traffic.
-- Fix: skip notifications on idempotent replay.

CREATE OR REPLACE FUNCTION public.execute_trade(
  p_competition_run_id uuid,
  p_stock_id uuid,
  p_side text,
  p_quantity bigint,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     uuid;
  v_team_id     uuid;
  v_run         record;
  v_round       record;
  v_stock       record;
  v_quote       record;
  v_holding     record;
  v_cash_balance bigint;
  v_total_value  bigint;
  v_trade_id    uuid;
  v_now         timestamptz := now();
  v_idem_record record;
  v_request_hash text;
  v_lock_row    record;
  v_is_replay   boolean := false;
BEGIN
  -- 1. Authenticate
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: authentication required';
  END IF;

  -- 2. Resolve team (one team per user)
  v_team_id := public.resolve_user_team(v_user_id, p_competition_run_id);

  -- 3. Validate competition run
  SELECT * INTO v_run
  FROM public.competition_runs
  WHERE id = p_competition_run_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMPETITION_RUN_NOT_FOUND: %', p_competition_run_id;
  END IF;

  IF v_run.status <> 'active' THEN
    RAISE EXCEPTION 'INVALID_STATE: competition run status is %, expected active', v_run.status;
  END IF;

  -- 4. Validate team is participating in this run (has initial capital)
  IF NOT EXISTS (
    SELECT 1 FROM public.cash_ledger
    WHERE team_id = v_team_id
      AND competition_run_id = p_competition_run_id
      AND entry_type = 'initial_capital'
  ) THEN
    RAISE EXCEPTION 'TEAM_NOT_PARTICIPATING: team % has not been initialized for run %', v_team_id, p_competition_run_id;
  END IF;

  -- 5. Validate stock
  SELECT * INTO v_stock
  FROM public.stocks
  WHERE id = p_stock_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'STOCK_NOT_FOUND: %', p_stock_id;
  END IF;

  IF NOT v_stock.is_active THEN
    RAISE EXCEPTION 'STOCK_INACTIVE: % (%)', v_stock.symbol, p_stock_id;
  END IF;

  -- 6. Validate round state (any active round with trading enabled and market open)
  SELECT * INTO v_round
  FROM public.rounds
  WHERE competition_run_id = p_competition_run_id
    AND status = 'active'
    AND trading_status = 'enabled'
    AND market_status = 'open';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TRADING_NOT_ALLOWED: no active round with trading enabled and market open';
  END IF;

  -- 7. Validate side
  IF p_side NOT IN ('buy', 'sell') THEN
    RAISE EXCEPTION 'INVALID_SIDE: side must be buy or sell, got %', p_side;
  END IF;

  -- 8. Validate quantity
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY: quantity must be positive, got %', p_quantity;
  END IF;

  -- 9. Read authoritative market price
  SELECT * INTO v_quote
  FROM public.market_quotes
  WHERE stock_id = p_stock_id
    AND competition_run_id = p_competition_run_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_MARKET_QUOTE: stock % has no price quote for run %', v_stock.symbol, p_competition_run_id;
  END IF;

  -- 10. Calculate total value (integer arithmetic)
  v_total_value := p_quantity * v_quote.price_paise;

  -- 11. Idempotency check
  IF p_idempotency_key IS NOT NULL AND p_idempotency_key <> '' THEN
    v_request_hash := md5(p_competition_run_id::text || p_stock_id::text || p_side || p_quantity::text);

    SELECT * INTO v_idem_record
    FROM public.idempotency_keys
    WHERE team_id = v_team_id
      AND competition_run_id = p_competition_run_id
      AND operation_type = 'execute_trade'
      AND idempotency_key = p_idempotency_key;

    IF FOUND THEN
      IF v_idem_record.request_hash <> v_request_hash THEN
        RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: idempotency key % reused with different parameters', p_idempotency_key;
      END IF;

      IF v_idem_record.result_status = 'completed' THEN
        -- Return original result (trade already executed)
        -- Do NOT send notifications — this is a replay, not a new event
        v_is_replay := true;

        RETURN jsonb_build_object(
          'ok',         true,
          'trade_id',   v_idem_record.result_id,
          'message',    'Trade already executed (idempotent)',
          'idempotency_key', p_idempotency_key
        );
      ELSIF v_idem_record.result_status = 'failed' THEN
        DELETE FROM public.idempotency_keys WHERE id = v_idem_record.id;
      END IF;
    ELSE
      INSERT INTO public.idempotency_keys (team_id, competition_run_id, operation_type, idempotency_key, request_hash, result_status, created_at)
      VALUES (v_team_id, p_competition_run_id, 'execute_trade', p_idempotency_key, v_request_hash, 'pending', v_now);
    END IF;
  END IF;

  -- 12. CRITICAL: Lock the initial_capital row to serialize all financial operations
  SELECT * INTO v_lock_row
  FROM public.cash_ledger
  WHERE team_id = v_team_id
    AND competition_run_id = p_competition_run_id
    AND entry_type = 'initial_capital'
  FOR UPDATE;

  -- 13. Validate and execute based on side
  IF p_side = 'buy' THEN
    SELECT COALESCE(SUM(amount_paise), 0) INTO v_cash_balance
    FROM public.cash_ledger
    WHERE team_id = v_team_id
      AND competition_run_id = p_competition_run_id;

    IF v_cash_balance < v_total_value THEN
      RAISE EXCEPTION 'INSUFFICIENT_CASH: available % paise, required % paise', v_cash_balance, v_total_value;
    END IF;

    SELECT * INTO v_holding
    FROM public.holdings
    WHERE team_id = v_team_id
      AND competition_run_id = p_competition_run_id
      AND stock_id = p_stock_id;

    IF FOUND THEN
      UPDATE public.holdings
      SET quantity = quantity + p_quantity
      WHERE id = v_holding.id;
    ELSE
      INSERT INTO public.holdings (team_id, competition_run_id, stock_id, quantity, created_at, updated_at)
      VALUES (v_team_id, p_competition_run_id, p_stock_id, p_quantity, v_now, v_now);
    END IF;

  ELSIF p_side = 'sell' THEN
    SELECT * INTO v_holding
    FROM public.holdings
    WHERE team_id = v_team_id
      AND competition_run_id = p_competition_run_id
      AND stock_id = p_stock_id;

    IF NOT FOUND OR v_holding.quantity < p_quantity THEN
      RAISE EXCEPTION 'INSUFFICIENT_HOLDINGS: requested % shares, available %', p_quantity, COALESCE(v_holding.quantity, 0);
    END IF;

    UPDATE public.holdings
    SET quantity = quantity - p_quantity
    WHERE id = v_holding.id;
  END IF;

  -- 14. Create trade record
  INSERT INTO public.trades (team_id, competition_run_id, stock_id, side, quantity, executed_price_paise, total_value_paise, executed_at, created_by, idempotency_key)
  VALUES (v_team_id, p_competition_run_id, p_stock_id, p_side, p_quantity, v_quote.price_paise, v_total_value, v_now, v_user_id, p_idempotency_key)
  RETURNING id INTO v_trade_id;

  -- 15. Create cash ledger entry
  INSERT INTO public.cash_ledger (team_id, competition_run_id, entry_type, amount_paise, reference_type, reference_id, description, created_by, created_at)
  VALUES (
    v_team_id,
    p_competition_run_id,
    CASE WHEN p_side = 'buy' THEN 'trade_buy' ELSE 'trade_sell' END,
    CASE WHEN p_side = 'buy' THEN -v_total_value ELSE v_total_value END,
    'trade',
    v_trade_id,
    FORMAT('%s %s %s shares at %s paise each', UPPER(p_side), v_stock.symbol, p_quantity, v_quote.price_paise),
    v_user_id,
    v_now
  );

  -- 16. Update idempotency record
  IF p_idempotency_key IS NOT NULL AND p_idempotency_key <> '' THEN
    UPDATE public.idempotency_keys
    SET result_id = v_trade_id,
        result_status = 'completed',
        completed_at = v_now
    WHERE team_id = v_team_id
      AND competition_run_id = p_competition_run_id
      AND operation_type = 'execute_trade'
      AND idempotency_key = p_idempotency_key;
  END IF;

  -- 17. Notify: portfolio changed (team-scoped, only this team sees)
  PERFORM public.notify_realtime(
    'team:' || v_team_id::text,
    'PORTFOLIO_CHANGED',
    v_team_id,
    jsonb_build_object(
      'competition_run_id', p_competition_run_id,
      'reason', 'trade',
      'trade_id', v_trade_id,
      'occurred_at', v_now
    )
  );

  -- 18. Notify: leaderboard changed (run-scoped, all participants see)
  PERFORM public.notify_realtime(
    'run:' || p_competition_run_id::text,
    'LEADERBOARD_CHANGED',
    NULL,
    jsonb_build_object(
      'competition_run_id', p_competition_run_id,
      'reason', 'trade',
      'occurred_at', v_now
    )
  );

  RETURN jsonb_build_object(
    'ok',                 true,
    'trade_id',           v_trade_id,
    'side',               p_side,
    'stock_id',           p_stock_id,
    'stock_symbol',       v_stock.symbol,
    'quantity',           p_quantity,
    'executed_price_paise', v_quote.price_paise,
    'total_value_paise',  v_total_value,
    'executed_at',        v_now,
    'idempotency_key',    p_idempotency_key
  );
END;
$$;

COMMENT ON FUNCTION public.execute_trade(uuid, uuid, text, bigint, text)
  IS 'Authoritative trade execution. Atomic: trade + holding update + cash ledger entry. Idempotent replays return original result without duplicate notifications.';

-- ============================================================
-- Summary of fixes:
--
-- 1. realtime_notifications RLS:
--    Run-scoped events now verify user participates in the run
--    (has team with initial_capital in cash_ledger) or is admin.
--    Prevents cross-run notification leakage.
--
-- 2. get_leaderboard():
--    Removed dependency on team_portfolio_view (never created).
--    Computes portfolio inline from cash_ledger + holdings + market_quotes.
--    Same formula as get_team_portfolio() but for all teams.
--
-- 3. get_team_holdings():
--    Changed s.company_name → s.name (correct column name).
--
-- 4. execute_trade():
--    Idempotent replays no longer send duplicate notifications.
--    Only the original execution sends PORTFOLIO_CHANGED + LEADERBOARD_CHANGED.
--
-- ============================================================

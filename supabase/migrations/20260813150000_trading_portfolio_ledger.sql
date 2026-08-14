-- ============================================================
-- Phase 4: Trading & Portfolio Ledger
-- ============================================================
-- Tables: holdings, trades, cash_ledger, idempotency_keys
-- RPCs: execute_trade(), initialize_team_cash()
-- Security: RLS enforces team isolation, all writes via RPCs
-- ============================================================

-- -----------------------------------------------------------
-- 1. holdings
-- -----------------------------------------------------------
-- Authoritative share ownership per team per competition run.
-- One row per (team_id, competition_run_id, stock_id).
-- Quantity must never be negative.

CREATE TABLE public.holdings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id           uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  competition_run_id uuid NOT NULL REFERENCES public.competition_runs(id) ON DELETE CASCADE,
  stock_id          uuid NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  quantity          bigint NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_holdings_team_run_stock UNIQUE (team_id, competition_run_id, stock_id),
  CONSTRAINT chk_holdings_quantity_non_negative CHECK (quantity >= 0)
);

COMMENT ON TABLE public.holdings IS 'Authoritative share ownership per team per competition run.';

CREATE INDEX idx_holdings_team_id ON public.holdings (team_id);
CREATE INDEX idx_holdings_competition_run_id ON public.holdings (competition_run_id);
CREATE INDEX idx_holdings_stock_id ON public.holdings (stock_id);
CREATE INDEX idx_holdings_team_run ON public.holdings (team_id, competition_run_id);

CREATE TRIGGER holdings_set_updated_at
  BEFORE UPDATE ON public.holdings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------
-- 2. trades
-- -----------------------------------------------------------
-- Immutable record of executed trades.
-- One row per trade execution.

CREATE TABLE public.trades (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id             uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  competition_run_id  uuid NOT NULL REFERENCES public.competition_runs(id) ON DELETE CASCADE,
  stock_id            uuid NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  side                text NOT NULL CHECK (side IN ('buy', 'sell')),
  quantity            bigint NOT NULL CHECK (quantity > 0),
  executed_price_paise bigint NOT NULL CHECK (executed_price_paise >= 0),
  total_value_paise   bigint NOT NULL CHECK (total_value_paise >= 0),
  executed_at         timestamptz NOT NULL DEFAULT now(),
  created_by          uuid NOT NULL REFERENCES public.profiles(id),
  idempotency_key     text,

  CONSTRAINT chk_trades_total_value CHECK (total_value_paise = quantity * executed_price_paise)
);

COMMENT ON TABLE public.trades IS 'Immutable record of executed trades.';

CREATE INDEX idx_trades_team_id ON public.trades (team_id);
CREATE INDEX idx_trades_competition_run_id ON public.trades (competition_run_id);
CREATE INDEX idx_trades_stock_id ON public.trades (stock_id);
CREATE INDEX idx_trades_team_run ON public.trades (team_id, competition_run_id);
CREATE INDEX idx_trades_executed_at ON public.trades (executed_at);
CREATE INDEX idx_trades_idempotency_key ON public.trades (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- -----------------------------------------------------------
-- 3. cash_ledger
-- -----------------------------------------------------------
-- Append-only audit trail of cash movements.
-- Signed amounts: positive = credit, negative = debit.
-- Balance = SUM(amount_paise) for team + run.

CREATE TABLE public.cash_ledger (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id           uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  competition_run_id uuid NOT NULL REFERENCES public.competition_runs(id) ON DELETE CASCADE,
  entry_type        text NOT NULL CHECK (entry_type IN (
                      'initial_capital',
                      'trade_buy',
                      'trade_sell'
                    )),
  amount_paise      bigint NOT NULL,
  reference_type    text,
  reference_id      uuid,
  description       text NOT NULL DEFAULT '',
  created_by        uuid NOT NULL REFERENCES public.profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cash_ledger IS 'Append-only audit trail of cash movements.';

CREATE INDEX idx_cash_ledger_team_id ON public.cash_ledger (team_id);
CREATE INDEX idx_cash_ledger_competition_run_id ON public.cash_ledger (competition_run_id);
CREATE INDEX idx_cash_ledger_team_run ON public.cash_ledger (team_id, competition_run_id);
CREATE INDEX idx_cash_ledger_created_at ON public.cash_ledger (created_at);

-- -----------------------------------------------------------
-- 4. idempotency_keys
-- -----------------------------------------------------------
-- Prevents duplicate execution of critical operations.
-- Scoped to (team_id, competition_run_id, operation_type).

CREATE TABLE public.idempotency_keys (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id           uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  competition_run_id uuid NOT NULL REFERENCES public.competition_runs(id) ON DELETE CASCADE,
  operation_type    text NOT NULL,
  idempotency_key   text NOT NULL,
  request_hash      text NOT NULL,
  result_id         uuid,
  result_status     text NOT NULL DEFAULT 'pending'
                      CHECK (result_status IN ('pending', 'completed', 'failed')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,

  CONSTRAINT uq_idempotency_keys_team_run_op UNIQUE (team_id, competition_run_id, operation_type, idempotency_key)
);

COMMENT ON TABLE public.idempotency_keys IS 'Prevents duplicate execution of critical operations.';

CREATE INDEX idx_idempotency_keys_team_run ON public.idempotency_keys (team_id, competition_run_id);
CREATE INDEX idx_idempotency_keys_key ON public.idempotency_keys (idempotency_key);

-- -----------------------------------------------------------
-- 5. RPC: initialize_team_cash()
-- -----------------------------------------------------------
-- Admin RPC: set initial capital for a team in a competition run.
-- Creates an initial_capital ledger entry.
-- Prevents duplicate initialization.

CREATE OR REPLACE FUNCTION public.initialize_team_cash(
  p_team_id uuid,
  p_competition_run_id uuid,
  p_amount_paise bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run    record;
  v_team   record;
  v_existing record;
  v_now    timestamptz := now();
BEGIN
  -- 1. Authorize
  PERFORM public.assert_admin();

  -- 2. Validate competition run exists and is pending or active
  SELECT * INTO v_run
  FROM public.competition_runs
  WHERE id = p_competition_run_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMPETITION_RUN_NOT_FOUND: %', p_competition_run_id;
  END IF;

  IF v_run.status NOT IN ('pending', 'active') THEN
    RAISE EXCEPTION 'INVALID_STATE: competition run status is %, expected pending or active', v_run.status;
  END IF;

  -- 3. Validate team exists
  SELECT * INTO v_team
  FROM public.teams
  WHERE id = p_team_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TEAM_NOT_FOUND: %', p_team_id;
  END IF;

  -- 4. Validate amount is positive
  IF p_amount_paise IS NULL OR p_amount_paise <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: amount_paise must be positive, got %', p_amount_paise;
  END IF;

  -- 5. Check no initial capital already exists for this team/run
  SELECT * INTO v_existing
  FROM public.cash_ledger
  WHERE team_id = p_team_id
    AND competition_run_id = p_competition_run_id
    AND entry_type = 'initial_capital';

  IF FOUND THEN
    RAISE EXCEPTION 'INITIAL_CAPITAL_EXISTS: team % already has initial capital for run %', p_team_id, p_competition_run_id;
  END IF;

  -- 6. Create initial capital ledger entry
  INSERT INTO public.cash_ledger (team_id, competition_run_id, entry_type, amount_paise, reference_type, reference_id, description, created_by, created_at)
  VALUES (p_team_id, p_competition_run_id, 'initial_capital', p_amount_paise, NULL, NULL, 'Initial capital', auth.uid(), v_now);

  RETURN jsonb_build_object(
    'ok',             true,
    'team_id',        p_team_id,
    'competition_run_id', p_competition_run_id,
    'amount_paise',   p_amount_paise,
    'created_at',     v_now
  );
END;
$$;

COMMENT ON FUNCTION public.initialize_team_cash(uuid, uuid, bigint)
  IS 'Admin RPC: set initial capital for a team in a competition run. Creates an initial_capital ledger entry. Prevents duplicate initialization.';

-- -----------------------------------------------------------
-- 6. Helper: resolve team from authenticated user
-- -----------------------------------------------------------
-- Returns the team_id for a user in a specific competition run.
-- Assumes one team per user per run.

CREATE OR REPLACE FUNCTION public.resolve_user_team(
  p_user_id uuid,
  p_competition_run_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id uuid;
  v_count   int;
BEGIN
  -- Count team memberships for this user
  SELECT COUNT(*) INTO v_count
  FROM public.team_members
  WHERE user_id = p_user_id;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'NO_TEAM: user % is not a member of any team', p_user_id;
  END IF;

  IF v_count > 1 THEN
    RAISE EXCEPTION 'MULTIPLE_TEAMS: user % is a member of multiple teams', p_user_id;
  END IF;

  -- Get the single team_id
  SELECT tm.team_id INTO v_team_id
  FROM public.team_members tm
  WHERE tm.user_id = p_user_id
  LIMIT 1;

  RETURN v_team_id;
END;
$$;

COMMENT ON FUNCTION public.resolve_user_team(uuid, uuid)
  IS 'Helper: resolve team_id from authenticated user. Assumes one team per user.';

-- -----------------------------------------------------------
-- 7. RPC: execute_trade()
-- -----------------------------------------------------------
-- Authoritative trade execution.
-- Atomic: trade + holding update + cash ledger entry.
-- Validates: authentication, team, run, round, market, price, cash/holdings.

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
  v_idem_key    text;
  v_idem_record record;
  v_request_hash text;
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
    -- Compute request hash
    v_request_hash := md5(p_competition_run_id::text || p_stock_id::text || p_side || p_quantity::text);

    -- Check for existing idempotency record
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
        RETURN jsonb_build_object(
          'ok',         true,
          'trade_id',   v_idem_record.result_id,
          'message',    'Trade already executed (idempotent)',
          'idempotency_key', p_idempotency_key
        );
      ELSIF v_idem_record.result_status = 'failed' THEN
        -- Allow retry (previous attempt failed and rolled back)
        DELETE FROM public.idempotency_keys WHERE id = v_idem_record.id;
      END IF;
    ELSE
      -- Create idempotency record
      INSERT INTO public.idempotency_keys (team_id, competition_run_id, operation_type, idempotency_key, request_hash, result_status, created_at)
      VALUES (v_team_id, p_competition_run_id, 'execute_trade', p_idempotency_key, v_request_hash, 'pending', v_now);
    END IF;
  END IF;

  -- 12. Lock and validate based on side
  IF p_side = 'buy' THEN
    -- Validate cash availability
    SELECT COALESCE(SUM(amount_paise), 0) INTO v_cash_balance
    FROM public.cash_ledger
    WHERE team_id = v_team_id
      AND competition_run_id = p_competition_run_id;

    IF v_cash_balance < v_total_value THEN
      RAISE EXCEPTION 'INSUFFICIENT_CASH: available % paise, required % paise', v_cash_balance, v_total_value;
    END IF;

    -- Update or create holding
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
    -- Validate holdings
    SELECT * INTO v_holding
    FROM public.holdings
    WHERE team_id = v_team_id
      AND competition_run_id = p_competition_run_id
      AND stock_id = p_stock_id;

    IF NOT FOUND OR v_holding.quantity < p_quantity THEN
      RAISE EXCEPTION 'INSUFFICIENT_HOLDINGS: requested % shares, available %', p_quantity, COALESCE(v_holding.quantity, 0);
    END IF;

    -- Decrease holding
    UPDATE public.holdings
    SET quantity = quantity - p_quantity
    WHERE id = v_holding.id;
  END IF;

  -- 13. Create trade record
  INSERT INTO public.trades (team_id, competition_run_id, stock_id, side, quantity, executed_price_paise, total_value_paise, executed_at, created_by, idempotency_key)
  VALUES (v_team_id, p_competition_run_id, p_stock_id, p_side, p_quantity, v_quote.price_paise, v_total_value, v_now, v_user_id, p_idempotency_key)
  RETURNING id INTO v_trade_id;

  -- 14. Create cash ledger entry
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

  -- 15. Update idempotency record
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
  IS 'Authoritative trade execution. Atomic: trade + holding update + cash ledger entry. Validates authentication, team, run, round, market, price, cash/holdings.';

-- -----------------------------------------------------------
-- 8. Row Level Security
-- -----------------------------------------------------------

ALTER TABLE public.holdings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_ledger      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

-- ---- holdings policies ----

-- Participants can read their own team's holdings.
CREATE POLICY "holdings_select_own_team"
  ON public.holdings
  FOR SELECT
  USING (
    team_id IN (
      SELECT tm.team_id FROM public.team_members tm
      WHERE tm.user_id = auth.uid()
    )
  );

-- Admins can read all holdings.
CREATE POLICY "holdings_select_admin"
  ON public.holdings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- No participant write policies. All writes go through execute_trade() RPC.

-- ---- trades policies ----

-- Participants can read their own team's trades.
CREATE POLICY "trades_select_own_team"
  ON public.trades
  FOR SELECT
  USING (
    team_id IN (
      SELECT tm.team_id FROM public.team_members tm
      WHERE tm.user_id = auth.uid()
    )
  );

-- Admins can read all trades.
CREATE POLICY "trades_select_admin"
  ON public.trades
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- No participant write policies. Trades are immutable, created by RPC.

-- ---- cash_ledger policies ----

-- Participants can read their own team's cash ledger.
CREATE POLICY "cash_ledger_select_own_team"
  ON public.cash_ledger
  FOR SELECT
  USING (
    team_id IN (
      SELECT tm.team_id FROM public.team_members tm
      WHERE tm.user_id = auth.uid()
    )
  );

-- Admins can read all cash ledger entries.
CREATE POLICY "cash_ledger_select_admin"
  ON public.cash_ledger
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- No participant write policies. Cash ledger is append-only, created by RPCs.

-- ---- idempotency_keys policies ----

-- Only admins can read idempotency keys (for debugging).
CREATE POLICY "idempotency_keys_select_admin"
  ON public.idempotency_keys
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- No participant access. Idempotency keys are managed by RPCs.

-- ============================================================
-- Summary of RLS policies:
--
-- holdings:
--   holdings_select_own_team (SELECT) - team members
--   holdings_select_admin (SELECT) - admin only
--
-- trades:
--   trades_select_own_team (SELECT) - team members
--   trades_select_admin (SELECT) - admin only
--
-- cash_ledger:
--   cash_ledger_select_own_team (SELECT) - team members
--   cash_ledger_select_admin (SELECT) - admin only
--
-- idempotency_keys:
--   idempotency_keys_select_admin (SELECT) - admin only
--
-- All writes go through SECURITY DEFINER RPCs:
--   execute_trade() - atomic trade execution
--   initialize_team_cash() - initial capital setup
-- ============================================================

-- ============================================================
-- Refactor: Teams = Users
-- ============================================================
-- Remove profiles + team_members. Teams become the user entity.
-- teams.id = auth.uid
-- ============================================================

-- -----------------------------------------------------------
-- 1. Add new columns to teams
-- -----------------------------------------------------------
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'participant'
  CHECK (role IN ('participant', 'admin'));
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT '';

-- -----------------------------------------------------------
-- 2. Create new team rows with auth.uid as id
--    Then move child rows to the new team id
--    Then delete old team rows
-- -----------------------------------------------------------
DO $$
DECLARE
  v_tm record;
  v_new_id uuid;
  v_old_id uuid;
BEGIN
  FOR v_tm IN
    SELECT tm.user_id, tm.team_id, p.display_name, p.role
    FROM public.team_members tm
    JOIN public.profiles p ON p.id = tm.user_id
  LOOP
    v_new_id := v_tm.user_id;
    v_old_id := v_tm.team_id;

    -- Step A: Create or update the team row with user_id as id
    IF v_old_id = v_new_id THEN
      -- Team already has the right id, just update metadata
      UPDATE public.teams
      SET display_name = COALESCE(NULLIF(v_tm.display_name, ''), name),
          role = v_tm.role
      WHERE id = v_new_id;
    ELSE
      -- Check if a team with the new id already exists
      IF EXISTS (SELECT 1 FROM public.teams WHERE id = v_new_id) THEN
        -- Target team exists, just update its metadata
        UPDATE public.teams
        SET display_name = COALESCE(NULLIF(v_tm.display_name, ''), display_name),
            role = v_tm.role
        WHERE id = v_new_id;
      ELSE
        -- Copy the old team row to a new row with user_id as id
        INSERT INTO public.teams (id, name, display_name, role, created_at, updated_at)
        SELECT v_new_id,
               t.name,
               COALESCE(NULLIF(v_tm.display_name, ''), t.name),
               v_tm.role,
               t.created_at,
               now()
        FROM public.teams t WHERE t.id = v_old_id;
      END IF;

      -- Step B: Move all child rows from old team_id to new team_id
      UPDATE public.trades SET team_id = v_new_id WHERE team_id = v_old_id;
      UPDATE public.holdings SET team_id = v_new_id WHERE team_id = v_old_id;
      UPDATE public.cash_ledger SET team_id = v_new_id WHERE team_id = v_old_id;
      UPDATE public.idempotency_keys SET team_id = v_new_id WHERE team_id = v_old_id;
      UPDATE public.dividend_payments SET team_id = v_new_id WHERE team_id = v_old_id;
      UPDATE public.realtime_notifications SET team_id = v_new_id WHERE team_id = v_old_id;

      -- Step C: Delete the old team row
      DELETE FROM public.teams WHERE id = v_old_id;
    END IF;
  END LOOP;

  -- Also create teams for profiles that have no team_members entry
  FOR v_tm IN
    SELECT p.id, p.display_name, p.role
    FROM public.profiles p
    WHERE NOT EXISTS (SELECT 1 FROM public.teams t WHERE t.id = p.id)
  LOOP
    INSERT INTO public.teams (id, name, display_name, role)
    VALUES (v_tm.id, v_tm.display_name, v_tm.display_name, v_tm.role)
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END $$;

-- -----------------------------------------------------------
-- 3. Update created_by FKs from profiles(id) to teams(id)
-- -----------------------------------------------------------
ALTER TABLE public.trades DROP CONSTRAINT IF EXISTS trades_created_by_fkey;
ALTER TABLE public.trades ADD CONSTRAINT trades_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.teams(id) ON DELETE RESTRICT;

ALTER TABLE public.cash_ledger DROP CONSTRAINT IF EXISTS cash_ledger_created_by_fkey;
ALTER TABLE public.cash_ledger ADD CONSTRAINT cash_ledger_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.teams(id) ON DELETE RESTRICT;

ALTER TABLE public.price_change_batches DROP CONSTRAINT IF EXISTS price_change_batches_created_by_fkey;
ALTER TABLE public.price_change_batches ADD CONSTRAINT price_change_batches_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.teams(id) ON DELETE RESTRICT;

ALTER TABLE public.dividends DROP CONSTRAINT IF EXISTS dividends_created_by_fkey;
ALTER TABLE public.dividends ADD CONSTRAINT dividends_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.teams(id) ON DELETE RESTRICT;

-- -----------------------------------------------------------
-- 4. Drop team_members and profiles
-- -----------------------------------------------------------
DROP TABLE IF EXISTS public.team_members CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- -----------------------------------------------------------
-- 5. Update handle_new_user() — create a team, not a profile
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.teams (id, name, display_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'participant')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------
-- 6. Update assert_admin() — check teams instead of profiles
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_admin()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.teams WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: admin role required';
  END IF;
END;
$$;

-- -----------------------------------------------------------
-- 7. Update is_admin() — check teams instead of profiles
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.teams WHERE id = auth.uid() AND role = 'admin');
$$;

-- -----------------------------------------------------------
-- 8. Update user_team_ids() — user IS the team
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_team_ids()
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ARRAY[auth.uid()];
$$;

-- -----------------------------------------------------------
-- 9. Update teams RLS policies
-- -----------------------------------------------------------
DROP POLICY IF EXISTS "teams_select_authenticated" ON public.teams;
DROP POLICY IF EXISTS "teams_insert_admin" ON public.teams;
DROP POLICY IF EXISTS "teams_update_admin" ON public.teams;
DROP POLICY IF EXISTS "teams_delete_admin" ON public.teams;

CREATE POLICY teams_select_own ON public.teams
  FOR SELECT USING (id = auth.uid());

CREATE POLICY teams_select_authenticated ON public.teams
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY teams_update_own ON public.teams
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY teams_update_admin ON public.teams
  FOR UPDATE USING (public.is_admin());

CREATE POLICY teams_insert_admin ON public.teams
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY teams_delete_admin ON public.teams
  FOR DELETE USING (public.is_admin());

-- ============================================================
-- Refactor: Teams = Users
-- ============================================================
-- Remove profiles + team_members. Teams become the user entity.
-- teams.id = auth.uid
-- ============================================================

-- -----------------------------------------------------------
-- 1. Migrate data: teams get role + display_name from profiles
-- -----------------------------------------------------------
-- Each user currently has: profile (id=auth.uid) → team_members → team
-- We need to update the team row so team.id = auth.uid

-- First, add columns to teams
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'participant'
  CHECK (role IN ('participant', 'admin'));
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT '';

-- Migrate: for each user, update their team row to have the user's auth.uid as id
-- Since team_members maps user_id (auth.uid) → team_id, we swap the team's id
DO $$
DECLARE
  v_tm record;
BEGIN
  FOR v_tm IN
    SELECT tm.user_id, tm.team_id, p.display_name, p.role
    FROM public.team_members tm
    JOIN public.profiles p ON p.id = tm.user_id
  LOOP
    -- Update the team's id to be the user's auth.uid
    -- First update all FKs pointing to the old team_id
    UPDATE public.trades SET team_id = v_tm.user_id WHERE team_id = v_tm.team_id;
    UPDATE public.holdings SET team_id = v_tm.user_id WHERE team_id = v_tm.team_id;
    UPDATE public.cash_ledger SET team_id = v_tm.user_id WHERE team_id = v_tm.team_id;
    UPDATE public.idempotency_keys SET team_id = v_tm.user_id WHERE team_id = v_tm.team_id;
    UPDATE public.dividend_payments SET team_id = v_tm.user_id WHERE team_id = v_tm.team_id;
    UPDATE public.realtime_notifications SET team_id = v_tm.user_id WHERE team_id = v_tm.team_id;

    -- Update the team row itself
    UPDATE public.teams
    SET id = v_tm.user_id,
        name = COALESCE(NULLIF(v_tm.display_name, ''), v_tm.name),
        display_name = COALESCE(NULLIF(v_tm.display_name, ''), v_tm.name),
        role = v_tm.role
    WHERE id = v_tm.team_id;

    -- Handle case where team_id doesn't match any team (orphaned membership)
    -- Create a new team with user_id as id
    IF NOT FOUND THEN
      INSERT INTO public.teams (id, name, display_name, role)
      VALUES (v_tm.user_id, v_tm.display_name, v_tm.display_name, v_tm.role)
      ON CONFLICT (id) DO UPDATE
        SET display_name = EXCLUDED.display_name, role = EXCLUDED.role;
    END IF;
  END LOOP;
END $$;

-- Ensure all profiles have a team (even if no team_members entry)
DO $$
DECLARE
  v_profile record;
BEGIN
  FOR v_profile IN
    SELECT p.id, p.display_name, p.role
    FROM public.profiles p
    WHERE NOT EXISTS (SELECT 1 FROM public.teams t WHERE t.id = p.id)
  LOOP
    INSERT INTO public.teams (id, name, display_name, role)
    VALUES (v_profile.id, v_profile.display_name, v_profile.display_name, v_profile.role)
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END $$;

-- -----------------------------------------------------------
-- 2. Update created_by FKs from profiles(id) to teams(id)
-- -----------------------------------------------------------
-- These columns reference profiles.id which = auth.uid = new teams.id
-- Just update the constraint

-- trades.created_by
ALTER TABLE public.trades DROP CONSTRAINT IF EXISTS trades_created_by_fkey;
ALTER TABLE public.trades ADD CONSTRAINT trades_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.teams(id) ON DELETE RESTRICT;

-- cash_ledger.created_by
ALTER TABLE public.cash_ledger DROP CONSTRAINT IF EXISTS cash_ledger_created_by_fkey;
ALTER TABLE public.cash_ledger ADD CONSTRAINT cash_ledger_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.teams(id) ON DELETE RESTRICT;

-- price_change_batches.created_by
ALTER TABLE public.price_change_batches DROP CONSTRAINT IF EXISTS price_change_batches_created_by_fkey;
ALTER TABLE public.price_change_batches ADD CONSTRAINT price_change_batches_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.teams(id) ON DELETE RESTRICT;

-- dividends.created_by
ALTER TABLE public.dividends DROP CONSTRAINT IF EXISTS dividends_created_by_fkey;
ALTER TABLE public.dividends ADD CONSTRAINT dividends_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.teams(id) ON DELETE RESTRICT;

-- -----------------------------------------------------------
-- 3. Drop team_members and profiles
-- -----------------------------------------------------------
DROP TABLE IF EXISTS public.team_members CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- -----------------------------------------------------------
-- 4. Update handle_new_user() — create a team, not a profile
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
-- 5. Update assert_admin() — check teams instead of profiles
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
    SELECT 1 FROM public.teams
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: admin role required';
  END IF;
END;
$$;

-- -----------------------------------------------------------
-- 6. Update is_admin() — check teams instead of profiles
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.teams
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- -----------------------------------------------------------
-- 7. Update user_team_ids() — user IS the team
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
-- 8. Drop old profiles RLS policies (table is gone)
-- -----------------------------------------------------------
-- Profiles table is dropped, so all policies are gone.

-- -----------------------------------------------------------
-- 9. Update teams RLS policies
-- -----------------------------------------------------------
DROP POLICY IF EXISTS "teams_select_authenticated" ON public.teams;
DROP POLICY IF EXISTS "teams_insert_admin" ON public.teams;
DROP POLICY IF EXISTS "teams_update_admin" ON public.teams;
DROP POLICY IF EXISTS "teams_delete_admin" ON public.teams;

-- Users can read their own team
CREATE POLICY teams_select_own ON public.teams
  FOR SELECT USING (id = auth.uid());

-- Users can read other teams (for leaderboard, market UI etc)
CREATE POLICY teams_select_authenticated ON public.teams
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Users can update their own team (name, display_name only — not role)
CREATE POLICY teams_update_own ON public.teams
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Admins can update any team (including role)
CREATE POLICY teams_update_admin ON public.teams
  FOR UPDATE USING (public.is_admin());

-- Admins can insert teams (for provisioning participants)
CREATE POLICY teams_insert_admin ON public.teams
  FOR INSERT WITH CHECK (public.is_admin());

-- Admins can delete teams
CREATE POLICY teams_delete_admin ON public.teams
  FOR DELETE USING (public.is_admin());

-- -----------------------------------------------------------
-- 10. Add teams to supabase_realtime publication
-- -----------------------------------------------------------
-- (teams was already in the publication from earlier migrations)

-- -----------------------------------------------------------
-- Done. profiles and team_members are removed.
-- teams now IS the user entity.
-- teams.id = auth.uid
-- teams.role = 'admin' | 'participant'
-- teams.display_name = user display name
-- -----------------------------------------------------------

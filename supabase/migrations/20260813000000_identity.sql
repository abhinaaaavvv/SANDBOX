-- ============================================================
-- Phase 1: Identity & Team Membership
-- ============================================================

-- -----------------------------------------------------------
-- 0. Helper: auto-update updated_at
-- -----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------
-- 1. profiles
-- -----------------------------------------------------------

CREATE TABLE public.profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  role        text NOT NULL DEFAULT 'participant'
                CHECK (role IN ('participant', 'admin')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.profiles IS 'One row per authenticated user. Application-level identity.';
COMMENT ON COLUMN public.profiles.id IS 'FK to auth.users — the sole source of authentication identity.';
COMMENT ON COLUMN public.profiles.role IS 'participant or admin. New users always start as participant.';

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------
-- 2. teams
-- -----------------------------------------------------------

CREATE TABLE public.teams (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL CHECK (char_length(trim(name)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.teams IS 'Competition teams.';

CREATE INDEX idx_teams_name ON public.teams (name);

CREATE TRIGGER teams_set_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------
-- 3. team_members
-- -----------------------------------------------------------

CREATE TABLE public.team_members (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id   uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role      text NOT NULL DEFAULT 'member'
              CHECK (role IN ('member', 'captain')),
  joined_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_team_members_user_team UNIQUE (user_id, team_id)
);

COMMENT ON TABLE public.team_members IS 'Maps users to teams. One membership per user per team.';

CREATE INDEX idx_team_members_team_id ON public.team_members (team_id);
CREATE INDEX idx_team_members_user_id ON public.team_members (user_id);

-- -----------------------------------------------------------
-- 4. Auto-create profile on auth.users INSERT
-- -----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', ''),
    'participant'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- -----------------------------------------------------------
-- 5. Row Level Security
-- -----------------------------------------------------------

ALTER TABLE public.profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members   ENABLE ROW LEVEL SECURITY;

-- ---- profiles policies ----

-- Participants can read their own profile.
CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  USING (id = auth.uid());

-- Admins can read all profiles.
CREATE POLICY "profiles_select_admin"
  ON public.profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Users can update their own profile, but NOT their role.
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (
      SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

-- No insert policy: profiles are created only by the trigger.

-- No delete policy: profiles are managed by auth.users lifecycle.

-- ---- teams policies ----

-- Any authenticated user can read teams (needed for team selection UI).
CREATE POLICY "teams_select_authenticated"
  ON public.teams
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only admins can insert teams.
CREATE POLICY "teams_insert_admin"
  ON public.teams
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Only admins can update teams.
CREATE POLICY "teams_update_admin"
  ON public.teams
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Only admins can delete teams.
CREATE POLICY "teams_delete_admin"
  ON public.teams
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ---- team_members policies ----

-- Users can read their own memberships.
CREATE POLICY "team_members_select_own"
  ON public.team_members
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can read memberships of users on their team.
CREATE POLICY "team_members_select_teammates"
  ON public.team_members
  FOR SELECT
  USING (
    team_id IN (
      SELECT tm.team_id FROM public.team_members tm
      WHERE tm.user_id = auth.uid()
    )
  );

-- Admins can read all team_members.
CREATE POLICY "team_members_select_admin"
  ON public.team_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Only admins can insert team_members.
CREATE POLICY "team_members_insert_admin"
  ON public.team_members
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Only admins can update team_members.
CREATE POLICY "team_members_update_admin"
  ON public.team_members
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Only admins can delete team_members.
CREATE POLICY "team_members_delete_admin"
  ON public.team_members
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

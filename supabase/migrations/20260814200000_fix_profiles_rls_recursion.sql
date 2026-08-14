-- Fix infinite recursion in profiles SELECT policy
--
-- Problem: profiles_select_admin queries profiles FROM a policy ON profiles,
-- causing Postgres error 42P17 (infinite recursion). No authenticated user
-- can read any profile row.
--
-- Fix: Replace with a SECURITY DEFINER helper that bypasses RLS.

-- 1. Helper function — runs as owner, bypasses RLS
CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = uid AND role = 'admin');
$$;

-- 2. Drop the broken policy
DROP POLICY IF EXISTS profiles_select_admin ON profiles;

-- 3. Recreate without recursion
CREATE POLICY profiles_select_admin ON profiles
  FOR SELECT
  USING (public.is_admin(auth.uid()));

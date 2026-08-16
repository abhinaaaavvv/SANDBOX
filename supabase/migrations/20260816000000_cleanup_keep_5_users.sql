-- ============================================================
-- Cleanup: Keep only 5 users, remove everything else
-- ============================================================
-- Emails to KEEP:
--   1. abhi.sarkar.anu@gmail.com (admin)
--   2. sandbox-test-alpha-1@dev.local
--   3. sandbox-test-alpha-2@dev.local
--   4. sandbox-test-beta-1@dev.local
--   5. sandbox-test-beta-2@dev.local
-- ============================================================

DO $$
DECLARE
  v_keep_emails text[] := ARRAY[
    'abhi.sarkar.anu@gmail.com',
    'sandbox-test-alpha-1@dev.local',
    'sandbox-test-alpha-2@dev.local',
    'sandbox-test-beta-1@dev.local',
    'sandbox-test-beta-2@dev.local'
  ];
  v_keep_profile_ids uuid[];
  v_keep_team_ids uuid[];
  v_removed int;
BEGIN
  -- ============================================================
  -- 1. Identify profiles via auth.users email
  -- ============================================================
  SELECT array_agg(p.id) INTO v_keep_profile_ids
  FROM public.profiles p
  INNER JOIN auth.users au ON au.id = p.id
  WHERE au.email = ANY(v_keep_emails);

  IF v_keep_profile_ids IS NULL THEN
    RAISE EXCEPTION 'No profiles found for the specified emails';
  END IF;

  RAISE NOTICE 'Keeping % profiles', array_length(v_keep_profile_ids, 1);

  -- ============================================================
  -- 2. Find teams linked to kept profiles
  -- ============================================================
  SELECT array_agg(DISTINCT tm.team_id) INTO v_keep_team_ids
  FROM public.team_members tm
  WHERE tm.user_id = ANY(v_keep_profile_ids);

  IF v_keep_team_ids IS NULL THEN
    v_keep_team_ids := ARRAY[]::uuid[];
  END IF;

  RAISE NOTICE 'Keeping % teams', array_length(v_keep_team_ids, 1);

  -- ============================================================
  -- 3. Delete financial data for teams being removed
  -- ============================================================

  -- pending_price_changes via batches created by non-kept users
  DELETE FROM public.pending_price_changes ppc
  USING public.price_change_batches pcb
  WHERE ppc.batch_id = pcb.id
    AND pcb.created_by <> ALL(v_keep_profile_ids);

  DELETE FROM public.price_change_batches
  WHERE created_by <> ALL(v_keep_profile_ids);

  -- dividend_payments for removed teams
  DELETE FROM public.dividend_payments
  WHERE team_id <> ALL(v_keep_team_ids);

  -- dividends created by non-kept users
  DELETE FROM public.dividends
  WHERE created_by <> ALL(v_keep_profile_ids);

  -- trades for removed teams
  DELETE FROM public.trades
  WHERE team_id <> ALL(v_keep_team_ids);

  -- holdings for removed teams
  DELETE FROM public.holdings
  WHERE team_id <> ALL(v_keep_team_ids);

  -- cash_ledger for removed teams
  DELETE FROM public.cash_ledger
  WHERE team_id <> ALL(v_keep_team_ids);

  -- idempotency_keys for removed teams
  DELETE FROM public.idempotency_keys
  WHERE team_id <> ALL(v_keep_team_ids);

  -- ============================================================
  -- 4. Delete team_members for removed profiles
  -- ============================================================
  DELETE FROM public.team_members
  WHERE user_id <> ALL(v_keep_profile_ids);

  -- Remove extra memberships (one team per user)
  DELETE FROM public.team_members
  WHERE id NOT IN (
    SELECT DISTINCT ON (user_id) id
    FROM public.team_members
    WHERE user_id = ANY(v_keep_profile_ids)
    ORDER BY user_id, joined_at
  );

  -- ============================================================
  -- 5. Delete orphaned teams (no members left)
  -- ============================================================
  DELETE FROM public.teams t
  WHERE NOT EXISTS (
    SELECT 1 FROM public.team_members tm WHERE tm.team_id = t.id
  );

  GET DIAGNOSTICS v_removed = ROW_COUNT;
  RAISE NOTICE 'Removed % orphaned teams', v_removed;

  -- ============================================================
  -- 6. Delete profiles not in the keep list
  -- ============================================================
  DELETE FROM public.profiles
  WHERE id <> ALL(v_keep_profile_ids);

  GET DIAGNOSTICS v_removed = ROW_COUNT;
  RAISE NOTICE 'Removed % profiles', v_removed;

  -- ============================================================
  -- 7. Summary
  -- ============================================================
  RAISE NOTICE '=== Cleanup Complete ===';
  RAISE NOTICE 'Profiles: %', (SELECT count(*) FROM public.profiles);
  RAISE NOTICE 'Teams: %', (SELECT count(*) FROM public.teams);
  RAISE NOTICE 'Team members: %', (SELECT count(*) FROM public.team_members);
  RAISE NOTICE 'Trades: %', (SELECT count(*) FROM public.trades);
  RAISE NOTICE 'Holdings: %', (SELECT count(*) FROM public.holdings);
  RAISE NOTICE 'Cash ledger: %', (SELECT count(*) FROM public.cash_ledger);
  RAISE NOTICE '========================';
END $$;

-- Migration: Add provision_rounds() RPC
-- Ensures all 3 rounds exist for a competition run (idempotent).
-- Uses INSERT ... ON CONFLICT to prevent duplicates.

CREATE OR REPLACE FUNCTION public.provision_rounds(p_competition_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run record;
  v_inserted_count integer := 0;
  v_round_types text[] := ARRAY['portfolio', 'newspaper', 'video'];
  i integer;
BEGIN
  PERFORM public.assert_admin();

  SELECT * INTO v_run
  FROM public.competition_runs
  WHERE id = p_competition_run_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMPETITION_RUN_NOT_FOUND: %', p_competition_run_id;
  END IF;

  -- Insert rounds 1-3 if they don't already exist (ON CONFLICT resets to pending)
  FOR i IN 1..3 LOOP
    INSERT INTO public.rounds (
      competition_run_id,
      round_number,
      round_type,
      status,
      market_status,
      trading_status
    ) VALUES (
      p_competition_run_id,
      i,
      v_round_types[i],
      'pending',
      'closed',
      'paused'
    )
    ON CONFLICT (competition_run_id, round_number) DO UPDATE
      SET status = 'pending',
          started_at = NULL,
          ends_at = NULL,
          market_status = 'closed',
          trading_status = 'paused',
          updated_at = now();

    -- Count rows actually inserted (not conflicted)
    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  END LOOP;

  -- Return current state of all rounds for this run
  RETURN jsonb_build_object(
    'ok', true,
    'competition_run_id', p_competition_run_id,
    'rounds', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id,
        'round_number', r.round_number,
        'round_type', r.round_type,
        'status', r.status
      ) ORDER BY r.round_number)
      FROM public.rounds r
      WHERE r.competition_run_id = p_competition_run_id
    )
  );
END;
$$;

COMMENT ON FUNCTION public.provision_rounds(uuid)
  IS 'Admin RPC: ensure all 3 rounds exist for a competition run. Idempotent — safe to call multiple times.';

-- Grant permissions
REVOKE EXECUTE ON FUNCTION public.provision_rounds(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provision_rounds(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.provision_rounds(uuid) TO service_role;

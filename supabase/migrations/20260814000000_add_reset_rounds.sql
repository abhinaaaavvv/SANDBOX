-- Migration: Add reset_rounds() RPC for admin to reset completed rounds back to pending
-- This allows admins to restart a competition run after all rounds have been completed.

CREATE OR REPLACE FUNCTION public.reset_rounds(p_competition_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run record;
  v_updated_count integer;
BEGIN
  PERFORM public.assert_admin();

  SELECT * INTO v_run
  FROM public.competition_runs
  WHERE id = p_competition_run_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMPETITION_RUN_NOT_FOUND: %', p_competition_run_id;
  END IF;

  -- Reset all rounds in this run back to pending
  UPDATE public.rounds
  SET status = 'pending',
      started_at = NULL,
      ends_at = NULL,
      market_status = 'closed',
      trading_status = 'paused',
      updated_at = now()
  WHERE competition_run_id = p_competition_run_id
    AND status IN ('active', 'completed');

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'competition_run_id', p_competition_run_id,
    'rounds_reset', v_updated_count
  );
END;
$$;

COMMENT ON FUNCTION public.reset_rounds(uuid) IS 'Admin: reset all rounds in a competition run back to pending state.';

-- Grant permissions
REVOKE EXECUTE ON FUNCTION public.reset_rounds(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_rounds(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_rounds(uuid) TO service_role;

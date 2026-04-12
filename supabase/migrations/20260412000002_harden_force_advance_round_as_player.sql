-- Migration: Harden force_advance_round_as_player for timeout fallback recovery
-- Purpose:
-- 1) Return structured payload (not bare boolean) for deterministic client recovery.
-- 2) Keep timeout checks server-authoritative.
-- 3) Treat stale callers idempotently when the round already advanced.

CREATE OR REPLACE FUNCTION public.force_advance_round_as_player(
  p_round_id UUID,
  p_player_id UUID,
  p_player_token TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  round_id UUID,
  new_round_status TEXT,
  game_id UUID,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_round public.game_rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_controller_id UUID;
  v_deadline TIMESTAMPTZ;
  v_allowed_after TIMESTAMPTZ;
BEGIN
  SELECT gr.*
  INTO v_round
  FROM public.game_rounds gr
  WHERE gr.id = p_round_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Round not found';
  END IF;

  PERFORM public.private_assert_player_session(v_round.game_id, p_player_id, p_player_token, TRUE);

  SELECT g.*
  INTO v_game
  FROM public.games g
  WHERE g.id = v_round.game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found';
  END IF;

  v_deadline := COALESCE(v_round.timer_starts_at, NOW())
    + make_interval(secs => COALESCE(v_round.timer_duration, 0));
  v_controller_id := COALESCE(v_game.host_id, v_game.phase_captain_id);

  IF v_round.status = 'completed' THEN
    RETURN QUERY SELECT
      TRUE,
      v_round.id,
      v_round.status::TEXT,
      v_round.game_id,
      'Round already completed'::TEXT;
    RETURN;
  END IF;

  -- Stale caller path: round has already moved to voting and timer is still active.
  IF v_round.status = 'voting' AND NOW() < v_deadline THEN
    RETURN QUERY SELECT
      TRUE,
      v_round.id,
      v_round.status::TEXT,
      v_round.game_id,
      'Round already advanced to voting'::TEXT;
    RETURN;
  END IF;

  IF v_controller_id IS NOT NULL AND v_controller_id = p_player_id THEN
    v_allowed_after := v_deadline;
  ELSE
    v_allowed_after := v_deadline + interval '5 seconds';
  END IF;

  IF NOW() < v_allowed_after THEN
    RAISE EXCEPTION 'Timer has not expired yet';
  END IF;

  PERFORM public.force_advance_round(p_round_id);

  SELECT gr.*
  INTO v_round
  FROM public.game_rounds gr
  WHERE gr.id = p_round_id;

  RETURN QUERY SELECT
    TRUE,
    v_round.id,
    v_round.status::TEXT,
    v_round.game_id,
    'Round advanced successfully'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.force_advance_round_as_player(UUID, UUID, TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.force_advance_round_as_player(UUID, UUID, TEXT) IS
'Returns structured force-advance result. Controller can advance at expiry; any valid player after +5s grace. Stale calls are idempotent.';

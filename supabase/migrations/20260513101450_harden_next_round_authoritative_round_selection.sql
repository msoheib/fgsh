-- Make manual next-round advancement robust when duplicate round rows exist.
--
-- Older recovery code can tolerate duplicate game_rounds rows by choosing the
-- most authoritative status. This RPC must use the same rule; otherwise a stale
-- answering duplicate can block a completed round from advancing.

CREATE OR REPLACE FUNCTION public.advance_to_next_round_by_player(
  p_game_id UUID,
  p_player_id UUID,
  p_player_token TEXT
)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_controller_id UUID;
  v_current_round_status TEXT;
  v_next_round INTEGER;
BEGIN
  PERFORM public.private_assert_player_session(p_game_id, p_player_id, p_player_token, TRUE);

  SELECT g.*
  INTO v_game
  FROM public.games g
  WHERE g.id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Game not found'::TEXT;
    RETURN;
  END IF;

  IF v_game.status <> 'playing' THEN
    RETURN QUERY SELECT FALSE, ('Game is not in playing state (' || v_game.status || ')')::TEXT;
    RETURN;
  END IF;

  v_controller_id := COALESCE(v_game.phase_captain_id, v_game.host_id);
  IF v_controller_id IS NOT NULL AND v_controller_id <> p_player_id THEN
    RETURN QUERY SELECT FALSE, 'Only the game controller can advance to next round'::TEXT;
    RETURN;
  END IF;

  SELECT gr.status
  INTO v_current_round_status
  FROM public.game_rounds gr
  WHERE gr.game_id = p_game_id
    AND gr.round_number = v_game.current_round
  ORDER BY
    CASE gr.status
      WHEN 'completed' THEN 3
      WHEN 'voting' THEN 2
      WHEN 'answering' THEN 1
      ELSE 0
    END DESC,
    gr.updated_at DESC NULLS LAST,
    gr.created_at DESC
  LIMIT 1;

  IF v_current_round_status IS NOT NULL AND v_current_round_status <> 'completed' THEN
    RETURN QUERY SELECT FALSE, ('Current round must be completed before advancing (status: ' || v_current_round_status || ')')::TEXT;
    RETURN;
  END IF;

  v_next_round := v_game.current_round + 1;

  IF v_next_round > v_game.round_count THEN
    UPDATE public.games
    SET
      status = 'finished',
      updated_at = NOW()
    WHERE id = p_game_id;

    RETURN QUERY SELECT TRUE, 'Game finished'::TEXT;
    RETURN;
  END IF;

  UPDATE public.games
  SET
    current_round = v_next_round,
    updated_at = NOW()
  WHERE id = p_game_id;

  RETURN QUERY SELECT TRUE, ('Advanced to round ' || v_next_round)::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.advance_to_next_round_by_player(UUID, UUID, TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.advance_to_next_round_by_player(UUID, UUID, TEXT) IS
'Advances to the next round using phase-captain authority and authoritative duplicate-round status selection.';

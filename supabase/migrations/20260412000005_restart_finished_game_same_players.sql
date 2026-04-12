-- Migration: restart a finished game with the same players and code

CREATE OR REPLACE FUNCTION public.restart_finished_game_as_player(
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

  IF v_game.status <> 'finished' THEN
    RETURN QUERY SELECT FALSE, 'Only finished games can be restarted'::TEXT;
    RETURN;
  END IF;

  v_controller_id := COALESCE(v_game.host_id, v_game.phase_captain_id);
  IF v_controller_id IS NOT NULL AND v_controller_id <> p_player_id THEN
    RETURN QUERY SELECT FALSE, 'Only the game controller can restart the game'::TEXT;
    RETURN;
  END IF;

  DELETE FROM public.game_category_prompts
  WHERE game_id = p_game_id;

  DELETE FROM public.game_rounds
  WHERE game_id = p_game_id;

  UPDATE public.players
  SET score = 0
  WHERE game_id = p_game_id;

  UPDATE public.games
  SET
    status = 'waiting',
    current_round = 0,
    updated_at = NOW()
  WHERE id = p_game_id;

  RETURN QUERY SELECT TRUE, 'Game reset to lobby'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.restart_finished_game_as_player(UUID, UUID, TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.restart_finished_game_as_player(UUID, UUID, TEXT) IS
'Resets a finished game back to the lobby while keeping the same game code and players.';

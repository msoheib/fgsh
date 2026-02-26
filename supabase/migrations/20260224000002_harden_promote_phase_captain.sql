-- Migration: Harden promote_phase_captain for anon gameplay and full failover
-- Updates:
-- 1) Allow anon execute (phone players are often anonymous)
-- 2) Keep host_id aligned with promoted captain
-- 3) Finish game when no eligible captain remains

DROP FUNCTION IF EXISTS promote_phase_captain(UUID, UUID);

CREATE OR REPLACE FUNCTION promote_phase_captain(
  p_game_id UUID,
  p_disconnected_player_id UUID
)
RETURNS TABLE(
  success BOOLEAN,
  new_captain_id UUID,
  message TEXT
) AS $$
DECLARE
  v_current_captain_id UUID;
  v_new_captain_id UUID;
  v_game_status VARCHAR(20);
BEGIN
  -- Lock the game row to prevent concurrent updates
  SELECT phase_captain_id, status
  INTO v_current_captain_id, v_game_status
  FROM games
  WHERE id = p_game_id
  FOR UPDATE;

  IF v_game_status IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Game not found'::TEXT;
    RETURN;
  END IF;

  IF v_game_status = 'finished' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Cannot promote captain in finished game'::TEXT;
    RETURN;
  END IF;

  IF v_current_captain_id != p_disconnected_player_id THEN
    RETURN QUERY SELECT FALSE, v_current_captain_id, 'Player is not the current captain'::TEXT;
    RETURN;
  END IF;

  -- Prefer connected players by join order.
  SELECT p.id INTO v_new_captain_id
  FROM players p
  WHERE p.game_id = p_game_id
    AND p.id <> p_disconnected_player_id
    AND p.connection_status = 'connected'
  ORDER BY p.joined_at ASC
  LIMIT 1;

  -- If no connected players remain, finish game.
  IF v_new_captain_id IS NULL THEN
    UPDATE games
    SET
      status = 'finished',
      phase_captain_id = NULL,
      updated_at = NOW()
    WHERE id = p_game_id;

    RETURN QUERY SELECT TRUE, NULL::UUID, 'No eligible players to promote. Game finished.'::TEXT;
    RETURN;
  END IF;

  UPDATE games
  SET
    phase_captain_id = v_new_captain_id,
    host_id = v_new_captain_id,
    updated_at = NOW()
  WHERE id = p_game_id;

  RETURN QUERY SELECT TRUE, v_new_captain_id, 'Captain promoted successfully'::TEXT;
EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION promote_phase_captain(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION promote_phase_captain(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION promote_phase_captain IS
'Atomically promotes a new phase captain when current captain disconnects. Updates host_id and finishes game if nobody is eligible.';

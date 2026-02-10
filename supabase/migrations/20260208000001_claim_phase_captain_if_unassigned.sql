-- Migration: Add secure captain-claim RPC for games without a phase captain
-- Allows a connected player in the game to claim phase captain when unassigned

DROP FUNCTION IF EXISTS claim_phase_captain_if_unassigned(UUID, UUID);

CREATE OR REPLACE FUNCTION claim_phase_captain_if_unassigned(
  p_game_id UUID,
  p_player_id UUID
)
RETURNS TABLE(
  success BOOLEAN,
  phase_captain_id UUID,
  message TEXT
) AS $$
DECLARE
  v_current_captain_id UUID;
  v_game_status VARCHAR(20);
  v_player_game_id UUID;
  v_player_status TEXT;
BEGIN
  -- Lock the game row so captain assignment is atomic under concurrent joins
  SELECT g.phase_captain_id, g.status
  INTO v_current_captain_id, v_game_status
  FROM games g
  WHERE g.id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Game not found'::TEXT;
    RETURN;
  END IF;

  -- Verify player belongs to this game and is currently connected
  SELECT p.game_id, p.connection_status
  INTO v_player_game_id, v_player_status
  FROM players p
  WHERE p.id = p_player_id;

  IF v_player_game_id IS NULL OR v_player_game_id != p_game_id THEN
    RETURN QUERY SELECT FALSE, v_current_captain_id, 'Player is not part of this game'::TEXT;
    RETURN;
  END IF;

  IF v_player_status IS DISTINCT FROM 'connected' THEN
    RETURN QUERY SELECT FALSE, v_current_captain_id, 'Player is not connected'::TEXT;
    RETURN;
  END IF;

  -- If a captain already exists, return it (idempotent behavior)
  IF v_current_captain_id IS NOT NULL THEN
    RETURN QUERY SELECT TRUE, v_current_captain_id, 'Captain already assigned'::TEXT;
    RETURN;
  END IF;

  -- Do not assign captain after the game has finished
  IF v_game_status = 'finished' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Cannot claim captain in finished game'::TEXT;
    RETURN;
  END IF;

  UPDATE games
  SET phase_captain_id = p_player_id,
      updated_at = NOW()
  WHERE id = p_game_id;

  RETURN QUERY SELECT TRUE, p_player_id, 'Captain claimed successfully'::TEXT;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION claim_phase_captain_if_unassigned(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION claim_phase_captain_if_unassigned(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION claim_phase_captain_if_unassigned IS
'Atomically claims phase captain for a game when no captain is assigned and caller player belongs to the game.';

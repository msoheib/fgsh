-- ================================================
-- Atomic Phase Captain Promotion
-- ================================================
-- This migration adds an RPC function for atomic phase captain promotion
-- to prevent race conditions when multiple players try to promote simultaneously

-- Drop function if exists (for idempotency)
DROP FUNCTION IF EXISTS promote_phase_captain(UUID, UUID);

-- Create atomic captain promotion function
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
  SELECT phase_captain_id, status INTO v_current_captain_id, v_game_status
  FROM games
  WHERE id = p_game_id
  FOR UPDATE;

  -- Check if game exists and is active
  IF v_game_status IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Game not found'::TEXT;
    RETURN;
  END IF;

  IF v_game_status = 'finished' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Cannot promote captain in finished game'::TEXT;
    RETURN;
  END IF;

  -- Check if the disconnected player is actually the current captain
  IF v_current_captain_id != p_disconnected_player_id THEN
    RETURN QUERY SELECT FALSE, v_current_captain_id, 'Player is not the current captain'::TEXT;
    RETURN;
  END IF;

  -- Find the next eligible captain
  -- Priority: 1) Host if still connected, 2) Longest connected player
  SELECT p.id INTO v_new_captain_id
  FROM players p
  WHERE p.game_id = p_game_id
    AND p.id != p_disconnected_player_id
    AND p.connection_status = 'connected'
  ORDER BY
    p.is_host DESC,  -- Prefer host
    p.joined_at ASC  -- Then longest connected player
  LIMIT 1;

  -- If no connected players found, try any remaining player
  IF v_new_captain_id IS NULL THEN
    SELECT p.id INTO v_new_captain_id
    FROM players p
    WHERE p.game_id = p_game_id
      AND p.id != p_disconnected_player_id
    ORDER BY
      p.is_host DESC,
      p.joined_at ASC
    LIMIT 1;
  END IF;

  -- If still no captain found, game is empty
  IF v_new_captain_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'No eligible players to promote'::TEXT;
    RETURN;
  END IF;

  -- Update the game with new captain (atomic operation)
  UPDATE games
  SET phase_captain_id = v_new_captain_id,
      updated_at = NOW()
  WHERE id = p_game_id;

  -- Log the promotion
  RAISE NOTICE 'Promoted player % to phase captain for game %', v_new_captain_id, p_game_id;

  RETURN QUERY SELECT TRUE, v_new_captain_id, 'Captain promoted successfully'::TEXT;

EXCEPTION
  WHEN OTHERS THEN
    -- If any error occurs, return failure
    RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION promote_phase_captain TO authenticated;

-- Add comment
COMMENT ON FUNCTION promote_phase_captain IS 'Atomically promotes a new phase captain when the current captain disconnects. Uses row-level locking to prevent race conditions.';
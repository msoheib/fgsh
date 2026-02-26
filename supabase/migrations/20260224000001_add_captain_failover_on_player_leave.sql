-- Migration: Atomic player leave with captain failover
-- Behavior:
-- 1) Mark leaving player as disconnected
-- 2) If leaving player is current phase captain, promote next connected player
--    - Prefer first player who joined after the leaving captain
--    - Fallback to earliest connected player
-- 3) If no connected players remain, finish the game

DROP FUNCTION IF EXISTS leave_game_as_player(UUID, UUID);

CREATE OR REPLACE FUNCTION leave_game_as_player(
  p_game_id UUID,
  p_player_id UUID
)
RETURNS TABLE(
  success BOOLEAN,
  game_ended BOOLEAN,
  new_captain_id UUID,
  message TEXT
) AS $$
DECLARE
  v_game RECORD;
  v_player RECORD;
  v_new_captain_id UUID;
BEGIN
  -- Lock game row for atomic leave/failover.
  SELECT g.*
  INTO v_game
  FROM games g
  WHERE g.id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, FALSE, NULL::UUID, 'Game not found'::TEXT;
    RETURN;
  END IF;

  -- Ensure player belongs to this game.
  SELECT p.*
  INTO v_player
  FROM players p
  WHERE p.id = p_player_id
    AND p.game_id = p_game_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, FALSE, v_game.phase_captain_id, 'Player is not part of this game'::TEXT;
    RETURN;
  END IF;

  -- Idempotent: if already disconnected, report current game control state.
  IF v_player.connection_status = 'disconnected' THEN
    RETURN QUERY SELECT TRUE, (v_game.status = 'finished'), v_game.phase_captain_id, 'Player already disconnected'::TEXT;
    RETURN;
  END IF;

  UPDATE players
  SET connection_status = 'disconnected'
  WHERE id = p_player_id;

  -- If game already finished, nothing else to do.
  IF v_game.status = 'finished' THEN
    RETURN QUERY SELECT TRUE, TRUE, v_game.phase_captain_id, 'Game already finished'::TEXT;
    RETURN;
  END IF;

  -- If captain is leaving, choose replacement.
  IF v_game.phase_captain_id = p_player_id THEN
    -- 1) Prefer next connected player after captain's join time.
    SELECT p.id INTO v_new_captain_id
    FROM players p
    WHERE p.game_id = p_game_id
      AND p.id <> p_player_id
      AND p.connection_status = 'connected'
      AND p.joined_at > v_player.joined_at
    ORDER BY p.joined_at ASC
    LIMIT 1;

    -- 2) Fallback to earliest connected player.
    IF v_new_captain_id IS NULL THEN
      SELECT p.id INTO v_new_captain_id
      FROM players p
      WHERE p.game_id = p_game_id
        AND p.id <> p_player_id
        AND p.connection_status = 'connected'
      ORDER BY p.joined_at ASC
      LIMIT 1;
    END IF;

    IF v_new_captain_id IS NOT NULL THEN
      -- Keep controller pointers aligned with the promoted captain.
      UPDATE games
      SET
        phase_captain_id = v_new_captain_id,
        host_id = v_new_captain_id,
        updated_at = NOW()
      WHERE id = p_game_id;

      RETURN QUERY SELECT TRUE, FALSE, v_new_captain_id, 'Captain transferred successfully'::TEXT;
      RETURN;
    END IF;

    -- No connected players left => finish game.
    UPDATE games
    SET
      status = 'finished',
      phase_captain_id = NULL,
      updated_at = NOW()
    WHERE id = p_game_id;

    RETURN QUERY SELECT TRUE, TRUE, NULL::UUID, 'No connected players left. Game finished.'::TEXT;
    RETURN;
  END IF;

  -- Non-captain left. If no connected players remain, finish game.
  IF NOT EXISTS (
    SELECT 1
    FROM players p
    WHERE p.game_id = p_game_id
      AND p.connection_status = 'connected'
  ) THEN
    UPDATE games
    SET
      status = 'finished',
      phase_captain_id = NULL,
      updated_at = NOW()
    WHERE id = p_game_id;

    RETURN QUERY SELECT TRUE, TRUE, NULL::UUID, 'No connected players left. Game finished.'::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT TRUE, FALSE, v_game.phase_captain_id, 'Player disconnected'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION leave_game_as_player(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION leave_game_as_player(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION leave_game_as_player IS
'Atomically handles player leave: marks disconnected, transfers captain if needed, and finishes game only when no connected players remain.';

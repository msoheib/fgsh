-- Migration: Allow connected players to control game flow under host-auth RLS
-- Purpose:
-- 1) Start a game from a joined player session (even when direct games UPDATE is blocked by RLS)
-- 2) Advance rounds from a joined player session with the same safety checks

DROP FUNCTION IF EXISTS start_game_as_player(UUID, UUID);
DROP FUNCTION IF EXISTS advance_to_next_round_by_player(UUID, UUID);

CREATE OR REPLACE FUNCTION start_game_as_player(
  p_game_id UUID,
  p_player_id UUID
)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT
) AS $$
DECLARE
  v_game RECORD;
  v_player_game_id UUID;
BEGIN
  -- Lock game row to prevent concurrent starts.
  SELECT g.*
  INTO v_game
  FROM games g
  WHERE g.id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Game not found'::TEXT;
    RETURN;
  END IF;

  IF v_game.status <> 'waiting' THEN
    RETURN QUERY SELECT FALSE, ('Game is already ' || v_game.status)::TEXT;
    RETURN;
  END IF;

  -- Ensure caller player belongs to this game.
  SELECT p.game_id
  INTO v_player_game_id
  FROM players p
  WHERE p.id = p_player_id;

  IF v_player_game_id IS NULL OR v_player_game_id <> p_game_id THEN
    RETURN QUERY SELECT FALSE, 'Player is not part of this game'::TEXT;
    RETURN;
  END IF;

  -- Keep host/captain anchored when missing (display-created games).
  UPDATE games
  SET
    status = 'playing',
    current_round = 1,
    host_id = COALESCE(host_id, p_player_id),
    phase_captain_id = COALESCE(phase_captain_id, p_player_id),
    updated_at = NOW()
  WHERE id = p_game_id;

  RETURN QUERY SELECT TRUE, 'Game started'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION start_game_as_player(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION start_game_as_player(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION start_game_as_player IS
'Starts a waiting game for a player who belongs to that game. SECURITY DEFINER for host-auth RLS compatibility.';

CREATE OR REPLACE FUNCTION advance_to_next_round_by_player(
  p_game_id UUID,
  p_player_id UUID
)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT
) AS $$
DECLARE
  v_game RECORD;
  v_next_round INTEGER;
  v_player_game_id UUID;
BEGIN
  -- Lock game row to serialize round advancement.
  SELECT g.*
  INTO v_game
  FROM games g
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

  -- Ensure caller player belongs to this game.
  SELECT p.game_id
  INTO v_player_game_id
  FROM players p
  WHERE p.id = p_player_id;

  IF v_player_game_id IS NULL OR v_player_game_id <> p_game_id THEN
    RETURN QUERY SELECT FALSE, 'Player is not part of this game'::TEXT;
    RETURN;
  END IF;

  v_next_round := v_game.current_round + 1;

  IF v_next_round > v_game.round_count THEN
    UPDATE games
    SET
      status = 'finished',
      host_id = COALESCE(host_id, p_player_id),
      phase_captain_id = COALESCE(phase_captain_id, p_player_id),
      updated_at = NOW()
    WHERE id = p_game_id;

    RETURN QUERY SELECT TRUE, 'Game finished'::TEXT;
    RETURN;
  END IF;

  UPDATE games
  SET
    current_round = v_next_round,
    host_id = COALESCE(host_id, p_player_id),
    phase_captain_id = COALESCE(phase_captain_id, p_player_id),
    updated_at = NOW()
  WHERE id = p_game_id;

  RETURN QUERY SELECT TRUE, ('Advanced to round ' || v_next_round)::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION advance_to_next_round_by_player(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION advance_to_next_round_by_player(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION advance_to_next_round_by_player IS
'Advances game round for a player who belongs to the game. SECURITY DEFINER for host-auth RLS compatibility.';


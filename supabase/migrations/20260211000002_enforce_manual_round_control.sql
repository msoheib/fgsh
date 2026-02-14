-- Migration: Enforce manual round progression with controller-only advancement
-- Purpose:
-- 1) Prevent automatic jump to next round after voting completes
-- 2) Require explicit manual advance by controller (host/captain)

-- -----------------------------------------------------------------------------
-- 1) Server-side phase transitions: answering -> voting -> completed only
--    (do NOT increment games.current_round here)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION advance_round_if_ready(p_round_id UUID)
RETURNS VOID AS $$
DECLARE
  v_round RECORD;
  v_required_players INTEGER;
  v_answer_count INTEGER;
  v_vote_count INTEGER;
  v_correct_answer_exists BOOLEAN;
BEGIN
  SELECT gr.* INTO v_round
  FROM game_rounds gr
  WHERE gr.id = p_round_id
  FOR UPDATE;

  IF v_round IS NULL OR v_round.status = 'completed' THEN
    RETURN;
  END IF;

  v_required_players := GREATEST(COALESCE(v_round.required_players, 2), 2);

  -- ANSWERING -> VOTING
  IF v_round.status = 'answering' THEN
    SELECT COUNT(*) INTO v_answer_count
    FROM player_answers pa
    WHERE pa.round_id = p_round_id
      AND pa.is_correct = false;

    IF v_answer_count >= v_required_players THEN
      SELECT EXISTS (
        SELECT 1
        FROM player_answers pa
        WHERE pa.round_id = p_round_id
          AND pa.is_correct = true
      ) INTO v_correct_answer_exists;

      IF NOT v_correct_answer_exists THEN
        INSERT INTO player_answers (round_id, player_id, answer_text, is_correct)
        SELECT
          p_round_id,
          NULL::UUID,
          q.correct_answer,
          true
        FROM questions q
        WHERE q.id = v_round.question_id
        ON CONFLICT DO NOTHING;
      END IF;

      UPDATE game_rounds
      SET
        status = 'voting',
        timer_duration = 20,
        timer_starts_at = NOW()
      WHERE id = p_round_id;
    END IF;

    RETURN;
  END IF;

  -- VOTING -> COMPLETED
  IF v_round.status = 'voting' THEN
    SELECT COUNT(DISTINCT v.voter_id) INTO v_vote_count
    FROM votes v
    WHERE v.round_id = p_round_id;

    IF v_vote_count >= v_required_players THEN
      BEGIN
        PERFORM calculate_and_update_scores(p_round_id, v_round.game_id);
      EXCEPTION
        WHEN undefined_function THEN
          NULL;
      END;

      UPDATE game_rounds
      SET status = 'completed'
      WHERE id = p_round_id;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION advance_round_if_ready IS
'Transitions only within a round (answering->voting->completed). Manual controller action is required to move to next round.';

CREATE OR REPLACE FUNCTION force_advance_round(p_round_id UUID)
RETURNS VOID AS $$
DECLARE
  v_round RECORD;
  v_correct_answer_exists BOOLEAN;
BEGIN
  SELECT gr.* INTO v_round
  FROM game_rounds gr
  WHERE gr.id = p_round_id
  FOR UPDATE;

  IF v_round IS NULL OR v_round.status = 'completed' THEN
    RETURN;
  END IF;

  -- ANSWERING -> VOTING (timer force)
  IF v_round.status = 'answering' THEN
    SELECT EXISTS (
      SELECT 1
      FROM player_answers pa
      WHERE pa.round_id = p_round_id
        AND pa.is_correct = true
    ) INTO v_correct_answer_exists;

    IF NOT v_correct_answer_exists THEN
      INSERT INTO player_answers (round_id, player_id, answer_text, is_correct)
      SELECT
        p_round_id,
        NULL::UUID,
        q.correct_answer,
        true
      FROM questions q
      WHERE q.id = v_round.question_id
      ON CONFLICT DO NOTHING;
    END IF;

    UPDATE game_rounds
    SET
      status = 'voting',
      timer_duration = 20,
      timer_starts_at = NOW()
    WHERE id = p_round_id;

    RETURN;
  END IF;

  -- VOTING -> COMPLETED (timer force)
  IF v_round.status = 'voting' THEN
    BEGIN
      PERFORM calculate_and_update_scores(p_round_id, v_round.game_id);
    EXCEPTION
      WHEN undefined_function THEN
        NULL;
    END;

    UPDATE game_rounds
    SET status = 'completed'
    WHERE id = p_round_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION force_advance_round IS
'Forces current phase transition only. Does not advance game.current_round.';

-- -----------------------------------------------------------------------------
-- 2) Controller-only start and manual next-round progression
-- -----------------------------------------------------------------------------
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
  v_controller_id UUID;
BEGIN
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

  SELECT p.game_id
  INTO v_player_game_id
  FROM players p
  WHERE p.id = p_player_id;

  IF v_player_game_id IS NULL OR v_player_game_id <> p_game_id THEN
    RETURN QUERY SELECT FALSE, 'Player is not part of this game'::TEXT;
    RETURN;
  END IF;

  v_controller_id := COALESCE(v_game.host_id, v_game.phase_captain_id);
  IF v_controller_id IS NOT NULL AND v_controller_id <> p_player_id THEN
    RETURN QUERY SELECT FALSE, 'Only the game controller can start the game'::TEXT;
    RETURN;
  END IF;

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
'Starts a waiting game only when called by the controller (host/captain) and a valid player in that game.';

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
  v_controller_id UUID;
  v_current_round_status TEXT;
BEGIN
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

  SELECT p.game_id
  INTO v_player_game_id
  FROM players p
  WHERE p.id = p_player_id;

  IF v_player_game_id IS NULL OR v_player_game_id <> p_game_id THEN
    RETURN QUERY SELECT FALSE, 'Player is not part of this game'::TEXT;
    RETURN;
  END IF;

  v_controller_id := COALESCE(v_game.host_id, v_game.phase_captain_id);
  IF v_controller_id IS NOT NULL AND v_controller_id <> p_player_id THEN
    RETURN QUERY SELECT FALSE, 'Only the game controller can advance to next round'::TEXT;
    RETURN;
  END IF;

  SELECT gr.status INTO v_current_round_status
  FROM game_rounds gr
  WHERE gr.game_id = p_game_id
    AND gr.round_number = v_game.current_round;

  IF v_current_round_status IS NOT NULL AND v_current_round_status <> 'completed' THEN
    RETURN QUERY SELECT FALSE, ('Current round must be completed before advancing (status: ' || v_current_round_status || ')')::TEXT;
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
'Advances game only when called by the controller and after current round is completed.';


-- Migration: Qualify player_id references in force_advance_round
-- Purpose: Avoid ambiguous column errors (42702) triggered by RPC calls

CREATE OR REPLACE FUNCTION force_advance_round(p_round_id UUID)
RETURNS VOID AS $$
DECLARE
  v_round game_rounds%ROWTYPE;
  v_game games%ROWTYPE;
  v_next_round_number INTEGER;
BEGIN
  -- Lock current round to prevent concurrent updates
  SELECT * INTO v_round
  FROM game_rounds
  WHERE game_rounds.id = p_round_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Lock the parent game to coordinate round advancement
  SELECT * INTO v_game
  FROM games
  WHERE games.id = v_round.game_id
  FOR UPDATE;

  -- If timer expires during answering, add correct answer and move to voting
  IF v_round.status = 'answering' THEN
    INSERT INTO player_answers (round_id, player_id, answer_text, is_correct)
    SELECT
      p_round_id,
      NULL, -- System answer (no player)
      q.correct_answer,
      true
    FROM questions AS q
    WHERE q.id = v_round.question_id
    ON CONFLICT DO NOTHING;

    UPDATE game_rounds
    SET status = 'voting',
        timer_duration = 20
    WHERE game_rounds.id = p_round_id;

    RETURN;
  END IF;

  -- If timer expires during voting, force scoring even if votes are missing
  IF v_round.status = 'voting' THEN
    PERFORM calculate_and_update_scores(p_round_id, v_game.id);

    UPDATE game_rounds
    SET status = 'completed'
    WHERE game_rounds.id = p_round_id;

    v_next_round_number := v_game.current_round + 1;

    IF v_next_round_number > v_game.round_count THEN
      UPDATE games
      SET status = 'finished'
      WHERE games.id = v_game.id;
    ELSE
      UPDATE games
      SET current_round = v_next_round_number
      WHERE games.id = v_game.id;
    END IF;

    RETURN;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION force_advance_round IS
  'Forces round to advance when timer expires, with fully qualified player_id references.';



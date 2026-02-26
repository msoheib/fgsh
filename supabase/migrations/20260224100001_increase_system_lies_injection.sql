-- Migration: Increase system lies injection count
-- Previously: ≤3 players → 2, ≤5 → 1, ≥6 → 0
-- Now: Always inject lies. Small games get 3, large games get 2.
-- Formula: LEAST(3, GREATEST(2, 7 - connected_players))
--   2 players → 3 lies
--   3 players → 3 lies
--   4 players → 3 lies
--   5 players → 2 lies
--   6+ players → 2 lies

-- ============================================================================
-- UPDATE advance_round_if_ready with more generous lie injection
-- ============================================================================

CREATE OR REPLACE FUNCTION advance_round_if_ready(p_round_id UUID)
RETURNS VOID AS $$
DECLARE
  v_round RECORD;
  v_required_players INTEGER;
  v_answer_count INTEGER;
  v_vote_count INTEGER;
  v_correct_answer_exists BOOLEAN;
  v_connected_players INTEGER;
  v_lie_count INTEGER;
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

      -- Inject pre-stored system lies from question_lies
      -- More generous formula: always inject 2-3 lies
      SELECT COUNT(*) INTO v_connected_players
      FROM players p
      WHERE p.game_id = v_round.game_id
        AND p.connection_status = 'connected';

      -- LEAST(3, GREATEST(2, 7 - players)): 2-3 lies always
      v_lie_count := LEAST(3, GREATEST(2, 7 - v_connected_players));

      INSERT INTO player_answers (round_id, player_id, answer_text, is_correct)
      SELECT
        p_round_id,
        NULL::UUID,
        ql.lie_text,
        false
      FROM question_lies ql
      WHERE ql.question_id = v_round.question_id
        -- Avoid duplicating any player-submitted answers
        AND NOT EXISTS (
          SELECT 1 FROM player_answers pa
          WHERE pa.round_id = p_round_id
            AND LOWER(TRIM(pa.answer_text)) = LOWER(TRIM(ql.lie_text))
        )
      ORDER BY random()
      LIMIT v_lie_count
      ON CONFLICT DO NOTHING;

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
'Transitions only within a round (answering->voting->completed). Injects 2-3 pre-stored system lies from question_lies during answering->voting.';

-- ============================================================================
-- UPDATE force_advance_round with same generous lie injection
-- ============================================================================

CREATE OR REPLACE FUNCTION force_advance_round(p_round_id UUID)
RETURNS VOID AS $$
DECLARE
  v_round RECORD;
  v_correct_answer_exists BOOLEAN;
  v_connected_players INTEGER;
  v_lie_count INTEGER;
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

    -- Inject pre-stored system lies from question_lies
    -- More generous formula: always inject 2-3 lies
    SELECT COUNT(*) INTO v_connected_players
    FROM players p
    WHERE p.game_id = v_round.game_id
      AND p.connection_status = 'connected';

    -- LEAST(3, GREATEST(2, 7 - players)): 2-3 lies always
    v_lie_count := LEAST(3, GREATEST(2, 7 - v_connected_players));

    INSERT INTO player_answers (round_id, player_id, answer_text, is_correct)
    SELECT
      p_round_id,
      NULL::UUID,
      ql.lie_text,
      false
    FROM question_lies ql
    WHERE ql.question_id = v_round.question_id
      AND NOT EXISTS (
        SELECT 1 FROM player_answers pa
        WHERE pa.round_id = p_round_id
          AND LOWER(TRIM(pa.answer_text)) = LOWER(TRIM(ql.lie_text))
      )
    ORDER BY random()
    LIMIT v_lie_count
    ON CONFLICT DO NOTHING;

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
'Forces current phase transition only. Injects 2-3 pre-stored system lies during answering->voting. Does not advance game.current_round.';

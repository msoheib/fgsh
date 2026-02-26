-- Migration: Fix voting quorum regression and trigger drift
-- Goal:
-- 1) Always use fixed round quorum (required_players) with a minimum of 2
-- 2) Prevent accidental early round completion after a single vote
-- 3) Recreate answer/vote triggers with explicit trigger functions

-- ============================================================================
-- Round progression with strict quorum
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

  -- Connected count is informational fallback only.
  SELECT COUNT(*) INTO v_connected_players
  FROM players p
  WHERE p.game_id = v_round.game_id
    AND p.connection_status = 'connected';

  -- Strict quorum: never below 2, never below the round's captured quorum.
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

      -- Optional system lie injection if question_lies exists.
      IF to_regclass('public.question_lies') IS NOT NULL THEN
        v_lie_count := LEAST(3, GREATEST(2, 7 - GREATEST(v_connected_players, 1)));

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
'Round transition guard using strict fixed quorum (required_players, min 2). Prevents one-vote completion regressions.';

-- ============================================================================
-- Force advance (timer path)
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

    IF to_regclass('public.question_lies') IS NOT NULL THEN
      SELECT COUNT(*) INTO v_connected_players
      FROM players p
      WHERE p.game_id = v_round.game_id
        AND p.connection_status = 'connected';

      v_lie_count := LEAST(3, GREATEST(2, 7 - GREATEST(v_connected_players, 1)));

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
'Forces current phase transition only. Preserves strict fixed quorum semantics for normal progression.';

-- ============================================================================
-- Trigger functions (explicit and stable)
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_check_round_after_answer()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent recursion from system-inserted correct answer.
  IF NEW.is_correct THEN
    RETURN NEW;
  END IF;

  PERFORM advance_round_if_ready(NEW.round_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trigger_check_round_after_vote()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM advance_round_if_ready(NEW.round_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_round_after_answer ON player_answers;
CREATE TRIGGER check_round_after_answer
  AFTER INSERT ON player_answers
  FOR EACH ROW
  EXECUTE FUNCTION trigger_check_round_after_answer();

DROP TRIGGER IF EXISTS check_round_after_vote ON votes;
CREATE TRIGGER check_round_after_vote
  AFTER INSERT ON votes
  FOR EACH ROW
  EXECUTE FUNCTION trigger_check_round_after_vote();

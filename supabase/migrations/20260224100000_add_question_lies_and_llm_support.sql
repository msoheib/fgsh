-- Migration: Add question_lies table and LLM support
-- Purpose: Pre-store AI-generated plausible lies per question for gameplay injection
-- Also adds source tracking column to questions table

-- ============================================================================
-- NEW TABLE: question_lies
-- Stores pre-generated plausible fake answers for each question
-- ============================================================================

CREATE TABLE IF NOT EXISTS question_lies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  lie_text TEXT NOT NULL,
  source VARCHAR(20) NOT NULL DEFAULT 'ai'
    CHECK (source IN ('ai', 'manual')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(question_id, lie_text)
);

CREATE INDEX idx_question_lies_question ON question_lies(question_id);

-- ============================================================================
-- RLS POLICIES for question_lies
-- ============================================================================

ALTER TABLE question_lies ENABLE ROW LEVEL SECURITY;

-- Everyone can read lies (needed during gameplay for injection)
CREATE POLICY "Lies are viewable by everyone"
  ON question_lies
  FOR SELECT
  USING (true);

-- Only admins can insert/update/delete lies
CREATE POLICY "Admins can insert lies"
  ON question_lies
  FOR INSERT
  WITH CHECK (is_current_user_admin());

CREATE POLICY "Admins can update lies"
  ON question_lies
  FOR UPDATE
  USING (is_current_user_admin());

CREATE POLICY "Admins can delete lies"
  ON question_lies
  FOR DELETE
  USING (is_current_user_admin());

-- ============================================================================
-- ADD source COLUMN to questions
-- ============================================================================

ALTER TABLE questions
ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'manual'
  CHECK (source IN ('manual', 'ai'));

COMMENT ON COLUMN questions.source IS 'How the question was created: manual (admin), ai (LLM-generated)';

-- ============================================================================
-- INJECT SYSTEM LIES: Update advance_round_if_ready to inject pre-stored lies
-- When transitioning answering -> voting, also insert random lies from question_lies
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
      -- Determine how many lies to inject based on connected player count
      SELECT COUNT(*) INTO v_connected_players
      FROM players p
      WHERE p.game_id = v_round.game_id
        AND p.connection_status = 'connected';

      IF v_connected_players <= 3 THEN
        v_lie_count := 2;
      ELSIF v_connected_players <= 5 THEN
        v_lie_count := 1;
      ELSE
        v_lie_count := 0;
      END IF;

      IF v_lie_count > 0 THEN
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
'Transitions only within a round (answering->voting->completed). Injects pre-stored system lies from question_lies during answering->voting.';

-- ============================================================================
-- INJECT SYSTEM LIES: Update force_advance_round similarly
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
    SELECT COUNT(*) INTO v_connected_players
    FROM players p
    WHERE p.game_id = v_round.game_id
      AND p.connection_status = 'connected';

    IF v_connected_players <= 3 THEN
      v_lie_count := 2;
    ELSIF v_connected_players <= 5 THEN
      v_lie_count := 1;
    ELSE
      v_lie_count := 0;
    END IF;

    IF v_lie_count > 0 THEN
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
'Forces current phase transition only. Injects pre-stored system lies during answering->voting. Does not advance game.current_round.';

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON question_lies TO anon;
GRANT SELECT ON question_lies TO authenticated;

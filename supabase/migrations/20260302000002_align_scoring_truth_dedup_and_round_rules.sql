-- Migration: Align scoring and truth-duplicate lie handling
-- Enforces:
-- 1) Picking player lies does NOT subtract points from voters.
-- 2) Picking system lies DOES subtract points from voters.
-- 3) Player lies identical to truth are removed before voting.
-- 4) If legacy rows still contain truth-identical lies, score them as truth-equivalent
--    (no lie-author reward, no voter penalty).

CREATE OR REPLACE FUNCTION calculate_and_update_scores(
  p_round_id UUID,
  p_game_id UUID
)
RETURNS TABLE(player_id UUID, points_earned INTEGER, reason TEXT) AS $$
DECLARE
  v_round_number INTEGER;
  v_round_count INTEGER;
  v_multiplier INTEGER := 1;
  v_truth_normalized TEXT;
  v_vote RECORD;
  v_group RECORD;
  v_author RECORD;
BEGIN
  PERFORM 1 FROM game_rounds WHERE id = p_round_id FOR UPDATE;

  SELECT
    gr.round_number,
    g.round_count,
    lower(trim(q.correct_answer))
  INTO v_round_number, v_round_count, v_truth_normalized
  FROM game_rounds gr
  JOIN games g ON g.id = gr.game_id
  LEFT JOIN questions q ON q.id = gr.question_id
  WHERE gr.id = p_round_id;

  IF v_round_number IS NULL THEN
    RETURN;
  END IF;

  IF v_truth_normalized IS NULL THEN
    SELECT lower(trim(pa.answer_text))
    INTO v_truth_normalized
    FROM player_answers pa
    WHERE pa.round_id = p_round_id
      AND pa.is_correct = true
    LIMIT 1;
  END IF;

  IF v_round_number >= v_round_count THEN
    v_multiplier := 3;
  ELSIF v_round_number > (v_round_count / 2.0) THEN
    v_multiplier := 2;
  ELSE
    v_multiplier := 1;
  END IF;

  DROP TABLE IF EXISTS round_scores;
  CREATE TEMP TABLE round_scores (
    p_id UUID,
    pts INTEGER,
    rsn TEXT
  ) ON COMMIT DROP;

  -- Vote outcome points for voters:
  -- +1000 for truth (including truth-equivalent legacy duplicate lies by text)
  -- -500 only for system lies
  -- 0 for player lies
  FOR v_vote IN
    SELECT
      v.voter_id,
      pa.is_correct,
      pa.player_id AS answer_owner_id,
      lower(trim(pa.answer_text)) AS normalized_answer
    FROM votes v
    JOIN player_answers pa ON pa.id = v.answer_id
    WHERE v.round_id = p_round_id
  LOOP
    IF v_vote.is_correct
       OR (v_truth_normalized IS NOT NULL AND v_vote.normalized_answer = v_truth_normalized) THEN
      INSERT INTO round_scores (p_id, pts, rsn)
      VALUES (v_vote.voter_id, 1000 * v_multiplier, 'correct_answer');
    ELSIF v_vote.answer_owner_id IS NULL THEN
      INSERT INTO round_scores (p_id, pts, rsn)
      VALUES (v_vote.voter_id, -500 * v_multiplier, 'fell_for_lie');
    END IF;
  END LOOP;

  -- Player lie author points (+500 per fooled player), excluding truth-identical lies.
  FOR v_group IN
    SELECT
      lower(trim(pa.answer_text)) AS normalized_answer,
      COUNT(v.id) AS fooled_count
    FROM votes v
    JOIN player_answers pa ON pa.id = v.answer_id
    WHERE v.round_id = p_round_id
      AND pa.is_correct = false
      AND pa.player_id IS NOT NULL
      AND (v_truth_normalized IS NULL OR lower(trim(pa.answer_text)) <> v_truth_normalized)
    GROUP BY lower(trim(pa.answer_text))
  LOOP
    FOR v_author IN
      SELECT DISTINCT pa.player_id
      FROM player_answers pa
      WHERE pa.round_id = p_round_id
        AND pa.is_correct = false
        AND pa.player_id IS NOT NULL
        AND lower(trim(pa.answer_text)) = v_group.normalized_answer
        AND (v_truth_normalized IS NULL OR lower(trim(pa.answer_text)) <> v_truth_normalized)
    LOOP
      INSERT INTO round_scores (p_id, pts, rsn)
      VALUES (v_author.player_id, (v_group.fooled_count * 500 * v_multiplier), 'fooled_players');
    END LOOP;
  END LOOP;

  FOR v_author IN
    SELECT p_id, SUM(pts) AS total_points
    FROM round_scores
    GROUP BY p_id
  LOOP
    UPDATE players
    SET score = GREATEST(score + v_author.total_points, 0)
    WHERE id = v_author.p_id;
  END LOOP;

  UPDATE votes v
  SET points_earned = COALESCE((
    SELECT SUM(rs.pts)
    FROM round_scores rs
    WHERE rs.p_id = v.voter_id
      AND rs.rsn IN ('correct_answer', 'fell_for_lie')
  ), 0)
  WHERE v.round_id = p_round_id;

  RETURN QUERY
  SELECT p_id, pts, rsn
  FROM round_scores;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION calculate_and_update_scores IS
'Scoring: +1000 truth, +500 fooled-player for player lies, -500 only for system lies. Truth-identical lies are excluded.';


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

  SELECT COUNT(*) INTO v_connected_players
  FROM players p
  WHERE p.game_id = v_round.game_id
    AND p.connection_status = 'connected';

  v_required_players := GREATEST(COALESCE(v_round.required_players, 2), 2);

  IF v_round.status = 'answering' THEN
    SELECT COUNT(*) INTO v_answer_count
    FROM player_answers pa
    WHERE pa.round_id = p_round_id
      AND pa.is_correct = false;

    IF v_answer_count >= v_required_players THEN
      -- Remove player lies identical to truth so only one truth option remains.
      DELETE FROM player_answers pa
      USING questions q
      WHERE pa.round_id = p_round_id
        AND pa.is_correct = false
        AND q.id = v_round.question_id
        AND lower(trim(pa.answer_text)) = lower(trim(q.correct_answer));

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
              AND lower(trim(pa.answer_text)) = lower(trim(ql.lie_text))
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
'Answering->Voting->Completed with fixed quorum. Truth-identical player lies are removed before voting.';


CREATE OR REPLACE FUNCTION force_advance_round(p_round_id UUID)
RETURNS VOID AS $$
DECLARE
  v_round RECORD;
  v_correct_answer_exists BOOLEAN;
  v_connected_players INTEGER;
  v_lie_count INTEGER;
  v_voting_deadline TIMESTAMPTZ;
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
    -- Remove player lies identical to truth so only one truth option remains.
    DELETE FROM player_answers pa
    USING questions q
    WHERE pa.round_id = p_round_id
      AND pa.is_correct = false
      AND q.id = v_round.question_id
      AND lower(trim(pa.answer_text)) = lower(trim(q.correct_answer));

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
            AND lower(trim(pa.answer_text)) = lower(trim(ql.lie_text))
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
    -- Only complete after server-side voting deadline.
    IF v_round.timer_starts_at IS NOT NULL THEN
      v_voting_deadline := v_round.timer_starts_at
        + make_interval(secs => GREATEST(COALESCE(v_round.timer_duration, 0), 0));

      IF NOW() < v_voting_deadline THEN
        RETURN;
      END IF;
    END IF;

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
'Forces phase transitions on timeout; guarded against duplicate calls and removes truth-identical player lies.';

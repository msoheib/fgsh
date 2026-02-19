-- Migration: Update scoring rules for staged rounds and lie penalties
-- Rules:
-- 1) Correct answer vote = +1000
-- 2) Each fooled player gives +500 to lie author(s)
-- 3) Voting for a lie = -500
-- 4) Multipliers: first stage 1x, second stage 2x, final stage 3x
--    (derived from round_number and round_count)

CREATE OR REPLACE FUNCTION calculate_and_update_scores(
  p_round_id UUID,
  p_game_id UUID
)
RETURNS TABLE(player_id UUID, points_earned INTEGER, reason TEXT) AS $$
DECLARE
  v_round_number INTEGER;
  v_round_count INTEGER;
  v_multiplier INTEGER := 1;
  v_vote RECORD;
  v_group RECORD;
  v_author RECORD;
BEGIN
  -- Lock target round and game rows for atomic scoring
  PERFORM 1 FROM game_rounds WHERE id = p_round_id FOR UPDATE;

  SELECT gr.round_number, g.round_count
  INTO v_round_number, v_round_count
  FROM game_rounds gr
  JOIN games g ON g.id = gr.game_id
  WHERE gr.id = p_round_id
  FOR UPDATE;

  IF v_round_number IS NULL THEN
    RETURN;
  END IF;

  -- 1x / 2x / 3x stage multiplier
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

  -- Vote outcome points for voters (truth reward or lie penalty)
  FOR v_vote IN
    SELECT
      v.voter_id,
      pa.is_correct
    FROM votes v
    JOIN player_answers pa ON pa.id = v.answer_id
    WHERE v.round_id = p_round_id
  LOOP
    IF v_vote.is_correct THEN
      INSERT INTO round_scores (p_id, pts, rsn)
      VALUES (v_vote.voter_id, 1000 * v_multiplier, 'correct_answer');
    ELSE
      INSERT INTO round_scores (p_id, pts, rsn)
      VALUES (v_vote.voter_id, -500 * v_multiplier, 'fell_for_lie');
    END IF;
  END LOOP;

  -- Lie author points (+500 per fooled player).
  -- Duplicate lie texts are treated as one option and each author of that text gets the same fooled count.
  FOR v_group IN
    SELECT
      lower(trim(pa.answer_text)) AS normalized_answer,
      COUNT(v.id) AS fooled_count
    FROM votes v
    JOIN player_answers pa ON pa.id = v.answer_id
    WHERE v.round_id = p_round_id
      AND pa.is_correct = false
    GROUP BY lower(trim(pa.answer_text))
  LOOP
    FOR v_author IN
      SELECT DISTINCT pa.player_id
      FROM player_answers pa
      WHERE pa.round_id = p_round_id
        AND pa.is_correct = false
        AND pa.player_id IS NOT NULL
        AND lower(trim(pa.answer_text)) = v_group.normalized_answer
    LOOP
      INSERT INTO round_scores (p_id, pts, rsn)
      VALUES (v_author.player_id, (v_group.fooled_count * 500 * v_multiplier), 'fooled_players');
    END LOOP;
  END LOOP;

  -- Update cumulative player scores (never below zero due to DB constraint)
  FOR v_author IN
    SELECT p_id, SUM(pts) AS total_points
    FROM round_scores
    GROUP BY p_id
  LOOP
    UPDATE players
    SET score = GREATEST(score + v_author.total_points, 0)
    WHERE id = v_author.p_id;
  END LOOP;

  -- Persist net vote outcome points (for UI display)
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
'Scoring rules: +1000 truth, +500 fooled-player to lie author(s), -500 vote-for-lie, with 1x/2x/3x stage multipliers.';

-- Correct-submission voting and scoring behavior.
--
-- A player who typed the real answer should not vote for any truth-equivalent
-- answer. They receive the normal correct-answer reward for finding the truth.
-- Their required fake vote still counts toward quorum, but has no score effect
-- for the voter or the fake-answer author.

CREATE OR REPLACE FUNCTION public.calculate_and_update_scores(
  p_round_id UUID,
  p_game_id UUID
)
RETURNS TABLE(player_id UUID, points_earned INTEGER, reason TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_round_number INTEGER;
  v_round_count INTEGER;
  v_multiplier INTEGER := 1;
  v_truth_normalized TEXT;
  v_vote RECORD;
  v_group RECORD;
  v_author RECORD;
BEGIN
  PERFORM 1
  FROM public.game_rounds gr
  WHERE gr.id = p_round_id
  FOR UPDATE;

  SELECT
    gr.round_number,
    g.round_count,
    lower(trim(q.correct_answer))
  INTO v_round_number, v_round_count, v_truth_normalized
  FROM public.game_rounds gr
  JOIN public.games g ON g.id = gr.game_id
  LEFT JOIN public.questions q ON q.id = gr.question_id
  WHERE gr.id = p_round_id
    AND gr.game_id = p_game_id;

  IF v_round_number IS NULL THEN
    RETURN;
  END IF;

  IF v_truth_normalized IS NULL THEN
    SELECT lower(trim(pa.answer_text))
    INTO v_truth_normalized
    FROM public.player_answers pa
    WHERE pa.round_id = p_round_id
      AND pa.is_correct = TRUE
    ORDER BY (pa.player_id IS NULL) DESC, pa.submitted_at ASC
    LIMIT 1;
  END IF;

  IF v_round_number >= v_round_count THEN
    v_multiplier := 3;
  ELSIF v_round_number > (v_round_count / 2.0) THEN
    v_multiplier := 2;
  ELSE
    v_multiplier := 1;
  END IF;

  DROP TABLE IF EXISTS pg_temp.truth_authors;
  CREATE TEMP TABLE truth_authors (
    p_id UUID PRIMARY KEY
  ) ON COMMIT DROP;

  INSERT INTO truth_authors (p_id)
  SELECT DISTINCT pa.player_id
  FROM public.player_answers pa
  WHERE pa.round_id = p_round_id
    AND pa.player_id IS NOT NULL
    AND (
      pa.is_correct = TRUE
      OR (
        v_truth_normalized IS NOT NULL
        AND lower(trim(pa.answer_text)) = v_truth_normalized
      )
    )
  ON CONFLICT DO NOTHING;

  DROP TABLE IF EXISTS pg_temp.round_scores;
  CREATE TEMP TABLE round_scores (
    p_id UUID,
    pts INTEGER,
    rsn TEXT
  ) ON COMMIT DROP;

  INSERT INTO round_scores (p_id, pts, rsn)
  SELECT
    ta.p_id,
    1000 * v_multiplier,
    'correct_submission'
  FROM truth_authors ta;

  FOR v_vote IN
    SELECT
      v.voter_id,
      pa.is_correct,
      pa.player_id AS answer_owner_id,
      lower(trim(pa.answer_text)) AS normalized_answer
    FROM public.votes v
    JOIN public.player_answers pa ON pa.id = v.answer_id
    WHERE v.round_id = p_round_id
      AND NOT EXISTS (
        SELECT 1
        FROM truth_authors ta
        WHERE ta.p_id = v.voter_id
      )
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

  FOR v_group IN
    SELECT
      lower(trim(pa.answer_text)) AS normalized_answer,
      COUNT(v.id) AS fooled_count
    FROM public.votes v
    JOIN public.player_answers pa ON pa.id = v.answer_id
    WHERE v.round_id = p_round_id
      AND pa.is_correct = FALSE
      AND pa.player_id IS NOT NULL
      AND (v_truth_normalized IS NULL OR lower(trim(pa.answer_text)) <> v_truth_normalized)
      AND NOT EXISTS (
        SELECT 1
        FROM truth_authors ta
        WHERE ta.p_id = v.voter_id
      )
    GROUP BY lower(trim(pa.answer_text))
  LOOP
    FOR v_author IN
      SELECT DISTINCT pa.player_id
      FROM public.player_answers pa
      WHERE pa.round_id = p_round_id
        AND pa.is_correct = FALSE
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
    UPDATE public.players
    SET score = GREATEST(score + v_author.total_points, 0)
    WHERE id = v_author.p_id;
  END LOOP;

  UPDATE public.votes v
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
$$;

CREATE OR REPLACE FUNCTION public.cast_vote(
  p_round_id UUID,
  p_voter_id UUID,
  p_player_token TEXT,
  p_answer_id UUID
)
RETURNS public.votes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_round public.game_rounds%ROWTYPE;
  v_answer public.player_answers%ROWTYPE;
  v_vote public.votes%ROWTYPE;
  v_deadline TIMESTAMPTZ;
  v_truth_normalized TEXT;
  v_voter_is_truth_author BOOLEAN := FALSE;
  v_answer_is_truth_equivalent BOOLEAN := FALSE;
BEGIN
  SELECT gr.*
  INTO v_round
  FROM public.game_rounds gr
  WHERE gr.id = p_round_id
  FOR UPDATE;

  IF v_round.id IS NULL THEN
    RAISE EXCEPTION 'Round not found';
  END IF;

  IF v_round.status <> 'voting' THEN
    RAISE EXCEPTION 'Round is not in voting phase';
  END IF;

  v_deadline := COALESCE(v_round.timer_starts_at, NOW())
    + make_interval(secs => COALESCE(v_round.timer_duration, 0));

  IF NOW() > v_deadline THEN
    RAISE EXCEPTION 'Voting timer expired';
  END IF;

  PERFORM public.private_assert_player_session(v_round.game_id, p_voter_id, p_player_token, TRUE);

  SELECT lower(trim(q.correct_answer))
  INTO v_truth_normalized
  FROM public.questions q
  WHERE q.id = v_round.question_id;

  IF v_truth_normalized IS NULL THEN
    SELECT lower(trim(pa.answer_text))
    INTO v_truth_normalized
    FROM public.player_answers pa
    WHERE pa.round_id = p_round_id
      AND pa.is_correct = TRUE
    ORDER BY (pa.player_id IS NULL) DESC, pa.submitted_at ASC
    LIMIT 1;
  END IF;

  SELECT pa.*
  INTO v_answer
  FROM public.player_answers pa
  WHERE pa.id = p_answer_id;

  IF v_answer.id IS NULL THEN
    RAISE EXCEPTION 'Answer not found';
  END IF;

  IF v_answer.round_id <> p_round_id THEN
    RAISE EXCEPTION 'Answer does not belong to this round';
  END IF;

  IF v_answer.player_id IS NOT NULL AND v_answer.player_id = p_voter_id THEN
    RAISE EXCEPTION 'Cannot vote for own answer';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.player_answers pa
    WHERE pa.round_id = p_round_id
      AND pa.player_id = p_voter_id
      AND (
        pa.is_correct = TRUE
        OR (
          v_truth_normalized IS NOT NULL
          AND lower(trim(pa.answer_text)) = v_truth_normalized
        )
      )
  ) INTO v_voter_is_truth_author;

  v_answer_is_truth_equivalent :=
    v_answer.is_correct = TRUE
    OR (
      v_truth_normalized IS NOT NULL
      AND lower(trim(v_answer.answer_text)) = v_truth_normalized
    );

  IF v_voter_is_truth_author AND v_answer_is_truth_equivalent THEN
    RAISE EXCEPTION 'Correct-answer submitters cannot vote for the correct answer';
  END IF;

  INSERT INTO public.votes (id, round_id, voter_id, answer_id, points_earned, created_at)
  VALUES (gen_random_uuid(), p_round_id, p_voter_id, p_answer_id, 0, NOW())
  ON CONFLICT (round_id, voter_id)
  DO NOTHING
  RETURNING * INTO v_vote;

  IF FOUND THEN
    PERFORM public.advance_round_if_ready(p_round_id);
    RETURN v_vote;
  END IF;

  SELECT v.*
  INTO v_vote
  FROM public.votes v
  WHERE v.round_id = p_round_id
    AND v.voter_id = p_voter_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to persist vote';
  END IF;

  IF v_vote.answer_id = p_answer_id THEN
    PERFORM public.advance_round_if_ready(p_round_id);
    RETURN v_vote;
  END IF;

  RAISE EXCEPTION 'Vote has already been confirmed';
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_and_update_scores(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cast_vote(UUID, UUID, TEXT, UUID) TO anon, authenticated;

COMMENT ON FUNCTION public.calculate_and_update_scores(UUID, UUID) IS
'Scores a completed round. Correct-answer submitters receive correct-answer points, while their forced fake vote has zero score effect.';

COMMENT ON FUNCTION public.cast_vote(UUID, UUID, TEXT, UUID) IS
'Confirms a token-verified vote. Correct-answer submitters may only vote for fake answers.';

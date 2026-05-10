-- Lock confirmed votes and complete voting as soon as the required vote quorum is met.
-- Web confirmation now delays writes until the player confirms, so a persisted
-- answer/vote is treated as final for early advancement.

CREATE OR REPLACE FUNCTION public.advance_round_if_ready(p_round_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_round RECORD;
  v_required_players INTEGER;
  v_effective_required_players INTEGER;
  v_answer_count INTEGER;
  v_vote_count INTEGER;
  v_correct_answer_exists BOOLEAN;
  v_connected_players INTEGER;
  v_lie_count INTEGER;
BEGIN
  SELECT gr.* INTO v_round
  FROM public.game_rounds gr
  WHERE gr.id = p_round_id
  FOR UPDATE;

  IF v_round IS NULL OR v_round.status = 'completed' THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_connected_players
  FROM public.players p
  WHERE p.game_id = v_round.game_id
    AND p.connection_status = 'connected';

  v_required_players := GREATEST(COALESCE(v_round.required_players, 2), 2);
  v_effective_required_players := LEAST(v_required_players, GREATEST(v_connected_players, 2));

  IF v_round.status = 'answering' THEN
    SELECT COUNT(*) INTO v_answer_count
    FROM public.player_answers pa
    WHERE pa.round_id = p_round_id
      AND pa.player_id IS NOT NULL
      AND pa.is_correct = false;

    IF v_answer_count >= v_effective_required_players THEN
      UPDATE public.player_answers pa
      SET is_correct = true
      FROM public.questions q
      WHERE pa.round_id = p_round_id
        AND pa.is_correct = false
        AND pa.player_id IS NOT NULL
        AND q.id = v_round.question_id
        AND lower(trim(pa.answer_text)) = lower(trim(q.correct_answer));

      SELECT EXISTS (
        SELECT 1
        FROM public.player_answers pa
        WHERE pa.round_id = p_round_id
          AND pa.is_correct = true
          AND pa.player_id IS NULL
      ) INTO v_correct_answer_exists;

      IF NOT v_correct_answer_exists THEN
        INSERT INTO public.player_answers (round_id, player_id, answer_text, is_correct)
        SELECT
          p_round_id,
          NULL::UUID,
          q.correct_answer,
          true
        FROM public.questions q
        WHERE q.id = v_round.question_id
        ON CONFLICT DO NOTHING;
      END IF;

      IF to_regclass('public.question_lies') IS NOT NULL THEN
        v_lie_count := LEAST(3, GREATEST(2, 7 - GREATEST(v_connected_players, 1)));

        INSERT INTO public.player_answers (round_id, player_id, answer_text, is_correct)
        SELECT
          p_round_id,
          NULL::UUID,
          ql.lie_text,
          false
        FROM public.question_lies ql
        WHERE ql.question_id = v_round.question_id
          AND NOT EXISTS (
            SELECT 1
            FROM public.player_answers pa
            WHERE pa.round_id = p_round_id
              AND lower(trim(pa.answer_text)) = lower(trim(ql.lie_text))
          )
        ORDER BY random()
        LIMIT v_lie_count
        ON CONFLICT DO NOTHING;
      END IF;

      UPDATE public.game_rounds
      SET
        status = 'voting',
        timer_duration = 45,
        timer_starts_at = NOW()
      WHERE id = p_round_id;
    END IF;

    RETURN;
  END IF;

  IF v_round.status = 'voting' THEN
    SELECT COUNT(DISTINCT v.voter_id) INTO v_vote_count
    FROM public.votes v
    WHERE v.round_id = p_round_id;

    IF v_vote_count >= v_effective_required_players THEN
      BEGIN
        PERFORM public.calculate_and_update_scores(p_round_id, v_round.game_id);
      EXCEPTION
        WHEN undefined_function THEN
          NULL;
      END;

      UPDATE public.game_rounds
      SET status = 'completed'
      WHERE id = p_round_id;
    END IF;
  END IF;
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

GRANT EXECUTE ON FUNCTION public.advance_round_if_ready(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cast_vote(UUID, UUID, TEXT, UUID) TO anon, authenticated;

COMMENT ON FUNCTION public.advance_round_if_ready(UUID) IS
'Answering and voting advance when the live connected-player quorum has persisted confirmed choices. Timer fallback still handles missing confirmations.';

COMMENT ON FUNCTION public.cast_vote(UUID, UUID, TEXT, UUID) IS
'Confirms a player vote using a token-verified anonymous player session. First write wins; identical retries are idempotent.';

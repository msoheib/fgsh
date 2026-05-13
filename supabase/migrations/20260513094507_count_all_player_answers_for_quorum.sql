-- Count all player-submitted answers toward answering quorum.
--
-- Players can sometimes submit the real answer. Those rows may be marked
-- is_correct=true before or during phase advancement, but they still represent
-- a confirmed player submission and must count toward quorum.

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
    SELECT COUNT(DISTINCT pa.player_id) INTO v_answer_count
    FROM public.player_answers pa
    WHERE pa.round_id = p_round_id
      AND pa.player_id IS NOT NULL;

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

GRANT EXECUTE ON FUNCTION public.advance_round_if_ready(UUID) TO anon, authenticated;

COMMENT ON FUNCTION public.advance_round_if_ready(UUID) IS
'Advances answering/voting when the effective connected quorum is met. Answer quorum counts distinct player submissions regardless of correctness.';

-- Migration: Keep voting open until the timer expires
-- Purpose:
-- 1) Allow players to revise votes until voting time ends.
-- 2) Prevent vote quorum from auto-transitioning directly to reveal.

CREATE OR REPLACE FUNCTION public.advance_round_if_ready(p_round_id UUID)
RETURNS VOID AS $$
DECLARE
  v_round RECORD;
  v_required_players INTEGER;
  v_answer_count INTEGER;
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

  IF v_round.status = 'answering' THEN
    SELECT COUNT(*) INTO v_answer_count
    FROM public.player_answers pa
    WHERE pa.round_id = p_round_id
      AND pa.is_correct = false;

    IF v_answer_count >= v_required_players THEN
      DELETE FROM public.player_answers pa
      USING public.questions q
      WHERE pa.round_id = p_round_id
        AND pa.is_correct = false
        AND q.id = v_round.question_id
        AND lower(trim(pa.answer_text)) = lower(trim(q.correct_answer));

      SELECT EXISTS (
        SELECT 1
        FROM public.player_answers pa
        WHERE pa.round_id = p_round_id
          AND pa.is_correct = true
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
        timer_duration = 20,
        timer_starts_at = NOW()
      WHERE id = p_round_id;
    END IF;

    RETURN;
  END IF;

  IF v_round.status = 'voting' THEN
    RETURN;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.advance_round_if_ready(UUID) IS
'Answering advances by quorum; voting stays open until timeout. Truth-identical player lies are removed before voting.';

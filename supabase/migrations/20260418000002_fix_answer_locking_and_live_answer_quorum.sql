-- Migration: Lock answer submission and use live connected-player quorum
-- Purpose:
-- 1) Make answer submission first-write-wins so players cannot overwrite a lie.
-- 2) Advance answering based on the number of currently connected players.
-- 3) Prefer the phase captain over the host for timeout fallback control.

CREATE OR REPLACE FUNCTION public.submit_answer(
  p_round_id UUID,
  p_player_id UUID,
  p_player_token TEXT,
  p_answer_text TEXT
)
RETURNS public.player_answers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_round public.game_rounds%ROWTYPE;
  v_deadline TIMESTAMPTZ;
  v_answer public.player_answers%ROWTYPE;
  v_normalized_answer TEXT;
  v_inserted BOOLEAN := FALSE;
BEGIN
  SELECT gr.*
  INTO v_round
  FROM public.game_rounds gr
  WHERE gr.id = p_round_id
  FOR UPDATE;

  IF v_round.id IS NULL THEN
    RAISE EXCEPTION 'Round not found';
  END IF;

  IF v_round.status <> 'answering' THEN
    RAISE EXCEPTION 'Round is not in answering phase';
  END IF;

  v_deadline := COALESCE(v_round.timer_starts_at, NOW())
    + make_interval(secs => COALESCE(v_round.timer_duration, 0));

  IF NOW() > v_deadline THEN
    RAISE EXCEPTION 'Answering timer expired';
  END IF;

  PERFORM public.private_assert_player_session(v_round.game_id, p_player_id, p_player_token, TRUE);

  IF p_answer_text IS NULL THEN
    RAISE EXCEPTION 'Answer cannot be empty';
  END IF;

  v_normalized_answer := left(regexp_replace(btrim(p_answer_text), '[[:space:]]+', ' ', 'g'), 300);

  IF v_normalized_answer = '' THEN
    RAISE EXCEPTION 'Answer cannot be empty';
  END IF;

  INSERT INTO public.player_answers (
    id,
    round_id,
    player_id,
    answer_text,
    is_correct,
    submitted_at
  ) VALUES (
    gen_random_uuid(),
    p_round_id,
    p_player_id,
    v_normalized_answer,
    FALSE,
    NOW()
  )
  ON CONFLICT (round_id, player_id) DO NOTHING
  RETURNING * INTO v_answer;

  v_inserted := FOUND;

  IF v_inserted THEN
    PERFORM public.advance_round_if_ready(p_round_id);
    RETURN v_answer;
  END IF;

  SELECT *
  INTO v_answer
  FROM public.player_answers pa
  WHERE pa.round_id = p_round_id
    AND pa.player_id = p_player_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to persist answer';
  END IF;

  IF lower(trim(v_answer.answer_text)) = lower(trim(v_normalized_answer)) THEN
    PERFORM public.advance_round_if_ready(p_round_id);
    RETURN v_answer;
  END IF;

  RAISE EXCEPTION 'Player has already submitted an answer';
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_round_if_ready(p_round_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_round RECORD;
  v_required_players INTEGER;
  v_effective_required_players INTEGER;
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
    RETURN;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.force_advance_round_as_player(
  p_round_id UUID,
  p_player_id UUID,
  p_player_token TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  round_id UUID,
  new_round_status TEXT,
  game_id UUID,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_round public.game_rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_controller_id UUID;
  v_deadline TIMESTAMPTZ;
  v_allowed_after TIMESTAMPTZ;
BEGIN
  SELECT gr.*
  INTO v_round
  FROM public.game_rounds gr
  WHERE gr.id = p_round_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Round not found';
  END IF;

  PERFORM public.private_assert_player_session(v_round.game_id, p_player_id, p_player_token, TRUE);

  SELECT g.*
  INTO v_game
  FROM public.games g
  WHERE g.id = v_round.game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found';
  END IF;

  v_deadline := COALESCE(v_round.timer_starts_at, NOW())
    + make_interval(secs => COALESCE(v_round.timer_duration, 0));
  v_controller_id := COALESCE(v_game.phase_captain_id, v_game.host_id);

  IF v_round.status = 'completed' THEN
    RETURN QUERY SELECT
      TRUE,
      v_round.id,
      v_round.status::TEXT,
      v_round.game_id,
      'Round already completed'::TEXT;
    RETURN;
  END IF;

  -- Stale caller path: round has already moved to voting and timer is still active.
  IF v_round.status = 'voting' AND NOW() < v_deadline THEN
    RETURN QUERY SELECT
      TRUE,
      v_round.id,
      v_round.status::TEXT,
      v_round.game_id,
      'Round already advanced to voting'::TEXT;
    RETURN;
  END IF;

  IF v_controller_id IS NOT NULL AND v_controller_id = p_player_id THEN
    v_allowed_after := v_deadline;
  ELSE
    v_allowed_after := v_deadline + interval '5 seconds';
  END IF;

  IF NOW() < v_allowed_after THEN
    RAISE EXCEPTION 'Timer has not expired yet';
  END IF;

  PERFORM public.force_advance_round(p_round_id);

  SELECT gr.*
  INTO v_round
  FROM public.game_rounds gr
  WHERE gr.id = p_round_id;

  RETURN QUERY SELECT
    TRUE,
    v_round.id,
    v_round.status::TEXT,
    v_round.game_id,
    'Round advanced successfully'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_answer(UUID, UUID, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_round_if_ready(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.force_advance_round_as_player(UUID, UUID, TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.submit_answer(UUID, UUID, TEXT, TEXT) IS
'Locks answers to the first submission per player per round and keeps retrying the same answer idempotent.';

COMMENT ON FUNCTION public.advance_round_if_ready(UUID) IS
'Answering advances by live connected-player quorum capped by the round quorum; voting stays open until timeout.';

COMMENT ON FUNCTION public.force_advance_round_as_player(UUID, UUID, TEXT) IS
'Returns structured force-advance result. Controller prefers phase captain, then host; any valid player after +5s grace.';

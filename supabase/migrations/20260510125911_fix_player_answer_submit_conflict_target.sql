-- Fix submit_answer after the nullable player_answers.player_id schema.
--
-- Production uses NULL player_id for system answers, so the player answer
-- uniqueness may be implemented as a partial index. Postgres cannot infer a
-- partial unique index from ON CONFLICT (round_id, player_id) unless the
-- conflict target includes the matching predicate. Avoid the inference issue
-- entirely: the function already locks the round row, so a pre-insert lookup is
-- enough to serialize player submissions for that round.

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

  SELECT *
  INTO v_answer
  FROM public.player_answers pa
  WHERE pa.round_id = p_round_id
    AND pa.player_id = p_player_id
  FOR UPDATE;

  IF FOUND THEN
    IF lower(trim(v_answer.answer_text)) = lower(trim(v_normalized_answer)) THEN
      PERFORM public.advance_round_if_ready(p_round_id);
      RETURN v_answer;
    END IF;

    RAISE EXCEPTION 'Player has already submitted an answer';
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
  RETURNING * INTO v_answer;

  PERFORM public.advance_round_if_ready(p_round_id);
  RETURN v_answer;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_answer(UUID, UUID, TEXT, TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.submit_answer(UUID, UUID, TEXT, TEXT) IS
'Locks answers to the first submission per player per round without relying on an invalid ON CONFLICT target for nullable player_id schemas.';

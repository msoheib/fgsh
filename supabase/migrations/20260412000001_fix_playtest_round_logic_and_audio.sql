-- Migration: Fix playtest issues around timers, truth attribution, question reuse, and TV audio.
-- Purpose:
-- 1) Increase answer timer to 60 seconds.
-- 2) Prevent same-game question repeats when a category runs out.
-- 3) Preserve player truth submissions and unify quorum/timeout answer preparation.
-- 4) Allow non-controller fallback force-advance only after server-validated grace.
-- 5) Seed background and victory audio cues.

CREATE OR REPLACE FUNCTION public.create_round_as_player(
  p_game_id UUID,
  p_round_number INTEGER,
  p_player_id UUID,
  p_player_token TEXT,
  p_language VARCHAR(2) DEFAULT 'ar',
  p_category TEXT DEFAULT NULL
)
RETURNS TABLE (
  round_id UUID,
  question_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_controller_id UUID;
  v_existing_round public.game_rounds%ROWTYPE;
  v_used_question_ids UUID[];
  v_question public.questions%ROWTYPE;
  v_required_players INTEGER;
  v_created_round_id UUID;
  v_created_question_id UUID;
BEGIN
  PERFORM public.private_assert_player_session(p_game_id, p_player_id, p_player_token, TRUE);

  SELECT g.*
  INTO v_game
  FROM public.games g
  WHERE g.id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found';
  END IF;

  IF v_game.status <> 'playing' THEN
    RAISE EXCEPTION 'Game is not active';
  END IF;

  IF v_game.current_round <> p_round_number THEN
    RAISE EXCEPTION 'Only the current round can be created';
  END IF;

  v_controller_id := COALESCE(v_game.host_id, v_game.phase_captain_id);
  IF v_controller_id IS NOT NULL AND v_controller_id <> p_player_id THEN
    RAISE EXCEPTION 'Only the controller can create rounds';
  END IF;

  SELECT gr.*
  INTO v_existing_round
  FROM public.game_rounds gr
  WHERE gr.game_id = p_game_id
    AND gr.round_number = p_round_number;

  IF FOUND THEN
    RETURN QUERY SELECT v_existing_round.id, v_existing_round.question_id;
    RETURN;
  END IF;

  SELECT COALESCE(array_agg(gr.question_id), ARRAY[]::UUID[])
  INTO v_used_question_ids
  FROM public.game_rounds gr
  WHERE gr.game_id = p_game_id;

  SELECT q.*
  INTO v_question
  FROM public.questions q
  WHERE q.language = p_language
    AND (p_category IS NULL OR q.category = p_category)
    AND (cardinality(v_used_question_ids) = 0 OR q.id <> ALL(v_used_question_ids))
  ORDER BY random()
  LIMIT 1;

  IF v_question.id IS NULL THEN
    SELECT q.*
    INTO v_question
    FROM public.questions q
    WHERE q.language = p_language
      AND (cardinality(v_used_question_ids) = 0 OR q.id <> ALL(v_used_question_ids))
    ORDER BY random()
    LIMIT 1;
  END IF;

  IF v_question.id IS NULL THEN
    RAISE EXCEPTION 'No questions available';
  END IF;

  SELECT GREATEST(COUNT(*), 2)
  INTO v_required_players
  FROM public.players p
  WHERE p.game_id = p_game_id
    AND p.connection_status = 'connected';

  INSERT INTO public.game_rounds (
    id,
    game_id,
    round_number,
    question_id,
    status,
    timer_starts_at,
    timer_duration,
    required_players,
    created_at
  ) VALUES (
    gen_random_uuid(),
    p_game_id,
    p_round_number,
    v_question.id,
    'answering',
    NOW(),
    60,
    v_required_players,
    NOW()
  )
  RETURNING public.game_rounds.id, public.game_rounds.question_id
  INTO v_created_round_id, v_created_question_id;

  RETURN QUERY SELECT v_created_round_id, v_created_question_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_round_if_ready(p_round_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
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
$$;

COMMENT ON FUNCTION public.advance_round_if_ready(UUID) IS
'Answering advances by quorum; voting stays open until timeout. Truth-identical player submissions are preserved and grouped with the system truth.';

CREATE OR REPLACE FUNCTION public.force_advance_round(p_round_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_round RECORD;
  v_correct_answer_exists BOOLEAN;
  v_connected_players INTEGER;
  v_lie_count INTEGER;
BEGIN
  SELECT gr.*
  INTO v_round
  FROM public.game_rounds gr
  WHERE gr.id = p_round_id
  FOR UPDATE;

  IF v_round IS NULL OR v_round.status = 'completed' THEN
    RETURN;
  END IF;

  IF v_round.status = 'answering' THEN
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
        AND pa.is_correct = TRUE
        AND pa.player_id IS NULL
    ) INTO v_correct_answer_exists;

    IF NOT v_correct_answer_exists THEN
      INSERT INTO public.player_answers (round_id, player_id, answer_text, is_correct)
      SELECT
        p_round_id,
        NULL::UUID,
        q.correct_answer,
        TRUE
      FROM public.questions q
      WHERE q.id = v_round.question_id
      ON CONFLICT DO NOTHING;
    END IF;

    SELECT COUNT(*) INTO v_connected_players
    FROM public.players p
    WHERE p.game_id = v_round.game_id
      AND p.connection_status = 'connected';

    IF to_regclass('public.question_lies') IS NOT NULL THEN
      v_lie_count := LEAST(3, GREATEST(2, 7 - GREATEST(v_connected_players, 1)));

      INSERT INTO public.player_answers (round_id, player_id, answer_text, is_correct)
      SELECT
        p_round_id,
        NULL::UUID,
        ql.lie_text,
        FALSE
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

    RETURN;
  END IF;

  IF v_round.status = 'voting' THEN
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
END;
$$;

CREATE OR REPLACE FUNCTION public.force_advance_round_as_player(
  p_round_id UUID,
  p_player_id UUID,
  p_player_token TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_round public.game_rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_controller_id UUID;
  v_deadline TIMESTAMPTZ;
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
  v_controller_id := COALESCE(v_game.host_id, v_game.phase_captain_id);

  IF v_controller_id IS NOT NULL AND v_controller_id = p_player_id THEN
    IF NOW() < v_deadline THEN
      RAISE EXCEPTION 'Timer has not expired yet';
    END IF;
  ELSE
    IF NOW() < (v_deadline + interval '5 seconds') THEN
      RAISE EXCEPTION 'Timer has not expired yet';
    END IF;
  END IF;

  PERFORM public.force_advance_round(p_round_id);
  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.force_advance_round_as_player(UUID, UUID, TEXT) IS
'Allows the active controller to force-advance once the timer expires, and any valid player session after a 5 second grace period.';

INSERT INTO public.game_audio_cues (cue_key, label)
VALUES
  ('background_music', 'موسيقى الخلفية'),
  ('game_end_victory', 'نهاية اللعبة - فوز')
ON CONFLICT (cue_key) DO NOTHING;

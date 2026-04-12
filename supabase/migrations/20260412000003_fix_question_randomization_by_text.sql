-- Migration: Prevent visible question repeats within a single game.
-- Purpose:
-- 1) Track used questions by normalized question text, not only by row id.
-- 2) Keep category-first selection.
-- 3) Fall back to any unused question in the game when the chosen category is exhausted.
-- 4) Reset naturally on a new game because the used-text set is derived per game.

CREATE OR REPLACE FUNCTION public.normalize_question_text(p_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT lower(regexp_replace(btrim(p_text), '\s+', ' ', 'g'));
$$;

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
  v_used_question_keys TEXT[];
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

  SELECT COALESCE(
    array_agg(DISTINCT public.normalize_question_text(q.question_text)),
    ARRAY[]::TEXT[]
  )
  INTO v_used_question_keys
  FROM public.game_rounds gr
  JOIN public.questions q
    ON q.id = gr.question_id
  WHERE gr.game_id = p_game_id
    AND q.language = p_language;

  SELECT q.*
  INTO v_question
  FROM public.questions q
  WHERE q.language = p_language
    AND (p_category IS NULL OR q.category = p_category)
    AND (
      cardinality(v_used_question_keys) = 0
      OR public.normalize_question_text(q.question_text) <> ALL(v_used_question_keys)
    )
  ORDER BY random()
  LIMIT 1;

  IF v_question.id IS NULL AND p_category IS NOT NULL THEN
    SELECT q.*
    INTO v_question
    FROM public.questions q
    WHERE q.language = p_language
      AND (
        cardinality(v_used_question_keys) = 0
        OR public.normalize_question_text(q.question_text) <> ALL(v_used_question_keys)
      )
    ORDER BY random()
    LIMIT 1;
  END IF;

  IF v_question.id IS NULL THEN
    RAISE EXCEPTION 'No unseen questions available for this game';
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

COMMENT ON FUNCTION public.normalize_question_text(TEXT) IS
'Normalizes question text for per-game repeat prevention.';

COMMENT ON FUNCTION public.create_round_as_player(UUID, INTEGER, UUID, TEXT, VARCHAR, TEXT) IS
'Creates a round with category-first random selection and per-game repeat prevention based on normalized question text.';

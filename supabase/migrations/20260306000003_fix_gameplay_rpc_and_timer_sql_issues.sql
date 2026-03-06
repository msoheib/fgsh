CREATE OR REPLACE FUNCTION public.get_server_time()
RETURNS TABLE(
  server_time TIMESTAMPTZ,
  timestamp_ms BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    NOW() AS server_time,
    (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT AS timestamp_ms;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION public.start_round_timer(p_round_id UUID)
RETURNS TABLE(
  success BOOLEAN,
  timer_starts_at TIMESTAMPTZ,
  message TEXT
) AS $$
DECLARE
  v_current_status VARCHAR(20);
  v_timer_starts_at TIMESTAMPTZ;
BEGIN
  SELECT gr.status, gr.timer_starts_at
  INTO v_current_status, v_timer_starts_at
  FROM public.game_rounds gr
  WHERE gr.id = p_round_id
  FOR UPDATE;

  IF v_current_status IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TIMESTAMPTZ, 'Round not found'::TEXT;
    RETURN;
  END IF;

  IF v_timer_starts_at IS NOT NULL THEN
    RETURN QUERY SELECT TRUE, v_timer_starts_at, 'Timer already started'::TEXT;
    RETURN;
  END IF;

  UPDATE public.game_rounds
  SET timer_starts_at = NOW()
  WHERE id = p_round_id
  RETURNING public.game_rounds.timer_starts_at INTO v_timer_starts_at;

  RETURN QUERY SELECT TRUE, v_timer_starts_at, 'Timer started successfully'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION public.calculate_and_update_scores(
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
  WHERE gr.id = p_round_id;

  IF v_round_number IS NULL THEN
    RETURN;
  END IF;

  IF v_truth_normalized IS NULL THEN
    SELECT lower(trim(pa.answer_text))
    INTO v_truth_normalized
    FROM public.player_answers pa
    WHERE pa.round_id = p_round_id
      AND pa.is_correct = TRUE
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

  FOR v_vote IN
    SELECT
      v.voter_id,
      pa.is_correct,
      pa.player_id AS answer_owner_id,
      lower(trim(pa.answer_text)) AS normalized_answer
    FROM public.votes v
    JOIN public.player_answers pa ON pa.id = v.answer_id
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
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION public.join_game(
  p_code VARCHAR(6),
  p_player_name VARCHAR(50),
  p_avatar_color VARCHAR(7) DEFAULT NULL
)
RETURNS TABLE (
  game_id UUID,
  game_code VARCHAR(6),
  player_id UUID,
  player_token TEXT,
  phase_captain_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_player_id UUID;
  v_player_token TEXT;
  v_player_count INTEGER;
  v_avatar_color VARCHAR(7) := '#7c3aed';
  v_is_banned BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    SELECT hp.is_banned
    INTO v_is_banned
    FROM public.host_profiles hp
    WHERE hp.id = auth.uid();

    IF COALESCE(v_is_banned, FALSE) THEN
      RAISE EXCEPTION 'Banned users cannot join games';
    END IF;
  END IF;

  IF btrim(COALESCE(p_player_name, '')) = '' THEN
    RAISE EXCEPTION 'Player name is required';
  END IF;

  IF p_avatar_color IS NOT NULL AND p_avatar_color ~ '^#[0-9A-Fa-f]{6}$' THEN
    v_avatar_color := p_avatar_color;
  END IF;

  SELECT g.*
  INTO v_game
  FROM public.games g
  WHERE g.code = upper(regexp_replace(COALESCE(p_code, ''), E'\\s+', '', 'g'))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found';
  END IF;

  IF v_game.status <> 'waiting' THEN
    RAISE EXCEPTION 'Game is already %', v_game.status;
  END IF;

  SELECT COUNT(*)
  INTO v_player_count
  FROM public.players p
  WHERE p.game_id = v_game.id;

  IF v_player_count >= v_game.max_players THEN
    RAISE EXCEPTION 'Game is full';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.players p
    WHERE p.game_id = v_game.id
      AND lower(p.user_name) = lower(left(btrim(p_player_name), 50))
  ) THEN
    RAISE EXCEPTION 'Player name already taken';
  END IF;

  v_player_token := encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO public.players (
    id,
    game_id,
    user_name,
    avatar_color,
    score,
    is_host,
    connection_status,
    joined_at,
    session_token_hash
  ) VALUES (
    gen_random_uuid(),
    v_game.id,
    left(btrim(p_player_name), 50),
    v_avatar_color,
    0,
    FALSE,
    'connected',
    NOW(),
    public.private_player_token_hash(v_player_token)
  )
  RETURNING id INTO v_player_id;

  IF v_game.phase_captain_id IS NULL THEN
    UPDATE public.games
    SET
      phase_captain_id = v_player_id,
      host_id = COALESCE(host_id, v_player_id),
      updated_at = NOW()
    WHERE id = v_game.id
    RETURNING public.games.phase_captain_id INTO v_game.phase_captain_id;
  END IF;

  RETURN QUERY
  SELECT
    v_game.id,
    v_game.code,
    v_player_id,
    v_player_token,
    v_game.phase_captain_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.reconnect_player_session(
  p_game_id UUID,
  p_player_id UUID,
  p_player_token TEXT
)
RETURNS TABLE (
  player_id UUID,
  connection_status TEXT,
  phase_captain_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_player public.players%ROWTYPE;
  v_game public.games%ROWTYPE;
BEGIN
  v_player := public.private_assert_player_session(p_game_id, p_player_id, p_player_token, FALSE);

  SELECT g.*
  INTO v_game
  FROM public.games g
  WHERE g.id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found';
  END IF;

  UPDATE public.players
  SET connection_status = 'connected'
  WHERE id = p_player_id;

  IF v_game.status <> 'finished' AND v_game.phase_captain_id IS NULL THEN
    UPDATE public.games
    SET
      phase_captain_id = p_player_id,
      host_id = COALESCE(host_id, p_player_id),
      updated_at = NOW()
    WHERE id = p_game_id
    RETURNING public.games.phase_captain_id INTO v_game.phase_captain_id;
  END IF;

  RETURN QUERY
  SELECT
    p_player_id,
    'connected'::TEXT,
    v_game.phase_captain_id;
END;
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

  IF v_question.id IS NULL AND p_category IS NOT NULL THEN
    SELECT q.*
    INTO v_question
    FROM public.questions q
    WHERE q.language = p_language
      AND q.category = p_category
    ORDER BY random()
    LIMIT 1;
  END IF;

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
    30,
    v_required_players,
    NOW()
  )
  RETURNING public.game_rounds.id, public.game_rounds.question_id
  INTO v_created_round_id, v_created_question_id;

  RETURN QUERY SELECT v_created_round_id, v_created_question_id;
END;
$$;


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

  SELECT *
  INTO v_answer
  FROM public.player_answers pa
  WHERE pa.round_id = p_round_id
    AND pa.player_id = p_player_id
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.player_answers
    SET
      answer_text = left(btrim(p_answer_text), 300),
      is_correct = FALSE,
      submitted_at = NOW()
    WHERE id = v_answer.id
    RETURNING * INTO v_answer;
  ELSE
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
      left(btrim(p_answer_text), 300),
      FALSE,
      NOW()
    )
    RETURNING * INTO v_answer;
  END IF;

  PERFORM public.advance_round_if_ready(p_round_id);

  RETURN v_answer;
END;
$$;

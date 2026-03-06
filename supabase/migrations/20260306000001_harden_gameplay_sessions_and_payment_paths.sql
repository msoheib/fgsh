-- Migration: Harden anonymous gameplay sessions, host profile writes, and payment mutation paths
-- Purpose:
-- 1) Stop trusting raw player UUIDs from clients.
-- 2) Remove direct public writes to gameplay tables.
-- 3) Replace broad host profile self-updates with narrow RPCs.
-- 4) Restrict payment status changes to verified server-side execution only.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- -----------------------------------------------------------------------------
-- 1) Player session tokens
-- -----------------------------------------------------------------------------
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS session_token_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_players_session_token_hash
  ON public.players(session_token_hash)
  WHERE session_token_hash IS NOT NULL;

COMMENT ON COLUMN public.players.session_token_hash IS
'SHA-256 hash of the player session token returned once on join/create and used to authorize anonymous gameplay actions.';

-- -----------------------------------------------------------------------------
-- 2) Host profile hardening
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Hosts can update own profile" ON public.host_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.host_profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON public.host_profiles;
DROP POLICY IF EXISTS "Service role can update payment status" ON public.host_profiles;

REVOKE INSERT, UPDATE, DELETE ON public.host_profiles FROM anon, authenticated;
GRANT SELECT ON public.host_profiles TO authenticated;

-- -----------------------------------------------------------------------------
-- 3) Gameplay table write hardening
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can join a game" ON public.players;
DROP POLICY IF EXISTS "Players can update their own record" ON public.players;
DROP POLICY IF EXISTS "Game rounds can be created" ON public.game_rounds;
DROP POLICY IF EXISTS "Game rounds can be updated" ON public.game_rounds;
DROP POLICY IF EXISTS "Players can submit answers" ON public.player_answers;
DROP POLICY IF EXISTS "Players can insert their own answers" ON public.player_answers;
DROP POLICY IF EXISTS "Players can cast votes" ON public.votes;
DROP POLICY IF EXISTS "Players can insert their own votes" ON public.votes;
DROP POLICY IF EXISTS "Game category prompts are writable by everyone" ON public.game_category_prompts;
DROP POLICY IF EXISTS "Authenticated users can create games" ON public.games;
DROP POLICY IF EXISTS "Only paid hosts can create games" ON public.games;
DROP POLICY IF EXISTS "Hosts can update own games" ON public.games;
DROP POLICY IF EXISTS "Host can update their game" ON public.games;
DROP POLICY IF EXISTS "Hosts can delete own games" ON public.games;

REVOKE INSERT, UPDATE, DELETE ON public.games FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.players FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.game_rounds FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.player_answers FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.votes FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.game_category_prompts FROM anon, authenticated;

GRANT SELECT ON public.games TO anon, authenticated;
GRANT SELECT ON public.players TO anon, authenticated;
GRANT SELECT ON public.game_rounds TO anon, authenticated;
GRANT SELECT ON public.player_answers TO anon, authenticated;
GRANT SELECT ON public.votes TO anon, authenticated;
GRANT SELECT ON public.game_category_prompts TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4) Internal helpers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.private_player_token_hash(p_token TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public, extensions
AS $$
  SELECT encode(extensions.digest(btrim(p_token), 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.private_assert_player_session(
  p_game_id UUID,
  p_player_id UUID,
  p_player_token TEXT,
  p_require_connected BOOLEAN DEFAULT TRUE
)
RETURNS public.players
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_player public.players%ROWTYPE;
  v_auth_user_banned BOOLEAN := FALSE;
BEGIN
  IF p_game_id IS NULL OR p_player_id IS NULL THEN
    RAISE EXCEPTION 'Game ID and player ID are required';
  END IF;

  IF p_player_token IS NULL OR btrim(p_player_token) = '' THEN
    RAISE EXCEPTION 'Player session token required';
  END IF;

  IF auth.uid() IS NOT NULL THEN
    SELECT hp.is_banned
    INTO v_auth_user_banned
    FROM public.host_profiles hp
    WHERE hp.id = auth.uid();

    IF COALESCE(v_auth_user_banned, FALSE) THEN
      RAISE EXCEPTION 'Banned users cannot participate in games';
    END IF;
  END IF;

  SELECT p.*
  INTO v_player
  FROM public.players p
  WHERE p.id = p_player_id
    AND p.game_id = p_game_id
    AND p.session_token_hash = public.private_player_token_hash(p_player_token);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid player session';
  END IF;

  IF p_require_connected AND v_player.connection_status <> 'connected' THEN
    RAISE EXCEPTION 'Player is not connected';
  END IF;

  RETURN v_player;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.private_player_token_hash(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.private_assert_player_session(UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5) Host/admin RPCs
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_host_display_name(p_display_name VARCHAR(100))
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_auth_user_id UUID;
BEGIN
  v_auth_user_id := auth.uid();

  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF btrim(COALESCE(p_display_name, '')) = '' THEN
    RAISE EXCEPTION 'Display name is required';
  END IF;

  UPDATE public.host_profiles
  SET
    display_name = left(btrim(p_display_name), 100),
    updated_at = NOW()
  WHERE id = v_auth_user_id;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_host_ban(
  p_target_host_id UUID,
  p_is_banned BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Admin privileges required';
  END IF;

  UPDATE public.host_profiles
  SET
    is_banned = p_is_banned,
    updated_at = NOW()
  WHERE id = p_target_host_id;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_host_display_name(
  p_target_host_id UUID,
  p_display_name VARCHAR(100)
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Admin privileges required';
  END IF;

  IF btrim(COALESCE(p_display_name, '')) = '' THEN
    RAISE EXCEPTION 'Display name is required';
  END IF;

  UPDATE public.host_profiles
  SET
    display_name = left(btrim(p_display_name), 100),
    updated_at = NOW()
  WHERE id = p_target_host_id;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_host_display_name(VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_host_ban(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_host_display_name(UUID, VARCHAR) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6) Authenticated host RPCs
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_host_entitlement()
RETURNS TABLE (
  can_create_games BOOLEAN,
  subscription_tier VARCHAR(20),
  subscription_active BOOLEAN,
  games_created INTEGER,
  display_name VARCHAR(100)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_auth_user_id UUID;
BEGIN
  v_auth_user_id := auth.uid();

  IF v_auth_user_id IS NULL THEN
    RETURN QUERY
    SELECT
      FALSE AS can_create_games,
      'none'::VARCHAR(20) AS subscription_tier,
      FALSE AS subscription_active,
      0 AS games_created,
      NULL::VARCHAR(100) AS display_name;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    (NOT COALESCE(hp.is_banned, FALSE)) AND public.is_host_subscription_active(v_auth_user_id) AS can_create_games,
    hp.subscription_tier,
    (NOT COALESCE(hp.is_banned, FALSE)) AND public.is_host_subscription_active(v_auth_user_id) AS subscription_active,
    hp.games_created_count AS games_created,
    hp.display_name
  FROM public.host_profiles hp
  WHERE hp.id = v_auth_user_id;
END;
$$;

DROP FUNCTION IF EXISTS public.create_authenticated_game(VARCHAR, INTEGER, INTEGER, VARCHAR, BOOLEAN);

CREATE OR REPLACE FUNCTION public.create_authenticated_game(
  p_code VARCHAR(6),
  p_round_count INTEGER,
  p_max_players INTEGER,
  p_host_name VARCHAR(50) DEFAULT NULL,
  p_is_display_mode BOOLEAN DEFAULT FALSE,
  p_avatar_color VARCHAR(7) DEFAULT NULL
)
RETURNS TABLE (
  game_id UUID,
  game_code VARCHAR(6),
  player_id UUID,
  player_name VARCHAR(50),
  is_host BOOLEAN,
  player_token TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_auth_user_id UUID;
  v_game_id UUID;
  v_player_id UUID;
  v_player_token TEXT;
  v_avatar_color VARCHAR(7) := '#7c3aed';
  v_is_banned BOOLEAN := FALSE;
BEGIN
  v_auth_user_id := auth.uid();

  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to create games';
  END IF;

  SELECT hp.is_banned
  INTO v_is_banned
  FROM public.host_profiles hp
  WHERE hp.id = v_auth_user_id;

  IF COALESCE(v_is_banned, FALSE) THEN
    RAISE EXCEPTION 'Banned hosts cannot create games';
  END IF;

  IF p_round_count < 4 OR p_round_count > 20 THEN
    RAISE EXCEPTION 'Round count must be between 4 and 20';
  END IF;

  IF p_max_players < 4 OR p_max_players > 10 THEN
    RAISE EXCEPTION 'Max players must be between 4 and 10';
  END IF;

  IF p_avatar_color IS NOT NULL AND p_avatar_color ~ '^#[0-9A-Fa-f]{6}$' THEN
    v_avatar_color := p_avatar_color;
  END IF;

  INSERT INTO public.games (
    id,
    code,
    auth_host_id,
    host_id,
    phase_captain_id,
    status,
    round_count,
    max_players,
    current_round,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    upper(btrim(p_code)),
    v_auth_user_id,
    NULL,
    NULL,
    'waiting',
    p_round_count,
    p_max_players,
    0,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_game_id;

  IF NOT p_is_display_mode AND btrim(COALESCE(p_host_name, '')) <> '' THEN
    v_player_token := encode(extensions.gen_random_bytes(32), 'hex');

    INSERT INTO public.players (
      id,
      game_id,
      user_name,
      avatar_color,
      is_host,
      score,
      connection_status,
      joined_at,
      session_token_hash
    ) VALUES (
      gen_random_uuid(),
      v_game_id,
      left(btrim(p_host_name), 50),
      v_avatar_color,
      TRUE,
      0,
      'connected',
      NOW(),
      public.private_player_token_hash(v_player_token)
    )
    RETURNING id INTO v_player_id;

    UPDATE public.games
    SET
      host_id = v_player_id,
      phase_captain_id = v_player_id,
      updated_at = NOW()
    WHERE id = v_game_id;

    UPDATE public.host_profiles
    SET
      games_created_count = games_created_count + 1,
      last_game_created_at = NOW(),
      updated_at = NOW()
    WHERE id = v_auth_user_id;

    RETURN QUERY
    SELECT
      v_game_id,
      upper(btrim(p_code))::VARCHAR(6),
      v_player_id,
      left(btrim(p_host_name), 50)::VARCHAR(50),
      TRUE,
      v_player_token::TEXT;
    RETURN;
  END IF;

  UPDATE public.host_profiles
  SET
    games_created_count = games_created_count + 1,
    last_game_created_at = NOW(),
    updated_at = NOW()
  WHERE id = v_auth_user_id;

  RETURN QUERY
  SELECT
    v_game_id,
    upper(btrim(p_code))::VARCHAR(6),
    NULL::UUID,
    NULL::VARCHAR(50),
    FALSE,
    NULL::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_game_as_host(p_game_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_auth_user_id UUID;
BEGIN
  v_auth_user_id := auth.uid();

  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.games
  SET
    status = 'finished',
    updated_at = NOW()
  WHERE id = p_game_id
    AND auth_host_id = v_auth_user_id;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_host_entitlement() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_authenticated_game(VARCHAR, INTEGER, INTEGER, VARCHAR, BOOLEAN, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_game_as_host(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7) Secure join/reconnect and gameplay RPCs
-- -----------------------------------------------------------------------------
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

DROP FUNCTION IF EXISTS public.claim_phase_captain_if_unassigned(UUID, UUID);

CREATE OR REPLACE FUNCTION public.claim_phase_captain_if_unassigned(
  p_game_id UUID,
  p_player_id UUID,
  p_player_token TEXT
)
RETURNS TABLE(
  success BOOLEAN,
  phase_captain_id UUID,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_game public.games%ROWTYPE;
BEGIN
  PERFORM public.private_assert_player_session(p_game_id, p_player_id, p_player_token, TRUE);

  SELECT g.*
  INTO v_game
  FROM public.games g
  WHERE g.id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Game not found'::TEXT;
    RETURN;
  END IF;

  IF v_game.phase_captain_id IS NOT NULL THEN
    RETURN QUERY SELECT TRUE, v_game.phase_captain_id, 'Captain already assigned'::TEXT;
    RETURN;
  END IF;

  IF v_game.status = 'finished' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Cannot claim captain in finished game'::TEXT;
    RETURN;
  END IF;

  UPDATE public.games
  SET
    phase_captain_id = p_player_id,
    host_id = COALESCE(host_id, p_player_id),
    updated_at = NOW()
  WHERE id = p_game_id;

  RETURN QUERY SELECT TRUE, p_player_id, 'Captain claimed successfully'::TEXT;
END;
$$;

DROP FUNCTION IF EXISTS public.start_game_as_player(UUID, UUID);

CREATE OR REPLACE FUNCTION public.start_game_as_player(
  p_game_id UUID,
  p_player_id UUID,
  p_player_token TEXT
)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_controller_id UUID;
BEGIN
  PERFORM public.private_assert_player_session(p_game_id, p_player_id, p_player_token, TRUE);

  SELECT g.*
  INTO v_game
  FROM public.games g
  WHERE g.id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Game not found'::TEXT;
    RETURN;
  END IF;

  IF v_game.status <> 'waiting' THEN
    RETURN QUERY SELECT FALSE, ('Game is already ' || v_game.status)::TEXT;
    RETURN;
  END IF;

  v_controller_id := COALESCE(v_game.host_id, v_game.phase_captain_id);
  IF v_controller_id IS NOT NULL AND v_controller_id <> p_player_id THEN
    RETURN QUERY SELECT FALSE, 'Only the game controller can start the game'::TEXT;
    RETURN;
  END IF;

  UPDATE public.games
  SET
    status = 'playing',
    current_round = 1,
    host_id = COALESCE(host_id, p_player_id),
    phase_captain_id = COALESCE(phase_captain_id, p_player_id),
    updated_at = NOW()
  WHERE id = p_game_id;

  RETURN QUERY SELECT TRUE, 'Game started'::TEXT;
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

DROP FUNCTION IF EXISTS public.cast_vote(UUID, UUID, UUID);

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
  DO UPDATE
  SET
    answer_id = EXCLUDED.answer_id,
    points_earned = 0
  RETURNING * INTO v_vote;

  PERFORM public.advance_round_if_ready(p_round_id);

  RETURN v_vote;
END;
$$;

DROP FUNCTION IF EXISTS public.advance_to_next_round_by_player(UUID, UUID);

CREATE OR REPLACE FUNCTION public.advance_to_next_round_by_player(
  p_game_id UUID,
  p_player_id UUID,
  p_player_token TEXT
)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_controller_id UUID;
  v_current_round_status TEXT;
  v_next_round INTEGER;
BEGIN
  PERFORM public.private_assert_player_session(p_game_id, p_player_id, p_player_token, TRUE);

  SELECT g.*
  INTO v_game
  FROM public.games g
  WHERE g.id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Game not found'::TEXT;
    RETURN;
  END IF;

  IF v_game.status <> 'playing' THEN
    RETURN QUERY SELECT FALSE, ('Game is not in playing state (' || v_game.status || ')')::TEXT;
    RETURN;
  END IF;

  v_controller_id := COALESCE(v_game.host_id, v_game.phase_captain_id);
  IF v_controller_id IS NOT NULL AND v_controller_id <> p_player_id THEN
    RETURN QUERY SELECT FALSE, 'Only the game controller can advance to next round'::TEXT;
    RETURN;
  END IF;

  SELECT gr.status
  INTO v_current_round_status
  FROM public.game_rounds gr
  WHERE gr.game_id = p_game_id
    AND gr.round_number = v_game.current_round;

  IF v_current_round_status IS NOT NULL AND v_current_round_status <> 'completed' THEN
    RETURN QUERY SELECT FALSE, ('Current round must be completed before advancing (status: ' || v_current_round_status || ')')::TEXT;
    RETURN;
  END IF;

  v_next_round := v_game.current_round + 1;

  IF v_next_round > v_game.round_count THEN
    UPDATE public.games
    SET
      status = 'finished',
      updated_at = NOW()
    WHERE id = p_game_id;

    RETURN QUERY SELECT TRUE, 'Game finished'::TEXT;
    RETURN;
  END IF;

  UPDATE public.games
  SET
    current_round = v_next_round,
    updated_at = NOW()
  WHERE id = p_game_id;

  RETURN QUERY SELECT TRUE, ('Advanced to round ' || v_next_round)::TEXT;
END;
$$;

DROP FUNCTION IF EXISTS public.leave_game_as_player(UUID, UUID);

CREATE OR REPLACE FUNCTION public.leave_game_as_player(
  p_game_id UUID,
  p_player_id UUID,
  p_player_token TEXT
)
RETURNS TABLE(
  success BOOLEAN,
  game_ended BOOLEAN,
  new_captain_id UUID,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_player public.players%ROWTYPE;
  v_new_captain_id UUID;
BEGIN
  v_player := public.private_assert_player_session(p_game_id, p_player_id, p_player_token, FALSE);

  SELECT g.*
  INTO v_game
  FROM public.games g
  WHERE g.id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, FALSE, NULL::UUID, 'Game not found'::TEXT;
    RETURN;
  END IF;

  IF v_player.connection_status = 'disconnected' THEN
    RETURN QUERY SELECT TRUE, (v_game.status = 'finished'), v_game.phase_captain_id, 'Player already disconnected'::TEXT;
    RETURN;
  END IF;

  UPDATE public.players
  SET connection_status = 'disconnected'
  WHERE id = p_player_id;

  IF v_game.status = 'finished' THEN
    RETURN QUERY SELECT TRUE, TRUE, v_game.phase_captain_id, 'Game already finished'::TEXT;
    RETURN;
  END IF;

  IF v_game.phase_captain_id = p_player_id THEN
    SELECT p.id
    INTO v_new_captain_id
    FROM public.players p
    WHERE p.game_id = p_game_id
      AND p.id <> p_player_id
      AND p.connection_status = 'connected'
      AND p.joined_at > v_player.joined_at
    ORDER BY p.joined_at ASC
    LIMIT 1;

    IF v_new_captain_id IS NULL THEN
      SELECT p.id
      INTO v_new_captain_id
      FROM public.players p
      WHERE p.game_id = p_game_id
        AND p.id <> p_player_id
        AND p.connection_status = 'connected'
      ORDER BY p.joined_at ASC
      LIMIT 1;
    END IF;

    IF v_new_captain_id IS NOT NULL THEN
      UPDATE public.games
      SET
        phase_captain_id = v_new_captain_id,
        host_id = v_new_captain_id,
        updated_at = NOW()
      WHERE id = p_game_id;

      RETURN QUERY SELECT TRUE, FALSE, v_new_captain_id, 'Captain transferred successfully'::TEXT;
      RETURN;
    END IF;

    UPDATE public.games
    SET
      status = 'finished',
      phase_captain_id = NULL,
      updated_at = NOW()
    WHERE id = p_game_id;

    RETURN QUERY SELECT TRUE, TRUE, NULL::UUID, 'No connected players left. Game finished.'::TEXT;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.players p
    WHERE p.game_id = p_game_id
      AND p.connection_status = 'connected'
  ) THEN
    UPDATE public.games
    SET
      status = 'finished',
      phase_captain_id = NULL,
      updated_at = NOW()
    WHERE id = p_game_id;

    RETURN QUERY SELECT TRUE, TRUE, NULL::UUID, 'No connected players left. Game finished.'::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT TRUE, FALSE, v_game.phase_captain_id, 'Player disconnected'::TEXT;
END;
$$;

DROP FUNCTION IF EXISTS public.promote_phase_captain(UUID, UUID);

CREATE OR REPLACE FUNCTION public.promote_phase_captain(
  p_game_id UUID,
  p_disconnected_player_id UUID,
  p_player_id UUID,
  p_player_token TEXT
)
RETURNS TABLE(
  success BOOLEAN,
  new_captain_id UUID,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_new_captain_id UUID;
BEGIN
  PERFORM public.private_assert_player_session(p_game_id, p_player_id, p_player_token, TRUE);

  SELECT g.*
  INTO v_game
  FROM public.games g
  WHERE g.id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Game not found'::TEXT;
    RETURN;
  END IF;

  IF v_game.status = 'finished' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Cannot promote captain in finished game'::TEXT;
    RETURN;
  END IF;

  IF v_game.phase_captain_id <> p_disconnected_player_id THEN
    RETURN QUERY SELECT FALSE, v_game.phase_captain_id, 'Player is not the current captain'::TEXT;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.players p
    WHERE p.id = p_disconnected_player_id
      AND p.game_id = p_game_id
      AND p.connection_status = 'connected'
  ) THEN
    RETURN QUERY SELECT FALSE, v_game.phase_captain_id, 'Disconnected player is still marked connected'::TEXT;
    RETURN;
  END IF;

  SELECT p.id
  INTO v_new_captain_id
  FROM public.players p
  WHERE p.game_id = p_game_id
    AND p.id <> p_disconnected_player_id
    AND p.connection_status = 'connected'
  ORDER BY p.joined_at ASC
  LIMIT 1;

  IF v_new_captain_id IS NULL THEN
    UPDATE public.games
    SET
      status = 'finished',
      phase_captain_id = NULL,
      updated_at = NOW()
    WHERE id = p_game_id;

    RETURN QUERY SELECT TRUE, NULL::UUID, 'No eligible players to promote. Game finished.'::TEXT;
    RETURN;
  END IF;

  UPDATE public.games
  SET
    phase_captain_id = v_new_captain_id,
    host_id = v_new_captain_id,
    updated_at = NOW()
  WHERE id = p_game_id;

  RETURN QUERY SELECT TRUE, v_new_captain_id, 'Captain promoted successfully'::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_game_category_prompt(
  p_game_id UUID,
  p_round_number INTEGER,
  p_player_id UUID,
  p_player_token TEXT,
  p_options JSONB DEFAULT NULL,
  p_selected_category TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_controller_id UUID;
  v_existing public.game_category_prompts%ROWTYPE;
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

  v_controller_id := COALESCE(v_game.host_id, v_game.phase_captain_id);
  IF v_controller_id IS NOT NULL AND v_controller_id <> p_player_id THEN
    RAISE EXCEPTION 'Only the controller can update category prompts';
  END IF;

  IF p_options IS NULL AND p_selected_category IS NULL THEN
    RAISE EXCEPTION 'Either options or selected category must be provided';
  END IF;

  IF p_options IS NOT NULL AND jsonb_typeof(p_options) <> 'array' THEN
    RAISE EXCEPTION 'Category options must be a JSON array';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.game_category_prompts gcp
  WHERE gcp.game_id = p_game_id
    AND gcp.round_number = p_round_number;

  IF p_selected_category IS NOT NULL AND v_existing.id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(v_existing.options) AS opt(value)
      WHERE opt.value = p_selected_category
    ) THEN
      RAISE EXCEPTION 'Selected category must match the saved options';
    END IF;
  END IF;

  INSERT INTO public.game_category_prompts (
    id,
    game_id,
    round_number,
    options,
    selected_category,
    created_at,
    updated_at
  ) VALUES (
    COALESCE(v_existing.id, gen_random_uuid()),
    p_game_id,
    p_round_number,
    COALESCE(p_options, COALESCE(v_existing.options, '[]'::jsonb)),
    COALESCE(p_selected_category, v_existing.selected_category),
    COALESCE(v_existing.created_at, NOW()),
    NOW()
  )
  ON CONFLICT (game_id, round_number)
  DO UPDATE
  SET
    options = COALESCE(EXCLUDED.options, public.game_category_prompts.options),
    selected_category = COALESCE(EXCLUDED.selected_category, public.game_category_prompts.selected_category),
    updated_at = NOW();

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.force_advance_round(p_round_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_round RECORD;
  v_correct_answer_exists BOOLEAN;
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
    SELECT EXISTS (
      SELECT 1
      FROM public.player_answers pa
      WHERE pa.round_id = p_round_id
        AND pa.is_correct = TRUE
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
BEGIN
  SELECT gr.*
  INTO v_round
  FROM public.game_rounds gr
  WHERE gr.id = p_round_id;

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

  v_controller_id := COALESCE(v_game.host_id, v_game.phase_captain_id);
  IF v_controller_id IS NOT NULL AND v_controller_id <> p_player_id THEN
    RAISE EXCEPTION 'Only the controller can force advance the round';
  END IF;

  PERFORM public.force_advance_round(p_round_id);
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_game(VARCHAR, VARCHAR, VARCHAR) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconnect_player_session(UUID, UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_phase_captain_if_unassigned(UUID, UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_game_as_player(UUID, UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_round_as_player(UUID, INTEGER, UUID, TEXT, VARCHAR, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_answer(UUID, UUID, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cast_vote(UUID, UUID, TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_to_next_round_by_player(UUID, UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leave_game_as_player(UUID, UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_phase_captain(UUID, UUID, UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_game_category_prompt(UUID, INTEGER, UUID, TEXT, JSONB, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.force_advance_round_as_player(UUID, UUID, TEXT) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.force_advance_round(UUID) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.join_game(VARCHAR, VARCHAR, VARCHAR) IS
'Joins a waiting game, returns a one-time player session token, and assigns the first controller when needed.';
COMMENT ON FUNCTION public.reconnect_player_session(UUID, UUID, TEXT) IS
'Reconnects an existing anonymous player session using the persisted player token.';
COMMENT ON FUNCTION public.submit_answer(UUID, UUID, TEXT, TEXT) IS
'Submits an answer using a token-verified anonymous player session.';
COMMENT ON FUNCTION public.cast_vote(UUID, UUID, TEXT, UUID) IS
'Casts or changes a vote using a token-verified anonymous player session.';
COMMENT ON FUNCTION public.force_advance_round_as_player(UUID, UUID, TEXT) IS
'Allows only the active controller to force the current round phase transition after timer expiry.';

-- -----------------------------------------------------------------------------
-- 8) Payment hardening
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_payment_record(
  p_moyasar_payment_id VARCHAR(255),
  p_plan_id VARCHAR(50),
  p_amount INTEGER,
  p_description TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_payment_id UUID;
  v_host_id UUID;
  v_is_banned BOOLEAN := FALSE;
BEGIN
  v_host_id := auth.uid();

  IF v_host_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to create payment';
  END IF;

  SELECT hp.is_banned
  INTO v_is_banned
  FROM public.host_profiles hp
  WHERE hp.id = v_host_id;

  IF COALESCE(v_is_banned, FALSE) THEN
    RAISE EXCEPTION 'Banned users cannot create payments';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  INSERT INTO public.payments (
    id,
    moyasar_payment_id,
    host_id,
    plan_id,
    amount,
    currency,
    status,
    description,
    created_at
  ) VALUES (
    gen_random_uuid(),
    p_moyasar_payment_id,
    v_host_id,
    lower(btrim(p_plan_id)),
    p_amount,
    'SAR',
    'initiated',
    COALESCE(p_description, 'Subscription: ' || lower(btrim(p_plan_id))),
    NOW()
  )
  ON CONFLICT (moyasar_payment_id) DO UPDATE
  SET
    plan_id = EXCLUDED.plan_id,
    amount = EXCLUDED.amount,
    description = EXCLUDED.description
  RETURNING id INTO v_payment_id;

  RETURN v_payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_payment_status(
  p_moyasar_payment_id VARCHAR(255),
  p_status VARCHAR(20),
  p_payment_method VARCHAR(50) DEFAULT NULL,
  p_card_company VARCHAR(50) DEFAULT NULL,
  p_card_last_four VARCHAR(4) DEFAULT NULL,
  p_moyasar_reference VARCHAR(255) DEFAULT NULL,
  p_moyasar_gateway_id VARCHAR(255) DEFAULT NULL,
  p_failure_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_updated BOOLEAN;
  v_normalized_status VARCHAR(20);
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;

  v_normalized_status := CASE lower(COALESCE(p_status, ''))
    WHEN 'captured' THEN 'paid'
    WHEN 'paid' THEN 'paid'
    WHEN 'failed' THEN 'failed'
    WHEN 'refunded' THEN 'refunded'
    WHEN 'initiated' THEN 'initiated'
    WHEN 'authorized' THEN 'authorized'
    ELSE lower(COALESCE(p_status, ''))
  END;

  UPDATE public.payments
  SET
    status = v_normalized_status,
    payment_method = COALESCE(p_payment_method, payment_method),
    card_company = COALESCE(p_card_company, card_company),
    card_last_four = COALESCE(p_card_last_four, card_last_four),
    moyasar_reference_number = COALESCE(p_moyasar_reference, moyasar_reference_number),
    moyasar_gateway_id = COALESCE(p_moyasar_gateway_id, moyasar_gateway_id),
    failure_reason = COALESCE(p_failure_reason, failure_reason),
    updated_at = NOW(),
    refunded_at = CASE WHEN v_normalized_status = 'refunded' THEN NOW() ELSE refunded_at END
  WHERE moyasar_payment_id = p_moyasar_payment_id;

  v_updated := FOUND;

  IF NOT v_updated THEN
    RAISE WARNING 'Payment not found: %', p_moyasar_payment_id;
  END IF;

  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_payment_record(VARCHAR, VARCHAR, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payment_history() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_payment_status(VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.update_payment_status(VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.update_payment_status(VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT) IS
'Service-role-only payment mutation path. Used by verified server-side webhook/callback handlers.';

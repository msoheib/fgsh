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

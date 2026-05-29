-- Allow disconnected players to reclaim their same-name slot while a restarted
-- game is back in the waiting room. Keep connected duplicate-name protection.

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
  v_join_name VARCHAR(50);
  v_reclaimed_player public.players%ROWTYPE;
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

  v_join_name := left(btrim(p_player_name), 50);

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

  IF v_game.status = 'waiting' THEN
    SELECT p.*
    INTO v_reclaimed_player
    FROM public.players p
    WHERE p.game_id = v_game.id
      AND lower(btrim(p.user_name)) = lower(v_join_name)
    ORDER BY p.joined_at ASC, p.id ASC
    LIMIT 1;

    IF FOUND THEN
      IF v_reclaimed_player.connection_status = 'connected' THEN
        RAISE EXCEPTION 'Player name already taken';
      END IF;

      v_player_token := encode(extensions.gen_random_bytes(32), 'hex');

      UPDATE public.players
      SET
        connection_status = 'connected',
        session_token_hash = public.private_player_token_hash(v_player_token)
      WHERE id = v_reclaimed_player.id
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
      RETURN;
    END IF;

    SELECT COUNT(*)
    INTO v_player_count
    FROM public.players p
    WHERE p.game_id = v_game.id
      AND p.connection_status = 'connected';

    IF v_player_count >= v_game.max_players THEN
      RAISE EXCEPTION 'Game is full';
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
      v_join_name,
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
    RETURN;
  ELSIF v_game.status = 'playing' THEN
    IF EXISTS (
      SELECT 1
      FROM public.players p
      WHERE p.game_id = v_game.id
        AND lower(btrim(p.user_name)) = lower(v_join_name)
        AND p.connection_status = 'connected'
    ) THEN
      RAISE EXCEPTION 'Player name already taken';
    END IF;

    SELECT p.*
    INTO v_reclaimed_player
    FROM public.players p
    WHERE p.game_id = v_game.id
      AND lower(btrim(p.user_name)) = lower(v_join_name)
      AND p.connection_status = 'disconnected'
    ORDER BY p.joined_at ASC, p.id ASC
    LIMIT 1;

    IF FOUND THEN
      v_player_token := encode(extensions.gen_random_bytes(32), 'hex');

      UPDATE public.players
      SET
        connection_status = 'connected',
        session_token_hash = public.private_player_token_hash(v_player_token)
      WHERE id = v_reclaimed_player.id
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
      RETURN;
    END IF;

    RAISE EXCEPTION 'Game is already playing';
  ELSE
    RAISE EXCEPTION 'Game is already %', v_game.status;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_game(VARCHAR, VARCHAR, VARCHAR) TO anon, authenticated;

COMMENT ON FUNCTION public.join_game(VARCHAR, VARCHAR, VARCHAR) IS
'Allows waiting-room and live reclaims for disconnected players while blocking connected duplicate names and brand-new late joins.';

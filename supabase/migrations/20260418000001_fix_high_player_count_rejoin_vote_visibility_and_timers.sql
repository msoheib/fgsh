-- Migration: fix high-player-count gameplay issues
-- Purpose:
-- 1) Allow disconnected players to reclaim their slot while a game is in progress.
-- 2) Keep brand-new late joins blocked during live games.
-- 3) Increase voting duration to 45 seconds server-side.

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
    IF EXISTS (
      SELECT 1
      FROM public.players p
      WHERE p.game_id = v_game.id
        AND lower(btrim(p.user_name)) = lower(v_join_name)
    ) THEN
      RAISE EXCEPTION 'Player name already taken';
    END IF;

    SELECT COUNT(*)
    INTO v_player_count
    FROM public.players p
    WHERE p.game_id = v_game.id;

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
'Allows waiting-room joins and live reclaims for disconnected players while blocking brand-new late joins in active games.';

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
      timer_duration = 45,
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

GRANT EXECUTE ON FUNCTION public.advance_round_if_ready(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.force_advance_round(UUID) TO anon, authenticated;

COMMENT ON FUNCTION public.force_advance_round(UUID) IS
'Forces a round forward, applying scoring if the round is already in voting.';

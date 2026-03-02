-- Migration: Guard force_advance_round to prevent accidental voting skips
-- Problem:
-- Duplicate timer-expiry RPC calls can happen close together (multi-device/reconnect race).
-- Without a server-side timer check, the second call can move:
-- answering -> voting -> completed immediately.
--
-- Fix:
-- Keep answering -> voting behavior, but only allow voting -> completed when
-- the server-side voting timer is actually expired.

CREATE OR REPLACE FUNCTION force_advance_round(p_round_id UUID)
RETURNS VOID AS $$
DECLARE
  v_round RECORD;
  v_correct_answer_exists BOOLEAN;
  v_connected_players INTEGER;
  v_lie_count INTEGER;
  v_voting_deadline TIMESTAMPTZ;
BEGIN
  SELECT gr.* INTO v_round
  FROM game_rounds gr
  WHERE gr.id = p_round_id
  FOR UPDATE;

  IF v_round IS NULL OR v_round.status = 'completed' THEN
    RETURN;
  END IF;

  -- ANSWERING -> VOTING (timer force)
  IF v_round.status = 'answering' THEN
    SELECT EXISTS (
      SELECT 1
      FROM player_answers pa
      WHERE pa.round_id = p_round_id
        AND pa.is_correct = true
    ) INTO v_correct_answer_exists;

    IF NOT v_correct_answer_exists THEN
      INSERT INTO player_answers (round_id, player_id, answer_text, is_correct)
      SELECT
        p_round_id,
        NULL::UUID,
        q.correct_answer,
        true
      FROM questions q
      WHERE q.id = v_round.question_id
      ON CONFLICT DO NOTHING;
    END IF;

    IF to_regclass('public.question_lies') IS NOT NULL THEN
      SELECT COUNT(*) INTO v_connected_players
      FROM players p
      WHERE p.game_id = v_round.game_id
        AND p.connection_status = 'connected';

      v_lie_count := LEAST(3, GREATEST(2, 7 - GREATEST(v_connected_players, 1)));

      INSERT INTO player_answers (round_id, player_id, answer_text, is_correct)
      SELECT
        p_round_id,
        NULL::UUID,
        ql.lie_text,
        false
      FROM question_lies ql
      WHERE ql.question_id = v_round.question_id
        AND NOT EXISTS (
          SELECT 1 FROM player_answers pa
          WHERE pa.round_id = p_round_id
            AND LOWER(TRIM(pa.answer_text)) = LOWER(TRIM(ql.lie_text))
        )
      ORDER BY random()
      LIMIT v_lie_count
      ON CONFLICT DO NOTHING;
    END IF;

    UPDATE game_rounds
    SET
      status = 'voting',
      timer_duration = 20,
      timer_starts_at = NOW()
    WHERE id = p_round_id;

    RETURN;
  END IF;

  -- VOTING -> COMPLETED (timer force)
  IF v_round.status = 'voting' THEN
    -- Critical guard: only complete if voting timer is expired on server.
    IF v_round.timer_starts_at IS NOT NULL THEN
      v_voting_deadline := v_round.timer_starts_at
        + make_interval(secs => GREATEST(COALESCE(v_round.timer_duration, 0), 0));

      IF NOW() < v_voting_deadline THEN
        RETURN;
      END IF;
    END IF;

    BEGIN
      PERFORM calculate_and_update_scores(p_round_id, v_round.game_id);
    EXCEPTION
      WHEN undefined_function THEN
        NULL;
    END;

    UPDATE game_rounds
    SET status = 'completed'
    WHERE id = p_round_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION force_advance_round IS
'Forces phase transitions on timer expiry. Guarded to prevent immediate voting->completed skips from duplicate calls.';


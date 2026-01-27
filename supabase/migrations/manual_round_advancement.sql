-- Migration: Manual Round Advancement (Per-Round Reveal)
-- Purpose: Stop automatic round incrementing to allow for a "Reveal" phase.
-- host must now manually click "Next Round".

-- ============================================================================
-- 1. MODIFY: advance_round_if_ready
-- Remove the automatic increment logic.
-- ============================================================================
CREATE OR REPLACE FUNCTION advance_round_if_ready(p_round_id UUID)
RETURNS VOID AS $$
DECLARE
  v_round RECORD;
  v_game RECORD;
  v_answer_count INTEGER;
  v_vote_count INTEGER;
BEGIN
  -- Lock the round row
  SELECT gr.* INTO v_round
  FROM game_rounds gr
  WHERE gr.id = p_round_id
  FOR UPDATE;

  -- Exit if round not found or already completed
  IF v_round IS NULL OR v_round.status = 'completed' THEN
    RETURN;
  END IF;

  -- Get game info and lock it too
  SELECT g.* INTO v_game
  FROM games g
  WHERE g.id = v_round.game_id
  FOR UPDATE;

  -- Safety check
  IF v_round.required_players < 2 THEN
    RAISE NOTICE 'Not enough required players (%), skipping phase transition', v_round.required_players;
    RETURN;
  END IF;

  -- ANSWERING -> VOTING
  IF v_round.status = 'answering' THEN
    SELECT COUNT(*) INTO v_answer_count
    FROM player_answers pa
    WHERE pa.round_id = p_round_id
      AND pa.is_correct = false;

    IF v_answer_count >= v_round.required_players THEN
      -- Insert correct answer
      INSERT INTO player_answers (round_id, player_id, answer_text, is_correct)
      SELECT
        p_round_id,
        NULL::UUID,
        q.correct_answer,
        true
      FROM questions q
      WHERE q.id = v_round.question_id
      ON CONFLICT DO NOTHING;

      -- Update status
      UPDATE game_rounds gr
      SET status = 'voting',
          timer_duration = 20
      WHERE gr.id = p_round_id;

      RAISE NOTICE '🗳️ Round % transitioned to VOTING', v_round.round_number;
      RETURN;
    END IF;
  END IF;

  -- VOTING -> COMPLETED
  IF v_round.status = 'voting' THEN
    SELECT COUNT(DISTINCT v.voter_id) INTO v_vote_count
    FROM votes v
    WHERE v.round_id = p_round_id;

    IF v_vote_count >= v_round.required_players THEN
      -- Mark round as completed
      UPDATE game_rounds gr
      SET status = 'completed'
      WHERE gr.id = p_round_id;

      -- IMPORTANT: We do NOT increment current_round here anymore.
      -- We pause here for the Reveal phase.

      RAISE NOTICE '🏁 Round % completed - Waiting for host to advance', v_round.round_number;
      RETURN;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. MODIFY: force_advance_round
-- Remove the automatic increment logic.
-- ============================================================================
CREATE OR REPLACE FUNCTION force_advance_round(p_round_id UUID)
RETURNS VOID AS $$
DECLARE
  v_round game_rounds%ROWTYPE;
  v_game games%ROWTYPE;
BEGIN
  -- Lock current round
  SELECT * INTO v_round
  FROM game_rounds
  WHERE game_rounds.id = p_round_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Lock the parent game
  SELECT * INTO v_game
  FROM games
  WHERE games.id = v_round.game_id
  FOR UPDATE;

  -- Answering -> Voting
  IF v_round.status = 'answering' THEN
    INSERT INTO player_answers (round_id, player_id, answer_text, is_correct)
    SELECT
      p_round_id,
      NULL,
      q.correct_answer,
      true
    FROM questions AS q
    WHERE q.id = v_round.question_id
    ON CONFLICT DO NOTHING;

    UPDATE game_rounds
    SET status = 'voting',
        timer_duration = 20
    WHERE game_rounds.id = p_round_id;

    RETURN;
  END IF;

  -- Voting -> Completed
  IF v_round.status = 'voting' THEN
    PERFORM calculate_and_update_scores(p_round_id, v_game.id);

    UPDATE game_rounds
    SET status = 'completed'
    WHERE game_rounds.id = p_round_id;

    -- IMPORTANT: Do NOT increment current_round here.
    
    RAISE NOTICE '⏰ Timer expired! Round force-completed. Waiting for host.';
    RETURN;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. NEW: advance_to_next_round
-- Manual trigger for Host to move to next round
-- ============================================================================
CREATE OR REPLACE FUNCTION advance_to_next_round(p_game_id UUID)
RETURNS VOID AS $$
DECLARE
  v_game games%ROWTYPE;
  v_next_round_number INTEGER;
  v_current_round_status TEXT;
BEGIN
  -- Lock game
  SELECT * INTO v_game
  FROM games
  WHERE id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found';
  END IF;

  -- Verify current round is actually completed (optional safety check)
  SELECT status INTO v_current_round_status
  FROM game_rounds
  WHERE game_id = p_game_id AND round_number = v_game.current_round;

  IF v_current_round_status IS NOT NULL AND v_current_round_status != 'completed' THEN
    RAISE NOTICE '⚠️ Warning: Advancing round but previous round % is status %', v_game.current_round, v_current_round_status;
    -- We allow it anyway in case of stuck state, but log warning
  END IF;

  v_next_round_number := v_game.current_round + 1;

  IF v_next_round_number > v_game.round_count THEN
    -- Finish Game
    UPDATE games
    SET status = 'finished'
    WHERE id = p_game_id;
    
    RAISE NOTICE '🎉 Game finished manually by host';
  ELSE
    -- Next Round
    UPDATE games
    SET current_round = v_next_round_number
    WHERE id = p_game_id;

    RAISE NOTICE '➡️ Manually advancing to round %', v_next_round_number;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Migration: Increase heartbeat window for background tab tolerance
-- Purpose: Account for browser throttling of setInterval in background tabs
-- Chrome/Firefox throttle timers to ~1min in background tabs, so 30s is too strict
--
-- Background: We send heartbeat every 10s, but background tabs can throttle
-- to 60s. Increasing window to 90s gives a 1.5x safety margin for background tabs.

-- Update advance_round_if_ready to use 90-second window instead of 30-second
CREATE OR REPLACE FUNCTION advance_round_if_ready(p_round_id UUID)
RETURNS VOID AS $$
DECLARE
  v_round RECORD;
  v_game RECORD;
  v_connected_players INTEGER;
  v_answer_count INTEGER;
  v_vote_count INTEGER;
  v_next_round_number INTEGER;
BEGIN
  -- Lock the round row to prevent concurrent updates (race condition protection)
  SELECT * INTO v_round
  FROM game_rounds
  WHERE id = p_round_id
  FOR UPDATE;

  -- Exit if round not found or already completed
  IF v_round IS NULL OR v_round.status = 'completed' THEN
    RETURN;
  END IF;

  -- Get game info and lock it too
  SELECT * INTO v_game
  FROM games
  WHERE id = v_round.game_id
  FOR UPDATE;

  -- Count active players (connected AND recent heartbeat within 90 seconds)
  -- This prevents "ghost players" (crashed browsers) from stalling the game
  -- 90s window accounts for background tab throttling (Chrome throttles to ~60s)
  SELECT COUNT(*) INTO v_connected_players
  FROM players
  WHERE game_id = v_round.game_id
    AND connection_status = 'connected'
    AND (last_heartbeat IS NULL OR last_heartbeat > NOW() - INTERVAL '90 seconds');

  -- Safety check: need at least 2 players
  IF v_connected_players < 2 THEN
    RAISE NOTICE 'Not enough active players (%), skipping phase transition', v_connected_players;
    RETURN;
  END IF;

  -- ========================================================================
  -- ANSWERING → VOTING transition
  -- ========================================================================
  IF v_round.status = 'answering' THEN
    -- Count answers for this round (excluding correct answer)
    SELECT COUNT(*) INTO v_answer_count
    FROM player_answers
    WHERE round_id = p_round_id
      AND is_correct = false;

    RAISE NOTICE 'Round % answering phase: % answers / % connected players',
      v_round.round_number, v_answer_count, v_connected_players;

    -- All connected players have answered
    IF v_answer_count >= v_connected_players THEN
      RAISE NOTICE '✅ All players answered! Adding correct answer and transitioning to voting...';

      -- Insert the correct answer into the voting pool
      -- This ensures players can vote for the truth alongside the lies
      INSERT INTO player_answers (round_id, player_id, answer_text, is_correct)
      SELECT
        p_round_id,
        NULL,  -- System answer (no player)
        q.correct_answer,
        true
      FROM questions q
      WHERE q.id = v_round.question_id
      ON CONFLICT DO NOTHING;  -- Prevent duplicate correct answer

      -- Update round status to voting
      -- The trigger set_timer_on_voting will automatically reset timer_starts_at
      UPDATE game_rounds
      SET status = 'voting',
          timer_duration = 20  -- 20 seconds for voting
      WHERE id = p_round_id;

      RAISE NOTICE '🗳️ Round % transitioned to VOTING with correct answer added', v_round.round_number;
      RETURN;
    END IF;
  END IF;

  -- ========================================================================
  -- VOTING → COMPLETED transition
  -- ========================================================================
  IF v_round.status = 'voting' THEN
    -- Count votes for this round
    SELECT COUNT(DISTINCT voter_id) INTO v_vote_count
    FROM votes
    WHERE round_id = p_round_id;

    RAISE NOTICE 'Round % voting phase: % votes / % connected players',
      v_round.round_number, v_vote_count, v_connected_players;

    -- All connected players have voted
    IF v_vote_count >= v_connected_players THEN
      RAISE NOTICE '✅ All players voted! Ending round...';

      -- Mark round as completed
      UPDATE game_rounds
      SET status = 'completed'
      WHERE id = p_round_id;

      -- Calculate next round number
      v_next_round_number := v_game.current_round + 1;

      -- Check if game should end
      IF v_next_round_number > v_game.round_count THEN
        RAISE NOTICE '🎉 Game finished! Final round completed.';

        -- Mark game as finished
        UPDATE games
        SET status = 'finished'
        WHERE id = v_game.id;
      ELSE
        RAISE NOTICE '➡️ Advancing to round %', v_next_round_number;

        -- Increment to next round
        UPDATE games
        SET current_round = v_next_round_number
        WHERE id = v_game.id;
      END IF;

      RAISE NOTICE '🏁 Round % completed', v_round.round_number;
      RETURN;
    END IF;
  END IF;

  -- If we get here, not enough submissions yet
  RAISE NOTICE '⏳ Waiting for more submissions...';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION advance_round_if_ready IS
  'Automatically advances round phases when all connected players have submitted answers/votes. Thread-safe with row locking. Uses 90s heartbeat window to account for background tab throttling.';

-- Migration: Switch from heartbeat-based dynamic quorum to fixed quorum
-- Purpose: Simplify player counting by capturing quorum at round start
-- Eliminates background tab throttling issues and heartbeat reliability concerns

-- 1. Add required_players column to game_rounds
ALTER TABLE game_rounds
ADD COLUMN required_players INTEGER NOT NULL DEFAULT 2;

COMMENT ON COLUMN game_rounds.required_players IS
  'Number of players required to submit answers/votes (captured when round starts). Fixed for the entire round.';

-- 2. Drop heartbeat mechanism (no longer needed)
DROP FUNCTION IF EXISTS update_player_heartbeat(UUID);
DROP INDEX IF EXISTS idx_players_last_heartbeat;
ALTER TABLE players DROP COLUMN IF EXISTS last_heartbeat;

-- 3. Update advance_round_if_ready to use fixed quorum instead of heartbeat-based count
-- All column references fully qualified to prevent ambiguity errors
CREATE OR REPLACE FUNCTION advance_round_if_ready(p_round_id UUID)
RETURNS VOID AS $$
DECLARE
  v_round RECORD;
  v_game RECORD;
  v_answer_count INTEGER;
  v_vote_count INTEGER;
  v_next_round_number INTEGER;
BEGIN
  -- Lock the round row to prevent concurrent updates (race condition protection)
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

  -- Safety check: need at least 2 players
  IF v_round.required_players < 2 THEN
    RAISE NOTICE 'Not enough required players (%), skipping phase transition', v_round.required_players;
    RETURN;
  END IF;

  -- ========================================================================
  -- ANSWERING → VOTING transition
  -- ========================================================================
  IF v_round.status = 'answering' THEN
    -- Count answers for this round (excluding correct answer)
    SELECT COUNT(*) INTO v_answer_count
    FROM player_answers pa
    WHERE pa.round_id = p_round_id
      AND pa.is_correct = false;

    RAISE NOTICE 'Round % answering phase: % answers / % required players',
      v_round.round_number, v_answer_count, v_round.required_players;

    -- All required players have answered
    IF v_answer_count >= v_round.required_players THEN
      RAISE NOTICE '✅ All players answered! Adding correct answer and transitioning to voting...';

      -- Insert the correct answer into the voting pool (fully qualified to avoid ambiguity)
      INSERT INTO player_answers (round_id, player_id, answer_text, is_correct)
      SELECT
        p_round_id AS round_id,
        NULL::UUID AS player_id,  -- System answer (no player)
        q.correct_answer AS answer_text,
        true AS is_correct
      FROM questions q
      WHERE q.id = v_round.question_id
      ON CONFLICT DO NOTHING;  -- Prevent duplicate correct answer

      -- Update round status to voting
      UPDATE game_rounds gr
      SET status = 'voting',
          timer_duration = 20  -- 20 seconds for voting
      WHERE gr.id = p_round_id;

      RAISE NOTICE '🗳️ Round % transitioned to VOTING with correct answer added', v_round.round_number;
      RETURN;
    END IF;
  END IF;

  -- ========================================================================
  -- VOTING → COMPLETED transition
  -- ========================================================================
  IF v_round.status = 'voting' THEN
    -- Count votes for this round
    SELECT COUNT(DISTINCT v.voter_id) INTO v_vote_count
    FROM votes v
    WHERE v.round_id = p_round_id;

    RAISE NOTICE 'Round % voting phase: % votes / % required players',
      v_round.round_number, v_vote_count, v_round.required_players;

    -- All required players have voted
    IF v_vote_count >= v_round.required_players THEN
      RAISE NOTICE '✅ All players voted! Ending round...';

      -- Mark round as completed
      UPDATE game_rounds gr
      SET status = 'completed'
      WHERE gr.id = p_round_id;

      -- Calculate scores before advancing
      PERFORM calculate_and_update_scores(p_round_id, v_game.id);

      -- Calculate next round number
      v_next_round_number := v_game.current_round + 1;

      -- Check if game should end
      IF v_next_round_number > v_game.round_count THEN
        RAISE NOTICE '🎉 Game finished! Final round completed.';

        -- Mark game as finished
        UPDATE games g
        SET status = 'finished'
        WHERE g.id = v_game.id;
      ELSE
        RAISE NOTICE '➡️ Advancing to round %', v_next_round_number;

        -- Increment to next round
        UPDATE games g
        SET current_round = v_next_round_number
        WHERE g.id = v_game.id;
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
  'Automatically advances round phases when required_players have submitted answers/votes. Thread-safe with row locking. Uses fixed quorum captured at round start.';

-- 4. Update force_advance_round to use fixed quorum
-- All column references fully qualified to prevent ambiguity errors
CREATE OR REPLACE FUNCTION force_advance_round(p_round_id UUID)
RETURNS VOID AS $$
DECLARE
  v_round RECORD;
  v_game RECORD;
  v_next_round_number INTEGER;
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

  -- Get game info
  SELECT g.* INTO v_game
  FROM games g
  WHERE g.id = v_round.game_id
  FOR UPDATE;

  RAISE NOTICE '⏰ Timer expired for round % (status: %)', v_round.round_number, v_round.status;

  -- Handle timer expiration based on current phase
  IF v_round.status = 'answering' THEN
    -- Force transition to voting even if not all players answered
    RAISE NOTICE '⚠️ Forcing transition to voting (timer expired)';

    -- Insert correct answer (fully qualified to avoid ambiguity)
    INSERT INTO player_answers (round_id, player_id, answer_text, is_correct)
    SELECT
      p_round_id AS round_id,
      NULL::UUID AS player_id,  -- System answer (no player)
      q.correct_answer AS answer_text,
      true AS is_correct
    FROM questions q
    WHERE q.id = v_round.question_id
    ON CONFLICT DO NOTHING;

    -- Update to voting phase
    UPDATE game_rounds gr
    SET status = 'voting',
        timer_duration = 20
    WHERE gr.id = p_round_id;

    RAISE NOTICE '🗳️ Round % forced to VOTING (timer)', v_round.round_number;

  ELSIF v_round.status = 'voting' THEN
    -- Force round completion even if not all players voted
    RAISE NOTICE '⚠️ Forcing round completion (timer expired)';

    -- Mark round as completed
    UPDATE game_rounds gr
    SET status = 'completed'
    WHERE gr.id = p_round_id;

    -- Calculate scores
    PERFORM calculate_and_update_scores(p_round_id, v_game.id);

    -- Calculate next round number
    v_next_round_number := v_game.current_round + 1;

    -- Check if game should end
    IF v_next_round_number > v_game.round_count THEN
      RAISE NOTICE '🎉 Game finished! Final round completed.';

      UPDATE games g
      SET status = 'finished'
      WHERE g.id = v_game.id;
    ELSE
      RAISE NOTICE '➡️ Advancing to round %', v_next_round_number;

      UPDATE games g
      SET current_round = v_next_round_number
      WHERE g.id = v_game.id;
    END IF;

    RAISE NOTICE '🏁 Round % completed (forced by timer)', v_round.round_number;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION force_advance_round IS
  'Forces round to advance when timer expires, regardless of submission count. Thread-safe with row locking.';

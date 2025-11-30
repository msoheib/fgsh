-- Migration: Server-side automatic phase transitions
-- Purpose: Move phase completion logic from client to database triggers
-- This eliminates the need for a "phase captain" and makes transitions deterministic

-- ============================================================================
-- FUNCTION: advance_round_if_ready
-- ============================================================================
-- Automatically advances round phases when all connected players have submitted
-- Handles: answering → voting → completed → next round
-- Thread-safe: Uses SELECT FOR UPDATE to prevent race conditions

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

  -- Safety check: need at least 2 players (using fixed quorum from round)
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

-- Add helpful comment
COMMENT ON FUNCTION advance_round_if_ready IS
  'Automatically advances round phases when all connected players have submitted answers/votes. Thread-safe with row locking.';

-- ============================================================================
-- TRIGGER: Automatic phase check after answer submission
-- ============================================================================

DROP TRIGGER IF EXISTS check_round_after_answer ON player_answers;

CREATE TRIGGER check_round_after_answer
  AFTER INSERT ON player_answers
  FOR EACH ROW
  EXECUTE FUNCTION advance_round_if_ready(NEW.round_id);

COMMENT ON TRIGGER check_round_after_answer ON player_answers IS
  'Automatically checks if round should advance after each answer submission';

-- ============================================================================
-- TRIGGER: Automatic phase check after vote submission
-- ============================================================================

DROP TRIGGER IF EXISTS check_round_after_vote ON votes;

CREATE TRIGGER check_round_after_vote
  AFTER INSERT ON votes
  FOR EACH ROW
  EXECUTE FUNCTION advance_round_if_ready(NEW.round_id);

COMMENT ON TRIGGER check_round_after_vote ON votes IS
  'Automatically checks if round should advance after each vote submission';

-- ============================================================================
-- HELPER FUNCTION: Manual phase advance (for timer expiration)
-- ============================================================================
-- This can be called by a scheduled job or client when timer expires

CREATE OR REPLACE FUNCTION force_advance_round(p_round_id UUID)
RETURNS VOID AS $$
DECLARE
  v_round game_rounds%ROWTYPE;
  v_game games%ROWTYPE;
  v_next_round_number INTEGER;
BEGIN
  -- Lock current round to prevent concurrent updates
  SELECT * INTO v_round
  FROM game_rounds
  WHERE game_rounds.id = p_round_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Lock the parent game to coordinate round advancement
  SELECT * INTO v_game
  FROM games
  WHERE games.id = v_round.game_id
  FOR UPDATE;

  -- If timer expires during answering, add correct answer and move to voting
  IF v_round.status = 'answering' THEN
    RAISE NOTICE '⏰ Timer expired! Adding correct answer and force transitioning to voting...';

    INSERT INTO player_answers (round_id, player_id, answer_text, is_correct)
    SELECT
      p_round_id,
      NULL, -- System answer (no player)
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

  -- If timer expires during voting, force scoring even if votes are missing
  IF v_round.status = 'voting' THEN
    RAISE NOTICE '⏰ Timer expired! Force ending round...';

    PERFORM calculate_and_update_scores(p_round_id, v_game.id);

    UPDATE game_rounds
    SET status = 'completed'
    WHERE game_rounds.id = p_round_id;

    v_next_round_number := v_game.current_round + 1;

    IF v_next_round_number > v_game.round_count THEN
      UPDATE games
      SET status = 'finished'
      WHERE games.id = v_game.id;
    ELSE
      UPDATE games
      SET current_round = v_next_round_number
      WHERE games.id = v_game.id;
    END IF;

    RETURN;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION force_advance_round IS
  'Forces round to advance when timer expires, regardless of submission count';

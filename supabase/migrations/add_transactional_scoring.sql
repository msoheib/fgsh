-- Migration: Add transactional scoring RPC function
-- Purpose: Move scoring logic to database for atomic, race-condition-free score updates
-- This ensures scores are calculated exactly once per round, even if multiple clients call scoring

-- ============================================================================
-- FUNCTION: calculate_and_update_scores
-- ============================================================================
-- Calculates round scores and updates player totals atomically
-- Thread-safe: Uses SELECT FOR UPDATE to prevent concurrent scoring
-- Returns: Array of {player_id, points_earned} for this round

CREATE OR REPLACE FUNCTION calculate_and_update_scores(
  p_round_id UUID,
  p_game_id UUID
)
RETURNS TABLE(player_id UUID, points_earned INTEGER, reason TEXT) AS $$
DECLARE
  v_answer RECORD;
  v_vote RECORD;
  v_player RECORD;
  v_vote_count INTEGER;
  v_points INTEGER;
  v_reason TEXT;
  v_max_points INTEGER := 0;
  v_winner_ids UUID[];
BEGIN
  -- Lock the round to prevent concurrent scoring
  PERFORM 1 FROM game_rounds WHERE id = p_round_id FOR UPDATE;

  -- Create temporary table to store round scores
  CREATE TEMP TABLE IF NOT EXISTS round_scores (
    p_id UUID,
    pts INTEGER,
    rsn TEXT
  ) ON COMMIT DROP;

  -- Process each answer
  FOR v_answer IN
    SELECT id, player_id, is_correct
    FROM player_answers
    WHERE round_id = p_round_id
  LOOP
    -- Count votes for this answer
    SELECT COUNT(*) INTO v_vote_count
    FROM votes
    WHERE answer_id = v_answer.id;

    IF v_answer.is_correct THEN
      -- Correct answer: give points to voters who chose it
      FOR v_vote IN
        SELECT voter_id
        FROM votes
        WHERE answer_id = v_answer.id
      LOOP
        INSERT INTO round_scores (p_id, pts, rsn)
        VALUES (v_vote.voter_id, 1000, 'correct_answer');
      END LOOP;
    ELSE
      -- Fake answer: give points to answer creator for fooling players
      IF v_vote_count = 0 THEN
        -- Perfect fake bonus (no one voted for it)
        v_points := 500;
        v_reason := 'perfect_fake';
      ELSE
        -- Points per fooled player
        v_points := v_vote_count * 500;
        v_reason := 'fooled_players';
      END IF;

      IF v_points > 0 THEN
        INSERT INTO round_scores (p_id, pts, rsn)
        VALUES (v_answer.player_id, v_points, v_reason);
      END IF;
    END IF;
  END LOOP;

  -- Find max points for round winner bonus
  SELECT COALESCE(MAX(pts), 0) INTO v_max_points
  FROM round_scores;

  -- Get all players who achieved max points (ties possible)
  IF v_max_points > 0 THEN
    SELECT ARRAY_AGG(DISTINCT p_id) INTO v_winner_ids
    FROM round_scores
    WHERE pts = v_max_points;

    -- Add round winner bonus to each winner
    FOREACH v_winner_ids[1] IN ARRAY v_winner_ids
    LOOP
      INSERT INTO round_scores (p_id, pts, rsn)
      VALUES (v_winner_ids[1], 250, 'round_winner');
    END LOOP;
  END IF;

  -- Aggregate scores by player
  FOR v_player IN
    SELECT p_id, SUM(pts) as total_points
    FROM round_scores
    GROUP BY p_id
  LOOP
    -- Lock player row and update score atomically
    UPDATE players
    SET score = score + v_player.total_points
    WHERE id = v_player.p_id;
  END LOOP;

  -- Update vote points_earned for display
  FOR v_vote IN
    SELECT v.id as vote_id, COALESCE(SUM(rs.pts), 0) as pts
    FROM votes v
    LEFT JOIN round_scores rs ON rs.p_id = v.voter_id
    WHERE v.round_id = p_round_id
    GROUP BY v.id
  LOOP
    UPDATE votes
    SET points_earned = v_vote.pts
    WHERE id = v_vote.vote_id;
  END LOOP;

  -- Return round scores for display
  RETURN QUERY
  SELECT p_id, pts, rsn
  FROM round_scores;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION calculate_and_update_scores IS
  'Atomically calculates and updates scores for a completed round. Thread-safe with row locking.';

-- ============================================================================
-- Update the advance_round_if_ready function to use transactional scoring
-- ============================================================================
-- This ensures scoring happens atomically as part of round completion

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
    FROM player_answers
    WHERE round_id = p_round_id
      AND is_correct = false;

    RAISE NOTICE 'Round % answering phase: % answers / % required players',
      v_round.round_number, v_answer_count, v_round.required_players;

    -- All required players have answered
    IF v_answer_count >= v_round.required_players THEN
      RAISE NOTICE '✅ All players answered! Adding correct answer and transitioning to voting...';

      -- Insert the correct answer into the voting pool (fully qualified to avoid ambiguity)
      -- This ensures players can vote for the truth alongside the lies
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
    SELECT COUNT(DISTINCT voter_id) INTO v_vote_count
    FROM votes
    WHERE round_id = p_round_id;

    RAISE NOTICE 'Round % voting phase: % votes / % required players',
      v_round.round_number, v_vote_count, v_round.required_players;

    -- All required players have voted
    IF v_vote_count >= v_round.required_players THEN
      RAISE NOTICE '✅ All players voted! Calculating scores and ending round...';

      -- Calculate and update scores atomically
      PERFORM calculate_and_update_scores(p_round_id, v_game.id);

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

      RAISE NOTICE '🏁 Round % completed with scores calculated', v_round.round_number;
      RETURN;
    END IF;
  END IF;

  -- If we get here, not enough submissions yet
  RAISE NOTICE '⏳ Waiting for more submissions...';
END;
$$ LANGUAGE plpgsql;

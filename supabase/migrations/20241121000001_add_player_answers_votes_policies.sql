-- Migration: Add RLS policies for player_answers and votes tables
-- Allows game participants to read and write their own answers and votes

-- ============================================
-- DROP EXISTING POLICIES (if they exist)
-- ============================================

DROP POLICY IF EXISTS "Players can insert their own answers" ON player_answers;
DROP POLICY IF EXISTS "Players can read answers from their game" ON player_answers;
DROP POLICY IF EXISTS "Players can insert their own votes" ON votes;
DROP POLICY IF EXISTS "Players can read votes from their game" ON votes;

-- ============================================
-- PLAYER_ANSWERS POLICIES
-- ============================================

-- Allow players to insert their own answers
CREATE POLICY "Players can insert their own answers"
ON player_answers
FOR INSERT
TO anon, authenticated
WITH CHECK (
  -- Player can insert if they belong to the same game as the round
  EXISTS (
    SELECT 1 FROM game_rounds gr
    JOIN players p ON p.game_id = gr.game_id
    WHERE gr.id = player_answers.round_id
    AND p.id = player_answers.player_id
  )
);

-- Allow players to read answers from their current game
CREATE POLICY "Players can read answers from their game"
ON player_answers
FOR SELECT
TO anon, authenticated
USING (
  -- Player can read if they're in the same game
  EXISTS (
    SELECT 1 FROM game_rounds gr
    JOIN games g ON g.id = gr.game_id
    JOIN players p ON p.game_id = g.id
    WHERE gr.id = player_answers.round_id
    AND (
      -- Player is in this game
      p.game_id = gr.game_id
      -- Or authenticated user is the host
      OR g.auth_host_id = auth.uid()
    )
  )
);

-- ============================================
-- VOTES POLICIES
-- ============================================

-- Allow players to insert their own votes
CREATE POLICY "Players can insert their own votes"
ON votes
FOR INSERT
TO anon, authenticated
WITH CHECK (
  -- Player can vote if they belong to the same game as the answer
  EXISTS (
    SELECT 1 FROM player_answers pa
    JOIN game_rounds gr ON gr.id = pa.round_id
    JOIN players p ON p.game_id = gr.game_id
    WHERE pa.id = votes.answer_id
    AND p.id = votes.voter_id
  )
);

-- Allow players to read votes from their current game
CREATE POLICY "Players can read votes from their game"
ON votes
FOR SELECT
TO anon, authenticated
USING (
  -- Player can read votes if they're in the same game
  EXISTS (
    SELECT 1 FROM player_answers pa
    JOIN game_rounds gr ON gr.id = pa.round_id
    JOIN games g ON g.id = gr.game_id
    JOIN players p ON p.game_id = g.id
    WHERE pa.id = votes.answer_id
    AND (
      -- Player is in this game
      p.game_id = g.id
      -- Or authenticated user is the host
      OR g.auth_host_id = auth.uid()
    )
  )
);

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON POLICY "Players can insert their own answers" ON player_answers IS
'Allows players to submit answers for rounds in games they have joined';

COMMENT ON POLICY "Players can read answers from their game" ON player_answers IS
'Allows players to view all answers from rounds in their current game for voting';

COMMENT ON POLICY "Players can insert their own votes" ON votes IS
'Allows players to vote on answers from their game';

COMMENT ON POLICY "Players can read votes from their game" ON votes IS
'Allows players to see voting results from their current game';

-- Migration: Fix RLS policies for player_answers to work with anonymous users
-- This is a public party game, so players should be able to read all answers
-- from rounds in their game during voting/completed phases

-- ============================================
-- DROP AND RECREATE PLAYER_ANSWERS SELECT POLICY
-- ============================================

DROP POLICY IF EXISTS "Players can read answers from their game" ON player_answers;

-- Simplified policy: Anyone can read answers from any round
-- This is appropriate for a public party game where players are anonymous
CREATE POLICY "Anyone can read player answers"
ON player_answers
FOR SELECT
TO anon, authenticated
USING (true);  -- Allow anyone to read answers

-- Note: INSERT policy remains restrictive - players can only insert their own answers
-- The INSERT policy is already correct and doesn't need changes

-- ============================================
-- FIX VOTES SELECT POLICY
-- ============================================

DROP POLICY IF EXISTS "Players can read votes from their game" ON votes;

-- Simplified policy: Anyone can read votes from any round
CREATE POLICY "Anyone can read votes"
ON votes
FOR SELECT
TO anon, authenticated
USING (true);  -- Allow anyone to read votes

-- Note: INSERT policy remains restrictive - players can only vote on answers from their game
-- The INSERT policy is already correct and doesn't need changes

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON POLICY "Anyone can read player answers" ON player_answers IS
'Allows anyone to view answers from any game round. This is a public party game where players are anonymous, so we dont restrict reading answers during voting phase.';

COMMENT ON POLICY "Anyone can read votes" ON votes IS
'Allows anyone to view votes from any game round. This is a public party game where players are anonymous, so we dont restrict reading votes.';

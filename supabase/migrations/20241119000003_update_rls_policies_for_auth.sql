-- Migration: Update RLS policies to enforce host authentication
-- Description: Lock down game creation/management to authenticated hosts
-- Keep player operations anonymous for casual play

-- ============================================================================
-- DROP EXISTING PERMISSIVE POLICIES
-- ============================================================================

-- Drop old permissive policies on games table
DROP POLICY IF EXISTS "Anyone can view games" ON games;
DROP POLICY IF EXISTS "Anyone can create games" ON games;
DROP POLICY IF EXISTS "Anyone can update games" ON games;

-- ============================================================================
-- GAMES TABLE - NEW RESTRICTIVE POLICIES
-- ============================================================================

-- SELECT: Anyone can view games (needed for join flow)
CREATE POLICY "Anyone can view games"
  ON games
  FOR SELECT
  USING (true);

-- INSERT: Only authenticated users can create games
CREATE POLICY "Authenticated users can create games"
  ON games
  FOR INSERT
  WITH CHECK (
    -- Must be authenticated
    auth.uid() IS NOT NULL
    -- Must set auth_host_id to their own ID
    AND auth.uid() = auth_host_id
  );

-- UPDATE: Only the authenticated host can update their games
CREATE POLICY "Hosts can update own games"
  ON games
  FOR UPDATE
  USING (
    -- Must be authenticated
    auth.uid() IS NOT NULL
    -- Must be the host
    AND auth.uid() = auth_host_id
  )
  WITH CHECK (
    -- Can't change auth_host_id to someone else
    auth.uid() = auth_host_id
  );

-- DELETE: Only the authenticated host can delete their games
CREATE POLICY "Hosts can delete own games"
  ON games
  FOR DELETE
  USING (
    auth.uid() IS NOT NULL
    AND auth.uid() = auth_host_id
  );

-- ============================================================================
-- GAMES TABLE - PAID HOST RESTRICTION (OPTIONAL)
-- ============================================================================
-- Uncomment this policy to require paid subscription for game creation
-- This replaces the "Authenticated users can create games" policy above

/*
DROP POLICY IF EXISTS "Authenticated users can create games" ON games;

CREATE POLICY "Only paid hosts can create games"
  ON games
  FOR INSERT
  WITH CHECK (
    -- Must be authenticated
    auth.uid() IS NOT NULL
    -- Must set auth_host_id to their own ID
    AND auth.uid() = auth_host_id
    -- Must have active subscription
    AND is_host_subscription_active(auth.uid())
  );
*/

-- ============================================================================
-- PLAYERS TABLE - KEEP ANONYMOUS ACCESS
-- ============================================================================
-- Players don't need authentication - they join via game code

-- These policies should already exist from initial migration
-- Just documenting them here for completeness:

-- SELECT: Anyone can view players
-- INSERT: Anyone can join as player
-- UPDATE: Anyone can update players (for score, connection status)
-- DELETE: Anyone can leave game

-- No changes needed - players remain anonymous

-- ============================================================================
-- OTHER TABLES - MAINTAIN ANONYMOUS ACCESS
-- ============================================================================

-- game_rounds, player_answers, votes, questions:
-- Keep existing permissive policies
-- These tables are accessed during gameplay by anonymous players

-- ============================================================================
-- SERVICE ROLE BYPASS
-- ============================================================================

-- Service role can do anything (for admin operations, triggers, RPCs)
-- This is automatic in Supabase - no explicit policy needed

-- ============================================================================
-- HELPER FUNCTION: Check if user owns game
-- ============================================================================

CREATE OR REPLACE FUNCTION user_owns_game(game_id_param UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM games
    WHERE id = game_id_param
    AND auth_host_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION user_owns_game(UUID) IS 'Returns true if authenticated user owns the specified game';

-- ============================================================================
-- TESTING QUERIES (Run these after migration to verify)
-- ============================================================================

-- Verify RLS is enabled
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public' AND tablename = 'games';

-- List all policies on games table
-- SELECT * FROM pg_policies WHERE tablename = 'games';

-- Test as authenticated user (replace UUID with actual user ID)
-- SET LOCAL ROLE authenticated;
-- SET LOCAL request.jwt.claims.sub = 'your-user-uuid-here';
-- SELECT * FROM games;

-- Reset role
-- RESET ROLE;

-- ============================================================================
-- MIGRATION NOTES
-- ============================================================================

-- SECURITY MODEL:
--
-- 1. HOSTS (Authenticated):
--    - Must log in via Supabase Auth
--    - CREATE: Can create games (optionally gated by payment)
--    - READ: Can view all games (to join as player too)
--    - UPDATE: Can only update their own games (auth_host_id matches)
--    - DELETE: Can only delete their own games
--
-- 2. PLAYERS (Anonymous):
--    - No authentication required
--    - READ: Can view all games (to find by code)
--    - CREATE: Can join as player in any game
--    - UPDATE: Can update their own player record (score, status)
--    - DELETE: Can leave any game
--
-- 3. IN-GAME OPERATIONS:
--    - Answering, voting, scoring: Remains anonymous
--    - Enforced by application logic, not RLS
--    - RPC functions handle game flow without auth checks
--
-- 4. PAYMENT GATING:
--    - Optional: Uncomment paid host policy
--    - Checks is_host_subscription_active() function
--    - Prevents free users from creating games
--    - Can implement in frontend or backend
--
-- BACKWARD COMPATIBILITY:
--
-- - Existing games with NULL auth_host_id:
--   - Can be viewed and joined by anyone
--   - Cannot be updated or deleted (no owner)
--   - Can still be played to completion
--   - Consider migrating to legacy host account
--
-- - Migration path:
--   1. Create "legacy" auth user
--   2. Run: UPDATE games SET auth_host_id = 'legacy-uuid' WHERE auth_host_id IS NULL
--   3. All old games now owned by legacy account

-- Migration: Add authenticated host tracking to games table
-- Description: Link games to authenticated user accounts (auth.users)
-- Maintains existing player-based host tracking for backward compatibility

-- ============================================================================
-- ADD AUTH_HOST_ID COLUMN
-- ============================================================================
-- This column links games to authenticated host accounts (auth.users.id)
-- Separate from host_id which links to players.id (in-game participant)
--
-- DUAL HOST TRACKING:
-- - auth_host_id = The authenticated user who owns/created the game (for billing)
-- - host_id = The player record participating as host (can be NULL in TV mode)

ALTER TABLE games
ADD COLUMN IF NOT EXISTS auth_host_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Index for finding games by authenticated host
CREATE INDEX IF NOT EXISTS idx_games_auth_host_id ON games(auth_host_id);

-- Composite index for active games by host
CREATE INDEX IF NOT EXISTS idx_games_auth_host_status ON games(auth_host_id, status)
  WHERE auth_host_id IS NOT NULL;

-- ============================================================================
-- UPDATE EXISTING GAMES (OPTIONAL)
-- ============================================================================
-- For existing games, you can optionally link them to a "legacy" host account
-- or leave auth_host_id as NULL (which will prevent them from being modified)

-- Example: Create a legacy host account and assign all existing games
-- Uncomment if you want to migrate existing games:

/*
DO $$
DECLARE
  legacy_host_id UUID;
BEGIN
  -- Create a legacy host profile (requires manual auth.users entry first)
  -- This assumes you've created a user account for "legacy games"
  -- Get the UUID from auth.users where email = 'legacy@yourdomain.com'

  -- UPDATE games
  -- SET auth_host_id = legacy_host_id
  -- WHERE auth_host_id IS NULL AND created_at < NOW();

  RAISE NOTICE 'Legacy games migration skipped - uncomment to enable';
END $$;
*/

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN games.auth_host_id IS 'Authenticated user who created the game (for billing/entitlement). Separate from host_id which tracks in-game host player.';

-- ============================================================================
-- MIGRATION NOTES
-- ============================================================================

-- IMPORTANT: Understanding the dual host system
--
-- 1. auth_host_id (NEW)
--    - References auth.users.id
--    - Identifies the authenticated account owner
--    - Used for billing, entitlement checks, game management
--    - Can be set even in TV display mode (host doesn't play)
--
-- 2. host_id (EXISTING)
--    - References players.id
--    - Identifies the in-game host participant
--    - NULL in TV display mode initially (set when someone joins)
--    - Used for game flow, permissions, UI indicators
--
-- 3. phase_captain_id (EXISTING)
--    - References players.id
--    - Identifies who calls timer/phase transitions
--    - Failover mechanism if host disconnects
--
-- SCENARIOS:
--
-- A. Regular Host (plays in game):
--    - auth_host_id = UUID from auth.users
--    - host_id = UUID from players (same person)
--    - Host logs in, creates game, joins as player
--
-- B. TV Display Mode (host doesn't play initially):
--    - auth_host_id = UUID from auth.users
--    - host_id = NULL initially
--    - Host logs in on phone, creates game for TV display
--    - First player to join becomes in-game host (host_id set)
--
-- C. Legacy Games (created before auth):
--    - auth_host_id = NULL
--    - host_id = UUID from players
--    - These games can still be played but not modified

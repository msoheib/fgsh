-- Migration: Add heartbeat mechanism for detecting inactive players
-- Purpose: Track player activity to prevent ghost players from stalling rounds
-- A player is considered "active" if their heartbeat was updated within the last 30 seconds

-- 1. Add last_heartbeat column to players table
ALTER TABLE players
ADD COLUMN last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. Add index for faster heartbeat lookups
CREATE INDEX idx_players_last_heartbeat ON players(game_id, last_heartbeat);

-- 3. Add helper function to update heartbeat
CREATE OR REPLACE FUNCTION update_player_heartbeat(p_player_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE players
  SET last_heartbeat = NOW()
  WHERE id = p_player_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Add comment for documentation
COMMENT ON COLUMN players.last_heartbeat IS
  'Last time the player sent a heartbeat. Players are considered active if heartbeat is within 30 seconds.';

COMMENT ON FUNCTION update_player_heartbeat IS
  'Updates the last_heartbeat timestamp for a player. Called periodically by client (every 10s).';

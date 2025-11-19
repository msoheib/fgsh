-- Migration: Add phase captain tracking for automatic host failover
-- Purpose: Enable resilient phase transitions even if original host disconnects

-- 1. Add phase_captain_id to games table
ALTER TABLE games
ADD COLUMN phase_captain_id UUID REFERENCES players(id) ON DELETE SET NULL;

-- 2. Set default phase captain to host for existing games
UPDATE games
SET phase_captain_id = host_id
WHERE phase_captain_id IS NULL;

-- 3. Add index for faster captain lookups
CREATE INDEX idx_games_phase_captain ON games(phase_captain_id);

-- 4. Add comment for documentation
COMMENT ON COLUMN games.phase_captain_id IS
  'The player currently responsible for triggering phase transitions. Defaults to host but can fail over to another player if host disconnects.';

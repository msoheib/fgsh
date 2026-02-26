-- Migration: Enforce minimum fixed quorum for all rounds
-- Prevents one-vote round completion caused by legacy/incorrect required_players values.

-- Backfill legacy rows (including in-progress rounds) to minimum quorum of 2.
UPDATE game_rounds
SET required_players = 2
WHERE required_players IS NULL
   OR required_players < 2;

-- Ensure future rows cannot be created with quorum < 2.
ALTER TABLE game_rounds
DROP CONSTRAINT IF EXISTS game_rounds_required_players_min_check;

ALTER TABLE game_rounds
ADD CONSTRAINT game_rounds_required_players_min_check
CHECK (required_players >= 2);

COMMENT ON CONSTRAINT game_rounds_required_players_min_check ON game_rounds IS
'Each round must require at least 2 players for answer/vote completion.';

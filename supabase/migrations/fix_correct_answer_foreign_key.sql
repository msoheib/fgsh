-- Migration: Fix correct answer foreign key constraint
-- Purpose: Allow NULL player_id for system-inserted correct answers
-- This prevents FK violations when inserting the correct answer during phase transitions

-- 1. Drop the existing foreign key constraint
ALTER TABLE player_answers
DROP CONSTRAINT IF EXISTS player_answers_player_id_fkey;

-- 2. Make player_id nullable (it was NOT NULL before)
ALTER TABLE player_answers
ALTER COLUMN player_id DROP NOT NULL;

-- 3. Re-add the foreign key with ON DELETE SET NULL
ALTER TABLE player_answers
ADD CONSTRAINT player_answers_player_id_fkey
FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE SET NULL;

-- 4. Update the UNIQUE constraint to allow multiple NULL player_ids
-- (in case we need to insert correct answers for multiple rounds)
ALTER TABLE player_answers
DROP CONSTRAINT IF EXISTS player_answers_round_id_player_id_key;

-- Create a unique partial index that only applies to non-NULL player_ids
CREATE UNIQUE INDEX player_answers_round_player_unique
ON player_answers(round_id, player_id)
WHERE player_id IS NOT NULL;

-- 5. Add comment explaining the schema
COMMENT ON COLUMN player_answers.player_id IS
  'Player who submitted the answer. NULL for system-inserted correct answers.';

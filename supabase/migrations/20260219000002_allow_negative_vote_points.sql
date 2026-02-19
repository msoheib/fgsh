-- Migration: Allow negative vote points for "fell_for_lie" penalties
-- Previous constraint required points_earned >= 0, which conflicts with -500 penalties.

ALTER TABLE votes
DROP CONSTRAINT IF EXISTS votes_points_earned_check;

UPDATE votes
SET points_earned = 0
WHERE points_earned IS NULL;

ALTER TABLE votes
ALTER COLUMN points_earned SET DEFAULT 0;

ALTER TABLE votes
ALTER COLUMN points_earned SET NOT NULL;

ALTER TABLE votes
ADD CONSTRAINT votes_points_earned_check
CHECK (points_earned BETWEEN -1000000 AND 1000000);

COMMENT ON COLUMN votes.points_earned IS
'Net points for the voter in this round. Can be negative when the voter falls for a lie.';

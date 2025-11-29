-- ============================================================================
-- Migration: Clean up existing duplicate correct answers
-- Date: 2024-11-29
-- Purpose: Remove duplicate correct answers that may exist in the database
-- ============================================================================

-- Find and remove duplicate correct answers, keeping only the oldest one per round
WITH duplicate_correct_answers AS (
  SELECT
    id,
    round_id,
    ROW_NUMBER() OVER (PARTITION BY round_id ORDER BY submitted_at ASC) as rn
  FROM player_answers
  WHERE is_correct = true
)
DELETE FROM player_answers
WHERE id IN (
  SELECT id
  FROM duplicate_correct_answers
  WHERE rn > 1
);

-- Log the cleanup
DO $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RAISE NOTICE 'Cleaned up % duplicate correct answers', v_deleted_count;
END $$;

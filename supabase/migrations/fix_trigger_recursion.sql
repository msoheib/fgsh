-- Migration: Fix infinite recursion in answer submission trigger
-- Problem: Trigger fires on ALL inserts, including system-inserted correct answer
-- Solution: Only fire trigger for player answers (is_correct = false)

-- 1. Drop existing trigger
DROP TRIGGER IF EXISTS check_round_after_answer ON player_answers;

-- 2. Recreate with WHEN clause to prevent recursion
CREATE TRIGGER check_round_after_answer
  AFTER INSERT ON player_answers
  FOR EACH ROW
  WHEN (NEW.is_correct = false)  -- Only trigger for player answers, NOT correct answer
  EXECUTE FUNCTION advance_round_if_ready(NEW.round_id);

COMMENT ON TRIGGER check_round_after_answer ON player_answers IS
  'Automatically checks if round should advance after each PLAYER answer submission (excludes system-inserted correct answers to prevent recursion)';

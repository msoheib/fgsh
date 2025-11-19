-- Migration: Prevent recursive trigger loop for system-inserted correct answers
-- Purpose: Skip advance_round_if_ready when the inserted answer is the system's correct answer

-- Update trigger function to no-op for correct answers (player_id NULL / is_correct true)
CREATE OR REPLACE FUNCTION trigger_check_round_after_answer()
RETURNS TRIGGER AS $$
BEGIN
  -- Skip trigger recursion when system inserts the correct answer
  IF NEW.is_correct THEN
    RETURN NEW;
  END IF;

  PERFORM advance_round_if_ready(NEW.round_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Also update the alternate function name if referenced elsewhere
CREATE OR REPLACE FUNCTION check_round_after_answer()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_correct THEN
    RETURN NEW;
  END IF;

  PERFORM advance_round_if_ready(NEW.round_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


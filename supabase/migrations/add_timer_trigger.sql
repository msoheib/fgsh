-- Migration: Auto-set timer_starts_at to server time
-- Purpose: Ensure all clients use the same timestamp for synchronized countdown

-- 1. Set DEFAULT value for new rounds
ALTER TABLE game_rounds
ALTER COLUMN timer_starts_at
SET DEFAULT NOW();

-- 2. Create trigger to auto-update timer_starts_at when transitioning to voting
CREATE OR REPLACE FUNCTION update_timer_on_voting()
RETURNS TRIGGER AS $$
BEGIN
  -- When status changes to 'voting', reset timer_starts_at to NOW()
  IF NEW.status = 'voting' AND OLD.status != 'voting' THEN
    NEW.timer_starts_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists (for re-running migration)
DROP TRIGGER IF EXISTS set_timer_on_voting ON game_rounds;

-- Create trigger
CREATE TRIGGER set_timer_on_voting
  BEFORE UPDATE ON game_rounds
  FOR EACH ROW
  EXECUTE FUNCTION update_timer_on_voting();

-- 3. Add comment for documentation
COMMENT ON TRIGGER set_timer_on_voting ON game_rounds IS
  'Automatically sets timer_starts_at to NOW() when round transitions to voting phase';

-- ================================================
-- Server-Side Timer Authority
-- ================================================
-- This migration adds functions for server-authoritative time management
-- to prevent timer desynchronization due to client clock drift

-- Drop functions if exist (for idempotency)
DROP FUNCTION IF EXISTS get_server_time();
DROP FUNCTION IF EXISTS get_round_time_remaining(UUID);
DROP FUNCTION IF EXISTS sync_game_timers(UUID);

-- ================================================
-- 1. Get current server time
-- ================================================
CREATE OR REPLACE FUNCTION get_server_time()
RETURNS TABLE(
  server_time TIMESTAMPTZ,
  timestamp_ms BIGINT
) AS $$
BEGIN
  RETURN QUERY SELECT
    NOW() as server_time,
    EXTRACT(EPOCH FROM NOW()) * 1000 as timestamp_ms;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================
-- 2. Get time remaining for a round (server-authoritative)
-- ================================================
CREATE OR REPLACE FUNCTION get_round_time_remaining(p_round_id UUID)
RETURNS TABLE(
  time_remaining INTEGER,
  timer_active BOOLEAN,
  server_time TIMESTAMPTZ,
  round_status VARCHAR(20)
) AS $$
DECLARE
  v_timer_starts_at TIMESTAMPTZ;
  v_timer_duration INTEGER;
  v_round_status VARCHAR(20);
  v_elapsed INTEGER;
  v_remaining INTEGER;
BEGIN
  -- Get round info
  SELECT timer_starts_at, timer_duration, status
  INTO v_timer_starts_at, v_timer_duration, v_round_status
  FROM game_rounds
  WHERE id = p_round_id;

  -- If round not found, return NULL
  IF v_round_status IS NULL THEN
    RETURN QUERY SELECT NULL::INTEGER, FALSE, NOW(), NULL::VARCHAR(20);
    RETURN;
  END IF;

  -- If timer hasn't started yet, return full duration
  IF v_timer_starts_at IS NULL THEN
    RETURN QUERY SELECT v_timer_duration, FALSE, NOW(), v_round_status;
    RETURN;
  END IF;

  -- Calculate elapsed time in seconds
  v_elapsed := EXTRACT(EPOCH FROM (NOW() - v_timer_starts_at))::INTEGER;

  -- Calculate remaining time
  v_remaining := GREATEST(0, v_timer_duration - v_elapsed);

  -- Timer is active if there's time remaining and round is in answering/voting phase
  RETURN QUERY SELECT
    v_remaining,
    (v_remaining > 0 AND v_round_status IN ('answering', 'voting')),
    NOW(),
    v_round_status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================
-- 3. Sync all active timers for a game
-- ================================================
CREATE OR REPLACE FUNCTION sync_game_timers(p_game_id UUID)
RETURNS TABLE(
  round_id UUID,
  round_number INTEGER,
  round_status VARCHAR(20),
  time_remaining INTEGER,
  timer_active BOOLEAN,
  server_time TIMESTAMPTZ,
  timer_starts_at TIMESTAMPTZ,
  timer_duration INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    gr.id as round_id,
    gr.round_number,
    gr.status as round_status,
    CASE
      WHEN gr.timer_starts_at IS NULL THEN gr.timer_duration
      ELSE GREATEST(0, gr.timer_duration - EXTRACT(EPOCH FROM (NOW() - gr.timer_starts_at))::INTEGER)
    END as time_remaining,
    (gr.timer_starts_at IS NOT NULL AND
     gr.status IN ('answering', 'voting') AND
     EXTRACT(EPOCH FROM (NOW() - gr.timer_starts_at))::INTEGER < gr.timer_duration) as timer_active,
    NOW() as server_time,
    gr.timer_starts_at,
    gr.timer_duration
  FROM game_rounds gr
  WHERE gr.game_id = p_game_id
    AND gr.status IN ('answering', 'voting')
  ORDER BY gr.round_number DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================
-- 4. Start round timer (updates timer_starts_at atomically)
-- ================================================
CREATE OR REPLACE FUNCTION start_round_timer(p_round_id UUID)
RETURNS TABLE(
  success BOOLEAN,
  timer_starts_at TIMESTAMPTZ,
  message TEXT
) AS $$
DECLARE
  v_current_status VARCHAR(20);
  v_timer_starts_at TIMESTAMPTZ;
BEGIN
  -- Lock the round row for update
  SELECT status, timer_starts_at
  INTO v_current_status, v_timer_starts_at
  FROM game_rounds
  WHERE id = p_round_id
  FOR UPDATE;

  -- Check if round exists
  IF v_current_status IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TIMESTAMPTZ, 'Round not found'::TEXT;
    RETURN;
  END IF;

  -- Check if timer already started
  IF v_timer_starts_at IS NOT NULL THEN
    RETURN QUERY SELECT TRUE, v_timer_starts_at, 'Timer already started'::TEXT;
    RETURN;
  END IF;

  -- Start the timer
  UPDATE game_rounds
  SET timer_starts_at = NOW()
  WHERE id = p_round_id
  RETURNING game_rounds.timer_starts_at INTO v_timer_starts_at;

  RETURN QUERY SELECT TRUE, v_timer_starts_at, 'Timer started successfully'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_server_time TO authenticated;
GRANT EXECUTE ON FUNCTION get_round_time_remaining TO authenticated;
GRANT EXECUTE ON FUNCTION sync_game_timers TO authenticated;
GRANT EXECUTE ON FUNCTION start_round_timer TO authenticated;

-- Add comments
COMMENT ON FUNCTION get_server_time IS 'Returns current server time for client synchronization';
COMMENT ON FUNCTION get_round_time_remaining IS 'Calculates time remaining for a round based on server time';
COMMENT ON FUNCTION sync_game_timers IS 'Syncs all active timers for a game with server time';
COMMENT ON FUNCTION start_round_timer IS 'Atomically starts a round timer to prevent race conditions';
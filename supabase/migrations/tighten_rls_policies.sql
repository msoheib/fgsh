-- Migration: Add RLS policy documentation and basic protections
-- Purpose: Document security model and add basic guardrails
--
-- SECURITY NOTE: This game uses anonymous access without Supabase Auth.
-- Full security enforcement requires implementing authentication or service key validation.
-- Current policies focus on preventing common mistakes rather than malicious attacks.
--
-- RECOMMENDED for production:
-- 1. Implement Supabase Auth for player authentication
-- 2. Use service roles for server-side RPCs
-- 3. Add API rate limiting
-- 4. Implement request validation middleware

-- ============================================================================
-- GAME_ROUNDS TABLE - Prefer RPC-based updates
-- ============================================================================

-- Add check constraint to prevent invalid status transitions
ALTER TABLE game_rounds
DROP CONSTRAINT IF EXISTS valid_status_transition;

ALTER TABLE game_rounds
DROP CONSTRAINT IF EXISTS valid_status_values;

ALTER TABLE game_rounds
ADD CONSTRAINT valid_status_values
CHECK (status IN ('answering', 'voting', 'completed'));

-- Add check constraint for timer values
ALTER TABLE game_rounds
DROP CONSTRAINT IF EXISTS valid_timer_duration;

ALTER TABLE game_rounds
ADD CONSTRAINT valid_timer_duration
CHECK (timer_duration >= 0 AND timer_duration <= 300);

-- ============================================================================
-- PLAYER_ANSWERS TABLE - Prevent duplicate answers
-- ============================================================================

-- Ensure one answer per player per round (already exists via UNIQUE constraint)
-- Add check for reasonable answer length
ALTER TABLE player_answers
DROP CONSTRAINT IF EXISTS reasonable_answer_length;

ALTER TABLE player_answers
ADD CONSTRAINT reasonable_answer_length
CHECK (char_length(answer_text) >= 1 AND char_length(answer_text) <= 500);

-- ============================================================================
-- VOTES TABLE - Prevent duplicate votes
-- ============================================================================

-- Ensure one vote per player per round
ALTER TABLE votes
DROP CONSTRAINT IF EXISTS one_vote_per_player_per_round;

ALTER TABLE votes
ADD CONSTRAINT one_vote_per_player_per_round
UNIQUE (round_id, voter_id);

-- ============================================================================
-- GAMES TABLE - Add validation constraints
-- ============================================================================

ALTER TABLE games
DROP CONSTRAINT IF EXISTS valid_game_status;

ALTER TABLE games
ADD CONSTRAINT valid_game_status
CHECK (status IN ('waiting', 'playing', 'finished'));

ALTER TABLE games
DROP CONSTRAINT IF EXISTS valid_round_count;

ALTER TABLE games
ADD CONSTRAINT valid_round_count
CHECK (round_count BETWEEN 1 AND 20);

ALTER TABLE games
DROP CONSTRAINT IF EXISTS valid_current_round;

ALTER TABLE games
ADD CONSTRAINT valid_current_round
CHECK (current_round >= 0 AND current_round <= round_count);

-- ============================================================================
-- PLAYERS TABLE - Add validation constraints
-- ============================================================================

ALTER TABLE players
DROP CONSTRAINT IF EXISTS valid_connection_status;

ALTER TABLE players
ADD CONSTRAINT valid_connection_status
CHECK (connection_status IN ('connected', 'disconnected'));

ALTER TABLE players
DROP CONSTRAINT IF EXISTS reasonable_player_name;

ALTER TABLE players
ADD CONSTRAINT reasonable_player_name
CHECK (char_length(user_name) >= 1 AND char_length(user_name) <= 50);

-- ============================================================================
-- Add helpful comments documenting security model
-- ============================================================================

COMMENT ON TABLE games IS
  'Game sessions. Updates should prefer RPC functions (advance_round_if_ready, force_advance_round) for atomic state changes.';

COMMENT ON TABLE game_rounds IS
  'Round instances. Status updates MUST use RPC functions to ensure transactional correctness.';

COMMENT ON TABLE player_answers IS
  'Player answer submissions. Answers are visible only during voting/completed phases (enforced by client filtering).';

COMMENT ON TABLE votes IS
  'Player votes. Each player can vote once per round (enforced by UNIQUE constraint).';

COMMENT ON COLUMN players.last_heartbeat IS
  'Heartbeat timestamp for detecting disconnected players. Updated every 10s by client, checked during phase transitions.';

COMMENT ON COLUMN games.phase_captain_id IS
  'Player responsible for timer expiration calls. Automatically fails over to another player if captain disconnects.';

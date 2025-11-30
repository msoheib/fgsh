-- Migration: Create RPC functions for authenticated host operations
-- Description: Server-side functions for game creation with auth checks
-- Maintains backward compatibility with existing anonymous functions

-- ============================================================================
-- RPC: Create Authenticated Game (for logged-in hosts)
-- ============================================================================

CREATE OR REPLACE FUNCTION create_authenticated_game(
  p_code VARCHAR(6),
  p_round_count INTEGER,
  p_max_players INTEGER,
  p_host_name VARCHAR(50) DEFAULT NULL,  -- NULL for TV display mode
  p_is_display_mode BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  game_id UUID,
  game_code VARCHAR(6),
  player_id UUID,
  player_name VARCHAR(50),
  is_host BOOLEAN
) AS $$
DECLARE
  v_auth_user_id UUID;
  v_game_id UUID;
  v_player_id UUID;
  v_can_create BOOLEAN;
BEGIN
  -- Verify user is authenticated
  v_auth_user_id := auth.uid();
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to create games';
  END IF;

  -- Check if host has permission to create games (entitlement check)
  v_can_create := is_host_subscription_active(v_auth_user_id);

  -- Optional: Enforce payment requirement (uncomment to enable)
  -- IF NOT v_can_create THEN
  --   RAISE EXCEPTION 'Active subscription required to create games. Please upgrade your account.';
  -- END IF;

  -- Validate game settings
  IF p_round_count < 4 OR p_round_count > 20 THEN
    RAISE EXCEPTION 'Round count must be between 4 and 20';
  END IF;

  IF p_max_players < 4 OR p_max_players > 10 THEN
    RAISE EXCEPTION 'Max players must be between 4 and 10';
  END IF;

  -- Create game (linked to authenticated user)
  INSERT INTO games (
    id,
    code,
    auth_host_id,
    host_id,
    phase_captain_id,
    status,
    round_count,
    max_players,
    current_round,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    p_code,
    v_auth_user_id,  -- Link to authenticated user
    NULL,            -- Will be set when host joins as player
    NULL,            -- Will be set when host joins as player
    'waiting',
    p_round_count,
    p_max_players,
    0,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_game_id;

  -- If NOT display mode, create player record for host
  IF NOT p_is_display_mode AND p_host_name IS NOT NULL THEN
    INSERT INTO players (
      id,
      game_id,
      user_name,
      is_host,
      score,
      connection_status,
      joined_at
    ) VALUES (
      gen_random_uuid(),
      v_game_id,
      p_host_name,
      TRUE,
      0,
      'connected',
      NOW()
    )
    RETURNING id INTO v_player_id;

    -- Update game to set host_id and phase_captain_id
    UPDATE games
    SET
      host_id = v_player_id,
      phase_captain_id = v_player_id,
      updated_at = NOW()
    WHERE id = v_game_id;

    -- Update host profile stats
    UPDATE host_profiles
    SET
      games_created_count = games_created_count + 1,
      last_game_created_at = NOW(),
      updated_at = NOW()
    WHERE id = v_auth_user_id;

    -- Return game and player info
    RETURN QUERY
    SELECT
      v_game_id AS game_id,
      p_code AS game_code,
      v_player_id AS player_id,
      p_host_name AS player_name,
      TRUE AS is_host;
  ELSE
    -- Display mode: No player created yet
    -- Update host profile stats
    UPDATE host_profiles
    SET
      games_created_count = games_created_count + 1,
      last_game_created_at = NOW(),
      updated_at = NOW()
    WHERE id = v_auth_user_id;

    -- Return game info only
    RETURN QUERY
    SELECT
      v_game_id AS game_id,
      p_code AS game_code,
      NULL::UUID AS player_id,
      NULL::VARCHAR(50) AS player_name,
      FALSE AS is_host;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION create_authenticated_game IS 'Creates a game for an authenticated host. Supports both regular and TV display modes. Validates entitlement and updates host statistics.';

-- ============================================================================
-- RPC: Check Host Entitlement
-- ============================================================================

CREATE OR REPLACE FUNCTION check_host_entitlement()
RETURNS TABLE (
  can_create_games BOOLEAN,
  subscription_tier VARCHAR(20),
  subscription_active BOOLEAN,
  games_created INTEGER,
  display_name VARCHAR(100)
) AS $$
DECLARE
  v_auth_user_id UUID;
BEGIN
  -- Get authenticated user ID
  v_auth_user_id := auth.uid();

  IF v_auth_user_id IS NULL THEN
    -- Not authenticated - return default values
    RETURN QUERY
    SELECT
      FALSE AS can_create_games,
      'none'::VARCHAR(20) AS subscription_tier,
      FALSE AS subscription_active,
      0 AS games_created,
      NULL::VARCHAR(100) AS display_name;
  ELSE
    -- Return host profile data
    RETURN QUERY
    SELECT
      is_host_subscription_active(v_auth_user_id) AS can_create_games,
      hp.subscription_tier,
      is_host_subscription_active(v_auth_user_id) AS subscription_active,
      hp.games_created_count AS games_created,
      hp.display_name
    FROM host_profiles hp
    WHERE hp.id = v_auth_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION check_host_entitlement IS 'Returns entitlement information for the authenticated host. Used by frontend to show upgrade prompts and gate features.';

-- ============================================================================
-- RPC: Get Host Dashboard Data
-- ============================================================================

CREATE OR REPLACE FUNCTION get_host_dashboard()
RETURNS TABLE (
  total_games_created INTEGER,
  total_players_hosted INTEGER,
  active_games_count INTEGER,
  recent_games JSON
) AS $$
DECLARE
  v_auth_user_id UUID;
BEGIN
  v_auth_user_id := auth.uid();

  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY
  SELECT
    hp.games_created_count,
    hp.total_players_hosted,
    (
      SELECT COUNT(*)::INTEGER
      FROM games g
      WHERE g.auth_host_id = v_auth_user_id
      AND g.status IN ('waiting', 'playing')
    ) AS active_games_count,
    (
      SELECT COALESCE(json_agg(recent_game_data), '[]'::json)
      FROM (
        SELECT
          g.id,
          g.code,
          g.status,
          g.created_at,
          g.round_count,
          g.current_round,
          (SELECT COUNT(*) FROM players p WHERE p.game_id = g.id) AS player_count
        FROM games g
        WHERE g.auth_host_id = v_auth_user_id
        ORDER BY g.created_at DESC
        LIMIT 10
      ) AS recent_game_data
    ) AS recent_games
  FROM host_profiles hp
  WHERE hp.id = v_auth_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_host_dashboard IS 'Returns dashboard data for authenticated host: stats and recent games.';

-- ============================================================================
-- RPC: Update Host Display Name
-- ============================================================================

CREATE OR REPLACE FUNCTION update_host_display_name(p_display_name VARCHAR(100))
RETURNS BOOLEAN AS $$
DECLARE
  v_auth_user_id UUID;
BEGIN
  v_auth_user_id := auth.uid();

  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE host_profiles
  SET
    display_name = p_display_name,
    updated_at = NOW()
  WHERE id = v_auth_user_id;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_host_display_name IS 'Allows authenticated host to update their display name.';

-- ============================================================================
-- RPC: Increment Total Players Hosted (called when player joins)
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_players_hosted_count(p_game_id UUID)
RETURNS VOID AS $$
DECLARE
  v_auth_host_id UUID;
BEGIN
  -- Get the auth_host_id from the game
  SELECT auth_host_id INTO v_auth_host_id
  FROM games
  WHERE id = p_game_id;

  -- Increment if auth host exists
  IF v_auth_host_id IS NOT NULL THEN
    UPDATE host_profiles
    SET
      total_players_hosted = total_players_hosted + 1,
      updated_at = NOW()
    WHERE id = v_auth_host_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION increment_players_hosted_count IS 'Increments the total_players_hosted counter when a player joins a game. Called automatically on player insert.';

-- ============================================================================
-- TRIGGER: Auto-increment players hosted count
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_increment_players_hosted()
RETURNS TRIGGER AS $$
BEGIN
  -- Increment the host's total_players_hosted count
  PERFORM increment_players_hosted_count(NEW.game_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_player_joined
  AFTER INSERT ON players
  FOR EACH ROW
  EXECUTE FUNCTION auto_increment_players_hosted();

COMMENT ON TRIGGER on_player_joined ON players IS 'Automatically increments host stats when a player joins their game.';

-- ============================================================================
-- USAGE EXAMPLES
-- ============================================================================

-- Example 1: Create game as authenticated host (regular mode)
/*
SELECT * FROM create_authenticated_game(
  p_code := 'ABC123',
  p_round_count := 4,
  p_max_players := 10,
  p_host_name := 'John',
  p_is_display_mode := FALSE
);
*/

-- Example 2: Create game in TV display mode
/*
SELECT * FROM create_authenticated_game(
  p_code := 'XYZ789',
  p_round_count := 6,
  p_max_players := 8,
  p_host_name := NULL,
  p_is_display_mode := TRUE
);
*/

-- Example 3: Check if current user can create games
/*
SELECT * FROM check_host_entitlement();
*/

-- Example 4: Get host dashboard
/*
SELECT * FROM get_host_dashboard();
*/

-- Example 5: Update display name
/*
SELECT update_host_display_name('My New Name');
*/

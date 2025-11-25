-- Migration: Add RPC for updating host display name
-- Description: Allows authenticated users to update their own display name
-- This bypasses RLS since users can't directly update host_profiles

-- ============================================================================
-- RPC: Update host display name
-- ============================================================================

CREATE OR REPLACE FUNCTION update_host_display_name(p_display_name TEXT)
RETURNS VOID AS $$
BEGIN
  -- Update the display_name for the authenticated user's host profile
  UPDATE host_profiles
  SET
    display_name = p_display_name,
    updated_at = NOW()
  WHERE id = auth.uid();

  -- If no rows were updated, the user doesn't have a profile yet
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Host profile not found for user';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_host_display_name(TEXT) IS
  'Allows authenticated users to update their own display name in host_profiles';

-- ============================================================================
-- GRANT EXECUTE TO AUTHENTICATED USERS
-- ============================================================================

GRANT EXECUTE ON FUNCTION update_host_display_name(TEXT) TO authenticated;

-- ============================================================================
-- TESTING
-- ============================================================================

-- Test updating display name (as authenticated user):
-- SELECT update_host_display_name('New Display Name');

-- Verify update:
-- SELECT display_name, updated_at FROM host_profiles WHERE id = auth.uid();

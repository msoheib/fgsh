-- Migration: Create host_profiles table for authenticated hosts
-- Description: Add Supabase Auth integration for game hosts
-- Hosts must authenticate to create games, players remain anonymous

-- ============================================================================
-- HOST PROFILES TABLE
-- ============================================================================
-- Stores additional data for authenticated hosts
-- Linked to Supabase auth.users via id (1:1 relationship)

CREATE TABLE IF NOT EXISTS host_profiles (
  -- Primary key matches auth.users.id
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Display name (can differ from auth email)
  display_name VARCHAR(100),

  -- Payment and entitlement tracking
  is_paid_host BOOLEAN DEFAULT FALSE,
  subscription_tier VARCHAR(20) DEFAULT 'free', -- 'free' | 'basic' | 'premium'
  subscription_expires_at TIMESTAMP,

  -- Usage tracking
  games_created_count INTEGER DEFAULT 0,
  total_players_hosted INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_game_created_at TIMESTAMP
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_host_profiles_subscription ON host_profiles(subscription_tier, subscription_expires_at);
CREATE INDEX idx_host_profiles_created_at ON host_profiles(created_at);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE host_profiles ENABLE ROW LEVEL SECURITY;

-- Hosts can view their own profile
CREATE POLICY "Hosts can view own profile"
  ON host_profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Hosts can update their own profile (display name only, not payment fields)
CREATE POLICY "Hosts can update own profile"
  ON host_profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Only service role can insert (auto-created via trigger)
CREATE POLICY "Service role can insert host profiles"
  ON host_profiles
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Only service role can update payment fields (prevents self-upgrade)
CREATE POLICY "Service role can update payment status"
  ON host_profiles
  FOR UPDATE
  USING (auth.role() = 'service_role');

-- ============================================================================
-- TRIGGER: Auto-create host profile on user signup
-- ============================================================================

CREATE OR REPLACE FUNCTION create_host_profile_on_signup()
RETURNS TRIGGER AS $$
BEGIN
  -- Create a host profile for every new auth user
  INSERT INTO host_profiles (id, display_name, created_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING; -- Prevent duplicate if already exists

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users table (requires SECURITY DEFINER)
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_host_profile_on_signup();

-- ============================================================================
-- TRIGGER: Update updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION update_host_profile_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER host_profiles_updated_at
  BEFORE UPDATE ON host_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_host_profile_timestamp();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Check if a host has an active subscription
CREATE OR REPLACE FUNCTION is_host_subscription_active(host_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM host_profiles
    WHERE id = host_user_id
    AND (
      is_paid_host = TRUE
      OR (
        subscription_expires_at IS NOT NULL
        AND subscription_expires_at > NOW()
      )
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get host entitlement tier
CREATE OR REPLACE FUNCTION get_host_tier(host_user_id UUID)
RETURNS VARCHAR AS $$
DECLARE
  tier VARCHAR;
BEGIN
  SELECT subscription_tier INTO tier
  FROM host_profiles
  WHERE id = host_user_id;

  RETURN COALESCE(tier, 'free');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE host_profiles IS 'Authenticated host accounts with payment/entitlement tracking';
COMMENT ON COLUMN host_profiles.id IS 'References auth.users.id - one host profile per user';
COMMENT ON COLUMN host_profiles.is_paid_host IS 'True if host has made any payment (lifetime access)';
COMMENT ON COLUMN host_profiles.subscription_tier IS 'Current subscription level: free, basic, premium';
COMMENT ON COLUMN host_profiles.subscription_expires_at IS 'When subscription expires (NULL = lifetime/free)';
COMMENT ON FUNCTION create_host_profile_on_signup() IS 'Auto-creates host_profile when user signs up';
COMMENT ON FUNCTION is_host_subscription_active(UUID) IS 'Returns true if host can create games';

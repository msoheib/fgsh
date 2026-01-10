-- Migration: Add Admin Dashboard capabilities
-- Description: Add admin and banned flags to host_profiles, create RLS for admin operations

-- ============================================================================
-- ADD COLUMNS TO HOST_PROFILES
-- ============================================================================

-- Add is_admin column (must be set manually in Supabase Dashboard)
ALTER TABLE host_profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- Add is_approved column (admin must be approved to access admin panel)
ALTER TABLE host_profiles ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE;

-- Add is_banned column (banned users cannot play)
ALTER TABLE host_profiles ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;

-- ============================================================================
-- HELPER FUNCTION: Check if current user is an approved admin
-- ============================================================================

CREATE OR REPLACE FUNCTION is_current_user_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM host_profiles
    WHERE id = auth.uid()
    AND is_admin = TRUE
    AND is_approved = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION is_current_user_admin() IS 'Returns true if the current user is an approved admin';

-- ============================================================================
-- QUESTIONS TABLE: Admin-only CRUD policies
-- ============================================================================

-- Drop existing overly permissive policies for questions if they exist
DROP POLICY IF EXISTS "Questions are viewable by everyone" ON questions;

-- Everyone can SELECT questions (needed for gameplay)
CREATE POLICY "Questions are viewable by everyone"
  ON questions
  FOR SELECT
  USING (true);

-- Only admins can INSERT questions
CREATE POLICY "Admins can create questions"
  ON questions
  FOR INSERT
  WITH CHECK (is_current_user_admin());

-- Only admins can UPDATE questions
CREATE POLICY "Admins can update questions"
  ON questions
  FOR UPDATE
  USING (is_current_user_admin());

-- Only admins can DELETE questions
CREATE POLICY "Admins can delete questions"
  ON questions
  FOR DELETE
  USING (is_current_user_admin());

-- ============================================================================
-- HOST_PROFILES: Admin access policies
-- ============================================================================

-- Drop existing policies that might conflict
DROP POLICY IF EXISTS "Hosts can view own profile" ON host_profiles;
DROP POLICY IF EXISTS "Hosts can update own profile" ON host_profiles;

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON host_profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Admins can view ALL profiles (for user management)
CREATE POLICY "Admins can view all profiles"
  ON host_profiles
  FOR SELECT
  USING (is_current_user_admin());

-- Users can update their own profile (display_name only - enforced by app logic)
CREATE POLICY "Users can update own profile"
  ON host_profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admins can update any profile (for banning, changing admin status)
CREATE POLICY "Admins can update any profile"
  ON host_profiles
  FOR UPDATE
  USING (is_current_user_admin());

-- ============================================================================
-- INDEXES for performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_host_profiles_is_admin ON host_profiles(is_admin) WHERE is_admin = TRUE;
CREATE INDEX IF NOT EXISTS idx_host_profiles_is_banned ON host_profiles(is_banned) WHERE is_banned = TRUE;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN host_profiles.is_admin IS 'True if user has admin privileges (must also be approved)';
COMMENT ON COLUMN host_profiles.is_approved IS 'True if admin is approved to access admin panel';
COMMENT ON COLUMN host_profiles.is_banned IS 'True if user is banned from playing';

/**
 * Host Profile Service - Manages host profile data
 */

import { getSupabase } from './supabase';

export interface HostProfile {
  id: string;
  display_name: string;
  is_paid_host: boolean;
  subscription_tier: 'free' | 'basic' | 'premium';
  subscription_expires_at: string | null;
  games_created_count: number;
  total_players_hosted: number;
  created_at: string;
  updated_at: string;
}

export class HostProfileService {
  /**
   * Get the current user's host profile
   */
  static async getProfile(): Promise<HostProfile | null> {
    const supabase = getSupabase();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('Not authenticated:', authError);
      return null;
    }

    // Fetch host profile
    const { data, error } = await supabase
      .from('host_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('Failed to fetch host profile:', error);
      return null;
    }

    return data as HostProfile;
  }

  /**
   * Update display name
   */
  static async updateDisplayName(displayName: string): Promise<boolean> {
    const supabase = getSupabase();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // Update auth metadata
    const { error: authError } = await supabase.auth.updateUser({
      data: { display_name: displayName }
    });

    if (authError) {
      console.error('Failed to update auth metadata:', authError);
      return false;
    }

    // Update host_profiles via RPC (to bypass RLS)
    const { error } = await supabase.rpc('update_host_display_name', {
      p_display_name: displayName
    });

    if (error) {
      console.error('Failed to update host profile:', error);
      return false;
    }

    return true;
  }

  /**
   * Get subscription status
   */
  static async getSubscriptionStatus(): Promise<{
    isPaid: boolean;
    tier: string;
    expiresAt: string | null;
    daysRemaining: number | null;
  } | null> {
    const profile = await this.getProfile();
    if (!profile) return null;

    let daysRemaining: number | null = null;

    if (profile.subscription_expires_at) {
      const expiryDate = new Date(profile.subscription_expires_at);
      const now = new Date();
      const diffTime = expiryDate.getTime() - now.getTime();
      daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    return {
      isPaid: profile.is_paid_host,
      tier: profile.subscription_tier,
      expiresAt: profile.subscription_expires_at,
      daysRemaining,
    };
  }
}

/**
 * Payment Service - Handles Moyasar payment integration
 * Documentation: https://docs.moyasar.com/
 */

import { getSupabase } from './supabase';
import { MOYASAR_CONFIG, type PaymentPlanId, type MoyasarPayment } from '../config/moyasar';

export interface HostEntitlement {
  can_create_games: boolean;
  subscription_tier: string;
  subscription_active: boolean;
  games_created: number;
  display_name: string;
}

export interface PaymentRecord {
  id: string;
  plan_id: string;
  amount: number;
  currency: string;
  status: string;
  payment_method?: string;
  card_company?: string;
  card_last_four?: string;
  created_at: string;
  paid_at?: string;
  subscription_expires_at?: string;
}

export class PaymentService {
  /**
   * Check if the current user is authenticated and can create games.
   */
  static async checkHostEntitlement(): Promise<HostEntitlement | null> {
    const supabase = getSupabase();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return null;
    }

    const { data, error } = await supabase.rpc('check_host_entitlement');

    if (error) {
      console.error('Failed to check entitlement:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      return null;
    }

    return data[0] as HostEntitlement;
  }

  /**
   * Create a payment record in database before redirecting to Moyasar.
   */
  static async createPaymentRecord(
    moyasarPaymentId: string,
    planId: PaymentPlanId
  ): Promise<string> {
    const supabase = getSupabase();
    const plan = MOYASAR_CONFIG.PLANS[planId];

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Authentication required');
    }

    const { data, error } = await supabase.rpc('create_payment_record', {
      p_moyasar_payment_id: moyasarPaymentId,
      p_plan_id: plan.id,
      p_amount: plan.priceHalalas,
      p_description: `Subscription: ${plan.nameAr}`,
    });

    if (error) {
      console.error('Failed to create payment record:', error);
      throw error;
    }

    return data as string;
  }

  /**
   * Get payment history for the authenticated user.
   */
  static async getPaymentHistory(): Promise<PaymentRecord[]> {
    const supabase = getSupabase();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Authentication required');
    }

    const { data, error } = await supabase.rpc('get_payment_history');

    if (error) {
      console.error('Failed to get payment history:', error);
      throw error;
    }

    return (data || []) as PaymentRecord[];
  }

  /**
   * Handle payment callback through a verified Edge Function.
   */
  static async handlePaymentCallback(paymentId: string, callbackPlan?: string | null): Promise<{
    success: boolean;
    payment: MoyasarPayment;
    message: string;
  }> {
    try {
      console.log('[PaymentCallback] Starting confirmation for payment:', paymentId);

      const supabase = getSupabase();
      const { data, error } = await supabase.functions.invoke('confirm-payment-callback', {
        body: {
          paymentId,
          plan: callbackPlan ?? null,
        },
      });

      if (error) {
        console.error('[PaymentCallback] Edge confirmation failed:', error);
        throw new Error(error.message || 'Failed to confirm payment callback');
      }

      if (!data?.payment) {
        throw new Error(data?.error || 'Missing payment confirmation payload');
      }

      return {
        success: !!data.success,
        payment: data.payment as MoyasarPayment,
        message: data.message || (data.success ? 'تم الدفع بنجاح!' : 'فشلت عملية الدفع.'),
      };
    } catch (error: any) {
      console.error('[PaymentCallback] Error handling payment callback:', error);
      console.error('[PaymentCallback] Error details:', {
        message: error.message,
        stack: error.stack,
        paymentId,
      });
      throw error;
    }
  }

  /**
   * Get subscription status for the authenticated user.
   */
  static async getSubscriptionStatus(): Promise<{
    is_active: boolean;
    tier: string;
    expires_at: string | null;
    days_remaining: number | null;
  }> {
    const supabase = getSupabase();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Authentication required');
    }

    const { data: profile, error } = await supabase
      .from('host_profiles')
      .select('subscription_tier, subscription_expires_at, is_paid_host')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('Failed to get subscription status:', error);
      throw error;
    }

    if (!profile) {
      return {
        is_active: false,
        tier: 'free',
        expires_at: null,
        days_remaining: null,
      };
    }

    let daysRemaining: number | null = null;
    if (profile.subscription_expires_at) {
      const expiryDate = new Date(profile.subscription_expires_at);
      const now = new Date();
      const diffTime = expiryDate.getTime() - now.getTime();
      daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    return {
      is_active: profile.is_paid_host,
      tier: profile.subscription_tier,
      expires_at: profile.subscription_expires_at,
      days_remaining: daysRemaining,
    };
  }
}

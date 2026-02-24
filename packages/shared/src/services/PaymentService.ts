/**
 * Payment Service - Handles Moyasar payment integration
 * Documentation: https://docs.moyasar.com/
 */

import { getSupabase } from './supabase';
import { MOYASAR_CONFIG, type PaymentPlanId, type MoyasarPayment } from '../config/moyasar';
import { getEnv, isDev as isDevEnv } from '../utils/env';

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
   * Normalize callback plan key/id into PaymentPlanId.
   * Accepts values like BASIC/basic/premium.
   */
  private static normalizePlanId(plan?: string | null): PaymentPlanId | null {
    if (!plan) return null;

    const normalized = plan.trim().toUpperCase();
    if (normalized in MOYASAR_CONFIG.PLANS) {
      return normalized as PaymentPlanId;
    }

    const byInternalId = (Object.entries(MOYASAR_CONFIG.PLANS) as Array<[PaymentPlanId, typeof MOYASAR_CONFIG.PLANS[PaymentPlanId]]>)
      .find(([, cfg]) => cfg.id.toUpperCase() === normalized);

    return byInternalId ? byInternalId[0] : null;
  }

  /**
   * Resolve plan from callback query and/or payment amount.
   */
  private static resolvePlanIdForPayment(payment: MoyasarPayment, callbackPlan?: string | null): PaymentPlanId | null {
    const fromCallback = this.normalizePlanId(callbackPlan);
    if (fromCallback) {
      return fromCallback;
    }

    const byAmount = (Object.entries(MOYASAR_CONFIG.PLANS) as Array<[PaymentPlanId, typeof MOYASAR_CONFIG.PLANS[PaymentPlanId]]>)
      .find(([, cfg]) => cfg.priceHalalas === payment.amount);

    return byAmount ? byAmount[0] : null;
  }

  /**
   * Ensure a payment row exists before status update.
   * Safe to call repeatedly.
   */
  private static async ensurePaymentRecordExists(payment: MoyasarPayment, callbackPlan?: string | null): Promise<void> {
    const planId = this.resolvePlanIdForPayment(payment, callbackPlan);

    if (!planId) {
      throw new Error('Unable to resolve payment plan from callback');
    }

    try {
      await this.createPaymentRecord(payment.id, planId);
    } catch (error: any) {
      const code = error?.code;
      const message = String(error?.message || '');

      // Ignore duplicates if another flow already inserted the row.
      if (code === '23505' || message.toLowerCase().includes('duplicate key')) {
        return;
      }

      throw error;
    }
  }

  /**
   * Check if the current user is authenticated and can create games
   */
  static async checkHostEntitlement(): Promise<HostEntitlement | null> {
    const supabase = getSupabase();

    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return null;
    }

    // Call RPC to get entitlement
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
   * Create a payment record in database before redirecting to Moyasar
   */
  static async createPaymentRecord(
    moyasarPaymentId: string,
    planId: PaymentPlanId
  ): Promise<string> {
    const supabase = getSupabase();
    const plan = MOYASAR_CONFIG.PLANS[planId];

    // Verify user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Authentication required');
    }

    // Create payment record
    const { data, error } = await supabase.rpc('create_payment_record', {
      p_moyasar_payment_id: moyasarPaymentId,
      p_plan_id: plan.id, // Use lowercase plan ID from config (e.g., 'basic', 'premium', 'lifetime')
      p_amount: plan.priceHalalas,
      p_description: `Subscription: ${plan.nameAr}`,
    });

    if (error) {
      console.error('Failed to create payment record:', error);
      throw error;
    }

    return data as string; // Returns payment record UUID
  }

  /**
   * Verify payment status with Moyasar API
   * @param paymentId - Moyasar payment ID (from callback URL)
   * @param retryCount - Internal retry counter (default 0)
   */
  static async verifyPayment(paymentId: string, retryCount: number = 0): Promise<MoyasarPayment> {
    const publishableKey = getEnv('VITE_MOYASAR_PUBLISHABLE_KEY');

    if (!publishableKey) {
      throw new Error('Moyasar publishable key not configured');
    }

    try {
      const response = await fetch(MOYASAR_CONFIG.API.GET_PAYMENT(paymentId), {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${btoa(publishableKey + ':')}`,
          'Content-Type': 'application/json',
        },
      });

      // Handle rate limiting with exponential backoff
      if (response.status === 429) {
        if (retryCount < 2) {
          const delay = (retryCount + 1) * 2000; // 2s, 4s
          console.warn(`Rate limited by Moyasar (429). Retrying in ${delay}ms... (attempt ${retryCount + 1}/2)`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.verifyPayment(paymentId, retryCount + 1);
        } else {
          throw new Error('Rate limit exceeded after retries. Please try again in a few moments.');
        }
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Moyasar API error (${response.status}):`, errorText);
        throw new Error(`Failed to verify payment: ${response.status} - ${response.statusText}`);
      }

      const payment: MoyasarPayment = await response.json();
      console.log('Payment verified successfully:', payment.id, 'Status:', payment.status);
      return payment;
    } catch (error) {
      console.error('Failed to verify payment:', error);
      throw error;
    }
  }

  /**
   * Get payment history for the authenticated user
   */
  static async getPaymentHistory(): Promise<PaymentRecord[]> {
    const supabase = getSupabase();

    // Verify user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Authentication required');
    }

    // Get payment history
    const { data, error } = await supabase.rpc('get_payment_history');

    if (error) {
      console.error('Failed to get payment history:', error);
      throw error;
    }

    return (data || []) as PaymentRecord[];
  }

  /**
   * Update payment status in database (calls RPC to trigger host_profiles update)
   * @param moyasarPaymentId - Moyasar payment ID
   * @param status - Payment status from Moyasar
   * @param paymentDetails - Additional payment details
   */
  static async updatePaymentStatus(
    moyasarPaymentId: string,
    status: string,
    paymentDetails?: {
      payment_method?: string;
      card_company?: string;
      card_last_four?: string;
      reference?: string;
      gateway_id?: string;
      failure_reason?: string;
    }
  ): Promise<boolean> {
    const supabase = getSupabase();

    const { data, error } = await supabase.rpc('update_payment_status', {
      p_moyasar_payment_id: moyasarPaymentId,
      p_status: status,
      p_payment_method: paymentDetails?.payment_method || null,
      p_card_company: paymentDetails?.card_company || null,
      p_card_last_four: paymentDetails?.card_last_four || null,
      p_moyasar_reference: paymentDetails?.reference || null,
      p_moyasar_gateway_id: paymentDetails?.gateway_id || null,
      p_failure_reason: paymentDetails?.failure_reason || null,
    });

    if (error) {
      console.error('Failed to update payment status:', error);
      throw error;
    }

    return data as boolean;
  }

  /**
   * Handle payment callback (called after user returns from Moyasar)
   * @param paymentId - Moyasar payment ID from URL query param
   */
  static async handlePaymentCallback(paymentId: string, callbackPlan?: string | null): Promise<{
    success: boolean;
    payment: MoyasarPayment;
    message: string;
  }> {
    try {
      console.log('[PaymentCallback] Starting verification for payment:', paymentId);

      // DEV MODE: Allow manual test payment confirmation
      const isDev = isDevEnv();
      const forceSuccess = isDev && paymentId.startsWith('test_');

      if (forceSuccess) {
        console.warn('[PaymentCallback] 🧪 DEV MODE: Forcing test payment success for ID:', paymentId);

        // Manually update database to mark as paid
        await this.updatePaymentStatus(paymentId, 'paid', {
          payment_method: 'creditcard',
          card_company: 'test',
          card_last_four: '1111',
          reference: paymentId,
        });

        // Return mock successful payment
        return {
          success: true,
          payment: {
            id: paymentId,
            status: 'paid',
            amount: 4900,
            currency: 'SAR',
            description: 'Test Payment',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            callback_url: '',
          } as MoyasarPayment,
          message: 'تم الدفع بنجاح! (وضع الاختبار)',
        };
      }

      // Verify payment with Moyasar API
      const payment = await this.verifyPayment(paymentId);
      console.log('[PaymentCallback] Payment verified. Status:', payment.status);

      // Update payment status in database (this triggers the host_profiles update)
      console.log('[PaymentCallback] Updating database with status:', payment.status);
      let updated = await this.updatePaymentStatus(payment.id, payment.status, {
        payment_method: payment.source?.type,
        card_company: payment.source?.company,
        card_last_four: payment.source?.number?.slice(-4),
        reference: payment.id,
      });

      console.log('[PaymentCallback] Database update result:', updated);

      // If callback row was not pre-created, create it now and retry status update.
      if (!updated) {
        console.warn('[PaymentCallback] Payment row not found. Creating payment record and retrying update...');
        await this.ensurePaymentRecordExists(payment, callbackPlan);

        updated = await this.updatePaymentStatus(payment.id, payment.status, {
          payment_method: payment.source?.type,
          card_company: payment.source?.company,
          card_last_four: payment.source?.number?.slice(-4),
          reference: payment.id,
        });

        console.log('[PaymentCallback] Database update retry result:', updated);
      }

      if (!updated) {
        throw new Error('Failed to persist payment status in database');
      }

      // Check payment status
      if (payment.status === 'paid' || payment.status === 'captured') {
        // Payment successful - database trigger has updated host_profiles
        console.log('[PaymentCallback] ✅ Payment successful! Database trigger should have updated host_profiles.');
        return {
          success: true,
          payment,
          message: 'تم الدفع بنجاح! تم تفعيل حسابك.',
        };
      } else if (payment.status === 'failed') {
        console.warn('[PaymentCallback] ❌ Payment failed with status:', payment.status);
        return {
          success: false,
          payment,
          message: 'فشلت عملية الدفع. يرجى المحاولة مرة أخرى.',
        };
      } else {
        // Other statuses (initiated, authorized, etc.)
        console.warn('[PaymentCallback] ⏳ Payment in intermediate status:', payment.status);
        return {
          success: false,
          payment,
          message: `عملية الدفع قيد المعالجة... (الحالة: ${payment.status})`,
        };
      }
    } catch (error: any) {
      console.error('[PaymentCallback] ❌ Error handling payment callback:', error);
      console.error('[PaymentCallback] Error details:', {
        message: error.message,
        stack: error.stack,
        paymentId,
      });
      throw error;
    }
  }

  /**
   * Get subscription status for the authenticated user
   */
  static async getSubscriptionStatus(): Promise<{
    is_active: boolean;
    tier: string;
    expires_at: string | null;
    days_remaining: number | null;
  }> {
    const supabase = getSupabase();

    // Verify user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Authentication required');
    }

    // Get host profile
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

    // Calculate days remaining
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

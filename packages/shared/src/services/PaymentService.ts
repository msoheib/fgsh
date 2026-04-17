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

export type PaymentCallbackErrorCode =
  | 'auth_required'
  | 'missing_payment_id'
  | 'env_missing'
  | 'invalid_request'
  | 'banned_user'
  | 'payment_belongs_to_other_user'
  | 'plan_resolution_failed'
  | 'moyasar_verify_failed'
  | 'payment_insert_failed'
  | 'payment_status_update_failed'
  | 'callback_request_failed';

export interface PaymentCallbackResult {
  success: boolean;
  payment?: MoyasarPayment;
  message: string;
  code?: PaymentCallbackErrorCode | null;
  error?: string;
  status?: number;
  details?: Record<string, unknown> | null;
}

type PaymentCallbackPayload = {
  success: boolean;
  payment?: MoyasarPayment;
  message?: string;
  code?: PaymentCallbackErrorCode | null;
  error?: string;
  details?: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPaymentCallbackPayload(value: unknown): value is PaymentCallbackPayload {
  return isRecord(value) && typeof value.success === 'boolean';
}

async function readResponseJson(response?: Response): Promise<unknown | null> {
  if (!response) {
    return null;
  }

  try {
    const cloned = response.clone();
    const text = await cloned.text();
    if (!text) {
      return null;
    }

    return JSON.parse(text) as unknown;
  } catch (error) {
    console.warn('[PaymentCallback] Failed to parse callback response body:', error);
    return null;
  }
}

function normalizeCallbackResult(
  payload: PaymentCallbackPayload,
  status?: number,
): PaymentCallbackResult {
  return {
    success: payload.success,
    payment: payload.payment,
    message: payload.message || payload.error || 'تعذر التحقق من الدفع.',
    code: payload.code ?? null,
    error: payload.error,
    status,
    details: payload.details ?? null,
  };
}

function buildFallbackCallbackResult(message: string, error?: string, status?: number): PaymentCallbackResult {
  return {
    success: false,
    code: 'callback_request_failed',
    message,
    error: error || message,
    status,
    details: null,
  };
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
  static async handlePaymentCallback(paymentId: string, callbackPlan?: string | null): Promise<PaymentCallbackResult> {
    try {
      console.log('[PaymentCallback] Starting confirmation for payment:', paymentId);

      const supabase = getSupabase();
      const { data, error, response } = await supabase.functions.invoke<PaymentCallbackPayload>('confirm-payment-callback', {
        body: {
          paymentId,
          plan: callbackPlan ?? null,
        },
      });

      const responseStatus = response?.status;

      if (isPaymentCallbackPayload(data)) {
        if (data.success) {
          return normalizeCallbackResult(data, responseStatus);
        }

        return normalizeCallbackResult(data, responseStatus);
      }

      if (error) {
        const parsedResponse = await readResponseJson(response);
        if (isPaymentCallbackPayload(parsedResponse)) {
          const normalized = normalizeCallbackResult(parsedResponse, responseStatus);
          console.warn('[PaymentCallback] Edge confirmation returned structured failure:', {
            paymentId,
            status: responseStatus,
            code: normalized.code,
            message: normalized.message,
          });
          return normalized;
        }

        const errorMessage = error instanceof Error ? error.message : 'Failed to confirm payment callback';
        console.error('[PaymentCallback] Edge confirmation failed:', {
          paymentId,
          status: responseStatus,
          error,
          parsedResponse,
        });
        return buildFallbackCallbackResult(
          'تعذر التحقق من الدفع حالياً. يرجى المحاولة مرة أخرى.',
          errorMessage,
          responseStatus,
        );
      }

      const parsedResponse = await readResponseJson(response);
      if (isPaymentCallbackPayload(parsedResponse)) {
        return normalizeCallbackResult(parsedResponse, responseStatus);
      }

      if (data && typeof data === 'object') {
        const payload = data as Record<string, unknown>;
        const maybeMessage = typeof payload.message === 'string' ? payload.message : undefined;
        const maybeError = typeof payload.error === 'string' ? payload.error : undefined;
        const maybeCode = typeof payload.code === 'string' ? payload.code as PaymentCallbackErrorCode : null;

        return {
          success: Boolean(payload.success),
          payment: isRecord(payload.payment) ? (payload.payment as unknown as MoyasarPayment) : undefined,
          message: maybeMessage || maybeError || 'تعذر التحقق من الدفع.',
          code: maybeCode,
          error: maybeError,
          status: responseStatus,
          details: isRecord(payload.details) ? payload.details : null,
        };
      }

      return buildFallbackCallbackResult(
        'تعذر التحقق من الدفع حالياً. يرجى المحاولة مرة أخرى.',
        'Missing payment confirmation payload',
        responseStatus,
      );
    } catch (error: any) {
      console.error('[PaymentCallback] Error handling payment callback:', error);
      console.error('[PaymentCallback] Error details:', {
        message: error.message,
        stack: error.stack,
        paymentId,
      });
      return buildFallbackCallbackResult(
        'تعذر التحقق من الدفع حالياً. يرجى المحاولة مرة أخرى.',
        error?.message || 'Unexpected payment callback error',
      );
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

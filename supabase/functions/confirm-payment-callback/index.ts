import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, prefer',
};

type PaymentPlanId = 'basic' | 'premium' | 'lifetime';
type CallbackErrorCode =
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

const PLAN_AMOUNTS: Record<PaymentPlanId, number> = {
  basic: 4900,
  premium: 9900,
  lifetime: 29900,
};

type MoyasarPayment = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  description: string;
  created_at: string;
  updated_at: string;
  callback_url: string;
  source?: {
    type?: string;
    company?: string;
    number?: string;
    gateway_id?: string;
    reference_number?: string;
    message?: string;
  };
};

type CallbackResponse =
  | {
    success: true;
    code: null;
    payment: MoyasarPayment;
    message: string;
  }
  | {
    success: false;
    code: null;
    payment?: MoyasarPayment;
    message: string;
  }
  | {
    success: false;
    code: CallbackErrorCode;
    error: string;
    message: string;
    details?: Record<string, unknown>;
  };

function normalizePlanId(plan?: string | null, amount?: number): PaymentPlanId | null {
  const normalized = plan?.trim().toLowerCase();
  if (normalized === 'basic' || normalized === 'premium' || normalized === 'lifetime') {
    return normalized;
  }

  if (amount != null) {
    const matched = Object.entries(PLAN_AMOUNTS).find(([, planAmount]) => planAmount === amount);
    if (matched) {
      return matched[0] as PaymentPlanId;
    }
  }

  return null;
}

function normalizePaymentStatus(status: string): string {
  const normalized = status.trim().toLowerCase();
  return normalized === 'captured' ? 'paid' : normalized;
}

function buildMessage(status: string): string {
  if (status === 'paid') {
    return 'تم الدفع بنجاح! تم تفعيل حسابك.';
  }

  if (status === 'failed') {
    return 'فشلت عملية الدفع. يرجى المحاولة مرة أخرى.';
  }

  return `عملية الدفع قيد المعالجة... (الحالة: ${status})`;
}

function jsonResponse(status: number, payload: CallbackResponse): Response {
  return new Response(
    JSON.stringify(payload),
    {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    },
  );
}

function errorResponse(
  status: number,
  code: CallbackErrorCode,
  error: string,
  details?: Record<string, unknown>,
): Response {
  return jsonResponse(status, {
    success: false,
    code,
    error,
    message: error,
    details,
  });
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: string }).code === '23505';
}

async function fetchVerifiedPayment(paymentId: string, moyasarSecretKey: string): Promise<MoyasarPayment> {
  const response = await fetch(`https://api.moyasar.com/v1/payments/${paymentId}`, {
    method: 'GET',
    headers: {
      Authorization: `Basic ${btoa(`${moyasarSecretKey}:`)}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to verify payment with Moyasar: ${response.status} ${errorText}`);
  }

  return await response.json() as MoyasarPayment;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const moyasarSecretKey = Deno.env.get('MOYASAR_SECRET_KEY');
    const allowTestPayments = Deno.env.get('ALLOW_TEST_PAYMENTS') === 'true';
    const missingEnv = [
      !supabaseUrl ? 'SUPABASE_URL' : null,
      !supabaseAnonKey ? 'SUPABASE_ANON_KEY|SUPABASE_PUBLISHABLE_KEY' : null,
      !supabaseServiceKey ? 'SUPABASE_SERVICE_ROLE_KEY' : null,
      !moyasarSecretKey ? 'MOYASAR_SECRET_KEY' : null,
    ].filter((value): value is string => Boolean(value));

    if (missingEnv.length > 0) {
      return errorResponse(
        500,
        'env_missing',
        'Missing required environment variables for payment verification',
        { missing: missingEnv },
      );
    }

    const resolvedSupabaseUrl = supabaseUrl as string;
    const resolvedSupabaseAnonKey = supabaseAnonKey as string;
    const resolvedSupabaseServiceKey = supabaseServiceKey as string;
    const resolvedMoyasarSecretKey = moyasarSecretKey as string;

    const authClient = createClient(resolvedSupabaseUrl, resolvedSupabaseAnonKey, {
      global: {
        headers: {
          Authorization: req.headers.get('Authorization') ?? '',
        },
      },
    });
    const serviceClient = createClient(resolvedSupabaseUrl, resolvedSupabaseServiceKey);

    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || !authData.user) {
      return errorResponse(
        401,
        'auth_required',
        'Authentication required',
        { reason: authError?.message ?? 'No user session' },
      );
    }

    let body: { paymentId?: string; plan?: string | null };
    try {
      body = await req.json() as { paymentId?: string; plan?: string | null };
    } catch (bodyError) {
      return errorResponse(
        400,
        'invalid_request',
        'Invalid request body',
        { reason: bodyError instanceof Error ? bodyError.message : String(bodyError) },
      );
    }

    const { paymentId, plan } = body;
    if (!paymentId) {
      return errorResponse(
        400,
        'missing_payment_id',
        'Payment ID is required',
        { plan: plan ?? null },
      );
    }

    const { data: profile, error: profileError } = await serviceClient
      .from('host_profiles')
      .select('is_banned')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (profileError) {
      return errorResponse(
        500,
        'callback_request_failed',
        'Failed to load host profile',
        { step: 'load_host_profile', reason: profileError.message },
      );
    }

    if (profile?.is_banned) {
      return errorResponse(
        403,
        'banned_user',
        'Banned users cannot confirm payments',
        { hostId: authData.user.id },
      );
    }

    let payment: MoyasarPayment;
    if (allowTestPayments && paymentId.startsWith('test_')) {
      const normalizedPlan = normalizePlanId(plan, undefined);
      if (!normalizedPlan) {
        return errorResponse(
          400,
          'plan_resolution_failed',
          'Valid plan is required for test payment confirmation',
          { paymentId, plan: plan ?? null },
        );
      }

      payment = {
        id: paymentId,
        status: 'paid',
        amount: PLAN_AMOUNTS[normalizedPlan],
        currency: 'SAR',
        description: `Test payment: ${normalizedPlan}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        callback_url: '',
        source: {
          type: 'creditcard',
          company: 'test',
          number: '1111',
          reference_number: paymentId,
        },
      };
    } else {
      try {
        payment = await fetchVerifiedPayment(paymentId, resolvedMoyasarSecretKey);
      } catch (verifyError) {
        return errorResponse(
          502,
          'moyasar_verify_failed',
          'Failed to verify payment with Moyasar',
          {
            paymentId,
            reason: verifyError instanceof Error ? verifyError.message : String(verifyError),
          },
        );
      }
    }

    const normalizedPlan = normalizePlanId(plan, payment.amount);
    if (!normalizedPlan) {
      return errorResponse(
        400,
        'plan_resolution_failed',
        'Unable to resolve payment plan',
        {
          paymentId,
          plan: plan ?? null,
          amount: payment.amount,
        },
      );
    }

    const { data: existingPayment, error: existingPaymentError } = await serviceClient
      .from('payments')
      .select('id, host_id')
      .eq('moyasar_payment_id', payment.id)
      .maybeSingle();

    if (existingPaymentError) {
      return errorResponse(
        500,
        'callback_request_failed',
        'Failed to load existing payment record',
        {
          step: 'load_existing_payment',
          paymentId: payment.id,
          reason: existingPaymentError.message,
        },
      );
    }

    if (existingPayment && existingPayment.host_id !== authData.user.id) {
      return errorResponse(
        403,
        'payment_belongs_to_other_user',
        'Payment does not belong to the current user',
        {
          paymentId: payment.id,
          hostId: authData.user.id,
        },
      );
    }

    if (!existingPayment) {
      const { error: insertError } = await serviceClient
        .from('payments')
        .insert({
          moyasar_payment_id: payment.id,
          host_id: authData.user.id,
          plan_id: normalizedPlan,
          amount: payment.amount,
          currency: payment.currency || 'SAR',
          status: 'initiated',
          description: payment.description || `Subscription: ${normalizedPlan}`,
          created_at: payment.created_at || new Date().toISOString(),
        });

      if (insertError) {
        if (!isDuplicateKeyError(insertError)) {
          return errorResponse(
            500,
            'payment_insert_failed',
            'Failed to create payment record',
            {
              paymentId: payment.id,
              reason: insertError.message ?? 'Unknown insert error',
              code: insertError.code ?? null,
            },
          );
        }

        const { data: duplicatePayment, error: duplicatePaymentError } = await serviceClient
          .from('payments')
          .select('id, host_id')
          .eq('moyasar_payment_id', payment.id)
          .maybeSingle();

        if (duplicatePaymentError || !duplicatePayment) {
          return errorResponse(
            500,
            'payment_insert_failed',
            'Failed to reconcile duplicate payment record',
            {
              paymentId: payment.id,
              reason: duplicatePaymentError?.message ?? 'Duplicate record could not be reloaded',
            },
          );
        }

        if (duplicatePayment.host_id !== authData.user.id) {
          return errorResponse(
            403,
            'payment_belongs_to_other_user',
            'Payment does not belong to the current user',
            {
              paymentId: payment.id,
              hostId: authData.user.id,
            },
          );
        }
      }
    }

    const normalizedStatus = normalizePaymentStatus(payment.status);
    const { data: updated, error: updateError } = await serviceClient.rpc('update_payment_status', {
      p_moyasar_payment_id: payment.id,
      p_status: normalizedStatus,
      p_payment_method: payment.source?.type ?? null,
      p_card_company: payment.source?.company ?? null,
      p_card_last_four: payment.source?.number?.slice(-4) ?? null,
      p_moyasar_reference: payment.source?.reference_number ?? payment.id,
      p_moyasar_gateway_id: payment.source?.gateway_id ?? null,
      p_failure_reason: payment.source?.message ?? null,
    });

    if (updateError || !updated) {
      return errorResponse(
        500,
        'payment_status_update_failed',
        'Failed to update payment status',
        {
          paymentId: payment.id,
          reason: updateError?.message ?? 'Update RPC returned no row',
        },
      );
    }

    if (normalizedStatus === 'paid') {
      return jsonResponse(200, {
        success: true,
        code: null,
        payment,
        message: buildMessage(normalizedStatus),
      });
    }

    return jsonResponse(200, {
      success: false,
      code: null,
      payment,
      message: buildMessage(normalizedStatus),
    });
  } catch (error) {
    console.error('confirm-payment-callback error:', error);
    return errorResponse(
      500,
      'callback_request_failed',
      error instanceof Error ? error.message : 'Unknown error',
      {
        reason: error instanceof Error ? error.stack ?? error.message : String(error),
      },
    );
  }
});

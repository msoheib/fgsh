import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type PaymentPlanId = 'basic' | 'premium' | 'lifetime';

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

const PLAN_AMOUNTS: Record<PaymentPlanId, number> = {
  basic: 2900,
  premium: 4900,
  lifetime: 9900,
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const moyasarSecretKey = Deno.env.get('MOYASAR_SECRET_KEY')!;
    const allowTestPayments = Deno.env.get('ALLOW_TEST_PAYMENTS') === 'true';

    if (!supabaseAnonKey) {
      throw new Error('SUPABASE_ANON_KEY is not configured');
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: req.headers.get('Authorization') ?? '',
        },
      },
    });
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || !authData.user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { paymentId, plan } = await req.json() as { paymentId?: string; plan?: string | null };
    if (!paymentId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Payment ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: profile } = await serviceClient
      .from('host_profiles')
      .select('is_banned')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (profile?.is_banned) {
      return new Response(
        JSON.stringify({ success: false, error: 'Banned users cannot confirm payments' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let payment: MoyasarPayment;
    if (allowTestPayments && paymentId.startsWith('test_')) {
      const normalizedPlan = normalizePlanId(plan, undefined);
      if (!normalizedPlan) {
        return new Response(
          JSON.stringify({ success: false, error: 'Valid plan is required for test payment confirmation' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
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
      payment = await fetchVerifiedPayment(paymentId, moyasarSecretKey);
    }

    const normalizedPlan = normalizePlanId(plan, payment.amount);
    if (!normalizedPlan) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unable to resolve payment plan' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: existingPayment } = await serviceClient
      .from('payments')
      .select('id, host_id')
      .eq('moyasar_payment_id', payment.id)
      .maybeSingle();

    if (existingPayment && existingPayment.host_id !== authData.user.id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Payment does not belong to the current user' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
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
        throw insertError;
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
      throw updateError || new Error('Failed to update payment status');
    }

    return new Response(
      JSON.stringify({
        success: normalizedStatus === 'paid',
        payment,
        message: buildMessage(normalizedStatus),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('confirm-payment-callback error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

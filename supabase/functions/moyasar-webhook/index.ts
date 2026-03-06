import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type MoyasarWebhookPayload = {
  type?: string;
  data?: {
    id?: string;
    status?: string;
    amount?: number;
    currency?: string;
    description?: string;
    created_at?: string;
    updated_at?: string;
    callback_url?: string;
    source?: {
      type?: string;
      company?: string;
      number?: string;
      gateway_id?: string;
      reference_number?: string;
      message?: string;
    };
    metadata?: {
      user_id?: string;
      plan_id?: string;
    };
  };
};

type VerifiedPayment = {
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

function normalizePaymentStatus(status: string): string {
  const normalized = status.trim().toLowerCase();
  return normalized === 'captured' ? 'paid' : normalized;
}

async function fetchVerifiedPayment(paymentId: string, moyasarSecretKey: string): Promise<VerifiedPayment> {
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

  return await response.json() as VerifiedPayment;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const moyasarSecretKey = Deno.env.get('MOYASAR_SECRET_KEY')!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const payload = await req.json() as MoyasarWebhookPayload;
    const paymentId = payload.data?.id;

    if (!paymentId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Payment ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const payment = await fetchVerifiedPayment(paymentId, moyasarSecretKey);
    const normalizedStatus = normalizePaymentStatus(payment.status);

    const { data: existingPayment } = await serviceClient
      .from('payments')
      .select('id')
      .eq('moyasar_payment_id', payment.id)
      .maybeSingle();

    if (!existingPayment) {
      const hostId = payload.data?.metadata?.user_id ?? null;
      const planId = payload.data?.metadata?.plan_id ?? null;

      if (hostId && planId) {
        const { error: insertError } = await serviceClient
          .from('payments')
          .insert({
            moyasar_payment_id: payment.id,
            host_id: hostId,
            plan_id: planId,
            amount: payment.amount,
            currency: payment.currency || 'SAR',
            status: 'initiated',
            description: payment.description || `Subscription: ${planId}`,
            created_at: payment.created_at || new Date().toISOString(),
          });

        if (insertError) {
          throw insertError;
        }
      }
    }

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
        success: true,
        payment_id: payment.id,
        status: normalizedStatus,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('moyasar-webhook error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

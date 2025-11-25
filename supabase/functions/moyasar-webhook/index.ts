// Supabase Edge Function: Moyasar Webhook Handler
// Handles payment status updates from Moyasar
// Documentation: https://docs.moyasar.com/guides/webhooks/

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MoyasarWebhookPayload {
  type: 'payment_paid' | 'payment_failed' | 'payment_refunded';
  data: {
    id: string; // Payment ID (e.g., pay_xxx)
    status: 'paid' | 'failed' | 'refunded' | 'authorized' | 'captured';
    amount: number; // Amount in halalas
    currency: string;
    description: string;
    created_at: string;
    updated_at: string;
    callback_url: string;
    source?: {
      type: string;
      company: string; // visa, mastercard, mada
      name: string;
      number: string; // Last 4 digits
      gateway_id: string;
      reference_number: string;
      message?: string;
    };
    metadata?: {
      plan_id?: string;
      user_id?: string;
    };
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse webhook payload
    const payload: MoyasarWebhookPayload = await req.json();

    console.log('Received Moyasar webhook:', {
      type: payload.type,
      paymentId: payload.data.id,
      status: payload.data.status,
      amount: payload.data.amount,
    });

    // Verify webhook authenticity (optional - Moyasar doesn't have webhook signatures)
    // You can verify by checking the payment ID exists in your database
    // and fetching the payment details from Moyasar API for confirmation

    const paymentData = payload.data;

    // Determine the status to save
    let status: string;
    switch (payload.type) {
      case 'payment_paid':
        status = 'paid';
        break;
      case 'payment_failed':
        status = 'failed';
        break;
      case 'payment_refunded':
        status = 'refunded';
        break;
      default:
        status = paymentData.status;
    }

    // Extract card details if available
    const cardCompany = paymentData.source?.company || null;
    const cardLastFour = paymentData.source?.number?.slice(-4) || null;
    const referenceNumber = paymentData.source?.reference_number || null;
    const gatewayId = paymentData.source?.gateway_id || null;
    const failureReason = paymentData.source?.message || null;
    const paymentMethod = paymentData.source?.type || 'creditcard';

    // Update payment status in database
    const { data: updateResult, error: updateError } = await supabase.rpc(
      'update_payment_status',
      {
        p_moyasar_payment_id: paymentData.id,
        p_status: status,
        p_payment_method: paymentMethod,
        p_card_company: cardCompany,
        p_card_last_four: cardLastFour,
        p_moyasar_reference: referenceNumber,
        p_moyasar_gateway_id: gatewayId,
        p_failure_reason: failureReason,
      }
    );

    if (updateError) {
      console.error('Error updating payment:', updateError);
      throw updateError;
    }

    console.log('Payment updated successfully:', {
      paymentId: paymentData.id,
      status: status,
      updated: updateResult,
    });

    // If payment is successful, trigger will automatically update host_profiles
    if (status === 'paid') {
      console.log('Payment successful! Host profile will be updated automatically.');
    }

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Webhook processed successfully',
        payment_id: paymentData.id,
        status: status,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Webhook processing error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

/*
 * DEPLOYMENT INSTRUCTIONS:
 *
 * 1. Deploy this edge function:
 *    supabase functions deploy moyasar-webhook
 *
 * 2. Get the function URL:
 *    https://<your-project-ref>.supabase.co/functions/v1/moyasar-webhook
 *
 * 3. Add this URL to Moyasar Dashboard → Settings → Webhooks:
 *    - Webhook URL: <your-function-url>
 *    - Events: Select "payment.paid", "payment.failed", "payment.refunded"
 *
 * 4. Test with Moyasar test cards:
 *    - Successful: 4111 1111 1111 1111 (any CVV, future expiry)
 *    - Failed: 4000 0000 0000 0002
 *
 * 5. Monitor logs:
 *    supabase functions logs moyasar-webhook
 *
 * ENVIRONMENT VARIABLES (set in Supabase dashboard):
 * - SUPABASE_URL (auto-set)
 * - SUPABASE_SERVICE_ROLE_KEY (auto-set)
 * - MOYASAR_SECRET_KEY (optional, for verification)
 */

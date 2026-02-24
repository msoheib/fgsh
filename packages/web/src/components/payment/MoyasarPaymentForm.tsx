import React, { useEffect, useRef, useState } from 'react';
import { MOYASAR_CONFIG, PaymentService, type PaymentPlanId } from '@fgsh/shared';
import { LoadingSpinner } from '../LoadingSpinner';

// Moyasar types
declare global {
  interface Window {
    Moyasar?: {
      init: (config: MoyasarConfig) => void;
    };
  }
}

interface MoyasarConfig {
  element: string;
  amount: number;
  currency: string;
  description: string;
  publishable_api_key: string;
  callback_url: string;
  methods: string[];
  supported_networks?: string[];
  on_completed?: (payment: any) => Promise<void>;
  on_error?: (error: any) => void;
}

interface MoyasarPaymentFormProps {
  planId: PaymentPlanId;
  onPaymentInitiated?: (paymentId: string) => void;
  onPaymentCompleted?: (payment: any) => void;
  onError?: (error: string) => void;
}

export const MoyasarPaymentForm: React.FC<MoyasarPaymentFormProps> = ({
  planId,
  onPaymentInitiated,
  onPaymentCompleted,
  onError,
}) => {
  const formRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  const plan = MOYASAR_CONFIG.PLANS[planId];
  const publishableKey = import.meta.env.VITE_MOYASAR_PUBLISHABLE_KEY;

  // Load Moyasar script
  useEffect(() => {
    if (scriptLoaded || !publishableKey) return;

    const script = document.createElement('script');
    script.src = 'https://cdn.moyasar.com/mpf/1.14.0/moyasar.js';
    script.async = true;

    script.onload = () => {
      setScriptLoaded(true);
      setIsLoading(false);
    };

    script.onerror = () => {
      setError('فشل تحميل نظام الدفع. يرجى المحاولة لاحقاً.');
      setIsLoading(false);
      onError?.('Failed to load Moyasar script');
    };

    document.head.appendChild(script);

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, [publishableKey, scriptLoaded, onError]);

  // Initialize Moyasar form
  useEffect(() => {
    if (!scriptLoaded || !window.Moyasar || !formRef.current || !publishableKey) return;

    try {
      window.Moyasar.init({
        element: '.moyasar-payment-form',
        amount: plan.priceHalalas,
        currency: MOYASAR_CONFIG.CURRENCY,
        description: `${plan.nameAr} - fgsh Game`,
        publishable_api_key: publishableKey,
        callback_url: MOYASAR_CONFIG.getCallbackUrl(planId),
        methods: ['creditcard'] as string[],
        supported_networks: ['visa', 'mastercard', 'mada'] as string[],
        on_completed: async (payment) => {
          console.log('Payment completed:', payment);

          // Create payment row early when possible to simplify callback reconciliation.
          if (payment?.id) {
            try {
              await PaymentService.createPaymentRecord(payment.id, planId);
            } catch (createError: any) {
              const code = createError?.code;
              const message = String(createError?.message || '');
              if (code !== '23505' && !message.toLowerCase().includes('duplicate key')) {
                console.warn('Failed to create payment record before callback:', createError);
              }
            }
          }

          // Notify parent component
          onPaymentInitiated?.(payment.id);
          onPaymentCompleted?.(payment);

          // Note: Actual payment confirmation happens via webhook
          // The callback_url will be called by Moyasar after 3D Secure
        },
        on_error: (error) => {
          console.error('Payment error:', error);
          setError('حدث خطأ أثناء معالجة الدفع');
          onError?.(error.message || 'Payment failed');
        },
      });
    } catch (err: any) {
      console.error('Failed to initialize Moyasar:', err);
      setError('فشل تهيئة نظام الدفع');
      onError?.(err.message || 'Failed to initialize payment form');
    }
  }, [scriptLoaded, plan, planId, publishableKey, onPaymentInitiated, onPaymentCompleted, onError]);

  if (!publishableKey) {
    return (
      <div className="text-center p-4 bg-red-500/20 border border-red-500/50 rounded-2xl">
        <p className="text-red-400">
          ⚠️ لم يتم تكوين مفتاح الدفع. يرجى الاتصال بالدعم.
        </p>
        <p className="text-xs text-red-300 mt-2">
          VITE_MOYASAR_PUBLISHABLE_KEY not configured
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-4 bg-red-500/20 border border-red-500/50 rounded-2xl">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="text-center p-8">
        <LoadingSpinner size="md" />
        <p className="text-sm text-white/60 mt-4">جاري تحميل نموذج الدفع...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Inject custom styles for Moyasar form to fix contrast issues */}
      <style>{`
        .moyasar-payment-form {
          direction: ltr;
          text-align: left;
        }
        /* Force all text inside the form to be dark gray/black */
        .moyasar-payment-form * {
          color: #1f2937 !important; /* gray-900 */
          font-family: system-ui, -apple-system, sans-serif !important;
        }
        /* Fix Labels */
        .moyasar-payment-form label {
          color: #374151 !important; /* gray-700 */
          font-weight: 600 !important;
          margin-bottom: 0.5rem !important;
          display: block !important;
        }
        /* Fix Inputs */
        .moyasar-payment-form input {
          color: #1f2937 !important; /* Dark text for input */
          background-color: #ffffff !important;
          border: 1px solid #d1d5db !important;
          border-radius: 0.5rem !important;
          padding: 0.75rem !important;
          width: 100% !important;
        }
        /* Fix Placeholders */
        .moyasar-payment-form input::placeholder {
          color: #9ca3af !important; /* gray-400 */
          opacity: 1 !important;
        }
        /* Fix Input Focus */
        .moyasar-payment-form input:focus {
          border-color: #8b5cf6 !important; /* violet-500 */
          outline: 2px solid #8b5cf6 !important;
          outline-offset: 1px !important;
        }
        /* Fix Pay Button */
        .moyasar-payment-form button {
          background: linear-gradient(to right, #8b5cf6, #ec4899) !important;
          color: #ffffff !important;
          border: none !important;
          padding: 12px 24px !important;
          border-radius: 9999px !important;
          font-weight: bold !important;
          width: 100% !important;
          margin-top: 16px !important;
          cursor: pointer !important;
        }
        /* Error messages */
        .moyasar-payment-form .mysr-form-error {
          color: #ef4444 !important; /* red-500 */
          font-size: 0.875rem !important;
          margin-top: 0.25rem !important;
        }
      `}</style>

      {/* Moyasar form container with light background for visibility */}
      <div
        className="bg-white rounded-2xl p-6 shadow-lg"
        style={{
          direction: 'ltr', // Moyasar form is LTR
        }}
      >
        <div
          ref={formRef}
          className="moyasar-payment-form"
        />
      </div>

      {/* Loading indicator for Moyasar's internal processing */}
      <div id="moyasar-spinner" style={{ display: 'none' }}>
        <LoadingSpinner size="sm" />
      </div>

      {/* Payment info */}
      <div className="mt-4 p-3 bg-white/5 rounded-xl text-sm">
        <p className="text-white/80 mb-2">
          💳 نقبل: Visa, Mastercard, Mada
        </p>
        <p className="text-white/60 text-xs">
          🔒 الدفع آمن ومشفر بالكامل
        </p>
      </div>

      {/* Test cards info (only in development) */}
      {import.meta.env.DEV && (
        <div className="mt-3 p-3 bg-secondary-main/10 border border-secondary-main/30 rounded-xl text-xs">
          <p className="font-semibold text-secondary-main mb-2">🧪 بطاقات اختبار:</p>
          <p className="text-white/70">✅ نجاح: 4111 1111 1111 1111</p>
          <p className="text-white/70">❌ فشل: 4000 0000 0000 0002</p>
          <p className="text-white/70 mt-1">CVV: أي رقم | انتهاء: أي تاريخ مستقبلي</p>
        </div>
      )}
    </div>
  );
};

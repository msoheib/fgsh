/**
 * Moyasar Payment Gateway Configuration
 * Documentation: https://docs.moyasar.com/
 */

export const MOYASAR_CONFIG = {
  // API Keys (set in .env files)
  // VITE_MOYASAR_PUBLISHABLE_KEY for frontend
  // MOYASAR_SECRET_KEY for backend/webhooks

  // Payment Configuration
  CURRENCY: 'SAR' as const, // Saudi Riyal
  SUPPORTED_NETWORKS: ['visa', 'mastercard', 'mada'] as const,
  METHODS: ['creditcard'] as const,

  // Minimum payment amount (in smallest currency unit - halalas for SAR)
  MIN_AMOUNT: 100, // 1 SAR = 100 halalas

  // Payment Plans (amounts in SAR, stored as halalas in Moyasar)
  PLANS: {
    BASIC: {
      id: 'basic',
      name: 'Basic Plan',
      nameAr: 'الباقة الأساسية',
      description: 'Create unlimited games, host up to 10 players',
      descriptionAr: 'إنشاء ألعاب غير محدودة، استضافة حتى 10 لاعبين',
      price: 49, // 49 SAR
      priceHalalas: 4900, // Moyasar uses smallest unit
      features: [
        'Unlimited games',
        'Up to 10 players per game',
        'Basic support',
        '30 days validity',
      ],
      featuresAr: [
        'ألعاب غير محدودة',
        'حتى 10 لاعبين في اللعبة',
        'دعم أساسي',
        'صلاحية 30 يوماً',
      ],
      duration: 30, // days
      tier: 'basic' as const,
    },
    PREMIUM: {
      id: 'premium',
      name: 'Premium Plan',
      nameAr: 'الباقة المميزة',
      description: 'Everything in Basic + Custom branding, Priority support',
      descriptionAr: 'كل مميزات الباقة الأساسية + علامة تجارية مخصصة، دعم أولوية',
      price: 99, // 99 SAR
      priceHalalas: 9900,
      features: [
        'Everything in Basic',
        'Custom branding',
        'Priority support',
        'Advanced analytics',
        '90 days validity',
      ],
      featuresAr: [
        'كل مميزات الباقة الأساسية',
        'علامة تجارية مخصصة',
        'دعم أولوية',
        'تحليلات متقدمة',
        'صلاحية 90 يوماً',
      ],
      duration: 90, // days
      tier: 'premium' as const,
    },
    LIFETIME: {
      id: 'lifetime',
      name: 'Lifetime Access',
      nameAr: 'الوصول الدائم',
      description: 'One-time payment, lifetime access',
      descriptionAr: 'دفعة واحدة، وصول دائم',
      price: 299, // 299 SAR
      priceHalalas: 29900,
      features: [
        'Lifetime access',
        'All premium features',
        'Priority support forever',
        'Free updates',
      ],
      featuresAr: [
        'وصول دائم',
        'جميع المميزات المتقدمة',
        'دعم أولوية للأبد',
        'تحديثات مجانية',
      ],
      duration: null, // lifetime
      tier: 'premium' as const,
    },
  },

  // Callback URLs (will be set at runtime based on environment)
  getCallbackUrl: (planId: string): string => {
    const baseUrl = typeof window !== 'undefined'
      ? window.location.origin
      : process.env.VITE_APP_URL || 'http://localhost:5173';
    return `${baseUrl}/payment/callback?plan=${planId}`;
  },

  // API Endpoints
  API: {
    CREATE_PAYMENT: 'https://api.moyasar.com/v1/payments',
    GET_PAYMENT: (id: string) => `https://api.moyasar.com/v1/payments/${id}`,
  },
} as const;

// Type definitions
export type PaymentPlanId = keyof typeof MOYASAR_CONFIG.PLANS;
export type PaymentTier = 'free' | 'basic' | 'premium';
export type PaymentStatus = 'initiated' | 'paid' | 'failed' | 'refunded';

export interface MoyasarPayment {
  id: string;
  status: 'initiated' | 'paid' | 'failed' | 'authorized' | 'captured' | 'refunded';
  amount: number; // in halalas
  currency: string;
  description: string;
  created_at: string;
  updated_at: string;
  callback_url: string;
  source?: {
    type: string;
    company: string;
    name: string;
    number: string;
    gateway_id: string;
    reference_number: string;
    token?: string;
    message?: string;
  };
}

export interface PaymentMetadata {
  plan_id: PaymentPlanId;
  user_id: string;
  user_email?: string;
}

// Helper functions
export const formatPrice = (halalas: number): string => {
  const sar = halalas / 100;
  return `${sar.toFixed(2)} ريال`;
};

export const getPlanById = (planId: PaymentPlanId) => {
  return MOYASAR_CONFIG.PLANS[planId];
};

export const calculateExpiryDate = (duration: number | null): Date | null => {
  if (duration === null) return null; // lifetime
  const now = new Date();
  now.setDate(now.getDate() + duration);
  return now;
};

import React, { useState } from 'react';
import { type PaymentPlanId } from '@fakash/shared';
import { GlassCard } from '../GlassCard';
import { GradientButton } from '../GradientButton';
import { PricingPlans } from './PlanCard';
import { MoyasarPaymentForm } from './MoyasarPaymentForm';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTier?: string;
}

type ModalStep = 'select-plan' | 'payment';

export const UpgradeModal: React.FC<UpgradeModalProps> = ({
  isOpen,
  onClose,
  currentTier,
}) => {
  const [step, setStep] = useState<ModalStep>('select-plan');
  const [selectedPlan, setSelectedPlan] = useState<PaymentPlanId | null>(null);

  const handleSelectPlan = (planId: PaymentPlanId) => {
    setSelectedPlan(planId);
    setStep('payment');
  };

  const handleBackToPlans = () => {
    setStep('select-plan');
    setSelectedPlan(null);
  };

  const handlePaymentCompleted = (payment: any) => {
    console.log('Payment completed:', payment);
    // Moyasar will redirect to callback URL
    // Backend webhook will update the database
  };

  const handlePaymentError = (error: string) => {
    console.error('Payment error:', error);
    alert('حدث خطأ أثناء معالجة الدفع. يرجى المحاولة مرة أخرى.');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        <GlassCard className="relative">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 left-4 w-10 h-10 rounded-full glass hover:bg-white/20 transition-all flex items-center justify-center text-2xl"
            aria-label="Close"
          >
            ×
          </button>

          {/* Header */}
          <div className="text-center mb-8">
            <h2 className="text-3xl sm:text-4xl font-bold mb-3">
              {step === 'select-plan' ? 'اختر الباقة المناسبة' : 'إتمام الدفع'}
            </h2>
            <p className="text-white/70 text-sm sm:text-base">
              {step === 'select-plan'
                ? 'ابدأ في إنشاء ألعاب غير محدودة واستمتع بمميزات حصرية'
                : 'أدخل بيانات بطاقتك لإتمام عملية الدفع'}
            </p>
          </div>

          {/* Content */}
          {step === 'select-plan' ? (
            <PricingPlans onSelectPlan={handleSelectPlan} currentTier={currentTier} />
          ) : (
            <div className="max-w-2xl mx-auto">
              {/* Back button */}
              <button
                onClick={handleBackToPlans}
                className="mb-6 flex items-center gap-2 text-secondary-main hover:text-secondary-light transition-colors"
              >
                <span>←</span>
                <span>العودة لاختيار الباقة</span>
              </button>

              {/* Payment form */}
              {selectedPlan && (
                <MoyasarPaymentForm
                  planId={selectedPlan}
                  onPaymentCompleted={handlePaymentCompleted}
                  onError={handlePaymentError}
                />
              )}

              {/* Security notice */}
              <div className="mt-6 p-4 bg-white/5 rounded-2xl text-center text-sm text-white/70">
                <p className="mb-2">🔒 معلوماتك آمنة</p>
                <p className="text-xs">
                  جميع المدفوعات محمية بتشفير SSL ومعالجة عبر Moyasar المرخص من البنك المركزي السعودي
                </p>
              </div>
            </div>
          )}

          {/* FAQ */}
          {step === 'select-plan' && (
            <div className="mt-12 pt-8 border-t border-white/10">
              <h3 className="text-xl font-bold text-center mb-6">الأسئلة الشائعة</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
                <div className="glass rounded-2xl p-4">
                  <p className="font-semibold mb-2">❓ هل يمكنني الإلغاء في أي وقت؟</p>
                  <p className="text-sm text-white/70">
                    نعم، يمكنك إلغاء اشتراكك في أي وقت. الباقة ستبقى فعالة حتى نهاية المدة المدفوعة.
                  </p>
                </div>
                <div className="glass rounded-2xl p-4">
                  <p className="font-semibold mb-2">💳 ما هي طرق الدفع المقبولة؟</p>
                  <p className="text-sm text-white/70">
                    نقبل جميع البطاقات الائتمانية: Visa, Mastercard, Mada
                  </p>
                </div>
                <div className="glass rounded-2xl p-4">
                  <p className="font-semibold mb-2">🔄 هل يمكنني الترقية لاحقاً؟</p>
                  <p className="text-sm text-white/70">
                    نعم، يمكنك الترقية من الباقة الأساسية إلى المميزة في أي وقت.
                  </p>
                </div>
                <div className="glass rounded-2xl p-4">
                  <p className="font-semibold mb-2">📧 هل سأحصل على فاتورة؟</p>
                  <p className="text-sm text-white/70">
                    نعم، سنرسل فاتورة إلكترونية إلى بريدك الإلكتروني بعد كل دفعة.
                  </p>
                </div>
              </div>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
};

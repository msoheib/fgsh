import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PaymentService, useAuthStore } from '@fakash/shared';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { LoadingSpinner } from '../components/LoadingSpinner';

type PaymentStatus = 'loading' | 'success' | 'failed' | 'error';

export const PaymentCallback: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { checkSession } = useAuthStore();
  const [status, setStatus] = useState<PaymentStatus>('loading');
  const [message, setMessage] = useState('');
  const verificationAttempted = useRef(false);

  useEffect(() => {
    const paymentId = searchParams.get('id');
    const planId = searchParams.get('plan');

    if (!paymentId) {
      setStatus('error');
      setMessage('معرف الدفع مفقود');
      return;
    }

    // 1. Check if we already verified this payment in this session
    // This prevents the loop if the component remounts due to auth state changes
    const verificationKey = `verified_${paymentId}`;
    if (sessionStorage.getItem(verificationKey)) {
      console.log('[PaymentCallback] Payment already verified in this session, skipping...');
      setStatus('success');
      setMessage('تم الدفع بنجاح! تم تفعيل حسابك.');
      return;
    }

    // 2. Prevent double-fire in React Strict Mode (same component instance)
    if (verificationAttempted.current) {
      return;
    }
    verificationAttempted.current = true;

    handlePaymentVerification(paymentId);
  }, [searchParams]);

  const handlePaymentVerification = async (paymentId: string) => {
    try {
      const result = await PaymentService.handlePaymentCallback(paymentId);

      if (result.success) {
        // 3. Mark as verified in sessionStorage so we don't loop on remount
        sessionStorage.setItem(`verified_${paymentId}`, 'true');

        // Payment successful - refresh auth session to get updated profile
        await checkSession();

        setStatus('success');
        setMessage(result.message);
      } else {
        setStatus('failed');
        setMessage(result.message);
      }
    } catch (error: any) {
      console.error('Payment verification error:', error);
      setStatus('error');
      setMessage('حدث خطأ أثناء التحقق من الدفع');
    }
  };

  const handleContinue = () => {
    if (status === 'success') {
      // Redirect to host dashboard or create game page
      navigate('/create');
    } else {
      // Go back to upgrade page to try again
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <GlassCard className="max-w-2xl w-full text-center">
        {status === 'loading' && (
          <>
            <LoadingSpinner size="lg" />
            <p className="text-xl mt-6">جاري التحقق من الدفع...</p>
            <p className="text-sm text-white/60 mt-2">
              يرجى الانتظار، لا تغلق هذه الصفحة
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="text-6xl mb-6">✅</div>
            <h2 className="text-3xl font-bold mb-4 text-secondary-main">
              تم الدفع بنجاح!
            </h2>
            <p className="text-lg mb-8">{message}</p>
            <p className="text-white/70 mb-8">
              تم تفعيل حسابك بنجاح. يمكنك الآن إنشاء ألعاب غير محدودة!
            </p>
            <GradientButton
              variant="cyan"
              onClick={handleContinue}
              className="w-full sm:w-auto"
            >
              ابدأ في إنشاء لعبة
            </GradientButton>
          </>
        )}

        {status === 'failed' && (
          <>
            <div className="text-6xl mb-6">❌</div>
            <h2 className="text-3xl font-bold mb-4 text-red-400">
              فشلت عملية الدفع
            </h2>
            <p className="text-lg mb-8">{message}</p>
            <p className="text-white/70 mb-8">
              لم يتم خصم أي مبلغ من حسابك. يرجى المحاولة مرة أخرى.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <GradientButton
                variant="purple"
                onClick={() => navigate('/')}
                className="w-full sm:w-auto"
              >
                العودة للصفحة الرئيسية
              </GradientButton>
              <GradientButton
                variant="cyan"
                onClick={handleContinue}
                className="w-full sm:w-auto"
              >
                حاول مرة أخرى
              </GradientButton>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="text-6xl mb-6">⚠️</div>
            <h2 className="text-3xl font-bold mb-4 text-red-400">
              حدث خطأ
            </h2>
            <p className="text-lg mb-8">{message}</p>
            <p className="text-white/70 mb-8">
              إذا تم خصم المبلغ من حسابك، سيتم التفعيل تلقائياً خلال دقائق.
              <br />
              إذا استمرت المشكلة، يرجى التواصل مع الدعم الفني.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <GradientButton
                variant="purple"
                onClick={() => navigate('/')}
                className="w-full sm:w-auto"
              >
                العودة للصفحة الرئيسية
              </GradientButton>
              <GradientButton
                variant="cyan"
                onClick={() => window.location.reload()}
                className="w-full sm:w-auto"
              >
                إعادة المحاولة
              </GradientButton>
            </div>
          </>
        )}

        {/* Support link */}
        <div className="mt-8 pt-6 border-t border-white/10">
          <p className="text-sm text-white/60">
            هل تحتاج إلى مساعدة؟{' '}
            <a href="mailto:support@fakash.com" className="text-secondary-main hover:underline">
              اتصل بالدعم الفني
            </a>
          </p>
        </div>
      </GlassCard>
    </div>
  );
};

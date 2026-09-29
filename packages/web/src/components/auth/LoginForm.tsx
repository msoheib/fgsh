import React, { useState } from 'react';
import { useAuthStore } from '@fakash/shared';
import { GradientButton } from '../GradientButton';
import { LoadingSpinner } from '../LoadingSpinner';

interface LoginFormProps {
  onSuccess?: () => void;
  onSwitchToSignUp?: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSuccess, onSwitchToSignUp }) => {
  const { signIn, requestPasswordReset, loading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [validationError, setValidationError] = useState('');
  const [mode, setMode] = useState<'login' | 'reset'>('login');
  const [resetSending, setResetSending] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState('');

  const switchMode = (next: 'login' | 'reset') => {
    setMode(next);
    setValidationError('');
    setResetError('');
    setResetSent(false);
    clearError();
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');

    if (!email || !email.includes('@')) {
      setResetError('يرجى إدخال بريد إلكتروني صالح');
      return;
    }

    setResetSending(true);
    const { error } = await requestPasswordReset(email, `${window.location.origin}/reset-password`);
    setResetSending(false);

    if (error) {
      const rateLimited = error.status === 429 || error.message?.toLowerCase().includes('rate limit');
      setResetError(
        rateLimited
          ? 'تم إرسال طلبات كثيرة. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.'
          : 'حدث خطأ أثناء إرسال الرابط. يرجى المحاولة مرة أخرى.'
      );
      return;
    }

    // Supabase returns success for unknown emails too, so this doesn't leak which accounts exist
    setResetSent(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');
    clearError();

    // Validation
    if (!email || !password) {
      setValidationError('يرجى ملء جميع الحقول');
      return;
    }

    if (!email.includes('@')) {
      setValidationError('يرجى إدخال بريد إلكتروني صالح');
      return;
    }

    // Sign in
    const { error } = await signIn(email, password);

    if (!error) {
      onSuccess?.();
    }
  };

  const getErrorMessage = (error: any): string => {
    if (error?.message?.includes('Invalid login credentials')) {
      return 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
    }
    if (error?.message?.includes('Email not confirmed')) {
      return 'يرجى تأكيد بريدك الإلكتروني أولاً';
    }
    return 'حدث خطأ أثناء تسجيل الدخول. يرجى المحاولة مرة أخرى.';
  };

  if (mode === 'reset') {
    return (
      <form onSubmit={handleResetSubmit} className="space-y-4">
        <p className="text-sm text-white/70">
          أدخل بريدك الإلكتروني وسنرسل لك رابطاً لإعادة تعيين كلمة المرور.
        </p>

        <div>
          <label htmlFor="reset-email" className="block text-sm font-medium mb-2">
            البريد الإلكتروني
          </label>
          <input
            id="reset-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg
                     text-white placeholder-white/50 focus:outline-none focus:ring-2
                     focus:ring-secondary-main focus:border-transparent
                     transition-all duration-200"
            placeholder="host@example.com"
            disabled={resetSending || resetSent}
            dir="ltr"
          />
        </div>

        {resetError && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-sm">
            {resetError}
          </div>
        )}

        {resetSent ? (
          <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-3 text-sm">
            تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني. يرجى التحقق من صندوق الوارد.
          </div>
        ) : (
          <GradientButton
            type="submit"
            variant="cyan"
            className="w-full"
            disabled={resetSending}
          >
            {resetSending ? (
              <div className="flex items-center justify-center gap-2">
                <LoadingSpinner size="sm" />
                <span>جارٍ الإرسال...</span>
              </div>
            ) : (
              'إرسال رابط إعادة التعيين'
            )}
          </GradientButton>
        )}

        <div className="text-center text-sm">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className="text-secondary-main hover:underline font-medium"
            disabled={resetSending}
          >
            العودة لتسجيل الدخول
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-2">
          البريد الإلكتروني
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg
                   text-white placeholder-white/50 focus:outline-none focus:ring-2
                   focus:ring-secondary-main focus:border-transparent
                   transition-all duration-200"
          placeholder="host@example.com"
          disabled={loading}
          dir="ltr"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-2">
          كلمة المرور
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg
                   text-white placeholder-white/50 focus:outline-none focus:ring-2
                   focus:ring-secondary-main focus:border-transparent
                   transition-all duration-200"
          placeholder="••••••••"
          disabled={loading}
          dir="ltr"
        />
        <div className="mt-2 text-sm">
          <button
            type="button"
            onClick={() => switchMode('reset')}
            className="text-secondary-main hover:underline"
            disabled={loading}
          >
            نسيت كلمة المرور؟
          </button>
        </div>
      </div>

      {(validationError || error) && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-sm">
          {validationError || getErrorMessage(error)}
        </div>
      )}

      <GradientButton
        type="submit"
        variant="cyan"
        className="w-full"
        disabled={loading}
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2">
            <LoadingSpinner size="sm" />
            <span>جارٍ تسجيل الدخول...</span>
          </div>
        ) : (
          'تسجيل الدخول'
        )}
      </GradientButton>

      {onSwitchToSignUp && (
        <div className="text-center text-sm">
          <span className="text-white/60">ليس لديك حساب؟ </span>
          <button
            type="button"
            onClick={onSwitchToSignUp}
            className="text-secondary-main hover:underline font-medium"
            disabled={loading}
          >
            إنشاء حساب جديد
          </button>
        </div>
      )}
    </form>
  );
};

import React, { useState } from 'react';
import { useAuthStore } from '@fakash/shared';
import { GradientButton } from '../GradientButton';
import { LoadingSpinner } from '../LoadingSpinner';

interface SignUpFormProps {
  onSuccess?: () => void;
  onSwitchToLogin?: () => void;
}

export const SignUpForm: React.FC<SignUpFormProps> = ({ onSuccess, onSwitchToLogin }) => {
  const { signUp, loading, error, clearError } = useAuthStore();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');
    clearError();

    // Validation
    if (!fullName || !email || !password || !confirmPassword) {
      setValidationError('يرجى ملء جميع الحقول');
      return;
    }

    if (!email.includes('@')) {
      setValidationError('يرجى إدخال بريد إلكتروني صالح');
      return;
    }

    if (password.length < 6) {
      setValidationError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }

    if (password !== confirmPassword) {
      setValidationError('كلمة المرور غير متطابقة');
      return;
    }

    // Sign up
    const { error } = await signUp(email, password, fullName);

    if (!error) {
      onSuccess?.();
    }
  };

  const getErrorMessage = (error: any): string => {
    if (error?.message?.includes('already registered')) {
      return 'هذا البريد الإلكتروني مسجل بالفعل';
    }
    if (error?.message?.includes('Password should be')) {
      return 'كلمة المرور ضعيفة. يرجى استخدام كلمة مرور أقوى';
    }
    return 'حدث خطأ أثناء إنشاء الحساب. يرجى المحاولة مرة أخرى.';
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="fullName" className="block text-sm font-medium mb-2">
          الاسم الكامل
        </label>
        <input
          id="fullName"
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg
                   text-white placeholder-white/50 focus:outline-none focus:ring-2
                   focus:ring-secondary-main focus:border-transparent
                   transition-all duration-200"
          placeholder="أحمد محمد"
          disabled={loading}
        />
      </div>

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
        <p className="text-xs text-white/50 mt-1">6 أحرف على الأقل</p>
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2">
          تأكيد كلمة المرور
        </label>
        <input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg
                   text-white placeholder-white/50 focus:outline-none focus:ring-2
                   focus:ring-secondary-main focus:border-transparent
                   transition-all duration-200"
          placeholder="••••••••"
          disabled={loading}
          dir="ltr"
        />
      </div>

      {(validationError || error) && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-sm">
          {validationError || getErrorMessage(error)}
        </div>
      )}

      <GradientButton
        type="submit"
        variant="purple"
        className="w-full"
        disabled={loading}
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2">
            <LoadingSpinner size="sm" />
            <span>جارٍ إنشاء الحساب...</span>
          </div>
        ) : (
          'إنشاء حساب'
        )}
      </GradientButton>

      {onSwitchToLogin && (
        <div className="text-center text-sm">
          <span className="text-white/60">لديك حساب بالفعل؟ </span>
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="text-secondary-main hover:underline font-medium"
            disabled={loading}
          >
            تسجيل الدخول
          </button>
        </div>
      )}
    </form>
  );
};

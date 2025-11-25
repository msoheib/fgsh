import React, { useState } from 'react';
import { GlassCard } from '../GlassCard';
import { LoginForm } from './LoginForm';
import { SignUpForm } from './SignUpForm';

type AuthMode = 'login' | 'signup';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: AuthMode;
  onSuccess?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'login',
  onSuccess
}) => {
  const [mode, setMode] = useState<AuthMode>(initialMode);

  if (!isOpen) return null;

  const handleSuccess = () => {
    onSuccess?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative max-w-md w-full">
        <GlassCard>
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 left-4 text-white/60 hover:text-white transition-colors"
            aria-label="إغلاق"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Header */}
          <div className="text-center mb-6">
            <h2 className="text-2xl sm:text-3xl font-bold mb-2">
              {mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب جديد'}
            </h2>
            <p className="text-white/70 text-sm">
              {mode === 'login'
                ? 'سجل دخولك لإنشاء ألعاب وإدارتها'
                : 'أنشئ حساباً لتصبح مضيفاً وتنشئ ألعاب'
              }
            </p>
          </div>

          {/* Forms */}
          {mode === 'login' ? (
            <LoginForm
              onSuccess={handleSuccess}
              onSwitchToSignUp={() => setMode('signup')}
            />
          ) : (
            <SignUpForm
              onSuccess={handleSuccess}
              onSwitchToLogin={() => setMode('login')}
            />
          )}

          {/* Info note */}
          <div className="mt-6 pt-4 border-t border-white/10">
            <p className="text-xs text-white/50 text-center">
              {mode === 'signup' && 'سيتم إرسال رسالة تأكيد إلى بريدك الإلكتروني'}
              {mode === 'login' && 'اللاعبون لا يحتاجون إلى تسجيل الدخول - فقط المضيفون'}
            </p>
          </div>
        </GlassCard>
      </div>
    </div>
  );
};

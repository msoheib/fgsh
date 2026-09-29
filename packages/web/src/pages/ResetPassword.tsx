import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '@fakash/shared';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Logo } from '../components/Logo';

// Landing page for the Supabase recovery email link. The client's detectSessionInUrl
// turns the link's token into a session, so a signed-in user here can set a new password.
export const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading, updatePassword } = useAuthStore();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (password.length < 6) {
      setFormError('يجب أن تتكون كلمة المرور من 6 أحرف على الأقل');
      return;
    }

    if (password !== confirmPassword) {
      setFormError('كلمتا المرور غير متطابقتين');
      return;
    }

    setSubmitting(true);
    const { error } = await updatePassword(password);
    setSubmitting(false);

    if (error) {
      setFormError(
        error.message?.includes('different from the old password')
          ? 'يجب أن تكون كلمة المرور الجديدة مختلفة عن القديمة'
          : 'حدث خطأ أثناء تغيير كلمة المرور. يرجى المحاولة مرة أخرى.'
      );
      return;
    }

    toast.success('تم تغيير كلمة المرور بنجاح');
    navigate('/', { replace: true });
  };

  const inputClassName = `w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg
                   text-white placeholder-white/50 focus:outline-none focus:ring-2
                   focus:ring-secondary-main focus:border-transparent
                   transition-all duration-200`;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <GlassCard className="w-full max-w-md">
        <div className="flex justify-center mb-4">
          <Logo size="sm" />
        </div>

        {!user ? (
          <>
            <h1 className="text-2xl font-bold text-center mb-3">الرابط غير صالح</h1>
            <p className="text-sm text-white/70 text-center mb-6">
              رابط إعادة تعيين كلمة المرور غير صالح أو منتهي الصلاحية. يرجى طلب رابط جديد من صفحة تسجيل الدخول.
            </p>
            <GradientButton variant="purple" onClick={() => navigate('/')} className="w-full">
              العودة للصفحة الرئيسية
            </GradientButton>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-center mb-6">تعيين كلمة مرور جديدة</h1>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="new-password" className="block text-sm font-medium mb-2">
                  كلمة المرور الجديدة
                </label>
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClassName}
                  placeholder="••••••••"
                  disabled={submitting}
                  dir="ltr"
                />
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium mb-2">
                  تأكيد كلمة المرور
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={inputClassName}
                  placeholder="••••••••"
                  disabled={submitting}
                  dir="ltr"
                />
              </div>

              {formError && (
                <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-sm">
                  {formError}
                </div>
              )}

              <GradientButton type="submit" variant="cyan" className="w-full" disabled={submitting}>
                {submitting ? (
                  <div className="flex items-center justify-center gap-2">
                    <LoadingSpinner size="sm" />
                    <span>جارٍ الحفظ...</span>
                  </div>
                ) : (
                  'حفظ كلمة المرور'
                )}
              </GradientButton>
            </form>
          </>
        )}
      </GlassCard>
    </div>
  );
};

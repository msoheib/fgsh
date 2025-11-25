import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, HostProfileService, PaymentService, type HostProfile } from '@fakash/shared';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Logo } from '../components/Logo';

interface PaymentHistory {
  id: string;
  plan_id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  paid_at: string | null;
}

export const Profile: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading, signOut } = useAuthStore();
  const [profile, setProfile] = useState<HostProfile | null>(null);
  const [payments, setPayments] = useState<PaymentHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/');
      return;
    }

    if (user) {
      loadProfileData();
    }
  }, [user, authLoading]);

  const loadProfileData = async () => {
    setLoading(true);

    try {
      // Load profile
      const profileData = await HostProfileService.getProfile();
      setProfile(profileData);

      // Load payment history
      const paymentHistory = await PaymentService.getPaymentHistory();
      setPayments(paymentHistory?.map(p => ({ ...p, paid_at: p.paid_at ?? null })) || []);
    } catch (error) {
      console.error('Failed to load profile data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const getTierBadge = (tier: string) => {
    const badges = {
      free: { label: 'مجاني', color: 'bg-gray-500' },
      basic: { label: 'أساسي', color: 'bg-blue-500' },
      premium: { label: 'مميز', color: 'bg-purple-500' },
    };
    const badge = badges[tier as keyof typeof badges] || badges.free;
    return (
      <span className={`${badge.color} px-3 py-1 rounded-full text-xs font-bold`}>
        {badge.label}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatAmount = (amount: number, currency: string) => {
    return `${amount / 100} ${currency}`;
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <GlassCard className="max-w-md">
          <p className="text-center text-lg mb-4">يجب تسجيل الدخول لعرض الملف الشخصي</p>
          <GradientButton variant="cyan" onClick={() => navigate('/')} className="w-full">
            العودة للصفحة الرئيسية
          </GradientButton>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        <Logo size="sm" className="mb-6" />

        {/* Profile Info Card */}
        <GlassCard className="mb-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold mb-2">الملف الشخصي</h1>
              <p className="text-white/60">معلومات حسابك واشتراكك</p>
            </div>
            <GradientButton variant="purple" onClick={() => navigate('/')} className="hidden sm:block">
              العودة للصفحة الرئيسية
            </GradientButton>
          </div>

          {/* User Info */}
          <div className="space-y-4 mb-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-secondary-main to-secondary-light flex items-center justify-center text-2xl font-bold">
                {profile.display_name?.slice(0, 2).toUpperCase() || user.email?.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h2 className="text-xl font-bold">{profile.display_name || 'مستخدم'}</h2>
                <p className="text-white/60">{user.email}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-white/10">
              <div>
                <p className="text-sm text-white/60 mb-1">نوع الاشتراك</p>
                <div className="flex items-center gap-2">
                  {getTierBadge(profile.subscription_tier)}
                  {profile.is_paid_host && (
                    <span className="text-xs text-white/60">
                      (فعّال)
                    </span>
                  )}
                </div>
              </div>

              {profile.subscription_expires_at && (
                <div>
                  <p className="text-sm text-white/60 mb-1">تاريخ الانتهاء</p>
                  <p className="font-semibold">
                    {formatDate(profile.subscription_expires_at)}
                  </p>
                </div>
              )}

              <div>
                <p className="text-sm text-white/60 mb-1">عدد الألعاب المنشأة</p>
                <p className="font-semibold text-lg">{profile.games_created_count || 0}</p>
              </div>

              <div>
                <p className="text-sm text-white/60 mb-1">تاريخ الانضمام</p>
                <p className="font-semibold">{formatDate(profile.created_at)}</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-white/10">
            {!profile.is_paid_host && (
              <GradientButton
                variant="cyan"
                onClick={() => navigate('/create')}
                className="flex-1"
              >
                ترقية الحساب
              </GradientButton>
            )}
            <GradientButton
              variant="purple"
              onClick={handleSignOut}
              className="flex-1"
            >
              تسجيل الخروج
            </GradientButton>
          </div>
        </GlassCard>

        {/* Payment History */}
        {payments.length > 0 && (
          <GlassCard>
            <h2 className="text-xl sm:text-2xl font-bold mb-4">سجل المدفوعات</h2>

            <div className="space-y-3">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between p-4 glass rounded-xl"
                >
                  <div>
                    <p className="font-semibold mb-1">
                      {payment.plan_id === 'basic' && 'الباقة الأساسية'}
                      {payment.plan_id === 'premium' && 'الباقة المميزة'}
                      {payment.plan_id === 'lifetime' && 'الوصول الدائم'}
                    </p>
                    <p className="text-sm text-white/60">
                      {formatDate(payment.paid_at || payment.created_at)}
                    </p>
                  </div>

                  <div className="text-left">
                    <p className="font-bold text-lg">
                      {formatAmount(payment.amount, payment.currency)}
                    </p>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        payment.status === 'paid'
                          ? 'bg-green-500/20 text-green-400'
                          : payment.status === 'pending'
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {payment.status === 'paid' && 'مدفوع'}
                      {payment.status === 'pending' && 'قيد المعالجة'}
                      {payment.status === 'failed' && 'فشل'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        )}

        {/* Mobile Back Button */}
        <GradientButton
          variant="purple"
          onClick={() => navigate('/')}
          className="w-full mt-6 sm:hidden"
        >
          العودة للصفحة الرئيسية
        </GradientButton>
      </div>
    </div>
  );
};

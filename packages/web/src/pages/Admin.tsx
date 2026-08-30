import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, AdminService } from '@fakash/shared';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Logo } from '../components/Logo';
import { QuestionManager } from '../components/admin/QuestionManager';
import { UserManager } from '../components/admin/UserManager';
import { AudioCueManager } from '../components/admin/AudioCueManager';
import { LoginForm } from '../components/auth/LoginForm';

type TabType = 'questions' | 'users' | 'audio';

export const Admin: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading, signOut } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabType>('questions');
  const [access, setAccess] = useState<{
    userId: string;
    isAdmin: boolean;
    isAwaitingApproval: boolean;
  } | null>(null);
  const userId = user?.id;

  useEffect(() => {
    setAccess(null);
    if (!userId) {
      return;
    }

    let cancelled = false;
    const checkAdminStatus = async () => {
      try {
        const isAdmin = await AdminService.isAdmin();
        const isAwaitingApproval = !isAdmin && await AdminService.isAwaitingApproval();

        if (!cancelled) {
          setAccess({ userId, isAdmin, isAwaitingApproval });
        }
      } catch (error) {
        console.error('Failed to check admin status:', error);
        if (!cancelled) {
          setAccess({ userId, isAdmin: false, isAwaitingApproval: false });
        }
      }
    };

    checkAdminStatus();
    return () => { cancelled = true; };
  }, [userId]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <GlassCard className="w-full max-w-md">
          <h1 className="text-2xl font-bold text-center mb-3">تسجيل الدخول</h1>
          <p className="text-sm text-white/70 text-center mb-6">يجب تسجيل الدخول للوصول إلى لوحة الإدارة</p>
          <LoginForm />
          <GradientButton variant="purple" onClick={() => navigate('/')} className="w-full mt-4">
            العودة للصفحة الرئيسية
          </GradientButton>
        </GlassCard>
      </div>
    );
  }

  if (authLoading || !access || access.userId !== user.id) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (access.isAwaitingApproval) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <GlassCard className="max-w-md text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-yellow-500/20 flex items-center justify-center">
            <span className="text-4xl">⏳</span>
          </div>
          <h1 className="text-2xl font-bold mb-4">في انتظار الموافقة</h1>
          <p className="text-white/60 mb-6">
            تم إنشاء حسابك كمسؤول ولكنه بانتظار الموافقة. يرجى التواصل مع المسؤول الرئيسي.
          </p>
          <div className="flex flex-col gap-3">
            <GradientButton variant="purple" onClick={() => navigate('/')} className="w-full">
              العودة للصفحة الرئيسية
            </GradientButton>
            <GradientButton variant="cyan" onClick={handleSignOut} className="w-full">
              تسجيل الخروج
            </GradientButton>
          </div>
        </GlassCard>
      </div>
    );
  }

  if (!access.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <GlassCard className="max-w-md text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-500/20 flex items-center justify-center">
            <span className="text-4xl">🚫</span>
          </div>
          <h1 className="text-2xl font-bold mb-4">غير مصرح</h1>
          <p className="text-white/60 mb-6">ليس لديك صلاحية الوصول إلى لوحة الإدارة.</p>
          <GradientButton variant="purple" onClick={() => navigate('/')} className="w-full">
            العودة للصفحة الرئيسية
          </GradientButton>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <Logo size="sm" />
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">لوحة الإدارة</h1>
              <p className="text-white/60 text-sm">إدارة الأسئلة والمستخدمين وأصوات شاشة التلفزيون</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <GradientButton variant="purple" onClick={() => navigate('/')}>
              الصفحة الرئيسية
            </GradientButton>
            <GradientButton variant="cyan" onClick={handleSignOut}>
              تسجيل الخروج
            </GradientButton>
          </div>
        </div>

        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setActiveTab('questions')}
            className={`px-6 py-3 rounded-xl font-bold transition-all ${
              activeTab === 'questions'
                ? 'bg-gradient-to-r from-purple-600 to-purple-800 text-white shadow-lg'
                : 'glass text-white/70 hover:text-white hover:bg-white/10'
            }`}
          >
            📝 الأسئلة
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-6 py-3 rounded-xl font-bold transition-all ${
              activeTab === 'users'
                ? 'bg-gradient-to-r from-purple-600 to-purple-800 text-white shadow-lg'
                : 'glass text-white/70 hover:text-white hover:bg-white/10'
            }`}
          >
            👥 المستخدمين
          </button>
          <button
            onClick={() => setActiveTab('audio')}
            className={`px-6 py-3 rounded-xl font-bold transition-all ${
              activeTab === 'audio'
                ? 'bg-gradient-to-r from-purple-600 to-purple-800 text-white shadow-lg'
                : 'glass text-white/70 hover:text-white hover:bg-white/10'
            }`}
          >
            🔊 أصوات التلفزيون
          </button>
        </div>

        <GlassCard>
          {activeTab === 'questions' && <QuestionManager />}
          {activeTab === 'users' && <UserManager />}
          {activeTab === 'audio' && <AudioCueManager />}
        </GlassCard>
      </div>
    </div>
  );
};

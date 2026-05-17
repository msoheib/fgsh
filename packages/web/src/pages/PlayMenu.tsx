import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { UserMenu } from '../components/UserMenu';

export const PlayMenu: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="fixed top-4 left-4 z-50">
        <UserMenu />
      </div>

      <div className="animate-slide-up w-full max-w-2xl">
        <Logo size="md" className="mb-8 sm:mb-10" />

        <GlassCard className="mx-auto w-full max-w-xl">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-6">
            إنشاء غرفة 📺
          </h2>

          <div className="mb-6 rounded-2xl border border-secondary-main/60 bg-secondary-main/20 p-4 sm:p-5">
            <p className="text-center text-sm sm:text-base leading-relaxed text-white/90">
              📱 ستظهر شاشة العرض على هذا الجهاز. الجولة ثابتة: 3 + 3 + 1 أسئلة
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:gap-4">
            <GradientButton
              variant="pink"
              onClick={() => navigate('/create')}
              className="w-full"
            >
              إنشاء غرفة جديدة
            </GradientButton>

            <GradientButton
              variant="purple"
              onClick={() => navigate('/join')}
              className="w-full"
            >
              انضم للغرفة
            </GradientButton>

            <GradientButton
              variant="cyan"
              onClick={() => navigate('/')}
              className="w-full"
            >
              العودة
            </GradientButton>
          </div>
        </GlassCard>
      </div>
    </div>
  );
};

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { UserMenu } from '../components/UserMenu';

export const Home: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6">
      {/* User Menu - Top Right */}
      <div className="fixed top-4 left-4 z-50">
        <UserMenu />
      </div>

      <div className="animate-slide-up w-full max-w-2xl">
        <Logo size="lg" className="mb-8 sm:mb-12" />

        <GlassCard className="mx-auto mb-6 sm:mb-8">
          <div className="text-center mb-6 sm:mb-8">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold mb-3 sm:mb-4">مرحبا بك في فقش</h2>
            <p className="text-sm sm:text-base text-white/80 leading-relaxed">
              لعبة المعلومات العامة والخداع الأكثر إثارة! أجب العتميذ واكتشف من الأكثب
              في التمييز بين الحقائق والأكاذيب
            </p>
          </div>
        </GlassCard>

        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center px-4 sm:px-0">
          <GradientButton
            variant="pink"
            onClick={() => navigate('/create')}
            className="w-full sm:w-auto sm:min-w-[200px]"
          >
            تجهيز غرفة
          </GradientButton>

          <GradientButton
            variant="purple"
            onClick={() => navigate('/join')}
            className="w-full sm:w-auto sm:min-w-[200px]"
          >
            الانضمام للعبة
          </GradientButton>

          <GradientButton
            variant="cyan"
            onClick={() => navigate('/how-to-play')}
            className="w-full sm:w-auto sm:min-w-[200px]"
          >
            كيف العب
          </GradientButton>
        </div>
      </div>
    </div>
  );
};

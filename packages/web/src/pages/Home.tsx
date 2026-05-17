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
              لعبة جماعية مليئة بالحماس!
              <br />
              أجب، اخدع، واكتشف من بينكم الأذكى في تمييز الحقيقة.
            </p>
          </div>
        </GlassCard>

        <div className="mx-auto flex w-full max-w-xl flex-col gap-3 sm:gap-4 px-4 sm:px-0">
          <GradientButton
            variant="pink"
            onClick={() => navigate('/play')}
            className="w-full"
          >
            ابدأ اللعبه
          </GradientButton>

          <GradientButton
            variant="cyan"
            onClick={() => navigate('/how-to-play')}
            className="w-full"
          >
            كيف العب
          </GradientButton>
        </div>
      </div>
    </div>
  );
};

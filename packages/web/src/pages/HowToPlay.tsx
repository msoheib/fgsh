import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';

export const HowToPlay: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6">
      <Logo size="sm" className="mb-6 sm:mb-8" />

      <GlassCard className="max-w-3xl w-full">
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-6 sm:mb-8">
          كيف تلعب فقش؟
        </h2>

        <div className="space-y-6 text-right">
          {/* Game Overview */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">🎮</span>
              <h3 className="text-xl font-bold">نظرة عامة</h3>
            </div>
            <p className="text-white/80 leading-relaxed">
              فقش هي لعبة معلومات عامة وخداع! اكتب إجابات مزيفة لخداع اللاعبين الآخرين، وحاول
              تخمين الإجابة الصحيحة. احصل على نقاط عندما يصوت اللاعبون لإجابتك المزيفة!
            </p>
          </div>

          {/* How to Play Steps */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">📝</span>
              <h3 className="text-xl font-bold">خطوات اللعب</h3>
            </div>
            <div className="space-y-4">
              <div className="glass rounded-2xl p-4">
                <p className="font-bold text-secondary-main mb-2">1. الانضمام للعبة</p>
                <p className="text-white/80 text-sm">
                  امسح رمز QR من شاشة المضيف أو أدخل كود اللعبة يدوياً للانضمام
                </p>
              </div>

              <div className="glass rounded-2xl p-4">
                <p className="font-bold text-secondary-main mb-2">2. مرحلة الإجابة</p>
                <p className="text-white/80 text-sm">
                  سيتم عرض سؤال. اكتب إجابة مزيفة مقنعة لخداع اللاعبين الآخرين!
                </p>
              </div>

              <div className="glass rounded-2xl p-4">
                <p className="font-bold text-secondary-main mb-2">3. مرحلة التصويت</p>
                <p className="text-white/80 text-sm">
                  ستظهر جميع الإجابات المزيفة + الإجابة الصحيحة. صوّت للإجابة التي تعتقد أنها صحيحة!
                </p>
              </div>

              <div className="glass rounded-2xl p-4">
                <p className="font-bold text-secondary-main mb-2">4. النتائج والنقاط</p>
                <p className="text-white/80 text-sm">
                  احصل على نقاط عندما يصوت اللاعبون لإجابتك المزيفة، أو عندما تخمن الإجابة الصحيحة!
                </p>
              </div>
            </div>
          </div>

          {/* Scoring System */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">🏆</span>
              <h3 className="text-xl font-bold">نظام النقاط</h3>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between glass rounded-xl p-3">
                <span className="text-white/80 text-sm">التصويت للإجابة الصحيحة</span>
                <span className="font-bold text-secondary-main">500 نقطة</span>
              </div>
              <div className="flex items-center justify-between glass rounded-xl p-3">
                <span className="text-white/80 text-sm">لكل لاعب ينخدع بإجابتك</span>
                <span className="font-bold text-secondary-main">500 نقطة</span>
              </div>
              <div className="flex items-center justify-between glass rounded-xl p-3">
                <span className="text-white/80 text-sm">إجابة مثالية (لا أحد اختارها)</span>
                <span className="font-bold text-secondary-main">1000 نقطة</span>
              </div>
              <div className="flex items-center justify-between glass rounded-xl p-3">
                <span className="text-white/80 text-sm">أعلى نقاط في الجولة</span>
                <span className="font-bold text-secondary-main">250 نقطة</span>
              </div>
            </div>
          </div>

          {/* Tips */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">💡</span>
              <h3 className="text-xl font-bold">نصائح للفوز</h3>
            </div>
            <ul className="space-y-2 text-white/80 text-sm list-disc list-inside">
              <li>اكتب إجابات مزيفة مقنعة تبدو حقيقية</li>
              <li>لا تجعل إجابتك واضحة جداً أو سخيفة جداً</li>
              <li>فكر مثل اللاعبين الآخرين - ماذا سيصدقون؟</li>
              <li>لا تستعجل! لديك وقت للتفكير في إجابة ذكية</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <GradientButton
            variant="cyan"
            onClick={() => navigate('/')}
            className="flex-1"
          >
            الصفحة الرئيسية
          </GradientButton>
          <GradientButton
            variant="pink"
            onClick={() => navigate('/join')}
            className="flex-1"
          >
            ابدأ اللعب
          </GradientButton>
        </div>
      </GlassCard>
    </div>
  );
};

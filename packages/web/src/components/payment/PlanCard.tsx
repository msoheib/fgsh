import React from 'react';
import { MOYASAR_CONFIG, type PaymentPlanId, formatPrice } from '@fakash/shared';
import { GradientButton } from '../GradientButton';

interface PlanCardProps {
  planId: PaymentPlanId;
  onSelect: (planId: PaymentPlanId) => void;
  isPopular?: boolean;
  disabled?: boolean;
}

export const PlanCard: React.FC<PlanCardProps> = ({
  planId,
  onSelect,
  isPopular = false,
  disabled = false,
}) => {
  const plan = MOYASAR_CONFIG.PLANS[planId];

  return (
    <div
      className={`relative glass rounded-3xl p-6 sm:p-8 transition-all ${
        isPopular
          ? 'border-2 border-secondary-main shadow-glow-cyan'
          : 'border border-white/20'
      } ${disabled ? 'opacity-50' : 'hover:border-secondary-main/50'}`}
    >
      {/* Popular badge */}
      {isPopular && (
        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
          <div className="bg-gradient-to-r from-secondary-main to-secondary-light px-4 py-1 rounded-full text-xs font-bold">
            الأكثر شعبية
          </div>
        </div>
      )}

      {/* Plan name */}
      <h3 className="text-2xl sm:text-3xl font-bold text-center mb-2">
        {plan.nameAr}
      </h3>

      {/* Price */}
      <div className="text-center mb-6">
        <div className="text-4xl sm:text-5xl font-bold text-secondary-main mb-2">
          {plan.price}
          <span className="text-lg text-white/60 mr-2">ريال</span>
        </div>
        {plan.duration && (
          <p className="text-sm text-white/60">
            صالحة لمدة {plan.duration} يوماً
          </p>
        )}
        {!plan.duration && (
          <p className="text-sm text-white/60">وصول دائم</p>
        )}
      </div>

      {/* Description */}
      <p className="text-center text-white/80 mb-6 text-sm sm:text-base">
        {plan.descriptionAr}
      </p>

      {/* Features */}
      <div className="space-y-3 mb-8">
        {plan.featuresAr.map((feature, index) => (
          <div key={index} className="flex items-start gap-3">
            <span className="text-secondary-main text-xl mt-0.5">✓</span>
            <span className="text-sm sm:text-base text-white/90">{feature}</span>
          </div>
        ))}
      </div>

      {/* Select button */}
      <GradientButton
        variant={isPopular ? 'cyan' : 'purple'}
        onClick={() => onSelect(planId)}
        className="w-full"
        disabled={disabled}
      >
        اختر هذه الباقة
      </GradientButton>
    </div>
  );
};

// Pricing comparison component
export const PricingPlans: React.FC<{
  onSelectPlan: (planId: PaymentPlanId) => void;
  currentTier?: string;
}> = ({ onSelectPlan, currentTier }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
      <PlanCard
        planId="BASIC"
        onSelect={onSelectPlan}
        disabled={currentTier === 'basic' || currentTier === 'premium'}
      />
      <PlanCard
        planId="PREMIUM"
        onSelect={onSelectPlan}
        isPopular
        disabled={currentTier === 'premium'}
      />
      <PlanCard
        planId="LIFETIME"
        onSelect={onSelectPlan}
        disabled={currentTier === 'premium'}
      />
    </div>
  );
};

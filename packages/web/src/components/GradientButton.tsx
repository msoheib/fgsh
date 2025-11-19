import React from 'react';

interface GradientButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'cyan' | 'pink' | 'purple';
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
}

export const GradientButton: React.FC<GradientButtonProps> = ({
  children,
  onClick,
  variant = 'cyan',
  disabled = false,
  className = '',
  type = 'button',
}) => {
  const variantClasses = {
    cyan: 'btn-cyan',
    pink: 'btn-pink',
    purple: 'btn-purple',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`btn-gradient ${variantClasses[variant]} ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      } text-base sm:text-lg min-h-[48px] sm:min-h-[56px] px-6 sm:px-8 ${className}`}
    >
      {children}
    </button>
  );
};

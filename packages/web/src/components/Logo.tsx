import React from 'react';
import logoImg from '../assets/logo.png';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ size = 'md', className = '' }) => {
  const sizeClasses = {
    sm: 'h-16',
    md: 'h-24',
    lg: 'h-32',
  };

  return (
    <div className={`flex justify-center ${className}`}>
      <img
        src={logoImg}
        alt="ففش"
        className={`${sizeClasses[size]} w-auto object-contain`}
      />
    </div>
  );
};

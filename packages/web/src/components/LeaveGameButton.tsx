import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '@fakash/shared';

interface LeaveGameButtonProps {
  variant?: 'danger' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const LeaveGameButton: React.FC<LeaveGameButtonProps> = ({
  variant = 'danger',
  size = 'md',
  className = '',
}) => {
  const navigate = useNavigate();
  const leaveGame = useGameStore((state) => state.leaveGame);

  const handleLeaveGame = () => {
    const confirmed = window.confirm('هل أنت متأكد أنك تريد مغادرة اللعبة؟');
    if (confirmed) {
      leaveGame();
      navigate('/', { replace: true });
    }
  };

  const sizeClasses = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-3 text-base',
    lg: 'px-6 py-4 text-lg',
  };

  const variantClasses = {
    danger: 'bg-red-500 hover:bg-red-600 active:bg-red-700',
    secondary: 'bg-gray-500 hover:bg-gray-600 active:bg-gray-700',
  };

  return (
    <button
      onClick={handleLeaveGame}
      className={`
        ${sizeClasses[size]}
        ${variantClasses[variant]}
        text-white font-bold rounded-2xl
        transition-all duration-200
        backdrop-blur-md
        border border-white/20
        ${className}
      `}
    >
      مغادرة اللعبة
    </button>
  );
};

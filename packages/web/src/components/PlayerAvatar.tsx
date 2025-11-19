import React from 'react';
import { getPlayerInitials } from '@fakash/shared';

interface PlayerAvatarProps {
  name: string;
  color: string;
  size?: 'sm' | 'md' | 'lg';
  isHost?: boolean;
  className?: string;
}

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  name,
  color,
  size = 'md',
  isHost = false,
  className = '',
}) => {
  const sizeClasses = {
    sm: 'w-10 h-10 text-sm',
    md: 'w-12 h-12 text-base',
    lg: 'w-16 h-16 text-xl',
  };

  const initials = getPlayerInitials(name);

  return (
    <div className={`relative inline-block ${className}`}>
      <div
        className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-bold text-white shadow-lg`}
        style={{ backgroundColor: color }}
      >
        {initials}
      </div>
      {isHost && (
        <div className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-400 rounded-full flex items-center justify-center text-xs">
          ⭐
        </div>
      )}
    </div>
  );
};

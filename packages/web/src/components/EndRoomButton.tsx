import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore, GameService, clearGameSession } from '@fakash/shared';

interface EndRoomButtonProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Button for TV/Host to end the entire game room.
 * This ends the game for all players.
 */
export const EndRoomButton: React.FC<EndRoomButtonProps> = ({
  size = 'md',
  className = '',
}) => {
  const navigate = useNavigate();
  const game = useGameStore((state) => state.game);

  const handleEndRoom = async () => {
    const confirmed = window.confirm('هل أنت متأكد أنك تريد إنهاء اللعبة للجميع؟');
    if (!confirmed) return;

    try {
      if (game) {
        await GameService.endGame(game.id);
      }
      clearGameSession();
      navigate('/', { replace: true });
    } catch (err) {
      console.error('Failed to end room:', err);
      window.alert('تعذر إنهاء اللعبة. تأكد من الاتصال ثم حاول مرة أخرى.');
    }
  };

  const sizeClasses = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-3 text-base',
    lg: 'px-6 py-4 text-lg',
  };

  return (
    <button
      onClick={handleEndRoom}
      className={`
        ${sizeClasses[size]}
        bg-red-500 hover:bg-red-600 active:bg-red-700
        text-white font-bold rounded-2xl
        backdrop-blur-md
        border border-white/20
        ${className}
      `}
    >
      إنهاء اللعبة
    </button>
  );
};

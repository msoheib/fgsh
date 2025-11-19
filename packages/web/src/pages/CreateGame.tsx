import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { useGameStore, GAME_CONFIG } from '@fakash/shared';

export const CreateGame: React.FC = () => {
  const navigate = useNavigate();
  const { createGame, createGameAsDisplay, isLoading, error } = useGameStore();

  const [hostName, setHostName] = useState('');
  const [roundCount, setRoundCount] = useState(4);
  const [maxPlayers, setMaxPlayers] = useState(10);
  const [isDisplayMode, setIsDisplayMode] = useState(false);

  const handleCreateGame = async () => {
    // Display mode doesn't require host name (TV display-only)
    if (!isDisplayMode && !hostName.trim()) {
      alert('الرجاء إدخال اسمك');
      return;
    }

    try {
      if (isDisplayMode) {
        // Create game in display mode (for TV)
        await createGameAsDisplay({
          roundCount,
          maxPlayers,
        });
      } else {
        // Create game normally with host player
        await createGame(hostName, {
          roundCount,
          maxPlayers,
        });
      }
      navigate('/lobby');
    } catch (err) {
      console.error('Failed to create game:', err);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6">
      <Logo size="md" className="mb-6 sm:mb-8" />

      <GlassCard className="max-w-xl w-full">
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-6 sm:mb-8">إعدادات اللعبة</h2>

        <div className="space-y-5 sm:space-y-6">
          {/* Display Mode Toggle */}
          <div className="flex items-center justify-between p-4 glass rounded-2xl">
            <div className="text-right">
              <p className="font-semibold text-base sm:text-lg">وضع العرض (للتلفزيون) 📺</p>
              <p className="text-xs sm:text-sm text-white/60 mt-1">
                عرض اللعبة فقط بدون مشاركة كلاعب
              </p>
            </div>
            <button
              onClick={() => setIsDisplayMode(!isDisplayMode)}
              className={`relative w-14 h-8 rounded-full transition-all ${
                isDisplayMode
                  ? 'bg-gradient-to-r from-secondary-main to-secondary-light'
                  : 'bg-white/20'
              }`}
            >
              <div
                className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${
                  isDisplayMode ? 'right-1' : 'right-7'
                }`}
              />
            </button>
          </div>

          {/* Host name input - only show if NOT in display mode */}
          {!isDisplayMode && (
            <div>
              <label className="block text-right mb-2 sm:mb-3 text-base sm:text-lg font-semibold">
                اسم المضيف
              </label>
              <input
                type="text"
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
                placeholder="أدخل اسمك"
                className="input-glass text-base sm:text-lg"
                maxLength={50}
                autoFocus
              />
            </div>
          )}

          {/* Display mode info */}
          {isDisplayMode && (
            <div className="p-4 bg-secondary-main/20 border border-secondary-main/50 rounded-2xl">
              <p className="text-sm sm:text-base text-center">
                📱 سيتم إنشاء غرفة للعرض على التلفزيون. امسح رمز QR من هاتفك للانضمام كمضيف
              </p>
            </div>
          )}

          {/* Round count */}
          <div>
            <label className="block text-right mb-2 sm:mb-3 text-base sm:text-lg font-semibold">
              عدد الجولات
            </label>
            <div className="grid grid-cols-4 gap-2 sm:gap-3">
              {GAME_CONFIG.ROUND_OPTIONS.map((count) => (
                <button
                  key={count}
                  onClick={() => setRoundCount(count)}
                  className={`h-16 sm:h-20 rounded-2xl font-bold text-lg sm:text-xl transition-all ${
                    roundCount === count
                      ? 'bg-gradient-to-br from-secondary-main to-secondary-light shadow-glow-cyan'
                      : 'glass hover:bg-white/20'
                  }`}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>

          {/* Max players */}
          <div>
            <label className="block text-right mb-2 sm:mb-3 text-base sm:text-lg font-semibold">
              عدد اللاعبين
            </label>
            <div className="flex items-center justify-center gap-3 sm:gap-4">
              <button
                onClick={() => setMaxPlayers(Math.max(4, maxPlayers - 1))}
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full glass hover:bg-white/20 text-2xl font-bold flex items-center justify-center"
                disabled={maxPlayers <= GAME_CONFIG.MIN_PLAYERS}
              >
                −
              </button>
              <div className="w-28 h-16 sm:w-32 sm:h-20 glass rounded-2xl flex items-center justify-center">
                <span className="text-3xl sm:text-4xl font-bold">{maxPlayers}</span>
              </div>
              <button
                onClick={() => setMaxPlayers(Math.min(10, maxPlayers + 1))}
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full glass hover:bg-white/20 text-2xl font-bold flex items-center justify-center"
                disabled={maxPlayers >= GAME_CONFIG.MAX_PLAYERS}
              >
                +
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-red-500/20 border border-red-500/50 rounded-2xl text-center text-sm sm:text-base">
            {error}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mt-6 sm:mt-8">
          <GradientButton
            variant="cyan"
            onClick={() => navigate(-1)}
            className="flex-1"
            disabled={isLoading}
          >
            العودة
          </GradientButton>

          <GradientButton
            variant="pink"
            onClick={handleCreateGame}
            className="flex-1"
            disabled={isLoading}
          >
            {isLoading ? <LoadingSpinner size="sm" /> : 'إنشاء غرفة'}
          </GradientButton>
        </div>
      </GlassCard>
    </div>
  );
};

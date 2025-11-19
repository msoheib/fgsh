import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { CodeInput } from '../components/CodeInput';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { useGameStore } from '@fakash/shared';

export const JoinGame: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { joinGame, isLoading, error } = useGameStore();

  const [playerName, setPlayerName] = useState('');
  const [gameCode, setGameCode] = useState('');
  const [step, setStep] = useState<'code' | 'name'>('code');

  // Check if game code was passed via deep link or URL query parameter
  useEffect(() => {
    // Check URL query parameters first (for QR code scans)
    const params = new URLSearchParams(location.search);
    const codeParam = params.get('code');

    if (codeParam) {
      setGameCode(codeParam.toUpperCase());
      setStep('name');
      return;
    }

    // Fallback to state (for navigation from other pages)
    const state = location.state as { gameCode?: string } | null;
    if (state?.gameCode) {
      setGameCode(state.gameCode);
      setStep('name');
    }
  }, [location.state, location.search]);

  const handleCodeComplete = (code: string) => {
    setGameCode(code);
    setStep('name');
  };

  const handleJoinGame = async () => {
    if (!playerName.trim()) {
      alert('الرجاء إدخال اسمك');
      return;
    }

    try {
      await joinGame(gameCode, playerName);
      navigate('/lobby');
    } catch (err) {
      console.error('Failed to join game:', err);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6">
      <Logo size="md" className="mb-6 sm:mb-8" />

      <GlassCard className="max-w-xl w-full">
        {step === 'code' ? (
          <>
            <h2 className="text-2xl sm:text-3xl font-bold text-center mb-6 sm:mb-8">غرفة اللعبة</h2>

            <div className="mb-6 sm:mb-8">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-primary-main to-primary-dark rounded-2xl mb-4">
                  <span className="text-4xl sm:text-5xl">📱</span>
                </div>
                <p className="text-base sm:text-lg text-white/90 mb-2">
                  امسح الكود للانضمام
                </p>
                <p className="text-sm sm:text-base text-white/60">
                  افتح الكاميرا وامسح رمز QR
                </p>
              </div>

              <div className="text-center mb-4 sm:mb-6">
                <p className="text-sm sm:text-base text-white/80 mb-3">أو أدخل الكود يدوياً</p>
                <CodeInput onComplete={handleCodeComplete} />
              </div>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-2xl sm:text-3xl font-bold text-center mb-6 sm:mb-8">
              انضم إلى اللعبة
            </h2>

            <div className="mb-4 sm:mb-6">
              <label className="block text-right mb-2 sm:mb-3 text-base sm:text-lg">
                الكود: {gameCode}
              </label>
            </div>

            <div className="mb-4 sm:mb-6">
              <label className="block text-right mb-2 sm:mb-3 text-base sm:text-lg font-semibold">
                أدخل اسمك
              </label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="اسمك هنا"
                className="input-glass text-base sm:text-lg"
                maxLength={50}
                onKeyPress={(e) => e.key === 'Enter' && handleJoinGame()}
                autoFocus
              />
            </div>

            {error && (
              <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-red-500/20 border border-red-500/50 rounded-2xl text-center text-sm sm:text-base">
                {error}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <GradientButton
                variant="cyan"
                onClick={() => setStep('code')}
                className="flex-1"
                disabled={isLoading}
              >
                العودة
              </GradientButton>

              <GradientButton
                variant="pink"
                onClick={handleJoinGame}
                className="flex-1"
                disabled={isLoading}
              >
                {isLoading ? <LoadingSpinner size="sm" /> : 'بدأ اللعبة'}
              </GradientButton>
            </div>
          </>
        )}
      </GlassCard>
    </div>
  );
};

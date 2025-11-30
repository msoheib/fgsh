import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { useGameStore, ScoringService, GameService, clearGameSession } from '@fakash/shared';

export const Results: React.FC = () => {
  const navigate = useNavigate();
  const { game, isHost, leaveGame } = useGameStore();
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [isEnding, setIsEnding] = useState(false);
  
  // Store game ID in ref so we can still fetch leaderboard even if game state changes
  const gameIdRef = useRef<string | null>(null);
  const hasLoadedRef = useRef(false);

  // Capture game ID on mount
  useEffect(() => {
    if (game?.id && !gameIdRef.current) {
      gameIdRef.current = game.id;
    }
  }, [game?.id]);

  useEffect(() => {
    // Use stored game ID if game becomes null during results display
    const gameId = game?.id || gameIdRef.current;
    
    if (!gameId) {
      // Only redirect if we never had a game
      if (!hasLoadedRef.current) {
        navigate('/');
      }
      return;
    }

    // If game is not finished yet, go back to game page
    if (game && game.status !== 'finished') {
      navigate('/game');
      return;
    }

    // Fetch final leaderboard
    const fetchLeaderboard = async () => {
      try {
        hasLoadedRef.current = true;
        const data = await ScoringService.getFinalLeaderboard(gameId);
        setLeaderboard(data);
      } catch (err) {
        console.error('Failed to fetch leaderboard:', err);
      }
    };

    fetchLeaderboard();
  }, [game, navigate]);

  // Handle creating a new game
  const handleCreateNewGame = async () => {
    // Clean up current session
    await leaveGame();
    clearGameSession();
    // Navigate to create page
    navigate('/create');
  };

  // Handle ending game and returning home (host only)
  const handleEndAndGoHome = async () => {
    setIsEnding(true);
    try {
      const gameId = game?.id || gameIdRef.current;
      if (gameId) {
        await GameService.endGame(gameId);
      }
    } catch (err) {
      console.error('Failed to end game:', err);
    }
    await leaveGame();
    clearGameSession();
    navigate('/');
  };

  // Handle returning home (for non-host players)
  const handleGoHome = async () => {
    await leaveGame();
    clearGameSession();
    navigate('/');
  };

  // Show loading state if leaderboard hasn't loaded yet
  if (leaderboard.length === 0 && !hasLoadedRef.current) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white text-lg">جارٍ تحميل النتائج...</p>
        </div>
      </div>
    );
  }

  const winner = leaderboard[0];

  const getRankGradient = (rank: number) => {
    switch (rank) {
      case 1:
        return 'bg-gradient-gold';
      case 2:
        return 'bg-gradient-silver';
      case 3:
        return 'bg-gradient-bronze';
      default:
        return 'glass';
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6">
      <Logo size="md" className="mb-4 sm:mb-6" />

      {winner && (
        <div className="mb-6 sm:mb-8 text-center animate-celebrate">
          <p className="text-3xl sm:text-4xl mb-3 sm:mb-4">🎉</p>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold mb-2">الفائز!</h1>
          <p className="text-2xl sm:text-3xl font-bold bg-gradient-gold bg-clip-text text-transparent">
            {winner.player.user_name}
          </p>
          <p className="text-lg sm:text-xl mt-2">
            {winner.player.score} نقطة
          </p>
        </div>
      )}

      <GlassCard className="max-w-2xl w-full">
        <h2 className="text-xl sm:text-2xl font-bold text-center mb-4 sm:mb-6">🏆 لوحة المتصدرين</h2>

        <div className="space-y-2 sm:space-y-3">
          {leaderboard.map(({ player, rank }) => (
            <div
              key={player.id}
              className={`flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-2xl ${getRankGradient(
                rank
              )}`}
            >
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center font-bold text-xl sm:text-2xl">
                  {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}
                </div>
                <PlayerAvatar
                  name={player.user_name}
                  color={player.avatar_color}
                  isHost={player.is_host}
                  size="md"
                />
              </div>

              <p className="flex-1 font-bold text-base sm:text-lg truncate">{player.user_name}</p>

              <div className="text-left">
                <p className="text-2xl sm:text-3xl font-bold">{player.score}</p>
                <p className="text-xs sm:text-sm text-white/60">نقطة</p>
              </div>
            </div>
          ))}
        </div>

        {/* Action buttons - different for host vs players */}
        <div className="mt-6 sm:mt-8">
          {isHost ? (
            // Host controls
            <div className="flex flex-col gap-3">
              <GradientButton
                variant="pink"
                onClick={handleCreateNewGame}
                className="w-full"
              >
                🎮 إنشاء لعبة جديدة
              </GradientButton>
              
              <GradientButton
                variant="cyan"
                onClick={handleEndAndGoHome}
                disabled={isEnding}
                className="w-full"
              >
                {isEnding ? '⏳ جاري الإنهاء...' : '🏠 إنهاء اللعبة والعودة للرئيسية'}
              </GradientButton>
            </div>
          ) : (
            // Player controls
            <div className="flex flex-col gap-3">
              <GradientButton
                variant="pink"
                onClick={handleGoHome}
                className="w-full"
              >
                🏠 العودة للرئيسية
              </GradientButton>
              
              <p className="text-center text-sm text-white/60">
                شكراً لك على اللعب! 🎉
              </p>
            </div>
          )}
        </div>
      </GlassCard>
    </div>
  );
};

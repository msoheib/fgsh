import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { useGameStore, ScoringService, clearGameSession } from '@fakash/shared';

// Minimal player results - simple leaderboard without animations
export const Results: React.FC = () => {
  const navigate = useNavigate();
  const { game, isDisplayMode, leaveGame } = useGameStore();
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const gameIdRef = useRef<string | null>(null);

  // Redirect display mode to TV results
  useEffect(() => {
    if (isDisplayMode) {
      navigate('/tv/results', { replace: true });
    }
  }, [isDisplayMode, navigate]);

  // Capture game ID
  useEffect(() => {
    if (game?.id && !gameIdRef.current) {
      gameIdRef.current = game.id;
    }
  }, [game?.id]);

  // Fetch leaderboard
  useEffect(() => {
    const gameId = game?.id || gameIdRef.current;

    if (!gameId) {
      navigate('/');
      return;
    }

    if (game && game.status !== 'finished') {
      navigate('/game');
      return;
    }

    const fetchLeaderboard = async () => {
      try {
        const data = await ScoringService.getFinalLeaderboard(gameId);
        setLeaderboard(data);
      } catch (err) {
        console.error('Failed to fetch leaderboard:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLeaderboard();
  }, [game, navigate]);

  const handleGoHome = async () => {
    await leaveGame();
    clearGameSession();
    navigate('/');
  };

  if (isDisplayMode) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white/60">جارٍ حساب النتائج...</p>
        </div>
      </div>
    );
  }

  const winner = leaderboard[0];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <GlassCard className="max-w-sm w-full text-center">
        {/* Winner Display */}
        {winner && (
          <div className="mb-6 p-4 bg-gradient-to-br from-yellow-500/30 to-yellow-600/30 rounded-xl border border-yellow-500/50">
            <p className="text-2xl mb-1">🏆</p>
            <p className="text-sm text-white/70">الفائز</p>
            <p className="text-xl font-bold">{winner.player.user_name}</p>
            <p className="text-lg">{winner.player.score} نقطة</p>
          </div>
        )}

        {/* Simple Leaderboard */}
        <div className="mb-6">
          <h3 className="text-base font-bold mb-3">النتائج النهائية</h3>
          <div className="space-y-2">
            {leaderboard.map(({ player, rank }) => (
              <div
                key={player.id}
                className={`flex items-center justify-between p-2 rounded-lg text-sm ${
                  rank === 1
                    ? 'bg-yellow-500/20'
                    : rank === 2
                    ? 'bg-gray-400/20'
                    : rank === 3
                    ? 'bg-orange-500/20'
                    : 'bg-white/5'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="w-6 text-center">
                    {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}
                  </span>
                  <span className="font-medium">{player.user_name}</span>
                </span>
                <span className="font-bold">{player.score}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <GradientButton variant="pink" onClick={handleGoHome} className="w-full">
          العودة للرئيسية
        </GradientButton>

        <p className="text-xs text-white/50 mt-3">شكراً على اللعب! 🎉</p>
      </GlassCard>
    </div>
  );
};

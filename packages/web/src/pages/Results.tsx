import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore, ScoringService, clearGameSession } from '@fakash/shared';

// Ultra-minimal player results - simple static leaderboard
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
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-primary">
        <p className="text-white/60">جارٍ حساب النتائج...</p>
      </div>
    );
  }

  const winner = leaderboard[0];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-primary">
      <div className="bg-white/10 backdrop-blur rounded-2xl p-6 max-w-xs w-full text-center">
        {/* Winner */}
        {winner && (
          <div className="mb-4 p-4 bg-yellow-500/20 rounded-xl border border-yellow-500/30">
            <p className="text-2xl mb-1">🏆</p>
            <p className="font-bold text-xl">{winner.player.user_name}</p>
            <p className="text-lg">{winner.player.score} نقطة</p>
          </div>
        )}

        {/* Simple Leaderboard */}
        <div className="mb-4 text-right">
          {leaderboard.slice(0, 5).map(({ player, rank }) => (
            <div
              key={player.id}
              className={`flex items-center justify-between p-2 mb-1 rounded-lg text-sm ${
                rank === 1 ? 'bg-yellow-500/20' : 'bg-white/5'
              }`}
            >
              <span>
                {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}
                {' '}{player.user_name}
              </span>
              <span className="font-bold">{player.score}</span>
            </div>
          ))}
        </div>

        {/* Home Button */}
        <button
          onClick={handleGoHome}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 font-bold"
        >
          الرئيسية
        </button>
      </div>
    </div>
  );
};

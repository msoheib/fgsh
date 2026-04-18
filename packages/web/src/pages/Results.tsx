import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  clearGameSession,
  GameService,
  ScoringService,
  useGameStore,
  useRoundStore,
} from '@fakash/shared';

export const Results: React.FC = () => {
  const navigate = useNavigate();
  const { game, currentPlayer, isDisplayMode, leaveGame } = useGameStore();
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isReplaying, setIsReplaying] = useState(false);
  const gameIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isDisplayMode) {
      navigate('/tv/results', { replace: true });
    }
  }, [isDisplayMode, navigate]);

  useEffect(() => {
    if (game?.id && !gameIdRef.current) {
      gameIdRef.current = game.id;
    }
  }, [game?.id]);

  useEffect(() => {
    const activeGameId = game?.id || gameIdRef.current;
    if (!activeGameId) {
      navigate('/');
      return;
    }

    if (game?.status === 'waiting') {
      useRoundStore.getState().reset();
      navigate('/lobby', { replace: true });
      return;
    }

    if (game?.status === 'playing') {
      navigate('/game', { replace: true });
      return;
    }

    const fetchLeaderboard = async () => {
      try {
        const data = await ScoringService.getFinalLeaderboard(activeGameId);
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

  const handleReplay = async () => {
    const activeGameId = game?.id || gameIdRef.current;
    if (!activeGameId || !currentPlayer || isReplaying) {
      return;
    }

    setIsReplaying(true);
    try {
      const restartedGame = await GameService.restartFinishedGame(activeGameId, currentPlayer.id);
      useRoundStore.getState().reset();
      useGameStore.setState({ game: restartedGame });
      navigate('/lobby', { replace: true });
    } catch (err) {
      console.error('Failed to restart game:', err);
      setIsReplaying(false);
    }
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

  const topPlayers = leaderboard.filter(({ rank }) => rank === 1);
  const winner = topPlayers[0] || leaderboard[0];
  const hasSharedWinner = topPlayers.length > 1;
  const canRestart = !!game && !!currentPlayer && currentPlayer.id === (game.host_id ?? game.phase_captain_id ?? currentPlayer.id);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-primary">
      <div className="bg-white/10 backdrop-blur rounded-2xl p-4 sm:p-6 w-full max-w-md max-h-[90vh] text-center overflow-hidden">
        {winner && !hasSharedWinner && (
          <div className="mb-4 p-4 bg-yellow-500/20 rounded-xl border border-yellow-500/30">
            <p className="text-2xl mb-1">🏆</p>
            <p className="font-bold text-xl">{winner.player.user_name}</p>
            <p className="text-lg">{winner.player.score} نقطة</p>
          </div>
        )}

        {hasSharedWinner && (
          <div className="mb-4 p-4 bg-yellow-500/20 rounded-xl border border-yellow-500/30 text-center">
            <p className="text-2xl mb-1">🏆</p>
            <p className="font-bold text-xl mb-2">تعادل في الصدارة</p>
            <div className="space-y-1">
              {topPlayers.map(({ player }) => (
                <p key={player.id} className="text-lg font-semibold">
                  {player.user_name}
                </p>
              ))}
            </div>
            <p className="text-sm text-white/70 mt-2">{topPlayers[0].player.score} نقطة لكل لاعب</p>
          </div>
        )}

        <div className="mb-4 text-right overflow-y-auto max-h-[52vh] pr-1">
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

        {canRestart ? (
          <button
            onClick={handleReplay}
            disabled={isReplaying}
            className="w-full py-3 mb-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 font-bold disabled:opacity-60"
          >
            {isReplaying ? 'جارٍ إعادة الغرفة...' : 'إعادة نفس الغرفة'}
          </button>
        ) : (
          <div className="mb-3 rounded-xl border border-cyan-400/30 bg-cyan-500/10 p-3 text-sm text-right text-white/80">
            سيتم إرجاع الجميع إلى نفس اللوبي ونفس الكود عندما يعيد مسؤول الجولة تشغيل اللعبة.
          </div>
        )}

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

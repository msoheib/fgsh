import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { LeaveGameButton } from '../components/LeaveGameButton';
import { useGameStore, GAME_CONFIG } from '@fakash/shared';

// Minimal player lobby - no animations, just waiting status
export const Lobby: React.FC = () => {
  const navigate = useNavigate();
  const { game, players, currentPlayer, isPhaseCaptain, isDisplayMode, startGame, isConnected } = useGameStore();

  // Redirect display mode to TV lobby
  useEffect(() => {
    if (isDisplayMode) {
      navigate('/tv/lobby', { replace: true });
    }
  }, [isDisplayMode, navigate]);

  // Navigation guards
  useEffect(() => {
    if (!game || !currentPlayer) {
      navigate('/');
      return;
    }
    if (game.status === 'playing') {
      navigate('/game');
    }
  }, [game, game?.status, currentPlayer, navigate]);

  // Polling fallback
  useEffect(() => {
    if (!game || !currentPlayer || game.status !== 'waiting') return;

    const pollInterval = setInterval(async () => {
      try {
        const { GameService, useGameStore } = await import('@fakash/shared');
        const freshGame = await GameService.getGame(game.id);
        
        if (freshGame?.status === 'playing') {
          const currentPlayer = useGameStore.getState().currentPlayer;
          const isPhaseCaptain = currentPlayer?.id === freshGame.phase_captain_id;
          useGameStore.setState({ game: freshGame, isPhaseCaptain });
          clearInterval(pollInterval);
          navigate('/game');
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [game, currentPlayer, navigate]);

  if (isDisplayMode || !game || !currentPlayer) {
    return null;
  }

  const handleStartGame = async () => {
    try {
      await startGame();
    } catch (err) {
      console.error('Failed to start:', err);
      alert(err instanceof Error ? err.message : 'تعذر بدء اللعبة');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <GlassCard className="max-w-sm w-full text-center">
        {/* Game Code */}
        <div className="mb-6">
          <p className="text-xs text-white/50 mb-1">كود اللعبة</p>
          <div className="glass rounded-xl px-4 py-2 inline-block">
            <p className="text-2xl font-bold tracking-wider">{game.code}</p>
          </div>
        </div>

        {/* Player Count */}
        <div className="mb-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}></div>
            <span className="text-sm">{isConnected ? 'متصل' : 'غير متصل'}</span>
          </div>
          <p className="text-lg">
            <span className="font-bold text-2xl">{players.length}</span>
            <span className="text-white/60"> / {game.max_players} لاعبين</span>
          </p>
        </div>

        {/* Simple Player List */}
        <div className="mb-6 max-h-40 overflow-y-auto">
          <div className="space-y-1">
            {players.map((player) => {
              const isYou = player.id === currentPlayer.id;
              const isCaptain = player.id === game.phase_captain_id;
              return (
                <div
                  key={player.id}
                  className={`px-3 py-2 rounded-lg text-sm ${
                    isCaptain ? 'bg-yellow-500/20 border border-yellow-500/30' : 'bg-white/5'
                  }`}
                >
                  {isCaptain && <span className="mr-1">👑</span>}
                  {player.user_name}
                  {isYou && <span className="text-white/50 mr-1">(أنت)</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        {isPhaseCaptain ? (
          <div className="space-y-3">
            <GradientButton
              variant="pink"
              onClick={handleStartGame}
              className="w-full"
              disabled={players.length < GAME_CONFIG.MIN_PLAYERS}
            >
              بدأ اللعبة
            </GradientButton>
            {players.length < GAME_CONFIG.MIN_PLAYERS && (
              <p className="text-xs text-white/50">
                تحتاج {GAME_CONFIG.MIN_PLAYERS} لاعبين على الأقل
              </p>
            )}
          </div>
        ) : (
          <div className="p-3 glass rounded-xl">
            <p className="text-sm text-white/70">في انتظار قائد اللعبة...</p>
          </div>
        )}

        <div className="mt-4">
          <LeaveGameButton variant="secondary" size="sm" className="w-full" />
        </div>
      </GlassCard>
    </div>
  );
};

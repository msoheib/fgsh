import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore, GAME_CONFIG } from '@fakash/shared';

// Ultra-minimal player lobby - just waiting message and game code
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
        
        if (freshGame) {
          const currentPlayer = useGameStore.getState().currentPlayer;
          const isPhaseCaptain = currentPlayer?.id === freshGame.phase_captain_id;
          
          if (freshGame.status === 'playing') {
            useGameStore.setState({ game: freshGame, isPhaseCaptain });
            clearInterval(pollInterval);
            navigate('/game');
          } else {
            // Keep state in sync while waiting (fixes missing captain button issues)
            useGameStore.setState({ game: freshGame, isPhaseCaptain });
          }
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
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-primary">
      <div className="bg-white/10 backdrop-blur rounded-2xl p-6 max-w-xs w-full text-center">
        {/* Game Code */}
        <p className="text-xs text-white/50 mb-1">كود اللعبة</p>
        <p className="text-3xl font-bold tracking-wider mb-4 p-3 bg-white/10 rounded-xl inline-block">
          {game.code}
        </p>

        {/* Connection status */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}></div>
          <span className="text-sm">{isConnected ? 'متصل' : 'غير متصل'}</span>
        </div>

        {/* Player Count */}
        <p className="text-lg mb-4">
          <span className="font-bold text-2xl">{players.length}</span>
          <span className="text-white/60"> / {game.max_players} لاعبين</span>
        </p>

        {/* Actions */}
        {isPhaseCaptain ? (
          <div>
            <button
              onClick={handleStartGame}
              disabled={players.length < GAME_CONFIG.MIN_PLAYERS}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 font-bold disabled:opacity-50"
            >
              بدأ اللعبة
            </button>
            {players.length < GAME_CONFIG.MIN_PLAYERS && (
              <p className="text-xs text-white/50 mt-2">
                تحتاج {GAME_CONFIG.MIN_PLAYERS} لاعبين
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-white/60 p-3 bg-white/5 rounded-xl">
            في انتظار بدء اللعبة...
          </p>
        )}

        {/* Leave */}
        <button
          onClick={() => {
            useGameStore.getState().leaveGame();
            navigate('/');
          }}
          className="mt-4 w-full py-2 rounded-xl bg-white/10 text-sm"
        >
          مغادرة
        </button>
      </div>
    </div>
  );
};

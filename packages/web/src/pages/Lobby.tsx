import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '@fakash/shared';

// Ultra-minimal player lobby - just waiting message and game code
export const Lobby: React.FC = () => {
  const navigate = useNavigate();
  const { game, players, currentPlayer, isDisplayMode, startGame, isConnected } = useGameStore();

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
        const [freshGame, freshPlayers] = await Promise.all([
          GameService.getGame(game.id),
          GameService.getGamePlayers(game.id)
        ]);
        
        if (freshGame) {
          const currentPlayer = useGameStore.getState().currentPlayer;
          const isPhaseCaptain = currentPlayer?.id === freshGame.phase_captain_id;
          
          if (freshGame.status === 'playing') {
            useGameStore.setState({ game: freshGame, isPhaseCaptain, players: freshPlayers });
            clearInterval(pollInterval);
            navigate('/game');
          } else {
            // Keep state in sync while waiting
            useGameStore.setState({ game: freshGame, isPhaseCaptain, players: freshPlayers });

            // Auto-repair: If game has no captain, let a connected player claim the role
            if (!freshGame.phase_captain_id && currentPlayer) {
              console.log('[Lobby] Game has no captain! Attempting captain claim...');
              try {
                const claimedCaptainId = await GameService.claimPhaseCaptain(freshGame.id, currentPlayer.id);
                if (claimedCaptainId) {
                  useGameStore.setState({
                    game: { ...freshGame, phase_captain_id: claimedCaptainId },
                    players: freshPlayers,
                    isPhaseCaptain: currentPlayer.id === claimedCaptainId
                  });
                }
              } catch (claimError) {
                console.error('Failed to claim captain role:', claimError);
              }
            }
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

  const controllerPlayerId = game.host_id ?? game.phase_captain_id ?? players[0]?.id ?? null;
  const canControlFlow = controllerPlayerId ? currentPlayer.id === controllerPlayerId : true;

  const handleStartGame = async () => {
    console.log('🔘 Start Game clicked');
    try {
      await startGame();
      console.log('✅ Start game signal sent');
    } catch (err) {
      console.error('❌ Failed to start:', err);
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
        {canControlFlow ? (
          <div>
            <button
              onClick={handleStartGame}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 font-bold disabled:opacity-50"
            >
              بدأ اللعبة
            </button>
          </div>
        ) : (
          <p className="text-sm text-white/60 p-3 bg-white/5 rounded-xl">
            في انتظار مسؤول الجولة لبدء اللعبة...
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
        
        {/* Debug Info (Tiny) */}
        <div className="mt-4 text-[10px] text-white/20 select-text font-mono">
          <p>GID: {game.id.substring(0, 6)}</p>
          <p>CID: {game.phase_captain_id ? game.phase_captain_id.substring(0, 6) : 'NULL'}</p>
          <p>MID: {currentPlayer.id.substring(0, 6)}</p>
          <p>V: 1.0.1</p>
        </div>
      </div>
    </div>
  );
};

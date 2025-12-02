import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Logo } from '../components/Logo';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { LeaveGameButton } from '../components/LeaveGameButton';
import { useGameStore, GAME_CONFIG } from '@fakash/shared';

export const Lobby: React.FC = () => {
  const navigate = useNavigate();
  const { game, players, currentPlayer, isHost, isDisplayMode, startGame, isConnected } = useGameStore();

  useEffect(() => {
    // Allow display mode without currentPlayer
    if (!game || (!currentPlayer && !isDisplayMode)) {
      navigate('/');
      return;
    }

    console.log('🎯 Lobby - Game status:', game.status);

    // Listen for game start
    if (game.status === 'playing') {
      console.log('✅ Navigating to game page...');
      navigate('/game');
    }
  }, [game, game?.status, currentPlayer, navigate]);

  // Polling fallback - refetch game status every 2 seconds
  // This ensures navigation even if realtime update is missed
  useEffect(() => {
    // Allow polling for display mode without currentPlayer
    if (!game || (!currentPlayer && !isDisplayMode) || game.status !== 'waiting') {
      return;
    }

    console.log('🔄 Starting polling fallback for game:', {
      gameId: game.id,
      code: game.code,
      status: game.status,
      isConnected
    });

    const pollInterval = setInterval(async () => {
      console.log('📡 Polling game status for game:', game.id);

      try {
        // Dynamically import to avoid circular dependencies
        const { GameService } = await import('@fakash/shared');
        const freshGame = await GameService.getGame(game.id);

        if (freshGame) {
          console.log('📊 Polled game state:', {
            status: freshGame.status,
            currentRound: freshGame.current_round,
            oldStatus: game.status
          });

          if (freshGame.status === 'playing') {
            console.log('✅ Polling detected game started! Navigating...');
            // Update game state
            const { useGameStore } = await import('@fakash/shared');
            const currentPlayer = useGameStore.getState().currentPlayer;
            const isPhaseCaptain = currentPlayer?.id === freshGame.phase_captain_id;
            useGameStore.setState({ game: freshGame, isPhaseCaptain });

            // Clear interval and navigate
            clearInterval(pollInterval);
            navigate('/game');
          }
        } else {
          console.error('❌ Failed to fetch game state - game not found');
        }
      } catch (error) {
        console.error('❌ Error polling game status:', error);
      }
    }, 2000); // Poll every 2 seconds

    return () => {
      console.log('🛑 Stopping polling fallback');
      clearInterval(pollInterval);
    };
  }, [game, currentPlayer, navigate, isConnected]);

  // Allow display mode without currentPlayer
  if (!game || (!currentPlayer && !isDisplayMode)) {
    return null;
  }

  const handleStartGame = async () => {
    try {
      await startGame();
    } catch (err) {
      console.error('Failed to start game:', err);
      const message = err instanceof Error ? err.message : 'تعذر بدء اللعبة. تأكد من وجود لاعبين كافيين وحاول مرة أخرى.';
      alert(message);
    }
  };

  // Generate join URL for QR code
  const joinUrl = `${window.location.origin}/join?code=${game.code}`;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <Logo size="sm" className="mb-6" />

      <GlassCard className="max-w-2xl w-full">
        {/* Mobile: Stack vertically, Desktop: Side by side */}
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6 md:gap-0 md:justify-between mb-8">
          {/* Join Instructions - Different for Host/Display vs Players */}
          <div className="flex-shrink-0 w-full md:w-auto text-center">
            {(isHost || isDisplayMode) ? (
              // Host and Display mode see QR code
              <>
                <div className="w-40 h-40 sm:w-48 sm:h-48 md:w-32 md:h-32 bg-white rounded-2xl flex items-center justify-center mb-2 mx-auto p-2 sm:p-3 md:p-2">
                  <QRCodeSVG
                    value={joinUrl}
                    size={128}
                    level="M"
                    className="w-full h-full"
                  />
                </div>
                <p className="text-sm text-center text-white/60">امسح الكود للانضمام</p>
                <p className="text-2xl sm:text-3xl md:text-lg font-bold text-center mt-2">{game.code}</p>
              </>
            ) : (
              // Players see instructions only
              <div className="mb-4">
                <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-primary-main to-primary-dark rounded-2xl mb-3">
                  <span className="text-3xl sm:text-4xl">📱</span>
                </div>
                <p className="text-sm sm:text-base text-white/80 mb-1">
                  للانضمام للعبة:
                </p>
                <p className="text-xs sm:text-sm text-white/60 mb-3">
                  افتح الكاميرا وامسح الكود
                </p>
                <p className="text-xs sm:text-sm text-white/60">
                  أو أدخل الكود يدوياً:
                </p>
                <div className="glass rounded-2xl px-6 py-4 inline-block mt-3">
                  <p className="text-3xl sm:text-4xl md:text-2xl font-bold tracking-wider">{game.code}</p>
                </div>
              </div>
            )}
          </div>

          {/* Player List */}
          <div className="flex-1 w-full md:mr-8">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 mb-6">
              <h2 className="text-xl sm:text-2xl font-bold">اللاعبين المنضمين</h2>
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full ${
                    isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'
                  }`}
                ></div>
                <span className="text-sm text-white/60">
                  {isConnected ? 'متصل' : 'غير متصل'}
                </span>
              </div>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {players.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center gap-3 sm:gap-4 glass rounded-2xl p-3 sm:p-4"
                >
                  <PlayerAvatar
                    name={player.user_name}
                    color={player.avatar_color}
                    isHost={player.is_host}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-base sm:text-lg truncate">{player.user_name}</p>
                    {player.is_host && (
                      <p className="text-xs sm:text-sm text-yellow-400">المضيف</p>
                    )}
                  </div>
                  <div
                    className={`w-3 h-3 rounded-full flex-shrink-0 ${
                      player.connection_status === 'connected'
                        ? 'bg-green-400'
                        : 'bg-gray-400'
                    }`}
                  ></div>
                </div>
              ))}
            </div>

            <p className="text-center mt-4 text-white/60">
              {players.length} / {game.max_players} لاعبين
            </p>
          </div>
        </div>

        {!isDisplayMode && (
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <LeaveGameButton
              variant="danger"
              size="lg"
              className="flex-1 w-full sm:w-auto"
            />

            {isHost && (
              <GradientButton
                variant="pink"
                onClick={handleStartGame}
                className="flex-1 w-full sm:w-auto"
                disabled={players.length < GAME_CONFIG.MIN_PLAYERS}
              >
                بدأ اللعبة
              </GradientButton>
            )}
          </div>
        )}

        {isDisplayMode && (
          <div className="space-y-3">
            <div className="text-center p-4 bg-secondary-main/20 border border-secondary-main/50 rounded-2xl">
              <p className="text-sm sm:text-base">
                📺 وضع العرض - امسح رمز QR من هاتفك للانضمام كمضيف
              </p>
            </div>
            <GradientButton
              variant="pink"
              onClick={handleStartGame}
              className="w-full"
              disabled={players.length < GAME_CONFIG.MIN_PLAYERS}
            >
              بدأ اللعبة
            </GradientButton>
          </div>
        )}
      </GlassCard>
    </div>
  );
};

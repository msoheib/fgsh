import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { Logo } from '../components/Logo';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { EndRoomButton } from '../components/EndRoomButton';
import { useGameStore } from '@fakash/shared';
import { AnimatedCard, AnimatedCardContainer } from '../components/animations';

export const TVLobby: React.FC = () => {
  const navigate = useNavigate();
  const { game, players, isDisplayMode, isConnected } = useGameStore();

  useEffect(() => {
    // Redirect non-display mode to regular lobby
    if (!isDisplayMode) {
      navigate('/lobby');
      return;
    }

    if (!game) {
      navigate('/');
      return;
    }

    // Navigate to TV game when game starts
    if (game.status === 'playing') {
      navigate('/tv/game');
    }
  }, [game, game?.status, isDisplayMode, navigate]);

  // Polling fallback for game start
  useEffect(() => {
    if (!game || !isDisplayMode || game.status !== 'waiting') {
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        const { GameService, useGameStore } = await import('@fakash/shared');
        const freshGame = await GameService.getGame(game.id);

        if (freshGame?.status === 'playing') {
          useGameStore.setState({ game: freshGame });
          clearInterval(pollInterval);
          navigate('/tv/game');
        }
      } catch (error) {
        console.error('Error polling game status:', error);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [game, isDisplayMode, navigate]);

  if (!game || !isDisplayMode) {
    return null;
  }

  const joinUrl = `${window.location.origin}/join?code=${game.code}`;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gradient-primary relative">
      {/* End Room Button */}
      <div className="absolute top-6 left-6">
        <EndRoomButton size="md" />
      </div>

      <Logo size="lg" className="mb-8" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-6xl"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* QR Code Section */}
          <div className="glass rounded-3xl p-8 text-center">
            <h2 className="text-3xl font-bold mb-6">انضم للعبة</h2>

            <div className="w-64 h-64 mx-auto bg-white rounded-3xl p-4 mb-6">
              <QRCodeSVG
                value={joinUrl}
                size={224}
                level="M"
                className="w-full h-full"
              />
            </div>

            <p className="text-xl text-white/80 mb-4">امسح الكود للانضمام</p>

            <div className="glass rounded-2xl px-8 py-4 inline-block">
              <p className="text-4xl font-bold tracking-widest">{game.code}</p>
            </div>

            <div className="mt-6 flex items-center justify-center gap-2">
              <div
                className={`w-3 h-3 rounded-full ${
                  isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'
                }`}
              />
              <span className="text-sm text-white/60">
                {isConnected ? 'متصل' : 'غير متصل'}
              </span>
            </div>
          </div>

          {/* Players Section */}
          <div className="glass rounded-3xl p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-3xl font-bold">اللاعبين</h2>
              <div className="glass rounded-full px-4 py-2">
                <span className="text-2xl font-bold">
                  {players.length} / {game.max_players}
                </span>
              </div>
            </div>

            {players.length === 0 ? (
              <div className="text-center py-12">
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="text-6xl mb-4"
                >
                  📱
                </motion.div>
                <p className="text-xl text-white/60">في انتظار اللاعبين...</p>
              </div>
            ) : (
              <AnimatedCardContainer className="space-y-3 max-h-[400px] overflow-y-auto">
                {players.map((player: any, index: number) => (
                  <AnimatedCard
                    key={player.id}
                    index={index}
                    className="flex items-center gap-4 glass rounded-2xl p-4"
                  >
                    <PlayerAvatar
                      name={player.user_name}
                      color={player.avatar_color}
                      size="lg"
                    />
                    <div className="flex-1">
                      <p className="font-bold text-xl">{player.user_name}</p>
                      {game.phase_captain_id === player.id && (
                        <p className="text-sm text-yellow-400 flex items-center gap-1">
                          <span>👑</span> قائد اللعبة
                        </p>
                      )}
                    </div>
                    <motion.div
                      animate={player.connection_status === 'connected' ? { scale: [1, 1.2, 1] } : {}}
                      transition={{ duration: 2, repeat: Infinity }}
                      className={`w-4 h-4 rounded-full ${
                        player.connection_status === 'connected'
                          ? 'bg-green-400'
                          : 'bg-gray-400'
                      }`}
                    />
                  </AnimatedCard>
                ))}
              </AnimatedCardContainer>
            )}

            {/* Status message */}
            <div className="mt-6 text-center">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-4 bg-secondary-main/20 border border-secondary-main/50 rounded-2xl"
              >
                <p className="text-lg">
                  Ready to start! Waiting for the controller to press "Start Game"
                </p>
              </motion.div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

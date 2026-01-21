import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { Logo } from '../components/Logo';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { useGameStore, ScoringService } from '@fakash/shared';
import {
  AnimatedCard,
  AnimatedCardContainer,
  ScoreCounter,
  RankDisplay,
  ConfettiTrigger,
  celebrationConfetti,
} from '../components/animations';

// Particle background
const particles = Array.from({ length: 40 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: Math.random() * 8 + 3,
  duration: Math.random() * 15 + 8,
}));

const ParticleBackground: React.FC = () => (
  <div className="fixed inset-0 overflow-hidden pointer-events-none">
    {particles.map((particle) => (
      <motion.div
        key={particle.id}
        className="absolute rounded-full bg-yellow-400/10"
        style={{
          left: `${particle.x}%`,
          top: `${particle.y}%`,
          width: particle.size,
          height: particle.size,
        }}
        animate={{
          y: [0, -100, 0],
          x: [0, Math.random() * 40 - 20, 0],
          opacity: [0.1, 0.3, 0.1],
          scale: [1, 1.2, 1],
        }}
        transition={{
          duration: particle.duration,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
    ))}
  </div>
);

export const TVResults: React.FC = () => {
  const navigate = useNavigate();
  const { game, isDisplayMode } = useGameStore();
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [showCelebration, setShowCelebration] = useState(false);
  const gameIdRef = useRef<string | null>(null);
  const hasLoadedRef = useRef(false);

  // Capture game ID on mount
  useEffect(() => {
    if (game?.id && !gameIdRef.current) {
      gameIdRef.current = game.id;
    }
  }, [game?.id]);

  // Redirect non-display mode
  useEffect(() => {
    if (!isDisplayMode) {
      navigate('/results');
      return;
    }
  }, [isDisplayMode, navigate]);

  useEffect(() => {
    const gameId = game?.id || gameIdRef.current;

    if (!gameId) {
      if (!hasLoadedRef.current) {
        navigate('/');
      }
      return;
    }

    // Fetch final leaderboard
    const fetchLeaderboard = async () => {
      try {
        hasLoadedRef.current = true;
        const data = await ScoringService.getFinalLeaderboard(gameId);
        setLeaderboard(data);
        // Trigger celebration after leaderboard loads
        setTimeout(() => {
          setShowCelebration(true);
          celebrationConfetti();
        }, 500);
      } catch (err) {
        console.error('Failed to fetch leaderboard:', err);
      }
    };

    fetchLeaderboard();
  }, [game, navigate]);

  if (!isDisplayMode) {
    return null;
  }

  // Loading state
  if (leaderboard.length === 0 && !hasLoadedRef.current) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-primary">
        <ParticleBackground />
        <div className="relative z-10 text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            className="w-20 h-20 border-4 border-yellow-400 border-t-transparent rounded-full mx-auto mb-6"
          />
          <p className="text-2xl text-white/80">نحسب النتائج النهائية...</p>
        </div>
      </div>
    );
  }

  const winner = leaderboard[0];
  const joinUrl = `${window.location.origin}/join`;

  const getRankGradient = (rank: number) => {
    switch (rank) {
      case 1:
        return 'bg-gradient-to-r from-yellow-400/40 to-yellow-600/40 border-2 border-yellow-400/60';
      case 2:
        return 'bg-gradient-to-r from-gray-300/30 to-gray-500/30 border border-gray-400/40';
      case 3:
        return 'bg-gradient-to-r from-orange-500/30 to-orange-700/30 border border-orange-500/40';
      default:
        return 'glass';
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-primary">
      <ParticleBackground />

      {showCelebration && <ConfettiTrigger type="celebration" />}

      <div className="relative z-10 p-8 flex flex-col min-h-screen">
        {/* Header */}
        <div className="flex items-center justify-center mb-8">
          <Logo size="lg" />
        </div>

        {/* Winner Announcement */}
        {winner && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.3 }}
            className="text-center mb-12"
          >
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', delay: 0.6 }}
              className="text-8xl mb-6"
            >
              🏆
            </motion.div>
            <h1 className="text-5xl md:text-7xl font-extrabold mb-4">الفائز!</h1>
            <div className="flex items-center justify-center gap-6 mb-4">
              <PlayerAvatar
                name={winner.player.user_name}
                color={winner.player.avatar_color}
                size="lg"
              />
              <p className="text-4xl md:text-5xl font-bold bg-gradient-gold bg-clip-text text-transparent">
                {winner.player.user_name}
              </p>
            </div>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 1 }}
              className="glass rounded-3xl px-10 py-4 inline-block"
            >
              <ScoreCounter value={winner.player.score} size="lg" suffix=" نقطة" />
            </motion.div>
          </motion.div>
        )}

        {/* Leaderboard */}
        <div className="flex-1 flex items-start justify-center">
          <div className="w-full max-w-4xl">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="text-3xl font-bold text-center mb-8"
            >
              لوحة المتصدرين النهائية
            </motion.h2>

            <AnimatedCardContainer className="space-y-4">
              {leaderboard.map(({ player, rank }, index) => (
                <AnimatedCard
                  key={player.id}
                  index={index}
                  className={`flex items-center gap-6 p-6 rounded-3xl ${getRankGradient(rank)}`}
                >
                  <RankDisplay rank={rank} size="lg" />
                  <PlayerAvatar
                    name={player.user_name}
                    color={player.avatar_color}
                    size="lg"
                  />
                  <p className="flex-1 font-bold text-2xl">{player.user_name}</p>
                  <div className="text-left">
                    <ScoreCounter value={player.score} size="lg" />
                    <p className="text-sm text-white/60">نقطة</p>
                  </div>
                </AnimatedCard>
              ))}
            </AnimatedCardContainer>
          </div>
        </div>

        {/* Play Again Section */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.5 }}
          className="mt-8 flex justify-center"
        >
          <div className="glass rounded-3xl p-8 flex items-center gap-8">
            <div className="text-center">
              <p className="text-xl mb-4">العب مرة أخرى!</p>
              <p className="text-white/60">امسح الكود للانضمام للعبة جديدة</p>
            </div>
            <div className="w-32 h-32 bg-white rounded-2xl p-2">
              <QRCodeSVG
                value={joinUrl}
                size={112}
                level="M"
                className="w-full h-full"
              />
            </div>
          </div>
        </motion.div>

        {/* Thank you message */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2 }}
          className="text-center text-xl text-white/60 mt-8"
        >
          شكراً لكم على اللعب! 🎉
        </motion.p>
      </div>
    </div>
  );
};

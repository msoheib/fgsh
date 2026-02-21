import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { Logo } from '../components/Logo';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { EndRoomButton } from '../components/EndRoomButton';
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

type TVResultsLayout = {
  columns: number;
  visiblePlayers: number;
  compact: boolean;
};

function getTVResultsLayout(width: number, height: number): TVResultsLayout {
  // 720p-ish: keep compact cards and fewer rows
  if (height < 800 || width < 1366) {
    return { columns: 2, visiblePlayers: 6, compact: true };
  }
  // 1080p-ish
  if (height < 1300 || width < 2560) {
    return { columns: 2, visiblePlayers: 8, compact: false };
  }
  // 1440p/4K-ish
  return { columns: 3, visiblePlayers: 12, compact: false };
}

export const TVResults: React.FC = () => {
  const navigate = useNavigate();
  const { game, isDisplayMode } = useGameStore();
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [showCelebration, setShowCelebration] = useState(false);
  const [layout, setLayout] = useState<TVResultsLayout>({ columns: 2, visiblePlayers: 8, compact: false });
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

  useEffect(() => {
    const updateLayout = () => {
      setLayout(getTVResultsLayout(window.innerWidth, window.innerHeight));
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, []);

  if (!isDisplayMode) {
    return null;
  }

  // Loading state
  if (leaderboard.length === 0 && !hasLoadedRef.current) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-primary overflow-hidden">
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
  const visibleLeaderboard = leaderboard.slice(0, layout.visiblePlayers);

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
    <div className="h-screen relative overflow-hidden bg-gradient-primary">
      <ParticleBackground />

      {showCelebration && <ConfettiTrigger type="celebration" />}

      <div className="absolute top-4 left-4 z-20">
        <EndRoomButton size="sm" />
      </div>

      <div className="relative z-10 h-full px-4 py-3 md:px-6 md:py-4 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-center mb-3">
          <Logo size="md" />
        </div>

        {/* Winner Announcement */}
        {winner && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.3 }}
            className="text-center mb-4"
          >
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', delay: 0.6 }}
              className="text-5xl mb-2"
            >
              🏆
            </motion.div>
            <h1 className="text-4xl md:text-5xl font-extrabold mb-2">الفائز!</h1>
            <div className="flex items-center justify-center gap-4 mb-2">
              <PlayerAvatar
                name={winner.player.user_name}
                color={winner.player.avatar_color}
                size="md"
              />
              <p className="text-3xl md:text-4xl font-bold bg-gradient-gold bg-clip-text text-transparent">
                {winner.player.user_name}
              </p>
            </div>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 1 }}
              className="glass rounded-2xl px-6 py-2 inline-block"
            >
              <ScoreCounter value={winner.player.score} size="md" suffix=" نقطة" />
            </motion.div>
          </motion.div>
        )}

        {/* Leaderboard */}
        <div className="flex-1 min-h-0 flex items-start justify-center overflow-hidden">
          <div className={`w-full ${layout.columns >= 3 ? 'max-w-6xl' : 'max-w-4xl'}`}>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="text-2xl font-bold text-center mb-3"
            >
              لوحة المتصدرين النهائية
            </motion.h2>

            <AnimatedCardContainer
              className={`grid ${layout.columns >= 3 ? 'grid-cols-3' : 'grid-cols-2'} ${layout.compact ? 'gap-1.5' : 'gap-2'}`}
            >
              {visibleLeaderboard.map(({ player, rank }, index) => (
                <AnimatedCard
                  key={player.id}
                  index={index}
                  className={`flex items-center ${layout.compact ? 'gap-2 p-2 rounded-lg' : 'gap-3 p-2.5 rounded-xl'} ${getRankGradient(rank)}`}
                >
                  <RankDisplay rank={rank} size="sm" />
                  <PlayerAvatar
                    name={player.user_name}
                    color={player.avatar_color}
                    size="sm"
                  />
                  <p className={`flex-1 font-bold truncate ${layout.compact ? 'text-base' : 'text-lg'}`}>{player.user_name}</p>
                  <div className="text-left">
                    <ScoreCounter value={player.score} size="sm" />
                    <p className="text-xs text-white/60">نقطة</p>
                  </div>
                </AnimatedCard>
              ))}
            </AnimatedCardContainer>
            {leaderboard.length > visibleLeaderboard.length && (
              <p className="text-center text-sm text-white/60 mt-2">
                يتم عرض أعلى {visibleLeaderboard.length} لاعبين على شاشة التلفاز
              </p>
            )}
          </div>
        </div>

        {/* Play Again Section */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.5 }}
          className="mt-3 flex justify-center"
        >
          <div className="glass rounded-2xl p-4 flex items-center gap-4">
            <div className="text-center">
              <p className="text-lg mb-1">العب مرة أخرى!</p>
              <p className="text-sm text-white/60">امسح الكود للانضمام للعبة جديدة</p>
            </div>
            <div className="w-20 h-20 bg-white rounded-xl p-1.5">
              <QRCodeSVG
                value={joinUrl}
                size={68}
                level="M"
                className="w-full h-full"
              />
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

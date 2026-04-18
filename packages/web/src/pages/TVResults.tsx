import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Logo } from '../components/Logo';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { EndRoomButton } from '../components/EndRoomButton';
import {
  ConfettiTrigger,
  celebrationConfetti,
} from '../components/animations';
import { useGameStore, useRoundStore, ScoringService, getSupabase } from '@fakash/shared';

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
  if (height < 800 || width < 1366) {
    return { columns: 2, visiblePlayers: 6, compact: true };
  }
  if (height < 1300 || width < 2560) {
    return { columns: 2, visiblePlayers: 8, compact: false };
  }
  return { columns: 3, visiblePlayers: 12, compact: false };
}

export const TVResults: React.FC = () => {
  const navigate = useNavigate();
  const { game, isDisplayMode } = useGameStore();
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [showCelebration, setShowCelebration] = useState(false);
  const [layout, setLayout] = useState<TVResultsLayout>({ columns: 2, visiblePlayers: 8, compact: false });
  const [victoryCueUrl, setVictoryCueUrl] = useState<string | null>(null);
  const gameIdRef = useRef<string | null>(null);
  const hasLoadedRef = useRef(false);
  const hasPlayedVictoryRef = useRef(false);

  useEffect(() => {
    if (game?.id && !gameIdRef.current) {
      gameIdRef.current = game.id;
    }
  }, [game?.id]);

  useEffect(() => {
    if (!isDisplayMode) {
      navigate('/results', { replace: true });
    }
  }, [isDisplayMode, navigate]);

  useEffect(() => {
    const activeGameId = game?.id || gameIdRef.current;
    if (!activeGameId) {
      if (!hasLoadedRef.current) {
        navigate('/');
      }
      return;
    }

    if (game?.status === 'waiting') {
      useRoundStore.getState().reset();
      navigate('/tv/lobby', { replace: true });
      return;
    }

    if (game?.status === 'playing') {
      navigate('/tv/game', { replace: true });
      return;
    }

    const fetchLeaderboard = async () => {
      try {
        hasLoadedRef.current = true;
        const data = await ScoringService.getFinalLeaderboard(activeGameId);
        setLeaderboard(data);
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

  useEffect(() => {
    let cancelled = false;

    const loadVictoryCue = async () => {
      try {
        const supabase = getSupabase();
        const { data, error } = await supabase
          .from('game_audio_cues')
          .select('audio_url, is_active')
          .eq('cue_key', 'game_end_victory')
          .maybeSingle();

        if (error) {
          console.warn('Failed to fetch victory cue:', error);
          return;
        }

        if (!cancelled && data?.is_active && data.audio_url) {
          setVictoryCueUrl(data.audio_url);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('Failed to fetch victory cue:', err);
        }
      }
    };

    loadVictoryCue();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!showCelebration || !victoryCueUrl || hasPlayedVictoryRef.current) {
      return;
    }

    const audio = new Audio(victoryCueUrl);
    audio.preload = 'auto';
    hasPlayedVictoryRef.current = true;
    void audio.play().catch((err) => {
      console.warn('Victory cue could not autoplay:', err);
    });
  }, [showCelebration, victoryCueUrl]);

  if (!isDisplayMode) {
    return null;
  }

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

  const topPlayers = leaderboard.filter(({ rank }) => rank === 1);
  const winner = topPlayers[0] || leaderboard[0];
  const hasSharedWinner = topPlayers.length > 1;
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
        <div className="flex items-center justify-center mb-3">
          <Logo size="md" />
        </div>

        {winner && !hasSharedWinner && (
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
            <div className="glass rounded-2xl px-6 py-2 inline-block">
              <p className="text-2xl font-black">{winner.player.score} نقطة</p>
            </div>
          </motion.div>
        )}

        {hasSharedWinner && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 180, damping: 18, delay: 0.3 }}
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
            <h1 className="text-3xl md:text-4xl font-extrabold mb-3">تعادل في الصدارة</h1>
            <div className="flex flex-wrap items-center justify-center gap-4 mb-3">
              {topPlayers.map(({ player }) => (
                <div key={player.id} className="flex items-center gap-3 glass rounded-2xl px-4 py-3">
                  <PlayerAvatar name={player.user_name} color={player.avatar_color} size="sm" />
                  <p className="text-xl font-bold">{player.user_name}</p>
                  <p className="text-lg font-black">{player.score} نقطة</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

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

            <div className={`grid ${layout.columns >= 3 ? 'grid-cols-3' : 'grid-cols-2'} ${layout.compact ? 'gap-1.5' : 'gap-2'}`}>
              {visibleLeaderboard.map(({ player, rank }, index) => (
                <motion.div
                  key={player.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 + index * 0.08 }}
                  className={`flex items-center ${layout.compact ? 'gap-2 p-2 rounded-lg' : 'gap-3 p-2.5 rounded-xl'} ${getRankGradient(rank)}`}
                >
                  <div className="text-xl font-black w-10 text-center">{rank}</div>
                  <PlayerAvatar name={player.user_name} color={player.avatar_color} size="sm" />
                  <p className={`flex-1 font-bold truncate ${layout.compact ? 'text-base' : 'text-lg'}`}>{player.user_name}</p>
                  <div className="text-left">
                    <p className="font-black">{player.score}</p>
                    <p className="text-xs text-white/60">نقطة</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2 }}
          className="mt-3 flex justify-center"
        >
          <div className="glass rounded-2xl p-4 text-center">
            <p className="text-lg mb-1">إعادة نفس الغرفة</p>
            <p className="text-sm text-white/60">
              سيعود الجميع تلقائيًا إلى اللوبي بنفس اللاعبين عندما يعيد مسؤول الجولة تشغيل اللعبة.
            </p>
            {game?.code && (
              <p className="text-base font-mono mt-2 text-white/80">الكود نفسه: {game.code}</p>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

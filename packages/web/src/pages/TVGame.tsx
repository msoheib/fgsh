import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Logo } from '../components/Logo';
import { useGameStore, useRoundStore } from '@fakash/shared';
import {
  QuestionReveal,
  AnimatedCard,
  AnimatedCardContainer,
  ScoreCounter,
  RankDisplay,
  ConfettiTrigger,
  useConfetti,
} from '../components/animations';

// Particle background for TV display
const particles = Array.from({ length: 30 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: Math.random() * 6 + 2,
  duration: Math.random() * 20 + 10,
}));

const ParticleBackground: React.FC = () => (
  <div className="fixed inset-0 overflow-hidden pointer-events-none">
    {particles.map((particle) => (
      <motion.div
        key={particle.id}
        className="absolute rounded-full bg-white/5"
        style={{
          left: `${particle.x}%`,
          top: `${particle.y}%`,
          width: particle.size,
          height: particle.size,
        }}
        animate={{
          y: [0, -150, 0],
          x: [0, Math.random() * 60 - 30, 0],
          opacity: [0.05, 0.2, 0.05],
        }}
        transition={{
          duration: particle.duration,
          repeat: Infinity,
          ease: 'linear',
        }}
      />
    ))}
  </div>
);

// Large TV Timer
const TVTimer: React.FC<{ timeRemaining: number; duration: number }> = ({
  timeRemaining,
  duration,
}) => {
  const isUrgent = timeRemaining <= 10;
  const progress = (timeRemaining / duration) * 100;

  return (
    <motion.div
      className="w-full max-w-2xl mx-auto mb-8"
      animate={isUrgent ? { scale: [1, 1.02, 1] } : {}}
      transition={isUrgent ? { duration: 0.5, repeat: Infinity } : {}}
    >
      <div className="h-6 bg-white/10 rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${
            isUrgent
              ? 'bg-gradient-to-r from-red-500 to-orange-500'
              : 'bg-gradient-to-r from-secondary-main to-secondary-light'
          }`}
          initial={{ width: '100%' }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
      <motion.p
        className={`text-center mt-3 text-4xl font-bold ${
          isUrgent ? 'text-red-400' : 'text-white'
        }`}
        animate={isUrgent ? { scale: [1, 1.15, 1] } : {}}
        transition={isUrgent ? { duration: 0.3, repeat: Infinity } : {}}
      >
        {timeRemaining}
      </motion.p>
    </motion.div>
  );
};

// TV Scoreboard
const TVScoreboard: React.FC<{ players: Array<{ id: string; user_name: string; score: number; avatar_color?: string }> }> = ({
  players,
}) => {
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  return (
    <div className="w-full max-w-3xl mx-auto">
      <motion.h3
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-3xl font-bold text-center mb-8"
      >
        لوحة المتصدرين
      </motion.h3>
      <AnimatedCardContainer className="space-y-4">
        {sortedPlayers.slice(0, 5).map((player, index) => (
          <AnimatedCard
            key={player.id}
            index={index}
            className={`flex items-center justify-between p-6 rounded-3xl ${
              index === 0
                ? 'bg-gradient-to-r from-yellow-500/30 to-yellow-600/30 border-2 border-yellow-500/50'
                : index === 1
                ? 'bg-gradient-to-r from-gray-400/20 to-gray-500/20 border border-gray-400/30'
                : index === 2
                ? 'bg-gradient-to-r from-orange-600/20 to-orange-700/20 border border-orange-600/30'
                : 'glass'
            }`}
          >
            <div className="flex items-center gap-6">
              <RankDisplay rank={index + 1} size="lg" />
              <span className="text-2xl font-bold">{player.user_name}</span>
            </div>
            <ScoreCounter value={player.score} size="lg" suffix=" نقطة" />
          </AnimatedCard>
        ))}
      </AnimatedCardContainer>
    </div>
  );
};

export const TVGame: React.FC = () => {
  const navigate = useNavigate();
  const { game, players, isDisplayMode, rehydrationAttempted } = useGameStore();
  const {
    currentRound,
    question,
    roundStatus,
    allAnswers,
    timeRemaining,
    setTimeRemaining,
    timerActive,
    setTimerActive,
  } = useRoundStore();

  const [showConfetti, setShowConfetti] = useState(false);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const confetti = useConfetti();

  // Show confetti when round completes
  useEffect(() => {
    if (roundStatus === 'completed') {
      setShowConfetti(true);
      confetti.burst();
      const timer = setTimeout(() => setShowConfetti(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [roundStatus]);

  // Redirect non-display mode to regular game
  useEffect(() => {
    if (!rehydrationAttempted) return;

    if (!isDisplayMode) {
      navigate('/game');
      return;
    }

    if (!game) {
      navigate('/');
      return;
    }

    if (game.status === 'finished') {
      navigate('/tv/results');
      return;
    }

    if (game.status === 'waiting') {
      navigate('/tv/lobby');
      return;
    }
  }, [game, isDisplayMode, navigate, rehydrationAttempted]);

  // Timer countdown
  useEffect(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (!currentRound || !timerActive || timeRemaining <= 0) {
      return;
    }

    timerIntervalRef.current = setInterval(() => {
      const newTime = useRoundStore.getState().timeRemaining - 1;
      if (newTime <= 0) {
        setTimeRemaining(0);
        setTimerActive(false);
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
      } else {
        setTimeRemaining(newTime);
      }
    }, 1000);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [currentRound?.id, timerActive, setTimeRemaining, setTimerActive]);

  // Refresh scores when round completes
  useEffect(() => {
    const syncScores = async () => {
      if (!game || roundStatus !== 'completed') return;
      try {
        const { GameService } = await import('@fakash/shared');
        const updatedPlayers = await GameService.getGamePlayers(game.id);
        useGameStore.setState({ players: updatedPlayers });
      } catch (err) {
        console.error('Failed to refresh scores:', err);
      }
    };

    syncScores();
  }, [game, roundStatus]);

  if (!game || !isDisplayMode) {
    return null;
  }

  // Loading state
  if (!currentRound || !question) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-primary">
        <ParticleBackground />
        <div className="relative z-10 text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            className="w-20 h-20 border-4 border-white border-t-transparent rounded-full mx-auto mb-6"
          />
          <p className="text-2xl text-white/80">جارٍ تحميل الجولة...</p>
        </div>
      </div>
    );
  }

  const submittedCount = players.filter((p) =>
    allAnswers.some((a) => a.player_id === p.id)
  ).length;

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-primary">
      <ParticleBackground />

      {showConfetti && <ConfettiTrigger type="celebration" />}

      <div className="relative z-10 p-8 flex flex-col min-h-screen">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Logo size="md" />
          <div className="glass rounded-2xl px-6 py-3">
            <span className="text-2xl font-bold">
              الجولة {currentRound.round_number} / {game.round_count}
            </span>
          </div>
          <div className="glass rounded-2xl px-6 py-3">
            <span className="text-lg text-white/60">كود: </span>
            <span className="text-xl font-bold">{game.code}</span>
          </div>
        </div>

        {/* Timer - only show during active phases */}
        {(roundStatus === 'answering' || roundStatus === 'voting') && (
          <TVTimer timeRemaining={timeRemaining} duration={currentRound.timer_duration} />
        )}

        {/* Main content area */}
        <div className="flex-1 flex items-center justify-center">
          <AnimatePresence mode="wait">
            {/* Answering Phase */}
            {roundStatus === 'answering' && (
              <motion.div
                key="answering"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-5xl text-center"
              >
                <QuestionReveal question={question.question_text} size="tv" showEmoji />

                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8 }}
                  className="mt-16"
                >
                  <p className="text-3xl text-white/80 mb-4">
                    في انتظار إجابات اللاعبين...
                  </p>
                  <div className="glass rounded-3xl px-12 py-6 inline-block">
                    <span className="text-6xl font-bold text-secondary-main">
                      {submittedCount}
                    </span>
                    <span className="text-4xl text-white/60"> / {players.length}</span>
                  </div>
                </motion.div>
              </motion.div>
            )}

            {/* Voting Phase */}
            {roundStatus === 'voting' && (
              <motion.div
                key="voting"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-5xl"
              >
                <QuestionReveal question={question.question_text} size="large" />

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="mt-12"
                >
                  <h3 className="text-3xl font-bold text-center mb-8">
                    الإجابات المقدمة - صوّت للصحيحة!
                  </h3>
                  <AnimatedCardContainer className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {allAnswers.map((answer, index) => (
                      <AnimatedCard
                        key={answer.id}
                        index={index}
                        className="p-8 glass rounded-3xl text-center"
                      >
                        <p className="text-3xl font-bold">{answer.answer_text}</p>
                      </AnimatedCard>
                    ))}
                  </AnimatedCardContainer>
                </motion.div>
              </motion.div>
            )}

            {/* Completed Phase */}
            {roundStatus === 'completed' && (
              <motion.div
                key="completed"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-5xl"
              >
                {/* Correct Answer Reveal */}
                <motion.div
                  initial={{ scale: 0.5, opacity: 0, rotateY: -90 }}
                  animate={{ scale: 1, opacity: 1, rotateY: 0 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                  className="mb-12 p-10 bg-gradient-to-br from-secondary-main to-secondary-light rounded-3xl text-center shadow-glow-cyan"
                >
                  <p className="text-2xl mb-4 text-white/80">الإجابة الصحيحة</p>
                  <p className="text-5xl md:text-6xl font-bold">
                    {question.correct_answer}
                  </p>
                </motion.div>

                {/* Scoreboard */}
                <TVScoreboard players={players} />

                {/* Waiting message */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1 }}
                  className="mt-8 text-center"
                >
                  <p className="text-xl text-white/60">
                    في انتظار قائد اللعبة للانتقال للجولة التالية...
                  </p>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

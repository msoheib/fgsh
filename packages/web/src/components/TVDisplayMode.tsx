import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QuestionReveal } from './animations/QuestionReveal';
import { AnimatedCard, AnimatedCardContainer } from './animations/AnimatedCard';
import { ScoreCounter, RankDisplay } from './animations/ScoreCounter';
import { ConfettiTrigger } from './animations/Confetti';

interface TVDisplayModeProps {
  game: {
    id: string;
    code: string;
    current_round: number;
    round_count: number;
    status: string;
  };
  question?: {
    question_text: string;
    correct_answer: string;
  };
  roundStatus: 'answering' | 'voting' | 'completed' | string;
  allAnswers: Array<{
    id: string;
    answer_text: string;
    player_id: string;
    is_correct?: boolean;
  }>;
  players: Array<{
    id: string;
    user_name: string;
    score: number;
    avatar_color?: string;
  }>;
  timeRemaining: number;
  timerDuration: number;
  submittedCount: number;
}

// Background particle animation
const particles = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: Math.random() * 4 + 2,
  duration: Math.random() * 20 + 10,
}));

const ParticleBackground: React.FC = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none">
    {particles.map((particle) => (
      <motion.div
        key={particle.id}
        className="absolute rounded-full bg-white/10"
        style={{
          left: `${particle.x}%`,
          top: `${particle.y}%`,
          width: particle.size,
          height: particle.size,
        }}
        animate={{
          y: [0, -100, 0],
          x: [0, Math.random() * 50 - 25, 0],
          opacity: [0.1, 0.3, 0.1],
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

// Timer with urgency animation
const TVTimer: React.FC<{ timeRemaining: number; duration: number }> = ({
  timeRemaining,
  duration,
}) => {
  const isUrgent = timeRemaining <= 10;
  const progress = (timeRemaining / duration) * 100;

  return (
    <motion.div
      className="relative w-full max-w-md mx-auto mb-8"
      animate={isUrgent ? { scale: [1, 1.02, 1] } : {}}
      transition={isUrgent ? { duration: 0.5, repeat: Infinity } : {}}
    >
      <div className="h-4 bg-white/10 rounded-full overflow-hidden">
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
        className={`text-center mt-2 text-2xl font-bold ${
          isUrgent ? 'text-red-400' : 'text-white'
        }`}
        animate={isUrgent ? { scale: [1, 1.1, 1] } : {}}
        transition={isUrgent ? { duration: 0.3, repeat: Infinity } : {}}
      >
        {timeRemaining}
      </motion.p>
    </motion.div>
  );
};

// Scoreboard with animations
const TVScoreboard: React.FC<{ players: TVDisplayModeProps['players'] }> = ({
  players,
}) => {
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  return (
    <div className="w-full max-w-2xl mx-auto">
      <motion.h3
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-2xl font-bold text-center mb-6"
      >
        🏆 لوحة المتصدرين
      </motion.h3>
      <AnimatedCardContainer className="space-y-3">
        {sortedPlayers.slice(0, 5).map((player, index) => (
          <AnimatedCard
            key={player.id}
            index={index}
            className={`flex items-center justify-between p-4 rounded-2xl ${
              index === 0
                ? 'bg-gradient-to-r from-yellow-500/30 to-yellow-600/30 border border-yellow-500/50'
                : 'glass'
            }`}
          >
            <div className="flex items-center gap-4">
              <RankDisplay rank={index + 1} size="lg" />
              <span className="text-xl font-bold">{player.user_name}</span>
            </div>
            <ScoreCounter value={player.score} size="lg" suffix=" نقطة" />
          </AnimatedCard>
        ))}
      </AnimatedCardContainer>
    </div>
  );
};

// Main TV Display Mode Component
export const TVDisplayMode: React.FC<TVDisplayModeProps> = ({
  game,
  question,
  roundStatus,
  allAnswers,
  players,
  timeRemaining,
  timerDuration,
  submittedCount,
}) => {
  const [showConfetti, setShowConfetti] = useState(false);

  // Show confetti when round completes
  useEffect(() => {
    if (roundStatus === 'completed') {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [roundStatus]);

  return (
    <div className="min-h-screen relative overflow-hidden">
      <ParticleBackground />
      
      {showConfetti && <ConfettiTrigger type="celebration" />}

      <div className="relative z-10 p-8 flex flex-col items-center justify-center min-h-screen">
        {/* Game Info Header */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <p className="text-3xl font-bold mb-2">
            الجولة {game.current_round} / {game.round_count}
          </p>
          <p className="text-xl text-white/60">كود اللعبة: {game.code}</p>
        </motion.div>

        {/* Timer */}
        {(roundStatus === 'answering' || roundStatus === 'voting') && (
          <TVTimer timeRemaining={timeRemaining} duration={timerDuration} />
        )}

        {/* Content based on round status */}
        <AnimatePresence mode="wait">
          {/* Answering Phase */}
          {roundStatus === 'answering' && question && (
            <motion.div
              key="answering"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-4xl"
            >
              <QuestionReveal question={question.question_text} size="tv" />
              
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="text-center mt-12"
              >
                <p className="text-2xl text-white/80">
                  📝 في انتظار إجابات اللاعبين...
                </p>
                <p className="text-4xl font-bold mt-4">
                  {submittedCount} / {players.length}
                </p>
              </motion.div>
            </motion.div>
          )}

          {/* Voting Phase */}
          {roundStatus === 'voting' && question && (
            <motion.div
              key="voting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-4xl"
            >
              <QuestionReveal question={question.question_text} size="large" />
              
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="mt-8"
              >
                <h3 className="text-2xl font-bold text-center mb-6">
                  🗳️ الإجابات المقدمة
                </h3>
                <AnimatedCardContainer className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {allAnswers.map((answer, index) => (
                    <AnimatedCard
                      key={answer.id}
                      index={index}
                      className="p-6 glass rounded-2xl text-center"
                    >
                      <p className="text-2xl font-bold">{answer.answer_text}</p>
                    </AnimatedCard>
                  ))}
                </AnimatedCardContainer>
              </motion.div>
            </motion.div>
          )}

          {/* Completed Phase - Show Answer & Scores */}
          {roundStatus === 'completed' && question && (
            <motion.div
              key="completed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-4xl"
            >
              {/* Correct Answer Reveal */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                className="mb-12 p-8 bg-gradient-to-br from-secondary-main to-secondary-light rounded-3xl text-center"
              >
                <p className="text-2xl mb-3">الإجابة الصحيحة</p>
                <p className="text-4xl md:text-5xl font-bold">
                  {question.correct_answer}
                </p>
              </motion.div>

              {/* Scoreboard */}
              <TVScoreboard players={players} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

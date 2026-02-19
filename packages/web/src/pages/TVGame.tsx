import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Logo } from '../components/Logo';
import { EndRoomButton } from '../components/EndRoomButton';
import { useGameStore, useRoundStore, RoundService, getRoundMultiplier, GAME_CONFIG } from '@fakash/shared';
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
        🏆 لوحة المتصدرين
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

// Answer Reveal Card - for iterative reveal
interface RevealAnswer {
  id: string;
  text: string;
  isCorrect: boolean;
  authorId: string | null;
  authorName: string | null;
  voters: Array<{ id: string; name: string }>;
  voteCount: number;
}

function normalizeAnswerKey(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function getStageInfo(roundNumber: number): { stageNumber: number; questionInStage: number; totalQuestionsInStage: number } {
  if (roundNumber <= 3) {
    return { stageNumber: 1, questionInStage: roundNumber, totalQuestionsInStage: 3 };
  }
  if (roundNumber <= 6) {
    return { stageNumber: 2, questionInStage: roundNumber - 3, totalQuestionsInStage: 3 };
  }
  return { stageNumber: 3, questionInStage: 1, totalQuestionsInStage: 1 };
}

const AnswerRevealCard: React.FC<{ answer: RevealAnswer; isActive: boolean }> = ({
  answer,
  isActive,
}) => {
  const confetti = useConfetti();

  useEffect(() => {
    if (isActive && answer.isCorrect && answer.voteCount > 0) {
      confetti.burst();
    }
  }, [isActive, answer.isCorrect, answer.voteCount]);

  if (!isActive) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, rotateX: -30 }}
      animate={{ opacity: 1, scale: 1, rotateX: 0 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      className="w-full max-w-4xl mx-auto"
    >
      {/* The Answer */}
      <motion.div
        className={`p-10 rounded-3xl text-center mb-8 ${
          answer.isCorrect
            ? 'bg-gradient-to-br from-green-500 to-green-600 shadow-glow-cyan'
            : 'bg-gradient-to-br from-pink-500/80 to-purple-600/80'
        }`}
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2 }}
      >
        <p className="text-5xl md:text-6xl font-bold mb-4">{answer.text}</p>
        {answer.isCorrect ? (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-3xl"
          >
            ✅ الإجابة الصحيحة!
          </motion.p>
        ) : (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-3xl"
          >
            🎭 كذبة بواسطة: <span className="font-bold">{answer.authorName}</span>
          </motion.p>
        )}
      </motion.div>

      {/* Who voted for this */}
      {answer.voteCount > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="text-center"
        >
          <p className="text-2xl mb-4 text-white/80">
            {answer.isCorrect ? '✅ أصابوا الإجابة:' : '😵 وقعوا في الفخ:'}
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            {answer.voters.map((voter, idx) => (
              <motion.div
                key={voter.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1 + idx * 0.2 }}
                className={`px-6 py-3 rounded-2xl text-xl font-bold ${
                  answer.isCorrect
                    ? 'bg-green-500/30 border border-green-500/50'
                    : 'bg-red-500/30 border border-red-500/50'
                }`}
              >
                {voter.name}
              </motion.div>
            ))}
          </div>
          {!answer.isCorrect && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5 }}
              className="mt-6 text-2xl text-yellow-400"
            >
              🎯 {answer.authorName} يكسب {answer.voteCount * 500} نقطة!
            </motion.p>
          )}
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="text-center text-2xl text-white/60"
        >
          لم يصوت أحد لهذه الإجابة
        </motion.div>
      )}
    </motion.div>
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
  const [isRevealing, setIsRevealing] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [revealData, setRevealData] = useState<RevealAnswer[]>([]);
  const [currentRevealIndex, setCurrentRevealIndex] = useState(0);
  const [revealComplete, setRevealComplete] = useState(false);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const revealForRoundIdRef = useRef<string | null>(null); // Track which round reveal is for
  const confetti = useConfetti();
  const stageInfo = currentRound ? getStageInfo(currentRound.round_number) : null;

  const combinedAnswers = useMemo(() => {
    const grouped = new Map<string, { id: string; answer_text: string }>();
    for (const answer of allAnswers) {
      const key = normalizeAnswerKey(answer.answer_text);
      if (!grouped.has(key)) {
        grouped.set(key, { id: answer.id, answer_text: answer.answer_text });
      }
    }
    return Array.from(grouped.values());
  }, [allAnswers]);

  const recoverRoundState = useCallback(async () => {
    if (!game || game.status !== 'playing' || isRecovering) return;

    setIsRecovering(true);
    try {
      const { RoundService, getSupabase } = await import('@fakash/shared');
      const round = await RoundService.getCurrentRound(game.id);

      if (!round) return;

      let recoveredQuestion = round.question;
      if (!recoveredQuestion) {
        const supabase = getSupabase();
        const { data: questionData } = await supabase
          .from('questions')
          .select('*')
          .eq('id', round.question_id)
          .maybeSingle();
        recoveredQuestion = questionData || undefined;
      }

      if (!recoveredQuestion) return;

      const answers = round.status === 'voting' || round.status === 'completed'
        ? await RoundService.getRoundAnswers(round.id)
        : [];

      const startTime = round.timer_starts_at
        ? new Date(round.timer_starts_at).getTime()
        : Date.now();
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.max(0, round.timer_duration - elapsed);

      useRoundStore.setState({
        currentRound: round,
        question: recoveredQuestion,
        roundNumber: round.round_number,
        roundStatus: round.status,
        timeRemaining: remaining,
        timerActive: round.status !== 'completed' && remaining > 0,
        allAnswers: answers,
        playerAnswers: new Map(),
        myAnswer: null,
        hasSubmittedAnswer: false,
        myVote: null,
        hasSubmittedVote: false,
        totalRounds: game.round_count,
        isLoading: false,
      });
    } catch (err) {
      console.error('TV recovery failed:', err);
    } finally {
      setIsRecovering(false);
    }
  }, [game, isRecovering]);

  // Fetch reveal data when round completes
  useEffect(() => {
    const fetchRevealData = async () => {
      // Only fetch if:
      // 1. Round status is completed
      // 2. We have a currentRound
      // 3. We haven't started revealing for THIS round yet
      // 4. This is a different round than what we already revealed for
      if (
        roundStatus === 'completed' && 
        currentRound && 
        !isRevealing && 
        revealForRoundIdRef.current !== currentRound.id
      ) {
        try {
          console.log('🎭 Starting reveal for round:', currentRound.id);
          revealForRoundIdRef.current = currentRound.id;
          const data = await RoundService.getRoundRevealData(currentRound.id);
          setRevealData(data.answers);
          setIsRevealing(true);
          setCurrentRevealIndex(0);
          setRevealComplete(false);
        } catch (err) {
          console.error('Failed to fetch reveal data:', err);
          setRevealComplete(true);
        }
      }
    };
    fetchRevealData();
  }, [roundStatus, currentRound?.id, isRevealing]);

  // Auto-advance reveal
  useEffect(() => {
    if (!isRevealing || revealData.length === 0) return;

    const timer = setTimeout(() => {
      if (currentRevealIndex < revealData.length - 1) {
        setCurrentRevealIndex((prev) => prev + 1);
      } else {
        // Reveal complete, show scoreboard
        setIsRevealing(false);
        setRevealComplete(true);
        setShowConfetti(true);
        confetti.celebration();
        setTimeout(() => setShowConfetti(false), 5000);
      }
    }, GAME_CONFIG.TV_REVEAL_STEP_MS);

    return () => clearTimeout(timer);
  }, [isRevealing, currentRevealIndex, revealData.length]);

  // Reset reveal state when NEW round starts (round ID changes)
  useEffect(() => {
    if (currentRound && revealForRoundIdRef.current !== currentRound.id) {
      // New round detected - reset reveal state
      console.log('🔄 New round detected, resetting reveal state');
      setIsRevealing(false);
      setRevealData([]);
      setCurrentRevealIndex(0);
      setRevealComplete(false);
      // Note: revealForRoundIdRef will be set when completed phase triggers reveal
    }
  }, [currentRound?.id]);

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

  // Refresh scores when reveal is complete
  useEffect(() => {
    const syncScores = async () => {
      if (!game || !revealComplete) return;
      try {
        const { GameService } = await import('@fakash/shared');
        const updatedPlayers = await GameService.getGamePlayers(game.id);
        useGameStore.setState({ players: updatedPlayers });
      } catch (err) {
        console.error('Failed to refresh scores:', err);
      }
    };

    syncScores();
  }, [game, revealComplete]);

  // Recovery mechanism: self-heal if stuck on loader
  useEffect(() => {
    if (!game || game.status !== 'playing' || (currentRound && question) || isRecovering) return;
    const timer = setTimeout(() => recoverRoundState(), 2500);
    return () => clearTimeout(timer);
  }, [game, currentRound, question, isRecovering, recoverRoundState]);

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
          {isRecovering && <p className="text-sm text-white/60 mt-3">جارٍ الاستعادة...</p>}
        </div>
      </div>
    );
  }

  const submittedCount = players.filter((p: { id: string }) =>
    allAnswers.some((a: { player_id: string | null }) => a.player_id === p.id)
  ).length;

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-primary">
      <ParticleBackground />

      {showConfetti && <ConfettiTrigger type="celebration" />}

      <div className="relative z-10 p-8 flex flex-col min-h-screen">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Logo size="md" />
            <EndRoomButton size="sm" />
          </div>
          <div className="flex gap-4">
            {getRoundMultiplier(currentRound.round_number, game.round_count) > 1 && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={`glass px-6 py-3 rounded-2xl border-2 ${
                  getRoundMultiplier(currentRound.round_number, game.round_count) === 3
                    ? 'border-red-500 bg-red-500/20'
                    : 'border-yellow-400 bg-yellow-400/20'
                }`}
              >
                <span className={`text-xl font-bold ${
                  getRoundMultiplier(currentRound.round_number, game.round_count) === 3
                    ? 'text-red-400'
                    : 'text-yellow-400'
                }`}>
                  {getRoundMultiplier(currentRound.round_number, game.round_count) === 3
                    ? '🔥🔥 نقاط ثلاثية!'
                    : '🔥 نقاط مضاعفة!'}
                </span>
              </motion.div>
            )}
            <div className="glass rounded-2xl px-6 py-3">
              <span className="text-2xl font-bold">
                الجولة {stageInfo?.stageNumber ?? 1} / 3 • سؤال {stageInfo?.questionInStage ?? 1} / {stageInfo?.totalQuestionsInStage ?? 1}
              </span>
            </div>
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
                {/* Phase instruction */}
                <motion.p
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-4xl font-bold text-pink-400 mb-8"
                >
                  🎭 اكتب كذبة مقنعة!
                </motion.p>

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
                {/* Phase instruction */}
                <motion.p
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-4xl font-bold text-cyan-400 mb-8 text-center"
                >
                  🗳️ صوّت للإجابة الصحيحة!
                </motion.p>

                <QuestionReveal question={question.question_text} size="large" />

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="mt-12"
                >
                  <h3 className="text-3xl font-bold text-center mb-8">
                    الإجابات المقدمة
                  </h3>
                  <AnimatedCardContainer className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {combinedAnswers.map((answer, index: number) => (
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

            {/* Revealing Phase - Iterative answer reveal */}
            {roundStatus === 'completed' && isRevealing && revealData.length > 0 && (
              <motion.div
                key="revealing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full"
              >
                {/* Progress indicator */}
                <motion.div className="text-center mb-8">
                  <p className="text-2xl text-white/60">
                    الإجابة {currentRevealIndex + 1} من {revealData.length}
                  </p>
                </motion.div>

                <AnimatePresence mode="wait">
                  <AnswerRevealCard
                    key={revealData[currentRevealIndex].id}
                    answer={revealData[currentRevealIndex]}
                    isActive={true}
                  />
                </AnimatePresence>
              </motion.div>
            )}

            {/* Completed Phase - Scoreboard */}
            {roundStatus === 'completed' && revealComplete && (
              <motion.div
                key="completed"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-5xl"
              >
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


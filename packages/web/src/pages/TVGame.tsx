import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Logo } from '../components/Logo';
import { EndRoomButton } from '../components/EndRoomButton';
import {
  useGameStore,
  useRoundStore,
  RoundService,
  getRoundMultiplier,
  GAME_CONFIG,
  GAME_AUDIO_CUE_DEFINITIONS,
  type GameAudioCueKey,
} from '@fakash/shared';
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

const ParticleBackground: React.FC<{ phase?: string }> = ({ phase }) => {
  const isVoting = phase === 'voting';
  const isCompleted = phase === 'completed';
  const colorClass = isCompleted ? 'bg-yellow-400/10' : isVoting ? 'bg-red-400/10' : 'bg-white/5';
  const speedMult = isVoting ? 0.5 : isCompleted ? 0.8 : 1;

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none transition-colors duration-1000">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className={`absolute rounded-full ${colorClass}`}
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            width: particle.size,
            height: particle.size,
          }}
          animate={{
            y: [0, -150, 0],
            x: [0, Math.random() * 60 - 30, 0],
            opacity: [0.05, 0.3, 0.05],
          }}
          transition={{
            duration: particle.duration * speedMult,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      ))}
    </div>
  );
};

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
  isSystemLie: boolean;
  authorId: string | null;
  authorName: string | null;
  authorNames: string[];
  matchingLieAuthorNames: string[];
  voters: Array<{ id: string; name: string }>;
  voteCount: number;
}

interface TvAudioCueRow {
  cue_key: GameAudioCueKey;
  audio_url: string | null;
  is_active: boolean;
}

function normalizeAnswerKey(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function getAnswerGroupKey(answerText: string, isCorrect: boolean): string {
  return `${isCorrect ? 'truth' : 'lie'}:${normalizeAnswerKey(answerText)}`;
}

function playTvWarningBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = 1046;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.13);
    oscillator.onended = () => { ctx.close().catch(() => undefined); };
  } catch {
    // Ignore browser autoplay restrictions.
  }
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

function getStagePointsSummary(roundNumber: number, roundCount: number): {
  multiplier: number;
  fooledPoints: number;
  truthPoints: number;
  label: string;
} {
  const multiplier = getRoundMultiplier(roundNumber, roundCount);
  return {
    multiplier,
    fooledPoints: GAME_CONFIG.POINTS.PER_FOOLED_PLAYER * multiplier,
    truthPoints: GAME_CONFIG.POINTS.CORRECT_ANSWER * multiplier,
    label: multiplier === 3 ? 'النقاط تربل' : multiplier === 2 ? 'النقاط دبل' : 'النقاط الأساسية',
  };
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
    <div style={{ perspective: 1200 }} className="w-full max-w-4xl mx-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.8, rotateX: -60, y: 50 }}
        animate={{ opacity: 1, scale: 1, rotateX: 0, y: 0 }}
        exit={{ opacity: 0, scale: 0.8, rotateX: 60 }}
        transition={{ type: 'spring', stiffness: 150, damping: 15 }}
        className="w-full"
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
        {answer.isCorrect ? (<>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-3xl"
          >
            ✅ الإجابة الصحيحة!
          </motion.p>
          {answer.authorNames.length > 0 && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="text-xl md:text-2xl mt-3 text-emerald-100"
            >
              أيضًا كتبها: <span className="font-bold">{answer.authorNames.join(' + ')}</span>
            </motion.p>
          )}
          {answer.matchingLieAuthorNames.length > 0 && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9 }}
              className="text-lg md:text-xl mt-2 text-white/80"
            >
              وأيضًا أُدخلت ككذبة بواسطة: <span className="font-bold">{answer.matchingLieAuthorNames.join(' + ')}</span>
            </motion.p>
          )}
        </>
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
    playerAnswers,
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
  const [categoryWaitSecondsLeft, setCategoryWaitSecondsLeft] = useState<number>(GAME_CONFIG.CATEGORY_SELECTION_TIMER);
  const [categoryPromptRoundNumber, setCategoryPromptRoundNumber] = useState<number | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [audioCuesByKey, setAudioCuesByKey] = useState<Record<string, TvAudioCueRow>>({});
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const warningBeepSecondRef = useRef<number | null>(null);
  const revealForRoundIdRef = useRef<string | null>(null); // Track which round reveal is for
  const tvNarrationAudioRef = useRef<HTMLAudioElement | null>(null);
  const tvBackgroundAudioRef = useRef<HTMLAudioElement | null>(null);
  const bgMusicUrlRef = useRef<string | null>(null);
  const previousPhaseKeyRef = useRef<string | null>(null);
  const categoryPromptPlayedRef = useRef<boolean>(false);
  const pendingCueKeyRef = useRef<GameAudioCueKey | null>(null);
  const confetti = useConfetti();
  const stageInfo = currentRound ? getStageInfo(currentRound.round_number) : null;
  const displayRoundNumber = categoryPromptRoundNumber ?? Math.max(game?.current_round ?? 0, 1);
  const expectedRoundNumber = game?.current_round ?? 0;
  const categoryStageInfo = getStageInfo(displayRoundNumber);
  const categoryStagePoints = game ? getStagePointsSummary(displayRoundNumber, game.round_count) : null;
  const isBetweenRounds = !!game
    && game.status === 'playing'
    && (
      !currentRound
      || currentRound.status === 'completed'
      || currentRound.round_number < game.current_round
    );
  const shouldShowCategorySelectionWait = !!game
    && isBetweenRounds
    && categoryPromptRoundNumber !== null
    && categoryPromptRoundNumber <= game.round_count;
  const roundStateIsStale = useMemo(() => {
    if (!game || game.status !== 'playing' || expectedRoundNumber <= 0) {
      return false;
    }

    if (!currentRound) {
      return true;
    }

    if (currentRound.round_number !== expectedRoundNumber) {
      return true;
    }

    return currentRound.status === 'completed' && expectedRoundNumber > currentRound.round_number;
  }, [currentRound?.id, currentRound?.round_number, currentRound?.status, expectedRoundNumber, game?.id, game?.status]);

  const combinedAnswers = useMemo(() => {
    const grouped = new Map<string, { id: string; answer_text: string; authorCount: number }>();
    for (const answer of allAnswers) {
      const key = getAnswerGroupKey(answer.answer_text, !!answer.is_correct);
      if (!grouped.has(key)) {
        grouped.set(key, { id: answer.id, answer_text: answer.answer_text, authorCount: answer.player_id ? 1 : 0 });
      } else if (answer.player_id) {
        grouped.get(key)!.authorCount += 1;
      }
    }
    return Array.from(grouped.values());
  }, [allAnswers]);

  const playTvCue = useCallback(async (cueKey: GameAudioCueKey): Promise<boolean> => {
    if (!audioEnabled) return false;
    const cue = audioCuesByKey[cueKey];
    if (!cue || !cue.is_active || !cue.audio_url) return false;

    try {
      if (tvNarrationAudioRef.current) {
        tvNarrationAudioRef.current.pause();
      }

      if (tvBackgroundAudioRef.current) {
        tvBackgroundAudioRef.current.volume = 0.03;
      }

      const audio = new Audio(cue.audio_url);
      audio.preload = 'auto';
      audio.onended = () => {
        if (tvBackgroundAudioRef.current) {
          tvBackgroundAudioRef.current.volume = 0.15;
        }
      };
      tvNarrationAudioRef.current = audio;
      await audio.play();
      setAudioBlocked(false);
      if (pendingCueKeyRef.current === cueKey) {
        pendingCueKeyRef.current = null;
      }
      return true;
    } catch (err) {
      console.warn(`TV cue "${cueKey}" could not autoplay:`, err);
      pendingCueKeyRef.current = cueKey;
      setAudioBlocked(true);
      return false;
    }
  }, [audioCuesByKey, audioEnabled]);

  const getPhaseCueKey = useCallback((): GameAudioCueKey | null => {
    if (!game || !currentRound) {
      return null;
    }

    if (roundStatus === 'completed') {
      return 'reveal_start';
    }

    if (roundStatus === 'voting') {
      return 'voting_start';
    }

    if (roundStatus === 'answering') {
      const multiplier = getRoundMultiplier(currentRound.round_number, game.round_count);
      if (multiplier === 3) {
        return 'triple_points_round_start';
      }
      if (multiplier === 2) {
        return 'double_points_round_start';
      }
      return 'answering_start';
    }

    return null;
  }, [currentRound, game, roundStatus]);

  const enableTvAudio = useCallback(async () => {
    setAudioEnabled(true);
    setAudioBlocked(false);

    const pendingCueKey = pendingCueKeyRef.current;
    if (pendingCueKey) {
      await playTvCue(pendingCueKey);
      return;
    }

    if (!game || !currentRound) {
      if (shouldShowCategorySelectionWait) {
        await playTvCue('category_selection_start');
      }
      return;
    }

    if (shouldShowCategorySelectionWait) {
      await playTvCue('category_selection_start');
      return;
    }

    const cueKey = getPhaseCueKey();
    if (cueKey) {
      await playTvCue(cueKey);
    }
  }, [currentRound, game, getPhaseCueKey, playTvCue, shouldShowCategorySelectionWait]);

  const recoverRoundState = useCallback(async () => {
    if (!game || game.status !== 'playing' || isRecovering) return;

    setIsRecovering(true);
    try {
      const { RoundService, getSupabase } = await import('@fakash/shared');
      const round = await RoundService.getCurrentRound(game.id);

      if (!round) {
        console.warn('[TVGame] Server recovery returned no active round snapshot', {
          gameId: game.id,
          expectedRoundNumber,
        });
        return;
      }

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

      if (!recoveredQuestion) {
        console.warn('[TVGame] Server recovery found a round but no question payload', {
          gameId: game.id,
          roundId: round.id,
          questionId: round.question_id,
        });
        return;
      }

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

  // Load TV narration cue config (admin-managed).
  useEffect(() => {
    let isCancelled = false;

    const loadAudioCues = async () => {
      try {
        const { getSupabase } = await import('@fakash/shared');
        const supabase = getSupabase();
        const cueKeys = GAME_AUDIO_CUE_DEFINITIONS.map((cue) => cue.key);

        const { data, error } = await supabase
          .from('game_audio_cues')
          .select('cue_key, audio_url, is_active')
          .in('cue_key', cueKeys);

        if (error && error.code !== '42P01') {
          console.warn('Failed to fetch TV audio cues:', error);
          return;
        }

        if (isCancelled) return;

        const mapped: Record<string, TvAudioCueRow> = {};
        for (const row of (data || []) as TvAudioCueRow[]) {
          mapped[row.cue_key] = row;
        }
        setAudioCuesByKey(mapped);
      } catch (err) {
        if (!isCancelled) {
          console.warn('Failed to fetch TV audio cues:', err);
        }
      }
    };

    loadAudioCues();
    const interval = setInterval(loadAudioCues, 15000);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const cue = audioCuesByKey.background_music;
    const shouldPlay = audioEnabled && cue?.is_active && !!cue.audio_url;

    if (!shouldPlay) {
      if (tvBackgroundAudioRef.current) {
        tvBackgroundAudioRef.current.pause();
        tvBackgroundAudioRef.current = null;
      }
      bgMusicUrlRef.current = null;
      return;
    }

    const targetUrl = cue.audio_url!;
    if (!tvBackgroundAudioRef.current || bgMusicUrlRef.current !== targetUrl) {
      if (tvBackgroundAudioRef.current) {
        tvBackgroundAudioRef.current.pause();
      }

      const audio = new Audio(targetUrl);
      audio.preload = 'auto';
      audio.loop = true;
      audio.volume = 0.15;
      tvBackgroundAudioRef.current = audio;
      bgMusicUrlRef.current = targetUrl;
    }

    void tvBackgroundAudioRef.current.play().catch((err) => {
      console.warn('Background music could not autoplay:', err);
      setAudioBlocked(true);
    });

    return () => {
      if (tvBackgroundAudioRef.current) {
        tvBackgroundAudioRef.current.pause();
      }
    };
  }, [audioCuesByKey.background_music, audioEnabled]);

  useEffect(() => () => {
    tvNarrationAudioRef.current?.pause();
    tvBackgroundAudioRef.current?.pause();
  }, []);

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

  // TV timer warning in final 5 seconds.
  useEffect(() => {
    if (!currentRound || !timerActive) return;
    if (roundStatus !== 'answering' && roundStatus !== 'voting') return;
    if (timeRemaining <= 0 || timeRemaining > 5) return;
    if (warningBeepSecondRef.current === timeRemaining) return;

    warningBeepSecondRef.current = timeRemaining;
    playTvWarningBeep();
  }, [currentRound?.id, timerActive, roundStatus, timeRemaining]);

  useEffect(() => {
    warningBeepSecondRef.current = null;
  }, [currentRound?.id, roundStatus]);

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

  // Recovery mechanism: self-heal when the local round state drifts from the server.
  useEffect(() => {
    if (!game || game.status !== 'playing' || isRecovering) return;
    if (!roundStateIsStale) return;

    const delayMs = shouldShowCategorySelectionWait ? 3000 : 1200;
    const timer = setTimeout(() => {
      console.warn('[TVGame] Local round state is stale; recovering from server', {
        expectedRoundNumber,
        localRoundNumber: currentRound?.round_number ?? null,
        localRoundStatus: currentRound?.status ?? null,
        hasQuestion: !!question,
        categoryPromptRoundNumber,
      });
      void recoverRoundState();
    }, delayMs);

    return () => clearTimeout(timer);
  }, [
    categoryPromptRoundNumber,
    currentRound?.id,
    currentRound?.round_number,
    currentRound?.status,
    expectedRoundNumber,
    game?.id,
    game?.status,
    isRecovering,
    question?.id,
    recoverRoundState,
    roundStateIsStale,
    shouldShowCategorySelectionWait,
  ]);

  // Show countdown while the captain selects the next category.
  useEffect(() => {
    if (!shouldShowCategorySelectionWait) return;

    setCategoryWaitSecondsLeft(GAME_CONFIG.CATEGORY_SELECTION_TIMER);
    const interval = setInterval(() => {
      setCategoryWaitSecondsLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [shouldShowCategorySelectionWait, game?.id, categoryPromptRoundNumber]);

  // Narration cue for category selection prompt.
  useEffect(() => {
    if (!shouldShowCategorySelectionWait) {
      categoryPromptPlayedRef.current = false;
      return;
    }

    if (categoryPromptPlayedRef.current) return;

    let isCancelled = false;

    const playCategoryCue = async () => {
      const attempted = await playTvCue('category_selection_start');
      if (!isCancelled && attempted) {
        categoryPromptPlayedRef.current = true;
      }
    };

    void playCategoryCue();

    return () => {
      isCancelled = true;
    };
  }, [shouldShowCategorySelectionWait, playTvCue]);

  useEffect(() => {
    categoryPromptPlayedRef.current = false;
  }, [categoryPromptRoundNumber]);

  // Narration cue for major TV phase transitions.
  useEffect(() => {
    if (!game || !currentRound) {
      previousPhaseKeyRef.current = null;
      return;
    }

    const phaseKey = `${currentRound.id}:${roundStatus}`;
    if (previousPhaseKeyRef.current === phaseKey) return;

    const cueKey = getPhaseCueKey();
    if (!cueKey) return;

    let isCancelled = false;

    const playPhaseCue = async () => {
      const attempted = await playTvCue(cueKey);
      if (!isCancelled && attempted) {
        previousPhaseKeyRef.current = phaseKey;
      }
    };

    void playPhaseCue();

    return () => {
      isCancelled = true;
    };
  }, [game, currentRound, roundStatus, playTvCue, getPhaseCueKey]);

  // Stop narration audio when component unmounts.
  useEffect(() => {
    return () => {
      if (tvNarrationAudioRef.current) {
        tvNarrationAudioRef.current.pause();
      }
    };
  }, []);

  // Keep TV synced with the next pending category prompt, even if game.current_round
  // on the TV lags briefly behind the captain/client state.
  useEffect(() => {
    if (!game || game.status !== 'playing') {
      setCategoryPromptRoundNumber(null);
      setCategoryOptions([]);
      setSelectedCategory(null);
      return;
    }

    let isCancelled = false;

    const syncCategoryPrompt = async () => {
      try {
        const { getSupabase } = await import('@fakash/shared');
        const supabase = getSupabase();
        const currentRoundNumber = currentRound?.round_number ?? 0;
        const minimumPromptRoundNumber = currentRound
          ? currentRound.status === 'completed'
            ? currentRoundNumber + 1
            : currentRoundNumber
          : Math.max(game.current_round, 1);

        const { data, error } = await supabase
          .from('game_category_prompts')
          .select('round_number, options, selected_category')
          .eq('game_id', game.id)
          .gte('round_number', minimumPromptRoundNumber)
          .order('round_number', { ascending: true })
          .limit(1);

        if (error && error.code !== '42P01') {
          console.warn('Failed to sync TV category prompt:', error);
          return;
        }

        if (isCancelled) return;

        const promptRow = Array.isArray(data) ? data[0] : null;
        if (!promptRow) {
          setCategoryPromptRoundNumber(null);
          setCategoryOptions([]);
          setSelectedCategory(null);
          return;
        }

        const rawOptions = (promptRow as any)?.options;
        const normalizedOptions = Array.isArray(rawOptions)
          ? rawOptions
              .filter((option): option is string => typeof option === 'string' && option.trim().length > 0)
              .slice(0, 4)
          : [];

        const normalizedSelectedCategory =
          typeof (promptRow as any)?.selected_category === 'string' && (promptRow as any).selected_category.trim().length > 0
            ? (promptRow as any).selected_category
            : null;

        setCategoryPromptRoundNumber((promptRow as any).round_number ?? null);
        setCategoryOptions(normalizedOptions);
        setSelectedCategory(normalizedSelectedCategory);
      } catch (err) {
        if (!isCancelled) {
          console.warn('Failed to sync TV category prompt:', err);
        }
      }
    };

    syncCategoryPrompt();
    const interval = setInterval(syncCategoryPrompt, 1000);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [game?.id, game?.status, game?.current_round, currentRound?.round_number, currentRound?.status]);

  if (!game || !isDisplayMode) {
    return null;
  }

  const audioUnlockOverlay = audioBlocked ? (
    <div className="absolute top-6 left-6 z-50">
      <button
        onClick={enableTvAudio}
        className="px-4 py-2 rounded-xl bg-black/60 border border-white/20 text-white text-sm font-bold hover:bg-black/70 transition-colors"
      >
        تفعيل الصوت
      </button>
    </div>
  ) : null;

  // Category selection waiting state
  if (game && shouldShowCategorySelectionWait) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-primary relative">
        <ParticleBackground />
        {audioUnlockOverlay}
        <div className="relative z-10 w-full max-w-6xl mx-auto text-center glass rounded-3xl px-10 py-8 border border-white/20">
          <p className="text-xl text-white/70 mb-2">
            الجولة {categoryStageInfo.stageNumber} / 3
          </p>
          <p className="text-5xl font-bold mb-2">القائد يختار فئة السؤال</p>
          <p className="text-2xl text-white/70">{categoryStagePoints?.label}</p>
          <p className="text-2xl text-white/70 mt-2">الوقت المتبقي: {categoryWaitSecondsLeft} ثانية</p>

          {categoryStagePoints && (
            <div className="mt-8 mx-auto max-w-3xl rounded-[2rem] border border-white/15 bg-white/5 px-8 py-6 shadow-[0_0_40px_rgba(217,70,239,0.12)]">
              <div className="inline-flex items-center rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-8 py-3 text-4xl font-black text-white">
                الجولة {categoryStageInfo.stageNumber}
              </div>
              <div className="mt-8 space-y-4 text-right">
                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/10 px-6 py-5">
                  <span className="text-3xl text-white/85">لمن خدعتهم</span>
                  <span className="text-5xl font-black text-pink-400">{categoryStagePoints.fooledPoints}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/10 px-6 py-5">
                  <span className="text-3xl text-white/85">لاكتشاف الحقيقة</span>
                  <span className="text-5xl font-black text-cyan-300">{categoryStagePoints.truthPoints}</span>
                </div>
              </div>
            </div>
          )}

          {categoryOptions.length > 0 ? (
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-4xl mx-auto">
              {categoryOptions.map((category) => {
                const isSelected = selectedCategory === category;
                return (
                  <div
                    key={category}
                    className={`rounded-2xl px-6 py-5 border text-2xl font-bold transition-all ${
                      isSelected
                        ? 'border-green-300 bg-green-500/20 text-white'
                        : 'border-white/20 bg-white/10 text-white/90'
                    }`}
                  >
                    {category}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-lg text-white/60 mt-6">جاري تجهيز الفئات المتاحة...</p>
          )}
        </div>
      </div>
    );
  }

  // Loading state
  if (!currentRound || !question) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-primary relative">
        <ParticleBackground />
        {audioUnlockOverlay}
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

  const submittedCount = playerAnswers.size;
  const requiredPlayers = currentRound.required_players || players.length;

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-primary">
      <ParticleBackground phase={roundStatus} />
      {audioUnlockOverlay}

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
                    ? 'النقاط تربل'
                    : 'النقاط دبل'}
                </span>
              </motion.div>
            )}
            <div className="glass rounded-2xl px-6 py-3">
              <span className="text-4xl font-bold">
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
                  animate={{ y: [-5, 5, -5] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  className="text-4xl font-bold text-pink-400 mb-8"
                >
                  🎭 اكتب كذبة مقنعة!
                </motion.p>

                <QuestionReveal question={question.question_text} size="tv" />

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
                    <span className="text-4xl text-white/60"> / {requiredPlayers}</span>
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
                  animate={{ y: [-5, 5, -5] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
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
                        {answer.authorCount > 1 && (
                          <p className="mt-3 text-base text-white/60">مقدمة من {answer.authorCount} لاعبين</p>
                        )}
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


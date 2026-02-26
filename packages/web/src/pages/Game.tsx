import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore, useRoundStore, GAME_CONFIG } from '@fakash/shared';

interface CombinedAnswerOption {
  id: string;
  answer_text: string;
  answerIds: string[];
  playerIds: string[];
  voteTargetId: string;
  hasCorrectAnswer: boolean;
}

const STAGE_START_ROUNDS = [1, 4, 7];

function isStageStartRound(roundNumber: number): boolean {
  return STAGE_START_ROUNDS.includes(roundNumber);
}

function getStageStartRound(roundNumber: number): number {
  if (roundNumber <= 3) return 1;
  if (roundNumber <= 6) return 4;
  return 7;
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

function normalizeAnswerKey(value: string): string {
  return value.trim().toLocaleLowerCase();
}

// Minimal haptic feedback helper
const vibrate = (pattern: number | number[]) => {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch (e) { /* ignore */ }
  }
};

interface CategoryPromptState {
  roundNumber: number;
  options: string[];
}

// Ultra-minimal player input screen - zero animations for lowest latency
export const Game: React.FC = () => {
  const navigate = useNavigate();
  const { game, players, currentPlayer, isDisplayMode, rehydrationAttempted } = useGameStore();
  const {
    currentRound,
    question,
    roundStatus,
    hasSubmittedAnswer,
    allAnswers,
    hasSubmittedVote,
    submitAnswer,
    submitVote,
    timeRemaining,
    setTimeRemaining,
    timerActive,
    setTimerActive,
  } = useRoundStore();

  const [answerInput, setAnswerInput] = useState('');
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);
  const [reviewCountdown, setReviewCountdown] = useState(0);
  const [categoryPrompt, setCategoryPrompt] = useState<CategoryPromptState | null>(null);
  const [categorySelection, setCategorySelection] = useState<string>('');
  const [categorySecondsLeft, setCategorySecondsLeft] = useState<number>(GAME_CONFIG.CATEGORY_SELECTION_TIMER);
  const [categoryWaitSecondsLeft, setCategoryWaitSecondsLeft] = useState<number>(GAME_CONFIG.CATEGORY_SELECTION_TIMER);
  const roundCreationRef = useRef<number | null>(null);
  const isCreatingRoundRef = useRef<boolean>(false);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const categoryResolverRef = useRef<((value: string | null) => void) | null>(null);
  const forceAdvanceKeyRef = useRef<string | null>(null);
  const phaseTimerInitializedRef = useRef<string | null>(null);
  const controllerPlayerId = game?.host_id ?? game?.phase_captain_id ?? players[0]?.id ?? null;
  const canControlFlow = !!currentPlayer && (controllerPlayerId ? currentPlayer.id === controllerPlayerId : true);
  const revealEstimateSeconds = Math.ceil(
    ((Math.max(allAnswers.length, 2) * GAME_CONFIG.TV_REVEAL_STEP_MS) + GAME_CONFIG.TV_REVEAL_FINISH_BUFFER_MS) / 1000
  );
  const reviewLockSeconds = Math.max(GAME_CONFIG.RESULTS_DISPLAY_DURATION, revealEstimateSeconds);
  const stageInfo = currentRound ? getStageInfo(currentRound.round_number) : null;
  const isAwaitingStageCategorySelection = !!game &&
    game.status === 'playing' &&
    !currentRound &&
    game.current_round > 0 &&
    isStageStartRound(game.current_round);

  const combinedAnswers = useMemo<CombinedAnswerOption[]>(() => {
    const grouped = new Map<string, {
      id: string;
      answer_text: string;
      answerIds: string[];
      playerIds: Set<string>;
      hasCorrectAnswer: boolean;
      correctAnswerId: string | null;
    }>();

    for (const answer of allAnswers) {
      const key = normalizeAnswerKey(answer.answer_text);
      if (!grouped.has(key)) {
        grouped.set(key, {
          id: answer.id,
          answer_text: answer.answer_text,
          answerIds: [answer.id],
          playerIds: new Set<string>(),
          hasCorrectAnswer: !!answer.is_correct,
          correctAnswerId: answer.is_correct ? answer.id : null,
        });
      } else {
        const group = grouped.get(key)!;
        group.answerIds.push(answer.id);
        if (answer.is_correct) {
          group.hasCorrectAnswer = true;
          group.correctAnswerId = answer.id;
        }
      }

      if (answer.player_id) {
        grouped.get(key)!.playerIds.add(answer.player_id);
      }
    }

    return Array.from(grouped.values()).map((group) => ({
      id: group.id,
      answer_text: group.answer_text,
      answerIds: group.answerIds,
      playerIds: Array.from(group.playerIds),
      voteTargetId: group.correctAnswerId || group.answerIds[0],
      hasCorrectAnswer: group.hasCorrectAnswer,
    }));
  }, [allAnswers]);

  const finishCategorySelection = useCallback((selectedCategory: string | null) => {
    const resolver = categoryResolverRef.current;
    categoryResolverRef.current = null;
    setCategoryPrompt(null);
    if (resolver) {
      resolver(selectedCategory);
    }
  }, []);

  const requestCategorySelection = useCallback(async (roundNumber: number): Promise<string | null> => {
    const { getSupabase } = await import('@fakash/shared');
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('questions')
      .select('category')
      .eq('language', 'ar')
      .not('category', 'is', null);

    if (error) {
      console.error('Failed to load categories:', error);
      return null;
    }

    const options = Array.from(
      new Set((data || [])
        .map((item) => item.category)
        .filter((category): category is string => !!category && category.trim().length > 0))
    );

    if (options.length === 0) {
      return null;
    }

    return await new Promise<string | null>((resolve) => {
      categoryResolverRef.current = resolve;
      setCategorySelection(options[0]);
      setCategoryPrompt({ roundNumber, options });
      setCategorySecondsLeft(GAME_CONFIG.CATEGORY_SELECTION_TIMER);
    });
  }, []);

  const getCategoryForRound = useCallback(async (roundNumber: number): Promise<string | null> => {
    if (!game) return null;

    if (isStageStartRound(roundNumber)) {
      return requestCategorySelection(roundNumber);
    }

    const stageStartRound = getStageStartRound(roundNumber);
    const { getSupabase } = await import('@fakash/shared');
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('game_rounds')
      .select('question:questions(category)')
      .eq('game_id', game.id)
      .eq('round_number', stageStartRound)
      .maybeSingle();

    if (error) {
      console.error('Failed to load stage category:', error);
      return null;
    }

    const stageCategory = (data as any)?.question?.category;
    return stageCategory || null;
  }, [game, requestCategorySelection]);

  // Recovery function
  const recoverRoundState = useCallback(async () => {
    if (!game || !currentPlayer) return;
    setIsRecovering(true);

    try {
      const { RoundService, getSupabase } = await import('@fakash/shared');
      const round = await RoundService.getCurrentRound(game.id);

      if (!round) {
        setIsRecovering(false);
        return;
      }

      const supabase = getSupabase();
      const { data: q } = await supabase
        .from('questions')
        .select('*')
        .eq('id', round.question_id)
        .single();

      if (!q) {
        setIsRecovering(false);
        return;
      }

      const answers = round.status === 'voting'
        ? await RoundService.getRoundAnswers(round.id)
        : [];

      const startTime = round.timer_starts_at
        ? new Date(round.timer_starts_at).getTime()
        : Date.now();
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.max(0, round.timer_duration - elapsed);

      const { data: playerAnswer } = await supabase
        .from('player_answers')
        .select('*')
        .eq('round_id', round.id)
        .eq('player_id', currentPlayer.id)
        .maybeSingle();

      const { data: playerVote } = await supabase
        .from('votes')
        .select('*')
        .eq('round_id', round.id)
        .eq('voter_id', currentPlayer.id)
        .maybeSingle();

      useRoundStore.setState({
        currentRound: round,
        question: q,
        roundNumber: round.round_number,
        roundStatus: round.status,
        timeRemaining: remaining,
        timerActive: remaining > 0,
        allAnswers: answers,
        playerAnswers: new Map(),
        myAnswer: playerAnswer?.answer_text || null,
        hasSubmittedAnswer: !!playerAnswer,
        myVote: playerVote?.answer_id || null,
        hasSubmittedVote: !!playerVote,
        totalRounds: game.round_count,
        isLoading: false,
      });

      setIsRecovering(false);
    } catch (err) {
      console.error('Recovery failed:', err);
      setIsRecovering(false);
    }
  }, [game, currentPlayer]);

  // Redirect display mode to TV routes
  useEffect(() => {
    if (!rehydrationAttempted) return;
    if (isDisplayMode) {
      navigate('/tv/game');
    }
  }, [isDisplayMode, navigate, rehydrationAttempted]);

  useEffect(() => {
    return () => {
      if (categoryResolverRef.current) {
        categoryResolverRef.current(null);
        categoryResolverRef.current = null;
      }
    };
  }, []);

  // Category selection countdown (captain only)
  useEffect(() => {
    if (!categoryPrompt) return;

    setCategorySecondsLeft(GAME_CONFIG.CATEGORY_SELECTION_TIMER);
    const interval = setInterval(() => {
      setCategorySecondsLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [categoryPrompt?.roundNumber]);

  // Auto-select category when selection timer ends
  useEffect(() => {
    if (!categoryPrompt || categorySecondsLeft > 0) return;
    const fallback = categorySelection || categoryPrompt.options[0] || null;
    finishCategorySelection(fallback);
  }, [categoryPrompt, categorySecondsLeft, categorySelection, finishCategorySelection]);

  // Waiting countdown for non-captains while the stage captain is choosing a category.
  useEffect(() => {
    if (!isAwaitingStageCategorySelection) return;

    setCategoryWaitSecondsLeft(GAME_CONFIG.CATEGORY_SELECTION_TIMER);
    const interval = setInterval(() => {
      setCategoryWaitSecondsLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [isAwaitingStageCategorySelection, game?.id, game?.current_round]);

  // Navigation guard
  useEffect(() => {
    if (!rehydrationAttempted) return;
    if (!game || !currentPlayer) {
      navigate('/');
      return;
    }
    // If game hasn't started yet, go back to lobby
    if (game.status === 'waiting') {
      navigate('/lobby');
      return;
    }
    if (game.status === 'finished') {
      navigate('/results');
    }
  }, [game, currentPlayer, navigate, rehydrationAttempted]);

  // Phase captain: create round
  useEffect(() => {
    if (!game || !rehydrationAttempted || game.status !== 'playing' || !canControlFlow) return;

    const needsNewRound = !currentRound || currentRound.round_number < game.current_round;

    if (needsNewRound && roundCreationRef.current !== game.current_round && game.current_round > 0 && !isCreatingRoundRef.current) {
      isCreatingRoundRef.current = true;
      roundCreationRef.current = game.current_round;

      (async () => {
        try {
          const { startRound } = useRoundStore.getState();
          const selectedCategory = await getCategoryForRound(game.current_round);
          await startRound(game.id, game.current_round, game.round_count, selectedCategory);
        } catch (err: any) {
          if (!err.message?.includes('duplicate key')) {
            roundCreationRef.current = null;
          }
        } finally {
          isCreatingRoundRef.current = false;
        }
      })();
    }
  }, [game, currentRound, canControlFlow, rehydrationAttempted, getCategoryForRound]);

  // Timer countdown (background)
  useEffect(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (!currentRound || !timerActive || timeRemaining <= 0) return;

    timerIntervalRef.current = setInterval(() => {
      const newTime = useRoundStore.getState().timeRemaining - 1;
      if (newTime <= 0) {
        setTimeRemaining(0);
        setTimerActive(false);
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      } else {
        setTimeRemaining(newTime);
      }
    }, 1000);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [currentRound?.id, timerActive, setTimeRemaining, setTimerActive]);

  // Handle timer expiration - call server-side force_advance_round
  useEffect(() => {
    if (!currentRound || !canControlFlow || timeRemaining !== 0) return;
    if (roundStatus !== 'answering' && roundStatus !== 'voting') return;

    // Guard: only allow force-advance if the timer was actively initialized
    // for this specific phase. Prevents stale timeRemaining=0 from a previous
    // phase from triggering force_advance_round on the new phase.
    if (phaseTimerInitializedRef.current !== roundStatus) return;

    const forceKey = `${currentRound.id}:${roundStatus}`;
    if (forceAdvanceKeyRef.current === forceKey) return;
    forceAdvanceKeyRef.current = forceKey;
    
    const handleTimerExpired = async () => {
      console.log('⏰ Timer expired! Calling server-side force_advance_round...');
      try {
        const { getSupabase } = await import('@fakash/shared');
        const supabase = getSupabase();
        
        const { error } = await supabase.rpc('force_advance_round', {
          p_round_id: currentRound.id
        });
        
        if (error) {
          console.error('❌ Failed to force advance round:', error);
          forceAdvanceKeyRef.current = null;
        } else {
          console.log('✅ Server processing timer expiration');
        }
      } catch (err) {
        console.error('❌ Error calling force_advance_round:', err);
        forceAdvanceKeyRef.current = null;
      }
    };
    
    // Small delay to prevent multiple rapid calls
    const timer = setTimeout(handleTimerExpired, 500);
    return () => clearTimeout(timer);
  }, [currentRound?.id, timeRemaining, roundStatus, canControlFlow]);

  // Clear force-advance guard when a new timer starts or round changes.
  useEffect(() => {
    if (!currentRound) {
      forceAdvanceKeyRef.current = null;
      phaseTimerInitializedRef.current = null;
      return;
    }
    if (timeRemaining > 0) {
      forceAdvanceKeyRef.current = null;
      // Mark that the timer has been actively initialized for this phase.
      // When it later reaches 0, we know it genuinely expired (not stale from previous phase).
      phaseTimerInitializedRef.current = roundStatus;
    }
  }, [currentRound?.id, roundStatus, timeRemaining]);

  // Recovery if stuck
  useEffect(() => {
    if (!game || !currentPlayer || (currentRound && question) || game.status !== 'playing' || isRecovering || !!categoryPrompt) return;
    const timer = setTimeout(() => recoverRoundState(), 3000);
    return () => clearTimeout(timer);
  }, [game, currentPlayer, currentRound, question, isRecovering, recoverRoundState, categoryPrompt]);

  // Sync scores on round complete
  useEffect(() => {
    if (!game || roundStatus !== 'completed') return;
    (async () => {
      try {
        const { GameService } = await import('@fakash/shared');
        const updatedPlayers = await GameService.getGamePlayers(game.id);
        useGameStore.setState({ players: updatedPlayers });
      } catch (err) {
        console.error('Failed to sync scores:', err);
      }
    })();
  }, [game, roundStatus]);

  // Enforce minimum review time before controller can advance.
  useEffect(() => {
    if (roundStatus !== 'completed' || !currentRound) {
      setReviewCountdown(0);
      return;
    }

    setReviewCountdown(reviewLockSeconds);
    const countdownInterval = setInterval(() => {
      setReviewCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => clearInterval(countdownInterval);
  }, [roundStatus, currentRound?.id, reviewLockSeconds]);

  // Loading states - static, no animation
  if (!game || !currentPlayer) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-primary">
        <p className="text-white/60">جارٍ التحميل...</p>
      </div>
    );
  }

  if (game.status === 'waiting') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-primary">
        <div className="bg-white/10 backdrop-blur rounded-2xl p-6 text-center max-w-xs w-full">
          <p className="text-lg mb-4">اللعبة لم تبدأ بعد</p>
          <button
            onClick={() => {
              vibrate(50);
              navigate('/lobby');
            }}
            className="w-full py-3 mb-2 rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 font-bold active:scale-95 transition-transform duration-150"
          >
            العودة للردهة
          </button>
          <button
            onClick={async () => {
              vibrate(50);
              await useGameStore.getState().leaveGame();
              navigate('/', { replace: true });
            }}
            className="w-full py-2 rounded-xl bg-white/10 text-sm active:scale-95 transition-transform duration-150"
          >
            مغادرة اللعبة
          </button>
        </div>
      </div>
    );
  }

  if (categoryPrompt && canControlFlow) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-primary">
        <div className="bg-white/10 backdrop-blur rounded-2xl p-5 max-w-sm w-full">
          <p className="text-sm text-white/70 text-center mb-2">اختيار الفئة - الجولة {categoryPrompt.roundNumber}/7</p>
          <p className="text-lg font-bold text-center mb-1">اختر فئة السؤال</p>
          <p className="text-xs text-white/60 text-center mb-4">ينتهي الاختيار تلقائياً خلال {categorySecondsLeft} ثوانٍ</p>

          <div className="space-y-2 mb-4 max-h-56 overflow-y-auto">
            {categoryPrompt.options.map((category) => (
              <button
                key={category}
                onClick={() => {
                  vibrate(50);
                  setCategorySelection(category);
                }}
                className={`w-full py-3 px-3 rounded-xl text-right active:scale-95 transition-transform duration-150 ${
                  categorySelection === category
                    ? 'bg-cyan-500 text-white'
                    : 'bg-white/10 text-white/90'
                }`}
              >
                {category}
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              vibrate(50);
              finishCategorySelection(categorySelection || categoryPrompt.options[0] || null);
            }}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 font-bold active:scale-95 transition-transform duration-150"
          >
            متابعة
          </button>
        </div>
      </div>
    );
  }

  if (!categoryPrompt && isAwaitingStageCategorySelection) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-primary">
        <div className="bg-white/10 backdrop-blur rounded-2xl p-6 max-w-sm w-full text-center">
          <p className="text-sm text-white/70 mb-2">اختيار الفئة - الجولة {game.current_round}/7</p>
          <p className="text-lg font-bold mb-1">
            {canControlFlow ? 'جاري تجهيز اختيار الفئة' : 'القائد يختار فئة السؤال'}
          </p>
          <p className="text-xs text-white/60">
            الوقت المتوقع: {categoryWaitSecondsLeft} ثانية
          </p>
        </div>
      </div>
    );
  }

  if (!currentRound || !question) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-primary">
        <div className="text-center">
          <p className="text-white/60">جارٍ تحميل الجولة...</p>
          {isRecovering && <p className="text-xs text-white/40 mt-2">استعادة...</p>}
        </div>
      </div>
    );
  }

  const handleSubmitAnswer = async () => {
    if (!answerInput.trim()) return;
    vibrate([50, 50, 50]); // Success pattern
    try {
      await submitAnswer(currentPlayer.id, answerInput);
      setAnswerInput('');
    } catch (err) {
      console.error('Failed to submit:', err);
      vibrate([200, 100, 200]); // Error pattern
    }
  };

  const handleSubmitVote = async (answerId: string) => {
    if (hasSubmittedVote) return;
    vibrate(50);
    useRoundStore.setState({ hasSubmittedVote: true });
    try {
      await submitVote(currentPlayer.id, answerId);
      setSelectedAnswer(answerId);
    } catch (err) {
      console.error('Failed to vote:', err);
      vibrate([200, 100, 200]); // Error pattern
      useRoundStore.setState({ hasSubmittedVote: false });
    }
  };

  const isFinalRound = currentRound.round_number === game.round_count;

  const handleNextRound = async () => {
    if (!canControlFlow || reviewCountdown > 0) return;

    if (isFinalRound) {
      try {
        const { GameService } = await import('@fakash/shared');
        await GameService.advanceToNextRound(game.id, currentPlayer.id);
      } catch (err) {
        console.error('Failed to end game:', err);
      }
      navigate('/results');
      return;
    }

    roundCreationRef.current = null;

    try {
      const { GameService } = await import('@fakash/shared');
      await GameService.advanceToNextRound(game.id, currentPlayer.id);
    } catch (err) {
      console.error('Failed to advance round:', err);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-primary relative">
      {/* Leave button - top left */}
      <button
        onClick={async () => {
          vibrate(50);
          if (window.confirm('هل أنت متأكد أنك تريد مغادرة اللعبة؟')) {
            await useGameStore.getState().leaveGame();
            navigate('/', { replace: true });
          }
        }}
        className="absolute top-4 left-4 px-3 py-2 text-xs bg-red-500/80 hover:bg-red-600 rounded-xl text-white active:scale-95 transition-transform duration-150"
      >
        مغادرة
      </button>

      {/* Minimal header */}
      <p className="text-xs text-white/40 mb-3">
        الجولة {stageInfo?.stageNumber ?? 1}/3 • سؤال {stageInfo?.questionInStage ?? 1}/{stageInfo?.totalQuestionsInStage ?? 1}
        {canControlFlow && ' • 👑'}
      </p>

      <div className="bg-white/10 backdrop-blur rounded-2xl p-4 max-w-xs w-full">
        {/* ANSWERING PHASE */}
        {roundStatus === 'answering' && (
          <div>
            {!hasSubmittedAnswer ? (
              <>
                <input
                  type="text"
                  value={answerInput}
                  onChange={(e) => setAnswerInput(e.target.value)}
                  placeholder="اكتب كذبتك..."
                  className="w-full p-3 mb-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all duration-200"
                  maxLength={GAME_CONFIG.MAX_ANSWER_LENGTH}
                  onKeyPress={(e) => e.key === 'Enter' && handleSubmitAnswer()}
                  autoFocus
                />
                <button
                  onClick={handleSubmitAnswer}
                  disabled={!answerInput.trim()}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 font-bold disabled:opacity-50 active:scale-95 transition-transform duration-150"
                >
                  إرسال
                </button>
              </>
            ) : (
              <div className="text-center py-4">
                <p className="text-lg">✅ تم الإرسال</p>
                <p className="text-xs text-white/50 mt-1">تابع على الشاشة</p>
              </div>
            )}
          </div>
        )}

        {/* VOTING PHASE */}
        {roundStatus === 'voting' && (
          <div>
            <p className="text-center text-sm mb-3 text-white/60">اختر الإجابة الصحيحة</p>
            <div className="space-y-2">
              {combinedAnswers.map((answer) => {
                const isOwn = !answer.hasCorrectAnswer && answer.playerIds.includes(currentPlayer.id);
                const isSelected = selectedAnswer === answer.voteTargetId;
                return (
                  <button
                    key={answer.id}
                    onClick={() => !hasSubmittedVote && !isOwn && handleSubmitVote(answer.voteTargetId)}
                    disabled={hasSubmittedVote || isOwn}
                    className={`w-full p-3 rounded-xl text-right active:scale-95 transition-all duration-150 ${
                      isSelected
                        ? 'bg-cyan-500 text-white ring-2 ring-cyan-300 shadow-lg shadow-cyan-500/50'
                        : isOwn
                        ? 'bg-white/5 opacity-40'
                        : 'bg-white/10 hover:bg-white/15 active:bg-white/20'
                    }`}
                  >
                    {answer.answer_text}
                    {isOwn && <span className="text-xs opacity-60"> (أنت)</span>}
                  </button>
                );
              })}
            </div>
            {hasSubmittedVote && (
              <p className="text-center text-xs text-white/50 mt-3">✅ تم التصويت</p>
            )}
          </div>
        )}

        {/* COMPLETED PHASE */}
        {roundStatus === 'completed' && (
          <div className="text-center">
            <p className="text-lg mb-4">📺 تابع الكشف على الشاشة</p>

            {canControlFlow && (
              <div>
                {reviewCountdown > 0 && (
                  <p className="text-xs text-white/60 mb-2">
                    وقت المراجعة: {reviewCountdown} ثانية
                  </p>
                )}
                <button
                  onClick={() => {
                    vibrate(50);
                    handleNextRound();
                  }}
                  disabled={reviewCountdown > 0}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 font-bold disabled:opacity-50 active:scale-95 transition-transform duration-150"
                >
                  {reviewCountdown > 0
                    ? `انتظر ${reviewCountdown} ثانية`
                    : (isFinalRound ? 'النتائج' : 'التالي ➡️')}
                </button>
              </div>
            )}

            {!canControlFlow && (
              <p className="text-xs text-white/60">
                في انتظار قائد الجولة للانتقال
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

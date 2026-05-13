import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useGameStore,
  useRoundStore,
  GAME_CONFIG,
  getRoundMultiplier,
  isDisallowedQuestionCategory,
  buildVotingOptions,
  getErrorInfo,
} from '@fakash/shared';

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

function pickRandomItems<T>(items: T[], count: number): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

// Minimal haptic feedback helper
const vibrate = (pattern: number | number[]) => {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch (e) { /* ignore */ }
  }
};

const playWarningBeep = () => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.17);
    oscillator.onended = () => { ctx.close().catch(() => undefined); };
  } catch {
    // Browser may block autoplay audio; ignore.
  }
};

interface CategoryPromptState {
  roundNumber: number;
  options: string[];
}

type PendingConfirmation =
  | {
      kind: 'answer';
      roundId: string;
      answerText: string;
    }
  | {
      kind: 'vote';
      roundId: string;
      answerId: string;
      answerText: string;
      answerIds: string[];
    };

// Ultra-minimal player input screen - zero animations for lowest latency
export const Game: React.FC = () => {
  const navigate = useNavigate();
  const { game, players, currentPlayer, isDisplayMode, rehydrationAttempted } = useGameStore();
  const {
    currentRound,
    question,
    roundStatus,
    hasSubmittedAnswer,
    playerAnswers,
    allAnswers,
    myVote,
    hasSubmittedVote,
    playerVotes,
    submitAnswer,
    submitVote,
    timeRemaining,
    setTimeRemaining,
    timerActive,
    setTimerActive,
  } = useRoundStore();

  const [answerInput, setAnswerInput] = useState('');
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);
  const [isForceAdvancing, setIsForceAdvancing] = useState(false);
  const [reviewCountdown, setReviewCountdown] = useState(0);
  const [categoryPrompt, setCategoryPrompt] = useState<CategoryPromptState | null>(null);
  const [categorySelection, setCategorySelection] = useState<string>('');
  const [categorySecondsLeft, setCategorySecondsLeft] = useState<number>(GAME_CONFIG.CATEGORY_SELECTION_TIMER);
  const [showContinueFallback, setShowContinueFallback] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [confirmationSecondsLeft, setConfirmationSecondsLeft] = useState<number>(GAME_CONFIG.CONFIRMATION_TIMER);
  const [isConfirmingChoice, setIsConfirmingChoice] = useState(false);
  const [isAdvancingRound, setIsAdvancingRound] = useState(false);
  const roundCreationRef = useRef<number | null>(null);
  const isCreatingRoundRef = useRef<boolean>(false);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const categoryResolverRef = useRef<((value: string | null) => void) | null>(null);
  const forceAdvanceKeyRef = useRef<string | null>(null);
  const phaseTimerInitializedRef = useRef<string | null>(null);
  const warningBeepSecondRef = useRef<number | null>(null);
  const quorumRecoveryKeyRef = useRef<string | null>(null);
  const advancedRoundIdRef = useRef<string | null>(null);
  const controllerPlayerId = game?.phase_captain_id ?? game?.host_id ?? players[0]?.id ?? null;
  const canControlFlow = !!currentPlayer && (controllerPlayerId ? currentPlayer.id === controllerPlayerId : true);
  const hasLockedAnswer = hasSubmittedAnswer || isSubmittingAnswer || isConfirmingChoice;
  const connectedPlayerCount = useMemo(
    () => players.filter((player) => player.connection_status === 'connected').length,
    [players]
  );
  const effectiveRequiredPlayers = useMemo(() => {
    if (!currentRound) return 0;
    const requiredPlayers = Math.max(currentRound.required_players || 2, 2);
    return Math.min(requiredPlayers, Math.max(connectedPlayerCount, 2));
  }, [connectedPlayerCount, currentRound?.required_players]);
  const revealEstimateSeconds = Math.ceil(
    ((Math.max(allAnswers.length, 2) * GAME_CONFIG.TV_REVEAL_STEP_MS) + GAME_CONFIG.TV_REVEAL_FINISH_BUFFER_MS) / 1000
  );
  const reviewLockSeconds = Math.max(GAME_CONFIG.RESULTS_DISPLAY_DURATION, revealEstimateSeconds);
  const stageInfo = currentRound ? getStageInfo(currentRound.round_number) : null;
  const expectedRoundNumber = game?.current_round ?? 0;
  const currentRoundPoints = currentRound && game
    ? getStagePointsSummary(currentRound.round_number, game.round_count)
    : null;
  const categoryStageRoundNumber = categoryPrompt?.roundNumber || game?.current_round || 1;
  const categoryStageInfo = getStageInfo(categoryStageRoundNumber);
  const isVotingOpen = roundStatus === 'voting' && timerActive && timeRemaining > 0;
  const isWaitingForNextRound =
    !!game &&
    game.status === 'playing' &&
    game.current_round > 0 &&
    (!currentRound || currentRound.round_number < game.current_round);
  const isAwaitingStageCategorySelection = !!game &&
    isWaitingForNextRound &&
    isStageStartRound(game.current_round);
  const shouldShowCategoryPrompt = !!categoryPrompt &&
    !!game &&
    canControlFlow &&
    game.status === 'playing' &&
    game.current_round === categoryPrompt.roundNumber &&
    isStageStartRound(categoryPrompt.roundNumber) &&
    (!currentRound || currentRound.round_number < categoryPrompt.roundNumber);
  const canSelectVote = isVotingOpen && !hasSubmittedVote && pendingConfirmation?.kind !== 'vote' && !isConfirmingChoice;
  const roundStateIsStale = useMemo(() => {
    if (!game || game.status !== 'playing' || expectedRoundNumber <= 0) {
      return false;
    }

    if (!currentRound) {
      return true;
    }

    if (!question) {
      return true;
    }

    if (currentRound.round_number !== expectedRoundNumber) {
      return true;
    }

    return currentRound.status === 'completed' && expectedRoundNumber > currentRound.round_number;
  }, [currentRound?.id, currentRound?.round_number, currentRound?.status, expectedRoundNumber, game?.id, game?.status, question?.id]);

  const getForceAdvanceWindow = useCallback((round = currentRound) => {
    if (!round) return null;

    const startAt = round.timer_starts_at
      ? new Date(round.timer_starts_at).getTime()
      : Date.now();
    const deadlineAt = startAt + (round.timer_duration * 1000);
    const eligibleAt = canControlFlow ? deadlineAt : deadlineAt + 5000;

    return { deadlineAt, eligibleAt };
  }, [canControlFlow, currentRound]);

  const combinedAnswers = useMemo(
    () => buildVotingOptions(currentRound?.id ?? '', allAnswers),
    [allAnswers, currentRound?.id]
  );

  const currentPlayerAlsoWroteTruth = useMemo(() => (
    !!currentPlayer && allAnswers.some((answer) => answer.is_correct && answer.player_id === currentPlayer.id)
  ), [allAnswers, currentPlayer]);

  const finishCategorySelection = useCallback(async (selectedCategory: string | null) => {
    if (game && currentPlayer) {
      try {
        const { GameService } = await import('@fakash/shared');
        const roundNumber = categoryPrompt?.roundNumber || game.current_round;
        if (roundNumber && selectedCategory) {
          await GameService.saveCategoryPrompt(game.id, roundNumber, currentPlayer.id, {
            selectedCategory,
          });
        }
      } catch (err) {
        console.warn('Failed to persist selected category:', err);
      }
    }

    const resolver = categoryResolverRef.current;
    categoryResolverRef.current = null;
    setCategoryPrompt(null);
    if (resolver) {
      resolver(selectedCategory);
    }
  }, [categoryPrompt?.roundNumber, currentPlayer, game]);

  const requestCategorySelection = useCallback(async (roundNumber: number): Promise<string | null> => {
    if (!game || !currentPlayer) return null;
    if (!canControlFlow || game.current_round !== roundNumber || !isStageStartRound(roundNumber)) {
      return null;
    }

    const { getSupabase } = await import('@fakash/shared');
    const supabase = getSupabase();

    let options: string[] = [];

    const existingPrompt = await supabase
      .from('game_category_prompts')
      .select('options')
      .eq('game_id', game.id)
      .eq('round_number', roundNumber)
      .maybeSingle();

    if (!existingPrompt.error) {
      const rawOptions = (existingPrompt.data as any)?.options;
      if (Array.isArray(rawOptions)) {
        options = rawOptions.filter((value): value is string =>
          typeof value === 'string' && value.trim().length > 0
        );
        options = options.slice(0, 4);
      }
    } else if (existingPrompt.error.code !== '42P01') {
      console.warn('Failed to read existing category prompt:', existingPrompt.error);
    }

    if (options.length === 0) {
      const { data, error } = await supabase
        .from('questions')
        .select('category')
        .eq('language', 'ar')
        .is('archived_at', null)
        .not('category', 'is', null);

      if (error) {
        console.error('Failed to load categories:', error);
        return null;
      }

      const allCategories = Array.from(
        new Set((data || [])
          .map((item) => item.category)
          .filter((category): category is string =>
            !!category &&
            category.trim().length > 0 &&
            !isDisallowedQuestionCategory(category)
          ))
      );

      if (allCategories.length === 0) {
        return null;
      }

      options = pickRandomItems(allCategories, 4);

      try {
        const { GameService } = await import('@fakash/shared');
        await GameService.saveCategoryPrompt(game.id, roundNumber, currentPlayer.id, {
          options,
          selectedCategory: null,
        });
      } catch (savePromptError: any) {
        if (savePromptError?.code !== '42P01') {
          console.warn('Failed to persist category prompt:', savePromptError);
        }
      }
    }

    if (useGameStore.getState().game?.current_round !== roundNumber) {
      return null;
    }

    return await new Promise<string | null>((resolve) => {
      categoryResolverRef.current = resolve;
      setCategorySelection(options[0]);
      setCategoryPrompt({ roundNumber, options });
      setCategorySecondsLeft(GAME_CONFIG.CATEGORY_SELECTION_TIMER);
    });
  }, [canControlFlow, currentPlayer, game]);

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
      console.error('Failed to load stage category:', getErrorInfo(error));
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
      const { RoundService } = await import('@fakash/shared');
      const snapshot = await RoundService.recoverRoundFromServer(game.id, currentPlayer.id);

      if (!snapshot) {
        console.warn('[Game] Server recovery returned no active round snapshot', {
          gameId: game.id,
          expectedRoundNumber: game.current_round,
        });
        return;
      }

      useRoundStore.setState({
        currentRound: snapshot.round,
        question: snapshot.question,
        roundNumber: snapshot.round.round_number,
        roundStatus: snapshot.round.status,
        timeRemaining: snapshot.timeRemaining,
        timerActive: snapshot.timerActive,
        allAnswers: snapshot.answers,
        playerAnswers: new Map(
          snapshot.answers
            .filter((answer) => answer.player_id)
            .map((answer) => [answer.player_id!, answer])
        ),
        myAnswer: snapshot.myAnswer,
        hasSubmittedAnswer: snapshot.hasSubmittedAnswer,
        myVote: snapshot.myVote,
        hasSubmittedVote: snapshot.hasSubmittedVote,
        totalRounds: game.round_count,
        isLoading: false,
      });
    } catch (err) {
      console.error('[Game] Recovery failed:', getErrorInfo(err));
    } finally {
      setIsRecovering(false);
    }
  }, [game, currentPlayer]);

  const syncRoundStateAfterServerAdvance = useCallback(async (
    source: 'controller' | 'fallback' | 'answer-confirm' | 'vote-confirm' | 'quorum-recovery'
  ) => {
    await recoverRoundState();

    const roundState = useRoundStore.getState();
    const localRoundNumber = roundState.currentRound?.round_number ?? 0;
    const localRoundStatus = roundState.currentRound?.status ?? 'none';

    if (expectedRoundNumber > 0 && localRoundNumber !== expectedRoundNumber) {
      console.warn('[Game] Round state still mismatched after server advance recovery', {
        source,
        expectedRoundNumber,
        localRoundNumber,
        localRoundStatus,
        currentRoundId: roundState.currentRound?.id ?? null,
      });

      await new Promise((resolve) => setTimeout(resolve, 500));
      await recoverRoundState();
    }
  }, [expectedRoundNumber, recoverRoundState]);

  const clearPendingConfirmation = useCallback(() => {
    setPendingConfirmation(null);
    setConfirmationSecondsLeft(GAME_CONFIG.CONFIRMATION_TIMER);
    setIsConfirmingChoice(false);
  }, []);

  const confirmPendingChoice = useCallback(async () => {
    if (!pendingConfirmation || !currentPlayer || isConfirmingChoice) return;
    if (!currentRound || currentRound.id !== pendingConfirmation.roundId) {
      clearPendingConfirmation();
      return;
    }

    const isAnswerConfirmation = pendingConfirmation.kind === 'answer';
    const expectedStatus = isAnswerConfirmation ? 'answering' : 'voting';
    if (roundStatus !== expectedStatus || !timerActive || timeRemaining <= 0) {
      clearPendingConfirmation();
      return;
    }

    setIsConfirmingChoice(true);
    let shouldSyncAfterConfirm: 'answer-confirm' | 'vote-confirm' | null = null;

    try {
      if (isAnswerConfirmation) {
        setIsSubmittingAnswer(true);
        await submitAnswer(currentPlayer.id, pendingConfirmation.answerText);
        setAnswerInput('');
        shouldSyncAfterConfirm = 'answer-confirm';
      } else {
        console.info('[VoteAudit] confirming vote', {
          roundId: pendingConfirmation.roundId,
          answerId: pendingConfirmation.answerId,
          answerText: pendingConfirmation.answerText,
          groupedAnswerIds: pendingConfirmation.answerIds,
        });
        await submitVote(currentPlayer.id, pendingConfirmation.answerId);
        const persistedVote = useRoundStore.getState().myVote;
        setSelectedAnswer(persistedVote || pendingConfirmation.answerId);
        console.info('[VoteAudit] vote persisted', {
          roundId: pendingConfirmation.roundId,
          answerId: persistedVote || pendingConfirmation.answerId,
          answerText: pendingConfirmation.answerText,
        });
        shouldSyncAfterConfirm = 'vote-confirm';
      }

      setPendingConfirmation(null);
      setConfirmationSecondsLeft(GAME_CONFIG.CONFIRMATION_TIMER);
      if (shouldSyncAfterConfirm) {
        void syncRoundStateAfterServerAdvance(shouldSyncAfterConfirm);
      }
    } catch (err) {
      console.error(
        pendingConfirmation.kind === 'answer' ? 'Failed to submit:' : 'Failed to vote:',
        getErrorInfo(err)
      );
      setPendingConfirmation(null);
      setConfirmationSecondsLeft(GAME_CONFIG.CONFIRMATION_TIMER);
      vibrate([200, 100, 200]);

      if (pendingConfirmation.kind === 'vote') {
        const persistedVote = useRoundStore.getState().myVote;
        setSelectedAnswer(persistedVote || null);
        useRoundStore.setState({ hasSubmittedVote: !!persistedVote });
      }
    } finally {
      setIsSubmittingAnswer(false);
      setIsConfirmingChoice(false);
    }
  }, [
    clearPendingConfirmation,
    currentPlayer,
    currentRound,
    isConfirmingChoice,
    pendingConfirmation,
    roundStatus,
    submitAnswer,
    submitVote,
    syncRoundStateAfterServerAdvance,
    timeRemaining,
    timerActive,
  ]);

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

  useEffect(() => {
    if (!categoryPrompt || !game) return;

    const promptNoLongerNeeded =
      game.status !== 'playing' ||
      game.current_round !== categoryPrompt.roundNumber ||
      !isStageStartRound(categoryPrompt.roundNumber) ||
      (currentRound?.round_number ?? 0) >= categoryPrompt.roundNumber;

    if (!promptNoLongerNeeded) return;

    const resolver = categoryResolverRef.current;
    categoryResolverRef.current = null;
    setCategoryPrompt(null);
    if (resolver) {
      resolver(null);
    }
  }, [categoryPrompt?.roundNumber, currentRound?.round_number, game?.current_round, game?.status]);

  useEffect(() => {
    if (!pendingConfirmation) {
      setConfirmationSecondsLeft(GAME_CONFIG.CONFIRMATION_TIMER);
      return;
    }

    setConfirmationSecondsLeft(GAME_CONFIG.CONFIRMATION_TIMER);
    const interval = setInterval(() => {
      setConfirmationSecondsLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [pendingConfirmation]);

  useEffect(() => {
    if (!pendingConfirmation || confirmationSecondsLeft > 0 || isConfirmingChoice) return;
    void confirmPendingChoice();
  }, [confirmationSecondsLeft, confirmPendingChoice, isConfirmingChoice, pendingConfirmation]);

  useEffect(() => {
    if (!pendingConfirmation) return;

    const expectedStatus = pendingConfirmation.kind === 'answer' ? 'answering' : 'voting';
    const shouldCancel =
      !currentRound ||
      currentRound.id !== pendingConfirmation.roundId ||
      roundStatus !== expectedStatus ||
      timeRemaining <= 0;

    if (shouldCancel) {
      clearPendingConfirmation();
    }
  }, [clearPendingConfirmation, currentRound?.id, pendingConfirmation, roundStatus, timeRemaining]);

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
    void finishCategorySelection(fallback);
  }, [categoryPrompt, categorySecondsLeft, categorySelection, finishCategorySelection]);

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
          console.warn('[Game] Round creation failed or needs retry', {
            gameId: game.id,
            roundNumber: game.current_round,
            currentRoundId: currentRound?.id ?? null,
            error: err?.message ?? String(err),
          });
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

  // Timer warning sound for the final 5 seconds.
  useEffect(() => {
    if (!currentRound || !timerActive) return;
    if (roundStatus !== 'answering' && roundStatus !== 'voting') return;
    if (timeRemaining <= 0 || timeRemaining > 5) return;
    if (warningBeepSecondRef.current === timeRemaining) return;

    warningBeepSecondRef.current = timeRemaining;
    playWarningBeep();
  }, [currentRound?.id, timerActive, roundStatus, timeRemaining]);

  // Handle timer expiration - call server-side force_advance_round
  useEffect(() => {
    if (!currentRound || !currentPlayer || !canControlFlow || timeRemaining !== 0) return;
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
        const { GameService } = await import('@fakash/shared');
        await GameService.forceAdvanceRound(currentRound.id, currentPlayer.id);
        await syncRoundStateAfterServerAdvance('controller');
        console.log('Server processing timer expiration');
      } catch (err) {
        console.error('Error calling force_advance_round:', err);
        await syncRoundStateAfterServerAdvance('controller');
        forceAdvanceKeyRef.current = null;
      }
    };
    
    // Small delay to prevent multiple rapid calls
    const timer = setTimeout(handleTimerExpired, 500);
    return () => clearTimeout(timer);
  }, [currentPlayer?.id, currentRound?.id, timeRemaining, roundStatus, canControlFlow, syncRoundStateAfterServerAdvance]);

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

  useEffect(() => {
    warningBeepSecondRef.current = null;
  }, [currentRound?.id, roundStatus]);

  useEffect(() => {
    if (!currentRound || !currentPlayer || !game || !timerActive) {
      quorumRecoveryKeyRef.current = null;
      return;
    }

    if (roundStatus !== 'answering' && roundStatus !== 'voting') {
      quorumRecoveryKeyRef.current = null;
      return;
    }

    if (effectiveRequiredPlayers <= 0) return;

    const confirmedCount = roundStatus === 'answering'
      ? playerAnswers.size
      : playerVotes.size;

    if (confirmedCount < effectiveRequiredPlayers) return;

    const recoveryKey = `${currentRound.id}:${roundStatus}:${effectiveRequiredPlayers}`;
    if (quorumRecoveryKeyRef.current !== recoveryKey) {
      quorumRecoveryKeyRef.current = recoveryKey;
    }

    let attempts = 0;
    const recoverIfStillStuck = () => {
      const latestRoundState = useRoundStore.getState();
      if (latestRoundState.currentRound?.id !== currentRound.id) return;
      if (latestRoundState.roundStatus !== roundStatus) return;

      attempts += 1;
      console.warn('[Game] Local quorum reached but phase is still unchanged; recovering from server', {
        roundId: currentRound.id,
        roundStatus,
        confirmedCount,
        effectiveRequiredPlayers,
        attempt: attempts,
      });
      void syncRoundStateAfterServerAdvance('quorum-recovery');
    };

    const firstTimer = setTimeout(recoverIfStillStuck, 750);
    const interval = setInterval(() => {
      if (attempts >= 3) {
        clearInterval(interval);
        return;
      }
      recoverIfStillStuck();
    }, 2500);

    return () => {
      clearTimeout(firstTimer);
      clearInterval(interval);
    };
  }, [
    currentPlayer?.id,
    currentRound?.id,
    effectiveRequiredPlayers,
    game?.id,
    playerAnswers.size,
    playerVotes.size,
    roundStatus,
    syncRoundStateAfterServerAdvance,
    timerActive,
  ]);

  useEffect(() => {
    setAnswerInput('');
    setSelectedAnswer(null);
    setShowContinueFallback(false);
    setIsAdvancingRound(false);
    clearPendingConfirmation();
  }, [clearPendingConfirmation, currentRound?.id]);

  useEffect(() => {
    if (!currentRound || !currentPlayer || canControlFlow || isForceAdvancing) {
      setShowContinueFallback(false);
      return;
    }

    if (roundStatus !== 'answering' && roundStatus !== 'voting') {
      setShowContinueFallback(false);
      return;
    }

    if (timeRemaining > 0) {
      setShowContinueFallback(false);
      return;
    }

    const timing = getForceAdvanceWindow(currentRound);
    if (!timing) {
      setShowContinueFallback(false);
      return;
    }

    const delayMs = Math.max(0, timing.eligibleAt - Date.now());
    if (delayMs <= 0) {
      setShowContinueFallback(true);
      return;
    }

    const timer = setTimeout(() => {
      setShowContinueFallback(true);
    }, delayMs);

    return () => clearTimeout(timer);
  }, [
    canControlFlow,
    currentPlayer?.id,
    currentRound,
    getForceAdvanceWindow,
    isForceAdvancing,
    roundStatus,
    timeRemaining,
  ]);

  useEffect(() => {
    if (!currentRound || !currentPlayer || canControlFlow || isRecovering || isForceAdvancing) return;
    if (roundStatus !== 'answering' && roundStatus !== 'voting') return;
    if (timeRemaining > 0) return;

    const timing = getForceAdvanceWindow(currentRound);
    if (!timing) return;

    const staleRecoverAt = timing.eligibleAt + 1000;
    const delayMs = Math.max(0, staleRecoverAt - Date.now());
    const timer = setTimeout(() => {
      void recoverRoundState();
    }, delayMs);

    return () => clearTimeout(timer);
  }, [
    canControlFlow,
    currentPlayer?.id,
    currentRound,
    getForceAdvanceWindow,
    isForceAdvancing,
    isRecovering,
    recoverRoundState,
    roundStatus,
    timeRemaining,
  ]);

  // Recovery if the local round state is stale or missing.
  useEffect(() => {
    if (!game || !currentPlayer || game.status !== 'playing' || isRecovering) return;
    if (!roundStateIsStale) return;

    const delayMs = categoryPrompt ? 3000 : 1000;
    const timer = setTimeout(() => {
      console.warn('[Game] Local round state is stale; recovering from server', {
        expectedRoundNumber,
        localRoundNumber: currentRound?.round_number ?? null,
        localRoundStatus: currentRound?.status ?? null,
        hasQuestion: !!question,
        categoryPromptRoundNumber: categoryPrompt?.roundNumber ?? null,
      });
      void recoverRoundState();
    }, delayMs);

    return () => clearTimeout(timer);
  }, [
    categoryPrompt?.roundNumber,
    currentPlayer?.id,
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
  ]);

  // Keep UI selection in sync with stored vote (rehydration/realtime).
  useEffect(() => {
    if (roundStatus === 'voting') {
      setSelectedAnswer(myVote || null);
    }
  }, [currentRound?.id, roundStatus, myVote]);

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

  if (shouldShowCategoryPrompt) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-primary">
        <div className="bg-white/10 backdrop-blur rounded-2xl p-5 max-w-sm w-full">
          <p className="text-sm text-white/70 text-center mb-2">اختيار الفئة - الجولة {categoryStageInfo.stageNumber}/3</p>
          <p className="text-xl font-bold text-center mb-1">اختر فئة السؤال</p>
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
              void finishCategorySelection(categorySelection || categoryPrompt.options[0] || null);
            }}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 font-bold active:scale-95 transition-transform duration-150"
          >
            متابعة
          </button>
        </div>
      </div>
    );
  }

  if (!shouldShowCategoryPrompt && isAwaitingStageCategorySelection) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-primary">
        <div className="bg-white/10 backdrop-blur rounded-2xl p-6 max-w-sm w-full text-center">
          <p className="text-lg font-bold mb-1">جاري تحميل الجولة...</p>
          <p className="text-xs text-white/60">يتم تجهيز السؤال التالي</p>
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
    if (!answerInput.trim() || !currentPlayer || hasLockedAnswer) return;
    if (!currentRound || roundStatus !== 'answering' || !timerActive || timeRemaining === 0) return;

    vibrate(50);
    setPendingConfirmation({
      kind: 'answer',
      roundId: currentRound.id,
      answerText: answerInput.trim(),
    });
  };

  const handleSubmitVote = async (answerId: string, groupAnswerIds: string[] = [answerId]) => {
    if (!canSelectVote || !currentPlayer || !currentRound) return;
    if (selectedAnswer && groupAnswerIds.includes(selectedAnswer)) return;

    const selectedOption = combinedAnswers.find((answer) => answer.answerIds.includes(answerId));
    setSelectedAnswer(answerId);
    vibrate(50);
    setPendingConfirmation({
      kind: 'vote',
      roundId: currentRound.id,
      answerId,
      answerText: selectedOption?.answer_text || '',
      answerIds: groupAnswerIds,
    });
  };

  const handleContinueAfterTimeout = async () => {
    if (!currentRound || !currentPlayer || !showContinueFallback || isForceAdvancing) return;
    setIsForceAdvancing(true);

    try {
      const { GameService } = await import('@fakash/shared');
      await GameService.forceAdvanceRound(currentRound.id, currentPlayer.id);
    } catch (err) {
      console.error('Failed to continue after timeout:', err);
    } finally {
      await syncRoundStateAfterServerAdvance('fallback');
      setIsForceAdvancing(false);
      setShowContinueFallback(false);
    }
  };

  const isFinalRound = currentRound.round_number === game.round_count;
  const hasAdvancedCurrentRound = advancedRoundIdRef.current === currentRound.id;
  const canAdvanceCurrentRound =
    canControlFlow &&
    reviewCountdown === 0 &&
    roundStatus === 'completed' &&
    currentRound.round_number === game.current_round &&
    !isAdvancingRound &&
    !hasAdvancedCurrentRound;

  const handleNextRound = async () => {
    if (!canAdvanceCurrentRound) return;

    advancedRoundIdRef.current = currentRound.id;
    setIsAdvancingRound(true);

    if (isFinalRound) {
      try {
        const { GameService } = await import('@fakash/shared');
        await GameService.advanceToNextRound(game.id, currentPlayer.id);
        const updatedGame = await GameService.getGame(game.id);
        if (updatedGame) {
          useGameStore.setState({ game: updatedGame });
        }
        navigate('/results');
      } catch (err) {
        console.error('Failed to end game:', err);
        advancedRoundIdRef.current = null;
      } finally {
        setIsAdvancingRound(false);
      }
      return;
    }

    roundCreationRef.current = null;

    try {
      const { GameService } = await import('@fakash/shared');
      await GameService.advanceToNextRound(game.id, currentPlayer.id);
      const updatedGame = await GameService.getGame(game.id);
      if (updatedGame) {
        useGameStore.setState({ game: updatedGame });
      }
    } catch (err) {
      console.error('Failed to advance round:', err);
      advancedRoundIdRef.current = null;
    } finally {
      setIsAdvancingRound(false);
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

      <div className="mb-4 flex flex-col items-center gap-2">
        <div className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-center shadow-[0_0_24px_rgba(34,211,238,0.08)]">
          <p className="text-base sm:text-lg font-bold text-white">
            الجولة {stageInfo?.stageNumber ?? 1} / 3 • سؤال {stageInfo?.questionInStage ?? 1} / {stageInfo?.totalQuestionsInStage ?? 1}
          </p>
        </div>
        {currentRoundPoints && currentRoundPoints.multiplier > 1 && (
          <div className={`rounded-full px-4 py-1.5 text-sm font-black ${
            currentRoundPoints.multiplier === 3
              ? 'bg-red-500/20 text-red-300 border border-red-400/30'
              : 'bg-yellow-400/20 text-yellow-200 border border-yellow-300/30'
          }`}>
            {currentRoundPoints.label}
          </div>
        )}
      </div>

      <div className="bg-white/10 backdrop-blur rounded-2xl p-4 max-w-xs w-full">
        {/* ANSWERING PHASE */}
        {roundStatus === 'answering' && (
          <div>
            {!hasLockedAnswer ? (
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
                  disabled={isSubmittingAnswer || !!pendingConfirmation || !timerActive || timeRemaining === 0}
                />
                <button
                  onClick={handleSubmitAnswer}
                  disabled={!answerInput.trim() || isSubmittingAnswer || !!pendingConfirmation || !timerActive || timeRemaining === 0}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 font-bold disabled:opacity-50 active:scale-95 transition-transform duration-150"
                >
                  {isSubmittingAnswer ? 'جارٍ الإرسال...' : 'إرسال'}
                </button>
              </>
            ) : (
              <div className="text-center py-4">
                <p className="text-lg">✅ تم حفظ إجابتك</p>
                <p className="text-xs text-white/50 mt-1">في انتظار اللاعبين الآخرين...</p>
              </div>
            )}
          </div>
        )}

        {roundStatus === 'answering' && showContinueFallback && (
          <button
            onClick={handleContinueAfterTimeout}
            disabled={isForceAdvancing}
            className="mt-3 w-full py-3 rounded-xl bg-white/10 border border-white/20 text-sm font-bold hover:bg-white/15 disabled:opacity-60"
          >
            {isForceAdvancing ? 'جارٍ المتابعة...' : 'متابعة اللعبة'}
          </button>
        )}

        {/* VOTING PHASE */}
        {roundStatus === 'voting' && (
          <div>
            <p className="text-center text-sm mb-3 text-white/60">اختر الإجابة الصحيحة</p>
            {currentPlayerAlsoWroteTruth && (
              <p className="text-center text-xs text-emerald-300 mb-3">
                أنت أيضًا كتبت الإجابة الصحيحة.
              </p>
            )}
            <div className="space-y-2">
              {combinedAnswers.map((answer) => {
                const isOwn = !answer.hasCorrectAnswer && answer.playerIds.includes(currentPlayer.id);
                const isSelected = selectedAnswer !== null && answer.answerIds.includes(selectedAnswer);
                return (
                  <button
                    key={answer.voteTargetId}
                    onClick={() => !isOwn && canSelectVote && handleSubmitVote(answer.voteTargetId, answer.answerIds)}
                    disabled={!canSelectVote || isOwn}
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
              <p className="text-center text-xs text-white/50 mt-3">
                تم تثبيت التصويت
              </p>
            )}
          </div>
        )}

        {roundStatus === 'voting' && showContinueFallback && (
          <button
            onClick={handleContinueAfterTimeout}
            disabled={isForceAdvancing}
            className="mt-3 w-full py-3 rounded-xl bg-white/10 border border-white/20 text-sm font-bold hover:bg-white/15 disabled:opacity-60"
          >
            {isForceAdvancing ? 'جارٍ المتابعة...' : 'متابعة اللعبة'}
          </button>
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
                  disabled={!canAdvanceCurrentRound}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 font-bold disabled:opacity-50 active:scale-95 transition-transform duration-150"
                >
                  {isAdvancingRound || hasAdvancedCurrentRound
                    ? 'جاري الانتقال...'
                    : reviewCountdown > 0
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
      {pendingConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-2xl border border-white/15 bg-[#1f1237] p-5 text-center shadow-2xl">
            <p className="mb-2 text-sm text-white/60">
              {pendingConfirmation.kind === 'answer' ? 'تأكيد الإجابة' : 'تأكيد التصويت'}
            </p>
            <p className="mb-4 break-words text-xl font-bold text-white">
              {pendingConfirmation.kind === 'answer'
                ? pendingConfirmation.answerText
                : pendingConfirmation.answerText}
            </p>
            <p className="mb-4 text-xs text-white/60">
              سيتم التأكيد تلقائياً خلال {confirmationSecondsLeft} ثوانٍ
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  vibrate(30);
                  if (pendingConfirmation.kind === 'vote') {
                    setSelectedAnswer(myVote || null);
                  }
                  clearPendingConfirmation();
                }}
                disabled={isConfirmingChoice}
                className="rounded-xl border border-white/20 bg-white/10 py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                تعديل
              </button>
              <button
                onClick={() => {
                  vibrate(50);
                  void confirmPendingChoice();
                }}
                disabled={isConfirmingChoice}
                className="rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                {isConfirmingChoice ? 'جاري الحفظ...' : 'تأكيد'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, TextInput, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useGameStore, useRoundStore } from '@fakash/shared';
import { Logo } from '../components/core/Logo';

export const GameScreen: React.FC = () => {
  const navigation = useNavigation();
  const { game, currentPlayer } = useGameStore();
  const {
    currentRound,
    question,
    timeRemaining,
    timerActive,
    roundStatus,
    allAnswers,
    myVote,
    hasSubmittedAnswer,
    hasSubmittedVote,
    submitAnswer,
    submitVote,
  } = useRoundStore();

  const [answerText, setAnswerText] = useState('');
  const [selectedAnswerId, setSelectedAnswerId] = useState<string | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);
  const [isForceAdvancing, setIsForceAdvancing] = useState(false);
  const [showContinueFallback, setShowContinueFallback] = useState(false);
  const progressAnim = useRef(new Animated.Value(1)).current;
  const voteSubmitInFlightRef = useRef(false);
  const pendingVoteTargetRef = useRef<string | null>(null);
  const forceAdvanceKeyRef = useRef<string | null>(null);
  const phaseTimerInitializedRef = useRef<string | null>(null);
  const controllerPlayerId = game?.host_id ?? game?.phase_captain_id ?? null;
  const canControlFlow = !!currentPlayer && (!!controllerPlayerId ? currentPlayer.id === controllerPlayerId : false);
  const isVotingOpen = roundStatus === 'voting' && timerActive && timeRemaining > 0;

  const getForceAdvanceWindow = useCallback((round = currentRound) => {
    if (!round) return null;

    const startAt = round.timer_starts_at
      ? new Date(round.timer_starts_at).getTime()
      : Date.now();
    const deadlineAt = startAt + (round.timer_duration * 1000);
    const eligibleAt = canControlFlow ? deadlineAt : deadlineAt + 5000;

    return { deadlineAt, eligibleAt };
  }, [canControlFlow, currentRound]);

  const combinedAnswers = useMemo(() => {
    const normalize = (value: string) => value.trim().toLocaleLowerCase();
    const grouped = new Map<string, {
      id: string;
      answer_text: string;
      answerIds: string[];
      playerIds: Set<string>;
      hasCorrectAnswer: boolean;
      correctAnswerId: string | null;
    }>();

    for (const answer of allAnswers) {
      // Keep truth and lies separate even if they share identical text.
      const key = `${answer.is_correct ? 'truth' : 'lie'}:${normalize(answer.answer_text)}`;
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
        if (answer.is_correct && !group.correctAnswerId) {
          group.hasCorrectAnswer = true;
          group.correctAnswerId = answer.id;
        }
      }

      if (answer.is_correct && !answer.player_id) {
        grouped.get(key)!.correctAnswerId = answer.id;
      }

      if (answer.player_id) {
        grouped.get(key)!.playerIds.add(answer.player_id);
      }
    }

    return Array.from(grouped.values()).map((group) => ({
      id: group.id,
      answer_text: group.answer_text,
      voteTargetId: group.correctAnswerId || group.answerIds[0],
      playerIds: Array.from(group.playerIds),
      hasCorrectAnswer: group.hasCorrectAnswer,
    }));
  }, [allAnswers]);

  const currentPlayerAlsoWroteTruth = useMemo(() => (
    !!currentPlayer && allAnswers.some((answer) => answer.is_correct && answer.player_id === currentPlayer.id)
  ), [allAnswers, currentPlayer]);

  // Guard: redirect if no game or player
  useEffect(() => {
    if (!game || !currentPlayer) {
      console.log('No game or player, redirecting to Join screen');
      navigation.navigate('Join' as never);
    }
  }, [game, currentPlayer, navigation]);

  // Recovery function - fetches current round state from server
  const recoverRoundState = useCallback(async () => {
    if (!game || !currentPlayer) return;

    console.log('Attempting to recover round state from server...');
    setIsRecovering(true);

    try {
      const { RoundService } = await import('@fakash/shared');
      const snapshot = await RoundService.recoverRoundFromServer(game.id, currentPlayer.id);

      if (!snapshot) {
        console.log('No active round found on server');
        return;
      }

      console.log('Found round on server:', snapshot.round);

      useRoundStore.setState({
        currentRound: snapshot.round,
        question: snapshot.question,
        roundNumber: snapshot.round.round_number,
        roundStatus: snapshot.round.status,
        timeRemaining: snapshot.timeRemaining,
        timerActive: snapshot.timerActive,
        allAnswers: snapshot.answers,
        playerAnswers: new Map(),
        myAnswer: snapshot.myAnswer,
        hasSubmittedAnswer: snapshot.hasSubmittedAnswer,
        myVote: snapshot.myVote,
        hasSubmittedVote: snapshot.hasSubmittedVote,
        totalRounds: game.round_count,
        isLoading: false,
      });

      console.log('Recovery complete! Round state restored from server');
    } catch (err) {
      console.error('Recovery failed:', err);
    } finally {
      setIsRecovering(false);
    }
  }, [game, currentPlayer]);

  // Recovery mechanism: self-heal if stuck in loading state
  useEffect(() => {
    if (!game || !currentPlayer) return;
    if (currentRound && question) return; // Already loaded
    if (game.status !== 'playing') return; // Only recover during active games
    if (isRecovering) return; // Already recovering

    // Delay recovery by 2s to avoid race with normal Realtime updates
    const timer = setTimeout(() => {
      console.log('Stuck loading detected, attempting automatic recovery...', {
        hasGame: !!game,
        hasPlayer: !!currentPlayer,
        hasRound: !!currentRound,
        hasQuestion: !!question,
        gameStatus: game.status
      });

      recoverRoundState();
    }, 2000);

    return () => clearTimeout(timer);
  }, [game, currentPlayer, currentRound, question, isRecovering, recoverRoundState]);

  // Clear inputs when round changes
  useEffect(() => {
    if (currentRound) {
      setAnswerText('');
      setSelectedAnswerId(null);
      setShowContinueFallback(false);
    }
  }, [currentRound?.id]);

  useEffect(() => {
    if (roundStatus === 'voting') {
      setSelectedAnswerId(myVote || null);
    }
  }, [currentRound?.id, roundStatus, myVote]);

  useEffect(() => {
    voteSubmitInFlightRef.current = false;
    pendingVoteTargetRef.current = null;
  }, [currentRound?.id, roundStatus]);

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

  // Fetch fresh answers when entering voting to avoid stale options
  useEffect(() => {
    const fetchAnswers = async () => {
      if (!currentRound || roundStatus !== 'voting') return;
      try {
        const { RoundService } = await import('@fakash/shared');
        const answers = await RoundService.getRoundAnswers(currentRound.id);
        useRoundStore.setState({ allAnswers: answers });
      } catch (err) {
        console.error('Failed to load answers for voting phase:', err);
      }
    };

    fetchAnswers();
  }, [currentRound?.id, roundStatus]);

  // Debug logging
  useEffect(() => {
    console.log('GameScreen - State:', {
      hasGame: !!game,
      hasCurrentRound: !!currentRound,
      hasQuestion: !!question,
      roundStatus,
      timeRemaining,
      timerActive,
    });
  }, [game, currentRound, question, roundStatus, timeRemaining, timerActive]);

  // Server-synchronized timer (recalculates from server timestamp every second)
  useEffect(() => {
    if (!timerActive || !currentRound?.timer_starts_at) {
      return;
    }

    const updateTimer = () => {
      const startTime = new Date(currentRound.timer_starts_at!).getTime();
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.max(0, currentRound.timer_duration - elapsed);

      console.log('⏱️ Timer update:', {
        startTime: new Date(currentRound.timer_starts_at!).toISOString(),
        elapsed,
        remaining,
        duration: currentRound.timer_duration
      });

      if (remaining !== timeRemaining) {
        const { setTimeRemaining } = useRoundStore.getState();
        setTimeRemaining(remaining);
      }
    };

    // Update immediately
    updateTimer();

    // Update every second
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [currentRound?.timer_starts_at, currentRound?.timer_duration, timerActive, timeRemaining]);

  // Sync timer animation with store
  useEffect(() => {
    if (timerActive && timeRemaining !== null && currentRound) {
      const progress = timeRemaining / currentRound.timer_duration;
      console.log('Animating progress bar:', { timeRemaining, duration: currentRound.timer_duration, progress });
      Animated.timing(progressAnim, {
        toValue: progress,
        duration: 1000,
        useNativeDriver: false,
      }).start();
    }
  }, [timeRemaining, timerActive, currentRound, progressAnim]);

  // Handle timer expiration - call server-side force_advance_round
  useEffect(() => {
    if (!currentRound || !currentPlayer || !canControlFlow || timeRemaining !== 0) {
      return;
    }
    if (roundStatus !== 'answering' && roundStatus !== 'voting') {
      return;
    }

    // Prevent stale zero from a previous phase from advancing the new phase.
    if (phaseTimerInitializedRef.current !== roundStatus) {
      return;
    }

    const forceKey = `${currentRound.id}:${roundStatus}`;
    if (forceAdvanceKeyRef.current === forceKey) {
      return;
    }
    forceAdvanceKeyRef.current = forceKey;

    const handleTimerExpired = async () => {
      console.log('⏰ Timer expired! Calling server-side force_advance_round...');
      try {
        const { GameService } = await import('@fakash/shared');
        await GameService.forceAdvanceRound(currentRound.id, currentPlayer.id);
        await recoverRoundState();
        console.log('Server processing timer expiration');
      } catch (err) {
        console.error('Error calling force_advance_round:', err);
        await recoverRoundState();
        forceAdvanceKeyRef.current = null;
      }
    };

    // Small delay to prevent multiple rapid calls
    const timer = setTimeout(handleTimerExpired, 500);
    return () => clearTimeout(timer);
  }, [currentRound?.id, timeRemaining, roundStatus, canControlFlow, recoverRoundState]);

  // Clear force-advance guard when timer is re-initialized for a phase.
  useEffect(() => {
    if (!currentRound) {
      forceAdvanceKeyRef.current = null;
      phaseTimerInitializedRef.current = null;
      return;
    }

    if (timeRemaining > 0) {
      forceAdvanceKeyRef.current = null;
      phaseTimerInitializedRef.current = roundStatus;
    }
  }, [currentRound?.id, roundStatus, timeRemaining]);

  // Loading guard - will redirect if no game/player
  if (!game || !currentPlayer) {
    return null; // Navigation will happen in useEffect
  }

  // Show loading while waiting for round to start
  if (!currentRound || !question) {
    return (
      <View style={styles.container}>
        <Logo size="md" style={styles.logo} />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>
            {isRecovering ? 'جاري استعادة الحالة من الخادم...' : 'في انتظار بدء الجولة...'}
          </Text>
          {!isRecovering && game.status === 'playing' && (
            <TouchableOpacity
              style={styles.retryButton}
              onPress={recoverRoundState}
            >
              <Text style={styles.retryButtonText}>🔄 إعادة المحاولة</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  const handleSubmitAnswer = async () => {
    if (!answerText.trim() || !currentPlayer) {
      return;
    }

    try {
      await submitAnswer(currentPlayer.id, answerText.trim());
    } catch (err) {
      console.error('Failed to submit answer:', err);
    }
  };

  const flushPendingVote = useCallback(async () => {
    if (!currentPlayer || voteSubmitInFlightRef.current) {
      return;
    }

    while (pendingVoteTargetRef.current) {
      const targetAnswerId = pendingVoteTargetRef.current;
      pendingVoteTargetRef.current = null;
      voteSubmitInFlightRef.current = true;

      try {
        await submitVote(currentPlayer.id, targetAnswerId);
      } catch (err) {
        console.error('Failed to submit vote:', err);
        voteSubmitInFlightRef.current = false;

        if (pendingVoteTargetRef.current) {
          continue;
        }

        const persistedVote = useRoundStore.getState().myVote;
        setSelectedAnswerId(persistedVote || null);
        useRoundStore.setState({ hasSubmittedVote: !!persistedVote });
        return;
      }

      voteSubmitInFlightRef.current = false;
    }
  }, [currentPlayer, submitVote]);

  const handleVote = async (answerId: string) => {
    if (!currentPlayer || !isVotingOpen) {
      return;
    }

    if (selectedAnswerId === answerId) {
      return;
    }

    // Optimistically set current selection and keep editable until timer ends.
    useRoundStore.setState({ hasSubmittedVote: true });
    setSelectedAnswerId(answerId);
    pendingVoteTargetRef.current = answerId;
    void flushPendingVote();
  };

  const handleContinueAfterTimeout = async () => {
    if (!currentRound || !currentPlayer || !showContinueFallback || isForceAdvancing) {
      return;
    }
    setIsForceAdvancing(true);

    try {
      const { GameService } = await import('@fakash/shared');
      await GameService.forceAdvanceRound(currentRound.id, currentPlayer.id);
    } catch (err) {
      console.error('Failed to continue after timeout:', err);
    } finally {
      await recoverRoundState();
      setIsForceAdvancing(false);
      setShowContinueFallback(false);
    }
  };

  return (
    <View style={styles.container}>
      <Logo size="md" style={styles.logo} />

      <View style={styles.contentContainer}>
        {/* Phase-based content */}
        {roundStatus === 'answering' && (
          <View style={styles.answerInputContainer}>
            {!hasSubmittedAnswer ? (
              <>
                <TextInput
                  style={styles.answerInput}
                  placeholder="اكتب إجابتك هنا..."
                  placeholderTextColor="#9ca3af"
                  value={answerText}
                  onChangeText={setAnswerText}
                  maxLength={100}
                  multiline
                  textAlign="right"
                  editable={timerActive && timeRemaining > 0}
                />
                <TouchableOpacity
                  style={[
                    styles.submitButton,
                    (!answerText.trim() || !timerActive || timeRemaining === 0) && styles.submitButtonDisabled
                  ]}
                  onPress={handleSubmitAnswer}
                  disabled={!answerText.trim() || !timerActive || timeRemaining === 0}
                  activeOpacity={0.8}
                >
                  <Text style={styles.submitButtonText}>إرسال الإجابة</Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.submittedContainer}>
                <Text style={styles.submittedIcon}>✅</Text>
                <Text style={styles.submittedText}>تم إرسال إجابتك</Text>
                <Text style={styles.waitingText}>في انتظار اللاعبين الآخرين...</Text>
              </View>
            )}
          </View>
        )}

        {roundStatus === 'answering' && showContinueFallback && (
          <TouchableOpacity
            style={[
              styles.secondaryActionButton,
              isForceAdvancing && styles.secondaryActionButtonDisabled,
            ]}
            onPress={handleContinueAfterTimeout}
            disabled={isForceAdvancing}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryActionText}>
              {isForceAdvancing ? 'جارٍ المتابعة...' : 'متابعة اللعبة'}
            </Text>
          </TouchableOpacity>
        )}

        {roundStatus === 'voting' && (
          <View style={styles.votingContainer}>
            <Text style={styles.votingTitle}>اختر الإجابة الصحيحة</Text>
            {currentPlayerAlsoWroteTruth && (
              <Text style={styles.truthAttributionText}>أنت أيضًا كتبت الإجابة الصحيحة.</Text>
            )}
            <ScrollView style={styles.answersList}>
              {combinedAnswers.map((answer) => {
                const isOwnAnswer = !answer.hasCorrectAnswer && answer.playerIds.includes(currentPlayer?.id || '');
                return (
                  <TouchableOpacity
                    key={answer.id}
                    style={[
                      styles.answerCard,
                      selectedAnswerId === answer.voteTargetId && styles.answerCardSelected,
                      (!isVotingOpen || isOwnAnswer) && styles.answerCardDisabled,
                      isOwnAnswer && styles.ownAnswerCard,
                    ]}
                    onPress={() => !isOwnAnswer && isVotingOpen && handleVote(answer.voteTargetId)}
                    disabled={!isVotingOpen || isOwnAnswer}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.answerCardText}>{answer.answer_text}</Text>
                    {!answer.hasCorrectAnswer && answer.playerIds.length > 1 && (
                      <Text style={styles.answerMetaText}>({answer.playerIds.length} لاعبين)</Text>
                    )}
                    {isOwnAnswer && (
                      <Text style={styles.ownAnswerLabel}>إجابتك</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {hasSubmittedVote && (
              <Text style={styles.waitingText}>
                تم حفظ التصويت{isVotingOpen ? ' - يمكنك تغييره حتى ينتهي الوقت' : ''}
              </Text>
            )}
          </View>
        )}

        {roundStatus === 'voting' && showContinueFallback && (
          <TouchableOpacity
            style={[
              styles.secondaryActionButton,
              isForceAdvancing && styles.secondaryActionButtonDisabled,
            ]}
            onPress={handleContinueAfterTimeout}
            disabled={isForceAdvancing}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryActionText}>
              {isForceAdvancing ? 'جارٍ المتابعة...' : 'متابعة اللعبة'}
            </Text>
          </TouchableOpacity>
        )}

        {roundStatus === 'completed' && (
          <View style={styles.completedContainer}>
            <Text style={styles.completedIcon}>🎉</Text>
            <Text style={styles.completedText}>انتهت الجولة</Text>
            <Text style={styles.waitingText}>في انتظار الجولة التالية...</Text>
          </View>
        )}

        {/* Timer */}
        <View style={styles.timerContainer}>
          {timerActive && timeRemaining !== null && (
            <Text style={styles.timerText}>{timeRemaining} ثانية</Text>
          )}
          <View style={styles.progressBarContainer}>
            <Animated.View
              style={[
                styles.progressBar,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%']
                  })
                }
              ]}
            />
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a0933',
    paddingTop: 60,
  },
  logo: {
    alignSelf: 'center',
    marginBottom: 32,
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'space-between',
  },
  answerInputContainer: {
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  answerInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 2,
    borderColor: '#8b5cf6',
    borderRadius: 16,
    padding: 20,
    fontSize: 18,
    color: '#ffffff',
    marginBottom: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#ec4899',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 48,
    alignSelf: 'center',
    shadowColor: '#ec4899',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
  },
  submittedContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  submittedIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  submittedText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#10b981',
    marginBottom: 12,
  },
  votingContainer: {
    flex: 1,
    paddingVertical: 16,
  },
  votingTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 16,
  },
  truthAttributionText: {
    fontSize: 14,
    color: '#6ee7b7',
    textAlign: 'center',
    marginBottom: 12,
  },
  answersList: {
    flex: 1,
  },
  answerCard: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    borderWidth: 2,
    borderColor: '#8b5cf6',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
  },
  answerCardSelected: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  answerCardDisabled: {
    opacity: 0.5,
  },
  answerCardText: {
    fontSize: 18,
    color: '#ffffff',
    textAlign: 'right',
  },
  answerMetaText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'right',
    marginTop: 4,
  },
  ownAnswerCard: {
    borderColor: '#fbbf24',
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
  },
  ownAnswerLabel: {
    fontSize: 12,
    color: '#fbbf24',
    marginTop: 4,
    fontWeight: 'bold',
    textAlign: 'right',
  },
  completedContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  completedIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  completedText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#10b981',
    marginBottom: 12,
  },
  waitingText: {
    fontSize: 16,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 16,
  },
  timerContainer: {
    marginBottom: 40,
  },
  timerText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#10b981',
    textAlign: 'center',
    marginBottom: 8,
  },
  progressBarContainer: {
    height: 40,
    backgroundColor: 'rgba(75, 85, 99, 0.3)',
    borderRadius: 20,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#10b981',
    borderRadius: 20,
    shadowColor: '#06b6d4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  loadingText: {
    fontSize: 18,
    color: '#8b5cf6',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#8b5cf6',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
  },
  secondaryActionButton: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignSelf: 'center',
    marginTop: 12,
  },
  secondaryActionButtonDisabled: {
    opacity: 0.55,
  },
  secondaryActionText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
  },
});


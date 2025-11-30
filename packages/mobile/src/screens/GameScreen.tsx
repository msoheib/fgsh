import React, { useState, useEffect, useRef, useCallback } from 'react';
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
    hasSubmittedAnswer,
    hasSubmittedVote,
    submitAnswer,
    submitVote,
  } = useRoundStore();

  const [answerText, setAnswerText] = useState('');
  const [selectedAnswerId, setSelectedAnswerId] = useState<string | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);
  const progressAnim = useRef(new Animated.Value(1)).current;

  // Guard: redirect if no game or player
  useEffect(() => {
    if (!game || !currentPlayer) {
      console.log('⚠️ No game or player, redirecting to Join screen');
      navigation.navigate('Join' as never);
    }
  }, [game, currentPlayer, navigation]);

  // Recovery function - fetches current round state from server
  const recoverRoundState = useCallback(async () => {
    if (!game || !currentPlayer) return;

    console.log('🔄 Attempting to recover round state from server...');
    setIsRecovering(true);

    try {
      const { RoundService, getSupabase } = await import('@fakash/shared');

      // Fetch current round from server
      const round = await RoundService.getCurrentRound(game.id);

      if (!round) {
        console.log('⚠️ No active round found on server');
        setIsRecovering(false);
        return;
      }

      console.log('✅ Found round on server:', round);

      // Fetch question
      const supabase = getSupabase();
      const { data: q } = await supabase
        .from('questions')
        .select('*')
        .eq('id', round.question_id)
        .single();

      if (!q) {
        console.log('⚠️ Failed to fetch question');
        setIsRecovering(false);
        return;
      }

      // Fetch answers if in voting phase
      const answers = round.status === 'voting'
        ? await RoundService.getRoundAnswers(round.id)
        : [];

      // Calculate time remaining from server timestamp
      const startTime = round.timer_starts_at
        ? new Date(round.timer_starts_at).getTime()
        : Date.now();
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.max(0, round.timer_duration - elapsed);

      // Check if player has already submitted answer
      const { data: playerAnswer } = await supabase
        .from('player_answers')
        .select('*')
        .eq('round_id', round.id)
        .eq('player_id', currentPlayer.id)
        .maybeSingle();

      // Check if player has already voted
      const { data: playerVote } = await supabase
        .from('votes')
        .select('*')
        .eq('round_id', round.id)
        .eq('voter_id', currentPlayer.id)
        .maybeSingle();

      // Restore round store state
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

      console.log('✅ Recovery complete! Round state restored from server');
      setIsRecovering(false);
    } catch (err) {
      console.error('❌ Recovery failed:', err);
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
      console.log('🔄 Stuck loading detected, attempting automatic recovery...', {
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
    }
  }, [currentRound?.id]);

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
    console.log('🎮 GameScreen - State:', {
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
      console.log('🎬 Animating progress bar:', { timeRemaining, duration: currentRound.timer_duration, progress });
      Animated.timing(progressAnim, {
        toValue: progress,
        duration: 1000,
        useNativeDriver: false,
      }).start();
    }
  }, [timeRemaining, timerActive, currentRound, progressAnim]);

  // Handle timer expiration - call server-side force_advance_round
  useEffect(() => {
    if (!currentRound || timeRemaining !== 0) {
      return;
    }

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
        } else {
          console.log('✅ Server processing timer expiration');
        }
      } catch (err) {
        console.error('❌ Error calling force_advance_round:', err);
      }
    };

    // Small delay to prevent multiple rapid calls
    const timer = setTimeout(handleTimerExpired, 500);
    return () => clearTimeout(timer);
  }, [currentRound, timeRemaining]);

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

  const handleVote = async (answerId: string) => {
    if (!currentPlayer || hasSubmittedVote) {
      return;
    }

    try {
      // Optimistically block repeat taps
      useRoundStore.setState({ hasSubmittedVote: true });
      setSelectedAnswerId(answerId);
      await submitVote(currentPlayer.id, answerId);
    } catch (err) {
      console.error('Failed to submit vote:', err);
      // Allow retry on error
      useRoundStore.setState({ hasSubmittedVote: false });
    }
  };

  return (
    <View style={styles.container}>
      <Logo size="md" style={styles.logo} />

      <View style={styles.contentContainer}>
        {/* Question Card */}
        <View style={styles.questionCard}>
          <View style={styles.questionIconContainer}>
            <Text style={styles.questionIcon}>؟</Text>
          </View>
          <Text style={styles.questionText}>{question.question_text}</Text>
        </View>

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

        {roundStatus === 'voting' && (
          <View style={styles.votingContainer}>
            <Text style={styles.votingTitle}>اختر الإجابة الصحيحة</Text>
            <ScrollView style={styles.answersList}>
              {allAnswers.map((answer) => {
                const isOwnAnswer = answer.player_id === currentPlayer?.id;
                return (
                  <TouchableOpacity
                    key={answer.id}
                    style={[
                      styles.answerCard,
                      selectedAnswerId === answer.id && styles.answerCardSelected,
                      (hasSubmittedVote || isOwnAnswer) && styles.answerCardDisabled,
                      isOwnAnswer && styles.ownAnswerCard,
                    ]}
                    onPress={() => !isOwnAnswer && handleVote(answer.id)}
                    disabled={hasSubmittedVote || isOwnAnswer}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.answerCardText}>{answer.answer_text}</Text>
                    {isOwnAnswer && (
                      <Text style={styles.ownAnswerLabel}>إجابتك</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {hasSubmittedVote && (
              <Text style={styles.waitingText}>في انتظار التصويت...</Text>
            )}
          </View>
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
  questionCard: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderWidth: 2,
    borderColor: '#8b5cf6',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
  },
  questionIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ec4899',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  questionIcon: {
    fontSize: 32,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  questionText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 36,
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
});

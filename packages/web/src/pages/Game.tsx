import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { Timer } from '../components/Timer';
import { LeaveGameButton } from '../components/LeaveGameButton';
import { useGameStore, useRoundStore, GAME_CONFIG } from '@fakash/shared';

export const Game: React.FC = () => {
  const navigate = useNavigate();
  const { game, currentPlayer, players, isHost, isPhaseCaptain, isDisplayMode, rehydrationAttempted } = useGameStore();
  const {
    currentRound,
    question,
    roundStatus,
    myAnswer,
    hasSubmittedAnswer,
    allAnswers,
    hasSubmittedVote,
    submitAnswer,
    submitVote,
    timeRemaining,
    setTimeRemaining,
    timerActive,
  } = useRoundStore();

  const [answerInput, setAnswerInput] = useState('');
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);
  const roundCreationRef = React.useRef<number | null>(null);

  // Recovery function - fetches current round state from server
  const recoverRoundState = React.useCallback(async () => {
    // Display mode doesn't have a player, so skip recovery for display mode
    if (!game || (!currentPlayer && !isDisplayMode)) return;
    if (isDisplayMode) return; // Display mode can't recover player-specific state

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

      // Check if player has already submitted answer (only for players, not display mode)
      const { data: playerAnswer } = currentPlayer ? await supabase
        .from('player_answers')
        .select('*')
        .eq('round_id', round.id)
        .eq('player_id', currentPlayer.id)
        .maybeSingle() : { data: null };

      // Check if player has already voted (only for players, not display mode)
      const { data: playerVote } = currentPlayer ? await supabase
        .from('votes')
        .select('*')
        .eq('round_id', round.id)
        .eq('voter_id', currentPlayer.id)
        .maybeSingle() : { data: null };

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

  // Guard: only redirect if rehydration has been attempted and still no game/player
  useEffect(() => {
    // Wait for rehydration to complete before making navigation decisions
    if (!rehydrationAttempted) {
      return;
    }

    // If rehydration completed but no game found, redirect to home
    // For display mode, we don't need a currentPlayer
    if (!game || (!currentPlayer && !isDisplayMode)) {
      navigate('/');
      return;
    }

    // Subscribe to round creation for participants
    if (!isPhaseCaptain && !currentRound && game.status === 'playing') {
      console.log('👥 Participant waiting for round to be created...');
    }

    // Auto-start the first round if not already started (PHASE CAPTAIN ONLY)
    const initializeRound = async () => {
      const needsNewRound = !currentRound || currentRound.round_number < game.current_round;

      console.log('🔍 Phase captain checking round creation:', {
        currentRoundId: currentRound?.id,
        currentRoundNumber: currentRound?.round_number,
        gameCurrentRound: game.current_round,
        needsNewRound,
        roundCreationRef: roundCreationRef.current,
        isPhaseCaptain,
        gameStatus: game.status
      });

      // Create round if: no current round OR current round is behind game's current_round
      // This handles both initial round and subsequent rounds (even during 3s delay)
      if (
        needsNewRound &&
        roundCreationRef.current !== game.current_round &&
        isPhaseCaptain &&
        game.status === 'playing' &&
        game.current_round > 0
      ) {
        roundCreationRef.current = game.current_round; // Track which round we're creating
        try {
          console.log('🎮 Phase captain creating round', game.current_round);
          const { startRound } = useRoundStore.getState();
          await startRound(game.id, game.current_round, game.round_count);
          console.log('✅ Phase captain successfully created round', game.current_round);
        } catch (err: any) {
          console.error('❌ Failed to initialize round:', err);
          roundCreationRef.current = null; // Reset on error so we can retry
          if (err.message?.includes('No questions available')) {
            alert('لا توجد أسئلة في قاعدة البيانات. يرجى تشغيل seed.sql في Supabase');
            navigate('/');
          } else if (err.message?.includes('duplicate key')) {
            // Round already exists, ignore error and wait for Realtime
            console.log('⚠️ Round already exists, waiting for Realtime event...');
            roundCreationRef.current = game.current_round; // Mark as handled
          }
        }
      }
    };

    initializeRound();
  }, [game, currentPlayer, currentRound, isPhaseCaptain, navigate, rehydrationAttempted]);

  // Handle timer expiration - call server-side force_advance_round
  // Phase transitions now happen automatically via database triggers!
  // Timer expiration handler - any connected player can call this
  // The RPC function is idempotent, so multiple calls are safe
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

    // Small delay to prevent multiple rapid calls from single client
    // Multiple clients calling simultaneously is OK due to RPC idempotency
    const timer = setTimeout(handleTimerExpired, 500);
    return () => clearTimeout(timer);
  }, [currentRound, timeRemaining]);

  // Server-synchronized timer (recalculates from server timestamp every second)
  useEffect(() => {
    if (!timerActive || !currentRound?.timer_starts_at) {
      return;
    }

    const updateTimer = () => {
      const startTime = new Date(currentRound.timer_starts_at!).getTime();
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.max(0, currentRound.timer_duration - elapsed);

      if (remaining !== timeRemaining) {
        setTimeRemaining(remaining);
      }
    };

    // Update immediately
    updateTimer();

    // Update every second
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [currentRound?.timer_starts_at, currentRound?.timer_duration, timerActive, setTimeRemaining, timeRemaining]);

  // Recovery mechanism: self-heal if stuck in loading state
  // If game exists but round/question missing, fetch from server
  useEffect(() => {
    // Allow recovery for both players and display mode
    if (!game || (!currentPlayer && !isDisplayMode)) return;
    if (currentRound && question) return; // Already loaded
    if (game.status !== 'playing') return; // Only recover during active games
    if (isRecovering) return; // Already recovering

    // Delay recovery by 2s to avoid race with normal Realtime updates
    // Longer delay gives phase captain time to create the round
    const timer = setTimeout(() => {
      console.log('🔄 Stuck loading detected, attempting automatic recovery...', {
        hasGame: !!game,
        hasPlayer: !!currentPlayer,
        isDisplayMode,
        hasRound: !!currentRound,
        hasQuestion: !!question,
        gameStatus: game.status
      });

      // Only players can recover, display mode just waits
      if (!isDisplayMode) {
        recoverRoundState();
      }
    }, 2000); // Increased from 1500ms to 2000ms

    return () => clearTimeout(timer);
  }, [game, currentPlayer, isDisplayMode, currentRound, question, isRecovering, recoverRoundState]);

  // Loading guard - allow display mode without currentPlayer
  if (!game || (!currentPlayer && !isDisplayMode) || !currentRound || !question) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <GlassCard className="text-center max-w-md">
          <p className="text-lg mb-4">
            {isDisplayMode ? '📺 جاري تحميل الجولة...' : 'جاري التحميل...'}
          </p>

          {game && game.status === 'playing' && !currentRound && (
            <p className="text-sm text-white/60 mb-4">
              {isDisplayMode
                ? 'في انتظار قائد اللعبة لبدء الجولة...'
                : 'في انتظار إنشاء الجولة...'
              }
            </p>
          )}

          {game && currentPlayer && !isRecovering && (
            <GradientButton
              variant="cyan"
              onClick={recoverRoundState}
              className="mt-4"
            >
              🔄 إعادة المحاولة
            </GradientButton>
          )}

          {isRecovering && (
            <p className="text-sm text-white/60 mt-2">جاري استعادة الحالة من الخادم...</p>
          )}

          {isDisplayMode && !isRecovering && (
            <p className="text-sm text-white/60 mt-2">
              📺 وضع العرض - في انتظار تحديثات اللعبة...
            </p>
          )}

          {game && game.status === 'waiting' && (
            <GradientButton
              variant="purple"
              onClick={() => navigate('/lobby')}
              className="mt-4"
            >
              العودة للردهة
            </GradientButton>
          )}

          {/* Leave button - visible for both display mode and players */}
          <div className="mt-4">
            <LeaveGameButton variant="secondary" size="md" />
          </div>
        </GlassCard>
      </div>
    );
  }

  const handleSubmitAnswer = async () => {
    if (!answerInput.trim() || !currentPlayer) return;

    try {
      await submitAnswer(currentPlayer.id, answerInput);
      setAnswerInput('');
    } catch (err) {
      console.error('Failed to submit answer:', err);
    }
  };

  const handleSubmitVote = async (answerId: string) => {
    if (!currentPlayer) return;

    try {
      await submitVote(currentPlayer.id, answerId);
      setSelectedAnswer(answerId);
    } catch (err) {
      console.error('Failed to submit vote:', err);
    }
  };

  // Question phase - showing submitted answers count
  const submittedCount = players.filter((p) =>
    allAnswers.some((a) => a.player_id === p.id)
  ).length;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 relative">
      {/* Leave button in top-right corner */}
      <div className="absolute top-4 right-4 z-10">
        <LeaveGameButton variant="secondary" size="sm" />
      </div>

      <Logo size="sm" className="mb-4 sm:mb-6" />

      <div className="w-full max-w-3xl mb-3 sm:mb-4 px-2">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-2 sm:gap-0">
          <p className="text-base sm:text-lg">
            الجولة {currentRound.round_number} / {game.round_count}
          </p>
          <Timer duration={currentRound.timer_duration} timeRemaining={timeRemaining} />
        </div>
        {isPhaseCaptain && (
          <div className="mt-2 text-center">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-secondary-main/30 to-secondary-light/30 border border-secondary-main/50 text-xs sm:text-sm">
              <span className="text-secondary-main">👑</span>
              <span>أنت قائد اللعبة</span>
            </span>
          </div>
        )}
      </div>

      <GlassCard className="max-w-3xl w-full">
        {/* Question display */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-start gap-3 sm:gap-4 mb-4 sm:mb-6">
            <div className="text-3xl sm:text-5xl">❓</div>
            <div className="flex-1 glass rounded-2xl p-4 sm:p-6">
              <h2 className="text-lg sm:text-2xl font-bold text-center">{question.question_text}</h2>
            </div>
          </div>
        </div>

        {/* Answer phase */}
        {roundStatus === 'answering' && (
          <div>
            {isDisplayMode ? (
              // Display mode - show waiting status only
              <div className="text-center p-4 sm:p-8">
                <p className="text-lg sm:text-xl mb-3 sm:mb-4">📺 وضع العرض</p>
                <p className="text-sm sm:text-base text-white/60">
                  في انتظار إجابات اللاعبين... ({submittedCount}/{players.length})
                </p>
              </div>
            ) : !hasSubmittedAnswer ? (
              <>
                <div className="mb-4 sm:mb-6">
                  <label className="block text-right mb-2 sm:mb-3 text-base sm:text-lg font-semibold">
                    إجابتك
                  </label>
                  <input
                    type="text"
                    value={answerInput}
                    onChange={(e) => setAnswerInput(e.target.value)}
                    placeholder="اكتب إجابتك هنا..."
                    className="input-glass text-base sm:text-lg"
                    maxLength={GAME_CONFIG.MAX_ANSWER_LENGTH}
                    onKeyPress={(e) => e.key === 'Enter' && handleSubmitAnswer()}
                    autoFocus
                  />
                </div>

                <GradientButton
                  variant="pink"
                  onClick={handleSubmitAnswer}
                  className="w-full"
                  disabled={!answerInput.trim()}
                >
                  إرسال الإجابة
                </GradientButton>
              </>
            ) : (
              <div className="text-center p-4 sm:p-8">
                <p className="text-lg sm:text-xl mb-3 sm:mb-4">✅ تم إرسال إجابتك</p>
                <p className="text-sm sm:text-base text-white/60">
                  في انتظار باقي اللاعبين... ({submittedCount}/{players.length})
                </p>
              </div>
            )}
          </div>
        )}

        {/* Voting phase */}
        {roundStatus === 'voting' && (
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-center mb-4 sm:mb-6">
              {isDisplayMode ? 'الإجابات المقدمة' : 'صوت للإجابة الصحيحة'}
            </h3>

            <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-6">
              {allAnswers.map((answer) => (
                <button
                  key={answer.id}
                  onClick={() => {
                    if (!isDisplayMode && !hasSubmittedVote) {
                      handleSubmitVote(answer.id);
                    }
                  }}
                  disabled={
                    isDisplayMode || hasSubmittedVote || (currentPlayer && answer.player_id != null && answer.player_id === currentPlayer.id)
                  }
                  className={`w-full p-3 sm:p-4 rounded-2xl font-bold text-base sm:text-lg transition-all ${
                    selectedAnswer === answer.id
                      ? 'bg-gradient-to-r from-secondary-main to-secondary-light shadow-glow-cyan'
                      : currentPlayer && answer.player_id != null && answer.player_id === currentPlayer.id
                      ? 'glass opacity-50 cursor-not-allowed'
                      : isDisplayMode
                      ? 'glass cursor-default'
                      : 'glass hover:bg-white/20'
                  }`}
                >
                  {answer.answer_text}
                  {currentPlayer && answer.player_id != null && answer.player_id === currentPlayer.id && ' (إجابتك)'}
                </button>
              ))}
            </div>

            {isDisplayMode ? (
              <p className="text-center text-sm sm:text-base text-white/60">
                📺 في انتظار تصويت اللاعبين...
              </p>
            ) : hasSubmittedVote && (
              <p className="text-center text-sm sm:text-base text-white/60">
                تم التصويت! في انتظار باقي اللاعبين...
              </p>
            )}
          </div>
        )}

        {/* Results phase */}
        {roundStatus === 'completed' && (
          <div className="text-center">
            <div className="mb-4 sm:mb-6 p-4 sm:p-6 bg-gradient-to-br from-secondary-main to-secondary-light rounded-2xl sm:rounded-3xl">
              <p className="text-base sm:text-lg mb-2">الإجابة الصحيحة</p>
              <p className="text-2xl sm:text-3xl font-bold">{question.correct_answer}</p>
            </div>

            {/* Show who fooled whom */}
            <div className="mb-4 sm:mb-6">
              <h3 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4">نتائج الجولة</h3>
              {/* This would show detailed results */}
            </div>

            <GradientButton
              variant="pink"
              onClick={() => {
                // Only navigate to results on final round
                // Otherwise, let automatic round advancement happen
                if (currentRound.round_number === game.round_count) {
                  navigate('/results');
                }
              }}
              className="w-full"
            >
              {currentRound.round_number === game.round_count
                ? 'النتائج النهائية'
                : 'الجولة التالية'}
            </GradientButton>
          </div>
        )}
      </GlassCard>
    </div>
  );
};

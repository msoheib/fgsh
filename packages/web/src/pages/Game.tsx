import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore, useRoundStore, GAME_CONFIG } from '@fakash/shared';

// Ultra-minimal player input screen - zero animations for lowest latency
export const Game: React.FC = () => {
  const navigate = useNavigate();
  const { game, currentPlayer, isPhaseCaptain, isDisplayMode, rehydrationAttempted } = useGameStore();
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
  const roundCreationRef = useRef<number | null>(null);
  const isCreatingRoundRef = useRef<boolean>(false);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    if (!game || !rehydrationAttempted || game.status !== 'playing' || !isPhaseCaptain) return;

    const needsNewRound = !currentRound || currentRound.round_number < game.current_round;

    if (needsNewRound && roundCreationRef.current !== game.current_round && game.current_round > 0 && !isCreatingRoundRef.current) {
      isCreatingRoundRef.current = true;
      roundCreationRef.current = game.current_round;

      (async () => {
        try {
          const { startRound } = useRoundStore.getState();
          await startRound(game.id, game.current_round, game.round_count);
        } catch (err: any) {
          if (!err.message?.includes('duplicate key')) {
            roundCreationRef.current = null;
          }
        } finally {
          isCreatingRoundRef.current = false;
        }
      })();
    }
  }, [game, currentRound, isPhaseCaptain, rehydrationAttempted]);

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
    if (!currentRound || timeRemaining !== 0) return;
    
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
  }, [currentRound?.id, timeRemaining]);

  // Recovery if stuck
  useEffect(() => {
    if (!game || !currentPlayer || (currentRound && question) || game.status !== 'playing' || isRecovering) return;
    const timer = setTimeout(() => recoverRoundState(), 3000);
    return () => clearTimeout(timer);
  }, [game, currentPlayer, currentRound, question, isRecovering, recoverRoundState]);

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
            onClick={() => navigate('/lobby')}
            className="w-full py-3 mb-2 rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 font-bold"
          >
            العودة للردهة
          </button>
          <button
            onClick={() => {
              useGameStore.getState().leaveGame();
              navigate('/');
            }}
            className="w-full py-2 rounded-xl bg-white/10 text-sm"
          >
            مغادرة اللعبة
          </button>
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
    try {
      await submitAnswer(currentPlayer.id, answerInput);
      setAnswerInput('');
    } catch (err) {
      console.error('Failed to submit:', err);
    }
  };

  const handleSubmitVote = async (answerId: string) => {
    if (hasSubmittedVote) return;
    useRoundStore.setState({ hasSubmittedVote: true });
    try {
      await submitVote(currentPlayer.id, answerId);
      setSelectedAnswer(answerId);
    } catch (err) {
      console.error('Failed to vote:', err);
      useRoundStore.setState({ hasSubmittedVote: false });
    }
  };

  const isFinalRound = currentRound.round_number === game.round_count;

  const handleNextRound = async () => {
    if (!isPhaseCaptain) return;

    if (isFinalRound) {
      try {
        const { GameService } = await import('@fakash/shared');
        await GameService.endGame(game.id);
      } catch (err) {
        console.error('Failed to end game:', err);
      }
      navigate('/results');
      return;
    }

    const nextRoundNumber = currentRound.round_number + 1;
    roundCreationRef.current = null;

    try {
      const { getSupabase } = await import('@fakash/shared');
      const supabase = getSupabase();
      await supabase.from('games').update({ current_round: nextRoundNumber }).eq('id', game.id);
      const { startRound } = useRoundStore.getState();
      await startRound(game.id, nextRoundNumber, game.round_count);
    } catch (err) {
      console.error('Failed to advance round:', err);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-primary">
      {/* Minimal header */}
      <p className="text-xs text-white/40 mb-3">
        الجولة {currentRound.round_number}/{game.round_count}
        {isPhaseCaptain && ' • 👑'}
      </p>

      <div className="bg-white/10 backdrop-blur rounded-2xl p-4 max-w-xs w-full">
        {/* ANSWERING PHASE */}
        {roundStatus === 'answering' && (
          <div>
            <p className="text-base font-bold text-center mb-4 p-3 bg-white/5 rounded-xl">
              {question.question_text}
            </p>

            {!hasSubmittedAnswer ? (
              <>
                <input
                  type="text"
                  value={answerInput}
                  onChange={(e) => setAnswerInput(e.target.value)}
                  placeholder="اكتب كذبتك..."
                  className="w-full p-3 mb-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-pink-500"
                  maxLength={GAME_CONFIG.MAX_ANSWER_LENGTH}
                  onKeyPress={(e) => e.key === 'Enter' && handleSubmitAnswer()}
                  autoFocus
                />
                <button
                  onClick={handleSubmitAnswer}
                  disabled={!answerInput.trim()}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 font-bold disabled:opacity-50"
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
              {allAnswers.map((answer) => {
                const isOwn = answer.player_id === currentPlayer.id;
                const isSelected = selectedAnswer === answer.id;
                return (
                  <button
                    key={answer.id}
                    onClick={() => !hasSubmittedVote && !isOwn && handleSubmitVote(answer.id)}
                    disabled={hasSubmittedVote || isOwn}
                    className={`w-full p-3 rounded-xl text-right ${
                      isSelected
                        ? 'bg-cyan-500 text-white'
                        : isOwn
                        ? 'bg-white/5 opacity-40'
                        : 'bg-white/10 active:bg-white/20'
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

            {isPhaseCaptain && (
              <button
                onClick={handleNextRound}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 font-bold"
              >
                {isFinalRound ? 'النتائج' : 'التالي ➡️'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

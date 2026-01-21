import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { LeaveGameButton } from '../components/LeaveGameButton';
import { useGameStore, useRoundStore, GAME_CONFIG } from '@fakash/shared';

// Minimal player input screen - no animations, focused on fast input
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

  // Loading states
  if (!game || !currentPlayer) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white/60">جارٍ التحميل...</p>
        </div>
      </div>
    );
  }

  if (game.status === 'waiting') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <GlassCard className="text-center max-w-sm">
          <p className="text-lg mb-4">اللعبة لم تبدأ بعد</p>
          <GradientButton variant="purple" onClick={() => navigate('/lobby')} className="w-full mb-3">
            العودة للردهة
          </GradientButton>
          <LeaveGameButton variant="secondary" size="md" />
        </GlassCard>
      </div>
    );
  }

  if (!currentRound || !question) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white/60">جارٍ تحميل الجولة...</p>
          {isRecovering && <p className="text-xs text-white/40 mt-2">استعادة الحالة...</p>}
          <LeaveGameButton variant="secondary" size="sm" className="mt-4" />
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
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      {/* Leave button */}
      <div className="absolute top-4 right-4">
        <LeaveGameButton variant="secondary" size="sm" />
      </div>

      {/* Minimal header */}
      <div className="text-center mb-4">
        <p className="text-xs text-white/50">
          الجولة {currentRound.round_number}/{game.round_count}
          {isPhaseCaptain && ' • 👑 قائد'}
        </p>
      </div>

      <GlassCard className="max-w-sm w-full">
        {/* ANSWERING PHASE */}
        {roundStatus === 'answering' && (
          <div>
            <div className="mb-4 p-3 bg-white/5 rounded-xl">
              <p className="text-base font-bold text-center">{question.question_text}</p>
            </div>

            {!hasSubmittedAnswer ? (
              <>
                <input
                  type="text"
                  value={answerInput}
                  onChange={(e) => setAnswerInput(e.target.value)}
                  placeholder="اكتب إجابتك..."
                  className="input-glass text-base mb-3"
                  maxLength={GAME_CONFIG.MAX_ANSWER_LENGTH}
                  onKeyPress={(e) => e.key === 'Enter' && handleSubmitAnswer()}
                  autoFocus
                />
                <GradientButton
                  variant="pink"
                  onClick={handleSubmitAnswer}
                  className="w-full"
                  disabled={!answerInput.trim()}
                >
                  إرسال
                </GradientButton>
              </>
            ) : (
              <div className="text-center py-6">
                <p className="text-lg">✅ تم الإرسال</p>
                <p className="text-xs text-white/50 mt-2">تابع على الشاشة الرئيسية</p>
              </div>
            )}
          </div>
        )}

        {/* VOTING PHASE */}
        {roundStatus === 'voting' && (
          <div>
            <p className="text-center text-sm mb-3 text-white/70">اختر الإجابة الصحيحة</p>
            <div className="space-y-2">
              {allAnswers.map((answer) => {
                const isOwn = answer.player_id === currentPlayer.id;
                const isSelected = selectedAnswer === answer.id;
                return (
                  <button
                    key={answer.id}
                    onClick={() => !hasSubmittedVote && !isOwn && handleSubmitVote(answer.id)}
                    disabled={hasSubmittedVote || isOwn}
                    className={`w-full p-3 rounded-xl text-right transition-all ${
                      isSelected
                        ? 'bg-secondary-main text-white'
                        : isOwn
                        ? 'glass opacity-40'
                        : 'glass hover:bg-white/10'
                    }`}
                  >
                    {answer.answer_text}
                    {isOwn && <span className="text-xs opacity-60"> (إجابتك)</span>}
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
            <div className="mb-4 p-3 bg-secondary-main/30 rounded-xl">
              <p className="text-xs text-white/70">الإجابة الصحيحة</p>
              <p className="text-lg font-bold">{question.correct_answer}</p>
            </div>

            {isPhaseCaptain ? (
              <GradientButton variant="pink" onClick={handleNextRound} className="w-full">
                {isFinalRound ? 'النتائج النهائية' : 'الجولة التالية'}
              </GradientButton>
            ) : (
              <p className="text-xs text-white/50">انتظر قائد اللعبة...</p>
            )}
          </div>
        )}
      </GlassCard>
    </div>
  );
};

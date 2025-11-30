import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { Timer } from '../components/Timer';
import { LeaveGameButton } from '../components/LeaveGameButton';
import { useGameStore, useRoundStore, GAME_CONFIG } from '@fakash/shared';

export const Game: React.FC = () => {
  const navigate = useNavigate();
  const { game, currentPlayer, players, isPhaseCaptain, isDisplayMode, rehydrationAttempted } = useGameStore();
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

  // Recovery function - fetches current round state from server
  const recoverRoundState = useCallback(async () => {
    if (!game || (!currentPlayer && !isDisplayMode)) return;
    if (isDisplayMode) return;

    console.log('🔄 Attempting to recover round state from server...');
    setIsRecovering(true);

    try {
      const { RoundService, getSupabase } = await import('@fakash/shared');
      const round = await RoundService.getCurrentRound(game.id);

      if (!round) {
        console.log('⚠️ No active round found on server');
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

      const { data: playerAnswer } = currentPlayer ? await supabase
        .from('player_answers')
        .select('*')
        .eq('round_id', round.id)
        .eq('player_id', currentPlayer.id)
        .maybeSingle() : { data: null };

      const { data: playerVote } = currentPlayer ? await supabase
        .from('votes')
        .select('*')
        .eq('round_id', round.id)
        .eq('voter_id', currentPlayer.id)
        .maybeSingle() : { data: null };

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

      console.log('✅ Recovery complete!');
      setIsRecovering(false);
    } catch (err) {
      console.error('❌ Recovery failed:', err);
      setIsRecovering(false);
    }
  }, [game, currentPlayer, isDisplayMode]);

  // Navigation guard - redirect if no game/player
  useEffect(() => {
    if (!rehydrationAttempted) return;

    if (!game || (!currentPlayer && !isDisplayMode)) {
      navigate('/');
      return;
    }

    if (game.status === 'finished') {
      navigate('/results');
      return;
    }
  }, [game, currentPlayer, isDisplayMode, navigate, rehydrationAttempted]);

  // Phase captain: create round when needed
  useEffect(() => {
    if (!game || !rehydrationAttempted) return;
    if (game.status !== 'playing') return;
    if (!isPhaseCaptain) return;

    const needsNewRound = !currentRound || currentRound.round_number < game.current_round;

    if (
      needsNewRound &&
      roundCreationRef.current !== game.current_round &&
      game.current_round > 0 &&
      !isCreatingRoundRef.current
    ) {
      isCreatingRoundRef.current = true;
      roundCreationRef.current = game.current_round;

      (async () => {
        try {
          console.log('🎮 Phase captain creating round', game.current_round);
          const { startRound } = useRoundStore.getState();
          await startRound(game.id, game.current_round, game.round_count);
          console.log('✅ Round created successfully');
        } catch (err: any) {
          console.error('❌ Failed to create round:', err);
          if (!err.message?.includes('duplicate key')) {
            roundCreationRef.current = null;
          }
        } finally {
          isCreatingRoundRef.current = false;
        }
      })();
    }
  }, [game, currentRound, isPhaseCaptain, rehydrationAttempted]);

  // Simple local timer countdown - NO server sync spam
  useEffect(() => {
    // Clear any existing interval
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (!currentRound || !timerActive || timeRemaining <= 0) {
      return;
    }

    // Simple countdown every second
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

  // Recovery mechanism if stuck loading
  useEffect(() => {
    if (!game || (!currentPlayer && !isDisplayMode)) return;
    if (currentRound && question) return;
    if (game.status !== 'playing') return;
    if (isRecovering) return;
    if (isDisplayMode) return;

    const timer = setTimeout(() => {
      console.log('🔄 Stuck loading, attempting recovery...');
      recoverRoundState();
    }, 3000);

    return () => clearTimeout(timer);
  }, [game, currentPlayer, isDisplayMode, currentRound, question, isRecovering, recoverRoundState]);

  // Refresh player scores when a round completes so results show latest totals
  useEffect(() => {
    const syncScores = async () => {
      if (!game || roundStatus !== 'completed') return;
      try {
        const { GameService } = await import('@fakash/shared');
        const updatedPlayers = await GameService.getGamePlayers(game.id);
        useGameStore.setState({ players: updatedPlayers });
      } catch (err) {
        console.error('Failed to refresh scores after round completion:', err);
      }
    };

    syncScores();
  }, [game, roundStatus]);

  // Loading screen
  if (!game || (!currentPlayer && !isDisplayMode) || !currentRound || !question) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <GlassCard className="text-center max-w-md">
          <p className="text-lg mb-4">جاري التحميل...</p>

          {game && game.status === 'playing' && !currentRound && (
            <p className="text-sm text-white/60 mb-4">في انتظار إنشاء الجولة...</p>
          )}

          {game && currentPlayer && !isRecovering && (
            <GradientButton variant="cyan" onClick={recoverRoundState} className="mt-4">
              🔄 إعادة المحاولة
            </GradientButton>
          )}

          {isRecovering && (
            <p className="text-sm text-white/60 mt-2">جاري استعادة الحالة...</p>
          )}

          {game && game.status === 'waiting' && (
            <GradientButton variant="purple" onClick={() => navigate('/lobby')} className="mt-4">
              العودة للردهة
            </GradientButton>
          )}

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

    // Prevent duplicate vote submission
    if (hasSubmittedVote) {
      console.log('Vote already submitted, ignoring duplicate click');
      return;
    }

    // Set hasSubmittedVote immediately to prevent double-clicks
    useRoundStore.setState({ hasSubmittedVote: true });

    try {
      await submitVote(currentPlayer.id, answerId);
      setSelectedAnswer(answerId);
    } catch (err) {
      console.error('Failed to submit vote:', err);
      // Revert hasSubmittedVote only on error
      useRoundStore.setState({ hasSubmittedVote: false });
    }
  };

  const submittedCount = players.filter((p) =>
    allAnswers.some((a) => a.player_id === p.id)
  ).length;

  const isFinalRound = currentRound.round_number === game.round_count;

  // Host clicks this to go to next round
  const handleNextRound = async () => {
    if (!game || !currentRound || !isPhaseCaptain) return;

    if (isFinalRound) {
      // Final round: mark game finished and navigate to results
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

    if (nextRoundNumber > game.round_count) {
      navigate('/results');
      return;
    }

    console.log('👑 Host advancing to round:', nextRoundNumber);
    roundCreationRef.current = null;

    try {
      // Update game's current_round in database
      const { getSupabase } = await import('@fakash/shared');
      const supabase = getSupabase();
      
      await supabase
        .from('games')
        .update({ current_round: nextRoundNumber })
        .eq('id', game.id);

      // Create the new round
      const { startRound } = useRoundStore.getState();
      await startRound(game.id, nextRoundNumber, game.round_count);
      console.log('✅ Next round started');
    } catch (err) {
      console.error('❌ Failed to start next round:', err);
    }
  };

  // Get player scores for display
  const playerScores = players
    .map(p => ({ name: p.user_name, score: p.score || 0 }))
    .sort((a, b) => b.score - a.score);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 relative">
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
                  disabled={!!isDisplayMode || !!hasSubmittedVote || !!(currentPlayer && answer.player_id === currentPlayer.id)}
                  className={`w-full p-3 sm:p-4 rounded-2xl font-bold text-base sm:text-lg transition-all ${
                    selectedAnswer === answer.id
                      ? 'bg-gradient-to-r from-secondary-main to-secondary-light shadow-glow-cyan'
                      : currentPlayer && answer.player_id === currentPlayer.id
                      ? 'glass opacity-50 cursor-not-allowed'
                      : isDisplayMode
                      ? 'glass cursor-default'
                      : 'glass hover:bg-white/20'
                  }`}
                >
                  {answer.answer_text}
                  {currentPlayer && answer.player_id === currentPlayer.id && ' (إجابتك)'}
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

        {/* Results phase - shows correct answer + scores */}
        {roundStatus === 'completed' && (
          <div className="text-center">
            <div className="mb-4 sm:mb-6 p-4 sm:p-6 bg-gradient-to-br from-secondary-main to-secondary-light rounded-2xl sm:rounded-3xl">
              <p className="text-base sm:text-lg mb-2">الإجابة الصحيحة</p>
              <p className="text-2xl sm:text-3xl font-bold">{question.correct_answer}</p>
            </div>

            {/* Scores display */}
            <div className="mb-6">
              <h3 className="text-lg sm:text-xl font-bold mb-4">🏆 النتائج الحالية</h3>
              <div className="space-y-2">
                {playerScores.map((player, index) => (
                  <div
                    key={player.name}
                    className={`flex justify-between items-center p-3 rounded-xl ${
                      index === 0 ? 'bg-yellow-500/20 border border-yellow-500/50' : 'glass'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {index === 0 && <span>🥇</span>}
                      {index === 1 && <span>🥈</span>}
                      {index === 2 && <span>🥉</span>}
                      <span className="font-semibold">{player.name}</span>
                    </span>
                    <span className="text-lg font-bold">{player.score} نقطة</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Next round button - HOST ONLY */}
            {isFinalRound ? (
              isPhaseCaptain ? (
                <GradientButton variant="pink" onClick={() => navigate('/results')} className="w-full">
                  🏁 النتائج النهائية
                </GradientButton>
              ) : (
                <div className="glass rounded-2xl p-4 text-white/80">
                  ⏳ في انتظار قائد اللعبة لإنهاء اللعبة...
                </div>
              )
            ) : isPhaseCaptain ? (
              <GradientButton variant="pink" onClick={handleNextRound} className="w-full">
                ➡️ الجولة التالية
              </GradientButton>
            ) : (
              <div className="glass rounded-2xl p-4 text-white/80">
                ⏳ في انتظار قائد اللعبة للانتقال للجولة التالية...
              </div>
            )}
          </div>
        )}
      </GlassCard>
    </div>
  );
};

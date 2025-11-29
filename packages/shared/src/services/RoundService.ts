import { getSupabase } from './supabase';
import {
  GameRound,
  Question,
  PlayerAnswer,
  Vote,
  GameError,
  ErrorType,
} from '../types';
import { validateAnswer, sanitizeText } from '../utils/validation';
import { GAME_CONFIG } from '../constants/game';

export class RoundService {
  /**
   * Create a new round with a random question
   */
  static async createRound(
    gameId: string,
    roundNumber: number,
    language: string = 'ar'
  ): Promise<{ round: GameRound; question: Question }> {
    const supabase = getSupabase();

    // Check if round already exists (idempotent operation)
    const { data: existingRound } = await supabase
      .from('game_rounds')
      .select('*, question:questions(*)')
      .eq('game_id', gameId)
      .eq('round_number', roundNumber)
      .maybeSingle();

    if (existingRound) {
      console.log('✅ Round already exists, returning existing round:', existingRound);
      return { round: existingRound, question: existingRound.question! };
    }

    // Get a random question that hasn't been used in this game
    const { data: usedQuestionIds } = await supabase
      .from('game_rounds')
      .select('question_id')
      .eq('game_id', gameId);

    const usedIds = usedQuestionIds?.map((r) => r.question_id) || [];

    // Get random unused question
    const { data: questions, error: questionError } = await supabase
      .from('questions')
      .select('*')
      .eq('language', language)
      .not('id', 'in', `(${usedIds.length > 0 ? usedIds.join(',') : '00000000-0000-0000-0000-000000000000'})`)
      .limit(10);

    if (questionError || !questions || questions.length === 0) {
      throw new GameError(ErrorType.CONNECTION_LOST, 'No questions available');
    }

    const question = questions[Math.floor(Math.random() * questions.length)];

    // Count connected players to establish fixed quorum for this round
    const { count: playerCount, error: countError } = await supabase
      .from('players')
      .select('*', { count: 'exact', head: true })
      .eq('game_id', gameId)
      .eq('connection_status', 'connected');

    if (countError) {
      throw new GameError(ErrorType.CONNECTION_LOST, countError.message);
    }

    const requiredPlayers = Math.max(playerCount || 2, 2); // Minimum 2 players

    // Create round - use server time by omitting timer_starts_at (database DEFAULT NOW())
    const { data: round, error: roundError } = await supabase
      .from('game_rounds')
      .insert({
        game_id: gameId,
        round_number: roundNumber,
        question_id: question.id,
        status: 'answering',
        required_players: requiredPlayers, // Fixed quorum for this round
        // timer_starts_at will use database DEFAULT NOW() for server time
        timer_duration: GAME_CONFIG.ANSWER_TIMER,
      })
      .select()
      .single();

    // Handle duplicate key error (race condition - another client created it simultaneously)
    if (roundError && roundError.code === '23505') {
      console.log('⚠️ Duplicate key error, fetching existing round...');
      const { data: existing } = await supabase
        .from('game_rounds')
        .select('*, question:questions(*)')
        .eq('game_id', gameId)
        .eq('round_number', roundNumber)
        .single();

      if (existing) {
        return { round: existing, question: existing.question! };
      }
    }

    if (roundError || !round) {
      throw new GameError(ErrorType.CONNECTION_LOST, roundError?.message);
    }

    return { round, question };
  }

  /**
   * Submit player answer for current round
   */
  static async submitAnswer(
    roundId: string,
    playerId: string,
    answerText: string,
    _correctAnswer: string
  ): Promise<PlayerAnswer> {
    const supabase = getSupabase();

    // Validate answer
    validateAnswer(answerText);

    const sanitizedAnswer = sanitizeText(answerText);
    const isCorrect = false; // Player answers are never marked as correct

    const { data, error } = await supabase
      .from('player_answers')
      .insert({
        round_id: roundId,
        player_id: playerId,
        answer_text: sanitizedAnswer,
        is_correct: isCorrect,
      })
      .select()
      .single();

    if (error) {
      // Handle duplicate submissions gracefully (e.g. double-click, retry after reconnect)
      if (error.code === '23505') {
        console.log('⚠️ Duplicate answer detected, returning existing record');
        const { data: existingAnswer, error: fetchError } = await supabase
          .from('player_answers')
          .select('*')
          .eq('round_id', roundId)
          .eq('player_id', playerId)
          .single();

        if (fetchError) {
          throw new GameError(ErrorType.CONNECTION_LOST, fetchError.message);
        }

        if (existingAnswer) {
          return existingAnswer;
        }
      }

      throw new GameError(ErrorType.CONNECTION_LOST, error.message);
    }

    return data;
  }

  /**
   * Add correct answer to the answer pool
   */
  static async addCorrectAnswer(
    roundId: string,
    correctAnswer: string
  ): Promise<PlayerAnswer> {
    const supabase = getSupabase();

    // Use NULL player_id for system-inserted correct answer
    const { data, error } = await supabase
      .from('player_answers')
      .insert({
        round_id: roundId,
        player_id: null, // System answer (no player)
        answer_text: correctAnswer,
        is_correct: true,
      })
      .select()
      .single();

    if (error) {
      throw new GameError(ErrorType.CONNECTION_LOST, error.message);
    }

    return data;
  }

  /**
   * Get all answers for a round (shuffled for voting)
   */
  static async getRoundAnswers(roundId: string): Promise<PlayerAnswer[]> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('player_answers')
      .select('*, player:players(*)')
      .eq('round_id', roundId);

    if (error) {
      throw new GameError(ErrorType.CONNECTION_LOST, error.message);
    }

    // Shuffle answers for voting
    const shuffled = (data || []).sort(() => Math.random() - 0.5);
    return shuffled;
  }

  /**
   * Submit vote for an answer
   */
  static async submitVote(
    roundId: string,
    voterId: string,
    answerId: string
  ): Promise<Vote> {
    const supabase = getSupabase();

    // Verify voter is not voting for their own answer
    const { data: answer } = await supabase
      .from('player_answers')
      .select('player_id')
      .eq('id', answerId)
      .single();

    if (answer?.player_id === voterId) {
      throw new GameError(ErrorType.CONNECTION_LOST, 'Cannot vote for own answer');
    }

    const { data, error } = await supabase
      .from('votes')
      .insert({
        round_id: roundId,
        voter_id: voterId,
        answer_id: answerId,
        points_earned: 0, // Will be calculated later
      })
      .select()
      .single();

    if (error) {
      throw new GameError(ErrorType.CONNECTION_LOST, error.message);
    }

    return data;
  }

  /**
   * Get all votes for a round
   */
  static async getRoundVotes(roundId: string): Promise<Vote[]> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('votes')
      .select('*')
      .eq('round_id', roundId);

    if (error) {
      throw new GameError(ErrorType.CONNECTION_LOST, error.message);
    }

    return data || [];
  }

  /**
   * Update round status
   */
  static async updateRoundStatus(
    roundId: string,
    status: 'answering' | 'voting' | 'completed'
  ): Promise<GameRound> {
    const supabase = getSupabase();

    const updateData: any = { status };

    // Reset timer when transitioning to voting phase
    // Use a special marker that triggers DB default
    if (status === 'voting') {
      updateData.timer_duration = 20; // 20 seconds for voting
      // Don't set timer_starts_at - let it update via trigger or we'll fetch fresh
    }

    await supabase
      .from('game_rounds')
      .update(updateData)
      .eq('id', roundId);

    // Fetch the updated round to get server's timer_starts_at
    const { data: updatedRound, error } = await supabase
      .from('game_rounds')
      .select('*')
      .eq('id', roundId)
      .single();

    if (error || !updatedRound) {
      throw new GameError(ErrorType.CONNECTION_LOST, error?.message || 'Failed to fetch updated round');
    }

    return updatedRound;
  }

  /**
   * Get current round for a game
   */
  static async getCurrentRound(gameId: string): Promise<GameRound | null> {
    const supabase = getSupabase();

    const { data } = await supabase
      .from('games')
      .select('current_round')
      .eq('id', gameId)
      .single();

    if (!data || !data.current_round) {
      return null;
    }

    const { data: round } = await supabase
      .from('game_rounds')
      .select('*, question:questions(*)')
      .eq('game_id', gameId)
      .eq('round_number', data.current_round)
      .single();

    return round;
  }
}

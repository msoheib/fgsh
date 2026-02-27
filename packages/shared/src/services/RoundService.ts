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
  private static normalizeAnswerKey(value: string): string {
    return value.trim().toLocaleLowerCase();
  }

  private static getAnswerGroupKey(value: string, isCorrect: boolean): string {
    // Keep truth and lies separate, even when text is identical.
    return `${isCorrect ? 'truth' : 'lie'}:${this.normalizeAnswerKey(value)}`;
  }

  /**
   * Create a new round with a random question
   */
  static async createRound(
    gameId: string,
    roundNumber: number,
    language: string = 'ar',
    category?: string | null
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

    // Get random unused question (filtered by selected category when provided)
    let questionQuery = supabase
      .from('questions')
      .select('*')
      .eq('language', language)
      .not('id', 'in', `(${usedIds.length > 0 ? usedIds.join(',') : '00000000-0000-0000-0000-000000000000'})`)
      .limit(30);

    if (category) {
      questionQuery = questionQuery.eq('category', category);
    }

    let { data: questions, error: questionError } = await questionQuery;

    // Graceful fallback:
    // 1) Keep selected category even if we must reuse a previous question.
    // 2) Only then fall back to any category.
    if ((!questions || questions.length === 0) && category) {
      const sameCategoryReuse = await supabase
        .from('questions')
        .select('*')
        .eq('language', language)
        .eq('category', category)
        .limit(30);

      questions = sameCategoryReuse.data;
      questionError = sameCategoryReuse.error;
    }

    if ((!questions || questions.length === 0) && category) {
      const fallbackAnyCategory = await supabase
        .from('questions')
        .select('*')
        .eq('language', language)
        .not('id', 'in', `(${usedIds.length > 0 ? usedIds.join(',') : '00000000-0000-0000-0000-000000000000'})`)
        .limit(30);

      questions = fallbackAnyCategory.data;
      questionError = fallbackAnyCategory.error;
    }

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

      const errorCode = error.code ? ` [${error.code}]` : '';
      throw new GameError(ErrorType.CONNECTION_LOST, `Vote insert failed${errorCode}: ${error.message}`);
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
      const errorText = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLocaleLowerCase();
      const duplicateByAnswerConstraint = error.code === '23505' && (
        errorText.includes('answer_id') ||
        errorText.includes('round_id, answer_id') ||
        errorText.includes('votes_round_id_answer_id') ||
        errorText.includes('votes_answer_id')
      );

      if (duplicateByAnswerConstraint) {
        throw new GameError(
          ErrorType.CONNECTION_LOST,
          'Vote constraint mismatch detected. Multiple players must be able to vote the same answer.'
        );
      }

      // Handle duplicate vote gracefully (e.g. double-click, retry after reconnect)
      if (error.code === '23505') {
        console.log('⚠️ Duplicate vote detected, returning existing record');
        const { data: existingVote, error: fetchError } = await supabase
          .from('votes')
          .select('*')
          .eq('round_id', roundId)
          .eq('voter_id', voterId)
          .single();

        if (fetchError) {
          throw new GameError(ErrorType.CONNECTION_LOST, fetchError.message);
        }

        if (existingVote) {
          return existingVote;
        }
      }

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
   * Get complete reveal data for a round - answers with their voters
   * Used for Fibbage-style iterative answer reveal
   */
  static async getRoundRevealData(roundId: string): Promise<{
    answers: Array<{
      id: string;
      text: string;
      isCorrect: boolean;
      isSystemLie: boolean;
      authorId: string | null;
      authorName: string | null;
      voters: Array<{ id: string; name: string }>;
      voteCount: number;
    }>;
  }> {
    const supabase = getSupabase();

    // Fetch answers with player info
    const { data: answers, error: answersError } = await supabase
      .from('player_answers')
      .select('id, answer_text, is_correct, player_id, player:players(id, user_name)')
      .eq('round_id', roundId);

    if (answersError) {
      throw new GameError(ErrorType.CONNECTION_LOST, answersError.message);
    }

    // Fetch votes with voter info
    const { data: votes, error: votesError } = await supabase
      .from('votes')
      .select('answer_id, voter_id, voter:players!votes_voter_id_fkey(id, user_name)')
      .eq('round_id', roundId);

    if (votesError) {
      throw new GameError(ErrorType.CONNECTION_LOST, votesError.message);
    }

    // Group votes by answer_id
    const votesByAnswer = new Map<string, Array<{ id: string; name: string }>>();
    for (const vote of votes || []) {
      const ansId = vote.answer_id;
      if (!votesByAnswer.has(ansId)) {
        votesByAnswer.set(ansId, []);
      }
      if (vote.voter) {
        votesByAnswer.get(ansId)!.push({
          id: (vote.voter as any).id,
          name: (vote.voter as any).user_name,
        });
      }
    }

    // Build grouped reveal data (same text answers are shown once)
    const grouped = new Map<string, {
      id: string;
      text: string;
      isCorrect: boolean;
      authorIds: Set<string>;
      authorNames: Set<string>;
      voters: Map<string, { id: string; name: string }>;
      answerIds: string[];
    }>();

    for (const ans of answers || []) {
      const key = this.getAnswerGroupKey(ans.answer_text, !!ans.is_correct);
      if (!grouped.has(key)) {
        grouped.set(key, {
          id: ans.id,
          text: ans.answer_text,
          isCorrect: ans.is_correct,
          authorIds: new Set<string>(),
          authorNames: new Set<string>(),
          voters: new Map<string, { id: string; name: string }>(),
          answerIds: [],
        });
      }

      const group = grouped.get(key)!;
      group.answerIds.push(ans.id);
      group.isCorrect = group.isCorrect || ans.is_correct;

      if (ans.player_id) {
        group.authorIds.add(ans.player_id);
      }
      if (ans.player) {
        group.authorNames.add((ans.player as any).user_name);
      }

      const voters = votesByAnswer.get(ans.id) || [];
      for (const voter of voters) {
        group.voters.set(voter.id, voter);
      }
    }

    const revealAnswers = Array.from(grouped.values()).map((group) => {
      const isSystemLie = !group.isCorrect && group.authorIds.size === 0;
      return {
        id: group.id,
        text: group.text,
        isCorrect: group.isCorrect,
        isSystemLie,
        authorId: group.isCorrect || group.authorIds.size === 0 ? null : Array.from(group.authorIds)[0],
        authorName: group.isCorrect
          ? null
          : isSystemLie
            ? 'النظام'
            : Array.from(group.authorNames).join(' + '),
        voters: Array.from(group.voters.values()),
        voteCount: group.voters.size,
      };
    });

    // Sort: lies with votes first, then correct answer last
    revealAnswers.sort((a, b) => {
      if (a.isCorrect && !b.isCorrect) return 1;
      if (!a.isCorrect && b.isCorrect) return -1;
      return b.voteCount - a.voteCount; // More votes first
    });

    return { answers: revealAnswers };
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

    const { data, error } = await supabase
      .from('games')
      .select('current_round')
      .eq('id', gameId)
      .single();

    if (error && error.code === '406') {
      // No active round yet
      return null;
    }

    if (!data || !data.current_round) {
      return null;
    }

    const { data: round, error: roundError } = await supabase
      .from('game_rounds')
      .select('*, question:questions(*)')
      .eq('game_id', gameId)
      .eq('round_number', data.current_round)
      .maybeSingle();

    if (roundError && roundError.code !== 'PGRST116') {
      // If not found, fall through to return null
      throw roundError;
    }

    return round;
  }
}

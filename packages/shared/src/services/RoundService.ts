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
import { getGameSession } from '../utils/sessionStorage';

export class RoundService {
  private static getPlayerSession(playerId?: string, gameId?: string): {
    gameId: string;
    playerId: string;
    playerToken: string;
  } {
    const session = getGameSession();
    if (!session?.playerId || !session.playerToken) {
      throw new GameError(ErrorType.UNAUTHORIZED, 'Player session expired');
    }

    if (playerId && session.playerId !== playerId) {
      throw new GameError(ErrorType.UNAUTHORIZED, 'Player session mismatch');
    }

    if (gameId && session.gameId !== gameId) {
      throw new GameError(ErrorType.UNAUTHORIZED, 'Game session mismatch');
    }

    return {
      gameId: session.gameId,
      playerId: session.playerId,
      playerToken: session.playerToken,
    };
  }

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
      console.log('Round already exists, returning existing round:', existingRound);
      return { round: existingRound, question: existingRound.question! };
    }

    const session = this.getPlayerSession(undefined, gameId);
    const { data: createdRoundData, error: roundError } = await supabase.rpc('create_round_as_player', {
      p_game_id: gameId,
      p_round_number: roundNumber,
      p_player_id: session.playerId,
      p_player_token: session.playerToken,
      p_language: language,
      p_category: category ?? null,
    });

    if (roundError) {
      throw new GameError(ErrorType.CONNECTION_LOST, roundError.message);
    }

    const createdRound = Array.isArray(createdRoundData) ? createdRoundData[0] : createdRoundData;
    const roundId = createdRound?.round_id;

    if (!roundId) {
      throw new GameError(ErrorType.CONNECTION_LOST, 'Failed to create round');
    }

    const { data: roundWithQuestion, error: fetchRoundError } = await supabase
      .from('game_rounds')
      .select('*, question:questions(*)')
      .eq('id', roundId)
      .single();

    if (fetchRoundError || !roundWithQuestion?.question) {
      throw new GameError(ErrorType.CONNECTION_LOST, fetchRoundError?.message || 'Failed to load round');
    }

    return { round: roundWithQuestion, question: roundWithQuestion.question };
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
    const session = this.getPlayerSession(playerId);

    const { data, error } = await supabase.rpc('submit_answer', {
      p_round_id: roundId,
      p_player_id: playerId,
      p_player_token: session.playerToken,
      p_answer_text: sanitizedAnswer,
    });

    if (error) {
      const errorCode = error.code ? ` [${error.code}]` : '';
      throw new GameError(ErrorType.CONNECTION_LOST, `Answer submit failed${errorCode}: ${error.message}`);
    }

    return data as PlayerAnswer;
  }

  /**
   * Add correct answer to the answer pool
   */
  static async addCorrectAnswer(
    _roundId: string,
    _correctAnswer: string
  ): Promise<PlayerAnswer> {
    throw new GameError(
      ErrorType.UNAUTHORIZED,
      'Correct answers are managed server-side only'
    );
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

    const answers = data || [];
    const truthKeys = new Set(
      answers
        .filter((answer) => !!answer.is_correct)
        .map((answer) => this.normalizeAnswerKey(answer.answer_text))
    );
    const filteredAnswers = answers.filter((answer) => (
      answer.is_correct || !truthKeys.has(this.normalizeAnswerKey(answer.answer_text))
    ));

    // Shuffle answers for voting
    const shuffled = filteredAnswers.sort(() => Math.random() - 0.5);
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

    const session = this.getPlayerSession(voterId);
    const { data: castVoteData, error: castVoteError } = await supabase.rpc('cast_vote', {
      p_round_id: roundId,
      p_voter_id: voterId,
      p_player_token: session.playerToken,
      p_answer_id: answerId,
    });

    if (castVoteError) {
      throw new GameError(ErrorType.CONNECTION_LOST, castVoteError.message);
    }

    return (Array.isArray(castVoteData) ? castVoteData[0] : castVoteData) as Vote;
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

    const normalizedTruths = new Set(
      (answers || [])
        .filter((ans) => !!ans.is_correct)
        .map((ans) => this.normalizeAnswerKey(ans.answer_text))
    );

    const effectiveAnswers = (answers || []).filter((ans) => (
      ans.is_correct || !normalizedTruths.has(this.normalizeAnswerKey(ans.answer_text))
    ));

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

    for (const ans of effectiveAnswers) {
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
    _roundId: string,
    _status: 'answering' | 'voting' | 'completed'
  ): Promise<GameRound> {
    throw new GameError(
      ErrorType.UNAUTHORIZED,
      'Round status is managed server-side only'
    );
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



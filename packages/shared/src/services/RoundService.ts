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
import { buildVotingOptions } from '../utils/votingOptions';

export class RoundService {
  static getRoundStatusRank(status: string): number {
    switch (status) {
      case 'completed':
        return 3;
      case 'voting':
        return 2;
      case 'answering':
        return 1;
      default:
        return 0;
    }
  }

  static pickMostAuthoritativeRound(rounds: GameRound[]): GameRound | null {
    if (rounds.length === 0) return null;

    const sorted = [...rounds].sort((a, b) => {
      const statusDelta = this.getRoundStatusRank(b.status) - this.getRoundStatusRank(a.status);
      if (statusDelta !== 0) return statusDelta;

      const aUpdated = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const bUpdated = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      if (bUpdated !== aUpdated) return bUpdated - aUpdated;

      const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bCreated - aCreated;
    });

    return sorted[0] || null;
  }

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

  static async fetchRoundAnswers(roundId: string): Promise<PlayerAnswer[]> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('player_answers')
      .select('*, player:players(*)')
      .eq('round_id', roundId)
      .order('submitted_at', { ascending: true })
      .order('id', { ascending: true });

    if (error) {
      throw new GameError(ErrorType.CONNECTION_LOST, error.message);
    }

    return data || [];
  }

  static async loadVotingAnswersWithRetry(
    roundId: string,
    maxRetries: number = 2,
    retryDelayMs: number = 500
  ): Promise<PlayerAnswer[]> {
    let lastAnswers: PlayerAnswer[] = [];

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const answers = await this.fetchRoundAnswers(roundId);
      lastAnswers = answers;

      const hasSystemTruth = answers.some((answer) => answer.is_correct && !answer.player_id);
      if (answers.length > 0 && hasSystemTruth) {
        return answers;
      }

      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }

    return lastAnswers;
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
   * Get all answers for a round.
   */
  static async getRoundAnswers(roundId: string): Promise<PlayerAnswer[]> {
    return this.loadVotingAnswersWithRetry(roundId);
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

    const persistedVote = (Array.isArray(castVoteData) ? castVoteData[0] : castVoteData) as Vote;

    console.info('[VoteAudit] cast_vote response', {
      roundId,
      voterId,
      requestedAnswerId: answerId,
      storedAnswerId: persistedVote?.answer_id,
    });

    return persistedVote;
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
      authorNames: string[];
      matchingLieAuthorNames: string[];
      voters: Array<{ id: string; name: string }>;
      voteCount: number;
    }>;
  }> {
    const supabase = getSupabase();

    // Fetch answers with player info
    const { data: answers, error: answersError } = await supabase
      .from('player_answers')
      .select('id, round_id, answer_text, is_correct, player_id, submitted_at, player:players(id, user_name)')
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

    const answerRows = (answers || []) as unknown as PlayerAnswer[];
    const votingOptions = buildVotingOptions(roundId, answerRows);
    const normalize = (value: string) => value.trim().toLocaleLowerCase();
    const truthAnswerKeys = new Set(
      votingOptions
        .filter((option) => option.hasCorrectAnswer)
        .map((option) => normalize(option.answer_text))
    );

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

    const hiddenTruthMatchingLieOptions = new Map<string, {
      authorNames: Set<string>;
      voters: Map<string, { id: string; name: string }>;
    }>();

    for (const ans of answerRows) {
      if (ans.is_correct || !truthAnswerKeys.has(normalize(ans.answer_text))) continue;

      const key = normalize(ans.answer_text);
      if (!hiddenTruthMatchingLieOptions.has(key)) {
        hiddenTruthMatchingLieOptions.set(key, {
          authorNames: new Set<string>(),
          voters: new Map<string, { id: string; name: string }>(),
        });
      }

      const hiddenGroup = hiddenTruthMatchingLieOptions.get(key)!;
      if (ans.player) {
        hiddenGroup.authorNames.add((ans.player as any).user_name);
      }
      const voters = votesByAnswer.get(ans.id) || [];
      for (const voter of voters) {
        hiddenGroup.voters.set(voter.id, voter);
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

    for (const ans of (answers || [])) {
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
      if (ans.is_correct && !ans.player_id) {
        group.id = ans.id;
      }

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

    const revealAnswers = Array.from(grouped.entries()).flatMap(([, group]) => {
      if (!group.isCorrect && truthAnswerKeys.has(normalize(group.text))) {
        return [];
      }

      const isSystemLie = !group.isCorrect && group.authorIds.size === 0;
      const authorNames = Array.from(group.authorNames);
      const matchingLieAuthorNames = group.isCorrect
        ? Array.from(hiddenTruthMatchingLieOptions.get(normalize(group.text))?.authorNames || [])
        : [];

      if (group.isCorrect) {
        const matchingLieGroup = hiddenTruthMatchingLieOptions.get(normalize(group.text));
        if (matchingLieGroup) {
          for (const voter of matchingLieGroup.voters.values()) {
            group.voters.set(voter.id, voter);
          }
        }
      }

      return [{
        id: group.id,
        text: group.text,
        isCorrect: group.isCorrect,
        isSystemLie,
        authorId: group.isCorrect || group.authorIds.size === 0 ? null : Array.from(group.authorIds)[0],
        authorName: group.isCorrect
          ? null
          : isSystemLie
            ? 'النظام'
            : authorNames.join(' + '),
        authorNames,
        matchingLieAuthorNames,
        voters: Array.from(group.voters.values()),
        voteCount: group.voters.size,
      }];
    });

    // Sort: lies with votes first, then correct answer last
    revealAnswers.sort((a, b) => {
      if (a.isCorrect && !b.isCorrect) return 1;
      if (!a.isCorrect && b.isCorrect) return -1;
      return b.voteCount - a.voteCount; // More votes first
    });

    console.info('[VoteAudit] reveal attribution', {
      roundId,
      storedVotes: (votes || []).map((vote) => ({
        voterId: vote.voter_id,
        answerId: vote.answer_id,
      })),
      revealGroups: revealAnswers.map((answer) => ({
        answerId: answer.id,
        text: answer.text,
        voteCount: answer.voteCount,
        voterIds: answer.voters.map((voter) => voter.id),
      })),
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

    const { data: rounds, error: roundError } = await supabase
      .from('game_rounds')
      .select('*, question:questions(*)')
      .eq('game_id', gameId)
      .eq('round_number', data.current_round)
      .order('created_at', { ascending: false });

    if (roundError) {
      throw roundError;
    }

    return this.pickMostAuthoritativeRound((rounds || []) as GameRound[]);
  }

  static async recoverRoundFromServer(
    gameId: string,
    playerId: string
  ): Promise<{
    round: GameRound;
    question: Question;
    answers: PlayerAnswer[];
    myAnswer: string | null;
    hasSubmittedAnswer: boolean;
    myVote: string | null;
    hasSubmittedVote: boolean;
    timeRemaining: number;
    timerActive: boolean;
  } | null> {
    const supabase = getSupabase();
    this.getPlayerSession(playerId, gameId);

    const round = await this.getCurrentRound(gameId);
    if (!round) return null;

    const { data: q, error: questionError } = await supabase
      .from('questions')
      .select('*')
      .eq('id', round.question_id)
      .single();

    if (questionError || !q) {
      throw new GameError(
        ErrorType.CONNECTION_LOST,
        questionError?.message || 'Failed to load round question'
      );
    }

    const answers = round.status === 'voting' || round.status === 'completed'
      ? await this.loadVotingAnswersWithRetry(round.id)
      : await this.fetchRoundAnswers(round.id);

    const startTime = round.timer_starts_at
      ? new Date(round.timer_starts_at).getTime()
      : Date.now();
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const rawRemaining = Math.max(0, (round.timer_duration || 0) - elapsed);
    const timeRemaining = round.status === 'completed' ? 0 : rawRemaining;
    const timerActive = round.status !== 'completed' && timeRemaining > 0;

    const { data: playerAnswer } = await supabase
      .from('player_answers')
      .select('answer_text')
      .eq('round_id', round.id)
      .eq('player_id', playerId)
      .maybeSingle();

    const { data: playerVote } = await supabase
      .from('votes')
      .select('answer_id')
      .eq('round_id', round.id)
      .eq('voter_id', playerId)
      .maybeSingle();

    return {
      round,
      question: q as Question,
      answers,
      myAnswer: playerAnswer?.answer_text || null,
      hasSubmittedAnswer: !!playerAnswer,
      myVote: playerVote?.answer_id || null,
      hasSubmittedVote: !!playerVote,
      timeRemaining,
      timerActive,
    };
  }
}



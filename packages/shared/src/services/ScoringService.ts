import { getSupabase } from './supabase';
import { Player, GameError, ErrorType } from '../types';
import { calculateRoundScores, aggregateScores } from '../utils/scoring';

export class ScoringService {
  /**
   * Calculate and update scores after a round
   */
  static async calculateAndUpdateScores(
    roundId: string,
    gameId: string
  ): Promise<{ player_id: string; new_score: number }[]> {
    const supabase = getSupabase();

    // Get all answers and votes for this round
    const { data: answers, error: answersError } = await supabase
      .from('player_answers')
      .select('*')
      .eq('round_id', roundId);

    const { data: votes, error: votesError } = await supabase
      .from('votes')
      .select('*')
      .eq('round_id', roundId);

    if (answersError || votesError) {
      throw new GameError(ErrorType.CONNECTION_LOST, 'Failed to fetch round data');
    }

    // Calculate scores
    const scoreResults = calculateRoundScores(answers || [], votes || []);
    const aggregatedScores = aggregateScores(scoreResults);

    // Get current player scores
    const { data: players, error: playersError } = await supabase
      .from('players')
      .select('id, score')
      .eq('game_id', gameId);

    if (playersError) {
      throw new GameError(ErrorType.CONNECTION_LOST, 'Failed to fetch players');
    }

    // Update player scores
    const updates: { player_id: string; new_score: number }[] = [];

    for (const player of players || []) {
      const roundPoints = aggregatedScores.get(player.id) || 0;
      const newScore = player.score + roundPoints;

      if (roundPoints > 0) {
        await supabase
          .from('players')
          .update({ score: newScore })
          .eq('id', player.id);

        updates.push({
          player_id: player.id,
          new_score: newScore,
        });
      }
    }

    // Update vote points
    for (const scoreResult of scoreResults) {
      const vote = votes?.find(
        (v) => v.voter_id === scoreResult.player_id
      );

      if (vote) {
        await supabase
          .from('votes')
          .update({ points_earned: scoreResult.points_earned })
          .eq('id', vote.id);
      }
    }

    return updates;
  }

  /**
   * Get final leaderboard
   */
  static async getFinalLeaderboard(gameId: string): Promise<
    Array<{
      player: Player;
      rank: number;
    }>
  > {
    const supabase = getSupabase();

    const { data: players, error } = await supabase
      .from('players')
      .select('*')
      .eq('game_id', gameId)
      .order('score', { ascending: false });

    if (error) {
      throw new GameError(ErrorType.CONNECTION_LOST, error.message);
    }

    return (players || []).map((player, index) => ({
      player,
      rank: index + 1,
    }));
  }

  /**
   * Get round statistics
   */
  static async getRoundStatistics(roundId: string): Promise<{
    total_answers: number;
    total_votes: number;
    correct_answer_votes: number;
    fooled_count: Map<string, number>; // player_id -> number of players fooled
  }> {
    const supabase = getSupabase();

    const { data: answers } = await supabase
      .from('player_answers')
      .select('*')
      .eq('round_id', roundId);

    const { data: votes } = await supabase
      .from('votes')
      .select('*')
      .eq('round_id', roundId);

    const correctAnswer = answers?.find((a) => a.is_correct);
    const correctVotes = votes?.filter((v) => v.answer_id === correctAnswer?.id) || [];

    const fooledCount = new Map<string, number>();
    answers
      ?.filter((a) => !a.is_correct)
      .forEach((answer) => {
        const voteCount = votes?.filter((v) => v.answer_id === answer.id).length || 0;
        fooledCount.set(answer.player_id, voteCount);
      });

    return {
      total_answers: answers?.length || 0,
      total_votes: votes?.length || 0,
      correct_answer_votes: correctVotes.length,
      fooled_count: fooledCount,
    };
  }
}

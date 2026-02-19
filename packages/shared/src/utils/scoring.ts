import { GAME_CONFIG } from '../constants/game';
import { PlayerAnswer, Vote, ScoreResult } from '../types';

/**
 * Calculate the score multiplier for a given round
 */
export function getRoundMultiplier(currentRound: number, totalRounds: number): number {
  if (currentRound >= totalRounds) {
    return 3; // Triple points for final round
  }
  if (currentRound > totalRounds / 2) {
    return 2; // Double points for second half
  }
  return 1; // Standard points
}

/**
 * Calculate points earned in a round for each player
 */
export function calculateRoundScores(
  answers: PlayerAnswer[],
  votes: Vote[],
  multiplier: number = 1
): ScoreResult[] {
  const scores: ScoreResult[] = [];

  // Create a map of answer_id -> votes
  const votesByAnswer = new Map<string, Vote[]>();
  const answersById = new Map<string, PlayerAnswer>();

  answers.forEach((answer) => {
    answersById.set(answer.id, answer);
  });

  votes.forEach((vote) => {
    if (!votesByAnswer.has(vote.answer_id)) {
      votesByAnswer.set(vote.answer_id, []);
    }
    votesByAnswer.get(vote.answer_id)!.push(vote);
  });

  // Vote outcomes for voters: truth reward or lie penalty
  votes.forEach((vote) => {
    const votedAnswer = answersById.get(vote.answer_id);
    if (!votedAnswer) return;

    if (votedAnswer.is_correct) {
      scores.push({
        player_id: vote.voter_id,
        points_earned: GAME_CONFIG.POINTS.CORRECT_ANSWER * multiplier,
        reason: 'correct_answer',
      });
    } else {
      scores.push({
        player_id: vote.voter_id,
        points_earned: GAME_CONFIG.POINTS.FALL_FOR_LIE_PENALTY * multiplier,
        reason: 'fell_for_lie',
      });
    }
  });

  answers.forEach((answer) => {
    const votesForAnswer = votesByAnswer.get(answer.id) || [];
    if (answer.is_correct || !answer.player_id) return;

    // Fake answer owner gains points for each fooled player
    const points = (votesForAnswer.length * GAME_CONFIG.POINTS.PER_FOOLED_PLAYER) * multiplier;
    if (points === 0) return;

    scores.push({
      player_id: answer.player_id,
      points_earned: points,
      reason: 'fooled_players',
    });
  });

  return scores;
}

/**
 * Aggregate points by player
 */
export function aggregateScores(
  scores: ScoreResult[]
): Map<string, number> {
  const aggregated = new Map<string, number>();

  scores.forEach((score) => {
    const current = aggregated.get(score.player_id) || 0;
    aggregated.set(score.player_id, current + score.points_earned);
  });

  return aggregated;
}

/**
 * Get fooled relationships (who fooled whom)
 */
export function getFooledRelationships(
  answers: PlayerAnswer[],
  votes: Vote[]
): { fooler_id: string; fooled_ids: string[] }[] {
  const relationships: Map<string, Set<string>> = new Map();

  answers
    .filter((a) => !a.is_correct && a.player_id !== null)
    .forEach((answer) => {
      const fooledBy = votes
        .filter((v) => v.answer_id === answer.id)
        .map((v) => v.voter_id);

      if (fooledBy.length > 0 && answer.player_id) {
        relationships.set(answer.player_id, new Set(fooledBy));
      }
    });

  return Array.from(relationships.entries()).map(([fooler_id, fooled_set]) => ({
    fooler_id,
    fooled_ids: Array.from(fooled_set),
  }));
}

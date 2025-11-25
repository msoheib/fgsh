import { GAME_CONFIG } from '../constants/game';
import { PlayerAnswer, Vote, ScoreResult } from '../types';

/**
 * Calculate points earned in a round for each player
 */
export function calculateRoundScores(
  answers: PlayerAnswer[],
  votes: Vote[]
): ScoreResult[] {
  const scores: ScoreResult[] = [];

  // Create a map of answer_id -> votes
  const votesByAnswer = new Map<string, Vote[]>();
  votes.forEach((vote) => {
    if (!votesByAnswer.has(vote.answer_id)) {
      votesByAnswer.set(vote.answer_id, []);
    }
    votesByAnswer.get(vote.answer_id)!.push(vote);
  });

  answers.forEach((answer) => {
    const votesForAnswer = votesByAnswer.get(answer.id) || [];
    let points = 0;
    let reason: ScoreResult['reason'];

    if (answer.is_correct) {
      // This is the correct answer - players who voted for it get points
      votesForAnswer.forEach((vote) => {
        scores.push({
          player_id: vote.voter_id,
          points_earned: GAME_CONFIG.POINTS.CORRECT_ANSWER,
          reason: 'correct_answer',
        });
      });
    } else {
      // This is a fake answer - player gets points for each vote
      // Skip system-inserted answers (player_id = null)
      if (!answer.player_id) return;

      points = votesForAnswer.length * GAME_CONFIG.POINTS.PER_FOOLED_PLAYER;

      // Bonus for perfect fake (nobody voted for it AND it wasn't correct)
      if (votesForAnswer.length === 0) {
        points += GAME_CONFIG.POINTS.PERFECT_FAKE_BONUS;
        reason = 'perfect_fake';
      } else {
        reason = 'fooled_players';
      }

      if (points > 0) {
        scores.push({
          player_id: answer.player_id,
          points_earned: points,
          reason,
        });
      }
    }
  });

  // Find round winner (highest points in this round) and add bonus
  if (scores.length > 0) {
    const maxPoints = Math.max(...scores.map((s) => s.points_earned));
    const winners = scores.filter((s) => s.points_earned === maxPoints);

    // Add bonus to winner(s)
    winners.forEach((winner) => {
      scores.push({
        player_id: winner.player_id,
        points_earned: GAME_CONFIG.POINTS.ROUND_WINNER_BONUS,
        reason: 'round_winner',
      });
    });
  }

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

import { PlayerAnswer } from '../types';

export interface VotingOption {
  id: string;
  answer_text: string;
  answerIds: string[];
  playerIds: string[];
  voteTargetId: string;
  hasCorrectAnswer: boolean;
}

interface VotingGroup {
  groupKey: string;
  answer_text: string;
  answerIds: string[];
  playerIds: Set<string>;
  hasCorrectAnswer: boolean;
  correctAnswerId: string | null;
  canonicalAnswerId: string;
  canonicalSubmittedAt: number;
}

function normalizeAnswerKey(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function getAnswerGroupKey(answerText: string, isCorrect: boolean): string {
  // Keep truth and lies separate, even when the text is identical.
  return `${isCorrect ? 'truth' : 'lie'}:${normalizeAnswerKey(answerText)}`;
}

function hashString(value: string): number {
  let hash = 2166136261;

  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function buildVotingOptions(roundId: string, answers: PlayerAnswer[]): VotingOption[] {
  const seedRoundId = roundId.trim().length > 0 ? roundId.trim() : 'round';
  const grouped = new Map<string, VotingGroup>();

  for (const answer of answers) {
    const groupKey = getAnswerGroupKey(answer.answer_text, !!answer.is_correct);
    const submittedAt = new Date(answer.submitted_at).getTime();
    const existing = grouped.get(groupKey);

    if (!existing) {
      grouped.set(groupKey, {
        groupKey,
        answer_text: answer.answer_text,
        answerIds: [answer.id],
        playerIds: new Set<string>(),
        hasCorrectAnswer: !!answer.is_correct,
        correctAnswerId: answer.is_correct ? answer.id : null,
        canonicalAnswerId: answer.id,
        canonicalSubmittedAt: submittedAt,
      });
    } else {
      existing.answerIds.push(answer.id);
      if (
        submittedAt < existing.canonicalSubmittedAt ||
        (submittedAt === existing.canonicalSubmittedAt && answer.id < existing.canonicalAnswerId)
      ) {
        existing.canonicalAnswerId = answer.id;
        existing.canonicalSubmittedAt = submittedAt;
      }
      if (answer.is_correct && !existing.correctAnswerId) {
        existing.hasCorrectAnswer = true;
        existing.correctAnswerId = answer.id;
      }
    }

    const group = grouped.get(groupKey)!;

    if (answer.is_correct && !answer.player_id) {
      group.correctAnswerId = answer.id;
      group.hasCorrectAnswer = true;
    }

    if (answer.player_id) {
      group.playerIds.add(answer.player_id);
    }
  }

  return Array.from(grouped.values())
    .sort((a, b) => {
      const aSeed = hashString(`${seedRoundId}:${a.groupKey}`);
      const bSeed = hashString(`${seedRoundId}:${b.groupKey}`);
      if (aSeed !== bSeed) return aSeed - bSeed;

      if (a.canonicalSubmittedAt !== b.canonicalSubmittedAt) {
        return a.canonicalSubmittedAt - b.canonicalSubmittedAt;
      }

      if (a.canonicalAnswerId !== b.canonicalAnswerId) {
        return a.canonicalAnswerId.localeCompare(b.canonicalAnswerId);
      }

      return a.groupKey.localeCompare(b.groupKey);
    })
    .map((group) => ({
      id: group.correctAnswerId || group.canonicalAnswerId,
      answer_text: group.answer_text,
      answerIds: group.answerIds,
      playerIds: Array.from(group.playerIds),
      voteTargetId: group.correctAnswerId || group.canonicalAnswerId || group.answerIds[0],
      hasCorrectAnswer: group.hasCorrectAnswer,
    }));
}

import { GAME_CONFIG } from '../constants/game';
import { ErrorType, GameError } from '../types';

/**
 * Validates game code format
 */
export function validateGameCode(code: string): boolean {
  if (!code || code.length !== GAME_CONFIG.CODE_LENGTH) {
    return false;
  }

  const validChars = new Set(GAME_CONFIG.CODE_CHARACTERS);
  return code.split('').every((char) => validChars.has(char.toUpperCase()));
}

/**
 * Validates player name
 */
export function validatePlayerName(name: string): void {
  if (!name || name.trim().length < GAME_CONFIG.MIN_PLAYER_NAME_LENGTH) {
    throw new GameError(ErrorType.INVALID_CODE, 'Name too short');
  }

  if (name.length > GAME_CONFIG.MAX_PLAYER_NAME_LENGTH) {
    throw new GameError(ErrorType.INVALID_CODE, 'Name too long');
  }
}

/**
 * Validates answer text
 */
export function validateAnswer(answer: string): void {
  if (!answer || answer.trim().length < GAME_CONFIG.MIN_ANSWER_LENGTH) {
    throw new GameError(ErrorType.ANSWER_TIMEOUT, 'Answer too short');
  }

  if (answer.length > GAME_CONFIG.MAX_ANSWER_LENGTH) {
    throw new GameError(ErrorType.ANSWER_TIMEOUT, 'Answer too long');
  }
}

/**
 * Validates game settings
 */
export function validateGameSettings(settings: {
  roundCount: number;
  maxPlayers: number;
}): void {
  if (
    !GAME_CONFIG.ROUND_OPTIONS.includes(settings.roundCount) ||
    settings.roundCount < GAME_CONFIG.MIN_ROUNDS ||
    settings.roundCount > GAME_CONFIG.MAX_ROUNDS
  ) {
    throw new GameError(ErrorType.INVALID_CODE, 'Invalid round count');
  }

  if (
    settings.maxPlayers < GAME_CONFIG.MIN_PLAYERS ||
    settings.maxPlayers > GAME_CONFIG.MAX_PLAYERS
  ) {
    throw new GameError(ErrorType.INVALID_CODE, 'Invalid max players');
  }
}

/**
 * Sanitizes text input
 */
export function sanitizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

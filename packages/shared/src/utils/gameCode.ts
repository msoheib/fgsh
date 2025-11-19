import { GAME_CONFIG } from '../constants/game';

/**
 * Generates a unique 6-character game code
 */
export function generateGameCode(): string {
  const chars = GAME_CONFIG.CODE_CHARACTERS;
  let code = '';

  for (let i = 0; i < GAME_CONFIG.CODE_LENGTH; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    code += chars[randomIndex];
  }

  return code;
}

/**
 * Formats game code for display (adds spaces for readability)
 * Example: "ABC123" -> "ABC 123"
 */
export function formatGameCode(code: string): string {
  if (code.length !== GAME_CONFIG.CODE_LENGTH) {
    return code;
  }

  const half = Math.floor(GAME_CONFIG.CODE_LENGTH / 2);
  return `${code.slice(0, half)} ${code.slice(half)}`;
}

/**
 * Removes formatting from game code
 */
export function normalizeGameCode(code: string): string {
  return code.replace(/\s+/g, '').toUpperCase();
}

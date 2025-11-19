/**
 * Session Storage Utility
 * Persists game session data to localStorage for reconnection after refresh
 */

export interface GameSession {
  gameId: string;
  gameCode?: string;
  playerId: string | null; // Null for display mode
  playerName?: string;
  isHost: boolean;
  isPhaseCaptain?: boolean;
  isDisplayMode?: boolean; // True for TV display-only mode
  joinedAt?: number; // Timestamp for session expiry
}

const SESSION_KEY = 'fibbage_game_session';
const SESSION_EXPIRY_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Save game session to localStorage
 */
export function saveGameSession(session: GameSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    console.log('💾 Game session saved to localStorage', session);
  } catch (error) {
    console.error('Failed to save game session:', error);
  }
}

/**
 * Get game session from localStorage
 * Returns null if no session or session expired
 */
export function getGameSession(): GameSession | null {
  try {
    const data = localStorage.getItem(SESSION_KEY);
    if (!data) return null;

    const session: GameSession = JSON.parse(data);

    // Check if session is expired (4 hours)
    const age = Date.now() - session.joinedAt;
    if (age > SESSION_EXPIRY_MS) {
      console.log('⏰ Session expired, clearing...');
      clearGameSession();
      return null;
    }

    console.log('📂 Game session loaded from localStorage', session);
    return session;
  } catch (error) {
    console.error('Failed to load game session:', error);
    return null;
  }
}

/**
 * Clear game session from localStorage
 */
export function clearGameSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
    console.log('🗑️ Game session cleared from localStorage');
  } catch (error) {
    console.error('Failed to clear game session:', error);
  }
}

/**
 * Update specific fields in the session
 */
export function updateGameSession(updates: Partial<GameSession>): void {
  const session = getGameSession();
  if (session) {
    saveGameSession({ ...session, ...updates });
  }
}

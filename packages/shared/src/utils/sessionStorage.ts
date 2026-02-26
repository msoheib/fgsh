/**
 * Session Storage Utility
 * Persists game session data to localStorage for reconnection after refresh
 */

export interface GameSession {
  gameId: string;
  gameCode?: string;
  playerId: string | null; // Null for display mode
  playerName?: string;
  isPhaseCaptain?: boolean;
  isDisplayMode?: boolean; // True for TV display-only mode
  joinedAt?: number; // Timestamp for session expiry
}

const SESSION_KEY = 'fibbage_game_session';
const SESSION_EXPIRY_MS = 4 * 60 * 60 * 1000; // 4 hours

type SessionStorageLike = {
  setItem: (key: string, value: string) => void;
  getItem: (key: string) => string | null;
  removeItem: (key: string) => void;
};

function getSessionStorageSafe(): SessionStorageLike | null {
  const g = globalThis as { sessionStorage?: SessionStorageLike };
  return g.sessionStorage || null;
}

/**
 * Save game session to localStorage
 */
export function saveGameSession(session: GameSession): void {
  try {
    const storage = getSessionStorageSafe();
    if (!storage) return;
    storage.setItem(SESSION_KEY, JSON.stringify(session));
    console.log('💾 Game session saved to sessionStorage', session);
  } catch (error) {
    console.error('Failed to save game session:', error);
  }
}

/**
 * Get game session from sessionStorage
 * Returns null if no session or session expired
 */
export function getGameSession(): GameSession | null {
  try {
    const storage = getSessionStorageSafe();
    if (!storage) return null;
    const data = storage.getItem(SESSION_KEY);
    if (!data) return null;

    const session: GameSession = JSON.parse(data);

    // Check if session is expired (4 hours)
    if (session.joinedAt) {
      const age = Date.now() - session.joinedAt;
      if (age > SESSION_EXPIRY_MS) {
        console.log('⏰ Session expired, clearing...');
        clearGameSession();
        return null;
      }
    }

    console.log('📂 Game session loaded from sessionStorage', session);
    return session;
  } catch (error) {
    console.error('Failed to load game session:', error);
    return null;
  }
}

/**
 * Clear game session from sessionStorage and cleanup realtime subscriptions
 */
export function clearGameSession(): void {
  try {
    const storage = getSessionStorageSafe();
    if (!storage) return;
    storage.removeItem(SESSION_KEY);
    console.log('🗑️ Game session cleared from sessionStorage');
    
    // Also cleanup all realtime subscriptions to prevent ghost connections
    // Import dynamically to avoid circular dependency
    import('../services/RealtimeService').then(({ RealtimeService }) => {
      RealtimeService.unsubscribeAll();
      console.log('🔌 All realtime subscriptions cleaned up');
    }).catch(err => {
      console.warn('Could not cleanup realtime:', err);
    });
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

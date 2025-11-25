/**
 * Session Storage Utility - React Native Implementation
 * Persists game session data to AsyncStorage for reconnection after app restart
 * This is a platform-specific implementation that mirrors the web version API
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

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
 * Save game session to AsyncStorage
 */
export async function saveGameSession(session: GameSession): Promise<void> {
  try {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
    console.log('💾 Game session saved to AsyncStorage', session);
  } catch (error) {
    console.error('Failed to save game session:', error);
  }
}

/**
 * Get game session from AsyncStorage
 * Returns null if no session or session expired
 */
export async function getGameSession(): Promise<GameSession | null> {
  try {
    const data = await AsyncStorage.getItem(SESSION_KEY);
    if (!data) return null;

    const session: GameSession = JSON.parse(data);

    // Check if session is expired (4 hours)
    const age = Date.now() - (session.joinedAt || 0);
    if (age > SESSION_EXPIRY_MS) {
      console.log('⏰ Session expired, clearing...');
      await clearGameSession();
      return null;
    }

    console.log('📂 Game session loaded from AsyncStorage', session);
    return session;
  } catch (error) {
    console.error('Failed to load game session:', error);
    return null;
  }
}

/**
 * Clear game session from AsyncStorage
 */
export async function clearGameSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SESSION_KEY);
    console.log('🗑️ Game session cleared from AsyncStorage');
  } catch (error) {
    console.error('Failed to clear game session:', error);
  }
}

/**
 * Update specific fields in the session
 */
export async function updateGameSession(updates: Partial<GameSession>): Promise<void> {
  const session = await getGameSession();
  if (session) {
    await saveGameSession({ ...session, ...updates });
  }
}

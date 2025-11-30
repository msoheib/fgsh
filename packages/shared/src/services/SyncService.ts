import { getSupabase } from './supabase';
import { Game, GameRound, Player, PlayerAnswer } from '../types';
import { RoundService } from './RoundService';

export interface SyncState {
  game: Game;
  players: Player[];
  currentRound: GameRound | null;
  answers: PlayerAnswer[];
  playerAnswer: PlayerAnswer | null;
  playerVote: { answer_id: string } | null;
}

export interface SyncResult {
  success: boolean;
  state?: SyncState;
  error?: string;
  changed: boolean;
}

/**
 * SyncService provides periodic state synchronization to catch missed realtime events.
 * This is a safety net - realtime should handle 99% of updates, but sync catches the rest.
 */
export class SyncService {
  private static syncIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();
  private static lastSyncTimes: Map<string, number> = new Map();
  private static syncCallbacks: Map<string, (result: SyncResult) => void> = new Map();
  
  // Sync every 5 seconds during active gameplay
  private static readonly SYNC_INTERVAL = 5000;
  // If no sync for 15 seconds, consider it stale
  private static readonly STALE_THRESHOLD = 15000;

  /**
   * Start periodic synchronization for a game
   */
  static startSync(
    gameId: string,
    playerId: string | null,
    onSync: (result: SyncResult) => void
  ): () => void {
    // Guard against invalid gameId
    if (!gameId || gameId === 'undefined') {
      console.warn('🔄 SyncService: Skipping sync - invalid gameId:', gameId);
      return () => {}; // Return no-op cleanup
    }

    // Clear any existing sync
    this.stopSync(gameId);

    this.syncCallbacks.set(gameId, onSync);
    this.lastSyncTimes.set(gameId, Date.now());

    // Initial sync
    this.performSync(gameId, playerId);

    // Set up periodic sync
    const interval = setInterval(() => {
      this.performSync(gameId, playerId);
    }, this.SYNC_INTERVAL);

    this.syncIntervals.set(gameId, interval);

    console.log('🔄 SyncService: Started periodic sync for game', gameId);

    return () => this.stopSync(gameId);
  }

  /**
   * Stop periodic synchronization for a game
   */
  static stopSync(gameId: string): void {
    if (!gameId || gameId === 'undefined') {
      return; // Don't try to stop invalid syncs
    }
    const interval = this.syncIntervals.get(gameId);
    if (interval) {
      clearInterval(interval);
      this.syncIntervals.delete(gameId);
      console.log('🔄 SyncService: Stopped periodic sync for game', gameId);
    }
    this.syncCallbacks.delete(gameId);
    this.lastSyncTimes.delete(gameId);
  }

  /**
   * Stop all syncs
   */
  static stopAll(): void {
    this.syncIntervals.forEach((interval, gameId) => {
      clearInterval(interval);
      console.log('🔄 SyncService: Stopped sync for game', gameId);
    });
    this.syncIntervals.clear();
    this.syncCallbacks.clear();
    this.lastSyncTimes.clear();
  }

  /**
   * Perform a single sync operation
   */
  static async performSync(gameId: string, playerId: string | null): Promise<SyncResult> {
    // Guard against invalid gameId
    if (!gameId || gameId === 'undefined') {
      return { success: false, error: 'Invalid gameId', changed: false };
    }

    const callback = this.syncCallbacks.get(gameId);
    
    try {
      const state = await this.fetchGameState(gameId, playerId);
      this.lastSyncTimes.set(gameId, Date.now());
      
      const result: SyncResult = {
        success: true,
        state,
        changed: true, // Let the callback determine if anything actually changed
      };

      callback?.(result);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ SyncService: Sync failed for game', gameId, errorMessage);
      
      const result: SyncResult = {
        success: false,
        error: errorMessage,
        changed: false,
      };

      callback?.(result);
      return result;
    }
  }

  /**
   * Fetch complete game state from server
   */
  static async fetchGameState(gameId: string, playerId: string | null): Promise<SyncState> {
    const supabase = getSupabase();

    // Fetch game, players, and current round in parallel
    const [gameResult, playersResult, roundResult] = await Promise.all([
      supabase.from('games').select('*').eq('id', gameId).single(),
      supabase.from('players').select('*').eq('game_id', gameId).eq('connection_status', 'connected'),
      RoundService.getCurrentRound(gameId),
    ]);

    if (gameResult.error || !gameResult.data) {
      throw new Error(`Failed to fetch game: ${gameResult.error?.message}`);
    }

    const game = gameResult.data as Game;
    const players = (playersResult.data || []) as Player[];
    const currentRound = roundResult;

    // If there's a current round, fetch answers and player's submission
    let answers: PlayerAnswer[] = [];
    let playerAnswer: PlayerAnswer | null = null;
    let playerVote: { answer_id: string } | null = null;

    if (currentRound) {
      // Fetch answers for voting/completed phases
      if (currentRound.status === 'voting' || currentRound.status === 'completed') {
        answers = await RoundService.getRoundAnswers(currentRound.id);
      }

      // Fetch player's answer and vote
      if (playerId) {
        const [answerResult, voteResult] = await Promise.all([
          supabase
            .from('player_answers')
            .select('*')
            .eq('round_id', currentRound.id)
            .eq('player_id', playerId)
            .maybeSingle(),
          supabase
            .from('votes')
            .select('answer_id')
            .eq('round_id', currentRound.id)
            .eq('voter_id', playerId)
            .maybeSingle(),
        ]);

        playerAnswer = answerResult.data;
        playerVote = voteResult.data;
      }
    }

    return {
      game,
      players,
      currentRound,
      answers,
      playerAnswer,
      playerVote,
    };
  }

  /**
   * Force immediate sync (useful after suspected connection issues)
   */
  static async forceSyncNow(gameId: string, playerId: string | null): Promise<SyncResult> {
    // Guard against invalid gameId
    if (!gameId || gameId === 'undefined') {
      console.warn('🔄 SyncService: Skipping force sync - invalid gameId:', gameId);
      return { success: false, error: 'Invalid gameId', changed: false };
    }
    console.log('🔄 SyncService: Force sync triggered for game', gameId);
    return this.performSync(gameId, playerId);
  }

  /**
   * Check if sync is stale (no successful sync recently)
   */
  static isSyncStale(gameId: string): boolean {
    const lastSync = this.lastSyncTimes.get(gameId);
    if (!lastSync) return true;
    return Date.now() - lastSync > this.STALE_THRESHOLD;
  }

  /**
   * Get time since last sync in ms
   */
  static getTimeSinceLastSync(gameId: string): number {
    const lastSync = this.lastSyncTimes.get(gameId);
    if (!lastSync) return Infinity;
    return Date.now() - lastSync;
  }
}


/**
 * Timer Service - Server-authoritative timer synchronization
 */

import { getSupabase } from './supabase';
import { RealtimeService } from './RealtimeService';

export interface TimerState {
  roundId: string;
  timeRemaining: number;
  timerActive: boolean;
  serverTime: string;
  lastSyncTime: number;
  clientServerOffset: number; // Offset between client and server clocks
}

export class TimerService {
  private static timerStates: Map<string, TimerState> = new Map();
  private static syncIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();
  private static clientServerOffset: number = 0; // Global offset in milliseconds

  /**
   * Initialize timer service and calculate client-server clock offset
   */
  static async initialize(): Promise<void> {
    try {
      // Calculate clock offset by comparing server time with client time
      const supabase = getSupabase();
      const startTime = Date.now();

      const { data, error } = await supabase.rpc('get_server_time');

      if (error || !data || data.length === 0) {
        console.error('Failed to get server time:', error);
        return;
      }

      const endTime = Date.now();
      const roundTripTime = endTime - startTime;
      const serverTimeMs = data[0].timestamp_ms;

      // Estimate server time at the moment we checked client time
      // Account for network round trip by using midpoint
      const estimatedServerTime = serverTimeMs + (roundTripTime / 2);
      this.clientServerOffset = estimatedServerTime - endTime;

      console.log('⏰ Timer service initialized:', {
        clientServerOffset: this.clientServerOffset,
        roundTripTime,
        offsetSeconds: this.clientServerOffset / 1000
      });
    } catch (error) {
      console.error('Failed to initialize timer service:', error);
      this.clientServerOffset = 0;
    }
  }

  /**
   * Get server-adjusted current time
   */
  static getServerAdjustedTime(): number {
    return Date.now() + this.clientServerOffset;
  }

  /**
   * Sync timer with server for a specific round
   */
  static async syncRoundTimer(
    gameId: string,
    roundId: string,
    onUpdate?: (timeRemaining: number, timerActive: boolean) => void
  ): Promise<TimerState | null> {
    // Guard against invalid ids
    if (!gameId || !roundId || gameId === 'undefined' || roundId === 'undefined') {
      return null;
    }

    try {
      const supabase = getSupabase();

      // Get server-authoritative time remaining
      const { data, error } = await supabase.rpc('get_round_time_remaining', {
        p_round_id: roundId
      });

      if (error || !data || data.length === 0) {
        console.error('Failed to sync round timer:', error);
        return null;
      }

      const result = data[0];
      const timerState: TimerState = {
        roundId,
        timeRemaining: result.time_remaining || 0,
        timerActive: result.timer_active || false,
        serverTime: result.server_time,
        lastSyncTime: Date.now(),
        clientServerOffset: this.clientServerOffset
      };

      // Store timer state
      this.timerStates.set(roundId, timerState);

      // Broadcast timer sync for other clients
      if (RealtimeService && gameId) {
        await RealtimeService.broadcastTimerSync(gameId, {
          current_round: roundId,
          timer_remaining: timerState.timeRemaining,
          timer_active: timerState.timerActive,
          server_time: timerState.serverTime
        });
      }

      // Call update callback if provided
      if (onUpdate) {
        onUpdate(timerState.timeRemaining, timerState.timerActive);
      }

      console.log('⏱️ Timer synced:', {
        roundId,
        timeRemaining: timerState.timeRemaining,
        timerActive: timerState.timerActive
      });

      return timerState;
    } catch (error) {
      console.error('Error syncing timer:', error);
      return null;
    }
  }

  /**
   * Start periodic timer sync for a game
   */
  static startPeriodicSync(
    gameId: string,
    roundId: string,
    onUpdate: (timeRemaining: number, timerActive: boolean) => void,
    intervalMs: number = 5000 // Sync every 5 seconds
  ): void {
    // Guard against invalid ids
    if (!gameId || !roundId || gameId === 'undefined' || roundId === 'undefined') {
      console.warn('⏱️ TimerService: Skipping sync - invalid gameId or roundId:', { gameId, roundId });
      return;
    }

    // Stop existing sync if any
    this.stopPeriodicSync(roundId);

    // Initial sync
    this.syncRoundTimer(gameId, roundId, onUpdate);

    // Set up periodic sync
    const interval = setInterval(() => {
      this.syncRoundTimer(gameId, roundId, onUpdate);
    }, intervalMs);

    this.syncIntervals.set(roundId, interval);
    console.log('🔄 Started periodic timer sync for round:', roundId);
  }

  /**
   * Stop periodic timer sync
   */
  static stopPeriodicSync(roundId: string): void {
    const interval = this.syncIntervals.get(roundId);
    if (interval) {
      clearInterval(interval);
      this.syncIntervals.delete(roundId);
      console.log('⏹️ Stopped periodic timer sync for round:', roundId);
    }
  }

  /**
   * Stop all timer syncs
   */
  static stopAllSyncs(): void {
    this.syncIntervals.forEach((interval) => {
      clearInterval(interval);
    });
    this.syncIntervals.clear();
    this.timerStates.clear();
    console.log('⏹️ Stopped all timer syncs');
  }

  /**
   * Calculate time remaining based on last sync (for smooth countdown)
   */
  static getInterpolatedTimeRemaining(roundId: string): number {
    const timerState = this.timerStates.get(roundId);
    if (!timerState || !timerState.timerActive) {
      return 0;
    }

    // Calculate how much time has passed since last sync
    const timeSinceSync = (Date.now() - timerState.lastSyncTime) / 1000;
    const interpolatedTime = Math.max(0, timerState.timeRemaining - timeSinceSync);

    return Math.floor(interpolatedTime);
  }

  /**
   * Start a round timer (server-side)
   */
  static async startRoundTimer(roundId: string): Promise<boolean> {
    try {
      const supabase = getSupabase();

      const { data, error } = await supabase.rpc('start_round_timer', {
        p_round_id: roundId
      });

      if (error) {
        console.error('Failed to start round timer:', error);
        return false;
      }

      if (!data || data.length === 0 || !data[0].success) {
        console.log('Timer start result:', data?.[0]?.message || 'Unknown error');
        return false;
      }

      console.log('✅ Round timer started:', {
        roundId,
        timerStartsAt: data[0].timer_starts_at
      });

      return true;
    } catch (error) {
      console.error('Error starting round timer:', error);
      return false;
    }
  }

  /**
   * Get current client-server clock offset
   */
  static getClockOffset(): number {
    return this.clientServerOffset;
  }

  /**
   * Re-calibrate clock offset
   */
  static async recalibrate(): Promise<void> {
    await this.initialize();
  }
}
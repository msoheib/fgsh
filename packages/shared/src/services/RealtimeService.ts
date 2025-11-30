import { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase } from './supabase';
import {
  Player,
  Game,
  GameRound,
  Question,
  PlayerAnswer,
  Vote,
} from '../types';

// Presence state for a player
export interface PresenceState {
  user_id: string;
  player_id: string;
  nickname: string;
  is_host: boolean;
  online_at: string;
  last_seen?: number;
}

export type GameEventCallbacks = {
  // Player events
  onPlayerJoined?: (player: Player) => void;
  onPlayerLeft?: (playerId: string) => void;
  onPlayerUpdated?: (player: Player) => void;

  // Game events
  onGameStarted?: (game: Game) => void;
  onGameEnded?: (game: Game) => void;
  onGameUpdated?: (game: Game) => void;

  // Round events
  onRoundStarted?: (round: GameRound, question: Question) => void;
  onRoundStatusChanged?: (roundId: string, status: string) => void;
  onRoundEnded?: (roundId: string) => void;

  // Answer events
  onAnswerSubmitted?: (playerId: string, roundId: string) => void;
  onAllAnswersSubmitted?: () => void;

  // Vote events
  onVoteSubmitted?: (voterId: string, roundId: string) => void;
  onVotingStarted?: (answers: PlayerAnswer[]) => void;
  onAllVotesSubmitted?: () => void;

  // Score events
  onScoresUpdated?: (scores: { player_id: string; new_score: number }[]) => void;

  // Connection events
  onConnected?: () => void;
  onDisconnected?: () => void;
  onReconnected?: () => void;
  onError?: (error: Error) => void;

  // Presence events (new)
  onPresenceSync?: (presenceState: PresenceState[]) => void;
  onPresenceJoin?: (presence: PresenceState) => void;
  onPresenceLeave?: (presence: PresenceState) => void;
};

export class RealtimeService {
  private static channels: Map<string, RealtimeChannel> = new Map();
  private static broadcastChannels: Map<string, RealtimeChannel> = new Map();
  private static presenceState: Map<string, PresenceState[]> = new Map();
  private static heartbeatTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private static retryTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private static retryAttempts: Map<string, number> = new Map();
  private static storedCallbacks: Map<string, GameEventCallbacks> = new Map();
  private static watchdogTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private static lastEventTimes: Map<string, number> = new Map();
  private static connectionHealthy: Map<string, boolean> = new Map();

  private static readonly MAX_RETRY_ATTEMPTS = 10;
  private static readonly BASE_RETRY_DELAY = 1000; // 1 second
  private static readonly MAX_RETRY_DELAY = 15000; // Cap backoff at 15 seconds
  private static readonly WATCHDOG_INTERVAL = 5000; // Check every 5 seconds (reduced from 10)
  private static readonly SILENT_DROP_THRESHOLD = 20000; // If no events for 20s, consider connection dropped
  private static readonly HEARTBEAT_INTERVAL = 3000; // Send heartbeat every 3 seconds

  /**
   * Subscribe to game events with automatic retry and state recovery
   */
  static subscribeToGame(
    gameId: string,
    callbacks: GameEventCallbacks,
    currentPlayer?: { id: string; nickname: string; is_host: boolean }
  ): () => void {
    const supabase = getSupabase();
    const channelName = `game:${gameId}`;
    const broadcastChannelName = `game-broadcast:${gameId}`;

    // Remove existing channel if any
    this.unsubscribe(gameId);

    // Store callbacks for manual retry
    this.storedCallbacks.set(gameId, callbacks);

    // Create main channel for postgres changes
    const channel = supabase.channel(channelName);

    // Create broadcast channel for instant messaging and presence
    const broadcastChannel = supabase.channel(broadcastChannelName, {
      config: {
        presence: {
          key: currentPlayer?.id || 'anonymous',
        },
      },
    });

    // Set up Presence tracking if we have player info
    if (currentPlayer) {
      // Track presence state
      broadcastChannel
        .on('presence', { event: 'sync' }, () => {
          this.recordEvent(gameId);
          const state = broadcastChannel.presenceState();
          const presences: PresenceState[] = [];

          Object.values(state).forEach((presence: any[]) => {
            presence.forEach((p) => {
              presences.push(p as PresenceState);
            });
          });

          this.presenceState.set(gameId, presences);
          callbacks.onPresenceSync?.(presences);
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
          this.recordEvent(gameId);
          console.log('ðŸ‘¤ Player joined presence:', key);
          if (newPresences && newPresences.length > 0) {
            callbacks.onPresenceJoin?.(newPresences[0] as unknown as PresenceState);
          }
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
          this.recordEvent(gameId);
          console.log('ðŸ‘¤ Player left presence:', key);
          if (leftPresences && leftPresences.length > 0) {
            callbacks.onPresenceLeave?.(leftPresences[0] as unknown as PresenceState);
          }
        });
    }

    // Set up broadcast listeners for instant state updates
    broadcastChannel
      .on('broadcast', { event: 'timer_sync' }, (payload) => {
        this.recordEvent(gameId);
        // Handle timer synchronization
        if (callbacks.onGameUpdated && payload.payload) {
          callbacks.onGameUpdated(payload.payload as Game);
        }
      })
      .on('broadcast', { event: 'round_transition' }, (payload) => {
        this.recordEvent(gameId);
        // Handle instant round transitions
        if (payload.payload) {
          const { roundId, status } = payload.payload;
          callbacks.onRoundStatusChanged?.(roundId, status);
        }
      })
      .on('broadcast', { event: 'heartbeat' }, () => {
        // Just record this as activity to keep connection alive
        this.recordEvent(gameId);
      });

    // Listen to player changes (postgres_changes)
    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'players',
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          this.recordEvent(gameId);
          callbacks.onPlayerJoined?.(payload.new as Player);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'players',
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          this.recordEvent(gameId);
          callbacks.onPlayerUpdated?.(payload.new as Player);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'players',
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          this.recordEvent(gameId);
          callbacks.onPlayerLeft?.(payload.old.id);
        }
      );

    // Listen to game changes
    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'games',
        filter: `id=eq.${gameId}`,
      },
      (payload) => {
        this.recordEvent(gameId);
        const game = payload.new as Game;
        console.log('ðŸ“¡ Realtime: Game UPDATE received', { status: game.status, id: game.id });
        callbacks.onGameUpdated?.(game);

        if (game.status === 'playing') {
          console.log('ðŸŽ® Realtime: Triggering onGameStarted callback');
          callbacks.onGameStarted?.(game);
        } else if (game.status === 'finished') {
          callbacks.onGameEnded?.(game);
        }
      }
    );

    // Listen to round changes
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'game_rounds',
        filter: `game_id=eq.${gameId}`,
      },
      async (payload) => {
        this.recordEvent(gameId);
        const round = payload.new as GameRound;

        // Fetch question
        const { data: question } = await supabase
          .from('questions')
          .select('*')
          .eq('id', round.question_id)
          .single();

        if (question) {
          callbacks.onRoundStarted?.(round, question);
        }
      }
    );

    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'game_rounds',
        filter: `game_id=eq.${gameId}`,
      },
      (payload) => {
        this.recordEvent(gameId);
        const round = payload.new as GameRound;
        console.log('ðŸ“¢ Realtime: game_rounds UPDATE received', {
          roundId: round.id,
          status: round.status,
          roundNumber: round.round_number
        });
        callbacks.onRoundStatusChanged?.(round.id, round.status);

        if (round.status === 'completed') {
          callbacks.onRoundEnded?.(round.id);
        }
      }
    );

    // Listen to answer submissions for this game's rounds
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'player_answers',
      },
      (payload) => {
        this.recordEvent(gameId);
        const answer = payload.new as PlayerAnswer;
        console.log('ðŸ“ Realtime: Answer INSERT received', {
          playerId: answer.player_id,
          roundId: answer.round_id,
          isCorrect: answer.is_correct
        });
        // Filter out correct answer (system-inserted during phase transition)
        // The correct answer is added server-side when transitioning to voting phase
        // and should not trigger player submission tracking
        if (!answer.is_correct && answer.player_id) {
          callbacks.onAnswerSubmitted?.(answer.player_id, answer.round_id);
        }
      }
    );

    // Listen to votes
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'votes',
      },
      (payload) => {
        this.recordEvent(gameId);
        const vote = payload.new as Vote;
        console.log('ðŸ—³ï¸ Realtime: Vote INSERT received', {
          voterId: vote.voter_id,
          roundId: vote.round_id,
          answerId: vote.answer_id
        });
        // Pass round_id so callback can filter
        callbacks.onVoteSubmitted?.(vote.voter_id, vote.round_id);
      }
    );

    // Subscribe to both channels with retry logic
    let channelsSubscribed = 0;
    const totalChannels = 2;

    const handleSubscriptionStatus = (status: string, channelType: string) => {
      console.log(`ðŸ“¡ Realtime ${channelType} channel status:`, status);

      if (status === 'SUBSCRIBED') {
        channelsSubscribed++;
        this.recordEvent(gameId);

        // Both channels need to be subscribed
        if (channelsSubscribed === totalChannels) {
          // Check if this was a reconnection
          const wasReconnecting = (this.retryAttempts.get(gameId) || 0) > 0;

          // Reset retry attempts on successful connection
          this.retryAttempts.set(gameId, 0);

          // Track presence if we have player info
          if (currentPlayer && channelType === 'broadcast') {
            const presenceState: PresenceState = {
              user_id: currentPlayer.id,
              player_id: currentPlayer.id,
              nickname: currentPlayer.nickname,
              is_host: currentPlayer.is_host,
              online_at: new Date().toISOString(),
            };

            broadcastChannel.track(presenceState).then(() => {
              console.log('âœ… Presence tracked for player:', currentPlayer.nickname);
            }).catch((error) => {
              console.error('âŒ Failed to track presence:', error);
            });
          }

          // Start heartbeat timer
          this.startHeartbeat(gameId, broadcastChannel);

          if (wasReconnecting) {
            console.log('ðŸ”„ Reconnected - refetching game state');
            callbacks.onReconnected?.();
          }

          callbacks.onConnected?.();
          console.log('âœ… All realtime connections established');
        }
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        this.handleConnectionFailure(gameId, callbacks, currentPlayer);
      } else if (status === 'TIMED_OUT') {
        console.error(`âŒ ${channelType} connection timed out`);
        callbacks.onError?.(new Error(`${channelType} connection timed out`));
      }
    };

    // Subscribe main channel
    channel.subscribe((status) => handleSubscriptionStatus(status, 'postgres'));

    // Subscribe broadcast channel
    broadcastChannel.subscribe((status) => handleSubscriptionStatus(status, 'broadcast'));

    // Store channel references
    this.channels.set(gameId, channel);
    this.broadcastChannels.set(gameId, broadcastChannel);

    // Start watchdog to detect silent connection drops
    // TEMPORARILY DISABLED: Watchdog was causing aggressive reconnect loops
    // this.startWatchdog(gameId, callbacks, currentPlayer);

    // Return unsubscribe function
    return () => this.unsubscribe(gameId);
  }

  /**
   * Handle connection failure with retry logic
   */
  private static handleConnectionFailure(
    gameId: string,
    callbacks: GameEventCallbacks,
    currentPlayer?: { id: string; nickname: string; is_host: boolean }
  ): void {
    const retryCount = this.retryAttempts.get(gameId) || 0;
    const delay = Math.min(
      this.BASE_RETRY_DELAY * Math.pow(2, retryCount),
      this.MAX_RETRY_DELAY
    );

    if (retryCount < this.MAX_RETRY_ATTEMPTS) {
      console.log(`âš ï¸ Connection lost, retrying in ${delay}ms (attempt ${retryCount + 1}/${this.MAX_RETRY_ATTEMPTS})`);

      const timer = setTimeout(() => {
        console.log(`ðŸ”„ Attempting reconnection...`);
        this.retryAttempts.set(gameId, retryCount + 1);

        // STABILIZED: Disabled automatic resubscribe to prevent loops
        // this.unsubscribe(gameId);
        // this.subscribeToGame(gameId, callbacks, currentPlayer);
        console.log('Skipping automatic reconnect to prevent loops');
      }, delay);

      this.retryTimers.set(gameId, timer);
    } else {
      console.error(`âŒ Max retry attempts reached for game ${gameId}`);
      callbacks.onError?.(new Error('Failed to establish realtime connection after multiple attempts'));

      // Schedule a slow retry
      const timer = setTimeout(() => {
        console.log('ðŸ”„ Retrying realtime connection after cooldown...');
        this.retryAttempts.set(gameId, this.MAX_RETRY_ATTEMPTS);
        this.unsubscribe(gameId);
        this.subscribeToGame(gameId, callbacks, currentPlayer);
      }, this.MAX_RETRY_DELAY);

      this.retryTimers.set(gameId, timer);
    }

    callbacks.onDisconnected?.();
  }

  /**
   * Start heartbeat timer to keep connection alive
   */
  private static startHeartbeat(gameId: string, broadcastChannel: RealtimeChannel): void {
    // Clear existing heartbeat if any
    const existing = this.heartbeatTimers.get(gameId);
    if (existing) {
      clearInterval(existing);
    }

    const heartbeat = setInterval(() => {
      // Count heartbeat as activity so watchdog stays calm during idle periods
      this.recordEvent(gameId);

      // Send heartbeat broadcast
      broadcastChannel.send({
        type: 'broadcast',
        event: 'heartbeat',
        payload: { timestamp: Date.now() },
      }).catch((error) => {
        console.warn('Heartbeat failed:', error);
      });
    }, this.HEARTBEAT_INTERVAL);

    this.heartbeatTimers.set(gameId, heartbeat);
    console.log('ðŸ’“ Heartbeat started for game', gameId);
  }

  /**
   * Stop heartbeat timer
   */
  private static stopHeartbeat(gameId: string): void {
    const heartbeat = this.heartbeatTimers.get(gameId);
    if (heartbeat) {
      clearInterval(heartbeat);
      this.heartbeatTimers.delete(gameId);
      console.log('ðŸ’“ Heartbeat stopped for game', gameId);
    }
  }

  /**
   * Unsubscribe from game events and cleanup retry timers
   */
  static unsubscribe(gameId: string): void {
    // Clear any pending retry timers
    const timer = this.retryTimers.get(gameId);
    if (timer) {
      clearTimeout(timer);
      this.retryTimers.delete(gameId);
    }

    // Stop watchdog
    this.stopWatchdog(gameId);

    // Stop heartbeat
    this.stopHeartbeat(gameId);

    // Reset retry attempts
    this.retryAttempts.delete(gameId);

    // Remove channels
    const channel = this.channels.get(gameId);
    if (channel) {
      const supabase = getSupabase();
      supabase.removeChannel(channel);
      this.channels.delete(gameId);
    }

    const broadcastChannel = this.broadcastChannels.get(gameId);
    if (broadcastChannel) {
      // Untrack presence before removing channel
      broadcastChannel.untrack();
      const supabase = getSupabase();
      supabase.removeChannel(broadcastChannel);
      this.broadcastChannels.delete(gameId);
    }

    // Clear presence state
    this.presenceState.delete(gameId);
  }

  /**
   * Manually trigger a reconnection attempt for a game
   * Useful after max retries have been exhausted
   */
  static retryNow(
    gameId: string,
    currentPlayer?: { id: string; nickname: string; is_host: boolean }
  ): boolean {
    const callbacks = this.storedCallbacks.get(gameId);
    if (!callbacks) {
      console.warn(`âš ï¸ No stored callbacks for game ${gameId}, cannot retry`);
      return false;
    }

    console.log(`ðŸ”„ Manual retry triggered for game ${gameId}`);
    this.retryAttempts.set(gameId, 0); // Reset retry count
    this.unsubscribe(gameId);
    this.subscribeToGame(gameId, callbacks, currentPlayer);
    return true;
  }

  /**
   * Fully unsubscribe and clear stored callbacks
   */
  static unsubscribeFully(gameId: string): void {
    this.unsubscribe(gameId);
    this.storedCallbacks.delete(gameId);
  }

  /**
   * Broadcast custom event to game channel (uses broadcast channel for instant delivery)
   */
  static async broadcastEvent(
    gameId: string,
    event: string,
    payload: unknown
  ): Promise<void> {
    const broadcastChannel = this.broadcastChannels.get(gameId);
    if (broadcastChannel) {
      await broadcastChannel.send({
        type: 'broadcast',
        event,
        payload,
      });
    } else {
      console.warn(`âš ï¸ No broadcast channel for game ${gameId}`);
    }
  }

  /**
   * Broadcast timer sync event for instant timer updates
   */
  static async broadcastTimerSync(gameId: string, game: Partial<Game>): Promise<void> {
    await this.broadcastEvent(gameId, 'timer_sync', game);
  }

  /**
   * Broadcast round transition for instant state changes
   */
  static async broadcastRoundTransition(
    gameId: string,
    roundId: string,
    status: string
  ): Promise<void> {
    await this.broadcastEvent(gameId, 'round_transition', { roundId, status });
  }

  /**
   * Get current presence state for a game
   */
  static getPresenceState(gameId: string): PresenceState[] {
    return this.presenceState.get(gameId) || [];
  }

  /**
   * Check if a specific player is online based on presence
   */
  static isPlayerOnline(gameId: string, playerId: string): boolean {
    const presences = this.presenceState.get(gameId) || [];
    return presences.some(p => p.player_id === playerId);
  }

  /**
   * Check if subscribed to a game
   */
  static isSubscribed(gameId: string): boolean {
    return this.channels.has(gameId);
  }

  /**
   * Unsubscribe from all games and cleanup all retry timers
   */
  static unsubscribeAll(): void {
    // Clear all retry timers
    this.retryTimers.forEach((timer) => {
      clearTimeout(timer);
    });
    this.retryTimers.clear();
    this.retryAttempts.clear();
    this.storedCallbacks.clear();

    // Clear all heartbeat timers
    this.heartbeatTimers.forEach((timer) => {
      clearInterval(timer);
    });
    this.heartbeatTimers.clear();

    // Clear all watchdog timers
    this.watchdogTimers.forEach((timer) => {
      clearInterval(timer);
    });
    this.watchdogTimers.clear();
    this.lastEventTimes.clear();
    this.connectionHealthy.clear();

    // Remove all channels
    const supabase = getSupabase();

    // Untrack presence and remove broadcast channels
    this.broadcastChannels.forEach((channel) => {
      channel.untrack();
      supabase.removeChannel(channel);
    });
    this.broadcastChannels.clear();

    // Remove postgres channels
    this.channels.forEach((channel) => {
      supabase.removeChannel(channel);
    });
    this.channels.clear();

    // Clear presence state
    this.presenceState.clear();
  }

  /**
   * Start watchdog timer to detect silent connection drops
   * @deprecated Currently disabled - was causing aggressive reconnect loops
   */
  private static _startWatchdog(
    gameId: string,
    callbacks: GameEventCallbacks,
    currentPlayer?: { id: string; nickname: string; is_host: boolean }
  ): void {
    // Clear existing watchdog if any
    const existing = this.watchdogTimers.get(gameId);
    if (existing) {
      clearInterval(existing);
    }

    // Mark connection as healthy initially
    this.connectionHealthy.set(gameId, true);
    this.lastEventTimes.set(gameId, Date.now());

    const watchdog = setInterval(() => {
      const lastEvent = this.lastEventTimes.get(gameId) || 0;
      const timeSinceLastEvent = Date.now() - lastEvent;
      const wasHealthy = this.connectionHealthy.get(gameId) ?? true;

      if (timeSinceLastEvent > this.SILENT_DROP_THRESHOLD) {
        if (wasHealthy) {
          console.warn(`âš ï¸ Watchdog: No events for ${timeSinceLastEvent}ms on game ${gameId}, connection may be stale`);
          this.connectionHealthy.set(gameId, false);
          callbacks.onDisconnected?.();

          // Attempt to refresh the connection
          console.log('ðŸ”„ Watchdog: Triggering connection refresh...');
          this.retryNow(gameId, currentPlayer);
        }
      } else if (!wasHealthy && timeSinceLastEvent < this.SILENT_DROP_THRESHOLD) {
        // Connection recovered
        console.log('âœ… Watchdog: Connection recovered for game', gameId);
        this.connectionHealthy.set(gameId, true);
        callbacks.onReconnected?.();
      }
    }, this.WATCHDOG_INTERVAL);

    this.watchdogTimers.set(gameId, watchdog);
    console.log('ðŸ• Watchdog: Started for game', gameId);
  }

  /**
   * Stop watchdog timer for a game
   */
  private static stopWatchdog(gameId: string): void {
    const watchdog = this.watchdogTimers.get(gameId);
    if (watchdog) {
      clearInterval(watchdog);
      this.watchdogTimers.delete(gameId);
      console.log('ðŸ• Watchdog: Stopped for game', gameId);
    }
    this.lastEventTimes.delete(gameId);
    this.connectionHealthy.delete(gameId);
  }

  /**
   * Record that an event was received (keeps watchdog happy)
   */
  static recordEvent(gameId: string): void {
    this.lastEventTimes.set(gameId, Date.now());
    if (!this.connectionHealthy.get(gameId)) {
      this.connectionHealthy.set(gameId, true);
    }
  }

  /**
   * Check if connection is healthy
   */
  static isConnectionHealthy(gameId: string): boolean {
    return this.connectionHealthy.get(gameId) ?? false;
  }

  /**
   * Get time since last event
   */
  static getTimeSinceLastEvent(gameId: string): number {
    const lastEvent = this.lastEventTimes.get(gameId);
    if (!lastEvent) return Infinity;
    return Date.now() - lastEvent;
  }
}

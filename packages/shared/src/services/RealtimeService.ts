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
  onAllVotesSubmitted?: () => void;

  // Score events
  onScoresUpdated?: (scores: { player_id: string; new_score: number }[]) => void;

  // Connection events
  onConnected?: () => void;
  onDisconnected?: () => void;
  onReconnected?: () => void;
  onError?: (error: Error) => void;
};

export class RealtimeService {
  private static channels: Map<string, RealtimeChannel> = new Map();
  private static retryTimers: Map<string, NodeJS.Timeout> = new Map();
  private static retryAttempts: Map<string, number> = new Map();
  private static readonly MAX_RETRY_ATTEMPTS = 5;
  private static readonly BASE_RETRY_DELAY = 1000; // 1 second

  /**
   * Subscribe to game events with automatic retry and state recovery
   */
  static subscribeToGame(
    gameId: string,
    callbacks: GameEventCallbacks
  ): () => void {
    const supabase = getSupabase();
    const channelName = `game:${gameId}`;

    // Remove existing channel if any
    this.unsubscribe(gameId);

    const channel = supabase.channel(channelName);

    // Listen to player changes
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
        const game = payload.new as Game;
        console.log('📡 Realtime: Game UPDATE received', { status: game.status, id: game.id });
        callbacks.onGameUpdated?.(game);

        if (game.status === 'playing') {
          console.log('🎮 Realtime: Triggering onGameStarted callback');
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
        const round = payload.new as GameRound;
        console.log('📢 Realtime: game_rounds UPDATE received', {
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
        const answer = payload.new as PlayerAnswer;
        console.log('📝 Realtime: Answer INSERT received', {
          playerId: answer.player_id,
          roundId: answer.round_id,
          isCorrect: answer.is_correct
        });
        // Filter out correct answer (system-inserted during phase transition)
        // The correct answer is added server-side when transitioning to voting phase
        // and should not trigger player submission tracking
        if (!answer.is_correct) {
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
        const vote = payload.new as Vote;
        console.log('🗳️ Realtime: Vote INSERT received', {
          voterId: vote.voter_id,
          roundId: vote.round_id,
          answerId: vote.answer_id
        });
        // Pass round_id so callback can filter
        callbacks.onVoteSubmitted?.(vote.voter_id, vote.round_id);
      }
    );

    // Subscribe to channel with retry logic
    channel
      .subscribe((status) => {
        console.log('📡 Realtime channel status:', status);

        if (status === 'SUBSCRIBED') {
          // Check if this was a reconnection (before resetting retry count)
          const wasReconnecting = (this.retryAttempts.get(gameId) || 0) > 0;

          // Reset retry attempts on successful connection
          this.retryAttempts.set(gameId, 0);

          // Refetch game state after reconnection to catch any missed updates
          if (wasReconnecting) {
            console.log('🔄 Reconnected - refetching game state to catch missed updates');
            callbacks.onReconnected?.();
          }

          callbacks.onConnected?.();

          console.log('✅ Realtime connection established');
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          // Connection lost, attempt retry
          const retryCount = this.retryAttempts.get(gameId) || 0;

          if (retryCount < this.MAX_RETRY_ATTEMPTS) {
            const delay = this.BASE_RETRY_DELAY * Math.pow(2, retryCount); // Exponential backoff

            console.log(`⚠️ Realtime connection lost, retrying in ${delay}ms (attempt ${retryCount + 1}/${this.MAX_RETRY_ATTEMPTS})`);

            const timer = setTimeout(() => {
              console.log(`🔄 Attempting reconnection...`);
              this.retryAttempts.set(gameId, retryCount + 1);

              // Resubscribe with same callbacks
              this.unsubscribe(gameId);
              this.subscribeToGame(gameId, callbacks);
            }, delay);

            this.retryTimers.set(gameId, timer);
          } else {
            console.error(`❌ Max retry attempts reached for game ${gameId}`);
            callbacks.onError?.(new Error('Failed to establish realtime connection after multiple attempts'));
          }

          callbacks.onDisconnected?.();
        } else if (status === 'TIMED_OUT') {
          console.error('❌ Realtime connection timed out');
          callbacks.onError?.(new Error('Realtime connection timed out'));
        }
      });

    // Store channel reference
    this.channels.set(gameId, channel);

    // Return unsubscribe function
    return () => this.unsubscribe(gameId);
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

    // Reset retry attempts
    this.retryAttempts.delete(gameId);

    // Remove channel
    const channel = this.channels.get(gameId);
    if (channel) {
      const supabase = getSupabase();
      supabase.removeChannel(channel);
      this.channels.delete(gameId);
    }
  }

  /**
   * Broadcast custom event to game channel
   */
  static async broadcastEvent(
    gameId: string,
    event: string,
    payload: unknown
  ): Promise<void> {
    const channel = this.channels.get(gameId);
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event,
        payload,
      });
    }
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

    // Remove all channels
    const supabase = getSupabase();
    this.channels.forEach((channel) => {
      supabase.removeChannel(channel);
    });
    this.channels.clear();
  }
}

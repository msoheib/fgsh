import { getSupabase } from './supabase';
import {
  Game,
  Player,
  GameSettings,
  GameError,
  ErrorType,
} from '../types';
import { generateGameCode } from '../utils/gameCode';
import { validatePlayerName, sanitizeText } from '../utils/validation';
import { getRandomAvatarColor } from '../utils/avatars';
import { GAME_CONFIG } from '../constants/game';

export class GameService {
  private static claimCaptainRpcAvailable: boolean | null = null;

  private static getEnforcedSettings(): GameSettings {
    return {
      roundCount: GAME_CONFIG.DEFAULT_ROUNDS,
      maxPlayers: GAME_CONFIG.DEFAULT_MAX_PLAYERS,
    };
  }

  private static async claimPhaseCaptainIfNeeded(
    gameId: string,
    currentCaptainId: string | null,
    playerId: string
  ): Promise<string | null> {
    if (currentCaptainId) {
      return currentCaptainId;
    }

    if (this.claimCaptainRpcAvailable === false) {
      return currentCaptainId;
    }

    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('claim_phase_captain_if_unassigned', {
      p_game_id: gameId,
      p_player_id: playerId,
    });

    if (error) {
      const message = error.message || '';
      if (message.includes('Could not find the function public.claim_phase_captain_if_unassigned')) {
        this.claimCaptainRpcAvailable = false;
        console.warn('claim_phase_captain_if_unassigned RPC not found; skipping captain claim.');
        return currentCaptainId;
      }
      console.warn('claim_phase_captain_if_unassigned RPC failed:', error.message);
      return currentCaptainId;
    }

    this.claimCaptainRpcAvailable = true;
    const result = Array.isArray(data) ? data[0] : data;
    if (!result) {
      return currentCaptainId;
    }

    if (result.success === false) {
      return result.phase_captain_id ?? currentCaptainId;
    }

    return result.phase_captain_id ?? currentCaptainId;
  }

  static async claimPhaseCaptain(gameId: string, playerId: string): Promise<string | null> {
    return this.claimPhaseCaptainIfNeeded(gameId, null, playerId);
  }

  /**
   * Create a new game and add host as first player
   */
  static async createGame(
    hostName: string,
    _settings: GameSettings
  ): Promise<{ game: Game; player: Player }> {
    const supabase = getSupabase();
    const enforcedSettings = this.getEnforcedSettings();

    // Get authenticated user (required for hosts)
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new GameError(ErrorType.INVALID_INPUT, 'يجب تسجيل الدخول لإنشاء لعبة');
    }

    // Validate inputs
    validatePlayerName(hostName);

    const sanitizedName = sanitizeText(hostName);
    let code = generateGameCode();
    let attempts = 0;

    // Try to find unique code (max 10 attempts)
    while (attempts < 10) {
      const { data: existing } = await supabase
        .from('games')
        .select('id')
        .eq('code', code)
        .maybeSingle();

      if (!existing) {
        break;
      }

      code = generateGameCode();
      attempts++;
    }

    if (attempts === 10) {
      throw new GameError(ErrorType.CONNECTION_LOST, 'Failed to generate unique code');
    }

    // Create game with authenticated host
    const { data: game, error: gameError } = await supabase
      .from('games')
      .insert({
        code,
        round_count: enforcedSettings.roundCount,
        max_players: enforcedSettings.maxPlayers,
        status: 'waiting',
        auth_host_id: user.id,
      })
      .select()
      .single();

    if (gameError || !game) {
      throw new GameError(ErrorType.CONNECTION_LOST, gameError?.message);
    }

    // Add creator as first player
    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert({
        game_id: game.id,
        user_name: sanitizedName,
        avatar_color: getRandomAvatarColor(),
      })
      .select()
      .single();

    if (playerError || !player) {
      // Rollback: delete game if player creation failed
      await supabase.from('games').delete().eq('id', game.id);
      throw new GameError(ErrorType.CONNECTION_LOST, playerError?.message);
    }

    // Update game with host_id and phase_captain_id (host starts as captain)
    await supabase
      .from('games')
      .update({ host_id: player.id, phase_captain_id: player.id })
      .eq('id', game.id);

    return { game: { ...game, host_id: player.id, phase_captain_id: player.id }, player };
  }

  /**
   * Create game for TV display mode (no player)
   */
  static async createGameForDisplay(_settings: GameSettings): Promise<Game> {
    const supabase = getSupabase();
    const enforcedSettings = this.getEnforcedSettings();

    // Get authenticated user (required for hosts)
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new GameError(ErrorType.INVALID_INPUT, 'يجب تسجيل الدخول لإنشاء لعبة');
    }

    let code = generateGameCode();
    let attempts = 0;

    // Try to find unique code (max 10 attempts)
    while (attempts < 10) {
      const { data: existing } = await supabase
        .from('games')
        .select('id')
        .eq('code', code)
        .maybeSingle();

      if (!existing) {
        break;
      }

      code = generateGameCode();
      attempts++;
    }

    if (attempts === 10) {
      throw new GameError(ErrorType.CONNECTION_LOST, 'Failed to generate unique code');
    }

    // Create game without host or phase captain (but with authenticated host ID)
    const { data: game, error: gameError } = await supabase
      .from('games')
      .insert({
        code,
        round_count: enforcedSettings.roundCount,
        max_players: enforcedSettings.maxPlayers,
        status: 'waiting',
        auth_host_id: user.id,
        // host_id and phase_captain_id will be set when first player joins
      })
      .select()
      .single();

    if (gameError || !game) {
      throw new GameError(ErrorType.CONNECTION_LOST, gameError?.message);
    }

    return game;
  }

  /**
   * Join an existing game
   */
  static async joinGame(
    code: string,
    playerName: string
  ): Promise<{ game: Game; player: Player }> {
    const supabase = getSupabase();

    // Validate inputs
    validatePlayerName(playerName);

    const sanitizedName = sanitizeText(playerName);
    const normalizedCode = code.replace(/\s+/g, '').toUpperCase();

    // Get game
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('*')
      .eq('code', normalizedCode)
      .single();

    if (gameError || !game) {
      throw new GameError(ErrorType.GAME_NOT_FOUND);
    }

    // Check if game already started
    if (game.status !== 'waiting') {
      throw new GameError(ErrorType.ALREADY_STARTED);
    }

    // Check player count
    const { count, error: countError } = await supabase
      .from('players')
      .select('*', { count: 'exact', head: true })
      .eq('game_id', game.id);

    if (countError) {
      throw new GameError(ErrorType.CONNECTION_LOST, countError.message);
    }

    if ((count || 0) >= game.max_players) {
      throw new GameError(ErrorType.GAME_FULL);
    }

    // Check for existing player with same name (allow reconnect if disconnected)
    const { data: existingPlayer } = await supabase
      .from('players')
      .select('*')
      .eq('game_id', game.id)
      .eq('user_name', sanitizedName)
      .maybeSingle();

    if (existingPlayer) {
      // Let a dropped player reclaim their spot
      if (existingPlayer.connection_status === 'disconnected') {
        console.log('🔄 Reconnecting disconnected player:', existingPlayer.user_name);
        const { data: reconnectedPlayer, error: reconnectError } = await supabase
          .from('players')
          .update({ connection_status: 'connected' })
          .eq('id', existingPlayer.id)
          .select()
          .single();

        if (reconnectError || !reconnectedPlayer) {
          throw new GameError(ErrorType.CONNECTION_LOST, reconnectError?.message);
        }

        const phaseCaptainId = await this.claimPhaseCaptainIfNeeded(
          game.id,
          game.phase_captain_id,
          reconnectedPlayer.id
        );

        return {
          game: { ...game, phase_captain_id: phaseCaptainId },
          player: reconnectedPlayer
        };
      }
      // Player exists and is connected - duplicate name error
      throw new GameError(ErrorType.DUPLICATE_NAME);
    }

    // Add player
    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert({
        game_id: game.id,
        user_name: sanitizedName,
        avatar_color: getRandomAvatarColor(),
      })
      .select()
      .single();

    if (playerError || !player) {
      throw new GameError(ErrorType.CONNECTION_LOST, playerError?.message);
    }


    const phaseCaptainId = await this.claimPhaseCaptainIfNeeded(
      game.id,
      game.phase_captain_id,
      player.id
    );

    return {
      game: { ...game, phase_captain_id: phaseCaptainId },
      player
    };
  }

  /**
   * Start the game.
   * Uses RPC so connected players can start under host-auth RLS.
   */
  static async startGame(gameId: string, playerId: string): Promise<void> {
    const supabase = getSupabase();

    const { data, error } = await supabase.rpc('start_game_as_player', {
      p_game_id: gameId,
      p_player_id: playerId,
    });

    if (error) {
      // Backward compatibility if migration is not applied yet.
      if (error.message?.includes('Could not find the function public.start_game_as_player')) {
        const { data: updatedGame, error: updateError } = await supabase
          .from('games')
          .update({
            status: 'playing',
            current_round: 1,
          })
          .eq('id', gameId)
          .eq('status', 'waiting')
          .select('id')
          .maybeSingle();

        if (updateError) {
          throw new GameError(ErrorType.CONNECTION_LOST, updateError.message);
        }

        if (!updatedGame) {
          throw new GameError(
            ErrorType.CONNECTION_LOST,
            'Start game failed. Apply latest database migrations to enable player-controlled start.'
          );
        }
        return;
      }

      throw new GameError(ErrorType.CONNECTION_LOST, error.message);
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (result?.success === false) {
      throw new GameError(ErrorType.CONNECTION_LOST, result.message || 'Failed to start game');
    }
  }

  /**
   * Start the game from display mode (no player verification)
   * Used when TV display wants to start the game
   */
  static async startGameFromDisplay(gameId: string): Promise<void> {
    const supabase = getSupabase();

    // Update game status
    const { error } = await supabase
      .from('games')
      .update({
        status: 'playing',
        current_round: 1,
      })
      .eq('id', gameId);

    if (error) {
      throw new GameError(ErrorType.CONNECTION_LOST, error.message);
    }

    // Ensure the first round exists immediately (safety for TV mode)
    try {
      const { RoundService } = await import('./RoundService');
      await RoundService.createRound(gameId, 1);
    } catch (err) {
      console.error('Failed to create initial round from display start:', err);
      // Do not throw to avoid blocking start; phase captain can still create
    }
  }

  /**
   * Get game by code
   */
  static async getGameByCode(code: string): Promise<Game | null> {
    const supabase = getSupabase();

    const normalizedCode = code.replace(/\s+/g, '').toUpperCase();

    const { data, error } = await supabase
      .from('games')
      .select('*')
      .eq('code', normalizedCode)
      .single();

    if (error) {
      return null;
    }

    return data;
  }

  /**
   * Get game by ID
   */
  static async getGame(gameId: string): Promise<Game | null> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single();

    if (error) {
      return null;
    }

    return data;
  }

  /**
   * Get all players in a game
   */
  static async getGamePlayers(gameId: string): Promise<Player[]> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('game_id', gameId)
      .order('joined_at', { ascending: true });

    if (error) {
      throw new GameError(ErrorType.CONNECTION_LOST, error.message);
    }

    return data || [];
  }

  /**
   * Update player connection status
   */
  static async updatePlayerStatus(
    playerId: string,
    status: 'connected' | 'disconnected'
  ): Promise<void> {
    const supabase = getSupabase();

    await supabase
      .from('players')
      .update({ connection_status: status })
      .eq('id', playerId);
  }

  /**
   * Leave a game as player with server-side captain failover.
   * If captain leaves, server promotes next eligible player.
   * If no connected players remain, server finishes the game.
   */
  static async leaveGameAsPlayer(
    gameId: string,
    playerId: string
  ): Promise<{ gameEnded: boolean; newCaptainId: string | null; message: string }> {
    const supabase = getSupabase();

    const { data, error } = await supabase.rpc('leave_game_as_player', {
      p_game_id: gameId,
      p_player_id: playerId,
    });

    if (error) {
      throw new GameError(ErrorType.CONNECTION_LOST, error.message);
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (!result) {
      throw new GameError(ErrorType.CONNECTION_LOST, 'No response from leave_game_as_player');
    }

    if (result.success === false) {
      throw new GameError(ErrorType.CONNECTION_LOST, result.message || 'Failed to leave game');
    }

    return {
      gameEnded: !!result.game_ended,
      newCaptainId: result.new_captain_id ?? null,
      message: result.message || 'Player left game',
    };
  }

  /**
   * Manually advance to the next round (Host only)
   */
  static async advanceToNextRound(gameId: string, playerId: string): Promise<void> {
    const supabase = getSupabase();

    const { data, error } = await supabase.rpc('advance_to_next_round_by_player', {
      p_game_id: gameId,
      p_player_id: playerId,
    });

    if (error) {
      // Backward compatibility with old RPC signature.
      if (error.message?.includes('Could not find the function public.advance_to_next_round_by_player')) {
        const { error: fallbackError } = await supabase.rpc('advance_to_next_round', {
          p_game_id: gameId
        });
        if (fallbackError) {
          throw new GameError(ErrorType.CONNECTION_LOST, fallbackError.message);
        }
        return;
      }
      throw new GameError(ErrorType.CONNECTION_LOST, error.message);
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (result?.success === false) {
      throw new GameError(ErrorType.CONNECTION_LOST, result.message || 'Failed to advance round');
    }
  }

  /**
   * End game
   */
  static async incrementRound(gameId: string): Promise<void> {
    const supabase = getSupabase();

    // Get current game state
    const { data: game } = await supabase
      .from('games')
      .select('current_round, round_count')
      .eq('id', gameId)
      .single();

    if (!game) {
      throw new GameError(ErrorType.CONNECTION_LOST, 'Game not found');
    }

    const nextRound = game.current_round + 1;

    // Check if game should end
    if (nextRound > game.round_count) {
      await this.endGame(gameId);
      return;
    }

    // Increment to next round
    const { error } = await supabase
      .from('games')
      .update({ current_round: nextRound })
      .eq('id', gameId);

    if (error) {
      throw new GameError(ErrorType.CONNECTION_LOST, error.message);
    }
  }

  static async endGame(gameId: string): Promise<void> {
    const supabase = getSupabase();

    const { error } = await supabase
      .from('games')
      .update({ status: 'finished' })
      .eq('id', gameId);

    if (error) {
      throw new GameError(ErrorType.CONNECTION_LOST, error.message);
    }
  }
}

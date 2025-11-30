import { getSupabase } from './supabase';
import {
  Game,
  Player,
  GameSettings,
  GameError,
  ErrorType,
} from '../types';
import { generateGameCode } from '../utils/gameCode';
import { validateGameSettings, validatePlayerName, sanitizeText } from '../utils/validation';
import { getRandomAvatarColor } from '../utils/avatars';
import { GAME_CONFIG } from '../constants/game';

export class GameService {
  /**
   * Create a new game and add host as first player
   */
  static async createGame(
    hostName: string,
    settings: GameSettings
  ): Promise<{ game: Game; player: Player }> {
    const supabase = getSupabase();

    // Get authenticated user (required for hosts)
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new GameError(ErrorType.INVALID_INPUT, 'يجب تسجيل الدخول لإنشاء لعبة');
    }

    // Validate inputs
    validatePlayerName(hostName);
    validateGameSettings(settings);

    const sanitizedName = sanitizeText(hostName);
    let code = generateGameCode();
    let attempts = 0;

    // Try to find unique code (max 10 attempts)
    while (attempts < 10) {
      const { data: existing } = await supabase
        .from('games')
        .select('id')
        .eq('code', code)
        .single();

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
        round_count: settings.roundCount,
        max_players: settings.maxPlayers,
        status: 'waiting',
        auth_host_id: user.id,
      })
      .select()
      .single();

    if (gameError || !game) {
      throw new GameError(ErrorType.CONNECTION_LOST, gameError?.message);
    }

    // Add host as first player
    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert({
        game_id: game.id,
        user_name: sanitizedName,
        is_host: true,
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
  static async createGameForDisplay(settings: GameSettings): Promise<Game> {
    const supabase = getSupabase();

    // Get authenticated user (required for hosts)
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new GameError(ErrorType.INVALID_INPUT, 'يجب تسجيل الدخول لإنشاء لعبة');
    }

    // Validate settings
    validateGameSettings(settings);

    let code = generateGameCode();
    let attempts = 0;

    // Try to find unique code (max 10 attempts)
    while (attempts < 10) {
      const { data: existing } = await supabase
        .from('games')
        .select('id')
        .eq('code', code)
        .single();

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
        round_count: settings.roundCount,
        max_players: settings.maxPlayers,
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

        // Check if this player should be phase captain (if game has no captain)
        if (!game.phase_captain_id) {
          await supabase
            .from('games')
            .update({ phase_captain_id: reconnectedPlayer.id })
            .eq('id', game.id);
        }

        return { game, player: reconnectedPlayer };
      }
      // Player exists and is connected - duplicate name error
      throw new GameError(ErrorType.DUPLICATE_NAME);
    }

    // Check if this is the first player (for display mode games)
    const isFirstPlayer = (count || 0) === 0;
    const shouldBeHost = isFirstPlayer && !game.host_id; // First player becomes host if no host exists

    // Add player
    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert({
        game_id: game.id,
        user_name: sanitizedName,
        is_host: shouldBeHost,
        avatar_color: getRandomAvatarColor(),
      })
      .select()
      .single();

    if (playerError || !player) {
      throw new GameError(ErrorType.CONNECTION_LOST, playerError?.message);
    }

    // If this is the first player and game has no host, promote them
    if (shouldBeHost) {
      console.log('👑 First player joining display mode game, promoting to host and phase captain');
      await supabase
        .from('games')
        .update({ host_id: player.id, phase_captain_id: player.id })
        .eq('id', game.id);

      // Return updated game with host_id and phase_captain_id
      return {
        game: { ...game, host_id: player.id, phase_captain_id: player.id },
        player: { ...player, is_host: true }
      };
    }

    return { game, player };
  }

  /**
   * Start the game (host only)
   */
  static async startGame(gameId: string, playerId: string): Promise<void> {
    const supabase = getSupabase();

    // Verify player is host
    const { data: player } = await supabase
      .from('players')
      .select('is_host')
      .eq('id', playerId)
      .eq('game_id', gameId)
      .single();

    if (!player?.is_host) {
      throw new GameError(ErrorType.CONNECTION_LOST, 'Only host can start game');
    }

    // Check minimum players
    const { count } = await supabase
      .from('players')
      .select('*', { count: 'exact', head: true })
      .eq('game_id', gameId);

    if ((count || 0) < GAME_CONFIG.MIN_PLAYERS) {
      throw new GameError(
        ErrorType.CONNECTION_LOST,
        `Need at least ${GAME_CONFIG.MIN_PLAYERS} players`
      );
    }

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
  }

  /**
   * Start the game from display mode (no player verification)
   * Used when TV display wants to start the game
   */
  static async startGameFromDisplay(gameId: string): Promise<void> {
    const supabase = getSupabase();

    // Check minimum players
    const { count } = await supabase
      .from('players')
      .select('*', { count: 'exact', head: true })
      .eq('game_id', gameId);

    if ((count || 0) < GAME_CONFIG.MIN_PLAYERS) {
      throw new GameError(
        ErrorType.CONNECTION_LOST,
        `Need at least ${GAME_CONFIG.MIN_PLAYERS} players`
      );
    }

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

    await supabase
      .from('games')
      .update({ status: 'finished' })
      .eq('id', gameId);
  }
}

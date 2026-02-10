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

export class GameService {
  private static async claimPhaseCaptainIfNeeded(
    gameId: string,
    currentCaptainId: string | null,
    playerId: string
  ): Promise<string | null> {
    if (currentCaptainId) {
      return currentCaptainId;
    }

    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('claim_phase_captain_if_unassigned', {
      p_game_id: gameId,
      p_player_id: playerId,
    });

    if (error) {
      console.warn('claim_phase_captain_if_unassigned RPC failed, using fallback:', error.message);

      // Fallback for environments where the new RPC migration is not applied yet.
      // This may still fail for non-host players due RLS, but should not block joining.
      await supabase
        .from('games')
        .update({ phase_captain_id: playerId })
        .eq('id', gameId)
        .is('phase_captain_id', null);

      const { data: freshGame } = await supabase
        .from('games')
        .select('phase_captain_id')
        .eq('id', gameId)
        .single();

      return freshGame?.phase_captain_id ?? currentCaptainId;
    }

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
   * Controller checks are handled in the client to support captain fallback logic.
   */
  static async startGame(gameId: string, _playerId: string): Promise<void> {
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
   * Manually advance to the next round (Host only)
   */
  static async advanceToNextRound(gameId: string): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase.rpc('advance_to_next_round', {
      p_game_id: gameId
    });

    if (error) throw error;
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

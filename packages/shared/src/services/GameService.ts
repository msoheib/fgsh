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
import { getGameSession } from '../utils/sessionStorage';

export class GameService {
  static normalizeForceAdvanceResult(
    raw: unknown,
    fallback: { roundId: string; gameId: string }
  ): {
    success: boolean;
    roundId: string;
    newRoundStatus: string | null;
    gameId: string;
    message: string;
  } {
    if (typeof raw === 'boolean') {
      return {
        success: raw,
        roundId: fallback.roundId,
        newRoundStatus: null,
        gameId: fallback.gameId,
        message: raw ? 'Round advance acknowledged' : 'Round advance failed',
      };
    }

    const row = (Array.isArray(raw) ? raw[0] : raw) as {
      success?: boolean;
      round_id?: string;
      new_round_status?: string;
      game_id?: string;
      message?: string;
    } | null;

    return {
      success: row?.success ?? true,
      roundId: row?.round_id || fallback.roundId,
      newRoundStatus: row?.new_round_status ?? null,
      gameId: row?.game_id || fallback.gameId,
      message: row?.message || 'Round advance acknowledged',
    };
  }

  private static claimCaptainRpcAvailable: boolean | null = null;

  private static getPlayerSession(gameId?: string, playerId?: string): {
    gameId: string;
    playerId: string;
    playerToken: string;
  } {
    const session = getGameSession();
    if (!session?.playerId || !session.playerToken) {
      throw new GameError(ErrorType.UNAUTHORIZED, 'Player session expired');
    }

    if (playerId && session.playerId !== playerId) {
      throw new GameError(ErrorType.UNAUTHORIZED, 'Player session mismatch');
    }

    if (gameId && session.gameId !== gameId) {
      throw new GameError(ErrorType.UNAUTHORIZED, 'Game session mismatch');
    }

    return {
      gameId: session.gameId,
      playerId: session.playerId,
      playerToken: session.playerToken,
    };
  }

  private static async getPlayerById(playerId: string): Promise<Player> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('id', playerId)
      .single();

    if (error || !data) {
      throw new GameError(ErrorType.CONNECTION_LOST, error?.message || 'Player not found');
    }

    return data;
  }

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
    const session = this.getPlayerSession(gameId, playerId);
    const { data, error } = await supabase.rpc('claim_phase_captain_if_unassigned', {
      p_game_id: gameId,
      p_player_id: playerId,
      p_player_token: session.playerToken,
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
  ): Promise<{ game: Game; player: Player; playerToken: string }> {
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

    const { data, error } = await supabase.rpc('create_authenticated_game', {
      p_code: code,
      p_round_count: enforcedSettings.roundCount,
      p_max_players: enforcedSettings.maxPlayers,
      p_host_name: sanitizedName,
      p_is_display_mode: false,
      p_avatar_color: getRandomAvatarColor(),
    });

    if (error) {
      throw new GameError(ErrorType.CONNECTION_LOST, error.message);
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.game_id || !result?.player_id || !result?.player_token) {
      throw new GameError(ErrorType.CONNECTION_LOST, 'Failed to create secure host session');
    }

    const [game, player] = await Promise.all([
      this.getGame(result.game_id),
      this.getPlayerById(result.player_id),
    ]);

    if (!game || !player) {
      throw new GameError(ErrorType.CONNECTION_LOST, 'Failed to load created game');
    }

    return {
      game,
      player,
      playerToken: result.player_token as string,
    };
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

    const { data, error } = await supabase.rpc('create_authenticated_game', {
      p_code: code,
      p_round_count: enforcedSettings.roundCount,
      p_max_players: enforcedSettings.maxPlayers,
      p_host_name: null,
      p_is_display_mode: true,
      p_avatar_color: null,
    });

    if (error) {
      throw new GameError(ErrorType.CONNECTION_LOST, error.message);
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.game_id) {
      throw new GameError(ErrorType.CONNECTION_LOST, 'Failed to create display game');
    }

    const game = await this.getGame(result.game_id);
    if (!game) {
      throw new GameError(ErrorType.CONNECTION_LOST, 'Failed to load created display game');
    }

    return game;
  }

  /**
   * Join an existing game
   */
  static async joinGame(
    code: string,
    playerName: string
  ): Promise<{ game: Game; player: Player; playerToken: string }> {
    const supabase = getSupabase();

    // Validate inputs
    validatePlayerName(playerName);

    const sanitizedName = sanitizeText(playerName);
    const normalizedCode = code.replace(/\s+/g, '').toUpperCase();

    const { data, error } = await supabase.rpc('join_game', {
      p_code: normalizedCode,
      p_player_name: sanitizedName,
      p_avatar_color: getRandomAvatarColor(),
    });

    if (error) {
      const message = error.message.toLowerCase();
      if (message.includes('game not found')) {
        throw new GameError(ErrorType.GAME_NOT_FOUND);
      }
      if (message.includes('already')) {
        throw new GameError(ErrorType.ALREADY_STARTED);
      }
      if (message.includes('full')) {
        throw new GameError(ErrorType.GAME_FULL);
      }
      if (message.includes('name already')) {
        throw new GameError(ErrorType.DUPLICATE_NAME);
      }
      throw new GameError(ErrorType.CONNECTION_LOST, error.message);
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.game_id || !result?.player_id || !result?.player_token) {
      throw new GameError(ErrorType.CONNECTION_LOST, 'Failed to create secure player session');
    }

    const [game, player] = await Promise.all([
      this.getGame(result.game_id),
      this.getPlayerById(result.player_id),
    ]);

    if (!game || !player) {
      throw new GameError(ErrorType.CONNECTION_LOST, 'Failed to load joined game');
    }

    return {
      game,
      player,
      playerToken: result.player_token as string,
    };
  }

  /**
   * Start the game.
   * Uses RPC so connected players can start under host-auth RLS.
   */
  static async startGame(gameId: string, playerId: string): Promise<void> {
    const supabase = getSupabase();
    const session = this.getPlayerSession(gameId, playerId);

    const { data, error } = await supabase.rpc('start_game_as_player', {
      p_game_id: gameId,
      p_player_id: playerId,
      p_player_token: session.playerToken,
    });

    if (error) {
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
  static async startGameFromDisplay(_gameId: string): Promise<void> {
    throw new GameError(
      ErrorType.UNAUTHORIZED,
      'A joined controller is required to start the game'
    );
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
    const session = this.getPlayerSession(undefined, playerId);
    if (status === 'connected') {
      await this.reconnectPlayerSession(session.gameId, playerId);
      return;
    }

    throw new GameError(
      ErrorType.UNAUTHORIZED,
      'Direct player disconnect is no longer supported'
    );
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
    const session = this.getPlayerSession(gameId, playerId);

    const { data, error } = await supabase.rpc('leave_game_as_player', {
      p_game_id: gameId,
      p_player_id: playerId,
      p_player_token: session.playerToken,
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
    const session = this.getPlayerSession(gameId, playerId);

    const { data, error } = await supabase.rpc('advance_to_next_round_by_player', {
      p_game_id: gameId,
      p_player_id: playerId,
      p_player_token: session.playerToken,
    });

    if (error) {
      throw new GameError(ErrorType.CONNECTION_LOST, error.message);
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (result?.success === false) {
      throw new GameError(ErrorType.CONNECTION_LOST, result.message || 'Failed to advance round');
    }
  }

  static async reconnectPlayerSession(
    gameId: string,
    playerId: string
  ): Promise<{ player: Player; phaseCaptainId: string | null }> {
    const supabase = getSupabase();
    const session = this.getPlayerSession(gameId, playerId);

    const { data, error } = await supabase.rpc('reconnect_player_session', {
      p_game_id: gameId,
      p_player_id: playerId,
      p_player_token: session.playerToken,
    });

    if (error) {
      throw new GameError(ErrorType.CONNECTION_LOST, error.message);
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.player_id) {
      throw new GameError(ErrorType.CONNECTION_LOST, 'Failed to reconnect player');
    }

    const player = await this.getPlayerById(result.player_id);
    return {
      player,
      phaseCaptainId: result.phase_captain_id ?? null,
    };
  }

  static async saveCategoryPrompt(
    gameId: string,
    roundNumber: number,
    playerId: string,
    input: { options?: string[]; selectedCategory?: string | null }
  ): Promise<void> {
    const supabase = getSupabase();
    const session = this.getPlayerSession(gameId, playerId);

    const { error } = await supabase.rpc('save_game_category_prompt', {
      p_game_id: gameId,
      p_round_number: roundNumber,
      p_player_id: playerId,
      p_player_token: session.playerToken,
      p_options: input.options ?? null,
      p_selected_category: input.selectedCategory ?? null,
    });

    if (error) {
      throw new GameError(ErrorType.CONNECTION_LOST, error.message);
    }
  }

  static async forceAdvanceRound(roundId: string, playerId: string): Promise<{
    success: boolean;
    roundId: string;
    newRoundStatus: string | null;
    gameId: string;
    message: string;
  }> {
    const supabase = getSupabase();
    const session = this.getPlayerSession(undefined, playerId);

    const { data, error } = await supabase.rpc('force_advance_round_as_player', {
      p_round_id: roundId,
      p_player_id: playerId,
      p_player_token: session.playerToken,
    });

    if (error) {
      throw new GameError(ErrorType.CONNECTION_LOST, error.message);
    }

    return this.normalizeForceAdvanceResult(data, {
      roundId,
      gameId: session.gameId,
    });
  }

  static async restartFinishedGame(
    gameId: string,
    playerId: string
  ): Promise<Game> {
    const supabase = getSupabase();
    const session = this.getPlayerSession(gameId, playerId);

    const { data, error } = await supabase.rpc('restart_finished_game_as_player', {
      p_game_id: gameId,
      p_player_id: playerId,
      p_player_token: session.playerToken,
    });

    if (error) {
      throw new GameError(ErrorType.CONNECTION_LOST, error.message);
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (result?.success === false) {
      throw new GameError(ErrorType.CONNECTION_LOST, result.message || 'Failed to restart game');
    }

    const game = await this.getGame(gameId);
    if (!game) {
      throw new GameError(ErrorType.CONNECTION_LOST, 'Failed to load restarted game');
    }

    return game;
  }

  /**
   * End game
   */
  static async incrementRound(gameId: string): Promise<void> {
    const session = this.getPlayerSession(gameId);
    await this.advanceToNextRound(gameId, session.playerId!);
  }

  static async endGame(gameId: string): Promise<void> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('end_game_as_host', {
      p_game_id: gameId,
    });

    if (error || data !== true) {
      throw new GameError(ErrorType.CONNECTION_LOST, error?.message || 'Failed to end game');
    }
  }
}

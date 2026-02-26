import { create } from 'zustand';
import { Game, Player, GameSettings, GameRound, Question, PlayerAnswer, PlayerConnectionStatus } from '../types';
import { GameService, RealtimeService, SyncService, SyncState } from '../services';
import { saveGameSession, clearGameSession, getGameSession } from '../utils/sessionStorage';
import { GAME_CONFIG } from '../constants/game';

/**
 * Helper function to handle sync results and update store state.
 * This is called by SyncService callbacks and provides a safety net
 * to catch any state that was missed by realtime events.
 */
async function handleSyncResult(
  state: SyncState,
  get: () => GameState,
  set: (partial: Partial<GameState>) => void
): Promise<void> {
  const currentState = get();
  
  // Only log if something changed to reduce noise
  const gameChanged = state.game.status !== currentState.game?.status ||
    state.game.current_round !== currentState.game?.current_round;
  
  if (gameChanged) {
    console.log('🔄 Sync detected game state change:', {
      oldStatus: currentState.game?.status,
      newStatus: state.game.status,
      oldRound: currentState.game?.current_round,
      newRound: state.game.current_round
    });
  }

  // Update game state if changed
  if (state.game.id !== currentState.game?.id || gameChanged) {
    const isPhaseCaptain = currentState.currentPlayer?.id === state.game.phase_captain_id;
    set({ 
      game: state.game, 
      isPhaseCaptain,
      lastSyncTime: Date.now()
    });
  }

  // Update players if changed
  const currentPlayerIds = new Set(currentState.players.map(p => p.id));
  const newPlayerIds = new Set(state.players.map(p => p.id));
  const playersChanged = currentState.players.length !== state.players.length ||
    [...currentPlayerIds].some(id => !newPlayerIds.has(id));
  
  if (playersChanged) {
    console.log('🔄 Sync detected player list change');
    set({ players: state.players });
  }

  // Update round state if we have a current round
  if (state.currentRound && state.game.status === 'playing') {
    const { useRoundStore } = await import('./roundStore');
    const roundState = useRoundStore.getState();
    
    const roundChanged = 
      roundState.currentRound?.id !== state.currentRound.id ||
      roundState.currentRound?.status !== state.currentRound.status ||
      roundState.roundStatus !== state.currentRound.status;
    
    if (roundChanged) {
      console.log('🔄 Sync detected round state change:', {
        oldRoundId: roundState.currentRound?.id,
        newRoundId: state.currentRound.id,
        oldStatus: roundState.roundStatus,
        newStatus: state.currentRound.status
      });

      // Calculate time remaining
      const startTime = state.currentRound.timer_starts_at
        ? new Date(state.currentRound.timer_starts_at).getTime()
        : Date.now();
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const timeRemaining = Math.max(0, state.currentRound.timer_duration - elapsed);

      // Get question from the round if it has one
      const question = (state.currentRound as any).question || roundState.question;

      useRoundStore.setState({
        currentRound: state.currentRound,
        question: question,
        roundNumber: state.currentRound.round_number,
        roundStatus: state.currentRound.status,
        timeRemaining,
        timerActive: timeRemaining > 0,
        allAnswers: state.answers.length > 0 ? state.answers : roundState.allAnswers,
        totalRounds: state.game.round_count,
        // Update player submission state
        hasSubmittedAnswer: !!state.playerAnswer,
        myAnswer: state.playerAnswer?.answer_text || roundState.myAnswer,
        hasSubmittedVote: !!state.playerVote,
        myVote: state.playerVote?.answer_id || roundState.myVote,
      });
    }
  }
}

interface GameState {
  // Game data
  game: Game | null;
  gameCode: string | null;
  players: Player[];
  currentPlayer: Player | null;
  isPhaseCaptain: boolean; // Whether current player is responsible for phase transitions
  isDisplayMode: boolean; // TV display-only mode (no player participation)

  // Connection state
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  rehydrationAttempted: boolean; // Whether session rehydration has been attempted
  roundEndResetTimeout: ReturnType<typeof setTimeout> | null; // Track timeout for round end reset
  lastSyncTime: number | null; // Timestamp of last successful sync

  // Actions
  createGame: (hostName: string, settings: GameSettings) => Promise<void>;
  createGameAsDisplay: (settings: GameSettings) => Promise<void>; // TV display mode
  joinGame: (code: string, playerName: string) => Promise<void>;
  rehydrateSession: () => Promise<boolean>; // Restore session after refresh
  startGame: () => Promise<void>;
  leaveGame: () => Promise<void>;
  setPlayers: (players: Player[]) => void;
  addPlayer: (player: Player) => void;
  removePlayer: (playerId: string) => void;
  updatePlayer: (player: Player) => void;
  promoteNewCaptain: (disconnectedPlayerId: string) => Promise<void>; // Handle captain failover
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  // Initial state
  game: null,
  gameCode: null,
  players: [],
  currentPlayer: null,
  isPhaseCaptain: false,
  isDisplayMode: false,
  isConnected: false,
  lastSyncTime: null,
  isLoading: false,
  error: null,
  rehydrationAttempted: false,
  roundEndResetTimeout: null,

  // Create new game
  createGame: async (hostName: string, settings: GameSettings) => {
    // End old game if user was phase captain and game is still active
    const oldSession = getGameSession();
    if (oldSession && oldSession.isPhaseCaptain) {
      try {
        const oldGame = await GameService.getGame(oldSession.gameId);
        if (oldGame && oldGame.status !== 'finished') {
          console.log('🔚 Ending old game before creating new one:', oldGame.id);
          await GameService.endGame(oldGame.id);
        }
      } catch (err) {
        console.error('Failed to end old game:', err);
      }
    }

    // Clear any existing session before creating new game
    clearGameSession();

    set({ isLoading: true, error: null });
    try {
      const { game, player } = await GameService.createGame(hostName, settings);

      set({
        game,
        gameCode: game.code,
        currentPlayer: player,
        isPhaseCaptain: true, // Creator starts as phase captain
        isDisplayMode: false,
        players: [player],
        isLoading: false,
        rehydrationAttempted: true, // Fresh session - skip rehydrate guard
      });

      // Subscribe to realtime updates with presence tracking
      RealtimeService.subscribeToGame(
        game.id,
        {
        onGameUpdated: (updatedGame) => {
          console.log('📡 Game updated event received:', {
            currentRound: updatedGame.current_round,
            status: updatedGame.status,
            phaseCaptainId: updatedGame.phase_captain_id
          });
          const currentPlayer = get().currentPlayer;
          const isPhaseCaptain = currentPlayer?.id === updatedGame.phase_captain_id;
          console.log('🎯 Phase captain status:', { isPhaseCaptain, currentPlayerId: currentPlayer?.id, captainId: updatedGame.phase_captain_id });
          set({ game: updatedGame, isPhaseCaptain });

          // Clear session when game finishes (don't rehydrate finished games)
          if (updatedGame.status === 'finished') {
            console.log('🏁 Game finished, clearing session to prevent rehydration');
            clearGameSession();
          }
        },
        onPlayerJoined: (newPlayer) => {
          get().addPlayer(newPlayer);
        },
        onPlayerLeft: async (playerId) => {
          console.log('👋 Player left:', playerId);
          const { game } = get();

          // If the phase captain left, promote a new captain
          if (game?.phase_captain_id === playerId) {
            console.log('⚠️ Phase captain disconnected, promoting new captain...');
            await get().promoteNewCaptain(playerId);
          }

          get().removePlayer(playerId);
        },
        onGameStarted: (updatedGame) => {
          console.log('🎮 Game started event received (createGame):', updatedGame);
          set({ game: updatedGame });
        },
        onRoundStarted: (round: GameRound, question: Question) => {
          console.log('🎲 Round started event received', {
            roundId: round.id,
            roundNumber: round.round_number,
            questionId: question.id,
            questionText: question.question_text,
            timerStartsAt: round.timer_starts_at
          });

          // Clear any pending round end reset timeout
          const currentTimeout = get().roundEndResetTimeout;
          if (currentTimeout) {
            console.log('🛑 Clearing pending round end reset timeout');
            clearTimeout(currentTimeout);
            set({ roundEndResetTimeout: null });
          }

          // Import roundStore dynamically to avoid circular dependency
          import('./roundStore').then(({ useRoundStore }) => {
            const currentState = useRoundStore.getState();

            // Only update if this is a NEW round (not already set)
            if (currentState.currentRound?.id === round.id) {
              console.log('⚠️ Ignoring duplicate round start event for round:', round.id);
              return;
            }

            // Calculate time remaining based on server timestamp
            const startTime = round.timer_starts_at ? new Date(round.timer_starts_at).getTime() : Date.now();
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const initialTimeRemaining = Math.max(0, round.timer_duration - elapsed);

            console.log('✅ Setting round state:', {
              roundId: round.id,
              roundNumber: round.round_number,
              questionId: question.id,
              questionText: question.question_text.substring(0, 50) + '...',
              timeRemaining: initialTimeRemaining
            });

            useRoundStore.setState({
              currentRound: round,
              question: question,
              roundNumber: round.round_number,
              roundStatus: 'answering',
              timeRemaining: initialTimeRemaining,
              timerActive: true,
              allAnswers: [],
              playerVotes: new Map(),
              playerAnswers: new Map(),
              myAnswer: null,
              hasSubmittedAnswer: false,
              myVote: null,
              hasSubmittedVote: false,
              totalRounds: get().game?.round_count || GAME_CONFIG.DEFAULT_ROUNDS,
              isLoading: false,
            });
          });
        },
        onRoundStatusChanged: async (roundId: string, status: string, roundData?: GameRound) => {
          console.log('📢 Round status changed:', { roundId, status });
          const { useRoundStore } = await import('./roundStore');
          const currentState = useRoundStore.getState();

          if (currentState.currentRound?.id === roundId) {
            console.log('✅ Updating roundStatus to:', status);

            // If transitioning to voting, fetch all answers and updated round data
            if (status === 'voting') {
              console.log('🗳️ Fetching answers for voting phase...');
              const { RoundService } = await import('../services/RoundService');
              try {
                const answers = await RoundService.getRoundAnswers(roundId);

                // Use round data from realtime payload if available, fall back to re-fetch
                let updatedRound = roundData?.timer_starts_at ? roundData : null;
                if (!updatedRound) {
                  const { getSupabase } = await import('../services/supabase');
                  const supabase = getSupabase();
                  const { data } = await supabase
                    .from('game_rounds')
                    .select('*')
                    .eq('id', roundId)
                    .single();
                  updatedRound = data;
                }

                // Calculate time remaining based on updated server timestamp
                const startTime = updatedRound?.timer_starts_at
                  ? new Date(updatedRound.timer_starts_at).getTime()
                  : Date.now();
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                const votingTimeRemaining = Math.max(0, (updatedRound?.timer_duration || GAME_CONFIG.VOTING_TIMER) - elapsed);

                console.log('📋 Fetched answers:', answers.length, 'Time remaining:', votingTimeRemaining);
                useRoundStore.setState({
                  currentRound: updatedRound || currentState.currentRound,
                  roundStatus: status as any,
                  allAnswers: answers,
                  timeRemaining: votingTimeRemaining,
                  timerActive: true,
                  playerVotes: new Map(),
                  myVote: null,
                  hasSubmittedVote: false
                });
              } catch (error) {
                console.error('❌ Failed to fetch answers:', error);
                useRoundStore.setState({
                  roundStatus: status as any,
                  timeRemaining: status === 'voting' ? GAME_CONFIG.VOTING_TIMER : 0,
                  timerActive: status === 'voting',
                });
              }
            } else {
              useRoundStore.setState({ roundStatus: status as any });
            }
          }
        },
        onAnswerSubmitted: (playerId: string, roundId: string) => {
          console.log('📝 Answer submitted by player:', playerId, 'for round:', roundId);
          import('./roundStore').then(({ useRoundStore }) => {
            const currentRound = useRoundStore.getState().currentRound;
            // Only process if this answer is for the current round
            if (currentRound?.id === roundId) {
              useRoundStore.getState().addPlayerAnswer(playerId, true);
            } else {
              console.log('⚠️ Ignoring answer for different round:', roundId, 'current:', currentRound?.id);
            }
          });
        },
        onVoteSubmitted: (playerId: string, roundId: string) => {
          console.log('🗳️ Vote submitted by player:', playerId, 'for round:', roundId);
          import('./roundStore').then(({ useRoundStore }) => {
            const currentRound = useRoundStore.getState().currentRound;
            // Only process if this vote is for the current round
            if (currentRound?.id === roundId) {
              useRoundStore.getState().addVote(playerId);
            } else {
              console.log('⚠️ Ignoring vote for different round:', roundId, 'current:', currentRound?.id);
            }
          });
        },
        onRoundEnded: async (roundId: string) => {
          console.log('🏁 Round ended:', roundId);
          const currentGame = get().game;
          if (!currentGame) return;

          // Clear any existing timeout
          const existingTimeout = get().roundEndResetTimeout;
          if (existingTimeout) {
            clearTimeout(existingTimeout);
          }

          // Check if this was the last round
          if (currentGame.current_round >= currentGame.round_count) {
            console.log('🎉 Game complete! All rounds finished.');
            set({ roundEndResetTimeout: null });
            // Game will be marked as finished by host
          } else {
            console.log('➡️ Preparing for next round...');
            // const currentRoundNumber = currentGame.current_round;

            // Wait a moment to show scores, but DO NOT clear for next round (manual mode)
            // No auto-reset. We wait for the host to manually trigger the next round.
            set({ roundEndResetTimeout: null });
          }
        },
        onConnected: () => {
          set({ isConnected: true });
          // Start periodic sync for safety net
          const { game: g, currentPlayer: cp } = get();
          if (g?.id) {
            SyncService.startSync(g.id, cp?.id || null, (result) => {
              if (result.success && result.state) {
                handleSyncResult(result.state, get, set);
              }
            });
          }
        },
        onDisconnected: () => {
          set({ isConnected: false });
        },
        onReconnected: async () => {
          // Force immediate sync to catch missed updates
          const { game } = get();
          if (!game) return;

          console.log('🔄 Force syncing after reconnection...');
          const currentPlayer = get().currentPlayer;
          const result = await SyncService.forceSyncNow(game.id, currentPlayer?.id || null);

          if (result.success && result.state) {
            await handleSyncResult(result.state, get, set);
            console.log('✅ Full state sync completed after reconnection');
          } else {
            console.error('❌ Sync failed after reconnection:', result.error);
          }
        },
        onPresenceSync: (presences) => {
          console.log('👥 Presence sync:', presences.length, 'players online');
          // Update player connection status based on presence
          const onlinePlayerIds = new Set(presences.map(p => p.player_id));
          const players = get().players.map(player => ({
            ...player,
            connection_status: (onlinePlayerIds.has(player.id) ? 'connected' : 'disconnected') as PlayerConnectionStatus
          }));
          set({ players });
        },
        onPresenceJoin: (presence) => {
          console.log('👤 Player joined (presence):', presence.nickname);
        },
        onPresenceLeave: async (presence) => {
          console.log('👤 Player left (presence):', presence.nickname);
          const leftPlayerId = presence.player_id;
          const { game } = get();

          if (leftPlayerId && game?.phase_captain_id === leftPlayerId) {
            console.log('⚠️ Presence leave detected for current captain. Triggering failover...');
            await get().promoteNewCaptain(leftPlayerId);
          }
        },
      },
      // Pass player info for presence tracking
      {
        id: player.id,
        nickname: player.user_name,
      }
      );

      // Save session to localStorage for reconnection after refresh
      saveGameSession({
        gameId: game.id,
        gameCode: game.code,
        playerId: player.id,
        playerName: player.user_name,
        isPhaseCaptain: true,
        joinedAt: Date.now(),
      });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  // Create game for TV display mode (no player participation)
  createGameAsDisplay: async (settings: GameSettings) => {
    // Clear any existing session
    clearGameSession();

    set({ isLoading: true, error: null });
    try {
      const game = await GameService.createGameForDisplay(settings);

      set({
        game,
        gameCode: game.code,
        currentPlayer: null, // No player in display mode
        isPhaseCaptain: false,
        isDisplayMode: true, // Flag for display-only mode
        players: [],
        isLoading: false,
        rehydrationAttempted: true, // Fresh session - skip rehydrate guard
      });

      let displayReviewUntilTs: number | null = null;

      // Subscribe to realtime updates (display mode - no player actions)
      RealtimeService.subscribeToGame(game.id, {
        onGameUpdated: (updatedGame) => {
          console.log('📺 [Display Mode] Game updated:', {
            currentRound: updatedGame.current_round,
            status: updatedGame.status
          });
          set({ game: updatedGame });

          // Clear session when game finishes
          if (updatedGame.status === 'finished') {
            console.log('🏁 Game finished, clearing session');
            clearGameSession();
          }
        },
        onPlayerJoined: async (newPlayer) => {
          console.log('[Display Mode] Player joined:', newPlayer.user_name);
          get().addPlayer(newPlayer);

          // In display mode, host auth can reliably assign first connected player as captain.
          const currentGame = get().game;
          if (currentGame && !currentGame.phase_captain_id) {
            try {
              const claimedCaptainId = await GameService.claimPhaseCaptain(currentGame.id, newPlayer.id);
              if (claimedCaptainId) {
                set({ game: { ...currentGame, phase_captain_id: claimedCaptainId } });
              }
            } catch (error) {
              console.error('[Display Mode] Failed to assign phase captain after player join:', error);
            }
          }
        },
        onPlayerLeft: (playerId) => {
          console.log('📺 [Display Mode] Player left:', playerId);
          get().removePlayer(playerId);
        },
        onGameStarted: (updatedGame) => {
          console.log('📺 [Display Mode] Game started:', updatedGame);
          set({ game: updatedGame });
        },
        onRoundStarted: (round, question) => {
          console.log('📺 [Display Mode] Round started:', { roundNumber: round.round_number, questionText: question.question_text });
          import('./roundStore').then(({ useRoundStore }) => {
            const applyRoundUpdate = () => {
              const startTime = round.timer_starts_at ? new Date(round.timer_starts_at).getTime() : Date.now();
              const elapsed = Math.floor((Date.now() - startTime) / 1000);
              const initialTimeRemaining = Math.max(0, round.timer_duration - elapsed);

              useRoundStore.setState({
                currentRound: round,
                question,
                roundNumber: round.round_number,
                roundStatus: round.status,
                timeRemaining: initialTimeRemaining,
                timerActive: true,
                allAnswers: [],
                playerAnswers: new Map(),
                playerVotes: new Map(),
                myAnswer: null,
                hasSubmittedAnswer: false,
                myVote: null,
                hasSubmittedVote: false,
                totalRounds: get().game?.round_count || 0,
                isLoading: false,
              });

              displayReviewUntilTs = null;
            };

            const delayMs = displayReviewUntilTs ? Math.max(0, displayReviewUntilTs - Date.now()) : 0;
            if (delayMs > 0) {
              console.log('📺 [Display Mode] Delaying round transition to preserve review:', delayMs, 'ms');
              setTimeout(applyRoundUpdate, delayMs);
              return;
            }

            applyRoundUpdate();
          });
        },
        onRoundStatusChanged: async (roundId: string, status: string, _roundData?: GameRound) => {
          const { useRoundStore } = await import('./roundStore');
          const currentState = useRoundStore.getState();
          if (currentState.currentRound?.id !== roundId) return;

          if (status === 'completed') {
            const minReviewMs = GAME_CONFIG.RESULTS_DISPLAY_DURATION * 1000;
            const revealEstimateMs = Math.max(
              0,
              (currentState.allAnswers.length * GAME_CONFIG.TV_REVEAL_STEP_MS) + GAME_CONFIG.TV_REVEAL_FINISH_BUFFER_MS
            );
            displayReviewUntilTs = Date.now() + Math.max(minReviewMs, revealEstimateMs);
          }
        },
        onAnswerSubmitted: (playerId, roundId) => {
          console.log('📺 [Display Mode] Answer submitted:', playerId);
          import('./roundStore').then(({ useRoundStore }) => {
            const currentRound = useRoundStore.getState().currentRound;
            if (currentRound?.id !== roundId) return;
            useRoundStore.getState().addPlayerAnswer(playerId, true);
          });
        },
        onVotingStarted: (answers) => {
          console.log('📺 [Display Mode] Voting started with', answers.length, 'answers');
          import('./roundStore').then(({ useRoundStore }) => {
            useRoundStore.setState({
              roundStatus: 'voting',
              allAnswers: answers,
              timerActive: true,
            });
          });
        },
        onVoteSubmitted: (voterId, _answerId) => {
          console.log('📺 [Display Mode] Vote submitted:', voterId);
          // Display mode just observes
        },
        onRoundEnded: async (roundId: string) => {
          console.log('📺 [Display Mode] Round ended:', roundId);
          const currentGame = get().game;
          if (!currentGame) return;

          // Clear any existing timeout
          const existingTimeout = get().roundEndResetTimeout;
          if (existingTimeout) {
            clearTimeout(existingTimeout);
          }

          // Check if this was the last round
          if (currentGame.current_round >= currentGame.round_count) {
            console.log('🎉 Game complete! All rounds finished.');
            set({ roundEndResetTimeout: null });
          } else {
            console.log('➡️ Preparing for next round...');
            // Manual progression mode: keep completed phase visible until controller advances.
            set({ roundEndResetTimeout: null });
          }
        },
        onConnected: () => {
          set({ isConnected: true });
          // Start periodic sync for display mode (no player ID)
          const { game: g } = get();
          if (g) {
            SyncService.startSync(g.id, null, (result) => {
              if (result.success && result.state) {
                handleSyncResult(result.state, get, set);
              }
            });
          }
        },
        onDisconnected: () => {
          set({ isConnected: false });
        },
        onReconnected: async () => {
          // Force immediate sync for display mode
          const { game } = get();
          if (!game) return;

          console.log('📺 [Display Mode] Force syncing after reconnection...');
          const result = await SyncService.forceSyncNow(game.id, null);
          
          if (result.success && result.state) {
            await handleSyncResult(result.state, get, set);
            console.log('✅ Display mode state sync completed');
          } else {
            console.error('❌ Sync failed after reconnection:', result.error);
          }
        },
        onPresenceSync: (presences) => {
          console.log('📺 [Display Mode] Presence sync:', presences.length, 'players online');
          // In display mode, just track online players but don't update connection status
          // since display mode doesn't participate as a player
        },
        onPresenceJoin: (presence) => {
          console.log('📺 [Display Mode] Player joined (presence):', presence.nickname);
        },
        onPresenceLeave: async (presence) => {
          console.log('📺 [Display Mode] Player left (presence):', presence.nickname);
          const leftPlayerId = presence.player_id;
          const { game } = get();

          if (leftPlayerId && game?.phase_captain_id === leftPlayerId) {
            console.log('📺 [Display Mode] Captain left presence. Triggering failover...');
            await get().promoteNewCaptain(leftPlayerId);
          }
        },
      }
      // No player info for display mode - don't pass third parameter
      );

      // Save display mode session to localStorage
      saveGameSession({
        gameId: game.id,
        playerId: null, // No player in display mode
        isDisplayMode: true,
      });

      console.log('✅ Display mode game created:', { code: game.code, gameId: game.id });
    } catch (error: any) {
      console.error('❌ Failed to create display mode game:', error);
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  // Join existing game
  joinGame: async (code: string, playerName: string) => {
    // Disconnect from old game if player was in one
    const oldSession = getGameSession();
    if (oldSession && oldSession.playerId) {
      try {
        if (oldSession.gameId) {
          await GameService.leaveGameAsPlayer(oldSession.gameId, oldSession.playerId);
          console.log('🔌 Left old game with failover before joining new one');
        } else {
          await GameService.updatePlayerStatus(oldSession.playerId, 'disconnected');
          console.log('🔌 Disconnected from old game before joining new one');
        }
      } catch (err) {
        console.error('Failed to disconnect from old game:', err);
      }
    }

    // Clear any existing session before joining new game
    clearGameSession();

    set({ isLoading: true, error: null });
    try {
      const { game, player } = await GameService.joinGame(code, playerName);

      // Get all players
      const players = await GameService.getGamePlayers(game.id);

      // Check if this player is the phase captain
      const isPhaseCaptain = game.phase_captain_id === player.id;
      console.log('🎯 Join game - phase captain check:', { isPhaseCaptain, playerId: player.id, captainId: game.phase_captain_id });

      set({
        game,
        gameCode: game.code,
        currentPlayer: player,
        isPhaseCaptain,
        isDisplayMode: false,
        players,
        isLoading: false,
        rehydrationAttempted: true, // Fresh session - skip rehydrate guard
      });

      // Subscribe to realtime updates
      RealtimeService.subscribeToGame(game.id, {
        onGameUpdated: (updatedGame) => {
          console.log('📡 Game updated event received:', {
            currentRound: updatedGame.current_round,
            status: updatedGame.status,
            phaseCaptainId: updatedGame.phase_captain_id
          });
          const currentPlayer = get().currentPlayer;
          const isPhaseCaptain = currentPlayer?.id === updatedGame.phase_captain_id;
          console.log('🎯 Phase captain status:', { isPhaseCaptain, currentPlayerId: currentPlayer?.id, captainId: updatedGame.phase_captain_id });
          set({ game: updatedGame, isPhaseCaptain });

          // Clear session when game finishes (don't rehydrate finished games)
          if (updatedGame.status === 'finished') {
            console.log('🏁 Game finished, clearing session to prevent rehydration');
            clearGameSession();
          }
        },
        onPlayerJoined: (newPlayer) => {
          get().addPlayer(newPlayer);
        },
        onPlayerLeft: async (playerId) => {
          console.log('👋 Player left:', playerId);
          const { game } = get();

          // If the phase captain left, promote a new captain
          if (game?.phase_captain_id === playerId) {
            console.log('⚠️ Phase captain disconnected, promoting new captain...');
            await get().promoteNewCaptain(playerId);
          }

          get().removePlayer(playerId);
        },
        onGameStarted: (updatedGame) => {
          console.log('🎮 Game started event received (joinGame):', updatedGame);
          set({ game: updatedGame });
        },
        onRoundStarted: (round: GameRound, question: Question) => {
          console.log('🎲 Round started event received', {
            roundId: round.id,
            roundNumber: round.round_number,
            questionId: question.id,
            questionText: question.question_text,
            timerStartsAt: round.timer_starts_at
          });

          // Clear any pending round end reset timeout
          const currentTimeout = get().roundEndResetTimeout;
          if (currentTimeout) {
            console.log('🛑 Clearing pending round end reset timeout');
            clearTimeout(currentTimeout);
            set({ roundEndResetTimeout: null });
          }

          // Import roundStore dynamically to avoid circular dependency
          import('./roundStore').then(({ useRoundStore }) => {
            const currentState = useRoundStore.getState();

            // Only update if this is a NEW round (not already set)
            if (currentState.currentRound?.id === round.id) {
              console.log('⚠️ Ignoring duplicate round start event for round:', round.id);
              return;
            }

            // Calculate time remaining based on server timestamp
            const startTime = round.timer_starts_at ? new Date(round.timer_starts_at).getTime() : Date.now();
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const initialTimeRemaining = Math.max(0, round.timer_duration - elapsed);

            console.log('✅ Setting round state:', {
              roundId: round.id,
              roundNumber: round.round_number,
              questionId: question.id,
              questionText: question.question_text.substring(0, 50) + '...',
              timeRemaining: initialTimeRemaining
            });

            useRoundStore.setState({
              currentRound: round,
              question: question,
              roundNumber: round.round_number,
              roundStatus: 'answering',
              timeRemaining: initialTimeRemaining,
              timerActive: true,
              allAnswers: [],
              playerVotes: new Map(),
              playerAnswers: new Map(),
              myAnswer: null,
              hasSubmittedAnswer: false,
              myVote: null,
              hasSubmittedVote: false,
              totalRounds: get().game?.round_count || GAME_CONFIG.DEFAULT_ROUNDS,
              isLoading: false,
            });
          });
        },
        onRoundStatusChanged: async (roundId: string, status: string, roundData?: GameRound) => {
          console.log('📢 Round status changed:', { roundId, status });
          const { useRoundStore } = await import('./roundStore');
          const currentState = useRoundStore.getState();

          if (currentState.currentRound?.id === roundId) {
            console.log('✅ Updating roundStatus to:', status);

            // If transitioning to voting, fetch all answers and updated round data
            if (status === 'voting') {
              console.log('🗳️ Fetching answers for voting phase...');
              const { RoundService } = await import('../services/RoundService');
              try {
                const answers = await RoundService.getRoundAnswers(roundId);

                // Use round data from realtime payload if available, fall back to re-fetch
                let updatedRound = roundData?.timer_starts_at ? roundData : null;
                if (!updatedRound) {
                  const { getSupabase } = await import('../services/supabase');
                  const supabase = getSupabase();
                  const { data } = await supabase
                    .from('game_rounds')
                    .select('*')
                    .eq('id', roundId)
                    .single();
                  updatedRound = data;
                }

                // Calculate time remaining based on updated server timestamp
                const startTime = updatedRound?.timer_starts_at
                  ? new Date(updatedRound.timer_starts_at).getTime()
                  : Date.now();
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                const votingTimeRemaining = Math.max(0, (updatedRound?.timer_duration || GAME_CONFIG.VOTING_TIMER) - elapsed);

                console.log('📋 Fetched answers:', answers.length, 'Time remaining:', votingTimeRemaining);
                useRoundStore.setState({
                  currentRound: updatedRound || currentState.currentRound,
                  roundStatus: status as any,
                  allAnswers: answers,
                  timeRemaining: votingTimeRemaining,
                  timerActive: true,
                  playerVotes: new Map(),
                  myVote: null,
                  hasSubmittedVote: false
                });
              } catch (error) {
                console.error('❌ Failed to fetch answers:', error);
                useRoundStore.setState({
                  roundStatus: status as any,
                  timeRemaining: status === 'voting' ? GAME_CONFIG.VOTING_TIMER : 0,
                  timerActive: status === 'voting',
                });
              }
            } else {
              useRoundStore.setState({ roundStatus: status as any });
            }
          }
        },
        onAnswerSubmitted: (playerId: string, roundId: string) => {
          console.log('📝 Answer submitted by player:', playerId, 'for round:', roundId);
          import('./roundStore').then(({ useRoundStore }) => {
            const currentRound = useRoundStore.getState().currentRound;
            // Only process if this answer is for the current round
            if (currentRound?.id === roundId) {
              useRoundStore.getState().addPlayerAnswer(playerId, true);
            } else {
              console.log('⚠️ Ignoring answer for different round:', roundId, 'current:', currentRound?.id);
            }
          });
        },
        onVoteSubmitted: (playerId: string, roundId: string) => {
          console.log('🗳️ Vote submitted by player:', playerId, 'for round:', roundId);
          import('./roundStore').then(({ useRoundStore }) => {
            const currentRound = useRoundStore.getState().currentRound;
            // Only process if this vote is for the current round
            if (currentRound?.id === roundId) {
              useRoundStore.getState().addVote(playerId);
            } else {
              console.log('⚠️ Ignoring vote for different round:', roundId, 'current:', currentRound?.id);
            }
          });
        },
        onRoundEnded: async (roundId: string) => {
          console.log('🏁 Round ended:', roundId);
          const currentGame = get().game;
          if (!currentGame) return;

          // Clear any existing timeout
          const existingTimeout = get().roundEndResetTimeout;
          if (existingTimeout) {
            clearTimeout(existingTimeout);
          }

          // Check if this was the last round
          if (currentGame.current_round >= currentGame.round_count) {
            console.log('🎉 Game complete! All rounds finished.');
            set({ roundEndResetTimeout: null });
            // Game will be marked as finished by host
          } else {
            console.log('➡️ Preparing for next round...');
            // Manual progression mode: keep completed phase visible until controller advances.
            set({ roundEndResetTimeout: null });
          }
        },
        onConnected: () => {
          set({ isConnected: true });
          // Start periodic sync for safety net
          const { game: g, currentPlayer: cp } = get();
          if (g?.id) {
            SyncService.startSync(g.id, cp?.id || null, (result) => {
              if (result.success && result.state) {
                handleSyncResult(result.state, get, set);
              }
            });
          }
        },
        onDisconnected: () => {
          set({ isConnected: false });
        },
        onReconnected: async () => {
          // Force immediate sync to catch missed updates
          const { game } = get();
          if (!game?.id) return;

          console.log('🔄 Force syncing after reconnection...');
          const currentPlayer = get().currentPlayer;
          const result = await SyncService.forceSyncNow(game.id, currentPlayer?.id || null);
          
          if (result.success && result.state) {
            await handleSyncResult(result.state, get, set);
            console.log('✅ Full state sync completed after reconnection');
          } else {
            console.error('❌ Sync failed after reconnection:', result.error);
          }
        },
        onPresenceSync: (presences) => {
          console.log('👥 Presence sync:', presences.length, 'players online');
          // Update player connection status based on presence
          const onlinePlayerIds = new Set(presences.map(p => p.player_id));
          const players = get().players.map(p => ({
            ...p,
            connection_status: (onlinePlayerIds.has(p.id) ? 'connected' : 'disconnected') as PlayerConnectionStatus
          }));
          set({ players });
        },
        onPresenceJoin: (presence) => {
          console.log('👤 Player joined (presence):', presence.nickname);
        },
        onPresenceLeave: async (presence) => {
          console.log('👤 Player left (presence):', presence.nickname);
          const leftPlayerId = presence.player_id;
          const { game } = get();

          if (leftPlayerId && game?.phase_captain_id === leftPlayerId) {
            console.log('⚠️ Presence leave detected for current captain. Triggering failover...');
            await get().promoteNewCaptain(leftPlayerId);
          }
        },
      },
      // Pass player info for presence tracking
      {
        id: player.id,
        nickname: player.user_name,
      }
      );

      // If game is already playing, fetch current round data (mid-game join)
      if (game.status === 'playing' && game.current_round > 0) {
        console.log('🔄 Joined mid-game, fetching current round...');
        const { RoundService } = await import('../services/RoundService');
        try {
          const currentRound = await RoundService.getCurrentRound(game.id);
          if (currentRound) {
            console.log('📥 Fetched current round:', currentRound.id);
            // Fetch question
            const { getSupabase } = await import('../services/supabase');
            const supabase = getSupabase();
            const { data: question } = await supabase
              .from('questions')
              .select('*')
              .eq('id', currentRound.question_id)
              .single();

            if (question) {
              // Fetch answers if in voting phase
              let answers: PlayerAnswer[] = [];
              if (currentRound.status === 'voting') {
                answers = await RoundService.getRoundAnswers(currentRound.id);
              }

              // Calculate time remaining
              const startTime = currentRound.timer_starts_at
                ? new Date(currentRound.timer_starts_at).getTime()
                : Date.now();
              const elapsed = Math.floor((Date.now() - startTime) / 1000);
              const timeRemaining = Math.max(0, currentRound.timer_duration - elapsed);

              // Import and update roundStore
              const { useRoundStore } = await import('./roundStore');
              useRoundStore.setState({
                currentRound,
                question,
                roundNumber: currentRound.round_number,
                roundStatus: currentRound.status,
                timeRemaining,
                timerActive: timeRemaining > 0,
                allAnswers: answers,
                playerAnswers: new Map(),
                myAnswer: null,
                hasSubmittedAnswer: false,
                myVote: null,
                hasSubmittedVote: false,
                totalRounds: game.round_count,
                isLoading: false,
              });

              console.log('✅ Mid-game join complete, round loaded');
            }
          }
        } catch (err) {
          console.error('❌ Failed to fetch current round:', err);
        }
      }

      // Save session to localStorage for reconnection after refresh
      saveGameSession({
        gameId: game.id,
        gameCode: game.code,
        playerId: player.id,
        playerName: player.user_name,
        isPhaseCaptain,
        joinedAt: Date.now(),
      });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  // Rehydrate session after page refresh
  rehydrateSession: async (): Promise<boolean> => {
    console.log('[rehydrate] Attempting to restore session from storage...');

    const { useRoundStore } = await import('./roundStore');
    useRoundStore.getState().reset();

    const { getGameSession } = await import('../utils/sessionStorage');
    const session = getGameSession();

    if (!session) {
      console.log('[rehydrate] No saved session found');
      set({ rehydrationAttempted: true });
      return false;
    }

    set({ isLoading: true, error: null });

    const clearRehydratedState = (error: string | null = null) => {
      set({
        game: null,
        gameCode: null,
        players: [],
        currentPlayer: null,
        isPhaseCaptain: false,
        isDisplayMode: false,
        isConnected: false,
        isLoading: false,
        error,
        rehydrationAttempted: true,
      });
    };

    const restoreDisplayRoundState = async (gameId: string, totalRounds: number) => {
      const { RoundService } = await import('../services/RoundService');
      const currentRound = await RoundService.getCurrentRound(gameId);
      if (!currentRound) return;

      let question = currentRound.question;
      if (!question) {
        const { getSupabase } = await import('../services/supabase');
        const supabase = getSupabase();
        const { data: fetchedQuestion } = await supabase
          .from('questions')
          .select('*')
          .eq('id', currentRound.question_id)
          .maybeSingle();
        question = fetchedQuestion || undefined;
      }

      if (!question) return;

      const answers = currentRound.status === 'voting' || currentRound.status === 'completed'
        ? await RoundService.getRoundAnswers(currentRound.id)
        : [];

      const startTime = currentRound.timer_starts_at
        ? new Date(currentRound.timer_starts_at).getTime()
        : Date.now();
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const timeRemaining = Math.max(0, currentRound.timer_duration - elapsed);

      useRoundStore.setState({
        currentRound,
        question,
        roundNumber: currentRound.round_number,
        roundStatus: currentRound.status,
        timeRemaining,
        timerActive: currentRound.status !== 'completed' && timeRemaining > 0,
        allAnswers: answers,
        playerAnswers: new Map(),
        myAnswer: null,
        hasSubmittedAnswer: false,
        myVote: null,
        hasSubmittedVote: false,
        totalRounds,
        isLoading: false,
      });
    };

    try {
      console.log('[rehydrate] Found saved session:', session);

      const game = await GameService.getGame(session.gameId);
      if (!game) {
        console.log('[rehydrate] Game no longer exists');
        clearGameSession();
        clearRehydratedState();
        return false;
      }

      if (game.status === 'finished') {
        console.log('[rehydrate] Game is finished, clearing stale session');
        clearGameSession();
        clearRehydratedState();
        return false;
      }

      const players = await GameService.getGamePlayers(game.id);
      const isDisplaySession = session.isDisplayMode || !session.playerId;

      if (isDisplaySession) {
        set({
          game,
          gameCode: game.code,
          players,
          currentPlayer: null,
          isPhaseCaptain: false,
          isDisplayMode: true,
          isLoading: false,
          rehydrationAttempted: true,
        });

        let displayReviewUntilTs: number | null = null;

        RealtimeService.subscribeToGame(game.id, {
          onGameUpdated: (updatedGame) => {
            set({ game: updatedGame });

            if (updatedGame.status === 'finished') {
              console.log('[rehydrate] Display game finished; clearing session');
              clearGameSession();
            }
          },
          onPlayerJoined: (newPlayer) => {
            get().addPlayer(newPlayer);
          },
          onPlayerLeft: (playerId) => {
            get().removePlayer(playerId);
          },
          onGameStarted: (updatedGame) => {
            set({ game: updatedGame });
          },
          onRoundStarted: (round: GameRound, question: Question) => {
            import('./roundStore').then(({ useRoundStore }) => {
              const applyRoundUpdate = () => {
                const startTime = round.timer_starts_at ? new Date(round.timer_starts_at).getTime() : Date.now();
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                const initialTimeRemaining = Math.max(0, round.timer_duration - elapsed);

                useRoundStore.setState({
                  currentRound: round,
                  question,
                  roundNumber: round.round_number,
                  roundStatus: round.status,
                  timeRemaining: initialTimeRemaining,
                  timerActive: initialTimeRemaining > 0,
                  totalRounds: get().game?.round_count || 0,
                  allAnswers: [],
                  playerAnswers: new Map(),
                  myAnswer: null,
                  hasSubmittedAnswer: false,
                  myVote: null,
                  hasSubmittedVote: false,
                  isLoading: false,
                });

                displayReviewUntilTs = null;
              };

              const delayMs = displayReviewUntilTs ? Math.max(0, displayReviewUntilTs - Date.now()) : 0;
              if (delayMs > 0) {
                console.log('[rehydrate] Delaying display round transition:', delayMs, 'ms');
                setTimeout(applyRoundUpdate, delayMs);
                return;
              }

              applyRoundUpdate();
            });
          },
          onRoundStatusChanged: async (roundId: string, status: string, roundData?: GameRound) => {
            const { useRoundStore } = await import('./roundStore');
            const currentState = useRoundStore.getState();

            if (currentState.currentRound?.id !== roundId) return;

            if (status === 'completed') {
              const minReviewMs = GAME_CONFIG.RESULTS_DISPLAY_DURATION * 1000;
              const revealEstimateMs = Math.max(
                0,
                (currentState.allAnswers.length * GAME_CONFIG.TV_REVEAL_STEP_MS) + GAME_CONFIG.TV_REVEAL_FINISH_BUFFER_MS
              );
              displayReviewUntilTs = Date.now() + Math.max(minReviewMs, revealEstimateMs);
            }

            if (status === 'voting' || status === 'completed') {
              try {
                const { RoundService } = await import('../services/RoundService');
                const answers = await RoundService.getRoundAnswers(roundId);

                // Use round data from realtime payload if available, fall back to re-fetch
                let updatedRound = roundData?.timer_starts_at ? roundData : null;
                if (!updatedRound) {
                  const { getSupabase } = await import('../services/supabase');
                  const supabase = getSupabase();
                  const { data } = await supabase
                    .from('game_rounds')
                    .select('*')
                    .eq('id', roundId)
                    .single();
                  updatedRound = data;
                }

                const startTime = updatedRound?.timer_starts_at
                  ? new Date(updatedRound.timer_starts_at).getTime()
                  : Date.now();
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                const remaining = Math.max(0, (updatedRound?.timer_duration || currentState.currentRound?.timer_duration || GAME_CONFIG.VOTING_TIMER) - elapsed);

                useRoundStore.setState({
                  currentRound: updatedRound || currentState.currentRound,
                  roundStatus: status as any,
                  allAnswers: answers,
                  timeRemaining: remaining,
                  timerActive: status !== 'completed' && remaining > 0,
                });
              } catch (error) {
                console.error('[rehydrate] Failed to refresh display round status:', error);
                useRoundStore.setState({
                  roundStatus: status as any,
                  timeRemaining: status === 'voting' ? GAME_CONFIG.VOTING_TIMER : 0,
                  timerActive: status === 'voting',
                });
              }
            } else {
              useRoundStore.setState({ roundStatus: status as any });
            }
          },
          onConnected: () => {
            set({ isConnected: true });
            const { game: g } = get();
            if (g?.id) {
              SyncService.startSync(g.id, null, (result) => {
                if (result.success && result.state) {
                  handleSyncResult(result.state, get, set);
                }
              });
            }
          },
          onDisconnected: () => {
            set({ isConnected: false });
          },
          onReconnected: async () => {
            const { game } = get();
            if (!game?.id) return;

            const result = await SyncService.forceSyncNow(game.id, null);
            if (result.success && result.state) {
              await handleSyncResult(result.state, get, set);
            }
          },
        });

        if (game.status === 'playing' && game.current_round > 0) {
          try {
            await restoreDisplayRoundState(game.id, game.round_count);
          } catch (err) {
            console.error('[rehydrate] Failed to restore display round state:', err);
          }
        }

        console.log('[rehydrate] Display session restored successfully');
        return true;
      }

      const currentPlayer = players.find((p) => p.id === session.playerId);

      if (!currentPlayer) {
        console.log('[rehydrate] Player in session is no longer in this game');
        clearGameSession();
        clearRehydratedState();
        return false;
      }

      if (currentPlayer.connection_status === 'disconnected') {
        console.log('[rehydrate] Marking disconnected player as connected again');
        try {
          await GameService.updatePlayerStatus(currentPlayer.id, 'connected');
          currentPlayer.connection_status = 'connected';
        } catch (err) {
          console.error('[rehydrate] Failed to reconnect player:', err);
          clearGameSession();
          clearRehydratedState();
          return false;
        }
      }

      const isPhaseCaptain = game.phase_captain_id === currentPlayer.id;

      set({
        game,
        gameCode: game.code,
        currentPlayer,
        players,
        isPhaseCaptain,
        isDisplayMode: false,
        isLoading: false,
        rehydrationAttempted: true,
      });

      RealtimeService.subscribeToGame(game.id, {
        onGameUpdated: (updatedGame) => {
          const currentPlayer = get().currentPlayer;
          const isPhaseCaptain = currentPlayer?.id === updatedGame.phase_captain_id;
          set({ game: updatedGame, isPhaseCaptain });

          if (updatedGame.status === 'finished') {
            console.log('🏁 Game finished, clearing session to prevent rehydration');
            clearGameSession();
          }
        },
        onPlayerJoined: (newPlayer) => {
          get().addPlayer(newPlayer);
        },
        onPlayerLeft: async (playerId) => {
          const { game } = get();
          if (game?.phase_captain_id === playerId) {
            await get().promoteNewCaptain(playerId);
          }
          get().removePlayer(playerId);
        },
        onGameStarted: (updatedGame) => {
          set({ game: updatedGame });
        },
        onRoundStarted: (round: GameRound, question: Question) => {
          import('./roundStore').then(({ useRoundStore }) => {
            const currentState = useRoundStore.getState();
            if (currentState.currentRound?.id === round.id) return;

            const startTime = round.timer_starts_at ? new Date(round.timer_starts_at).getTime() : Date.now();
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const initialTimeRemaining = Math.max(0, round.timer_duration - elapsed);

            useRoundStore.setState({
              currentRound: round,
              question,
              roundNumber: round.round_number,
              roundStatus: round.status,
              timeRemaining: initialTimeRemaining,
              timerActive: initialTimeRemaining > 0,
              totalRounds: game.round_count,
              allAnswers: [],
              playerAnswers: new Map(),
              myAnswer: null,
              hasSubmittedAnswer: false,
              myVote: null,
              hasSubmittedVote: false,
              isLoading: false,
            });
          });
        },
        onRoundStatusChanged: async (roundId: string, status: string, roundData?: GameRound) => {
          const { useRoundStore } = await import('./roundStore');
          const currentState = useRoundStore.getState();

          if (currentState.currentRound?.id === roundId) {
            if (status === 'voting') {
              try {
                const { RoundService } = await import('../services/RoundService');
                const answers = await RoundService.getRoundAnswers(roundId);

                // Use round data from realtime payload if available, fall back to re-fetch
                let updatedRound = roundData?.timer_starts_at ? roundData : null;
                if (!updatedRound) {
                  const { getSupabase } = await import('../services/supabase');
                  const supabase = getSupabase();
                  const { data } = await supabase
                    .from('game_rounds')
                    .select('*')
                    .eq('id', roundId)
                    .single();
                  updatedRound = data;
                }

                const startTime = updatedRound?.timer_starts_at
                  ? new Date(updatedRound.timer_starts_at).getTime()
                  : Date.now();
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                const votingTimeRemaining = Math.max(0, (updatedRound?.timer_duration || GAME_CONFIG.VOTING_TIMER) - elapsed);

                useRoundStore.setState({
                  currentRound: updatedRound || currentState.currentRound,
                  roundStatus: status as any,
                  allAnswers: answers,
                  timeRemaining: votingTimeRemaining,
                  timerActive: votingTimeRemaining > 0,
                  playerVotes: new Map(),
                  myVote: null,
                  hasSubmittedVote: false,
                });
              } catch (error) {
                console.error('[rehydrate] Failed to fetch voting data:', error);
                useRoundStore.setState({
                  roundStatus: status as any,
                  timeRemaining: GAME_CONFIG.VOTING_TIMER,
                  timerActive: true,
                });
              }
            } else {
              useRoundStore.setState({ roundStatus: status as any });
            }
          }
        },
        onRoundEnded: async (_roundId: string) => {
          const currentGame = get().game;
          if (!currentGame) return;

          if (currentGame.current_round >= currentGame.round_count) {
            console.log('🎉 Game complete!');
          } else {
            // Manual progression mode: keep completed phase visible until controller advances.
            set({ roundEndResetTimeout: null });
          }
        },
        onAnswerSubmitted: (playerId: string, roundId: string) => {
          import('./roundStore').then(({ useRoundStore }) => {
            const currentRound = useRoundStore.getState().currentRound;
            if (currentRound?.id === roundId) {
              useRoundStore.getState().addPlayerAnswer(playerId, true);
            }
          });
        },
        onVoteSubmitted: (playerId: string, roundId: string) => {
          import('./roundStore').then(({ useRoundStore }) => {
            const currentRound = useRoundStore.getState().currentRound;
            if (currentRound?.id === roundId) {
              useRoundStore.getState().addVote(playerId);
            }
          });
        },
        onConnected: () => {
          set({ isConnected: true });
          const { game: g, currentPlayer: cp } = get();
          if (g?.id) {
            SyncService.startSync(g.id, cp?.id || null, (result) => {
              if (result.success && result.state) {
                handleSyncResult(result.state, get, set);
              }
            });
          }
        },
        onDisconnected: () => {
          set({ isConnected: false });
        },
        onReconnected: async () => {
          const { game } = get();
          if (!game?.id) return;

          console.log('🔄 Force syncing after reconnection...');
          const currentPlayer = get().currentPlayer;
          const result = await SyncService.forceSyncNow(game.id, currentPlayer?.id || null);

          if (result.success && result.state) {
            await handleSyncResult(result.state, get, set);
            console.log('✅ Full state sync completed after reconnection');
          } else {
            console.error('❌ Sync failed after reconnection:', result.error);
          }
        },
        onPresenceSync: (presences) => {
          console.log('👥 Presence sync:', presences.length, 'players online');
          const onlinePlayerIds = new Set(presences.map(p => p.player_id));
          const players = get().players.map(p => ({
            ...p,
            connection_status: (onlinePlayerIds.has(p.id) ? 'connected' : 'disconnected') as PlayerConnectionStatus
          }));
          set({ players });
        },
        onPresenceJoin: (presence) => {
          console.log('👤 Player joined (presence):', presence.nickname);
        },
        onPresenceLeave: async (presence) => {
          console.log('👤 Player left (presence):', presence.nickname);
          const leftPlayerId = presence.player_id;
          const { game } = get();

          if (leftPlayerId && game?.phase_captain_id === leftPlayerId) {
            console.log('⚠️ Presence leave detected for current captain. Triggering failover...');
            await get().promoteNewCaptain(leftPlayerId);
          }
        },
      },
      {
        id: currentPlayer.id,
        nickname: currentPlayer.user_name,
      }
      );

      if (game.status === 'playing' && game.current_round > 0) {
        console.log('🔄 Game in progress, fetching current round...');
        const { RoundService } = await import('../services/RoundService');

        try {
          const currentRound = await RoundService.getCurrentRound(game.id);
          if (currentRound) {
            const question = currentRound.question!;

            const startTime = currentRound.timer_starts_at
              ? new Date(currentRound.timer_starts_at).getTime()
              : Date.now();
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const timeRemaining = Math.max(0, currentRound.timer_duration - elapsed);

            const answers = currentRound.status === 'voting' || currentRound.status === 'completed'
              ? await RoundService.getRoundAnswers(currentRound.id)
              : [];

            import('./roundStore').then(({ useRoundStore }) => {
              useRoundStore.setState({
                currentRound,
                question,
                roundNumber: currentRound.round_number,
                roundStatus: currentRound.status,
                timeRemaining,
                timerActive: timeRemaining > 0,
                allAnswers: answers,
                playerAnswers: new Map(),
                myAnswer: null,
                hasSubmittedAnswer: false,
                myVote: null,
                hasSubmittedVote: false,
                totalRounds: game.round_count,
                isLoading: false,
              });
            });

            console.log('✅ Round state restored');
          }
        } catch (err) {
          console.error('❌ Failed to fetch current round:', err);
        }
      }

      console.log('✅ Session rehydrated successfully');
      return true;
    } catch (error: any) {
      console.error('[rehydrate] Failed to rehydrate session:', error);
      clearGameSession();
      clearRehydratedState(error?.message || 'Failed to rehydrate session');
      return false;
    }
  },

  // Start game (host only)
  startGame: async () => {
    const { game, currentPlayer, isDisplayMode } = get();
    if (!game) return;

    // Display mode can start without a player
    if (!isDisplayMode && !currentPlayer) return;

    set({ isLoading: true, error: null });
    try {
      if (isDisplayMode) {
        // Display mode: start without player verification
        await GameService.startGameFromDisplay(game.id);
      } else {
        // Normal mode: verify player is host
        await GameService.startGame(game.id, currentPlayer!.id);
      }
      set({ isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  // Leave game
  leaveGame: async () => {
    const { game, currentPlayer, isDisplayMode } = get();

    if (!game) {
      clearGameSession();
      get().reset();
      return;
    }

    const gameId = game.id;
    const playerId = currentPlayer?.id || null;
    const wasDisplayMode = isDisplayMode;

    // Clear local state immediately so user is fully out of the room.
    clearGameSession();
    get().reset();

    // Display mode leaving: end the game for everyone
    if (wasDisplayMode) {
      try {
        console.log('🔚 Display leaving - ending game for all players');
        await GameService.endGame(gameId);
      } catch (err) {
        console.error('Failed to end game when display left:', err);
      }
      return;
    }

    // Player leaving: atomic disconnect + captain failover on server
    if (playerId) {
      try {
        const leaveResult = await GameService.leaveGameAsPlayer(gameId, playerId);
        console.log('👋 Leave result:', leaveResult);
      } catch (err) {
        console.error('Failed to leave game with failover:', err);
        GameService.updatePlayerStatus(playerId, 'disconnected').catch(updateErr => {
          console.error('Fallback disconnect failed:', updateErr);
        });
      }
    }
  },

  // Set all players
  setPlayers: (players: Player[]) => {
    set({ players });
  },

  // Add player to list
  addPlayer: (player: Player) => {
    set((state) => ({
      players: [...state.players.filter((p) => p.id !== player.id), player],
    }));
  },

  // Remove player from list
  removePlayer: (playerId: string) => {
    set((state) => ({
      players: state.players.filter((p) => p.id !== playerId),
    }));
  },

  // Update player info
  updatePlayer: (player: Player) => {
    set((state) => ({
      players: state.players.map((p) => (p.id === player.id ? player : p)),
    }));
  },

  // Set error
  setError: (error: string | null) => {
    set({ error });
  },

  // Set loading
  setLoading: (loading: boolean) => {
    set({ isLoading: loading });
  },

  // Promote new phase captain when current captain disconnects (atomic operation)
  promoteNewCaptain: async (disconnectedPlayerId: string) => {
    const { game, currentPlayer } = get();
    if (!game) return;

    console.log('🔄 Attempting atomic phase captain promotion, disconnected player:', disconnectedPlayerId);

    try {
      // Use atomic RPC function to prevent race conditions
      const { getSupabase } = await import('../services/supabase');
      const supabase = getSupabase();

      const { data, error } = await supabase.rpc('promote_phase_captain', {
        p_game_id: game.id,
        p_disconnected_player_id: disconnectedPlayerId
      });

      if (error) {
        console.error('❌ Failed to promote new captain:', error);
        return;
      }

      if (!data || data.length === 0) {
        console.error('❌ No response from captain promotion');
        return;
      }

      const result = data[0];
      if (!result.success) {
        console.log('⚠️ Captain promotion not needed:', result.message);
        return;
      }

      console.log('👑 New phase captain promoted atomically:', {
        newCaptainId: result.new_captain_id,
        message: result.message
      });

      // Update local state (will also be updated via Realtime onGameUpdated)
      const isPhaseCaptain = currentPlayer?.id === result.new_captain_id;
      set({
        game: { ...game, phase_captain_id: result.new_captain_id },
        isPhaseCaptain
      });

      // Broadcast the captain change for immediate UI update
      if (RealtimeService) {
        await RealtimeService.broadcastEvent(game.id, 'captain_promoted', {
          new_captain_id: result.new_captain_id,
          old_captain_id: disconnectedPlayerId
        });
      }

      console.log('✅ Captain promotion complete:', {
        newCaptainId: result.new_captain_id,
        isPhaseCaptain
      });
    } catch (error) {
      console.error('❌ Error in captain promotion:', error);
    }
  },

  // Reset store
  reset: () => {
    // Clear any pending round end reset timeout
    const currentTimeout = get().roundEndResetTimeout;
    if (currentTimeout) {
      clearTimeout(currentTimeout);
    }

    // Stop all syncs and realtime subscriptions
    const currentGame = get().game;
    if (currentGame) {
      SyncService.stopSync(currentGame.id);
      RealtimeService.unsubscribeFully(currentGame.id);
    }

    set({
      game: null,
      gameCode: null,
      players: [],
      currentPlayer: null,
      isPhaseCaptain: false,
      isDisplayMode: false,
      isConnected: false,
      isLoading: false,
      error: null,
      roundEndResetTimeout: null,
      lastSyncTime: null,
    });
  },
}));


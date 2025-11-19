import { create } from 'zustand';
import { Game, Player, GameSettings, GameRound, Question } from '../types';
import { GameService, RealtimeService } from '../services';
import { saveGameSession, clearGameSession, getGameSession } from '../utils/sessionStorage';
import { GAME_CONFIG } from '../constants/game';

interface GameState {
  // Game data
  game: Game | null;
  gameCode: string | null;
  players: Player[];
  currentPlayer: Player | null;
  isHost: boolean;
  isPhaseCaptain: boolean; // Whether current player is responsible for phase transitions
  isDisplayMode: boolean; // TV display-only mode (no player participation)

  // Connection state
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  rehydrationAttempted: boolean; // Whether session rehydration has been attempted
  roundEndResetTimeout: NodeJS.Timeout | null; // Track timeout for round end reset

  // Actions
  createGame: (hostName: string, settings: GameSettings) => Promise<void>;
  createGameAsDisplay: (settings: GameSettings) => Promise<void>; // TV display mode
  joinGame: (code: string, playerName: string) => Promise<void>;
  rehydrateSession: () => Promise<boolean>; // Restore session after refresh
  startGame: () => Promise<void>;
  leaveGame: () => void;
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
  isHost: false,
  isPhaseCaptain: false,
  isDisplayMode: false,
  isConnected: false,
  isLoading: false,
  error: null,
  rehydrationAttempted: false,
  roundEndResetTimeout: null,

  // Create new game
  createGame: async (hostName: string, settings: GameSettings) => {
    // End old game if user was host and game is still active
    const oldSession = getGameSession();
    if (oldSession && oldSession.isHost) {
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
        isHost: true,
        isPhaseCaptain: true, // Host starts as phase captain
        players: [player],
        isLoading: false,
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
              playerAnswers: new Map(),
              myAnswer: null,
              hasSubmittedAnswer: false,
              allAnswers: [],
              totalRounds: get().game?.round_count || 4,
              isLoading: false,
            });
          });
        },
        onRoundStatusChanged: async (roundId: string, status: string) => {
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

                // Fetch updated round data to get new timer_starts_at
                const { getSupabase } = await import('../services/supabase');
                const supabase = getSupabase();
                const { data: updatedRound } = await supabase
                  .from('game_rounds')
                  .select('*')
                  .eq('id', roundId)
                  .single();

                // Calculate time remaining based on updated server timestamp
                const startTime = updatedRound?.timer_starts_at
                  ? new Date(updatedRound.timer_starts_at).getTime()
                  : Date.now();
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                const votingTimeRemaining = Math.max(0, (updatedRound?.timer_duration || 20) - elapsed);

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
                useRoundStore.setState({ roundStatus: status as any });
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
            const currentRoundNumber = currentGame.current_round;

            // Wait a moment to show scores, then clear for next round
            const timeoutId = setTimeout(() => {
              // Only reset if game hasn't advanced to next round yet
              const freshGame = get().game;
              if (freshGame && freshGame.current_round === currentRoundNumber) {
                console.log('🧹 Resetting round state after round', currentRoundNumber);
                import('./roundStore').then(({ useRoundStore }) => {
                  useRoundStore.getState().reset();
                });
                set({ roundEndResetTimeout: null });
              } else {
                console.log('⏭️ Round already advanced, skipping reset');
                set({ roundEndResetTimeout: null });
              }
            }, GAME_CONFIG.RESULTS_DISPLAY_DURATION * 1000); // Convert seconds to milliseconds

            set({ roundEndResetTimeout: timeoutId });
          }
        },
        onConnected: () => {
          set({ isConnected: true });
        },
        onDisconnected: () => {
          set({ isConnected: false });
        },
        onReconnected: async () => {
          // Refetch game state after reconnection to catch missed updates
          const { game } = get();
          if (!game) return;

          console.log('🔄 Refetching game state after reconnection...');
          const freshGame = await GameService.getGame(game.id);
          if (freshGame) {
            const currentPlayer = get().currentPlayer;
            const isPhaseCaptain = currentPlayer?.id === freshGame.phase_captain_id;
            set({ game: freshGame, isPhaseCaptain });
            console.log('✅ Game state refreshed:', { status: freshGame.status, currentRound: freshGame.current_round });

            // If game is playing, also refetch current round state
            if (freshGame.status === 'playing' && freshGame.current_round > 0) {
              console.log('🔄 Game is playing, refetching round state...');
              const { RoundService } = await import('../services/RoundService');
              try {
                const currentRound = await RoundService.getCurrentRound(freshGame.id);
                if (currentRound) {
                  const { useRoundStore } = await import('./roundStore');
                  const question = currentRound.question!;

                  // Calculate time remaining
                  const startTime = currentRound.timer_starts_at
                    ? new Date(currentRound.timer_starts_at).getTime()
                    : Date.now();
                  const elapsed = Math.floor((Date.now() - startTime) / 1000);
                  const timeRemaining = Math.max(0, currentRound.timer_duration - elapsed);

                  // Get answers if in voting phase
                  const answers = currentRound.status === 'voting' || currentRound.status === 'completed'
                    ? await RoundService.getRoundAnswers(currentRound.id)
                    : [];

                  useRoundStore.setState({
                    currentRound,
                    question,
                    roundNumber: currentRound.round_number,
                    roundStatus: currentRound.status,
                    timeRemaining,
                    timerActive: true,
                    allAnswers: answers,
                    totalRounds: freshGame.round_count,
                  });

                  console.log('✅ Round state refreshed:', { roundNumber: currentRound.round_number, status: currentRound.status });
                }
              } catch (error) {
                console.error('❌ Failed to refetch round state:', error);
              }
            }
          }
        },
      });

      // Save session to localStorage for reconnection after refresh
      saveGameSession({
        gameId: game.id,
        gameCode: game.code,
        playerId: player.id,
        playerName: player.user_name,
        isHost: true,
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
        isHost: false,
        isPhaseCaptain: false,
        isDisplayMode: true, // Flag for display-only mode
        players: [],
        isLoading: false,
      });

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
        onPlayerJoined: (newPlayer) => {
          console.log('📺 [Display Mode] Player joined:', newPlayer.user_name);
          get().addPlayer(newPlayer);
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
          // Display mode doesn't participate, just shows the round
          import('./roundStore').then(({ useRoundStore }) => {
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
              totalRounds: get().game?.round_count || 0,
              isLoading: false,
            });
          });
        },
        onAnswerSubmitted: (playerId, hasSubmitted) => {
          console.log('📺 [Display Mode] Answer submitted:', playerId);
          // Display mode just observes
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
        onVoteSubmitted: (voterId, answerId) => {
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
            const currentRoundNumber = currentGame.current_round;

            // Wait to show scores, then clear for next round
            const timeoutId = setTimeout(() => {
              const freshGame = get().game;
              if (freshGame && freshGame.current_round === currentRoundNumber) {
                console.log('🧹 Resetting round state after round', currentRoundNumber);
                import('./roundStore').then(({ useRoundStore }) => {
                  useRoundStore.getState().reset();
                });
                set({ roundEndResetTimeout: null });
              } else {
                console.log('⏭️ Round already advanced, skipping reset');
                set({ roundEndResetTimeout: null });
              }
            }, GAME_CONFIG.RESULTS_DISPLAY_DURATION * 1000);

            set({ roundEndResetTimeout: timeoutId });
          }
        },
        onConnected: () => {
          set({ isConnected: true });
        },
        onDisconnected: () => {
          set({ isConnected: false });
        },
        onReconnected: async () => {
          // Refetch game state after reconnection
          const { game } = get();
          if (!game) return;

          console.log('📺 [Display Mode] Refetching game state after reconnection...');
          const freshGame = await GameService.getGame(game.id);
          if (freshGame) {
            set({ game: freshGame });
            console.log('✅ Game state refreshed:', { status: freshGame.status, currentRound: freshGame.current_round });

            // If game is playing, also refetch current round state
            if (freshGame.status === 'playing' && freshGame.current_round > 0) {
              const { RoundService } = await import('../services/RoundService');
              try {
                const currentRound = await RoundService.getCurrentRound(freshGame.id);
                if (currentRound) {
                  const { useRoundStore } = await import('./roundStore');
                  const question = currentRound.question!;

                  const startTime = currentRound.timer_starts_at
                    ? new Date(currentRound.timer_starts_at).getTime()
                    : Date.now();
                  const elapsed = Math.floor((Date.now() - startTime) / 1000);
                  const timeRemaining = Math.max(0, currentRound.timer_duration - elapsed);

                  const answers = currentRound.status === 'voting' || currentRound.status === 'completed'
                    ? await RoundService.getRoundAnswers(currentRound.id)
                    : [];

                  useRoundStore.setState({
                    currentRound,
                    question,
                    roundNumber: currentRound.round_number,
                    roundStatus: currentRound.status,
                    timeRemaining,
                    timerActive: true,
                    allAnswers: answers,
                    totalRounds: freshGame.round_count,
                  });

                  console.log('✅ Round state refreshed');
                }
              } catch (error) {
                console.error('❌ Failed to refetch round state:', error);
              }
            }
          }
        },
      });

      // Save display mode session to localStorage
      saveGameSession({
        gameId: game.id,
        playerId: null, // No player in display mode
        isHost: false,
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
    if (oldSession) {
      try {
        // Mark player as disconnected in old game
        await GameService.updatePlayerStatus(oldSession.playerId, 'disconnected');
        console.log('🔌 Disconnected from old game before joining new one');
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
        isHost: false,
        isPhaseCaptain,
        players,
        isLoading: false,
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
              playerAnswers: new Map(),
              myAnswer: null,
              hasSubmittedAnswer: false,
              allAnswers: [],
              totalRounds: get().game?.round_count || 4,
              isLoading: false,
            });
          });
        },
        onRoundStatusChanged: async (roundId: string, status: string) => {
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

                // Fetch updated round data to get new timer_starts_at
                const { getSupabase } = await import('../services/supabase');
                const supabase = getSupabase();
                const { data: updatedRound } = await supabase
                  .from('game_rounds')
                  .select('*')
                  .eq('id', roundId)
                  .single();

                // Calculate time remaining based on updated server timestamp
                const startTime = updatedRound?.timer_starts_at
                  ? new Date(updatedRound.timer_starts_at).getTime()
                  : Date.now();
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                const votingTimeRemaining = Math.max(0, (updatedRound?.timer_duration || 20) - elapsed);

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
                useRoundStore.setState({ roundStatus: status as any });
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
            const currentRoundNumber = currentGame.current_round;

            // Wait a moment to show scores, then clear for next round
            const timeoutId = setTimeout(() => {
              // Only reset if game hasn't advanced to next round yet
              const freshGame = get().game;
              if (freshGame && freshGame.current_round === currentRoundNumber) {
                console.log('🧹 Resetting round state after round', currentRoundNumber);
                import('./roundStore').then(({ useRoundStore }) => {
                  useRoundStore.getState().reset();
                });
                set({ roundEndResetTimeout: null });
              } else {
                console.log('⏭️ Round already advanced, skipping reset');
                set({ roundEndResetTimeout: null });
              }
            }, GAME_CONFIG.RESULTS_DISPLAY_DURATION * 1000); // Convert seconds to milliseconds

            set({ roundEndResetTimeout: timeoutId });
          }
        },
        onConnected: () => {
          set({ isConnected: true });
        },
        onDisconnected: () => {
          set({ isConnected: false });
        },
        onReconnected: async () => {
          // Refetch game state after reconnection to catch missed updates
          const { game } = get();
          if (!game) return;

          console.log('🔄 Refetching game state after reconnection...');
          const freshGame = await GameService.getGame(game.id);
          if (freshGame) {
            const currentPlayer = get().currentPlayer;
            const isPhaseCaptain = currentPlayer?.id === freshGame.phase_captain_id;
            set({ game: freshGame, isPhaseCaptain });
            console.log('✅ Game state refreshed:', { status: freshGame.status, currentRound: freshGame.current_round });

            // If game is playing, also refetch current round state
            if (freshGame.status === 'playing' && freshGame.current_round > 0) {
              console.log('🔄 Game is playing, refetching round state...');
              const { RoundService } = await import('../services/RoundService');
              try {
                const currentRound = await RoundService.getCurrentRound(freshGame.id);
                if (currentRound) {
                  const { useRoundStore } = await import('./roundStore');
                  const question = currentRound.question!;

                  // Calculate time remaining
                  const startTime = currentRound.timer_starts_at
                    ? new Date(currentRound.timer_starts_at).getTime()
                    : Date.now();
                  const elapsed = Math.floor((Date.now() - startTime) / 1000);
                  const timeRemaining = Math.max(0, currentRound.timer_duration - elapsed);

                  // Get answers if in voting phase
                  const answers = currentRound.status === 'voting' || currentRound.status === 'completed'
                    ? await RoundService.getRoundAnswers(currentRound.id)
                    : [];

                  useRoundStore.setState({
                    currentRound,
                    question,
                    roundNumber: currentRound.round_number,
                    roundStatus: currentRound.status,
                    timeRemaining,
                    timerActive: true,
                    allAnswers: answers,
                    totalRounds: freshGame.round_count,
                  });

                  console.log('✅ Round state refreshed:', { roundNumber: currentRound.round_number, status: currentRound.status });
                }
              } catch (error) {
                console.error('❌ Failed to refetch round state:', error);
              }
            }
          }
        },
      });

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
              let answers = [];
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
        isHost: player.is_host,
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
    console.log('🔄 Attempting to rehydrate session from localStorage...');

    // Reset round store first to clear any stale state
    const { useRoundStore } = await import('./roundStore');
    useRoundStore.getState().reset();

    const { getGameSession } = await import('../utils/sessionStorage');
    const session = getGameSession();

    if (!session) {
      console.log('❌ No saved session found');
      set({ rehydrationAttempted: true });
      return false;
    }

    set({ isLoading: true, error: null });

    try {
      console.log('📂 Found saved session:', session);

      // Fetch game data
      const game = await GameService.getGame(session.gameId);
      if (!game) {
        console.log('❌ Game not found in database');
        clearGameSession();
        set({ isLoading: false, rehydrationAttempted: true });
        return false;
      }

      // Don't rehydrate finished games
      if (game.status === 'finished') {
        console.log('❌ Game is finished, clearing session');
        clearGameSession();
        set({ isLoading: false, rehydrationAttempted: true });
        return false;
      }

      // Fetch player data
      const players = await GameService.getGamePlayers(game.id);
      const currentPlayer = players.find(p => p.id === session.playerId);

      if (!currentPlayer) {
        console.log('❌ Player not found in game');
        clearGameSession();
        set({ isLoading: false, rehydrationAttempted: true });
        return false;
      }

      // Don't rehydrate if player is disconnected
      if (currentPlayer.connection_status === 'disconnected') {
        console.log('❌ Player is disconnected, clearing session');
        clearGameSession();
        set({ isLoading: false, rehydrationAttempted: true });
        return false;
      }

      // Check if player is still phase captain
      const isPhaseCaptain = game.phase_captain_id === currentPlayer.id;

      // Restore game state
      set({
        game,
        gameCode: game.code,
        currentPlayer,
        players,
        isHost: currentPlayer.is_host,
        isPhaseCaptain,
        isLoading: false,
        rehydrationAttempted: true,
      });

      // Resubscribe to realtime events (same callbacks as create/joinGame)
      RealtimeService.subscribeToGame(game.id, {
        onGameUpdated: (updatedGame) => {
          const currentPlayer = get().currentPlayer;
          const isPhaseCaptain = currentPlayer?.id === updatedGame.phase_captain_id;
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
        onRoundStatusChanged: (roundId, status) => {
          import('./roundStore').then(({ useRoundStore }) => {
            const currentRound = useRoundStore.getState().currentRound;
            if (currentRound?.id === roundId) {
              useRoundStore.setState({ roundStatus: status as any });
            }
          });
        },
        onRoundEnded: async (roundId: string) => {
          const currentGame = get().game;
          if (!currentGame) return;

          if (currentGame.current_round >= currentGame.round_count) {
            console.log('🎉 Game complete!');
          } else {
            setTimeout(() => {
              import('./roundStore').then(({ useRoundStore }) => {
                useRoundStore.getState().reset();
              });
            }, 3000);
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
        },
        onDisconnected: () => {
          set({ isConnected: false });
        },
        onReconnected: async () => {
          // Refetch game state after reconnection to catch missed updates
          const { game } = get();
          if (!game) return;

          console.log('🔄 Refetching game state after reconnection...');
          const freshGame = await GameService.getGame(game.id);
          if (freshGame) {
            const currentPlayer = get().currentPlayer;
            const isPhaseCaptain = currentPlayer?.id === freshGame.phase_captain_id;
            set({ game: freshGame, isPhaseCaptain });
            console.log('✅ Game state refreshed:', { status: freshGame.status, currentRound: freshGame.current_round });

            // If game is playing, also refetch current round state
            if (freshGame.status === 'playing' && freshGame.current_round > 0) {
              console.log('🔄 Game is playing, refetching round state...');
              const { RoundService } = await import('../services/RoundService');
              try {
                const currentRound = await RoundService.getCurrentRound(freshGame.id);
                if (currentRound) {
                  const { useRoundStore } = await import('./roundStore');
                  const question = currentRound.question!;

                  // Calculate time remaining
                  const startTime = currentRound.timer_starts_at
                    ? new Date(currentRound.timer_starts_at).getTime()
                    : Date.now();
                  const elapsed = Math.floor((Date.now() - startTime) / 1000);
                  const timeRemaining = Math.max(0, currentRound.timer_duration - elapsed);

                  // Get answers if in voting phase
                  const answers = currentRound.status === 'voting' || currentRound.status === 'completed'
                    ? await RoundService.getRoundAnswers(currentRound.id)
                    : [];

                  useRoundStore.setState({
                    currentRound,
                    question,
                    roundNumber: currentRound.round_number,
                    roundStatus: currentRound.status,
                    timeRemaining,
                    timerActive: true,
                    allAnswers: answers,
                    totalRounds: freshGame.round_count,
                  });

                  console.log('✅ Round state refreshed:', { roundNumber: currentRound.round_number, status: currentRound.status });
                }
              } catch (error) {
                console.error('❌ Failed to refetch round state:', error);
              }
            }
          }
        },
      });

      // If game is playing and there's an active round, restore round state
      if (game.status === 'playing' && game.current_round > 0) {
        console.log('🔄 Game in progress, fetching current round...');
        const { RoundService } = await import('../services/RoundService');

        try {
          const currentRound = await RoundService.getCurrentRound(game.id);
          if (currentRound) {
            const question = currentRound.question!;

            // Calculate time remaining
            const startTime = currentRound.timer_starts_at
              ? new Date(currentRound.timer_starts_at).getTime()
              : Date.now();
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const timeRemaining = Math.max(0, currentRound.timer_duration - elapsed);

            // Get answers if in voting phase
            const answers = currentRound.status === 'voting' || currentRound.status === 'completed'
              ? await RoundService.getRoundAnswers(currentRound.id)
              : [];

            // Restore round state
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
      console.error('❌ Failed to rehydrate session:', error);
      clearGameSession();
      set({ error: error.message, isLoading: false, rehydrationAttempted: true });
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
  leaveGame: () => {
    const { game, currentPlayer } = get();

    // Update player connection status to disconnected
    if (game && currentPlayer) {
      GameService.updatePlayerStatus(currentPlayer.id, 'disconnected').catch(err => {
        console.error('Failed to update player status:', err);
      });
    }

    // Unsubscribe from realtime
    if (game) {
      RealtimeService.unsubscribe(game.id);
    }

    // Clear localStorage session
    clearGameSession();

    // Reset store state
    get().reset();
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

  // Promote new phase captain when current captain disconnects
  promoteNewCaptain: async (disconnectedPlayerId: string) => {
    const { game, players, currentPlayer } = get();
    if (!game) return;

    console.log('🔄 Promoting new phase captain, disconnected player:', disconnectedPlayerId);

    // Find next available player (prefer host, then first remaining player)
    const remainingPlayers = players.filter(p => p.id !== disconnectedPlayerId);
    const newCaptain = remainingPlayers.find(p => p.is_host) || remainingPlayers[0];

    if (!newCaptain) {
      console.log('⚠️ No remaining players to promote');
      return;
    }

    console.log('👑 Promoting player to phase captain:', newCaptain.user_name, newCaptain.id);

    try {
      // Update database
      const { getSupabase } = await import('../services/supabase');
      const supabase = getSupabase();
      const { error } = await supabase
        .from('games')
        .update({ phase_captain_id: newCaptain.id })
        .eq('id', game.id);

      if (error) {
        console.error('❌ Failed to promote new captain:', error);
        return;
      }

      // Update local state (will also be updated via Realtime onGameUpdated)
      const isPhaseCaptain = currentPlayer?.id === newCaptain.id;
      set({
        game: { ...game, phase_captain_id: newCaptain.id },
        isPhaseCaptain
      });

      console.log('✅ New phase captain promoted:', { newCaptainId: newCaptain.id, isPhaseCaptain });
    } catch (error) {
      console.error('❌ Error promoting new captain:', error);
    }
  },

  // Reset store
  reset: () => {
    // Clear any pending round end reset timeout
    const currentTimeout = get().roundEndResetTimeout;
    if (currentTimeout) {
      clearTimeout(currentTimeout);
    }

    set({
      game: null,
      gameCode: null,
      players: [],
      currentPlayer: null,
      isHost: false,
      isPhaseCaptain: false,
      isDisplayMode: false,
      isConnected: false,
      isLoading: false,
      error: null,
      roundEndResetTimeout: null,
    });
  },
}));

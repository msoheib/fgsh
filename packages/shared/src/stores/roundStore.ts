import { create } from 'zustand';
import {
  GameRound,
  Question,
  PlayerAnswer,
  Vote,
  RoundStatus,
} from '../types';
import { RoundService } from '../services';

interface RoundState {
  // Round data
  currentRound: GameRound | null;
  question: Question | null;
  roundNumber: number;
  totalRounds: number;

  // Answers
  playerAnswers: Map<string, PlayerAnswer>;
  allAnswers: PlayerAnswer[];
  myAnswer: string | null;
  hasSubmittedAnswer: boolean;

  // Voting
  myVote: string | null;
  hasSubmittedVote: boolean;
  votes: Vote[];
  playerVotes: Map<string, Vote>;

  // Timer
  timeRemaining: number;
  timerActive: boolean;

  // Status
  roundStatus: RoundStatus;
  isLoading: boolean;

  // Actions
  startRound: (gameId: string, roundNum: number, totalRounds: number) => Promise<void>;
  submitAnswer: (playerId: string, answer: string) => Promise<void>;
  submitVote: (playerId: string, answerId: string) => Promise<void>;
  setTimeRemaining: (time: number) => void;
  setTimerActive: (active: boolean) => void;
  addPlayerAnswer: (playerId: string, hasSubmitted: boolean) => void;
  addVote: (voterId: string) => void;
  reset: () => void;
}

export const useRoundStore = create<RoundState>((set, get) => ({
  // Initial state
  currentRound: null,
  question: null,
  roundNumber: 0,
  totalRounds: 4,

  playerAnswers: new Map(),
  allAnswers: [],
  myAnswer: null,
  hasSubmittedAnswer: false,

  myVote: null,
  hasSubmittedVote: false,
  votes: [],
  playerVotes: new Map(),

  timeRemaining: 30,
  timerActive: false,

  roundStatus: 'pending',
  isLoading: false,

  // Start new round
  startRound: async (gameId: string, roundNum: number, totalRounds: number) => {
    set({ isLoading: true });
    try {
      const { round, question } = await RoundService.createRound(gameId, roundNum);
      console.log('🎲 Host: Round created', {
        roundId: round.id,
        roundNumber: round.round_number,
        questionId: question.id,
        questionText: question.question_text,
        timerStartsAt: round.timer_starts_at
      });

      // Calculate initial time remaining based on server timestamp
      const startTime = round.timer_starts_at ? new Date(round.timer_starts_at).getTime() : Date.now();
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const initialTimeRemaining = Math.max(0, round.timer_duration - elapsed);

      set({
        currentRound: round,
        question,
        roundNumber: roundNum,
        totalRounds,
        roundStatus: 'answering',
        timeRemaining: initialTimeRemaining,
        timerActive: true,
        isLoading: false,
        playerAnswers: new Map(),
        myAnswer: null,
        hasSubmittedAnswer: false,
        // Clear voting state for the new round
        allAnswers: [],
        playerVotes: new Map(),
        myVote: null,
        hasSubmittedVote: false,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  // Submit answer
  submitAnswer: async (playerId: string, answer: string) => {
    const { currentRound, question } = get();
    if (!currentRound || !question) return;

    set({ isLoading: true });
    try {
      await RoundService.submitAnswer(
        currentRound.id,
        playerId,
        answer,
        question.correct_answer
      );

      // Immediately add to playerAnswers Map
      const { addPlayerAnswer } = get();
      addPlayerAnswer(playerId, true);

      set({
        myAnswer: answer,
        hasSubmittedAnswer: true,
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  // NOTE: startVoting() and endRound() methods have been removed
  // Phase transitions are now handled entirely server-side via database triggers
  // See: supabase/migrations/add_server_side_phase_transitions.sql
  // - advance_round_if_ready() trigger runs after answer/vote submissions
  // - force_advance_round() RPC is called by phase captain when timer expires

  // Submit vote
  submitVote: async (playerId: string, answerId: string) => {
    const { currentRound } = get();
    if (!currentRound) return;

    set({ isLoading: true });
    try {
      await RoundService.submitVote(currentRound.id, playerId, answerId);

      // Immediately add to playerVotes Map
      const { addVote } = get();
      addVote(playerId);

      set({
        myVote: answerId,
        hasSubmittedVote: true,
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  // Set time remaining
  setTimeRemaining: (time: number) => {
    set({ timeRemaining: Math.max(0, time) });
  },

  // Set timer active
  setTimerActive: (active: boolean) => {
    set({ timerActive: active });
  },

  // Track player answer submission
  addPlayerAnswer: (playerId: string, hasSubmitted: boolean) => {
    console.log('📝 addPlayerAnswer called', { playerId, hasSubmitted });
    set((state) => {
      const updated = new Map(state.playerAnswers);
      if (hasSubmitted) {
        updated.set(playerId, {} as PlayerAnswer);
        console.log('✅ Player answer added to Map', { playerId, mapSize: updated.size });
      } else {
        updated.delete(playerId);
        console.log('❌ Player answer removed from Map', { playerId, mapSize: updated.size });
      }
      return { playerAnswers: updated };
    });
  },

  // Track vote submission
  addVote: (voterId: string) => {
    console.log('🗳️ addVote called', { voterId });
    set((state) => {
      const updated = new Map(state.playerVotes);
      updated.set(voterId, {} as Vote);
      console.log('✅ Vote added to Map', { voterId, mapSize: updated.size });
      return { playerVotes: updated };
    });
  },

  // Reset round
  reset: () => {
    set({
      currentRound: null,
      question: null,
      roundNumber: 0,
      playerAnswers: new Map(),
      allAnswers: [],
      myAnswer: null,
      hasSubmittedAnswer: false,
      myVote: null,
      hasSubmittedVote: false,
      votes: [],
      timeRemaining: 30,
      timerActive: false,
      roundStatus: 'pending',
      isLoading: false,
    });
  },
}));

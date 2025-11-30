// Core game types
export type GameStatus = 'waiting' | 'playing' | 'finished';
export type RoundStatus = 'pending' | 'answering' | 'voting' | 'completed';
export type PlayerConnectionStatus = 'connected' | 'disconnected';

export interface Game {
  id: string;
  code: string;
  host_id: string | null;
  auth_host_id: string | null; // Authenticated user who owns the game (for billing)
  phase_captain_id: string | null; // Player responsible for triggering phase transitions
  status: GameStatus;
  round_count: number;
  current_round: number;
  max_players: number;
  created_at: string;
  updated_at: string;
}

export interface Player {
  id: string;
  game_id: string;
  user_name: string;
  avatar_color: string;
  score: number;
  is_host: boolean;
  connection_status: PlayerConnectionStatus;
  joined_at: string;
}

export interface Question {
  id: string;
  question_text: string;
  correct_answer: string;
  category: string | null;
  difficulty: 'easy' | 'medium' | 'hard';
  language: 'ar' | 'en';
  created_at: string;
}

export interface GameRound {
  id: string;
  game_id: string;
  round_number: number;
  question_id: string;
  status: RoundStatus;
  required_players: number; // Fixed quorum captured at round start
  timer_starts_at: string | null;
  timer_duration: number;
  created_at: string;
  question?: Question;
}

export interface PlayerAnswer {
  id: string;
  round_id: string;
  player_id: string | null; // NULL for system-inserted correct answers
  answer_text: string;
  is_correct: boolean;
  submitted_at: string;
  player?: Player;
}

export interface Vote {
  id: string;
  round_id: string;
  voter_id: string;
  answer_id: string;
  points_earned: number;
  created_at: string;
}

// Game settings
export interface GameSettings {
  roundCount: number; // 4, 6, 8, 10
  maxPlayers: number; // 4-10
}

// Real-time events
export interface PlayerJoinedEvent {
  player: Player;
}

export interface PlayerLeftEvent {
  player_id: string;
}

export interface GameStartedEvent {
  game: Game;
  first_round: GameRound;
}

export interface RoundStartedEvent {
  round: GameRound;
  question: Question;
}

export interface AnswerSubmittedEvent {
  player_id: string;
  has_submitted: boolean;
}

export interface VotingStartedEvent {
  answers: PlayerAnswer[];
}

export interface RoundEndedEvent {
  correct_answer: string;
  votes: Vote[];
  updated_scores: { player_id: string; new_score: number }[];
}

export interface GameEndedEvent {
  final_scores: { player_id: string; score: number }[];
  winner: Player;
}

// Score calculation
export interface ScoreResult {
  player_id: string;
  points_earned: number;
  reason: 'correct_answer' | 'fooled_players' | 'perfect_fake' | 'round_winner';
}

export interface RoundResult {
  round_number: number;
  question: string;
  correct_answer: string;
  player_answers: {
    player_name: string;
    answer: string;
    votes_received: number;
    points_earned: number;
  }[];
  fooled_by: {
    fooler: string;
    fooled: string[];
  }[];
}

// Error types
export enum ErrorType {
  GAME_NOT_FOUND = 'اللعبة غير موجودة',
  GAME_FULL = 'اللعبة ممتلئة',
  ALREADY_STARTED = 'اللعبة بدأت بالفعل',
  CONNECTION_LOST = 'فقد الاتصال',
  INVALID_CODE = 'كود غير صحيح',
  DUPLICATE_NAME = 'الاسم مستخدم بالفعل',
  ANSWER_TIMEOUT = 'انتهى وقت الإجابة',
  VOTE_TIMEOUT = 'انتهى وقت التصويت',
  INVALID_INPUT = 'مدخلات غير صحيحة',
  UNAUTHORIZED = 'غير مصرح',
}

export class GameError extends Error {
  constructor(
    public type: ErrorType,
    message?: string
  ) {
    super(message || type);
    this.name = 'GameError';
  }
}

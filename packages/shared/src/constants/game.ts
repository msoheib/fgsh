// Game configuration constants
export const GAME_CONFIG = {
  // Game code settings
  CODE_LENGTH: 6,
  CODE_CHARACTERS: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',

  // Player limits
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 10,
  DEFAULT_MAX_PLAYERS: 10,

  // Round settings
  MIN_ROUNDS: 7,
  MAX_ROUNDS: 7,
  DEFAULT_ROUNDS: 7,
  ROUND_OPTIONS: [7],
  STAGE_QUESTION_COUNTS: [3, 3, 1],
  CATEGORY_SELECTION_TIMER: 20,
  CONFIRMATION_TIMER: 5,

  // Timer durations (seconds)
  ANSWER_TIMER: 60,
  VOTING_TIMER: 45,
  RESULTS_DISPLAY_DURATION: 30,
  // TV reveal pacing (milliseconds)
  TV_REVEAL_STEP_MS: 6500,
  TV_REVEAL_FINISH_BUFFER_MS: 8000,

  // Score points
  POINTS: {
    CORRECT_ANSWER: 1000,
    PER_FOOLED_PLAYER: 500,
    FALL_FOR_LIE_PENALTY: -500,
    PERFECT_FAKE_BONUS: 0,
    ROUND_WINNER_BONUS: 0,
  },

  // Connection settings
  RECONNECT_ATTEMPTS: 5,
  RECONNECT_DELAY: 1000, // ms
  RECONNECT_MAX_DELAY: 10000, // ms
  HEARTBEAT_INTERVAL: 5000, // ms
  CONNECTION_TIMEOUT: 15000, // ms

  // UI settings
  TOAST_DURATION: 3000, // ms
  ANIMATION_DURATION: 300, // ms
  CELEBRATION_DURATION: 2000, // ms

  // Validation
  MAX_PLAYER_NAME_LENGTH: 50,
  MIN_PLAYER_NAME_LENGTH: 2,
  MAX_ANSWER_LENGTH: 200,
  MIN_ANSWER_LENGTH: 1,
} as const;

// Arabic UI text
export const ARABIC_TEXT = {
  // Home screen
  HOME_TITLE: 'فقش',
  CREATE_GAME: 'إنشاء لعبة',
  JOIN_GAME: 'الانضمام للعبة',

  // Create game
  ENTER_YOUR_NAME: 'أدخل اسمك',
  WELCOME_MESSAGE: 'مرحباً بك في فقش',
  SELECT_ROUNDS: 'عدد الجولات',
  MAX_PLAYERS: 'الحد الأقصى للاعبين',
  LOAD_ROOM: 'تحميل غرفة',

  // Join game
  ENTER_CODE: 'أدخل الكود',
  BACK: 'العودة',
  JOIN: 'انضمام',

  // Lobby
  GAME_CODE: 'كود اللعبة',
  WAITING_FOR_PLAYERS: 'في انتظار اللاعبين',
  PLAYERS: 'لاعبين',
  COPY_CODE: 'انسخ الكود للأصدقاء',
  START_GAME: 'بدء اللعبة',
  HOST: 'المضيف',

  // Game phases
  QUESTION: 'السؤال',
  YOUR_ANSWER: 'إجابتك',
  SUBMIT: 'أرسل',
  VOTE_FOR_CORRECT: 'صوت للإجابة الصحيحة',
  VOTE: 'صوت',
  WAITING_FOR_VOTES: 'في انتظار الأصوات',
  CORRECT_ANSWER: 'الإجابة الصحيحة',
  ROUND_RESULTS: 'نتائج الجولة',
  NEXT_ROUND: 'الجولة التالية',

  // Final results
  WINNER: 'الفائز!',
  FINAL_RESULTS: 'النتائج النهائية',
  PLAY_AGAIN: 'لعب مرة أخرى',
  RETURN_HOME: 'العودة للرئيسية',

  // Scores
  POINTS: 'نقطة',
  YOUR_SCORE: 'نقاطك',
  LEADERBOARD: 'لوحة المتصدرين',

  // Status messages
  PLAYER_JOINED: 'انضم إلى اللعبة',
  PLAYER_LEFT: 'غادر اللعبة',
  WAITING_FOR_ANSWERS: 'في انتظار الإجابات',
  ALL_ANSWERED: 'الجميع أجاب!',
  TIME_UP: 'انتهى الوقت!',

  // Actions
  SUBMITTED: 'تم الإرسال',
  VOTED: 'تم التصويت',
  YOU_FOOLED: 'خدعت',
  YOU_WERE_FOOLED_BY: 'تم خداعك من قبل',
  NOBODY_FOOLED: 'لم يخدع أحد!',

  // Errors
  ERROR: 'خطأ',
  GAME_NOT_FOUND: 'اللعبة غير موجودة',
  GAME_FULL: 'اللعبة ممتلئة',
  ALREADY_STARTED: 'اللعبة بدأت بالفعل',
  CONNECTION_LOST: 'فقد الاتصال',
  INVALID_CODE: 'كود غير صحيح',
  DUPLICATE_NAME: 'الاسم مستخدم بالفعل',
  RECONNECTING: 'إعادة الاتصال...',
  ANSWER_TOO_SHORT: 'الإجابة قصيرة جداً',
  ANSWER_TOO_LONG: 'الإجابة طويلة جداً',
  NAME_TOO_SHORT: 'الاسم قصير جداً',
  NAME_TOO_LONG: 'الاسم طويل جداً',
} as const;

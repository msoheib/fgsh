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
  MIN_ROUNDS: 4,
  MAX_ROUNDS: 10,
  DEFAULT_ROUNDS: 4,
  ROUND_OPTIONS: [4, 6, 8, 10],

  // Timer durations (seconds)
  ANSWER_TIMER: 30,
  VOTING_TIMER: 20,
  RESULTS_DISPLAY_DURATION: 25,

  // Score points
  POINTS: {
    CORRECT_ANSWER: 500,
    PER_FOOLED_PLAYER: 500,
    PERFECT_FAKE_BONUS: 1000, // No one voted for your fake answer
    ROUND_WINNER_BONUS: 250,
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
  HOME_TITLE: 'ففش',
  CREATE_GAME: 'إنشاء لعبة',
  JOIN_GAME: 'الانضمام للعبة',

  // Create game
  ENTER_YOUR_NAME: 'أدخل اسمك',
  WELCOME_MESSAGE: 'مرحباً بك في ففش',
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

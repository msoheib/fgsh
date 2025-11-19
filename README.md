# Fakash (ففش) - Multiplayer Arabic Trivia Game

A real-time multiplayer party game inspired by Fibbage, where players answer trivia questions and try to fool others with fake answers. Built with React, React Native, and Supabase.

## 🎮 Game Overview

- **Players**: 2-10 players per game
- **Rounds**: 4-10 customizable rounds
- **Language**: Primary support for Arabic (RTL), with English support
- **Platforms**: Web, iOS, and Android

### How to Play

1. **Host creates a game** and receives a 6-character code
2. **Players join** using the code
3. **Each round**:
   - Question is displayed
   - Players submit fake answers (30 seconds)
   - All answers + correct answer are shown
   - Players vote for what they think is correct (20 seconds)
   - Points are awarded
4. **Final leaderboard** shows the winner

### Scoring System

- **500 points**: Voting for the correct answer
- **500 points**: For each player you fooled with your fake answer
- **1000 points**: Bonus if nobody voted for your fake answer
- **250 points**: Round winner bonus

## 🏗️ Project Structure

```
fakash/
├── packages/
│   ├── shared/           # Shared TypeScript code
│   │   ├── src/
│   │   │   ├── types/           # TypeScript interfaces
│   │   │   ├── constants/       # Theme, game config, Arabic text
│   │   │   ├── utils/           # Validation, scoring, avatars
│   │   │   ├── services/        # Game, Round, Scoring, Realtime
│   │   │   └── stores/          # Zustand state management
│   │   └── package.json
│   │
│   ├── web/              # React.js web app
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   ├── hooks/
│   │   │   └── styles/
│   │   └── package.json
│   │
│   └── mobile/           # React Native app
│       ├── src/
│       │   ├── components/
│       │   ├── screens/
│       │   └── navigation/
│       └── package.json
│
├── supabase/
│   ├── migrations/       # Database schema
│   └── seed.sql         # Sample questions (40+ Arabic questions)
│
├── package.json         # Root package.json
└── README.md
```

## 🚀 Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Supabase account
- (For mobile) Expo CLI

### Installation

1. **Clone and install dependencies**:
```bash
npm install
```

2. **Setup Supabase**:
   - Create a project at [supabase.com](https://supabase.com)
   - Run the migration: `supabase/migrations/20241021000001_initial_schema.sql`
   - Run the seed data: `supabase/seed.sql`
   - Get your `SUPABASE_URL` and `SUPABASE_ANON_KEY`

3. **Configure environment variables**:

**Web (.env.local in packages/web)**:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

**Mobile (.env in packages/mobile)**:
```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. **Run development servers**:

```bash
# Web app
npm run dev:web

# Mobile app
npm run dev:mobile
```

## 📦 What's Been Implemented

### ✅ Completed

#### Shared Package
- **Types**: Complete TypeScript interfaces for Game, Player, Round, Answer, Vote
- **Constants**:
  - Design system (purple gradient theme, glass morphism)
  - Game configuration (timers, points, limits)
  - Arabic UI text translations
- **Utils**:
  - Game code generation and validation
  - Player name and answer validation
  - Scoring algorithm (fooled players, perfect fake, round winner)
  - Avatar color assignment
- **Services**:
  - `GameService`: Create, join, start games
  - `RoundService`: Round management, answer/vote submission
  - `ScoringService`: Point calculation, leaderboard
  - `RealtimeService`: WebSocket subscriptions
- **Stores**:
  - `gameStore`: Game state, players, connection
  - `roundStore`: Round progress, answers, voting, timer

#### Database
- **6 tables**: games, players, questions, game_rounds, player_answers, votes
- **RLS policies**: Row-level security for all tables
- **Indexes**: Performance optimization
- **Seed data**: 40+ Arabic trivia questions across 7 categories

### 🚧 Next Steps (TODO)

#### Web Application (packages/web)

1. **Setup Vite + Tailwind**:
```bash
cd packages/web
```

Create `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`

2. **UI Components** (packages/web/src/components/):
   - `GlassCard.tsx` - Glassmorphism card container
   - `GradientButton.tsx` - Action buttons with gradients
   - `PlayerAvatar.tsx` - Colored player circles with initials
   - `Timer.tsx` - Circular countdown timer
   - `ArabicText.tsx` - RTL text component
   - `CodeInput.tsx` - 6-digit code entry
   - `LoadingSpinner.tsx` - Loading animation
   - `ErrorToast.tsx` - Error notifications

3. **Pages** (packages/web/src/pages/):
   - `Home.tsx` - Create/Join game buttons
   - `CreateGame.tsx` - Host setup screen
   - `JoinGame.tsx` - Enter code + name
   - `Lobby.tsx` - Waiting room with player list
   - `Question.tsx` - Display question
   - `Answer.tsx` - Answer input
   - `Voting.tsx` - Vote for answers
   - `Results.tsx` - Round results
   - `Leaderboard.tsx` - Final scores

4. **Styling**:
   - Import Cairo/Tajawal fonts
   - Configure RTL layout
   - Add animations (slideUp, celebrate, countUp)
   - Implement responsive breakpoints

#### Mobile Application (packages/mobile)

1. **Setup Expo + NativeWind**:
```bash
cd packages/mobile
```

2. **Navigation**:
   - Stack Navigator setup
   - Screen transitions
   - Deep linking (fakash://join/XXXXXX)

3. **Mobile-Specific**:
   - Haptic feedback on button press
   - Share API for game code
   - Keyboard avoiding views
   - App state handling

#### Integration & Testing

1. **Real-time Integration**:
   - Connect stores to Realtime subscriptions
   - Handle reconnection with exponential backoff
   - Optimistic UI updates

2. **Testing**:
   - Unit tests for scoring logic
   - Integration tests for game flow
   - E2E tests with Playwright

3. **Performance**:
   - Lazy load screens
   - Virtual scrolling for players
   - WebSocket message compression

## 🎨 Design System

### Colors
- **Primary**: Purple gradient (#667eea → #764ba2)
- **Secondary**: Cyan (#06b6d4)
- **Accent**: Pink (#ec4899)
- **Glass**: rgba(255, 255, 255, 0.1) with backdrop-blur

### Typography
- **Font**: Cairo (primary), Tajawal (secondary)
- **Direction**: RTL for Arabic
- **Weights**: Bold (700) for headers, Regular (400) for body

### Components
- **Buttons**: Rounded (24px), gradient backgrounds, hover scale
- **Cards**: Dark purple with glass morphism
- **Avatars**: Circular, 10 color variations

## 📊 Database Schema

### Games
- `id`, `code`, `host_id`, `status`, `round_count`, `current_round`, `max_players`

### Players
- `id`, `game_id`, `user_name`, `avatar_color`, `score`, `is_host`, `connection_status`

### Questions
- `id`, `question_text`, `correct_answer`, `category`, `difficulty`, `language`

### Game Rounds
- `id`, `game_id`, `round_number`, `question_id`, `status`, `timer_starts_at`

### Player Answers
- `id`, `round_id`, `player_id`, `answer_text`, `is_correct`

### Votes
- `id`, `round_id`, `voter_id`, `answer_id`, `points_earned`

## 🔐 Security

- Row Level Security (RLS) enabled on all tables
- No authentication required for MVP
- Game codes are random 6-character strings
- Vote validation prevents self-voting

## 🌍 Localization

### Arabic (Primary)
- Complete UI translations in ARABIC_TEXT constant
- RTL layout support
- 40+ Arabic trivia questions

### English (Secondary)
- 5 sample English questions included
- Easy to add more question sets

## 📱 Deployment

### Web (Vercel)
```bash
cd packages/web
npm run build
vercel deploy
```

### Mobile
- **iOS**: Build with EAS Build
- **Android**: Build APK/AAB with EAS Build

## 🤝 Contributing

This is an MVP implementation. Suggested improvements:

1. **Authentication**: Add user accounts with Supabase Auth
2. **Question Editor**: Admin panel to add questions
3. **Custom Games**: User-created question sets
4. **Achievements**: Badges and unlockables
5. **Spectator Mode**: Watch games in progress
6. **Voice Chat**: Integrate voice for more fun
7. **Replays**: Save and share funny rounds
8. **Internationalization**: More languages beyond Arabic/English

## 📄 License

MIT License - Feel free to use for your own projects!

## 🙏 Credits

- Inspired by Jackbox Games' Fibbage
- Built with React, Supabase, and Zustand
- Arabic question content curated for Middle Eastern audiences

---

**Built with ❤️ for the Arabic gaming community**

ففش - العب، خدع، اربح! 🎮✨

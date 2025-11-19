# Fakash Game - Complete Requirements & Implementation Guide

## 1. Database Schema (Supabase)

```sql
-- Games table
CREATE TABLE games (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code VARCHAR(6) UNIQUE NOT NULL,
  host_id UUID REFERENCES auth.users(id),
  status VARCHAR(20) DEFAULT 'waiting', -- waiting, playing, finished
  round_count INTEGER DEFAULT 4,
  current_round INTEGER DEFAULT 0,
  max_players INTEGER DEFAULT 10,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Players table
CREATE TABLE players (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  user_name VARCHAR(50) NOT NULL,
  avatar_color VARCHAR(7) DEFAULT '#7c3aed',
  score INTEGER DEFAULT 0,
  is_host BOOLEAN DEFAULT FALSE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(game_id, user_name)
);

-- Questions table
CREATE TABLE questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  question_text TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  category VARCHAR(50),
  difficulty VARCHAR(20),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Game rounds table
CREATE TABLE game_rounds (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  question_id UUID REFERENCES questions(id),
  status VARCHAR(20) DEFAULT 'pending', -- pending, answering, voting, completed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Player answers table
CREATE TABLE player_answers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  round_id UUID REFERENCES game_rounds(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  answer_text TEXT NOT NULL,
  is_correct BOOLEAN DEFAULT FALSE,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(round_id, player_id)
);

-- Votes table
CREATE TABLE votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  round_id UUID REFERENCES game_rounds(id) ON DELETE CASCADE,
  voter_id UUID REFERENCES players(id) ON DELETE CASCADE,
  answer_id UUID REFERENCES player_answers(id) ON DELETE CASCADE,
  points_earned INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(round_id, voter_id)
);

-- Enable Row Level Security
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX idx_games_code ON games(code);
CREATE INDEX idx_players_game_id ON players(game_id);
CREATE INDEX idx_game_rounds_game_id ON game_rounds(game_id);
```

## 2. Project Structure

```
fakash/
├── packages/
│   ├── web/                    # React.js web app
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── Game/
│   │   │   │   ├── Lobby/
│   │   │   │   ├── UI/
│   │   │   ├── hooks/
│   │   │   ├── pages/
│   │   │   ├── services/
│   │   │   ├── store/
│   │   │   ├── styles/
│   │   │   └── utils/
│   │   └── package.json
│   │
│   ├── mobile/                  # React Native app
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── screens/
│   │   │   ├── navigation/
│   │   │   ├── services/
│   │   │   ├── store/
│   │   │   └── utils/
│   │   └── package.json
│   │
│   └── shared/                  # Shared code
│       ├── types/
│       ├── constants/
│       ├── utils/
│       └── package.json
│
├── supabase/
│   ├── migrations/
│   ├── functions/
│   └── seed.sql
│
└── package.json                 # Root package.json
```

## 3. Design System Constants

```typescript
// packages/shared/constants/theme.ts
export const theme = {
  colors: {
    primary: '#7c3aed',      // Purple
    secondary: '#06b6d4',    // Cyan
    accent: '#ec4899',       // Pink
    background: {
      gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      dark: '#1a1a2e',
      card: 'rgba(255, 255, 255, 0.1)'
    },
    text: {
      primary: '#ffffff',
      secondary: '#e5e7eb',
      dark: '#1f2937'
    }
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48
  },
  borderRadius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    full: 9999
  }
};
```

## 4. Core API Services

```typescript
// packages/shared/services/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL!;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Game service
export class GameService {
  static async createGame(hostName: string, settings: GameSettings) {
    const code = this.generateGameCode();
    
    const { data: game, error } = await supabase
      .from('games')
      .insert({
        code,
        round_count: settings.roundCount,
        max_players: settings.maxPlayers
      })
      .select()
      .single();
      
    if (error) throw error;
    
    // Add host as first player
    const { data: player } = await supabase
      .from('players')
      .insert({
        game_id: game.id,
        user_name: hostName,
        is_host: true
      })
      .select()
      .single();
      
    return { game, player };
  }
  
  static generateGameCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
  
  static async joinGame(code: string, playerName: string) {
    // Get game
    const { data: game } = await supabase
      .from('games')
      .select('*')
      .eq('code', code)
      .eq('status', 'waiting')
      .single();
      
    if (!game) throw new Error('Game not found or already started');
    
    // Check player count
    const { count } = await supabase
      .from('players')
      .select('*', { count: 'exact', head: true })
      .eq('game_id', game.id);
      
    if (count >= game.max_players) {
      throw new Error('Game is full');
    }
    
    // Add player
    const { data: player } = await supabase
      .from('players')
      .insert({
        game_id: game.id,
        user_name: playerName
      })
      .select()
      .single();
      
    return { game, player };
  }
}

// Real-time subscriptions
export class RealtimeService {
  static subscribeToGame(gameId: string, callbacks: {
    onPlayerJoin?: (player: any) => void;
    onPlayerLeave?: (player: any) => void;
    onGameStart?: () => void;
    onRoundChange?: (round: any) => void;
    onAnswerSubmitted?: (answer: any) => void;
  }) {
    const channel = supabase.channel(`game:${gameId}`);
    
    // Listen to player changes
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'players',
        filter: `game_id=eq.${gameId}`
      },
      (payload) => callbacks.onPlayerJoin?.(payload.new)
    );
    
    // Listen to game status changes
    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'games',
        filter: `id=eq.${gameId}`
      },
      (payload) => {
        if (payload.new.status === 'playing') {
          callbacks.onGameStart?.();
        }
      }
    );
    
    channel.subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }
}
```

## 5. LLM Prompt for MVP Creation

```markdown
Create a complete Fibbage-style multiplayer trivia game with the following specifications:

TECH STACK:
- Frontend: React.js (TypeScript) for web, React Native for mobile
- Backend: Supabase (PostgreSQL database, Realtime for WebSockets, Auth)
- Styling: Tailwind CSS with purple gradient theme (#667eea to #764ba2)
- State: Zustand for global state management

CORE FEATURES:
1. Game lobby system with 6-character join codes
2. Real-time player joining/leaving via WebSockets
3. Host controls to start game and configure settings
4. Multiple rounds of questions (4-10)
5. Player limit (4-10 players)
6. Answer submission and voting system
7. Points calculation and live leaderboard
8. Arabic language support (RTL layout)

UI DESIGN:
- Purple gradient background (#667eea to #764ba2)
- Glass morphism effect on cards (backdrop-blur, semi-transparent white)
- Rounded buttons with hover effects
- Color scheme: Purple primary, Cyan secondary, Pink accent
- Font: Bold for headers, regular for body
- Mobile-first responsive design

GAME FLOW:
1. Host creates game → receives 6-character code
2. Players join using code → see waiting room
3. Host starts game → first question appears
4. Players submit answers → all answers displayed
5. Players vote on answers → points calculated
6. Show round results → next round
7. After all rounds → final leaderboard

DATABASE TABLES:
- games (id, code, host_id, status, round_count, current_round)
- players (id, game_id, user_name, score, is_host)
- questions (id, question_text, correct_answer)
- game_rounds (id, game_id, round_number, question_id)
- player_answers (id, round_id, player_id, answer_text)
- votes (id, round_id, voter_id, answer_id, points_earned)

REAL-TIME EVENTS:
- Player joined/left
- Game started
- Round started/ended
- Answer submitted
- Voting completed
- Scores updated

Create the complete implementation with:
1. Database migrations
2. API endpoints and real-time subscriptions
3. React components with TypeScript
4. Zustand store for state management
5. Responsive UI with Tailwind CSS
6. WebSocket handlers for real-time updates
7. Error handling and loading states
8. Arabic RTL support

The game should be production-ready with proper error handling, loading states, and smooth animations.
```

## 6. Environment Variables

```bash
# .env.local (Web)
REACT_APP_SUPABASE_URL=your_supabase_url
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
REACT_APP_API_URL=http://localhost:3000

# .env (React Native)
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
API_URL=http://localhost:3000
```

## 7. Package.json Dependencies

```json
{
  "name": "fakash-game",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "dev:web": "cd packages/web && npm run dev",
    "dev:mobile": "cd packages/mobile && npm run start",
    "build:web": "cd packages/web && npm run build",
    "build:mobile": "cd packages/mobile && npm run build"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "prettier": "^3.0.0",
    "eslint": "^8.0.0"
  }
}
```

### Web Dependencies
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.0.0",
    "@supabase/supabase-js": "^2.0.0",
    "zustand": "^4.0.0",
    "framer-motion": "^10.0.0",
    "react-hot-toast": "^2.0.0",
    "qrcode.react": "^3.0.0",
    "tailwindcss": "^3.0.0"
  }
}
```

### Mobile Dependencies
```json
{
  "dependencies": {
    "react-native": "0.72.0",
    "@react-navigation/native": "^6.0.0",
    "@react-navigation/stack": "^6.0.0",
    "@supabase/supabase-js": "^2.0.0",
    "zustand": "^4.0.0",
    "react-native-svg": "^13.0.0",
    "react-native-qrcode-svg": "^6.0.0",
    "nativewind": "^2.0.0"
  }
}
```

## 8. Key Implementation Files

### Game Store (Zustand)
```typescript
// packages/shared/store/gameStore.ts
import { create } from 'zustand';

interface GameState {
  gameCode: string | null;
  gameId: string | null;
  players: Player[];
  currentRound: number;
  totalRounds: number;
  gameStatus: 'waiting' | 'playing' | 'finished';
  isHost: boolean;
  
  // Actions
  setGame: (game: Game) => void;
  addPlayer: (player: Player) => void;
  removePlayer: (playerId: string) => void;
  updateGameStatus: (status: string) => void;
  nextRound: () => void;
  updateScores: (scores: Score[]) => void;
  reset: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  gameCode: null,
  gameId: null,
  players: [],
  currentRound: 0,
  totalRounds: 4,
  gameStatus: 'waiting',
  isHost: false,
  
  setGame: (game) => set({ 
    gameCode: game.code,
    gameId: game.id,
    totalRounds: game.round_count 
  }),
  
  addPlayer: (player) => set((state) => ({
    players: [...state.players, player]
  })),
  
  removePlayer: (playerId) => set((state) => ({
    players: state.players.filter(p => p.id !== playerId)
  })),
  
  updateGameStatus: (status) => set({ gameStatus: status }),
  
  nextRound: () => set((state) => ({
    currentRound: state.currentRound + 1
  })),
  
  updateScores: (scores) => set((state) => ({
    players: state.players.map(player => {
      const score = scores.find(s => s.playerId === player.id);
      return score ? { ...player, score: score.points } : player;
    })
  })),
  
  reset: () => set({
    gameCode: null,
    gameId: null,
    players: [],
    currentRound: 0,
    totalRounds: 4,
    gameStatus: 'waiting',
    isHost: false
  })
}));
```

## 9. Deployment Strategy

1. **Supabase Setup**
   - Create project at supabase.com
   - Run migrations
   - Set up Row Level Security policies
   - Configure realtime settings

2. **Web Deployment (Vercel)**
   ```bash
   cd packages/web
   npm run build
   vercel deploy
   ```

3. **Mobile Deployment**
   - iOS: Build with Xcode, deploy to App Store
   - Android: Build APK/AAB, deploy to Google Play

## 10. Testing Checklist

- [ ] Game creation with unique code
- [ ] Multiple players joining
- [ ] Real-time player list updates
- [ ] Game start functionality
- [ ] Question display and answer submission
- [ ] Voting system
- [ ] Score calculation
- [ ] Round transitions
- [ ] Final leaderboard
- [ ] Player disconnection handling
- [ ] Arabic RTL support
- [ ] Mobile responsive design
- [ ] WebSocket reconnection
- [ ] Error states and recovery
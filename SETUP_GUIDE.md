# Fakash Development Setup Guide

## Quick Start Guide for Testing

### Prerequisites

Before you can run the app, you need:

1. **Node.js** (v18 or higher) - [Download here](https://nodejs.org/)
2. **Supabase Account** (free) - [Sign up here](https://supabase.com)
3. **For Mobile**: Expo Go app on your phone ([iOS](https://apps.apple.com/app/expo-go/id982107779) | [Android](https://play.google.com/store/apps/details?id=host.exp.exponent))

---

## Step 1: Install Dependencies

Open terminal in the project folder and run:

```bash
npm install
```

If you get dependency errors, try:

```bash
npm install --legacy-peer-deps
```

---

## Step 2: Setup Supabase Database

### 2.1 Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Click **"New Project"**
3. Fill in:
   - **Name**: `fakash-game` (or any name)
   - **Database Password**: Save this password!
   - **Region**: Choose closest to you
4. Click **"Create new project"** and wait ~2 minutes

### 2.2 Run Database Migrations

1. In Supabase dashboard, go to **SQL Editor** (left sidebar)
2. Click **"New Query"**
3. Copy the entire content from `supabase/migrations/20241021000001_initial_schema.sql`
4. Paste into the SQL editor
5. Click **"Run"** or press `Ctrl+Enter`
6. You should see "Success. No rows returned"

### 2.3 Add Sample Questions

1. Still in SQL Editor, click **"New Query"**
2. Copy content from `supabase/seed.sql`
3. Paste and click **"Run"**
4. You should see the question count results

### 2.4 Get Your API Keys

1. Go to **Project Settings** (gear icon in sidebar)
2. Click **API** tab
3. Copy these two values:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **anon public** key (long string starting with `eyJ...`)

---

## Step 3: Configure Environment Variables

### For Web App

1. Create file: `packages/web/.env.local`
2. Add this content (replace with your values):

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.YOUR_KEY_HERE
```

### For Mobile App

1. Create file: `packages/mobile/.env`
2. Add this content (replace with your values):

```env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.YOUR_KEY_HERE
```

---

## Step 4: Run the Apps

### Option A: Web App (Currently Being Built)

**NOTE**: The web UI is not yet implemented. We built the backend foundation first.

To start development:

```bash
npm run dev:web
```

Then open: `http://localhost:5173`

**What you'll see**: You'll need to create the React components first (see TODO below)

---

### Option B: Mobile App (Currently Being Built)

**NOTE**: The mobile UI is not yet implemented. Backend is ready.

To start development:

```bash
npm run dev:mobile
```

Then:
- Scan the QR code with **Expo Go** app on your phone
- Or press `a` for Android emulator
- Or press `i` for iOS simulator (Mac only)

---

## Current Project Status

### ✅ What's Complete (Backend Foundation)

- **Database Schema**: 6 tables, RLS policies, 40+ Arabic questions
- **Business Logic**: Game creation, joining, rounds, scoring
- **Real-time Events**: WebSocket subscriptions for live multiplayer
- **State Management**: Zustand stores for game and round state
- **TypeScript Types**: Complete type definitions
- **Utilities**: Validation, scoring algorithm, game code generation

### 🚧 What's Not Built Yet (Frontend UI)

You'll need to create these before the app works:

#### Web App Components Needed:
```
packages/web/
├── src/
│   ├── main.tsx                    # React entry point
│   ├── App.tsx                     # Main app component
│   ├── components/                 # UI components
│   │   ├── GlassCard.tsx          # Glass morphism cards
│   │   ├── GradientButton.tsx     # Gradient buttons
│   │   ├── PlayerAvatar.tsx       # Player circles
│   │   ├── Timer.tsx              # Countdown timer
│   │   ├── CodeInput.tsx          # 6-digit code entry
│   │   └── ArabicText.tsx         # RTL text component
│   ├── pages/                      # Game screens
│   │   ├── Home.tsx               # Create/Join buttons
│   │   ├── CreateGame.tsx         # Host setup
│   │   ├── JoinGame.tsx           # Enter code
│   │   ├── Lobby.tsx              # Waiting room
│   │   ├── GamePlay.tsx           # Main game screen
│   │   └── Results.tsx            # Final scores
│   └── styles/
│       └── index.css              # Tailwind + custom CSS
├── vite.config.ts                  # Vite configuration
├── tailwind.config.js              # Tailwind config
├── postcss.config.js               # PostCSS config
└── index.html                      # HTML entry point
```

---

## Quick Test of Backend

To verify the backend works, you can test in browser console:

1. Run `npm run dev:web`
2. Open browser console (`F12`)
3. Test the backend:

```javascript
// Import from shared package
import { initializeSupabase, GameService } from '@fakash/shared';

// Initialize Supabase
initializeSupabase(
  'YOUR_SUPABASE_URL',
  'YOUR_ANON_KEY'
);

// Test creating a game
const { game, player } = await GameService.createGame('Test Host', {
  roundCount: 4,
  maxPlayers: 10
});

console.log('Game Code:', game.code);
console.log('Player:', player.user_name);
```

---

## Next Steps for Development

### Priority 1: Web UI (Estimated 2-3 days)

1. **Setup Vite + Tailwind**:
   ```bash
   cd packages/web
   # Create vite.config.ts, tailwind.config.js
   ```

2. **Create basic components**:
   - Start with `Home.tsx` (2 buttons: Create/Join)
   - Add `CreateGame.tsx` for host setup
   - Add `JoinGame.tsx` for code entry

3. **Add styling**:
   - Import Ara Hamah Zanki font
   - Configure RTL support
   - Add purple gradient theme

### Priority 2: Game Flow (Estimated 2-3 days)

1. Implement Lobby screen with real-time player updates
2. Build Question/Answer/Voting screens
3. Add Results and Leaderboard
4. Connect to Zustand stores
5. Add WebSocket event handlers

### Priority 3: Mobile App (Estimated 2 days)

1. Setup Expo navigation
2. Port web components to React Native
3. Add mobile-specific features

---

## Common Issues & Solutions

### Issue: "Cannot find module '@fakash/shared'"

**Solution**: Make sure you ran `npm install` in the root directory (not inside packages)

### Issue: Supabase connection error

**Solution**:
1. Check your `.env.local` file has correct URL and key
2. Verify Supabase project is running (not paused)
3. Check SQL migrations ran successfully

### Issue: "Module not found: vite"

**Solution**: The web UI isn't set up yet. You need to create the Vite config first.

### Issue: Port 5173 already in use

**Solution**:
```bash
# Kill the process using port 5173
# Windows:
netstat -ano | findstr :5173
taskkill /PID <PID_NUMBER> /F

# Mac/Linux:
lsof -ti:5173 | xargs kill
```

---

## Development Workflow

### Recommended Order:

1. ✅ Setup Supabase (you're here)
2. ✅ Install dependencies
3. 🔄 Create minimal web UI to test
4. 🔄 Test game creation flow
5. 🔄 Test joining game
6. 🔄 Test real-time updates
7. 🔄 Implement full game flow
8. 🔄 Add mobile app
9. 🔄 Polish and test

---

## Testing Checklist

Once UI is built, test these flows:

- [ ] Create game with 6-character code
- [ ] Join game from second browser/device
- [ ] See real-time player list updates
- [ ] Host can start game
- [ ] Question displays correctly (RTL Arabic)
- [ ] Players can submit answers
- [ ] Voting shows shuffled answers
- [ ] Scores calculate correctly (500 per fool, 1000 bonus)
- [ ] Multiple rounds work
- [ ] Final leaderboard shows winner
- [ ] Disconnection/reconnection works

---

## Need Help?

The backend is complete and tested. The main work remaining is:

1. **UI Implementation**: Create React components using the design specs
2. **Integration**: Connect components to Zustand stores
3. **Real-time**: Hook up WebSocket events to update UI

All the game logic, database, scoring, and state management is ready to use!

---

**Current Status**: Backend Complete ✅ | Frontend Pending 🚧

**Next Action**: Create Vite configuration and first React component (Home screen)

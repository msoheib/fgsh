# Fakash Mobile App

React Native mobile application for Fakash game (player experience).

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.local.example` to `.env.local` and add your Supabase credentials:
```bash
cp .env.local.example .env.local
```

3. Start the development server:
```bash
npm start
```

4. Run on platforms:
```bash
npm run android  # Android
npm run ios      # iOS (macOS only)
```

## Project Structure

```
packages/mobile/
├── src/
│   ├── components/     # Reusable UI components
│   │   ├── core/       # Theme components (GlassCard, GradientButton, etc.)
│   │   ├── game/       # Game-specific components (Timer, PlayerAvatar, etc.)
│   │   └── inputs/     # Input components (CodeInput, TextInput, etc.)
│   ├── screens/        # Screen components
│   │   ├── HomeScreen.tsx
│   │   ├── LobbyScreen.tsx
│   │   ├── GameScreen.tsx
│   │   └── ResultsScreen.tsx
│   ├── navigation/     # Navigation configuration
│   ├── utils/          # Utility functions
│   └── types/          # TypeScript types (extended from shared)
├── assets/             # Images, fonts, icons
├── App.tsx             # Root component
└── package.json
```

## Features

- ✅ RTL Arabic layout
- ✅ High-fidelity UI matching web app
- ✅ Real-time multiplayer sync via Supabase
- ✅ Deep linking for QR code join
- ✅ Session persistence with AsyncStorage
- ✅ Haptic feedback and native animations
- ✅ Glass morphism design system

## Tech Stack

- **Expo SDK 49** - React Native framework
- **React Navigation** - Screen navigation and deep linking
- **NativeWind** - Tailwind CSS for React Native
- **Zustand** - State management (from @fakash/shared)
- **Supabase** - Backend and real-time subscriptions
- **AsyncStorage** - Local data persistence

## Development

This app shares business logic with the web app via the `@fakash/shared` package. All game logic, services, and stores are reused.

Only the UI layer is reimplemented for React Native.

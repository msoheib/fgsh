# Fakash Mobile - Setup Guide

## Quick Start

The app is now ready to run with a placeholder screen!

```bash
cd packages/mobile
npm start
```

Then press:
- `a` for Android emulator
- `i` for iOS simulator (macOS only)
- Scan QR code with Expo Go app on your physical device

---

## Font Setup (Optional - for full UI)

To enable the complete UI with Arabic fonts:

### 1. Get the Fonts

**Ara Hamah Zanki (Primary):**
- Copy from: `packages/web/public/fonts/AraHamahZanki-1SemiBold.woff2`
- Convert WOFF2 to TTF using: https://everythingfonts.com/woff2-to-ttf
- Save as: `packages/mobile/assets/fonts/AraHamahZanki.ttf`

**Tajawal (Fallback):**
- Download from: https://fonts.google.com/specimen/Tajawal
- Extract and copy:
  - `Tajawal-Regular.ttf` → `packages/mobile/assets/fonts/`
  - `Tajawal-Bold.ttf` → `packages/mobile/assets/fonts/`

### 2. Enable Fonts in App.tsx

Uncomment lines 33-42 in `App.tsx`:

```typescript
const [fontsLoaded] = useFonts({
  'AraHamahZanki': require('./assets/fonts/AraHamahZanki.ttf'),
  'Tajawal-Regular': require('./assets/fonts/Tajawal-Regular.ttf'),
  'Tajawal-Bold': require('./assets/fonts/Tajawal-Bold.ttf'),
});

if (!fontsLoaded) {
  return null;
}
```

### 3. Restart Expo

```bash
npm start -- --clear
```

---

## Environment Variables

Copy and configure Supabase credentials:

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:
```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Get these values from `packages/web/.env.local`

---

## Troubleshooting

### "Metro bundler error"
```bash
npm start -- --clear
```

### "Module not found"
```bash
rm -rf node_modules
npm install
```

### "RTL not working"
Close and reopen the app after first launch

### "Fonts not loading"
1. Check that font files exist in `assets/fonts/`
2. Make sure file names match exactly
3. Restart with `--clear` flag

---

## Development Workflow

### Testing Components

You can test individual components by importing them in `App.tsx`:

```typescript
import { GlassCard, GradientButton, Logo } from './src/components';

function TestScreen() {
  return (
    <GradientBackground>
      <GlassCard>
        <Logo size="lg" />
        <GradientButton onPress={() => alert('Works!')} variant="cyan">
          Test Button
        </GradientButton>
      </GlassCard>
    </GradientBackground>
  );
}
```

### Hot Reload

Expo supports hot reloading - just save files and changes appear instantly!

### Debugging

- Shake device → "Debug Remote JS"
- Or press `j` in terminal → Opens Chrome DevTools

---

## Next Steps

Once fonts are set up, the next phases will add:

1. **Navigation** - Stack navigator with deep linking
2. **Screens** - Join, Lobby, Game, Results
3. **Real-time** - Zustand + Supabase subscriptions
4. **Polish** - Haptics, animations, keyboard handling

---

## Project Structure

```
packages/mobile/
├── src/
│   ├── components/       # ✅ 16 UI components ready
│   ├── theme/            # ✅ Colors, typography, spacing
│   ├── utils/            # ✅ AsyncStorage, Supabase client
│   ├── screens/          # 🚧 Coming in Phase 5
│   └── navigation/       # 🚧 Coming in Phase 4
├── assets/
│   └── fonts/            # ⚠️ Add fonts here
├── App.tsx               # ✅ Entry point with placeholder
└── package.json          # ✅ All dependencies installed
```

---

## Available Components (Phase 3 Complete)

### Core
- `GradientBackground` - Purple gradient container
- `GlassCard` - Glass morphism card
- `GradientButton` - Cyan/pink/purple variants
- `Logo` - Arabic branding
- `LoadingSpinner` - Activity indicator

### Inputs
- `CodeInput` - 6-digit game code entry
- `GlassTextInput` - RTL text input

### Game
- `PlayerAvatar` - Colored circle with initials
- `Timer` - Circular countdown
- `ConnectionStatus` - Real-time indicator

### Lists
- `PlayerListItem` - Player row
- `AnswerCard` - Voting phase card
- `LeaderboardRow` - Results with medals
- `QRDisplay` - QR code generator

All ready to use in your screens!

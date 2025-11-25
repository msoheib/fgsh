# Quick Start - Fakash Mobile

## ⚠️ Important: Use Native Commands (Not --web)

This is a **React Native** app for Android/iOS, not a web app.

### ✅ Correct Commands:

```bash
cd packages/mobile

# Start Expo (opens menu with options)
npx expo start

# Or directly run on platform:
npx expo start --android    # For Android
npx expo start --ios        # For iOS (macOS only)
```

### ❌ Don't Use:
```bash
npx expo start --web  # This won't work - it's not a web app!
```

---

## Testing Options

### Option 1: Expo Go App (Easiest)
1. Install "Expo Go" on your phone:
   - Android: [Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent)
   - iOS: [App Store](https://apps.apple.com/app/expo-go/id982107779)

2. Run in terminal:
   ```bash
   npx expo start
   ```

3. Scan the QR code with:
   - **Android**: Expo Go app
   - **iOS**: Camera app (it will open Expo Go)

### Option 2: Android Emulator
1. Install Android Studio
2. Create an AVD (Android Virtual Device)
3. Start the emulator
4. Run:
   ```bash
   npx expo start --android
   ```

### Option 3: iOS Simulator (macOS only)
1. Install Xcode
2. Run:
   ```bash
   npx expo start --ios
   ```

---

## Expected Output

When you run `npx expo start`, you'll see:

```
Starting project at C:\Users\Hopef\Desktop\Fgsh\packages\mobile

› Metro waiting on exp://192.168.x.x:8081
› Scan the QR code above with Expo Go (Android) or the Camera app (iOS)

› Press a │ open Android
› Press i │ open iOS simulator
› Press w │ open web

› Press r │ reload app
› Press m │ toggle menu
```

**Press `a` for Android or `i` for iOS** (don't press `w` - that's for web apps)

---

## Current App Status

✅ The app will show a purple screen with:
- "فقش 🎮" logo
- "Fakash Mobile App"
- "Coming Soon!"

This confirms everything is working!

---

## Troubleshooting

### "Cannot find module expo-font"
This happens if you try to use `--web`. Solution: Don't use `--web`, use `--android` or `--ios` instead.

### "Metro bundler error"
```bash
npx expo start --clear
```

### "No devices found"
- For Android: Make sure emulator is running
- For iOS: Xcode must be installed (macOS only)
- Or use Expo Go app on your physical device

### Port already in use
```bash
npx expo start --port 8082
```

---

## Next: Add Real Screens

Once the placeholder screen works, I'll implement the actual game screens:
- Join game (code entry)
- Lobby (player list)
- Game (answer, vote, results)
- Final results (leaderboard)

Let me know when you're ready to continue!

# Start Expo Web - Simple Instructions

## ✅ Run This in Your Terminal

```bash
cd packages/mobile
npx expo start --web
```

That's it! This will:
1. Start the Metro bundler
2. Automatically compile for web
3. Open your browser to http://localhost:19006

---

## 🎯 What You'll See

A purple screen with:
- **"فقش 🎮"** - Arabic logo
- **"Fakash Mobile App"**
- **"Coming Soon!"**

This confirms the app is working!

---

## 🔧 If You Get Port Errors

If port 19006 is in use:

### Option 1: Use a Different Port
```bash
npx expo start --web --port 19007
```

### Option 2: Kill the Process on Port 19006
**Windows:**
```bash
netstat -ano | findstr :19006
taskkill /PID <process_id> /F
```

**Mac/Linux:**
```bash
lsof -ti:19006 | xargs kill -9
```

---

## 📱 Want to Test on Your Phone?

Remove the `--web` flag:
```bash
npx expo start
```

Then:
1. Install "Expo Go" app on your phone
2. Scan the QR code that appears
3. See the app running on your device!

---

## 🚀 Ready for Real Screens?

Once this placeholder works, I'll implement:
- ✅ Join game screen (code + name entry)
- ✅ Lobby with real-time player list
- ✅ Game screens (answer, vote, results)
- ✅ Final leaderboard with medals

Let me know when you're ready to continue!

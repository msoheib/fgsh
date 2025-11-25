# Assets Directory

This directory contains static assets for the Fakash mobile app.

## Required Assets

### Icons & Splash Screens

1. **icon.png** (1024x1024px)
   - App icon for iOS and Android
   - Should match web app branding
   - Purple gradient background (#1a0933)

2. **adaptive-icon.png** (1024x1024px)
   - Android adaptive icon foreground
   - Centered logo on transparent background

3. **splash.png** (1284x2778px for iOS, safe area 1170x2532px)
   - Launch screen image
   - Background: #1a0933 (primary.start)
   - Centered logo

4. **favicon.png** (48x48px)
   - Web version icon

### Placeholder Files

For development, you can use solid color placeholders:
- Create 1024x1024 PNG with purple gradient
- Add white "فقش" text in center

### Font Files

See `/fonts/README.md` for font setup instructions.

## Directory Structure

```
assets/
├── icon.png              # App icon (1024x1024)
├── adaptive-icon.png     # Android adaptive icon
├── splash.png            # Splash screen (1284x2778)
├── favicon.png           # Web icon (48x48)
└── fonts/
    ├── AraHamahZanki.ttf
    ├── Tajawal-Regular.ttf
    └── Tajawal-Bold.ttf
```

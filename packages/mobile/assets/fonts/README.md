# Fonts Setup

This directory should contain the required font files for the Fakash mobile app.

## Required Fonts

### 1. Ara Hamah Zanki (Primary Arabic Font)
Copy from the web package: `/packages/web/public/fonts/AraHamahZanki.*`

Required files:
- `AraHamahZanki.ttf` or `AraHamahZanki.otf`

Convert WOFF/WOFF2 to TTF/OTF if needed using online tools like:
- https://everythingfonts.com/woff-to-ttf
- https://cloudconvert.com/woff-to-ttf

### 2. Tajawal (Fallback Arabic Font)
Download from Google Fonts:
https://fonts.google.com/specimen/Tajawal

Required files:
- `Tajawal-Regular.ttf`
- `Tajawal-Bold.ttf`

## Installation Steps

1. Place the font files in this directory
2. The fonts are already configured in `App.tsx` using `expo-font`
3. Run `npm start` to rebuild with new fonts

## Current Font Loading

```typescript
useFonts({
  'AraHamahZanki': require('./assets/fonts/AraHamahZanki.ttf'),
  'Tajawal-Regular': require('./assets/fonts/Tajawal-Regular.ttf'),
  'Tajawal-Bold': require('./assets/fonts/Tajawal-Bold.ttf'),
});
```

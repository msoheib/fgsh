# Ara Hamah Zanki Font Installation

## Where to Get the Font

The Ara Hamah Zanki font is a Kurdish/Arabic font. You can obtain it from:

1. **Kurdish Font Repositories**: Search for "Ara Hamah Zanki" font
2. **Font Download Sites**: Check Kurdish language font websites
3. **Direct Source**: Contact the font creator or check Kurdish typography resources

## Required Font Files

Place the following font files in this directory:

- `AraHamahZanki.woff2` (preferred - best compression)
- `AraHamahZanki.woff` (fallback for older browsers)

## Font Conversion (if needed)

If you only have TTF/OTF files:

1. Visit https://cloudconvert.com/ttf-to-woff2
2. Convert your TTF/OTF to WOFF2
3. Also convert to WOFF for browser compatibility
4. Place both files in this directory

## After Adding Files

Once you've added the font files, the CSS is already configured to use them automatically.
The app will switch from the Tajawal fallback to Ara Hamah Zanki.

## File Structure

```
public/fonts/
├── README.md (this file)
├── AraHamahZanki.woff2
└── AraHamahZanki.woff
```

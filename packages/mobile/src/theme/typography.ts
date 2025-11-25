/**
 * Typography System
 * Centralized text styles matching web theme
 */

import { TextStyle } from 'react-native';

export const FONT_FAMILY = {
  primary: 'AraHamahZanki',
  fallback: 'Tajawal-Regular',
  fallbackBold: 'Tajawal-Bold',
};

export const FONT_SIZES = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
  '5xl': 48,
  '6xl': 60,
};

export const FONT_WEIGHTS = {
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};

export const LINE_HEIGHTS = {
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.75,
  loose: 2,
};

// Preset text styles
export const TEXT_STYLES: Record<string, TextStyle> = {
  h1: {
    fontFamily: FONT_FAMILY.primary,
    fontSize: FONT_SIZES['6xl'],
    fontWeight: FONT_WEIGHTS.extrabold,
    lineHeight: FONT_SIZES['6xl'] * LINE_HEIGHTS.tight,
    color: '#ffffff',
  },
  h2: {
    fontFamily: FONT_FAMILY.primary,
    fontSize: FONT_SIZES['5xl'],
    fontWeight: FONT_WEIGHTS.bold,
    lineHeight: FONT_SIZES['5xl'] * LINE_HEIGHTS.tight,
    color: '#ffffff',
  },
  h3: {
    fontFamily: FONT_FAMILY.primary,
    fontSize: FONT_SIZES['4xl'],
    fontWeight: FONT_WEIGHTS.bold,
    lineHeight: FONT_SIZES['4xl'] * LINE_HEIGHTS.tight,
    color: '#ffffff',
  },
  h4: {
    fontFamily: FONT_FAMILY.primary,
    fontSize: FONT_SIZES['3xl'],
    fontWeight: FONT_WEIGHTS.semibold,
    lineHeight: FONT_SIZES['3xl'] * LINE_HEIGHTS.normal,
    color: '#ffffff',
  },
  body: {
    fontFamily: FONT_FAMILY.fallback,
    fontSize: FONT_SIZES.base,
    fontWeight: FONT_WEIGHTS.normal,
    lineHeight: FONT_SIZES.base * LINE_HEIGHTS.normal,
    color: '#e5e7eb', // text.secondary
  },
  bodyLarge: {
    fontFamily: FONT_FAMILY.fallback,
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.normal,
    lineHeight: FONT_SIZES.lg * LINE_HEIGHTS.normal,
    color: '#e5e7eb',
  },
  bodySmall: {
    fontFamily: FONT_FAMILY.fallback,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.normal,
    lineHeight: FONT_SIZES.sm * LINE_HEIGHTS.normal,
    color: '#9ca3af', // text.muted
  },
  button: {
    fontFamily: FONT_FAMILY.primary,
    fontSize: FONT_SIZES.base,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#ffffff',
  },
  caption: {
    fontFamily: FONT_FAMILY.fallback,
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.normal,
    lineHeight: FONT_SIZES.xs * LINE_HEIGHTS.normal,
    color: '#9ca3af',
  },
};

/**
 * Get text style with optional overrides
 */
export function getTextStyle(preset: keyof typeof TEXT_STYLES, overrides?: TextStyle): TextStyle {
  return {
    ...TEXT_STYLES[preset],
    ...overrides,
  };
}

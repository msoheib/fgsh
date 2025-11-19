// Design system constants based on Fakash brand guidelines
export const theme = {
  colors: {
    // Primary purple gradient
    primary: {
      start: '#667eea',
      end: '#764ba2',
      solid: '#7c3aed',
      light: '#a78bfa',
      dark: '#6d28d9',
    },
    // Secondary cyan
    secondary: {
      main: '#06b6d4',
      light: '#22d3ee',
      dark: '#0891b2',
    },
    // Accent pink
    accent: {
      main: '#ec4899',
      light: '#f472b6',
      dark: '#db2777',
    },
    // Backgrounds
    background: {
      gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      gradientAlt: 'linear-gradient(135deg, #7c3aed 0%, #764ba2 100%)',
      dark: '#1a1a2e',
      darkPurple: '#2d1b4e',
      card: 'rgba(255, 255, 255, 0.1)',
      cardHover: 'rgba(255, 255, 255, 0.15)',
    },
    // Text colors
    text: {
      primary: '#ffffff',
      secondary: '#e5e7eb',
      tertiary: '#d1d5db',
      dark: '#1f2937',
      muted: '#9ca3af',
    },
    // Status colors
    status: {
      success: '#10b981',
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#3b82f6',
    },
    // Leaderboard ranks
    ranks: {
      first: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)', // Gold
      second: 'linear-gradient(135deg, #e5e7eb 0%, #9ca3af 100%)', // Silver
      third: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', // Bronze
    },
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
    xxxl: 64,
  },

  borderRadius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
    full: 9999,
  },

  fontSize: {
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
  },

  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
  },

  shadows: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
    xxl: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    glow: '0 0 20px rgba(124, 58, 237, 0.5)',
    glowCyan: '0 0 20px rgba(6, 182, 212, 0.5)',
    glowPink: '0 0 20px rgba(236, 72, 153, 0.5)',
  },

  // Glass morphism effect
  glass: {
    background: 'rgba(255, 255, 255, 0.1)',
    border: 'rgba(255, 255, 255, 0.2)',
    backdropBlur: 'blur(10px)',
  },

  // Animation durations (ms)
  animation: {
    fast: 150,
    normal: 300,
    slow: 500,
  },

  // Breakpoints for responsive design
  breakpoints: {
    xs: 320,
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
    xxl: 1536,
  },

  // Z-index layers
  zIndex: {
    dropdown: 1000,
    sticky: 1100,
    modal: 1300,
    popover: 1400,
    tooltip: 1500,
  },
} as const;

// Arabic fonts
export const fonts = {
  arabic: {
    primary: '"Ara Hamah Zanki", sans-serif',
    secondary: '"Ara Hamah Zanki", sans-serif',
  },
  fallback: 'system-ui, -apple-system, sans-serif',
};

// Avatar colors for players - vibrant colors matching the theme
export const avatarColors = [
  '#a855f7', // Bright Purple/Magenta
  '#6366f1', // Indigo/Royal Blue
  '#14b8a6', // Bright Teal
  '#ec4899', // Bright Pink/Rose
  '#10b981', // Emerald Green
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#8b5cf6', // Violet
  '#06b6d4', // Cyan
  '#f97316', // Orange
];

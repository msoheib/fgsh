/**
 * Color System
 * Centralized color palette matching web theme
 */

export const COLORS = {
  // Primary (Purple)
  primary: {
    start: '#1a0933',
    end: '#0f0520',
    solid: '#7c3aed',
    light: '#a78bfa',
    dark: '#6d28d9',
  },

  // Secondary (Cyan)
  secondary: {
    main: '#06b6d4',
    light: '#22d3ee',
    dark: '#0891b2',
  },

  // Accent (Pink)
  accent: {
    main: '#ec4899',
    light: '#f472b6',
    dark: '#db2777',
  },

  // Background
  background: {
    dark: '#1a0933',
    darkPurple: '#0f0520',
    glass: 'rgba(255, 255, 255, 0.05)',
    glassBorder: 'rgba(124, 58, 237, 0.3)',
  },

  // Text
  text: {
    primary: '#ffffff',
    secondary: '#e5e7eb',
    muted: '#9ca3af',
    disabled: '#6b7280',
  },

  // Status
  status: {
    success: '#10b981',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6',
  },

  // Connection
  connection: {
    connected: '#10b981',
    disconnected: '#ef4444',
    connecting: '#f59e0b',
  },

  // Ranks
  rank: {
    gold: {
      start: '#ffd700',
      end: '#ffed4e',
    },
    silver: {
      start: '#c0c0c0',
      end: '#e8e8e8',
    },
    bronze: {
      start: '#cd7f32',
      end: '#e8a25c',
    },
  },

  // Avatar Colors (10 vibrant colors)
  avatars: [
    '#a855f7',
    '#6366f1',
    '#14b8a6',
    '#ec4899',
    '#10b981',
    '#f59e0b',
    '#ef4444',
    '#8b5cf6',
    '#06b6d4',
    '#f97316',
  ],
};

/**
 * Helper to get avatar color by index
 */
export function getAvatarColor(index: number): string {
  return COLORS.avatars[index % COLORS.avatars.length];
}

/**
 * Helper to get random avatar color
 */
export function getRandomAvatarColor(): string {
  return COLORS.avatars[Math.floor(Math.random() * COLORS.avatars.length)];
}

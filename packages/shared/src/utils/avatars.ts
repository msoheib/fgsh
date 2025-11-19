import { avatarColors } from '../constants/theme';

/**
 * Get a random avatar color
 */
export function getRandomAvatarColor(): string {
  return avatarColors[Math.floor(Math.random() * avatarColors.length)];
}

/**
 * Get avatar color based on player index (deterministic)
 */
export function getAvatarColorByIndex(index: number): string {
  return avatarColors[index % avatarColors.length];
}

/**
 * Get initials from player name (works with Arabic and English)
 */
export function getPlayerInitials(name: string): string {
  const words = name.trim().split(/\s+/);

  if (words.length === 0) {
    return '?';
  }

  if (words.length === 1) {
    return words[0].charAt(0).toUpperCase();
  }

  return (
    words[0].charAt(0).toUpperCase() + words[words.length - 1].charAt(0).toUpperCase()
  );
}

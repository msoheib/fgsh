import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Safe haptics wrapper that only runs on native platforms
 * Prevents console errors on web
 */
export const safeHaptics = {
  async impact(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Medium) {
    if (Platform.OS !== 'web') {
      await Haptics.impactAsync(style);
    }
  },

  async notification(type: Haptics.NotificationFeedbackType) {
    if (Platform.OS !== 'web') {
      await Haptics.notificationAsync(type);
    }
  },

  async selection() {
    if (Platform.OS !== 'web') {
      await Haptics.selectionAsync();
    }
  },
};

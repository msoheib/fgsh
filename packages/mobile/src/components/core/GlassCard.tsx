/**
 * GlassCard Component
 * Glass morphism card matching web .card-glass
 */

import React from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  intensity?: number;
  tint?: 'light' | 'dark' | 'default';
}

export function GlassCard({
  children,
  style,
  intensity = 20,
  tint = 'dark'
}: GlassCardProps) {
  return (
    <View style={[styles.container, style]}>
      <BlurView
        intensity={intensity}
        tint={tint}
        style={styles.blur}
      >
        <View style={styles.content}>
          {children}
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.3)', // primary.solid with opacity
    backgroundColor: 'rgba(255, 255, 255, 0.05)', // Subtle white tint
    shadowColor: '#7c3aed', // primary.solid
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8, // Android shadow
  },
  blur: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 16,
  },
});

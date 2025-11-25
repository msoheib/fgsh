/**
 * GradientBackground Component
 * Purple gradient background matching web bg-gradient-primary
 */

import React from 'react';
import { ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';

interface GradientBackgroundProps {
  children: React.ReactNode;
  style?: ViewStyle;
  useSafeArea?: boolean;
}

const GRADIENT_COLORS = ['#1a0933', '#0f0520']; // primary.start → primary.end

export function GradientBackground({
  children,
  style,
  useSafeArea = true
}: GradientBackgroundProps) {
  const Container = useSafeArea ? SafeAreaView : React.Fragment;
  const containerProps = useSafeArea ? { style: { flex: 1 }, edges: ['top', 'bottom'] as const } : {};

  return (
    <LinearGradient
      colors={GRADIENT_COLORS}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={[{ flex: 1 }, style]}
    >
      <Container {...containerProps}>
        {children}
      </Container>
    </LinearGradient>
  );
}

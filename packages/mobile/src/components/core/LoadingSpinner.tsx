/**
 * LoadingSpinner Component
 * Loading indicator matching web spinner
 */

import React from 'react';
import { ActivityIndicator, View, StyleSheet, ViewStyle } from 'react-native';

interface LoadingSpinnerProps {
  size?: 'small' | 'large';
  color?: string;
  style?: ViewStyle;
}

export function LoadingSpinner({
  size = 'large',
  color = '#06b6d4', // secondary.main (cyan)
  style
}: LoadingSpinnerProps) {
  return (
    <View style={[styles.container, style]}>
      <ActivityIndicator size={size} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
});

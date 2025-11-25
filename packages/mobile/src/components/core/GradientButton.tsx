/**
 * GradientButton Component
 * Gradient buttons matching web .btn-gradient, .btn-cyan, .btn-pink, .btn-purple
 */

import React from 'react';
import {
  TouchableOpacity,
  Text,
  ViewStyle,
  TextStyle,
  StyleSheet,
  ActivityIndicator
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface GradientButtonProps {
  children: React.ReactNode;
  onPress: () => void;
  variant?: 'cyan' | 'pink' | 'purple' | 'gradient';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  size?: 'sm' | 'md' | 'lg';
}

const VARIANT_COLORS = {
  cyan: ['#06b6d4', '#22d3ee'], // secondary.main → secondary.light
  pink: ['#ec4899', '#f472b6'], // accent.main → accent.light
  purple: ['#7c3aed', '#a78bfa'], // primary.solid → primary.light
  gradient: ['#06b6d4', '#7c3aed', '#ec4899'], // Multi-color gradient
};

const SIZE_STYLES = {
  sm: { paddingVertical: 8, paddingHorizontal: 16, fontSize: 14 },
  md: { paddingVertical: 12, paddingHorizontal: 24, fontSize: 16 },
  lg: { paddingVertical: 16, paddingHorizontal: 32, fontSize: 18 },
};

export function GradientButton({
  children,
  onPress,
  variant = 'cyan',
  disabled = false,
  loading = false,
  style,
  textStyle,
  size = 'md',
}: GradientButtonProps) {
  const colors = VARIANT_COLORS[variant];
  const sizeStyle = SIZE_STYLES[size];

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[styles.container, style]}
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[
          styles.gradient,
          {
            paddingVertical: sizeStyle.paddingVertical,
            paddingHorizontal: sizeStyle.paddingHorizontal
          },
          disabled && styles.disabled
        ]}
      >
        {loading ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={[
            styles.text,
            { fontSize: sizeStyle.fontSize },
            textStyle
          ]}>
            {children}
          </Text>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  gradient: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#ffffff',
    fontWeight: '700',
    textAlign: 'center',
    fontFamily: 'AraHamahZanki',
  },
  disabled: {
    opacity: 0.5,
  },
});

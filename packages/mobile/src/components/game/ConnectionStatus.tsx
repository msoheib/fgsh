/**
 * ConnectionStatus Component
 * Real-time connection indicator
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { COLORS, BORDER_RADIUS, SPACING, TEXT_STYLES } from '../../theme';

interface ConnectionStatusProps {
  isConnected: boolean;
  style?: ViewStyle;
}

export function ConnectionStatus({ isConnected, style }: ConnectionStatusProps) {
  return (
    <View style={[styles.container, style]}>
      <View
        style={[
          styles.dot,
          {
            backgroundColor: isConnected
              ? COLORS.connection.connected
              : COLORS.connection.disconnected,
          },
        ]}
      />
      <Text style={styles.text}>
        {isConnected ? 'متصل' : 'غير متصل'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row-reverse', // RTL
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.background.glass,
    gap: SPACING.xs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: BORDER_RADIUS.full,
  },
  text: {
    ...TEXT_STYLES.caption,
    color: COLORS.text.secondary,
  },
});

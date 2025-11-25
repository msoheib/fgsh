/**
 * QRDisplay Component
 * QR code display for game joining
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { COLORS, SPACING, BORDER_RADIUS, TEXT_STYLES } from '../../theme';

interface QRDisplayProps {
  value: string;
  size?: number;
  label?: string;
  style?: ViewStyle;
}

export function QRDisplay({
  value,
  size = 200,
  label,
  style,
}: QRDisplayProps) {
  return (
    <View style={[styles.container, style]}>
      {label && (
        <Text style={styles.label}>{label}</Text>
      )}

      <View style={styles.qrContainer}>
        <QRCode
          value={value}
          size={size}
          color="#1a0933" // Dark purple for QR
          backgroundColor="#ffffff"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: SPACING.md,
  },
  label: {
    ...TEXT_STYLES.body,
    color: COLORS.text.secondary,
    textAlign: 'center',
  },
  qrContainer: {
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
});

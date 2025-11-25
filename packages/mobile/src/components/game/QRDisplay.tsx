/**
 * QRDisplay Component
 * Displays a QR code for game join links
 */

import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

interface QRDisplayProps {
  value: string;
  size?: number;
  style?: ViewStyle;
}

export function QRDisplay({
  value,
  size = 200,
  style
}: QRDisplayProps) {
  return (
    <View style={[styles.container, { width: size, height: size }, style]}>
      <QRCode
        value={value}
        size={size}
        color="#1a0933"
        backgroundColor="#ffffff"
        quietZone={8}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    padding: 8,
  },
});

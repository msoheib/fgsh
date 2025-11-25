/**
 * Logo Component
 * Game logo/branding using PNG asset
 */

import React from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';

// Import logo PNG from assets
const logo = require('../../../assets/logo.png');

type LogoSize = 'sm' | 'md' | 'lg';

const SIZE_MAP: Record<LogoSize, { width: number; height: number }> = {
  sm: { width: 90, height: 28 },
  md: { width: 120, height: 38 },
  lg: { width: 160, height: 50 },
};

interface LogoProps {
  size?: LogoSize;
  style?: StyleProp<ImageStyle>;
}

export function Logo({ size = 'md', style }: LogoProps) {
  const { width, height } = SIZE_MAP[size];

  return (
    <Image
      source={logo}
      style={[{ width, height, resizeMode: 'contain' }, style]}
      accessible
      accessibilityLabel="Fakash logo"
    />
  );
}

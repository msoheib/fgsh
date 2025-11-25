/**
 * PlayerAvatar Component
 * Colored circle avatar with initials and host badge
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { getPlayerInitials } from '@fakash/shared';
import { COLORS, BORDER_RADIUS, FONT_FAMILY, SPACING } from '../../theme';

interface PlayerAvatarProps {
  name: string;
  color: string;
  size?: 'sm' | 'md' | 'lg';
  isHost?: boolean;
  connectionStatus?: 'connected' | 'disconnected';
  style?: ViewStyle;
}

const SIZE_MAP = {
  sm: { width: 32, height: 32, fontSize: 14 },
  md: { width: 48, height: 48, fontSize: 18 },
  lg: { width: 64, height: 64, fontSize: 24 },
};

export function PlayerAvatar({
  name,
  color,
  size = 'md',
  isHost = false,
  connectionStatus,
  style,
}: PlayerAvatarProps) {
  const sizeStyle = SIZE_MAP[size];
  const initials = getPlayerInitials(name);

  return (
    <View style={[styles.container, style]}>
      <View
        style={[
          styles.avatar,
          {
            width: sizeStyle.width,
            height: sizeStyle.height,
            backgroundColor: color,
          },
        ]}
      >
        <Text
          style={[
            styles.initials,
            { fontSize: sizeStyle.fontSize },
          ]}
        >
          {initials}
        </Text>

        {/* Host Badge */}
        {isHost && (
          <View style={styles.hostBadge}>
            <Text style={styles.hostStar}>⭐</Text>
          </View>
        )}
      </View>

      {/* Connection Status Dot */}
      {connectionStatus && (
        <View
          style={[
            styles.statusDot,
            {
              backgroundColor:
                connectionStatus === 'connected'
                  ? COLORS.connection.connected
                  : COLORS.connection.disconnected,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  avatar: {
    borderRadius: BORDER_RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  initials: {
    color: COLORS.text.primary,
    fontWeight: '700',
    fontFamily: FONT_FAMILY.primary,
  },
  hostBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.status.warning,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.background.dark,
  },
  hostStar: {
    fontSize: 10,
  },
  statusDot: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 12,
    height: 12,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 2,
    borderColor: COLORS.background.dark,
  },
});

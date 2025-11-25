/**
 * PlayerListItem Component
 * Individual player row for lists
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Player } from '@fakash/shared';
import { PlayerAvatar } from '../game/PlayerAvatar';
import { COLORS, SPACING, TEXT_STYLES, BORDER_RADIUS } from '../../theme';

interface PlayerListItemProps {
  player: Player;
  showScore?: boolean;
  style?: ViewStyle;
}

export function PlayerListItem({
  player,
  showScore = false,
  style,
}: PlayerListItemProps) {
  return (
    <View style={[styles.container, style]}>
      <PlayerAvatar
        name={player.user_name}
        color={player.avatar_color}
        size="md"
        isHost={player.is_host}
        connectionStatus={player.connection_status}
      />

      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {player.user_name}
        </Text>

        {showScore && (
          <Text style={styles.score}>
            {player.score} نقطة
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row-reverse', // RTL
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.background.glass,
    gap: SPACING.sm,
  },
  info: {
    flex: 1,
    alignItems: 'flex-end', // RTL
  },
  name: {
    ...TEXT_STYLES.body,
    color: COLORS.text.primary,
  },
  score: {
    ...TEXT_STYLES.bodySmall,
    color: COLORS.text.muted,
  },
});

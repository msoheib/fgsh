/**
 * LeaderboardRow Component
 * Results leaderboard row with rank and medals
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Player } from '@fakash/shared';
import { PlayerAvatar } from '../game/PlayerAvatar';
import { COLORS, SPACING, BORDER_RADIUS, TEXT_STYLES } from '../../theme';

interface LeaderboardRowProps {
  player: Player;
  rank: number;
  style?: ViewStyle;
}

const MEDAL_EMOJIS = ['🥇', '🥈', '🥉'];

const RANK_GRADIENTS = {
  1: [COLORS.rank.gold.start, COLORS.rank.gold.end],
  2: [COLORS.rank.silver.start, COLORS.rank.silver.end],
  3: [COLORS.rank.bronze.start, COLORS.rank.bronze.end],
};

export function LeaderboardRow({ player, rank, style }: LeaderboardRowProps) {
  const isTopThree = rank <= 3;
  const gradient = RANK_GRADIENTS[rank as keyof typeof RANK_GRADIENTS];

  const content = (
    <>
      {/* Rank */}
      <View style={styles.rankContainer}>
        {isTopThree ? (
          <Text style={styles.medal}>{MEDAL_EMOJIS[rank - 1]}</Text>
        ) : (
          <Text style={styles.rankNumber}>{rank}</Text>
        )}
      </View>

      {/* Player Info */}
      <View style={styles.playerInfo}>
        <PlayerAvatar
          name={player.user_name}
          color={player.avatar_color}
          size="md"
          isHost={player.is_host}
        />

        <Text
          style={[
            styles.playerName,
            isTopThree && styles.playerNameTop,
          ]}
          numberOfLines={1}
        >
          {player.user_name}
        </Text>
      </View>

      {/* Score */}
      <Text
        style={[
          styles.score,
          isTopThree && styles.scoreTop,
        ]}
      >
        {player.score}
      </Text>
    </>
  );

  if (isTopThree) {
    return (
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.container, style]}
      >
        {content}
      </LinearGradient>
    );
  }

  return (
    <View style={[styles.container, styles.containerDefault, style]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row-reverse', // RTL
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    gap: SPACING.sm,
  },
  containerDefault: {
    backgroundColor: COLORS.background.glass,
  },
  rankContainer: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medal: {
    fontSize: 32,
  },
  rankNumber: {
    ...TEXT_STYLES.h4,
    color: COLORS.text.muted,
  },
  playerInfo: {
    flex: 1,
    flexDirection: 'row-reverse', // RTL
    alignItems: 'center',
    gap: SPACING.sm,
  },
  playerName: {
    ...TEXT_STYLES.body,
    color: COLORS.text.primary,
    flex: 1,
  },
  playerNameTop: {
    color: '#1a0933', // Dark text on light gradient
    fontWeight: '700',
  },
  score: {
    ...TEXT_STYLES.h4,
    color: COLORS.text.primary,
  },
  scoreTop: {
    color: '#1a0933',
  },
});

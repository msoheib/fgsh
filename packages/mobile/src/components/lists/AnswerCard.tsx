/**
 * AnswerCard Component
 * Voting phase answer card with selection state
 */

import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet, ViewStyle } from 'react-native';
import { PlayerAnswer } from '@fakash/shared';
import { PlayerAvatar } from '../game/PlayerAvatar';
import { COLORS, SPACING, BORDER_RADIUS, TEXT_STYLES } from '../../theme';

interface AnswerCardProps {
  answer: PlayerAnswer;
  isSelected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  style?: ViewStyle;
}

export function AnswerCard({
  answer,
  isSelected = false,
  onPress,
  disabled = false,
  style,
}: AnswerCardProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || !onPress}
      activeOpacity={0.7}
      style={[
        styles.container,
        isSelected && styles.containerSelected,
        disabled && styles.containerDisabled,
        style,
      ]}
    >
      <View style={styles.content}>
        {answer.player && (
          <View style={styles.playerInfo}>
            <PlayerAvatar
              name={answer.player.user_name}
              color={answer.player.avatar_color}
              size="sm"
            />
            <Text style={styles.playerName}>{answer.player.user_name}</Text>
          </View>
        )}

        <Text style={styles.answerText}>{answer.answer_text}</Text>
      </View>

      {isSelected && (
        <View style={styles.checkmark}>
          <Text style={styles.checkmarkText}>✓</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 2,
    borderColor: COLORS.background.glassBorder,
    backgroundColor: COLORS.background.glass,
  },
  containerSelected: {
    borderColor: COLORS.secondary.main,
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
  },
  containerDisabled: {
    opacity: 0.5,
  },
  content: {
    gap: SPACING.sm,
  },
  playerInfo: {
    flexDirection: 'row-reverse', // RTL
    alignItems: 'center',
    gap: SPACING.xs,
  },
  playerName: {
    ...TEXT_STYLES.bodySmall,
    color: COLORS.text.muted,
  },
  answerText: {
    ...TEXT_STYLES.body,
    color: COLORS.text.primary,
    textAlign: 'right', // RTL
  },
  checkmark: {
    position: 'absolute',
    top: SPACING.xs,
    left: SPACING.xs,
    width: 24,
    height: 24,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.secondary.main,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmarkText: {
    color: COLORS.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
});

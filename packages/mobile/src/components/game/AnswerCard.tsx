/**
 * AnswerCard Component
 * Selectable answer card for voting phase
 */

import React from 'react';
import { Text, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';

interface AnswerCardProps {
  answer: string;
  isSelected: boolean;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
  subtitle?: string;
}

export function AnswerCard({
  answer,
  isSelected,
  onPress,
  disabled = false,
  style,
  subtitle
}: AnswerCardProps) {
  return (
    <TouchableOpacity
      style={[
        styles.container,
        isSelected && styles.selected,
        disabled && styles.disabled,
        style
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <BlurView
        intensity={20}
        tint="dark"
        style={styles.blur}
      >
        <Text style={[styles.answerText, isSelected && styles.selectedText]}>
          {answer}
        </Text>
        {subtitle && (
          <Text style={[styles.subtitle, isSelected && styles.selectedSubtitle]}>
            {subtitle}
          </Text>
        )}
      </BlurView>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(124, 58, 237, 0.3)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 12,
    minHeight: 80,
  },
  selected: {
    borderColor: '#06b6d4', // cyan
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    shadowColor: '#06b6d4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  disabled: {
    opacity: 0.5,
  },
  blur: {
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  answerText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#e9d5ff',
    textAlign: 'center',
    lineHeight: 24,
  },
  selectedText: {
    color: '#67e8f9',
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '400',
    color: '#a78bfa',
    textAlign: 'center',
    marginTop: 8,
  },
  selectedSubtitle: {
    color: '#06b6d4',
  },
});

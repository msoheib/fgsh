/**
 * GlassTextInput Component
 * Glass-styled text input matching web .input-glass
 */

import React from 'react';
import {
  TextInput,
  View,
  Text,
  StyleSheet,
  TextInputProps,
  ViewStyle,
} from 'react-native';
import { COLORS, BORDER_RADIUS, SPACING, FONT_FAMILY, FONT_SIZES, TEXT_STYLES } from '../../theme';

interface GlassTextInputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
}

export function GlassTextInput({
  label,
  error,
  containerStyle,
  style,
  ...textInputProps
}: GlassTextInputProps) {
  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <Text style={styles.label}>{label}</Text>
      )}
      <TextInput
        style={[
          styles.input,
          !!error && styles.inputError,
          style,
        ]}
        placeholderTextColor={COLORS.text.muted}
        {...textInputProps}
      />
      {error && (
        <Text style={styles.errorText}>{error}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    ...TEXT_STYLES.body,
    marginBottom: SPACING.xs,
    color: COLORS.text.secondary,
  },
  input: {
    width: '100%',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.background.glassBorder,
    backgroundColor: COLORS.background.glass,
    color: COLORS.text.primary,
    fontSize: FONT_SIZES.base,
    fontFamily: FONT_FAMILY.fallback,
    textAlign: 'right', // RTL
  },
  inputError: {
    borderColor: COLORS.status.error,
  },
  errorText: {
    ...TEXT_STYLES.caption,
    color: COLORS.status.error,
    marginTop: SPACING.xs,
    textAlign: 'right', // RTL
  },
});

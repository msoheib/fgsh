/**
 * CodeInput Component
 * 6-digit game code input with auto-advance and paste support
 */

import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  ViewStyle,
  Keyboard,
} from 'react-native';
import { COLORS, BORDER_RADIUS, SPACING, FONT_FAMILY, FONT_SIZES } from '../../theme';

interface CodeInputProps {
  length?: number;
  onComplete: (code: string) => void;
  style?: ViewStyle;
  autoFocus?: boolean;
}

export function CodeInput({
  length = 6,
  onComplete,
  style,
  autoFocus = true,
}: CodeInputProps) {
  const [code, setCode] = useState<string[]>(Array(length).fill(''));
  const inputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (autoFocus && inputRefs.current[0]) {
      inputRefs.current[0]?.focus();
    }
  }, [autoFocus]);

  const handleChangeText = (text: string, index: number) => {
    // Handle paste
    if (text.length > 1) {
      const pastedCode = text.slice(0, length).toUpperCase().split('');
      const newCode = [...code];
      pastedCode.forEach((char, i) => {
        if (index + i < length) {
          newCode[index + i] = char;
        }
      });
      setCode(newCode);

      // Focus last filled input or complete
      const lastFilledIndex = Math.min(index + pastedCode.length, length) - 1;
      if (lastFilledIndex === length - 1) {
        inputRefs.current[lastFilledIndex]?.blur();
        Keyboard.dismiss();
        onComplete(newCode.join(''));
      } else {
        inputRefs.current[lastFilledIndex + 1]?.focus();
      }
      return;
    }

    // Handle single character input
    const newCode = [...code];
    newCode[index] = text.toUpperCase();
    setCode(newCode);

    // Auto-advance to next input
    if (text && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Check if code is complete
    if (text && index === length - 1) {
      Keyboard.dismiss();
      onComplete(newCode.join(''));
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    // Handle backspace
    if (key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <View style={[styles.container, style]}>
      {Array.from({ length }).map((_, index) => (
        <TextInput
          key={index}
          ref={(ref) => (inputRefs.current[index] = ref)}
          style={[
            styles.input,
            !!code[index] && styles.inputFilled,
          ]}
          value={code[index]}
          onChangeText={(text) => handleChangeText(text, index)}
          onKeyPress={({ nativeEvent: { key } }) => handleKeyPress(key, index)}
          maxLength={index === 0 ? length : 1} // Allow paste in first input
          keyboardType="default"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect={false}
          textAlign="center"
          selectTextOnFocus
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row-reverse', // RTL
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  input: {
    width: 48,
    height: 56,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 2,
    borderColor: COLORS.background.glassBorder,
    backgroundColor: COLORS.background.glass,
    color: COLORS.text.primary,
    fontSize: FONT_SIZES['2xl'],
    fontWeight: '700',
    fontFamily: FONT_FAMILY.primary,
    textAlign: 'center',
  },
  inputFilled: {
    borderColor: COLORS.secondary.main,
    backgroundColor: 'rgba(6, 182, 212, 0.1)', // cyan tint
  },
});

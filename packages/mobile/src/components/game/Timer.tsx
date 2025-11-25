/**
 * Timer Component
 * Circular progress timer with countdown
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ViewStyle, Animated, Platform } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { COLORS, TEXT_STYLES } from '../../theme';

interface TimerProps {
  duration: number; // Total duration in seconds
  timeRemaining: number; // Current time remaining
  size?: number;
  strokeWidth?: number;
  style?: ViewStyle;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function Timer({
  duration,
  timeRemaining,
  size = 120,
  strokeWidth = 8,
  style,
}: TimerProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = timeRemaining / duration;

  // Animated value for smooth transitions
  const animatedProgress = React.useRef(new Animated.Value(progress)).current;

  useEffect(() => {
    Animated.timing(animatedProgress, {
      toValue: progress,
      duration: 1000,
      useNativeDriver: true,
    }).start();
  }, [progress]);

  // Color transitions based on remaining time
  const getColor = () => {
    if (progress > 0.5) return COLORS.secondary.main; // Cyan
    if (progress > 0.2) return COLORS.status.warning; // Amber
    return COLORS.status.error; // Red
  };

  const strokeDashoffset = animatedProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  return (
    <View style={[styles.container, { width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        {/* Background Circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth={strokeWidth}
          fill="none"
        />

        {/* Progress Circle */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={getColor()}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
          {...(Platform.OS === 'web' ? { collapsable: undefined as any } : {})}
        />
      </Svg>

      {/* Time Display */}
      <View style={styles.timeContainer}>
        <Text style={[TEXT_STYLES.h2, { fontSize: size * 0.3 }]}>
          {timeRemaining}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useGameStore } from '@fakash/shared';

export const GameScreen: React.FC = () => {
  const { currentGame, currentRound } = useGameStore();

  if (!currentGame || !currentRound) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>لا توجد جولة نشطة</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.round}>
          الجولة {currentRound.roundNumber} / {currentGame.roundCount}
        </Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.question}>{currentRound.question}</Text>

        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>
            🎮 واجهة اللعبة قيد التطوير
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a0933',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 24,
  },
  round: {
    fontSize: 20,
    color: '#a78bfa',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  question: {
    fontSize: 28,
    color: '#ffffff',
    textAlign: 'center',
    fontWeight: 'bold',
    marginBottom: 32,
  },
  placeholder: {
    alignItems: 'center',
    padding: 40,
  },
  placeholderText: {
    color: '#9ca3af',
    fontSize: 18,
    textAlign: 'center',
  },
  error: {
    color: '#ef4444',
    fontSize: 18,
    textAlign: 'center',
    marginTop: 100,
  },
});

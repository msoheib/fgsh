import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useGameStore } from '@fakash/shared';

export const ResultsScreen: React.FC = () => {
  const { currentGame } = useGameStore();

  if (!currentGame) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>لا توجد نتائج متاحة</Text>
      </View>
    );
  }

  const sortedPlayers = [...currentGame.players].sort((a, b) => b.score - a.score);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🏆 النتائج النهائية</Text>
      </View>

      <ScrollView style={styles.leaderboard}>
        {sortedPlayers.map((player, index) => (
          <View key={player.id} style={styles.playerCard}>
            <View style={styles.rank}>
              <Text style={styles.rankText}>{index + 1}</Text>
            </View>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {player.name.slice(0, 2).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.playerName}>{player.name}</Text>
            <Text style={styles.score}>{player.score} نقطة</Text>
          </View>
        ))}
      </ScrollView>
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
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  leaderboard: {
    flex: 1,
  },
  playerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  rank: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ec4899',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rankText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  playerName: {
    flex: 1,
    color: '#ffffff',
    fontSize: 18,
    textAlign: 'right',
  },
  score: {
    color: '#a78bfa',
    fontSize: 20,
    fontWeight: 'bold',
  },
  error: {
    color: '#ef4444',
    fontSize: 18,
    textAlign: 'center',
    marginTop: 100,
  },
});

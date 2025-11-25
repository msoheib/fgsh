import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useGameStore } from '@fakash/shared';

export const LobbyScreen: React.FC = () => {
  const { currentGame, currentPlayer } = useGameStore();

  if (!currentGame || !currentPlayer) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>لا توجد لعبة نشطة</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>غرفة الانتظار</Text>
        <Text style={styles.code}>الرمز: {currentGame.code}</Text>
      </View>

      <ScrollView style={styles.playerList}>
        {currentGame.players.map((player) => (
          <View key={player.id} style={styles.playerCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {player.name.slice(0, 2).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.playerName}>{player.name}</Text>
            {player.isHost && (
              <View style={styles.hostBadge}>
                <Text style={styles.hostText}>مضيف</Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.waiting}>
          في انتظار بدء اللعبة...
        </Text>
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
    marginBottom: 32,
    marginTop: 40,
  },
  title: {
    fontSize: 32,
    color: '#ffffff',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  code: {
    fontSize: 24,
    color: '#a78bfa',
    fontWeight: '600',
  },
  playerList: {
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
  hostBadge: {
    backgroundColor: '#ec4899',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  hostText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  waiting: {
    color: '#9ca3af',
    fontSize: 16,
  },
  error: {
    color: '#ef4444',
    fontSize: 18,
    textAlign: 'center',
    marginTop: 100,
  },
});

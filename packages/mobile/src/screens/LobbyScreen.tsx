import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useGameStore } from '@fakash/shared';
import { Logo } from '../components/core/Logo';

// Player colors matching the design
const PLAYER_COLORS = ['#8b5cf6', '#3b82f6', '#06b6d4', '#ec4899'];

export const LobbyScreen: React.FC = () => {
  const navigation = useNavigation();
  const { game, players, currentPlayer, isHost, startGame, isConnected } = useGameStore();

  // Navigate to game screen when game starts
  useEffect(() => {
    console.log('🔍 LobbyScreen - Game status check:', {
      status: game?.status,
      gameExists: !!game,
      willNavigate: game?.status === 'playing'
    });

    if (game?.status === 'playing') {
      console.log('🎮 Game status is "playing", navigating to Game screen');
      navigation.navigate('Game' as never);
    }
  }, [game?.status, navigation]);

  if (!game || !currentPlayer) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>لا توجد لعبة نشطة</Text>
      </View>
    );
  }

  const handleStartGame = async () => {
    if (!game || !isHost) return;

    try {
      await startGame();
    } catch (err) {
      console.error('Failed to start game:', err);
    }
  };

  return (
    <View style={styles.container}>
      <Logo size="md" style={styles.logo} />

      <View style={styles.contentContainer}>
        {/* Game Code */}
        <View style={styles.codeContainer}>
          <Text style={styles.codeLabel}>كود اللعبة</Text>
          <Text style={styles.codeText}>{game.code}</Text>
          <View style={[styles.connectionDot, isConnected && styles.connectionDotConnected]} />
        </View>

        {/* Title */}
        <Text style={styles.title}>اللاعبين</Text>

        {/* Players Grid */}
        <View style={styles.playersFrame}>
          <View style={styles.playersGrid}>
            {players.slice(0, 4).map((player, index) => (
              <View
                key={player.id}
                style={[
                  styles.playerCard,
                  { backgroundColor: PLAYER_COLORS[index % PLAYER_COLORS.length] }
                ]}
              >
                <Text style={styles.playerName}>{player.user_name}</Text>
              </View>
            ))}

            {/* Fill empty slots if less than 4 players */}
            {[...Array(Math.max(0, 4 - players.length))].map((_, index) => (
              <View
                key={`empty-${index}`}
                style={[
                  styles.playerCard,
                  styles.emptyCard,
                  { backgroundColor: PLAYER_COLORS[(players.length + index) % PLAYER_COLORS.length] }
                ]}
              >
                <Text style={styles.emptyText}>...</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Start Game Button - Only show for host */}
        {isHost && (
          <TouchableOpacity
            style={styles.startButton}
            onPress={handleStartGame}
            activeOpacity={0.8}
          >
            <Text style={styles.startButtonText}>ابدأ اللعبة</Text>
          </TouchableOpacity>
        )}

        {!isHost && (
          <View style={styles.waitingContainer}>
            <Text style={styles.waitingText}>في انتظار المضيف لبدء اللعبة...</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a0933',
    paddingTop: 60,
  },
  logo: {
    alignSelf: 'center',
    marginBottom: 16,
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  codeContainer: {
    alignItems: 'center',
    marginBottom: 16,
    position: 'relative',
  },
  codeLabel: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 6,
  },
  codeText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#8b5cf6',
    letterSpacing: 3,
  },
  connectionDot: {
    position: 'absolute',
    top: 0,
    right: 20,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
  },
  connectionDotConnected: {
    backgroundColor: '#10b981',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 16,
  },
  playersFrame: {
    borderWidth: 1,
    borderColor: '#8b5cf6',
    borderRadius: 16,
    padding: 12,
    marginBottom: 20,
  },
  playersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    rowGap: 12,
  },
  playerCard: {
    width: '45%',
    minHeight: 80,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  emptyCard: {
    opacity: 0.3,
  },
  playerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 18,
    color: '#ffffff',
    opacity: 0.5,
  },
  startButton: {
    backgroundColor: '#ec4899',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignSelf: 'center',
    shadowColor: '#ec4899',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  startButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
  },
  waitingContainer: {
    alignSelf: 'center',
    paddingVertical: 12,
  },
  waitingText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
  error: {
    color: '#ef4444',
    fontSize: 18,
    textAlign: 'center',
    marginTop: 100,
  },
});

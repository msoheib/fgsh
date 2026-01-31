import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useGameStore, GAME_CONFIG, GameService } from '@fakash/shared';
// ... existing imports ...


import { Logo } from '../components/core/Logo';

// Player colors matching the design
const PLAYER_COLORS = ['#8b5cf6', '#3b82f6', '#06b6d4', '#ec4899'];

export const LobbyScreen: React.FC = () => {
  const navigation = useNavigation();
  const { game, players, currentPlayer, isPhaseCaptain, startGame, isConnected } = useGameStore();

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

  // Polling fallback to ensure captain status is synced
  useEffect(() => {
    if (!game || !currentPlayer || game.status !== 'waiting') return;

    const pollInterval = setInterval(async () => {
      try {
        const freshGame = await GameService.getGame(game.id);
        
        if (freshGame) {
          const isPhaseCaptain = currentPlayer?.id === freshGame.phase_captain_id;
          
          if (freshGame.status !== game.status || isPhaseCaptain !== useGameStore.getState().isPhaseCaptain) {
            console.log('🔄 Polling updated game state:', { isPhaseCaptain, status: freshGame.status });
            useGameStore.setState({ game: freshGame, isPhaseCaptain });
          }

          // Auto-repair: If game has no captain but has players, try to claim it
          if (!freshGame.phase_captain_id && freshGame.max_players > 0 && currentPlayer) {
             console.log('⚠️ [Mobile] Game has no captain! Attempting repair...');
             // Use NIL UUID to satisfy Postgres type requirements
             useGameStore.getState().promoteNewCaptain('00000000-0000-0000-0000-000000000000');
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [game?.id, game?.status, currentPlayer?.id]);

  if (!game || !currentPlayer) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>لا توجد لعبة نشطة</Text>
      </View>
    );
  }

  const handleStartGame = async () => {
    if (!game || !isPhaseCaptain) return;

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
        {isPhaseCaptain && (
          <View>
            <TouchableOpacity
              style={[
                styles.startButton,
                players.length < GAME_CONFIG.MIN_PLAYERS && styles.startButtonDisabled
              ]}
              onPress={handleStartGame}
              activeOpacity={0.8}
              disabled={players.length < GAME_CONFIG.MIN_PLAYERS}
            >
              <Text style={styles.startButtonText}>ابدأ اللعبة</Text>
            </TouchableOpacity>
            {players.length < GAME_CONFIG.MIN_PLAYERS && (
              <Text style={styles.warningText}>
                تحتاج {GAME_CONFIG.MIN_PLAYERS} لاعبين على الأقل للبدء
              </Text>
            )}
          </View>
        )}

        {!isPhaseCaptain && (
          <View style={styles.waitingContainer}>
            <Text style={styles.waitingText}>في انتظار المضيف لبدء اللعبة...</Text>
          </View>
        )}

        {/* Debug Info */}
        <View style={{ marginTop: 20, alignItems: 'center', opacity: 0.3 }}>
          <Text style={{ color: '#fff', fontSize: 10, fontFamily: 'monospace' }}>
            CID: {game.phase_captain_id ? game.phase_captain_id.substring(0, 6) : 'NULL'} | MID: {currentPlayer.id.substring(0, 6)}
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
  startButtonDisabled: {
    opacity: 0.5,
    backgroundColor: '#9ca3af',
  },
  warningText: {
    color: '#fbbf24',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
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

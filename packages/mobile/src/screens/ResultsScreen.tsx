import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useGameStore, GameService } from '@fakash/shared';

// Player colors matching the design
const PLAYER_COLORS = ['#8b5cf6', '#3b82f6', '#06b6d4', '#ec4899'];

export const ResultsScreen: React.FC = () => {
  const { game, players, isPhaseCaptain, isHost } = useGameStore();

  if (!game) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>لا توجد نتائج متاحة</Text>
      </View>
    );
  }

  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
  const isGameFinished = game.status === 'finished';
  const canAdvanceRound = (isPhaseCaptain || isHost) && !isGameFinished;

  const handleNextQuestion = async () => {
    if (!game || !canAdvanceRound) return;

    try {
      console.log('📢 Advancing to next round...');
      await GameService.incrementRound(game.id);
    } catch (err) {
      console.error('❌ Failed to advance round:', err);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.contentContainer}>
        {/* Leaderboard Frame */}
        <View style={styles.leaderboardFrame}>
          {sortedPlayers.map((player, index) => {
            const color = PLAYER_COLORS[index % PLAYER_COLORS.length];
            // Mock data for rounds won - in real app this would come from player stats
            const roundsWon = [7, 9, 4, 8][index] || 0;

            return (
              <View key={player.id} style={styles.playerBar}>
                <View style={[styles.playerBarContent, { backgroundColor: color }]}>
                  {/* Player Icon */}
                  <View style={styles.playerIcon}>
                    <Text style={styles.playerIconText}>👤</Text>
                  </View>

                  {/* Player Name */}
                  <Text style={styles.playerName}>{player.user_name}</Text>

                  {/* Rounds Won */}
                  <Text style={styles.roundsWon}>{roundsWon}</Text>

                  {/* Score */}
                  <Text style={styles.score}>{player.score}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Next Question Button - Only show for phase captain/host */}
        {canAdvanceRound ? (
          <TouchableOpacity
            style={styles.nextButton}
            onPress={handleNextQuestion}
            activeOpacity={0.8}
          >
            <Text style={styles.nextButtonText}>السؤال التالي</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.waitingContainer}>
            <Text style={styles.waitingText}>
              {isGameFinished
                ? 'انتهت اللعبة!'
                : 'في انتظار المضيف للسؤال التالي...'}
            </Text>
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
  contentContainer: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  leaderboardFrame: {
    borderWidth: 2,
    borderColor: '#8b5cf6',
    borderRadius: 24,
    padding: 20,
    marginBottom: 40,
  },
  playerBar: {
    marginBottom: 16,
  },
  playerBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  playerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  playerIconText: {
    fontSize: 20,
  },
  playerName: {
    flex: 1,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'right',
  },
  roundsWon: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    marginRight: 48,
    minWidth: 40,
    textAlign: 'center',
  },
  score: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    minWidth: 80,
    textAlign: 'left',
  },
  nextButton: {
    backgroundColor: '#ec4899',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 48,
    alignSelf: 'center',
    shadowColor: '#ec4899',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  nextButtonText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
  },
  waitingContainer: {
    alignSelf: 'center',
    paddingVertical: 18,
  },
  waitingText: {
    fontSize: 18,
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

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useGameStore, GameService, RealtimeService } from '@fakash/shared';

// Player colors matching the design
const PLAYER_COLORS = ['#8b5cf6', '#3b82f6', '#06b6d4', '#ec4899'];

export const ResultsScreen: React.FC = () => {
  const navigation = useNavigation();
  const { game, players, isPhaseCaptain } = useGameStore();
  const [replayCode, setReplayCode] = React.useState<string | null>(null);

  if (!game) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>لا توجد نتائج متاحة</Text>
      </View>
    );
  }

  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
  const isGameFinished = game.status === 'finished';
  const canAdvanceRound = isPhaseCaptain && !isGameFinished;

  // Refresh scores when showing results
  useEffect(() => {
    const fetchScores = async () => {
      if (!game) return;
      try {
        const updatedPlayers = await GameService.getGamePlayers(game.id);
        useGameStore.setState({ players: updatedPlayers });
      } catch (err) {
        console.error('Failed to refresh scores on results screen:', err);
      }
    };
    fetchScores();
  }, [game?.id]);

  useEffect(() => {
    if (!game?.id) return;

    return RealtimeService.listenForBroadcastEvent<{ newGameCode?: string }>(
      game.id,
      'replay_game',
      (payload) => {
        if (payload?.newGameCode) {
          setReplayCode(payload.newGameCode);
        }
      }
    );
  }, [game?.id]);

  const handleNextQuestion = async () => {
    if (!game || !canAdvanceRound) return;

    try {
      console.log('📢 Advancing to next round...');
      await GameService.incrementRound(game.id);
    } catch (err) {
      console.error('❌ Failed to advance round:', err);
    }
  };

  const handleFinishGame = async () => {
    if (game) {
      try {
        await GameService.endGame(game.id);
      } catch (err) {
        console.error('Failed to end game:', err);
      }
    }
    navigation.navigate('Join' as never);
  };

  const handleCreateNew = () => {
    navigation.navigate('Join' as never);
  };

  return (
    <View style={styles.container}>
      <View style={styles.contentContainer}>
        {/* Leaderboard Frame */}
        <ScrollView style={styles.leaderboardFrame} contentContainerStyle={styles.leaderboardContent}>
          {sortedPlayers.map((player, index) => {
            const color = PLAYER_COLORS[index % PLAYER_COLORS.length];
            return (
              <View key={player.id} style={styles.playerBar}>
                <View style={[styles.playerBarContent, { backgroundColor: color }]}>
                  {/* Player Icon */}
                  <View style={styles.playerIcon}>
                    <Text style={styles.playerIconText}>👤</Text>
                  </View>

                  {/* Player Name */}
                  <Text style={styles.playerName}>{player.user_name}</Text>

                  {/* Score */}
                  <Text style={styles.score}>{player.score}</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>

        {/* Next Question Button - Only show for phase captain/host when not finished */}
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
                : 'في انتظار المضي للسؤال التالي...'}
            </Text>
          </View>
        )}

        {/* Final actions when game is finished */}
        {isGameFinished && (
          <View style={styles.finalActions}>
            {replayCode && (
              <View style={styles.replayNotice}>
                <Text style={styles.replayNoticeTitle}>تم إنشاء لعبة جديدة</Text>
                <Text style={styles.replayNoticeText}>الكود الجديد: {replayCode}</Text>
              </View>
            )}
            <TouchableOpacity
              style={[styles.nextButton, styles.secondaryButton]}
              onPress={handleCreateNew}
              activeOpacity={0.8}
            >
              <Text style={styles.nextButtonText}>إنشاء لعبة جديدة</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.nextButton, styles.secondaryButton]}
              onPress={handleFinishGame}
              activeOpacity={0.8}
            >
              <Text style={styles.nextButtonText}>إنهاء اللعبة والعودة</Text>
            </TouchableOpacity>
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
    flexGrow: 0,
    maxHeight: '60%',
    borderWidth: 2,
    borderColor: '#8b5cf6',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginBottom: 40,
  },
  leaderboardContent: {
    paddingVertical: 8,
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
  finalActions: {
    marginTop: 24,
    gap: 12,
  },
  secondaryButton: {
    backgroundColor: '#4b5563',
  },
  replayNotice: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.35)',
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  replayNoticeTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 6,
  },
  replayNoticeText: {
    fontSize: 15,
    color: '#dbeafe',
    textAlign: 'center',
  },
  error: {
    color: '#ef4444',
    fontSize: 18,
    textAlign: 'center',
    marginTop: 100,
  },
});

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useGameStore } from '@fakash/shared';

export const JoinScreen: React.FC = () => {
  const navigation = useNavigation();
  const { joinGame, isLoading, error } = useGameStore();
  const [gameCode, setGameCode] = useState('');
  const [playerName, setPlayerName] = useState('');

  const handleJoin = async () => {
    if (!gameCode.trim() || !playerName.trim()) {
      return;
    }

    try {
      await joinGame(gameCode.toUpperCase(), playerName);
      navigation.navigate('Lobby' as never);
    } catch (err) {
      console.error('Failed to join game:', err);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.content}>
        <Text style={styles.title}>فقش 🎮</Text>
        <Text style={styles.subtitle}>Fakash Game</Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="رمز اللعبة"
            placeholderTextColor="#9ca3af"
            value={gameCode}
            onChangeText={setGameCode}
            autoCapitalize="characters"
            maxLength={6}
          />

          <TextInput
            style={styles.input}
            placeholder="اسمك"
            placeholderTextColor="#9ca3af"
            value={playerName}
            onChangeText={setPlayerName}
            maxLength={50}
          />

          {error && (
            <Text style={styles.error}>{error}</Text>
          )}

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleJoin}
            disabled={isLoading || !gameCode.trim() || !playerName.trim()}
          >
            <Text style={styles.buttonText}>
              {isLoading ? 'جاري الانضمام...' : 'انضم إلى اللعبة'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a0933',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 64,
    color: '#ffffff',
    fontWeight: '800',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 24,
    color: '#a78bfa',
    fontWeight: '600',
    marginBottom: 48,
  },
  form: {
    width: '100%',
    maxWidth: 400,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    padding: 16,
    fontSize: 18,
    color: '#ffffff',
    marginBottom: 16,
    textAlign: 'right',
  },
  button: {
    backgroundColor: '#8b5cf6',
    borderRadius: 24,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  error: {
    color: '#ef4444',
    textAlign: 'center',
    marginBottom: 16,
  },
});

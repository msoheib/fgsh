import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useGameStore } from '@fakash/shared';
import { QRScanner } from '../components/inputs/QRScanner';
import { Logo } from '../components/core/Logo';

export const JoinScreen: React.FC = () => {
  const navigation = useNavigation();
  const { joinGame, isLoading, error } = useGameStore();
  const [gameCode, setGameCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [showScanner, setShowScanner] = useState(false);

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
        <Logo size="lg" style={styles.logo} />

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

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>أو</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* QR Scan Button */}
          <TouchableOpacity
            style={styles.scanButton}
            onPress={() => setShowScanner(true)}
            disabled={isLoading}
          >
            <Text style={styles.scanIcon}>📷</Text>
            <Text style={styles.scanButtonText}>مسح QR للانضمام</Text>
            <Text style={styles.scanButtonSubtext}>Scan QR Code</Text>
          </TouchableOpacity>

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

      {/* QR Scanner Modal */}
      <QRScanner
        visible={showScanner}
        onScan={(scannedCode) => {
          setGameCode(scannedCode.toUpperCase());
          setShowScanner(false);
        }}
        onClose={() => setShowScanner(false)}
      />
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
  logo: {
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
  scanButton: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    borderWidth: 2,
    borderColor: '#8b5cf6',
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  scanIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  scanButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  scanButtonSubtext: {
    color: '#a78bfa',
    fontSize: 14,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  dividerText: {
    color: '#9ca3af',
    paddingHorizontal: 12,
    fontSize: 14,
  },
});

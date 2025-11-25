import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nManager, Platform } from 'react-native';
import Toast from 'react-native-toast-message';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { useFonts } from 'expo-font';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// Screens
import { JoinScreen, LobbyScreen, GameScreen, ResultsScreen } from './src/screens';
import { initializeSupabase } from '@fakash/shared';

// Ensure RTL layout for Arabic
if (!I18nManager.isRTL) {
  I18nManager.forceRTL(true);
  // Note: On first run, app will need to reload for RTL to take effect
}

const Stack = createStackNavigator();

// Deep linking configuration
const linking: LinkingOptions<any> = {
  prefixes: ['fakash://', 'https://fakash.app'],
  config: {
    screens: {
      Join: {
        path: 'join',
        parse: {
          code: (code: string) => code.toUpperCase(),
        },
      },
      Lobby: 'lobby',
      Game: 'game',
      Results: 'results',
    },
  },
};

export default function App() {
  // Initialize Supabase on mount
  useEffect(() => {
    // Try both process.env and Constants.expoConfig for env vars
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || Constants.expoConfig?.extra?.supabaseUrl;
    const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || Constants.expoConfig?.extra?.supabaseAnonKey;

    console.log('🔍 Debug - Supabase credentials check:', {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseAnonKey,
      url: supabaseUrl,
      platform: Platform.OS,
    });

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('❌ Supabase credentials missing. Check .env.local file.');
      console.error('Expected: EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY');
      return;
    }

    try {
      console.log('✅ Initializing Supabase...');
      initializeSupabase(supabaseUrl, supabaseAnonKey, {
        storage: Platform.OS === 'web' ? undefined : AsyncStorage,
        detectSessionInUrl: Platform.OS === 'web',
      });
      console.log('✅ Supabase initialized successfully');
    } catch (error) {
      console.error('❌ Supabase initialization failed:', error);
    }
  }, []);

  // Load custom fonts (Tajawal can be added later from Google Fonts)
  const [fontsLoaded] = useFonts({
    'AraHamahZanki': require('./assets/fonts/AraHamahZanki.ttf'),
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer linking={linking}>
        <Stack.Navigator
          initialRouteName="Join"
          screenOptions={{
            headerShown: false,
            cardStyle: { backgroundColor: '#1a0933' },
            gestureEnabled: false, // Prevent swipe back during game
          }}
        >
          <Stack.Screen name="Join" component={JoinScreen} />
          <Stack.Screen name="Lobby" component={LobbyScreen} />
          <Stack.Screen name="Game" component={GameScreen} />
          <Stack.Screen name="Results" component={ResultsScreen} />
        </Stack.Navigator>
      </NavigationContainer>
      <Toast />
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}

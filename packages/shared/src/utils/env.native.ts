/**
 * Environment variable helper - React Native version
 * Uses process.env and Constants.expoConfig for React Native
 */

// Declare __DEV__ global for React Native
declare const __DEV__: boolean | undefined;

// Conditionally import Constants if available
let Constants: any = null;
try {
  Constants = require('expo-constants').default;
} catch (e) {
  // expo-constants not available, will fallback to process.env only
}

/**
 * Get environment variable value
 * React Native version - uses process.env and Constants.expoConfig
 */
export const getEnv = (key: string): string => {
  // Try process.env first (works with react-native-dotenv and EXPO_PUBLIC_ vars)
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key] || '';
  }

  // Try Constants.expoConfig.extra (works with app.json extra field)
  if (Constants && Constants.expoConfig?.extra) {
    // Convert VITE_* keys to match extra field keys
    // Example: VITE_SUPABASE_URL -> supabaseUrl
    const extraKey = key.replace('VITE_', '').toLowerCase()
      .split('_')
      .map((part, index) => index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1))
      .join('');

    if (Constants.expoConfig.extra[extraKey]) {
      return Constants.expoConfig.extra[extraKey];
    }
  }

  return '';
};

/**
 * Check if running in development mode
 * React Native version
 */
export const isDev = (): boolean => {
  // Check __DEV__ global (React Native standard)
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    return true;
  }

  if (typeof process !== 'undefined' && process.env) {
    return process.env.NODE_ENV !== 'production';
  }

  return false;
};

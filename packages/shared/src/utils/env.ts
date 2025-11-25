/**
 * Environment variable helper - Default fallback
 * Platform-specific versions should be used (.web.ts or .native.ts)
 * This file uses only process.env as a safe fallback
 */

/**
 * Get environment variable value
 * Default version - uses process.env only (safe for all platforms)
 */
export const getEnv = (key: string): string => {
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key] || '';
  }

  return '';
};

/**
 * Check if running in development mode
 * Default version
 */
export const isDev = (): boolean => {
  if (typeof process !== 'undefined' && process.env) {
    return process.env.NODE_ENV !== 'production';
  }

  return false;
};

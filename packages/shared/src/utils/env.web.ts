/// <reference types="vite/client" />

/**
 * Environment variable helper - Web version
 * Uses import.meta.env for Vite
 */

/**
 * Get environment variable value
 * Web version - uses import.meta.env (Vite)
 */
export const getEnv = (key: string): string => {
  if (import.meta.env && import.meta.env[key]) {
    return import.meta.env[key] as string;
  }

  // Fallback to process.env for Node.js environments
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key] || '';
  }

  return '';
};

/**
 * Check if running in development mode
 * Web version
 */
export const isDev = (): boolean => {
  if (import.meta.env && import.meta.env.DEV !== undefined) {
    return import.meta.env.DEV === true;
  }

  if (typeof process !== 'undefined' && process.env) {
    return process.env.NODE_ENV !== 'production';
  }

  return false;
};

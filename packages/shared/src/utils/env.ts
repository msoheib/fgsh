/**
 * Environment variable helper - shared fallback
 * Works in web (Vite) and native/node runtimes.
 */

type RuntimeEnv = Record<string, string | boolean | undefined>;

const readGlobalEnv = (): RuntimeEnv | undefined => {
  const g = globalThis as { __FGSH_ENV__?: RuntimeEnv };
  return g.__FGSH_ENV__;
};

/**
 * Get environment variable value.
 * Priority:
 * 1) globalThis.__FGSH_ENV__ (injected by platform bootstrap, e.g. web main.tsx)
 * 2) process.env
 */
export const getEnv = (key: string): string => {
  const globalEnv = readGlobalEnv();
  const globalValue = globalEnv?.[key];
  if (globalValue !== undefined && globalValue !== null && String(globalValue).length > 0) {
    return String(globalValue);
  }

  if (typeof process !== 'undefined' && process.env) {
    const value = process.env[key];
    if (value !== undefined && value !== null && value.length > 0) {
      return value;
    }
  }

  return '';
};

/**
 * Check if running in development mode.
 */
export const isDev = (): boolean => {
  const globalEnv = readGlobalEnv();
  const mode = globalEnv?.MODE;
  const dev = globalEnv?.DEV;

  if (typeof dev === 'boolean') {
    return dev;
  }

  if (typeof mode === 'string') {
    return mode !== 'production';
  }

  if (typeof process !== 'undefined' && process.env) {
    return process.env.NODE_ENV !== 'production';
  }

  return false;
};

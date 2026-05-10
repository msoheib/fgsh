import { defineConfig, devices } from '@playwright/test';

const stressPlayerCount = process.env.FGSH_STRESS_PLAYER_COUNT || '8';
const stressReportDate = process.env.FGSH_STRESS_REPORT_DATE || '2026-05-09';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 180_000,
  outputDir: `../../qa-reports/stress-${stressPlayerCount}-players-${stressReportDate}/playwright-output`,
  reporter: 'line',
  use: {
    baseURL: process.env.FGSH_TEST_BASE_URL || 'http://missing-fgsh-test-base-url.invalid',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});

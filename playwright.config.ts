import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    launchOptions: process.env.AURASEAL_BROWSER_PATH ? { executablePath: process.env.AURASEAL_BROWSER_PATH } : {},
    baseURL: process.env.PUBLIC_ORIGIN ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    video: process.env.AURASEAL_RECORD_DEMO === '1' ? 'on' : 'off',
  },
});

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  globalSetup: require.resolve('./tests/e2e/global-setup'),
  fullyParallel: false,
  workers: 1,
  timeout: 180000,
  expect: {
    timeout: 30000,
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3001',
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
    actionTimeout: 30000,
    navigationTimeout: 60000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});

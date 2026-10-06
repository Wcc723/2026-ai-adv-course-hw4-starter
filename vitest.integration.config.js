import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['tests/setup/testEnvironment.js'],
    globalSetup: ['tests/setup/integrationGlobalSetup.mjs'],
    include: ['tests/integration/**/*.integration.test.js'],
    exclude: configDefaults.exclude,
    fileParallelism: false,
    hookTimeout: 10000,
    testTimeout: 10000,
  },
});

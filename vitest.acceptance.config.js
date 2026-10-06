import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['tests/setup/testEnvironment.js'],
    include: ['tests/acceptance/**/*.test.js'],
    exclude: configDefaults.exclude,
    fileParallelism: false,
    hookTimeout: 10000,
    testTimeout: 15000,
  },
});

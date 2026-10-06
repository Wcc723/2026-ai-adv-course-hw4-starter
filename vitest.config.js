import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['tests/setup/testEnvironment.js'],
    exclude: [...configDefaults.exclude, 'tests/integration/**', 'tests/e2e/**', 'tests/acceptance/**'],
    fileParallelism: false,
    hookTimeout: 10000,
  },
});

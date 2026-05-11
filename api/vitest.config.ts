import {defineConfig} from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    globalSetup: './src/__tests__/global-setup.ts',
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: path.resolve(__dirname, 'coverage'),
      exclude: [
        'src/__tests__/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/index.ts',
      ],
    },
  },
});

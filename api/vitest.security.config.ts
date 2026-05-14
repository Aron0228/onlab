import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    include: ['src/__tests__/security/**/*.test.ts'],
  },
});

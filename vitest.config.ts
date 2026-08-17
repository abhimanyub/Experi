import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/domain/**/*.test.ts', 'src/templates/**/*.test.ts', 'src/lib/**/*.test.ts'],
    environment: 'node',
  },
});

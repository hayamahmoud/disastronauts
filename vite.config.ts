import { defineConfig } from 'vitest/config';

// Vite builds and serves the game; the `test` block configures Vitest.
export default defineConfig({
  // Three.js alone is ~600 kB, so raise the "big file" warning threshold.
  build: { chunkSizeWarningLimit: 900 },

  envPrefix: 'VITE_',
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node', // core logic needs no browser
  },
});

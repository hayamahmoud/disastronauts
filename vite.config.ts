import { defineConfig } from 'vitest/config';

// Vite builds and serves the game; the `test` block configures Vitest.
export default defineConfig({
  // Three.js alone is ~600 kB and the game is one bundle (~915 kB, 255 kB zipped),
  // so raise the "big file" warning threshold.
  build: { chunkSizeWarningLimit: 1000 },

  envPrefix: 'VITE_',
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node', // core logic needs no browser
    // Some tests play whole rounds (~1 s on a laptop, ~6 s on Vercel's 2-core
    // build machine). The default 5 s limit failed the deploy, so allow 30 s.
    testTimeout: 30_000,
  },
});

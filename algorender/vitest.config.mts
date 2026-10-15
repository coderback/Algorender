import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts'],
    // Property tests run many random inputs, and two files load Pyodide; on a
    // busy machine a few take longer than the 5 s default without being stuck.
    testTimeout: 20_000,
  },
});

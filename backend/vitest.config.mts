import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include:  ['src/**/*.test.ts'],
    exclude:  ['dist/**', 'node_modules/**'],
    isolate:  false,     // reuse workers across files — avoids Windows startup race
    pool:     'forks',   // process-level isolation is more stable on Windows
  },
});

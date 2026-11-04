import { defineConfig } from 'vitest/config';
// Threads, one module graph per worker (TA-SPEED, 2026-10-02): the package's tests share no module state -- three runs
// and a shuffled one gave the same pass and skip for every test, with and without the game data -- and a fresh
// process and graph per file was nearly all of the package's time.
export default defineConfig({ test: { include: ['test/**/*.test.ts'], pool: 'threads', isolate: false } });

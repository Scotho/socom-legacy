import { defineConfig } from 'vitest/config';
// Threads, one module graph per worker (TA-SPEED, 2026-10-02): three runs and a shuffled one gave the same pass and
// skip for every test, with and without the game data.
export default defineConfig({ test: { include: ['test/**/*.test.ts', 'forge-agent-probe/**/*.test.ts'], pool: 'threads', isolate: false } });

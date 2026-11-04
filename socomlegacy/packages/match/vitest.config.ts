// @s2u/match: the same settings as central's, written by SA-3's move script.
import { defineConfig } from 'vitest/config';
// The server is Node: no DOM. Threads, one module graph per worker (TA-SPEED, 2026-10-02): three runs gave the same
// pass and skip for every test, with and without the game data, as isolated forks do. test/server.test.ts depends on
// the order of its own tests: some shuffle seeds (--sequence.seed=11) fail its m-14 burst and S2 round 4 takeover
// tests under isolated forks too, so a shuffled run is not a clean check of this package.
export default defineConfig({ test: { include: ['test/**/*.test.ts'], environment: 'node', pool: 'threads', isolate: false } });

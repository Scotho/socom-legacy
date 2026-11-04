import { defineConfig } from 'vitest/config';

// Product adaptation: opt-in probe tests are separate from disc-backed suites.
export default defineConfig({ test: { include: ['tools/forge-agent-probe/*.test.ts'], maxWorkers: 2 } });

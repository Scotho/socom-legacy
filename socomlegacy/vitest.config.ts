import { defineConfig } from 'vitest/config';

// vitest 3 deprecated the workspace file; the same per-package configs are listed here instead. Central's
// vitest.alone.config.ts is a project of its own: its files run after every other file (LATER 567).
export default defineConfig({ test: { projects: ['packages/*/vitest.config.ts', 'tools/vitest.config.ts'] } });

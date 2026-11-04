import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';
// Node by default: most of the viewer's tests touch no DOM, and a jsdom set-up per file was most of the suite's time
// (TA-SPEED, 2026-10-02). A file that needs a window or a document says so on its first line:
// `// @vitest-environment jsdom`. Under node some sources take their no-DOM branch (src/traversalPage.ts dispatches
// no window event, src/playersOnline.ts has no document visibility): a test of that behaviour needs the header.

/** The same full commit `vite.config.ts` writes into `__VIEWER_COMMIT__`, so a plain-pack test records a real toolCommit. */
function gitCommit(): string {
  try {
    const hash = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return /^[a-f0-9]{40}$/.test(hash) ? hash : '';
  } catch {
    return '';
  }
}

export default defineConfig({
  define: { __VIEWER_COMMIT__: JSON.stringify(gitCommit()) },
  test: { include: ['test/**/*.test.ts'], environment: 'node' },
});

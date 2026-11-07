// Runs Next.js for the wiki with its telemetry off (no connection to a server that is not ours: AGENTS.md,
// "Boundaries"), after syncing the design system in (scripts/sync-theme.mjs). After a successful `build` it moves
// the export's nested prefetch segment files to the flat names the client requests (scripts/flatten-segments.mjs).
// Usage: node scripts/run-next.mjs <args>
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { flattenSegments } from './flatten-segments.mjs';

const wiki = join(dirname(fileURLToPath(import.meta.url)), '..');
await import('./sync-theme.mjs');
const next = createRequire(import.meta.url).resolve('next/dist/bin/next');
const child = spawn(process.execPath, [next, ...process.argv.slice(2)], {
  cwd: wiki,
  stdio: 'inherit',
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code, signal) => {
  const status = code ?? (signal ? 1 : 0);
  if (status === 0 && process.argv[2] === 'build') {
    const moves = flattenSegments(join(wiki, 'out'));
    console.log(`flatten-segments: ${moves.length} nested prefetch segment file(s) moved to their flat names`);
  }
  process.exit(status);
});

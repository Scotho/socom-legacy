import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { REGISTRY_DIR, loadRegistry, report } from './parityRegistry';

/**
 * The parity registry's report (the test-architecture plan's TA.R4; `docs/parity/registry/README.md`): the coverage
 * by area and by level as markdown, then the entries with an `owed` (each marked held in CI, held only with data, or no
 * test) and the drift entries, then any problem the validator finds (`report` in `tools/parityRegistry.ts`, held by
 * `tools/test/parityRegistry.test.ts`). A tool, not committed output: run it from `socomlegacy/`,
 *
 *   npx tsx tools/parity-report.ts
 *
 * Exits 1 when the registry has a problem (the same rules `tools/test/parityRegistry.test.ts` holds), else 0.
 */
const REDOTCOM = resolve(import.meta.dirname, '..');
const { text, problems } = report(loadRegistry(resolve(REDOTCOM, REGISTRY_DIR)), {
  exists: (p) => existsSync(resolve(REDOTCOM, p)),
  readText: (p) => readFileSync(resolve(REDOTCOM, p), 'utf8'),
});
console.log(text);
process.exitCode = problems.length > 0 ? 1 : 0;

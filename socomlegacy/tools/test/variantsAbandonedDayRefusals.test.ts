// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { buildAbandonedDay, S1_INPUT_FILES } from '../variants/buildAbandonedDay';

/**
 * DAY-FIX2 F5 (product track: a tool; the batch 2 review's F5): the Abandoned (Day) builder's two refusals, with no
 * disc. A changed input file (its sha256 not the pin) is refused before any map is loaded -- `disc` names a directory
 * that does not exist, so a load would fail with another message; `--out` under the repository is refused. The
 * builder's repository is the tree it runs from (`REPO = HERE/../../..`, the worktree here), not every checkout on the
 * host: that behaviour is kept, not widened.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const TMP = mkdtempSync(join(tmpdir(), 'day-refusals-'));
afterAll(() => rmSync(TMP, { recursive: true, force: true }));

describe('buildAbandonedDay refusals (DAY-FIX2 F5)', () => {
  it('an input file whose sha256 is not its pin is refused before any map load', async () => {
    const s1Dir = join(TMP, 's1');
    for (const f of S1_INPUT_FILES) {
      mkdirSync(dirname(join(s1Dir, f)), { recursive: true });
      writeFileSync(join(s1Dir, f), 'not the study\'s file');
    }
    const disc = join(TMP, 'no-disc-here');
    const out = join(TMP, 'out');
    await expect(buildAbandonedDay({ disc, s1Dir, out })).rejects.toThrow(/s1-MP5\.world-verts\.f32 has sha256 [0-9a-f]{64}, pinned 9b65fb56/);
  });

  it('--out under the repository is refused', async () => {
    await expect(buildAbandonedDay({ disc: join(TMP, 'no-disc-here'), s1Dir: join(TMP, 'no-s1-here'), out: join(REPO, 'socomlegacy', 'tmp-day-out') }))
      .rejects.toThrow(/is inside the repository/);
  });
});

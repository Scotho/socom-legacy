// @vitest-environment node
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { loadMap } from '../src/loadMap';
import { buildWorld } from '../src/world';

/**
 * Research 439 s4a (the main controller's word, 2026-11-16 ~21:3xZ): the per-visual band must not cost draws where the
 * picture does not need them. Banding each part drawn a mesh per placement raised Blizzard's draws from 1020 to 1483
 * (the clutter trees' trunks); an UNRAMPED banded part stays one instanced draw (an instance outside its band hidden by
 * the zero matrix), and only a RAMPED part is a mesh per placement, as the `lod.rdr` copies were before. The page's draws
 * figure is `revealWorld + revealProps` (`main.ts`); measured here without a GPU, on every map of the disc. Reads
 * `SOCOM_DISC` (else `<SOCOM_PC_ROOT>/game/disc`) and SKIPS without it -- a skip is said, never a pass.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = [process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : '', PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '']
  .find((d) => d !== '' && existsSync(join(d, 'RUN/MP1.ZDB'))) ?? '';
const SKIP = DISC ? '' : ' -- SKIPPED: SOCOM_DISC / SOCOM_PC_ROOT with RUN/MP1.ZDB absent (no fixtures)';

/** The draws at the base, 4853eae49f (before research 439), the same measure, every map. */
const BASE: Record<string, number> = {
  M51: 1278, M52: 1988, M53: 1742, M61: 1327, M62: 1328, M63: 1178, M71: 899, M72: 1733, M73: 1363, M81: 1376, M82: 3418,
  M83: 1545, MP1: 1020, MP10: 732, MP11: 333, MP12: 246, MP2: 628, MP5: 343, MP51: 658, MP52: 524, MP53: 389, MP6: 725,
  MP61: 911, MP62: 643, MP64: 1251, MP7: 469, MP71: 766, MP72: 791, MP73: 1315, MP8: 289, MP81: 749, MP82: 795, MP83: 1516,
  MP9: 1551,
};
/**
 * What may rise over the base, named: the RAMPED banded parts' meshes per placement where `lod.rdr` did not name the copies
 * (MP9 170, MP64 112, MP10 29, MP6 13, M82 1; a per-instance fade opacity is LATER 1136), and the banded world-model nodes
 * drawn apart (MP62 44, MP6 17, MP7 8, M82 5, MP11 3, MP5 2). Every other map: at or under the base.
 */
const RESIDUE: Record<string, number> = { MP9: 170, MP64: 112, MP10: 29, MP6: 30, MP62: 44, MP7: 8, M82: 6, MP11: 3, MP5: 2 };
/**
 * The draws as built (research 439 s4a), pinned: the base plus the residue, or under it where `lod.rdr`'s copies were a
 * mesh per placement before and are one instanced draw now (MP2 -39, MP73 -16, M81 -55).
 */
const BUILT: Record<string, number> = {
  M51: 1278, M52: 1988, M53: 1742, M61: 1327, M62: 1328, M63: 1178, M71: 899, M72: 1733, M73: 1363, M81: 1321, M82: 3424,
  M83: 1545, MP1: 1020, MP10: 761, MP11: 336, MP12: 246, MP2: 589, MP5: 345, MP51: 658, MP52: 524, MP53: 389, MP6: 755,
  MP61: 911, MP62: 687, MP64: 1363, MP7: 477, MP71: 766, MP72: 791, MP73: 1299, MP8: 289, MP81: 749, MP82: 795, MP83: 1516,
  MP9: 1721,
};

const draws = async (stem: string): Promise<number> => {
  const view = buildWorld(await loadMap(new FsAssetSource(DISC), `RUN/${stem}.ZDB`));
  return view.revealWorld.length + view.revealProps.length;
};

describe.skipIf(!DISC)(`research 439: the band costs no draws the picture does not need, on the disc${SKIP}`, () => {
  it('Blizzard (MP1) draws what it drew before the band: 1020 -- its trees\' trunks one instanced draw per part', async () => {
    expect(await draws('MP1')).toBe(1020);
  });

  it('every map at or under its base draws but for the named residue', async () => {
    const stems = readdirSync(join(DISC, 'RUN')).filter((f) => /^M(P)?\d+\.ZDB$/i.test(f)).map((f) => f.replace(/\.ZDB$/i, '')).sort();
    expect(stems).toEqual(Object.keys(BASE).sort());
    const over: string[] = [];
    const got: Record<string, number> = {};
    for (const stem of stems) {
      const n = await draws(stem);
      got[stem] = n;
      if (n > BASE[stem]! + (RESIDUE[stem] ?? 0)) over.push(`${stem}: ${n} > ${BASE[stem]} + ${RESIDUE[stem] ?? 0}`);
    }
    expect(over).toEqual([]);
    expect(got).toEqual(BUILT);
    for (const stem of stems) expect(BUILT[stem]!, stem).toBeLessThanOrEqual(BASE[stem]! + (RESIDUE[stem] ?? 0));
  }, 600_000);
});

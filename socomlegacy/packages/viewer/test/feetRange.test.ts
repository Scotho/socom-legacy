import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { FIXTURES_ABSENT, fixture } from '../../archive/test/fixtures';
import { FEET_RANGE, feetOriginOf } from '../src/net/codec';
import { loadSimMap } from '../src/simMap';

/**
 * NET-WIRE (protocol 11; research 224): the feet's i16 at `FEET_STEP` reach `FEET_RANGE` (4095.875 units) from the
 * frame's origin, the room's map's bounds' centre (`feetOriginOf` of its hull). Every map's hull must lie inside that
 * reach with room to spare for a body above or beside it (a jump, a fall): checked over every map archive on the disc
 * (the 22 multiplayer maps and the single-player ones), and over the extracted fixtures without it. A dev-disc test.
 */
const MARGIN = 1000;
const DISC = process.env.SOCOM_DISC;
const RUN = DISC ? resolve(DISC, 'RUN') : '';
const HAVE_DISC = !!DISC && existsSync(resolve(RUN, 'MP2.ZDB'));
const FIXTURES = resolve(__dirname, '../../../test-fixtures');

async function farthest(root: string, stem: string): Promise<number> {
  const map = await loadSimMap(new FsAssetSource(root), `RUN/${stem}.ZDB`);
  const p = map.ground.points, o = feetOriginOf(p);
  let far = 0;
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) far = Math.max(far, Math.abs(p[i + k]! - o[k]!));
  return far;
}

describe('the feet range covers every map (protocol 11)', () => {
  it.skipIf(!fixture('RUN/MP2.ZDB'))(`the extracted fixtures' maps lie within the range less ${MARGIN} units${fixture('RUN/MP2.ZDB') ? '' : ` (${FIXTURES_ABSENT})`}`, async () => {
    for (const stem of ['MP2', 'MP6', 'MP72']) {
      if (!fixture(`RUN/${stem}.ZDB`)) continue;
      expect(await farthest(FIXTURES, stem), stem).toBeLessThanOrEqual(FEET_RANGE - MARGIN);
    }
  });

  it.skipIf(!HAVE_DISC)(`every map archive on the disc lies within the range less ${MARGIN} units${HAVE_DISC ? '' : ' (SOCOM_DISC absent)'}`, async () => {
    const stems = readdirSync(RUN).filter((n) => /^MP?\d+\.ZDB$/.test(n)).map((n) => n.slice(0, -4));
    expect(stems.length).toBeGreaterThanOrEqual(22);
    const worst = { stem: '', far: 0 };
    for (const stem of stems) {
      const far = await farthest(DISC!, stem);
      if (far > worst.far) { worst.stem = stem; worst.far = far; }
      expect(far, stem).toBeLessThanOrEqual(FEET_RANGE - MARGIN);
    }
    expect(worst.stem).toBe('M51');                              // 6,009 units across x: the widest hull, 3,005 from its centre
    expect(Math.round(worst.far)).toBe(3005);
  }, 600_000);
});

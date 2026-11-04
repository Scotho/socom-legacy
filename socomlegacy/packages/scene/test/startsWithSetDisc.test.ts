import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseZdb, zdbMember, Zar } from '@s2u/archive';
import { parseAnimSets } from '../src';

/**
 * LATER 486 (dev-disc, `SOCOM_DISC`; skipped and said without it): the original's set activation starts an animation
 * whose `params.flags & 7` is 1 (`FUN_002713f0` D:L119327-119333; research 106 §158-159), where the viewer tests
 * `flags & 3 == 1` (`packages/viewer/src/mapMeta.ts` `AUTOSTART_INITIAL_READING`). The two disagree only at `& 7 == 5`
 * (bit 2 set, bit 1 clear): 3 and 7 fail both tests. This counts every map's MZANIM animations by `flags & 7`.
 */
const DISC = process.env.SOCOM_DISC;
const RUN = DISC ? resolve(DISC, 'RUN') : null;
const HAVE = !!RUN && existsSync(RUN);

function histogram(): { byLow3: Record<number, number>; maps: number; differing: string[] } {
  const byLow3: Record<number, number> = {};
  const differing: string[] = [];
  let maps = 0;
  for (const file of readdirSync(RUN!).filter((f) => /\.ZDB$/i.test(f)).sort()) {
    const bytes = new Uint8Array(readFileSync(resolve(RUN!, file)));
    let zar: Uint8Array;
    try { zar = zdbMember(bytes, parseZdb(bytes), 'MZANIM.ZAR'); } catch { continue; }
    maps++;
    for (const set of parseAnimSets(Zar.parse(zar)).sets) {
      for (const a of set.anims) {
        const low = a.params.flags & 7;
        byLow3[low] = (byLow3[low] ?? 0) + 1;
        if (low === 5) differing.push(`${file}:${a.name}`);
      }
    }
  }
  return { byLow3, maps, differing };
}

describe.skipIf(!HAVE)(`LATER 486: map animations whose flags & 7 tell the viewer's & 3 from the original's & 7${HAVE ? '' : ' (SOCOM_DISC absent: skipped)'}`, () => {
  it('no map animation has flags & 7 == 5, so the two gates agree on every one (2026-10-26: 34 maps; & 7 = 1, 2, 3 only)', () => {
    const h = histogram();
    expect(h.differing).toEqual([]);                                 // the one value where & 3 == 1 and & 7 == 1 differ
    expect(Object.keys(h.byLow3).map(Number).sort()).toEqual([1, 2, 3]);
    expect(h.byLow3).toEqual({ 1: 634, 2: 3623, 3: 330 });          // the disc as read 2026-10-26 (SOCOM_DISC, r0001)
    expect(h.maps).toBe(34);
  });
});

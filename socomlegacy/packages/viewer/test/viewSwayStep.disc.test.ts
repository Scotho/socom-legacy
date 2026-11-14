import { describe, expect, it } from 'vitest';
import { readKitTable, type WeaponRecord } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { VIEW_SWAY_STEP_ADAPTATION } from '../src/net/codec';

/**
 * WIRE-16 (PV-1; research 402 s3, s7): `VIEW_SWAY_STEP_ADAPTATION`, the PS2 pixels one unit of the wire's sway i8 is,
 * re-checked against the disc. The scope's sway (`../src/accuracy` `Accuracy.sway`) is held inside `swayLimit`:
 * `SniperDistLimitX`/`Y` x (0.8 cur + 0.2), cur at most 1 -- so never past the record's own `SniperDistLimit*`. Every
 * record `readKitTable` reads off `RUN/ZWEAPON.ZAR` (`zweapon.rdr`'s ZWEAPON, each stance's `SniperDistLimitX` and
 * `SniperDistLimitY` as `swayLimitX` and `swayLimitY`; the rounds and throwables carry no reticle stances) must fit in +-127 steps.
 * A dev-disc test: without the disc or the fixture tree it skips, and a skip is not a pass.
 */

const zweapon = fixture('RUN/ZWEAPON.ZAR');

describe.skipIf(!zweapon)(`VIEW_SWAY_STEP_ADAPTATION against every weapon record on the disc${zweapon ? '' : ` -- skipped: ${FIXTURES_ABSENT}`}`, () => {
  it('no stance of any record has a SniperDistLimit past 127 steps; the largest is 60 (the M82A1A and the M87ELR, stand, x)', () => {
    const table = readKitTable(zweapon!);
    const records: WeaponRecord[] = [...table.records.values()];
    expect(records).toHaveLength(44);                             // every firearm record (scene's golden weapon-records.json)
    let largest = 0;
    const at: string[] = [];
    for (const r of records) {
      for (const [stance, s] of Object.entries(r.stances)) {
        const limit = Math.max(Math.abs(s.swayLimitX), Math.abs(s.swayLimitY));
        expect(limit, `${r.name} ${stance}`).toBeLessThanOrEqual(127 * VIEW_SWAY_STEP_ADAPTATION);
        if (limit > largest) { largest = limit; at.length = 0; }
        if (limit === largest) at.push(`${r.name} ${stance} ${s.swayLimitX === limit ? 'x' : 'y'}`);
      }
    }
    expect(largest).toBe(60);
    expect(at.sort()).toEqual(['M82A1A stand x', 'M87ELR stand x']);
  });
});

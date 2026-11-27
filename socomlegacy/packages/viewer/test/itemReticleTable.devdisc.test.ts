import { describe, expect, it } from 'vitest';
import { Zar, parseRdr, rdrGet, type RdrNode } from '@s2u/archive';
import { readKitTable, weaponCategory } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { ITEM_RETICLE_ZERO_CATEGORIES } from '../src/accuracy';

/**
 * SWAP-FIRE P1 (keyjob SWAP-FIRE (i) section 8, first line; research 321 section 7.8): the items' reticle records the
 * launch's reticle step (r4 0x5ca830, r0001 `FUN_005c3360`) reads, printed off the disc's `zweapon.rdr` through the
 * repository's reader (`KitTable.itemReticles`, `weaponStances`) for every item of the four classes (0x79, 0x97, 0xbe,
 * 0xc9) -- so the launch's bump is a read number, not "2 to 6". Each record's `TargetDilateUponFire`, `ReticuleKnock`,
 * `KnockCount`, `KnockEntryStrength`, `ReticuleKnockMax`, `TargetMin`, `TargetMax`, and whether it carries the burst
 * keys (`AccBurstCnt_Min/Max`, `AccScalar_Min/Max`; none does: `ITEM_LAUNCH_BURST_SCALAR_READING`). Reads the fixture
 * `RUN/ZWEAPON.ZAR` (a byte copy of the disc's); skips without it, and the skip is said in its title.
 */
const zweapon = fixture('RUN/ZWEAPON.ZAR');
/** A key of a node that may be absent (absent: undefined); with `k2`, that key's key. */
const at = (n: RdrNode | undefined, k: string, k2?: string): RdrNode | undefined => {
  const v = n === undefined ? undefined : rdrGet(n, k);
  return k2 === undefined ? v : at(v, k2);
};

describe.skipIf(zweapon === null)(`SWAP-FIRE P1: every item's reticle record, as the launch's step reads it${zweapon ? '' : ` (skipped: ${FIXTURES_ABSENT})`}`, () => {
  it('every item of the four classes: DilateUponFire 13, TargetMin 2, TargetMax 6, knock 13/9/9, KnockCount 3, entry 1, KnockMax 70; no burst keys', () => {
    const table = readKitTable(zweapon!);
    const zar = Zar.parse(zweapon!);
    const key = zar.root.children.find((k) => k.name.toLowerCase() === 'zweapon.rdr')!;
    const records = rdrGet(parseRdr(zar.data(key)), 'ZWEAPON') as RdrNode[];
    const rows: string[] = [];
    expect(table.itemReticles!.size).toBeGreaterThanOrEqual(13);
    for (const [id, st] of table.itemReticles!) {
      const name = table.arsenal.items.get(id)!.name;
      expect(ITEM_RETICLE_ZERO_CATEGORIES, `${id} ${name}`).toContain(weaponCategory(id));
      const node = records.find((r) => rdrGet(r, 'InternalName') === name)!;
      expect(node, `${id} ${name}`).toBeDefined();
      for (const k of ['AccBurstCnt_Min', 'AccBurstCnt_Max', 'AccScalar_Min', 'AccScalar_Max']) expect(rdrGet(node, k), `${name} ${k}`).toBeUndefined();
      for (const [stance, knock] of [['stand', 13], ['crouch', 9], ['prone', 9]] as const) {
        const s = st[stance];
        expect([s.dilateFire, s.knock, s.knockCount, s.knockEntry, s.knockMax, s.targetMin, s.targetMax], `${id} ${name} ${stance}`)
          .toEqual([13, knock, 3, 1, 70, 2, 6]);
        const stated = (k: string): string => (at(at(node, 'Reticule_Modifiers'), `STANCE_${stance.toUpperCase()}`, k) === undefined ? `${k} not stated (the stance constructor's default, FUN_003c59c0)` : `${k} stated`);
        rows.push(`${id} ${name} ${stance}: ${stated('KnockCount')}, ${stated('KnockEntryStrength')}; dilateFire ${s.dilateFire} knock ${s.knock} knockCount ${s.knockCount} knockEntry ${s.knockEntry} knockMax ${s.knockMax} targetMin ${s.targetMin} targetMax ${s.targetMax}`);
      }
    }
    console.log(rows.join('\n'));
  });
});

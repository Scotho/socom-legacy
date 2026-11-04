// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { weaponRecord } from '../src/weapons';

/**
 * The keys no reader takes (registry `weapons.table.unreadkeys`; research 94 §C1, table row 3-4): the per-stance
 * `AccuracyBurstCnt_*`/`AccuracyScalar_*`, `TracerTextureName` and the 870's `ReloadAfterShotDelay` have no string in
 * the ELF (0x3fc6d0-0x3fcd70), and `Encumbrance` is parsed to +0x38 and never read (FUN_003d29f0 D:L322491-322495).
 * The synthetic script is `parseRdr`'s shape, as `weapons.test.ts`'s `rec()` spells it.
 */

/** A `key (value)` pair list the way `parseRdr` hands a record back (`weapons.test.ts` `rec`). */
const rec = (...pairs: [string, RdrNode][]): RdrNode[] => pairs.flatMap(([k, v]) => [k, Array.isArray(v) ? v : [v]]);

const stance = (extra: [string, RdrNode][]): RdrNode[] =>
  rec(['ReticuleKnock', '12'], ['ReticuleKnockReturn', '70'], ['ReticuleKnockMax', '45'], ['TargetMin', '1'], ...extra);
const perStance: [string, RdrNode][] = [
  ['AccuracyBurstCnt_Min', '2'], ['AccuracyBurstCnt_Max', '6'], ['AccuracyScalar_Min', '0.01'], ['AccuracyScalar_Max', '0.05'],
];
const script = (unread: boolean): RdrNode => ['ZAMMO', [rec(['InternalName', '9x19P'], ['ID', '1']), rec(['InternalName', '12 Gauge'], ['ID', '3'])], 'ZWEAPON', [rec(
  ['InternalName', '870'], ['FireWait', '0.75'], ['ID', '84'], ['NumMags', '5'], ['Ammo_Capacity', '8'], ['Maximum_Range', '393'],
  ['DecalSet', 'BULLET_MARK_SMALL'], ['AMMO_TYPES', [rec(['NAME', '12 Gauge'])]], ['ReloadAfterShot', []],
  ['Reticule_Modifiers', rec(['STANCE_STAND', stance(unread ? perStance : [])], ['STANCE_CROUCH', stance(unread ? perStance : [])])],
  ...(unread ? [['TracerTextureName', '(null)'], ['ReloadAfterShotDelay', '0.8'], ['Encumbrance', '3']] as [string, RdrNode][] : []),
  // A second record in each list, as the game's table has (and `weapons.test.ts`'s script).
), rec(['InternalName', 'M16A2'], ['FireWait', '0.1'], ['ID', '51'])]];

describe('the keys the weapon parser never reads', () => {
  it('weaponRecord is the same with and without the per-stance AccuracyBurstCnt_*/AccuracyScalar_*, TracerTextureName, ReloadAfterShotDelay and Encumbrance', () => {
    const without = weaponRecord(script(false), '870');
    const withUnread = weaponRecord(script(true), '870');
    expect(withUnread).toEqual(without);
    // The pump's lock stays the parser's default 0.01 s: the misspelt 0.8 is not taken (research 94 §C2.2).
    expect(JSON.stringify(withUnread)).not.toContain('0.8');
  });
});

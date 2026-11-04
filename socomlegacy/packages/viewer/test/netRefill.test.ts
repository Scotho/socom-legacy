import { describe, expect, it } from 'vitest';
import { itemClass, readKitTable } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { M79_ID, MGL_ID, NET_REFILL_MAGS_HIDDEN_READING, NET_REFILL_READING, netMagsHidden, netRefills } from '../src/net/netRefill';

/**
 * NET-REFILL N1 (research 312 §1-§3, §6 item 1): the network magazine refill's rule, the one module the room
 * (`packages/match/src/room.ts` `reload`) and the page (`../src/fire` `Fire`) both import.
 *
 * - `netRefills` is `FUN_005c2a90`'s network test (D:L477491-477497, D:L477518-477524): the record's class is 4, a pistol
 *   (`FUN_003d1e10` -> `FUN_003d1a60` D:L324336-324352: ids 4-30), in any network game; or, in a respawn game (the game's
 *   `+0xdc`, `FUN_002a7560` D:L149415-149433), its id passes `FUN_003d1d10` (D:L324404-324419: the primary classes SMG,
 *   rifle, shotgun, MG, sniper, grenade launcher) and is neither 0x8e (the MGL) nor 0x8f (the M79).
 * - `netMagsHidden` is the ammo box's test (`FUN_00237760` D:L85181-85188): the hand's class 4, or in a respawn game
 *   `FUN_003d1db0` (the same six classes, no id excluded -- the MGL and the M79 hidden).
 */

const PISTOL_MARK_23 = 15, RIFLE_M4A1 = 54, M203_HE = 171, LAW = 145, M67 = 121;
const CLASSIC = { respawn: false }, RESPAWN = { respawn: true };

describe('NET-REFILL N1: netRefills, FUN_005c2a90\'s network test (research 312 §3)', () => {
  it('the Mark 23 (15) in both rules; the M4A1 (54) in a respawn game only', () => {
    expect([netRefills(PISTOL_MARK_23, CLASSIC), netRefills(PISTOL_MARK_23, RESPAWN)]).toEqual([true, true]);
    expect([netRefills(RIFLE_M4A1, CLASSIC), netRefills(RIFLE_M4A1, RESPAWN)]).toEqual([false, true]);
  });

  it('never the MGL (0x8e, 142) or the M79 (0x8f, 143), a launcher round (the M203 HE, 171), the LAW (145) or the M67 (121) -- in a respawn game neither', () => {
    expect([MGL_ID, M79_ID]).toEqual([0x8e, 0x8f]);
    expect([MGL_ID, M79_ID].map((id) => itemClass(id))).toEqual(['grenadeLauncher', 'grenadeLauncher']);
    for (const id of [MGL_ID, M79_ID, M203_HE, LAW, M67]) expect([id, netRefills(id, RESPAWN), netRefills(id, CLASSIC)]).toEqual([id, false, false]);
  });

  it('the class ranges as FUN_003d1a60 gives them: every pistol id refills in both rules, every primary id but 142 and 143 in a respawn game only', () => {
    for (let id = 0; id <= 255; id++) {
      const c = itemClass(id);
      const primary = c === 'smg' || c === 'rifle' || c === 'shotgun' || c === 'mg' || c === 'sniper' || c === 'grenadeLauncher';
      expect([id, netRefills(id, CLASSIC)]).toEqual([id, c === 'pistol']);
      expect([id, netRefills(id, RESPAWN)]).toEqual([id, c === 'pistol' || (primary && id !== 142 && id !== 143)]);
    }
  });

  it('the names carry the readings research 312 §7 lists', () => {
    expect(NET_REFILL_READING).toMatch(/pistol/);
    expect(NET_REFILL_MAGS_HIDDEN_READING).toMatch(/MAGS/);
  });
});

describe('NET-REFILL N4: netMagsHidden, the ammo box\'s test (FUN_00237760 D:L85181-85188; research 312 §4.2)', () => {
  it('a pistol in both rules; a primary in a respawn game only -- the MGL and the M79 included; never a grenade, a launcher round or the LAW', () => {
    expect([netMagsHidden(PISTOL_MARK_23, CLASSIC), netMagsHidden(PISTOL_MARK_23, RESPAWN)]).toEqual([true, true]);
    expect([netMagsHidden(RIFLE_M4A1, CLASSIC), netMagsHidden(RIFLE_M4A1, RESPAWN)]).toEqual([false, true]);
    expect([netMagsHidden(MGL_ID, CLASSIC), netMagsHidden(MGL_ID, RESPAWN), netMagsHidden(M79_ID, RESPAWN)]).toEqual([false, true, true]);
    for (const id of [M203_HE, LAW, M67]) expect([id, netMagsHidden(id, RESPAWN)]).toEqual([id, false]);
  });
});

const zweapon = fixture('RUN/ZWEAPON.ZAR');
describe.skipIf(zweapon === null)(`NET-REFILL N1 on the disc's kit table (zweapon.rdr through readKitTable)${zweapon ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it('every pistol record refills in a classic game; every primary record but the MGL and the M79 in a respawn game; no other record in either', () => {
    const table = readKitTable(zweapon!);
    const records = [...table.records.values()];
    const pistols = records.filter((r) => itemClass(r.id) === 'pistol');
    expect(pistols.map((r) => r.name)).toEqual(expect.arrayContaining(['Mark 23', 'M9', 'DE .50']));
    for (const r of pistols) expect([r.name, netRefills(r.id, CLASSIC), netRefills(r.id, RESPAWN)]).toEqual([r.name, true, true]);
    const primaries = records.filter((r) => ['smg', 'rifle', 'shotgun', 'mg', 'sniper', 'grenadeLauncher'].includes(itemClass(r.id)));
    expect(primaries.map((r) => r.name)).toEqual(expect.arrayContaining(['M4A1', 'M60E3', '870', 'M40A1', 'MGL', 'M79']));
    for (const r of primaries) {
      const excluded = r.name === 'MGL' || r.name === 'M79';
      expect([r.name, netRefills(r.id, CLASSIC), netRefills(r.id, RESPAWN)]).toEqual([r.name, false, !excluded]);
    }
    expect(records.filter((r) => r.name === 'MGL' || r.name === 'M79').map((r) => r.id).sort()).toEqual([142, 143]);
    for (const r of records.filter((x) => !pistols.includes(x) && !primaries.includes(x))) {
      expect([r.name, netRefills(r.id, RESPAWN)]).toEqual([r.name, false]);
    }
  });
});

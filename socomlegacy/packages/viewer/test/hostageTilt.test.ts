import { describe, expect, it } from 'vitest';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { CIV_ANIMS, SEAL_ANIMS } from '../src/locomotion';
import { motionTableFromArchive } from '../src/motionTable';
import { escorteeTilts } from '../src/remotePlayers';
import { NORMALIZE_ABSENT, tiltWindowOf } from '../src/rootTilt';

/**
 * PRONE-TILT-2 (5) (research 217 s7.10; reading, pending review): the hostages. A hostage's body is the SEAL's actor
 * (`CSealEx`, vtable 0x6691a0, the one table that holds `FUN_005506a0`, research 189 #12: the same skeleton), so
 * `FUN_00548090` runs for it -- but every clip its No_weapon set plays (`civ_*`) has no `Normalize`, so a living hostage
 * tilts only on the knock's clips it takes from `GLOBAL` (`Land forward` / `Land backwards` (0.5, 0.9), `Prone cover`
 * bare; LATER 354). The page tilts a hostage while its snapshot carries a knock (`escorteeTilts`), level otherwise.
 */

describe('the hostages under the rule (FUN_005506a0 runs for the CSealEx body)', () => {
  it('a hostage tilts on the page only while a knock owns its body (a reaction or a get-up)', () => {
    const act = (name: string) => ({ name, serial: 1, t: 0.5, seconds: null, reversed: false });
    for (const name of ['fallForward', 'fallBackwards', 'landDeath', 'landBackwards', 'proneCover', 'getUp', 'getUpBackwards'])
      expect(escorteeTilts({ action: act(name) }), name).toBe(true);
    expect(escorteeTilts({ action: act('standToCrouch') })).toBe(false);
    expect(escorteeTilts({ action: null })).toBe(false);
  });

  it('the knock\'s windows a hostage takes from GLOBAL are the SEAL\'s', () => {
    expect(tiltWindowOf(SEAL_ANIMS.landDeath)).toEqual([0.5, 0.9]);
    expect(tiltWindowOf(SEAL_ANIMS.landBackwards)).toEqual([0.5, 0.9]);
    expect(tiltWindowOf(SEAL_ANIMS.proneCover)).toEqual([0, 0]);
    for (const clip of Object.values(CIV_ANIMS)) expect(tiltWindowOf(clip), clip).toEqual(NORMALIZE_ABSENT);
  });
});

const READERC = fixture('RUN/READERC.ZAR');
describe.skipIf(!READERC)(`the No_weapon set's clips against the disc${READERC ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it('no civ_* clip carries a Normalize (motion.rdr): a living hostage off a knock weighs 0 and lies level', () => {
    const table = motionTableFromArchive(READERC!)!;
    let seen = 0;
    for (const clip of Object.values(CIV_ANIMS)) {
      const e = table.get(clip);
      if (!e) continue;
      seen++;
      expect(e.normalize ?? NORMALIZE_ABSENT, clip).toEqual(NORMALIZE_ABSENT);
    }
    expect(seen).toBeGreaterThan(5);
  });
});

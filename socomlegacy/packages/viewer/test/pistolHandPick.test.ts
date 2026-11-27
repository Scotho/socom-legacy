import { describe, expect, it } from 'vitest';
import { handAnim, HAND_ANIMS, PISTOL_HAND_ANIMS, PISTOL_HAND_SWAP_CLIPS, PLACE_CLAYMORE_ANIM, PUT_ON_WALL_ANIM, THROW_ANIMS } from '@s2u/scene';
import { GrenadeCore } from '../src/grenadeCore';
import type { PlaySnapshot } from '../src/walk';

/**
 * LATER 1442 (reading, pending review): with the sidearm in the hand (`+0xf79` 2) the hand pass swaps a throw's or a
 * placing's type for its pistol pair ONLY where the type's anim-set record has byte +5 bit 1 (`FUN_0058c960` D:L448200 on,
 * the test `FUN_005e3ac0` D:L495755-495768; r0004 the hand pass 0x592050 -> 0x591f10, the test 0x591fec -> 0x5eb290 /
 * 0x5eb2c8). The fixed list that sets that bit (`FUN_005e0690` D:L494815-494950; r0004 0x5e89a0-0x5e9154) holds, among
 * the throw and placing types, only `Peek right toss` and `Peek left toss` (`DAT_003deb20` / `DAT_003deb30`, D:L494910-
 * 494919, the types D:L495211 / D:L495213 name; the pairs D:L494720-494721) -- not `Throw grenade` (fixed type 0x31, its
 * pair D:L494735; `DAT_003debc8`, D:L494747) / `Toss grenade` (`DAT_003debe8`, D:L494750), not `Place claymore`
 * (`DAT_003deb48`), not type 0x3e `Put on wall`. *Was: `DAT_003deb00` / `DAT_003deb08` (D:L495207-495208), which are
 * `Prone peek left` / `Prone peek right` (the review's F5).* Captures of the original (unscored): ZOOMF1-PC2 (4 throws) and ZOOMF1B-PC2 (20 throws: standing clip 49,
 * crouched 243; no `Pistol throw grenade` in any state), WFEEL-C7-PC2 (the peek tosses switch, 240 / 241). The placings
 * are not captured: they keep the rifle's clip by the reading.
 */

const snap = (over: Partial<PlaySnapshot> = {}): PlaySnapshot => ({
  feet: [100, 50, 200], yaw: 90, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand',
  landing: null, jumps: 0, ...over,
} as PlaySnapshot);

/** The type the sidearm's throw at `power` pushes from `body` (`GrenadeCore` `throwStart`). */
function played(power: number, body: Partial<PlaySnapshot> = {}): string[] {
  const g = new GrenadeCore({ grid: () => null, snapshot: () => snap(body), view: () => 'third', pistol: () => true });
  g.setKit(['M67', 'M67', 'HE']);
  const out: string[] = [];
  g.on('throwStart', (e) => { out.push(e.anim.type); });
  expect(g.throwNow(power, false)).toBeNull();
  return out;
}

describe('LATER 1442: the pistol pair only for the bit-1 types (the two peek tosses)', () => {
  it('handAnim: the sidearm keeps the rifle\'s clip for every throw and placing but the two peek tosses', () => {
    for (const a of [THROW_ANIMS.standThrow, THROW_ANIMS.standToss, THROW_ANIMS.crouchThrow, THROW_ANIMS.proneThrow,
      THROW_ANIMS.proneToss, PLACE_CLAYMORE_ANIM, PUT_ON_WALL_ANIM]) expect(handAnim(a, true), a.type).toBe(a);
    expect(handAnim(THROW_ANIMS.peekRightToss, true).type).toBe('Pistol peek right toss');
    expect(handAnim(THROW_ANIMS.peekLeftToss, true).type).toBe('Pistol peek left toss');
    for (const a of HAND_ANIMS) expect(handAnim(a, false)).toBe(a);
  });

  it('the swap set is the two peek tosses; the other registered pairs stay as records, never picked', () => {
    expect([...PISTOL_HAND_SWAP_CLIPS].sort()).toEqual(['seal_toss_llean', 'seal_toss_rlean']);
    expect(Object.keys(PISTOL_HAND_ANIMS).sort()).toEqual([
      'seal_place_claymore', 'seal_put_onwall', 'seal_throwgrenade', 'seal_toss_llean', 'seal_toss_rlean', 'seal_tossgrenade',
    ]);
  });

  it('GrenadeCore with the sidearm: the standing throw plays `Throw grenade` (ZOOMF1-PC2 clip 49)', () => {
    expect(played(1)).toEqual(['Throw grenade']);
  });

  it('GrenadeCore with the sidearm: the standing toss plays `Toss grenade` (the reading; the bit is not set)', () => {
    expect(played(0.1)).toEqual(['Toss grenade']);
  });

  it('GrenadeCore with the sidearm: crouched-moving takes the standing type, `Throw grenade` (ZOOMF1B-PC2 49)', () => {
    expect(played(1, { stance: 'crouch', crouched: true, vx: 20 })).toEqual(['Throw grenade']);
  });

  it('GrenadeCore with the sidearm: the peek tosses still switch (WFEEL-C7-PC2 240 / 241)', () => {
    expect(played(1, { peek: 1, leanClip: true } as Partial<PlaySnapshot>)).toEqual(['Pistol peek right toss']);
    expect(played(1, { peek: -1, leanClip: true } as Partial<PlaySnapshot>)).toEqual(['Pistol peek left toss']);
  });
});

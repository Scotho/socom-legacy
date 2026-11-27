// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Scene } from 'three';
import { HELD_RIFLE, HELD_SIDEARM, type StanceScreenShake, type WeaponRecord } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import type { FireEvent } from '../src/fire';
import { Hud } from '../src/hud';
import { PlayerLoadout } from '../src/loadout';
import { mountFirearm, type MatchFirearmDeps } from '../src/matchFirearm';
import { Play } from '../src/play';
import { RemotePlayers } from '../src/remotePlayers';
import { WalkMode } from '../src/walk';

/**
 * BUG-L250 SHOT-SHAKE (research 83 s5; reading, pending review): the weapon release `FUN_005c5340` (D:L479251-479265),
 * on each round of the local player's body (`+0x830`) whose slot record's id is of a primary class (`FUN_003d1d10`) or the
 * pistol class (`FUN_003d1ce0`) and is not 0x0b, reads the record's stance row at `FUN_0058a720(body, 1)` and, when both
 * of its `dps` (`+0x58`, `+0x68`) are non-zero, starts the screen shake `FUN_002994e0` with its eight values. The port:
 * `MatchFirearm`'s own-round subscriber hands `fly.shakeScreen` the stance's `screenShake` (`@s2u/scene` weapons).
 * A turret's id (205-229, class 0xcd, `FUN_003d1a60` D:L324331-324352) passes neither class test, so a mounted round
 * starts none, though PKM and LMG TURRET carry the block.
 */

afterEach(() => { vi.restoreAllMocks(); });

const MG: StanceScreenShake = { x: { base: 1, rand: 1, decr: 1, dps: 1600 }, y: { base: 1, rand: 1, decr: 1, dps: 2400 } };
const CROUCH: StanceScreenShake = { x: { base: 2, rand: 1, decr: 1, dps: 1600 }, y: { base: 2, rand: 1, decr: 1, dps: 2400 } };
const withShake = (r: WeaponRecord, id: number, name: string, shakes: [StanceScreenShake | null, StanceScreenShake | null, StanceScreenShake | null]): WeaponRecord => ({
  ...r, id, name,
  stances: {
    stand: { ...r.stances.stand, screenShake: shakes[0] },
    crouch: { ...r.stances.crouch, screenShake: shakes[1] },
    prone: { ...r.stances.prone, screenShake: shakes[2] },
  },
});
/** An M60E3-like record (ID 91, class MG: `FUN_003d1d10`), its crouch row told apart. */
const M60 = withShake(HELD_RIFLE, 91, 'M60E3', [MG, CROUCH, MG]);

function rig(records: readonly [WeaponRecord, WeaponRecord]) {
  vi.spyOn(PlayerLoadout.prototype, 'records').mockReturnValue(records);
  const scene = new Scene();
  const fly = new FlyCamera(document.createElement('canvas'));
  const walk = new WalkMode(fly);
  const firearm = mountFirearm({
    scene, fly, walk, play: new Play(), remote: new RemotePlayers(scene), hud: new Hud(), loadouts: new PlayerLoadout(),
    view: () => null, map: () => null, body: () => null, net: () => null, blocked: () => false, refreshFog: () => {},
  } as MatchFirearmDeps);
  const shake = vi.spyOn(fly, 'shakeScreen');
  const round = (): void => {
    (firearm.fire as unknown as { emit(e: FireEvent): void }).emit({
      type: 'round', weapon: { name: '', id: 0, fireAnim: null, sounds: { close: null, med: null, far: null, reload: null } },
      from: [0, 12, 0], to: [0, 12, -20], hit: false, rounds: 0, normal: null, material: null,
    });
  };
  return { fly, walk, firearm, shake, round };
}

describe('BUG-L250: the own round starts its stance row\'s ScreenShake (FUN_005c5340 D:L479251-479265)', () => {
  it('an M60E3-like record: one shake a round, the stance row\'s eight values, at FUN_0058a720(body, 1) (`stanceInUse`)', () => {
    const { walk, shake, round } = rig([M60, HELD_SIDEARM]);
    const stance = vi.spyOn(walk, 'stanceInUse').mockReturnValue('stand');
    round();
    expect(shake).toHaveBeenCalledTimes(1);
    expect(shake).toHaveBeenLastCalledWith(MG);
    round(); round();
    expect(shake).toHaveBeenCalledTimes(3);
    stance.mockReturnValue('crouch');
    round();
    expect(shake).toHaveBeenCalledTimes(4);
    expect(shake).toHaveBeenLastCalledWith(CROUCH);
  });

  it('an M4A1-like record (no ScreenShake): never', () => {
    const { shake, round } = rig([HELD_RIFLE, HELD_SIDEARM]);
    round(); round();
    expect(shake).not.toHaveBeenCalled();
  });

  it('a row with one dps zero: never (both +0x58 and +0x68 must be non-zero)', () => {
    const half = { x: MG.x, y: { ...MG.y, dps: 0 } };
    const { shake, round } = rig([withShake(HELD_RIFLE, 91, 'M60E3', [half, half, half]), HELD_SIDEARM]);
    round();
    expect(shake).not.toHaveBeenCalled();
  });

  it('the pistol class passes (FUN_003d1ce0); its id 0x0b does not; a class of neither (a turret id in the hand) does not', () => {
    const pistol = (id: number) => withShake(HELD_SIDEARM, id, 'P', [MG, MG, MG]);
    for (const [id, calls] of [[15, 1], [0x0b, 0], [205, 0]] as const) {
      const { firearm, shake, round } = rig([HELD_RIFLE, pistol(id)]);
      firearm.kit.place('pistol');
      round();
      expect(shake, `id ${id}`).toHaveBeenCalledTimes(calls);
      vi.restoreAllMocks();
    }
  });

  it('a turret round with a shaking record (PKM TURRET-like, ID 205): none -- class 0xcd passes neither FUN_003d1d10 nor FUN_003d1ce0', () => {
    const { firearm, shake } = rig([HELD_RIFLE, HELD_SIDEARM]);
    const pkm = withShake({ ...HELD_RIFLE, maximumRange: 800, piercing: 4.5 }, 205, 'PKM TURRET', [MG, MG, MG]);
    firearm.turretRound(pkm, [7, 8, 9], [0, 0, -1], null, 1);
    firearm.turretRound(pkm, [7, 8, 9], [0, 0, -1], null, 2);
    expect(shake).not.toHaveBeenCalled();
  });
});

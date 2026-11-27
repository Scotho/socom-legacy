import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { buildGrid, CLAYMORE, HE, M67, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { GrenadeThrower } from '../src/grenade';
import { mountThrowables, type MatchThrowDeps } from '../src/matchThrow';
import { PlayerLoadout } from '../src/loadout';
import type { KitEquipmentWire } from '../src/net/protocol';
import type { PlaySnapshot } from '../src/walk';

/**
 * LATER 1129 (R142 head B, the page half; reading, pending review): the room's `kit` after a walk-over's equipment take
 * -- the rewritten loadout's equipment names, the slots the take wrote (`equipment`: an installed slot whole, a
 * topped-up one by `added`) and the kept Detonator (`detonator`, `FUN_005c74e0` D:L480156-480202 adds 0xc1 and nothing
 * removes it; `FUN_005bdc30` D:L474637-474641 gates it on claymores down alone) -- laid on the page's throwables
 * (`GrenadeThrower.takeRoomEquipment`), so the page throws what the room holds and still raises the Detonator the room
 * still honours. Was (head A, reverted at the 11-16 close): the page never told, its old ring thrown, the Detonator
 * offered and refused.
 */

const snap = (): PlaySnapshot => ({
  feet: [100, 50, 200], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand', landing: null, jumps: 0,
} as PlaySnapshot);
const floor = (): Grid => {
  const f: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/f', region: 0, ditype: 3, material: 7, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-2000, 50, 2000, 2000, 50, 2000, 2000, 50, -2000, -2000, 50, -2000]),
  };
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
  return buildGrid(params, [], [], [f], [{ modelName: 'worldmodel', path: 'worldmodel/f0', first: 0, count: 1 }]);
};
const run = (u: { update(dt: number): void }, seconds: number): void => { for (let t = 0; t < seconds - 1e-9; t += 1 / 60) u.update(1 / 60); };
function thrower(): GrenadeThrower {
  const grid = floor();
  return new GrenadeThrower({ grid: () => grid, snapshot: () => snap(), view: () => 'third', handPoint: () => [102, 62, 192] });
}
/** A full ring of `n` magazines of `capacity`, as the room's `EquipmentSlotState` has it. */
const full = (slot: number, kind: string, capacity: number, n: number): KitEquipmentWire =>
  ({ slot, kind, rounds: [...new Array<number>(n).fill(capacity), ...new Array<number>(10 - n).fill(0)], current: 0 });
/** Sets a claymore down from the kit's own slot (the page's placing). */
const setClaymore = (g: GrenadeThrower): void => {
  expect(g.select('Claymore'), 'harness: the claymore taken up').toBe(true);
  g.pull();
  run(g, 3);
  expect(g.stats().placed, 'harness: one claymore down').toBeGreaterThan(0);
};

describe('LATER 1129: the page takes the room\'s equipment take (reading, pending review)', () => {
  it('the case that sank head A: the HE installed over the Claymore slot is the page\'s to select and throw, with the room\'s rounds, and the Detonator is still raised with a claymore down', () => {
    const g = thrower();
    g.setKit(['M67', 'Claymore', null]);
    setClaymore(g);
    g.takeRoomEquipment(['M67', 'HE', null], [full(3, 'HE', HE.capacity, HE.mags)], true);
    expect(g.takeable(2)).toBe('HE');
    expect(g.stats().leftByItem.HE).toBe(HE.capacity * HE.mags);
    expect(g.takeable('detonator')).toBe('Detonator');
    expect(g.select('Detonator')).toBe(true);
  });

  it('a top-up adds what the pour wrote to the page\'s own count, a throw spent ahead of the room kept spent', () => {
    const g = thrower();
    g.setKit(['M67', null, null]);
    expect([M67.capacity, M67.mags], 'harness: the M67 one magazine of 3').toEqual([3, 1]);
    const ring = (n: number): number[] => [n, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    // Two thrown on the page: the room has the first (its ring at 2), the second is still in flight (the page's at 1).
    g.setLeft({ M67: 1 }, [{ slot: 2, kind: 'M67', rounds: ring(1), current: 0 }]);
    expect(g.stats().leftByItem.M67, 'harness: the page at 1').toBe(1);
    // The room's pour fills its ring 2 -> 3 (added 1); its `rounds` (3) are not newer than the page's for the in-flight throw.
    g.takeRoomEquipment(['M67', null, null], [{ slot: 2, kind: 'M67', rounds: ring(3), current: 0, added: ring(1) }]);
    expect(g.stats().leftByItem.M67).toBe(2);                             // 1 + 1; the room's own will fall to 2 at the throw
    // An installed slot (no `added`) is the room's whole.
    g.takeRoomEquipment(['M67', null, null], [{ slot: 2, kind: 'M67', rounds: ring(3), current: 0 }]);
    expect(g.stats().leftByItem.M67).toBe(3);
  });

  it('the Detonator is kept across a kit with no claymore -- the page\'s own flag (a claymore at the spawn) and the room\'s (`detonator`) -- and a new spawn\'s kit builds it again', () => {
    const g = thrower();
    g.setKit(['M67', 'Claymore', null]);
    setClaymore(g);
    g.takeRoomEquipment(['M67', 'HE', null], [full(3, 'HE', HE.capacity, HE.mags)]);   // the field absent: the page's own flag
    expect(g.takeable('detonator')).toBe('Detonator');
    g.setKit(['M67', 'HE', null]);                                          // a spawn's kit: FUN_005c74e0 finds no claymore
    expect(g.takeable('detonator')).toBeNull();
    g.keepDetonator(true);                                                  // a resume's `detonator`: the room kept it
    expect(g.takeable('detonator')).toBe('Detonator');
    expect(CLAYMORE.id).toBe(0x99);
  });
});

/** The throwables part on fakes (as `matchThrow.test.ts`'s rig): only what the R2 inventory's kit reads. */
function part() {
  const firearm = {
    shotRumble: () => {}, fire: { release: () => {}, magazineOf: () => ({ rounds: 0, capacity: 0, spare: 0, reloading: false }) },
    zoom: { state: () => 1 }, kit: { swapping: () => false, item: () => 'rifle', state: () => ({ swap: null }) },
    setZoom: () => {}, showFireMode: () => {}, item: () => 'rifle', record: () => ({ name: 'M4A1' }), records: () => [{}, {}], icon: () => 'm4.tif',
    selectFirearm: () => true, shoulderGate: () => true, kitFree: () => true,
  };
  const deps: MatchThrowDeps = {
    scene: new Scene(),
    walk: {
      grid: () => null, snapshot: () => null, view: () => ({}) as never, fireAim: () => null, feet: () => null, drawnFeet: () => null,
      hold: () => {}, mode: () => 'walk', isDead: () => false, fireAllowed: () => true, swapGate: () => true, onActionEnd: () => () => {},
      launcherRaised: () => {}, launcherLowered: () => {}, launcherCleared: () => {}, onLauncherStickLower: () => () => {},
    } as never,
    fly: { shakeScreen: () => {} },
    play: { partPoint: () => null, heldNode: () => null, itemNode: () => null, launcherNode: () => null, motionSource: () => null, setRifleStowed: () => {}, addPoseLayer: () => {} } as never,
    loadouts: new PlayerLoadout(), view: () => null, map: () => null,
    net: () => ({ throwEvent: () => {}, client: { bodies: () => [] } }) as never,
    firearm: () => firearm as never,
    audio: { onAnimCallback: () => null, onFire: () => null, play: () => {} } as never,
  };
  return { t: mountThrowables(deps), deps };
}

describe("LATER 1129, the review's F1: the R2 inventory lists the kept Detonator", () => {
  it("the menu's count stays six (the Detonator the sixth, FUN_005be030 reads the kit's +0x82c, which FUN_005c74e0 raised adding 0xc1 through FUN_005bdfb0 -> FUN_005bc410 D:L473825-473826) after an install over the claymore slot", () => {
    const { t, deps } = part();
    deps.loadouts.take([54, 15, M67.id, CLAYMORE.id, 255]);
    t.grenade.setKit(['M67', 'Claymore', null]);
    expect(t.inventoryKit().count, "harness: the spawn's kit lists the Detonator").toBe(6);
    deps.loadouts.take([54, 15, M67.id, HE.id, 255]);
    t.grenade.takeRoomEquipment(['M67', 'HE', null], [full(3, 'HE', HE.capacity, HE.mags)], true);
    expect(t.inventoryKit().count).toBe(6);
    t.grenade.setKit(['M67', 'HE', null]);                                  // a new spawn's kit with no claymore: five
    expect(t.inventoryKit().count).toBe(5);
  });
});

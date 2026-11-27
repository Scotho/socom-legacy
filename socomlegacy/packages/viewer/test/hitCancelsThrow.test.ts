import { describe, expect, it } from 'vitest';
import { buildGrid, CLAYMORE, type Grid, type GridParams, type ThrowableRecord, type WorldPoly } from '@s2u/scene';
import { GrenadeThrower, HIT_CANCEL_CLIP_PLACEHOLDER, HIT_CANCEL_FIREARM_PLACEHOLDER, type GrenadeItem, type ThrowInfo } from '../src/grenade';
import { C4_PLANT_SECONDS } from '../src/equipment';
import type { PlaySnapshot } from '../src/walk';

/**
 * R4P-248 (lead L258; the r0004 parity ready queue's row 62, its second read CONFIRMED WITH CORRECTIONS): r0004's
 * SetHealth (twin `0x0054c300`) calls `0x5bf4f0` on the kit on every health change that leaves a live SEAL above 0
 * (D4:L453015): the kit's pending bit (`+1` 0x02) and its timer (`+0x87c`) cleared (D4:L513359-513361) -- a throw, a
 * placing or a plant released and not yet out is cancelled: nothing launched, nothing spent, the item kept selected;
 * C4 (0x97) and the bomb (0x9a) also switch the hand: to the remembered `+0x828` slot first (`0x5bf57c..98`), else the
 * first primary, else the first secondary (`0x5bf5a0..670`). A held wind-up sets no kit bit and is
 * untouched. r0001 has no such call (its clears: D:L471752, D:L475503, D:L476897, D:L480877). The page's moment: the
 * room's `hurt` that leaves the own body alive with less health (`NetPage` `ownHurts`, `GrenadeSource.hurts`).
 */

const BASE = {
  feet: [100, 50, 200], yaw: 90, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand',
  landing: null, jumps: 0,
};
const DT = 1 / 60;
const DI = 'worldmodel/access1=access1/good_parts/di_good';
const C4: ThrowableRecord = { ...CLAYMORE, name: 'C4', id: 151, fuse: 6, removal: 0.1, explosionDamage: 18, explosionRadius: 50, model: 'c4', icon: 'c4.tif', capacity: 4 };

/** A floor at the feet' height and, with `wall`, a C4 target wall 15 u along +x (`grenade.test.ts`'s planter's). */
function grid(withWall: boolean): Grid {
  const f: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/f', region: 0, ditype: 3, material: 7, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-2000, 50, 2000, 2000, 50, 2000, 2000, 50, -2000, -2000, 50, -2000]),
  };
  const wall: WorldPoly = { ...f, path: DI, ditype: 2, points: Float32Array.from([115, 50, 150, 115, 50, 250, 115, 110, 250, 115, 110, 150]) };
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
  return withWall
    ? buildGrid(params, [], [], [f, wall], [
      { modelName: 'worldmodel', path: 'worldmodel/f0', first: 0, count: 1 }, { modelName: 'worldmodel', path: DI, first: 1, count: 1 },
    ])
    : buildGrid(params, [], [], [f], [{ modelName: 'worldmodel', path: 'worldmodel/f0', first: 0, count: 1 }]);
}

/**
 * A thrower over a still SEAL whose body shows the throw's hold from its start; `hit()` is one non-lethal `hurt`. `c4`:
 * facing the C4 target wall (yaw 0, +x); else facing open floor (yaw 90), where a throw clears.
 */
function rig(c4 = false, pistol = false) {
  const map = grid(c4);
  const yaw = c4 ? 0 : 90;
  let dead = false, hurts = 0;
  let hold: { clip: string; serial: number } | null = null;
  const snapshot = (): PlaySnapshot => ({ ...BASE, yaw, ...(hold ? { hold: hold.clip, holdSerial: hold.serial } : {}) }) as unknown as PlaySnapshot;
  const g = new GrenadeThrower({
    grid: () => map, snapshot, view: () => 'third' as never, dead: () => dead, hurts: () => hurts, pistol: () => pistol,
    handPoint: (): [number, number, number] => [102, 62, 192], aim: () => ({ eye: [100, 62, 200], far: [400, 62, 200] }),
  });
  g.setRecords([C4]);
  g.setWorld(() => ({ health: { blastAt: () => [], c4TargetAt: (path: string, damage: number) => (path === DI && damage >= 17 ? 0 : null) } }));
  const starts: { power: number; releaseIn: number; hold: string }[] = [];
  const throws: ThrowInfo[] = [];
  const cuts: { reason: string; item: GrenadeItem }[] = [];
  const placed: string[] = [];
  g.on('throwStart', (s) => { starts.push(s); hold = { clip: s.hold, serial: starts.length }; });
  g.on('throw', (t) => { throws.push(t); });
  g.on('place', (p) => { placed.push(p.item); });
  g.on('cut', (c) => { cuts.push(c); });
  const run = (seconds: number): void => { for (let i = 0; i < Math.round(seconds / DT); i++) g.update(DT); };
  return {
    g, starts, throws, cuts, placed, run,
    hit: (): void => { hurts++; },
    /** A new page's counter (`NetPage.ownHurts` from 0) under a core that lives on. */
    resetHurts: (): void => { hurts = 0; },
    kill: (): void => { dead = true; },
    pop: (): void => { hold = null; },
  };
}

/** The M67 up, held `seconds`, let go: the release request taken on the next update. */
function windUpAndRelease(r: ReturnType<typeof rig>, seconds = 0.5): void {
  r.g.setKit(['M67', 'AN-M8', 'C4']);
  expect(r.g.select('M67')).toBe(true);
  r.g.pull();
  r.run(seconds);
  expect(r.g.phase()).toBe('holding');
  r.g.release();
  r.g.update(DT);
  expect(r.starts).toHaveLength(1);
  expect(r.g.phase()).toBe('throwing');
}

/** Another wind-up and release of the M67 already up. */
function windUpAndRelease2(r: ReturnType<typeof rig>): void {
  r.g.pull();
  r.run(0.5);
  r.g.release();
  r.g.update(DT);
  expect(r.g.phase()).toBe('throwing');
}

describe('R4P-248: a non-lethal hit cancels a pending throw, placement or plant (r0004 D4:L453015, D4:L513359-513393)', () => {
  it('pins the placeholders as built', () => {
    expect(HIT_CANCEL_CLIP_PLACEHOLDER).toBe('plays out');
    expect(HIT_CANCEL_FIREARM_PLACEHOLDER).toBe('the firearm the page holds');
  });

  it('a throw released, its hand not open, hit: never launched, nothing spent, the M67 still selected; the clip plays out to ready', () => {
    const r = rig();
    windUpAndRelease(r);
    const left = r.g.stats().leftByItem.M67!;
    r.run(0.2);                                                   // early in the clip: the hand opens at ~0.71 s standing
    expect(r.throws).toEqual([]);
    r.hit();
    r.run(3);
    expect(r.throws).toEqual([]);
    expect(r.g.stats().live).toEqual([]);
    expect(r.g.stats().leftByItem.M67).toBe(left);
    expect(r.g.held()).toBe('M67');
    expect(r.g.phase()).toBe('ready');
    expect(r.cuts).toEqual([]);                                   // HIT_CANCEL_CLIP_PLACEHOLDER 'plays out': no cut
    expect(r.g.diag().pending).toBe(false);
  });

  it('the cancelled throw ends at its hold\'s pop too (the body\'s clip replaced), and the next press throws again', () => {
    const r = rig();
    windUpAndRelease(r);
    r.run(0.2);
    r.hit();
    r.g.update(DT);
    r.pop();
    r.g.update(DT);
    expect(r.g.phase()).toBe('ready');
    r.g.pull();
    r.run(0.5);
    r.g.release();
    r.run(2);
    expect(r.throws).toHaveLength(1);
  });

  it('a wind-up held (not released) is untouched: the hit changes nothing, the let-go throws at the power held', () => {
    const r = rig();
    r.g.setKit(['M67', 'AN-M8', 'C4']);
    expect(r.g.select('M67')).toBe(true);
    const left = r.g.stats().leftByItem.M67!;
    r.g.pull();
    r.run(0.3);
    const power = r.g.stats().power;
    r.hit();
    r.g.update(DT);
    expect(r.g.phase()).toBe('holding');
    expect(r.g.stats().power).toBeGreaterThanOrEqual(power);
    r.g.release();
    r.run(2);
    expect(r.throws).toHaveLength(1);
    expect(r.g.stats().leftByItem.M67).toBe(left - 1);
  });

  it('a lethal hit is the death\'s path, not this: cut for the death (once), nothing spent', () => {
    const r = rig();
    windUpAndRelease(r);
    const left = r.g.stats().leftByItem.M67!;
    r.run(0.2);
    r.kill();
    r.hit();                                                      // the page counts no lethal hurt; a stray count changes nothing
    r.run(2);
    expect(r.throws).toEqual([]);
    expect(r.cuts).toEqual([{ reason: 'death', item: 'M67' }]);
    expect(r.g.stats().leftByItem.M67).toBe(left);
  });

  it('a hit after the hand opened: the grenade flies on, spent', () => {
    const r = rig();
    windUpAndRelease(r);
    const left = r.g.stats().leftByItem.M67!;
    r.run(r.starts[0]!.releaseIn + 0.05);
    expect(r.throws).toHaveLength(1);
    r.hit();
    r.run(0.5);
    expect(r.throws).toHaveLength(1);
    expect(r.g.stats().live).toHaveLength(1);
    expect(r.g.stats().leftByItem.M67).toBe(left - 1);
  });

  it('a claymore\'s placing hit before its set-down: nothing set down or spent, the claymore still selected', () => {
    const r = rig();
    expect(r.g.select('Claymore')).toBe(true);
    const left = r.g.stats().leftByItem.Claymore!;
    r.g.pull();
    r.g.update(DT);
    expect(r.starts).toHaveLength(1);
    r.run(0.3);                                                   // the set-down at 1.3 s
    r.hit();
    r.run(3);
    expect(r.placed).toEqual([]);
    expect(r.g.stats().placing).toBe(false);
    expect(r.g.stats().leftByItem.Claymore).toBe(left);
    expect(r.g.held()).toBe('Claymore');
    expect(r.g.phase()).toBe('ready');
  });

  it('control: no hit, the C4 plant sets its charge and the hand goes back to the M67 it held before', () => {
    const r = rig(true);
    r.g.setKit(['M67', 'AN-M8', 'C4']);
    expect(r.g.select('M67')).toBe(true);
    r.run(0.3);                                                   // the reticle settles on the target (0.2 s)
    expect(r.g.plantC4()).toBe(true);
    r.run(C4_PLANT_SECONDS + 3);
    expect(r.placed).toEqual(['C4']);
    expect(r.g.held()).toBe('M67');
  });

  it('a C4 plant hit before its callback: no charge, nothing spent, the hand back to the M67 held before (+0x828 first)', () => {
    const r = rig(true);
    r.g.setKit(['M67', 'AN-M8', 'C4']);
    expect(r.g.select('M67')).toBe(true);
    const left = r.g.stats().leftByItem.C4!;
    r.run(0.3);
    expect(r.g.plantC4()).toBe(true);
    r.run(0.2);
    r.hit();
    r.g.update(DT);
    expect(r.g.held()).toBe('M67');                               // 0x5bf4f0 0x5bf57c..98: the remembered slot +0x828
    r.run(C4_PLANT_SECONDS + 100);                                // past the callback and C4's 99 s kit timer: nothing
    expect(r.placed).toEqual([]);
    expect(r.g.stats().live).toEqual([]);
    expect(r.g.stats().leftByItem.C4).toBe(left);
    expect(r.g.held()).toBe('M67');
  });

  it('a C4 plant from the sidearm hit before its callback: back to the firearm held before (+0x828), nothing set down', () => {
    const r = rig(true, true);
    r.g.setKit(['M67', 'AN-M8', 'C4']);
    const left = r.g.stats().leftByItem.C4!;
    r.run(0.3);
    expect(r.g.plantC4()).toBe(true);
    expect(r.g.held()).toBe('C4');
    r.run(0.2);
    r.hit();
    r.g.update(DT);
    expect(r.g.held()).toBeNull();                                // the firearm the page holds: the sidearm (./matchFirearm)
    expect(r.g.equipped()).toBe(false);
    r.run(C4_PLANT_SECONDS + 100);
    expect(r.placed).toEqual([]);
    expect(r.g.stats().leftByItem.C4).toBe(left);
  });

  it('a C4 selected by hand, its placing hit: nothing set down or spent, the hand switched to a firearm (+0x828 == -1)', () => {
    const r = rig(true);
    r.g.setKit(['M67', 'AN-M8', 'C4']);
    const left = r.g.stats().leftByItem.C4!;
    r.run(0.3);
    expect(r.g.equip(true, 'C4')).toBe(true);                     // no Action: no +0x828 remembered
    r.g.pull();
    r.g.update(DT);
    expect(r.starts).toHaveLength(1);
    expect(r.g.stats().placing).toBe(true);
    r.run(0.2);
    r.hit();
    r.g.update(DT);
    expect(r.g.held()).toBeNull();                                // 0x5bf5a0..670: the first primary, else the first secondary
    expect(r.g.equipped()).toBe(false);
    r.run(C4_PLANT_SECONDS + 100);
    expect(r.placed).toEqual([]);
    expect(r.g.stats().leftByItem.C4).toBe(left);
  });

  it("a new page's counter (back to 0) under a living core cancels nothing: the throw goes out", () => {
    const r = rig();
    r.hit();
    r.g.update(DT);                                               // seen: 1, nothing pending
    windUpAndRelease(r);
    r.run(0.2);
    r.resetHurts();                                               // no hit: a fresh NetPage's ownHurts_
    r.run(3);
    expect(r.throws).toHaveLength(1);
    r.hit();                                                      // after the resync, a hit counts again
    windUpAndRelease2(r);
    r.run(0.2);
    r.hit();
    r.run(3);
    expect(r.throws).toHaveLength(1);
  });
});

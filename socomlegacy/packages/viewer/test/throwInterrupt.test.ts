import { describe, expect, it } from 'vitest';
import { buildGrid, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { GrenadeThrower, KNOCKED_THROW_POWER_READING, type GrenadeItem, type ThrowInfo } from '../src/grenade';
import type { PlaySnapshot } from '../src/walk';

/**
 * THROW-INTERRUPT (research 326 §2.4; the owner's playtest of 2026-10-16: "knocked back and killed while throwing a
 * grenade ... the grenade throw still occurred"), the page's half. The original's death (`FUN_00547af0` -> `FUN_005b8920`,
 * D:L413023, D:L471751-471870) drops a throw released and not yet out at power 0 -- the room's to make; on the page the
 * death cuts the throw not yet let go (no let-go at the release's power, no `throw`, nothing spent) and a wind-up throws
 * nothing (`FUN_0059d830` refuses with the alive bit clear, D:L457349). A knock leaves the throw on the kit's timer
 * (nothing on its path clears `+0x87c`), with the power `KNOCKED_THROW_POWER_READING` reads.
 */

const BASE = {
  feet: [100, 50, 200], yaw: 90, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand',
  landing: null, jumps: 0,
};
const DT = 1 / 60;

/** A floor at the feet' height (as `grenade.test.ts`'s claymore floor), so a placing has ground under the hand. */
function floor(): Grid {
  const f: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/f', region: 0, ditype: 3, material: 7, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-2000, 50, -2000, 2000, 50, -2000, 2000, 50, 2000, -2000, 50, 2000]),
  };
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
  return buildGrid(params, [], [], [f], [{ modelName: 'worldmodel', path: 'worldmodel/f0', first: 0, count: 1 }]);
}

/** A thrower over a still SEAL whose body shows the throw's hold from its start, until a knock or the death takes it. */
function rig(grid: Grid | null = null) {
  let dead = false;
  let hold: { clip: string; serial: number } | null = null;
  const snapshot = (): PlaySnapshot => ({ ...BASE, ...(hold ? { hold: hold.clip, holdSerial: hold.serial } : {}) }) as unknown as PlaySnapshot;
  const g = new GrenadeThrower({
    grid: (): Grid | null => grid, snapshot, view: () => 'third' as never, dead: () => dead,
    ...(grid ? { handPoint: (): [number, number, number] => [102, 62, 192] } : {}),
  });
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
    kill: (): void => { dead = true; },
    knock: (): void => { hold = null; },                        // the knock pops the throw's clip off the body
  };
}

/** The M67 up, held `seconds`, let go: the release request taken on the next update. */
function windUpAndRelease(r: ReturnType<typeof rig>, seconds = 0.5): void {
  expect(r.g.equip(true, 'M67')).toBe(true);
  r.g.pull();
  r.run(seconds);
  expect(r.g.phase()).toBe('holding');
  r.g.release();
  r.g.update(DT);
  expect(r.starts).toHaveLength(1);
  expect(r.g.phase()).toBe('throwing');
}

describe('THROW-INTERRUPT: the page\'s own death and a knock before the hand opens (research 326 §2.4)', () => {
  it('control: alive, the throw leaves at its release with the release\'s power, one spent', () => {
    const r = rig();
    const left = r.g.stats().leftByItem.M67!;
    windUpAndRelease(r);
    r.run(2);
    expect(r.throws).toHaveLength(1);
    expect(r.throws[0]!.power).toBeCloseTo(r.starts[0]!.power, 9);
    expect(r.g.stats().leftByItem.M67).toBe(left - 1);
  });

  it('killed in the clip before the hand opens: cut -- no let-go, no throw, nothing spent, the meter at 0, the grenade still up', () => {
    const r = rig();
    const left = r.g.stats().leftByItem.M67!;
    windUpAndRelease(r);
    expect(r.starts[0]!.releaseIn).toBeGreaterThan(0.3);
    r.run(0.2);                                                   // early in the clip: the hand not open (0.71 s standing)
    expect(r.throws).toEqual([]);
    r.kill();
    r.run(2);
    expect(r.throws).toEqual([]);                                 // no full-power let-go, so no `throw` to send
    expect(r.cuts).toEqual([{ reason: 'death', item: 'M67' }]);
    expect(r.g.stats().leftByItem.M67).toBe(left);                // nothing spent on the page
    expect(r.g.stats().live).toEqual([]);                         // nothing drawn in the air
    expect(r.g.stats().power).toBe(0);                            // the throw meter cleared
    expect(r.g.phase()).toBe('ready');
  });

  it('killed in the wind-up (no release yet): nothing thrown, the wind-up dropped, and no trigger taken while dead', () => {
    const r = rig();
    const left = r.g.stats().leftByItem.M67!;
    expect(r.g.equip(true, 'M67')).toBe(true);
    r.g.pull();
    r.run(0.3);
    expect(r.g.stats().power).toBeGreaterThan(0.15);
    r.kill();
    r.g.update(DT);
    expect(r.g.phase()).toBe('ready');
    expect(r.g.stats().power).toBe(0);
    r.g.release();
    r.run(1);
    r.g.pull();                                                   // a press while dead: the dead's controller takes none
    r.run(0.5);
    r.g.release();
    r.run(1);
    expect(r.starts).toEqual([]);
    expect(r.throws).toEqual([]);
    expect(r.cuts).toEqual([]);                                   // no throw was under way to cut
    expect(r.g.stats().leftByItem.M67).toBe(left);
  });

  it('killed after the hand opened: the grenade flies on, spent; nothing is cut', () => {
    const r = rig();
    const left = r.g.stats().leftByItem.M67!;
    windUpAndRelease(r);
    r.run(r.starts[0]!.releaseIn + 0.05);
    expect(r.throws).toHaveLength(1);
    r.kill();
    r.run(0.5);
    expect(r.throws).toHaveLength(1);
    expect(r.cuts).toEqual([]);
    expect(r.g.stats().live).toHaveLength(1);
    expect(r.g.stats().leftByItem.M67).toBe(left - 1);
  });

  it('control: alive, a claymore placed on the floor is set down at 1.3 s and spent', () => {
    const r = rig(floor());
    r.g.select('Claymore');
    const left = r.g.stats().leftByItem.Claymore!;
    r.g.pull();
    r.run(2);
    expect(r.placed).toEqual(['Claymore']);
    expect(r.g.stats().leftByItem.Claymore).toBe(left - 1);
  });

  it('a claymore killed in its placing: cut, nothing set down or spent (a charge pending is cleared unspent, D:L471756-471759)', () => {
    const r = rig(floor());
    r.g.select('Claymore');
    const left = r.g.stats().leftByItem.Claymore!;
    expect(left).toBeGreaterThan(0);
    r.g.pull();
    r.g.update(DT);
    expect(r.starts).toHaveLength(1);
    r.run(0.3);                                                   // the set-down at 1.3 s
    r.kill();
    r.run(3);
    expect(r.placed).toEqual([]);
    expect(r.cuts).toEqual([{ reason: 'death', item: 'Claymore' }]);
    expect(r.g.stats().leftByItem.Claymore).toBe(left);
  });

  it('KNOCKED_THROW_POWER_READING (pinned as it reads, \'kept\'): knocked off its clip before the hand opens, the throw still leaves at the kit\'s timer with the release\'s power', () => {
    expect(KNOCKED_THROW_POWER_READING).toBe('kept');
    const r = rig();
    const left = r.g.stats().leftByItem.M67!;
    windUpAndRelease(r);
    r.run(0.2);
    r.knock();
    r.g.update(DT);
    expect(r.throws).toEqual([]);                                 // not out yet: the clip gone, the timer running
    r.run(r.starts[0]!.releaseIn);
    expect(r.throws).toHaveLength(1);
    expect(r.throws[0]!.power).toBeCloseTo(r.starts[0]!.power, 9);
    expect(r.cuts).toEqual([]);
    expect(r.g.stats().leftByItem.M67).toBe(left - 1);
  });
});

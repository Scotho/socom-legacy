import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { buildGrid, M67, type Grid, type GridParams, type ThrowableRecord, type WorldPoly } from '@s2u/scene';
import { GrenadeThrower, type GrenadeSource, type ThrowRefusal } from '../src/grenade';
import { mountThrowables, type MatchThrowDeps } from '../src/matchThrow';
import { PlayerLoadout } from '../src/loadout';
import { CLIMB_BODY_CLIPS } from '../src/traversal';
import type { PlaySnapshot } from '../src/walk';

/**
 * THROW_DIAG_ADAPTATION (LATER 247; a browser instrument with no original, changing nothing): `GrenadeThrower.diag` --
 * the hand's throw state and the last release request refused, by its reason in `startThrow` -- and the development
 * build's `window.__throwDiag` the part publishes (`./matchThrow`). The refusals themselves are unchanged; this pins
 * that each records its own reason, that a throw taken records none, and that reading changes nothing.
 */

const DT = 1 / 60;
const snapOf = (over: Partial<PlaySnapshot> = {}): PlaySnapshot => ({
  feet: [100, 50, 200], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand',
  landing: null, jumps: 0, ...over,
} as PlaySnapshot);

/** A floor at y 50 and, when `wallZ` is given, a wall across z there (as `grenade.test.ts`'s PAR-20 D12 world). */
function world(wallZ?: number): Grid {
  const poly = (points: number[], i: number, ditype = 3): WorldPoly => ({ modelName: 'worldmodel', path: `worldmodel/c${i}`, region: 0, ditype, material: 7, ptcount: 4, cameratype: 0, points: Float32Array.from(points) });
  const polys = [poly([-2000, 50, -2000, 2000, 50, -2000, 2000, 50, 2000, -2000, 50, 2000], 0)];
  if (wallZ !== undefined) polys.push(poly([0, 50, wallZ, 200, 50, wallZ, 200, 100, wallZ, 0, 100, wallZ], 1, 2));
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
  return buildGrid(params, [], [], polys, polys.map((p, i) => ({ modelName: 'worldmodel', path: `${p.path}${i}`, first: i, count: 1 })));
}

/** A launched round (class 0xab), one of the page's own, as `grenadeNetCap.test.ts` counts them. */
const ROUND: ThrowableRecord = { ...M67, id: 175, name: 'M203 FRAG', muzzleVelocity: 75, impact: true, armingDistance: 140 };

function rig(extra: Partial<GrenadeSource> = {}) {
  const at = { snap: snapOf(), dead: false };
  const g = new GrenadeThrower({ grid: () => null, snapshot: () => at.snap, view: () => 'third' as never, dead: () => at.dead, ...extra });
  let thrown = 0;
  g.on('throw', () => { thrown++; });
  expect(g.select('M67')).toBe(true);
  /** Pressed, held `frames` updates, let go; `atRelease` changes the world on the release's update. */
  const windUp = (frames: number, atRelease: () => void = () => {}): void => {
    g.pull();
    for (let i = 0; i < frames; i++) g.update(DT);
    g.release();
    atRelease();
    g.update(DT);
  };
  return { g, at, windUp, thrown: () => thrown };
}

const reasonOf = (g: GrenadeThrower): ThrowRefusal | null => g.diag().lastRefusal?.reason ?? null;

describe('THROW_DIAG_ADAPTATION: each refusal of the release request records its reason', () => {
  it("'power': a short tap (let go before the power reaches .15)", () => {
    const r = rig();
    r.windUp(0);
    expect(reasonOf(r.g)).toBe('power');
    expect(r.g.phase()).toBe('ready');
    expect(r.thrown()).toBe(0);
  });

  it("'clear': a wall across the standing throw's clearance segment (PAR-20 D12)", () => {
    const wall = world(190);
    const r = rig({ grid: () => wall });
    r.windUp(40);
    expect(reasonOf(r.g)).toBe('clear');
    expect(r.thrown()).toBe(0);
  });

  it("'airborne': off the floor on the release's update (PAR-86), the chase having read the floor the update before", () => {
    const r = rig();
    r.windUp(40, () => { r.at.snap = snapOf({ airborne: true }); });
    expect(reasonOf(r.g)).toBe('airborne');
  });

  it("'climb': a climb's clip on the release's update (NU-1b B6)", () => {
    const clip = [...CLIMB_BODY_CLIPS][0]!;
    const r = rig();
    r.windUp(40, () => { r.at.snap = snapOf({ traversal: { clip, frame: 0, loop: false, rootY: 0 } } as Partial<PlaySnapshot>); });
    expect(reasonOf(r.g)).toBe('climb');
  });

  it("'stance': a peek with no lean clip playing (the traversal seam: GetThrowAnim 0)", () => {
    const r = rig();
    r.windUp(40, () => { r.at.snap = snapOf({ peek: 1 }); });
    expect(reasonOf(r.g)).toBe('stance');
  });

  it("'dead': the hook's throw by a dead SEAL (the update's own death drops a wind-up before any release)", () => {
    const r = rig();
    r.at.dead = true;
    expect(r.g.throwNow(1)).toBeNull();
    expect(reasonOf(r.g)).toBe('dead');
  });

  it("'netCap': online with six of its own live (research 312 §10)", () => {
    const r = rig({ online: () => true });
    for (let i = 0; i < 6; i++) r.g.launchRound(ROUND, [-900 + i * 10, 300, 900], [0, 1, 0]);
    expect(r.g.throwNow(1)).toBeNull();
    expect(reasonOf(r.g)).toBe('netCap');
  });

  it("the refusal's `at` is the thrower's update count at the refusal", () => {
    const r = rig();
    for (let i = 0; i < 5; i++) r.g.update(DT);
    r.windUp(0);                                                   // the sixth update refuses
    expect(r.g.diag().lastRefusal).toEqual({ reason: 'power', at: 6 });
  });
});

describe('THROW_DIAG_ADAPTATION: a throw taken records nothing, and reading changes nothing', () => {
  it('a normal throw leaves no refusal; after a refusal, a throw leaves it as it was', () => {
    const r = rig();
    r.windUp(40);
    for (let i = 0; i < 120; i++) r.g.update(DT);
    expect(r.thrown()).toBe(1);
    expect(r.g.diag().lastRefusal).toBeNull();
    r.windUp(0);
    const refused = r.g.diag().lastRefusal;
    expect(refused?.reason).toBe('power');
    r.windUp(40);
    for (let i = 0; i < 120; i++) r.g.update(DT);
    expect(r.thrown()).toBe(2);
    expect(r.g.diag().lastRefusal).toEqual(refused);
  });

  it('diag: the phase, power, pressure, the chase reads, the hold and the pending release -- read twice, the state unchanged', () => {
    const r = rig();
    r.g.pull();
    for (let i = 0; i < 20; i++) r.g.update(DT);
    const before = JSON.stringify(r.g.stats());
    const d = r.g.diag();
    expect(d).toMatchObject({ phase: 'holding', pressure: 1, airborneBefore: false, climbBefore: false, lastRefusal: null, bodyHold: false, pending: false });
    expect(d.power).toBeGreaterThan(0.15);
    expect(r.g.diag()).toEqual(d);
    expect(JSON.stringify(r.g.stats())).toBe(before);
    r.g.release();
    r.g.update(DT);
    expect(r.g.diag()).toMatchObject({ phase: 'throwing', pressure: 0, bodyHold: true, pending: true });
    const copy = r.g.diag();
    copy.lastRefusal = { reason: 'clear', at: 0 };                // a copy: the caller's writes reach nothing
    expect(r.g.diag().lastRefusal).toBeNull();
  });
});

describe("THROW_DIAG_ADAPTATION: the development build's window.__throwDiag (./matchThrow)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(resolve(here, '../src/matchThrow.ts'), 'utf-8');

  it('published under the literal import.meta.env.DEV alone, and taken away at the dispose', () => {
    expect(src).toMatch(/if \(import\.meta\.en[v]\.DEV\) \{\r?\n\s*diagHost\.__throwDiag = \(\) => \{/);
    expect(src).toMatch(/if \(import\.meta\.en[v]\.DEV\) delete diagHost\.__throwDiag;/);
    expect(src.match(/__throwDiag =/g)).toHaveLength(1);
  });

  it("the thrower's diag with the walk's peek, lean clip and traversal clip, read at the call", () => {
    let s: PlaySnapshot | null = snapOf({ peek: -1, leanClip: true, traversal: { clip: 'seal_climb', frame: 0, loop: false, rootY: 0 } } as Partial<PlaySnapshot>);
    const deps = {
      scene: new Scene(),
      walk: {
        grid: () => null, gridOfGround: () => null, snapshot: () => s, view: () => 'third', fireAim: () => null, feet: () => null,
        drawnFeet: () => null, hold: () => true, mode: () => 'walk', isDead: () => false, fireAllowed: () => true, swapGate: () => true, onActionEnd: () => () => {},
        launcherRaised: () => {}, launcherLowered: () => {}, launcherCleared: () => {}, onLauncherStickLower: () => () => {},
      },
      fly: { shakeScreen: () => {} },
      play: { partPoint: () => null, heldNode: () => null, itemNode: () => null, launcherNode: () => null, motionSource: () => null, setRifleStowed: () => {}, addPoseLayer: () => {} },
      loadouts: new PlayerLoadout(), view: () => null, map: () => null, net: () => null,
      firearm: () => ({ fire: { release: () => {} }, zoom: { state: () => 0 }, item: () => 'rifle', shotRumble: () => {} }),
      audio: { onAnimCallback: () => null, onFire: () => null, play: () => {} },
    } as unknown as MatchThrowDeps;
    const t = mountThrowables(deps);
    const host = globalThis as unknown as { __throwDiag?: () => Record<string, unknown> };
    expect(typeof host.__throwDiag).toBe('function');
    expect(host.__throwDiag!()).toEqual({ ...t.grenade.diag(), peek: -1, lean: true, traversalClip: 'seal_climb' });
    s = null;
    expect(host.__throwDiag!()).toMatchObject({ peek: 0, lean: false, traversalClip: null });
    t.dispose();
    expect(host.__throwDiag).toBeUndefined();
  });
});

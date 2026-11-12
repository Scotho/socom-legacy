// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Mesh, Vector3 } from 'three';
import { FsAssetSource } from '@s2u/archive/node';
import {
  buildGrid, DEFAULT_RIFLE, GAME_FRAME_DT, ITEM, M60E3_FIRE_WAIT_READING, M67, materialTable, readKitTable, soilsTable, UNITS_PER_METRE, type CollisionOwner, type Grid, type GridParams,
  type KitRound, type Loadout, type SurfaceMaterial, type WeaponRecord, type WorldPoly,
} from '@s2u/scene';
import { parseRdr, rdrGet, Zar, type RdrNode } from '@s2u/archive';
import { MagazineRing } from '../src/magazines';
import { KitRounds, RELOAD_DELAY_DEFAULT, reloadDelayOf } from '../src/firearms';
import { kitRecords } from '../src/loadout';
import { TICK_HZ } from '../src/net/protocol';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { FlyCamera } from '../src/camera';
import { loadMap } from '../src/loadMap';
import { readFileSync } from 'node:fs';
import {
  AIM_REACH_FLOOR, aimHitKept, aimQueryAdmits, aimReach, ammoText, cameraAimCap, DECAL_OFFSET, DRY_CLICK_FRAME_READING, Fire, MAX_DECALS, PIP_TOLERANCE,
  RELOAD_DELAY, RELOAD_LAUNCHER_UP_READING, type FireAim, type FireEvent, type FireGun, type FireSource,
} from '../src/fire';
import { RELOAD_SECONDS_PLACEHOLDER, reloadLockSeconds } from '../src/reloadClip';
import { packGround, WalkMode } from '../src/walk';
import { INIT_AIM_PITCH } from '../src/playerCamera';
import { fireRefused, reloadRefused, Zoom } from '../src/zoom';
import { reloadInFlinch } from '../src/net/flinchReload';
import { CLIMB_RELOAD_REFUSED_READING } from '../src/traversal';

/**
 * The shot (web sprint 2, W2.5): a hitscan segment from the aim origin along the aim through `segmentHit`, at the
 * M4A1's `FireWait` (`ZWEAPON.ZAR/zweapon.rdr`), a mark on the polygon it meets, the magazine counting down.
 */

type V3 = [number, number, number];
const quad = (points: number[]): WorldPoly =>
  ({ modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from(points) });
/** A wall across x at depth `z` (the shooter at z 0 looks down -z), x -50..50, y 0..50. */
const wallAt = (z: number): WorldPoly => quad([-50, 0, z, 50, 0, z, 50, 50, z, -50, 50, z]);
/** A wall leaning back 30 degrees from the vertical, its foot at z = -40: a plane that is not an axis. */
const leaning = (): WorldPoly => {
  const t = Math.tan(Math.PI / 6);
  return quad([-50, 0, -40, 50, 0, -40, 50, 50, -40 - 50 * t, -50, 50, -40 - 50 * t]);
};

function world(polys: WorldPoly[]): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}

/**
 * LATER 330: page time past the kit's `+0x820` timer of `s` seconds (a reload's delay, a bolt's or a pump's lock) -- its
 * float32 game frames, ended below 0 (`FUN_005c0fd0` D:L476550-476560), whatever part of a frame the clock carries.
 */
const kitFrames = (s: number): number => {
  const f = Math.fround, dt = f(GAME_FRAME_DT);
  let left = f(s), n = 0;
  do { left = f(left - dt); n++; } while (!(left < 0));
  return n;
};
const pastKit = (s: number): number => kitFrames(s) * GAME_FRAME_DT + 1e-6;

/** A shooter at (0, 20, 0) looking along `dir` (the aim point 1000 out), over `grid`; `aim` null is "not walking". */
function rig(grid: Grid | null, dir: V3 = [0, 0, -1], rifle = DEFAULT_RIFLE): { fire: Fire; source: { on: boolean } } {
  const source = { on: true };
  const eye: V3 = [0, 20, 0];
  const aim = (): FireAim | null => (source.on ? { eye, far: [eye[0] + dir[0] * 1000, eye[1] + dir[1] * 1000, eye[2] + dir[2] * 1000] } : null);
  // A fixed "random" size: the decal's side is decals.rdr's MIN_SIZE + 0.5 x (MAX_SIZE - MIN_SIZE).
  return { fire: new Fire({ grid: () => grid, aim }, rifle, undefined, () => 0.5), source };
}

describe('the shot on a synthetic hull (W2.5)', () => {
  it('hits the first polygon along the aim, marks it, and counts the round', () => {
    const { fire } = rig(world([wallAt(-60), wallAt(-30)]));
    const shot = fire.shoot()!;
    expect(shot).not.toBeNull();
    expect(shot.hit!.distance).toBeCloseTo(30, 6);
    expect(shot.hit!.point).toEqual([0, 20, -30]);
    const s = fire.state();
    expect(s.shots).toBe(1);
    expect(s.magazine).toEqual({ rounds: 29, capacity: 30, spare: 2, reloading: false });
    expect(s.decals).toBe(1);
    expect(s.lastHit!.distance).toBeCloseTo(30, 6);
  });

  it('replenish fills the magazine that just emptied and cancels the reload, and the trigger stays held', () => {
    const { fire } = rig(world([wallAt(-60)]));
    const spare = fire.state().magazine.spare;
    fire.subscribe((e) => {
      if (e.type === 'round' && e.rounds === 0) fire.replenishMagazine();
    });
    fire.pull();
    let guard = 0;
    while (fire.state().shots < 40 && guard++ < 80) fire.update(0.2);
    const mag = fire.state().magazine;
    expect(fire.state().shots).toBeGreaterThanOrEqual(40);
    expect(mag.spare).toBe(spare);
    expect(mag.reloading).toBe(false);
    expect(mag.rounds).toBeGreaterThan(0);
    expect(fire.triggerHeld()).toBe(true);
  });

  it('a miss fires -- the round is spent, the tracer drawn to the range -- but marks nothing', () => {
    const { fire } = rig(world([wallAt(-30)]), [0, 0, 1]);
    const shot = fire.shoot()!;
    expect(shot.hit).toBeNull();
    // Maximum_Range is metres; the world is 10 units a metre (DAT_003dfe10, research 84 section 2).
    expect(new Vector3(...shot.to).distanceTo(new Vector3(...shot.from))).toBeCloseTo(DEFAULT_RIFLE.maximumRange * UNITS_PER_METRE, 6);
    expect(fire.state()).toMatchObject({ shots: 1, decals: 0, lastHit: null });
    expect(fire.state().magazine.rounds).toBe(29);
  });

  it('a round is a straight ray with no drop: a level miss ends Maximum_Range x 10 units along the aim, its height unchanged', () => {
    // FUN_003ca5a0 D:L320383-320398 (research 94): Muzzle_Velocity and gravity play no part; a record with its own range.
    const R = 123;
    const { fire } = rig(world([wallAt(-30)]), [1, 0, 0], { ...DEFAULT_RIFLE, maximumRange: R });
    const shot = fire.shoot()!;
    expect(shot.hit).toBeNull();
    expect(shot.to[0] - shot.from[0]).toBeCloseTo(R * UNITS_PER_METRE, 6);
    expect(shot.to[1]).toBe(shot.from[1]);
    expect(shot.to[2]).toBe(shot.from[2]);
  });

  it('fires nothing when not walking (no aim) or with no hull', () => {
    const { fire, source } = rig(world([wallAt(-30)]));
    source.on = false;
    expect(fire.shoot()).toBeNull();
    expect(fire.pull()).toBeNull();
    fire.update(1);
    expect(fire.state().shots).toBe(0);
    expect(rig(null).fire.shoot()).toBeNull();
  });

  it('the mark lies on the polygon\'s plane, 0.05 off it toward the shooter, and faces the polygon\'s normal', () => {
    const wall = leaning();
    const { fire } = rig(world([wall]), [0.2, -0.1, -1]);
    const shot = fire.shoot()!;
    const hit = shot.hit!;
    const mark = fire.decalMeshes()[0]!;
    // The plane's normal, facing the shooter (+z, tilted up by the lean).
    const n = new Vector3(0, Math.sin(Math.PI / 6), Math.cos(Math.PI / 6));
    expect(new Vector3(...hit.normal).distanceTo(n)).toBeLessThan(1e-6);
    // The quad's own +z (its face) is the normal; its four corners are 0.05 off the plane.
    mark.updateMatrixWorld();
    const face = new Vector3(0, 0, 1).applyQuaternion(mark.quaternion);
    expect(face.distanceTo(n)).toBeLessThan(1e-6);
    const onWall = new Vector3(...hit.point);
    for (const [x, y] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]] as const) {
      const corner = new Vector3(x, y, 0).applyMatrix4(mark.matrixWorld);
      expect(corner.clone().sub(onWall).dot(n)).toBeCloseTo(DECAL_OFFSET, 6);
    }
    // decals.rdr BULLET_MARK_SMALL STONE: 1 to 1.8 units; the fixed "random" 0.5 gives 1.4.
    expect(mark.scale.x).toBeCloseTo(1.4, 9);
    expect(mark.scale.y).toBeCloseTo(1.4, 9);
  });

  it('keeps 150 marks (decals.rdr TEMP_DECAL_POOL BASE) and recycles the oldest', () => {
    const { fire } = rig(world([wallAt(-30)]), [0, 0, -1], { ...DEFAULT_RIFLE, magazine: 200 });
    for (let i = 0; i < 160; i++) { expect(fire.shoot()).not.toBeNull(); fire.update(pastRate(DEFAULT_RIFLE.fireWait)); }   // LATER 326: whole game frames
    expect(MAX_DECALS).toBe(150);
    expect(fire.state().decals).toBe(150);
    expect(fire.decalMeshes().filter((m) => m.visible)).toHaveLength(150);
  });

  it("a round's end drops the marks and keeps the kit (CMPExitState FUN_00223970 L76084 -> FUN_0031c880 -> FUN_003bf050)", () => {
    const { fire } = rig(world([wallAt(-30)]));
    for (let i = 0; i < 3; i++) { fire.shoot(); fire.update(pastRate(DEFAULT_RIFLE.fireWait)); }   // LATER 326: whole game frames
    expect(fire.state().decals).toBe(3);
    fire.reload();
    const before = fire.state().magazine;
    expect(before.reloading).toBe(true);
    fire.clearMarks();
    expect(fire.state().decals).toBe(0);
    expect(fire.decalMeshes()).toHaveLength(0);
    expect(fire.state().magazine).toEqual(before);
    for (let t = 0; t < 4; t += 1 / 60) fire.update(1 / 60);           // the reload runs out as before
    expect(fire.shoot()?.hit).not.toBeNull();                            // the pool takes a mark again
    expect(fire.state().decals).toBe(1);
  });

  it('draws the tracer for one frame', () => {
    const { fire } = rig(world([wallAt(-30)]));
    expect(fire.tracerVisible()).toBe(false);
    fire.shoot();
    expect(fire.tracerVisible()).toBe(true);
    fire.update(1 / 60);                  // the frame the shot is drawn in
    expect(fire.tracerVisible()).toBe(true);
    fire.update(1 / 60);                  // the next one
    expect(fire.tracerVisible()).toBe(false);
  });

  it('draws no line when the map can draw the travelling tracer, and marks the round for the effects', () => {
    const { fire } = rig(world([wallAt(-30)]));
    const rounds: FireEvent[] = [];
    fire.subscribe((e) => { if (e.type === 'round') rounds.push(e); });
    fire.setTracerModel(() => true);
    fire.shoot();
    expect(fire.tracerVisible()).toBe(false);
    expect(rounds).toMatchObject([{ tracer: true, tracerKind: 'ally' }]);
    fire.setTracerModel(null);
    fire.update(pastRate(DEFAULT_RIFLE.fireWait));    // LATER 326: the rate's whole game frames
    fire.shoot();
    expect(fire.tracerVisible()).toBe(true);          // no zAnim: the one-frame line returns
  });

  it("MAP-10b: a turret's round drawn as the page's own -- its path's end and hit, a mark, the tracer by the rule on its weapon id and count -- the firearm's magazine and count untouched", () => {
    const { fire } = rig(world([wallAt(-30)]));
    const ruled: [number, number][] = [];
    fire.setTracerRule((id, n) => { ruled.push([id, n]); return n % 4 === 0; });
    const before = fire.state();
    // From a muzzle at (5, 20, -2) down -z: the wall at -30, 28 out.
    const one = fire.drawRound([5, 20, -2], [0, 0, -1], 8000, 0, 205, 1)!;
    expect(one.to).toEqual([5, 20, -30]);
    expect(one.hit!.point).toEqual([5, 20, -30]);
    expect(fire.state().decals).toBe(1);
    expect(fire.tracerVisible()).toBe(false);                   // round 1 of a 1-in-4 rule: no tracer
    const fourth = fire.drawRound([5, 20, -2], [0, 0, -1], 8000, 0, 205, 4);
    expect(fourth?.tracer).toBe(true);
    expect(fire.tracerVisible()).toBe(true);                     // round 4: the tracer
    fire.update(1 / 60);                                         // that one frame ends
    fire.setTracerModel(() => true);
    const drawn = fire.drawRound([5, 20, -2], [0, 0, -1], 8000, 0, 205, 8)!;
    expect(drawn.tracer).toBe(true);
    expect(fire.tracerVisible()).toBe(false);                    // the effects take the streak; the line stays off
    expect(ruled).toEqual([[205, 1], [205, 4], [205, 8]]);
    expect(fire.state().decals).toBe(3);
    expect({ shots: fire.state().shots, magazine: fire.state().magazine }).toEqual({ shots: before.shots, magazine: before.magazine });
    // A miss runs out the reach; no hull, nothing.
    expect(fire.drawRound([0, 20, 0], [0, 0, 1], 100, 0, 205, 5)).toMatchObject({ to: [0, 20, 100], hit: null });
    expect(rig(null).fire.drawRound([0, 20, 0], [0, 0, -1], 100, 0, 205, 1)).toBeNull();
  });
});

describe('the rate, the magazine and the reload (W2.5)', () => {
  it('fires at FireWait rounded up to whole game frames: n shots over t seconds held is floor(t / Q) + 1 (LATER 326)', () => {
    // LATER 326: the kit's timer runs out on whole game frames (FUN_005c0fd0 D:L476644-476646): Q = 4 frames for 0.12 s,
    // 7.49 a second (was: at most floor(t x 8.33) + 1 and at least floor(t x 8.33), the leftover carried).
    const rate = 1 / (Math.ceil(DEFAULT_RIFLE.fireWait / GAME_FRAME_DT - 1e-9) * GAME_FRAME_DT);
    for (const [t, frame] of [[1, 1 / 60], [0.5, 1 / 144], [2.4, 1 / 30], [3, 0.05]] as const) {
      const { fire } = rig(world([wallAt(-30)]), [0, 0, -1], { ...DEFAULT_RIFLE, magazine: 1000 });
      fire.pull();
      for (let s = 0; s < Math.round(t / frame); s++) fire.update(frame);
      const n = fire.state().shots;
      expect(n, `${t} s at ${1 / frame} fps`).toBeLessThanOrEqual(Math.floor(t * rate + 1e-9) + 1);
      expect(n, `${t} s at ${1 / frame} fps`).toBeGreaterThanOrEqual(Math.floor(t * rate + 1e-9));
    }
  });

  it('clicks faster than the rate are held back; a release keeps the wait', () => {
    const { fire } = rig(world([wallAt(-30)]));
    expect(fire.pull()).not.toBeNull();
    fire.release();
    fire.update(0.05);
    expect(fire.pull()).toBeNull();          // 0.05 s after a shot: FireWait is 0.12
    fire.release();
    fire.update(0.08);
    expect(fire.pull()).toBeNull();          // 0.13 s after it: 3 game frames (0.100 s) run down of 0.12 (LATER 326)
    fire.release();
    fire.update(0.01);
    expect(fire.pull()).not.toBeNull();      // 0.14 s: the 4th game frame (0.133 s) clears it
    expect(fire.state().shots).toBe(2);
  });

  // LATER 179 (research 94 §C1.1): the last round arms no reload (`FUN_005c5340` D:L479296-479300: one projectile); the
  // hook's `shoot()` holds no trigger, so the dry branch's pressed path stays shut and R reloads (was: by itself).
  it('empties the magazine and arms no reload at the last round; R reloads RELOAD_DELAY later (the new magazine in at the start), keeps a part-used one', () => {
    const { fire } = rig(world([wallAt(-30)]));
    // No reloadSeconds source: the reload lasts RELOAD_SECONDS_PLACEHOLDER, the constant the room's lock falls to too.
    expect(RELOAD_SECONDS_PLACEHOLDER).toBe(reloadLockSeconds(null, null, 'stand', false));
    expect(RELOAD_DELAY).toBe(0.01);
    for (let i = 0; i < 29; i++) { expect(fire.shoot()).not.toBeNull(); fire.update(0.2); }
    expect(fire.shoot()).not.toBeNull();                     // the 30th: the magazine runs dry
    expect(fire.state().magazine).toEqual({ rounds: 0, capacity: 30, spare: 1, reloading: false });  // nothing asked; MAGS: two with rounds, less one (FUN_00237760)
    expect(fire.shoot()).toBeNull();
    fire.update(1);
    expect(fire.state().magazine).toEqual({ rounds: 0, capacity: 30, spare: 1, reloading: false });  // the trigger up: the dry branch shut
    expect(fire.reload()).toBe(true);                        // R: FUN_005c32b0, ReloadDelay
    fire.update(pastKit(RELOAD_DELAY));                      // FUN_005c2a90: the next magazine goes in at once
    expect(fire.state().magazine).toEqual({ rounds: 30, capacity: 30, spare: 1, reloading: true });
    expect(fire.reload()).toBe(false);                       // already reloading
    fire.update(1.9);
    expect(fire.shoot()).toBeNull();                         // no round while the reload plays
    fire.update(0.2);
    expect(fire.state().magazine).toEqual({ rounds: 30, capacity: 30, spare: 1, reloading: false });
    // A full magazine reloads too: no gate on the chain reads fullness (FUN_00594cf0 453459-453463 -> FUN_005c32b0 ->
    // FUN_005c2a90); its walk from m_currentmag + 1 (477462-477483) takes the third, the full second keeps its 30.
    expect(fire.reload()).toBe(true);
    fire.update(pastKit(RELOAD_DELAY) + RELOAD_SECONDS_PLACEHOLDER);
    expect(fire.state().magazine).toEqual({ rounds: 30, capacity: 30, spare: 1, reloading: false });
    fire.shoot(); fire.update(0.2);
    expect(fire.reload()).toBe(true);
    fire.update(pastKit(RELOAD_DELAY) + RELOAD_SECONDS_PLACEHOLDER);
    // round the ring past the empty first: the second (30) in; the part-used third (29) keeps its rounds in the ring
    expect(fire.state().magazine).toEqual({ rounds: 30, capacity: 30, spare: 1, reloading: false });
    for (let i = 0; i < 30; i++) { fire.shoot(); fire.update(0.2); }
    expect(fire.reload()).toBe(true);                        // LATER 179: the empty second reloads by R
    fire.update(pastKit(RELOAD_DELAY) + RELOAD_SECONDS_PLACEHOLDER);
    expect(fire.state().magazine).toEqual({ rounds: 29, capacity: 30, spare: 0, reloading: false });
    for (let i = 0; i < 29; i++) { fire.shoot(); fire.update(0.2); }
    expect(fire.state().magazine).toEqual({ rounds: 0, capacity: 30, spare: 0, reloading: false });
    expect(fire.reload()).toBe(false);                       // no magazine with rounds left
  });

  it('a dry trigger clicks (the `dry` event), and reloads when there is a magazine', () => {
    const { fire } = rig(world([wallAt(-30)]));
    const events: string[] = [];
    fire.subscribe((e) => events.push(e.type));
    // LATER 179: no reload at the last round; the dry pull reloads at once (`FUN_005c0fd0` D:L476616-476622).
    for (let m = 0; m < 2; m++) {
      for (let i = 0; i < 30; i++) { fire.shoot(); fire.update(0.2); }
      expect(fire.state().magazine).toMatchObject({ rounds: 0, reloading: false });
      const before = events.length;
      expect(fire.pull()).toBeNull();
      expect(events.slice(before)).toEqual(['dry', 'reloadStart']);
      fire.release();
      fire.update(3);                                        // the reload came and went
    }
    for (let i = 0; i < 30; i++) { fire.shoot(); fire.update(0.2); }
    fire.update(3);
    expect(fire.state().magazine).toMatchObject({ rounds: 0, spare: 0 });
    fire.pull();
    expect(events.at(-1)).toBe('dry');
    expect(fire.state().magazine.reloading).toBe(false);
  });

  it('R reloads while walking; Ctrl+R, a repeat and R in fly mode are left alone', () => {
    const target = new EventTarget();
    const { fire, source } = rig(world([wallAt(-30)]));
    fire.bindKey(target);
    fire.shoot(); fire.update(0.2);
    const key = (init: KeyboardEventInit): KeyboardEvent => new KeyboardEvent('keydown', { code: 'KeyR', ...init });
    target.dispatchEvent(key({ ctrlKey: true }));
    target.dispatchEvent(key({ repeat: true }));
    source.on = false;
    target.dispatchEvent(key({}));
    expect(fire.state().magazine.reloading).toBe(false);
    source.on = true;
    target.dispatchEvent(key({}));
    expect(fire.state().magazine.reloading).toBe(true);
    fire.unbindKey();
  });

  it("R does nothing while the source is not ready -- a dead SEAL (FUN_00592560 L451644: the dead's controller reads the respawn press alone)", () => {
    const target = new EventTarget();
    const grid = world([wallAt(-30)]);
    const eye: V3 = [0, 20, 0];
    let ready = false;
    const fire = new Fire({ grid: () => grid, aim: () => ({ eye, far: [0, 20, -1000] }), ready: () => ready }, DEFAULT_RIFLE, undefined, () => 0.5);
    const events: string[] = [];
    fire.subscribe((e) => events.push(e.type));
    fire.bindKey(target);
    ready = true; fire.shoot(); fire.update(0.2); ready = false;
    target.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR' }));
    expect(fire.state().magazine.reloading).toBe(false);
    expect(events).not.toContain('reloadStart');
    fire.unbindKey();
    // The shared source also refuses an absent hand slot, so the key, pad and touch share the dead/swap/presence gate;
    // OBF-31: and the round screens' (`screens`).
    const main = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/matchFirearm.ts'), 'utf8');
    expect(main).toMatch(/ready: \(\): boolean => !kit\.swapping\(\) && !walk\.isDead\(\) && !screens\(\) && firearmSlotPresent\(loadouts\.loadout\(\), SLOT_OF\[kit\.item\(\)\]\),/);
  });

  it('takes its gun: the direction of each round, the rounds a pull and the wait of the mode (research 84)', () => {
    const { fire } = rig(world([wallAt(-30)]), [0, 0, -1], { ...DEFAULT_RIFLE, magazine: 100 });
    const calls: string[] = [];
    let perPull = 3;
    fire.setGun({
      trigger: (down) => calls.push(down ? 'down' : 'up'),
      roundsPerPull: () => perPull,
      interval: (w) => w * 0.8,
      round: (dir) => { calls.push('round'); return [dir[0] + 0.1, dir[1], dir[2]]; },
    });
    const shot = fire.pull()!;
    // The round went off the aim by the gun's tangent: 0.1 right per unit ahead, hitting the wall 30 ahead at x 3.
    expect(shot.hit!.point[0]).toBeCloseTo(3, 6);
    // Burst: three rounds a pull at 0.8 x FireWait, then nothing until the trigger is let go.
    for (let i = 0; i < 20; i++) fire.update(DEFAULT_RIFLE.fireWait * 0.8);
    expect(fire.state().shots).toBe(3);
    fire.release();
    fire.update(1);
    expect(fire.pull()).not.toBeNull();
    expect(calls.filter((c) => c === 'round')).toHaveLength(4);
    expect(calls.filter((c) => c === 'down')).toHaveLength(2);
    perPull = 1;
    fire.release();
    fire.update(1);
    fire.pull();
    for (let i = 0; i < 20; i++) fire.update(DEFAULT_RIFLE.fireWait);
    expect(fire.state().shots).toBe(5);                    // single: one a pull, held or not
  });
});

describe('the reload gates and the fresh kit of a spawn (research 84 §18, research 91 §4.3)', () => {
  /** A shooter whose swap lock (`ready`) and airborne bit the test sets. */
  function gated(rifle = DEFAULT_RIFLE) {
    const grid = world([wallAt(-30)]);
    const state = { ready: true, airborne: false };
    const eye: V3 = [0, 20, 0];
    const fire = new Fire({
      grid: () => grid, aim: () => ({ eye, far: [0, 20, -1000] }),
      ready: () => state.ready, airborne: () => state.airborne,
    }, rifle, undefined, () => 0.5);
    return { fire, state };
  }

  it("TURRET-AMMO (#284, research 215 s8): R taken by the hand's other owner (FireSource.reloadTaken: mounted, the slot in the hand is the turret's, FUN_005463c0 D:L412218) asks the rifle nothing -- no delay, no magazine, no reloadStart; given back, R is the rifle's again", () => {
    const grid = world([wallAt(-30)]);
    let taken = true, asked = 0;
    const eye: V3 = [0, 20, 0];
    const fire = new Fire({ grid: () => grid, aim: () => ({ eye, far: [0, 20, -1000] }), reloadTaken: () => { asked++; return taken; } }, DEFAULT_RIFLE, undefined, () => 0.5);
    const events: FireEvent[] = [];
    fire.subscribe((e) => { events.push(e); });
    expect(fire.reload()).toBe(false);
    expect(asked).toBe(1);
    fire.update(RELOAD_DELAY + RELOAD_SECONDS_PLACEHOLDER);
    expect(fire.state().magazine).toEqual({ rounds: 30, capacity: 30, spare: 2, reloading: false });
    expect(events.filter((e) => e.type === 'reloadStart')).toEqual([]);
    taken = false;
    expect(fire.reload()).toBe(true);
    expect(asked).toBe(2);
  });

  it("GRENADE-RELOAD (RELOAD_ITEM_UP_READING; research 361 s5): R with a throwable, a charge or the Detonator up works on the hand's slot (FUN_00594cf0 D:L453459-453463 -> FUN_005c32b0 -> FUN_005c3780), whose one magazine gives FUN_005c2a90's walk nothing -- no press, no reloadStart, the firearm's magazine unchanged, by the call and by the key; put away, R is the firearm's again", () => {
    const grid = world([wallAt(-30)]);
    let up = true;
    const eye: V3 = [0, 20, 0];
    const fire = new Fire({ grid: () => grid, aim: () => ({ eye, far: [0, 20, -1000] }), itemUp: () => up }, DEFAULT_RIFLE, undefined, () => 0.5);
    fire.takeWeapon(DEFAULT_RIFLE, [10, DEFAULT_RIFLE.magazine, DEFAULT_RIFLE.magazine]);
    const before = fire.state().magazine;
    const events: FireEvent[] = [];
    fire.subscribe((e) => { events.push(e); });
    expect(fire.reload()).toBe(false);
    const target = new EventTarget();
    fire.bindKey(target);
    target.dispatchEvent(Object.assign(new Event('keydown'), { code: 'KeyR' }));
    fire.update(RELOAD_DELAY + RELOAD_SECONDS_PLACEHOLDER);
    expect(fire.state().magazine).toEqual(before);
    expect(events.filter((e) => e.type === 'reloadPress' || e.type === 'reloadStart')).toEqual([]);
    up = false;
    expect(fire.reload()).toBe(true);
    expect(events.filter((e) => e.type === 'reloadPress')).toHaveLength(1);
    fire.unbindKey();
  });

  it("GRENADE-RELOAD fold (RELOAD_LAUNCHER_UP_READING; research 361 s5): R with the LAW or the RPG-7 up works on the round's slot (FUN_005c2a90 D:L477413-477444 via FUN_005bd7e0 D:L474371-474397), one magazine, so nothing -- no press, no reloadStart, the firearm's magazine unchanged, by the call and by the key; put away, R is the firearm's again", () => {
    expect(RELOAD_LAUNCHER_UP_READING).toBe('nothing moves');
    const grid = world([wallAt(-30)]);
    let up = true;
    const eye: V3 = [0, 20, 0];
    const fire = new Fire({ grid: () => grid, aim: () => ({ eye, far: [0, 20, -1000] }), launcherUp: () => up }, DEFAULT_RIFLE, undefined, () => 0.5);
    fire.takeWeapon(DEFAULT_RIFLE, [10, DEFAULT_RIFLE.magazine, DEFAULT_RIFLE.magazine]);
    const before = fire.state().magazine;
    const events: FireEvent[] = [];
    fire.subscribe((e) => { events.push(e); });
    expect(fire.reload()).toBe(false);
    const target = new EventTarget();
    fire.bindKey(target);
    target.dispatchEvent(Object.assign(new Event('keydown'), { code: 'KeyR' }));
    fire.update(RELOAD_DELAY + RELOAD_SECONDS_PLACEHOLDER);
    expect(fire.state().magazine).toEqual(before);
    expect(events.filter((e) => e.type === 'reloadPress' || e.type === 'reloadStart')).toEqual([]);
    up = false;
    expect(fire.reload()).toBe(true);
    expect(events.filter((e) => e.type === 'reloadPress')).toHaveLength(1);
    fire.unbindKey();
  });

  it('a full magazine reloads when another slot holds rounds; a one-magazine kit does not (FUN_005c2a90 477462-477483)', () => {
    const { fire } = gated();
    expect(fire.state().magazine).toEqual({ rounds: 30, capacity: 30, spare: 2, reloading: false });
    expect(fire.reload()).toBe(true);
    fire.update(pastKit(RELOAD_DELAY) + RELOAD_SECONDS_PLACEHOLDER);
    expect(fire.state().magazine).toEqual({ rounds: 30, capacity: 30, spare: 2, reloading: false });   // the second in
    const single = gated({ ...DEFAULT_RIFLE, mags: 1 }).fire;
    expect(single.state().magazine.spare).toBe(0);
    expect(single.reload()).toBe(false);                     // the walk comes back to m_currentmag: nothing to take
  });

  it('R is refused while an action holds the weapon (a swap: FUN_005a7ab0, FUN_00594cf0 453460-453463)', () => {
    const { fire, state } = gated();
    fire.shoot(); fire.update(0.2);
    state.ready = false;
    expect(fire.reload()).toBe(false);
    expect(fire.state().magazine.reloading).toBe(false);
    state.ready = true;
    expect(fire.reload()).toBe(true);
    expect(fire.state().magazine.reloading).toBe(true);
  });

  it('an asked reload does not begin in the air (FUN_005c2a90 477394, +0x105e bit 5): the ask is spent, no magazine moves', () => {
    const { fire, state } = gated();
    const events: string[] = [];
    fire.subscribe((e) => events.push(e.type));
    fire.shoot(); fire.update(0.2);
    expect(fire.reload()).toBe(true);
    state.airborne = true;
    fire.update(RELOAD_DELAY + 0.001);
    expect(fire.state().magazine).toEqual({ rounds: 29, capacity: 30, spare: 2, reloading: false });
    expect(events).not.toContain('reloadStart');
    state.airborne = false;
    fire.update(1);
    expect(fire.state().magazine.rounds).toBe(29);           // dropped, as FUN_005c0fd0 clears the timer (476557-476559)
    expect(fire.reload()).toBe(true);
    fire.update(pastKit(RELOAD_DELAY));
    expect(events).toContain('reloadStart');
  });

  // NU-1b B5 (research 313 sections 5 and 8.1; CLIMB_RELOAD_REFUSED_READING): the kit's timer runs out into `FUN_005c2a90`
  // (D:L476550-476560), which asks `FUN_005b4340(actor, 3)` (D:L477404): refused under a climb's `UseVelY` clip
  // (D:L469517) or in the hang (D:L469460-469461) -- no clip, no magazine moved, the timer spent; R after the climb taken.
  it('an asked reload does not begin while a climb holds the body (FireSource.climbHolds): the ask is spent, the magazine kept; R after the climb is taken', () => {
    const grid = world([wallAt(-30)]);
    const climb = { on: false };
    const source: FireSource & { climbHolds?: () => boolean } = {
      grid: () => grid, aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }), climbHolds: () => climb.on,
    };
    const fire = new Fire(source, DEFAULT_RIFLE, undefined, () => 0.5);
    const events: string[] = [];
    fire.subscribe((e) => events.push(e.type));
    fire.shoot(); fire.update(0.2);
    expect(fire.reload()).toBe(true);
    climb.on = true;
    fire.update(RELOAD_DELAY + 0.001);
    expect(fire.state().magazine).toEqual({ rounds: 29, capacity: 30, spare: 2, reloading: false });   // RED before B5: refilled
    expect(events).not.toContain('reloadStart');
    expect(fire.reloadLocked()).toBe(false);                 // the timer spent (D:L476560): no lock left behind
    climb.on = false;
    fire.update(1);
    expect(fire.state().magazine.rounds).toBe(29);
    expect(fire.reload()).toBe(true);
    // LATER 72 (CLIMB_LOCK_RELOAD_DELAY_READING 'counted'): the timer is the climb lock's, as the original's (FUN_005a7ab0
    // D:L469416, kit+0x820) -- offline by its time; online by the press's window in command numbers (the room's too).
    expect(fire.reloadLocked()).toBe(true);                  // was (NU-1b review F1): false, the room could not count it
    fire.update(pastKit(RELOAD_DELAY));
    expect(events).toContain('reloadStart');
    expect(fire.reloadLocked()).toBe(true);                  // the clip's lock: the room's `reloadUntil` from the same command
    expect(CLIMB_RELOAD_REFUSED_READING).toBe('refused');
  });

  it('the binoculars refuse the round (FUN_005be9a0 475305) and the reload\'s start (FUN_005c2a90 477410); held fire resumes after', () => {
    const grid = world([wallAt(-30)]);
    const view = { state: 4 };
    const fire = new Fire({
      grid: () => grid, aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }),
      fireRefused: () => fireRefused(view.state), reloadRefused: () => reloadRefused(view.state),
    }, DEFAULT_RIFLE, undefined, () => 0.5);
    const events: string[] = [];
    fire.subscribe((e) => events.push(e.type));
    expect(fire.shoot()).toBeNull();                         // no round leaves with the binoculars up
    fire.pull();                                             // the trigger held as the game's is
    fire.update(0.5);
    expect(fire.state().shots).toBe(0);
    expect(fire.reload()).toBe(true);                        // the ask is taken (FUN_00594cf0 has no view gate) ...
    fire.update(RELOAD_DELAY + 0.001);
    expect(events).not.toContain('reloadStart');             // ... but no reload begins, and the ask is spent
    expect(fire.state().magazine.reloading).toBe(false);
    view.state = 1;                                          // down to first person: the held trigger fires on
    fire.update(0.2);
    expect(fire.state().shots).toBeGreaterThan(0);
    fire.release();
  });

  it('NoFire refuses the round only (PF-17, research 218 §1.5): a reload asked during a NoFire clip is taken, as the room takes it', () => {
    // `NoFire` is the round's gate (FUN_005a7de0), not the reload's (FUN_005a7ab0); the room's `reload()` has no nofire
    // check. The match's firearm (`./matchFirearm`) puts `WalkMode.fireAllowed` on the fire-only hook (`fireRefused`, read by the round alone), never on
    // `ready`, which the reload reads too: R then prone keeps its reload.
    const grid = world([wallAt(-30)]);
    const fireAllowed = (): boolean => false;               // the walk's clip on top holds NoFire
    const fire = new Fire({
      grid: () => grid, aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }),
      ready: () => true, fireRefused: () => fireRefused(1) || !fireAllowed(),   // main.ts's shape
    }, DEFAULT_RIFLE, undefined, () => 0.5);
    const events: string[] = [];
    fire.subscribe((e) => events.push(e.type));
    expect(fire.shoot()).toBeNull();                         // the clip's NoFire: no round
    expect(fire.reload()).toBe(true);                        // ... the reload asked under it is taken
    fire.update(pastKit(RELOAD_DELAY));
    expect(events).toContain('reloadStart');
    const main = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/matchFirearm.ts'), 'utf8');
    expect(main).toMatch(/fireRefused: \(\): boolean => fireRefused\(zoom\.state\(\)\) \|\| !walk\.fireAllowed\(\),/);
    expect(main).not.toMatch(/ready: .*fireAllowed/);
  });

  // PF-18 (ruling PF.R37; research 194 A03, 218 §2): FUN_005a2690 sets the flinch's motion flag 0x4 (D:L460018-460025);
  // FUN_005b4340(actor, 3) refuses on it (D:L469494-469504), asked by the reload's start FUN_005c2a90 (D:L477394-477407)
  // and its clip's choice FUN_005a82e0 (D:L462814-462819). The six short flinches carry no NoFire: rounds go on.
  it('Fire refuses a reload while the page\'s own flinch plays (flinching) and takes it after; a round is not refused', () => {
    const grid = world([wallAt(-30)]);
    // The page's own flinch as `netPage.ts` hands it to the walk (`setFlinchPose`): a pose on its own clock, null once
    // the clip's playback has run (`./remotePlayers` `flinchPose`) -- here `seal_flinch_rarm`'s 0.8 s.
    const c = document.createElement('canvas');
    c.setPointerCapture = () => undefined; c.releasePointerCapture = () => undefined; c.hasPointerCapture = () => false;
    const walk = new WalkMode(new FlyCamera(c), () => undefined);
    let clock = 0;
    expect(walk.flinching()).toBe(false);
    walk.setFlinchPose(() => (clock < 0.8 ? { clip: 'seal_flinch_rarm', frame: clock * 30, loop: false, rootY: null } : null));
    const fire = new Fire({
      grid: () => grid, aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }), flinching: () => walk.flinching(),
    }, DEFAULT_RIFLE, undefined, () => 0.5);
    const events: string[] = [];
    fire.subscribe((e) => events.push(e.type));
    expect(walk.flinching()).toBe(true);
    expect(fire.shoot()).not.toBeNull();                     // a round goes through the flinch
    fire.update(0.2); clock += 0.2;
    expect(fire.reload()).toBe(true);                        // the ask is taken (FUN_00594cf0 has no flinch gate) ...
    fire.update(RELOAD_DELAY + 0.001);
    expect(events).not.toContain('reloadStart');             // ... but no reload begins (FUN_005b4340(actor, 3)): the ask is spent
    expect(fire.state().magazine).toEqual({ rounds: 29, capacity: 30, spare: 2, reloading: false });
    clock = 0.8;                                             // the clip's playback run through
    expect(walk.flinching()).toBe(false);
    expect(fire.reload()).toBe(true);
    fire.update(pastKit(RELOAD_DELAY));
    expect(events).toContain('reloadStart');
    expect(fire.state().magazine.reloading).toBe(true);
    walk.unbindKey();
  });

  // PF-18 fix round: the room holds the flinch from the victim's next command as it stands at the hit; the page learns
  // of it a round trip later. A reload the page began in between was dropped 'flinch' by the room (no magazine moved
  // there), so the page undoes it when its own `flinch` event arrives with the room's window (`from`/`until`, the
  // commands' seqs): `reloadInFlinch` decides by the seq the reload was sent with, `Fire.undoReload` puts the magazine
  // and the lock back as they were before it began.
  it('a reload pressed inside the round trip after a hit is undone on the page when its flinch arrives: the magazine and the lock match the room\'s', () => {
    const grid = world([wallAt(-30)]);
    const fire = new Fire({ grid: () => grid, aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }) }, DEFAULT_RIFLE, undefined, () => 0.5);
    const events: FireEvent[] = [];
    fire.subscribe((e) => events.push(e));
    expect(fire.undoReload()).toBe(false);                   // nothing to undo
    for (let i = 0; i < 3; i++) { fire.shoot(); fire.update(0.2); }
    const before = { magazine: fire.state().magazine, total: fire.magazineTotal() };
    expect(before.magazine).toEqual({ rounds: 27, capacity: 30, spare: 2, reloading: false });
    expect(fire.reload()).toBe(true);
    fire.update(RELOAD_DELAY + 0.001);                       // begun: the fresh magazine in, the lock running
    expect(fire.state().magazine).toMatchObject({ rounds: 30, reloading: true });
    const sentAt = 105;                                      // the seq `netPage` sent the reload with
    const window = { from: 100, until: 148 };                // the room's: the victim's next command at the hit, 48 commands
    expect(reloadInFlinch(sentAt, window)).toBe(true);
    expect(reloadInFlinch(100, window)).toBe(true);          // the hit's next command: inside
    expect(reloadInFlinch(99, window)).toBe(false);          // sent before the hit's next command: the room took it
    expect(reloadInFlinch(148, window)).toBe(false);         // past the clip: the room took it
    expect(reloadInFlinch(sentAt, {})).toBe(false);          // an older room's event: no window, nothing undone
    expect(reloadInFlinch(null, window)).toBe(false);
    expect(fire.undoReload()).toBe(true);
    expect({ magazine: fire.state().magazine, total: fire.magazineTotal() }).toEqual(before);   // the room's: as before
    expect(events.at(-1)).toMatchObject({ type: 'reloadEnd', completed: false });               // the pose stops its clip
    expect(fire.shoot()).not.toBeNull();                     // no lock: the old magazine fires on
    expect(fire.state().magazine.rounds).toBe(26);
    expect(fire.undoReload()).toBe(false);                   // once
  });

  // LOW-2 (research 223 s6), rounds 2 and 3: the room's `stale` refusal reaches the page a round trip -- after a long
  // stall, seconds -- after the round or the reload; the magazines are put back as the room has them: the refused
  // operation taken out of the page's journal of its ring and the later ones replayed (`refundRound`, `restoreReload`).
  const rifleFire = (): { fire: Fire; events: FireEvent[]; shots: number[]; reloads: number[] } => {
    const grid = world([wallAt(-30)]);
    const fire = new Fire({ grid: () => grid, aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }) }, DEFAULT_RIFLE, undefined, () => 0.5);
    const events: FireEvent[] = [], shots: number[] = [], reloads: number[] = [];
    fire.subscribe((e) => {
      events.push(e);
      if (e.type === 'round' && e.shot !== undefined) shots.push(e.shot);
      if (e.type === 'reloadStart' && e.reload !== undefined) reloads.push(e.reload);
    });
    return { fire, events, shots, reloads };
  };
  const shoot = (fire: Fire, n: number): void => { for (let i = 0; i < n; i++) { fire.shoot(); fire.update(0.2); } };
  const reloadNow = (fire: Fire): void => { expect(fire.reload()).toBe(true); fire.update(RELOAD_DELAY + 0.001); };

  it('restoreReload: a stale reload undone after its lock ran out -- the old magazine back, less the rounds fired since', () => {
    const { fire, reloads } = rifleFire();
    expect(fire.restoreReload(1)).toBe(false);               // nothing to restore
    shoot(fire, 3);
    reloadNow(fire);
    fire.update(10);                                         // the reload's lock long over
    expect(fire.state().magazine).toMatchObject({ rounds: 30, reloading: false });
    shoot(fire, 2);
    expect(fire.restoreReload(reloads[0]!)).toBe(true);
    // The room never swapped: its old magazine (27) took the two rounds -> 25, the full ones untouched.
    expect({ magazine: fire.state().magazine, total: fire.magazineTotal() }).toEqual({ magazine: { rounds: 25, capacity: 30, spare: 2, reloading: false }, total: 85 });
    expect(fire.restoreReload(reloads[0]!)).toBe(false);     // once
  });

  it('restoreReload while the reload still runs: as undoReload (the lock gone, the clip stopped)', () => {
    const { fire, events, reloads } = rifleFire();
    shoot(fire, 3);
    reloadNow(fire);
    expect(fire.restoreReload(reloads[0]!)).toBe(true);
    expect(fire.state().magazine).toEqual({ rounds: 27, capacity: 30, spare: 2, reloading: false });
    expect(events.at(-1)).toMatchObject({ type: 'reloadEnd', completed: false });
  });

  it('round 3: an earlier reload refused while a later one runs -- the earlier taken out, the later replayed on the room\'s ring and still running', () => {
    const { fire, reloads } = rifleFire();
    shoot(fire, 3);
    reloadNow(fire); fire.update(10);                        // A: slot 0 (27) out, slot 1 in
    shoot(fire, 2);                                          // slot 1: 28
    reloadNow(fire);                                         // B: slot 2 in, its lock running
    expect(fire.restoreReload(reloads[0]!)).toBe(true);
    // The room's ring: A never ran -- the two rounds off slot 0 (25), then B swapped slot 0 for slot 1 (30).
    expect(fire.state().magazine).toEqual({ rounds: 30, capacity: 30, spare: 2, reloading: true });
    expect(fire.magazineTotal()).toBe(85);
  });

  it('round 3: refundRound gives the round back to the magazine that fired it, even after a reload; a refilled kit\'s is dropped', () => {
    const { fire, shots } = rifleFire();
    shoot(fire, 3);
    reloadNow(fire); fire.update(10);
    shoot(fire, 1);
    expect(fire.refundRound(shots[0]!)).toBe(true);          // the first round, fired from the magazine now stowed in the ring
    expect(fire.state().magazine.rounds).toBe(29);           // the one in the weapon untouched
    expect(fire.magazineTotal()).toBe(30 - 2 + 29 + 30);     // slot 0: 28
    expect(fire.refundRound(shots[0]!)).toBe(false);         // once
    fire.refill();
    expect(fire.refundRound(shots[1]!)).toBe(false);         // its magazine is gone with the old kit: nothing given
    expect(fire.magazineTotal()).toBe(90);
  });

  it('round 3: a stale round and then its stale reload subtract the round once', () => {
    const { fire, shots, reloads } = rifleFire();
    shoot(fire, 3);
    reloadNow(fire); fire.update(10);
    shoot(fire, 2);                                          // after the reload: from slot 1
    expect(fire.refundRound(shots[3]!)).toBe(true);          // the room refused one of them
    expect(fire.restoreReload(reloads[0]!)).toBe(true);      // and the reload
    // The room: slot 0 took the one round it accepted -> 26; the others full.
    expect({ rounds: fire.state().magazine.rounds, total: fire.magazineTotal() }).toEqual({ rounds: 26, total: 86 });
  });

  // PF-34 x LOW-2 (research 234 s6, the kit and the journal): a `kit` after a walk-over writes the room's filled slots
  // into the ring (`setRing`), and a `stale` for an operation the page logged BEFORE that kit replays the ring from the
  // journal's saved copy -- which must carry the kit's slots too, or the replay erases the room's transfer.
  it("a kit after a walk-over reaches the journal's saved ring copies: a stale fire logged before the kit refunds its round on top of the kit's slots, not the pre-kit ring", () => {
    const { fire, shots } = rifleFire();
    shoot(fire, 3);                                          // slot 0: 27 (logged: the pre-shot copies hold slot 3 empty)
    fire.setRing(DEFAULT_RIFLE, [30, 30, 30, 17, 0, 0, 0, 0, 0, 0], undefined, [3]);   // the room's transfer: 17 into slot 3
    expect(fire.magazineTotal()).toBe(27 + 30 + 30 + 17);    // 104
    expect(fire.refundRound(shots[0]!)).toBe(true);          // the room refused the first round stale
    // The room: 28 in the weapon, the kit's 17 kept -- 105, never the pre-kit ring's 88.
    expect(fire.magazineTotal()).toBe(105);
    expect(fire.state().magazine.rounds).toBe(28);
    expect(fire.refundRound(shots[1]!)).toBe(true);
    expect(fire.magazineTotal()).toBe(106);
  });

  it("a stale reload logged before the kit restores on top of the kit's slots", () => {
    const { fire, reloads } = rifleFire();
    shoot(fire, 3);
    reloadNow(fire); fire.update(10);                        // slot 0 (27) out, slot 1 in
    fire.setRing(DEFAULT_RIFLE, [27, 30, 30, 17, 0, 0, 0, 0, 0, 0], undefined, [3]);
    expect(fire.magazineTotal()).toBe(104);
    expect(fire.restoreReload(reloads[0]!)).toBe(true);
    // The room never swapped: slot 0 (27) in the weapon, the kit's 17 in slot 3 -- 104, not 87.
    expect({ rounds: fire.state().magazine.rounds, total: fire.magazineTotal() }).toEqual({ rounds: 27, total: 104 });
  });

  it('a claim kit with a reload in flight: a stale fire replays to the room\'s count, 28 not 29', () => {
    const { fire, shots } = rifleFire();
    shoot(fire, 3);                                          // f1, f2, f3 from slot 0: 27 (none run by the room yet)
    reloadNow(fire); fire.update(10);                        // slot 0 out, slot 1 in (in flight too)
    // A claim's kit (no `filled`: every slot) the room computed before any of them: its slot 0 still 30.
    fire.setRing(DEFAULT_RIFLE, [30, 30, 30, 0, 0, 0, 0, 0, 0, 0]);
    expect(fire.refundRound(shots[1]!)).toBe(true);          // f2 refused stale
    // The room runs f1 and f3 and the reload: slot 0 holds 28. Each saved copy keeps its own magazine in the weapon
    // (slot 0 for the copies logged before the reload), so the replay is f3 on 29 -> 28, not on the kit's lagging 30.
    expect(fire.state().magazine.rounds).toBe(30);
    expect(fire.magazineTotal()).toBe(28 + 30 + 30);
  });

  it("a stowed pistol's 20 transferred rounds survive a stale on a round it fired in the hand before the kit", () => {
    const { fire, shots } = rifleFire();
    const pistol: WeaponRecord = { ...DEFAULT_RIFLE, name: 'MK23', id: 7, magazine: 20, mags: 3 };
    fire.setWeapon(pistol);
    shoot(fire, 2);                                          // the pistol: 18, 20, 20
    fire.setWeapon(DEFAULT_RIFLE);                           // the pistol stowed
    fire.setRing(pistol, [18, 20, 20, 20, 0, 0, 0, 0, 0, 0], undefined, [3]);   // the room's transfer into the stowed ring
    expect(fire.magazineOf(pistol)).toEqual({ rounds: 18, capacity: 20, spare: 3 });
    expect(fire.refundRound(shots[0]!)).toBe(true);
    expect(fire.magazineOf(pistol)).toEqual({ rounds: 19, capacity: 20, spare: 3 });   // 19 + 20 + 20 + 20: the kit's 20 kept
    expect(fire.magazineTotal()).toBe(90);                    // the rifle in the hand untouched
  });

  it('refundRound: a round of a stowed weapon back in its own ring; never past the capacity', () => {
    const { fire, shots } = rifleFire();
    const pistol = { ...DEFAULT_RIFLE, name: 'MK23', id: 7, magazine: 12, mags: 3 };
    fire.setWeapon(pistol);
    shoot(fire, 1);
    fire.setWeapon(DEFAULT_RIFLE);                           // the pistol stowed with 11
    expect(fire.refundRound(shots[0]!)).toBe(true);
    expect(fire.magazineOf(pistol).rounds).toBe(12);
    expect(fire.refundRound(9999)).toBe(false);              // no round of the page's
  });

  it('refill: every magazine full again, a reload cut short, the marks left where they are (FUN_00599f00)', () => {
    const { fire } = gated();
    for (let i = 0; i < 30; i++) { fire.shoot(); fire.update(0.2); }
    fire.update(RELOAD_DELAY + 0.001);                       // the automatic reload is playing
    for (let i = 0; i < 10; i++) { fire.shoot(); fire.update(0.2); }
    const decals = fire.state().decals;
    expect(decals).toBeGreaterThan(0);
    const events: FireEvent[] = [];
    fire.subscribe((e) => events.push(e));
    fire.refill();
    expect(fire.state().magazine).toEqual({ rounds: 30, capacity: 30, spare: 2, reloading: false });
    expect(fire.magazineTotal()).toBe(90);
    expect(fire.state().decals).toBe(decals);
    expect(fire.shoot()).not.toBeNull();                     // no wait carried over
  });

  it('refill also fills the stowed weapon ring: the next draw of it is full', () => {
    const { fire } = gated();
    const pistol = { ...DEFAULT_RIFLE, name: 'MK23', id: 7, magazine: 12, mags: 3 };
    fire.setWeapon(pistol);
    for (let i = 0; i < 5; i++) { fire.shoot(); fire.update(0.5); }
    fire.setWeapon(DEFAULT_RIFLE);
    fire.refill();
    fire.setWeapon(pistol);
    expect(fire.state().magazine).toEqual({ rounds: 12, capacity: 12, spare: 2, reloading: false });
  });

  it('magazineOf: a firearm magazine as the R2 menu writes it -- in the hand, stowed, or never drawn (FUN_005c38a0, FUN_005c4970)', () => {
    const { fire } = gated();
    const pistol = { ...DEFAULT_RIFLE, name: 'MK23', id: 7, magazine: 12, mags: 3 };
    expect(fire.magazineOf(pistol)).toEqual({ rounds: 12, capacity: 12, spare: 2 });   // never drawn: full
    fire.shoot(); fire.update(0.5);
    expect(fire.magazineOf(DEFAULT_RIFLE)).toEqual({ rounds: 29, capacity: 30, spare: 2 });   // in the hand: the box's
    fire.setWeapon(pistol);
    for (let i = 0; i < 3; i++) { fire.shoot(); fire.update(0.5); }
    expect(fire.magazineOf(DEFAULT_RIFLE)).toEqual({ rounds: 29, capacity: 30, spare: 2 });   // stowed: as it was left
    expect(fire.magazineOf(pistol)).toEqual({ rounds: 9, capacity: 12, spare: 2 });
  });
});

describe('penetration (research 84 section 13: HandleIntersections 0x3c9b70, FUN_003c8920)', () => {
  const wall = (z: number, material: number): WorldPoly => ({ ...wallAt(z), material });
  // Materials by byte: 30 glass (0.99), 26 metal thin (0.35), 25 stone (0), 29 an action volume (1).
  const PEN: Record<number, number> = { 30: 0.99, 26: 0.35, 25: 0, 29: 1 };
  it('passes over a PENETRATION 1 volume, goes through glass into the wall behind, marks both', () => {
    const { fire } = rig(world([wall(-10, 29), wall(-30, 30), wall(-60, 25)]));
    fire.setPenetration((m) => PEN[m ?? 0] ?? 0);
    const shot = fire.shoot()!;
    expect(shot.hit!.distance).toBeCloseTo(60, 6);                // stopped by the stone
    expect(shot.through!.map((t) => t.distance)).toEqual([30]);  // through the glass; the volume not struck
    expect(fire.state().decals).toBe(2);
  });

  it('a thin metal sheet leaves 0.35 x 1.3 of the range: a wall past it is out of reach', () => {
    // M4A1: 1000 m = 10,000 units; after the sheet at 30: 10,000 x 1.3 x 0.35 = 4,550 units.
    const { fire } = rig(world([wall(-30, 26), wall(-4000, 25)]));
    fire.setPenetration((m) => PEN[m ?? 0] ?? 0);
    expect(fire.shoot()!.hit!.distance).toBeCloseTo(4000, 3);
    const far = rig(world([wall(-30, 26), wall(-4600, 25)]));
    far.fire.setPenetration((m) => PEN[m ?? 0] ?? 0);
    const shot = far.fire.shoot()!;
    expect(shot.hit).toBeNull();                                  // the round's range ran out before the second wall
    expect(shot.through!.map((t) => t.distance)).toEqual([30]);
  });

  it('lastHit is the surface it stopped on, or the last it struck when it went through all and was spent', () => {
    // Glass then thin metal then a far wall out of reach: through both, spent in the air -- lastHit is the metal.
    const { fire } = rig(world([wall(-30, 30), wall(-60, 26), wall(-4600, 25)]));
    fire.setPenetration((m) => PEN[m ?? 0] ?? 0);
    const shot = fire.shoot()!;
    expect(shot.hit).toBeNull();
    expect(shot.through!.map((t) => t.distance)).toEqual([30, 60]);
    expect(fire.state().lastHit!.distance).toBeCloseTo(60, 6);
    expect(fire.state().lastHit!.material).toBe(26);
    // Glass then stone: stopped on the stone, which is lastHit; the glass is in the list.
    const stopped = rig(world([wall(-30, 30), wall(-60, 25)]));
    stopped.fire.setPenetration((m) => PEN[m ?? 0] ?? 0);
    const s2 = stopped.fire.shoot()!;
    expect(s2.through!.map((t) => t.distance)).toEqual([30]);
    expect(stopped.fire.state().lastHit!.distance).toBeCloseTo(60, 6);
  });

  it('surfacesAlong: every surface down a line, the rifle\'s whole range, with its PENETRATION (the sweep\'s mark heading)', () => {
    // M4A1 Maximum_Range 1000 x UNITS_PER_METRE 10: a wall at 12,000 is past the round's reach and not listed.
    const { fire } = rig(world([wall(-60, 25), wall(-10, 29), wall(-30, 30), wall(-12_000, 25)]));
    // No table yet: as the shot without one, every surface stops the round (PENETRATION 0).
    expect(fire.surfacesAlong([0, 20, 0], [0, 0, -1])!.map((s) => s.penetration)).toEqual([0, 0, 0]);
    fire.setPenetration((m) => PEN[m ?? 0] ?? 0);
    const along = fire.surfacesAlong([0, 20, 0], [0, 0, -2])!;                  // any length: the direction is made unit
    expect(along.map((s) => [+s.distance.toFixed(6), s.penetration, s.material])).toEqual([[10, 1, 29], [30, 0.99, 30], [60, 0, 25]]);
    expect(DEFAULT_RIFLE.maximumRange * UNITS_PER_METRE).toBe(10_000);
    const blind = rig(null);
    blind.fire.setPenetration((m) => PEN[m ?? 0] ?? 0);
    expect(blind.fire.surfacesAlong([0, 20, 0], [0, 0, -1])).toBeNull();       // no hull: null, not "nothing there"
  });

  it('stone stops it at once; without a table every surface stops it', () => {
    const { fire } = rig(world([wall(-30, 25), wall(-60, 25)]));
    fire.setPenetration((m) => PEN[m ?? 0] ?? 0);
    expect(fire.shoot()!.hit!.distance).toBeCloseTo(30, 6);
    const plain = rig(world([wall(-30, 30), wall(-60, 25)]));
    expect(plain.fire.shoot()!.hit!.distance).toBeCloseTo(30, 6);
  });
});

describe('the walk hands the shot its hull and its aim (W2.5)', () => {
  it('none in fly mode; walking, the eye and the aim point, and the round lands on the wall ahead along the look', () => {
    const floor = quad([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200]);
    const polys = [{ ...floor, ditype: 3 }, wallAt(-50)];
    const ground = packGround(
      { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
      polys, polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 })),
    );
    const fly = new FlyCamera(document.createElement('canvas'));
    const walk = new WalkMode(fly);
    walk.setGround(ground, [0, 0, 0]);
    const fire = new Fire({ grid: () => walk.grid(), aim: () => walk.fireAim() });
    expect(walk.grid()).toBeNull();
    expect(walk.fireAim()).toBeNull();
    expect(fire.shoot()).toBeNull();
    fly.setPose({ x: 0, y: 15.4, z: 0, yaw: 0, pitch: 0 });
    expect(walk.setMode('walk')).toBe(true);
    walk.setCamera({ x: 0, y: 15.4, z: 0, yaw: 0, pitch: 0 });
    const aim = walk.fireAim()!;
    // Standing at pitch 0 (W2.1): the eye 21.484 up and 28.75 behind, the aim 1000 ahead of the target, level.
    expect(aim.eye[1]).toBeCloseTo(21.484, 3);
    expect(aim.eye[2]).toBeCloseTo(28.75, 3);
    expect(aim.far[1]).toBeCloseTo(21.484, 3);
    const shot = fire.shoot()!;
    expect(shot.hit!.point[2]).toBeCloseTo(-50, 6);
    expect(shot.hit!.distance).toBeCloseTo(78.75, 3);
    expect(shot.hit!.normal).toEqual([0, 0, 1]);          // faces the shooter
  });
});

describe('the ammo box (W2.5)', () => {
  it('reads as the box on the console frame: rounds/capacity, then the spare magazines', () => {
    expect(ammoText({ rounds: 30, capacity: 30, spare: 2, reloading: false })).toBe('30/30 · 2 MAGS');
    expect(ammoText({ rounds: 7, capacity: 30, spare: 1, reloading: false })).toBe('7/30 · 1 MAG');
    expect(ammoText({ rounds: 0, capacity: 30, spare: 1, reloading: true })).toBe('0/30 · 1 MAG · RELOADING');
    expect(ammoText(rig(null).fire.state().magazine)).toBe('30/30 · 2 MAGS');
  });
});

const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const MP2 = fixture('RUN/MP2.ZDB');

describe.skipIf(!MP2)(`the shot at Frostfire's spawn A${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it('standing at A facing west at the rest pitch, the round meets the side of container_blue01 at the recorded distance', async () => {
    const map = await loadMap(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB');
    const canvas = document.createElement('canvas');
    const fly = new FlyCamera(canvas);
    const walk = new WalkMode(fly);
    walk.setGround(map.ground, null);
    fly.setPose({ x: SPAWN_A[0], y: SPAWN_A[1] + 15.4, z: SPAWN_A[2], yaw: FACING.yaw, pitch: FACING.pitch });
    expect(walk.setMode('walk')).toBe(true);
    walk.setCamera({ yaw: FACING.yaw, pitch: FACING.pitch });
    walk.walkFor(0.5, { forward: 0, right: 0, boost: false });
    const fire = new Fire({ grid: () => walk.grid(), aim: () => walk.fireAim() });
    const shot = fire.shoot()!;
    expect(shot.hit).not.toBeNull();
    expect(shot.hit!.distance).toBeCloseTo(FACING.distance, 2);
    expect(shot.hit!.normal[0]).toBeCloseTo(Math.cos(Math.PI / 18), 6);
    expect(shot.hit!.point.map((c) => Math.round(c * 100) / 100)).toEqual(FACING.point);
    expect(fire.state().decals).toBe(1);
    expect(fire.decalMeshes()[0]).toBeInstanceOf(Mesh);
  });
});

/** Spawn A's feet on Frostfire (KNOWN section 1), as `e2e/reticle.spec.ts` stands there. */
const SPAWN_A: V3 = [796, 100, 614];
/**
 * The look at A the fixture shoots along -- yaw 90 (toward -x), the rest pitch `init_aim_pitch` -- and where the round
 * lands, recorded 2026-09-28 off this hull: from the third-person eye (820.906, 125.709, 614) through the SEAL's
 * column onto `container_blue01`'s `climb` side, 12 units west of A (its normal 10 degrees off +x).
 */
const FACING = { yaw: 90, pitch: INIT_AIM_PITCH, distance: 37.379, point: [784, 119.75, 614] as V3 };

describe('WEAPON: the round leaves the rifle\'s muzzle, the events, the reload\'s clip, the kick', () => {
  /** A shooter's eye at (0, 20, 0) looking down -z; the muzzle 3 right, 5 down, 8 ahead (a shouldered rifle). */
  const source = (grid: Grid, extra: Partial<FireSource> = {}): FireSource => ({
    grid: () => grid,
    aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }),
    muzzle: () => [3, 15, -8],
    ...extra,
  });

  it('fires from the muzzle toward the point under the reticle: the round lands where the eye\'s ray meets the wall', () => {
    const fire = new Fire(source(world([wallAt(-60)])), DEFAULT_RIFLE, undefined, () => 0.5);
    const shot = fire.shoot()!;
    expect(shot.from).toEqual([3, 15, -8]);
    expect(shot.hit!.point.map((v) => Math.round(v * 1000) / 1000)).toEqual([0, 20, -60]);
    expect(shot.hit!.distance).toBeCloseTo(Math.hypot(3, 5, 52), 5);
  });

  it('meets what stands between the rifle and the aim point first', () => {
    // a low wall from y 0 to 18 at z -30: under the eye's line (y 20) but across the muzzle's (y 17.1 there)
    const low = quad([-50, 0, -30, 50, 0, -30, 50, 18, -30, -50, 18, -30]);
    const fire = new Fire(source(world([wallAt(-60), low])), DEFAULT_RIFLE, undefined, () => 0.5);
    const shot = fire.shoot()!;
    expect(shot.hit!.point[2]).toBeCloseTo(-30, 6);
    expect(shot.hit!.point[1]).toBeCloseTo(15 + 5 * 22 / 52, 5);
  });

  it('without a muzzle it is the eye\'s round, as before', () => {
    const fire = new Fire(source(world([wallAt(-60)]), { muzzle: () => null }), DEFAULT_RIFLE, undefined, () => 0.5);
    expect(fire.shoot()!.from).toEqual([0, 20, 0]);
  });

  it('tells its subscribers each round (the weapon, the fire point, the end) and each reload\'s start and end', () => {
    const events: FireEvent[] = [];
    const fire = new Fire(source(world([wallAt(-60)]), { reloadSeconds: () => 1.6 }), DEFAULT_RIFLE, undefined, () => 0.5);
    const off = fire.subscribe((e) => events.push(e));
    fire.shoot();
    expect(events[0]).toMatchObject({
      type: 'round', from: [3, 15, -8], hit: true, rounds: 29,
      weapon: { name: 'M4A1', id: 54, fireAnim: 'muzzle_m4', sounds: { close: '.M4A1', med: '.M4A1_M', far: '.M4A1_F', reload: '.M4A1_RLD' } },
    });
    expect(fire.reload()).toBe(true);
    expect(events[1]).toMatchObject({ type: 'reloadPress', seconds: RELOAD_DELAY });   // LATER 72: the press, its delay
    fire.update(pastKit(RELOAD_DELAY));
    expect(events[2]).toMatchObject({ type: 'reloadStart', seconds: 1.6 });      // the reload clip's playback
    fire.update(1.5);
    expect(events).toHaveLength(3);
    fire.update(0.2);
    expect(events[3]).toMatchObject({ type: 'reloadEnd', completed: true });
    expect(fire.state().magazine).toMatchObject({ rounds: 30, spare: 2 });      // the 29 kept in the ring
    fire.shoot(); fire.update(0.2); fire.reload(); fire.update(pastKit(RELOAD_DELAY));
    fire.reset();
    expect(events.at(-1)).toMatchObject({ type: 'reloadEnd', completed: false });
    off();
    fire.shoot();
    expect(events.at(-1)!.type).toBe('reloadEnd');
  });

  it('holds the trigger for the raise, and kicks the aim\'s pitch through the source', () => {
    let pitch = 0;
    const fire = new Fire(source(world([wallAt(-60)]), {
      look: () => ({ pitch, stance: 'stand' }), kickPitch: (r) => { pitch += r; },
    }), DEFAULT_RIFLE, undefined, () => 0);
    expect(fire.triggerHeld()).toBe(false);
    fire.pull();
    expect(fire.triggerHeld()).toBe(true);
    fire.release();
    for (let i = 0; i < 6; i++) fire.update(1 / 60);
    expect(pitch).toBeCloseTo(6 * DEFAULT_RIFLE.rifleKick.stand!.rate / 60, 9);   // rising at FireRifleKickRate
    for (let i = 0; i < 120; i++) fire.update(1 / 60);
    expect(pitch).toBeCloseTo(0, 9);                                                // and back to the rest
    expect(fire.state().kick.state).toBe(0);
  });

  it('hands the source\'s pad pitch push to the falling kick: the rest follows it up (PF-06)', () => {
    let pitch = 0;
    let push = 0;
    const fire = new Fire(source(world([wallAt(-60)]), {
      look: () => ({ pitch, stance: 'stand', pitchPush: push }), kickPitch: (r) => { pitch += r; },
    }), DEFAULT_RIFLE, undefined, () => 0);
    fire.pull();
    fire.release();
    for (let i = 0; i < 600 && fire.state().kick.state !== 2; i++) fire.update(1 / 60);
    expect(fire.state().kick.state).toBe(2);
    push = 1;
    fire.update(1 / 60);
    expect(fire.state().kick.rest).toBeCloseTo(0.04 * (1 / 60) / GAME_FRAME_DT, 12);   // 0.04 x the push a game frame
  });
});

// ---- web sprint 4, M4: each firearm class's own behaviour (research 94 §C1-§C4) -------------------------------------

describe('M4: each class\'s lock, reload, pellets and launched rounds on the page (research 94 part 3)', () => {
  const rec = (over: Partial<WeaponRecord>): WeaponRecord => ({ ...DEFAULT_RIFLE, fireModes: [1], maxFireMode: 1, ...over });
  const m40 = rec({ name: 'M40A1', id: 102, fireWait: 0.5, magazine: 25, mags: 1, reloadAfterShot: true, reloadDelayAfterShot: 0.5 });
  const r870 = rec({ name: '870', id: 84, fireWait: 0.75, magazine: 8, mags: 5, reloadAfterShot: true, reloadDelay: 1, afterShotSound: '.SHOTGUN_COCK', pellets: 4 });
  const spas = rec({ name: 'Spas 12', id: 81, fireWait: 0.45, magazine: 12, mags: 3, reloadTime: 2, reloadDelay: 0.5, pellets: 4 });
  // OT.R97, R4B-01: the M60E3's FireWait is r0004's 0.16 (its parser's step, r4 0x3f054c; research 374); the disc's 0.14 is r0001's.
  const m60 = rec({ name: 'M60E3', id: 91, fireWait: M60E3_FIRE_WAIT_READING, magazine: 100, mags: 2, reloadTime: 3, fireModes: [3], maxFireMode: 3 });
  const m4203 = rec({ name: 'M4A1-M203', id: 61, fireModes: [1, 2, 3], maxFireMode: 3 });
  const mgl = rec({ name: 'MGL', id: 142, fireWait: 0.25, magazine: 6, mags: 2, fireModes: [], maxFireMode: 0, ammo: '', ammoId: -1 });
  /** `zweapon.rdr`'s M203 FRAG as the kit table reads it (research 94 §C4.1): MV 27 (270 u/s), arming 10 m, FireWait 1, RAS + 0.5. */
  const frag: KitRound = {
    record: { ...M67, name: 'M203 FRAG', id: 175, muzzleVelocity: 270, armingDistance: 100, impact: true, fuse: 10, removal: 10.1 },
    piercing: 0, fireWait: 1, reloadAfterShot: true, reloadDelayAfterShot: 0.5, icon: 'firemode_203_frag.tif',
  };

  /** The clip seconds a family plays (the page's `Play.reloadSeconds`): `ReloadTime` when set, the stand-ins below else. */
  const CLIP: Record<string, number> = { rifle: 1.6, pistol: 1.4, shotgun: 2.2, pump: 0.8, m203: 1.9 };
  const rig = (record: WeaponRecord, extra: Partial<FireSource> = {}, gun?: FireGun) => {
    const events: FireEvent[] = [];
    const asked: [string | undefined, number | undefined][] = [];
    const fire = new Fire({
      grid: () => world([wallAt(-600)]), aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }), muzzle: () => [3, 15, -8],
      reloadSeconds: (family, reloadTime) => { asked.push([family, reloadTime]); return reloadTime && reloadTime > 0 ? reloadTime : CLIP[family ?? 'rifle']!; },
      ...extra,
    }, record, undefined, () => 0.5);
    if (gun) fire.setGun(gun);
    fire.subscribe((e) => events.push(e));
    return { fire, events, asked };
  };

  it.each([
    // name, record, the lock after a round, the after-shot's family, its sound, the clip's seconds
    ['M40A1', m40, 0.5, 'shotgun', null, 2.2],         // the bolt: 0.5 s, then the shotgun reload clip (FUN_005a82e0's bVar5)
    ['870', r870, 0.01, 'pump', '.SHOTGUN_COCK', 0.8],  // the pump: the misspelt key's 0.01 (R94.12), the pump clip, the cock
    ['Spas 12', spas, null, null, null, 0],              // no ReloadAfterShot
    ['M4A1', DEFAULT_RIFLE, null, null, null, 0],
  ] as const)('%s: the lock after a round, then the after-shot clip and sound (FUN_005c5340, FUN_005c3000)', (_name, record, lock, family, sound, clip) => {
    const { fire, events } = rig(record);
    expect(fire.shoot()).not.toBeNull();
    if (lock === null) {
      expect(fire.state().afterShot).toBe(false);
      fire.update(pastRate(record.fireWait));                // LATER 326: the rate's whole game frames
      expect(fire.shoot()).not.toBeNull();
      expect(events.some((e) => e.type === 'afterShot')).toBe(false);
      return;
    }
    expect(fire.state().afterShot).toBe(true);
    fire.update(Math.max(0, pastKit(lock) - GAME_FRAME_DT - 2e-6));       // LATER 330: a game frame short of the lock's whole frames
    expect(events.filter((e) => e.type === 'afterShot')).toHaveLength(0);
    fire.update(GAME_FRAME_DT + 2e-6);                     // its last game frame ends it: the after-shot clip and the sound
    expect(events.at(-1)).toMatchObject({ type: 'afterShot', family, sound, seconds: clip });
    fire.update(pastRate(record.fireWait));               // the rate's wait over after the lock (LATER 330: held through it), the clip still holds the fire (FUN_005a7ab0)
    expect(fire.shoot()).toBeNull();
    fire.update(clip);
    expect(fire.state().afterShot).toBe(false);
    expect(fire.shoot()).not.toBeNull();
  });

  // PAR-88 (research 251 section 12.3, "PAR-88"): moved by the read. This pin was "a reload asked in the bolt's lock
  // replaces it (FUN_005c32b0)": R taken in the lock's timer, no after-shot, the reload landing. The original refuses it:
  // R arms the timer only when `FUN_005a7ab0` answers no (`FUN_00594cf0` D:L453460-453463), and it answers while the
  // timer runs (`FUN_005c2400`, D:L462522-462523). The disc's cases are the "PAR-88" block below.
  it("a reload asked in the bolt's lock is refused (FUN_005a7ab0's timer term; PAR-88, was: replaces it); in its after-shot clip it is refused -- the room's twin", () => {
    const { fire, events } = rig({ ...m40, mags: 2 });
    fire.shoot();
    fire.update(0.17);
    expect(fire.reload()).toBe(false);                    // the timer runs: refused, and nothing kept for later
    fire.update(0.34);                                    // the lock ends: its after-shot clip, not a reload
    expect(events.at(-1)).toMatchObject({ type: 'afterShot', family: 'shotgun' });
    fire.update(5);
    expect(events.some((e) => e.type === 'reloadStart')).toBe(false);
    expect(fire.state().magazine).toMatchObject({ rounds: 24, reloading: false });
    const late = rig({ ...m40, mags: 2 });
    late.fire.shoot();
    late.fire.update(0.5); late.fire.update(0.17);          // the after-shot clip plays
    expect(late.fire.reload()).toBe(false);
  });

  it('a reload pending its ReloadDelay lands on the slot the mode redirects to when it lands (FUN_005c2a90 L477408-477440)', () => {
    const ring = new MagazineRing(6, 2);
    ring.fire();
    const { fire } = rig({ ...m4203, reloadDelay: 0.5 });
    fire.shoot();
    expect(fire.reload()).toBe(true);                     // the rifle's reload asked ...
    fire.setRound({ id: 175, round: frag, ring });          // ... and the mode switched to the round before it lands
    fire.update(0.6);
    expect(ring.state().current).toBe(1);                   // the round slot's ring turned, as the game's walk does
    expect(fire.state().magazine).toMatchObject({ rounds: 6, capacity: 6 });
  });

  // LATER 179 (research 94 §C1.1): a bolt is one projectile -- its last round arms neither the lock nor the reload
  // (`FUN_005c5340` D:L479296-479300, D:L479321-479343); the dry pull reloads it at once (was: after ReloadDelay).
  it('the last round arms no after-shot lock and no reload (one projectile): the dry pull reloads at once instead', () => {
    const { fire, events } = rig({ ...m40, magazine: 1, mags: 2 });
    fire.shoot();
    expect(fire.state().afterShot).toBe(false);
    fire.update(0.011);
    fire.update(1);
    expect(events.some((e) => e.type === 'reloadStart' || e.type === 'reloadPress')).toBe(false);
    expect(fire.state().magazine).toMatchObject({ rounds: 0, reloading: false });
    expect(fire.pull()).toBeNull();
    expect(events.at(-1)).toMatchObject({ type: 'reloadStart', family: 'shotgun' });
  });

  // PARITY-1's close review (a regression against main): a hand's change -- `setWeapon`, `takeWeapon`, a spawn's `refill`
  // -- clears the kit's one timer (`kit+0x820`: a reload's delay or a bolt's or pump's lock) and an after-shot clip, as
  // `cancelReload` always did before PAR-19; only a body's end (a reaction) leaves a reload not under way to the room.
  const pistol = rec({ name: 'M9', id: 1, fireWait: 0.1, magazine: 15, mags: 3 });
  it.each([
    ['in the bolt\'s lock', 0.1],
    ['in its after-shot clip', 0.7],
  ] as const)('a swap to the pistol %s clears the bolt\'s after-shot: no after-shot plays on the pistol and it fires', (_when, at) => {
    const { fire, events } = rig(m40);
    expect(fire.shoot()).not.toBeNull();
    fire.update(at);
    events.length = 0;
    fire.setWeapon(pistol);
    expect(fire.state().afterShot).toBe(false);
    fire.update(0.5);
    expect(events.some((e) => e.type === 'afterShot')).toBe(false);
    expect(fire.shoot()).not.toBeNull();
  });

  it('a weapon taken from the ground over the same weapon clears its after-shot (takeWeapon)', () => {
    const { fire, events } = rig(m40);
    expect(fire.shoot()).not.toBeNull();
    fire.update(0.1);
    events.length = 0;
    fire.takeWeapon(m40, [25, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(fire.state().afterShot).toBe(false);
    fire.update(0.5);
    expect(events.some((e) => e.type === 'afterShot')).toBe(false);
    expect(fire.shoot()).not.toBeNull();
  });

  it('a spawn\'s fresh kit (refill) drops a reload waiting its ReloadDelay and a bolt\'s after-shot: neither lands after it', () => {
    const waiting = rig(r870);
    waiting.fire.shoot();
    waiting.fire.update(5); waiting.fire.update(5);          // past the pump's lock and its clip
    expect(waiting.fire.reload()).toBe(true);               // the 870's ReloadDelay 1 running
    waiting.fire.update(0.3);
    waiting.events.length = 0;
    waiting.fire.refill();
    expect(waiting.fire.state().magazine.reloading).toBe(false);
    waiting.fire.update(1);
    expect(waiting.events.some((e) => e.type === 'reloadStart')).toBe(false);
    const bolt = rig(m40);
    bolt.fire.shoot();
    bolt.fire.update(0.7);                                  // the after-shot clip plays
    bolt.events.length = 0;
    bolt.fire.refill();
    expect(bolt.fire.state().afterShot).toBe(false);
    bolt.fire.update(0.5);
    expect(bolt.events.some((e) => e.type === 'afterShot')).toBe(false);
    expect(bolt.fire.shoot()).not.toBeNull();
  });

  it.each([
    // name, record, ReloadDelay before it lands, the clip family asked, the reload's seconds
    ['Spas 12', spas, 0.5, 'rifle', 2],               // ReloadTime 2 stretches the Rifle reload (FUN_005a82e0 L462940-462945)
    ['M60E3', m60, 0.01, 'rifle', 3],                 // ReloadTime 3
    ['870', r870, 1, 'shotgun', 2.2],                 // the 870's Shotgun reload, its ReloadDelay 1
    ['M4A1', DEFAULT_RIFLE, 0.01, 'rifle', 1.6],
  ] as const)('%s: the reload waits the record\'s ReloadDelay, then plays its class\'s clip', (_name, record, delay, family, seconds) => {
    const { fire, events, asked } = rig(record);
    fire.shoot();
    fire.update(5);                                         // past any lock ...
    fire.update(5);                                         // ... and the after-shot clip it started
    events.length = 0;
    expect(fire.reload()).toBe(true);
    expect(events).toEqual([expect.objectContaining({ type: 'reloadPress', seconds: delay })]);   // LATER 72: the press, its delay
    fire.update(Math.max(0, pastKit(delay) - GAME_FRAME_DT - 2e-6));   // LATER 330: a game frame short of its whole frames
    expect(events).toHaveLength(1);
    fire.update(GAME_FRAME_DT + 2e-6);
    expect(events[1]).toMatchObject({ type: 'reloadStart', seconds, family });
    expect(asked.at(-1)).toEqual([family, record.reloadTime ?? 0]);
  });

  it('a shotgun pull: 4 rays, each its own cone draw, one shell off the magazine (FUN_005be9a0 L475580-475677)', () => {
    let draws = 0;
    const gun: FireGun = { trigger: () => {}, roundsPerPull: () => 1, interval: (w) => w, round: (d) => { draws++; return [d[0] + draws * 0.001, d[1], d[2]]; } };
    const { fire, events } = rig(spas, {}, gun);
    const shot = fire.shoot()!;
    expect(draws).toBe(4);
    const rounds = events.filter((e) => e.type === 'round');
    expect(rounds.map((e) => (e as { pellet?: number }).pellet)).toEqual([0, 1, 2, 3]);
    expect(rounds.every((e) => (e as { rounds: number }).rounds === 11)).toBe(true);
    expect(shot.volley).toHaveLength(4);
    expect(fire.state()).toMatchObject({ shots: 1, decals: 4, magazine: { rounds: 11 } });
    // One pull, one shell: the next pull waits the FireWait.
    expect(fire.shoot()).toBeNull();
    fire.update(pastRate(0.45));                             // LATER 326: the rate's whole game frames (0.467 s)
    expect(fire.shoot()).not.toBeNull();
    expect(fire.state().magazine.rounds).toBe(10);
  });

  // Round 4 of NET-FIX2's review (research 223 s6): a round mode's reload is journalled on the round's ring (the kit's,
  // not the weapon's) and taken back as any other -- a flinch's undo while it runs, a stale reload's restore after.
  it('a round mode\'s reload flinched and undone, and one refused stale after its lock, are taken back on the round\'s ring', () => {
    for (const how of ['flinch', 'stale'] as const) {
      const ring = new MagazineRing(1, 4);
      const { fire, events } = rig(m4203, { launchPoint: () => [2, 16, -6] });
      fire.setRound({ id: 175, round: frag, ring });
      expect(fire.shoot()).not.toBeNull();                   // the slot's one round launched
      fire.update(0.501); fire.update(2);                    // the round's lock and its after-shot clip
      expect(fire.reload()).toBe(true);
      fire.update(RELOAD_DELAY + 0.001);                     // begun: the next slot in, its lock running
      expect([ring.state().current, fire.state().magazine.reloading]).toEqual([1, true]);
      const started = events.filter((e) => e.type === 'reloadStart').at(-1) as Extract<FireEvent, { type: 'reloadStart' }>;
      if (how === 'flinch') {
        expect(fire.undoReload()).toBe(true);
        expect(events.at(-1)).toMatchObject({ type: 'reloadEnd', completed: false });
      } else {
        fire.update(10);                                     // its lock long over
        expect(fire.state().magazine.reloading).toBe(false);
        expect(fire.restoreReload(started.reload!)).toBe(true);
      }
      // The room never swapped: the empty slot back in the weapon, no lock.
      expect([ring.state().current, ring.rounds(), fire.state().magazine.reloading]).toEqual([0, 0, false]);
    }
  });

  it('a round mode launches the round lofted onto the aimed point from firepoint_203, one off its slot (research 94 §C4.2)', () => {
    const ring = new MagazineRing(6, 1);
    const { fire, events } = rig(m4203, { launchPoint: () => [2, 16, -6] });
    fire.setRound({ id: 175, round: frag, ring });
    expect(fire.roundMode()).toMatchObject({ id: 175, name: 'M203 FRAG', armingDistance: 100 });
    expect(fire.state().magazine).toMatchObject({ rounds: 6, capacity: 6, spare: 0 });     // the redirected slot's
    const shot = fire.shoot()!;
    const launch = events.find((e) => e.type === 'launch') as Extract<FireEvent, { type: 'launch' }>;
    expect(launch).toMatchObject({ type: 'launch', round: { id: 175, name: 'M203 FRAG' }, from: [2, 16, -6], rounds: 5 });
    expect(shot.from).toEqual([2, 16, -6]);
    // Lofted: above the flat line to the wall's point, at the round's speed.
    const flat = Math.atan2(20 - 16, 600 - 6);
    expect(Math.asin(launch.dir[1])).toBeGreaterThan(flat);
    expect(Math.hypot(...launch.velocity)).toBeCloseTo(270, 6);
    expect(events.some((e) => e.type === 'round')).toBe(false);      // no bullet, no marks
    expect(ring.rounds()).toBe(5);
    expect(fire.state().magazine.rounds).toBe(5);
    // The round's FireWait (1 s) and its lock (0.5 s), then `Rifle m203 reload` (DAT_003debf8).
    fire.update(0.501);
    expect(events.at(-1)).toMatchObject({ type: 'afterShot', family: 'm203', seconds: 1.9 });
    fire.update(0.5);
    expect(fire.shoot()).toBeNull();
    fire.update(1.9);
    expect(fire.shoot()).not.toBeNull();
    fire.setRound(null);
    expect(fire.roundMode()).toBeNull();
    expect(fire.state().magazine).toMatchObject({ rounds: 30, capacity: 30 });                // the rifle's own again
  });

  // P4 (the online-parity sweep's TB-10 + WK-1; the network's bookkeeping, LOW-2 -- no original, the console has no
  // wire): a round mode's launch is journalled on the round's ring (round 4's `of: 'round'`) and its `launch` event
  // carries the journal id, so a `stale` the room tells for it gives the round back -- the ring and the HUD's count.
  it("RED: P4 -- a round mode's launch carries its journal shot; refundRound gives the round back to its ring and the HUD's count, once, after a later launch replayed, never after a refill", () => {
    const ring = new MagazineRing(6, 1);
    const { fire, events } = rig(m4203, { launchPoint: () => [2, 16, -6] });
    fire.setRound({ id: 175, round: frag, ring });
    const launches = (): Extract<FireEvent, { type: 'launch' }>[] => events.filter((e) => e.type === 'launch') as Extract<FireEvent, { type: 'launch' }>[];
    expect(fire.shoot()).not.toBeNull();
    const first = launches()[0]!.shot;
    expect(first).toEqual(expect.any(Number));                       // today: the launch carries no shot
    fire.update(0.501); fire.update(0.5); fire.update(1.9);          // the round's wait, its lock and its after-shot clip
    expect(fire.shoot()).not.toBeNull();                             // a later launch from the same ring
    const second = launches()[1]!.shot;
    expect(second).not.toBe(first);
    expect([ring.rounds(), fire.state().magazine.rounds]).toEqual([4, 4]);
    expect(fire.refundRound(first)).toBe(true);                      // the room refused the first: back, the second replayed
    expect([ring.rounds(), fire.state().magazine.rounds]).toEqual([5, 5]);
    expect(fire.refundRound(first)).toBe(false);                     // once
    fire.refill();                                                   // a new kit: its rounds are no more
    expect(fire.refundRound(second)).toBe(false);
  });

  it('the MGL fires its round with no lock after it (L479325), from the fire point without a firepoint_203', () => {
    const { fire, events } = rig(mgl);
    fire.setRound({ id: 175, round: frag, ring: new MagazineRing(6, 1) });
    expect(fire.shoot()!.from).toEqual([3, 15, -8]);       // FIREPOINT_203_READING: the model's firepoint
    expect(fire.state().afterShot).toBe(false);
    fire.update(pastRate(1));                                // LATER 326: the rate's whole game frames (1.001 s)
    expect(fire.shoot()).not.toBeNull();
    expect(events.filter((e) => e.type === 'launch')).toHaveLength(2);
  });

  it('an empty round slot fires nothing and clicks', () => {
    const ring = new MagazineRing(6, 1);
    for (let i = 0; i < 6; i++) ring.fire();
    const { fire, events } = rig(m4203);
    fire.setRound({ id: 175, round: frag, ring });
    expect(fire.pull()).toBeNull();
    expect(events.at(-1)).toMatchObject({ type: 'dry' });
  });
});

/**
 * INT-NET-2: the aim point on a body (research 84 §19). `FUN_005aa6e0` (D:L464022-464374) takes the nearest hit of the
 * eye's ray -- a body's `PERSON` (0.97) included, only VOLUMETRIC, LIQUID and >= 0.98 non-PICKUP materials passed
 * (D:L464149-464151) -- as the aim point the round leaves the muzzle toward (`FUN_005be9a0` D:L475550). Ported from
 * Chris's browser-beta-v5 (d578f347: his two `fire.test.ts` cases, `targetDistance`), and the case of a body in the open
 * air. Without the penetration table the round still ends at the body unmarked; with it (P12, SW-2) the body is one
 * surface of the round's walk at PERSON's PENETRATION (0.97, `FUN_003c8920` D:L319473-319518), as the room's is: the
 * body takes no mark (the room judges the hit and sends the blood) and the wall behind it is struck.
 */
describe('the aim point on a body under the reticle (FireSource.targetDistance)', () => {
  const PEN: Record<number, number> = { 30: 0.99, 26: 0.35, 25: 0, 29: 1 };
  const bodyAt = (d: number | null, grid: Grid, muzzle: V3 | null = [3, 14, -20]) => new Fire({
    grid: () => grid, aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }), ...(muzzle ? { muzzle: () => muzzle } : {}),
    targetDistance: () => d,
  } as FireSource, DEFAULT_RIFLE, undefined, () => 0.5);
  /** Where the round's line crosses the depth `z`. */
  const at = (shot: { from: V3; to: V3 }, z: number): number[] => {
    const t = (z - shot.from[2]) / (shot.to[2] - shot.from[2]);
    return [0, 1].map((i) => shot.from[i]! + t * (shot.to[i]! - shot.from[i]!));
  };

  it('converges the muzzle on a remote body under the reticle before the distant wall', () => {
    const fire = bodyAt(60, world([wallAt(-200)]));
    const shot = fire.shoot()!;
    at(shot, -60).forEach((v, i) => expect(v).toBeCloseTo([0, 20][i]!, 6));
    shot.to.forEach((v, i) => expect(v).toBeCloseTo([0, 20, -60][i]!, 6));   // it ends at the body
    expect(shot.hit).toBeNull();
    expect(fire.state().decals).toBe(0);                                      // no mark on the wall behind the body
  });

  it('keeps a wall before a remote body as the reticle target', () => {
    const fire = bodyAt(60, world([wallAt(-30)]));
    fire.shoot()!.hit!.point.forEach((v, i) => expect(v).toBeCloseTo([0, 20, -30][i]!, 6));
  });

  it('converges on a body in the open air (no hull under the reticle)', () => {
    const shot = bodyAt(60, world([])).shoot()!;
    shot.to.forEach((v, i) => expect(v).toBeCloseTo([0, 20, -60][i]!, 6));
  });

  it('P12 (SW-2): with the penetration table a body at 100 u and a wall at 150 u -- the round goes on past the body (PERSON 0.97) and the wall is marked, its impact played; the body takes no mark', () => {
    for (const muzzle of [[3, 14, -20] as V3, null]) {
      const fire = bodyAt(100, world([wallAt(-150)]), muzzle);
      fire.setPenetration((m) => PEN[m ?? 0] ?? 0);
      const events: FireEvent[] = [];
      fire.subscribe((e) => events.push(e));
      const shot = fire.shoot()!;
      expect(shot.hit, `muzzle ${String(muzzle)}`).not.toBeNull();
      expect(shot.hit!.point[2]).toBeCloseTo(-150, 6);
      expect(shot.to[2]).toBeCloseTo(-150, 6);                                  // the tracer runs to the wall, not the body
      expect(shot.through).toBeUndefined();                                     // the body is no through-surface of its own
      expect(fire.state().decals).toBe(1);                                      // the wall's mark alone
      expect(events.find((e) => e.type === 'round')).toMatchObject({ hit: true, material: 25 });
    }
  });

  it("P12 (SW-2): every body on the round's line is one surface (FireSource.bodyDistances) -- a no-piercing 200 u round past one body at 60 reaches a wall at 190 (194 left), past two (60, 120) it does not (188.18 left)", () => {
    const SHORT: WeaponRecord = { ...DEFAULT_RIFLE, name: 'SHORT', piercing: 0, maximumRange: 20, effectiveRange: 20 };
    const make = (bodies: number[]): Fire => {
      const fire = new Fire({
        grid: () => world([wallAt(-190)]), aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }),
        targetDistance: () => bodies[0] ?? null, bodyDistances: () => bodies,
      } as FireSource, SHORT, undefined, () => 0.5);
      fire.setPenetration((m) => PEN[m ?? 0] ?? 0);
      return fire;
    };
    const one = make([60]), two = make([60, 120]);
    const a = one.shoot()!, b = two.shoot()!;
    expect(a.hit!.point[2]).toBeCloseTo(-190, 6);
    expect(one.state().decals).toBe(1);
    expect(b.hit).toBeNull();                                                   // spent in the air past the second body
    expect(b.to[2]).toBeCloseTo(-200 * 0.97 * 0.97, 3);
    expect(two.state().decals).toBe(0);
  });

  it("MAP-10b: a turret's drawn round (drawRound) with a body on the gun's line -- without the table it stops there unmarked; with it (P12, SW-2) it goes on past the body to the wall, as the firearm's own does", () => {
    const asked: [V3, V3, number][] = [];
    for (const table of [false, true]) {
      const fire = new Fire({
        grid: () => world([wallAt(-200)]), aim: () => null,
        targetDistance: (eye: V3, ray: V3, reach: number) => { asked.push([[...eye], [...ray], reach]); return 60; },
      } as FireSource, DEFAULT_RIFLE, undefined, () => 0.5);
      if (table) fire.setPenetration((m) => PEN[m ?? 0] ?? 0);
      const r = fire.drawRound([5, 20, -2], [0, 0, -1], 8000, 0, 205, 4)!;
      if (table) {
        expect(r.hit!.point[2]).toBeCloseTo(-200, 6);
        r.to.forEach((v, i) => expect(v).toBeCloseTo([5, 20, -200][i]!, 6));
        expect(fire.state().decals).toBe(1);                                    // the wall's mark; none on the body
      } else {
        expect(r.hit).toBeNull();
        r.to.forEach((v, i) => expect(v).toBeCloseTo([5, 20, -62][i]!, 6));
        expect(fire.state().decals).toBe(0);
      }
      expect(r.through).toEqual([]);
      expect(fire.tracerVisible()).toBe(true);
    }
    expect(asked).toEqual([[[5, 20, -2], [0, 0, -1], 8000], [[5, 20, -2], [0, 0, -1], 8000]]);
    // P12: every body on the gun's line (`bodyDistances`), none of them a through-surface; a CAMO_NET-like pane (30,
    // 0.99) between them is.
    const many = new Fire({
      grid: () => world([{ ...wallAt(-90), material: 30 }, wallAt(-200)]), aim: () => null,
      targetDistance: () => 60, bodyDistances: () => [60, 120],
    } as FireSource, DEFAULT_RIFLE, undefined, () => 0.5);
    many.setPenetration((m) => PEN[m ?? 0] ?? 0);
    const m = many.drawRound([5, 20, -2], [0, 0, -1], 8000, 0, 205, 1)!;
    expect(m.hit!.point[2]).toBeCloseTo(-200, 6);
    expect(m.through.map((t) => [Math.round(t.point[2]), t.material])).toEqual([[-90, 30]]);
    expect(many.state().decals).toBe(2);
    // The wall before the body: the wall's mark, as before.
    const near = new Fire({ grid: () => world([wallAt(-30)]), aim: () => null, targetDistance: () => 60 } as FireSource, DEFAULT_RIFLE, undefined, () => 0.5);
    expect(near.drawRound([5, 20, -2], [0, 0, -1], 8000, 0, 205, 1)!.hit!.point[2]).toBeCloseTo(-30, 6);
    expect(near.state().decals).toBe(1);
  });

  it('the eye standing in for the muzzle: the round still ends at the body', () => {
    const shot = bodyAt(60, world([wallAt(-200)]), null).shoot()!;
    expect(shot.hit).toBeNull();
    shot.to.forEach((v, i) => expect(v).toBeCloseTo([0, 20, -60][i]!, 6));
  });

  it('none nearer than the hull, or none at all: the hull\'s point as before', () => {
    expect(bodyAt(null, world([wallAt(-200)])).shoot()!.hit!.point[2]).toBeCloseTo(-200, 6);
    expect(bodyAt(250, world([wallAt(-200)])).shoot()!.hit!.point[2]).toBeCloseTo(-200, 6);
  });

  it('the accuracy pip measures against the body: a wall only the far leg crosses is no block', () => {
    // A low wall at z -100 right of the eye's line: the muzzle's leg to the far wall crosses it, the leg to a body at 30
    // ends before it.
    const low = quad([1, 0, -100, 50, 0, -100, 50, 18, -100, 1, 18, -100]);
    expect(bodyAt(null, world([low, wallAt(-200)])).blockedMuzzle()).not.toBeNull();
    expect(bodyAt(30, world([low, wallAt(-200)])).blockedMuzzle()).toBeNull();
  });
});

describe('PF-34: a weapon taken from the ground (research 234 s4; ruling PF.R54)', () => {
  it('takeWeapon sets the record and the exact ring given (MagazineRing.from), fills nothing and forgets the replaced weapon\'s stowed ring; refill still fills a spawn', () => {
    const SD: WeaponRecord = { ...DEFAULT_RIFLE, name: 'M4A1 SD', id: 62 };
    const PISTOL: WeaponRecord = { ...DEFAULT_RIFLE, name: 'Mark 23', id: 15, magazine: 12, mags: 3 };
    const { fire } = rig(world([wallAt(-200)]));
    fire.setWeapon(PISTOL);                                      // the rifle stowed with its full ring
    fire.setWeapon(DEFAULT_RIFLE);
    fire.shoot(); fire.update(1);
    expect(fire.magazineTotal()).toBe(89);
    // The M4A1 SD taken in the hand's slot: its record, the exact (empty) ring the room gave, nothing filled.
    fire.takeWeapon(SD, new Array<number>(10).fill(0));
    expect(fire.weaponRecord()).toBe(SD);
    expect(fire.magazineTotal()).toBe(0);
    expect(fire.state().magazine.rounds).toBe(0);
    expect(fire.reload()).toBe(false);                           // no magazine to take
    // The replaced M4A1's ring is gone: drawn again it would come full (never drawn), not as it was left.
    expect(fire.magazineOf(DEFAULT_RIFLE)).toEqual({ rounds: 30, capacity: 30, spare: 2 });
    // A bundle's magazines arriving as the room's ten slots: set exactly, the one in the weapon kept.
    fire.setRing(SD, [0, 17, 30, 0, 0, 0, 0, 0, 0, 0]);
    expect(fire.magazineTotal()).toBe(47);
    expect(fire.state().magazine.rounds).toBe(0);
    expect(fire.reload()).toBe(true);
    // A stowed weapon's ring set the same way (the pistol's, from the room), and a replaced stowed one forgotten.
    fire.setRing(PISTOL, [5, 12, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(fire.magazineOf(PISTOL)).toEqual({ rounds: 5, capacity: 12, spare: 1 });
    const M9: WeaponRecord = { ...PISTOL, name: 'M9', id: 16, magazine: 15 };
    fire.setRing(M9, new Array<number>(10).fill(0), PISTOL.name);
    expect(fire.magazineOf(M9)).toEqual({ rounds: 0, capacity: 15, spare: 0 });
    expect(fire.magazineOf(PISTOL)).toEqual({ rounds: 12, capacity: 12, spare: 2 });   // forgotten: a fresh ring if seen again
    // A spawn still fills (fire.ts's fill-on-spawn: setWeapon + refill), the pickup path never did.
    fire.refill();
    expect(fire.magazineTotal()).toBe(90);
  });
});

describe('PF-34 review: the kit after a walk-over and the shots in flight (research 234 s4)', () => {
  it('a kit after a walk-over leaves the page\'s own magazine in the weapon untouched (shots in flight are not refilled)', () => {
    const { fire } = rig(world([wallAt(-200)]));
    // The ring as the room last had it: 30 / 30 / 30, the first in the weapon, seven free.
    const room = [30, 30, 30, 0, 0, 0, 0, 0, 0, 0];
    // The page fires three the room has not run yet (its magazine falls as it fires: `tryFire`).
    for (let i = 0; i < 3; i++) { expect(fire.shoot()).not.toBeNull(); fire.update(1); }
    expect(fire.state().magazine.rounds).toBe(27);
    // The room's kit after a bundle's 17 went into slot 3: its slot 0 still 30 (those commands not run), slot 3 filled.
    fire.setRing(DEFAULT_RIFLE, [...room.slice(0, 3), 17, 0, 0, 0, 0, 0, 0], undefined, [3]);
    expect(fire.state().magazine.rounds).toBe(27);               // the in-flight rounds not handed back
    expect(fire.magazineTotal()).toBe(27 + 30 + 30 + 17);
    // Without the filled list (an older room's kit) the magazine in the weapon is still the page's own: the transfer
    // never fills it (FUN_00593da0's bundle goes into free slots; AMMO_TRANSFER_PLACEHOLDER), so the room's value there
    // is never newer than the page's.
    fire.shoot(); fire.update(1);
    fire.setRing(DEFAULT_RIFLE, [30, 30, 30, 17, 12, 0, 0, 0, 0, 0]);
    expect(fire.state().magazine.rounds).toBe(26);
    expect(fire.magazineTotal()).toBe(26 + 30 + 30 + 17 + 12);
  });
});

describe("the eye's aim ray's pass rule (FUN_005aa6e0 D:L464149-464151; research 84 §19)", () => {
  // The material table the page holds (`@s2u/scene` `materialTable`: the built-ins, then materials.rdr's SOILS), by byte.
  // The eye at (0, 20, 0) looks down -z; the muzzle at (3, 15, -8); a face of `name` at z -20, STONE (0, solid) at -60.
  // The eye's ray passes a VOLUMETRIC, LIQUID or PENETRATION >= 0.98 non-PICKUP hit; the round leaves the muzzle toward
  // the nearest hit it keeps.
  const TABLE = materialTable();
  const byte = (name: string): number => { const i = TABLE.findIndex((m) => m.name === name); expect(i).toBeGreaterThan(1); return i; };
  const face = (z: number, name: string): WorldPoly => ({ ...wallAt(z), material: byte(name) });
  const muzzle: V3 = [3, 15, -8];
  const toward = (z: number): number[] => { const d = [-muzzle[0], 20 - muzzle[1], z - muzzle[2]], n = Math.hypot(...d); return d.map((v) => v / n); };
  const shotDir = (name: string): number[] => {
    const fire = new Fire({ grid: () => world([face(-20, name), face(-60, 'STONE')]), aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }), muzzle: () => muzzle },
      DEFAULT_RIFLE, undefined, () => 0.5);
    fire.setMaterials((m) => TABLE[m ?? 0] ?? TABLE[0]!);
    const s = fire.shoot()!;
    const d = s.to.map((v, i) => v - s.from[i]!), n = Math.hypot(...d);
    return d.map((v) => v / n);
  };

  it.each([
    ['CHAINLINK_FENCE', 0.98, -60],   // >= 0.98, not PICKUP: looked through, the stone behind is the aim point
    ['ITEM', 1, -20],                 // 1.0 but PICKUP: it stops the eye's ray
    ['WATER', 0.6, -60],              // LIQUID: looked through
    ['LEAFY_TREE', 0.8, -60],         // VOLUMETRIC: looked through
    ['GLASS_THICK', 0, -20],          // PENETRATION 0: it stops the eye's ray
  ] as const)('%s (PENETRATION %s): the round leaves the muzzle toward the face at z %s', (name, pen, z) => {
    expect(TABLE[byte(name)]!.penetration).toBe(pen);
    shotDir(name).forEach((v, i) => expect(v).toBeCloseTo(toward(z)[i]!, 9));
  });

  it("the M203's loft aims at the same hit: past a CHAINLINK_FENCE onto the stone, stopped by an ITEM", () => {
    const m4203: WeaponRecord = { ...DEFAULT_RIFLE, name: 'M4A1-M203', id: 61 };
    const frag: KitRound = {
      record: { ...M67, name: 'M203 FRAG', id: 175, muzzleVelocity: 270, armingDistance: 100, impact: true, fuse: 10, removal: 10.1 },
      piercing: 0, fireWait: 1, reloadAfterShot: true, reloadDelayAfterShot: 0.5, icon: 'firemode_203_frag.tif',
    };
    for (const [name, z] of [['CHAINLINK_FENCE', -60], ['ITEM', -20]] as const) {
      const events: FireEvent[] = [];
      const fire = new Fire({
        grid: () => world([face(-20, name), face(-60, 'STONE')]), aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }), muzzle: () => muzzle,
        launchPoint: () => [2, 16, -6],
      }, m4203, undefined, () => 0.5);
      fire.setMaterials((m) => TABLE[m ?? 0] ?? TABLE[0]!);
      fire.subscribe((e) => events.push(e));
      fire.setRound({ id: 175, round: frag, ring: new MagazineRing(6, 1) });
      fire.shoot();
      const launch = events.find((e) => e.type === 'launch') as Extract<FireEvent, { type: 'launch' }>;
      expect([name, launch.to[2]]).toEqual([name, expect.closeTo(z, 6)]);
    }
  });
});

/**
 * PAR-87 (research 251 section 12.3, "PAR-87"; PTW.R3 with roomReloadLock.test): a launcher round mode's reload, as the
 * original runs it. The request (`FUN_00594cf0` D:L453459-453463) arms the kit's timer; at its end `FUN_005c2a90` finds
 * the round mode (`FUN_005bd7e0`, D:L477413: the slot's item a carrier and its mode word, `kit+0x6fc`, 4 or more),
 * redirects to the round's slot (D:L477415-477445) and walks it from `m_currentmag + 1` for another magazine with rounds
 * (D:L477447-477477). Every launcher round on the disc is one magazine (`zweapon.rdr` NumMags 1), so the walk finds
 * none: no clip is pushed (`FUN_005a82e0` is called only past the walk, D:L477479, D:L477501, D:L477528), no slot is
 * turned, and the network refill (D:L477490-477510, D:L477517-477541) asks a class a round is not (`FUN_003d1a60`
 * D:L324336-324353: 0xab for 171-184). The ring's own reload at its last round (`FUN_005c5340` D:L479297-479320) is the
 * same timer into the same walk. The page refuses the request outright (`Fire.reload`: `canReload`), and arms nothing at
 * the last round or a dry pull: no `reloadStart`, so no `reload` goes to the room (`NetPage.fireEvent`).
 */
const zweaponPar87 = fixture('RUN/ZWEAPON.ZAR');
describe.skipIf(zweaponPar87 === null)(`PAR-87: a round mode's reload by hand, the ring's own and a full ring (FUN_005c2a90 D:L477413-477543)${zweaponPar87 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const LOADOUT = [61, 15, 141, 175, 194] as unknown as Loadout;     // the M4A1-M203's kit: M203 (141) and M203 FRAG (175)
  /** The M4A1-M203 (item 61) off the disc's kit table, in its M203 FRAG mode on the ring the kit gives the round (`KitRounds`). */
  const kit = () => {
    const table = readKitTable(zweaponPar87!);
    const carrier = table.records.get(61)!, round = table.rounds.get(175)!;
    expect([carrier.name, round.record.name]).toEqual(['M4A1-M203', 'M203 FRAG']);
    const ring = new KitRounds(table, LOADOUT).ring(175)!;
    const events: FireEvent[] = [];
    const asked: (string | undefined)[] = [];
    const fire = new Fire({
      grid: () => world([wallAt(-600)]), aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }), launchPoint: () => [2, 16, -6],
      reloadSeconds: (family) => { asked.push(family); return family === 'm203' ? 1.3 : 1.6; },   // `seal_reload_m203` 1.3, `seal_reload` 1.6
    }, carrier, undefined, () => 0.5);
    fire.subscribe((e) => events.push(e));
    const rifle = fire.state().magazine;
    fire.setRound({ id: 175, round, ring });
    return { fire, ring, events, asked, round, rifle };
  };
  const started = (events: readonly FireEvent[]): FireEvent[] => events.filter((e) => e.type === 'reloadStart');

  it('every launcher round on the disc is one magazine (zweapon.rdr NumMags 1): the walk never finds another (D:L477462-477477)', () => {
    const table = readKitTable(zweaponPar87!);
    const rounds = [...table.arsenal.items.values()].filter((i) => i.cls === 'launcherRound');
    expect(rounds.map((i) => i.id).sort((a, b) => a - b)).toEqual(expect.arrayContaining([171, 173, 175, 176, 178, 179]));
    for (const i of rounds) expect([i.name, i.mags]).toEqual([i.name, 1]);
    const ring = new KitRounds(table, LOADOUT).ring(175)!;
    expect([ring.capacity, ring.carried, ring.canReload()]).toEqual([6, 1, false]);
  });

  it('a full ring: R arms nothing and plays no clip -- no fullness gate, the walk finds no other magazine', () => {
    const { fire, ring, events, asked } = kit();
    const before = ring.state();
    expect(fire.reload()).toBe(false);
    fire.update(1);
    expect(started(events)).toEqual([]);
    expect(asked).toEqual([]);
    expect(ring.state()).toEqual(before);
    expect(fire.state().magazine).toMatchObject({ rounds: 6, capacity: 6, reloading: false });
    expect(fire.shoot()).not.toBeNull();                                       // no lock: the round launches
  });

  it('R by hand after a launch: in the round\'s lock refused and the m203 clip plays; after it refused -- no clip, the ring not refilled, the rifle\'s magazine untouched', () => {
    const { fire, ring, events, rifle } = kit();
    expect(fire.shoot()).not.toBeNull();
    fire.update(0.2);
    expect(fire.reload()).toBe(false);                                         // the kit's timer runs (FUN_005a7ab0 D:L462522-462523)
    fire.update(0.31);
    expect(events.filter((e) => e.type === 'afterShot')).toMatchObject([{ family: 'm203', seconds: 1.3 }]);
    fire.update(1.4);
    expect(fire.state().afterShot).toBe(false);
    const before = ring.state();
    expect(fire.reload()).toBe(false);
    fire.update(1);
    expect(started(events)).toEqual([]);
    expect(ring.state()).toEqual(before);
    expect(ring.rounds()).toBe(5);
    expect(fire.state().magazine.reloading).toBe(false);
    fire.setRound(null);
    expect(fire.state().magazine).toEqual(rifle);                              // the rifle's ring as it was
  });

  it('the ring\'s own: the last round arms no reload and plays no after-shot (D:L479297-479320 into D:L477515-477543), and the dry pull arms none', () => {
    const { fire, ring, events } = kit();
    for (let i = 0; i < 6; i++) {
      expect(fire.shoot(), `round ${i + 1}`).not.toBeNull();
      for (let k = 0; k < 4; k++) fire.update(1);                              // its FireWait, its lock and its clip
    }
    expect(ring.rounds()).toBe(0);
    expect(events.filter((e) => e.type === 'afterShot')).toHaveLength(5);      // none after the sixth (rounds left 0)
    expect(started(events)).toEqual([]);
    expect(fire.pull()).toBeNull();
    expect(events.at(-1)).toMatchObject({ type: 'dry' });
    fire.release();
    fire.update(1);
    expect(started(events)).toEqual([]);
    expect(fire.state().magazine).toMatchObject({ rounds: 0, reloading: false });
  });

  it('the clip a round mode\'s reload would play is Rifle m203 reload (FUN_005a82e0 bVar4, D:L462824-462851) -- reached only with a second magazine, which no disc round has', () => {
    const { fire, events, asked, round } = kit();
    const two = new MagazineRing(6, 2);                                        // not on the disc
    fire.setRound({ id: 175, round, ring: two });
    expect(fire.reload()).toBe(true);
    fire.update(pastKit(RELOAD_DELAY));
    expect(started(events)).toMatchObject([{ family: 'm203', seconds: 1.3 }]);
    expect(asked).toEqual(['m203']);
    expect(two.state().current).toBe(1);
  });
});

/**
 * PAR-88 (research 251 section 12.3, "PAR-88"; PTW.R3 with roomReloadLock.test "PAR-88"): R in a bolt's or a pump's
 * after-shot is refused, and dropped. R is read on its press's first frame (`FUN_002c64e0(6)` state 1: `FUN_002d9ff0`
 * D:L179137-179169) and arms the kit's timer only when `FUN_005a7ab0` answers no (`FUN_00594cf0` D:L453460-453463, with
 * no else: nothing is kept). `FUN_005a7ab0` answers while `kit+0x820` runs (`FUN_005c2400` D:L477156-477159, asked at
 * D:L462522-462523) -- the after-shot's timer (`FUN_005c5340` D:L479329-479342 -> `FUN_005c32b0` D:L477655-477679) -- and
 * while the after-shot clip plays (D:L462526-462544), which `FUN_005c3000` pushes as the timer lands (D:L476549-476561,
 * D:L477641-477643): no frame between them. The disc's records through the kit (`kitRecords`): the M40A1 with the Double
 * Ammo Load (its NumMags 1 doubled, `FUN_005c75f0`; alone it has no other magazine to reload from), the 870, and the
 * M4A1 and the M60E3 (no `ReloadAfterShot`) as controls. One `update` is one command (`TICK_HZ`); the clips' seconds are
 * stand-ins (the room's twin plays the disc's clips).
 */
const zweaponPar88 = fixture('RUN/ZWEAPON.ZAR');
describe.skipIf(zweaponPar88 === null)(`PAR-88: R in a bolt's or a pump's after-shot is refused and dropped (FUN_00594cf0 D:L453460-453463, FUN_005a7ab0 D:L462522-462523)${zweaponPar88 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const M40_2X = [102, 15, 255, 255, 194], R870 = [84, 15, 255, 255, 255], M4A1 = [54, 15, 255, 255, 255], M60 = [91, 15, 255, 255, 255];
  const STAND_IN: Record<string, number> = { rifle: 1.6, shotgun: 2.2, pump: 0.8 };
  const rig = (loadout: readonly number[]) => {
    const record = kitRecords(readKitTable(zweaponPar88!), loadout as unknown as Loadout)[0];
    const events: FireEvent[] = [];
    const started: number[] = [];                                               // the commands a reload began on
    let command = 0;
    const fire = new Fire({
      grid: () => world([wallAt(-600)]), aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }), muzzle: () => [3, 15, -8],
      reloadSeconds: (family, reloadTime) => (reloadTime && reloadTime > 0 ? reloadTime : STAND_IN[family ?? 'rifle']!),
    }, record, undefined, () => 0.5);
    fire.subscribe((e) => { events.push(e); if (e.type === 'reloadStart') started.push(command); });
    const step = (n = 1): void => { for (let i = 0; i < n; i++) { command++; fire.update(1 / TICK_HZ); } };
    /** The commands the reload's `ReloadDelay` waits before it begins (`FUN_005c32b0` -> `FUN_005c0fd0`). */
    const delay = Math.ceil(reloadDelayOf(record) * TICK_HZ - 1e-9);
    /**
     * LATER 330: the commands after a press between commands `p` and `p + 1` the reload begins on -- the delay's whole game
     * frames (`kitFrames`) counted from the kit's frame clock, which runs from the rig's start (no round's press resets it).
     */
    const beginsAfter = (p: number): number => {
      const k0 = Math.floor(p / TICK_HZ / GAME_FRAME_DT + 1e-9);
      return Math.ceil((k0 + kitFrames(reloadDelayOf(record))) * GAME_FRAME_DT * TICK_HZ - 1e-9) - p;
    };
    return { record, fire, events, started, step, delay, beginsAfter };
  };
  /** The shot on command 0: the last command after which the page's after-shot (its timer, then its clip) still holds. */
  const lastLocked = (loadout: readonly number[]): number => {
    const r = rig(loadout);
    expect(r.fire.shoot()).not.toBeNull();
    let n = 0;
    while (r.fire.state().afterShot && n < 600) { r.step(); n++; }
    expect(n).toBeGreaterThan(0);
    return n - 1;
  };

  it('the records off the disc: the M40A1 (2X) and the 870 lock after a round, the M4A1 and the M60E3 do not', () => {
    expect([rig(M40_2X).record].map((r) => [r.name, r.mags, r.reloadAfterShot, r.reloadDelayAfterShot])).toEqual([['M40A1', 2, true, 0.5]]);
    expect([rig(R870).record].map((r) => [r.name, r.reloadAfterShot, r.reloadDelayAfterShot, r.reloadDelay])).toEqual([['870', true, undefined, 1]]);
    for (const k of [M4A1, M60]) expect(rig(k).record.reloadAfterShot).toBeUndefined();
  });

  it("the M40A1: R ten commands into the bolt's timer is refused, the after-shot plays as it would, and no reload follows (dropped, not kept)", () => {
    const r = rig(M40_2X);
    expect(r.fire.shoot()).not.toBeNull();
    r.step(10);
    expect(r.fire.state().afterShot).toBe(true);
    expect(r.fire.reload()).toBe(false);
    r.step(21);                                                                 // the 0.5 s timer out on its 30th command
    expect(r.events.filter((e) => e.type === 'afterShot')).toMatchObject([{ family: 'shotgun' }]);
    r.step(300);
    expect(r.started).toEqual([]);
    expect(r.fire.state()).toMatchObject({ afterShot: false, magazine: { rounds: 24, reloading: false } });
  });

  it("the 870: R between the round and the pump's 0.01 s timer's end is refused, the pump plays, and no reload follows", () => {
    const r = rig(R870);
    expect(r.fire.shoot()).not.toBeNull();
    expect(r.fire.state().afterShot).toBe(true);
    expect(r.fire.reload()).toBe(false);
    r.step(3);                                                                  // LATER 330: its one game frame (0.0334 s) out on the 3rd command
    expect(r.events.filter((e) => e.type === 'afterShot')).toMatchObject([{ family: 'pump' }]);
    expect(r.fire.reload()).toBe(false);                                        // in its clip (as before)
    r.step(300);
    expect(r.started).toEqual([]);
    expect(r.fire.state().magazine).toMatchObject({ rounds: 7, reloading: false });
  });

  it.each([['M40A1', M40_2X], ['870', R870]] as const)("the %s: R on the after-shot's last command is refused and dropped; on the first command after it, the reload begins its ReloadDelay later", (_name, loadout) => {
    const last = lastLocked(loadout);
    const a = rig(loadout);
    a.fire.shoot();
    a.step(last);
    expect(a.fire.state().afterShot).toBe(true);
    expect(a.fire.reload()).toBe(false);
    a.step(a.delay + 120);
    expect(a.started).toEqual([]);
    const b = rig(loadout);
    b.fire.shoot();
    b.step(last + 1);
    expect(b.fire.state().afterShot).toBe(false);
    expect(b.fire.reload()).toBe(true);
    b.step(b.beginsAfter(last + 1) + 5);
    expect(b.started).toEqual([last + 1 + b.beginsAfter(last + 1)]);
    expect(b.fire.state().magazine.reloading).toBe(true);
  });

  it.each([['M4A1', M4A1], ['M60E3', M60]] as const)('the control, the %s: no after-shot, so R on the command after a round is taken and begins its ReloadDelay later', (_name, loadout) => {
    const r = rig(loadout);
    expect(r.fire.shoot()).not.toBeNull();
    expect(r.fire.state().afterShot).toBe(false);
    r.step(1);
    expect(r.fire.reload()).toBe(true);
    r.step(r.beginsAfter(1) + 1);
    expect(r.started).toEqual([1 + r.beginsAfter(1)]);
    expect(r.events.some((e) => e.type === 'afterShot')).toBe(false);
  });
});

/**
 * NET-REFILL N3 (research 312 §2, §4.1, §5, §6 item 3): the page's half of the network refill. The match hands `Fire`
 * its rule (`setNetRefill`, from the room's rules: `../src/net/netRefill`); a page with no match has none (offline). Its
 * reload doors -- R (`reload`), the automatic reload at the last round (`tryFire`, `FUN_005c5340` D:L479296-479320: since
 * LATER 179 a shotgun's later pellets only) and the kit frame's dry branch (`dryFrame`: the dry pull's press, and since
 * LATER 48 each frame) -- open when another magazine has rounds or the rule holds for the record in the hand;
 * `beginReload` refills the magazine in the weapon when the walk finds none (`FUN_005c2a90` D:L477490-477541), logged in
 * the ring's journal so the room's refusal takes it back. Online a refill weapon's dry branch reloads at once, with no
 * press (`bVar6`, `FUN_005c0fd0` D:L476596-476627: `FUN_005c2a90` called directly, no `ReloadDelay`), no round in the
 * same frame (`NET_REFILL_DRY_PULL_READING`); so its last round's reload starts on the frame after it. Never in a round mode: the
 * round's class fails the rule. The Mark 23 (id 15, 3 x 12, `MARK_23_N3`) and the M4A1 (`DEFAULT_RIFLE`, 3 x 30).
 */
const MARK_23_N3: WeaponRecord = { ...DEFAULT_RIFLE, name: 'Mark 23', id: 15, fireWait: 0.2, magazine: 12, mags: 3 };

describe('NET-REFILL N3: the page\'s reload doors refill the last magazine online (research 312 §6 item 3)', () => {
  const pistol = (rule: { respawn: boolean } | null, record: WeaponRecord = MARK_23_N3) => {
    const air = { on: false };
    const events: FireEvent[] = [];
    const fire = new Fire({ grid: () => world([wallAt(-600)]), aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }), airborne: () => air.on }, record, undefined, () => 0.5);
    fire.subscribe((e) => events.push(e));
    fire.setNetRefill(rule);
    const starts = (): number => events.filter((e) => e.type === 'reloadStart').length;
    /** `n` rounds, each waiting out the rate and any reload. */
    const shootN = (n: number): void => {
      for (let i = 0; i < n; i++) {
        let k = 0;
        while (!fire.shoot() && k++ < 100) fire.update(0.25);
        expect(k, `round ${i + 1}`).toBeLessThan(100);
      }
    };
    return { fire, events, air, starts, shootN };
  };

  // LATER 179 / 48: was "the last round arms the automatic reload, reloadStart after ReloadDelay".
  it('the Mark 23 fired out with the rule on (classic): the last round arms nothing; the next frame\'s dry branch refills at once with no press (bVar6), 12/12 and no MAGS', () => {
    const r = pistol({ respawn: false });
    r.shootN(36);
    expect(r.starts()).toBe(2);
    expect(r.fire.state().magazine).toMatchObject({ rounds: 0, reloading: false });
    expect(r.events.some((e) => e.type === 'reloadPress')).toBe(false);           // no ReloadDelay armed, ever
    r.fire.update(RELOAD_DELAY + 0.001);                                          // the 36th round's own frame
    expect(r.starts()).toBe(2);
    const before = r.events.length;
    r.fire.update(1 / 60);                                                        // the next: the click and the refill
    expect(r.events.slice(before).map((e) => e.type)).toEqual(['dry', 'reloadStart']);
    expect(r.starts()).toBe(3);
    expect(r.fire.state().magazine).toMatchObject({ rounds: 12, capacity: 12, spare: 0, reloading: true });
    expect(r.fire.magazineTotal()).toBe(12);
  });

  it('R on the part-spent last magazine: accepted, its reload begins after ReloadDelay and fills it', () => {
    const r = pistol({ respawn: false });
    r.shootN(29);
    r.fire.update(3);
    expect(r.fire.state().magazine).toMatchObject({ rounds: 7, spare: 0, reloading: false });
    expect(r.fire.reload()).toBe(true);
    r.fire.update(pastKit(RELOAD_DELAY));
    expect(r.starts()).toBe(3);
    expect(r.fire.state().magazine).toMatchObject({ rounds: 12, spare: 0 });
  });

  it('the rule off (no match): refused as today -- no automatic reload, R refused, the dry pull clicks and arms nothing', () => {
    const r = pistol(null);
    // LATER 179: offline the empty magazine waits for a press -- R crosses each (was: the automatic reload).
    r.shootN(12);
    expect(r.fire.reload()).toBe(true);
    r.shootN(12);
    expect(r.fire.reload()).toBe(true);
    r.shootN(12);
    expect(r.fire.state().magazine).toMatchObject({ rounds: 0, reloading: false });
    r.fire.update(1);
    expect(r.starts()).toBe(2);
    expect(r.fire.reload()).toBe(false);
    expect(r.fire.pull()).toBeNull();
    r.fire.release();
    r.fire.update(1);
    expect(r.starts()).toBe(2);
    expect(r.events.filter((e) => e.type === 'dry')).toHaveLength(1);
  });

  it('the M4A1 in a classic game is not refilled; in a respawn game it is', () => {
    const classic = pistol({ respawn: false }, DEFAULT_RIFLE);
    // LATER 179: not a refill weapon in classic, so the dry branch's unpressed path is shut -- R crosses each magazine.
    classic.shootN(30);
    expect(classic.fire.reload()).toBe(true);
    classic.shootN(30);
    expect(classic.fire.reload()).toBe(true);
    classic.shootN(30);
    classic.fire.update(1);
    expect(classic.fire.state().magazine).toMatchObject({ rounds: 0, reloading: false });
    expect(classic.fire.reload()).toBe(false);
    expect(classic.events.some((e) => e.type === 'dry')).toBe(false);
    const respawn = pistol({ respawn: true }, DEFAULT_RIFLE);
    respawn.shootN(90);                                                           // LATER 48: each magazine by the unpressed path
    respawn.fire.update(RELOAD_DELAY + 0.001);                                    // the 90th round's own frame
    respawn.fire.update(1 / 60);                                                  // the dry branch: the refill
    expect(respawn.fire.state().magazine).toMatchObject({ rounds: 30, spare: 0 });
  });

  // LATER 179 / 48: was "the automatic reload dropped in the air"; no reload is armed at the last round, and the dry
  // branch asks each frame in the air (refused at FUN_005c2a90's gate, D:L477394-477395).
  it('the dry pull online reloads at once (NET_REFILL_DRY_PULL_READING): in the air the dry branch clicks each frame and its refill is refused, then on the ground one dry click and the reload in the same call -- no ReloadDelay, no round', () => {
    const r = pistol({ respawn: false });
    r.shootN(36);
    r.air.on = true;
    const air = r.events.length;
    r.fire.update(RELOAD_DELAY + 0.001);                                          // the 36th round's own frame: nothing
    r.fire.update(1 / 60); r.fire.update(1 / 60);                                  // the unpressed path, refused in the air
    expect(r.events.slice(air).map((e) => e.type)).toEqual(['dry', 'dry']);
    expect(r.starts()).toBe(2);
    expect(r.fire.state().magazine).toMatchObject({ rounds: 0, reloading: false });
    r.air.on = false;
    const before = r.events.length;
    expect(r.fire.pull()).toBeNull();                                              // no round in the same frame
    expect(r.events.slice(before).map((e) => e.type)).toEqual(['dry', 'reloadStart']);
    expect(r.fire.state().magazine).toMatchObject({ rounds: 12, reloading: true });
    r.fire.update(0.25);
    expect(r.events.slice(before).filter((e) => e.type === 'dry')).toHaveLength(1);   // one click a dry event (PAR-89's .GUN_EMPTY)
    expect(r.events.some((e) => e.type === 'reloadPress')).toBe(false);
  });

  // PAR-93 turned the second half: until it, offline and a non-refill weapon online waited the ReloadDelay ("keep the
  // ReloadDelay wait (PAR-93's, unchanged)"); the pressed path calls `FUN_005c2a90` directly too (D:L476621-476622).
  it('a refill weapon online with another magazine holding rounds: the dry pull walks at once; offline, and a non-refill weapon online, at once too (PAR-93: the pressed path, D:L476621-476622)', () => {
    const online = pistol({ respawn: false });
    online.fire.takeWeapon(MARK_23_N3, [0, 12]);
    expect(online.fire.pull()).toBeNull();
    expect(online.events.map((e) => e.type)).toEqual(['dry', 'reloadStart']);
    expect(online.fire.state().magazine).toMatchObject({ rounds: 12, spare: 0 });
    for (const [rule, record] of [[null, MARK_23_N3], [{ respawn: false }, DEFAULT_RIFLE]] as const) {
      const r = pistol(rule, record);
      r.fire.takeWeapon(record, [0, record.magazine]);
      expect(r.fire.pull()).toBeNull();
      expect(r.events.map((e) => e.type)).toEqual(['dry', 'reloadStart']);
      r.fire.update(RELOAD_DELAY + 0.001);
      expect(r.events.map((e) => e.type)).toEqual(['dry', 'reloadStart']);
    }
  });

  it('the journal: a refill the room refuses is taken back (undoReload, restoreReload); a round refunded under it replays the refill, as the room would run it', () => {
    const r = pistol({ respawn: false });
    r.fire.takeWeapon(MARK_23_N3, [1]);
    r.fire.shoot();
    r.fire.update(RELOAD_DELAY + 0.001);                                          // the round's own frame (LATER 179)
    r.fire.update(1 / 60);                                                        // the dry branch's refill (LATER 48)
    expect(r.fire.state().magazine.rounds).toBe(12);
    expect(r.fire.undoReload()).toBe(true);
    expect(r.fire.state().magazine).toMatchObject({ rounds: 0, reloading: false });

    const s = pistol({ respawn: false });
    s.fire.takeWeapon(MARK_23_N3, [1]);
    s.fire.shoot();
    const shot = (s.events.find((e) => e.type === 'round') as Extract<FireEvent, { type: 'round' }>).shot!;
    s.fire.update(RELOAD_DELAY + 0.001);
    s.fire.update(1 / 60);
    const reload = (s.events.find((e) => e.type === 'reloadStart') as Extract<FireEvent, { type: 'reloadStart' }>).reload!;
    expect(s.fire.refundRound(shot)).toBe(true);                                   // the ring without that round: [1], then the reload replayed
    expect(s.fire.state().magazine.rounds).toBe(12);
    expect(s.fire.restoreReload(reload)).toBe(true);
    expect(s.fire.state().magazine.rounds).toBe(1);
  });
});

const zweaponN3 = fixture('RUN/ZWEAPON.ZAR');
describe.skipIf(zweaponN3 === null)(`NET-REFILL N3: never in a round mode (the round's class fails the rule; research 312 §5)${zweaponN3 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it('the M4A1-M203 in its M203 FRAG mode with the respawn rule on: the round\'s ring fired out arms nothing, R and the dry pull refuse; the carrier itself refills with the mode off', () => {
    const table = readKitTable(zweaponN3!);
    const carrier = table.records.get(61)!, round = table.rounds.get(175)!;
    const ring = new KitRounds(table, [61, 15, 141, 175, 194] as unknown as Loadout).ring(175)!;
    const events: FireEvent[] = [];
    const fire = new Fire({ grid: () => world([wallAt(-600)]), aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }), launchPoint: () => [2, 16, -6] }, carrier, undefined, () => 0.5);
    fire.subscribe((e) => events.push(e));
    fire.setNetRefill({ respawn: true });
    fire.setRound({ id: 175, round, ring });
    for (let i = 0; i < 6; i++) { expect(fire.shoot()).not.toBeNull(); for (let k = 0; k < 4; k++) fire.update(1); }
    expect(ring.rounds()).toBe(0);
    expect(fire.reload()).toBe(false);
    expect(fire.pull()).toBeNull();
    fire.release();
    fire.update(1);
    expect(events.filter((e) => e.type === 'reloadStart')).toEqual([]);
    expect(ring.rounds()).toBe(0);
    fire.setRound(null);
    for (let i = 0; i < 90; i++) { let k = 0; while (!fire.shoot() && k++ < 100) fire.update(0.25); }
    fire.update(RELOAD_DELAY + 0.001);                                              // the 90th round's own frame (LATER 179)
    fire.update(1 / 60);                                                            // the dry branch's refill (LATER 48)
    expect(fire.state().magazine).toMatchObject({ rounds: 30, spare: 0 });
  });
});

/**
 * PAR-93 (research 305 §2.3, research 312 §4.1): the dry pull reloads at once. `FUN_005c0fd0` (each kit frame, from
 * `FUN_005506a0` D:L417907) reaches its dry branch only while the kit's timer is not running (`kit+0x820`,
 * D:L476549-476563) and the fire cannot be given (`FUN_005c0ae0` 0, D:L476569) on an empty magazine (`FUN_005bd530` 0,
 * D:L476575); with the trigger pressed (D:L476592, D:L476616) it clicks (D:L476617-476620) and, when a magazine of the
 * slot holds rounds (`FUN_005bdb00` -> `FUN_005bda70` D:L474519-474538), calls `FUN_005c2a90` directly (D:L476621-476622)
 * -- no `FUN_005c32b0`, so no `ReloadDelay`. That branch reads no `DAT_0045a0c1`: offline and online alike, for every
 * firearm. The disc's three records whose `ReloadDelay` is more than a frame (the Spas 12 and the JACKHAMMER 0.5, the 870
 * 1: `weapons.parity.test.ts`), through the kit (`kitRecords`). The held trigger's per-frame retry: LATER 48
 * (`Fire.dryFrame`, `DRY_CLICK_FRAME_READING`; was `DRY_PULL_RETRY_READING`, the press only).
 */
const zweaponPar93 = fixture('RUN/ZWEAPON.ZAR');
describe.skipIf(zweaponPar93 === null)(`PAR-93: the dry pull reloads at once, offline as online (FUN_005c0fd0 D:L476616-476622)${zweaponPar93 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const SHOTGUNS = [['Spas 12', 81, 0.5], ['JACKHAMMER', 83, 0.5], ['870', 84, 1]] as const;
  const rig = (id: number, rule: { respawn: boolean } | null) => {
    const record = kitRecords(readKitTable(zweaponPar93!), [id, 15, 255, 255, 255] as unknown as Loadout)[0];
    const air = { on: false };
    const events: FireEvent[] = [];
    const fire = new Fire({ grid: () => world([wallAt(-600)]), aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }), airborne: () => air.on }, record, undefined, () => 0.5);
    fire.subscribe((e) => events.push(e));
    fire.setNetRefill(rule);
    return { record, fire, events, air };
  };

  it.each(SHOTGUNS)('the %s offline: an empty magazine and a full one -- the pull clicks and begins the reload in the same call, not its ReloadDelay later', (name, id, delay) => {
    const r = rig(id, null);
    expect([r.record.name, reloadDelayOf(r.record)]).toEqual([name, delay]);
    r.fire.takeWeapon(r.record, [0, r.record.magazine]);
    expect(r.fire.pull()).toBeNull();                                              // no round on the dry frame
    expect(r.events.map((e) => e.type)).toEqual(['dry', 'reloadStart']);
    expect(r.fire.state().magazine).toMatchObject({ rounds: r.record.magazine, spare: 0, reloading: true });
    r.fire.update(delay + 0.001);
    expect(r.events.filter((e) => e.type === 'dry')).toHaveLength(1);              // one click a dry event (PAR-89's .GUN_EMPTY)
    expect(r.events.filter((e) => e.type === 'reloadStart')).toHaveLength(1);
  });

  it.each(SHOTGUNS)('the %s online, classic (not a refill weapon) and respawn (one): the same at once -- the pressed path reads no DAT_0045a0c1', (_name, id) => {
    for (const rule of [{ respawn: false }, { respawn: true }]) {
      const r = rig(id, rule);
      r.fire.takeWeapon(r.record, [0, r.record.magazine]);
      expect(r.fire.pull()).toBeNull();
      expect([rule.respawn, r.events.map((e) => e.type)]).toEqual([rule.respawn, ['dry', 'reloadStart']]);
    }
  });

  it('offline with no magazine holding rounds: one click and nothing armed (FUN_005c0940: the limit 1, D:L476290-476292; the count raised, D:L476630-476631)', () => {
    const r = rig(81, null);
    r.fire.takeWeapon(r.record, [0, 0, 0]);
    expect(r.fire.pull()).toBeNull();
    r.fire.update(1);
    r.fire.update(1);
    expect(r.events.map((e) => e.type)).toEqual(['dry']);
  });

  // LATER 48: was "none on landing without a new press -- the held trigger's per-frame retry is not built
  // (DRY_PULL_RETRY_READING 'the press only')". The dry branch runs each frame the trigger is held (D:L476591-476592),
  // the count not raised on the reload's path (D:L476621-476631), so the click repeats and the reload lands on landing.
  it('refused at FUN_005c2a90\'s gate (in the air): the click each frame the trigger is held, and the reload on the first frame on the ground -- no new press (DRY_CLICK_FRAME_READING)', () => {
    expect(DRY_CLICK_FRAME_READING).toBe('each page frame');
    const r = rig(81, null);
    r.fire.takeWeapon(r.record, [0, r.record.magazine]);
    r.air.on = true;
    expect(r.fire.pull()).toBeNull();
    expect(r.events.map((e) => e.type)).toEqual(['dry']);
    r.fire.update(1 / 60);                                                         // the press's own frame: run once (`pull`)
    expect(r.events.map((e) => e.type)).toEqual(['dry']);
    r.fire.update(1 / 60);                                                         // held in the air: asked again, refused
    expect(r.events.map((e) => e.type)).toEqual(['dry', 'dry']);
    r.air.on = false;
    r.fire.update(1 / 60);                                                         // the landing frame: the click and the reload
    expect(r.events.map((e) => e.type)).toEqual(['dry', 'dry', 'dry', 'reloadStart']);
    expect(r.fire.state().magazine).toMatchObject({ rounds: r.record.magazine, reloading: true });
    r.fire.update(1 / 60);
    expect(r.events.map((e) => e.type)).toEqual(['dry', 'dry', 'dry', 'reloadStart']);
  });
});

/**
 * AD-1 (web sprint 40; reconciliation C13; research 84 section 19, research 232 section 2): the eye's aim ray's reach.
 * `FUN_005aa6e0` D:L464097-464114 takes the held item's range (`FUN_003d27f0`: the record's +0x3c, `Maximum_Range` x 10,
 * the parser D:L322426-322430; 0 with no item), raises one at or under 600 to 600, and caps it at the active camera's
 * +0xec (`DAT_0045c380 + 0x128`): the map record's MID (`m_mid_plane`, 0x2C), pushed out by the view state's extension
 * and put back on every state change (`FUN_001f1470` D:L53202-53255; `FUN_001f0750` D:L52939, 53049, 53075, 53159).
 * The round's own flight stays `Maximum_Range` x 10 (research 84 section 13).
 */
describe("AD-1: the aim's reach (FUN_005aa6e0 D:L464097-464114)", () => {
  /** A hull reaching 1,100 down -z (the shared `world` stops at 200), for walls past the cap. */
  const deep = (polys: WorldPoly[]): Grid => {
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 12, originX: -200, originZ: -1100 };
    const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
    return buildGrid(params, [], [], polys, owners);
  };
  const muzzle: V3 = [3, 14, -20];
  /**
   * A shooter at (0, 20, 0) looking down -z, its muzzle off the eye; every reach the eye's ray is cast with is noted (the
   * asks from the eye -- the round's own leg from the muzzle asks too, F2 of AD-1's review).
   */
  const reachRig = (grid: Grid, rifle: WeaponRecord, cap: () => number | null, withMuzzle = true) => {
    const asked: number[] = [];
    const fire = new Fire({
      grid: () => grid, aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }), ...(withMuzzle ? { muzzle: () => muzzle } : {}),
      targetDistance: (from: V3, _ray: V3, reach: number) => { if (from[0] === 0 && from[1] === 20 && from[2] === 0) asked.push(reach); return null; },
      aimCap: cap,
    } as FireSource, rifle, undefined, () => 0.5);
    return { fire, asked };
  };
  /** Where the line from `a` to `b` crosses the depth `z`, (x, y). */
  const crossing = (a: readonly number[], b: readonly number[], z: number): number[] => {
    const t = (z - a[2]!) / (b[2]! - a[2]!);
    return [0, 1].map((i) => a[i]! + t * (b[i]! - a[i]!));
  };

  it('aimReach: max(range, 600) capped at the camera -- a range under 600, or none, is 600; a MID under 600 caps below the floor (MP5, MP82: 550); with no camera known, the floored range', () => {
    expect(AIM_REACH_FLOOR).toBe(600);
    expect(aimReach(300, null)).toBe(600);          // a 30 m record
    expect(aimReach(0, null)).toBe(600);            // no item: D:L464099-464102 leaves 0
    expect(aimReach(600, null)).toBe(600);
    expect(aimReach(10000, null)).toBe(10000);
    expect(aimReach(10000, 640)).toBe(640);         // Frostfire's MID
    expect(aimReach(10000, 550)).toBe(550);         // the cap is taken after the floor (D:L464106-464109)
    expect(aimReach(300, 550)).toBe(550);
    expect(aimReach(700, 850)).toBe(700);           // a range under the cap is the reach
  });

  it("cameraAimCap: the record's MID plus the view's extension -- MP5's 550, not its far 800; none without a record", () => {
    const mp5 = { mid: 550, farPlane: 800 };
    expect(cameraAimCap(mp5.mid, 0)).toBe(550);
    expect(cameraAimCap(mp5.mid, 0)).not.toBe(mp5.farPlane);
    expect(cameraAimCap(mp5.mid, 300)).toBe(850);
    expect(cameraAimCap(null, 300)).toBeNull();
    expect(cameraAimCap(undefined, 0)).toBeNull();
  });

  it('a MID under 600 (550): a wall at 700, past the cap, is not the aim point -- the muzzle converges 550 out under the reticle and the round flies on to the wall', () => {
    const { fire, asked } = reachRig(deep([wallAt(-700)]), DEFAULT_RIFLE, () => 550);
    const shot = fire.shoot()!;
    expect(asked).toEqual([550]);
    crossing(shot.from, shot.to, -550).forEach((v, i) => expect(v).toBeCloseTo([0, 20][i]!, 6));
    // The round meets the wall off the eye's line: a reach of 10,000 would have converged on (0, 20, -700).
    expect(shot.hit!.point[2]).toBeCloseTo(-700, 6);
    expect(shot.hit!.point[0]).toBeCloseTo(3 - 3 * (680 / 530), 6);
  });

  it('a range under 600 is floored: a 30 m record looks 600 out, not 300, for the round and the accuracy pip alike', () => {
    const { fire, asked } = reachRig(deep([]), { ...DEFAULT_RIFLE, maximumRange: 30 }, () => null);
    fire.blockedMuzzle();
    fire.shoot();
    expect(asked).toEqual([600, 600]);
  });

  it('the view states: into the night vision, the binoculars and a scope the cap grows by 200 / 200 / 300 and is put back on the way out (FUN_001f1470 D:L53202-53255; FUN_001f0750 D:L52939, 53049, 53075, 53159)', () => {
    const zoom = new Zoom({ ...DEFAULT_RIFLE, zoomModes: [1.5, 6, 12] });
    const reachAt = (rifle: WeaponRecord) => {
      const { fire, asked } = reachRig(deep([]), rifle, () => cameraAimCap(550, zoom.renderView().farExtra));
      return (state: number): number => { zoom.set(state); asked.length = 0; fire.blockedMuzzle(); return asked[0]!; };
    };
    const at = reachAt(DEFAULT_RIFLE);
    expect([0, 1, 3, 0, 4, 1, 5, 6, 7, 1, 0].map(at)).toEqual([550, 550, 750, 550, 750, 550, 850, 850, 850, 550, 550]);
    // A record whose range lies under the extended cap: the range is the reach; the extension does not lengthen it.
    const short = reachAt({ ...DEFAULT_RIFLE, maximumRange: 70 });
    expect([0, 3, 5, 0].map(short)).toEqual([550, 700, 700, 550]);
  });

  it("the round's own flight is still Maximum_Range x 10 (research 84 section 13): a miss under a 640 cap leaves the muzzle through the aim point 640 out and ends 10,000 on, with and without the penetration table; the eye standing in flies 10,000 too", () => {
    for (const table of [false, true]) {
      const { fire } = reachRig(deep([]), DEFAULT_RIFLE, () => 640);
      if (table) fire.setPenetration(() => 0);
      const shot = fire.shoot()!;
      expect(shot.hit).toBeNull();
      crossing(shot.from, shot.to, -640).forEach((v, i) => expect(v).toBeCloseTo([0, 20][i]!, 6));
      expect(Math.hypot(...shot.to.map((v, i) => v - shot.from[i]!))).toBeCloseTo(DEFAULT_RIFLE.maximumRange * UNITS_PER_METRE, 6);
    }
    const { fire } = reachRig(deep([]), DEFAULT_RIFLE, () => 640, false);
    const shot = fire.shoot()!;
    shot.to.forEach((v, i) => expect(v).toBeCloseTo([0, 20, -DEFAULT_RIFLE.maximumRange * UNITS_PER_METRE][i]!, 6));
  });

  it("a round mode's eye ray takes the round's own record (FUN_005c3780 through FUN_005c6600's redirect, D:L479603-479660): with nothing under the reticle the loft aims min(max(the round's range, 600), the cap) out", () => {
    const m4203: WeaponRecord = { ...DEFAULT_RIFLE, name: 'M4A1-M203', id: 61 };
    const frag = (maximumRange: number): KitRound => ({
      record: { ...M67, name: 'M203 FRAG', id: 175, muzzleVelocity: 270, armingDistance: 100, impact: true, fuse: 10, removal: 10.1, maximumRange },
      piercing: 0, fireWait: 1, reloadAfterShot: true, reloadDelayAfterShot: 0.5, icon: 'firemode_203_frag.tif',
    });
    const loftTo = (range: number, cap: number | null): number => {
      const events: FireEvent[] = [];
      const fire = new Fire({
        grid: () => deep([]), aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }), muzzle: () => muzzle,
        launchPoint: () => [2, 16, -6], aimCap: () => cap,
      }, m4203, undefined, () => 0.5);
      fire.subscribe((e) => events.push(e));
      fire.setRound({ id: 175, round: frag(range), ring: new MagazineRing(6, 1) });
      fire.shoot();
      return (events.find((e) => e.type === 'launch') as Extract<FireEvent, { type: 'launch' }>).to[2];
    };
    expect(loftTo(400, null)).toBeCloseTo(-600, 6);         // a round's record of 40 m: the floor
    expect(loftTo(400, 550)).toBeCloseTo(-550, 6);
    expect(loftTo(100000, 640)).toBeCloseTo(-640, 6);       // the carrier's 10,000 is not the round's
  });

  it("F2 (AD-1's review): a body past the cap but on the round's own line is still met -- a 550 cap, a body at 700, a wall at 900, from the muzzle and from the eye: without the penetration table the round ends at the body unmarked; with it (P12, SW-2) it goes on past the body to the wall", () => {
    /** A body 5 units round (0, 20, -700): the distance along `ray` from `from` to where it crosses z -700, if near. */
    const bodyAt700 = (from: V3, ray: V3, reach: number): number | null => {
      if (!(ray[2] < 0)) return null;
      const t = (-700 - from[2]) / ray[2];
      if (!(t > 0 && t < reach)) return null;
      return Math.hypot(from[0] + ray[0] * t, from[1] + ray[1] * t - 20) < 5 ? t : null;
    };
    for (const withMuzzle of [true, false]) {
      for (const table of [false, true]) {
        const fire = new Fire({
          grid: () => deep([wallAt(-900)]), aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }),
          ...(withMuzzle ? { muzzle: () => muzzle } : {}), targetDistance: bodyAt700, aimCap: () => 550,
        } as FireSource, DEFAULT_RIFLE, undefined, () => 0.5);
        if (table) fire.setPenetration(() => 0);
        const shot = fire.shoot()!;
        if (table) {
          expect([withMuzzle, table, shot.hit?.point[2]]).toEqual([withMuzzle, table, -900]);
          expect(fire.state().decals).toBe(1);
          expect(shot.to[2]).toBeCloseTo(-900, 6);
        } else {
          expect([withMuzzle, table, shot.hit]).toEqual([withMuzzle, table, null]);
          expect(fire.state().decals).toBe(0);
          expect(shot.to[2]).toBeCloseTo(-700, 6);
        }
      }
    }
  });
});

/**
 * AD-2 (web sprint 40; reconciliation C10, LATER 35; research 84 sections 9 and 19): the accuracy pip's two rays take the
 * original's admission. `FUN_005aa6e0` (the eye's query, D:L464117-464169) and `FUN_005b6240` (the muzzle's, D:L470352-
 * 470415) keep a hit by one predicate (D:L464145-464159 = D:L470381-470397: an empty material slot or an `m_cameratype` 1
 * surface is passed, then VOLUMETRIC, LIQUID or PENETRATION >= 0.98 without PICKUP), each the nearest kept; their
 * queries differ in the class `FUN_002d2890` admits (D:L174845-174862: the side bit, then bit 19 skipped for the eye's,
 * `DAT_0044d758` 1, bit 18 for the muzzle's, 0). The pip is a block when the eye kept nothing, or when the muzzle's kept
 * hit is off the eye's by more than 0.008 on some axis (D:L464339-464370).
 *
 * The rig: the eye at (0, 20, 0) looking down -z, the muzzle at (3, 15, -8); a full face spans x -50..50, y 0..50; a low
 * face stops short of the eye's line (y 0..18 or 0..19), so only the muzzle's segment can meet it.
 */
describe("AD-2: the accuracy pip's rays take the original's admission (FUN_005aa6e0, FUN_005b6240)", () => {
  const TABLE = materialTable();
  const of = (m: number | undefined) => TABLE[m ?? 0] ?? TABLE[0]!;
  const byte = (name: string): number => { const i = TABLE.findIndex((m) => m.name === name); expect(i).toBeGreaterThan(1); return i; };
  const M: V3 = [3, 15, -8];
  const full = (z: number, material: number, extra: Partial<WorldPoly> = {}): WorldPoly => ({ ...wallAt(z), material, ...extra });
  const low = (z: number, material: number, top: number, extra: Partial<WorldPoly> = {}): WorldPoly =>
    ({ ...quad([-50, 0, z, 50, 0, z, 50, top, z, -50, top, z]), material, ...extra });
  const STONE = (): number => byte('STONE');
  const make = (polys: WorldPoly[], opts: { table?: SurfaceMaterial[] | null; targetDistance?: FireSource['targetDistance'] } = {}): Fire => {
    const fire = new Fire({
      grid: () => world(polys), aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }), muzzle: () => M,
      ...(opts.targetDistance ? { targetDistance: opts.targetDistance } : {}),
    } as FireSource, DEFAULT_RIFLE, undefined, () => 0.5);
    const table = opts.table === undefined ? TABLE : opts.table;
    if (table) fire.setMaterials((m) => table[m ?? 0] ?? table[0]!);
    return fire;
  };
  /** The unit direction from the muzzle to (0, 20, z): the round's leg toward an aim point at depth z. */
  const toward = (z: number): number[] => { const d = [-M[0], 20 - M[1], z - M[2]], n = Math.hypot(...d); return d.map((v) => v / n); };
  const shotDir = (fire: Fire): number[] => { const s = fire.shoot()!; const d = s.to.map((v, i) => v - s.from[i]!), n = Math.hypot(...d); return d.map((v) => v / n); };
  /** The pip's depth, or null. */
  const pipZ = (fire: Fire): number | null => { const p = fire.blockedMuzzle(); return p === null ? null : Math.round(p[2] * 1e6) / 1e6; };

  const READERC = fixture('RUN/READERC.ZAR');
  /** The 13 the rule looks through, in table order: PARTICLE_SYSTEM (built-in), then 12 of the 44 SOILS. */
  const LOOKED_THROUGH = [
    'PARTICLE_SYSTEM', 'ACTION', 'INVISIBLE_DI', 'GLASS', 'WATER', 'LEAFY_TREE', 'METAL_GRATE_THIN', 'CAMO_NET', 'CHAINLINK_FENCE',
    'GRASS_VOL', 'BUSH_VOL', 'SNOWY_GRASS_VOL', 'GLASS_MEDIUM',
  ];

  it.skipIf(!READERC)("AD-2: the 44 SOILS and the two built-ins off READERC.ZAR's materials.rdr -- the pip's two rays keep exactly what the shot's eye ray keeps: 13 looked through by both, the other 33 stopping both", () => {
    const zar = Zar.parse(READERC!);
    const key = zar.root.children.find((k) => k.name.toLowerCase() === 'materials.rdr')!;
    const disc = materialTable(soilsTable(parseRdr(zar.data(key))));
    expect(disc.length).toBe(2 + 44);
    expect(disc).toEqual(TABLE);                                   // the page's table is the disc's
    const passed: string[] = [];
    for (let b = 0; b < disc.length; b++) {
      const name = disc[b]!.name, stone = STONE();
      const kept = !LOOKED_THROUGH.includes(name);
      // A: the face across the eye's line, the stone behind -- the shot's aim point and the pip agree: no block either way.
      const a = make([full(-20, b), full(-60, stone)], { table: disc });
      expect([name, pipZ(a)]).toEqual([name, null]);
      const d = shotDir(make([full(-20, b), full(-60, stone)], { table: disc }));
      d.forEach((v, i) => expect([name, v]).toEqual([name, expect.closeTo(toward(kept ? -20 : -60)[i]!, 9)]));
      // B: the face low, on the muzzle's segment alone: a block where the muzzle's query keeps it, none where it passes it.
      expect([name, pipZ(make([low(-30, b, 18), full(-60, stone)], { table: disc }))]).toEqual([name, kept ? -30 : null]);
      // C: the face across the eye's line, a low stone wall behind it: where the eye looks through the face the aim point is
      // the far stone and the muzzle's segment meets the low wall; where the face stops the eye, nothing is in the way.
      expect([name, pipZ(make([full(-20, b), low(-40, stone, 19), full(-60, stone)], { table: disc }))]).toEqual([name, kept ? null : -40]);
      if (!kept) passed.push(name);
    }
    expect(passed).toEqual(LOOKED_THROUGH);
    expect(disc.filter((m) => !aimHitKept({ material: 0, cameratype: 0 }, () => m)).map((m) => m.name)).toEqual(LOOKED_THROUGH);
  });

  it('AD-2: behind a chain-link fence the pip aims past it as the shot does, and the muzzle\'s segment no longer reports the fence as a block (LATER 35)', () => {
    const fence = byte('CHAINLINK_FENCE'), stone = STONE();
    // The fence on the muzzle's segment alone: looked through, no block (the old unfiltered ray marked the fence).
    expect(pipZ(make([low(-30, fence, 18), full(-60, stone)]))).toBeNull();
    // The fence across the eye's line, a low wall behind it: the pip and the round aim at the stone past the fence, and the
    // pip is the low wall the round's leg meets on the way (the old eye ray stopped at the fence and saw no block).
    const polys = [full(-20, fence), low(-40, stone, 19), full(-60, stone)];
    const p = make(polys).blockedMuzzle()!;
    expect(p[2]).toBeCloseTo(-40, 6);
    shotDir(make(polys)).forEach((v, i) => expect(v).toBeCloseTo(toward(-60)[i]!, 9));
    const k = (p[2] - M[2]) / toward(-60)[2]!;
    p.forEach((v, i) => expect(v).toBeCloseTo(M[i]! + toward(-60)[i]! * k, 6));      // on the round's own line
    // A plain wall's pin kept: a stone face under the reticle with nothing before it is no block.
    expect(pipZ(make([full(-20, stone), full(-60, stone)]))).toBeNull();
  });

  it('AD-2: the nearest kept hit, not the first met: a fence before a low stone wall on the muzzle\'s segment -- the pip is the stone, in either surface order', () => {
    const fence = byte('CHAINLINK_FENCE'), stone = STONE();
    expect(pipZ(make([low(-25, fence, 18), low(-35, stone, 18), full(-60, stone)]))).toBe(-35);
    expect(pipZ(make([low(-35, stone, 18), low(-25, fence, 18), full(-60, stone)]))).toBe(-35);
    // Two kept: the nearer.
    expect(pipZ(make([low(-35, stone, 18), low(-25, stone, 18), full(-60, stone)]))).toBe(-25);
  });

  it('AD-2: the queries\' class (FUN_002d2890 D:L174845-174862): no side bit, m_cameratype 1 or 3 in neither ray; m_cameratype 2 (bit 19) in the muzzle\'s, not the eye\'s -- with and without the table', () => {
    const stone = STONE();
    const cases: [string, Partial<WorldPoly>, number | null, number | null][] = [
      // name, the class, the pip with the face low (the muzzle's alone), the pip with the face across the eye's line
      ['side, camera 0', {}, -30, null],
      ['no side bit (ditype 1)', { ditype: 1 }, null, -40],
      ['camera 1 (bit 18)', { cameratype: 1 }, null, -40],
      ['camera 2 (bit 19)', { cameratype: 2 }, -30, -20],
      ['camera 3', { cameratype: 3 }, null, -40],
    ];
    for (const table of [TABLE, null]) {
      for (const [name, cls, lowPip, fullPip] of cases) {
        expect([name, !!table, pipZ(make([low(-30, stone, 18, cls), full(-60, stone)], { table }))]).toEqual([name, !!table, lowPip]);
        expect([name, !!table, pipZ(make([full(-20, stone, cls), low(-40, stone, 19), full(-60, stone)], { table }))]).toEqual([name, !!table, fullPip]);
      }
    }
  });

  it("AD-2: the shot's eye ray takes the eye's class too (one query in the original): an m_cameratype 1, 2 or 3 face, or one with no side bit, before the stone is looked through; an m_cameratype 0 one stops it", () => {
    const stone = STONE();
    for (const [cls, z] of [[{}, -20], [{ cameratype: 1 }, -60], [{ cameratype: 2 }, -60], [{ cameratype: 3 }, -60], [{ ditype: 1 }, -60]] as const) {
      shotDir(make([full(-20, stone, cls), full(-60, stone)])).forEach((v, i) => expect([cls, v]).toEqual([cls, expect.closeTo(toward(z)[i]!, 9)]));
    }
  });

  it('AD-2: aimHitKept and aimQueryAdmits -- an empty material slot is kept by neither query; m_cameratype 1 is passed whatever its material; the two queries differ only in the camera bit they skip', () => {
    const stone = TABLE[byte('STONE')]!, fence = TABLE[byte('CHAINLINK_FENCE')]!;
    expect(aimHitKept({ material: 7, cameratype: 0 }, () => undefined)).toBe(false);   // D:L464145-464146, D:L470381-470382
    expect(aimHitKept({ material: 7, cameratype: 0 }, () => null)).toBe(false);
    expect([0, 1, 2, 3].map((c) => aimHitKept({ material: 7, cameratype: c }, () => stone))).toEqual([true, false, true, true]);
    expect([0, 1, 2, 3].map((c) => aimHitKept({ material: 7, cameratype: c }, () => fence))).toEqual([false, false, false, false]);
    // Without a table (the page's fallback): the class still judged, every material kept.
    expect([0, 1, 2, 3].map((c) => aimHitKept({ material: 7, cameratype: c }, null))).toEqual([true, false, true, true]);
    const poly = (ditype: number, cameratype: number) => ({ ditype, ptcount: 4, material: 25, cameratype });
    for (const query of ['eye', 'muzzle'] as const) {
      expect([query, [0, 1, 2, 3].map((c) => aimQueryAdmits(poly(2, c), query))]).toEqual([query, query === 'eye' ? [true, true, false, false] : [true, false, true, false]]);
      expect([query, [0, 1, 2, 3].map((c) => aimQueryAdmits(poly(3, c), query))]).toEqual([query, query === 'eye' ? [true, true, false, false] : [true, false, true, false]]);
      expect([query, [0, 1, 2, 3].map((c) => aimQueryAdmits(poly(1, c), query))]).toEqual([query, [false, false, false, false]]);
      expect([query, [0, 1, 2, 3].map((c) => aimQueryAdmits(poly(0, c), query))]).toEqual([query, [false, false, false, false]]);
    }
  });

  it("AD-2: a body on the muzzle's segment blocks as a wall does, the nearer of the two taken (FUN_005b6240's query holds every node but the shooter's)", () => {
    const stone = STONE();
    const atFive = (from: V3) => (from[0] === M[0] ? 5 : null);              // the eye's ray meets no body
    const p = make([full(-60, stone)], { targetDistance: atFive }).blockedMuzzle()!;
    p.forEach((v, i) => expect(v).toBeCloseTo(M[i]! + toward(-60)[i]! * 5, 9));
    // A low stone wall 4.02 out on the same segment is nearer than the body: the wall.
    expect(pipZ(make([low(-12, stone, 18), full(-60, stone)], { targetDistance: atFive }))).toBe(-12);
    // A body past the aim point is no block.
    expect(pipZ(make([full(-60, stone)], { targetDistance: (from: V3) => (from[0] === M[0] ? 60 : null) }))).toBeNull();
  });

  it('AD-2: PIP_TOLERANCE only against a kept aim, axis by axis (D:L464339-464370): with nothing under the reticle a hit 0.001 short of the ray\'s end blocks; with a body under the reticle a hit 0.0082 short of it is none (each axis within 0.008), 0.01 short is one', () => {
    expect(PIP_TOLERANCE).toBe(0.008);
    /** The eye's ray: a body at `eyeBody` (or none); the muzzle's: a body `short` before the segment's end. */
    const rig = (eyeBody: number | null, short: number) => make([], {
      targetDistance: (from: V3, _ray: V3, reach: number) => (from[0] === M[0] ? reach - short : eyeBody),
    });
    expect(rig(null, 0.001).blockedMuzzle()).not.toBeNull();                // no kept aim: any kept hit blocks
    expect(rig(30, 0.001).blockedMuzzle()).toBeNull();
    expect(rig(30, 0.0082).blockedMuzzle()).toBeNull();                      // 0.0082 apart, each axis <= 0.008 (z 0.00793)
    expect(rig(30, 0.01).blockedMuzzle()).not.toBeNull();                    // z 0.00967 > 0.008
  });
});

describe("LATER 72: the reload's press and its delay window (FUN_005a7ab0 D:L469416, kit+0x820 D:L462522-462523)", () => {
  const source = (): FireSource => ({ grid: () => world([wallAt(-30)]), aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }) });
  it("a reload emits reloadPress with its delay; online the climb lock counts the press's window in command numbers; a cancel ends it", () => {
    const fire = new Fire(source(), { ...DEFAULT_RIFLE, reloadDelay: 1 }, undefined, () => 0.5);
    const events: FireEvent[] = [];
    fire.subscribe((e) => events.push(e));
    fire.shoot(); fire.update(0.2);
    expect(fire.reload()).toBe(true);
    expect(events.find((e) => e.type === 'reloadPress')).toMatchObject({ type: 'reloadPress', seconds: 1 });
    fire.setPressWindow(100 + 60);                                             // the page's net: the press at 100, 60 commands
    expect(fire.reloadLocked(159)).toBe(true);
    expect(fire.reloadLocked(160)).toBe(false);                                // the window's end, the room's `until`
    fire.cancelReload('cancelled');
    expect(fire.reloadLocked(150)).toBe(false);                                // the pending reload gone: the window with it
  });

  it('a hand change and the refill end the window, as the room ends its lock (the weapon, the spawn)', () => {
    for (const end of [(f: Fire) => f.setWeapon({ ...DEFAULT_RIFLE, name: 'other', id: 99 }), (f: Fire) => f.refill()]) {
      const fire = new Fire(source(), { ...DEFAULT_RIFLE, reloadDelay: 1 }, undefined, () => 0.5);
      fire.shoot(); fire.update(0.2);
      expect(fire.reload()).toBe(true);
      fire.setPressWindow(160);
      end(fire);
      expect(fire.reloadLocked(150)).toBe(false);
    }
  });
});

/** LATER 326: the kit's timer runs out on whole game frames -- a rate's wait, rounded up to them (`FUN_005c0fd0`). */
const pastRate = (w: number): number => Math.ceil(w / GAME_FRAME_DT - 1e-9) * GAME_FRAME_DT + 1e-6;

describe("LATER 326: the kit's timer is set at a round and runs down a game frame at a time (FUN_005be9a0 D:L475488, FUN_005c0fd0 D:L476644-476646)", () => {
  /** A held trigger at `fps` for `seconds`: each round's browser frame's end (the page reports it there) and its frame's index. */
  const held = (fps: number, seconds: number, interval?: number): { times: number[]; frames: number[] } => {
    const { fire } = rig(world([wallAt(-30)]), [0, 0, -1], { ...DEFAULT_RIFLE, magazine: 1000 });
    if (interval !== undefined) fire.setGun({ trigger: () => {}, roundsPerPull: () => Infinity, interval: () => interval, round: (d) => d });
    const times: number[] = [], frames: number[] = [];
    let now = 0, frame = -1;                                           // the press's round: before the first frame
    // The kit runs every frame before the press (a live page's: `matchFirearm` steps it each frame), so its game-frame
    // clock carries part of a frame when the press comes (the review's F1).
    for (let i = 0; i < 7; i++) fire.update(1 / fps);
    fire.subscribe((e) => { if (e.type === 'round') { times.push(now); frames.push(frame); } });
    fire.pull();                                                       // the press: a round at once, the timer clear
    for (frame = 0; frame < Math.round(seconds * fps); frame++) { now += 1 / fps; fire.update(1 / fps); }
    return { times, frames };
  };

  it.each([30, 60, 144, 20])('%s fps: held rounds the rate rounded up to whole game frames apart, within a browser frame; the count the frames give', (fps) => {
    const I = DEFAULT_RIFLE.fireWait, Q = Math.ceil(I / GAME_FRAME_DT - 1e-9) * GAME_FRAME_DT;
    const { times } = held(fps, 2);
    // Each round at its browser frame's end: at most a frame after its game frame, so the gaps are Q within one.
    for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!, `round ${i}`).toBeGreaterThanOrEqual(Q - 1 / fps - 1e-9);
    // The press's round at 0, then one each Q (the rate rounded up to whole game frames) while the 2 s last.
    expect(times).toHaveLength(Math.floor(2 / Q + 1e-9) + 1);
  });

  it('600 fps (a frame near nothing): every held round on a whole game frame after the press, at least the rate apart', () => {
    const I = DEFAULT_RIFLE.fireWait;
    const { times } = held(600, 2);
    for (let i = 1; i < times.length; i++) {
      expect(times[i]! - times[i - 1]!, `round ${i}`).toBeGreaterThanOrEqual(I - 1 / 600 - 1e-9);
      const k = times[i]! / GAME_FRAME_DT;
      expect(Math.abs(k - Math.round(k)) * GAME_FRAME_DT, `round ${i} on a game frame`).toBeLessThanOrEqual(1 / 600 + 1e-9);
    }
  });

  it('10 fps, a rate of two game frames: one round a game frame at most, two in one browser frame when it runs three (each named at its own game frame tick: LATER 338)', () => {
    const { times, frames } = held(10, 1, 0.04);                     // rounded up to two game frames
    expect(frames.some((f, i) => i > 0 && frames[i - 1] === f), 'some browser frame fires two').toBe(true);
    // Never more rounds than game frames: over 1 s, at most one each two game frames, and the press's.
    expect(times.length).toBeLessThanOrEqual(Math.floor(1 / (2 * GAME_FRAME_DT) + 1e-9) + 1);
  });

  it("the page's frame clamp (PAR-24, 0.1 s) bounds a hitch's catch-up: `matchMount.ts` and `main.ts` clamp what the kit is given", () => {
    for (const f of ['matchMount.ts', 'main.ts']) {
      const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf8');
      expect(/Math\.min\(frameTime\.frame\((?:[^()]|\([^()]*\))*\), 0\.1\)/.test(src), f).toBe(true);
    }
    // A 250 ms hitch mid-burst, as the page hands it (clamped): the clamp's game frames at most, none closer than the rate.
    const { fire } = rig(world([wallAt(-30)]), [0, 0, -1], { ...DEFAULT_RIFLE, magazine: 1000 });
    let n = 0;
    fire.subscribe((e) => { if (e.type === 'round') n++; });
    fire.pull();
    const frames = [...Array(30).fill(1 / 60), 0.25, ...Array(30).fill(1 / 60)];
    let given = 0;
    for (const dt of frames) { const g = Math.min(dt, 0.1); given += g; fire.update(g); }
    const Q = Math.ceil(DEFAULT_RIFLE.fireWait / GAME_FRAME_DT - 1e-9) * GAME_FRAME_DT;
    expect(n).toBeLessThanOrEqual(Math.floor(given / Q + 1e-9) + 1);
  });

  it('the press fires at once when the timer is clear -- on the browser frame, at most a game frame before the next', () => {
    const { fire } = rig(world([wallAt(-30)]));
    expect(fire.pull()).not.toBeNull();
    expect(fire.pull()).toBeNull();                                    // the timer set: nothing again before it runs down
  });
});

/**
 * A1, branch B (LATER 218; research 215 s8.6 "A1"): the turret's take on the hand's kit. The trigger is let go and the
 * reload's or the after-shot's clip is cut (the take's pop, `FUN_0058c350` D:L447983; a magazine already in stays). The
 * kit's one timer `+0x820` is no clip: the take-up zeroes `+0x810`, never it (`FUN_005c4b10` D:L478836, D:L478926), so it
 * is handed over -- returned for the turret's slot (`FUN_005c0fd0` D:L476549-476563) -- and the rifle's reload is lost.
 */
describe('A1: the turret\'s take on the kit (Fire.mountTake)', () => {
  const source = (): FireSource => ({ grid: () => world([wallAt(-30)]), aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }) });
  it("a reload's delay running: returned with its seconds left, the press's window and the record's delay; nothing pending after it, the rifle's reload lost, R taken again", () => {
    const fire = new Fire(source(), { ...DEFAULT_RIFLE, reloadDelay: 1 }, undefined, () => 0.5);
    const events: FireEvent[] = [];
    fire.subscribe((e) => events.push(e));
    fire.shoot(); fire.update(0.2);
    const before = fire.state().magazine;
    expect(fire.reload()).toBe(true);
    fire.setPressWindow(160);
    fire.update(0.3);
    const c = fire.mountTake();
    expect(c?.kind).toBe('reload');
    expect(c?.seconds).toBeCloseTo(1 - 9 * GAME_FRAME_DT, 6);   // LATER 330: 9 whole game frames run (0.2 s left 0.0332 s of one, then 0.3 s)
    expect([c?.until, c?.delay]).toEqual([160, 1]);
    expect(fire.state().magazine).toEqual({ ...before, reloading: false });
    expect(fire.reloadLocked(150)).toBe(false);                                // the window handed over with the timer
    fire.update(2);
    expect(events.some((e) => e.type === 'reloadStart')).toBe(false);          // the rifle's reload lost, not resumed
    expect(fire.state().magazine).toEqual({ ...before, reloading: false });
    expect(fire.reload()).toBe(true);                                          // R is the rifle's again after it
  });

  it("a reload's clip under way: null (no timer), the clip cut 'cancelled', the magazine it put in kept", () => {
    const fire = new Fire(source(), DEFAULT_RIFLE, undefined, () => 0.5);
    const events: FireEvent[] = [];
    fire.subscribe((e) => events.push(e));
    fire.shoot(); fire.update(0.2);
    expect(fire.reload()).toBe(true);
    fire.update(0.05);                                                         // the default 0.01 s delay run out: the clip
    expect(events.some((e) => e.type === 'reloadStart')).toBe(true);
    const inside = fire.state().magazine;
    expect(inside.reloading).toBe(true);
    expect(fire.mountTake()).toBeNull();
    expect(events.at(-1)).toMatchObject({ type: 'reloadEnd', completed: false, reason: 'cancelled' });
    expect(fire.state().magazine).toEqual({ ...inside, reloading: false });
  });

  it("a bolt's after-shot lock running: returned as the after-shot, its seconds left, no window; the lock gone from the hand", () => {
    const m40: WeaponRecord = { ...DEFAULT_RIFLE, name: 'M40A1', id: 102, fireModes: [1], maxFireMode: 1, fireWait: 0.5, magazine: 25, mags: 1, reloadAfterShot: true, reloadDelayAfterShot: 0.5 };
    const fire = new Fire(source(), m40, undefined, () => 0.5);
    expect(fire.shoot()).not.toBeNull();
    fire.update(0.1);
    expect(fire.state().afterShot).toBe(true);
    const c = fire.mountTake();
    expect(c?.kind).toBe('afterShot');
    expect(c?.seconds).toBeCloseTo(0.5 - 2 * GAME_FRAME_DT, 6);   // LATER 330: 2 whole game frames in 0.1 s
    expect(c?.until).toBeNull();
    expect(fire.state().afterShot).toBe(false);
  });

  it('nothing running (the control): null, the trigger let go', () => {
    const fire = new Fire(source(), DEFAULT_RIFLE, undefined, () => 0.5);
    const trig: boolean[] = [];
    fire.setGun({ trigger: (down: boolean) => { trig.push(down); }, roundsPerPull: () => 1, interval: (w: number) => w, round: (d) => d });
    fire.pull();
    expect(fire.triggerHeld()).toBe(true);
    expect(fire.mountTake()).toBeNull();
    expect([fire.triggerHeld(), trig.at(-1)]).toEqual([false, false]);
  });
});

/**
 * A1, the fresh review's fold 3: the page carries a pending reload's delay at the take only under the room's own condition
 * (`room.ts` `mountKit`: the press's weapon the one in the hand, `l.weapon === w`, and its magazine ring unchanged since
 * the press, `p.mags[w] === l.ring` -- LATER 72's press window, the same weapon and ring). The room keeps one ring a
 * weapon (`Player.mags`), a launcher round's slots apart (`KitRounds`), so a round-mode switch after R leaves the ring and
 * the room carries; a swap moves the hand off the press's weapon and the room carries nothing. The page alike: the press's
 * weapon and its own ring (`Fire.mags`, never the round mode's) kept at the press.
 */
describe("A1 fold 3: the delay carried at the take only under the room's condition -- the press's weapon in the hand, its ring unchanged", () => {
  const source = (): FireSource => ({ grid: () => world([wallAt(-30)]), aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }) });
  const frag: KitRound = {
    record: { ...M67, name: 'M203 FRAG', id: 175, muzzleVelocity: 270, armingDistance: 100, impact: true, fuse: 10, removal: 10.1 },
    piercing: 0, fireWait: 1, reloadAfterShot: true, reloadDelayAfterShot: 0.5, icon: 'firemode_203_frag.tif',
  };
  const pressed = () => {
    const fire = new Fire(source(), { ...DEFAULT_RIFLE, reloadDelay: 1 }, undefined, () => 0.5);
    fire.shoot(); fire.update(0.2);
    expect(fire.reload()).toBe(true);
    fire.setPressWindow(160);
    fire.update(0.2);
    return fire;
  };

  it("a round-mode switch in the trip after R: carried -- the weapon's ring is the press's (the round mode's slots are apart), as the room carries", () => {
    const fire = pressed();
    fire.setRound({ id: 175, round: frag, ring: new MagazineRing(6, 1) });
    fire.update(0.1);
    const c = fire.mountTake();
    expect([c?.kind, c?.until, c?.delay]).toEqual(['reload', 160, 1]);
  });

  it("a swap in the trip after R (forced past the walk's own refusal, LATER 167): nothing carried, as the room carries nothing (the hand off the press's weapon); back on the first, still nothing", () => {
    const fire = pressed();
    fire.setWeapon({ ...DEFAULT_RIFLE, name: 'other', id: 99 });
    expect(fire.mountTake()).toBeNull();
    const back = pressed();
    back.setWeapon({ ...DEFAULT_RIFLE, name: 'other', id: 99 });
    back.setWeapon({ ...DEFAULT_RIFLE, reloadDelay: 1 });
    expect(back.mountTake()).toBeNull();
  });

  it("a ring replaced in the trip after R (a pickup of the same weapon, `takeWeapon`): nothing carried -- the press's ring is gone, as the room's `p.mags[w] === l.ring` fails", () => {
    const fire = pressed();
    fire.takeWeapon({ ...DEFAULT_RIFLE, reloadDelay: 1 }, [30, 30, 30]);
    expect(fire.mountTake()).toBeNull();
  });
});

/**
 * LATER 526's review, F5(D): the take's refusal hands the kit's timer back. The room refused the take, and the original never
 * took (`FUN_005463c0`: the refusal tests D:L412131-412166 run before the take block at D:L412188), so the reload's timer
 * `+0x820` was kept (the kit's `FUN_005bc5d0` / `FUN_005c4b10` sit under that block, D:L412217-412218). `Fire.mountTake`
 * keeps what it hands over (the delay's seconds, the press's window's end, the press's record); `Fire.mountUntake` puts it
 * back once, the delay run down by the time the take stood, if the kit has not moved on.
 */
describe('LATER 526 review F5(D): the refused take hands the kit\'s timer back (Fire.mountUntake)', () => {
  const source = (): FireSource => ({ grid: () => world([wallAt(-30)]), aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }) });
  const pressed = () => {
    const fire = new Fire(source(), { ...DEFAULT_RIFLE, reloadDelay: 1 }, undefined, () => 0.5);
    const events: FireEvent[] = [];
    fire.subscribe((e) => events.push(e));
    fire.shoot(); fire.update(0.2);
    expect(fire.reload()).toBe(true);
    fire.setPressWindow(160);
    fire.update(0.3);                                                          // 0.7 s of the delay left
    return { fire, events };
  };

  it("a reload's delay carried at the take: back at the refusal with its window, run down by the wait; the reload starts at its end, once", () => {
    const { fire, events } = pressed();
    expect(fire.mountTake()?.kind).toBe('reload');
    expect(fire.reloadLocked(150)).toBe(false);
    fire.mountWait(0.2);                                                       // the wait: the room's timer ran on (`fireFrame`'s mounted branch)
    (fire as unknown as { mountUntake(): void }).mountUntake();
    expect(fire.reloadLocked(150), "the press's window handed back").toBe(true);
    expect(fire.reloadLocked(160), "...to its end").toBe(false);
    expect(fire.state().magazine.reloading, 'the delay pending').toBe(true);
    fire.update(0.4);
    expect(events.some((e) => e.type === 'reloadStart'), '0.7 - 0.2 = 0.5 s left: not yet').toBe(false);
    fire.update(0.2);
    expect(events.filter((e) => e.type === 'reloadStart')).toHaveLength(1);
    (fire as unknown as { mountUntake(): void }).mountUntake();                // single-shot: nothing more
    expect(events.filter((e) => e.type === 'reloadStart')).toHaveLength(1);
  });

  it("a bolt's after-shot lock carried: back at the refusal", () => {
    const m40: WeaponRecord = { ...DEFAULT_RIFLE, name: 'M40A1', id: 102, fireModes: [1], maxFireMode: 1, fireWait: 0.5, magazine: 25, mags: 1, reloadAfterShot: true, reloadDelayAfterShot: 0.5 };
    const fire = new Fire(source(), m40, undefined, () => 0.5);
    expect(fire.shoot()).not.toBeNull();
    fire.update(0.1);
    expect(fire.mountTake()?.kind).toBe('afterShot');
    expect(fire.state().afterShot).toBe(false);
    (fire as unknown as { mountUntake(): void }).mountUntake();
    expect(fire.state().afterShot, 'the lock the original kept').toBe(true);
  });

  it('the kit moved on in the wait (a weapon taken up): nothing handed back', () => {
    const { fire } = pressed();
    expect(fire.mountTake()?.kind).toBe('reload');
    fire.setWeapon({ ...DEFAULT_RIFLE, name: 'other', id: 99 });
    (fire as unknown as { mountUntake(): void }).mountUntake();
    expect(fire.reloadLocked(150)).toBe(false);
    expect(fire.state().magazine.reloading).toBe(false);
  });

  it('no timer at the take: nothing to hand back', () => {
    const fire = new Fire(source(), DEFAULT_RIFLE, undefined, () => 0.5);
    expect(fire.mountTake()).toBeNull();
    (fire as unknown as { mountUntake(): void }).mountUntake();
    expect(fire.state().magazine.reloading).toBe(false);
  });
});

/**
 * LATER 530 (the second re-look of LATER 526's folds, R2): the reload's or the after-shot's clip under way at the take. The
 * take cuts it (`Fire.mountTake` -> `cancelReload('cancelled')`: the clip's lock `reloadLeft` / `afterShotLeft` zeroed, a
 * reload's `reloadEnd`), and the original's clip played on, for `FUN_005463c0` refuses before its take's steps
 * (D:L412131-412166; the pop `FUN_0058c350` D:L447983-447992 sits in the take block, D:L412188). Kept at the take and handed
 * back at the refusal, run on by the wait on the one clock the timer's wait runs on (`mountWait`, LATER 526's R1): the lock
 * back at what the wait left of it, the clip's own layers told (`reloadResume`, with that wait), the reload completing as
 * the original's did. A death in the wait (`mountUntake(true)`) ends a reload under way, as a death on foot does (PAR-19:
 * `cancelReload('death')`), so no clip comes back to the dead body; a timer still does (PAR-19: a death never cancels a
 * reload not under way, the room keeps its lock).
 */
describe('LATER 530 (R2): the clip under way at a refused take kept and handed back (Fire.mountTake / mountUntake)', () => {
  type Untake = { mountUntake(dead?: boolean): void };
  const source = (clip = 1.6): FireSource => ({
    grid: () => world([wallAt(-30)]), aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }), reloadSeconds: () => clip,
  });
  /** A reload's clip 0.5 s under way (the default 0.01 s delay run out on the first update: the clip's 1.6 s from there). */
  const reloading = () => {
    const fire = new Fire(source(), DEFAULT_RIFLE, undefined, () => 0.5);
    const events: FireEvent[] = [];
    fire.subscribe((e) => events.push(e));
    fire.shoot(); fire.update(0.2);
    expect(fire.reload()).toBe(true);
    fire.update(0.01);                                                         // the delay out: the clip starts (1.6 s)
    expect(events.filter((e) => e.type === 'reloadStart')).toHaveLength(1);
    fire.update(0.5);                                                          // 1.1 s of the clip left
    return { fire, events };
  };
  const completed = (events: FireEvent[]) => events.filter((e) => e.type === 'reloadEnd' && e.completed).length;

  it("RED: a reload's clip under way at the take, the take refused: the clip back, run on by the wait; it completes when the original's did", () => {
    /** The clip's end, seconds after the take's frame: `take` taken and refused after 0.6 s of wait, else never taken. */
    const run = (take: boolean) => {
      const { fire, events } = reloading();
      const left = (fire as unknown as { reloadLeft: number }).reloadLeft;
      let t = 0, done = -1;
      if (take) {
        expect(fire.mountTake()).toBeNull();                                   // no timer: the clip is no carried kind
        expect(events.at(-1), 'the take cuts the clip, kept for a refusal').toMatchObject({ type: 'reloadEnd', completed: false, reason: 'cancelled', kept: true });
        expect(fire.state().magazine.reloading).toBe(false);
        for (let i = 0; i < 60; i++) { fire.mountWait(0.01); t += 0.01; }      // the wait: the original's clip played on
        (fire as unknown as Untake).mountUntake();
        expect(fire.state().magazine.reloading, "the clip's lock back").toBe(true);                // today: false
        const told = events.at(-1) as { type: string; kind: string; wait: number; seconds: number };
        expect([told.type, told.kind], "the clip's layers told").toEqual(['reloadResume', 'reload']);
        expect(told.wait, 'with the wait').toBeCloseTo(0.6, 9);
        expect(told.seconds, 'and what it left of the lock').toBeCloseTo(left - 0.6, 9);
      }
      for (let i = 0; i < 300 && done < 0; i++) { fire.update(0.01); t += 0.01; if (completed(events)) done = t; }
      expect(events.filter((e) => e.type === 'reloadStart'), 'no second reload: the room never ended the first').toHaveLength(1);
      (fire as unknown as Untake).mountUntake();                               // single-shot
      return done;
    };
    const control = run(false);
    expect(control).toBeGreaterThan(0.6);
    expect(run(true), 'complete when the clip never cut completes').toBeCloseTo(control, 6);       // today: -1 (never)
  });

  it("RED: the clip back is the reload's own -- the room's refusal of it stale (`undoReload`) still finds it under way", () => {
    const { fire } = reloading();
    fire.mountTake();
    fire.mountWait(0.2);
    (fire as unknown as Untake).mountUntake();
    expect(fire.undoReload(), 'its lock runs: the journal undoes it').toBe(true);                     // today: false
  });

  it("RED: a bolt's after-shot clip under way at the take: its lock back, run on by the wait", () => {
    const m40: WeaponRecord = { ...DEFAULT_RIFLE, name: 'M40A1', id: 102, fireModes: [1], maxFireMode: 1, fireWait: 0.5, magazine: 25, mags: 1, reloadAfterShot: true, reloadDelayAfterShot: 0.5 };
    const fire = new Fire(source(1), m40, undefined, () => 0.5);
    const events: FireEvent[] = [];
    fire.subscribe((e) => events.push(e));
    expect(fire.shoot()).not.toBeNull();
    fire.update(pastKit(0.5));                                                 // the lock out (LATER 330: its 15 game frames): the after-shot clip (1 s)
    expect(events.filter((e) => e.type === 'afterShot')).toHaveLength(1);
    fire.update(0.2);                                                          // 0.8 s of the clip left
    expect(fire.state().afterShot).toBe(true);
    expect(fire.mountTake()).toBeNull();
    expect(fire.state().afterShot).toBe(false);
    fire.mountWait(0.3);
    (fire as unknown as Untake).mountUntake();
    expect(fire.state().afterShot, "the clip's lock back").toBe(true);                             // today: false
    expect(events.at(-1)).toMatchObject({ type: 'reloadResume', kind: 'afterShot', wait: 0.3 });
    fire.update(0.45);
    expect(fire.state().afterShot, '0.5 s left: still held').toBe(true);
    fire.update(0.1);
    expect(fire.state().afterShot).toBe(false);
  });

  it('a clip that ran out during the wait: nothing back, nothing told (it ended as the original\'s did)', () => {
    const { fire, events } = reloading();
    fire.mountTake();
    const n = events.length;
    fire.mountWait(1.2);
    (fire as unknown as Untake).mountUntake();
    expect(fire.state().magazine.reloading).toBe(false);
    expect(events.length).toBe(n);
  });

  it('the kit moved on in the wait (another weapon in the hand): the clip not handed back', () => {
    const { fire, events } = reloading();
    fire.mountTake();
    fire.setWeapon({ ...DEFAULT_RIFLE, name: 'other', id: 99 });
    const n = events.length;
    (fire as unknown as Untake).mountUntake();
    expect(fire.state().magazine.reloading).toBe(false);
    expect(events.length).toBe(n);
  });

  it("LATER 530 (a guard on the fix) -- a death in the wait (`mountUntake(true)`): the clip under way does not come back to the dead body (PAR-19: a death ends a reload under way)", () => {
    const { fire, events } = reloading();
    fire.mountTake();
    fire.mountWait(0.2);
    const n = events.length;
    (fire as unknown as Untake).mountUntake(true);
    expect(fire.state().magazine.reloading).toBe(false);
    expect(events.length, 'nothing told').toBe(n);
  });

  it("LATER 530 (a pin) -- a death in the wait: a reload's delay (the kit's timer) is still handed back, as PAR-19 keeps a delay over a death on foot (the room keeps its lock)", () => {
    const fire = new Fire(source(), { ...DEFAULT_RIFLE, reloadDelay: 1 }, undefined, () => 0.5);
    fire.shoot(); fire.update(0.2);
    expect(fire.reload()).toBe(true);
    fire.setPressWindow(160);
    fire.update(0.3);
    expect(fire.cancelReload('death'), 'on foot: a death leaves a delay').toBe(false);
    expect(fire.state().magazine.reloading).toBe(true);
    expect(fire.mountTake()?.kind).toBe('reload');
    fire.mountWait(0.2);
    expect(fire.cancelReload('death'), 'in the wait: nothing under way to end').toBe(false);
    (fire as unknown as Untake).mountUntake(true);
    expect(fire.state().magazine.reloading, 'the delay back on the dead body, as on foot').toBe(true);
    expect(fire.reloadLocked(150)).toBe(true);
  });

  // LATER 530's review F1: a knock heard in the wait. The room's knock ends the clip under way and its lock at the knock's
  // command (`room.ts` `layKnock` -> `endStillReload(q, true)`: `reloadUntil` set to `ran`, the life ended; the original's
  // `FUN_0057e770` -> `FUN_005a5da0` D:L440993 and `FUN_0058a4d0` D:L440997), and the fall refuses the take: so nothing
  // of the clip comes back at the refusal -- not its lock, not its layers. The page hears the blast before the refusal;
  // `reloadPopped('knock')` -> `popClip('knock')` finds the lock already cut by the take.
  it("RED: LATER 530 review F1 -- a knock heard in the wait, then the refusal: the clip under way not handed back, nothing told", () => {
    const { fire, events } = reloading();
    fire.mountTake();
    fire.mountWait(0.2);
    expect(fire.popClip('knock'), 'the take cut the lock: nothing ends now').toBe(false);
    fire.mountWait(0.1);
    const n = events.length;
    (fire as unknown as Untake).mountUntake();
    expect(fire.state().magazine.reloading, "the room's knock ended the clip and its lock").toBe(false);   // today: true
    expect(events.slice(n), 'no `reloadResume`: the layers keep nothing back').toEqual([]);              // today: reloadResume
  });

  it("RED: LATER 530 review F1 -- the same for a bolt's after-shot clip under way: a knock in the wait, nothing back", () => {
    const m40: WeaponRecord = { ...DEFAULT_RIFLE, name: 'M40A1', id: 102, fireModes: [1], maxFireMode: 1, fireWait: 0.5, magazine: 25, mags: 1, reloadAfterShot: true, reloadDelayAfterShot: 0.5 };
    const fire = new Fire(source(1), m40, undefined, () => 0.5);
    const events: FireEvent[] = [];
    fire.subscribe((e) => events.push(e));
    expect(fire.shoot()).not.toBeNull();
    fire.update(0.5);
    fire.update(0.2);
    expect(fire.state().afterShot).toBe(true);
    fire.mountTake();
    fire.mountWait(0.1);
    fire.cancelReload('knock');                                               // the body's end routes a knock to `popClip`
    const n = events.length;
    (fire as unknown as Untake).mountUntake();
    expect(fire.state().afterShot, "the knock ended the clip's lock").toBe(false);                     // today: true
    expect(events.slice(n)).toEqual([]);
  });

  // The kit's timer over a knock in the wait: the room leaves it (`endStillReload` returns while `ran < lockTimer[w]`, the
  // timer still running -- `FUN_005c2400`, `kit+0x820 > 0`, D:L477159), as `popClip` does on foot; so the delay the take
  // kept is still handed back.
  it("LATER 530 review F1 (a pin) -- a knock in the wait over a reload's delay: the delay is still handed back (the room keeps the timer)", () => {
    const fire = new Fire(source(), { ...DEFAULT_RIFLE, reloadDelay: 1 }, undefined, () => 0.5);
    fire.shoot(); fire.update(0.2);
    expect(fire.reload()).toBe(true);
    fire.setPressWindow(160);
    fire.update(0.3);
    expect(fire.mountTake()?.kind).toBe('reload');
    fire.mountWait(0.2);
    expect(fire.popClip('knock')).toBe(false);
    (fire as unknown as Untake).mountUntake();
    expect(fire.state().magazine.reloading, 'the delay back, 0.5 s left').toBe(true);
    expect(fire.reloadLocked(150)).toBe(true);
  });

  // LATER 530's review F1, its related case (a pin of today's behaviour, not a ruling: row 530's Open line). A flinch laid
  // at the refusal's re-run (`walk.mountUntake` runs before `Fire.mountUntake`, `./matchActions` `untook`) reaches
  // `cancelReload('flinch')` while the take still holds the clip: `reloadLeft` is 0, so nothing ends, and the clip comes
  // back. On foot a flinch ends a reload under way (PAR-19); the room's `endStillReload` has no flinch call -- whether the
  // original's flinch ends a reload clip is research 251 section 6's open gap.
  it("LATER 530 review (a pin, open) -- a flinch's end at the refusal's re-run, before Fire's untake: the clip still comes back", () => {
    const { fire, events } = reloading();
    fire.mountTake();
    fire.mountWait(0.2);
    expect(fire.cancelReload('flinch'), 'the lock cut by the take: nothing under way').toBe(false);
    (fire as unknown as Untake).mountUntake();
    expect(fire.state().magazine.reloading).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'reloadResume', kind: 'reload' });
  });
});

// TRIGGER-SWAP (Craig's report, 2026-11-09: a grenade put away with R1 held, the primary would not fire until R1 was let go
// and pressed again). The kit's pull count `kit+0x818` is the kit's, not the weapon's: the slot change (`FUN_005c4b10`
// D:L478779-478936) leaves it, and only a frame whose trigger reads 0 or 3 zeroes it (`FUN_005c0ae0` D:L476380-476382,
// D:L476399-476400). A trigger held into the firearm from another item comes with the count that item raised in the hold
// (a hand throw's end under it, `FUN_005c1970` D:L477023-477025; a launch, `FUN_005be9a0` D:L475514-475516), and the round
// is refused at the count's limit (`FUN_005c0ae0` D:L476439-476441: `FUN_005c0940`'s 1, 3 or 10000).
describe('TRIGGER-SWAP: a trigger held into the firearm from another item carries the kit pull count (kit +0x818)', () => {
  const armed = (perPull: number): Fire => {
    const { fire } = rig(world([wallAt(-30)]), [0, 0, -1], { ...DEFAULT_RIFLE, magazine: 100 });
    fire.setGun({ trigger: () => {}, roundsPerPull: () => perPull, interval: (w) => w, round: (d) => d });
    return fire;
  };
  it('count 0: the round at once, as a press; count 1: single refused until the release, burst two more, automatic runs on', () => {
    expect(armed(1).pull(0)).not.toBeNull();
    const single = armed(1);
    expect(single.pull(1)).toBeNull();
    for (let i = 0; i < 20; i++) single.update(DEFAULT_RIFLE.fireWait);
    expect(single.state().shots).toBe(0);
    single.release();
    single.update(1);
    expect(single.pull()).not.toBeNull();                 // the next press's own round
    const burst = armed(3);
    expect(burst.pull(1)).not.toBeNull();
    for (let i = 0; i < 20; i++) burst.update(DEFAULT_RIFLE.fireWait);
    expect(burst.state().shots).toBe(2);
    const auto = armed(Infinity);
    expect(auto.pull(1)).not.toBeNull();
    for (let i = 0; i < 9; i++) auto.update(pastRate(DEFAULT_RIFLE.fireWait));
    expect(auto.state().shots).toBe(10);
  });
  it('an empty single held in with count 1 asks no click and no reload (FUN_005c0fd0 D:L476591, D:L476616: the count under the limit); count 0 clicks', () => {
    const dry = (count: number): string[] => {
      const fire = armed(1);
      while (fire.state().magazine.rounds > 0) { fire.release(); fire.update(1); fire.pull(); }
      fire.release(); fire.update(5);
      const seen: string[] = [];
      fire.subscribe((e) => { seen.push(e.type); });
      fire.pull(count);
      return seen;
    };
    expect(dry(1)).not.toContain('dry');
    expect(dry(0)).toContain('dry');
  });
});

// TRIGGER-SWAP fold (research 211 §10): the slot change keeps the kit's pull count +0x818 and its rate timer +0x81c --
// `FUN_005c4b10` (D:L478779-478936) zeroes +0x810 (D:L478836-478839, D:L478926-478929) and the throw's power +0x11c
// (`FUN_00592d40`, D:L478915), neither of those; `FUN_005c0ae0` refuses at the count's limit (D:L476439-476441) and while
// +0x81c is above 0 (D:L476446-476448). A rocket sets the same +0x81c (`FUN_005be9a0` D:L475514-475517).
describe('TRIGGER-SWAP fold: the kit pull count and rate timer kept through a firearm swap; another item\'s timer carried', () => {
  const PISTOL = { ...DEFAULT_RIFLE, name: 'TEST PISTOL', magazine: 100 };
  const armed = (perPull: number): Fire => {
    const { fire } = rig(world([wallAt(-30)]), [0, 0, -1], { ...DEFAULT_RIFLE, magazine: 100 });
    fire.setGun({ trigger: () => {}, roundsPerPull: () => perPull, interval: (w) => w, round: (d) => d });
    return fire;
  };
  it('a single fired, held through setWeapon: the count stays at its limit -- nothing until the release', () => {
    const fire = armed(1);
    expect(fire.pull()).not.toBeNull();
    fire.setWeapon(PISTOL);
    expect(fire.triggerHeld()).toBe(true);
    for (let i = 0; i < 20; i++) fire.update(1);
    expect(fire.state().shots).toBe(1);
    fire.release();
    expect(fire.pull()).not.toBeNull();
  });
  it('an automatic fired, held through setWeapon: the rate timer runs on, the next round no sooner than it allows', () => {
    const fire = armed(Infinity);
    expect(fire.pull()).not.toBeNull();
    fire.setWeapon(PISTOL);
    fire.update(GAME_FRAME_DT + 1e-6);
    expect(fire.state().shots).toBe(1);                   // was: the wait zeroed, a round at once
    for (let i = 0; i < 10; i++) fire.update(pastRate(PISTOL.fireWait));
    expect(fire.state().shots).toBeGreaterThan(1);
  });
  // The fold's review F2: a weapon taken from the ground into the hand's slot (`FUN_0059f0c0`'s same-family branch,
  // D:L458278-458282, installing through `FUN_005bc410` D:L473809-473875 with no slot change) zeroes +0x810
  // (D:L473865-473868) and the throw's power (`FUN_00592d40`, D:L473854), never +0x818 or +0x81c: the count and the timer
  // stay, whether the weapon taken is the one in the hand or another (was: zeroed on a same-name pickup).
  it.each([
    ['the same weapon', DEFAULT_RIFLE.name],
    ['another weapon', 'TEST PICKUP'],
  ] as const)('a single fired, held through takeWeapon of %s: the count stays at its limit -- nothing until the release', (_what, name) => {
    const fire = armed(1);
    expect(fire.pull()).not.toBeNull();
    fire.takeWeapon({ ...DEFAULT_RIFLE, name, magazine: 100 }, [100, 100]);
    expect(fire.triggerHeld()).toBe(true);
    for (let i = 0; i < 20; i++) fire.update(1);
    expect(fire.state().shots).toBe(1);
    fire.release();
    expect(fire.pull()).not.toBeNull();
  });
  it.each([
    ['the same weapon', DEFAULT_RIFLE.name],
    ['another weapon', 'TEST PICKUP'],
  ] as const)('an automatic fired, held through takeWeapon of %s: the rate timer runs on', (_what, name) => {
    const fire = armed(Infinity);
    expect(fire.pull()).not.toBeNull();
    fire.takeWeapon({ ...DEFAULT_RIFLE, name, magazine: 100 }, [100, 100]);
    fire.update(GAME_FRAME_DT + 1e-6);
    expect(fire.state().shots).toBe(1);                   // was (the same weapon): the wait zeroed, a round at once
    for (let i = 0; i < 10; i++) fire.update(pastRate(DEFAULT_RIFLE.fireWait));
    expect(fire.state().shots).toBeGreaterThan(1);
  });
  it('holdWait: another item\'s timer (a rocket\'s FireWait) holds the first round; the longer stands', () => {
    const fire = armed(1);
    fire.holdWait(1);
    fire.holdWait(0.5);
    expect(fire.pull()).toBeNull();
    for (let i = 0; i < Math.ceil(0.9 / GAME_FRAME_DT); i++) fire.update(GAME_FRAME_DT);
    expect(fire.state().shots).toBe(0);
    for (let i = 0; i < Math.ceil(0.2 / GAME_FRAME_DT); i++) fire.update(GAME_FRAME_DT);
    expect(fire.state().shots).toBe(1);                   // held, it goes once the timer reads 0
  });
});

const zweaponItemReload = fixture('RUN/ZWEAPON.ZAR');
describe.skipIf(zweaponItemReload === null)(`GRENADE-RELOAD fold: what R reads off the hand's record and slot, through the reader (research 361 s5)${zweaponItemReload ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const table = zweaponItemReload ? readKitTable(zweaponItemReload) : null;
  const zar = zweaponItemReload ? Zar.parse(zweaponItemReload) : null;
  const raw = zar ? parseRdr(zar.data(zar.root.children.find((k) => k.name.toLowerCase() === 'zweapon.rdr')!)) : null;
  const rawRecords = raw ? (rdrGet(raw, 'ZWEAPON') as RdrNode[]).filter((r): r is RdrNode[] => Array.isArray(r)) : [];
  const rawOf = (name: string): RdrNode[] | undefined => rawRecords.find((r) => { const n = rdrGet(r, 'InternalName'); return (Array.isArray(n) ? n[0] : n) === name; });

  it("ITEM_RELOAD_TIMER_READING: every throwable, charge and the Detonator carry no ReloadDelay key, so the parser's default 0.01 s (FUN_003cda30, firearms.ts RELOAD_DELAY_DEFAULT) -- R's timer on kit+0x820 skips one FUN_005c1970 frame", () => {
    const items = [...table!.arsenal.items.values()];
    const throwables = [...table!.throwables!.keys()];
    expect(throwables.length).toBeGreaterThanOrEqual(7);
    const held = [...throwables, ITEM.DETONATOR];
    for (const id of held) {
      const item = table!.arsenal.items.get(id)!;
      expect(item, String(id)).toBeDefined();
      expect(item.reloadDelay, item.name).toBe(RELOAD_DELAY_DEFAULT);
      expect(rdrGet(rawOf(item.name)!, 'ReloadDelay'), item.name).toBeUndefined();
    }
    // The records that do carry the key are the firearms and rounds the walk can find, none of the above.
    const keyed = rawRecords.filter((r) => rdrGet(r, 'ReloadDelay') !== undefined).map((r) => { const n = rdrGet(r, 'InternalName'); return Array.isArray(n) ? n[0] : n; });
    expect(keyed.some((n) => held.some((id) => table!.arsenal.items.get(id)!.name === n))).toBe(false);
    expect(items.length).toBe(rawRecords.length);
  });

  it("RELOAD_LAUNCHER_UP_READING: the rounds the redirect reaches carry one magazine (the walk finds nothing) and a ReloadDelay of 1 s; the RPG-7's own NumMags 2 is its launcher slot's, never reached; the Detonator carries no magazine (NumMags 0), class 0xbe", () => {
    const at = (id: number) => table!.arsenal.items.get(id)!;
    expect([at(ITEM.LAW_HEAT).mags, at(ITEM.RPG_ROUND).mags]).toEqual([1, 1]);
    expect([at(ITEM.LAW_HEAT).reloadDelay, at(ITEM.RPG_ROUND).reloadDelay]).toEqual([1, 1]);
    expect([at(ITEM.LAW).mags, at(ITEM.RPG7).mags]).toEqual([1, 2]);
    expect([at(ITEM.LAW).cls, at(ITEM.RPG7).cls, at(ITEM.LAW_HEAT).cls, at(ITEM.RPG_ROUND).cls]).toEqual(['rocketLauncher', 'rocketLauncher', 'rocketRound', 'rocketRound']);
    expect(at(ITEM.DETONATOR)).toMatchObject({ name: 'Detonator', mags: 0, magazine: 0, cls: 'gear' });
  });
});

describe("LATER 330: the kit's other timer (+0x820: a reload's delay, a bolt's or a pump's lock) on whole game frames (FUN_005c0fd0 D:L476549-476563)", () => {
  // The original runs `+0x820` down by the frame's dt once a game frame and ends it on the frame it goes below 0
  // (D:L476550-476560, float32): 0.5 s is 15 frames (0.5005 s), 1 s 30 (1.0010 s), 0.01 s 1. Its frames run no fire tick
  // (D:L476549-476563), so the fire timer `+0x81c`, run down inside the tick (D:L476643-476647), is held through them.
  const FPS = [30, 60, 144] as const;
  /** The page time from the event's start (`kick` at time 0) to the browser frame `want` is told on, at `fps`, the kit's clock carried `warm` page frames. */
  const until = (fire: Fire, fps: number, kick: () => void, want: FireEvent['type'], warm = 0): { at: number; phase: number } => {
    for (let i = 0; i < warm; i++) fire.update(1 / fps);
    const phase = warm / fps - Math.floor((warm / fps + 1e-9) / GAME_FRAME_DT) * GAME_FRAME_DT;   // the clock's carry at the start
    let now = 0, at = -1;
    fire.subscribe((e) => { if (e.type === want && at < 0) at = now; });
    kick();
    for (let i = 0; i < 3 * fps && at < 0; i++) { now += 1 / fps; fire.update(1 / fps); }
    return { at, phase };
  };
  /** The page frame holding the `frames`th game-frame step after the start (the clock carried `phase`). */
  const onStep = (at: number, fps: number, frames: number, phase = 0): void => {
    const step = frames * GAME_FRAME_DT - phase;
    expect(at).toBeGreaterThanOrEqual(step - 1e-9);
    expect(at - 1 / fps).toBeLessThan(step - 1e-9);
  };

  it.each(FPS)("a reload's delay ends on its whole game frames at %i fps (0.5 s: 15, 1 s: 30)", (fps) => {
    for (const [delay, frames] of [[0.5, 15], [1, 30]] as const) {
      for (const warm of [0, 7]) {
        const { fire } = rig(world([wallAt(-30)]), [0, 0, -1], { ...DEFAULT_RIFLE, reloadDelay: delay });
        const r = until(fire, fps, () => expect(fire.reload()).toBe(true), 'reloadStart', warm);
        onStep(r.at, fps, frames, r.phase);
      }
    }
  });

  it.each(FPS)("a bolt's lock (0.5 s) ends on its 15th game frame after the round at %i fps", (fps) => {
    const m40: WeaponRecord = { ...DEFAULT_RIFLE, name: 'M40A1', id: 102, fireModes: [1], maxFireMode: 1, fireWait: 0.5, magazine: 25, mags: 1, reloadAfterShot: true, reloadDelayAfterShot: 0.5 };
    const { fire } = rig(world([wallAt(-30)]), [0, 0, -1], m40);
    // A press's round starts the kit's frame clock (LATER 326's F1; `shoot` alone does not).
    const r = until(fire, fps, () => { expect(fire.pull()).not.toBeNull(); fire.release(); }, 'afterShot', 5);
    onStep(r.at, fps, 15);
  });

  it.each(FPS)("the fire timer is held through a bolt's lock: a held M40A1's next round 15 + 15 game frames on at %i fps (D:L476643-476647)", (fps) => {
    const m40: WeaponRecord = { ...DEFAULT_RIFLE, name: 'M40A1', id: 102, fireModes: [1], maxFireMode: 1, fireWait: 0.5, magazine: 25, mags: 1, reloadAfterShot: true, reloadDelayAfterShot: 0.5 };
    const { fire } = rig(world([wallAt(-30)]), [0, 0, -1], m40);   // no clip (no `reloadSeconds`): the lock alone holds
    for (let i = 0; i < 4; i++) fire.update(1 / fps);
    expect(fire.pull()).not.toBeNull();                             // the press's round: the kit's frame clock from 0
    const r = until(fire, fps, () => {}, 'round');
    onStep(r.at, fps, 30);                                          // was 15: the timer run down through the lock
  });
});

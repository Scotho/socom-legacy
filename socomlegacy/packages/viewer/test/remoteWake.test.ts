import { describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { Group, Matrix4, PerspectiveCamera, Scene } from 'three';
import { FsAssetSource } from '@s2u/archive/node';
import type { CollisionOwner, GridParams, WorldPoly } from '@s2u/scene';
import { effectsFromDisc } from '../src/effectData';
import { Effects, type EffectPlace } from '../src/effects';
import type { LoadedMap } from '../src/loadMap';
import { DEFAULT_LIGHTING } from '../src/lighting';
import { packGround } from '../src/mover';
import { BodyFlag, type BodyState } from '../src/net/protocol';
import { REMOTE_WAKE_PACE_READING, RemotePlayers } from '../src/remotePlayers';
import { BODY_TOP, rippleOf } from '../src/traversal';
import { FALL_IN_WATER } from '../src/traversalPage';

/**
 * The others' wake and splash (research 86 s5.4, "The others' bodies"): `FUN_005b52b0` (D:L469810-469913) has no
 * locality test, and it runs on each liquid hit of every SEAL body's ground probe -- `FUN_00550570` -> `FUN_005b0420`
 * (D:L417771) -> `FUN_005b5d40` (D:L467055) -> `FUN_005b52b0` (D:L470243) -- so a console draws the others' ripples
 * and splashes as its own. The page's copy of each body keeps its own ripples (`RippleKeeper`) by the water over its
 * replicated feet (`rippleOf`, the local walker's rule), stops them dead in the water (D:L469904-469913), forgets them
 * when the body goes, the map changes or the copy is rebuilt at a respawn, and splashes on a fall into the water.
 * The real `RemotePlayers` runs; its body's view and `Play` are stand-ins.
 */
vi.mock('../src/bodyView', () => ({ buildBody: () => ({ group: new Group(), dispose: () => {} }) }));
vi.mock('../src/play', () => ({ Play: class {
  stopVictory() {}
  setBody() {} setFlyToggle() {} setClips() {} setWeaponInput() {} setItem() {} setMounts() {}
  setWeapon() {} setSidearm() {} addPoseLayer() {} motionSource() { return null; } frame() {}
  onEvent() { return () => undefined; }
} }));

const quad = (pts: number[], material: number): WorldPoly => ({
  modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype: 3, material, ptcount: 4, cameratype: 0, appflags: 0, points: Float32Array.from(pts),
});
const floor = (x0: number, z0: number, x1: number, z1: number, y: number, material = 25): WorldPoly =>
  quad([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1], material);

/** A floor at 0, a pool whose water stands at 6 (x -100..-60, z 20..60) and one at 25 (x 60..100). */
function map(): LoadedMap {
  const polys = [floor(-100, -100, 100, 100, 0), floor(-100, 20, -60, 60, 6, 11), floor(60, 20, 100, 60, 25, 11)];
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return { body: {}, ground: packGround(params, polys, owners) } as unknown as LoadedMap;
}

const body = (id: number, feet: [number, number, number], over: Partial<BodyState> = {}, alive = true, airborne = false): BodyState => ({
  id, feet, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0,
  flags: (alive ? BodyFlag.Alive : 0) | (airborne ? BodyFlag.Airborne : 0), stance: 0, landing: 0, jumps: 0,
  ground: 1, groundForward: 0, groundRight: 0, groundCls: -1, stickSnaps: 0,
  action: 0, actionSerial: 0, actionT: 0, actionSeconds: -1,
  overlay: 0, overlayT: 0, overlaySeconds: 0, turnRate: 0,
  trav: 0, travFrame: 0, travRootY: Number.NaN, travBlend: 0, travBlendWeight: 0, peek: 0, weapon: 255, slot: 0, ...over,
});

/** A recording `TraversalEffects`: every spawn's run (stoppable) and every one-shot play. */
function recorder() {
  const runs: { name: string; place: EffectPlace; stopped: boolean }[] = [];
  const played: { name: string; place: EffectPlace }[] = [];
  const fx = {
    spawn: (name: string, place: EffectPlace) => {
      const r = { name, place, stopped: false };
      runs.push(r);
      return { get finished() { return r.stopped; }, stop: () => { r.stopped = true; } };
    },
    play: (name: string, place: EffectPlace) => { played.push({ name, place }); return true; },
  };
  return { fx, runs, played };
}

function rig() {
  const remote = new RemotePlayers(new Scene());
  remote.setMap(map(), DEFAULT_LIGHTING, null);
  const rec = recorder();
  remote.setEffects(rec.fx);
  const camera = new PerspectiveCamera();
  return { remote, camera, ...rec, frame: (bodies: BodyState[]) => remote.frame(1 / 60, bodies, camera) };
}

const translation = (m: unknown): number[] => { const e = (m as Matrix4).elements; return [e[12]!, e[13]!, e[14]!]; };

describe('rippleOf: the ripple the water line asks for (FUN_005b52b0 D:L469852-469900; FUN_0058a820)', () => {
  const at: [number, number, number] = [1, 6, 2];
  it('no water over the feet: none; across the body: the big one; within 10 over its top: the small one; deeper: none', () => {
    expect(rippleOf(null, 0, 'stand', [0, 0, 0], at)).toBeNull();
    expect(rippleOf(0, 0, 'stand', [0, 0, 0], at)).toBeNull();
    expect(rippleOf(6, 0, 'stand', [0, 0, 0], at)).toEqual({ size: 'big', pace: 'anim', at });
    expect(rippleOf(BODY_TOP.stand + 5, 0, 'stand', [0, 0, 0], at)!.size).toBe('small');
    expect(rippleOf(BODY_TOP.stand + 10, 0, 'stand', [0, 0, 0], at)).toBeNull();
    expect(rippleOf(BODY_TOP.prone + 1, 0, 'prone', [0, 0, 0], at)!.size).toBe('small');   // the posture's own top
  });
  it('the pace by the speed squared: under 0.25 still, under 400 walk, else run', () => {
    expect(rippleOf(6, 0, 'stand', [0.4, 0, 0.2], at)!.pace).toBe('anim');
    expect(rippleOf(6, 0, 'stand', [0.5, 0, 0], at)!.pace).toBe('walk');
    expect(rippleOf(6, 0, 'stand', [0, 0, 19.9], at)!.pace).toBe('walk');
    expect(rippleOf(6, 0, 'stand', [20, 0, 0], at)!.pace).toBe('run');
  });
});

describe('the others\' bodies wade (FUN_005b52b0 for every SEAL body: no locality test)', () => {
  it('a body wading starts its own ripple on a node at the water point over its feet, and the node follows it', () => {
    const { runs, frame } = rig();
    expect(REMOTE_WAKE_PACE_READING).toBe('the snapshot\'s velocity');
    frame([body(2, [-80, 0, 40], { vx: 10 }), body(3, [0, 0, 0])]);
    expect(runs.map((r) => r.name)).toEqual(['big_ripple_anim_walk']);    // the dry body none
    expect(runs[0]!.place.node).toBeInstanceOf(Matrix4);
    expect(translation(runs[0]!.place.node)).toEqual([-80, 6, 40]);
    frame([body(2, [-75, 0, 42], { vx: 10 }), body(3, [0, 0, 0])]);
    expect(runs).toHaveLength(1);                                        // kept, moved
    expect(translation(runs[0]!.place.node)).toEqual([-75, 6, 42]);
  });

  it('each body keeps its own; the small one with the water over the top, the big one stopped on the switch', () => {
    const { runs, frame } = rig();
    frame([body(2, [-80, 0, 40]), body(4, [-70, 0, 30])]);
    expect(runs.map((r) => r.name)).toEqual(['big_ripple_anim', 'big_ripple_anim']);
    frame([body(2, [80, 0, 40]), body(4, [-70, 0, 30])]);
    expect(runs.map((r) => [r.name, r.stopped])).toEqual([['big_ripple_anim', true], ['big_ripple_anim', false], ['small_ripple_anim', false]]);
  });

  it('dead in the water: both stopped and forgotten, none started (D:L469904-469913)', () => {
    const { runs, frame } = rig();
    frame([body(2, [-80, 0, 40])]);
    frame([body(2, [-80, 0, 40], {}, false)]);
    expect(runs.map((r) => r.stopped)).toEqual([true]);
    frame([body(2, [-80, 0, 40], {}, false)]);
    expect(runs).toHaveLength(1);
  });

  it('a body gone, a map change and a respawn stop and forget its ripples', () => {
    const { remote, runs, frame } = rig();
    frame([body(2, [-80, 0, 40]), body(4, [-70, 0, 30])]);
    frame([body(4, [-70, 0, 30])]);                                       // 2 gone
    expect(runs.map((r) => r.stopped)).toEqual([true, false]);
    frame([body(4, [-70, 0, 30], { spawns: 1 } as Partial<BodyState>)]);
    frame([body(4, [-70, 0, 30], { spawns: 2 } as Partial<BodyState>)]); // the copy rebuilt at its respawn
    expect(runs[1]!.stopped).toBe(true);
    expect(runs).toHaveLength(3);                                         // a new one for the rebuilt copy, in the water
    remote.setMap(map(), DEFAULT_LIGHTING, null);
    expect(runs[2]!.stopped).toBe(true);
  });

  it("a round's clear stops and forgets every body's ripples, its seat's spawns unchanged (RIPPLES_AT_ROUND_CLEAR_READING)", () => {
    const { remote, runs, frame } = rig();
    frame([body(2, [-80, 0, 40], { spawns: 1 } as Partial<BodyState>), body(4, [-70, 0, 30])]);
    expect(runs.map((r) => r.stopped)).toEqual([false, false]);
    remote.clearWakes();                                                  // `roundClear` / `clearDecals`, beside the page's own
    expect(runs.map((r) => r.stopped)).toEqual([true, true]);
    frame([body(2, [-80, 0, 40], { spawns: 1 } as Partial<BodyState>), body(4, [-70, 0, 30])]);
    expect(runs).toHaveLength(4);                                         // the next frame in the water starts one afresh
    expect(runs.slice(2).map((r) => r.stopped)).toEqual([false, false]);
  });

  it('a fall into the water splashes once at the water point; walking in does not (D:L469892-469896)', () => {
    const { played, frame } = rig();
    frame([body(2, [-80, 10, 40], {}, true, true)]);                     // in the air over the pool
    expect(played).toEqual([]);
    frame([body(2, [-80, 4, 40], {}, true, true)]);                      // down through the water line
    frame([body(2, [-80, 0, 40])]);
    expect(played.map((p) => [p.name, p.place.position])).toEqual([[FALL_IN_WATER, [-80, 6, 40]]]);
    frame([body(2, [-50, 0, 40])]);
    frame([body(2, [-62, 0, 40])]);                                      // walked back in
    expect(played).toHaveLength(1);
  });

  it('no effects handed over: nothing runs (the map viewer\'s watcher)', () => {
    const remote = new RemotePlayers(new Scene());
    remote.setMap(map(), DEFAULT_LIGHTING, null);
    expect(() => remote.frame(1 / 60, [body(2, [-80, 0, 40])], new PerspectiveCamera())).not.toThrow();
  });
});

const PC_ROOT_ENV = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DEV_DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT_ENV ? resolve(PC_ROOT_ENV, 'game', 'disc') : '';

describe.skipIf(!DEV_DISC)(`another body's wake on the dev disc's ripples (MP12)${DEV_DISC ? '' : ' (no dev disc: SOCOM_DISC or SOCOM_PC_ROOT -- skipped)'}`, () => {
  it('its particles land on its path at the water, a trail behind it; the splash plays on its fall', async () => {
    const d = await effectsFromDisc(new FsAssetSource(DEV_DISC), 'RUN/MP12.ZDB', 'MP12');
    const fx = new Effects(() => 0.5);
    fx.setData(d);
    const remote = new RemotePlayers(new Scene());
    remote.setMap(map(), DEFAULT_LIGHTING, null);
    remote.setEffects(fx);
    const camera = new PerspectiveCamera();
    const dt = 1 / 60;
    remote.frame(dt, [body(2, [-90, 20, 40], {}, true, true)], camera);
    remote.frame(dt, [body(2, [-90, 3, 40], {}, true, true)], camera);
    expect(fx.stats().played['seal_fall_in_water']).toBe(1);
    // Carried 20 units along +x through the pool (vx 30, the run's pace; the still ripple the fall started loops on --
    // a change of pace waits for it to end, as the local keeper's).
    for (let i = 1; i <= 40; i++) { remote.frame(dt, [body(2, [-90 + i * 0.5, 0, 40], { vx: 30 })], camera); fx.update(dt, null); }
    expect(fx.stats().water.ripples).toBe('big_ripple_anim');
    const all = (fx as unknown as { particles: { particles: { source: { name: string }; position: [number, number, number] }[] } })
      .particles.particles.filter((q) => q.source.name.startsWith('rain_ripple'));
    expect(all.length).toBeGreaterThan(0);
    for (const q of all) {
      expect(q.position[0]).toBeGreaterThan(-100);
      expect(q.position[0]).toBeLessThan(-60);
      expect(Math.abs(q.position[2] - 40)).toBeLessThan(10);
    }
    const spray = all.filter((q) => q.source.name === 'rain_ripple3').map((q) => q.position[0]);
    expect(spray.length).toBeGreaterThanOrEqual(45);
    expect(Math.min(...spray)).toBeLessThan(-85);
    expect(Math.max(...spray)).toBeGreaterThan(-75);
  });
});

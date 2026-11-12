import { describe, expect, it } from 'vitest';
import { Group, PerspectiveCamera, Scene } from 'three';
import type { CollisionOwner, GridParams, MotionClip, MotionPart, WorldPoly } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { RemotePlayers, type SpawnedBodyState } from '../src/remotePlayers';
import type { LoadedBody } from '../src/body';
import type { LoadedMap } from '../src/loadMap';
import type { PlayClips } from '../src/play';
import { BodyFlag } from '../src/net/protocol';
import { DEFAULT_LIGHTING } from '../src/lighting';
import { packGround } from '../src/mover';
import { clipsFromPack, motionTableFromArchive } from '../src/motionTable';
import { simSkeletonsFromBytes } from '../src/simMap';
import { HIT_POSE_CLIPS, HIT_POSE_MOUNT_READING } from '../src/net/hitPose';
import { leanClip } from '../src/traversal';
import * as hitVolumes from '../src/net/hitVolumes';
import {
  bodyCulled, bodyRecords, bodyVolumes, boxBounds, placedVolumes, posedBoxes, rayBody, rayRecords, stanceVolumes, type HitBody, type StanceVolumes, type V3,
} from '../src/net/hitVolumes';

/**
 * PAGE-AIM-ALLOC (a browser adaptation: the page's aim path without a build per call; no value of the game's changes;
 * shadow's X2c profile, 16 bots on MP2: `posedBoxes` once per remote on every `aimDistance`, `aimBodies` and
 * `aimRecords` call). Two conditions, each on a synthetic rig (always run) and on the fixture disc's SEAL and motion
 * (skipped without the fixtures, said so):
 * - the same answers: every number `aimDistance`, `aimBodies` and `aimRecords` return, at every frame, from several eyes,
 *   several calls between two steps and the first call after a step, `Object.is` the per-call build's -- `aimBody` as it
 *   was before (`placedVolumes(feet, yaw, posedBoxes(skeleton))` for a drawn copy, `bodyVolumes` for the rest, `rayBody`
 *   and `rayRecords` on them), kept here and reached through the instance's own state;
 * - no build per call: after a warm-up, the aim calls of a frame for N remotes make no Float32Array or Float64Array
 *   (the constructors and their `from` / `of` counted) -- at the base, 25 per drawn remote per call.
 * Unit-test evidence only.
 */

// ---- counting typed arrays ------------------------------------------------------------------------------------------

/** The Float32Arrays and Float64Arrays `run` makes: `new`, `from` and `of`, counted through the globals. */
function typedArraysMade(run: () => void): number {
  let made = 0;
  const F32 = globalThis.Float32Array, F64 = globalThis.Float64Array;
  const wrap = <T extends object>(C: T): T => new Proxy(C, {
    construct(target, args) { made++; return Reflect.construct(target as unknown as new (...a: unknown[]) => object, args); },
    get(target, key, receiver) {
      if (key === 'from' || key === 'of') {
        const f = Reflect.get(target, key) as (...a: unknown[]) => unknown;
        return (...a: unknown[]) => { made++; return f.apply(target, a); };
      }
      return Reflect.get(target, key, receiver);
    },
  });
  globalThis.Float32Array = wrap(F32);
  globalThis.Float64Array = wrap(F64);
  try { run(); } finally { globalThis.Float32Array = F32; globalThis.Float64Array = F64; }
  return made;
}

// ---- the old aim path, kept: `aimBody`, `aimDistance`, `aimBodies`, `aimRecords` before PAGE-AIM-ALLOC ---------------

/* eslint-disable @typescript-eslint/no-explicit-any */
type Internals = {
  remotes: Map<number, any>;
  mountPose: ((id: number) => unknown) | null;
  volumesOf(team: unknown, type: number): StanceVolumes | null;
  escorteeVolumesOf(index: number): StanceVolumes | null;
};
const inside = (rp: RemotePlayers): Internals => rp as unknown as Internals;

function oldBody(rp: RemotePlayers, r: any, s: any): HitBody {
  const i = inside(rp);
  const mounted = HIT_POSE_MOUNT_READING === 'idle' && (i.mountPose?.(r.id) ?? null) !== null;
  if (typeof r.escortee !== 'number' && !mounted) {
    const play = r.play as any, last = play.last;
    if (play.animator && play.skeleton && last) return placedVolumes(last.drawnFeet ?? last.feet, last.yaw, posedBoxes(play.skeleton));
  }
  const volumes = typeof r.escortee === 'number' ? i.escorteeVolumesOf(r.escortee) : i.volumesOf(r.team, r.type);
  return bodyVolumes(s.feet, s.yaw, s.stance, volumes, s.rootTilt, s.peek ?? 0);
}
const live = (r: any): boolean => !!r.snap?.alive && r.view.group.visible;
function oldDistance(rp: RemotePlayers, eye: V3, dir: V3, reach: number): number | null {
  let best: number | null = null;
  for (const r of inside(rp).remotes.values()) {
    if (!live(r)) continue;
    const hit = rayBody(eye, dir, reach, oldBody(rp, r, r.snap));
    if (hit && (best === null || hit.t < best)) best = hit.t;
  }
  return best;
}
function oldBodies(rp: RemotePlayers, eye: V3, dir: V3, reach: number): { id: number; distance: number }[] {
  const out: { id: number; distance: number }[] = [];
  for (const [id, r] of inside(rp).remotes) {
    if (!live(r)) continue;
    const hit = rayBody(eye, dir, reach, oldBody(rp, r, r.snap));
    if (hit) out.push({ id, distance: hit.t });
  }
  return out;
}
function oldRecords(rp: RemotePlayers, eye: V3, dir: V3, reach: number): number[] {
  const out: number[] = [];
  for (const r of inside(rp).remotes.values()) {
    if (!live(r)) continue;
    rayRecords(eye, dir, reach, oldBody(rp, r, r.snap), (_part, t) => { out.push(t); });
  }
  out.sort((a, b) => a - b);
  return out.filter((t, i) => i === 0 || t > out[i - 1]!);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---- the rig ----------------------------------------------------------------------------------------------------------

const I16 = (): Float32Array => Float32Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
const T16 = (x: number, y: number, z: number): Float32Array => Float32Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1);
type Part = { name: string; parent: number; bindLocal: Float32Array; bbox: Float32Array };

/** A LoadedBody of `parts` (bind worlds the identity: the view's skinning inverts them, nothing here reads them). */
function loadedBody(parts: readonly Part[]): LoadedBody {
  return {
    character: 'mp2_seal1', model: 'seal_test', dressedBy: 'character.rdr', textureAsset: 'sealtex',
    parts: parts.map((p) => ({ name: p.name, parent: p.parent, bindLocal: p.bindLocal, bindWorld: I16(), bbox: p.bbox })),
    subMeshes: [{
      textureName: null, fog: false, positions: Float32Array.of(0, 0, 0, 1, 0, 0, 0, 1, 0), normals: Float32Array.of(0, 0, 1, 0, 0, 1, 0, 0, 1),
      uvs: new Float32Array(6), indices: Uint32Array.of(0, 1, 2), skinIndex: new Uint16Array(12), skinWeight: Float32Array.of(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0),
    }],
    fittings: [], missing: [], at: null, height: 19, eye: null, carries: { rifle: null, pistol: null },
    stats: { vertices: 3, triangles: 1, parts: parts.length, subMeshes: 1, batches: 1, maxInfluences: 1, droppedWeight: 0, fittings: 0 },
  } as unknown as LoadedBody;
}

/** A synthetic SEAL: the trunk, the head, the arms and the legs from `skel_root`, each boxed; `body` beside the root. */
function syntheticBody(): LoadedBody {
  const box = (x: number, y0: number, y1: number, z: number): Float32Array => Float32Array.of(-x, y0, -z, x, y1, z);
  return loadedBody([
    { name: 'skel_root', parent: -1, bindLocal: T16(0, 10, 0), bbox: box(2, -1, 1, 2) },
    { name: 'hips', parent: 0, bindLocal: T16(0, 0.5, 0), bbox: box(3, -1.5, 1.5, 2) },
    { name: 'spinelo', parent: 1, bindLocal: T16(0, 2, 0), bbox: box(3, 0, 3, 2) },
    { name: 'spinehi', parent: 2, bindLocal: T16(0, 3, 0), bbox: box(3.5, 0, 3, 2) },
    { name: 'neck', parent: 3, bindLocal: T16(0, 3, 0), bbox: box(1, 0, 1, 1) },
    { name: 'head', parent: 4, bindLocal: T16(0, 1, 0), bbox: box(1.5, 0, 3, 1.5) },
    { name: 'rbicep', parent: 3, bindLocal: T16(3.5, 2, 0), bbox: box(1, -4, 0, 1) },
    { name: 'lbicep', parent: 3, bindLocal: T16(-3.5, 2, 0), bbox: box(1, -4, 0, 1) },
    { name: 'rthigh', parent: 1, bindLocal: T16(1.5, -1, 0), bbox: box(1.2, -5, 0, 1.2) },
    { name: 'lthigh', parent: 1, bindLocal: T16(-1.5, -1, 0), bbox: box(1.2, -5, 0, 1.2) },
    { name: 'body', parent: -1, bindLocal: I16(), bbox: new Float32Array(6) },
  ]);
}

const qx = (deg: number): number[] => { const a = (deg * Math.PI) / 360; return [Math.sin(a), 0, 0, Math.cos(a)]; };
const qy = (deg: number): number[] => { const a = (deg * Math.PI) / 360; return [0, Math.sin(a), 0, Math.cos(a)]; };
/** A looped clip of `frames` keys at 30 a second: the root swaying, a thigh and an arm swinging, the trunk turning. */
function swayClip(name: string, frames: number, rootY: number, amp: number): MotionClip {
  const keys = <T>(f: (i: number) => T): T[] => Array.from({ length: frames + 1 }, (_, i) => f(i === frames ? 0 : i));
  const track = (index: number, partName: string, t: number[][], q: number[][]): MotionPart => ({
    index, name: partName, flags: 0x0c | (q.length === 1 ? 0x10 : 0) | (t.length === 1 ? 0x20 : 0),
    translations: Float32Array.from(t.flat()), rotations: Float32Array.from(q.flat()),
  });
  const s = (i: number): number => Math.sin((2 * Math.PI * i) / frames);
  const parts = [
    track(0, 'skel_root', keys((i) => [0.3 * s(i), rootY + 0.4 * s(i), 0.2 * s(i)]), keys((i) => qy(amp * 0.3 * s(i)))),
    track(1, 'spinehi', [[0, 3, 0]], keys((i) => qy(amp * s(i)))),
    track(2, 'rthigh', [[1.5, -1, 0]], keys((i) => qx(amp * 2 * s(i)))),
    track(3, 'lbicep', [[-3.5, 2, 0]], keys((i) => qx(-amp * 2 * s(i)))),
  ];
  return { name, version: 5, duration: frames / 30, frameCount: frames, rate: 30, unknown10: -1, unknown14: 1, parts };
}
const SYNTHETIC_CLIPS: PlayClips = {
  clips: [swayClip('seal_stand', 24, 10, 12), swayClip('seal_crouch', 18, 6, 9), swayClip('seal_prone', 30, 1.5, 6), swayClip(leanClip('stand', 1), 12, 10, 20)],
  table: null,
};

/** A slope (y = 0.3 x) over the whole map: a prone body tilts on it (PRONE-TILT). */
const SLOPE = 0.3;
function slopeGround() {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, -1000 * SLOPE, -1000, 1000, 1000 * SLOPE, -1000, 1000, 1000 * SLOPE, 1000, -1000, -1000 * SLOPE, 1000]),
  };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  return packGround(params, [floor], owners);
}

const state = (id: number, x: number, z: number, over: Partial<SpawnedBodyState> = {}): SpawnedBodyState => ({
  id, feet: [x, x * SLOPE, z], yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0,
  flags: BodyFlag.Alive, stance: 0, landing: 0, jumps: 0,
  ground: 0, groundForward: 0, groundRight: 0, groundCls: -1, stickSnaps: 0,
  action: 0, actionSerial: 0, actionT: 0, actionSeconds: -1,
  overlay: 0, overlayT: 0, overlaySeconds: 0, turnRate: 0,
  trav: 0, travFrame: 0, travRootY: Number.NaN, travBlend: 0, travBlendWeight: 0, peek: 0, weapon: 255, slot: 0, spawns: 1, ...over,
});

/** The remotes: who they are (ids), and each one's state at frame `f`. */
const IDS = { moving: 2, crouched: 3, prone: 4, leaning: 5, mounted: 6, hostage: 7, dies: 8, turning: 9 } as const;
function bodiesAt(f: number, moving: boolean): SpawnedBodyState[] {
  const sway = Math.sin(f / 7);
  const run = moving ? { ground: 1, groundForward: 1, groundRight: 0.3 * sway, vx: 40 * sway, vz: -60 } : {};
  return [
    state(IDS.moving, -180 + 3 * sway, -200 - 0.5 * f, { yaw: (f * 3) % 360, pitch: 10 * sway, flags: BodyFlag.Alive | BodyFlag.Aiming | BodyFlag.Raised, ...run }),
    state(IDS.crouched, -100, -200, { stance: 1, flags: BodyFlag.Alive | BodyFlag.Crouched, yaw: 20, ...(moving ? { ground: 2, groundForward: 0.6, groundCls: 0, vz: -20 } : {}) }),
    state(IDS.prone, -20, -200, { stance: 2, yaw: 75 }),
    state(IDS.leaning, 60, -200, { yaw: -30, peek: f >= 10 && f < 50 ? 1 : f >= 50 ? -1 : 0 }),
    state(IDS.mounted, 140, -200, { yaw: 180, peek: f % 20 < 10 ? 1 : 0 }),
    state(IDS.hostage, 220, -200, { yaw: 90 }),
    ...(f < 40 ? [state(IDS.dies, 300, -200)] : f < 70 ? [state(IDS.dies, 300, -200, { flags: 0 })] : []),
    state(IDS.turning, 380, -200, { yaw: (360 - f * 5) % 360, turnRate: 4 }),
  ];
}

function rig(body: LoadedBody, clips: PlayClips) {
  const scene = new Scene();
  const map = {
    body, terrorist: null, types: { seal: [body], terrorist: [body], escortees: [body] }, textures: {}, textureFlags: {}, ground: slopeGround(),
  } as unknown as LoadedMap;
  const remote = new RemotePlayers(scene);
  remote.setMap(map, DEFAULT_LIGHTING, () => ({ rifle: { object: new Group(), points: [] }, pistol: { object: new Group(), points: [] } }));
  remote.setClips(clips);
  for (const id of Object.values(IDS)) remote.setTeam(id, 'seal');
  remote.setEscortee(IDS.hostage, 0);
  remote.setMountPose((id) => (id === IDS.mounted ? { clip: 'seal_stand', frame: 3, loop: true, rootY: null } : null));
  const camera = new PerspectiveCamera();
  const DTS = [1 / 60, 1 / 30, 1 / 45];
  let f = 0;
  return { remote, step: (moving: boolean): void => { remote.frame(DTS[f % DTS.length]!, bodiesAt(f, moving), camera); f++; } };
}

/** Eyes and rays: at each body from its side and its front at four heights, and one line across every body. */
function rays(): { eye: V3; dir: V3; reach: number }[] {
  const out: { eye: V3; dir: V3; reach: number }[] = [];
  const unit = (v: number[]): V3 => { const l = Math.hypot(v[0]!, v[1]!, v[2]!); return [v[0]! / l, v[1]! / l, v[2]! / l]; };
  for (const x of [-180, -100, -20, 60, 140, 220, 300, 380]) {
    const y = x * SLOPE;
    for (const h of [1.5, 6, 12, 17]) {
      const side: V3 = [x + 45, y + 14, -200], front: V3 = [x - 6, y + 20, -60];
      out.push({ eye: side, dir: unit([x - side[0], y + h - side[1], -200 - side[2]]), reach: 1000 });
      out.push({ eye: front, dir: unit([x - front[0], y + h - front[1], -200 - front[2]]), reach: h < 10 ? 1000 : 150 });
    }
  }
  for (const h of [2, 9, 15]) out.push({ eye: [-400, -400 * SLOPE + h, -200], dir: unit([1, SLOPE, 0]), reach: 1000 });
  return out;
}

/** Every aim call's answer against the old path's, `Object.is` on every number; the hits seen. */
function compare(remote: RemotePlayers, ray: { eye: V3; dir: V3; reach: number }, where: string): number {
  const { eye, dir, reach } = ray;
  const d = remote.aimDistance(eye, dir, reach), d0 = oldDistance(remote, eye, dir, reach);
  expect(Object.is(d, d0), `${where} aimDistance ${d} vs ${d0}`).toBe(true);
  const b = remote.aimBodies(eye, dir, reach), b0 = oldBodies(remote, eye, dir, reach);
  expect(b.length, `${where} aimBodies length`).toBe(b0.length);
  b.forEach((h, i) => {
    expect(h.id, `${where} aimBodies[${i}].id`).toBe(b0[i]!.id);
    expect(Object.is(h.distance, b0[i]!.distance), `${where} aimBodies[${i}].distance ${h.distance} vs ${b0[i]!.distance}`).toBe(true);
  });
  const rec = remote.aimRecords(eye, dir, reach), rec0 = oldRecords(remote, eye, dir, reach);
  expect(rec.length, `${where} aimRecords length`).toBe(rec0.length);
  rec.forEach((t, i) => expect(Object.is(t, rec0[i]), `${where} aimRecords[${i}] ${t} vs ${rec0[i]}`).toBe(true));
  return rec.length;
}

/** The equality run: `frames` frames, every ray each frame, twice over between two steps (the first call after a step, then again). */
function equalityRun(body: LoadedBody, clips: PlayClips, frames: number, moving: boolean): { records: number; tilted: number } {
  const { remote, step } = rig(body, clips);
  const all = rays();
  let records = 0, tilted = 0;
  for (let f = 0; f < frames; f++) {
    step(moving);
    // the first call after the step, then the whole set again between the same two steps
    for (const r of all) records += compare(remote, r, `frame ${f}`);
    for (let k = all.length - 1; k >= 0; k -= 3) compare(remote, all[k]!, `frame ${f} again`);
    const prone = inside(remote).remotes.get(IDS.prone)?.snap?.rootTilt as number[] | null | undefined;
    if (prone && Math.abs(prone[3]!) < 0.9999) tilted++;
  }
  return { records, tilted };
}

/** The allocation run: warm-up, then the aim calls of `frames` frames counted (the steps between them not). */
function allocationRun(body: LoadedBody, clips: PlayClips, frames: number, moving: boolean): { aim: number[]; step: number[]; calls: number } {
  const { remote, step } = rig(body, clips);
  const all = rays();
  const calls = (): void => {
    for (const r of all) { remote.aimDistance(r.eye, r.dir, r.reach); remote.aimBodies(r.eye, r.dir, r.reach); remote.aimRecords(r.eye, r.dir, r.reach); }
  };
  for (let f = 0; f < 6; f++) { step(moving); calls(); }
  const aim: number[] = [], steps: number[] = [];
  for (let f = 0; f < frames; f++) {
    steps.push(typedArraysMade(() => step(moving)));
    aim.push(typedArraysMade(calls));
  }
  return { aim, step: steps, calls: all.length * 3 };
}

const REMOTES_DRAWN = 6;   // moving, crouched, prone, leaning, dies (until it is gone), turning: the drawn copies

describe('PAGE-AIM-ALLOC on a synthetic SEAL: the aim path answers as the per-call build did, and builds nothing per call', () => {
  const body = syntheticBody();

  it("every aimDistance, aimBodies and aimRecords answer is the per-call build's (Object.is), every frame, first call and later ones", () => {
    const { records } = equalityRun(body, SYNTHETIC_CLIPS, 90, false);
    console.log(`  Tests (PAGE-AIM-ALLOC synthetic equality) records compared: ${records}`);
    expect(records).toBeGreaterThan(100);                                  // the rays meet the bodies
  });

  it("Play.drawnBody: one body between two steps (the same object), refreshed by the step", () => {
    const { remote, step } = rig(body, SYNTHETIC_CLIPS);
    step(false);
    const play = inside(remote).remotes.get(IDS.moving)!.play;
    const a = play.drawnBody();
    expect(a).not.toBeNull();
    expect(play.drawnBody()).toBe(a);
    const w = Float32Array.from(a.boxes[0].w as ArrayLike<number>);
    step(false);
    const b = play.drawnBody();
    expect(b.boxes[0].w).not.toEqual(w);                                   // the step's pose, not the last one's
  });

  it('after a warm-up, a frame of aim calls for every remote makes no Float32Array or Float64Array', () => {
    const { aim, step, calls } = allocationRun(body, SYNTHETIC_CLIPS, 8, false);
    console.log(`  Tests (PAGE-AIM-ALLOC synthetic alloc) aim calls/frame ${calls}, typed arrays per frame of aim calls: ${aim.join(',')}; per step (not held, measured): ${step.join(',')}`);
    expect(aim).toEqual(aim.map(() => 0));
  });
});

const MP2 = fixture('RUN/MP2.ZDB'), PACK = fixture('RUN/MOTION_P.ZAR'), READERC = fixture('RUN/READERC.ZAR');

describe.skipIf(!MP2 || !PACK || !READERC)(`PAGE-AIM-ALLOC on the fixture disc's SEAL and motion${MP2 && PACK && READERC ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const seal = MP2 && PACK && READERC ? simSkeletonsFromBytes(MP2, READERC, PACK).seal[0] ?? null : null;
  const sk = seal?.skeleton;
  const body = sk ? loadedBody(sk.parts.map((p) => ({ name: p.name, parent: p.parent, bindLocal: p.bindLocal, bbox: p.bbox }))) : null;
  const names = [...new Set([...HIT_POSE_CLIPS, ...(['stand', 'crouch', 'prone'] as const).flatMap((k) => [leanClip(k, -1), leanClip(k, 1)])])];
  const table = READERC ? motionTableFromArchive(READERC) : null;
  const clips: PlayClips = { clips: PACK ? clipsFromPack(PACK, names) : [], table: table ? [...table] : null };

  it("moving, crouched, prone on a slope, leaning, mounted, a hostage, dying, turning: every answer the per-call build's (Object.is), every frame", () => {
    const { records, tilted } = equalityRun(body!, clips, 120, true);
    console.log(`  Tests (PAGE-AIM-ALLOC fixture equality) records compared: ${records}; frames with the prone body tilted: ${tilted}`);
    expect(records).toBeGreaterThan(100);
    expect(tilted).toBeGreaterThan(0);                                     // the prone copy's root tilt is in its pose
  });

  it('after a warm-up, a frame of aim calls for every remote makes no Float32Array or Float64Array', () => {
    const { aim, step, calls } = allocationRun(body!, clips, 8, true);
    console.log(`  Tests (PAGE-AIM-ALLOC fixture alloc) remotes drawn ~${REMOTES_DRAWN}, aim calls/frame ${calls}, typed arrays per frame of aim calls: ${aim.join(',')}; per step (not held, measured): ${step.join(',')}`);
    expect(aim).toEqual(aim.map(() => 0));
  });

  it("the stance volumes' cast without a drawn body (bodyNearest, bodyRecords) is rayBody's and rayRecords' on bodyVolumes, tilted and leaning, exactly", () => {
    const volumes: StanceVolumes = stanceVolumes(seal!);
    const tilts: (number[] | null)[] = [null, [0, 0, 0, 1], [Math.sin(0.15), 0, 0, Math.cos(0.15)], [0, 0, Math.sin(-0.2), Math.cos(-0.2)], [0.1, 0.05, -0.12, Math.sqrt(1 - 0.01 - 0.0025 - 0.0144)]];
    // `bodyNearest` is PAGE-AIM-ALLOC's (reached through the module: absent at the base, this check alone fails there)
    const bodyNearest = (hitVolumes as unknown as Record<string, unknown>).bodyNearest as typeof hitVolumes.bodyNearest;
    expect(typeof bodyNearest).toBe('function');
    const feet = [10, 2, -40], yaw = 35;
    const unit = (v: number[]): V3 => { const l = Math.hypot(v[0]!, v[1]!, v[2]!); return [v[0]! / l, v[1]! / l, v[2]! / l]; };
    const around: { eye: V3; dir: V3; reach: number }[] = [];
    for (let a = 0; a < 360; a += 30) for (const h of [0.8, 4, 9, 13, 17]) for (const off of [-1.5, 0, 2.5]) {
      const r = (a * Math.PI) / 180, eye: V3 = [feet[0]! + 60 * Math.cos(r), feet[1]! + 12, feet[2]! + 60 * Math.sin(r)];
      around.push({ eye, dir: unit([feet[0]! + off - eye[0], feet[1]! + h - eye[1], feet[2]! - off - eye[2]]), reach: a % 60 ? 1000 : 59 });
    }
    let records = 0;
    for (const posture of ['stand', 'crouch', 'prone'] as const) for (const peek of [-1, 0, 1] as const) for (const tilt of tilts) {
      for (const { eye, dir, reach } of around) {
        const want: [number, number, number][] = [], got: [number, number, number][] = [];
        rayRecords(eye, dir, reach, bodyVolumes(feet, yaw, posture, volumes, tilt, peek), (part, t, bone) => { want.push([part, t, bone]); });
        bodyRecords(eye, dir, reach, feet, yaw, posture, volumes, tilt, peek, (part, t, bone) => { got.push([part, t, bone]); });
        expect(got.length).toBe(want.length);
        got.forEach((g, i) => g.forEach((v, k) => expect(Object.is(v, want[i]![k])).toBe(true)));
        const near = bodyNearest(eye, dir, reach, feet, yaw, posture, volumes, tilt, peek);
        expect(Object.is(near, rayBody(eye, dir, reach, bodyVolumes(feet, yaw, posture, volumes, tilt, peek))?.t ?? null)).toBe(true);
        records += want.length;
      }
    }
    console.log(`  Tests (PAGE-AIM-ALLOC fixture idle cast) records compared: ${records}`);
    expect(records).toBeGreaterThan(50);
  });
});

// ---- the review's M5: bounds kept from an earlier pose ---------------------------------------------------------------

/**
 * A synthetic SEAL whose left arm is long (12: a hand reaching over the head) and a stand clip that raises it from
 * hanging down (frame 0) to straight up (half the loop) and back: up, its box reaches 29.5 over the soles, 9.5 over
 * `BODY_CULL_BOX`'s top (the bone-boxes fold measured hands up to 10.14 over it letting go of a hang), the rest of the
 * body under 22.5. Synthetic: no value of the game's.
 */
function reachingBody(): LoadedBody {
  const box = (x: number, y0: number, y1: number, z: number): Float32Array => Float32Array.of(-x, y0, -z, x, y1, z);
  return loadedBody([
    { name: 'skel_root', parent: -1, bindLocal: T16(0, 10, 0), bbox: box(2, -1, 1, 2) },
    { name: 'hips', parent: 0, bindLocal: T16(0, 0.5, 0), bbox: box(3, -1.5, 1.5, 2) },
    { name: 'spinelo', parent: 1, bindLocal: T16(0, 2, 0), bbox: box(3, 0, 3, 2) },
    { name: 'spinehi', parent: 2, bindLocal: T16(0, 3, 0), bbox: box(3.5, 0, 3, 2) },
    { name: 'neck', parent: 3, bindLocal: T16(0, 3, 0), bbox: box(1, 0, 1, 1) },
    { name: 'head', parent: 4, bindLocal: T16(0, 1, 0), bbox: box(1.5, 0, 3, 1.5) },
    { name: 'rbicep', parent: 3, bindLocal: T16(3.5, 2, 0), bbox: box(1, -4, 0, 1) },
    { name: 'lbicep', parent: 3, bindLocal: T16(-3.5, 2, 0), bbox: box(1, -12, 0, 1) },
    { name: 'rthigh', parent: 1, bindLocal: T16(1.5, -1, 0), bbox: box(1.2, -5, 0, 1.2) },
    { name: 'lthigh', parent: 1, bindLocal: T16(-1.5, -1, 0), bbox: box(1.2, -5, 0, 1.2) },
    { name: 'body', parent: -1, bindLocal: I16(), bbox: new Float32Array(6) },
  ]);
}
function raiseClip(name: string, frames: number): MotionClip {
  const keys = <T>(f: (i: number) => T): T[] => Array.from({ length: frames + 1 }, (_, i) => f(i === frames ? 0 : i));
  const track = (index: number, partName: string, t: number[][], q: number[][]): MotionPart => ({
    index, name: partName, flags: 0x0c | (q.length === 1 ? 0x10 : 0) | (t.length === 1 ? 0x20 : 0),
    translations: Float32Array.from(t.flat()), rotations: Float32Array.from(q.flat()),
  });
  const parts = [
    track(0, 'skel_root', [[0, 10, 0]], [[0, 0, 0, 1]]),
    track(1, 'lbicep', [[-3.5, 2, 0]], keys((i) => qx(90 * (1 - Math.cos((2 * Math.PI * i) / frames))))),
  ];
  return { name, version: 5, duration: frames / 30, frameCount: frames, rate: 30, unknown10: -1, unknown14: 1, parts };
}

describe('PAGE-AIM-ALLOC: a limb posed past BODY_CULL_BOX after the first refresh (the review\'s M5: bounds kept stale)', () => {
  it("a line over the cull box's top that only the raised arm crosses: refused at the first refresh's pose, recorded once the arm is up, the cached path the per-call build's (Object.is)", () => {
    const remote = new RemotePlayers(new Scene());
    const body = reachingBody();
    const map = {
      body, terrorist: null, types: { seal: [body], terrorist: [body], escortees: [body] }, textures: {}, textureFlags: {}, ground: slopeGround(),
    } as unknown as LoadedMap;
    remote.setMap(map, DEFAULT_LIGHTING, () => ({ rifle: { object: new Group(), points: [] }, pistol: { object: new Group(), points: [] } }));
    remote.setClips({ clips: [raiseClip('seal_stand', 60), raiseClip('seal_crouch', 60), raiseClip('seal_prone', 60)], table: null });
    const ID = 2;
    remote.setTeam(ID, 'seal');
    const camera = new PerspectiveCamera();
    const DTS = [1 / 60, 1 / 30, 1 / 45];
    const r = inside(remote).remotes;
    let hitFrames = 0, records = 0, firstCulledByPose = false;
    for (let f = 0; f < 90; f++) {
      remote.frame(DTS[f % DTS.length]!, [state(ID, 0, -200)], camera);
      const rr = r.get(ID)!;
      const old = oldBody(remote, rr, rr.snap);
      expect(old.boxes, `frame ${f}: a drawn body`).not.toBeNull();
      // the line in the body's frame: x -3.5 (the arm), y 26 (over the box's 20 and the head's 22.5), z -30 to 30
      const rad = (old.yaw * Math.PI) / 180, c = Math.cos(rad), s = Math.sin(rad);
      const toWorld = (px: number, py: number, pz: number): V3 => [old.feet[0]! + px * c + pz * s, old.feet[1]! + py, old.feet[2]! - px * s + pz * c];
      const eye = toWorld(-3.5, 26, -30), dir: V3 = [s, 0, c], reach = 60;
      // (a) the cull box alone refuses the line, every frame
      expect(bodyCulled(eye, dir, reach, old.feet, old.yaw), `frame ${f}: past BODY_CULL_BOX`).toBe(true);
      // (b) the per-call build: its records
      const want: [number, number, number][] = [];
      rayRecords(eye, dir, reach, old, (part, t, bone) => { want.push([part, t, bone]); });
      if (f === 0) {
        // the first refresh's pose: the arm down, the posed bounds refuse the line too (bounds kept from here would refuse it later)
        expect(want, 'frame 0: the arm down, no record').toEqual([]);
        firstCulledByPose = bodyCulled(eye, dir, reach, old.feet, old.yaw, boxBounds(old.boxes!, new Float64Array(6)));
      }
      if (want.length) hitFrames++;
      records += want.length;
      // (c) the cached path: Play.drawnBody's records, and every aim call, the per-call build's
      const got: [number, number, number][] = [];
      rayRecords(eye, dir, reach, rr.play.drawnBody(), (part, t, bone) => { got.push([part, t, bone]); });
      expect(got.length, `frame ${f}: drawnBody records`).toBe(want.length);
      got.forEach((g, i) => g.forEach((v, k) => expect(Object.is(v, want[i]![k]), `frame ${f}: record ${i}[${k}] ${v} vs ${want[i]![k]}`).toBe(true)));
      compare(remote, { eye, dir, reach }, `frame ${f}`);
    }
    console.log(`  Tests (PAGE-AIM-ALLOC raised arm) frames with records: ${hitFrames}/90, records compared: ${records}`);
    expect(firstCulledByPose).toBe(true);
    expect(hitFrames).toBeGreaterThan(5);
  });
});

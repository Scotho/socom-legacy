import { describe, expect, it } from 'vitest';
import { IDENTITY, partMatrix, Skeleton, type MotionClip, type MotionPart, type SkeletonPart } from '@s2u/scene';
import { Animator, type MoverSnapshot } from '../src/animator';
import type { MotionEntry } from '../src/motionTable';
import type { GroundMotion } from '../src/walk';

/**
 * CPS bodies (b) (the client performance sprint's Log, 2026-11-03T02:52Z (B); a product-track adaptation, the same
 * values): `Animator.step` writes each part's local through one scratch matrix the animator owns (`partMatrixInto`;
 * `Skeleton.setLocal` copies it) and the skeleton composes through its own -- no Float32Array per part per pass. The
 * reference is the old code's output over a scripted run (a start, a run with the aim pitched and turning, the head look,
 * a cross-fade, a crouch), every local and world matrix of every step hashed bit for bit: `GOLDEN` was taken from the
 * code before the change (base 2c202496d).
 */

function countFloat32(run: () => void): number {
  const real = globalThis.Float32Array;
  let made = 0;
  globalThis.Float32Array = new Proxy(real, {
    construct(target, args) { made++; return Reflect.construct(target, args); },
  });
  try { run(); } finally { globalThis.Float32Array = real; }
  return made;
}

const Q_ID: [number, number, number, number] = [0, 0, 0, 1];
const qx = (deg: number): [number, number, number, number] => { const a = (deg * Math.PI) / 360; return [Math.sin(a), 0, 0, Math.cos(a)]; };
const qy = (deg: number): [number, number, number, number] => { const a = (deg * Math.PI) / 360; return [0, Math.sin(a), 0, Math.cos(a)]; };

function clip(name: string, frames: number, parts: { name: string; t: number[][]; q: number[][] }[]): MotionClip {
  const mparts: MotionPart[] = parts.map((p, index) => ({
    index, name: p.name, flags: 0x0c | (p.q.length === 1 ? 0x10 : 0) | (p.t.length === 1 ? 0x20 : 0),
    translations: Float32Array.from(p.t.flat()), rotations: Float32Array.from(p.q.flat()),
  }));
  return { name, version: 5, duration: frames / 30, frameCount: frames, rate: 30, unknown10: -1, unknown14: 1, parts: mparts };
}
const keys = <T>(frames: number, f: (i: number) => T): T[] => Array.from({ length: frames + 1 }, (_, i) => f(i === frames ? 0 : i));
function walker(name: string, frames: number, speed: number, legDeg: number, rootY = 11): MotionClip {
  return clip(name, frames, [
    { name: 'skel_root', t: keys(frames, (i) => [0.5, rootY, 20 - (speed / 30) * i]), q: [Q_ID] },
    { name: 'lthigh', t: [[1, -1, 0]], q: keys(frames, (i) => qx(legDeg * i)) },
    { name: 'spinelo', t: [[0, 2, 0]], q: keys(frames, (i) => qy(i * 0.7)) },
    { name: 'spinehi', t: [[0, 3, 0]], q: [qx(3)] },
  ]);
}
function pose(name: string, frames: number, legDeg: number, rootY = 11): MotionClip {
  return clip(name, frames, [{ name: 'skel_root', t: [[0.5, rootY, 20]], q: [Q_ID] }, { name: 'lthigh', t: [[1, -1, 0]], q: [qx(legDeg)] },
    { name: 'spinelo', t: [[0, 2, 0]], q: [qy(2)] }]);
}
function skeleton(): Skeleton {
  const part = (index: number, name: string, parent: number, t: number[]): SkeletonPart => ({
    index, name, parent, bindLocal: partMatrix(Q_ID, t as [number, number, number]), bbox: new Float32Array(6), type: 0, flags: 0,
  });
  return new Skeleton('test', IDENTITY, [
    part(0, 'skel_root', -1, [0, 11.5, 0.5]), part(1, 'lthigh', 0, [1, -1, 0]), part(2, 'spinelo', 0, [0, 2, 0]),
    part(3, 'spinehi', 2, [0, 3, 0]), part(4, 'neck', 3, [0, 2, 0]), part(5, 'head', 4, [0, 1.5, 0.2]),
    part(6, 'lbicep', 3, [2, 1, 0]), part(7, 'body', -1, [0, 0, 0]),
  ]);
}
const entry = (e: Partial<MotionEntry>): MotionEntry => ({
  looped: null, playback: null, maxVelocity: null, blendTime: null, transitionA: null, transitionB: null, noInterrupt: null, callbacks: [], ...e,
});
const cycle = (maxVelocity: number, a: number, b: number): MotionEntry => entry({ looped: true, playback: 1, maxVelocity, transitionA: a, transitionB: b });
function kit(): { clips: MotionClip[]; table: Map<string, MotionEntry> } {
  const clips = [
    pose('seal_stand', 16, 0), walker('seal_walk_alert', 16, 32, 2), walker('seal_jog_alert', 18, 47, 3), walker('seal_run', 19, 57.7, 4),
    pose('seal_crouch', 16, 30, 7), walker('seal_crouch_walk', 16, 20, 2, 7),
  ];
  const table = new Map<string, MotionEntry>([
    ['seal_stand', entry({ looped: true, playback: 6, maxVelocity: -0.1, blendTime: 0.5 })],
    ['seal_walk_alert', cycle(6.5, 0, 4)], ['seal_jog_alert', cycle(6.5, 2, 6.15)], ['seal_run', cycle(6.5, 4.01, 6.5)],
    ['seal_crouch', entry({ looped: true, playback: 6, maxVelocity: -0.1, blendTime: 0.4 })], ['seal_crouch_walk', cycle(3, 0, 3)],
  ]);
  return { clips, table };
}
const IDLE: GroundMotion = { state: 'idle', forward: 0, right: 0, cls: -1 };
const REST: MoverSnapshot = { vx: 0, vz: 0, vy: 0, yaw: 0, airborne: false, crouched: false, landing: null, jumps: 0, stance: 'stand', ground: IDLE, action: null };

/** The scripted run: 150 steps of 1/60 s. */
function moverAt(k: number): MoverSnapshot {
  if (k < 20) return { ...REST, pitch: 0, aimWeight: 1 };
  if (k < 70) {
    const f = Math.min(1, (k - 20) / 20);
    return { ...REST, vz: -65 * f, yaw: k * 1.5, turnRate: 0.8, pitch: -20 + k * 0.4, aimWeight: 1, ground: { state: 'stand', forward: f, right: 0.2, cls: 1 } };
  }
  if (k < 100) return { ...REST, pitch: 10, aimWeight: 0, turnRate: k % 7 === 0 ? 0.5 : 0 };
  if (k < 125) return { ...REST, crouched: true, stance: 'crouch', pitch: 5, aimWeight: 1, ground: { state: 'crouch', forward: 0, right: 0, cls: -1 } };
  return { ...REST, crouched: true, stance: 'crouch', vz: -20, pitch: -5, aimWeight: 1, turnRate: -0.4, ground: { state: 'crouch', forward: 1, right: 0, cls: 1 } };
}

/** FNV-1a over the bits of every local and world matrix. */
function hash(s: Skeleton, h: number): number {
  for (const set of [s.local, s.world]) {
    for (const m of set) {
      const u = new Uint32Array(m.buffer, m.byteOffset, 16);
      for (let i = 0; i < 16; i++) { h ^= u[i]!; h = Math.imul(h, 0x01000193) >>> 0; }
    }
  }
  return h;
}

/** Taken from the code before the change (base 2c202496d): the run's hash, every step's matrices. */
const GOLDEN = 'a19e8481';

describe('CPS bodies (b): the animator poses through scratch matrices, the same bits', () => {
  it("the scripted run's every matrix the old code's, and no Float32Array made by a step", () => {
    const { clips, table } = kit();
    const s = skeleton();
    const anim = new Animator(s, clips, table, { random: () => 0.25 });
    const kept = [...s.local, ...s.world];
    let h = 0x811c9dc5, made = 0;
    for (let k = 0; k < 150; k++) {
      made += countFloat32(() => anim.step(1 / 60, moverAt(k)));
      h = hash(s, h);
    }
    expect([...s.local, ...s.world].every((m, i) => m === kept[i])).toBe(true);   // the arrays a caller holds, the same
    expect(h.toString(16)).toBe(GOLDEN);
    expect(made).toBe(0);
  });
});

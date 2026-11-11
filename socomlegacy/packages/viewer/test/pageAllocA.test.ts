import { describe, expect, it, vi } from 'vitest';
import { Mesh, PerspectiveCamera, type Group } from 'three';
import type { ParticleSource } from '@s2u/scene';
import { ParticleSystem } from '../src/particles';
import { AT_REST, DEFAULT_MODEL, hudLayout, type HudModel, type HudTiming } from '../src/hud';
import { ParticleSystem as ParticleSystemBase } from './frozen/particlesBase';
import { hudLayoutBase } from './frozen/hudLayoutBase';

/**
 * PAGE-ALLOC-A (LATER 867 (A); a CPU-side browser adaptation, product track while every output is bit-identical): the
 * viewer's two items of shadow's X2c allocation profile -- `particles.ts`' draw (`fill` / `streak`: new `Vector3`s, clones,
 * corner tuples a streaked particle a frame) and `hud.ts`' `hudLayout` (its per-glyph temporaries) -- moved onto owned
 * scratch. The contract is the same output: each pin holds the reworked code to its copy at agent/v0419 3a8fa1ba85
 * (`./frozen/particlesBase`, `./frozen/hudLayoutBase`), every number by `Object.is`.
 *
 * `three`'s `Vector3` is replaced here by a subclass that counts its constructions (a `clone` too: `new this.constructor`)
 * -- the same class in every other respect -- so the particle draw's allocations are counted, not inferred.
 */

const made = vi.hoisted(() => ({ vectors: 0 }));
vi.mock('three', async (importOriginal) => {
  const three = await importOriginal<typeof import('three')>();
  class CountingVector3 extends three.Vector3 {
    constructor(x?: number, y?: number, z?: number) { super(x, y, z); made.vectors++; }
  }
  return { ...three, Vector3: CountingVector3 };
});

function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- particles ---------------------------------------------------------------------------------------------------

/** A source of `type` (0 square, 1 rotated, 2 flat, 3 streaked) placed at `at`, its velocities, colours and fades varied. */
function source(name: string, type: number, at: [number, number, number], over: Partial<ParticleSource> = {}): ParticleSource {
  return {
    flagsA: 0x4 | 0x80, flagsB: 0, name, setActive: true, node: -1, follow: false, perEvent: 2, events: -1,
    interval: 0.02, perDistance: false, type, streak: type === 3 ? [1.5, 0.25] : null,
    spin: type === 1 ? { spin: [-2, 2], accel: [-1, 1] } : null, offset: at, baseVelocity: [0, 0, 0],
    worldVelocity: [1, 3, -2], baseFrom: 'fixed', worldFrom: 'fixed', baseScale: 0, worldScale: 1, baseUnit: false, worldUnit: false,
    atContext: false, atNode: false, positionBlock: null, randomVelocity: [[-4, 4], [0, 6], [-4, 4]], box: [[-1, 1], [0, 0.5], [-1, 1]],
    accel: [0, -9, 0], friction: type === 0 ? 0.3 : 0, size: [0.2, 0.9], startAge: [0, 0.1], lifetime: [0.8, 2.5], nearFade: null, farFade: null,
    textures: [], textureMode: 'first', texture: null, colours: [], scales: [], ...over,
  };
}

const SOURCES: ParticleSource[] = [
  source('sparks', 3, [2, 1, -3], { texture: 'spark.tif' }),
  source('sparks_still', 3, [-2, 1, 3], { worldVelocity: [0, 0, 0], randomVelocity: [[0, 0], [0, 0], [0, 0]], accel: [0, 0, 0], texture: 'spark.tif' }),
  source('rain', 3, [0, 8, 0], { worldVelocity: [0, -45, 0], accel: [0, -95, 0], streak: null, texture: 'rain.tif', friction: 0.1 }),
  source('puffs', 0, [1, 0, 1], { texture: 'puff.tif', colours: [[0, 1, 0.5, 0.25, 1], [1, 0.2, 0.2, 0.2, 0]], scales: [[0, 1], [1, 3]], farFade: [8, 30], nearFade: [0.5, 2] }),
  source('turning', 1, [-3, 2, -1], { texture: 'puff.tif' }),
  source('rings', 2, [0, 0, 4], { texture: 'ring.tif' }),
  source('bare', 0, [3, 3, 3]),
];

/** Every particle batch's draw state: its name, whether drawn, order, range, buffers and bounds. */
function drawn(ps: { object: Group }): (string | number | boolean)[] {
  const out: (string | number | boolean)[] = [];
  for (const m of ps.object.children) {
    if (!(m instanceof Mesh)) continue;
    const g = m.geometry;
    out.push(m.name, m.visible, m.renderOrder, g.drawRange.start, g.drawRange.count);
    for (const key of ['position', 'uv', 'color']) {
      const a = g.getAttribute(key);
      if (a) out.push(key, ...Array.from(a.array as Float32Array));
    }
    const s = g.boundingSphere;
    if (s) out.push('sphere', s.center.x, s.center.y, s.center.z, s.radius);
  }
  return out;
}

/** The eyes: several places and turns, one moving each frame. */
function eye(frame: number): PerspectiveCamera {
  const c = new PerspectiveCamera(60, 16 / 9, 0.1, 500);
  const k = frame % 4;
  if (k === 0) c.position.set(0, 2, 12);
  else if (k === 1) c.position.set(10 * Math.cos(frame * 0.3), 4, 10 * Math.sin(frame * 0.3));
  else if (k === 2) c.position.set(0.5, 30, 0.1);                       // looking down the rain's travel
  else c.position.set(-6, -1, -8);
  c.lookAt(0, 1, 0);
  c.updateMatrixWorld(true);
  return c;
}

function runBoth(withPass: boolean, frames: number, check: (frame: number, got: unknown[], want: unknown[]) => void): void {
  const head = new ParticleSystem(prng(0xa1)), base = new ParticleSystemBase(prng(0xa1));
  if (withPass) {
    // A fixed alpha pass: the batches are split by range into several buckets (LATER 593).
    const pass = { keys: () => Float64Array.from([900, 400, 150, 60, 20, 5, 1]) };
    head.setAlphaPass(pass); base.setAlphaPass(pass);
  }
  for (const s of SOURCES) {
    head.emit(s, null, {}, 'run', () => true, null, null);
    base.emit(s, null, {}, 'run', () => true, null, null);
  }
  for (let f = 0; f < frames; f++) {
    const dt = f % 3 === 0 ? 1 / 30 : f % 3 === 1 ? 1 / 144 : 1 / 60;
    const camera = eye(f);
    head.update(dt, camera);
    base.update(dt, camera);
    check(f, drawn(head), drawn(base));
  }
}

function firstDifference(got: unknown[], want: unknown[]): string | null {
  if (got.length !== want.length) return `length ${got.length} != ${want.length}`;
  for (let i = 0; i < want.length; i++) if (!Object.is(got[i], want[i])) return `@${i}: ${String(got[i])} != ${String(want[i])}`;
  return null;
}

describe('PAGE-ALLOC-A item 2: the particle draw writes from owned scratch', () => {
  it('pin: 90 frames of streaked (moving and still), square, rotated and flat particles from four eyes, every buffer identical', () => {
    for (const withPass of [false, true]) {
      const bad: string[] = [];
      let numbers = 0;
      runBoth(withPass, 90, (f, got, want) => {
        numbers += want.length;
        const d = firstDifference(got, want);
        if (d) bad.push(`pass ${withPass} frame ${f}: ${d}`);
      });
      expect(bad).toEqual([]);
      // eslint-disable-next-line no-console
      console.log(`  Tests (PAGE-ALLOC-A item 2) pin, alpha pass ${withPass}: ${numbers} numbers compared over 90 frames`);
      expect(numbers).toBeGreaterThan(10000);
    }
  });

  it('allocation: no Vector3 made by a frame\'s draw once the batches are grown (counted; base: 9 a streaked particle + 3)', () => {
    const ps = new ParticleSystem(prng(0xb2));
    // Every source's spawns spent in the warm-up (a fixed count, long-lived), so no batch grows in the window.
    for (const s of SOURCES) ps.emit({ ...s, events: 6, lifetime: [50, 60], startAge: [0, 0] }, null, {}, 'run', () => true, null, null);
    const eyes = Array.from({ length: 60 }, (_, f) => eye(f));   // made before the count: a camera makes its own vectors
    for (let f = 0; f < 30; f++) ps.update(1 / 30, eyes[f]!);
    const streaked = (ps as unknown as { particles: { source: ParticleSource }[] }).particles.filter((p) => p.source.type === 3).length;
    const before = made.vectors;
    for (let f = 30; f < 60; f++) ps.update(1 / 60, eyes[f]!);
    const count = made.vectors - before;
    // eslint-disable-next-line no-console
    console.log(`  Tests (PAGE-ALLOC-A item 2) Vector3s made over 30 draws of ${ps.count()} particles (${streaked} streaked): ${count}`);
    expect(streaked).toBeGreaterThan(0);
    expect(count).toBe(0);
  });
});

// ---- hudLayout ---------------------------------------------------------------------------------------------------

const SIZES: Record<string, { width: number; height: number }> = {
  'newweapnbkrnd.tif': { width: 128, height: 64 }, 'm4carbine_icon.tif': { width: 128, height: 32 },
  'firemode.tif': { width: 32, height: 16 }, 'compass_lo.tif': { width: 128, height: 128 },
  'font_text_01.tif': { width: 512, height: 128 }, 'font_special_01.tif': { width: 256, height: 128 },
  'action_climb.tif': { width: 64, height: 64 }, 'action_x.tif': { width: 32, height: 32 }, 'action_door_open.tif': { width: 64, height: 64 },
  'ret_triangle.tif': { width: 16, height: 16 }, 'ret_nav.tif': { width: 16, height: 16 }, 'ret_bomb.tif': { width: 16, height: 16 },
  'ret_base.tif': { width: 16, height: 16 }, 'firemode_203_frag.tif': { width: 32, height: 16 },
  'voice_icon.tif': { width: 32, height: 32 }, 'voice_talk.tif': { width: 32, height: 32 }, white: { width: 1, height: 1 },
};
const FRAMES = [{ width: 640, height: 448 }, { width: 1280, height: 720 }, { width: 1920, height: 1080 }, { width: 1600, height: 896 }, { width: 0, height: 0 }];
const TIMINGS: HudTiming[] = [
  AT_REST,
  { fade: 0.5, stance: 1, pulse: 0.7, marks: 0.3, help: 0.5, voice: { icon: 0.2, talk: 0.9 }, actionAlpha: [0.5, 0.2, 0.1] },
  { fade: 0, stance: 0.4, pulse: 1, help: 0 },
];
const m = (over: Partial<HudModel>): HudModel => ({ ...DEFAULT_MODEL, ...over });
const MODELS: HudModel[] = [
  m({}),
  m({ health: 0.6, name: 'ALPHA', tag: 'S2U', infoNumber: { count: 7, master: true }, stance: 'crouch', yaw: 37 }),
  m({ banner: [{ alpha: 1, lines: [{ text: 'TAUNT', scale: 0.9, rgb: [1, 0.5, 0.5], opacity: 100 / 128 }] }, { alpha: 0.4, lines: [{ text: 'SEALS WIN', scale: 1 }] }], message: 'ROUND 2' }),
  m({ zoom: 2.5, range: 143.7, binoculars: true }),
  m({ zoom: 4, range: null, fireModeIcon: 'firemode_203_frag.tif', fireMode: 'auto' }),
  m({ fireModeRow: false, spare: 1, magsHidden: false, rounds: 0, capacity: 1 }),
  m({ action: 'climb', actionColour: 'green', actionSides: [{ prompt: 'door', colour: 'green' }, { prompt: 'knife', colour: 'green' }], actionCaption: 'VICTORY DANCE' }),
  m({ holdBar: { fill: 0.37 } }),
  m({ holdBar: { fill: 0.8, fade: 64 }, c4FuseBar: { fill: 0.5 } }),
  m({ c4FuseBar: { fill: 0.25 }, defuseTimer: 12.4 }),
  m({ voice: { icon: 'voice_icon.tif', count: '4', name: 'BRAVO', talk: 'voice_talk.tif', right: '3' } }),
  m({ teamTags: { points: [{ id: 2, text: 'BRAVO', alpha: 128, u: 0.4, y: 200 }, { id: 3, text: 'CHARLIE', alpha: 60, u: 0.45, y: 205 }], holder: 2, self: 1 } }),
  m({ teamTags: { points: [{ id: 2, text: 'DELTA', alpha: 100, u: 0.7, y: 150 }], holder: null, self: 1, scale: 1.1 }, teammateNames: false }),
  m({ position: [0, 0], navPoints: [{ name: 'Charlie', x: 0, z: 30 }, { name: 'Far', x: 500, z: -300 }], extraMarks: [{ bitmap: 'ret_bomb.tif', x: 0, z: -100 }, { bitmap: 'ret_base.tif', x: -400, z: 0, type: 2, pulse: true }] }),
  m({ spectator: { path: 'spectator', followed: { name: 'BRAVO', health: 0.5 }, stats: { kills: 3, deaths: 1, headshots: null, score: 7 } } }),
  m({ spectator: { path: 'spectator', followed: null, stats: null } }),
  m({ spectator: { path: 'teammate', followed: { name: 'CHARLIE', health: 1 }, stats: null, weaponIcon: 'm4carbine_icon.tif', help: ['LINE ONE', 'LINE TWO'] } }),
  m({ spectator: { path: 'own', followed: null, stats: null, help: ['PRESS X', 'RESPAWN'] } }),
  m({ textLine: { text: 'HELLO TEAM', box: 90, ink: 120 }, fader: 0.4 }),
  m({ textLine: { text: '', box: 0, ink: 0 }, fader: 1, rangeReadout: true, range: 88 }),
];

describe('PAGE-ALLOC-A item 5: hudLayout without its per-glyph temporaries', () => {
  it('pin: 20 models x 3 timings x 5 frames, the quads and rects identical to the base code (Object.is on every number)', () => {
    const bad: string[] = [];
    let quads = 0;
    for (const frame of FRAMES) for (const timing of TIMINGS) MODELS.forEach((model, i) => {
      const got = hudLayout(frame, model, SIZES, timing), want = hudLayoutBase(frame, model, SIZES, timing);
      const at = `model ${i} ${frame.width}x${frame.height} ${JSON.stringify(timing)}`;
      if (!Object.is(got.scale, want.scale)) bad.push(`${at}: scale`);
      if (got.quads.length !== want.quads.length) { bad.push(`${at}: ${got.quads.length} quads != ${want.quads.length}`); return; }
      quads += want.quads.length;
      got.quads.forEach((q, k) => {
        const w = want.quads[k]!;
        const keys = Object.keys(w);
        if (Object.keys(q).join() !== keys.join()) bad.push(`${at} #${k}: keys ${Object.keys(q).join()} != ${keys.join()}`);
        for (const key of keys) {
          const a = (q as unknown as Record<string, unknown>)[key], b = (w as unknown as Record<string, unknown>)[key];
          if (Array.isArray(b)) {
            if (!Array.isArray(a) || a.length !== b.length || b.some((x, j) => !Object.is(x, a[j]))) bad.push(`${at} #${k}.${key}`);
          } else if (!Object.is(a, b)) bad.push(`${at} #${k}.${key}: ${String(a)} != ${String(b)}`);
        }
      });
      const rk = Object.keys(want.rects);
      if (Object.keys(got.rects).join() !== rk.join()) bad.push(`${at}: rect keys`);
      for (const key of rk) {
        const a = (got.rects as Record<string, Record<string, number>>)[key]!, b = (want.rects as Record<string, Record<string, number>>)[key]!;
        if (Object.keys(a).join() !== Object.keys(b).join()) bad.push(`${at}: rect ${key} keys`);
        for (const f of Object.keys(b)) if (!Object.is(a[f], b[f])) bad.push(`${at}: rect ${key}.${f}`);
      }
    });
    expect(bad.slice(0, 20)).toEqual([]);
    // eslint-disable-next-line no-console
    console.log(`  Tests (PAGE-ALLOC-A item 5) pin: ${quads} quads compared over ${FRAMES.length * TIMINGS.length * MODELS.length} layouts`);
    expect(quads).toBeGreaterThan(3000);
  });

  it('a quad\'s colour is its own array where the base gave each its own (no shared scratch leaks into a result)', () => {
    const { quads } = hudLayout(FRAMES[1]!, MODELS[2]!, SIZES, TIMINGS[1]!);
    const base = hudLayoutBase(FRAMES[1]!, MODELS[2]!, SIZES, TIMINGS[1]!).quads;
    // Where two of the base's quads share one colour array, the reworked share likewise; where not, not.
    for (let i = 0; i < quads.length; i++) for (let j = i + 1; j < Math.min(quads.length, i + 40); j++) {
      expect(quads[i]!.rgba === quads[j]!.rgba, `${i} ${j}`).toBe(base[i]!.rgba === base[j]!.rgba);
    }
  });
});

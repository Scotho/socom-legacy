import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Matrix4, PerspectiveCamera } from 'three';
import type { EffectProgram, ParticleSource } from '@s2u/scene';
import type { EffectData } from '../src/effectData';
import { Effects } from '../src/effects';
import { ParticleSystem, seededRandom } from '../src/particles';

/**
 * LATER 1198 (product track, a BROWSER ADAPTATION: a devmode instrument for rendered measurements, no game rule): a
 * reseed and reset of the page's particles, so a stepped harness renders the same drops from the same seed. LATER
 * 1190's rendered wide-screen check (r3b) drifted between two runs of one build from step 0 -- the drops alive and each
 * source's part-interval carried in from the page's real-time history before the freeze. `reseed(seed)` swaps the
 * random for a seeded one, drops the live particles and resets each source's accumulator, so the history no longer
 * matters. Without devmode the page hook answers false and changes nothing.
 */

/** MP1's snow_flakes held at the camera: offset (0,20,-50), box +-50 / -15..5 / -25..15, falling. */
function snow(over: Partial<ParticleSource> = {}): ParticleSource {
  return {
    flagsA: 0x15dfb8d7, flagsB: 0x1000, name: 'snow_flakes', setActive: true, node: 1, follow: true, perEvent: 1, events: -1,
    interval: 0.06, perDistance: false, type: 3, streak: null, spin: null, offset: [0, 20, -50], baseVelocity: [0, 0, 0],
    worldVelocity: [0, -12, 0], baseFrom: 'fixed', worldFrom: 'fixed', baseScale: 0, worldScale: 0, baseUnit: false, worldUnit: false,
    atContext: false, atNode: false, positionBlock: null, randomVelocity: [[-2, 2], [-1, 1], [-2, 2]],
    box: [[-50, 50], [-15, 5], [-25, 15]],
    accel: [0, 0, 0], friction: 0, size: [0.5, 0.5], startAge: [0, 0], lifetime: [1.5, 2], nearFade: null, farFade: null,
    textures: [], textureMode: 'first', texture: null, colours: [], scales: [], ...over,
  };
}

type Inside = { particles: { position: number[]; velocity: number[]; age: number; life: number }[] };
const live = (ps: ParticleSystem): number[][] =>
  (ps as unknown as Inside).particles.map((p) => [...p.position, ...p.velocity, p.age, p.life]);

describe('LATER 1198: the same seed renders the same drops, whatever came before', () => {
  it('seededRandom is mulberry32: the same seed, the same sequence; another seed, another', () => {
    const a = seededRandom(1172), b = seededRandom(1172), c = seededRandom(1183);
    const xs = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(xs);
    expect(Array.from({ length: 5 }, () => c())).not.toEqual(xs);
    for (const x of xs) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
  });

  it('ParticleSystem.reseed: two systems with different histories step identically from the first step after it', () => {
    const m = new Matrix4().makeTranslation(10, 30, -5);
    const run = (history: number, dt: number): ParticleSystem => {
      const ps = new ParticleSystem(Math.random);
      ps.emit(snow(), m, {}, 'snow_falling', () => true, null, () => m, true);
      for (let i = 0; i < history; i++) ps.update(dt, null);
      return ps;
    };
    const a = run(37, 1 / 60), b = run(91, 1 / 47);
    a.reseed(7); b.reseed(7);
    // A source with a limited event count is given its command's count back (review F1).
    const counts = (ps: ParticleSystem): number[] => [...(ps as unknown as { sources: Map<string, { events: number }> }).sources.values()].map((s) => s.events);
    expect(counts(b)).toEqual(counts(a));
    for (let step = 0; step < 90; step++) {
      a.update(1 / 30, null); b.update(1 / 30, null);
      expect(live(b), `step ${step}`).toEqual(live(a));
    }
    expect(live(a).length).toBeGreaterThan(20);
  });

  it('Effects.reseed: the same through the effect runner (a camera-held program), the camera and history apart', () => {
    const program: EffectProgram = {
      name: 'snow_falling', root: 0, flags: 0, nodes: ['NA', 'camera'],
      sequences: [{ name: 'NA', activation: 1, ops: [
        { op: 'particles', source: snow() },
        { op: 'while', forever: true }, { op: 'wait', seconds: 0, range: 0, frames: 0 }, { op: 'endWhile' },
      ] }],
    };
    const data: EffectData = {
      archive: 'T', models: [], textures: [], absent: [], materials: ['UNKNOWN'], defaultMaterial: 0, marks: [], footprints: [],
      ambient: [program.name], sceneNodes: [], hitAnims: [], missing: [], programs: [program],
    };
    const cam = new PerspectiveCamera(49, 16 / 9, 0.1, 5000);
    cam.position.set(100, 40, 200);
    cam.updateMatrixWorld();
    const run = (history: number, dt: number): Effects => {
      const fx = new Effects(Math.random);
      fx.setData(data);
      for (let i = 0; i < history; i++) fx.update(dt, cam);
      return fx;
    };
    const ps = (fx: Effects): ParticleSystem => (fx as unknown as { particles: ParticleSystem }).particles;
    const a = run(20, 1 / 60), b = run(53, 1 / 41);
    a.reseed(1172); b.reseed(1172);
    // The runner's own random is reseeded too (review F3): the next draws agree, and are the seed's.
    const draw = (fx: Effects): number[] => { const r = (fx as unknown as { random: () => number }).random; return [r(), r(), r()]; };
    const want = seededRandom(1172);
    expect(draw(a)).toEqual([want(), want(), want()]);
    a.reseed(1172);
    expect(draw(b)).toEqual(draw(a));
    for (let step = 0; step < 60; step++) {
      a.update(1 / 30, cam); b.update(1 / 30, cam);
      expect(live(ps(b)), `step ${step}`).toEqual(live(ps(a)));
    }
    expect(live(ps(a)).length).toBeGreaterThan(10);
  });

  it('the page hook: __viewer.reseedEffects(seed), answering false and doing nothing without devmode (EPH_ON)', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const main = readFileSync(resolve(here, '../src/main.ts'), 'utf-8');
    const hook = readFileSync(resolve(here, '../src/hook.ts'), 'utf-8');
    expect(hook).toMatch(/reseedEffects\?\(seed: number\): boolean;/);
    expect(main).toMatch(/reseedEffects: \(seed: number\) => \{ if \(!EPH_ON\) return false; effects\.reseed\(seed\); return true; \}/);
  });
});

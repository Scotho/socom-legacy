import { describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import { GAME_FRAME_DT, type ParticleSource } from '@s2u/scene';
import { ParticleSystem, STREAK_TICK_READING } from '../src/particles';

/**
 * INV-RAIN (seat b6, 2026-11-07; research 89 §21): the two particle bugs behind The Ruins' (MP12) rain.
 *
 * - **F1.** A `PARTICLE_SOURCE` command writes the source's base velocity (+0x90) only on flag A 0x40 or a context form
 *   (flag B 0x2 / 0x40 / 0x100), and its world velocity (+0x9c) only on flag A 0x80 or flag B 0x4 / 0x80 / 0x200
 *   (`FUN_00266830` D:L112949-113039, D:L113041-113119); a command with none of them -- `rain_falling`'s WHILE loop
 *   switching its sources on and off with flags A 0x1 / 0x3 -- leaves both as they were. A context form whose operand
 *   the context lacks writes nothing either (the `lVar != 0` guards). The source's defaults are zero
 *   (`FUN_0032ab20` D:L227450-227473).
 * - **F2.** A streaked particle (type 3) is drawn from where it was one game tick ago (+0x10) to where it is (+0x20)
 *   (`FUN_00326350` D:L224670-224699; `FUN_00327cd0` D:L225673 copies the spawn place to +0x10), the tick 30 Hz
 *   (`GAME_FRAME_DT`); the port drew it from where it was one browser frame ago (`STREAK_TICK_READING`).
 */

/** MP12's `rain_falling1` as the disc carries it (flags A 0x15dfb8d7, B 0x1000; world (0,-45,0), accel (0,-95,0)). */
function rain(over: Partial<ParticleSource> = {}): ParticleSource {
  return {
    flagsA: 0x15dfb8d7, flagsB: 0x1000, name: 'rain_falling1', setActive: true, node: -6, follow: true, perEvent: 1, events: -1,
    interval: 0.01, perDistance: false, type: 3, streak: [1, 0.15], spin: null, offset: [0, 25, -40], baseVelocity: [0, 0, 0],
    worldVelocity: [0, -45, 0], baseFrom: 'fixed', worldFrom: 'fixed', baseScale: 0, worldScale: -45, baseUnit: false, worldUnit: false,
    atContext: false, atNode: false, positionBlock: null, randomVelocity: [[0, 0], [0, 0], [0, 0]], box: [[0, 0], [0, 0], [0, 0]],
    accel: [0, -95, 0], friction: 0, size: [0.5, 0.5], startAge: [0, 0], lifetime: [100, 100], nearFade: null, farFade: null,
    textures: [], textureMode: 'first', texture: null, colours: [], scales: [], ...over,
  };
}

/** The WHILE loop's re-command: flags A 0x3 (switch on) or 0x1 (switch off), type 4 (leaves it), nothing else decoded. */
function toggle(on: boolean, over: Partial<ParticleSource> = {}): ParticleSource {
  return rain({
    flagsA: on ? 0x3 : 0x1, flagsB: 0, setActive: on, interval: null, type: 4, streak: null, offset: [0, 0, 0],
    worldVelocity: [0, 0, 0], worldScale: 0, accel: [0, 0, 0], ...over,
  });
}

interface Inside { sources: Map<string, { base: number[]; world: number[] }>; particles: { position: number[]; velocity: number[]; size: number; source: ParticleSource }[] }
const inside = (ps: ParticleSystem): Inside => ps as unknown as Inside;
const source = (ps: ParticleSystem): { base: number[]; world: number[] } => [...inside(ps).sources.values()][0]!;

describe('F1: a re-command keeps the velocities its flags do not write (FUN_00266830 D:L112952, D:L113044)', () => {
  it("MP12's rain_falling1 keeps its world velocity (0,-45,0) across the WHILE loop's on/off commands", () => {
    const ps = new ParticleSystem(() => 0.5);
    ps.emit(rain(), null, {}, 'rain_falling', () => true, null, null);
    expect(source(ps).world).toEqual([0, -45, 0]);
    for (let i = 0; i < 4; i++) {
      ps.emit(toggle(i % 2 === 0), null, {}, 'rain_falling', () => true, null, null);
      expect(source(ps).world, `after re-command ${i}`).toEqual([0, -45, 0]);
      expect(source(ps).base).toEqual([0, 0, 0]);
    }
    // And the particles it spawns after the loop fall at it.
    ps.emit(toggle(true), null, {}, 'rain_falling', () => true, null, null);
    ps.update(1 / 30, null);
    ps.update(1 / 30, null);
    const vs = inside(ps).particles.map((p) => p.velocity[1]!);
    expect(vs.length).toBeGreaterThan(0);
    for (const v of vs) expect(v).toBeLessThan(-44);
  });

  it('a re-command with flag A 0x40 / 0x80 writes the fixed velocity it carries', () => {
    const ps = new ParticleSystem(() => 0.5);
    ps.emit(rain(), null, {}, 'r', () => true, null, null);
    ps.emit(toggle(true, { flagsA: 0x83, worldVelocity: [1, 2, 3] }), null, {}, 'r', () => true, null, null);
    expect(source(ps).world).toEqual([1, 2, 3]);
    ps.emit(toggle(true, { flagsA: 0x43, baseVelocity: [4, 5, 6] }), null, {}, 'r', () => true, null, null);
    expect(source(ps).base).toEqual([4, 5, 6]);
    expect(source(ps).world).toEqual([1, 2, 3]);
  });

  it("a context form (flag B 0x2 / 0x4 normal, 0x40 / 0x80 velocity, 0x100 / 0x200 reflected) writes when the context has its operand, and leaves the old value when it lacks it", () => {
    const ps = new ParticleSystem(() => 0.5);
    ps.emit(rain(), null, {}, 'r', () => true, null, null);
    // B 0x4: the world velocity from the context's normal times the scale -- with no normal, nothing written (D:L113115).
    ps.emit(toggle(true, { flagsB: 0x4, worldFrom: 'normal', worldScale: 2 }), null, {}, 'r', () => true, null, null);
    expect(source(ps).world).toEqual([0, -45, 0]);
    ps.emit(toggle(true, { flagsB: 0x4, worldFrom: 'normal', worldScale: 2 }), null, { normal: [0, 1, 0] }, 'r', () => true, null, null);
    expect(source(ps).world).toEqual([0, 2, 0]);
    // B 0x40: the base from the context's velocity -- none, kept; given, written.
    ps.emit(toggle(true, { flagsB: 0x40, baseFrom: 'velocity', baseScale: 1 }), null, {}, 'r', () => true, null, null);
    expect(source(ps).base).toEqual([0, 0, 0]);
    ps.emit(toggle(true, { flagsB: 0x40, baseFrom: 'velocity', baseScale: 1 }), null, { velocity: [7, 0, 0] }, 'r', () => true, null, null);
    expect(source(ps).base).toEqual([7, 0, 0]);
    // B 0x200 (reflected, world): needs the context's velocity (D:L113059-113065).
    ps.emit(toggle(true, { flagsB: 0x200, worldFrom: 'reflected', worldScale: 1 }), null, { normal: [0, 1, 0] }, 'r', () => true, null, null);
    expect(source(ps).world).toEqual([0, 2, 0]);
  });

  it('a new source takes the defaults, zero, where its command writes neither (FUN_0032ab20 D:L227450-227473)', () => {
    const ps = new ParticleSystem(() => 0.5);
    ps.emit(toggle(true), null, {}, 'r', () => true, null, null);
    expect(source(ps).world).toEqual([0, 0, 0]);
    expect(source(ps).base).toEqual([0, 0, 0]);
  });
});

/**
 * One drop at the origin (no offset: flag A 0x4 off), the source firing once (events 1). The camera looks at it from 1000
 * units along +x, so the fall (under 40 units) is all but square to the view and the band's 3D length is its travel.
 */
const drop = (over: Partial<ParticleSource> = {}): ParticleSource =>
  rain({ flagsA: 0x15dfb8d7 & ~0x4, offset: [0, 0, 0], follow: false, events: 1, interval: 0.001, ...over });

/** The band a streaked particle draws, head to tail, along its travel: from the vertex buffer the draw wrote. */
function bandLength(ps: ParticleSystem): number[] {
  // The texture's batch 0: since LATER 593 (`agent/inv-water-look`) a texture holds a pool of batches, one per alpha-pass
  // range; with no alpha pass set, every particle of a texture is in its first.
  const g = (ps as unknown as { meshes: Map<string, { pos: { array: Float32Array }; mesh: { geometry: { drawRange: { count: number } } } }[]> }).meshes.get('')![0]!;
  const q = g.mesh.geometry.drawRange.count / 6, a = g.pos.array, out: number[] = [];
  for (let i = 0; i < q; i++) {
    // Corners 0/1 the tail's, 2/3 the head's (`streak`): the distance between the edges' midpoints.
    const o = i * 12;
    const tail = [(a[o]! + a[o + 3]!) / 2, (a[o + 1]! + a[o + 4]!) / 2, (a[o + 2]! + a[o + 5]!) / 2];
    const head = [(a[o + 6]! + a[o + 9]!) / 2, (a[o + 7]! + a[o + 10]!) / 2, (a[o + 8]! + a[o + 11]!) / 2];
    out.push(Math.hypot(head[0]! - tail[0]!, head[1]! - tail[1]!, head[2]! - tail[2]!));
  }
  return out;
}

describe('F2: a streak runs from its place one game tick ago, whatever the frame rate (FUN_00326350 D:L224670-224699)', () => {
  it('names the reading', () => {
    expect(STREAK_TICK_READING).toBe('oneGameTickBack');
  });

  it('a falling drop draws the same band at 30, 60 and 144 frames a second (within 3%)', () => {
    const lengths: number[] = [];
    for (const hz of [1 / GAME_FRAME_DT, 60, 144]) {
      const ps = new ParticleSystem(() => 0.5);
      // One drop: a source that fires once (events 1), its particle falling at (0,-45,0) under (0,-95,0).
      ps.emit(drop(), null, {}, 'r', () => true, null, null);
      const cam = new PerspectiveCamera(60, 1, 0.1, 5000);
      cam.position.set(1000, 0, 0);
      cam.lookAt(0, 0, 0);
      cam.updateMatrixWorld();
      // Half a second in whole frames (the first records the place; the drop is spawned on the second).
      const n = Math.round(0.5 * hz);
      for (let i = 0; i < n; i++) ps.update(0.5 / n, cam);
      const bands = bandLength(ps);
      expect(bands.length, `${hz} Hz`).toBe(1);
      lengths.push(bands[0]!);
    }
    // The tolerance: the drop is spawned one frame after the start at every rate, so at 0.5 s it has fallen 1/30 - 1/144 s
    // longer at 144 Hz and is ~2.5 u/s faster under (0,-95,0) -- 2.2% of the band. The frame-tied band was 58% shorter.
    const [a, b, c] = lengths as [number, number, number];
    expect(Math.abs(b - a) / a, `60 Hz ${b} vs 30 Hz ${a}`).toBeLessThan(0.03);
    expect(Math.abs(c - a) / a, `144 Hz ${c} vs 30 Hz ${a}`).toBeLessThan(0.03);
  });

  it("the tail sits one tick's travel back: a drop moving at a steady (0,-45,0) draws travel 45 x GAME_FRAME_DT plus the size's head and tail", () => {
    for (const hz of [1 / GAME_FRAME_DT, 60, 144]) {
      const ps = new ParticleSystem(() => 0.5);
      ps.emit(drop({ accel: [0, 0, 0] }), null, {}, 'r', () => true, null, null);
      const cam = new PerspectiveCamera(60, 1, 0.1, 5000);
      cam.position.set(1000, 0, 0);
      cam.lookAt(0, 0, 0);
      cam.updateMatrixWorld();
      const n = Math.round(0.5 * hz);
      for (let i = 0; i < n; i++) ps.update(0.5 / n, cam);
      const [band] = bandLength(ps);
      // The head h on along the travel, the tail h x reach back (`streak`): size 0.5, reach 1.
      expect(band, `${hz} Hz`).toBeCloseTo(45 * GAME_FRAME_DT + 0.5 * (1 + 1), 2);   // 0.005: the view's slant on the fall
    }
  });

  it("a drop younger than a tick draws from its spawn place (FUN_00327cd0 D:L225673), not from before it", () => {
    const ps = new ParticleSystem(() => 0.5);
    ps.emit(drop({ accel: [0, 0, 0] }), null, {}, 'r', () => true, null, null);
    const cam = new PerspectiveCamera(60, 1, 0.1, 5000);
    cam.position.set(1000, 0, 0);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    ps.update(1 / 144, cam);                          // records the place
    ps.update(1 / 144, cam);                          // spawns the drop, and steps it one frame
    ps.update(1 / 144, cam);                          // a second frame: 2/144 s of travel, under a tick (1/30 s)
    const [band] = bandLength(ps);
    expect(band).toBeCloseTo((45 * 2) / 144 + 0.5 * 2, 3);
  });
});

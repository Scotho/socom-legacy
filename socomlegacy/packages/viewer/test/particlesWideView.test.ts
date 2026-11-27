import { describe, expect, it } from 'vitest';
import { Matrix4, PerspectiveCamera } from 'three';
import type { EffectProgram, ParticleSource } from '@s2u/scene';
import type { EffectData } from '../src/effectData';
import { Effects } from '../src/effects';
import { ParticleSystem, WIDE_PRECIP_RATE_CAP_ADAPTATION, wideViewScale } from '../src/particles';

/**
 * LATER 1190 (the owner, INTAKE 183: "make it look good regardless of res"): a BROWSER ADAPTATION, product track. The
 * original's camera-held rain and snow are sized for its own projection, the map's tan(hfov) / tan(vfov) (~1.54; the
 * 'ps2' presentation draws exactly that). The native page keeps the vertical field and widens the horizontal with the
 * window, so on 16:9 and 21:9 the box no longer reaches the screen's sides. A camera-held source's box (x and z: since
 * LATER 1172 it lies on the world's axes, so either is "sideways" by facing) is scaled by s = max(1, aspect / the
 * map's), and its rate by s^2 -- the same drops per unit of ground -- up to WIDE_PRECIP_RATE_CAP_ADAPTATION. At the
 * original's framing, and any narrower view, exactly the original.
 */

/** The 24.5-degree maps' projection: tan(0.6109) / tan(0.4276). */
const MAP_ASPECT = Math.tan(0.6109) / Math.tan(0.4276);

/** MP12's rain_falling1, still: offset (0,25,-40), box +-70 / +-10 / +-70, one drop per 0.01 s, living long. */
function rain(over: Partial<ParticleSource> = {}): ParticleSource {
  return {
    flagsA: 0x15dfb8d7, flagsB: 0x1000, name: 'rain_falling1', setActive: true, node: -6, follow: true, perEvent: 1, events: -1,
    interval: 0.01, perDistance: false, type: 3, streak: [1, 0.15], spin: null, offset: [0, 25, -40], baseVelocity: [0, 0, 0],
    worldVelocity: [0, 0, 0], baseFrom: 'fixed', worldFrom: 'fixed', baseScale: 0, worldScale: 0, baseUnit: false, worldUnit: false,
    atContext: false, atNode: false, positionBlock: null, randomVelocity: [[0, 0], [0, 0], [0, 0]],
    box: [[-70, 70], [-10, 10], [-70, 70]],
    accel: [0, 0, 0], friction: 0, size: [0.5, 0.5], startAge: [0, 0], lifetime: [100, 100], nearFade: null, farFade: null,
    textures: [], textureMode: 'first', texture: null, colours: [], scales: [], ...over,
  };
}
/** MP1's snow_flakes: offset (0,20,-50), box +-50 / -15..5 / -25..15. */
const snow = (): ParticleSource => rain({ name: 'snow_flakes', offset: [0, 20, -50], box: [[-50, 50], [-15, 5], [-25, 15]] });

interface Inside { particles: { position: number[] }[] }

/** Two seconds of a camera-held source under a camera of `aspect`: each drop's place less the source's. */
function run(config: ParticleSource, aspect: number | null, aboutCamera = true, seed = 7): number[][] {
  let s = seed;
  const random = (): number => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const ps = new ParticleSystem(random);
  ps.setProjectionAspect(MAP_ASPECT);
  const cam = aspect === null ? null : new PerspectiveCamera(49, aspect, 0.1, 5000);
  const m = new Matrix4();                                   // the camera at the origin, level, facing -z
  ps.emit(config, m, {}, 'r', () => true, null, () => m, aboutCamera);
  for (let i = 0; i < 60; i++) ps.update(1 / 30, cam);
  const [ox, oy, oz] = config.offset;
  return (ps as unknown as Inside).particles.map((p) => [p.position[0]! - ox, p.position[1]! - oy, p.position[2]! - oz]);
}

describe('LATER 1190: precipitation sized for a wide view (a browser adaptation)', () => {
  it('names the cap (an adaptation) and the scale: 1 at the map\'s framing and narrower; the box s, the rate s^2', () => {
    expect(WIDE_PRECIP_RATE_CAP_ADAPTATION).toBe(2.5);
    expect(wideViewScale(MAP_ASPECT, MAP_ASPECT)).toEqual({ box: 1, rate: 1 });
    expect(wideViewScale(4 / 3, MAP_ASPECT)).toEqual({ box: 1, rate: 1 });
    expect(wideViewScale(1, MAP_ASPECT)).toEqual({ box: 1, rate: 1 });
    const w = wideViewScale(16 / 9, MAP_ASPECT);
    expect(w.box).toBeCloseTo((16 / 9) / MAP_ASPECT, 9);
    expect(w.rate).toBeCloseTo(w.box * w.box, 9);
  });

  for (const [name, make] of [['rain_falling1', rain], ['snow_flakes', snow]] as const) {
    it(`${name}: at the original framing and at 4:3, exactly the original -- the same drops, the same places`, () => {
      const original = run(make(), null, false);
      expect(original.length).toBeGreaterThan(100);
      expect(run(make(), MAP_ASPECT)).toEqual(original);
      expect(run(make(), 4 / 3)).toEqual(original);
    });

    for (const [label, aspect] of [['16:9', 16 / 9], ['21:9', 21 / 9]] as const) {
      it(`${name}: at ${label} the box widens by aspect / the map's on x and z, and the drops per unit of ground are 4:3's`, () => {
        const config = make();
        const base = run(config, 4 / 3), wide = run(config, aspect);
        const s = aspect / MAP_ASPECT;
        expect(s * s).toBeLessThanOrEqual(WIDE_PRECIP_RATE_CAP_ADAPTATION);   // the cap does not bite at 21:9
        // Inside the widened box, and reaching across it.
        for (const r of wide) {
          expect(r[0]!).toBeGreaterThanOrEqual(config.box[0]![0] * s - 1e-6); expect(r[0]!).toBeLessThanOrEqual(config.box[0]![1] * s + 1e-6);
          expect(r[1]!).toBeGreaterThanOrEqual(config.box[1]![0] - 1e-6); expect(r[1]!).toBeLessThanOrEqual(config.box[1]![1] + 1e-6);
          expect(r[2]!).toBeGreaterThanOrEqual(config.box[2]![0] * s - 1e-6); expect(r[2]!).toBeLessThanOrEqual(config.box[2]![1] * s + 1e-6);
        }
        const xs = wide.map((r) => r[0]!);
        expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.95 * (config.box[0]![1] - config.box[0]![0]) * s);
        // The density: drops over the box's ground area, within 3% of 4:3's (the count is a whole number per tick).
        const area = (k: number): number => (config.box[0]![1] - config.box[0]![0]) * (config.box[2]![1] - config.box[2]![0]) * k * k;
        const d0 = base.length / area(1), d1 = wide.length / area(s);
        expect(Math.abs(d1 - d0) / d0, `${wide.length} vs ${base.length}`).toBeLessThan(0.03);
      });
    }

    it(`${name}: at 32:9 the cap holds -- ${WIDE_PRECIP_RATE_CAP_ADAPTATION}x the drops at most, the box at its root -- and the density thins, nothing breaks`, () => {
      const config = make();
      const base = run(config, 4 / 3), wide = run(config, 32 / 9);
      const capBox = Math.sqrt(WIDE_PRECIP_RATE_CAP_ADAPTATION);
      expect(wideViewScale(32 / 9, MAP_ASPECT)).toEqual({ box: capBox, rate: WIDE_PRECIP_RATE_CAP_ADAPTATION });
      const ratio = wide.length / base.length;
      expect(ratio).toBeGreaterThan(WIDE_PRECIP_RATE_CAP_ADAPTATION * 0.97);
      expect(ratio).toBeLessThan(WIDE_PRECIP_RATE_CAP_ADAPTATION * 1.03);
      for (const r of wide) {
        expect(r.every(Number.isFinite)).toBe(true);
        expect(Math.abs(r[0]!)).toBeLessThanOrEqual(Math.max(-config.box[0]![0], config.box[0]![1]) * capBox + 1e-6);
      }
      // Per unit of ground the box covers, the original density; per unit of the WIDER view's reach, thinner by
      // (capBox / s)^2 -- a graceful thinning at the screen's far sides, not a hole.
      const s = (32 / 9) / MAP_ASPECT;
      expect(capBox).toBeLessThan(s);
    });
  }

  it('a source not held at the camera is never widened', () => {
    expect(run(rain(), 21 / 9, false)).toEqual(run(rain(), null, false));
  });
});

/**
 * The review's F1: a match's ambient programs start in `Effects.setData`, before the page's first `update` hands the
 * effects a camera -- the rain and snow sources are made then, and must still be marked held at the camera.
 */
describe('LATER 1190 through Effects: a camera-held source made before the first frame is widened', () => {
  const program = (): EffectProgram => ({
    name: 'rain_falling', root: 0, flags: 0, nodes: ['NA', 'camera'],
    // The source made, then the run kept alive (MP12's WHILE loop) -- a source lives while its run does.
    sequences: [{ name: 'NA', activation: 1, ops: [
      { op: 'particles', source: rain({ node: 1 }) },
      { op: 'while', forever: true }, { op: 'wait', seconds: 0, range: 0, frames: 0 }, { op: 'endWhile' },
    ] }],
  });
  const data = (p: EffectProgram): EffectData => ({
    archive: 'T', models: [], textures: [], absent: [], materials: ['UNKNOWN'], defaultMaterial: 0, marks: [], footprints: [],
    ambient: [p.name], sceneNodes: [], hitAnims: [], missing: [], programs: [p],
  });
  type Src = { config: ParticleSource; aboutCamera: boolean };
  const inner = (fx: Effects): { sources: Map<string, Src>; particles: { position: number[] }[] } =>
    (fx as unknown as { particles: { sources: Map<string, Src>; particles: { position: number[] }[] } }).particles;

  for (const [label, aspect, widened] of [['21:9', 21 / 9, true], ['the map framing', MAP_ASPECT, false]] as const) {
    it(`setData before the first update, then frames at ${label}: the source is camera-held, its box ${widened ? 'widened' : 'the original'}`, () => {
      const fx = new Effects(() => 0.5);
      fx.setProjectionAspect(MAP_ASPECT);
      fx.setData(data(program()));                         // the ambient run starts here: no camera yet
      const cam = new PerspectiveCamera(49, aspect, 0.1, 5000);
      cam.updateMatrixWorld();
      const values = (): Src[] => [...inner(fx).sources.values()];
      expect(values().map((s) => [s.config.name, s.aboutCamera])).toEqual([['rain_falling1', true]]);
      let r = 0.05;
      (inner(fx) as unknown as { random: () => number }).random = () => (r = (r + 0.37) % 1);   // spread the draws
      for (let i = 0; i < 30; i++) fx.update(1 / 30, cam);
      const xs = inner(fx).particles.map((p) => p.position[0]!);
      expect(xs.length).toBeGreaterThan(20);
      const reach = Math.max(...xs.map(Math.abs));
      if (widened) expect(reach).toBeGreaterThan(75); else expect(reach).toBeLessThanOrEqual(70 + 1e-6);
    });
  }
});

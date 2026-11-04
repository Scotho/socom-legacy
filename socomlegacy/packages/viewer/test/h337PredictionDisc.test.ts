// @vitest-environment jsdom
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { GAME_FRAME_DT, isCameraSurface, SEAL_TUNING, segmentHit, type Grid, type WorldPoly } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { loadMap } from '../src/loadMap';
import { buildPageWorld } from '../src/matchWorld';
import { WalkMode } from '../src/walk';
import { cameraPass, isPeekCameraSurface, LEAD_DOWN, localCamera, newPassState, toWorld, type PassState } from '../src/cameraRig';
import { isCameraClassSurface } from '../src/mover';
import { CAM_FAR, LEAD_PROBE_START_PLACEHOLDER, pitchLimits, viewFar, type PlayerCamera } from '../src/playerCamera';

/**
 * H337 / LATER 308: the port's predictions for the capture of the original at a steep look against a surface (research
 * 201 section 14, "The capture's prediction"), under both of `LEAD_PROBE_START_PLACEHOLDER`'s candidates. Dev-disc
 * (`SOCOM_DISC`; each case skipped, and said so, without its map).
 *
 * The page's `PlayerCamera` holds the candidate as a module constant, so each candidate is replayed here from the port's
 * own pieces in `PlayerCamera.tick`'s order (`../src/playerCamera.ts`; no peek, no death camera): `localCamera`
 * (`FUN_0029a950`), the lead probe (`segmentHit` with `isCameraSurface`, from this call's target or from the last
 * call's lead), `toWorld` (`FUN_00297410`), the target re-placed on the eye-to-far line, `cameraPass` (`FUN_0029bf70`)
 * and `viewFar` (LATER 305: the use and fire aim). Under `'target'` the replay is checked against the page's own camera
 * (`WalkMode.gameCamera`, `lookAim`), so the `'lastOutput'` replay is the same code with the other start.
 *
 * `'lastOutput'` depends on the calls before the steep look -- the word holds whatever the last call left -- so the
 * capture's approach is replayed: the spawn's `init_aim_pitch` held 1 s, then look-down held at the stick's full
 * `pitch_rate` (0.85 rad/s, `FUN_00594600`; the header of `../src/playerCamera.ts`) one call a game frame
 * (`GAME_FRAME_DT`) to the limit, then held 10 s. Holding look-down reaches the aim limit `min_aim_pitch` -70 (standing,
 * `pitchLimits`), not -45; -45 is LATER 491's pitch, reached only by letting go there, so both are predicted.
 *
 * The capture's fields (research 201 section 14): `cam+0x2c` is the eye before the pass (`eye0`), `cam+0x38` the
 * re-placed target (`target`), `cam+0xd8` the passed eye (`passed`); the actor's `+0x1c` the feet. `H337_REPORT=1`
 * prints each stand's last two calls under both starts (the numbers section 14.1 records).
 *
 * **The lead probe's filter** (LATER 341): the port's probe tests `isCameraSurface` (bit 19 skipped, bit 18 hit), the
 * camera pass's mode 1. The original's `FUN_0029cbb0` sets mode 0 itself (`FUN_002d4fd0(0)`, D:L143678), so
 * `FUN_002d2890` skips bit 18 and hits bit 19, with no material check -- `isPeekCameraSurface`'s test, `MODE0` here.
 * Each stand is replayed under both: what the original would show is the `MODE0` replay. `FUN_0029cd20`'s
 * cameratype-1 picker (D:L143689) is not modelled; the stands' probes meet cameratype 0 and 2 only.
 */

/** `FUN_002d2890` under `DAT_0044d758` = 0 (LATER 341): bit 1 set and bit 18 clear -- `isPeekCameraSurface`'s test. */
const MODE0 = isPeekCameraSurface;

const DISC = process.env.SOCOM_DISC;
type V3 = [number, number, number];
type Start = 'target' | 'lastOutput';
/** The lead probe's surface test: `isCameraSurface` (the port's) or `MODE0` (the original's, LATER 341). */
type Probe = (p: WorldPoly) => boolean;
const TICK = 1 / 60;

interface Tick { pitch: number; lead: number; eye0: V3; target: V3; passed: V3; aimDown: number }

const down = (v: readonly number[]): number => (Math.atan2(-v[1]!, Math.hypot(v[0]!, v[2]!)) * 180) / Math.PI;
const minus = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const dist = (a: readonly number[], b: readonly number[]): number => Math.hypot(...minus(a, b));
const fmt = (v: readonly number[]): string => v.map((x) => x.toFixed(2)).join(', ');

/** `PlayerCamera.tick`'s game side, with the lead probe's start and surface test given; one call per `step`. */
function replay(grid: Grid, start: Start, dt: number, probe: Probe = isCameraSurface) {
  const pass: PassState = newPassState();
  let leadFrom: number | null = null;
  return (feet: V3, yaw: number, pitch: number, root: number): Tick => {
    const local = localCamera(root, pitch, 0);
    const world = (v: readonly number[]): V3 => toWorld(feet, yaw, v);
    let lead = local.target[2];
    if (local.probe) {
      const from = start === 'lastOutput' ? leadFrom ?? lead : lead;
      const a = world([local.target[0], local.target[1], from]), b = world([local.target[0], local.target[1], from + LEAD_DOWN]);
      const h = segmentHit(grid, a, b, probe);
      if (h) lead += Math.hypot(b[0] - h.point[0], b[2] - h.point[2]);
    }
    leadFrom = lead;
    const targetL: V3 = [local.target[0], local.target[1], lead];
    const eye0 = world([0, 1, 2].map((i) => targetL[i]! + local.back[i]! * local.dist));
    const far = world([0, 1, 2].map((i) => targetL[i]! + local.ahead[i]! * CAM_FAR));
    const toFar = minus(far, eye0), len = Math.hypot(...toFar);
    const target = [0, 1, 2].map((i) => eye0[i]! + (toFar[i]! / len) * local.dist) as V3;
    const passed = cameraPass(grid, target, eye0, pass, dt, isCameraClassSurface) as V3;
    return { pitch, lead, eye0, target, passed, aimDown: down(minus(viewFar(passed, target, far), passed)) };
  };
}

/** The capture's approach: `init_aim_pitch` 1 s, look-down at the full `pitch_rate` to `limit`, held 10 s; game frames. */
function approach(limit: number): number[] {
  const frames = (s: number): number => Math.round(s / GAME_FRAME_DT);
  const out: number[] = Array.from({ length: frames(1) }, () => SEAL_TUNING.initAimPitch);
  const step = (SEAL_TUNING.pitchRate * GAME_FRAME_DT * 180) / Math.PI;
  for (let p = SEAL_TUNING.initAimPitch; p > limit;) { p = Math.max(limit, p - step); out.push(p); }
  for (let i = frames(10); i > 0; i--) out.push(limit);
  return out;
}

/** Both candidates along the approach to `limit`, the lead probe testing `probe`: the last two calls of each. */
function predict(grid: Grid, feet: V3, yaw: number, root: number, limit: number, probe: Probe = isCameraSurface): Record<Start, [Tick, Tick]> {
  const run = (start: Start): [Tick, Tick] => {
    const step = replay(grid, start, GAME_FRAME_DT, probe);
    const ticks = approach(limit).map((pitch) => step(feet, yaw, pitch, root));
    return [ticks[ticks.length - 2]!, ticks[ticks.length - 1]!];
  };
  return { target: run('target'), lastOutput: run('lastOutput') };
}

function report(name: string, feet: V3, yaw: number, limit: number, p: Record<Start, [Tick, Tick]>): string {
  const lines = [`${name}: feet (${fmt(feet)}), yaw ${yaw.toFixed(2)}, pitch ${limit}`];
  for (const k of ['target', 'lastOutput'] as const) {
    for (const [i, t] of p[k].entries()) {
      lines.push(`  ${k} call ${i}: lead ${t.lead.toFixed(2)} eye0 (${fmt(t.eye0)}) target (${fmt(t.target)}) passed (${fmt(t.passed)}) aim down ${t.aimDown.toFixed(1)}`);
    }
  }
  return lines.join('\n');
}

async function stand(stem: string, at: V3, yaw: number) {
  const m = await loadMap(new FsAssetSource(DISC!), `RUN/${stem}.ZDB`);
  const built = buildPageWorld(m, { setNodeActive: () => {}, sound: () => {}, effect: () => {}, log: () => {} })!;
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined; c.releasePointerCapture = () => undefined; c.hasPointerCapture = () => false;
  const fly = new FlyCamera(c);
  fly.setScale(m.metersPerUnit);
  const walk = new WalkMode(fly);
  walk.setGround(m.ground, at, built.grid);
  expect(walk.setMode('walk')).toBe(true);
  expect(walk.respawn(at, yaw)).toBe(true);
  expect(walk.posture()).toBe('stand');
  walk.setScoped(false);
  for (let i = 0; i < 120; i++) { fly.update(TICK); walk.frame(TICK); }          // 2 s: the walker settled on its floor
  const body = walk.startBody()!;
  const root = (walk as unknown as { player: PlayerCamera }).player.rootY();
  return { walk, fly, grid: walk.gridOfGround()!, feet: body.feet as V3, yaw: body.yaw, root };
}

type Stood = Awaited<ReturnType<typeof stand>>;

/** The replay under `'target'` at a held pitch is the page's own camera: its passed eye, its target, its use aim. */
function checkAgainstPage(s: Stood, pitch: number): void {
  expect(LEAD_PROBE_START_PLACEHOLDER).toBe('target');
  s.walk.setCamera({ yaw: s.yaw, pitch });
  for (let i = 0; i < 600; i++) { s.fly.update(TICK); s.walk.frame(TICK); }        // 10 s held: the pass settled
  const step = replay(s.grid, 'target', TICK);
  let t: Tick | null = null;
  for (let i = 0; i < 600; i++) t = step(s.feet, s.yaw, pitch, s.root);
  const page = s.walk.gameCamera()!, look = s.walk.lookAim()!;
  expect(dist(s.walk.startBody()!.feet, s.feet), 'the walker held its feet').toBeLessThan(1e-3);
  expect(dist(t!.passed, page.eye)).toBeLessThan(1e-3);
  expect(dist(t!.target, page.target)).toBeLessThan(1e-3);
  expect(Math.abs(t!.aimDown - down(minus(look.far, look.eye)))).toBeLessThan(0.01);
}

const close = (a: readonly number[], b: readonly number[]): void => {
  expect(dist(a, b), `(${fmt(a)}) against (${fmt(b)})`).toBeLessThan(0.01);
};

/** Both candidates still, and the same, two calls apart. */
function same(p: Record<Start, [Tick, Tick]>): void {
  const [t0, t1] = p.target, [l0, l1] = p.lastOutput;
  close(t0.eye0, t1.eye0); close(t0.passed, t1.passed);
  close(l0.eye0, l1.eye0); close(t1.eye0, l1.eye0); close(t1.passed, l1.passed);
}

/** `'target'` still; `'lastOutput'` alternating between two eyes at least `apart` apart, the body still. */
function split(p: Record<Start, [Tick, Tick]>, apart: number): void {
  const [t0, t1] = p.target, [l0, l1] = p.lastOutput;
  close(t0.eye0, t1.eye0); close(t0.target, t1.target);
  expect(dist(l0.eye0, l1.eye0)).toBeGreaterThan(apart);
}

/**
 * The numbers research 201 section 14 records as the capture's prediction (two decimals; the eye before the pass,
 * `cam+0x2c`, and the target, `cam+0x38`): `'target'`'s one still eye, `'lastOutput'`'s two (in either order), under the
 * port's probe filter; and `mode0`, `'lastOutput'`'s two under `MODE0` (the original's filter, LATER 341) where they
 * differ -- `'target'` is the same under both at every stand here.
 */
interface Pin { eye: V3; target: V3; orbit: [V3, V3] | null; mode0?: [V3, V3] }
const PINS: Record<string, Pin> = {
  'MP11 gate stand -45': { eye: [1127.56, -65.72, 432.13], target: [1128.35, -78.52, 419.35], orbit: null },
  'MP11 gate stand -70': { eye: [1128.15, -64.57, 422.56], target: [1128.46, -78.52, 417.50], orbit: null },
  'MP11 back stand -45': { eye: [1127.68, -65.72, 440.79], target: [1128.06, -78.52, 428.00], orbit: [[1127.78, -65.72, 437.49], [1127.69, -65.72, 440.44]] },
  'MP11 back stand -70': { eye: [1127.91, -64.57, 433.07], target: [1128.06, -78.52, 428.00], orbit: [[1127.95, -64.57, 431.75], [1128.03, -64.57, 428.88]] },
  'M51 stage A -45': {
    eye: [948.19, -106.19, 696.00], target: [960.99, -118.99, 696.00], orbit: [[952.51, -106.19, 696.00], [948.55, -106.19, 696.00]],
    mode0: [[947.09, -106.19, 696.00], [948.55, -106.19, 696.00]],
  },
  'M51 stage A -70': {
    eye: [955.92, -105.04, 696.00], target: [960.99, -118.99, 696.00], orbit: [[957.24, -105.04, 696.00], [961.12, -105.04, 696.00]],
    mode0: [[957.24, -105.04, 696.00], [955.71, -105.04, 696.00]],
  },
};

const near = (a: readonly number[], b: readonly number[]): boolean => dist(a, b) < 0.02;
const pair = (name: string, what: string, [a, b]: readonly [V3, V3], [x, y]: readonly [V3, V3]): void => {
  expect((near(a, x) && near(b, y)) || (near(a, y) && near(b, x)), `${name}: ${what} (${fmt(a)}) (${fmt(b)})`).toBe(true);
};

/** `p` under the port's filter, `m` under `MODE0`: both against the stand's pin. */
function pinned(name: string, p: Record<Start, [Tick, Tick]>, m: Record<Start, [Tick, Tick]>): void {
  const pin = PINS[name]!;
  expect(near(p.target[1].eye0, pin.eye), `${name}: 'target' eye (${fmt(p.target[1].eye0)})`).toBe(true);
  expect(near(p.target[1].target, pin.target), `${name}: 'target' target (${fmt(p.target[1].target)})`).toBe(true);
  expect(near(m.target[0].eye0, pin.eye) && near(m.target[1].eye0, pin.eye), `${name}: 'target' under MODE0 (${fmt(m.target[1].eye0)})`).toBe(true);
  expect(near(m.target[1].target, pin.target), `${name}: 'target' target under MODE0 (${fmt(m.target[1].target)})`).toBe(true);
  const orbit = pin.orbit ?? [pin.eye, pin.eye];
  pair(name, "'lastOutput' eyes", [p.lastOutput[0].eye0, p.lastOutput[1].eye0], orbit);
  pair(name, "'lastOutput' eyes under MODE0", [m.lastOutput[0].eye0, m.lastOutput[1].eye0], pin.mode0 ?? orbit);
}

/** MP11 Death Trap, gate 1 (`enowapiStandDisc.test.ts`): the panel `epanel_di1` on the wall `g342_1` (z 420). */
const MP11 = !!DISC && existsSync(resolve(DISC, 'RUN/MP11.ZDB'));
const MP11_PANEL: V3 = [1128.29, -87.2, 420.27];
const toward = (at: readonly number[]): number => (Math.atan2(-(MP11_PANEL[0] - at[0]!), -(MP11_PANEL[2] - at[2]!)) * 180) / Math.PI;
/** Fuse's stand (the gate's, LATER 491's): the wall 5 ahead, nearer than the target's lead at -45 (5.66) and -70 (7.52). */
const MP11_GATE: V3 = [1128, -100, 425];
/** 5 further back: the wall 10 ahead, inside the lead probe's 8 at both pitches. */
const MP11_BACK: V3 = [1128, -100, 430];

describe.skipIf(!MP11)(`H337: the capture's prediction at MP11 gate 1${MP11 ? '' : ' (SOCOM_DISC with RUN/MP11.ZDB absent: skipped)'}`, () => {
  it("the standing aim limit is -70; the replay under 'target' is the page's own camera at -45 and -70", async () => {
    expect(pitchLimits('stand')[0]).toBe(-70);
    const s = await stand('MP11', MP11_GATE, toward(MP11_GATE));
    checkAgainstPage(s, -45);
    checkAgainstPage(s, -70);
  }, 120000);

  it('at the gate stand (1128, -100, 425) the two starts give one still eye: the target already lies past the wall', async () => {
    const s = await stand('MP11', MP11_GATE, toward(MP11_GATE));
    for (const limit of [-45, -70]) {
      const p = predict(s.grid, s.feet, s.yaw, s.root, limit), m = predict(s.grid, s.feet, s.yaw, s.root, limit, MODE0);
      if (process.env.H337_REPORT) console.log(report('MP11 gate stand', s.feet, s.yaw, limit, p), '\n', report('MP11 gate stand MODE0', s.feet, s.yaw, limit, m));
      same(p);
      same(m);
      pinned(`MP11 gate stand ${limit}`, p, m);
    }
  }, 120000);

  it("5 back, at (1128, -100, 430): 'target' still, 'lastOutput' a two-call orbit, at -45 and -70", async () => {
    const s = await stand('MP11', MP11_BACK, toward(MP11_BACK));
    checkAgainstPage(s, -70);
    for (const limit of [-45, -70]) {
      const p = predict(s.grid, s.feet, s.yaw, s.root, limit), m = predict(s.grid, s.feet, s.yaw, s.root, limit, MODE0);
      if (process.env.H337_REPORT) console.log(report('MP11 back stand', s.feet, s.yaw, limit, p), '\n', report('MP11 back stand MODE0', s.feet, s.yaw, limit, m));
      split(p, 1);
      split(m, 1);
      pinned(`MP11 back stand ${limit}`, p, m);
    }
  }, 120000);
});

/**
 * Stage A: M51 Seeding Chaos, the campaign's first mission; the console's spawn (research 82, `spawn_pcsx2.rdram`). The
 * stand is on the flat strip toward +x and -z of the spawn, the terrain rising gently to it along the straight line.
 * Facing +x (yaw 270), the map's boundary wall `worldmodel/boundary1`, cameratype 2 (bit 19), stands 3.58 ahead
 * (x 963.58), and a cameratype-0 surface 8.99 ahead (x 968.99) at the target's height.
 * - The port's lead probe (`isCameraSurface`) skips `boundary1` and meets the x 968.99 surface: `'lastOutput'` orbits
 *   between leads 2.31 and 6.20 ahead at -70.
 * - The original's probe (`MODE0`, LATER 341) hits `boundary1`: `'lastOutput'` orbits between 2.31 and 0.78 ahead at
 *   -70 (the eyes 1.53 apart, 1.46 at -45). `'target'` starts past the wall (5.66 ahead at -45, 7.52 at -70) and is the
 *   same under both, so the stand still separates the two starts.
 * - The stand is kept (the review's second option): no M51 stand with a clear probe reach is a short walk from the
 *   spawn. On flat, dry ground within 260 units of the spawn, the nearest side surface within 17 ahead at the target's
 *   height was cameratype 2 at every one of 1,378 stand-yaws; out to 700, 7 met cameratype 0 first, and the one stand
 *   with it 8.5-13 ahead, 370.6 from the spawn, gave a `'lastOutput'` pair 0.4 apart (research 201 section 14.1).
 */
const M51 = !!DISC && existsSync(resolve(DISC, 'RUN/M51.ZDB'));
const M51_SPAWN: V3 = [939.4391, -145.8672, 857.0661];
const M51_STAND: V3 = [960, -140.48, 696];
const M51_YAW = 270;

describe.skipIf(!M51)(`H337: the stage-A stand on M51${M51 ? '' : ' (SOCOM_DISC with RUN/M51.ZDB absent: skipped)'}`, () => {
  it("16.2 m from the spawn on flat ground, facing +x: 'target' still, 'lastOutput' a two-call orbit, at -45 and -70", async () => {
    const s = await stand('M51', M51_STAND, M51_YAW);
    expect(s.feet[0]).toBeCloseTo(960, 2);                                            // the walker holds the stand
    expect(s.feet[2]).toBeCloseTo(696, 2);
    expect(Math.hypot(s.feet[0] - M51_SPAWN[0], s.feet[2] - M51_SPAWN[2])).toBeCloseTo(162.4, 1);
    checkAgainstPage(s, -70);
    for (const limit of [-45, -70]) {
      const p = predict(s.grid, s.feet, s.yaw, s.root, limit), m = predict(s.grid, s.feet, s.yaw, s.root, limit, MODE0);
      if (process.env.H337_REPORT) console.log(report('M51 stage A', s.feet, s.yaw, limit, p), '\n', report('M51 stage A MODE0', s.feet, s.yaw, limit, m));
      split(p, 1);
      split(m, 1);
      pinned(`M51 stage A ${limit}`, p, m);
    }
  }, 120000);
});

// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { decodeEffectProgram, GAME_FRAME_DT, parseAnimSets, segmentHits, type EffectOp } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { simMapFromBytes } from '../src/simMap';
import { DoorSet, pickDoor } from '../src/doors';
import { INIT_AIM_PITCH, PlayerCamera, viewFar, type Vec3 } from '../src/playerCamera';
import { rootY, TICK } from '../src/mover';
import { WorldState } from '../src/worldState';
import { CameraEffects, cameraEffectsTurn, publishCameraEffects } from '../src/cameraEffects';

/**
 * LATER 1246 (the bodies seat, 2026-11-19; simulation track): the camera's jiggle. Several maps' scene sets carry an
 * autostart `camera_jiggle` (`MZANIM.ZAR`, flags 33; sequence `shake_small`) that turns a node named `camera_effects`:
 * `OBJECT_ROTATE_STATE` to euler (0, 0, 0) at each pass, then four `OBJECT_MOTION` legs (flags 0x101, 1.0 s each) whose
 * angular block (flag 0x100) turns the node by w x dt and adds accel x dt to w each frame (`FUN_00261370` D:L110362-110376;
 * the begin copies the record's w into the running one, `FUN_00262690` D:L110995-110999), then `LOOP` -1. The original's
 * camera finds `camera_effects` (`FUN_002956e0` D:L139743-139746) and multiplies its matrix into the view each frame
 * (`FUN_002998f0` D:L142020-142024), the view the reticle's ray is cast along (D:L142028).
 *
 * THE ORIGINAL (two captures on PC 1): L1246b -- the camera's sway matrix period 4.003 s, yaw terms +-0.00045, pitch
 * terms 0..0.0009 lagging the yaw by 0.97 s, the eye constant; L1246 -- at MP71 door_rg_1 the use pick flips door <-> wall
 * every 4.003 s (~2.05 s on, ~1.95 s off) at a standing camera yaw near 13.925 degrees, the hit at x = 2192.000.
 *
 * (a) the legs as the disc holds them; (b) the port's view turned by them over 8 s at 60 Hz; (c) the door pick at
 * door_rg_1 with the camera's yaw inside the band the jiggle straddles. Unit-test evidence on the fixture disc (MP71.ZDB);
 * (d) the multiplayer maps whose sets run `camera_jiggle`, a dev-disc sweep (`SOCOM_DISC`), skipped without it.
 */

const MP71 = fixture('RUN/MP71.ZDB');
/** 0.05 degrees a second in radians, as the disc's f32 holds it. */
const K = Math.fround((0.05 * Math.PI) / 180);
const FEET: Vec3 = [2194.6, 179.0, 792.5];

const sub = (a: readonly number[], b: readonly number[]): Vec3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const unit = (a: readonly number[]): Vec3 => { const l = Math.hypot(a[0]!, a[1]!, a[2]!); return [a[0]! / l, a[1]! / l, a[2]! / l]; };

describe.skipIf(!MP71)(`LATER 1246: camera_jiggle on MP71 -- the legs, the view, the door pick${MP71 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const map = MP71 ? simMapFromBytes(MP71, 'RUN/MP71.ZDB') : null;

  /** The page's world on MP71, its autostarts started (`./matchWorld`, `./main`: `runAutostartPrograms`). */
  function pageWorld(): WorldState {
    const world = new WorldState(map!.meta!, map!.ground, map!.grid);
    world.runAutostartPrograms = true;
    world.applyInitial();
    return world;
  }

  /** The SEAL's camera at `FEET`, settled at `yaw` and the spawn pitch. */
  function camera(yaw: number): PlayerCamera {
    const cam = new PlayerCamera(map!.grid);
    for (let i = 0; i < 30; i++) cam.tick(FEET, yaw, INIT_AIM_PITCH, rootY('stand'), TICK, true);
    return cam;
  }

  /** The shot's and the use's ray as `WalkMode.follow` places it (`fireAim`): the game's eye and `viewFar`. */
  function aimOf(cam: PlayerCamera): { eye: Vec3; far: Vec3 } {
    const v = cam.view(1);
    return { eye: v.aim.eye, far: viewFar(v.aim.eye, v.aim.target, v.far) };
  }

  it('(a) the disc: camera_jiggle (flags 33), one sequence shake_small -- rotate to 0, four 1 s angular legs at k = 0.05 deg/s, loop forever', () => {
    const lib = map!.meta!.scene!.programs.find((l) => l.program.name === 'camera_jiggle');
    expect(lib, 'MP71 carries camera_jiggle').toBeDefined();
    const p = lib!.program;
    expect(p.flags).toBe(33);
    expect(p.nodes[1]).toBe('camera_effects');
    expect(p.sequences.map((s) => s.name)).toEqual(['shake_small']);
    const ops = p.sequences[0]!.ops;
    expect(ops.map((o) => o.op)).toEqual(['rotate', 'motion', 'motion', 'motion', 'motion', 'loop']);
    expect(ops[0]).toEqual({ op: 'rotate', node: 1, ref: 0, flags: 1, xyz: [0, 0, 0] });
    expect(ops[5]).toEqual({ op: 'loop', count: -1, seconds: null });
    const legs = ops.slice(1, 5).map((o) => (o as Extract<EffectOp, { op: 'motion' }>).motion);
    const want: [Vec3, Vec3][] = [
      [[0, K, 0], [-K, -K, 0]],
      [[-K, 0, 0], [K, -K, 0]],
      [[0, -K, 0], [K, K, 0]],
      [[K, 0, 0], [-K, K, 0]],
    ];
    legs.forEach((m, i) => {
      expect(m.node, `leg ${i + 1}'s node`).toBe(1);
      expect(m.flags, `leg ${i + 1}'s flags`).toBe(0x101);
      expect(m.lifetime, `leg ${i + 1}'s lifetime`).toBe(1);
      expect(m.angular, `leg ${i + 1}'s angular block`).toEqual({ w: want[i]![0], accel: want[i]![1] });
    });
    expect(K).toBeCloseTo(0.0008726646, 10);
  });

  it('(b) the view: turned about the eye by the jiggle -- period 4.0 s, yaw +-k/2 (~4.4e-4 rad), pitch 0..k (~8.7e-4) lagging the yaw 1 s; the eye still', () => {
    const world = pageWorld();                                 // started: the node at no turn (its pass's first rotate)
    const cam = camera(13.925);
    const rest = cam.view(1);
    const fwd = unit(sub(rest.aim.target, rest.aim.eye));
    const right = unit([-fwd[2], 0, fwd[0]]);              // FUN_0029bc90's first row
    const up: Vec3 = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
    const yaw: number[] = [], pitch: number[] = [];
    for (let i = 1; i <= 9 * 60; i++) {                         // 9 s: two upward crossings (the review's F2)
      world.step(TICK);
      cam.tick(FEET, 13.925, INIT_AIM_PITCH, rootY('stand'), TICK, true);
      const v = cam.view(1);
      expect(Math.hypot(...sub(v.aim.eye, rest.aim.eye)), 'the eye does not move').toBeLessThan(1e-9);
      const d = unit(sub(v.aim.target, v.aim.eye));
      yaw.push(-dot(d, right));                                // left of the rest look: a turn about the camera's up
      pitch.push(dot(d, up));                                  // above it: a turn about the camera's right
    }
    const max = (a: number[]): number => Math.max(...a), min = (a: number[]): number => Math.min(...a);
    console.log(`LATER 1246 port view jiggle: yaw ${min(yaw).toExponential(3)}..${max(yaw).toExponential(3)}, pitch ${min(pitch).toExponential(3)}..${max(pitch).toExponential(3)} rad`);
    const upsLog: number[] = [];
    for (let i = 1; i < yaw.length; i++) if (yaw[i - 1]! < 0 && yaw[i]! >= 0) upsLog.push((i + 1) / 60);
    console.log(`LATER 1246 port view jiggle: yaw peak at ${((yaw.indexOf(max(yaw)) + 1) / 60).toFixed(3)} s, pitch deepest at ${((pitch.indexOf(min(pitch)) + 1) / 60).toFixed(3)} s, upward zero crossings ${upsLog.map((t) => t.toFixed(3)).join(' ')}`);
    // The legs step once a game frame (CAMERA_EFFECTS_STEP_READING): forward steps of w x dt put the peaks within k x dt
    // of the exact k/2 and k (the yaw's k (1/2 + dt/2) = 4.51e-4, L1246b's +-0.00045).
    expect(Math.abs(max(yaw) - K / 2)).toBeLessThanOrEqual(K * GAME_FRAME_DT);
    expect(Math.abs(min(yaw) + K / 2)).toBeLessThanOrEqual(K * GAME_FRAME_DT);
    expect(Math.abs(max(pitch))).toBeLessThanOrEqual(K * GAME_FRAME_DT);
    expect(Math.abs(min(pitch) + K)).toBeLessThanOrEqual(K * GAME_FRAME_DT);
    // The period: the yaw's upward crossings of 0, 4.0 s apart within a page frame (120 game frames, 4.004 s; L1246b 4.003).
    const ups: number[] = [];
    for (let i = 1; i < yaw.length; i++) if (yaw[i - 1]! < 0 && yaw[i]! >= 0) ups.push((i + 1) / 60);
    expect(ups.length, 'two upward crossings, so the period is measured').toBeGreaterThanOrEqual(2);
    for (let i = 1; i < ups.length; i++) expect(Math.abs(ups[i]! - ups[i - 1]! - 4)).toBeLessThanOrEqual(1 / 60 + 1e-9);
    // The yaw's peak at 1 s, the pitch's deepest at 2 s: the pitch lags the yaw a leg (L1246b: 0.97 s).
    const at = (a: number[], v: number): number => (a.indexOf(v) + 1) / 60;
    expect(Math.abs(at(yaw, max(yaw)) - 1)).toBeLessThanOrEqual(2 / 60);
    expect(Math.abs(at(pitch, min(pitch)) - 2)).toBeLessThanOrEqual(2 / 60);
  });

  it('(c) door_rg_1: at the yaw where the resting ray meets x = 2192.0 the pick flips door <-> wall every 4.0 s, half on; outside the band it stays', () => {
    const doors = new DoorSet(map!.doors ?? [], map!.ground);
    const door = doors.specs.findIndex((d) => d.node === 'door_rg_1');
    expect(door).toBeGreaterThanOrEqual(0);
    const hitX = (yaw: number): number => {
      pageWorld();                                             // the resting ray: a world just started, its node at no turn
      const a = aimOf(camera(yaw));
      return segmentHits(map!.grid, a.eye, a.far, () => true)[0]!.point[0];
    };
    // The yaw at which the port's resting ray meets the door node's x (the hit moves -x as the yaw grows).
    let lo = 13.6, hi = 14.2;
    expect(hitX(lo)).toBeGreaterThan(2192);
    expect(hitX(hi)).toBeLessThan(2192);
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (hitX(m) >= 2192) lo = m; else hi = m; }
    const edge = (lo + hi) / 2;
    console.log(`LATER 1246 port door_rg_1 edge: resting ray meets x = 2192.0 at yaw ${edge.toFixed(4)} deg (the original's ~13.925)`);
    expect(edge).toBeGreaterThan(13.6);
    expect(edge).toBeLessThan(14.2);

    const run = (yaw: number): boolean[] => {
      const cam = camera(yaw);
      const world = pageWorld();
      const on: boolean[] = [];
      for (let i = 1; i <= 8 * 60; i++) {
        world.step(TICK);
        cam.tick(FEET, yaw, INIT_AIM_PITCH, rootY('stand'), TICK, true);
        const a = aimOf(cam);
        on.push(pickDoor(doors, map!.grid, a.eye, a.far, FEET) === door);
      }
      return on;
    };
    // Just inside the band (0.002 degrees on the door's side of the edge, a tenth of the jiggle's 0.025): on at rest, as
    // L1246's standing yaw was (~2.05 s on); exactly on the edge the pass's start (no turn) would sit on the tie.
    const on = run(edge - 0.002);
    const flips: { t: number; to: boolean }[] = [];
    for (let i = 1; i < on.length; i++) if (on[i] !== on[i - 1]) flips.push({ t: (i + 1) / 60, to: on[i]! });
    const duty = on.filter(Boolean).length / on.length;
    console.log(`LATER 1246 port door_rg_1 at the edge: duty ${duty.toFixed(3)}, flips ${flips.map((f) => `${f.t.toFixed(3)}${f.to ? '+' : '-'}`).join(' ')}`);
    expect(flips.length, 'the pick flips over 8 s').toBeGreaterThanOrEqual(3);
    for (const to of [true, false]) {
      const ts = flips.filter((f) => f.to === to).map((f) => f.t);
      for (let i = 1; i < ts.length; i++) expect(Math.abs(ts[i]! - ts[i - 1]! - 4), `the ${to ? 'on' : 'off'} flips 4.0 s apart`).toBeLessThanOrEqual(2 / 60);
    }
    expect(duty).toBeGreaterThan(0.4);
    expect(duty).toBeLessThan(0.6);
    // Outside the band (0.1 degrees either side; the jiggle's yaw is +-0.025): the pick stays put.
    expect(run(edge - 0.1).every(Boolean), 'inside the door: always on').toBe(true);
    expect(run(edge + 0.1).some(Boolean), 'past the edge: always off').toBe(false);
  });
});

const DISC = [process.env.SOCOM_DISC, process.env.SOCOM_PC_ROOT ? join(process.env.SOCOM_PC_ROOT, 'game/disc') : undefined]
  .find((d) => !!d && existsSync(join(d, 'RUN/MP71.ZDB')));

describe.skipIf(!DISC)(`LATER 1246 (d): the multiplayer maps whose sets run camera_jiggle${DISC ? '' : ' (SOCOM_DISC / SOCOM_PC_ROOT absent -- skipped)'}`, () => {
  it('every MP map: which programs move camera_effects, and that each camera_jiggle is MP71\'s', () => {
    const run = join(DISC!, 'RUN');
    const stems = readdirSync(run).filter((f) => /^MP\d+\.ZDB$/i.test(f)).map((f) => f.replace(/\.ZDB$/i, '')).sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));
    const jiggle: string[] = [];
    const movers = new Map<string, Set<string>>();
    let reference: string | null = null;
    for (const stem of stems) {
      const bytes = new Uint8Array(readFileSync(join(run, `${stem}.ZDB`)));
      const toc = parseZdb(bytes);
      if (!toc.some((e) => /(^|[\\/])MZANIM\.ZAR$/i.test(e.name))) continue;
      const archive = parseAnimSets(Zar.parse(zdbMember(bytes, toc, 'MZANIM.ZAR')));
      for (const anim of archive.sets.flatMap((s) => s.anims)) {
        const p = decodeEffectProgram(anim);
        const at = p.nodes.findIndex((n) => n.toLowerCase() === 'camera_effects');
        if (at < 0) continue;
        if (!movers.has(p.name)) movers.set(p.name, new Set());
        movers.get(p.name)!.add(stem);
        if (p.name !== 'camera_jiggle') continue;
        jiggle.push(stem);
        const shape = JSON.stringify({ flags: p.flags, nodes: p.nodes, sequences: p.sequences });
        reference ??= shape;
        expect(shape, `${stem}'s camera_jiggle is MP71's`).toBe(reference);
      }
    }
    console.log(`LATER 1246 sweep: camera_jiggle on ${jiggle.join(', ') || 'none'}; programs naming camera_effects: ${[...movers].map(([n, s]) => `${n} (${[...s].join(' ')})`).join('; ')}`);
    // The review's F3: the sweep's list pinned (the full disc, 2026-11-19), so a reader regression that drops maps fails.
    expect(jiggle).toEqual(['MP2', 'MP6', 'MP7', 'MP8', 'MP9', 'MP10', 'MP11', 'MP12', 'MP51', 'MP52', 'MP53', 'MP61', 'MP64', 'MP71', 'MP72', 'MP73', 'MP81', 'MP82', 'MP83']);
  });
});

/**
 * LATER 1246's review F1: a map with no page world after a jiggle map keeps no turn. The page clears the published node
 * before it builds the next map's world (`main.ts`, the call before `pageWorld = ...`); with none published the view is
 * unturned. Unit test (the module), plus the call's place in `main.ts` (source text).
 */
describe('LATER 1246 F1: no residual turn after a map with no page world', () => {
  it('a published node turns the look; publishing none leaves the look unturned', () => {
    const node = new CameraEffects();
    node.rotate({ op: 'rotate', node: 1, flags: 1, xyz: [0, 0, 0] } as never);
    const leg = node.motion({ op: 'motion', motion: { node: 1, flags: 0x101, lifetime: 1, angular: { w: [0, 0.0008726646, 0], accel: [0, 0, 0] } } } as never);
    for (let i = 0; i < 30; i++) leg(1 / 60);
    publishCameraEffects(node);
    expect(cameraEffectsTurn(), 'a turn is published').not.toBeNull();
    publishCameraEffects(null);
    expect(cameraEffectsTurn(), 'none after the clear').toBeNull();
  });
  it('main.ts clears the node before it builds the page world', () => {
    const src = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
    const clear = src.indexOf('publishCameraEffects(null);'), build = src.indexOf('pageWorld = map.ground && hullGrid ? new WorldState(');
    expect(clear, 'the clear').toBeGreaterThan(0);
    expect(build, 'the build').toBeGreaterThan(clear);
    expect(src.slice(clear, build).split('\n').length, 'the clear right before the build').toBeLessThanOrEqual(3);
  });
});

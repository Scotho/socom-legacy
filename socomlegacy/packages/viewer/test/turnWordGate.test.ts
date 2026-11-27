// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { SEAL_TUNING, type CollisionOwner, type GridParams, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { packGround, WalkMode } from '../src/walk';
import { NetClient } from '../src/net/client';
import { LoopbackMatch, simMapOfLoaded } from '../src/net/loopback';
import { LOOK_RATE_MAX_ADAPTATION, LookGate, lookContextOf, OPEN_LOOK_CONTEXT, type LookGateMode } from '../src/net/lookGate';
import { dqYaw, qYaw } from '../src/net/codec';
import { BAKED_LOADOUT, kitRecords } from '../src/loadout';
import { MAX_YAW_RATE } from '../src/look';
import { TICK, type Walker, type WalkInput } from '../src/mover';
import type { RoomOptions } from '../../match/src/room';

/**
 * R4P-208 fix 2 (seat-movement; simulation track; reading, pending review): the turn band's `t` is the TURN WORD
 * `actor+0x23c` -- the look stick's processed x (the pad reader's dead zone, rescale, circle, curve and ramp) x 1.72 /
 * the scope's magnification, 1.118 at a full push, with no slew past the pad reader's ramp (r0004: the controller
 * 0x59c140 stores it to controller+0x10 at 0x59c798; the actor pass 0x557080 copies it to +0x23c at 0x5575ec; the band
 * 0x58bba0 squares it raw at 0x58bf78-0x58bfac; r0001 `FUN_005966a0` D:L453769-453858, `FUN_00551ec0` D:L418613,
 * `FUN_00586570` D:L444899-444900; FINDING-R4P208-turnword s1). The port holds that word in `LookLaw.axis()` (left
 * positive on the mover: `Walker.turn / turnMaxRate = -axis[0]`).
 *
 * Networked (any match, the test room's offline one included), each tick's `Walker.turn` is the look gate's DERIVED turn
 * (OT.R38: the room derives it, never the page's report). It was the mean of the last 4 ticks' yaw moves
 * (`LOOK_SLACK_TICKS_PLACEHOLDER`), which swings 0.85-1.40 around a push when drawn frames and ticks do not line up
 * (FINDING-R4P208-turnword s1, R4P208-RESCORE-PC2), and each dip lowers the band (0.03 + t^2 x 0.27) under the forward.
 * The controller's ruling (B): the room keeps deriving it, as the law's exact per-tick inverse, steady at 1.118.
 *
 * The one floor: the wire's yaw step (360 / 65536 deg, `qYaw`). A full-push tick turns 2.135 deg (388.7 steps), so a
 * tick's move read off two quantised yaws is within one step of it: the word to within `WIRE_FLOOR` (0.0029).
 */

const DEG = 180 / Math.PI;
const FULL_WORD = MAX_YAW_RATE / SEAL_TUNING.turnMaxRate;                   // 1.118
const YAW_STEP = 360 / 65536;
const WIRE_FLOOR = FULL_WORD * YAW_STEP / (MAX_YAW_RATE * TICK * DEG) + 1e-6;
const BAND = 0.03 + FULL_WORD ** 2 * 0.27;                                // 0.3675
const WALK_EPS = 1e-3;
/** Fold 3's clamp on the derived word (`LookGate.step`): the fastest gain's full push, unscoped -- 1.72 x the fastest gain. */
const CLAMP_WORD = LOOK_RATE_MAX_ADAPTATION.yaw / SEAL_TUNING.turnMaxRate;

/** Uneven drawn frames, seconds: the finding's synthetic cycle (12 / 22 / 30 / 17 ms), and the brief's 50 / 75 Hz pair. */
const CYCLES: Record<string, readonly number[]> = {
  '12/22/30/17 ms': [0.012, 0.022, 0.030, 0.017],
  '1/50, 1/75 s': [1 / 50, 1 / 75],
};

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, 1000, 1000, 0, 1000, 1000, 0, -1000, -1000, 0, -1000]),
};
const OWNERS: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
const ground = () => packGround(PARAMS, [FLOOR], OWNERS);
const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
  side, index, position: [x, 0, z], onFloor: true, step: 2, facing: [1, 0], loc: { map: 0, x: 0, z: 0 },
});
const LOADED = () => ({ path: 'RUN/MP99.ZDB', name: 'FLAT', ground: ground(), slots: [slot(0, 0, -100, 0), slot(1, 0, 100, 0)], respawns: [slot(0, 0, -300, 0)], doors: [] });
const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

const live: LoopbackMatch[] = [];
afterEach(() => { for (const m of live.splice(0)) m.stop(); });

/** One tick as the page's mover ran it: the turn word it ran on and whether the feet moved. */
interface TickRow { word: number; moved: boolean }

/**
 * The page's real `WalkMode` on a loopback room (the rig of `loopbackFreeLook.test.ts`), every tick of the page's mover
 * recorded as it runs (`Walker.tick` wrapped: the turn the band reads that tick), the room stepped once per page tick.
 */
async function rig(lookRate?: RoomOptions['lookRate']) {
  let seed = 1;
  const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const match = new LoopbackMatch(simMapOfLoaded(LOADED()), null, { auto: false, random, ...(lookRate ? { lookRate } : {}) });
  live.push(match);
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined; c.releasePointerCapture = () => undefined; c.hasPointerCapture = () => false;
  const fly = new FlyCamera(c);
  const walk = new WalkMode(fly);
  walk.setGround(ground(), [0, 0, 0]);
  fly.setPose({ x: -100, y: 40, z: 0, yaw: 0, pitch: 0 });
  let forward = 0;
  fly.groundWish = () => ({ forward, right: 0, boost: false });
  const records = kitRecords(null, BAKED_LOADOUT);
  walk.setLookContext((w) => lookContextOf(records[w]));
  new NetClient({ url: 'loopback:', map: 'MP99', name: 'Solo', socket: match.socket }, walk);
  await flush();
  for (let i = 0; i < 60; i++) { fly.update(1 / 60); walk.frame(1 / 60); match.step(); await flush(); }
  const w = walk['walker'] as Walker;
  const rows: TickRow[] = [];
  const tick = w.tick.bind(w);
  w.tick = (input: WalkInput, dt?: number) => {
    const x = w.state.x, z = w.state.z, word = w.turn / SEAL_TUNING.turnMaxRate;
    tick(input, dt);
    rows.push({ word, moved: Math.hypot(w.state.x - x, w.state.z - z) > WALK_EPS });
  };
  /** `n` drawn frames of the cycle `dts`; the rows of the ticks they ran. */
  const frames = async (dts: readonly number[], n: number): Promise<TickRow[]> => {
    const from = rows.length;
    for (let i = 0; i < n; i++) {
      const dt = dts[i % dts.length]!, before = rows.length;
      fly.update(dt);
      walk.frame(dt);
      for (let k = before; k < rows.length; k++) match.step();
      await flush();
    }
    return rows.slice(from);
  };
  return { fly, walk, frames, setForward: (f: number) => { forward = f; } };
}

describe('R4P-208 fix 2: the derived turn is the turn word, every tick, through the page\'s look gate', () => {
  for (const mode of ['free', 'law'] as const) {
    for (const [name, dts] of Object.entries(CYCLES)) {
      it(`(i) ${mode} gate, a full look push held under uneven frames (${name}): the word is ${FULL_WORD.toFixed(3)} on every tick past the ramp`, async () => {
        const r = await rig(mode === 'free' ? 'free' : undefined);
        expect(r.walk['lookGate'].mode).toBe(mode);
        r.fly.setLook(1, 0);                                                // the full push right
        await r.frames(dts, Math.ceil(1.5 / (dts.reduce((a, b) => a + b, 0) / dts.length)));   // the pad ramp (0.42 s) long done
        const held = await r.frames(dts, 120);
        expect(held.length).toBeGreaterThan(60);
        const axis = r.fly.lookState().axis[0];
        expect(axis).toBeCloseTo(FULL_WORD, 9);                               // the law's word, unscoped (zoom 1), no cap
        const worst = Math.max(...held.map((row) => Math.abs(row.word - -axis)));
        expect(worst, `the derived word swings ${Math.min(...held.map((x) => x.word)).toFixed(4)}..${Math.max(...held.map((x) => x.word)).toFixed(4)}`)
          .toBeLessThanOrEqual(WIRE_FLOOR);
      });
    }
  }

  // R4P-208 fold 4: whole-tick frame rates. A frame of two (30 fps) or three (20 fps) ticks begins on a tick (`since` 0),
  // so the page's line from the last tick's command to the frame-end camera yaw spans exactly the frame's ticks and each
  // tick samples one tick's move -- none lays the frame's look on its first, and no honest tick reaches fold 3's clamp.
  for (const mode of ['free', 'law'] as const) {
    for (const [name, dt] of [['30 fps', 1 / 30], ['20 fps', 1 / 20]] as const) {
      it(`(iii) ${mode} gate, a full look push held 2 s at exactly ${name}: every tick reads ${FULL_WORD.toFixed(3)}, none at the clamp`, async () => {
        const r = await rig(mode === 'free' ? 'free' : undefined);
        expect(r.walk['lookGate'].mode).toBe(mode);
        r.fly.setLook(1, 0);                                                // the full push right
        await r.frames([dt], Math.ceil(1.5 / dt));                          // the pad ramp (0.42 s) long done
        const held = await r.frames([dt], Math.round(2 / dt));              // 2 s held: 120 ticks
        expect(held.length).toBe(120);
        expect(r.fly.lookState().axis[0]).toBeCloseTo(FULL_WORD, 9);
        const words = held.map((row) => row.word);
        const shown = words.map((x) => x.toFixed(4)).join(' ');
        const worst = Math.max(...words.map((x) => Math.abs(x - -FULL_WORD)));
        expect(worst, `per-tick words: ${shown}`).toBeLessThanOrEqual(WIRE_FLOOR);
        const peak = Math.max(...words.map((x) => Math.abs(x)));
        expect(peak, `the clamp ${CLAMP_WORD.toFixed(4)}; per-tick words: ${shown}`).toBeLessThan(CLAMP_WORD - WIRE_FLOOR);
      });
    }
  }

  for (const [name, dts] of Object.entries(CYCLES)) {
    it(`(ii) standing after a full look turn (${name}), a forward of 0.3526 held never walks (the band ${BAND.toFixed(4)})`, async () => {
      const r = await rig('free');
      r.fly.setLook(1, 0);
      await r.frames(dts, Math.ceil(2 / (dts.reduce((a, b) => a + b, 0) / dts.length)));   // the look held at full a while
      r.setForward(0.3526);                                                 // 45 / 127 = 0.3543 on the wire: under 0.3675
      const rows = await r.frames(dts, 150);
      // the push lands on a settled word (the second read's check: not ramping, not capped)
      expect(Math.abs(rows[0]!.word - -FULL_WORD)).toBeLessThanOrEqual(WIRE_FLOOR);
      expect(rows.filter((row) => row.moved).length).toBe(0);
    });
  }
});

describe('R4P-208 fix 2: the gate inverts each tick (the room\'s `MoverSim.prepare` runs this same class)', () => {
  for (const mode of ['free', 'law'] as LookGateMode[]) {
    it(`${mode}: a full push sampled at each tick, the first turning tick and every one after carry the word, not a 4-tick mean`, () => {
      const g = new LookGate(mode);
      let ref = { yaw: 0, pitch: 0 };
      for (let i = 0; i < 40; i++) ref = g.step(ref, { yaw: 0, pitch: 0, buttons: 0 }, OPEN_LOOK_CONTEXT);   // armed, at rest
      const words: number[] = [];
      for (let k = 1; k <= 30; k++) {
        const yaw = dqYaw(qYaw(-MAX_YAW_RATE * TICK * DEG * k));            // the full push right, on the wire
        const out = g.step(ref, { yaw, pitch: 0, buttons: 0 }, OPEN_LOOK_CONTEXT);
        ref = { yaw: out.yaw, pitch: out.pitch };
        words.push(out.turn / SEAL_TUNING.turnMaxRate);
      }
      for (const word of words) expect(Math.abs(word - -FULL_WORD)).toBeLessThanOrEqual(WIRE_FLOOR);
    });
  }
});

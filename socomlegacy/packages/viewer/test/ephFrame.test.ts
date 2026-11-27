import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ephFrameOf, type EphFrameSource } from '../src/ephFrame';
import type { CollisionOwner, GridParams, WorldPoly } from '@s2u/scene';
import { groundGrid, packGround, TICK, Walker, type MoverAction } from '../src/mover';

/**
 * The emulator parity harness's page read (EPH-2 step 2; docs/specs/2026-10-30-emulator-parity-harness-design.md,
 * "Per-frame records"): a dev-mode-only instrument, an adaptation (OT.R53, product track) that reads the walk and
 * changes nothing. Absent without `?devmode`: the hook answers null.
 */
const here = dirname(fileURLToPath(import.meta.url));
const main = readFileSync(resolve(here, '../src/main.ts'), 'utf-8');
const hook = readFileSync(resolve(here, '../src/hook.ts'), 'utf-8');
const walk = readFileSync(resolve(here, '../src/walk.ts'), 'utf-8');

const action = (over: Partial<MoverAction> = {}): MoverAction => ({
  name: 'crouchToProne', serial: 4, t: 0.25, seconds: 0.9, reversed: true, ...over,
});

const source = (over: Partial<{ ticks: number; stance: 'stand' | 'crouch' | 'prone'; posture: 'stand' | 'crouch' | 'prone'; action: MoverAction | null; walking: boolean; feet: [number, number, number]; yaw: number }> = {}): EphFrameSource => {
  const o = { ticks: 812, stance: 'crouch' as const, posture: 'crouch' as const, action: action(), walking: true, feet: [939.44, -145.87, 857.07] as [number, number, number], yaw: 180, ...over };
  return {
    ticks: () => o.ticks,
    stance: () => o.stance,
    posture: () => o.posture,
    snapshot: () => (o.walking ? { action: o.action, feet: o.feet, yaw: o.yaw } : null),
  };
};

/** EPH-TILT: the tilt fields of a build without PRONE-TILT's `Walker.rootTilt`, or a walk without a walker. */
const NO_TILT = {
  rootQx: null, rootQy: null, rootQz: null, rootQw: null, rootUpX: null, rootUpY: null, rootUpZ: null,
  tiltNx: null, tiltNy: null, tiltNz: null, topClip: null, topPhase: null, stickForward: null, stickLateral: null,
  animPlay: null, animClip: null, animPhase: null, rootHeight: null, turn: null, turnMemory: null,
};

describe('ephFrameOf', () => {
  it('is null without devmode, whatever the walk holds', () => {
    expect(ephFrameOf(false, source())).toBeNull();
    expect(ephFrameOf(false, source({ walking: false }))).toBeNull();
  });

  it('with devmode reads the tick, the stance, the posture and the action holding the mover', () => {
    expect(ephFrameOf(true, source())).toEqual({
      tick: 812, stance: 'crouch', posture: 'crouch', walking: true,
      action: { name: 'crouchToProne', t: 0.25, reversed: true },
      x: 939.44, y: -145.87, z: 857.07, yaw: 180, ...NO_TILT,
      // LATER 1165 (c): no walker to read the tick's own state off -- the snapshot's (blended) feet, said so.
      feetFrom: 'blended', drawnX: 939.44, drawnY: -145.87, drawnZ: 857.07, prevX: null, prevY: null, prevZ: null,
    });
  });

  it('gives a null action when none holds the mover, and when the walk is off (fly mode)', () => {
    expect(ephFrameOf(true, source({ action: null }))?.action).toBeNull();
    const fly = ephFrameOf(true, source({ walking: false, stance: 'stand', posture: 'stand' }));
    expect(fly).toEqual({
      tick: 812, stance: 'stand', posture: 'stand', walking: false, action: null, x: null, y: null, z: null, yaw: null, ...NO_TILT,
      feetFrom: null, drawnX: null, drawnY: null, drawnZ: null, prevX: null, prevY: null, prevZ: null,
    });
  });

  it('reads the simulated feet and the yaw (degrees, Pose.yaw) as plain numbers, copied off the snapshot', () => {
    const feet: [number, number, number] = [1, 2, 3];
    const f = ephFrameOf(true, source({ feet, yaw: 270.5 }))!;
    feet[0] = 99;
    expect([f.x, f.y, f.z, f.yaw]).toEqual([1, 2, 3, 270.5]);
  });

  it('copies the action, so a later change on the mover does not reach a frame already read', () => {
    const a = action({ t: 0.1 });
    const f = ephFrameOf(true, source({ action: a }))!;
    a.t = 0.5;
    expect(f.action?.t).toBe(0.1);
  });
});

describe("the tilt read (EPH-TILT): PRONE-TILT's Walker.rootTilt, feature-detected, read only", () => {
  const tiltWalker = (over: Record<string, unknown> = {}) => {
    const state = { q: [0.1736, 0, 0, 0.9848] as number[] | null, up: [0, 0.9397, -0.342], normal: [0, 0.9397, -0.342] };
    return {
      get rootTilt() { return { q: state.q && [...state.q], up: [...state.up] }; },
      get tiltNormal() { return [...state.normal]; },
      tiltTop: () => ({ clip: 'seal_prone', phase: 0.5, diving: false, proneTransition: false }),
      state,
      ...over,
    };
  };
  const withWalker = (w: object | null): EphFrameSource => ({ ...source(), ephWalker: () => w });

  it('reads the root quaternion, the root up, the floor normal it used, and the top clip and phase', () => {
    const f = ephFrameOf(true, withWalker(tiltWalker()))!;
    expect([f.rootQx, f.rootQy, f.rootQz, f.rootQw]).toEqual([0.1736, 0, 0, 0.9848]);
    expect([f.rootUpX, f.rootUpY, f.rootUpZ]).toEqual([0, 0.9397, -0.342]);
    expect([f.tiltNx, f.tiltNy, f.tiltNz]).toEqual([0, 0.9397, -0.342]);
    expect([f.topClip, f.topPhase]).toEqual(['seal_prone', 0.5]);
  });

  it("gives a null quaternion when the rule wrote none (the clip's root stands), the up still read", () => {
    const w = tiltWalker();
    w.state.q = null;
    const f = ephFrameOf(true, withWalker(w))!;
    expect([f.rootQx, f.rootQy, f.rootQz, f.rootQw]).toEqual([null, null, null, null]);
    expect(f.rootUpY).toBe(0.9397);
  });

  it('writes null for every tilt field on a build without rootTilt (a tree without PRONE-TILT), and with no walker', () => {
    const bare = { state: {} };
    expect(ephFrameOf(true, withWalker(bare))).toMatchObject(NO_TILT);
    expect(ephFrameOf(true, withWalker(null))).toMatchObject(NO_TILT);
    expect(ephFrameOf(true, source())).toMatchObject(NO_TILT);
    const noTop = tiltWalker({ tiltTop: undefined });
    const f = ephFrameOf(true, withWalker(noTop))!;
    expect([f.topClip, f.topPhase]).toEqual([null, null]);
    expect(f.rootUpY).toBe(0.9397);
  });

  it("reads only: the walker's state is the same after the read", () => {
    const w = tiltWalker();
    const before = JSON.stringify(w.state);
    const f = ephFrameOf(true, withWalker(w))!;
    expect(JSON.stringify(w.state)).toBe(before);
    expect(f.rootQx).toBe(0.1736);
  });

  it('reads the move axes the walker ran the tick on (Walker.cutStick: actor+0x240 forward, +0x244 lateral)', () => {
    const f = ephFrameOf(true, withWalker(tiltWalker({ cutStick: { forward: 1, right: -1 } })))!;
    expect([f.stickForward, f.stickLateral]).toEqual([1, -1]);
    expect(ephFrameOf(true, withWalker({ cutStick: { forward: 'x' } }))).toMatchObject({ stickForward: null, stickLateral: null });
  });

  it("R4P-208 fold 3 (a test-harness adaptation): reads the walker's turn (rad/s, Walker.turn) and its turn memory, read only", () => {
    const f = ephFrameOf(true, withWalker(tiltWalker({ turn: 2.236, turnMemory: 'turning' })))!;
    expect([f.turn, f.turnMemory]).toEqual([2.236, 'turning']);
    expect(ephFrameOf(true, withWalker({ turn: 'x', turnMemory: 3 }))).toMatchObject({ turn: null, turnMemory: null });
    expect(ephFrameOf(true, withWalker(null))).toMatchObject({ turn: null, turnMemory: null });
  });

  it('WalkMode hands the harness its walker for the read (./walk ephWalker)', () => {
    expect(walk).toMatch(/ephWalker\(\): object \| null \{/);
  });
});

/**
 * The hunt (agent-mail/evidence/eph-hunt-2026-11-01 REPORT M8 (d), S-notes): page.csv's topClip is the walker's
 * tiltTop (stance clips only) and stays seal_stand while running, so the PS2's clip ladders (Walk 2 -> Jog 3 -> Run 4,
 * the strafes) had nothing to compare to. The read takes the animator's play -- its key, its dominant node's clip and
 * phase -- and the posed root's height over the feet, as PCSX2's side logs its action ids and root y.
 */
describe('the anim read (the hunt fix 3): the play, its dominant clip and phase, the posed root height', () => {
  const anim = (over: Partial<{ clip: string; frame: number; frames: number; play: string }> | null = {}, root: number | null = 10.25) => ({
    animStats: () => (over === null ? null : { clip: 'seal_run', frame: 6, frames: 24, play: 'loco:stand', ...over }),
    rootY: () => root,
  });

  it('reads the play key, the main clip, its phase (frame over frames) and the posed root over the feet', () => {
    const f = ephFrameOf(true, source(), anim())!;
    expect([f.animPlay, f.animClip, f.animPhase, f.rootHeight]).toEqual(['loco:stand', 'seal_run', 0.25, 10.25]);
  });

  it('null for each when there is no animator, no play yet, or an empty play', () => {
    expect(ephFrameOf(true, source())).toMatchObject({ animPlay: null, animClip: null, animPhase: null, rootHeight: null });
    expect(ephFrameOf(true, source(), anim(null, null))).toMatchObject({ animPlay: null, animClip: null, animPhase: null, rootHeight: null });
    expect(ephFrameOf(true, source(), anim({ clip: '', frames: 0, play: '' }))).toMatchObject({ animPlay: null, animClip: null, animPhase: null });
  });

  it('is still null without devmode, the anim source unread', () => {
    let read = 0;
    const a = { animStats: () => { read++; return null; }, rootY: () => { read++; return null; } };
    expect(ephFrameOf(false, source(), a)).toBeNull();
    expect(read).toBe(0);
  });
});

describe('the hook wiring', () => {
  it('declares ephFrame on the hook, answering an EphFrame or null', () => {
    expect(hook).toMatch(/ephFrame\(\): EphFrame \| null;/);
  });

  it('hangs ephFrame on __viewer, gated on the bare devmode switch of ./source, reading the walk', () => {
    expect(main).toMatch(/const EPH_ON = devMode\(SEARCH\);/);
    expect(main).toMatch(/ephFrame: \(\) => ephFrameOf\(EPH_ON, walk, play\),/);
  });

  it('R4P-208 re-score 2: hangs ephWalker on __viewer, read only, gated on the same devmode switch (the EPH turn log)', () => {
    expect(hook).toMatch(/ephWalker\(\): object \| null;/);
    expect(main).toMatch(/ephWalker: \(\) => \(EPH_ON \? walk\.ephWalker\(\) : null\),/);
  });
});

/**
 * LATER 1165 (c) (product track, the harness): page.csv's feet were `Walker.tickFeet()` -- the feet BLENDED between the
 * last two ticks by the render moment's alpha, filed against the tick counter -- so an accelerating body read part of a
 * tick's move short and per-row moves scattered. The read now gives the walker's OWN state at the tick it stamps (x/y/z,
 * `feetFrom: 'tick'`), the tick before it (prev*, to fill a tick a frame skipped), and the blended feet as drawn*.
 */
describe("LATER 1165 (c): the tick's own state, not the feet blended at the render moment", () => {
  /** A body ramping from rest: after tick k its x is k(k+1)/12 (each tick's move 1/6 longer than the last). */
  const ramp = (k: number): number => (k * (k + 1)) / 12;

  /** The page at time `t` s: `floor(60 t)` ticks run, the accumulator's alpha the rest; the walker's state and prev. */
  function pageAt(t: number): EphFrameSource {
    const k = Math.floor(t / TICK + 1e-9), alpha = t / TICK - k;
    const state = { x: ramp(k), y: 0, z: 0 }, prev = { x: ramp(Math.max(0, k - 1)), y: 0, z: 0 };
    const blended: [number, number, number] = [prev.x + (state.x - prev.x) * alpha, 0, 0];
    return {
      ticks: () => k, stance: () => 'stand', posture: () => 'stand',
      snapshot: () => ({ action: null, feet: blended, yaw: 180 }),
      ephWalker: () => ({ state, prev }),
    };
  }

  it('a ramp from rest sampled at 59 Hz records k(k+1)/12 EXACTLY at every row, and prev the tick before', () => {
    let rows = 0, blendedOff = 0;
    for (let f = 1; f <= 300; f++) {
      const r = ephFrameOf(true, pageAt(f / 59))!;
      expect(r.feetFrom).toBe('tick');
      expect(r.x, `row ${f}, tick ${r.tick}`).toBe(ramp(r.tick));
      expect(r.prevX).toBe(ramp(Math.max(0, r.tick - 1)));
      if (Math.abs(r.drawnX! - r.x!) > 1e-9) blendedOff++;
      rows++;
    }
    expect(rows).toBe(300);
    expect(blendedOff).toBeGreaterThan(200);   // the blended feet, kept as drawn*, are mostly short of the tick's state
  });

  it("a real Walker: the read's x/z are the state its last tick left, and prev the one before (mover.ts advance)", () => {
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
    const floor: WorldPoly = {
      modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
    };
    const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
    const w = new Walker(groundGrid(packGround(params, [floor], owners)));
    w.place(0, 20, 0);
    w.settle();
    let ticks = 0;
    const states: { x: number; z: number }[] = [];
    const src: EphFrameSource = {
      ticks: () => ticks, stance: () => 'stand', posture: () => 'stand',
      snapshot: () => ({ action: null, feet: w.tickFeet(), yaw: 0 }),
      ephWalker: () => w,
    };
    // R4P-208 fold 3: a real Walker answers its turn and its turn memory (a read-only getter on `turnMemory_`).
    expect(w.turnMemory).toBe('none');
    expect(ephFrameOf(true, src)).toMatchObject({ turn: 0, turnMemory: 'none' });
    let differs = 0;
    for (let f = 0; f < 120; f++) {
      w.advance(1 / 59, { forward: 0, right: 1, boost: false }, () => { ticks++; states[ticks] = { x: w.state.x, z: w.state.z }; });
      const r = ephFrameOf(true, src)!;
      if (ticks < 2) continue;
      expect(r.feetFrom).toBe('tick');
      expect(r.x).toBe(states[ticks]!.x);
      expect(r.z).toBe(states[ticks]!.z);
      expect(r.prevX).toBe(states[ticks - 1]!.x);
      if (Math.abs(r.drawnX! - r.x!) + Math.abs(r.drawnZ! - r.z!) > 1e-6) differs++;
    }
    expect(differs).toBeGreaterThan(0);        // moving, the blended feet differ from the tick's state
  });
});

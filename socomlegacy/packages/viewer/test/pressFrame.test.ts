// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildGrid, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { PRESS_FRAME_READING, pressFrameTiming, setPressFrameTiming, throttleFrameEnds, Walker, type WalkInput } from '../src/mover';

/**
 * LATER 1219 (simulation track; the owner's ruling, 2026-11-21, MISSION R8's 1219 line -- the main controller's ruling (a),
 * 2026-11-18, opened it; reading, pending review): the original
 * reads its pad once a game frame -- `FUN_00551ec0` copies the axes before the driver on each actor tick
 * (D:L418613-418615), and the actor ticks once a 30 Hz frame -- so a press that lands between two frame ends is first
 * seen at the next frame's start. The port's 60 Hz tick read it on its own tick, so the ticks that paired into a frame
 * depended on where the press fell: at MP81 (LATER 1194's dev-disc case, the fresh review's F3) a press after 30 still
 * ticks slid along the far wall where one after 31 held, as the original's always does.
 * Here: a pad seat (`Walker.idleFrame`) moves the same frame by frame whichever tick of a frame the press lands on, the
 * frame moves those of a press on the frame's start; an AI seat (`idleFrame` false, the planner's stick every tick, the
 * BOT ADAPTATION) is unchanged.
 */

function flat(): Walker {
  const p: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-2000, 0, -2000, 2000, 0, -2000, 2000, 0, 2000, -2000, 0, 2000]) };
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 1000, cellsX: 4, cellsZ: 4, originX: -2000, originZ: -2000 };
  const owners: CollisionOwner[] = [{ modelName: p.modelName, path: 'floor0', first: 0, count: 1 }];
  const w = new Walker(buildGrid(params, [], [], [p], owners));
  w.place(0, 1, 0);
  w.state.yaw = -90;
  return w;
}

const STILL: WalkInput = { forward: 0, right: 0, boost: false };
const RIGHT: WalkInput = { forward: 0, right: 1, boost: false };

/** The moves of the first `frames` game frames from the first frame that moved, after `still` still ticks then a press. */
function frameMoves(still: number, frames: number, ai = false, pressFrame = true): number[] {
  const w = flat();
  w.idleFrame = !ai;
  w.pressFrame = pressFrame;
  for (let i = 0; i < still; i++) w.tick(STILL);
  const ends: number[] = [];
  let n = still, last = Math.hypot(w.state.x, w.state.z), started = false;
  const out: number[] = [];
  for (let i = 0; i < 40 && out.length < frames; i++) {
    w.tick(RIGHT);
    n++;
    if (throttleFrameEnds(n)) {
      const at = Math.hypot(w.state.x, w.state.z), d = at - last;
      last = at;
      ends.push(n);
      if (d > 1e-9) started = true;
      if (started) out.push(Number(d.toFixed(3)));
    }
  }
  return out;
}

describe('LATER 1219: a pad seat\'s press is read at the game frame\'s start (FUN_00551ec0 D:L418613-418615)', () => {
  it('a press after 30 or after 31 still ticks gives the same frame moves', () => {
    expect(frameMoves(30, 5)).toEqual(frameMoves(31, 5));
  });
  it('the frame moves are the strafe start the original shows: 0.36, 0.72, 1.08, 1.44, 1.80 within 0.01 (LATER 1164)', () => {
    const got = frameMoves(30, 5);
    [0.362, 0.722, 1.082, 1.443, 1.803].forEach((want, k) => expect(Math.abs(got[k]! - want), `frame ${k + 1}: ${got[k]}`).toBeLessThan(0.01));
  });
  it('an AI seat (idleFrame false) still reads every tick: its phases differ', () => {
    expect(frameMoves(30, 5, true)).not.toEqual(frameMoves(31, 5, true));
  });
  it('the built value is the frame\'s start (PRESS_FRAME_READING), and a new mover takes it', () => {
    expect(PRESS_FRAME_READING).toBe('frame-start');
    expect(pressFrameTiming()).toBe('frame-start');
    expect(flat().pressFrame).toBe(null);                          // follows the process's timing
  });
  it("the PLAYTEST INSTRUMENT: the process's timing flips every mover that follows it, and is put back", () => {
    const follow = (still: number): number[] => { const w = flat(); for (let i = 0; i < still; i++) w.tick(STILL); const out: number[] = []; let last = 0; for (let i = 0; i < 12; i++) { w.tick(RIGHT); const at = Math.hypot(w.state.x, w.state.z); out.push(Number((at - last).toFixed(4))); last = at; } return out; };
    const held = follow(30);
    try {
      setPressFrameTiming('at-once');
      expect(follow(30)).not.toEqual(held);
      expect(follow(30)[0]).toBeGreaterThan(0);                    // at once: the press tick itself moves
    } finally { setPressFrameTiming(PRESS_FRAME_READING); }
    expect(follow(30)).toEqual(held);
  });
  it('the other timing (pressFrame false, the playtest instrument\'s): the press is read on its own tick, the phases differ', () => {
    expect(frameMoves(30, 5, false, false)).not.toEqual(frameMoves(31, 5, false, false));
    expect(frameMoves(31, 5, false, false)).toEqual(frameMoves(31, 5));   // a press on a frame's start: the same either way
  });
  it('ONLY the move stick is held: on the held tick the body stays, and a look turned on that tick is the mover\'s at once', () => {
    for (const still of [30, 31]) {
      const w = flat();
      for (let i = 0; i < still; i++) w.tick(STILL);
      const x = w.state.x, z = w.state.z;
      w.state.yaw = -47; w.state.pitch = 12; w.turn = 0.5;         // the look this tick's command carries (`./walk`, `MoverSim.prepare`)
      w.tick(RIGHT);
      expect([w.state.yaw, w.state.pitch], `still ${still}: the look`).toEqual([-47, 12]);
      const moved = Math.hypot(w.state.x - x, w.state.z - z) > 1e-9;
      expect(moved, `still ${still}: moved on the press tick`).toBe(still === 31);   // tick 31 ends a frame (held), tick 32 starts one
      w.tick(RIGHT);
      expect(Math.hypot(w.state.x - x, w.state.z - z), `still ${still}: the tick after`).toBeGreaterThan(1e-9);   // never more than one tick later here
    }
  });
  it('a release and a press again inside one frame are not a press from rest the frame saw: IDLE-FRAME holds the walk, no stop', () => {
    const w = flat();
    for (let i = 0; i < 31; i++) w.tick(STILL);
    for (let i = 0; i < 20; i++) w.tick(RIGHT);                    // ticks 32..51: tick 51 ends a frame, tick 52 starts one
    const at = (): number => Math.hypot(w.state.x, w.state.z);
    const a = at(); w.tick(STILL);                                 // tick 52: a centre between two frame ends, not read
    const b = at(); w.tick(RIGHT);                                 // tick 53: pressed again
    const c = at();
    expect(b - a).toBeGreaterThan(1e-9);
    expect(c - b).toBeGreaterThan(1e-9);
  });

  // The walls trial (2026-11-21; match/test/roomDoorHold.test.ts's RED): a stick held THROUGH a clip that does not obey it
  // (a stance change's, a door's push) was read on the clip's frames -- the original copies the pad's axes every actor
  // tick, whatever plays (`FUN_00551ec0` D:L418613-418615) -- so the first ground tick after the clip obeys it at once,
  // as with the press timing at once; only a press that is new since the last frame's start waits for the next.
  it('a stick held through a clip is read on the clip\'s frames: the first ground tick after it moves at once, as at-once', () => {
    const after = (pressFrame: boolean, rest: number): number[] => {
      const w = flat();
      w.pressFrame = pressFrame;
      for (let i = 0; i < rest; i++) w.tick(STILL);
      w.changeStance('crouch');
      let n = 0;
      while (w.action !== null && n < 120) { w.tick(RIGHT); n++; }  // held through the clip
      expect(n, 'a clip played').toBeGreaterThan(4);
      const moves: number[] = [];
      for (let i = 0; i < 4; i++) { const x = w.state.x, z = w.state.z; w.tick(RIGHT); moves.push(Math.hypot(w.state.x - x, w.state.z - z)); }
      return moves;
    };
    for (const rest of [31, 32]) {                                  // the clip's end on either phase of a frame
      const held = after(true, rest), atOnce = after(false, rest);
      expect(held[0], `rest ${rest}: the first ground tick moves: ${held.map((m) => m.toFixed(4)).join(' ')}`).toBeGreaterThan(1e-6);
      held.forEach((m, i) => expect(m, `rest ${rest}, tick ${i + 1}`).toBeCloseTo(atOnce[i]!, 9));
    }
  });
});

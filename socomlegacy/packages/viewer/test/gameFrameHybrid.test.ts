// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Group, Quaternion } from 'three';
import {
  buildGrid, GAME_FRAME_DT, GameFrameAccumulator, HELD_RIFLE, M67, SEAL_TUNING, tumbleQuaternion,
  type CollisionOwner, type Grid, type GridParams, type WeaponRecord, type WorldPoly,
} from '@s2u/scene';
import { Accuracy, type AccuracyInput } from '../src/accuracy';
import { FlyCamera } from '../src/camera';
import { GrenadeThrower } from '../src/grenade';
import { FULL_AXIS, LOOK_GAIN, RAMP_PER_SECOND } from '../src/look';
import { moverSnapshot, runningJumpSpeed, Walker, type WalkInput } from '../src/mover';
import { WalkMode, type PlaySnapshot } from '../src/walk';
import { packGround } from '../src/mover';

/**
 * MISSION R8 (the owner, 2026-10-04: "the speed is good, but the feeling was wrong"; "agreed on hybrid. make this a
 * known deviation"; research 208 section 9). Only the trajectories keep the original's exact 30 Hz steps -- the jump and
 * every fall (`Walker`'s `airClock`) and a grenade's or a launched round's flight (`GrenadeThrower`'s `flight`) -- and
 * they are DRAWN between game frames by `GameFrameAccumulator.alpha()`, the simulation untouched. Everything else runs
 * continuously at the page's rate with its per-frame constant turned into its exact per-second equivalent: the bloom's
 * dilate and the turn ramp here; the pad is read every drawn frame.
 */

const STILL: WalkInput = { forward: 0, right: 0, boost: false };
const FORWARD: WalkInput = { forward: 1, right: 0, boost: false };
const PAGE = 1 / 240;                                            // a 240 Hz display: four drawn frames a 60 Hz tick

function plain(): Grid {
  const poly: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-2000, 0, -2000, 2000, 0, -2000, 2000, 0, 2000, -2000, 0, 2000]),
  };
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 1000, cellsX: 4, cellsZ: 4, originX: -2000, originZ: -2000 };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  return buildGrid(params, [], [], [poly], owners);
}

/** The heights a flat running jump takes frame by frame (FUN_005af930's delay first, then FUN_0059b440: v, then y). */
function jumpHeights(): number[] {
  const g = SEAL_TUNING.gravity;
  const out: number[] = [];
  let y = 0, vy = 0, delay = 0.1;
  for (let f = 0; f < 40; f++) {
    if (delay > 0) { delay -= GAME_FRAME_DT; if (delay <= 1e-9) { delay = 0; vy = runningJumpSpeed(); } }
    vy -= g * GAME_FRAME_DT;
    y += vy * GAME_FRAME_DT;
    if (y <= 0 && delay === 0) break;
    out.push(y);
  }
  return out;
}

describe('the trajectories drawn between game frames (MISSION R8)', () => {
  it('the jump: the drawn height moves on every drawn frame, mid-frame between the last two game-frame heights; the simulated one steps', () => {
    const w = new Walker(plain());
    w.place(0, 10, 0);
    for (let i = 0; i < 240; i++) w.advance(PAGE, FORWARD);     // a second's run: 65 a second
    expect(w.jump()).toBe(true);
    const sim: number[] = [];                                    // the distinct simulated heights, in order
    let last = w.state.y, drawnBefore = w.drawnFeet()[1], frameAt = -1, checkedMid = 0, i = 0;
    while (w.airborne && i < 2000) {
      i++;
      w.advance(PAGE, STILL);
      const y = w.state.y, drawn = w.drawnFeet()[1];
      if (!w.airborne) break;
      if (y !== last) { sim.push(y); frameAt = i; last = y; }
      if (sim.length >= 2) {
        // No hold once the first game frame is drawn (the drawing lags it by a tick): the old drawing held the 30 Hz step
        // for a whole 60 Hz tick (four drawn frames here).
        expect(drawn, `drawn frame ${i}`).not.toBe(drawnBefore);
      }
      if (sim.length >= 1) {
        // The drawn height lags the simulation by at most a game frame: within the last three game-frame heights.
        const near = [sim[sim.length - 1]!, sim[sim.length - 2] ?? 0, sim[sim.length - 3] ?? 0];
        expect(drawn).toBeGreaterThanOrEqual(Math.min(...near) - 1e-9);
        expect(drawn).toBeLessThanOrEqual(Math.max(...near) + 1e-9);
      }
      if (sim.length >= 2 && i === frameAt + 4) {
        // A 60 Hz tick after the game frame ran, about half-way to the next: strictly between the previous and the current.
        const [a, b] = [sim[sim.length - 2]!, sim[sim.length - 1]!];
        expect(drawn).toBeGreaterThan(Math.min(a, b));
        expect(drawn).toBeLessThan(Math.max(a, b));
        checkedMid++;
      }
      drawnBefore = drawn;
    }
    expect(checkedMid).toBeGreaterThan(10);
    // The simulation is the original's 30 Hz steps, unchanged: the heights are FUN_0059b440's frame by frame.
    const want = jumpHeights();
    expect(sim.length).toBe(want.length);
    sim.forEach((y, k) => expect(y, `frame ${k + 1}`).toBeCloseTo(want[k]!, 9));
  });

  it('a grenade: the drawn position and tumble are the last two game frames\' by alpha (the turn slerped); the simulated ones step', () => {
    const snap = { feet: [100, 50, 200], yaw: 90, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand', landing: null, jumps: 0 } as unknown as PlaySnapshot;
    const g = new GrenadeThrower({ grid: (): Grid | null => null, snapshot: () => snap, view: () => 'third' });
    const template = new Group();
    template.name = 'interp-model';
    g.setMap({ [M67.model]: template }, null);
    g.launchRemote('M67', [0, 500, 0], [300, 40, 0]);
    const acc = new GameFrameAccumulator();
    let prev = g.stats().live[0]!, cur = prev, mid = 0;
    for (let i = 1; i <= 80; i++) {
      const before = g.stats().live[0]!;
      g.update(PAGE);
      const frames = acc.advance(PAGE);
      const now = g.stats().live[0]!;
      if (frames > 0) { prev = before; cur = now; } else expect(now.pos).toEqual(before.pos);   // the flight steps at 30 Hz only
      const t = acc.alpha();
      const model = g.object.children.find((o) => o.name === 'interp-model')!;
      for (let k = 0; k < 3; k++) expect(model.position.getComponent(k), `frame ${i} axis ${k}`).toBeCloseTo(prev.pos[k]! + (cur.pos[k]! - prev.pos[k]!) * t, 9);
      const q = new Quaternion().slerpQuaternions(new Quaternion(...tumbleQuaternion(prev.tumble)), new Quaternion(...tumbleQuaternion(cur.tumble)), t);
      expect(Math.abs(model.quaternion.dot(q))).toBeCloseTo(1, 9);
      if (cur !== prev && t > 0.3 && t < 0.7) {
        expect(model.position.x).toBeGreaterThan(prev.pos[0]!);
        expect(model.position.x).toBeLessThan(cur.pos[0]!);
        mid++;
      }
    }
    expect(mid).toBeGreaterThan(5);
  });
});

describe('the drawing stays the drawing (MISSION R8, the fix round)', () => {
  /** A Walker a second into a run, then jumped. */
  const jumped = (): Walker => {
    const w = new Walker(plain());
    w.place(0, 10, 0);
    for (let i = 0; i < 240; i++) w.advance(PAGE, FORWARD);
    expect(w.jump()).toBe(true);
    return w;
  };

  it('a net correction nudging the height after each tick never steps the drawn height back while the jump rises', () => {
    // The net client's `applyCorrection` moves `state.y` after the tick (`WalkMode.nudge`): the drawn height must carry
    // that move into the next tick's start, not drop it and saw-tooth at 60 Hz.
    const w = jumped();
    let before = w.drawnFeet()[1], rising = 0, i = 0;
    while (i < 400) {
      i++;
      w.advance(PAGE, STILL, () => { w.state.y += 1; });             // a correction of 1 unit after every tick
      if (!w.airborne) break;
      const drawn = w.drawnFeet()[1];
      if (w.state.vy > 0 && w.state.y > 0) {
        expect(drawn, `drawn frame ${i}`).toBeGreaterThanOrEqual(before - 1e-9);
        rising++;
      }
      before = drawn;
    }
    expect(rising).toBeGreaterThan(20);
  });

  it("the snapshot's feet -- the throws', the muzzle's and the room's start points -- are the simulated height; only drawnFeet is drawn", () => {
    const w = jumped();
    let differ = 0;
    for (let i = 0; i < 120 && w.airborne; i++) {
      w.advance(PAGE, STILL);
      const snap = moverSnapshot(w, null, 0, 0);
      expect(snap.feet).toEqual(w.tickFeet());                      // the feet between the last two ticks, as before R8
      expect(snap.drawnFeet).toBeUndefined();                      // the room's bodies carry no drawing
      if (Math.abs(w.drawnFeet()[1] - w.tickFeet()[1]) > 1e-6) differ++;
    }
    expect(differ).toBeGreaterThan(20);
  });
});

describe('the camera on the drawn jump (MISSION R8)', () => {
  it('the third-person camera rises with the drawn feet on every drawn frame; the shot\'s eye stays on the simulated height', () => {
    const ground = packGround(
      { atomCount: 8192, posts: 16, cellDim: 1000, cellsX: 4, cellsZ: 4, originX: -2000, originZ: -2000 },
      [{ modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from([-2000, 0, -2000, 2000, 0, -2000, 2000, 0, 2000, -2000, 0, 2000]) }],
      [{ modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1 }],
    );
    const fly = new FlyCamera(canvas());
    fly.setScale(0.1);
    const mode = new WalkMode(fly, () => undefined);
    mode.setGround(ground, [0, 0, 0]);
    fly.setPose({ x: 0, y: 40, z: 0, yaw: 0, pitch: 0 });
    expect(mode.setMode('walk')).toBe(true);
    globalThis.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    for (let i = 0; i < 240; i++) { fly.update(PAGE); mode.frame(PAGE); }
    globalThis.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    expect(mode.jump()).toBe(true);
    let camBefore = fly.pose().y, claimBefore = mode.fireAim()!.eye[1], moved = 0, claimHeld = 0, snapsApart = 0, i = 0;
    const startY = mode.feet()![1];
    while (mode.mover()!.airborne && i < 400) {
      i++;
      fly.update(PAGE); mode.frame(PAGE);
      if (!mode.mover()!.airborne) break;
      const cam = fly.pose().y, claim = mode.fireAim()!.eye[1];
      if (i > 24) {                                             // past the wind-up's first drawn game frames
        expect(cam, `drawn frame ${i}`).not.toBe(camBefore);    // the drawn camera never holds a 30 Hz step
        moved++;
        if (claim === claimBefore) claimHeld++;                  // the claim keeps the simulation's 30 Hz steps
        const snap = mode.snapshot()!;
        expect(snap.drawnFeet).toEqual(mode.drawnFeet());        // the page's body is drawn at the drawn feet ...
        if (Math.abs(snap.feet[1] - mode.drawnFeet()![1]) > 1e-6) snapsApart++;   // ... its start points are not
      }
      camBefore = cam; claimBefore = claim;
    }
    expect(mode.feet()![1]).toBe(startY);
    expect(moved).toBeGreaterThan(60);
    expect(claimHeld).toBeGreaterThan(10);
    expect(snapsApart).toBeGreaterThan(30);
    mode.unbindKey();
  });
});

describe('the continuous laws at their per-second equivalents (MISSION R8)', () => {
  /** The SD standing with half its dilate, so a second of opening stays under TargetMax. */
  const halfDilate: WeaponRecord = { ...HELD_RIFLE, stances: { ...HELD_RIFLE.stances, stand: { ...HELD_RIFLE.stances.stand, dilateMove: 0.5 } } };
  const running: AccuracyInput = { stance: 'stand', velocity: [65, 0, 0], airborne: false, yawRate: 0, pitchRate: 0, zoomState: 0 };

  it('the bloom opens TargetDilateUponMovement / GAME_FRAME_DT a second, at 144 Hz page frames and at 60 Hz commands alike', () => {
    for (const dt of [1 / 144, 1 / 60]) {
      const a = new Accuracy(halfDilate);
      let before = a.state().size;
      const n = Math.round(1 / dt);
      for (let i = 0; i < n; i++) {
        a.update(dt, running);
        expect(a.state().size, `dt ${dt} frame ${i}`).toBeGreaterThan(before);   // no frame holds it
        before = a.state().size;
      }
      expect(a.state().size).toBeCloseTo(1 + 0.5 / GAME_FRAME_DT, 9);              // 1 + 0.5 x 29.97 over 1 s
    }
  });

  it('the turn ramp grows RAMP_PER_SECOND continuously: full in 0.65 / RAMP_PER_SECOND = 0.4185 s, the yaw its right sum', () => {
    const fly = new FlyCamera(canvas());
    fly.setPose({ yaw: 0, pitch: 0 });
    fly.setWalking(true);
    fly.setPitchLimits(-70, 60);
    globalThis.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' }));
    let want = 0, full = -1;
    for (let i = 1; i <= 240; i++) {
      fly.update(PAGE);
      want += SEAL_TUNING.turnMaxRate * LOOK_GAIN * Math.min(0.65, RAMP_PER_SECOND * i * PAGE) * PAGE;
      expect(fly.pose().yaw, `drawn frame ${i}`).toBeCloseTo((want * 180) / Math.PI, 6);
      if (full < 0 && Math.abs(fly.lookState().axis[0]) >= FULL_AXIS * (1 - 1e-9)) full = i;
    }
    globalThis.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowLeft' }));
    expect(0.65 / RAMP_PER_SECOND).toBeCloseTo(0.4185, 4);
    expect(full).toBe(Math.ceil(0.65 / RAMP_PER_SECOND / PAGE - 1e-9));
  });

  it('a pad push turns the view on the next drawn frame, whatever the phase of the game frame', () => {
    const fly = new FlyCamera(canvas());
    fly.setPose({ yaw: 0, pitch: 0 });
    fly.setWalking(true);
    fly.setPitchLimits(-70, 60);
    fly.update(0.01);                                            // part-way into a game frame, the stick at rest
    expect(fly.pose().yaw).toBe(0);
    fly.setLook(1, 0);
    fly.update(PAGE);
    const turned = ((fly.pose().yaw + 180) % 360) - 180;
    expect(turned).toBeLessThan(0);                               // right turns to a smaller yaw, at once
    fly.setLook(0, 0);
    const held = fly.pose().yaw;
    fly.update(PAGE);
    expect(fly.pose().yaw).toBe(held);                           // and the release stops it on the next frame too
  });
});

function canvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined;
  c.releasePointerCapture = () => undefined;
  c.hasPointerCapture = () => false;
  return c;
}

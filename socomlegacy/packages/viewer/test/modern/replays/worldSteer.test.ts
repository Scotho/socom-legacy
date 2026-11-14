// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { FlyCamera } from '../../../src/camera';
import { feedCamera } from '../../../src/matchCore';
import { noInput, type Input } from '../../../src/gamepad';
import type { ScenicView } from '../../../src/mapMeta';
import { SCENIC_LOOK, SpectatorView, type SpectatorPose, type SpectatorSeat } from '../../../src/spectatorView';
import { REPLAY_STEER_IDLE, replaySteerLane, type ReplaySteerHeld } from '../../../src/modern/replays/worldHost';
import {
  readReplaySteer, REPLAY_DRAG_LOOK_RADIANS_PER_PX_ADAPTATION, REPLAY_WHEEL_ZOOM_STICK_SECONDS_ADAPTATION, steerInput,
} from '../../../src/modern/replays/worldSteer';

/**
 * RVK-B (LATER 966, V21.R7; the owner, 2026-11-12: "The replay mode should be fully navigable with keyboard and mouse.
 * Every view."; a browser adaptation, product track): the test room's read of the replay viewer's steer lane, framed as
 * the viewer's world only (`src/main.ts`, `REPLAY_WORLD !== null`). The frame stays deaf -- these are what reach it
 * through the host's lane: an idle lane is today's input, the same object; the held keys merge as a second pad; the drag
 * looks by the fly camera's own drag look or the scenic view's stick path; the wheel is the camera's own wheel step.
 * Generated values only.
 */

const canvas = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined;                     // jsdom has neither pointer capture nor pointer lock
  c.releasePointerCapture = () => undefined;
  c.hasPointerCapture = () => false;
  return c;
};
const held = (o: Partial<ReplaySteerHeld>): ReplaySteerHeld => ({ ...REPLAY_STEER_IDLE, ...o });
const VIEWS: ScenicView[] = [{ name: 'A', at: [979, 236, 689], pitch: -26, yaw: 53, roll: 0 }, { name: 'B', at: [749, 206, 647], pitch: -16, yaw: 155, roll: 0 }];

/** A spectator's view in scenic at view 0 (Up pressed and let go), its poses kept; `inverted` its INVERT PITCH. */
function scenicView(inverted = false) {
  const poses: (SpectatorPose | null)[] = [];
  const mags: number[] = [];
  const seat = (): SpectatorSeat => ({ role: 'spectator', self: null, team: null, teams: new Map(), rules: 'classic', ghost: false });
  const view = new SpectatorView({
    bodies: () => [], seat, spectate: (p) => poses.push(p), leaveSelf: () => {}, views: () => VIEWS, magnify: (m) => mags.push(m),
    pitchSign: () => (inverted ? -1 : 1),
  });
  view.pad({ ...noInput(), zoom: true });
  view.pad(noInput());
  expect(view.mode).toBe('scenic');
  return { view, poses, mags };
}

describe('RVK-B: the pure merge -- an idle lane is the frame\'s input as it is, byte for byte', () => {
  const pad = (): Input => ({ ...noInput(), moveX: 0.25, moveY: -0.5, lookX: 0.1, lookY: 0, jump: false, crouch: false, boost: false, action: true, stance: true, stanceOff: true, stancePressure: 0.4 });

  it('idle: the same object, untouched (every field, the optional ones too)', () => {
    const input = pad();
    const before = JSON.stringify(input);
    expect(steerInput(input, REPLAY_STEER_IDLE)).toBe(input);
    expect(JSON.stringify(input)).toBe(before);
    const none = noInput();
    expect(steerInput(none, held({}))).toBe(none);
  });

  it('held: on each axis the larger push, the lift as Square up or the crouch down, the boost OR-ed; the rest kept', () => {
    const input = pad();
    const out = steerInput(input, held({ moveX: -1, moveY: 0.25, lift: 1, boost: true, lookY: 1 }));
    expect(out).not.toBe(input);
    expect(out).toEqual({ ...input, moveX: -1, moveY: -0.5, lookX: 0.1, lookY: 1, jump: true, crouch: false, boost: true });
    expect(steerInput(noInput(), held({ lift: -1 }))).toMatchObject({ jump: false, crouch: true });
    expect(JSON.stringify(input)).toBe(JSON.stringify(pad()));   // the frame's own input never written
  });

  it('what feedCamera hands the fly camera: the lift, the stick and the boost, as a pad\'s', () => {
    const lanes = { setStick: vi.fn(), setLift: vi.fn(), setStickBoost: vi.fn(), setLook: vi.fn() };
    feedCamera(lanes, steerInput(noInput(), held({ moveY: 1, moveX: 1, lift: -1, boost: true, lookX: -1 })), () => true);
    expect(lanes.setStick).toHaveBeenCalledWith(1, 1);
    expect(lanes.setLift).toHaveBeenCalledWith(-1);
    expect(lanes.setStickBoost).toHaveBeenCalledWith(true);
    expect(lanes.setLook).toHaveBeenCalledWith(-1, 0);
  });
});

describe('RVK-B: the frame\'s read of the lane (readReplaySteer)', () => {
  const targets = () => ({ fly: { lookBy: vi.fn() }, wheel: null as EventTarget | null, spectator: { mode: 'free' as const, scenicBy: vi.fn(() => true) } });

  it('no lane on the host, or an idle one: the input itself, nothing turned', () => {
    const input = noInput();
    const to = targets();
    expect(readReplaySteer({}, input, false, to)).toBe(input);
    expect(readReplaySteer({ steer: replaySteerLane() }, input, false, to)).toBe(input);
    expect(to.fly.lookBy).not.toHaveBeenCalled();
    expect(to.spectator.scenicBy).not.toHaveBeenCalled();
  });

  it('FREE: the drag to the fly camera\'s own look, once, its deltas spent; the held keys merged', () => {
    const lane = replaySteerLane();
    const to = targets();
    lane.set(held({ moveY: 1 }));
    lane.look(3, -2);
    lane.look(4, 1);
    const out = readReplaySteer({ steer: lane }, noInput(), false, to);
    expect(to.fly.lookBy).toHaveBeenCalledTimes(1);
    expect(to.fly.lookBy).toHaveBeenCalledWith(7, -1);
    expect(out.moveY).toBe(1);
    readReplaySteer({ steer: lane }, noInput(), false, to);
    expect(to.fly.lookBy).toHaveBeenCalledTimes(1);            // spent
  });

  it('FREE: a wheel notch is the fly camera\'s own wheel step on its canvas (x 1.15, its bounds)', () => {
    const c = canvas();
    const fly = new FlyCamera(c);
    const lane = replaySteerLane();
    const before = fly.multiplier();
    lane.notch(1);
    readReplaySteer({ steer: lane }, noInput(), false, { fly, wheel: c, spectator: null });
    expect(fly.multiplier()).toBeCloseTo(before * 1.15, 9);
    lane.notch(-2);
    readReplaySteer({ steer: lane }, noInput(), false, { fly, wheel: c, spectator: null });
    expect(fly.multiplier()).toBeCloseTo((before * 1.15) / 1.15 / 1.15, 9);
    fly.dispose();
  });

  it('SCENIC: the drag and the wheel to the scenic entry, in stick-seconds; PLAYER: neither, the held keys still merged', () => {
    const lane = replaySteerLane();
    const to = { ...targets(), spectator: { mode: 'scenic' as 'scenic' | 'follow', scenicBy: vi.fn(() => true) } };
    lane.look(10, -5);
    lane.notch(2);
    readReplaySteer({ steer: lane }, noInput(), false, to);
    const perPx = REPLAY_DRAG_LOOK_RADIANS_PER_PX_ADAPTATION / SCENIC_LOOK.rate;
    expect(to.spectator.scenicBy).toHaveBeenCalledWith(10 * perPx, 5 * perPx, 2 * REPLAY_WHEEL_ZOOM_STICK_SECONDS_ADAPTATION);
    expect(to.fly.lookBy).not.toHaveBeenCalled();
    to.spectator.mode = 'follow';
    lane.look(10, 10);
    lane.notch(1);
    lane.set(held({ lookX: 1 }));
    const out = readReplaySteer({ steer: lane }, noInput(), false, to);
    expect(to.spectator.scenicBy).toHaveBeenCalledTimes(1);
    expect(to.fly.lookBy).not.toHaveBeenCalled();
    expect(out.lookX).toBe(1);
  });

  it('under the frame\'s own menu: the lane read and dropped, the input as it is', () => {
    const lane = replaySteerLane();
    const to = targets();
    lane.set(held({ moveY: 1 }));
    lane.look(5, 5);
    const input = noInput();
    expect(readReplaySteer({ steer: lane }, input, true, to)).toBe(input);
    expect(to.fly.lookBy).not.toHaveBeenCalled();
    expect(lane.take()).toMatchObject({ lookDx: 0, lookDy: 0 });   // spent by the menu's read
  });

  it('the lane: zero lets everything go; a value not finite is taken as 0', () => {
    const lane = replaySteerLane();
    lane.set(held({ moveX: Number.NaN, moveY: 1, boost: true }));
    lane.look(Number.POSITIVE_INFINITY, 2);
    expect(lane.take()).toEqual({ ...held({ moveY: 1, boost: true }), lookDx: 0, lookDy: 2, notches: 0 });
    lane.notch(3);
    lane.zero();
    expect(lane.take()).toEqual({ ...REPLAY_STEER_IDLE, lookDx: 0, lookDy: 0, notches: 0 });
  });
});

describe('RVK-B: the two by-delta entries against their own paths', () => {
  it('FlyCamera.lookBy turns exactly as its own mouse drag of the same pixels', () => {
    const dragged = new FlyCamera(canvas());
    const looked = new FlyCamera(canvas());
    for (const f of [dragged, looked]) f.setPose({ x: 0, y: 0, z: 0, yaw: 10, pitch: 5 });
    const c = (dragged as unknown as { canvas: HTMLCanvasElement }).canvas;
    c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, pointerType: 'mouse', clientX: 100, clientY: 100, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointermove', { pointerId: 9, pointerType: 'mouse', clientX: 40, clientY: 130, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, pointerType: 'mouse', clientX: 40, clientY: 130, bubbles: true }));
    looked.lookBy(-60, 30);
    expect(dragged.pose().yaw).not.toBeCloseTo(10, 3);           // the drag did turn it
    expect(looked.pose().yaw).toBeCloseTo(dragged.pose().yaw, 9);
    expect(looked.pose().pitch).toBeCloseTo(dragged.pose().pitch, 9);
    dragged.dispose();
    looked.dispose();
  });

  it('SpectatorView.scenicBy(x dt, y dt, z dt) is one frame of dt with those sticks -- look, zoom, INVERT PITCH, the pose', () => {
    for (const inverted of [false, true]) {
      const sticks = scenicView(inverted);
      const delta = scenicView(inverted);
      const dt = 0.25, lookX = 0.6, lookY = -0.8, zoom = 0.5;
      sticks.view.pad({ ...noInput(), moveY: zoom, lookX, lookY });
      sticks.view.frame(undefined, dt);
      expect(delta.view.scenicBy(lookX * dt, lookY * dt, zoom * dt)).toBe(true);
      expect(delta.view.magnification).toBeCloseTo(sticks.view.magnification, 12);
      expect(delta.poses.at(-1)).toEqual(sticks.poses.at(-1));
      expect(delta.mags.at(-1)).toBeCloseTo(sticks.mags.at(-1)!, 12);
    }
  });

  it('SpectatorView.scenicBy outside scenic, or for a seat that is not a spectator\'s: false, nothing changed', () => {
    const { view, poses } = scenicView();
    view.key({ type: 'keyup', code: 'KeyX', repeat: false, preventDefault: () => {} });   // to free
    expect(view.mode).toBe('free');
    const n = poses.length;
    expect(view.scenicBy(1, 1, 1)).toBe(false);
    expect(poses).toHaveLength(n);
    const player = new SpectatorView({
      bodies: () => [], seat: () => ({ role: 'player', self: 1, team: 'seal', teams: new Map(), rules: 'classic', ghost: false }),
      spectate: () => {}, leaveSelf: () => {}, views: () => VIEWS,
    });
    expect(player.scenicBy(1, 1, 1)).toBe(false);
  });

  it('a drag of n pixels turns a scenic view as far as the same drag turns the free camera', () => {
    const { view, poses } = scenicView();
    const yaw0 = poses.at(-1)!.yaw;
    const perPx = REPLAY_DRAG_LOOK_RADIANS_PER_PX_ADAPTATION / SCENIC_LOOK.rate;
    view.scenicBy(-50 * perPx, 0, 0);                          // a drag 50 px left
    const scenicTurn = poses.at(-1)!.yaw - yaw0;
    const fly = new FlyCamera(canvas());
    fly.setPose({ yaw: 0, pitch: 0 });
    fly.lookBy(-50, 0);
    expect(scenicTurn).toBeCloseTo(fly.pose().yaw, 6);
    fly.dispose();
  });
});

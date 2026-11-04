// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { CollisionOwner, GridParams, WorldPoly } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { GrenadeThrower } from '../src/grenade';
import { groundGrid, Walker, type HoldClip } from '../src/mover';
import { MoverSim } from '../src/net/moverSim';
import { holdOf, type Command } from '../src/net/protocol';
import { packGround, WalkMode, type GroundData, type PlaySnapshot } from '../src/walk';

/**
 * PARITY-2, PAR-86 (research 251 section 12.8; reading, pending review): a throw let go in the air. The original's
 * controller chases the throw's power and asks its release only while `FUN_0059d830` answers (D:L453478-453480), and
 * `FUN_0059d830` answers 0 off the floor -- the airborne bit `+0x105e` 0x20 or the state 6 (D:L457369-457371). The
 * controller's update runs before the driver, so it reads the floor the last frame left. The release request
 * (`FUN_005be9a0`, in the kit's frame after the driver) asks `FUN_0059d830` again (D:L475491-475495) and is refused as a
 * short tap in the air (D:L475497-475498). So no throw is pushed in the air: the wind-up is held, its power frozen,
 * through the flight, and the release goes on the first update after the landing's.
 *
 * The page is the real `WalkMode` with the thrower wired as `./matchThrow` wires it (`throwStart` -> `WalkMode.hold`); the
 * room's mover is `MoverSim` fed the page's own commands, command for command. A deck 42 over the floor (Frostfire's
 * decks, the mover's header) gives the walk-off its drop of more than 8.
 */

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 4, cellsZ: 4, originX: -400, originZ: -400 };
const poly = (path: string, y: number, z0: number, z1: number): WorldPoly => ({
  modelName: 'worldmodel', path, region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-400, y, z0, 400, y, z0, 400, y, z1, -400, y, z1]),
});
const DECK_Y = 42;
const OWNERS: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 2 }];
const GROUND: GroundData = packGround(PARAMS, [poly('worldmodel/deck', DECK_Y, 0, 400), poly('worldmodel/floor', 0, -400, 0)], OWNERS);

interface Frame {
  /** The page's mover after the frame's ticks (the kit's view: after the driver). */
  airborne: boolean;
  vx: number; vz: number; vy: number;
  /** The room's mover after the same commands. */
  room: { airborne: boolean; vx: number; vz: number; vy: number; hold: HoldClip | null };
  page: { hold: HoldClip | null };
  /** The hold code the frame's commands carried. */
  sent: HoldClip | null;
  /** The thrower after its update. */
  phase: string; power: number; left: number;
  started: boolean; thrown: boolean;
}

/**
 * The page on the deck at `z` facing -z (towards the edge at z 0), the thrower's M67 up. `frame` runs one 1/60 s page
 * frame as `main.ts` orders it: the walk's ticks (their commands to the room's mover), then the throws' update.
 */
function rig(z: number) {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined;
  c.releasePointerCapture = () => undefined;
  c.hasPointerCapture = () => false;
  const fly = new FlyCamera(c);
  const walk = new WalkMode(fly);
  walk.setGround(GROUND, [0, 0, 0]);
  fly.setPose({ x: 0, y: DECK_Y + 20, z, yaw: 0, pitch: 0 });
  walk.setMode('walk');
  const wish = { forward: 0, right: 0, boost: false };
  fly.groundWish = () => wish;
  const page = (walk as unknown as { walker: Walker }).walker;
  const server = new Walker(groundGrid(GROUND));
  expect(server.place(page.state.x, page.state.y, page.state.z)).toBe(true);
  server.state.yaw = page.state.yaw;
  const room = new MoverSim(server, null);
  let seq = 0;
  const sent: Omit<Command, 'seq'>[] = [];
  walk.setNetTap((cmd) => sent.push(cmd));
  const g = new GrenadeThrower({ grid: () => walk.grid(), snapshot: () => walk.snapshot(), view: () => 'third' });
  let started = false, thrown = false;
  g.on('throwStart', ({ hold }) => { started = true; walk.hold(hold); });   // `./matchThrow` `throwStart`
  g.on('throw', () => { thrown = true; });
  expect(g.select('M67')).toBe(true);
  const frames: Frame[] = [];
  const frame = (): Frame => {
    started = false; thrown = false;
    const from = sent.length;
    walk.frame(1 / 60);
    const cmds = sent.slice(from);
    let code: HoldClip | null = null;
    for (const cmd of cmds) {
      code ??= holdOf(cmd.buttons) as HoldClip | null;
      room.apply({ ...cmd, seq: ++seq });
    }
    g.update(1 / 60);
    const st = g.stats();
    const f: Frame = {
      airborne: page.airborne, vx: page.state.vx, vz: page.state.vz, vy: page.state.vy,
      room: { airborne: server.airborne, vx: server.state.vx, vz: server.state.vz, vy: server.state.vy, hold: server.holding?.clip ?? null },
      page: { hold: page.holding?.clip ?? null },
      sent: code, phase: st.phase, power: st.power, left: st.left, started, thrown,
    };
    frames.push(f);
    return f;
  };
  for (let i = 0; i < 10; i++) frame();
  frames.length = 0;
  return { walk, g, page, server, wish, frame, frames, dispose: () => walk.unbindKey() };
}

/** Frames until `until` holds (at most `cap`); the last frame run. */
function runUntil(frame: () => Frame, until: (f: Frame) => boolean, cap = 600): Frame {
  for (let i = 0; i < cap; i++) { const f = frame(); if (until(f)) return f; }
  throw new Error('never');
}

/** The page's mover and the room's agree on the frame: in the air together, the same velocity, the same hold. */
function agree(f: Frame): void {
  expect(f.room.airborne).toBe(f.airborne);
  expect(f.room.vx).toBeCloseTo(f.vx, 9);
  expect(f.room.vz).toBeCloseTo(f.vz, 9);
  expect(f.room.vy).toBeCloseTo(f.vy, 9);
  expect(f.room.hold).toBe(f.page.hold);
}

describe('PAR-86: a throw let go in the air (FUN_0059d830 D:L457369-457371; research 251 section 12.8)', () => {
  it('control: a throw let go on the floor at rest starts on its own update, its hold on the next command on the page and in the room; the grenade leaves on the floor', () => {
    const r = rig(300);
    r.g.pull();
    for (let i = 0; i < 30; i++) r.frame();
    r.g.release();
    const at = r.frame();
    expect(at.started).toBe(true);
    expect(at.phase).toBe('throwing');
    const next = r.frame();
    expect(next.sent).toBe('seal_throwgrenade');
    expect(next.page.hold).toBe('seal_throwgrenade');
    agree(next);
    const left = runUntil(r.frame, (f) => f.thrown);
    expect(left.airborne).toBe(false);
    expect(left.left).toBe(at.left - 1);
    r.dispose();
  });

  it('a running jump, the button let go on the first command after the take-off: no throw in the air, the power held; the throw starts on the update after the landing\'s, its hold on the next command on both', () => {
    const r = rig(380);
    r.wish.forward = 1;
    r.g.pull();
    for (let i = 0; i < 60; i++) agree(r.frame());
    expect(Math.hypot(r.page.state.vx, r.page.state.vz)).toBeGreaterThan(15);
    expect(r.walk.jump()).toBe(true);
    const off = r.frame();                                       // the take-off's frame: the chase read the floor before it
    expect(off.airborne).toBe(true);
    agree(off);
    expect(off.phase).toBe('holding');
    r.g.release();
    const flight: Frame[] = [];
    const landed = runUntil(r.frame, (f) => { flight.push(f); return !f.airborne; });
    flight.pop();
    expect(flight.length).toBeGreaterThan(20);
    for (const f of flight) {
      agree(f);
      expect(f.started).toBe(false);                             // no release asked in the air (D:L453478-453480)
      expect(f.phase).toBe('holding');
      expect(f.power).toBe(off.power);                           // the chase stood: the power as the take-off left it
      expect(f.page.hold).toBeNull();
      expect(f.vx).toBeCloseTo(off.vx, 9);                       // the carried velocity, untouched (FUN_0054d9a0)
      expect(f.vz).toBeCloseTo(off.vz, 9);
    }
    agree(landed);
    expect(landed.started).toBe(false);                          // the landing's frame: the controller read the air
    expect(landed.phase).toBe('holding');
    const after = r.frame();
    expect(after.started).toBe(true);                            // the next update: the chase asks, the release pushes
    expect(after.power).toBe(off.power);
    expect(after.airborne).toBe(false);
    const laid = r.frame();
    expect(laid.sent).toBe('seal_throwgrenade');
    expect(laid.page.hold).toBe('seal_throwgrenade');
    agree(laid);
    const left = runUntil(r.frame, (f) => f.thrown);
    expect(left.airborne).toBe(false);
    r.dispose();
  });

  it('a running jump, the button let go on the take-off\'s own frame: the release is asked from the floor and refused in the air -- nothing thrown, nothing spent, the power zeroed', () => {
    const r = rig(380);
    r.wish.forward = 1;
    r.g.pull();
    const before = r.frame();
    for (let i = 0; i < 59; i++) r.frame();
    expect(r.walk.jump()).toBe(true);
    r.g.release();
    const off = r.frame();
    expect(off.airborne).toBe(true);
    expect(off.started).toBe(false);                             // FUN_005be9a0 D:L475491-475498
    expect(off.phase).toBe('ready');
    expect(off.power).toBe(0);
    const rest = [...Array(120)].map(() => r.frame());
    expect(rest.some((f) => f.started || f.thrown)).toBe(false);
    expect(rest.every((f) => f.page.hold === null && f.room.hold === null)).toBe(true);
    expect(rest.at(-1)!.left).toBe(before.left);
    r.dispose();
  });

  it('a walk-off over a 42 drop, the button let go mid-fall: no throw in the air, the fall\'s velocity its own; the throw starts on the update after the landing\'s, its hold on both on the next command', () => {
    const r = rig(40);
    r.wish.forward = 1;
    r.g.pull();
    const off = runUntil(r.frame, (f) => f.airborne);
    agree(off);
    expect(off.phase).toBe('holding');
    for (let i = 0; i < 6; i++) { const f = r.frame(); expect(f.airborne).toBe(true); agree(f); }
    r.g.release();
    const flight: Frame[] = [];
    const landed = runUntil(r.frame, (f) => { flight.push(f); return !f.airborne; });
    flight.pop();
    for (const f of flight) {
      agree(f);
      expect(f.started).toBe(false);
      expect(f.phase).toBe('holding');
      expect(f.power).toBe(off.power);
      expect(f.vx).toBeCloseTo(off.vx, 9);                       // the horizontal velocity held from the edge
      expect(f.vz).toBeCloseTo(off.vz, 9);
    }
    expect(r.page.state.y).toBeCloseTo(0, 6);
    expect(landed.started).toBe(false);
    const after = r.frame();
    expect(after.started).toBe(true);
    const laid = r.frame();
    expect(laid.sent).toBe('seal_throwgrenade');
    expect(laid.room.hold).toBe('seal_throwgrenade');
    agree(laid);
    r.dispose();
  });

  it('a walk-off with the button held through the landing: the power stands in the air and the chase runs on from the update after the landing\'s; the throw starts where the button is let go', () => {
    const r = rig(40);
    r.wish.forward = 1;
    r.g.pull();
    const off = runUntil(r.frame, (f) => f.airborne);
    const flight: Frame[] = [];
    const landed = runUntil(r.frame, (f) => { flight.push(f); return !f.airborne; });
    for (const f of [...flight, landed]) {
      expect(f.power).toBe(off.power);
      expect(f.started).toBe(false);
    }
    const after = r.frame();
    expect(after.power).toBeGreaterThan(off.power);               // the chase again
    for (let i = 0; i < 10; i++) expect(r.frame().started).toBe(false);
    r.g.release();
    const at = r.frame();
    expect(at.started).toBe(true);
    expect(at.airborne).toBe(false);
    r.dispose();
  });

  // PAR-86 review F1: the chase reads the pad's pressure live each update (FUN_00594cf0 D:L453481, FUN_002c6350), and a
  // button held in the air sets the wind-up bit again (D:L453633-453637): let go and pressed again before the landing,
  // the first chase after it sees full pressure and the wind-up goes on.
  it('a running jump, let go in the air and pressed again before the landing: nothing thrown at the landing, the wind-up chases on; the throw goes where it is let go on the floor', () => {
    const r = rig(380);
    r.wish.forward = 1;
    r.g.pull();
    for (let i = 0; i < 60; i++) r.frame();
    expect(r.walk.jump()).toBe(true);
    const off = r.frame();
    expect(off.airborne).toBe(true);
    r.g.release();
    for (let i = 0; i < 5; i++) expect(r.frame().airborne).toBe(true);
    r.g.pull();                                                  // pressed again, still in the air
    const landed = runUntil(r.frame, (f) => !f.airborne);
    expect(landed.started).toBe(false);
    expect(landed.phase).toBe('holding');
    const after = r.frame();
    expect(after.started).toBe(false);
    expect(after.phase).toBe('holding');
    expect(after.power).toBeGreaterThan(off.power);              // the chase on, at full pressure
    for (let i = 0; i < 5; i++) expect(r.frame().started).toBe(false);
    r.g.release();
    const at = r.frame();
    expect(at.started).toBe(true);
    expect(at.airborne).toBe(false);
    r.dispose();
  });
});

describe('PAR-86: the release request refused in the air (FUN_005be9a0 D:L475491-475498)', () => {
  it('the hook\'s throw from a body in the air is refused as a short tap: no clip, nothing spent; on the floor it throws', () => {
    let air = true;
    const snap = (): PlaySnapshot => ({
      feet: [0, 50, 0], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: air ? -20 : 0, airborne: air, crouched: false, stance: 'stand',
      landing: null, jumps: 0, ground: { state: 'idle', forward: 0, right: 0, cls: -1 }, action: null, turnRate: 0,
    } as PlaySnapshot);
    const g = new GrenadeThrower({ grid: () => null, snapshot: snap, view: () => 'third' });
    const starts: number[] = [];
    g.on('throwStart', () => starts.push(1));
    expect(g.select('M67')).toBe(true);
    const left = g.stats().left;
    expect(g.throwNow(1, true)).toBeNull();
    expect(starts).toEqual([]);
    expect(g.stats().phase).toBe('ready');
    expect(g.stats().power).toBe(0);
    expect(g.stats().left).toBe(left);
    air = false;
    expect(g.throwNow(1, true)).not.toBeNull();
    expect(starts).toEqual([1]);
    expect(g.stats().left).toBe(left - 1);
  });
});


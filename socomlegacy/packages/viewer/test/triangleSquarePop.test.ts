// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FlyCamera } from '../src/camera';
import { groundGrid, groundPolygons, packGround, Walker, WalkMode } from '../src/walk';
import { Traversal } from '../src/traversal';
import { MoverSim } from '../src/net/moverSim';
import { Button, COMMAND_STANCE_CODES, type Command } from '../src/net/protocol';
import { StanceButton } from '../src/stanceButton';
import { playerLanes, type LaneParts } from '../src/matchLanes';
import { noInput, type Input } from '../src/gamepad';

/**
 * OT.R76 (the owner's word, 2026-10-23, in the merge controller's seat, on Benny's PR #461: "port it into the live
 * controls, replacing the double tap") -- the stance mode `'pop'` (`../src/stanceButton` `TRIANGLE_SQUARE_POP_ADAPTATION`,
 * a controls adaptation: the original's quirk is not claimed): Triangle runs the original's tap and hold; a fresh Square
 * during the drop to prone or the dive that a Triangle hold started pops (the existing pop, its 260 ms rise); Square
 * otherwise is the native jump. Benny's 19 input cases (`playtests/triangle-square/input.test.ts` on #461, his approved
 * build), ported onto the live lanes: the real `WalkMode` and `playerLanes`, the room's `MoverSim` fed the page's
 * commands, the two compared (`agree`).
 */

const dt = 1 / 60;
const ground = packGround(
  { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
  [{ modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200]) }],
  [{ modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1 }],
);
afterEach(() => { vi.restoreAllMocks(); });

function rig() {
  const canvas = document.createElement('canvas');
  canvas.setPointerCapture = () => {}; canvas.releasePointerCapture = () => {};
  canvas.hasPointerCapture = () => false;
  const fly = new FlyCamera(canvas), walk = new WalkMode(fly);
  walk.setGround(ground, [0, 0, 0]);
  walk.useTraversal((w, g) => new Traversal(w.grid, groundPolygons(g)));
  fly.setPose({ x: 5, y: 40, z: 6, yaw: 0, pitch: 0 });
  let forward = 0;
  fly.groundWish = () => ({ forward, right: 0, boost: false });
  const grid = groundGrid(ground), room = new MoverSim(new Walker(grid), new Traversal(grid, groundPolygons(ground)));
  room.walker.place(5, 30, 6);
  const sent: Command[] = [];
  walk.setNetTap((cmd) => { const c = { ...cmd, seq: sent.length + 1 }; sent.push(c); room.apply(c); });
  walk.setMode('walk');
  const l: LaneParts = { walk, stanceButton: new StanceButton(), shoulder() {},
    firearm: { stepZoom: () => 1, switchFireMode: () => 'auto', viewLanes() {}, fire: { reload: () => true } } };
  let before = noInput();
  const frame = (flags: Partial<Input> = {}, menu = false): void => {
    const after = { ...noInput(), ...flags };
    playerLanes(l, before, after, dt, { walking: true, menu });
    before = after; walk.frame(dt);
  };
  const frames = (n: number, flags: Partial<Input> = {}): void => { for (let i = 0; i < n; i++) frame(flags); };
  frames(10);
  const mover = (): Walker => walk['walker'] as Walker, moves = (): Traversal => walk['moves'] as Traversal;
  const agree = (): void => {
    expect(mover().stance).toBe(room.walker.stance);
    expect(mover().action?.name ?? null).toBe(room.walker.action?.name ?? null);
    expect(moves().inDive()).toBe((room.moves as Traversal).inDive());
    for (const k of ['x', 'y', 'z', 'vx', 'vz'] as const) expect(mover().state[k]).toBeCloseTo(room.walker.state[k], 6);
  };
  const pops = (): Command[] => sent.filter((c) => (c.buttons & Button.Stance) && COMMAND_STANCE_CODES[c.stance] === 'pop');
  return { walk, frame, frames, mover, moves, room, sent, agree, pops, run: (v = 1): void => { forward = v; } };
}

describe('OT.R76: Triangle then Square on the live lanes (the default stance mode) -- the original\'s stance, an entry-only pop', () => {
  it('the default stance mode is the Triangle-then-Square one', () => {
    expect(rig().walk.stanceMode()).toBe('pop');
  });

  for (const running of [false, true]) it(`a Triangle tap keeps the crouch, running=${running}`, () => {
    const r = rig(); if (running) { r.run(); r.frames(60); }
    r.frames(3, { stance: true }); r.frame();
    expect(r.walk.stance()).toBe('crouch'); expect(r.moves().inDive()).toBe(false); expect(r.pops()).toHaveLength(0);
  });

  for (const running of [false, true]) for (const delay of [1, 5, 10]) {
    it(`Square during the ${running ? 'dive' : 'drop to prone'}, ${delay} frames after the release, pops, the room agreeing`, () => {
      const r = rig(); if (running) { r.run(); r.frames(60); }
      r.frames(27, { stance: true }); r.frames(delay);
      expect(r.walk.stance()).toBe('prone');
      const normalJump = vi.spyOn(r.walk, 'jump');
      r.frame({ jump: true });
      expect(r.walk.stance()).toBe('stand'); expect(r.pops()).toHaveLength(1);
      expect(normalJump).not.toHaveBeenCalled(); r.agree();
      r.frames(10, { jump: true }); expect(r.pops()).toHaveLength(1); r.agree();
    });
  }

  it('Square alone keeps the native jump', () => {
    const r = rig(), normalJump = vi.spyOn(r.walk, 'jump');
    r.frame({ jump: true }); expect(normalJump).toHaveBeenCalledTimes(1);
    expect(r.sent.some((c) => (c.buttons & Button.Jump) !== 0)).toBe(true); expect(r.pops()).toHaveLength(0); r.agree();
  });

  it('a tap to crouch then Square stays a native jump, not a prone combo', () => {
    const r = rig(); r.frames(3, { stance: true }); r.frame(); r.frames(50);
    const normalJump = vi.spyOn(r.walk, 'jump'); r.frame({ jump: true });
    expect(normalJump).toHaveBeenCalledTimes(1); expect(r.pops()).toHaveLength(0); r.agree();
  });

  it('Square held before Triangle is no new press during the drop', () => {
    const r = rig(); r.frame({ jump: true }); r.frames(90, { jump: true });
    r.frames(27, { jump: true, stance: true }); r.frames(8, { jump: true });
    expect(r.walk.stance()).toBe('prone'); expect(r.pops()).toHaveLength(0);
  });

  it('the review\'s 2: a fresh Triangle and a fresh Square on one frame inside an open window -- no pop (the window closes first, as Benny\'s core)', () => {
    const r = rig(); r.frames(27, { stance: true }); r.frame();          // the drop under way, the window open
    expect(r.walk.stance()).toBe('prone');
    const normalJump = vi.spyOn(r.walk, 'jump');
    r.frame({ stance: true, jump: true });
    expect(r.pops()).toHaveLength(0); expect(normalJump).toHaveBeenCalledTimes(1);
  });

  it('Triangle and Square together keep the native jump and arm no pop', () => {
    const r = rig(), normalJump = vi.spyOn(r.walk, 'jump'); r.frame({ stance: true, jump: true }); r.frame();
    expect(normalJump).toHaveBeenCalledTimes(1); expect(r.pops()).toHaveLength(0);
  });

  for (const reason of ['finished', 'menu', 'blur', 'external'] as const) it(`no pop after ${reason}`, () => {
    const r = rig(); r.frames(27, { stance: true }); r.frame();
    if (reason === 'finished') r.frames(120);
    if (reason === 'menu') r.frame({}, true);
    if (reason === 'blur') (r.walk as unknown as { onBlur(): void }).onBlur();
    if (reason === 'external') { r.walk.setStance('stand'); r.frames(120); r.walk.setStance('prone'); r.frame(); }
    const normalJump = vi.spyOn(r.walk, 'jump'); r.frame({ jump: true });
    expect(normalJump).toHaveBeenCalledTimes(1); expect(r.pops()).toHaveLength(0);
  });

  it('a prone move begun from outside is not armed by an earlier crouch tap', () => {
    const r = rig(); r.frames(3, { stance: true }); r.frame(); r.frames(60);
    r.walk.setStance('prone'); r.frame(); const jump = vi.spyOn(r.walk, 'jump'); r.frame({ jump: true });
    expect(jump).toHaveBeenCalledTimes(1); expect(r.pops()).toHaveLength(0);
  });

  it('a second Triangle takes the original get-up, not the pop (the double tap retired)', () => {
    const r = rig(); r.frames(27, { stance: true }); r.frames(120);
    r.frames(3, { stance: true }); r.frame(); expect(r.pops()).toHaveLength(0);
    expect(r.mover().action).not.toBeNull();
  });

  it('a respawn mid-window cannot pop the new mover (the window is its mover\'s; the merge controller\'s case)', () => {
    const r = rig(); r.frames(27, { stance: true }); r.frame();          // the window open on the old mover's drop
    const old = r.mover();
    expect(r.walk.respawn([5, 0, 6], 0)).toBe(true);
    expect(r.mover()).not.toBe(old);
    r.walk.setStance('prone'); r.frame();                                 // the new mover dropping, begun from outside
    const jump = vi.spyOn(r.walk, 'jump'); r.frame({ jump: true });
    expect(jump).toHaveBeenCalledTimes(1); expect(r.pops()).toHaveLength(0);
  });

  it('the headroom still refuses the pop', () => {
    const r = rig(); r.frames(27, { stance: true }); r.frame();
    vi.spyOn(r.mover() as unknown as { headroom: () => boolean }, 'headroom').mockReturnValue(false);
    r.frame({ jump: true }); expect(r.pops()).toHaveLength(0); expect(r.walk.stance()).toBe('prone');
  });
});

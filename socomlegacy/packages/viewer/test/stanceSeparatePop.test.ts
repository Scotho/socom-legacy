// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FlyCamera } from '../src/camera';
import { groundGrid, groundPolygons, packGround, Walker, WalkMode } from '../src/walk';
import { Traversal } from '../src/traversal';
import { MoverSim } from '../src/net/moverSim';
import { Button, COMMAND_STANCE_CODES, type Command } from '../src/net/protocol';
import { StanceButton, type StanceMode } from '../src/stanceButton';
import { playerLanes, type LaneParts } from '../src/matchLanes';
import { noInput, type Input } from '../src/gamepad';

/**
 * STM-2 as STM.R2a settles it (the plan 2026-10-30-stance-modes-and-emulator-harness; the owner, 2026-10-30: "Separate
 * should function EXACTLY as the original ... Please resort back to the original and it's animation cancelling and state
 * transitions between stand/crouch/prone"): SEPARATE runs the original's stance machine with no adaptation of its own --
 * OT.R76's pop window (`../src/stanceButton` `TRIANGLE_SQUARE_POP_ADAPTATION`, an adaptation) never opens there, so the
 * jump's fresh press inside a dive or a drop is the native jump (`WalkMode.jumpPress` -> `jump`), never the pop
 * (`popStance`, the command's stance code `'pop'`). The history: STM-2's first build (0289fb957, 7c237f64c) read STM.R2 as
 * carrying the window into SEPARATE and pinned the pops here; STM.R2a reads it the other way and these pins are turned
 * round. COMBINED keeps the window (the controls below). On the real `WalkMode` and `playerLanes`, the room fed the page's
 * commands (`agree`), the rig of `triangleSquarePop.test.ts`; the pad's Triangle does no stance in SEPARATE while Prone is
 * bound (STM-1 with its review's F1: `../src/controllerInput` `poll`), so the pad's lane here is the Prone bind's
 * (`Input.prone`).
 */

const dt = 1 / 60;
const ground = packGround(
  { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
  [{ modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200]) }],
  [{ modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1 }],
);
const made: WalkMode[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const m of made.splice(0)) m.unbindKey(); });

function rig(mode: StanceMode = 'separate') {
  const canvas = document.createElement('canvas');
  canvas.setPointerCapture = () => {}; canvas.releasePointerCapture = () => {};
  canvas.hasPointerCapture = () => false;
  const fly = new FlyCamera(canvas), walk = new WalkMode(fly);
  made.push(walk);
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
  walk.setStanceMode(mode);
  const l: LaneParts = { walk, stanceButton: new StanceButton(), shoulder() {},
    firearm: { stepZoom: () => 1, switchFireMode: () => 'auto', viewLanes() {}, fire: { reload: () => true } } };
  let before = noInput();
  const frame = (flags: Partial<Input> = {}): void => {
    const after = { ...noInput(), ...flags };
    playerLanes(l, before, after, dt, { walking: true, menu: false });
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

describe('STM.R2a: no pop window in SEPARATE -- Square inside a dive or a drop is the native jump, as the original', () => {
  it('the rig is SEPARATE', () => {
    expect(rig().walk.stanceMode()).toBe('separate');
  });

  for (const delay of [1, 5, 10]) {
    it(`a Prone press while running dives; Square ${delay} frames on is the native jump, no pop (no 'dive'), the room agreeing`, () => {
      const r = rig(); r.run(); r.frames(60);
      r.frame({ prone: true }); r.frames(delay);
      expect(r.moves().inDive()).toBe(true);
      const popStance = vi.spyOn(r.walk, 'popStance'), normalJump = vi.spyOn(r.walk, 'jump');
      r.frame({ jump: true });
      expect(popStance).not.toHaveBeenCalled();
      expect(normalJump).toHaveBeenCalledTimes(1);
      expect(r.pops()).toHaveLength(0); r.agree();
      r.frames(10, { jump: true }); expect(r.pops()).toHaveLength(0); r.agree();
    });
  }

  it('a Prone press from standing drops; Square inside the drop is the native jump, no pop (no \'drop\'), the room agreeing', () => {
    const r = rig();
    r.frame({ prone: true }); r.frames(3);
    expect(r.mover().action?.name).toBe('standToProne');
    const popStance = vi.spyOn(r.walk, 'popStance'), normalJump = vi.spyOn(r.walk, 'jump');
    r.frame({ jump: true });
    expect(popStance).not.toHaveBeenCalled();
    expect(normalJump).toHaveBeenCalledTimes(1);
    expect(r.pops()).toHaveLength(0); r.agree();
  });

  it('from crouch (the Crouch bind) a Prone press drops; Square inside it is the native jump, no pop', () => {
    const r = rig();
    r.frame({ crouch: true }); r.frame(); r.frames(60);
    expect(r.walk.stance()).toBe('crouch');
    r.frame({ prone: true }); r.frames(3);
    expect(r.mover().action?.name).toBe('crouchToProne');
    const popStance = vi.spyOn(r.walk, 'popStance');
    r.frame({ jump: true });
    expect(popStance).not.toHaveBeenCalled();
    expect(r.pops()).toHaveLength(0); r.agree();
  });

  it('the keyboard\'s C hold drops in SEPARATE (the stance button\'s prone); Space inside the drop is no pop', () => {
    const r = rig();
    r.walk.bindKey(window);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC' }));
    for (let i = 0; i < 30 && r.walk.stance() !== 'prone'; i++) r.frame();
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyC' }));
    r.frame();
    expect(r.mover().action?.name).toBe('standToProne');
    const popStance = vi.spyOn(r.walk, 'popStance');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    r.frame();
    expect(popStance).not.toHaveBeenCalled();
    expect(r.pops()).toHaveLength(0); r.agree();
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
  });

  it('the touch C hold drops in SEPARATE; Square inside the drop is no pop', () => {
    const r = rig();
    r.walk.stanceTouch('down');
    for (let i = 0; i < 30 && r.walk.stance() !== 'prone'; i++) r.frame();
    r.walk.stanceTouch('up');
    r.frame();
    expect(r.mover().action?.name).toBe('standToProne');
    const popStance = vi.spyOn(r.walk, 'popStance');
    r.frame({ jump: true });
    expect(popStance).not.toHaveBeenCalled();
    expect(r.pops()).toHaveLength(0);
  });

  // Controls: these held before STM-2 and hold after STM.R2a (no window to close or to open in SEPARATE).
  it('Square with no window is the native jump', () => {
    const r = rig(), normalJump = vi.spyOn(r.walk, 'jump');
    r.frame({ jump: true }); expect(normalJump).toHaveBeenCalledTimes(1);
    expect(r.sent.some((c) => (c.buttons & Button.Jump) !== 0)).toBe(true); expect(r.pops()).toHaveLength(0); r.agree();
  });

  it('a prone asked from outside the stance lanes opens no window: Square is the jump', () => {
    const r = rig(); r.walk.setStance('prone'); r.frame();
    const normalJump = vi.spyOn(r.walk, 'jump'); r.frame({ jump: true });
    expect(normalJump).toHaveBeenCalledTimes(1); expect(r.pops()).toHaveLength(0);
  });
});

describe('STM.R2: COMBINED unchanged (the control)', () => {
  it('a Triangle hold drops, Square inside it pops (\'drop\'); a fresh Triangle and Square on one frame is no pop', () => {
    const r = rig('pop');
    r.frames(27, { stance: true }); r.frame();
    const popStance = vi.spyOn(r.walk, 'popStance');
    r.frame({ jump: true });
    expect(popStance.mock.results.map((x) => x.value)).toEqual(['drop']);
    expect(r.pops()).toHaveLength(1); r.agree();
    const s = rig('pop');
    s.frames(27, { stance: true }); s.frame();
    s.frame({ stance: true, jump: true });
    expect(s.pops()).toHaveLength(0);
  });

  it('a Triangle hold while running dives; Square cancels it (\'dive\')', () => {
    const r = rig('pop'); r.run(); r.frames(60);
    r.frames(27, { stance: true }); r.frame();
    expect(r.moves().inDive()).toBe(true);
    const popStance = vi.spyOn(r.walk, 'popStance');
    r.frame({ jump: true });
    expect(popStance.mock.results.map((x) => x.value)).toEqual(['dive']);
    expect(r.pops()).toHaveLength(1); r.agree();
  });
});

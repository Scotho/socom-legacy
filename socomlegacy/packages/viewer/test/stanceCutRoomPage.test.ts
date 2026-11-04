// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FlyCamera } from '../src/camera';
import { groundGrid, groundPolygons, packGround, Walker, WalkMode } from '../src/walk';
import { Traversal } from '../src/traversal';
import { MoverSim } from '../src/net/moverSim';
import type { Command } from '../src/net/protocol';
import { decodeCommands, encodeCommands } from '../src/net/codec';
import { StanceButton, type StanceMode } from '../src/stanceButton';
import { playerLanes, type LaneParts } from '../src/matchLanes';
import { noInput, type Input } from '../src/gamepad';

/**
 * SEP-POP (OT.R93): room = page. The page's `WalkMode` lays its stance mode on its own mover each tick
 * (`Walker.stanceCut`), and every command it sends says it (`Command.separate`), which the room's `MoverSim` lays on its
 * mover -- so the stick's cut of a stance transition (`FUN_00587c20`) is taken on the same tick at both ends, through the
 * wire's encoding. The rig is `stanceSeparatePop.test.ts`'s (the real page and lanes, the room fed the page's commands),
 * with the stick across. COMBINED-CUT (OT.R93, the owner 2026-10-31: "3 + 4"): COMBINED's player cuts too, on both
 * movers (`Walker.stanceCut` on, `Walker.stanceSeparate` off), with no new field on the wire -- the room lays the cut on
 * any command that states its mode unless it has marked the seat AI (`MoverSim.ai`; match `roomStanceAi.test.ts`).
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

function rig(mode: StanceMode) {
  const canvas = document.createElement('canvas');
  canvas.setPointerCapture = () => {}; canvas.releasePointerCapture = () => {};
  canvas.hasPointerCapture = () => false;
  const fly = new FlyCamera(canvas), walk = new WalkMode(fly);
  made.push(walk);
  walk.setGround(ground, [0, 0, 0]);
  walk.useTraversal((w, g) => new Traversal(w.grid, groundPolygons(g)));
  fly.setPose({ x: 5, y: 40, z: 6, yaw: 0, pitch: 0 });
  let right = 0;
  fly.groundWish = () => ({ forward: 0, right, boost: false });
  const grid = groundGrid(ground), room = new MoverSim(new Walker(grid), new Traversal(grid, groundPolygons(ground)));
  room.walker.place(5, 30, 6);
  const sent: Command[] = [];
  walk.setNetTap((cmd) => {
    const c = decodeCommands(encodeCommands({ viewTick: 0, commands: [{ ...cmd, seq: sent.length + 1 }] })).commands[0]!;
    sent.push(c); room.apply(c);
  });
  walk.setMode('walk');
  walk.setStanceMode(mode);
  const l: LaneParts = { walk, stanceButton: new StanceButton(), shoulder() {},
    firearm: { stepZoom: () => 1, switchFireMode: () => 'auto', viewLanes() {}, fire: { reload: () => true } } };
  let before = noInput();
  const mover = (): Walker => walk['walker'] as Walker;
  const agree = (): void => {
    expect(mover().stanceCut).toBe(room.walker.stanceCut);
    expect(mover().stance).toBe(room.walker.stance);
    expect(mover().action?.name ?? null).toBe(room.walker.action?.name ?? null);
    for (const k of ['x', 'y', 'z', 'vx', 'vz'] as const) expect(mover().state[k]).toBeCloseTo(room.walker.state[k], 6);
  };
  const frame = (flags: Partial<Input> = {}): void => {
    const after = { ...noInput(), ...flags };
    playerLanes(l, before, after, dt, { walking: true, menu: false });
    before = after; walk.frame(dt); agree();
  };
  const frames = (n: number, flags: Partial<Input> = {}): void => { for (let i = 0; i < n; i++) frame(flags); };
  frames(10);
  return { walk, frame, frames, mover, room, sent, stick: (v: number): void => { right = v; } };
}

describe('SEP-POP: room = page, tick for tick', () => {
  it('SEPARATE: every command says so, and both movers cut', () => {
    const r = rig('separate');
    expect(r.mover().stanceCut).toBe(true);
    expect(r.sent.every((c) => c.separate === true)).toBe(true);
  });

  it('SEPARATE: the pop -- prone (Prone bind), the stick across, the Crouch bind: the run on both, positions agreeing', () => {
    const r = rig('separate');
    r.frame({ prone: true }); r.frames(90);
    expect(r.walk.stance()).toBe('prone');
    r.stick(1); r.frames(20);
    r.frame({ crouch: true });
    r.frames(3);
    expect(r.mover().stance).toBe('crouch');
    expect(r.mover().action).toBeNull();
    expect(Math.hypot(r.mover().state.vx, r.mover().state.vz)).toBeCloseTo(65, 1);
    r.frames(30);
  });

  it('SEPARATE: the quick drop -- crouched at stick 0.3, the Prone bind: prone at once on both', () => {
    const r = rig('separate');
    r.frame({ crouch: true }); r.frames(60);
    expect(r.walk.stance()).toBe('crouch');
    r.stick(0.3); r.frames(20);
    r.frame({ prone: true }); r.frames(3);
    expect(r.mover().stance).toBe('prone');
    expect(r.mover().action).toBeNull();
    r.frames(30);
  });

  it('COMBINED-CUT: both movers cut; the commands say COMBINED; main\'s zero and the pop code stay COMBINED\'s', () => {
    const r = rig('pop');
    expect(r.mover().stanceCut).toBe(true);
    expect(r.room.walker.stanceCut).toBe(true);
    expect(r.mover().stanceSeparate).toBe(false);
    expect(r.room.walker.stanceSeparate).toBe(false);
    expect(r.sent.every((c) => c.separate === false)).toBe(true);
  });

  it('COMBINED-CUT: the quick drop -- crouched at stick 0.3, Triangle held: no drop before the 0.4 s hold, then cut on both', () => {
    const r = rig('pop');
    r.walk.setStance('crouch'); r.frames(60);
    expect(r.walk.stance()).toBe('crouch');
    r.stick(0.3); r.frames(20);
    let held = 0;
    while (r.mover().stance === 'crouch' && held < 60) { r.frame({ stance: true }); held++; }
    // STANCE_HOLD_S_PLACEHOLDER (0.4 s) unchanged: the stance word is prone on the hold's 26th frame, as on a8089b5ef's
    // mover before COMBINED-CUT (this test's RED run: 26) -- the cut acts only once the clip is on top
    expect(held).toBe(26);
    expect(r.mover().action?.name).toBe('crouchToProne');
    r.frames(3, { stance: true });
    expect(r.mover().stance).toBe('prone');
    expect(r.mover().action).toBeNull();
    r.frames(30);
    expect(r.mover().posture).toBe('prone');
  });

  it('COMBINED-CUT: the pop -- prone, the stick full, a crouch: the crouch run on both, positions agreeing', () => {
    const r = rig('pop');
    r.walk.setStance('prone'); r.frames(90);
    expect(r.walk.stance()).toBe('prone');
    r.stick(1); r.frames(20);
    r.walk.setStance('crouch'); r.frames(3);
    expect(r.mover().stance).toBe('crouch');
    expect(r.mover().action).toBeNull();
    r.frames(20);
    expect(Math.hypot(r.mover().state.vx, r.mover().state.vz)).toBeCloseTo(65, 1);
  });

  it('COMBINED-CUT and OT.R76: Square inside the drop pops; once the stick has cut the drop, its window has closed with it', () => {
    for (const late of [false, true]) {
      const r = rig('pop');
      r.walk.setStance('crouch'); r.frames(60);
      r.stick(0.3); r.frames(20);
      let held = 0;
      while (r.mover().stance === 'crouch' && held < 60) { r.frame({ stance: true }); held++; }
      r.frame();                                                 // the release: the drop still on top (its push's frame + 1)
      expect(r.mover().action?.name).toBe('crouchToProne');
      if (late) { r.frames(2); expect(r.mover().action).toBeNull(); }
      const popsBefore = r.sent.filter((c) => c.stance === 3).length;
      r.frame({ jump: true }); r.frame();
      const popped = r.sent.filter((c) => c.stance === 3).length > popsBefore;
      // the window is the drop's own life (`WalkMode.popMotion`, OT.R76): the cut ends the drop, so ends the window
      expect(popped, `late ${late}`).toBe(!late);
      expect(r.mover().stance, `late ${late}`).toBe(late ? 'prone' : 'stand');
      r.frames(30);
    }
  });

  it('COMBINED-CUT: no stick, the drop plays whole on both (the pop window\'s motion as on main)', () => {
    const r = rig('pop');
    r.walk.setStance('crouch'); r.frames(60);
    r.walk.setStance('prone'); r.frames(3);
    expect(r.mover().action?.name).toBe('crouchToProne');
    r.frames(40);
    expect(r.mover().action?.name).toBe('crouchToProne');
    r.frames(60);
    expect(r.mover().action).toBeNull();
  });
});

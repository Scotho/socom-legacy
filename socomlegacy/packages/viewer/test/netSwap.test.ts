// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { FlyCamera } from '../src/camera';
import { groundGrid, packGround, Walker, WalkMode, type GroundData, type TraversalHooks } from '../src/walk';
import { MoverSim } from '../src/net/moverSim';
import { Button, type Command } from '../src/net/protocol';

/**
 * The swap on the wire (web sprint 3's merge review): `WalkMode.swapWeapon` replicates a swap only when the mover took
 * it. A refused one -- in the air, while another swap plays, while a move holds the mover -- must neither send the
 * `Swap` press nor change the weapon every later command reports in hand, or the other screens and the server's
 * shots read a weapon the SEAL never drew.
 */

const canvas = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined;
  c.releasePointerCapture = () => undefined;
  c.hasPointerCapture = () => false;
  return c;
};

const GROUND: GroundData = packGround(
  { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
  [{
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200]),
  }],
  [{ modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1 }],
);

function rig() {
  const fly = new FlyCamera(canvas());
  const walk = new WalkMode(fly);
  walk.setGround(GROUND, [0, 0, 0]);
  fly.setPose({ x: 5, y: 40, z: 6, yaw: 0, pitch: 0 });
  walk.setMode('walk');
  fly.groundWish = () => ({ forward: 0, right: 0, boost: false });
  const sent: Omit<Command, 'seq'>[] = [];
  walk.setNetTap((cmd) => sent.push(cmd));
  /** One 60 Hz frame; the commands it sent. */
  const tick = (): Omit<Command, 'seq'>[] => { const from = sent.length; walk.frame(1 / 60); return sent.slice(from); };
  for (let i = 0; i < 10; i++) tick();                           // settled on the floor
  return { walk, tick, sent: () => sent, dispose: () => walk.unbindKey() };
}

describe('the swap is replicated only when the mover takes it', () => {
  it('an accepted swap sends the press and the new weapon', () => {
    const { walk, tick, dispose } = rig();
    expect(walk.swapWeapon('pistol')).not.toBeNull();
    const [cmd] = tick();
    expect(cmd!.buttons & Button.Swap).toBe(Button.Swap);
    expect(cmd!.weapon).toBe(1);
    dispose();
  });

  it('a swap refused mid-swap sends no press and keeps the weapon in hand', () => {
    const { walk, tick, dispose } = rig();
    expect(walk.swapWeapon('pistol')).not.toBeNull();
    tick();
    expect(walk.swapWeapon('rifle')).toBeNull();                   // one at a time: the mover refuses
    const cmds = [...tick(), ...tick()];
    expect(cmds.length).toBeGreaterThan(0);
    for (const c of cmds) {
      expect(c.buttons & Button.Swap).toBe(0);
      expect(c.weapon).toBe(1);
    }
    dispose();
  });

  it('a swap refused through a jump sends no press and keeps the rifle', () => {
    const { walk, tick, dispose } = rig();
    expect(walk.jump()).toBe(true);
    tick();
    expect(walk.swapWeapon('pistol')).toBeNull();                  // the jump (its action, then the air) refuses it
    const cmds = [...tick(), ...tick()];
    for (const c of cmds) {
      expect(c.buttons & Button.Swap).toBe(0);
      expect(c.weapon).toBe(0);
    }
    dispose();
  });
});

/**
 * The review of the swap layering (2026-10-05, low 1): the page takes a swap at the press, the room at the command's
 * tick. Above 60 frames a second a press can land on a frame with no tick, and a zoom step on the next before the tick
 * -- the command then carries `Swap | Scope`. `FUN_005c4fd0`'s gate runs at the press, before the zoom (research 211
 * §2), so the room weighs the swap against the view the last command left (`MoverSim.prepare`: the swap before the
 * command's `Scope`), and the page against the same (`WalkMode.swapWeapon`: the last command's `Scope`): every press
 * between two ticks is one game tick's, the swap before the zoom. The two then never disagree on the weapon in hand.
 */
describe('the page and the room agree on a swap around a zoom step between two ticks', () => {
  const both = () => {
    const page = rig();
    const server = new MoverSim(new Walker(groundGrid(GROUND)), null);
    server.walker.place(5, 40 - 10, 6);
    let seq = 0;
    /** One page frame with its tick; each command it sent applied by the room. */
    const tick = (): Omit<Command, 'seq'>[] => { const cmds = page.tick(); for (const c of cmds) server.apply({ ...c, seq: ++seq }); return cmds; };
    for (let i = 0; i < 10; i++) tick();
    return { ...page, server, tick };
  };

  it('a swap taken in first person, then the scope stepped into before the tick: the room takes it too', () => {
    const { walk, server, tick, dispose } = both();
    expect(walk.swapWeapon('pistol')).not.toBeNull();            // a frame with no tick: the page took it
    walk.setScopedMove(true);                                     // d-pad Up to state 5 on the next frame, no tick yet
    const [cmd] = tick();
    expect(cmd!.buttons & (Button.Swap | Button.Scope)).toBe(Button.Swap | Button.Scope);
    expect(cmd!.weapon).toBe(1);
    expect(server.weapon).toBe(1);                                // the room holds the pistol as the page does
    expect(server.walker.swapProgress()).not.toBeNull();
    dispose();
  });

  it('out of the scope and a swap before the tick: the page refuses it as the room would, the rifle in both', () => {
    const { walk, server, tick, dispose } = both();
    walk.setScopedMove(true);
    tick();                                                       // a command with `Scope`: the view is a scope
    walk.setScopedMove(false);                                    // d-pad Down, no tick yet
    expect(walk.swapWeapon('pistol')).toBeNull();                 // the swap weighed before this tick's zoom step
    const [cmd] = tick();
    expect(cmd!.buttons & Button.Swap).toBe(0);
    expect(cmd!.weapon).toBe(0);
    expect(server.weapon).toBe(0);
    tick();
    expect(walk.swapWeapon('pistol')).not.toBeNull();             // the next tick's press: out of the scope, taken
    tick();
    expect(server.weapon).toBe(1);
    dispose();
  });
});

/**
 * The review's second round (2026-10-05): the original's player update reads, in this order, the jump (Square,
 * D:L453208-453217), the swap (L1 / L2, D:L453288-453312), the zoom (D:L453313-453323) and the stance (Triangle,
 * D:L453331-453430). The room takes a command's presses in that order (`MoverSim.prepare`); the page, whose presses land
 * between ticks, keeps it within a tick: a jump pressed after a swap or a stance waits for the next tick, a swap pressed
 * after a stance is refused, and the swap weighs the view the last tick left whatever the zoom did since.
 */
describe('the page and the room take a tick\'s presses in the original\'s order: jump, swap, zoom, stance', () => {
  const both = () => {
    const page = rig();
    const server = new MoverSim(new Walker(groundGrid(GROUND)), null);
    server.walker.place(5, 30, 6);
    let seq = 0;
    const tick = (): Omit<Command, 'seq'>[] => { const cmds = page.tick(); for (const c of cmds) server.apply({ ...c, seq: ++seq }); return cmds; };
    for (let i = 0; i < 10; i++) tick();
    /** The page's mover and the room's, as each stands: the weapon, the action, airborne. */
    const state = () => {
      const s = page.walk.snapshot()!;
      return {
        page: { weapon: page.sent().at(-1)!.weapon, action: s.action?.name ?? null, air: s.airborne },
        room: { weapon: server.weapon, action: server.walker.action?.name ?? null, air: server.walker.airborne },
      };
    };
    return { ...page, server, tick, state };
  };

  it('a swap, then a jump before the tick: the jump waits for the next tick, page and room alike', () => {
    const { walk, tick, state, dispose } = both();
    expect(walk.swapWeapon('pistol')).not.toBeNull();
    walk.jump();
    tick();
    tick();
    const s = state();
    expect(s.room.weapon).toBe(1);
    expect(s.page).toEqual(s.room);
    dispose();
  });

  it('a swap, then a stance press before the tick: the room swaps first too, the same clip on both movers', () => {
    const { walk, tick, state, dispose } = both();
    expect(walk.swapWeapon('pistol')).not.toBeNull();
    walk.setStance('crouch');
    tick();
    const s = state();
    expect(s.room.weapon).toBe(1);
    expect(s.page.action).toBe('swapStand');
    expect(s.page).toEqual(s.room);
    dispose();
  });

  it('a stance press, then a swap before the tick: the swap is refused, as the room (swap before stance) would part', () => {
    const { walk, tick, state, dispose } = both();
    walk.setStance('crouch');
    expect(walk.swapWeapon('pistol')).toBeNull();
    tick();
    const s = state();
    expect(s.room.weapon).toBe(0);
    expect(s.page).toEqual(s.room);
    dispose();
  });

  it('a step into the scope, then a swap before the tick: taken, as the original takes it (the swap read before the zoom)', () => {
    const { walk, tick, server, dispose } = both();
    walk.setScopedMove(true);
    expect(walk.swapWeapon('pistol')).not.toBeNull();
    const [cmd] = tick();
    expect(cmd!.buttons & (Button.Swap | Button.Scope)).toBe(Button.Swap | Button.Scope);
    expect(server.weapon).toBe(1);
    dispose();
  });

  it('swapGate answers as the swap would, with no side effect: refused in the air, in the scope the last tick left, after a stance press', () => {
    const { walk, tick, dispose } = both();
    expect(walk.swapGate()).toBe(true);
    walk.jump();
    expect(walk.swapGate()).toBe(false);                          // the jump's action, then the air (FUN_005b4340(actor, 4))
    for (let i = 0; i < 120; i++) tick();
    expect(walk.swapGate()).toBe(true);
    walk.setScopedMove(true);
    expect(walk.swapGate()).toBe(true);                           // the view the last tick left: not yet the scope
    tick();
    expect(walk.swapGate()).toBe(false);                          // FUN_005c4fd0
    walk.setScopedMove(false);
    tick();
    walk.setStance('crouch');
    expect(walk.swapGate()).toBe(false);                          // the stance pressed this tick: the swap is read first
    tick();
    for (let i = 0; i < 60; i++) tick();
    expect(walk.swapGate()).toBe(true);
    expect(walk.swapWeapon('pistol')).not.toBeNull();
    expect(walk.swapGate()).toBe(false);                          // a swap playing (FUN_005a7980)
    dispose();
  });
});

/**
 * The review of the press order (2026-10-05, item 3): the player update fires the Action (Cross, state 3: the
 * controller's `vtbl[0x78]`, D:L453218-453243) after the jump (D:L453208-453217) and before the shoulders
 * (D:L453288-453312). The room takes a command's Action there (`MoverSim.prepare`); the page keeps it within a tick: an
 * Action pressed after a swap or a stance waits for the next tick, and a jump after an Action waits too. Pinned with a
 * stand-in for the traversal moves whose Action takes hold of the mover (a grab: `busy`), on both movers.
 */
describe('the Action in the press order: jump, Action, swap, zoom, stance', () => {
  /** A stand-in for `./traversal`: the Action grabs (the mover held from then on). */
  const grabber = (): TraversalHooks => {
    let held = false;
    return {
      tick: () => false, pose: () => null, rootY: () => null, yaw: () => null, peek: () => 0, peeking: () => 0,
      action: () => { held = true; }, lean: () => undefined, reset: () => { held = false; }, busy: () => held,
      jump: () => false, dive: () => false, stanceButton: () => false,
    };
  };
  const both = () => {
    const fly = new FlyCamera(canvas());
    const walk = new WalkMode(fly);
    walk.setGround(GROUND, [0, 0, 0]);
    walk.useTraversal(() => grabber());
    fly.setPose({ x: 5, y: 40, z: 6, yaw: 0, pitch: 0 });
    walk.setMode('walk');
    fly.groundWish = () => ({ forward: 0, right: 0, boost: false });
    const sent: Omit<Command, 'seq'>[] = [];
    walk.setNetTap((cmd) => sent.push(cmd));
    const roomMoves = grabber();
    const server = new MoverSim(new Walker(groundGrid(GROUND)), roomMoves);
    server.walker.place(5, 30, 6);
    let seq = 0;
    const tick = (): Omit<Command, 'seq'>[] => { const from = sent.length; walk.frame(1 / 60); const cmds = sent.slice(from); for (const c of cmds) server.apply({ ...c, seq: ++seq }); return cmds; };
    for (let i = 0; i < 10; i++) tick();
    const state = () => ({
      page: { weapon: sent.at(-1)!.weapon, held: walk.traversal()!.busy() },
      room: { weapon: server.weapon, held: roomMoves.busy() },
    });
    return { walk, tick, state, dispose: () => walk.unbindKey() };
  };

  it('a swap, then the Action before the tick: the Action waits a tick -- the swap taken and then the grab, page and room', () => {
    const { walk, tick, state, dispose } = both();
    expect(walk.swapWeapon('pistol')).not.toBeNull();
    walk.action();
    const [first] = tick();
    expect(first!.buttons & (Button.Swap | Button.Action)).toBe(Button.Swap);
    tick();
    const s = state();
    expect(s.room).toEqual({ weapon: 1, held: true });
    expect(s.page).toEqual(s.room);
    dispose();
  });

  it('the Action, then a swap before the tick: the grab holds the mover, the swap refused on both', () => {
    const { walk, tick, state, dispose } = both();
    walk.action();
    expect(walk.swapWeapon('pistol')).toBeNull();
    tick();
    const s = state();
    expect(s.room).toEqual({ weapon: 0, held: true });
    expect(s.page).toEqual(s.room);
    dispose();
  });

  it('the Action, then a jump before the tick: the jump waits a tick (read before the Action in the update)', () => {
    const { walk, tick, dispose } = both();
    walk.action();
    walk.jump();
    const [first] = tick();
    expect(first!.buttons & (Button.Action | Button.Jump)).toBe(Button.Action);
    const [second] = tick();
    expect(second!.buttons & Button.Jump).toBe(Button.Jump);
    dispose();
  });
});

describe('the walk\'s tick count (the zoom marks its tick by it)', () => {
  it('runs on across a new net tap: the commands\' numbering restarts, the ticks do not', () => {
    const { walk, tick, dispose } = rig();
    const before = walk.ticks();
    walk.setNetTap(() => undefined);
    tick();
    expect(walk.ticks()).toBe(before + 1);
    dispose();
  });
});

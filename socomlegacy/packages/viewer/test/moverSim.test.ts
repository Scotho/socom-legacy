import { describe, expect, it } from 'vitest';
import { buildGrid, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { TICK, Walker } from '../src/walk';
import { Traversal } from '../src/traversal';
import { LauncherClips, MoverSim } from '../src/net/moverSim';
import { Button, STANCE_CODES, type Command } from '../src/net/protocol';

/**
 * The shared apply (`../src/net/moverSim`): one command's presses in the player update's order (`FUN_00594cf0`), the
 * page's prediction and the room alike (PF-20, research 217 §3).
 */

const floor = (y: number): WorldPoly => ({
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0, appflags: 0,
  points: Float32Array.from([-100, y, -100, 100, y, -100, 100, y, 100, -100, y, 100]),
});

function world(polys: WorldPoly[]): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}

describe("the room's press order (MoverSim.prepare)", () => {
  it("the room's press order is the jump, the Action, the swap, the zoom, the stance, then the lean (D:L453208-453458): a stance and a lean on one command end the peek before the lean is read", () => {
    const polys = [floor(0)];
    const grid = world(polys);
    const w = new Walker(grid);
    const t = new Traversal(grid, polys);
    const sim = new MoverSim(w, t);
    w.place(0, 10, 0);
    let seq = 0;
    const cmd = (buttons: number, stance = 0): Command =>
      ({ seq: ++seq, forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons, stance, weapon: 0 });
    for (let i = 0; i < 60; i++) sim.apply(cmd(Button.LeanRight));
    expect(t.peeking()).toBe(1);
    const key = t.pose()!.frame;
    // One command: the stance and the lean held. The stance pops the peek (no transition, the stance kept); the lean,
    // read after it (D:L453431-453458), finds the d-pad still held, so the held key is kept for the next tick.
    const out = sim.apply(cmd(Button.Stance | Button.LeanRight, STANCE_CODES.indexOf('crouch')));
    expect(out.stance).toBe('stand');
    expect(w.action).toBeNull();
    expect(t.peeking()).toBe(0);
    expect(t.leanHeld()).toBe(1);                                   // the command's lean, read after the stance's pop
    sim.apply(cmd(Button.LeanRight));
    expect(t.peeking()).toBe(1);                                    // the next tick peeks again
    expect(t.pose()?.frame).toBe(key);                              // from the held key (PEEK_REPUSH_KEY_READING)
    expect(w.stance).toBe('stand');
  });
});

/**
 * PAR-84 (research 230 section 5.2.10, build step 4): the launcher's raise and still lower start in the one function both
 * movers run each command through. The raise is pushed in the controller's frame before the driver -- the item swap's
 * path (`FUN_005c1660` D:L476734 -> `FUN_005a64c0` -> `FUN_005a6d30` D:L461878-461886) -- so `prepare` asks its hook
 * (`launcherClip`, the page's from the command it kept) or the room's kept clips (`launcherClips`) before the command's
 * swap and hold: the swap riding that command is refused under it (`FUN_005a8cb0` D:L463159), a stance press kept.
 */
describe("PAR-84: the launcher's clip started in MoverSim.prepare, before the command's swap and hold", () => {
  const rig = () => {
    const polys = [floor(0)];
    const w = new Walker(world(polys));
    const sim = new MoverSim(w, null);
    w.place(0, 10, 0);
    let seq = 0;
    const cmd = (buttons = 0, over: Partial<Command> = {}): Command =>
      ({ seq: ++seq, forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons, stance: 0, weapon: 0, ...over });
    return { w, sim, cmd };
  };

  it('the hook answers its command: the clip on before the swap (refused) and the stance (kept) the same command carries; asked once a command, with its seq', () => {
    const { w, sim, cmd } = rig();
    const asked: number[] = [];
    sim.launcherClip = (s) => { asked.push(s); return s === 3 ? { name: 'pistolToLauncher', reversed: true, at: 3 } : null; };
    sim.apply(cmd()); sim.apply(cmd());
    expect(w.action).toBeNull();
    const out = sim.apply(cmd(Button.Swap | Button.Stance, { weapon: 1, stance: STANCE_CODES.indexOf('crouch') }));
    expect(asked).toEqual([1, 2, 3]);
    expect(w.action).toMatchObject({ name: 'pistolToLauncher', reversed: true });
    expect(out.swap).toBeNull();
    expect(sim.weapon).toBe(0);                                      // the swap refused under it
    expect([w.stance, w.pendingStance]).toEqual(['stand', 'crouch']);  // the stance press kept
  });

  it("the room's kept clips (LauncherClips): started on the first command run at or after its own, its clock caught up over a lost one; answered once; live on its own command through the 84th (rifle) / 82nd (pistol)", () => {
    const { w, sim, cmd } = rig();
    sim.launcherClips.keep({ name: 'rifleToLauncher', reversed: false, at: 3 });
    expect(sim.launcherClips.liveOn(2)).toBe(false);
    expect(sim.launcherClips.liveOn(3)).toBe(true);
    expect(sim.launcherClips.liveOn(3 + 83)).toBe(true);
    expect(sim.launcherClips.liveOn(3 + 84)).toBe(false);
    sim.apply(cmd()); sim.apply(cmd());
    expect(w.action).toBeNull();
    sim.apply({ ...cmd(), seq: 4 });                                  // command 3 lost: started on 4, a tick in
    expect(w.action?.name).toBe('rifleToLauncher');
    expect(w.action?.t).toBeCloseTo(2 * TICK, 9);
    for (let s = 5; s < 3 + 83; s++) { sim.apply({ ...cmd(), seq: s }); expect(w.action?.name, `command ${s}`).toBe('rifleToLauncher'); }
    sim.apply({ ...cmd(), seq: 3 + 83 });                             // its 84th command: off
    expect(w.action).toBeNull();
    sim.apply({ ...cmd(), seq: 3 + 84 });
    expect(w.action).toBeNull();                                      // answered once
    const pistol = new LauncherClips();
    pistol.keep({ name: 'pistolToLauncher', reversed: true, at: 10 });
    expect([pistol.liveOn(10 + 81), pistol.liveOn(10 + 82)]).toEqual([true, false]);
    expect(pistol.next(9)).toBeNull();
    expect(pistol.next(200)).toBeNull();                              // past its life: none to start
  });
});

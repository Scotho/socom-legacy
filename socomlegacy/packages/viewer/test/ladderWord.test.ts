import { describe, expect, it } from 'vitest';
import type { CollisionOwner, WorldPoly } from '@s2u/scene';
import { Button, groundGrid, groundPolygons, MoverSim, packGround, Traversal, Walker, type Command } from '../src/sim';
import type { TraversalEvent } from '../src/traversal';
import { GATE_PARAMS } from './helpers/gateTable';

/**
 * R4P-R1 (AS-01; research 86 s2.6, "R4P-R1 (AS-01): r0004's pending-climb word -- met by construction"; reading, pending
 * review). r0004 keeps a pending-climb word (`CZSealBody +0x1334`, `ladder_request_timeout`): a ladder request sets it to
 * 150 (`FUN_005b8920`, D4:L509829 the offline path, D4:L509838 the online one), state 1 of `FUN_005b76d0` counts it down
 * (D4:L509088-509097), the grant re-checks the mount (D4:L509027-509043), and online, while it runs, the jump, the moving
 * dive, the type-0 use and the bomb drop are refused (D4:L481365, D4:L484650-484651, D4:L493575-493578, D4:L493637).
 * The port asks no one for a ladder. What this file PINS (the port's current behaviour, nothing new; no game data):
 * through `MoverSim` -> `Traversal` -- the room's path and the page's re-run path (`../src/walk` `WalkMode`'s replays) --
 * the mount lands on the press's own command (its seq), the offer is consumed there, and a Jump on the next command is
 * refused on the mount. It does NOT drive the page's live path (`WalkMode.action`), and its two movers run the same code,
 * so their agreement is by construction, not a proof that the page and the room agree. If LC-3 ever makes the mount wait
 * on the room, it goes red and the word becomes a task.
 */

const quad = (pts: number[], ditype: number, appflags = 0, path = 'worldmodel/q'): WorldPoly => ({
  modelName: 'worldmodel', path, region: 0, ditype, material: 25, ptcount: 4, cameratype: 0, appflags, points: Float32Array.from(pts),
});
const floor = (x0: number, z0: number, x1: number, z1: number, y: number): WorldPoly => quad([x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0], 3);

/** ladderReload.test.ts's `ladderGround` (traversal.test.ts's `ladderWorld`): a 40-high wall at z 0, a ladder 0..40 on it. */
function ladderGround(): ReturnType<typeof packGround> {
  const polys = [
    floor(-100, 0, 100, 100, 0),
    floor(-100, -100, 100, 0, 40),
    quad([-100, 0, 0, 100, 0, 0, 100, 40, 0, -100, 40, 0], 2),
    quad([-3, 0, 0.2, 3, 0, 0.2, 3, 40, 0.2, -3, 40, 0.2], 2, 2, 'worldmodel/lad/ladder'),
    quad([3, 40, 0.2, -3, 40, 0.2, -3, 50, 0.2, 3, 50, 0.2], 2, 2, 'worldmodel/lad/ladder'),
  ];
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return packGround(GATE_PARAMS, polys, owners);
}

interface End { sim: MoverSim; t: Traversal; heard: { seq: number; e: TraversalEvent }[] }

/** A mover: its own walker and traversal on the ground, standing at [0, 0, z] facing the ladder. */
function end(ground: ReturnType<typeof packGround>, z = 20): End {
  const w = new Walker(groundGrid(ground));
  const t = new Traversal(w.grid, groundPolygons(ground));
  const sim = new MoverSim(w, t);
  expect(w.place(0, 0, z)).toBe(true);
  w.state.yaw = 0;
  const heard: End['heard'] = [];
  t.on((e) => heard.push({ seq: sim.seq, e }));                  // as the room's `watchMoves` hears it: inside `sim.seq`'s run
  return { sim, t, heard };
}

describe("R4P-R1 (AS-01): r0004's pending-climb word -- MoverSim's ladder mount lands in the press's own command", () => {
  it('two movers on the same commands mount on the press command with the offer consumed; a jump the next command is refused on the mount', () => {
    const ground = ladderGround();
    const page = end(ground), room = end(ground);
    let seq = 0;
    const cmd = (over: Partial<Command>): Command => ({ seq: ++seq, forward: 0, right: 0, yaw: page.sim.walker.state.yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0, ...over });
    const both = (c: Command): void => { page.sim.apply(c); room.sim.apply(c); };

    for (let i = 0; i < 10; i++) both(cmd({}));                                // settle at rest
    for (let i = 0; i < 400 && page.t.climbPrompt()?.kind !== 'ladder'; i++) both(cmd({ forward: 1 }));
    for (const e of [page, room]) {
      expect(e.t.climbPrompt()?.kind).toBe('ladder');                          // CLIMB offered to both movers
      expect(e.t.state().kind).toBe('none');
      expect(e.heard).toEqual([]);
    }

    const press = cmd({ forward: 1, buttons: Button.Action });
    both(press);
    for (const e of [page, room]) {
      // The mount is heard inside the press's own run -- no request, no grant, no pending word between them.
      expect(e.heard.map((h) => [h.seq, h.e.type])).toEqual([[press.seq, 'ladderMount']]);
      expect(e.t.state().kind).toBe('ladderMount');                            // on the press's command, not a later one
      expect(e.t.climbPrompt()).toBeNull();                                    // the offer consumed: nothing waits on it
      expect(e.t.busy()).toBe(true);
    }

    // The command right after: Jump. A move holds the mover (`MoverSim.jump` -> `Traversal.jump`): only the hang takes it,
    // so on the mount it does nothing -- no take-off, the mount runs on. The port's current behaviour, pinned.
    const jumpsBefore = page.sim.jumps;
    const next = cmd({ buttons: Button.Jump });
    const out = [page, room].map((e) => e.sim.apply(next));
    for (const [i, e] of [page, room].entries()) {
      expect(out[i]!.jumped).toBe(false);
      expect(e.sim.jumps).toBe(jumpsBefore);
      expect(e.sim.walker.airborne).toBe(false);
      expect(e.t.state().kind).toBe('ladderMount');
      expect(e.heard).toHaveLength(1);
    }
  });

  // Jump and Action on one command: `MoverSim.prepare` lays the jump first (`../src/net/moverSim.ts` :197-198, the player
  // update's order D:L453208 then D:L453218), so the tick's mount sees what the jump left. Pinned as the port does today.
  const jumpAndAction = (z: number, forward: number) => {
    const p = end(ladderGround(), z);
    let seq = 0;
    const cmd = (over: Partial<Command>): Command => ({ seq: ++seq, forward: 0, right: 0, yaw: p.sim.walker.state.yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0, ...over });
    for (let i = 0; i < 10; i++) p.sim.apply(cmd({}));
    for (let i = 0; i < 400 && p.t.climbPrompt()?.kind !== 'ladder'; i++) p.sim.apply(cmd({ forward: 1 }));
    expect(p.t.climbPrompt()?.kind).toBe('ladder');
    if (forward === 0) for (let i = 0; i < 30; i++) p.sim.apply(cmd({}));    // come to rest, still offered
    expect(p.t.climbPrompt()?.kind).toBe('ladder');
    const both = cmd({ forward, buttons: Button.Jump | Button.Action });
    return { p, both, out: p.sim.apply(both) };
  };

  it('running in (from 60 out), Jump + Action on one command: the jump takes off, the airborne body drops the offer, nothing mounts', () => {
    const { p, out } = jumpAndAction(60, 1);
    expect(out.jumped).toBe(true);
    expect(p.sim.walker.airborne).toBe(true);
    expect(p.t.state().kind).toBe('none');
    expect(p.t.climbPrompt()).toBeNull();
    expect(p.heard).toEqual([]);
  });

  it('at rest at the foot, Jump + Action on one command: the jump is counted, the body stays grounded and mounts on that command', () => {
    const { p, both, out } = jumpAndAction(20, 0);
    expect(out.jumped).toBe(true);
    expect(p.sim.jumps).toBe(1);
    expect(p.sim.walker.airborne).toBe(false);
    expect(p.t.state().kind).toBe('ladderMount');
    expect(p.heard.map((h) => [h.seq, h.e.type])).toEqual([[both.seq, 'ladderMount']]);
  });
});

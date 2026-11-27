// @vitest-environment node
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import type { EffectOp } from '@s2u/scene';
import { ActionPage, type ActionPageDeps } from '../src/actionPage';
import { PHASE_REST } from '../src/doors';
import { invertAffine, mul4, quatOfMatrix } from '../src/doorMath';
import { GatePage } from '../src/gatePage';
import { GateSet, leadIns, leverValveWrites } from '../src/gates';
import type { DoorWire } from '../src/net/protocol';
import { loadSimMap, type SimMap } from '../src/simMap';
import { WorldState } from '../src/worldState';

/**
 * LATER 307 on the dev disc (`SOCOM_DISC`; MP11 and MP62 are no fixtures; research 174 s5.1, 175 s5.3; reading, pending
 * review): Death Trap's and Enowapi's lever programs through the repository's readers (`loadSimMap`: `readGates`, the
 * world's scene programs) and presented as a page presents the room's `action` event (`ActionPage.event` ->
 * `GatePage.present`, `GATE_LEVER_PRESENT_ADAPTATION`): `.SWITCH_SMALL` at the pulled lever's `gatehand` after the 0.24 s
 * lead-in, the leaf's own sound (MP11 `~FENCE_GATE`, MP62 `.WOOD_DR_SLD_OP` then `.WOOD_DR_SLD_CL`), the handle's 0.5 s
 * turn (flags 0x60, -100 degrees about its X and back) -- Enowapi's gate 2 turning both `lever_2`'s and `lever_3`'s
 * handles (`relatedopen` / `relatedclose`) -- and the leaf never moved by the page. Skipped without the disc, the skip
 * said in its name.
 */

const DISC = process.env.SOCOM_DISC;
const has = (stem: string): boolean => !!DISC && existsSync(resolve(DISC, `RUN/${stem}.ZDB`));
const HAND = (n: number): string => `worldmodel/lever_${n}/gateswitch=gateswitch/gatehand`;

async function rig(stem: string) {
  const map: SimMap = await loadSimMap(new FsAssetSource(DISC!), `RUN/${stem}.ZDB`);
  const sounds: { name: string; path: string | null }[] = [];
  const world = new WorldState(map.meta!, map.ground, map.grid, { sound: (name, path) => sounds.push({ name, path }) });
  world.applyInitial();
  const moved: { path: string; delta: Float32Array }[] = [];
  const doors: DoorWire[] = [...(map.doors ?? []).map(() => ({ valve: 0, phase: PHASE_REST })), ...(map.gates ?? []).map(() => ({ valve: 0, phase: PHASE_REST }))];
  const gates = new GatePage({ move: (path, delta) => moved.push({ path, delta: Float32Array.from(delta) }), net: () => ({ doors: () => doors }) });
  gates.setMap(map.gates, map.ground, map.doors?.length ?? 0);
  gates.frame(1 / 60);
  moved.length = 0;
  const page = new ActionPage({
    world: () => world, feet: () => null, aim: () => null, net: () => null,
    gateLever: (action: number, read: (valve: string) => number) => gates.present(action, read),
  } as ActionPageDeps);
  const run = (seconds: number) => { for (let k = 0; k < Math.round(seconds * 60); k++) { world.step(1 / 60); gates.frame(1 / 60); } };
  const handles = new Map((map.gates ?? []).flatMap((g) => g.levers.flatMap((l) => (l.handles ?? []).map((h) => [h.path, h] as const))));
  /** The handle's drawn turn about its own X, in degrees: its local matrix `L P delta P^-1` (the delta is world-space). */
  const angle = (path: string): number | null => {
    const d = moved.filter((x) => x.path === path).pop()?.delta, h = handles.get(path);
    if (!d || !h) return null;
    const m = mul4(mul4(mul4(h.local, h.parent), d), invertAffine(h.parent));
    return Math.round((Math.atan2(m[6]!, m[5]!) * 180) / Math.PI * 1000) / 1000;
  };
  const lever = (node: string) => {
    const i = map.meta!.actions.findIndex((a) => a.node === node);
    expect(i, `${stem} ${node}`).toBeGreaterThanOrEqual(0);
    return i;
  };
  /** One `action` event on `node`, run out: the sounds and paths heard, and the handles drawn. */
  const pull = (node: string) => {
    sounds.length = 0; moved.length = 0;
    page.event({ type: 'action', action: lever(node), by: 2 });
    run(4);
    return { sounds: sounds.map((s) => `${s.name}@${s.path}`), turned: [...new Set(moved.map((x) => x.path))].sort() };
  };
  return { map, world, gates, page, pull, angle, lever, moved };
}

/** Each gatehand's rest rotation is none: the command's absolute quaternions and a turn from rest draw the same. */
function handlesAtRest(map: SimMap): void {
  for (const g of map.gates!) for (const l of g.levers) for (const h of l.handles ?? []) {
    const q = quatOfMatrix(h.local);
    expect(Math.abs(q[3]), `${h.path} rest rotation`).toBeCloseTo(1, 5);
  }
}

describe.skipIf(!has('MP11'))(`LATER 307: Death Trap's levers presented on the page${has('MP11') ? '' : ' (SOCOM_DISC with RUN/MP11.ZDB absent)'}`, () => {
  it('each lever: .SWITCH_SMALL at its gatehand, ~FENCE_GATE at the leaf, the handle -100 degrees and back, no leaf moved', async () => {
    const r = await rig('MP11');
    expect(r.map.gates!.map((g) => g.levers.map((l) => [l.node, (l.handles ?? []).map((h) => [h.node, h.path])]))).toEqual([
      [['epanel_di1', [[2, HAND(1)]]]],
      [['epanel_di2', [[2, HAND(2)]]]],
    ]);
    handlesAtRest(r.map);
    for (const n of [1, 2]) {
      const leaf = `worldmodel/access${n}/gate_move${n}`;
      const open = r.pull(`epanel_di${n}`);
      expect(open).toEqual({ sounds: [`.SWITCH_SMALL@${HAND(n)}`, `~FENCE_GATE@${leaf}`], turned: [HAND(n)] });
      expect(r.angle(HAND(n))).toBeCloseTo(-100, 2);
      expect(r.world.valve(`gate${n}`)).toBe(1);
      const shut = r.pull(`epanel_di${n}`);
      expect(shut).toEqual({ sounds: [`.SWITCH_SMALL@${HAND(n)}`, `~FENCE_GATE@${leaf}`], turned: [HAND(n)] });
      expect(r.angle(HAND(n))).toBeCloseTo(0, 2);
      expect(r.world.valve(`gate${n}`)).toBe(0);
    }
    expect(r.gates.stats().map((s) => s.offset)).toEqual([[0, 0, 0], [0, 0, 0]]);   // the leaves are the room's pose
  });

  it("the program's own ~FENCE_GATE: a new play (0x80) at the slide's start and its stop (0x100, no new play) after the 3 s slide", async () => {
    const r = await rig('MP11');
    for (const g of r.map.gates!) {
      const seq = g.levers[0]!.program.sequences;
      for (const name of ['gateopen', 'gateclose']) {
        const ops = seq.find((s) => s.name === name)!.ops;
        expect(ops.map((o: EffectOp) => (o.op === 'sound' ? `${o.sound}:${o.flags}:${o.newPlay}` : o.op === 'fromTo' ? `fromTo:${o.flags}:${o.seconds}` : o.op)))
          .toEqual(['~FENCE_GATE:130:true', 'fromTo:9:3', '~FENCE_GATE:258:false']);
      }
    }
  });

  it("the handle's own gatehand command off the disc (a pin of the disc's values, LATER 307 review F5(a)): flags 96, 0.5 s, (0,0,0,1) <-> (-0.76604,0,0,0.64279)", async () => {
    const r = await rig('MP11');
    const near = (a: readonly number[], b: readonly number[]) => b.forEach((v, i) => expect(a[i]!, `q${i}`).toBeCloseTo(v, 4));
    const turns: string[] = [];
    for (const g of r.map.gates!) for (const l of g.levers) for (const s of l.program.sequences) for (const o of s.ops) {
      if (o.op !== 'fromTo' || o.flags !== 96) continue;
      expect(o.seconds).toBeCloseTo(0.5, 6);
      const { from, to } = o.rotation!;
      const open = Math.abs(from[3]! - 1) < 1e-4;
      near(from, open ? [0, 0, 0, 1] : [-0.76604, 0, 0, 0.64279]);
      near(to, open ? [-0.76604, 0, 0, 0.64279] : [0, 0, 0, 1]);
      turns.push(open ? 'open' : 'close');
    }
    expect(turns.length).toBeGreaterThanOrEqual(4);   // both levers, an open and a close each
    expect(new Set(turns)).toEqual(new Set(['open', 'close']));
  });

  it("a destroyed gate (its access destructible's death taken): the lever clicks and turns, the leaf's sound is not heard", async () => {
    const r = await rig('MP11');
    const d = r.world.health.forAction('set_access1')!;
    expect(d.anim).toBe('access1');
    expect(r.world.takeDeath(d.id, true)).toBe(true);
    const got = r.pull('epanel_di1');
    expect(got.sounds).toEqual([`.SWITCH_SMALL@${HAND(1)}`]);
    expect(got.turned).toEqual([HAND(1)]);
  });
});

describe.skipIf(!has('MP62'))(`LATER 307: Enowapi's levers presented on the page${has('MP62') ? '' : ' (SOCOM_DISC with RUN/MP62.ZDB absent)'}`, () => {
  it('gate 1: .WOOD_DR_SLD_OP then .WOOD_DR_SLD_CL; gate 2 from di2 then di3: both handles turned by either lever', async () => {
    const r = await rig('MP62');
    expect(r.map.gates!.map((g) => g.levers.map((l) => [l.node, (l.handles ?? []).map((h) => [h.node, h.path])]))).toEqual([
      [['epanel_di1', [[2, HAND(1)]]]],
      [['epanel_di2', [[2, HAND(2)], [6, HAND(3)]]], ['epanel_di3', [[2, HAND(2)], [6, HAND(3)]]]],
    ]);
    handlesAtRest(r.map);
    const g1 = 'worldmodel/access1/gate_move1', g2 = 'worldmodel/access2/gate_move2';
    expect(r.pull('epanel_di1')).toEqual({ sounds: [`.SWITCH_SMALL@${HAND(1)}`, `.WOOD_DR_SLD_OP@${g1}`], turned: [HAND(1)] });
    expect(r.angle(HAND(1))).toBeCloseTo(-100, 2);
    expect(r.pull('epanel_di1')).toEqual({ sounds: [`.SWITCH_SMALL@${HAND(1)}`, `.WOOD_DR_SLD_CL@${g1}`], turned: [HAND(1)] });
    expect(r.angle(HAND(1))).toBeCloseTo(0, 2);
    // Gate 2: `gate_openclose2` writes both `woodgate` and `woodgate2`, so di2 opens and di3 then closes (research 174 s5.1).
    expect(r.pull('epanel_di2')).toEqual({ sounds: [`.SWITCH_SMALL@${HAND(2)}`, `.WOOD_DR_SLD_OP@${g2}`], turned: [HAND(2), HAND(3)] });
    expect([r.angle(HAND(2)), r.angle(HAND(3))].map((a) => Math.round(a!) + 0)).toEqual([-100, -100]);
    expect([r.world.valve('woodgate'), r.world.valve('woodgate2')]).toEqual([1, 1]);
    expect(r.pull('epanel_di3')).toEqual({ sounds: [`.SWITCH_SMALL@${HAND(2)}`, `.WOOD_DR_SLD_CL@${g2}`], turned: [HAND(2), HAND(3)] });
    expect([r.angle(HAND(2)), r.angle(HAND(3))].map((a) => Math.round(a!) + 0)).toEqual([0, 0]);
    expect([r.world.valve('woodgate'), r.world.valve('woodgate2')]).toEqual([0, 0]);
    expect(r.gates.stats().map((s) => s.offset)).toEqual([[0, 0, 0], [0, 0, 0]]);
  });

  it("the valves a pull writes, read off each program by the dry run: the lever's own (MP62 gate 2: both)", async () => {
    const r = await rig('MP62');
    const writes = r.map.gates!.flatMap((g) => g.levers.map((l) => [l.node, [...leverValveWrites(l.program, l.valve, () => 0)]]));
    expect(writes).toEqual([
      ['epanel_di1', [['fusebox2', 1]]],
      ['epanel_di2', [['woodgate', 1], ['woodgate2', 1]]],
      ['epanel_di3', [['woodgate', 1], ['woodgate2', 1]]],
    ]);
  });
});

/**
 * LATER 1381 (research 174 s5.1, 175 s5.3; reading, pending review): on the disc every lever branch holds its slide behind
 * the handle's timed turn -- the presser's `ai::ANIMATE` (281, waits 0 / 0), `WAIT` 0.24, then `gatehand`'s 0.5 s
 * `OBJECT_MOTION_FROM_TO` (flags 96) on a handle that resolves beneath the lever, before the `CALL_SEQUENCE` of the slide --
 * so the room's slide, P8's lead-in and the page's leaf sound all come after the turn (~0.807 s, LEVER-1381-PC3b).
 */
for (const stem of ['MP11', 'MP62']) {
  describe.skipIf(!has(stem))(`LATER 1381: ${stem}'s lever programs hold the slide on the turn${has(stem) ? '' : ` (SOCOM_DISC with RUN/${stem}.ZDB absent)`}`, () => {
    it("each branch: 281, WAIT 0.24, the resolved gatehand's 0.5 s turn, then the slide's call; the room, P8 and the page agree after it", async () => {
      const r = await rig(stem);
      let branches = 0;
      for (const g of r.map.gates!) for (const l of g.levers) {
        const main = l.program.sequences.find((s) => s.activation === 1)!.ops;
        const calls = main.flatMap((o, i) => (o.op === 'callSequence' && /^gate(open|close)$/.test(o.sequence) ? [i] : []));
        expect(calls.length, `${stem} ${l.node} slide calls`).toBe(2);
        for (const at of calls) {
          // Back from the call to the branch's head: the turn, the wait and the presser, in that order.
          let turn = -1, wait = -1, presser = -1;
          for (let i = at - 1; i >= 0 && presser < 0; i--) {
            const o = main[i]!;
            if (turn < 0 && o.op === 'fromTo' && o.flags === 96 && o.rotation) turn = i;
            else if (turn >= 0 && wait < 0 && o.op === 'wait') wait = i;
            else if (wait >= 0 && o.op === 'aiAnimate') presser = i;
          }
          const t = main[turn], w = main[wait], a = main[presser];
          expect(t?.op === 'fromTo' && t.seconds, `${stem} ${l.node} turn`).toBeCloseTo(0.5, 6);
          expect(t?.op === 'fromTo' && (l.handles ?? []).some((h) => h.node === t.node), `${stem} ${l.node} the turned handle resolves`).toBe(true);
          expect(w?.op === 'wait' && w.seconds, `${stem} ${l.node} wait`).toBeCloseTo(0.24, 6);
          expect(a?.op === 'aiAnimate' && [a.type, a.prewait, a.postwait], `${stem} ${l.node} presser`).toEqual([281, 0, 0]);
          branches++;
        }
        const [open, close] = leadIns(g, l);
        for (const lead of [open, close]) {
          expect(lead!, `${stem} ${l.node} lead-in`).toBeGreaterThan(0.24 + 0.5);
          expect(lead!, `${stem} ${l.node} lead-in`).toBeLessThanOrEqual(0.807 + 2 / 60 + 1e-9);   // LATER 1426: the WAIT's rest no longer dropped
        }
      }
      expect(branches).toBe(stem === 'MP11' ? 4 : 6);
      // The room's run of each gate's first lever and the page's world run of the same pull: the slide and the leaf's sound together.
      for (const g of r.map.gates!) {
        const l = g.levers[0]!;
        const room = new GateSet([g], null);
        expect(room.use(l.action)).toBe(true);
        let slid: number | null = null;
        for (let k = 1; k <= 120 && slid === null; k++) {
          room.step(1 / 60);
          if (room.offset(0).some((v) => v !== 0)) slid = k / 60;
        }
        const sounds: string[] = [];
        const world = new WorldState(r.map.meta!, r.map.ground, r.map.grid, { sound: (name) => sounds.push(name) });
        world.applyInitial();
        expect(world.executeAction(r.map.meta!.actions[l.action]!.valve, false, true)).toBe(true);
        let heard: number | null = null;
        for (let k = 1; k <= 120 && heard === null; k++) {
          world.step(1 / 60);
          if (sounds.some((n) => n !== '.SWITCH_SMALL')) heard = k / 60;
        }
        expect(slid, `${stem} ${l.node} slide`).not.toBeNull();
        expect(slid!).toBeGreaterThan(0.24 + 0.5);
        expect(Math.abs(heard! - slid!), `${stem} ${l.node} the leaf's sound with the slide`).toBeLessThanOrEqual(1 / 60 + 1e-9);
      }
    });
  });
}

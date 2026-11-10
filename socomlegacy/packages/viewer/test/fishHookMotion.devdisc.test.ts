// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { decodeEffectProgram, flattenScene, parseAnimSets, parseSceneGraph, type EffectOp, type EffectProgram, type SceneNode } from '@s2u/scene';
import { loadSimMap } from '../src/simMap';
import type { SimMap } from '../src/sim';
import { BOAT_ROCK_PLACEHOLDER, SCROLL_MOTION_PLACEHOLDER, WASHUP_MOTION_PLACEHOLDER, WorldState } from '../src/worldState';

/**
 * DF-9 (research 387 §12): Fish Hook's boats and shoreline, read off the disc (`RUN/MP71.ZDB`: `MZANIM.ZAR`'s set
 * `mission`, `MP71_GEO.ZED`'s scene graph) -- and what the port does with them today. MP71 is not a committed fixture
 * (DF-2 adds it): this file reads `SOCOM_DISC` (or `SOCOM_PC_ROOT`'s `game/disc`) and SKIPS without it -- a skip is
 * said, never a pass.
 *
 * - The boats: `boat_rocker1` / `boat_rocker2` (flags 0x821) wait 1 s plus a 1 s range, then loop a 4 s rotation slerp
 *   (`OBJECT_MOTION_FROM_TO` flags 0x60; begin `FUN_0025fe70` D:L109293-109297, tick `FUN_0025f9b0` D:L109016-109017)
 *   between two absolute quaternions 1.36 and 1.31 degrees off no turn (a 2.67 degree swing); the setter writes the rocker's rotation whole
 *   (`FUN_00315790` -> `FUN_00307170` D:L206170ff), and the rockers' disc rotations are yaws of 26.9 and 147.0 degrees.
 *   Each holds `boat_red`, 57 collision polygons. The port runs none of it (`BOAT_ROCK_PLACEHOLDER`).
 * - The shore: `washup1..6` and `water` (flags 0x21) scroll their `water_wash*` / `water` by the travel of an empty
 *   `water_node*` (`SCROLL_MOTION`, `FUN_00260fb0` / `FUN_00260b40`) and stroke that node out along x and back on the
 *   speed profile (`FUN_002606f0` D:L109348-109434); the profile's three phases cover the stroke's distance in its
 *   time. The port runs neither (`SCROLL_MOTION_PLACEHOLDER`, `WASHUP_MOTION_PLACEHOLDER`).
 */
const DISC = [process.env.SOCOM_DISC, process.env.SOCOM_PC_ROOT ? join(process.env.SOCOM_PC_ROOT, 'game/disc') : undefined]
  .find((d) => !!d && existsSync(join(d, 'RUN/MP71.ZDB')));
const SKIP = DISC ? '' : ': SOCOM_DISC / SOCOM_PC_ROOT with RUN/MP71.ZDB absent -- skipped (MP71 is no fixture until DF-2)';

const bytes = (): Uint8Array => new Uint8Array(readFileSync(join(DISC!, 'RUN/MP71.ZDB')));

function programs(): Map<string, EffectProgram> {
  const b = bytes();
  const sets = parseAnimSets(Zar.parse(zdbMember(b, parseZdb(b), 'MZANIM.ZAR'))).sets;
  const out = new Map<string, EffectProgram>();
  for (const s of sets) for (const a of s.anims) out.set(a.name, decodeEffectProgram(a));
  return out;
}

const ops = (p: EffectProgram, seq: number): EffectOp[] => p.sequences[seq]!.ops;
const fromTos = (p: EffectProgram): Extract<EffectOp, { op: 'fromTo' }>[] =>
  p.sequences.flatMap((s) => s.ops).filter((o): o is Extract<EffectOp, { op: 'fromTo' }> => o.op === 'fromTo');
/** A unit quaternion's turn, in degrees (from its vector part: steadier than its w near no turn). */
const turn = (q: readonly number[]): number => (2 * Math.asin(Math.min(1, Math.hypot(q[0]!, q[1]!, q[2]!))) * 180) / Math.PI;

let cachedMap: SimMap | null = null;
const simMap = async (): Promise<SimMap> => (cachedMap ??= await loadSimMap(new FsAssetSource(DISC!), 'RUN/MP71.ZDB'));

describe.skipIf(!DISC)(`DF-9: Fish Hook's boats and shoreline${SKIP}`, () => {
  it('the boats: two autostarts loop a 4 s slerp of the rocker between two absolute quaternions, 1.36 and 1.31 degrees off no turn', () => {
    const all = programs();
    for (const name of ['boat_rocker1', 'boat_rocker2']) {
      const p = all.get(name)!;
      expect(p.flags).toBe(0x821);
      expect(p.nodes).toEqual(['NA', name]);
      expect(ops(p, 0).map((o) => o.op)).toEqual(['wait', 'callSequence']);
      expect(ops(p, 0)[0]).toEqual({ op: 'wait', seconds: 1, range: 1, frames: null });
      expect(ops(p, 1)[0]).toEqual({ op: 'while', forever: true });
      const [there, back] = fromTos(p);
      expect(fromTos(p).length).toBe(2);
      for (const m of [there!, back!]) {
        expect(m).toMatchObject({ node: -7, flags: 0x60, seconds: 4 });
        expect(m.translation).toBeUndefined();
        expect(m.profile).toBeUndefined();
      }
      const a = there!.rotation!.from, b = there!.rotation!.to;
      expect(a.map((x) => +x.toFixed(5))).toEqual([0.00606, -0.00876, 0.00529, 0.99993]);
      expect(b.map((x) => +x.toFixed(5))).toEqual([-0.00528, 0.0087, -0.00519, 0.99993]);
      expect(back!.rotation).toEqual({ from: b, to: a });
      expect(turn(a)).toBeCloseTo(1.363, 3);
      expect(turn(b)).toBeCloseTo(1.309, 3);
      const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
      expect((2 * Math.acos(Math.min(1, Math.abs(dot))) * 180) / Math.PI).toBeCloseTo(2.671, 3);   // the swing between them
    }
  });

  it('the boats in the scene graph: each rocker carries a yaw the rock replaces, and holds boat_red with 57 polygons', async () => {
    const b = bytes();
    const flat = flattenScene(parseSceneGraph(Zar.parse(zdbMember(b, parseZdb(b), 'MP71_GEO.ZED'))) as SceneNode[], 'worldmodel');
    const at = (path: string) => flat.find((i) => i.path === path)!;
    const yaw = (m: ArrayLike<number>): number => (Math.atan2(m[2]!, m[0]!) * 180) / Math.PI;
    expect(yaw(at('worldmodel/boat_rocker1').node.matrix)).toBeCloseTo(26.86, 2);
    expect(yaw(at('worldmodel/boat_rocker2').node.matrix)).toBeCloseTo(147.03, 2);
    expect(Array.from(at('worldmodel/boat_rocker1').node.matrix.slice(12, 15), (x) => +x.toFixed(3))).toEqual([1208.713, 50.762, 1636.356]);
    expect(Array.from(at('worldmodel/boat_rocker2').node.matrix.slice(12, 15), (x) => +x.toFixed(3))).toEqual([1091.984, 50.762, 1530.136]);
    for (const n of [1, 2]) {
      expect(Array.from(at(`worldmodel/boat_rocker${n}/boat_red`).node.matrix)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    }
    const map = await simMap();
    // Two owners of 57 each: worldDi's documented double (scene/src/buildScene.ts:340-356; reCOM zNode/node_io.cpp:46-51;
    // research 24 section 1.1) -- the instance node's own di and the realised model root's (`=`), both in the engine's
    // world. The rock's build (LATER 782) must turn BOTH with the rocker.
    const owners = (n: number) => map.ground.owners.filter((o) => o.path.startsWith(`worldmodel/boat_rocker${n}/`)).map((o) => [o.path, o.count]);
    for (const n of [1, 2]) {
      expect(owners(n)).toEqual([[`worldmodel/boat_rocker${n}/boat_red`, 57], [`worldmodel/boat_rocker${n}/boat_red=boat_red`, 57]]);
    }
  });

  it('the shore: seven scrolls driven by an empty node each, on strokes whose speed profile covers the distance in the time', async () => {
    const all = programs();
    const shore: [string, string, string, [number, number]][] = [
      ['washup1', 'water_wash', 'water_node', [-0.2, 1]], ['washup2', 'water_wash1', 'water_node2', [0.3, 1]],
      ['washup3', 'water_wash2', 'water_node3', [-0.2, 1]], ['washup4', 'water_wash3', 'water_node4', [0.3, 1]],
      ['washup5', 'water_wash4', 'water_node5', [-0.2, 1]], ['washup6', 'water_wash5', 'water_node6', [0.3, 1]],
      ['water', 'water', 'water_node1', [0, 1]],
    ];
    const map = await simMap();
    for (const [name, wash, node, uv] of shore) {
      const p = all.get(name)!;
      expect(p.flags).toBe(0x21);
      expect(p.nodes).toEqual(['NA', wash, node]);
      const scroll = ops(p, 0)[0]!;
      expect(scroll).toMatchObject({ op: 'scroll', node: 1, mover: 2, flags: 0, axis: [-1, 0, 0], seconds: null });
      if (scroll.op !== 'scroll') throw new Error('no scroll');
      expect(scroll.uv.map((x) => +x.toFixed(5))).toEqual(uv);
      const strokes = fromTos(p);
      expect(strokes.length).toBe(name === 'water' ? 2 : 6);
      const distances = new Set<number>();
      for (const m of strokes) {
        expect(m).toMatchObject({ node: 2, flags: 0x180a, seconds: 2.75 });
        const t = m.translation!, f = m.profile!;
        expect(f.times).toEqual([1, 1.25, 0.5]);
        const d = Math.hypot(t.to[0] - t.from![0], t.to[1] - t.from![1], t.to[2] - t.from![2]);
        // `FUN_002606f0`: accelerate from speeds[0] by accel for times[0], cruise at speeds[1] for times[1], then slow by decel.
        const [v0, v1] = f.speeds, [t1, t2, t3] = f.times;
        const covered = v0 * t1 + 0.5 * f.accel * t1 * t1 + v1 * t2 + v1 * t3 + 0.5 * f.decel * t3 * t3;
        expect(covered).toBeCloseTo(d, 5);
        expect(t1 + t2 + t3).toBeCloseTo(m.seconds, 6);
        expect(t.to[1]).toBe(0); expect(t.to[2]).toBe(0);
        distances.add(+d.toFixed(3));
      }
      expect([...distances].sort()).toEqual(name === 'water' ? [0.5] : [0.5, 0.75, 1]);
      // The moved node is an empty marker: no visual, no collision; the scrolled wash draws and has no collision either.
      expect(map.ground.owners.some((o) => o.path === `worldmodel/${node}` || o.path.startsWith(`worldmodel/${node}/`))).toBe(false);
      expect(map.ground.owners.some((o) => o.path === `worldmodel/${wash}` || o.path.startsWith(`worldmodel/${wash}/`))).toBe(false);
    }
  });

  it('the port today: the nine run on the page\'s world, and no boat polygon moves (the three placeholders)', async () => {
    expect(BOAT_ROCK_PLACEHOLDER).toBe('still');
    expect(WASHUP_MOTION_PLACEHOLDER).toBe('still');
    expect(SCROLL_MOTION_PLACEHOLDER).toBe('none');
    const map = await simMap();
    const world = new WorldState(map.meta!, map.ground, map.grid);
    world.runAutostartPrograms = true;
    const before = Float32Array.from(map.ground.points);
    world.applyInitial();
    for (let i = 0; i < 100; i++) world.step(0.1);           // 10 s: past the boats' wait and two of their strokes
    for (const name of ['boat_rocker1', 'boat_rocker2', 'washup1', 'washup2', 'washup3', 'washup4', 'washup5', 'washup6', 'water']) {
      expect(world.running(name)).toBe(true);
    }
    expect(Array.from(map.ground.points)).toEqual(Array.from(before));
  });
});

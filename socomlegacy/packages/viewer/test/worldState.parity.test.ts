// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { modelGate, segmentHits, surfaceWord, SURFACE_SKIP, type Grid } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { simMapFromBytes } from '../src/simMap';
import { under } from '../src/mapMeta';
import { WorldState } from '../src/worldState';

/**
 * MAP-02 on Crossroads (MP72; research 171 s4-s5, plan XR-04): the world's state made from zAnim's node references, and
 * the street under each arch -- research 171 s5's two segments at y 54 (`tools/probe-crossroads.ts`), made a fixture
 * test. Intact, nothing in the street; with an arch's `destroyed` and `parts` on and its `healthy` off, its rubble
 * meets the segment four times, the first at x 851.434 (`seal_demo_1`) and 1654.069 (`terrorist_demo_1`). The
 * probe's own toggles set owner bits by hand; here the world does it, from the references' words (171 s4).
 */

const MP72 = fixture('RUN/MP72.ZDB');
/** Research 171 s5's table: each bridge's street segment and the first rubble hit's x. */
const STREETS = [
  { bridge: 'seal_demo_1', from: [812.408, 54, 1488.049], to: [932.408, 54, 1488.049], firstX: 851.434 },
  { bridge: 'terrorist_demo_1', from: [1615.044, 54, 1403.012], to: [1735.044, 54, 1403.012], firstX: 1654.069 },
] as const;
/** The probe's surfaces: every polygon but the skip ones (`SURFACE_SKIP`). */
const solid = (p: Parameters<typeof surfaceWord>[0]): boolean => (surfaceWord(p) & SURFACE_SKIP) === 0;
const street = (grid: Grid, s: (typeof STREETS)[number]) =>
  segmentHits(grid, [...s.from] as [number, number, number], [...s.to] as [number, number, number], solid);

describe.skipIf(!MP72)(`Crossroads' arches through the world's state${MP72 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const map = MP72 ? simMapFromBytes(MP72, 'RUN/MP72.ZDB') : null;
  /** A bridge's root path and its three states' paths, out of the metadata's initial set. */
  const states = (bridge: string) => {
    const meta = map!.meta!;
    const root = meta.instances.find((i) => i.node === bridge)!.path;
    const one = (node: string): string => {
      const e = meta.initial.find((x) => under(x.path, root) && x.path.split(/[/=]/).pop() === node);
      expect(e, `${bridge}/${node}`).toBeDefined();
      return e!.path;
    };
    return { root, healthy: one('healthy'), destroyed: one('destroyed'), parts: one('parts') };
  };

  it('Crossroads: the street segment meets the healthy arch 0 times; with destroyed and parts on and healthy off it meets the rubble 4 times (research 171 s5)', () => {
    const world = new WorldState(map!.meta!, map!.ground, map!.grid);
    world.applyInitial();
    for (const s of STREETS) expect(street(map!.grid, s), s.bridge).toHaveLength(0);
    for (const s of STREETS) {
      const p = states(s.bridge);
      world.setActive(p.destroyed, true);
      world.setActive(p.parts, true);
      world.setActive(p.healthy, false);
      const hits = street(map!.grid, s);
      expect(hits, s.bridge).toHaveLength(4);
      expect(hits[0]!.point[0]).toBeCloseTo(s.firstX, 2);
      for (const h of hits) expect(under(h.owner.path, p.destroyed), h.owner.path).toBe(true);
      // The other street is still open: each bridge is its own.
      const other = STREETS.find((o) => o !== s)!;
      if (other.bridge === 'terrorist_demo_1') expect(street(map!.grid, other)).toHaveLength(0);
    }
    // The round's reset: both arches healthy again, both streets open.
    world.reset();
    for (const s of STREETS) expect(street(map!.grid, s), s.bridge).toHaveLength(0);
  });

  it('both arches open intact: destroyed and parts off by their node-ref words, healthy on; the switches\' owners stay', () => {
    const world = new WorldState(map!.meta!, map!.ground, map!.grid);
    world.applyInitial();
    const owners = map!.ground.owners;
    for (const s of STREETS) {
      const p = states(s.bridge);
      expect(world.isActive(p.healthy)).toBe(true);
      expect(world.isActive(p.destroyed)).toBe(false);
      expect(world.isActive(p.parts)).toBe(false);
      const healthy = owners.filter((o) => under(o.path, p.healthy)), rubble = owners.filter((o) => under(o.path, p.destroyed));
      expect(healthy.reduce((n, o) => n + o.count, 0)).toBe(54);                           // research 171 s3
      expect(rubble.reduce((n, o) => n + o.count, 0)).toBe(170);                            // 8 at /destroyed, 162 at /dia
      expect(healthy.every((o) => modelGate(o))).toBe(true);
      expect(rubble.some((o) => modelGate(o))).toBe(false);
    }
    for (const node of ['seal_callstrike_1', 'terrorist_callstrike_1']) {
      const action = map!.meta!.actions.find((a) => a.node === node)!;
      expect(world.isActive(action.path), node).toBe(true);
      const mine = owners.filter((o) => under(o.path, action.path));
      expect(mine.length, node).toBeGreaterThan(0);
      expect(mine.every((o) => modelGate(o)), node).toBe(true);
    }
    world.reset();
  });
});

/**
 * XR-04 (research 213 s4; 171 s4): the bridge switches' programs on the room's own world -- silent
 * (`ROOM_SKIP_EFFECTS_READING`), as `match/src/room.ts` `useAction` runs them: the swap at 240-256 on the first tick, the
 * switch hidden at 264, the parts' loop (284-332) a no-op (FOR_CHILDREN, research 213 s2.3) and no debris node on
 * (`DEBRIS_NODE_READING`, PF.R29).
 */
describe.skipIf(!MP72)(`Crossroads' switches on the room's world (XR-04)${MP72 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const roomWorld = () => {
    const map = simMapFromBytes(MP72!, 'RUN/MP72.ZDB');
    const world = new WorldState(map.meta!, map.ground, map.grid);
    world.skipEffects = true;
    world.applyInitial();
    return { map, world };
  };
  const arch = (bridge: string) => ({
    healthy: `worldmodel/${bridge}/arch=arch/healthy`, destroyed: `worldmodel/${bridge}/arch=arch/destroyed`, parts: `worldmodel/${bridge}/arch=arch/parts`,
  });
  const stepFor = (world: WorldState, seconds: number) => { for (let t = 0; t < seconds * 60; t++) world.step(1 / 60); };

  it("a switch's executeAction on the room's silent world turns destroyed on and healthy off, the rubble's owners active and the street segment 0 -> 4; the other arch untouched", () => {
    const { map, world } = roomWorld();
    const seal = arch('seal_demo_1'), terr = arch('terrorist_demo_1');
    const sw = map.meta!.actions.find((a) => a.node === 'seal_callstrike_1')!;
    expect(world.executeAction('seal_strike1')).toBe(true);
    // Timeless from 156 to 340: the swap and the switch's hide land on the call's first tick.
    expect([world.isActive(seal.destroyed), world.isActive(seal.parts), world.isActive(seal.healthy)]).toEqual([true, true, false]);
    expect(world.isActive(sw.path)).toBe(false);
    const rubble = map.ground.owners.filter((o) => under(o.path, seal.destroyed));
    expect(rubble.length).toBeGreaterThan(0);
    expect(rubble.every((o) => modelGate(o))).toBe(true);
    expect(street(map.grid, STREETS[0])).toHaveLength(4);
    expect(street(map.grid, STREETS[0])[0]!.point[0]).toBeCloseTo(STREETS[0].firstX, 2);
    expect(street(map.grid, STREETS[1])).toHaveLength(0);
    expect([world.isActive(terr.destroyed), world.isActive(terr.parts), world.isActive(terr.healthy)]).toEqual([false, false, true]);
    expect(world.isActive(map.meta!.actions.find((a) => a.node === 'terrorist_callstrike_1')!.path)).toBe(true);
    // The sound tail ends at 2.25 s; nothing is flown (the loop's flyparts never runs), so nothing flips at +2 s.
    const after = world.states();
    stepFor(world, 2.5);
    expect(world.busy).toBe(false);
    expect(world.states()).toEqual(after);
    expect(street(map.grid, STREETS[0])).toHaveLength(4);
  });

  it('executeAction refuses the same switch while its program runs and after it was used this round; reset restores healthy and clears the use', () => {
    const { map, world } = roomWorld();
    const seal = arch('seal_demo_1');
    const i = map.meta!.actions.findIndex((a) => a.node === 'seal_callstrike_1');
    expect(world.executeAction('seal_strike1')).toBe(true);
    world.markUsed(i);
    expect(world.executeAction('seal_strike1')).toBe(false);          // its program runs (FUN_002b44e0)
    stepFor(world, 2.5);
    expect(world.busy).toBe(false);
    expect(world.actionUsed(i)).toBe(true);
    expect(world.executeAction('seal_strike1')).toBe(false);          // used this round
    // The other switch is its own.
    expect(world.executeAction('terrorist_strike1')).toBe(true);
    world.reset();
    expect([world.isActive(seal.destroyed), world.isActive(seal.parts), world.isActive(seal.healthy)]).toEqual([false, false, true]);
    expect(world.actionUsed(i)).toBe(false);
    expect(world.states()).toEqual([]);
    for (const s of STREETS) expect(street(map.grid, s)).toHaveLength(0);
    expect(world.executeAction('seal_strike1')).toBe(true);
  });

  it('the silent run never turns a debris node on: part_1..15 (save-parent references) stay off the wire', () => {
    const { map, world } = roomWorld();
    const parts = map.meta!.initial.filter((e) => e.saveParent && /\/arch=arch\/parts\/part_\d+$/.test(e.path)).map((e) => e.path);
    expect(parts).toHaveLength(30);
    expect(world.executeAction('seal_strike1')).toBe(true);
    expect(world.executeAction('terrorist_strike1')).toBe(true);
    stepFor(world, 6);
    for (const p of parts) expect(world.isActive(p), p).toBe(false);
    expect(world.states().filter((s) => /part_\d+$/.test(s.path))).toEqual([]);
    // Once FOR_CHILDREN binds ref 7 to each part, the body's OBJECT_ACTIVE_STATE on it is still refused in a silent run
    // (DEBRIS_NODE_READING); a heard run (a page's own world) turns it on.
    const lib = world.program('seal_demo_site1')!;
    const body = { name: 'body', root: 1, flags: 0, nodes: lib.program.nodes, sequences: [{ name: 'NA', activation: 1, ops: [{ op: 'active' as const, node: 8, on: true }] }] };
    const ctx = (silent: boolean) => ({ root: 'worldmodel/seal_demo_1', nodes: [null, 'worldmodel/seal_demo_1', null, null, null, null, null, null, parts[0]!], caller: null, valve: null, silent });
    world.runProgram(body, ctx(true));
    expect(world.isActive(parts[0]!)).toBe(false);
    world.runProgram(body, ctx(false));
    expect(world.isActive(parts[0]!)).toBe(true);
  });
});

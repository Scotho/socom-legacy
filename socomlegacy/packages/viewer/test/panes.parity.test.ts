// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { GAME_FRAME_DT, segmentHits, surfaceWord, SURFACE_SKIP } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { simMapFromBytes } from '../src/simMap';
import { forkGround, WorldState } from '../src/worldState';
import { DoorSet } from '../src/doors';
import { groundGrid } from '../src/mover';
import { roundPath } from '../src/round';

/**
 * SUP-02 on the fixture (research 210 s6; research 176 s4.1): Frostfire's three breakable panes. Each placed `door_slab`
 * -- under `bdoor_4`, `wdoor_1` and `wdoor_2` -- carries a kind-3 block (health 1, armour 0, shield 0) on its own
 * `pane1`, two stored polygons a pane; at health 0 `door_slab` calls `breakapane` (`.GLS_BRK_VSMALL`,
 * `DESTRUCTION_SOURCE`, the root off). The witness segments are `tools/probe-suppression-mechanics.ts`' (research 176
 * s4.1): 2 hits through the pane intact, 0 broken -- here through the runtime (the world's state), the probe measuring
 * the data.
 */

const MP2 = fixture('RUN/MP2.ZDB');
const M4 = { kind: 'impact' as const, rating: 2.3, modifier: 0.3, point: [0, 0, 0] as [number, number, number] };
const SLABS = ['bdoor_4', 'wdoor_1', 'wdoor_2'].map((d) => `worldmodel/${d}/door1=door1/door_slab`);
const PANES = SLABS.map((s) => `${s}/pane1`);
type V3 = [number, number, number];
/** Research 176 s4.1's witness segments, one per pane, in the panes' order. */
const WITNESS: [V3, V3][] = [
  [[582.257, 157.312, 1109.525], [582.257, 157.312, 1125.525]],
  [[772.475, 157.312, 984.5], [756.475, 157.312, 984.5]],
  [[891, 115.312, 987.525], [891, 115.312, 1003.525]],
];

function frostfire() {
  const map = simMapFromBytes(MP2!, 'RUN/MP2.ZDB');
  const ground = forkGround(map.ground);
  const grid = groundGrid(ground);
  const sounds: [string, string | null][] = [], debris: (string | null)[] = [];
  const world = new WorldState(map.meta!, ground, grid, { sound: (name, path) => { sounds.push([name, path]); }, destruction: (path) => { debris.push(path); } });
  world.applyInitial();
  // The probe's filter: the movement's skip surfaces (the frames' camera polygons) passed over.
  const witness = (i: number): string[] => segmentHits(grid, WITNESS[i]![0], WITNESS[i]![1], (q) => (surfaceWord(q) & SURFACE_SKIP) === 0).map((h) => h.owner.path);
  return { map, ground, grid, world, sounds, debris, witness };
}

describe(`Frostfire's breakable panes (SUP-02)${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it.skipIf(!MP2)("Frostfire's initial state saves every placed slab's pane1, one entry a placement (SCENE_INSTANCE_SCOPE_READING)", () => {
    const { map } = frostfire();
    const saved = map.meta!.initial.filter((e) => e.path.endsWith('/door_slab/pane1'));
    expect(saved.map((e) => e.path)).toEqual(PANES);
    for (const e of saved) expect([e.deactivate, e.saveActive]).toEqual([false, true]);
    expect(map.meta!.scene!.destructibles.map((d) => d.targetPath)).toEqual(PANES);
  });

  it.skipIf(!MP2)("each of Frostfire's three panes stops its witness segment twice intact and not at all broken; the other two panes and the door's leaf are untouched", () => {
    const { ground, world, witness } = frostfire();
    const list = world.health.list;
    for (let i = 0; i < 3; i++) expect(witness(i)).toEqual([PANES[i], PANES[i]]);
    for (let i = 0; i < 3; i++) {
      expect(world.health.hitAt(PANES[i]!, M4)).toEqual({ applied: true, died: true });
      expect(witness(i)).toEqual([]);
      for (let j = 0; j < 3; j++) if (j > i) expect(witness(j)).toEqual([PANES[j], PANES[j]]);
      for (let j = 0; j < 3; j++) expect(world.isActive(PANES[j]!)).toBe(j > i);
      expect(world.isActive(SLABS[i]!)).toBe(true);                         // the leaf's own polygons stay
      const slab = ground.owners.find((o) => o.path === SLABS[i])!;
      expect(slab.flags! & 1).toBe(1);
    }
    // The round's reset: every placement's pane back -- geometry and health, all three.
    world.reset();
    expect(list.map((d) => world.health.hp(d.id))).toEqual([1, 1, 1]);
    expect(PANES.map((p) => world.isActive(p))).toEqual([true, true, true]);
    for (let i = 0; i < 3; i++) expect(witness(i)).toEqual([PANES[i], PANES[i]]);
    expect(PANES.map((p) => world.health.at(p))).toEqual([0, 1, 2]);
  });

  it.skipIf(!MP2)("a pane broken while its door swings: the door still opens and shuts, the pane stays off; the round's reset restores the pane with the door left open", () => {
    const { map, ground, world, witness } = frostfire();
    const doors = new DoorSet(map.doors!, ground);
    const i = doors.specs.findIndex((d) => d.node === 'wdoor_1');
    const run = (s: number): void => { for (let k = 0; k < s * 60; k++) doors.step(1 / 60); };
    // The door's own program (research 92 s2): the `ai::ANIMATE` head -- its pre-wait, the push's game frame, its post-wait,
    // each counted in whole game frames -- before the valve and the swing (`fromTo`'s seconds); the full waits add slack
    // for the close's sound after the swing.
    const ops = doors.specs[i]!.programs[0]!.sequences.flatMap((s) => s.ops);
    const head = ops.find((o) => o.op === 'aiAnimate'), swing = ops.find((o) => o.op === 'fromTo');
    if (head?.op !== 'aiAnimate' || swing?.op !== 'fromTo') throw new Error('singleDoor_right: no ANIMATE or swing');
    const frames = (s: number): number => Math.ceil(s / GAME_FRAME_DT - 1e-9);
    const headSeconds = (frames(head.prewait) + 1 + frames(head.postwait)) * GAME_FRAME_DT;
    const midSwing = headSeconds + swing.seconds / 2, full = headSeconds + swing.seconds + 0.25;
    expect(doors.use(i)).toBe(true);
    run(midSwing);                                                          // the head, then half the swing
    expect(doors.state(i).busy).toBe(true);
    expect(world.health.hitAt(PANES[1]!, M4)).toEqual({ applied: true, died: true });
    run(full);
    expect(doors.state(i)).toMatchObject({ open: true, busy: false });
    expect(world.isActive(PANES[1]!)).toBe(false);
    expect(doors.use(i)).toBe(true);
    run(full);
    expect(doors.state(i)).toMatchObject({ open: false, busy: false });
    expect(world.isActive(PANES[1]!)).toBe(false);
    expect(witness(1)).toEqual([]);                                         // shut, the hole where the pane was
    // Opened again and left open: the round's reset gives the pane back, its owners' bit 0 set where the leaf stands.
    expect(doors.use(i)).toBe(true);
    run(full);
    world.reset();
    expect(world.isActive(PANES[1]!)).toBe(true);
    expect(world.health.hp(1)).toBe(1);
    for (const o of ground.owners.filter((x) => x.path === PANES[1])) expect(o.flags! & 1).toBe(1);
    doors.reset();
    expect(witness(1)).toEqual([PANES[1], PANES[1]]);
  });

  it.skipIf(!MP2)('breakapane plays .GLS_BRK_VSMALL once at the pane and turns pane1 off; a joiner applies the pane off with no sound', () => {
    const room = frostfire(), page = frostfire(), joiner = frostfire();
    expect(room.world.health.hitAt(PANES[0]!, M4)).toEqual({ applied: true, died: true });
    expect(room.sounds).toEqual([['.GLS_BRK_VSMALL', PANES[0]]]);
    expect(room.debris).toEqual([PANES[0]]);
    expect(room.world.health.hitAt(PANES[0]!, M4)).toEqual({ applied: false, died: false });   // spent: nothing more
    expect(room.sounds).toHaveLength(1);
    const env = room.world.wireAll(3);
    page.world.applyWire(env, false);
    page.world.applyWire(env, false);
    expect(page.sounds).toEqual([['.GLS_BRK_VSMALL', PANES[0]]]);
    expect(page.debris).toEqual([PANES[0]]);
    // The sound's place (SCENE_SOUND_PLACE_READING): the pane's box centre -- x 580.269..584.245, y 155.843..158.782,
    // z 1117..1117.525 (its two stored polygons, research 176 s4.1).
    const at = page.world.placeOf(PANES[0]!)!;
    [582.257, 157.3125, 1117.2625].forEach((v, k) => expect(at[k]).toBeCloseTo(v, 2));
    joiner.world.applyWire(env, true);
    expect(joiner.world.isActive(PANES[0]!)).toBe(false);
    expect(joiner.sounds).toEqual([]);
    expect(joiner.debris).toEqual([]);
    expect(joiner.witness(0)).toEqual([]);
    // The page's round reset (NetClient.newEpoch): silent.
    page.world.reset();
    expect(page.world.isActive(PANES[0]!)).toBe(true);
    expect(page.sounds).toHaveLength(1);
  });

  it.skipIf(!MP2)('a round of 2.3 + 0.3 breaks the pane (shield 0); the broken pane is not a C4 target (health 0)', () => {
    const { world } = frostfire();
    const h = world.health;
    for (const d of h.list) expect([d.health, d.armor, d.shield]).toEqual([1, 0, 0]);
    expect(h.c4TargetAt(PANES[2]!, 18)).toBe(2);
    expect(h.hitAt(PANES[2]!, M4)).toEqual({ applied: true, died: true });
    expect(h.hp(2)).toBeLessThanOrEqual(0);
    expect(h.accepts(2, 18)).toBe(false);
    expect(h.c4TargetAt(PANES[2]!, 18)).toBeNull();
    expect(h.c4TargetAt(PANES[1]!, 18)).toBe(1);
  });
});

// LATER 413 (#505; research 84 13, the round's own query): the original's round passes every surface-word bit-18 polygon
// (`FUN_002d3030` at the query class 0, D:L175299-175312, the batch `FUN_002d3cf0` the projectile queues on), so the
// camera-only frames 0.5-1 u in front of each pane do not stop it: a round down a pane's witness line meets the pane.
describe(`a round down each pane's witness line meets the pane, not its camera-only frame (LATER 413)${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it.skipIf(!MP2)('the first surface a round meets, fired 20 units out along each witness line, is the pane', () => {
    const { grid } = frostfire();
    for (let i = 0; i < 3; i++) {
      const [a, b] = WITNESS[i]!;
      const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(d[0], d[1], d[2]);
      const dir: V3 = [d[0] / l, d[1] / l, d[2] / l];
      for (const sign of [1, -1]) {
        const s: V3 = sign > 0 ? a : b, way: V3 = [dir[0] * sign, dir[1] * sign, dir[2] * sign];
        const from: V3 = [s[0] - way[0] * 12, s[1] - way[1] * 12, s[2] - way[2] * 12];
        const path = roundPath(grid, from, way, 40, () => 0, 3);     // penetration 0: the first surface met stops it
        expect(path.struck[0]?.owner, `pane ${i} from ${sign > 0 ? 'a' : 'b'}`).toBe(PANES[i]);
      }
    }
  });
});

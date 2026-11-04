// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { castRay, probeGround, segmentHits, type CollisionOwner, type EffectOp, type EffectProgram, type GridParams, type WorldPoly } from '@s2u/scene';
import { forkGround, WorldState } from '../src/worldState';
import { groundGrid, packGround, Walker, type GroundData, type WalkInput } from '../src/mover';
import { AUTOSTART_RESET_READING, readMapMeta, type MapInitial, type MapMeta } from '../src/mapMeta';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { parseSceneGraph } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAnimSets } from '@s2u/scene';
import { simMapFromBytes } from '../src/simMap';

/**
 * MAP-02 (research 209 s8): the world's mutable state on a synthetic hull (no game data) -- an arch placed from its
 * prototype (`worldmodel/arch=arch`), its `healthy` wall and deck, its `destroyed` rubble (`/destroyed` and
 * `/destroyed/dia`, research 171 s3's shape), and a sibling whose name begins as the arch's does
 * (`worldmodel/arch_b`), which nothing done to the arch may touch. The owners carry the disc's flag word for a node
 * with polygons: `m_active` (bit 0) and `m_hasDI` (bit 12), research 23 s1.1.
 */

const FLAGS = 0x1001;
const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const poly = (path: string, ditype: number, points: number[]): WorldPoly => ({
  modelName: path.includes('=arch') ? 'arch' : 'worldmodel', path, region: 0, ditype, material: 25, ptcount: points.length / 3, cameratype: 0,
  points: Float32Array.from(points),
});
const ARCH = 'worldmodel/arch', PROTO = 'worldmodel/arch=arch';
const HEALTHY = `${PROTO}/healthy`, DESTROYED = `${PROTO}/destroyed`, DIA = `${PROTO}/destroyed/dia`;
const POLYS: WorldPoly[] = [
  poly('worldmodel/floor', 3, [-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
  poly(`${HEALTHY}/wall`, 2, [10, 0, -100, 10, 0, 100, 10, 50, 100, 10, 50, -100]),         // across x 10
  poly(`${HEALTHY}/deck`, 3, [30, 20, 100, 60, 20, 100, 60, 20, 140, 30, 20, 140]),          // a floor at y 20
  poly(DESTROYED, 2, [-30, 0, -100, -30, 0, 100, -30, 30, 100, -30, 30, -100]),               // rubble across x -30
  poly(DIA, 3, [-60, 5, 100, -40, 5, 100, -40, 5, 140, -60, 5, 140]),                          // rubble's floor at y 5
  poly('worldmodel/arch_b', 2, [-80, 0, -100, -80, 0, 100, -80, 50, 100, -80, 50, -100]),    // beside: across x -80
];
const OWNER_PATHS = ['worldmodel/floor', `${HEALTHY}/wall`, `${HEALTHY}/deck`, DESTROYED, DIA, 'worldmodel/arch_b'];
const PLACED = ['worldmodel/floor', ARCH, PROTO, HEALTHY, `${HEALTHY}/wall`, `${HEALTHY}/deck`, DESTROYED, DIA, 'worldmodel/arch_b'];

function hull(): GroundData {
  const owners: CollisionOwner[] = OWNER_PATHS.map((path, i) => ({ modelName: POLYS[i]!.modelName, path, first: i, count: 1, flags: FLAGS }));
  return packGround(params, POLYS, owners);
}

function meta(initial: MapInitial[] = [
  { path: HEALTHY, deactivate: false, saveActive: true, saveTransform: false, saveParent: false },
  { path: DESTROYED, deactivate: true, saveActive: true, saveTransform: false, saveParent: false },
]): MapMeta {
  const instances = PLACED.map((path, id) => ({ id, path, node: path.split(/[/=]/).pop()!, modelName: 'worldmodel', root: path }));
  return { stem: 'SYN', actions: [], instances, instanceByPath: new Map(instances.map((i) => [i.path, i.id])), initial, diagnostics: [] };
}

const FORWARD: WalkInput = { forward: 1, right: 0, boost: false };
/** A SEAL at (x, 0, z) facing +x (`camera.ts`: the camera looks down its own -z). */
const walker = (grid: ReturnType<typeof groundGrid>, x = 0, z = 0): Walker => {
  const w = new Walker(grid);
  expect(w.place(x, 0, z)).toBe(true);
  w.state.yaw = -90;
  return w;
};
const across = (from: [number, number, number], to: [number, number, number]): string[] =>
  segmentHits(groundGrid(hull()), from, to).map((h) => h.owner.path);

describe('the world\'s mutable state (MAP-02): one per room, its collision and its drawing together', () => {
  it('two rooms on one parsed map: a subtree deactivated in one leaves the other\'s rays, probes, segments and mover walls as they were', () => {
    const parse = hull();
    const a = forkGround(parse), b = forkGround(parse);
    const gridA = groundGrid(a), gridB = groundGrid(b);
    const worldA = new WorldState(meta(), a, gridA);
    expect(across([0, 25, 0], [20, 25, 0])).toEqual([`${HEALTHY}/wall`]);                    // the pristine hull's wall
    expect(worldA.setActive(HEALTHY, false)).toBe(true);
    // Room A: the wall and the deck are gone from every query.
    expect(segmentHits(gridA, [0, 25, 0], [20, 25, 0])).toHaveLength(0);
    expect(castRay(gridA, [0, 25, 0], [1, 0, 0], 20)).toBeNull();
    expect(probeGround(gridA, 45, 120).map((h) => h.y)).toEqual([0]);
    // Room B: as it was.
    expect(segmentHits(gridB, [0, 25, 0], [20, 25, 0]).map((h) => h.owner.path)).toEqual([`${HEALTHY}/wall`]);
    expect(castRay(gridB, [0, 25, 0], [1, 0, 0], 20)?.owner.path).toBe(`${HEALTHY}/wall`);
    expect(probeGround(gridB, 45, 120).map((h) => h.y).sort()).toEqual([0, 20]);
    // The movers: A's walks through x 10, B's is stopped short of it.
    const wa = walker(gridA), wb = walker(gridB);
    for (let k = 0; k < 90; k++) { wa.tick(FORWARD); wb.tick(FORWARD); }
    expect(wa.state.x).toBeGreaterThan(20);
    expect(wb.state.x).toBeLessThan(10);
    // The parse: untouched.
    expect(parse.owners.every((o) => o.flags === FLAGS)).toBe(true);
    expect(b.owners.every((o) => o.flags === FLAGS)).toBe(true);
  });

  it('a mover standing still in one cell loses the wall when its owner is deactivated and finds it again on reset: the per-cell cache follows the grid\'s revision', () => {
    const ground = hull(), grid = groundGrid(ground);
    const world = new WorldState(meta(), ground, grid);
    world.applyInitial();
    let w = walker(grid);
    for (let k = 0; k < 90; k++) w.tick(FORWARD);
    expect(w.state.x).toBeLessThan(10);                                                     // the wall stops it
    const before = grid.revision;
    world.setActive(HEALTHY, false);
    expect(grid.revision).toBe(before + 1);
    for (let k = 0; k < 90; k++) w.tick(FORWARD);                                           // the same mover, the same cell
    expect(w.state.x).toBeGreaterThan(20);
    world.reset();
    expect(grid.revision).toBe(before + 2);
    expect(w.place(0, 0, 0)).toBe(true);
    for (let k = 0; k < 90; k++) w.tick(FORWARD);
    expect(w.state.x).toBeLessThan(10);                                                     // the wall again
    w = walker(grid);
    for (let k = 0; k < 90; k++) w.tick(FORWARD);
    expect(w.state.x).toBeLessThan(10);
  });

  it('deactivating a parent path deactivates every owner and placement under it (path/, path=) and nothing beside it', () => {
    const ground = hull(), grid = groundGrid(ground);
    const shown: [string, boolean][] = [];
    const world = new WorldState(meta([]), ground, grid, { visible: (path, on) => shown.push([path, on]) });
    expect(world.setActive(ARCH, false)).toBe(true);
    expect(world.setActive(ARCH, false)).toBe(false);                                       // unchanged: no change
    const flags = new Map(ground.owners.map((o) => [o.path, o.flags]));
    for (const p of [`${HEALTHY}/wall`, `${HEALTHY}/deck`, DESTROYED, DIA]) expect(flags.get(p), p).toBe(FLAGS & ~1);
    expect(flags.get('worldmodel/arch_b')).toBe(FLAGS);
    expect(flags.get('worldmodel/floor')).toBe(FLAGS);
    for (const p of [ARCH, PROTO, HEALTHY, `${HEALTHY}/wall`, DIA]) expect(world.isActive(p), p).toBe(false);
    expect(world.isActive('worldmodel/arch_b')).toBe(true);
    expect(world.isActive('worldmodel')).toBe(true);
    expect(shown).toEqual([[ARCH, false]]);
    // A child off on its own stays off when the parent comes back; the drawing is told so.
    world.setActive(DESTROYED, false);
    shown.length = 0;
    world.setActive(ARCH, true);
    expect(shown).toEqual([[ARCH, true], [DESTROYED, false]]);
    expect(world.isActive(`${HEALTHY}/wall`)).toBe(true);
    expect(world.isActive(DIA)).toBe(false);
    expect(new Map(ground.owners.map((o) => [o.path, o.flags])).get(DIA)).toBe(FLAGS & ~1);
  });

  it('applyInitial turns the zAnim-deactivated subtrees off and saves them; reset restores the saved state and bumps the revision', () => {
    const ground = hull(), grid = groundGrid(ground);
    const shown: [string, boolean][] = [], revisions: number[] = [];
    const world = new WorldState(meta(), ground, grid, { visible: (path, on) => shown.push([path, on]), changed: (r) => revisions.push(r) });
    world.applyInitial();
    expect(shown).toEqual([[DESTROYED, false]]);
    expect(world.isActive(DIA)).toBe(false);
    expect(world.isActive(`${HEALTHY}/wall`)).toBe(true);
    expect(segmentHits(grid, [-40, 10, 0], [-20, 10, 0])).toHaveLength(0);                    // the rubble is not there
    expect(world.states()).toEqual([]);
    // The demolition's swap (research 171 s4: commands 240-256), a valve and a use.
    world.setActive(DESTROYED, true);
    world.setActive(HEALTHY, false);
    world.setValve('seal_strike1', 1);
    world.markUsed(3);
    expect(world.states()).toEqual([
      { id: PLACED.indexOf(HEALTHY), path: HEALTHY, active: false, initial: true },
      { id: PLACED.indexOf(DESTROYED), path: DESTROYED, active: true, initial: false },
    ]);
    expect(segmentHits(grid, [-40, 10, 0], [-20, 10, 0]).map((h) => h.owner.path)).toEqual([DESTROYED]);
    const before = world.revision;
    expect(before).toBe(grid.revision);
    shown.length = 0;
    world.reset();
    expect(world.revision).toBe(before + 1);
    expect(revisions.at(-1)).toBe(before + 1);
    expect(world.states()).toEqual([]);
    expect(world.isActive(DIA)).toBe(false);
    expect(world.isActive(`${HEALTHY}/deck`)).toBe(true);
    expect(world.valve('seal_strike1')).toBe(0);
    expect(world.actionUsed(3)).toBe(false);
    expect(new Set(shown.map(([p, on]) => `${p}:${on}`))).toEqual(new Set([`${HEALTHY}:true`, `${DESTROYED}:false`]));
    expect(segmentHits(grid, [0, 25, 0], [20, 25, 0]).map((h) => h.owner.path)).toEqual([`${HEALTHY}/wall`]);
    // Nothing changed since: a reset still moves the revision (the round's epoch).
    world.reset();
    expect(world.revision).toBe(before + 2);
  });
});

/**
 * XR-04 (research 213 s4): a scene program's `CALL_ANIMATION` the map's set lacks -- Crossroads' `fire_explode_med` and
 * `dust_explode_long` are the common set's (`CZANIM`) -- goes to the page's effects through the `call` hook at the calling
 * program's root (`COMMON_EFFECT_CALL_READING`), on a presentation run only; and `FIRE_WEAPON` reaches nothing
 * (`BRIDGE_FIRE_WEAPON_READING`, ruling PF.R32). On the synthetic arch: an action on the floor runs `site`, rooted at
 * the arch.
 */
describe('XR-04: the program effects the world hands on and the ones it ignores', () => {
  const SITE = 'worldmodel/arch';
  const program = (ops: EffectOp[]): EffectProgram => ({ name: 'site', root: 1, flags: 0, nodes: ['NA', 'arch', 'healthy'], sequences: [{ name: 'NA', activation: 1, ops }] });
  const metaWith = (ops: EffectOp[]): MapMeta => ({
    ...meta(),
    actions: [{
      node: 'floor', type: 'SWITCH', typeCode: 2, valve: 'v_site', anims: ['site'], team: null, range: 30, elevation: -1, points: 2,
      bitmap: 'action_pull_lever.tif', path: 'worldmodel/floor', at: [0, 0, 0],
    }],
    scene: { destructibles: [], programs: [{ program: program(ops), search: [0, 0, 0] }] },
  });
  type Heard = [string, ...unknown[]];
  const hooked = (m: MapMeta): { world: WorldState; heard: Heard[] } => {
    const heard: Heard[] = [];
    const ground = hull();
    const world = new WorldState(m, ground, groundGrid(ground), {
      visible: (p, on) => heard.push(['visible', p, on]), changed: (r) => heard.push(['changed', r]),
      sound: (n, p) => heard.push(['sound', n, p]), particles: () => heard.push(['particles']),
      destruction: (p) => heard.push(['destruction', p]), call: (n, p) => heard.push(['call', n, p]),
    });
    world.applyInitial();
    heard.length = 0;
    return { world, heard };
  };

  it("a presentation run of a program whose CALL_ANIMATION the set lacks reaches the call hook with the caller's place; the room's silent run reaches nothing", () => {
    const ops: EffectOp[] = [{ op: 'call', anim: 'fire_explode_med' }, { op: 'wait', seconds: 0.5, range: 0, frames: null }, { op: 'call', anim: 'dust_explode_long' }];
    const page = hooked(metaWith(ops));
    expect(page.world.executeAction('v_site', false, true)).toBe(true);
    expect(page.heard).toEqual([['call', 'fire_explode_med', SITE]]);
    page.world.step(0.6);
    expect(page.heard).toEqual([['call', 'fire_explode_med', SITE], ['call', 'dust_explode_long', SITE]]);
    // The room's world (ROOM_SKIP_EFFECTS_READING): the same program, silent by default, hands nothing on.
    const room = hooked(metaWith(ops));
    room.world.skipEffects = true;
    expect(room.world.executeAction('v_site')).toBe(true);
    room.world.step(0.6);
    expect(room.heard).toEqual([]);
    expect(room.world.busy).toBe(false);
  });

  it('FIRE_WEAPON is ignored by the host: no node, valve, hook or damage (BRIDGE_FIRE_WEAPON_READING)', () => {
    const ops: EffectOp[] = [
      { op: 'fireWeapon', weapon: 'MPBOMB', ammo: 'MPBOMB Ammo', node: 2, f1: 0.001, f2: 0.01 },
      { op: 'wait', seconds: 0.1, range: 0, frames: null },
      { op: 'fireWeapon', weapon: 'MPBOMB', ammo: 'MPBOMB Ammo', node: -6, f1: 0.001, f2: 0.01 },
    ];
    for (const run of ['room', 'page'] as const) {
      const { world, heard } = hooked(metaWith(ops));
      world.skipEffects = run === 'room';
      const before = { states: world.states(), revision: world.revision };
      expect(world.executeAction('v_site', false, run === 'page')).toBe(true);
      world.step(0.2);
      expect(world.busy).toBe(false);
      expect(heard, run).toEqual([]);
      expect({ states: world.states(), revision: world.revision }, run).toEqual(before);
      expect(world.valve('v_site')).toBe(0);
      expect(world.isActive(`${HEALTHY}/wall`)).toBe(true);
    }
  });
});

/**
 * W0 (research 237 §0): the round's reset and the animations that start with their set. The original restores the
 * references' saved init and then starts the sets again: online the round's end state's UnInit (`FUN_002232a0`
 * D:L75850-75866) runs, on the sets `common` and `mission` (0x3e5260, 0x3e5268), `FUN_0026c2e0` (stop, the started byte
 * cleared), `FUN_0026c4f0` (the saved references back, `FUN_0026b430`) and `FUN_0026c600` (the set's start, D:L116312-
 * 116387: it runs only while that byte is 0); the offline reopen (`FUN_002ac0e0` D:L151966-151983) stops and restores,
 * and the next round's start `FUN_002a7d40` (D:L149735-149742) starts both sets. So an autostart's opening commands run
 * again each round, and what the reference saved before them (`beer_parts` on) is turned off again at once. The port
 * saves after the fold (`applyInitial`) and restores that: the same end state by one step fewer. MP6 fixture.
 */
const mp6 = fixture('RUN/MP6.ZDB');
describe.skipIf(mp6 === null)(`the round's reset and the autostarts${mp6 === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it("a round reset leaves an autostart's folded opening state as it was (AUTOSTART_RESET_READING; FUN_002ac0e0 D:L151976-151991): MP6's beer_parts are off at round 2", () => {
    expect(AUTOSTART_RESET_READING).toBe('re-run');
    const toc = parseZdb(mp6!);
    const meta = readMapMeta(mp6!, toc, 'MP6', parseSceneGraph(Zar.parse(zdbMember(mp6!, toc, 'MP6_GEO.ZED'))));
    const beer = meta.initial.filter((e) => /\/beer_parts$/.test(e.path));
    expect(beer.length).toBe(9);                                   // the nine beerN (flags 0x21, research 209 s9)
    expect(beer.every((e) => e.deactivate && e.saveActive)).toBe(true);
    const ground = hull();
    const world = new WorldState(meta, ground, groundGrid(ground));
    world.applyInitial();                                           // round 1: the autostart's fold, then the save
    expect(beer.filter((e) => world.isActive(e.path)).map((e) => e.path)).toEqual([]);
    for (const e of beer) world.setActive(e.path, true);           // a round that turned the debris on (a bottle shot)
    expect(beer.every((e) => world.isActive(e.path))).toBe(true);
    world.reset();                                                  // round 2
    expect(beer.filter((e) => world.isActive(e.path)).map((e) => e.path)).toEqual([]);
    expect(world.states().filter((s) => /\/beer_parts$/.test(s.path))).toEqual([]);
  });
});

/**
 * W0 fix round (research 237 §0.2): the original's restart replays an autostart's whole opening -- not only the nodes a
 * reference saves. MP73's `set_apache` (flags 0x21) turns `chopper1` off, sets three
 * valves to 0 and turns `radio_call` on; `airstrike1` turns `radio_call` off. At round 2 the restarted `set_apache` turns
 * it on again (`FUN_002232a0` D:L75850-75866 -> `FUN_0026c600`). Neither `radio_call` nor `chopper1` carries a save bit,
 * so a restore alone leaves the round's state: the port's `reset` re-applies the autostarts' opening `active` commands
 * after the restore (`MapMeta.autostart`). The start path: flags 0x21 has bit 11 clear, so every start is `FUN_002713f0`
 * (D:L116360-116371), never `FUN_00271390`'s kind-3 skip, and its kind (`flags & 7`) is 1, not 3; Desert Glory's nine
 * `beerN` the same. The disc: the served `public/maps` or `SOCOM_PC_ROOT`.
 */
const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DISC = [resolve(WEB, 'public/maps'), ...(process.env.SOCOM_PC_ROOT ? [resolve(process.env.SOCOM_PC_ROOT, 'game/disc')] : [])]
  .find((d) => ['MP73.ZDB', 'MP6.ZDB'].every((f) => existsSync(resolve(d, 'RUN', f))));
describe.skipIf(!DISC)(`the round's reset replays the autostarts' opening${DISC ? '' : ' (no public/maps or SOCOM_PC_ROOT disc)'}`, () => {
  it("MP73: a round reset after airstrike1 re-runs set_apache -- radio_call is on at round 2 (the original's restart)", () => {
    const read = (stem: string) => new Uint8Array(readFileSync(resolve(DISC!, 'RUN', `${stem}.ZDB`)));
    const autostarts = (bytes: Uint8Array, name: RegExp) => parseAnimSets(Zar.parse(zdbMember(bytes, parseZdb(bytes), 'MZANIM.ZAR')))
      .sets.flatMap((s) => s.anims).filter((a) => name.test(a.name) && (a.params.flags & 3) === 1);   // started with its set
    const apache = autostarts(read('MP73'), /^set_apache$/);
    const beer = autostarts(read('MP6'), /^beer[1-9]$/);
    expect(apache).toHaveLength(1);
    expect(beer).toHaveLength(9);
    for (const a of [...apache, ...beer]) {
      expect((a.params.flags & 0x800) === 0 && (a.params.flags & 7) === 1, a.name).toBe(true);    // FUN_002713f0, kind 1
    }
    const sim = simMapFromBytes(read('MP73'), 'RUN/MP73.ZDB');
    const pathOf = (node: string): string => sim.meta!.instances.find((i) => i.node.toLowerCase() === node)!.path;
    const radio = pathOf('radio_call'), chopper = pathOf('chopper1');
    const world = new WorldState(sim.meta!, sim.ground, sim.grid);
    world.applyInitial();
    expect(world.isActive(radio)).toBe(true);
    expect(world.isActive(chopper)).toBe(false);
    expect(world.executeAction('airstrike1')).toBe(true);                  // the room's path (room.ts executeAction)
    for (let i = 0; i < 50; i++) world.step(0.1);
    expect(world.isActive(radio)).toBe(false);                             // the strike called: the radio off
    world.reset();                                                          // round 2
    expect(world.isActive(radio)).toBe(true);
    expect(world.isActive(chopper)).toBe(false);
    expect(world.states().filter((s) => s.path === radio || s.path === chopper)).toEqual([]);
    for (let i = 0; i < 300; i++) world.step(0.1);
    expect(world.isActive(radio)).toBe(true);
  }, 120_000);
});

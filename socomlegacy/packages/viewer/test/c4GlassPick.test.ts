// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildGrid, CLAYMORE, SOILS, type CollisionOwner, type Grid, type GridParams, type ThrowableRecord, type V3, type WorldPoly,
} from '@s2u/scene';
import * as equipment from '../src/equipment';
import { c4Line } from '../src/equipment';
import { GrenadeThrower } from '../src/grenade';
import { groundGrid, packGround } from '../src/mover';
import type { PlaySnapshot } from '../src/walk';

/**
 * C4-GLASS (the bugs intake's item 1 after v0.4.23; LATER 276; research 440): C4's target is the aim's OPAQUE record
 * (`FUN_005aa6e0`'s `+0x3c0`..`+0x3dc`, read by the settle `FUN_005be6f0` D:L475130-475138, the plant's start
 * `FUN_005be9a0` D:L475380 / D:L475399 and its callback `FUN_005c1970` D:L476905-476985). The opaque record keeps only
 * a hit whose material is not VOLUMETRIC, not LIQUID and not of PENETRATION >= 0.98 without PICKUP (D:L464145-464160;
 * `aimHitKept`). So a pane, a fence or a net is looked through: never C4's target, and what is behind it in reach is
 * planted on (no line from the head is tested in either function: research 440 section 1).
 *
 * The controller's (c): the page and the room accept and refuse THE SAME plants. One table drives both: the page's pick
 * (`c4AimPick`, which `grenade.ts` `c4Pick` calls) and the room's judgement of the surface it names (`c4Line`, which
 * `room.ts` `placeCharge` calls with the map's `DefaultMaterial`).
 */

/** A material's polygon byte: SOILS entry `i` is byte `i + 2` (`BUILTIN_MATERIALS` first; `surfaceMaterial`). */
const byteOf = (name: string): number => {
  const i = SOILS.findIndex((m) => m.name === name);
  if (i < 0) throw new Error(`no SOILS entry ${name}`);
  return i + 2;
};

const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLAGS = 0x1001;
/** A face across `x` (z -20..20, 0..40 high), wound to face -x: met from the front by a view travelling +x. */
const across = (path: string, x: number, material: number): WorldPoly => ({
  modelName: 'worldmodel', path, region: 0, ditype: 2, material, ptcount: 4, cameratype: 0,
  points: Float32Array.from([x, 0, -20, x, 0, 20, x, 40, 20, x, 40, -20]),
});
const PANE = 'worldmodel/pane1=pane1/glass', WALL = 'worldmodel/access1=access1/good_parts/di_good';
const PANE_X = 100, WALL_X = 110;
const HEAD: V3 = [80, 12, 0], FAR: V3 = [300, 12, 0];

/** The floor, a pane of `material` at x 100 and a STONE wall behind it at x 110: two nodes. */
function paneGrid(material: number): Grid {
  const polys: WorldPoly[] = [
    { ...across('worldmodel/floor', 0, byteOf('STONE')), ditype: 3, points: Float32Array.from([-1000, 0, 1000, 1000, 0, 1000, 1000, 0, -1000, -1000, 0, -1000]) },
    across(PANE, PANE_X, material), across(WALL, WALL_X, byteOf('STONE')),
  ];
  const owners: CollisionOwner[] = [
    { modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1, flags: FLAGS },
    { modelName: 'worldmodel', path: PANE, first: 1, count: 1, flags: FLAGS },
    { modelName: 'worldmodel', path: WALL, first: 2, count: 1, flags: FLAGS },
  ];
  return groundGrid(packGround(params, polys, owners));
}

/** The aim looks through these (research 440 section 2): PENETRATION >= 0.98, no PICKUP. */
const LOOKED_THROUGH = ['GLASS', 'GLASS_MEDIUM', 'METAL_GRATE_THIN', 'CAMO_NET', 'CHAINLINK_FENCE'] as const;
/** And keeps these: the pane is the target and the wall behind it is walled off. */
const KEPT = ['GLASS_THICK', 'GLASS_OPAQUE', 'BROKEN GLASS', 'METAL_RAILING', 'PERSON'] as const;

/** The page's pick (the export the fix adds). Null, or the struck node and point. */
function pagePick(grid: Grid): { path: string; point: readonly number[] } | null {
  const pick = (equipment as unknown as { c4AimPick?: (g: Grid, eye: readonly number[], far: readonly number[], defaultMaterial?: string) => { path: string; point: readonly number[] } | null }).c4AimPick;
  expect(typeof pick, 'equipment.ts exports c4AimPick, the page\'s C4 pick on the opaque record').toBe('function');
  return pick!(grid, HEAD, FAR, '');
}

describe('C4-GLASS: the page and the room judge the same plants by the opaque record (research 440)', () => {
  it.each(LOOKED_THROUGH)('a %s pane in front: the page picks the wall behind it, the room takes the wall and refuses the pane', (name) => {
    const g = paneGrid(byteOf(name));
    const pick = pagePick(g);
    expect(pick?.path).toBe(WALL);
    expect(pick!.point[0]).toBeCloseTo(WALL_X, 3);
    // The room: the wall behind the pane is clear from the head (the pane is no wall to the original's aim)...
    expect(c4Line(g, HEAD, { path: WALL, point: [WALL_X, 12, 0] }, '', [HEAD]).clear).toBe(true);
    // ...and a page naming the pane itself is refused: the pane is never the aimed object.
    expect(c4Line(g, HEAD, { path: PANE, point: [PANE_X, 12, 0] }, '', [HEAD]).clear).toBe(false);
  });

  it.each(KEPT)('a %s pane in front: kept by the aim -- the page picks the pane, the room takes the pane and walls off the wall', (name) => {
    const g = paneGrid(byteOf(name));
    const pick = pagePick(g);
    expect(pick?.path).toBe(PANE);
    expect(pick!.point[0]).toBeCloseTo(PANE_X, 3);
    expect(c4Line(g, HEAD, { path: PANE, point: [PANE_X, 12, 0] }, '', [HEAD]).clear).toBe(true);
    expect(c4Line(g, HEAD, { path: WALL, point: [WALL_X, 12, 0] }, '', [HEAD])).toEqual({ clear: false, why: 'walled' });
  });

  it('the byte table matches the disc\'s SOILS as research 440 section 2 reads it', () => {
    for (const name of LOOKED_THROUGH) {
      const m = SOILS.find((x) => x.name === name)!;
      expect(m.penetration >= 0.98 && !m.pickup, name).toBe(true);
    }
    for (const name of KEPT) {
      const m = SOILS.find((x) => x.name === name)!;
      expect(m.volumetric || m.liquid || (m.penetration >= 0.98 && !m.pickup), name).toBe(false);
    }
  });
});

/**
 * LATER 1139 (research 440 s8; was the main controller's 2026-11-16 ruling, C4_THROUGH_REACH_READING for a through-face
 * plant and C4_REACH_READING 32 for every other): ONE hip gate, |point - hip|^2 < 396 in 3-D, for every plant, through a
 * face or not (`FUN_005be9a0` D:L475400-475405; proven on r0004 by the capture agent-mail/evidence/later1139-c4reach,
 * 2026-11-18: +0x208 <= 395.68 prompts, >= 396.23 does not). The struck point here sits at y 62, the hip (no body: the
 * feet plus the stance's root, 61.484) 0.516 below it. The cases below stand the feet `d` u off along the ground; `viewer/test/c4HipReach.test.ts` and `match/test/roomC4HipReach.test.ts` hold the
 * gate's own table, page and room.
 */
const HIP_REACH_SQ = (): number => {
  const v = (equipment as unknown as { C4_HIP_REACH_SQ?: number }).C4_HIP_REACH_SQ;
  expect(v, 'equipment.ts exports C4_HIP_REACH_SQ').toBe(396);
  return v!;
};
/** The page's through-face cases: the struck point `d` u from the feet along the ground, 0.516 over the hip. */
const THROUGH_CASES = [
  { d: 19, taken: true },
  { d: 21, taken: false },
] as const;

describe('C4-GLASS on the page: GrenadeThrower plants on what the opaque record holds', () => {
  const C4: ThrowableRecord = { ...CLAYMORE, name: 'C4', id: 151, fuse: 6, removal: 0.1, explosionDamage: 18, explosionRadius: 50, model: 'c4', icon: 'c4.tif', capacity: 4 };
  const DI = 'worldmodel/access1=access1/good_parts/di_good', GLASS_NODE = 'worldmodel/pane1=pane1/glass';
  /**
   * A barrier across x 100 + `d` and, unless `paneMaterial` is null, a pane across 10 u in front of it (z 150..250, 50..110
   * high), both taking C4. The feet stand at x 100, so the barrier's struck point is `d` from them along the ground.
   */
  const grid = (paneMaterial: number | null, d: number): Grid => {
    const f: WorldPoly = {
      modelName: 'worldmodel', path: 'worldmodel/f', region: 0, ditype: 3, material: byteOf('STONE'), ptcount: 4, cameratype: 0,
      points: Float32Array.from([-2000, 50, 2000, 2000, 50, 2000, 2000, 50, -2000, -2000, 50, -2000]),
    };
    const face = (path: string, x: number, material: number): WorldPoly =>
      ({ ...f, path, ditype: 2, material, points: Float32Array.from([x, 50, 150, x, 50, 250, x, 110, 250, x, 110, 150]) });
    const p: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
    const polys = [f, face(DI, 100 + d, byteOf('STONE')), ...(paneMaterial === null ? [] : [face(GLASS_NODE, 90 + d, paneMaterial)])];
    return buildGrid(p, [], [], polys, [
      { modelName: 'worldmodel', path: 'worldmodel/f0', first: 0, count: 1 },
      { modelName: 'worldmodel', path: DI, first: 1, count: 1 },
      ...(paneMaterial === null ? [] : [{ modelName: 'worldmodel', path: GLASS_NODE, first: 2, count: 1 }]),
    ]);
  };
  /** Both nodes take the charge: the barrier is destructible 0, the pane destructible 1 (Frostfire's pane1: shield 0). */
  const health = { c4TargetAt: (path: string, damage: number): number | null => (damage < 17 ? null : path === DI ? 0 : path === GLASS_NODE ? 1 : null) };
  const snap = (): PlaySnapshot => ({
    feet: [100, 50, 200], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand', landing: null, jumps: 0,
  } as PlaySnapshot);
  const planter = (paneMaterial: number | null, d: number) => {
    const g0 = grid(paneMaterial, d);
    const placed: { target?: number; surface?: { path: string; point: V3 } }[] = [];
    const g = new GrenadeThrower({
      grid: () => g0, snapshot: snap, view: () => 'third', handPoint: () => [102, 62, 192],
      aim: () => ({ eye: [100, 62, 200], far: [400, 62, 200] }),
    });
    g.setRecords([C4]);
    g.setWorld(() => ({ health: { ...health, blastAt: () => [] } }) as never);
    g.on('place', (e) => placed.push({ target: e.target, surface: e.surface }));
    g.setKit(['M67', 'AN-M8', 'C4']);
    return { g, placed };
  };
  const run = (g: GrenadeThrower, seconds: number): void => { for (let t = 0; t < seconds - 1e-9; t += 1 / 60) g.update(1 / 60); };

  it('a GLASS pane that takes the charge is passed over: the target is the barrier behind it (19 u from the feet)', () => {
    const { g, placed } = planter(byteOf('GLASS'), 19);
    run(g, 0.3);
    expect(g.c4Target()).toBe(0);
    expect(g.plantC4()).toBe(true);
    run(g, 1.3);
    expect(placed).toHaveLength(1);
    expect(placed[0]!.target).toBe(0);
    expect(placed[0]!.surface!.path).toBe(DI);
    expect(placed[0]!.surface!.point[0]).toBeCloseTo(119, 6);
  });

  it('a CHAINLINK_FENCE in front: the same', () => {
    const { g } = planter(byteOf('CHAINLINK_FENCE'), 19);
    run(g, 0.3);
    expect(g.c4Target()).toBe(0);
  });

  it('a GLASS_THICK pane (PENETRATION 0) is kept: the pane is the target (LATER 1139: 11 u off, inside the hip gate)', () => {
    const { g } = planter(byteOf('GLASS_THICK'), 21);
    run(g, 0.3);
    expect(g.c4Target()).toBe(1);
  });

  it.each(THROUGH_CASES)('through a GLASS pane at $d u from the feet: taken $taken (LATER 1139: the hip gate)', ({ d, taken }) => {
    HIP_REACH_SQ();
    const { g } = planter(byteOf('GLASS'), d);
    run(g, 0.3);
    expect(g.c4Target()).toBe(taken ? 0 : null);
  });

  it.each(THROUGH_CASES)('with no pane at $d u: taken $taken -- the same gate (LATER 1139; was C4_REACH_READING 32)', ({ d, taken }) => {
    const { g } = planter(null, d);
    run(g, 0.3);
    expect(g.c4Target()).toBe(taken ? 0 : null);
  });
});

/**
 * The places the research 440 sweep (box/wm-swap-c4sweep-efc31c29a/keep/c4-sweep.txt) finds where a target is planted on
 * through a visible looked-through face of another node: since LATER 1139 one hip gate judges them, through the face or
 * not -- `viewer/test/c4HipReach.test.ts` (PLACES_REFUSED, PLACES_TAKEN) and `match/test/roomC4HipReach.test.ts` hold
 * them, page and room.
 */

/**
 * The main controller's cures (2026-11-16) on the head as first pushed (893873da11):
 * (A) a plant is `through` only by a face the aim's MATERIAL rule looks through (`aimPickBlocks`); any other face -- a
 *     ground face with no side bit, a `m_cameratype` 2 face -- is judged exactly as before C4-GLASS: the room's line has
 *     always counted such a face, crossed before the point, a wall (`c4Line`'s filter passes only bit 18), and a line
 *     passing above it is clear.
 * (B) the room is the authority and judges from the head (`placeCharge`: `headEye` on `headPoint(startBody)`), so the
 *     page, given that head, asks the room's own line (`c4AimPick(..., head)`): where the camera's line and the head's
 *     differ, the page follows the head. One worked case each way: a pane the head's line crosses and the camera's
 *     clears, and the mirror.
 * The feet at x 100, the head at (100, 62), the third person's camera behind and above at (90, 75); the barrier across
 * x 125, the camera's aim on (125, 60). LATER 1139: the reach is the hip gate's alone, so these cases judge the line; the
 * reach is asked from a hip 15 u off (`NEAR`), inside the gate, where it was asked from the feet 25 u off.
 */
describe('C4-GLASS cures A and B: the material rule alone marks a plant through, and the page follows the room\'s head line', () => {
  const DI = 'worldmodel/access1=access1/good_parts/di_good', FRONT = 'worldmodel/front';
  const FEET: V3 = [100, 50, 200], HEAD_AT: V3 = [100, 62, 200], CAM: V3 = [90, 75, 200], P: V3 = [125, 60, 200];
  const FAR: V3 = [CAM[0] + (P[0] - CAM[0]) * 10, CAM[1] + (P[1] - CAM[1]) * 10, CAM[2] + (P[2] - CAM[2]) * 10];
  const health = { c4TargetAt: (path: string): number | null => (path === DI ? 0 : null) };
  const NEAR: V3 = [P[0] - 15, P[1], P[2]];
  /** A face across `x` from height y0 to y1 (z 150..250), facing -x; `ditype` 2 unless given. */
  const face = (path: string, x: number, y0: number, y1: number, material: number, ditype = 2): WorldPoly => ({
    modelName: 'worldmodel', path, region: 0, ditype, material, ptcount: 4, cameratype: 0,
    points: Float32Array.from([x, y0, 150, x, y0, 250, x, y1, 250, x, y1, 150]),
  });
  /** The barrier at x 125 and one face of another node at x 115 (y0..y1, `material`, `ditype`). */
  const world = (y0: number, y1: number, material: number, ditype = 2): Grid => {
    const p: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
    return buildGrid(p, [], [], [face(DI, 125, 50, 110, byteOf('STONE')), face(FRONT, 115, y0, y1, material, ditype)], [
      { modelName: 'worldmodel', path: DI, first: 0, count: 1 },
      { modelName: 'worldmodel', path: FRONT, first: 1, count: 1 },
    ]);
  };
  const pick = (g: Grid, head: V3 | null) => (equipment.c4AimPick as unknown as
    (g: Grid, eye: V3, far: V3, dm: string, head: V3 | null) => ReturnType<typeof equipment.c4AimPick>)(g, CAM, FAR, '', head);

  it('A: a ground face (no side bit) the head\'s line crosses at 25 u: walled in the room as today, no target on the page', () => {
    const g = world(50, 70, byteOf('STONE'), 1);
    expect(c4Line(g, HEAD_AT, { path: DI, point: P })).toEqual({ clear: false, why: 'walled' });
    expect(pick(g, HEAD_AT)).toBeNull();
  });

  it('A: an ordinary plant over a ground face (the line clear above it): the line clear, page and room (the reach the hip gate\'s)', () => {
    const g = world(50, 55, byteOf('STONE'), 1);
    const line = c4Line(g, HEAD_AT, { path: DI, point: P });
    expect(line).toEqual({ clear: true, material: 'STONE' });
    const got = pick(g, HEAD_AT);
    expect(got?.path).toBe(DI);
    expect(equipment.c4TargetOf(health, got, NEAR, 18)).toBe(0);
    expect(equipment.c4TargetOf(health, got, FEET, 18)).toBeNull();                  // 25 u off: past the hip gate
  });

  it('A: a cameratype-2 face the head\'s line crosses: walled in the room as today, no target on the page', () => {
    const p: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
    const g = buildGrid(p, [], [], [face(DI, 125, 50, 110, byteOf('STONE')), { ...face(FRONT, 115, 50, 70, byteOf('STONE')), cameratype: 2 }], [
      { modelName: 'worldmodel', path: DI, first: 0, count: 1 },
      { modelName: 'worldmodel', path: FRONT, first: 1, count: 1 },
    ]);
    expect(c4Line(g, HEAD_AT, { path: DI, point: P })).toEqual({ clear: false, why: 'walled' });
    expect(pick(g, HEAD_AT)).toBeNull();
  });

  it('B: a GLASS pane the head\'s line crosses and the camera\'s clears (y 50..61): clear in the room, the page follows; one gate', () => {
    const g = world(50, 61, byteOf('GLASS'));
    const line = c4Line(g, HEAD_AT, { path: DI, point: P });
    expect(line).toEqual({ clear: true, material: 'STONE' });                         // LATER 1139: no `through` mark
    expect(pick(g, null)?.path).toBe(DI);
    const got = pick(g, HEAD_AT);
    expect(got?.path).toBe(DI);
    expect(equipment.c4TargetOf(health, got, NEAR, 18)).toBe(0);                     // the hip gate, through the pane or not
  });

  it('B, the mirror: a GLASS pane the camera\'s line crosses and the head\'s clears (y 63..110): clear, the page follows; one gate', () => {
    const g = world(63, 110, byteOf('GLASS'));
    const line = c4Line(g, HEAD_AT, { path: DI, point: P });
    expect(line).toEqual({ clear: true, material: 'STONE' });
    const got = pick(g, HEAD_AT);
    expect(got?.path).toBe(DI);
    expect(equipment.c4TargetOf(health, got, NEAR, 18)).toBe(0);
    expect(equipment.c4TargetOf(health, got, FEET, 18)).toBeNull();                  // 25 u: the hip gate, through or not
  });
});

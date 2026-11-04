// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRdr, rdrGet, Zar, type RdrNode } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { buildGrid, polygonNormal, probeGround, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { loadMap } from '../src/loadMap';
import { groundGrid, groundPolygons, Walker, type WalkInput } from '../src/walk';
import { CLIMB_FACING, CLIMBABLE, climbClass, CONTACT_KEEP, contactOf, footStepOffset, obstacleRay, planClimb, topFloor } from '../src/climb';
import {
  CLIMB_TOP_FLOOR_READING, LADDER_RATE, LADDER_ROOT, LADDER_STANDOFF, leanClip, PISTOL_CLIMB_CLIPS, PISTOL_CLIMB_CLIPS_READING, PISTOL_CLIMB_NO_INTERRUPT, rippleAnimation, Traversal, TRAVERSAL_CLIP,
  TraversalShapes,
} from '../src/traversal';
import { shapeTravel } from '../src/clipPath';
import type { MotionClip } from '@s2u/scene';
import type { MotionEntry } from '../src/motionTable';
import { peekShift, scopePeekShift } from '../src/cameraRig';

/**
 * Parity pins for traversal's rules (web research 86), unit tier: the climb's height table `FUN_00580b70` on both sides
 * of every edge, the material's foot offset, the contact and facing gates, the ladder's numbers, the peek's camera
 * shifts and the clip names the moves play. The behaviour on synthetic hulls is `traversal.test.ts`'s; this file holds
 * the cited numbers so a changed threshold fails in CI. The clip names are re-read off `MOTION_P.ZAR` (fixture tier).
 */

const kind = (h: number, app: number): string | null => climbClass(h, app)?.kind ?? null;
const clip = (h: number, app: number): string | null => climbClass(h, app)?.clip ?? null;

describe('movement.climb: FUN_00580b70\'s table by the height, every edge (research 86 section 3.3)', () => {
  it('<= 5 nothing; to 10 Step up; to 12 Climb crate; to 26.5 the crate/medium blend; to 28 Climb medium; to 32 the hang; over 32 nothing', () => {
    for (const app of [1, 3]) {
      expect(kind(5, app)).toBeNull();
      expect(clip(5.01, app)).toBe('seal_step_up');
      expect(clip(10, app)).toBe('seal_step_up');
      expect(clip(10.01, app)).toBe('seal_climbcrate');
      expect(climbClass(12, app)?.blend).toBeNull();
      expect(climbClass(12.01, app)?.blend?.clip).toBe('seal_climb_medium');
      expect(climbClass(26.5, app)?.blend?.weight).toBeCloseTo(0, 9);
      expect(clip(26.51, app)).toBe('seal_climb_medium');
      expect(climbClass(26.51, app)?.blend).toBeNull();
      expect(clip(28, app)).toBe('seal_climb_medium');
      expect(clip(28.01, app)).toBe('seal_stand2hang');
      expect(clip(32, app)).toBe('seal_stand2hang');
      expect(kind(32.01, app)).toBeNull();
    }
  });

  it('the blend weighs the crate 1 - (h - 12) / 14.5 (FUN_00581110): 0.586 at 18, 0.5 at 19.25', () => {
    expect(climbClass(18, 1)?.blend?.weight).toBeCloseTo(1 - 6 / 14.5, 9);
    expect(climbClass(19.25, 1)?.blend?.weight).toBeCloseTo(0.5, 9);
    expect(climbClass(13, 1)?.blend?.weight).toBeCloseTo(1 - 1 / 14.5, 9);
  });

  it('appflags 4 (a crate) climbs only for 5 < h <= 32; appflags 5 always climbs over; 1, 3, 4 and 5 are the climbable ones', () => {
    expect(kind(5, 4)).toBeNull();
    expect(clip(5.01, 4)).toBe('seal_step_up');
    expect(clip(32, 4)).toBe('seal_stand2hang');
    expect(kind(32.01, 4)).toBeNull();
    for (const h of [1, 5, 13, 40]) expect(climbClass(h, 5)).toEqual({ kind: 'over', clip: 'seal_climb_over', blend: null });
    expect([...CLIMBABLE].sort()).toEqual([1, 3, 4, 5]);
  });

  it('the contact polygon\'s FOOT_STEP_OFFSET: -0.8 on materials 4 and 14-18 (grass, broken glass, leaves, ice, snow, gravel), else 0', () => {
    for (const m of [4, 14, 15, 16, 17, 18]) expect(footStepOffset(m)).toBe(-0.8);
    for (const m of [0, 3, 5, 9, 11, 12, 13, 19, 25]) expect(footStepOffset(m)).toBe(0);
  });

  it('the contact is kept within 24 across the ground (576 = 24^2) and wants a facing of 0.3 (FUN_005b3890, 469208)', () => {
    expect(CONTACT_KEEP).toBe(24);
    expect(CLIMB_FACING).toBe(0.3);
    expect((Math.acos(CLIMB_FACING) * 180) / Math.PI).toBeCloseTo(72.54, 2);   // research 86 section 3.2: about 72.5 degrees
  });
});

describe('movement.ladder: the ladder\'s numbers (research 86 sections 2.3, 1.1)', () => {
  it('mounts with the root 15.6 over the feet, climbs at 0.135 x K 1.7778 of the clip: 13.5 a second at a full stick; the rungs 5.565 ahead', () => {
    expect(LADDER_ROOT).toBe(15.6);                           // FUN_005b1c80: 0x4179999a
    expect(LADDER_RATE).toBe(0.135);                          // max_velocity 1.35 x 10 / 100
    expect(LADDER_STANDOFF).toBe(5.565);                      // the climb-off's refPt z
    // seal_climbladder: 16 keys over 16 / 30 / 3 s, a 10-unit cycle (0.625 a key, VerticalMotion): K = T x 100 / D
    // (FUN_0028aa20) = 1.7778, so 0.135 x 1.7778 x 16 / 0.1778 = 21.6 keys a second (research 206 section 2.4)
    const shapes = new TraversalShapes();
    const climb = shapes.ladderClimb();
    expect(climb.scale).toBeCloseTo(1.77778, 4);
    expect(climb.keysPerSecond).toBeCloseTo(21.6, 3);
    expect(climb.keysPerSecond * climb.perKey).toBeCloseTo(13.5, 3);
    // The clip itself, under motion.rdr's record (the same K path as the walk's, ./locomotion motionOf)
    const t: number[] = [];
    for (let i = 0; i <= 16; i++) t.push(0, 15.6 + 0.625 * (i === 16 ? 0 : i), -7.6);
    const own: MotionClip = { name: TRAVERSAL_CLIP.ladder, version: 5, duration: 16 / 30, frameCount: 16, rate: 30, unknown10: -1, unknown14: 1,
      parts: [{ index: 0, name: 'skel_root', flags: 0x1c, translations: Float32Array.from(t), rotations: Float32Array.of(0, 0, 0, 1) }] };
    const record: MotionEntry = { looped: true, playback: 3, maxVelocity: 1.35, blendTime: null, transitionA: 0, transitionB: 2, noInterrupt: null,
      callbacks: [], verticalMotion: true };
    const read = new TraversalShapes();
    read.set([own], new Map([[TRAVERSAL_CLIP.ladder, record]]));
    expect(read.has(TRAVERSAL_CLIP.ladder)).toBe(true);
    expect(read.ladderClimb().scale).toBeCloseTo(1.77778, 4);
    expect(read.ladderClimb().keysPerSecond * read.ladderClimb().perKey).toBeCloseTo(13.5, 3);
  });
});

describe('movement.peek: the peek\'s camera and the lean clips (research 86 sections 4.1-4.2)', () => {
  it('the target shifts 2.5 to the left and 2.8 to the right (FUN_0029a950); the eye camera 3.3 and 4.35 (FUN_0029ae50)', () => {
    expect(peekShift(-1)).toBe(-2.5);
    expect(peekShift(1)).toBeCloseTo(2.8, 12);
    expect(peekShift(0.5)).toBeCloseTo(1.4, 12);
    expect(scopePeekShift(-1)).toBeCloseTo(-3.3, 12);
    expect(scopePeekShift(1)).toBeCloseTo(4.35, 12);
  });

  it('the lean clips by stance and side, and the ripples\' zAnim names (FUN_0057d810, FUN_0026a250)', () => {
    expect([leanClip('stand', -1), leanClip('stand', 1), leanClip('crouch', -1), leanClip('prone', 1)])
      .toEqual(['seal_stand2llean', 'seal_stand2rlean', 'seal_crouch2llean', 'seal_prone2rlean']);
    expect(rippleAnimation({ size: 'big', pace: 'anim' })).toBe('big_ripple_anim');
    expect(rippleAnimation({ size: 'big', pace: 'walk' })).toBe('big_ripple_anim_walk');
    expect(rippleAnimation({ size: 'small', pace: 'run' })).toBe('small_ripple_anim_run');
  });
});

describe('movement.traversal: the stand-in clip shapes before the pack arrives (research 86 section 1\'s table)', () => {
  it('the climbs\' stand-ins carry the table\'s keys, seconds, root, rise and travel: crate, medium, step up, hang, over', () => {
    const shapes = new TraversalShapes();
    const row = (n: string): number[] => {
      const s = shapes.get(n), t = shapeTravel(s);
      return [s.keys, s.root[1]!, t.rise, t.ahead];
    };
    const near = (a: number[], b: number[]): void => { for (let i = 0; i < b.length; i++) expect(a[i]).toBeCloseTo(b[i]!, 2); };
    near(row(TRAVERSAL_CLIP.climbLow), [30, 11.52, 12.88, 11.34]);
    near(row(TRAVERSAL_CLIP.climbMed), [32, 11.52, 21.48, 11.44]);
    near(row(TRAVERSAL_CLIP.toHang), [25, 11.52, 6.81, 3.49]);
    near(row(TRAVERSAL_CLIP.over), [19, 10.96, -0.96, 16.28]);
    near(row(TRAVERSAL_CLIP.toLadder), [27, 11.78, 3.52, 6.73]);
    // a one-shot's stand-in runs playback x ((n-1)/n)^2: seal_climbcrate 1.25 over 30 keys is 1.168 s (research 86 section 1.1)
    expect(shapes.get(TRAVERSAL_CLIP.climbLow).seconds).toBeCloseTo(1.168, 3);
  });

  // DRIFT (TA.R6): research 86 section 1's table [data] gives `seal_hang2climbup` a rise of +22.59 and 5.24 ahead (MOTION_P.ZAR
  // agrees: 22.590 and 5.238); the stand-in FALLBACK in traversal.ts carries 22.56 and 5.1. It is used only before the
  // pack arrives (a named placeholder shape), so the pull-up's path differs by 0.14 ahead until the clips load.
  it.fails('drift: the hang\'s pull-up stand-in rises 22.59 and goes 5.24 ahead, as the table has seal_hang2climbup', () => {
    const t = shapeTravel(new TraversalShapes().get(TRAVERSAL_CLIP.hangUp));
    expect(t.rise).toBeCloseTo(22.59, 2);
    expect(t.ahead).toBeCloseTo(5.24, 2);
  });
});

// ---- the clip names on the disc (fixture tier) ---------------------------------------------------------------------

const here = dirname(fileURLToPath(import.meta.url));
const PACK = resolve(process.env.S2U_TEST_FIXTURES || resolve(here, '../../../test-fixtures'), 'RUN', 'MOTION_P.ZAR');
const noPack = !existsSync(PACK);
const packNames = (): Set<string> => {
  const names = new Set<string>();
  const walk = (k: { name?: string; children?: unknown[] }): void => {
    if (k.name) names.add(k.name);
    for (const c of (k.children ?? []) as { name?: string; children?: unknown[] }[]) walk(c);
  };
  walk(Zar.parse(new Uint8Array(readFileSync(PACK))).root as { name?: string; children?: unknown[] });
  return names;
};

describe.skipIf(noPack)(`movement.traversal: the clips the moves play are MOTION_P.ZAR's${noPack ? ' (data absent)' : ''}`, () => {
  it('every TRAVERSAL_CLIP but the right lean\'s step is a clip in MOTION_P.ZAR', () => {
    const names = packNames();
    for (const [k, n] of Object.entries(TRAVERSAL_CLIP)) if (k !== 'rleanStep') expect(names.has(n), `${k}: ${n}`).toBe(true);
  });

  // DRIFT (TA.R6): research 86 section 1 lists the step while leaning as `seal_llean_rstep` / `seal_p_rlean_rstep` (the
  // pistol's); TRAVERSAL_CLIP.rleanStep names `seal_rlean_rstep`, which MOTION_P.ZAR does not hold. The clip is only
  // requested, never played, so nothing moves differently; the name is wrong. Not fixed here (TA.R6).
  it.fails('drift: TRAVERSAL_CLIP.rleanStep (seal_rlean_rstep) is a clip in MOTION_P.ZAR', () => {
    expect(packNames().has(TRAVERSAL_CLIP.rleanStep)).toBe(true);
  });
});

// ---- NU-1c B11: the pistol-holder's cut (research 313 section 3, D11) ---------------------------------------------

/**
 * NU-1c B11 (research 313 sections 3, 8.1 and 8.6, its D11; `PISTOL_CLIMB_CLIPS_READING`): the pistol's version of a
 * one-shot's node is a sub-node `FUN_0057a330` hangs at the node's `+0x10` each tick (D:L438711-438772, through
 * `FUN_0058c9e0` on the hand `+0xf79` = 2 the pistol, D:L462189-462191; `FUN_0028bdd0` D:L133953-133962), and
 * `FUN_00587c20` walks the play's first node and that chain, the last deciding (`FUN_005780e0` D:L437475-437489, then
 * `+0x10`, D:L445551-445565) -- so a pistol-holder's climb is cut on the pistol clip's `NoInterrupt`, where the Seal anim
 * set holds one: the crate's 1 (never cut, the blend's first node the crate's, D:L442323-442333), the medium's, the hang's
 * and the pull-up's the rifle's; no `Pistol step up` or `Pistol climb over` in the set, so the rifle's clip alone.
 */
describe("movement.climb: NU-1c B11 -- the pistol-holder's cut reads the pistol clip's NoInterrupt (research 313 section 3)", () => {
  const quad = (pts: number[], ditype: number, appflags = 0): WorldPoly => ({
    modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype, material: 25, ptcount: 4, cameratype: 0, appflags, points: Float32Array.from(pts),
  });
  const floor = (x0: number, z0: number, x1: number, z1: number, y: number): WorldPoly => quad([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1], 3);
  /** The 0 floor and a box x -10..10, z -30..0 (or -2..0 for a wall to climb over), `h` tall, its sides of `app`. */
  function boxWorld(h: number, app: number): { grid: Grid; polys: WorldPoly[] } {
    const z0 = app === 5 ? -2 : -30;
    const polys = [
      floor(-100, -100, 100, 100, 0),
      quad([-10, 0, 0, 10, 0, 0, 10, h, 0, -10, h, 0], 2, app), quad([-10, 0, z0, 10, 0, z0, 10, h, z0, -10, h, z0], 2, app),
      quad([-10, 0, z0, -10, 0, 0, -10, h, 0, -10, h, z0], 2, app), quad([10, 0, z0, 10, 0, 0, 10, h, 0, 10, h, z0], 2, app),
      ...(app === 5 ? [] : [floor(-10, z0, 10, 0, h)]),
    ];
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
    const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
    return { grid: buildGrid(params, [], [], polys, owners), polys };
  }
  const STILL: WalkInput = { forward: 0, right: 0, boost: false }, FORWARD: WalkInput = { forward: 1, right: 0, boost: false };
  /**
   * The commands from the clip's push (the press's own) until the climb's clip is off (the cut, or its end), the stick
   * held `forward` from the push, the weapon in hand `hand` (the pistol taken by `Walker.swapWeapon`, its clip played out).
   */
  function clipCommands(h: number, app: number, hand: 'rifle' | 'pistol', forward: WalkInput): number {
    const { grid, polys } = boxWorld(h, app);
    const w = new Walker(grid), t = new Traversal(grid, polys);
    w.driver = t;
    w.place(0, 10, 12);
    w.state.yaw = 0;
    w.tick(STILL);
    if (hand === 'pistol') {
      expect(w.swapWeapon('pistol')).not.toBeNull();
      for (let i = 0; i < 300 && w.action; i++) w.tick(STILL);
      expect(w.action).toBeNull();
    }
    for (let i = 0; i < 120 && t.climbPrompt() === null; i++) w.tick(FORWARD);
    expect(t.climbPrompt(), `h ${h} app ${app}`).not.toBeNull();
    t.action();
    w.tick(STILL);                                                         // the press's command: the clip pushed
    expect(t.state().kind).toBe('climb');
    let n = 0;
    while (t.state().kind === 'climb' && n < 400) { w.tick(forward); n++; }
    return n;
  }

  it("PISTOL_CLIMB_CLIPS / PISTOL_CLIMB_NO_INTERRUPT: the Seal anim set's pistol climb clips and motion.rdr's NoInterrupt, as the golden holds it", () => {
    const golden = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'golden/motion-rdr.json'), 'utf8')) as { columns: string[]; entries: unknown[][] };
    const at = golden.columns.indexOf('NoInterrupt');
    const row = (name: string): number => golden.entries.find((e) => e[0] === name)![at] as number;
    expect(PISTOL_CLIMB_CLIPS_READING).toBe('sub-node');
    expect({ ...PISTOL_CLIMB_CLIPS }).toEqual({
      seal_climbcrate: 'seal_p_climbcrate', seal_climb_medium: 'seal_p_climb_medium', seal_stand2hang: 'seal_p_stand2hang', seal_hang2climbup: 'seal_p_hang2climbup',
    });
    for (const p of Object.values(PISTOL_CLIMB_CLIPS)) expect(PISTOL_CLIMB_NO_INTERRUPT[p], p).toBe(row(p));
    expect(PISTOL_CLIMB_NO_INTERRUPT.seal_p_climbcrate).toBe(1);           // never cut: phase stops at (n - 1) / n
  });

  it('the cut with the pistol in hand, per climb clip: the crate and the blend never cut; the medium, the hang, the step-up and the climb over cut as the rifle\'s', () => {
    const full = clipCommands(12, 4, 'rifle', STILL);
    expect(clipCommands(12, 4, 'rifle', FORWARD)).toBeLessThan(full);      // the rifle's crate: cut past 0.9
    expect(clipCommands(12, 4, 'pistol', FORWARD), 'crate').toBe(full);    // RED before B11: cut as the rifle's
    expect(clipCommands(18, 1, 'pistol', FORWARD), 'blend (the crate first)').toBe(clipCommands(18, 1, 'rifle', STILL));
    expect(clipCommands(18, 1, 'rifle', FORWARD)).toBeLessThan(clipCommands(18, 1, 'rifle', STILL));
    for (const [h, app, label] of [[27, 3, 'medium'], [30, 1, 'stand -> hang'], [8, 1, 'step up'], [10, 5, 'climb over']] as const) {
      const rifle = clipCommands(h, app, 'rifle', FORWARD);
      expect(rifle, `${label}: the rifle's cut`).toBeLessThan(clipCommands(h, app, 'rifle', STILL));
      expect(clipCommands(h, app, 'pistol', FORWARD), label).toBe(rifle);
    }
  });
});

const READERC = resolve(process.env.S2U_TEST_FIXTURES || resolve(here, '../../../test-fixtures'), 'RUN', 'READERC.ZAR');
const noReaderc = !existsSync(READERC);

describe.skipIf(noReaderc)(`movement.climb: NU-1c B11 -- the pistol climb clips are the Seal anim set's (animset.rdr)${noReaderc ? ' (data absent)' : ''}`, () => {
  it("animset.rdr's Seal anim set maps Pistol climb crate / medium / stand -> Hang / hang -> Climb to PISTOL_CLIMB_CLIPS, and holds no Pistol step up or Pistol climb over", () => {
    const zar = Zar.parse(new Uint8Array(readFileSync(READERC)));
    const root = parseRdr(zar.data(zar.find('animset.rdr')!));
    const flat = (n: RdrNode): RdrNode[] => (Array.isArray(n) && n.length === 1 && Array.isArray(n[0]) ? flat(n[0]) : n as RdrNode[]);
    const sets = flat(root);
    const byName = (n: string): RdrNode => sets.find((s) => rdrGet(s, 'anim_set_name') === n)!;
    const types = new Map<string, string>();
    const add = (set: RdrNode): void => {
      for (const a of rdrGet(set, 'anim_set_anims') as RdrNode[]) {
        const type = rdrGet(a, 'type_name'), clip = rdrGet(a, 'anim_name');
        if (typeof type === 'string' && typeof clip === 'string' && !types.has(type)) types.set(type, clip);
      }
    };
    const seal = byName('Seal anim set');
    add(seal);
    for (const inc of rdrGet(seal, 'include') as string[]) add(byName(inc));
    const pairs: [string, string][] = [['Climb crate', 'Pistol climb crate'], ['Climb medium', 'Pistol climb medium'], ['Stand -> Hang', 'Pistol stand -> Hang'], ['Hang -> Climb', 'Pistol hang -> Climb']];
    for (const [rifle, pistol] of pairs) expect(PISTOL_CLIMB_CLIPS[types.get(rifle)!], rifle).toBe(types.get(pistol));
    expect(types.get('Step up')).toBe('seal_step_up');
    expect(types.get('Climb over')).toBe('seal_climb_over');
    expect(types.has('Pistol step up')).toBe(false);
    expect(types.has('Pistol climb over')).toBe(false);
  });
});

// ---- NU-1c B12: the top's floor, a census of the fixture maps' class-4 faces (research 313 section 8.6, D12) ---------

const FIXTURE_MAPS = ['RUN/MP2.ZDB', 'RUN/MP6.ZDB', 'RUN/MP72.ZDB'] as const;
const FIXTURE_ROOT = resolve(process.env.S2U_TEST_FIXTURES || resolve(here, '../../../test-fixtures'));
const noMaps = FIXTURE_MAPS.some((m) => !existsSync(resolve(FIXTURE_ROOT, m)));

/**
 * NU-1c B12 (research 313 sections 1.2, 7 and 8.6, its D12; `CLIMB_TOP_FLOOR_READING`): the port's `topFloor` gate (a
 * floor within 1.5 of the top, 4 past the edge) has no counterpart -- `FUN_005b3ce0` offers a class-4 face by its height
 * (D:L469246-469285) and `FUN_005b2620` pushes it (D:L468420-468504), the end settling on the floor pick. The census: each
 * class-4 wall face of the fixture maps (one-sided, its normal horizontal), stood 3.75 in front of its middle on the
 * highest floor under its top less 5 (and not 2 under its bottom), its height's class by `FUN_00580b70`'s table; whether
 * `topFloor` finds a floor at the edge's middle, 4 past it. A scratch survey of the six served maps (2026-10-17, NU-1c
 * step 1) found the same rule refusing 2 of MP2's 294 faces in the table, 1 of MP51's 13, MP62's 1 of 1, 1 of MP64's 7,
 * none of MP71's 21 or MP72's 10, and 10 of MP6's 59 (the fixture). Dropped, each is offered: the plan stands.
 *
 * LATER 111 (research 313 section 8.8) re-measured it: the top is the column's at the face's middle and the edge the cut
 * at the middle of that column, so the sloped faces count differently -- MP2's `container_blue01` faces (2) now find the
 * top's floor (the edge was its high vertex, 129.99), MP72's `wc15/climber13` (its column 53.5 at the middle) no longer
 * does, and two of MP6's sloped faces leave the table -- `firstwall_climber1` and `garage_wall` (the hull's polygons 2464
 * and 2470, their indices in `groundPolygons`): no floor between the column's bottom - 2 and its top - 5 in front of them
 * -- while MP6's refused 10 swap one face: `wall_low3` (2413) is refused now, `firstwall_climber1` (2462) no longer
 * (counts reproduced by the review's own scratch). *Was:* MP2 2 of 294, MP6 10 of 59, MP72 0 of 10. Each refused face is
 * still offered.
 */
describe.skipIf(noMaps)(`movement.climb: NU-1c B12 -- the top's floor gate dropped, its census on the fixture maps' class-4 faces${noMaps ? ' (data absent)' : ''}`, () => {
  it('MP2 0 of 294, MP6 10 of 57, MP72 1 of 10 class-4 faces in the table have no floor within 1.5 of the column top 4 past the cut; each is offered now', async () => {
    const counts: Record<string, [number, number]> = {};
    for (const path of FIXTURE_MAPS) {
      const map = await loadMap(new FsAssetSource(FIXTURE_ROOT), path);
      const grid = groundGrid(map.ground!), polys = groundPolygons(map.ground!);
      let inTable = 0, refused = 0;
      for (const p of polys) {
        if ((p.appflags ?? 0) !== 4) continue;
        const n = polygonNormal(p.points);
        if (!n) continue;
        const hz = Math.hypot(n[0], n[2]);
        if (hz < 0.7) continue;
        const count = p.points.length / 3;
        let cx = 0, cz = 0;
        for (let i = 0; i < count; i++) { cx += p.points[i * 3]!; cz += p.points[i * 3 + 2]!; }
        cx /= count; cz /= count;
        const nx = n[0] / hz, nz = n[2] / hz, fx = cx + nx * 3.75, fz = cz + nz * 3.75;
        const c = contactOf(p, 4, fx, fz);
        if (!c) continue;
        const floors = probeGround(grid, fx, fz).map((h) => h.y).filter((y) => y <= c.top - 5 + 1e-6 && y >= c.bottom - 2);
        if (!floors.length) continue;
        const y = Math.max(...floors);
        const cls = climbClass(c.top + footStepOffset(p.material) - y, 4);
        if (!cls || cls.kind === 'over') continue;
        inTable++;
        const [ax, az, bx, bz] = c.edge!;
        if (topFloor(grid, [(ax + bx) / 2, c.top, (az + bz) / 2], c) !== null) continue;
        refused++;
        // Dropped: the face is offered from in front of it, facing it (RED before B12: planClimb refused it on its top).
        expect(planClimb(grid, c, fx, y, fz, -nx, -nz), `${path} ${p.path}`).not.toBeNull();
      }
      counts[path] = [refused, inTable];
    }
    expect(counts).toEqual({ 'RUN/MP2.ZDB': [0, 294], 'RUN/MP6.ZDB': [10, 57], 'RUN/MP72.ZDB': [1, 10] });   // LATER 111; was [2, 294], [10, 59], [0, 10]
    expect(CLIMB_TOP_FLOOR_READING).toBe('dropped');
  });
});

// ---- LATER 111: the top at the hit's column, on the fixture maps' sloped faces (research 313 section 8.8) -------------

/**
 * LATER 111 (research 313 section 8.8; reading, pending review): the original takes a climb face's top at the hit's
 * column -- `FUN_002dbfb0` (D:L180183-180212) -> `FUN_002dd4d0` (D:L180890-180956) / `FUN_002dd690` (D:L180962-181050):
 * each edge's point at the hit's projection on it in xz, kept only strictly inside the edge, the highest -- and the
 * push's target on the polygon's cut at the hit's height (`FUN_002dc090` -> `FUN_002dd2b0`, D:L180803-180885), placed
 * by `FUN_005b3a60` (D:L469016-469080), its y the column top (`FUN_005b1a10` D:L467887). The port took the polygon's
 * highest point and its top edge. Three real faces whose top slopes, each stood 3.75 in front of a column on the
 * highest floor between the column's bottom - 2 and its top - 5 (LATER 111's census), facing it; the offer as
 * `Traversal.keepContact` runs it (the obstacle ray, then `planClimb`).
 */
describe.skipIf(noMaps)(`movement.climb: LATER 111 -- the top at the hit's column on the fixtures' sloped faces${noMaps ? ' (data absent)' : ''}`, () => {
  const maps = new Map<string, Promise<{ grid: Grid; polys: WorldPoly[] }>>();
  const mapOf = (path: string): Promise<{ grid: Grid; polys: WorldPoly[] }> => {
    let m = maps.get(path);
    if (!m) {
      m = loadMap(new FsAssetSource(FIXTURE_ROOT), path).then((map) => ({ grid: groundGrid(map.ground!), polys: groundPolygons(map.ground!) }));
      maps.set(path, m);
    }
    return m;
  };
  /** The class-4 wall faces of `node` `width` wide and `max` high at their highest point (within 0.05), whose top is not level (its vertices within 0.01 of the highest span under the width less 0.5). */
  const facesOf = (polys: WorldPoly[], node: string, width: number, max: number): { p: WorldPoly; nx: number; nz: number; flo: number; plane: number }[] => {
    const out: { p: WorldPoly; nx: number; nz: number; flo: number; plane: number }[] = [];
    for (const p of polys) {
      if (p.path !== node || (p.appflags ?? 0) !== 4) continue;
      const n = polygonNormal(p.points);
      if (!n || Math.hypot(n[0], n[2]) < 0.7) continue;
      const hz = Math.hypot(n[0], n[2]), nx = n[0] / hz, nz = n[2] / hz, count = p.points.length / 3;
      let flo = Infinity, fhi = -Infinity, top = -Infinity;
      for (let i = 0; i < count; i++) {
        const a = -nz * p.points[i * 3]! + nx * p.points[i * 3 + 2]!;
        flo = Math.min(flo, a); fhi = Math.max(fhi, a); top = Math.max(top, p.points[i * 3 + 1]!);
      }
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < count; i++) {
        if (top - p.points[i * 3 + 1]! > 0.01) continue;
        const a = -nz * p.points[i * 3]! + nx * p.points[i * 3 + 2]!;
        lo = Math.min(lo, a); hi = Math.max(hi, a);
      }
      if (Math.abs(fhi - flo - width) < 0.05 && Math.abs(top - max) < 0.05 && hi - lo < fhi - flo - 0.5) out.push({ p, nx, nz, flo, plane: nx * p.points[0]! + nz * p.points[2]! });
    }
    return out;
  };
  /** The offer from 3.75 in front of the column `a` along the face, on the floor at `feet` (asserted), facing it. */
  const offerAt = (grid: Grid, f: { p: WorldPoly; nx: number; nz: number; flo: number; plane: number }, a: number, feet: number) => {
    const { p, nx, nz, plane } = f, along = f.flo + a;
    const x = nx * plane - nz * along, z = nz * plane + nx * along;
    const fx = x + nx * 3.75, fz = z + nz * 3.75;
    expect(probeGround(grid, fx, fz).some((h) => Math.abs(h.y - feet) < 0.01), `${p.path}: a floor at ${feet}`).toBe(true);
    const c = contactOf(p, 4, fx, fz)!;
    const plan = planClimb(grid, obstacleRay(grid, c, fx, feet, fz) ?? c, fx, feet, fz, -nx, -nz);
    return { plan, x, z };
  };

  it("MP6 garage_wall (its top 0.37 to 30 across 3.99): at the column where it stands 19.38 over the floor at 0, 'med' (RED: 'high', the polygon's 30)", async () => {
    const { grid, polys } = await mapOf('RUN/MP6.ZDB');
    const [f, ...rest] = facesOf(polys, 'worldmodel/garage_wall', 3.99, 30);
    expect(rest).toEqual([]);
    const { plan } = offerAt(grid, f!, 1.62, 0);
    expect(plan?.kind).toBe('med');
    expect(plan!.h).toBeCloseTo(19.38, 1);
  });

  it("MP72 wc15/climber13 (its top 49.56 to 57.44 across 1.95): at the column where it stands 8.75 over the floor at 42.5, the automatic step-up (RED: 'low', the polygon's 57.5)", async () => {
    const { grid, polys } = await mapOf('RUN/MP72.ZDB');
    const [f, ...rest] = facesOf(polys, 'worldmodel/wc15/climber13', 1.95, 57.5);
    expect(rest).toEqual([]);
    const { plan } = offerAt(grid, f!, 1.52, 42.5);
    expect(plan?.kind).toBe('step');
    expect(plan?.automatic).toBe(true);
    expect(plan!.h).toBeCloseTo(8.75, 1);
  });

  it("MP2 container_blue01 (40.76 wide, its top 129 to 129.99 along it): mid-face the target is the hit's own point at the column top (FUN_005b3a60: both ends 3 or more away), not the high corner (RED: about 20 off)", async () => {
    const { grid, polys } = await mapOf('RUN/MP2.ZDB');
    const faces = facesOf(polys, 'worldmodel/container_blue01=container_blue01/climb', 40.76, 129.99);
    expect(faces.length).toBe(2);
    for (const f of faces) {
      const { plan, x, z } = offerAt(grid, f, 40.76 / 2, 100);
      expect(plan?.kind).toBe('high');
      expect(Math.hypot(plan!.target[0] - x, plan!.target[2] - z), f.p.path).toBeLessThan(0.05);
      expect(Math.abs(plan!.target[1] - 129.49)).toBeLessThan(0.1);
    }
  });
});

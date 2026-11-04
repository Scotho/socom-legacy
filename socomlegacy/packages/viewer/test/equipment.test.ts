import { describe, expect, it } from 'vitest';
import {
  buildGrid, CLAYMORE, EMPTY_ITEM, HE, ITEM, M67, MATERIAL_WATER, type GridParams, type KitTable, type Loadout, type ThrowableRecord, type V3,
  type WorldPoly,
} from '@s2u/scene';
import { fixture } from '../../archive/test/fixtures';
import {
  ACTION_RANGE_DEFAULT, C4_AIM_SETTLE_S, C4_PLANT_CLIP, C4_PLANT_SECONDS, C4_PLANT_TRIGGER, C4_REACH_READING, C4_REFUSED_MATERIAL, C4Settle,
  EQUIPMENT_SLOTS, LAUNCHER_RAISE_CLIPS, backblastReaches, launcherLowerSeconds, launcherRaiseFrom, launcherRaiseSeconds, c4PlantAllowed, c4PlantSeconds, c4TargetOf, equipmentKind, pouchOf, rocketLaunch, rocketRoundOf,
  LAUNCHER_BODY_READING, slotSelectable, throwableOf, wadingDepth,
} from '../src/equipment';
import { clipsFromPack, motionTableFromArchive } from '../src/motionTable';

const READERC = fixture('RUN/READERC.ZAR');
const MOTION = fixture('RUN/MOTION_P.ZAR');

/**
 * The equipment's shared rules (web sprint 4, M7; `../src/equipment`): the slots, `FUN_005bdc30`'s gate, the pouch the
 * loadout carries, C4's targets and plant, the rockets' launch and the backblast's cone.
 */

const kit = (...ids: number[]): Loadout => ids as unknown as Loadout;
const ctx = (over: Partial<{ claymoresDown: number; rounds: number }> = {}) => ({
  claymoresDown: over.claymoresDown ?? 0, roundsFor: () => over.rounds ?? 0,
});

describe('the equipment slots (W4.R5) and FUN_005bdc30\'s gate', () => {
  it('are the kit\'s slots 2-4, in kit order', () => {
    expect([...EQUIPMENT_SLOTS]).toEqual([2, 3, 4]);
  });

  it.each([
    // item, its kind, selectable with nothing down / no rounds, and with a charge down and a round held
    ['M67', 121, 'throwable', true, true],
    ['AN-M8', 122, 'throwable', true, true],
    ['Claymore', 153, 'placed', true, true],
    ['PMN Mine', 158, 'placed', true, true],
    ['C4 (planted by Action)', 151, 'c4', false, false],
    ['LAW', 145, 'launcher', false, true],
    ['RPG-7', 146, 'launcher', false, true],
    ['LAW HEAT (a round)', 185, 'round', false, false],
    ['M203 FRAG (a round)', 175, 'round', false, false],
    ['Detonator', 193, 'detonator', false, true],
    ['2X (0xc2)', 194, 'gear', false, false],
    ['thermal scope (0xc3)', 195, 'gear', false, false],
    ['an empty slot', EMPTY_ITEM, 'none', false, false],
  ] as const)('%s', (_what, id, kind, bare, armed) => {
    expect(equipmentKind(id)).toBe(kind);
    expect(slotSelectable(id, ctx())).toBe(bare);
    expect(slotSelectable(id, ctx({ claymoresDown: 1, rounds: 1 }))).toBe(armed);
  });

  it('the rockets\' rounds: the LAW its LAW HEAT, the RPG-7 its RPG', () => {
    expect([rocketRoundOf(ITEM.LAW), rocketRoundOf(ITEM.RPG7), rocketRoundOf(ITEM.M79)]).toEqual([ITEM.LAW_HEAT, ITEM.RPG_ROUND, null]);
  });
});

describe('the pouch follows the loadout (retires POUCH_PLACEHOLDER)', () => {
  const pmn: ThrowableRecord = { ...CLAYMORE, name: 'PMN Mine', id: 158, fuse: 8, proximity: 10 };
  const table = { throwables: new Map([[158, { record: pmn, piercing: 0 }]]) } as unknown as KitTable;

  it.each([
    ['mp_seal1: M67, HE, 2X', kit(54, 15, 121, 126, 194), null, { M67: 3, HE: 3 }],
    ['two M67 slots: six', kit(54, 15, 121, 121, 255), null, { M67: 6 }],
    ['the claymore\'s four', kit(106, 15, 121, 153, 255), null, { M67: 3, Claymore: 4 }],
    ['a PMN off the kit table', kit(81, 7, 121, 122, 158), table, { M67: 3, 'AN-M8': 3, 'PMN Mine': 4 }],
    ['a LAW and its round carry no pouch', kit(54, 15, 145, 185, 121), null, { M67: 3 }],
  ] as const)('%s', (_what, loadout, t, want) => {
    expect(pouchOf(loadout, t)).toEqual(want);
  });

  it('a record is the kit table\'s, else the baked one', () => {
    expect(throwableOf(null, 121)).toBe(M67);
    expect(throwableOf(null, 126)).toBe(HE);
    expect(throwableOf(table, 158)).toBe(pmn);
    expect(throwableOf(null, 158)).toBeNull();
  });
});

describe('C4 (research 94 §C5.1, SUP-03, PF-13): a timed charge planted on the scene destructible under the reticle, settled, in reach', () => {
  /**
   * The scene's health as `SceneHealth` answers C4 (`FUN_002739b0`: health above 0, shield at most the charge's damage):
   * a Vigilance barrier (1/17) at x 100, a Crossroads base (2/21) at x 300, a spent barrier (0/17) at x 500; the
   * type-less action `access_action1` beside the barrier is nobody's target.
   */
  const blocks = [
    { id: 0, path: 'worldmodel/access1=access1/good_parts/di_good', x: 100, hp: 1, shield: 17 },
    { id: 1, path: 'worldmodel/terrorist_base/healthy/basedi', x: 300, hp: 2, shield: 21 },
    { id: 2, path: 'worldmodel/access2=access2/good_parts/di_good', x: 500, hp: 0, shield: 17 },
  ];
  const accepts = (b: (typeof blocks)[number], damage: number): boolean => b.hp > 0 && b.shield <= damage;
  const health = {
    c4TargetAt: (path: string, damage: number): number | null => {
      const b = blocks.find((x) => path === x.path || path.startsWith(`${x.path}/`));
      return b && accepts(b, damage) ? b.id : null;
    },
  };
  const aim = (path: string, x: number): { path: string; point: V3 } => ({ path, point: [x, 20, 0] });

  it("C4 targets are the health-bound destructibles the charge's 18 qualifies for (FUN_002739b0), never actions.rdr's type-less records: C4_TARGET_READING retired", () => {
    const feet: V3 = [90, 0, 0];
    expect(c4TargetOf(health, aim(blocks[0]!.path, 100), feet, 18)).toBe(0);          // the barrier: 17 <= 18
    expect(c4TargetOf(health, aim('worldmodel/access1=access1/access_action1', 100), feet, 18)).toBeNull();   // the action: no block
    expect(c4TargetOf(health, aim(blocks[1]!.path, 100), feet, 18)).toBeNull();        // the base: 21 > 18
    expect(c4TargetOf(health, aim(blocks[1]!.path, 100), feet, 50)).toBe(1);          // the bomb's 50 would take it
    expect(c4TargetOf(health, aim(blocks[2]!.path, 100), feet, 18)).toBeNull();        // spent: health 0
    expect(c4TargetOf(health, null, feet, 18)).toBeNull();                              // the reticle on nothing
  });

  it.each([
    ['at the barrier', [90, 0, 0], 0],
    ['the hit 32 along the ground (C4_REACH_READING, strict): refused', [68, 0, 0], null],
    ['the hit 31 along the ground, 40 below: taken (no height test)', [69, -40, 0], 0],
  ] as const)('%s', (_what, feet, want) => {
    expect(C4_REACH_READING).toBe(ACTION_RANGE_DEFAULT);
    expect(c4TargetOf(health, aim(blocks[0]!.path, 100), feet, 18)).toBe(want);
  });

  it('the plant needs the target settled 0.2 s under the reticle (kit +0x8a4, FUN_005be6f0 D:L475130-475197) and its surface not INVISIBLE_DI (005c1970): c4PlantAllowed', () => {
    expect(Math.fround(C4_AIM_SETTLE_S)).toBe(Math.fround(0.2));                          // 0x3e4ccccd
    expect(C4_REFUSED_MATERIAL).toBe('INVISIBLE_DI');
    expect(c4PlantAllowed({ target: 0, settledFor: 0.2, material: 'METAL_THICK' })).toBe(true);
    expect(c4PlantAllowed({ target: 0, settledFor: 0.19, material: 'METAL_THICK' })).toBe(false);
    expect(c4PlantAllowed({ target: null, settledFor: 5, material: 'METAL_THICK' })).toBe(false);
    expect(c4PlantAllowed({ target: 0, settledFor: 5, material: 'INVISIBLE_DI' })).toBe(false);
    // A case-sensitive byte compare (00198f18): another spelling is another material, and the name requires nothing.
    expect(c4PlantAllowed({ target: 0, settledFor: 5, material: 'invisible_di' })).toBe(true);
    expect(c4PlantAllowed({ target: 0, settledFor: 5, material: 'INVISIBLE_DI ' })).toBe(true);
  });

  it("the settle restarts on no target, a new target, or the target moved (V1 #9, research 206 s1.2); the SEAL's own speed is never read (PF.R13)", () => {
    const poly = { points: Float32Array.from([100, 0, -10, 100, 0, 10, 100, 40, 10]) };
    const other = { points: Float32Array.from([300, 0, -10, 300, 0, 10, 300, 40, 10]) };
    const settle = new C4Settle();
    const steps = (n: number, target: number | null, p: { points: Float32Array } | null): number => {
      let t = 0;
      for (let i = 0; i < n; i++) t = settle.step(1 / 30, target, p);
      return t;
    };
    expect(steps(6, 0, poly)).toBeLessThan(C4_AIM_SETTLE_S);                             // the first frame sets it, five more count
    expect(settle.step(1 / 30, 0, poly)).toBeGreaterThanOrEqual(C4_AIM_SETTLE_S - 1e-9);  // the sixth: settled
    expect(settle.step(1 / 30, 1, other)).toBe(0);                                       // a new target: from nothing
    expect(steps(3, 1, other)).toBeCloseTo(0.1, 9);
    expect(settle.step(1 / 30, null, null)).toBe(0);                                     // the reticle on nothing
    steps(7, 0, poly);
    poly.points[0] = 100.5;                                                              // a pane on a swinging door
    expect(settle.step(1 / 30, 0, poly)).toBe(0);
    expect(steps(6, 0, poly)).toBeGreaterThanOrEqual(C4_AIM_SETTLE_S - 1e-9);
    // Another polygon of the same target node, the node still: the clock runs on.
    const before = settle.step(1 / 30, 0, { points: Float32Array.from([102, 0, -10, 102, 0, 10, 102, 40, 10]) });
    expect(before).toBeGreaterThan(C4_AIM_SETTLE_S);
  });

  it.skipIf(!READERC || !MOTION)('the plant lands at 0.45 x 2.5 x 41/42 = 1.098 s of seal_put_onwall, from motion.rdr and MOTION_P.ZAR (C4_PLANT_TIME_READING retired)', () => {
    const table = motionTableFromArchive(READERC!)!;
    const clips = clipsFromPack(MOTION!, [C4_PLANT_CLIP]);
    expect(C4_PLANT_CLIP).toBe('seal_put_onwall');
    expect(table.get(C4_PLANT_CLIP)?.playback).toBe(2.5);
    expect(clips[0]?.frameCount).toBe(42);
    expect(Math.fround(C4_PLANT_TRIGGER)).toBe(Math.fround(0.45));                        // 0x3ee66666
    const seconds = c4PlantSeconds(table, clips)!;
    expect(seconds).toBeCloseTo(0.45 * 2.5 * (41 / 42), 12);
    expect(+seconds.toFixed(3)).toBe(1.098);
    expect(C4_PLANT_SECONDS).toBeCloseTo(seconds, 12);                                    // the page's, transcribed
    expect(c4PlantSeconds(table, [])).toBeNull();                                         // no clip: nothing read
  });
});

describe('the claymore and the PMN in water (PF-13; research 181 s6.2)', () => {
  it('the wading depth is the water line over the feet (probeWater, FUN_005b52b0), 0 out of the water', () => {
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
    const q = (y: number, material: number, path: string): WorldPoly => ({
      modelName: 'worldmodel', path, region: 0, ditype: 3, material, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-100, y, -100, 100, y, -100, 100, y, 100, -100, y, 100]),
    });
    const polys = [q(0, 7, 'worldmodel/floor'), q(5, MATERIAL_WATER, 'worldmodel/pool')];
    const grid = buildGrid(params, [], [], polys, polys.map((p, i) => ({ modelName: 'worldmodel', path: p.path, first: i, count: 1 })));
    expect(wadingDepth(grid, [0, 0, 0])).toBeCloseTo(5, 6);
    expect(wadingDepth(grid, [0, 1.5, 0])).toBeCloseTo(3.5, 6);
    expect(wadingDepth(grid, [0, 6, 0])).toBe(0);                                         // over the water
    expect(wadingDepth(grid, [500, 0, 500])).toBe(0);                                     // no water there
  });
});

describe('PF-37: the rocket launcher in water (research 236 s3; research 181 s2.6)', () => {
  it("the rocket launcher cannot be taken up wading deeper than 8.5 units (FUN_005857e0 D:L444332-444360: +0xf88 <= 8.5 with bit 7 of +0x105e; LAUNCHER_BODY_READING): depth 9 refused, 8 allowed, 0 out of the water; a context without a depth reads 0", () => {
    expect(LAUNCHER_BODY_READING).toEqual({ maxWadingDepth: 8.5 });
    const at = (depth: number | null, rounds = 1) => ({ claymoresDown: 0, roundsFor: () => rounds, ...(depth === null ? {} : { wadingDepth: () => depth }) });
    for (const id of [ITEM.LAW, ITEM.RPG7]) {
      expect(slotSelectable(id, at(9)), `${id} at 9`).toBe(false);
      expect(slotSelectable(id, at(8.5)), `${id} at 8.5`).toBe(true);                      // <= 8.5 passes
      expect(slotSelectable(id, at(8)), `${id} at 8`).toBe(true);
      expect(slotSelectable(id, at(0)), `${id} out of the water`).toBe(true);
      expect(slotSelectable(id, at(null)), `${id} with no depth`).toBe(true);
      expect(slotSelectable(id, at(0, 0)), `${id} with no round`).toBe(false);
    }
    // The other kinds never read the water here (their own rules: the claymore's 3.2, PF-13).
    expect(slotSelectable(121, at(30))).toBe(true);
    expect(slotSelectable(ITEM.CLAYMORE, at(30))).toBe(true);
  });
});

describe('the rockets (research 94 §C4.3-§C4.4)', () => {
  const heat: ThrowableRecord = { ...M67, name: 'LAW HEAT', id: 185, muzzleVelocity: 200, acceleration: 980, armingDistance: 100, impact: true, hasBackblast: true, explosionRadius: 150 };

  it('leave straight at the aimed point at the round\'s Muzzle_Velocity (no loft), the backblast backwards from the muzzle', () => {
    const out = rocketLaunch(heat, [0, 20, 0], [1000, 20, 0]);
    expect(out.dir).toEqual([1, 0, 0]);
    expect(out.velocity).toEqual([200, 0, 0]);
    expect(out.backblast).toEqual({ pos: [0, 20, 0], dir: [-1, -0, -0] });
  });

  it.each([
    ['behind the shooter, 3 m', [-30, 20, 0], true],
    ['behind, 20 degrees off', [-30, 20 + 30 * Math.tan(0.35), 0], true],
    ['beside the shooter (90 degrees)', [0, 20, 30], false],
    ['in front of the shooter', [30, 20, 0], false],
    ['behind past 7 m', [-71, 20, 0], false],
  ] as const)('the backblast\'s cone (6 in 7 m, 45 degrees): %s', (_what, point, reaches) => {
    const { backblast } = rocketLaunch(heat, [0, 20, 0], [1000, 20, 0]);
    expect(backblastReaches(backblast.pos, backblast.dir, point, 70)).toBe(reaches);
  });
});

// PF-21 (research 179 s11.15, research 217 s4; ruling PF.R45): `FUN_005a6d30` raises the launcher in its anim set
// (`DAT_0044d408`) with `Rifle -> Launcher` from the rifle and `Pistol -> Launcher` from the pistol; `FUN_005a6b70`
// lowers it with the same clip reversed (its 4th argument 1). Their lengths by the one-shot's law (`FUN_0028c4f0`).
describe('the launcher raise (FUN_005a6d30) and lower (FUN_005a6b70)', () => {
  it('launcherRaiseSeconds is the one-shot of 1.5 over 35 keys from the rifle and 24 from the pistol; the lower the same (no disc)', () => {
    expect(LAUNCHER_RAISE_CLIPS.rifle).toEqual({ clip: 'seal_rifle2launcher', playback: 1.5, frames: 35 });
    expect(LAUNCHER_RAISE_CLIPS.pistol).toEqual({ clip: 'seal_pistol2launcher', playback: 1.5, frames: 24 });
    expect(launcherRaiseSeconds(0)).toBeCloseTo(1.5 * (34 / 35) ** 2, 12);
    expect(launcherRaiseSeconds(1)).toBeCloseTo(1.5 * (23 / 24) ** 2, 12);
    expect(launcherLowerSeconds(0)).toBe(launcherRaiseSeconds(0));
    expect(launcherLowerSeconds(1)).toBe(launcherRaiseSeconds(1));
  });

  it.skipIf(!READERC || !MOTION)("the launcher's raise is seal_rifle2launcher 1.4155 s from the rifle and seal_pistol2launcher 1.3776 s from the pistol (playback 1.5, 35 / 24 frames, FUN_005a6d30); the lower the same clip reversed, the same length", () => {
    const table = motionTableFromArchive(READERC!)!;
    const want = { 0: 1.4155, 1: 1.3776 } as const;
    for (const from of [0, 1] as const) {
      const c = from === 0 ? LAUNCHER_RAISE_CLIPS.rifle : LAUNCHER_RAISE_CLIPS.pistol;
      const [clip] = clipsFromPack(MOTION!, [c.clip]);
      expect(table.get(c.clip)?.playback, c.clip).toBe(c.playback);
      expect(clip?.frameCount, c.clip).toBe(c.frames);
      const disc = launcherRaiseFrom(table, [clip!], from)!;
      expect(disc, c.clip).toBeCloseTo(want[from], 4);
      expect(launcherRaiseSeconds(from)).toBeCloseTo(disc, 12);         // the page's and the room's, transcribed
      expect(launcherLowerSeconds(from)).toBe(launcherRaiseSeconds(from));   // FUN_005a6b70: the same clip reversed
    }
  });

  it.skipIf(!READERC || !MOTION)('the raise clips on the disc: motion.rdr flags both NoFire and NoInterrupt', () => {
    const table = motionTableFromArchive(READERC!)!;
    for (const c of [LAUNCHER_RAISE_CLIPS.rifle, LAUNCHER_RAISE_CLIPS.pistol]) {
      const e = table.get(c.clip)!;
      expect(e.noFire ?? null, c.clip).not.toBeNull();
      expect(e.noInterrupt ?? null, c.clip).not.toBeNull();
    }
  });
});

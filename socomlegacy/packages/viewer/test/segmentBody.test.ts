// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildGrid, polygonNormal, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { simMapFromBytes } from '../src/simMap';
import { DoorSet } from '../src/doors';
import { groundGrid, groundPolygons, SEGMENT_BODY_READING, SEGMENT_HIT_PICK_READING, probeLiftOf, TICK, WALL_BODY_READING, Walker } from '../src/mover';
import { Traversal } from '../src/traversal';

/**
 * SEGMENT-BODY (research 217 s2.9; LATER 283, LATER 620; reading, pending review). The original's body meets walls with
 * the segments `FUN_0054aa30` casts from the feet along the frame displacement (D:L415157-415166, D:L415341-415459,
 * D:L415549-415577, D:L415789-415817), a hull polygon hit only from the front of its own normal (research 281 s4.3), and
 * `FUN_005483d0` resolves the hits (D:L413533-413614): the displacement's part along each levelled normal taken away;
 * the deepest hit over 1 puts the body back where the tick began when it has more than two hits (or is prone), else
 * adds the depth less 1 along that normal. A still body casts along its facing (D:L415135-415161).
 */

const FORWARD = { forward: 1, right: 0, boost: false };
const STILL = { forward: 0, right: 0, boost: false };

function floor(minX: number, minZ: number, maxX: number, maxZ: number, y: number): WorldPoly {
  return {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([minX, y, minZ, maxX, y, minZ, maxX, y, maxZ, minX, y, maxZ]),
  };
}
/** A vertical quad from (ax, az) to (bx, bz), y0 to y1; its own normal (Newell's) is (b - a) turned a quarter one way. */
function face(ax: number, az: number, bx: number, bz: number, y0: number, y1: number): WorldPoly {
  return {
    modelName: 'worldmodel', path: 'worldmodel/wall', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az]),
  };
}
/** A face across x at `x`, its own normal toward `toward` (-1 or +1 along x). */
function wallFacing(x: number, toward: 1 | -1, y1 = 40): WorldPoly {
  const p = toward < 0 ? face(x, -200, x, 200, 0, y1) : face(x, 200, x, -200, 0, y1);
  expect(Math.sign(polygonNormal(p.points)![0])).toBe(toward);
  return p;
}
function world(polys: WorldPoly[]) {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}
/** The yaw that faces +x (the camera looks down its own -z). */
const EAST = 270;

describe('SEGMENT-BODY: the readings as built', () => {
  it('the switch and the hit pick are the readings', () => {
    expect(WALL_BODY_READING).toBe('segments');
    expect(SEGMENT_HIT_PICK_READING).toBe('nearest-passing');   // r0004 (OT.R97), R0004-SEGMENTS (A)
    expect(SEGMENT_BODY_READING).toMatchObject({ ahead: 1.4, centre: 1.1, backing: 1.75, sideNear: 0.3, sideFar: 1.2, depth: 1, jamHits: 2 });
  });
});

describe('SEGMENT-BODY: a face counts only from its front (research 281 s4.3)', () => {
  it('walked into from in front of its own normal, a wall stops the body short of it', () => {
    const w = new Walker(world([floor(-200, -200, 200, 200, 0), wallFacing(50, -1)]));
    expect(w.place(0, 1, 0)).toBe(true);
    w.state.yaw = EAST;
    for (let i = 0; i < 120; i++) w.tick(FORWARD);
    expect(w.state.x).toBeLessThan(50);
    expect(w.state.x).toBeGreaterThan(30);
    expect(w.wallHits().length).toBeGreaterThan(0);
  });

  it('walked into from behind its own normal, the same face is passed', () => {
    const w = new Walker(world([floor(-200, -200, 200, 200, 0), wallFacing(50, 1)]));
    expect(w.place(0, 1, 0)).toBe(true);
    w.state.yaw = EAST;
    for (let i = 0; i < 120; i++) w.tick(FORWARD);
    expect(w.state.x).toBeGreaterThan(60);
  });
});

describe('SEGMENT-BODY: the jam rule (FUN_005483d0 D:L413602-413614)', () => {
  it('a still body facing a post within its centre line is put out by the depth less 1 while it has two hits or fewer', () => {
    // Standing still facing +x, a post 1 wide and 12 tall 4 ahead: the centre line along the facing reaches 5.39, the head
    // line (along the travel standing, HEAD_LINE_MUZZLE_READING, at 19.394) passes over, the side lines (1.05 to 4.2
    // across) pass beside it. One hit, 1.39 deep: out by 0.39. (Checkpoints 1-3 took a wall 6 ahead and the head line's
    // muzzle reach, 9.46.)
    const post = face(4, -0.5, 4, 0.5, 0, 12);
    expect(Math.sign(polygonNormal(post.points)![0])).toBe(-1);
    const w = new Walker(world([floor(-200, -200, 200, 200, 0), post]));
    expect(w.place(0, 1, 0)).toBe(true);
    w.state.yaw = EAST;
    w.tick(STILL);
    expect(w.wallHits().length).toBe(1);
    expect(w.state.x).toBeCloseTo(-(1.1 * 1.4 * 3.5 - 4 - 1), 3);
  });

  it('a body with more than two hits, the deepest over 1, stays where the tick began', () => {
    // Facing +x, the wall 3 ahead: the centre (5.39), the head line (9.46) and both side lines (4.9 ahead, 1.05-4.2
    // across) all cross it -- four hits, the deepest 6.46: the displacement is zeroed every tick.
    const w = new Walker(world([floor(-200, -200, 200, 200, 0), wallFacing(3, -1)]));
    expect(w.place(0, 1, 0)).toBe(true);
    w.state.yaw = EAST;
    for (let i = 0; i < 30; i++) w.tick(STILL);
    expect(w.wallHits().length).toBeGreaterThan(2);
    expect(w.state.x).toBe(0);
    // Walking away is not refused: the segments run along the travel, away from the face.
    w.state.yaw = 90;
    for (let i = 0; i < 30; i++) w.tick(FORWARD);
    expect(w.state.x).toBeLessThan(-10);
  });
});

/**
 * The prone side lines' rear half (research 217 s2.9, "Checkpoint 4's sweep"; reading, pending review). `FUN_0054aa30`
 * casts them from the feet + 1.3 `uStack_30` - `fStack_10` to the feet + 1.3 `uStack_30` + `fStack_10` + the displacement
 * (D:L415586-415589, D:L415599-415605; `FUN_00309200` a subtract, `FUN_00309240` an add), `fStack_10` the travel x 1.4 r =
 * 11.2 (D:L415162-415166): each starts 11.2 BEHIND the feet. A face behind the body that faces away from it -- the far side
 * of a kerb, a barrel or a tank the body crawls away from -- is crossed from its front (research 281 s4.3) by that half,
 * its depth |(end - hit) . n| (D:L413571-413585, `FUN_001b3620` a fabs) is the line's length past it, and prone any depth
 * over 1 jams (D:L413602-413611). The ledge sweep's new prone pins at checkpoint 4 are this (MP2 `twintanks2`, MP73
 * `RMG_turret`, MP64 `mossylog03`, MP8 `di_g3213`, MP2 `barrel_single`); these pin the reading, not a capture.
 */
describe("SEGMENT-BODY: the prone side lines start 11.2 behind the feet (D:L415586-415589)", () => {
  const crawl = (polys: WorldPoly[]): Walker => {
    const w = new Walker(world([floor(-200, -200, 200, 200, 0), ...polys]));
    expect(w.place(0, 1, 0)).toBe(true);
    w.stance = 'prone';
    w.state.yaw = EAST;
    for (let i = 0; i < 120; i++) w.tick(FORWARD);
    return w;
  };
  it("a face 9 behind, facing away (a solid's far side), is met from its front by the rear half: the crawl is held", () => {
    const w = crawl([wallFacing(-9, -1, 12)]);
    expect(w.state.x).toBe(0);
    expect(w.wallHits().map((h) => h.line)).toEqual([2, 2]);
    expect(w.wallHits().every((h) => Math.abs(h.x + 9) < 1e-6)).toBe(true);
  });
  it('the same face 12 behind lies past the lines\' start: the crawl goes on', () => {
    expect(crawl([wallFacing(-12, -1, 12)]).state.x).toBeGreaterThan(10);
  });
  it('a face 9 behind facing the body is crossed from behind its normal: the crawl goes on', () => {
    expect(crawl([wallFacing(-9, 1, 12)]).state.x).toBeGreaterThan(10);
  });
});

/**
 * DOOR-PIN (Trello lSpKwCwu; `agent-mail/evidence/segment-body/DOOR-PIN-FINDING.md`, reading, pending review): MP51's
 * `door_ft_2` (the basement door of wc17A, hinge (952.5, 38.3, 915.1)) opened over a standing body at (957.10, 38.90,
 * 918.96), ticked in the room's order (the walker, then `DoorSet.step`). The disc's `pushOut` pushed the still body out
 * of the moving leaf every tick and carried it into the wedge at (950.13, 922.11) behind the open leaf. The original's
 * swing touches no body (`FUN_0025fe70` D:L109040-109346, `FUN_0025f9b0` D:L108852-109034); a still body meets the leaf
 * only where it crosses its segments, cast along its facing. A dev-disc test: it skips without `SOCOM_DISC`.
 */
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : '';
const HAVE_MP51 = !!DISC && existsSync(resolve(DISC, 'RUN', 'MP51.ZDB'));

describe.skipIf(!HAVE_MP51)(`DOOR-PIN: MP51's door_ft_2 over a still body${HAVE_MP51 ? '' : ' (SOCOM_DISC absent)'}`, () => {
  const setup = () => {
    const m = simMapFromBytes(new Uint8Array(readFileSync(resolve(DISC, 'RUN', 'MP51.ZDB'))), 'RUN/MP51.ZDB');
    const doors = new DoorSet(m.doors!, m.ground);
    const i = doors.specs.findIndex((d) => d.node === 'door_ft_2');
    expect(i).toBeGreaterThanOrEqual(0);
    return { m, doors, i };
  };
  const swing = (yaw: number) => {
    const { m, doors, i } = setup();
    const w = new Walker(m.grid);
    expect(w.place(957.10, 45, 918.96)).toBe(true);
    w.state.yaw = yaw;
    for (let k = 0; k < 10; k++) w.tick(STILL);
    const before = [w.state.x, w.state.z] as const;
    doors.use(i, null, 1);
    for (let k = 0; k < 200; k++) { w.tick(STILL); doors.step(TICK); }
    return { w, doors, before };
  };
  const walkOuts = (yaw: number): number[] => [0, 45, 90, 135, 180, 225, 270, 315].map((heading) => {
    const { w, doors } = swing(yaw);
    w.state.yaw = heading;
    const bx = w.state.x, bz = w.state.z;
    for (let k = 0; k < 90; k++) { w.tick(FORWARD); doors.step(TICK); }
    return Math.hypot(w.state.x - bx, w.state.z - bz);
  });

  it('after 200 still ticks under the swing the body is not in the wedge behind the leaf, and walks out', () => {
    const { w } = swing(90);
    expect(Math.hypot(w.state.x - 950.13, w.state.z - 922.11)).toBeGreaterThan(1);
    expect(Math.max(...walkOuts(90))).toBeGreaterThan(5);
  });

  // Re-judged against the finding's expectation ("facing away, no segment meets the leaf: it stays put and walks out in
  // 6 of 8"): facing +x the still body's side lines run 1.05 to 4.2 across its facing and 4.9 ahead (D:L415171-415220,
  // D:L415549-415577), and the swinging leaf crosses the +z one from its front: two hits or fewer, the deepest over 1,
  // so the body is put out by the depth less 1 each tick (D:L413612-413614) and carried with the leaf, until it stands
  // in the angle between the open leaf and the stairwell's west wall (`wc17A/di_intbasement_hint_01`) at about
  // (953.97, 925.15), held there while the leaf is open -- not the disc's wedge. Both outcomes are the lane's to weigh
  // against a capture of a body in a door's arc (research 217 s2.9).
  it("facing away from the leaf (yaw 270, facing +x) the leaf meets the body's side line and carries it, not into the disc's wedge", () => {
    const { w, before } = swing(270);
    expect(Math.hypot(w.state.x - before[0], w.state.z - before[1])).toBeGreaterThan(1);
    expect(Math.hypot(w.state.x - 950.13, w.state.z - 922.11)).toBeGreaterThan(1);
    expect(w.state.x).toBeCloseTo(953.97, 1);
    expect(w.state.z).toBeCloseTo(925.15, 1);
  });

  it('facing -x, -z or +z (yaw 90, 0, 180) the body walks out in at least 5 of 8 headings', () => {
    for (const yaw of [0, 90, 180]) expect(walkOuts(yaw).filter((d) => d > 5).length, `yaw ${yaw}`).toBeGreaterThanOrEqual(5);
  });
});

/**
 * BRIDGE-WEDGE's review and sweep (the gameplay lane, 2026-11-02; `agent-mail/evidence/gameplay/bridge-wedge/bw/
 * head-sweep.jsonl`): the disc's airborne pass, two-sided, pinned bodies against faces met from BEHIND. A step-up during
 * a fall, judged against the segment reading: the lines run from the feet + 6.5 along the frame's displacement
 * (`FUN_0054aa30` D:L415157-415166, D:L415401-415410), and a rim's face toward the fall is hit from its front.
 */
describe('SEGMENT-BODY: a step-up during a fall (a rim at 10, its face toward -z)', () => {
  const rim = () => {
    const f = face(50, 0, -50, 0, 0, 10);
    expect(Math.sign(polygonNormal(f.points)![2])).toBe(-1);
    return world([floor(-200, -200, 200, 0, 0), floor(-200, 0, 200, 200, 10), f]);
  };
  const drop = (feet: number, z0: number) => {
    const w = new Walker(rim());
    expect(w.place(0, 1, z0 - 10)).toBe(true);
    Object.assign(w.state, { x: 0, y: feet, z: z0, vx: 0, vz: 60 });
    w.setAirborne(true, -60);
    for (let i = 0; i < 40 && w.airborne; i++) w.tick(STILL);
    return w;
  };
  // JUMP-AIR (`AIR_SEGMENT_DIRECTION_READING` 'velocity', research 80 s7): falling at 60 with 60 across, the records slant
  // 45 degrees down on every tick (were level on the ticks between the 30 Hz frames), so their ends reach lower and from
  // farther back: feet 7 and over still pass over the rim and land on it; feet 6 does from 2.1 short and falls short
  // from 2.5 and 2.9 (was: feet 6 and over from all three).
  it('feet 7 and over at the crossing: the lines pass over the rim and the body lands on it', () => {
    for (const feet of [7, 8]) for (const z0 of [-2.9, -2.5, -2.1]) {
      const w = drop(feet, z0);
      expect(w.state.y, `${feet} ${z0}`).toBe(10);
      expect(w.state.z, `${feet} ${z0}`).toBeGreaterThan(0);
    }
  });
  it('feet 6: lands on the rim from 2.1 short; from 2.5 and 2.9 the slanted lines meet the face and it falls short', () => {
    expect(drop(6, -2.1).state.y).toBe(10);
    for (const z0 of [-2.5, -2.9]) {
      const w = drop(6, z0);
      expect(w.state.y, `${z0}`).toBe(0);
      expect(w.state.z, `${z0}`).toBeLessThan(0);
    }
  });
  it("feet 4 from 2.9 short: the slanted line's end drops under the rim's top, crosses the face's front, and the body falls short of it", () => {
    const w = drop(4, -2.9);
    expect(w.state.y).toBe(0);
    expect(w.state.z).toBeLessThan(0);
  });
});

/** The sweep's edge walk (`bw.probe.ts`): from 6 short of the edge, full stick out for 120 ticks, then at rest. */
const HAVE = (map: string) => !!DISC && existsSync(resolve(DISC, 'RUN', `${map}.ZDB`));
const EDGES = [
  { map: 'MP9', x: 1081.96, z: 1206.1, out: [0, 1], top: 17.24, why: 'fell inside mp9_turret02/RMG_turret\'s wedge hull' },
  { map: 'MP1', x: 2140.72, z: 1968.24, out: [-0.202, 0.979], top: 109.86, why: 'land40/invis40 met from behind put it back onto invis40 at 80.36' },
  { map: 'MP51', x: 1349.15, z: 409.6, out: [0.908, -0.419], top: -7.39, why: 'mixed: crates under wc06A' },
] as const;
describe.each(EDGES)('SEGMENT-BODY: the sweep\'s ledge walk-off at $map ($x, $z)', (e) => {
  const run = (grid: ReturnType<typeof groundGrid>, polys: ReturnType<typeof groundPolygons>) => {
    const w = new Walker(grid);
    w.driver = new Traversal(grid, polys);
    expect(w.place(e.x - e.out[0] * 6, e.top + probeLiftOf('stand'), e.z - e.out[1] * 6)).toBe(true);
    w.state.yaw = (Math.atan2(-e.out[0], -e.out[1]) * 180) / Math.PI;
    for (let i = 0; i < 420; i++) {
      w.tick({ forward: i < 120 ? 1 : 0, right: 0, boost: false });
      if (i >= 120 && !w.airborne && w.bodyOwner() === null) break;
    }
    return w;
  };
  it.skipIf(!HAVE(e.map))(`comes free: walks out over 5 in at least 6 of 8 headings (the disc: ${e.why})`, () => {
    const map = simMapFromBytes(new Uint8Array(readFileSync(resolve(DISC, 'RUN', `${e.map}.ZDB`))), `RUN/${e.map}.ZDB`);
    const grid = groundGrid(map.ground!), polys = groundPolygons(map.ground!);
    const free = [0, 45, 90, 135, 180, 225, 270, 315].filter((heading) => {
      const w = run(grid, polys);
      w.state.yaw = heading;
      const bx = w.state.x, bz = w.state.z;
      for (let i = 0; i < 90; i++) w.tick(FORWARD);
      return Math.hypot(w.state.x - bx, w.state.z - bz) > 5;
    }).length;
    expect(free).toBeGreaterThanOrEqual(6);
    if (e.map === 'MP1') expect(run(grid, polys).state.y).not.toBeCloseTo(80.36, 1);
  }, 60_000);
});

/**
 * LATER 283: M71's ramp-foot pocket (Fuse's trap, PR #408) on the disc's own hull (`RUN/M71.ZDB`): the disc's three
 * contacts met at one point at the stand-off (2676.46, 187.5, 1280.15) and held a body on all 16 headings (moved
 * 0.01-0.02 each, `walk.test.ts`'s retired pin). The segments, one-sided, let it walk out on the headings that do not
 * run into a face. A dev-disc test: it skips without `SOCOM_DISC`.
 */
describe.skipIf(!HAVE('M71'))(`LATER 283: M71's ramp-foot pocket${HAVE('M71') ? '' : ' (SOCOM_DISC absent)'}`, () => {
  it('walks out over 5 on at least 7 of 16 headings from the disc\'s stand-off', () => {
    const map = simMapFromBytes(new Uint8Array(readFileSync(resolve(DISC, 'RUN', 'M71.ZDB'))), 'RUN/M71.ZDB');
    const at = { x: 2676.46, z: 1280.15 };
    let free = 0;
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI * 2) / 16;
      const w = new Walker(map.grid);
      expect(w.place(at.x, 190, at.z)).toBe(true);
      w.state.yaw = (Math.atan2(-Math.cos(a), -Math.sin(a)) * 180) / Math.PI;
      for (let i = 0; i < 60; i++) w.tick(FORWARD);
      if (Math.hypot(w.state.x - at.x, w.state.z - at.z) > 5) free++;
    }
    expect(free).toBeGreaterThanOrEqual(7);
  }, 60_000);
});

/**
 * SEGMENT-BODY checkpoint 3 (the ledge sweep's "hung": 10 or more airborne ticks with no change in y, new at checkpoint 2
 * on most maps, MP5's (671.33, 1531.46) among them). Falling fast over a face steeper than `max_slope`, the records along
 * the steep 3D displacement cross it deep, more than two hits: the jam zeroes `+0xf44..+0xf4c` (D:L413602-413611). The
 * airborne height is not carried by that displacement: `FUN_0059b440` steps the altitude `+0x2e4` by the fall speed
 * itself (D:L456496-456498) and `FUN_0059ad30` lands it on the floor (D:L456313-456322) -- `AIR_HEIGHT_READING`.
 */
describe.skipIf(!HAVE('MP5'))(`SEGMENT-BODY: a fall over a steep face is not held in the air by the jam (AIR_HEIGHT_READING)${HAVE('MP5') ? '' : ' (SOCOM_DISC absent)'}`, () => {
  it("MP5's edge at (671.33, 1531.46), the sweep's stand-walk: no 10 airborne ticks at one height, and it lands", () => {
    const map = simMapFromBytes(new Uint8Array(readFileSync(resolve(DISC, 'RUN', 'MP5.ZDB'))), 'RUN/MP5.ZDB');
    const grid = groundGrid(map.ground!), polys = groundPolygons(map.ground!);
    const e = { x: 671.33, z: 1531.46, out: [0.997, 0.083], top: 153.98 };
    const w = new Walker(grid);
    w.driver = new Traversal(grid, polys);
    expect(w.place(e.x - e.out[0]! * 6, e.top + probeLiftOf('stand'), e.z - e.out[1]! * 6)).toBe(true);
    w.state.yaw = (Math.atan2(-e.out[0]!, -e.out[1]!) * 180) / Math.PI;
    let same = 0, worst = 0, last = NaN;
    for (let i = 0; i < 420; i++) {
      w.tick({ forward: i < 120 ? 0.5 : 0, right: 0, boost: false });
      same = w.airborne && w.state.y === last ? same + 1 : 0;
      worst = Math.max(worst, same);
      last = w.state.y;
    }
    expect(worst).toBeLessThan(10);
    expect(w.airborne).toBe(false);
  }, 60_000);
});

/**
 * SEGMENT-BODY checkpoint 4: ac's flat-wall capture (PCSX2 r0004, 3 trials, trials 2 and 3 equal to 0.01; M51 house2's
 * west wall `worldmodel/noreg_343344/g160_1`, plane x 5425, facing -x; `agent-mail/evidence/eph-hunt-2026-11-01/
 * segment-body/results/SEGMENT-BODY.md`, 18:20-18:41Z). The original: standing 6.78, crouch walk 9.48, the crouch's run
 * 5.85, prone 16.04, backing 9.66. The head line runs along the facing by the muzzle only prone or in a transition
 * (`HEAD_LINE_MUZZLE_READING`, D:L415457-415523): standing and crouched the centre line stops the body -- 1.1 x 1.4 x 3.5 =
 * 5.39, x 1.75 crouch-walking and backing (D:L415354-415371), not while the crouch runs (`CROUCH_RUN_FLAG_READING`). The
 * port's stop is the reach plus up to one 60 Hz move (owner ruling R8; the original's settle at reach + a 30 Hz move - 1
 * is HUMAN_TASKS' row).
 */
describe.skipIf(!HAVE('M51'))(`SEGMENT-BODY: M51 house2's west wall, the captured stand-offs${HAVE('M51') ? '' : ' (SOCOM_DISC absent)'}`, () => {
  const WALL = 5425, Z = 2444, CENTRE = 1.1 * 1.4 * 3.5;
  let grid: ReturnType<typeof groundGrid>;
  let polys: ReturnType<typeof groundPolygons>;
  const at = (yaw: number, stance: 'stand' | 'crouch' | 'prone', back: number, push: number, ticks = 240): number => {
    if (!grid) {
      const map = simMapFromBytes(new Uint8Array(readFileSync(resolve(DISC, 'RUN', 'M51.ZDB'))), 'RUN/M51.ZDB');
      grid = groundGrid(map.ground!); polys = groundPolygons(map.ground!);
    }
    const w = new Walker(grid);
    w.driver = new Traversal(grid, polys);
    expect(w.place(WALL - back, -110, Z)).toBe(true);
    w.state.yaw = yaw;
    if (stance !== 'stand') { w.changeStance(stance); for (let i = 0; i < 120; i++) w.tick(STILL); }
    for (let i = 0; i < ticks; i++) w.tick({ forward: push, right: 0, boost: false });
    return WALL - w.state.x;
  };
  it('standing, full stick: the centre line (was the head line, 9.97; the original 6.78)', () => {
    const d = at(270, 'stand', 30, 1);
    expect(d).toBeGreaterThan(CENTRE - 1e-6);
    expect(d).toBeLessThan(CENTRE + 65 / 60 + 1e-6);
  });
  it('crouch walk, half stick: the centre x 1.75 (was the crouched head line, 12.64; the original 9.48)', () => {
    const d = at(270, 'crouch', 30, 0.5);
    expect(d).toBeGreaterThan(CENTRE * 1.75 - 1e-6);
    expect(d).toBeLessThan(CENTRE * 1.75 + 0.5);
  });
  it("the crouch's run, full stick: the centre, no 1.75 (was 10.14; the original 5.85)", () => {
    const d = at(270, 'crouch', 30, 1);
    expect(d).toBeGreaterThan(CENTRE - 1e-6);
    expect(d).toBeLessThan(CENTRE + 65 / 60 + 1e-6);
  });
  it('prone crawl: the head line along the facing, 15.94 (the original 16.04)', () => {
    const d = at(270, 'prone', 40, 1, 600);
    expect(d).toBeGreaterThan(1.1 * 14.49 - 1e-6);
    expect(d).toBeLessThan(1.1 * 14.49 + 0.4);
  });
  it('backing, full back: the centre x 1.75 (the original 9.66)', () => {
    const d = at(90, 'stand', 30, -1);
    expect(d).toBeGreaterThan(CENTRE * 1.75 - 1e-6);
    expect(d).toBeLessThan(CENTRE * 1.75 + 37 / 60 + 1e-6);
  });
}, 120_000);

/**
 * The ledge sweep's checkpoint-4 prone pin at MP8 (965.21, 790) (`agent-mail/evidence/gameplay/segment-body-cp4/
 * DIFF.txt`; the disc walked it off): the body crawls -x off a kerb 7.73 high (`worldmodel/land34/di_g3213`, 7.5 deep,
 * its far face at x 972.7 facing +x) and lands at its foot, 61.02. From there both prone side lines start 11.2 behind the
 * feet, past the kerb's far face, and cross it from its front (D:L415586-415589): the jam holds the crawl every tick.
 * The reading's (research 217 s2.9, "Checkpoint 4's sweep"); a capture of a prone SEAL crawled off a kerb settles it.
 */
describe.skipIf(!HAVE('MP8'))(`SEGMENT-BODY: MP8's kerb at (965.21, 790), the side lines' rear half${HAVE('MP8') ? '' : ' (SOCOM_DISC absent)'}`, () => {
  it('crawled off the kerb, the body is held at its foot by the kerb\'s far face, met by both side lines', () => {
    const map = simMapFromBytes(new Uint8Array(readFileSync(resolve(DISC, 'RUN', 'MP8.ZDB'))), 'RUN/MP8.ZDB');
    const grid = groundGrid(map.ground!), polys = groundPolygons(map.ground!);
    const w = new Walker(grid);
    w.driver = new Traversal(grid, polys);
    expect(w.place(965.21 + 6, 68.75 + probeLiftOf('stand'), 790)).toBe(true);
    w.stance = 'prone';
    w.state.yaw = 90;                                            // facing -x
    for (let i = 0; i < 120; i++) w.tick(FORWARD);
    expect(w.state.y).toBeCloseTo(61.02, 1);
    expect(Math.abs(w.state.x - 965.2)).toBeLessThan(0.5);
    const hits = w.wallHits();
    expect(hits.map((h) => h.line)).toEqual([2, 2]);
    expect(hits.every((h) => h.poly.path.includes('di_g3213') && Math.abs(h.x - 972.7) < 0.1)).toBe(true);
  }, 60_000);
});

/**
 * SEGMENT-BODY: ac's capture at M51's fence `worldmodel/noreg_343344/g15582` (capture comparison, PCSX2 r0004, 3 trials
 * each, all identical; `agent-mail/evidence/eph-hunt-2026-11-01/segment-body/results/SEGMENT-BODY.md`, "For 6d" and
 * "02:56-03:03Z"). The fence is two faces in the plane x 5401.0, wound opposite ways (polygons 0-2 facing -x, toward a
 * body west of it; 3-5 facing +x); at z 2330 it spans y -113.6..-94.6 over feet at -107.9. The body stands west of it
 * facing -x (yaw 90), away from it.
 * (a) The prone gate (`FUN_00552ec0` D:L418935-418940 through `FUN_0054d620`, `PRONE_GATE_READING` 8.0 behind at the
 *     feet + 3.25): standing 7.00 / 7.50 / 7.75 u from the plane the press is refused, at 8.00 / 8.25 / 8.50 it is taken.
 * (b) Prone at 13.20 u, crawling backward toward the fence: the body moves 0.73 u and holds at 12.47 u for the rest of
 *     4 s; crawling forward from there it goes 33.01 u in 3 s (to 45.48). Backward, the travel `fStack_10` points at the
 *     fence and the prone centre line reaches 1.1 x 1.4 x 8.0 = 12.32 along it (D:L415113-415166, D:L415401-415433);
 *     met from the -x face's front, deeper than 1 prone, the jam keeps the body where the tick began (D:L413602-413611).
 *     Forward the side lines' rear half (D:L415586-415605) starts 11.2 behind the feet, 1.27 short of the plane.
 */
describe.skipIf(!HAVE('M51'))(`SEGMENT-BODY: M51's fence g15582, the captured prone gate and back-crawl${HAVE('M51') ? '' : ' (SOCOM_DISC absent)'}`, () => {
  const FENCE = 5401, Z = 2330, FEET = -107.92;
  let grid: ReturnType<typeof groundGrid>;
  let polys: ReturnType<typeof groundPolygons>;
  const standAt = (d: number): Walker => {
    if (!grid) {
      const map = simMapFromBytes(new Uint8Array(readFileSync(resolve(DISC, 'RUN', 'M51.ZDB'))), 'RUN/M51.ZDB');
      grid = groundGrid(map.ground!); polys = groundPolygons(map.ground!);
    }
    const w = new Walker(grid);
    w.driver = new Traversal(grid, polys);
    expect(w.place(FENCE - d, FEET + probeLiftOf('stand'), Z)).toBe(true);
    w.state.yaw = 90;                                            // facing -x, away from the fence
    return w;
  };

  it('(a) the press is refused at 7.00, 7.50 and 7.75 u and taken at 8.00, 8.25 and 8.50 u (the capture: between 7.75 and 8.00)', () => {
    for (const d of [7, 7.5, 7.75, 8, 8.25, 8.5]) {
      const w = standAt(d);
      w.tick(STILL);
      w.changeStance('prone');
      expect({ d, stance: w.stance }).toEqual({ d, stance: d < 8 ? 'stand' : 'prone' });
    }
  }, 60_000);

  it('(b) prone at 13.20 u, crawling backward: moves about 0.73 u and holds at 12.47 u; forward from there it is free (33.01 u in 3 s)', () => {
    const w = standAt(13.2);
    w.stance = 'prone';
    const back = { forward: -1, right: 0, boost: false };
    for (let i = 0; i < 60; i++) w.tick(back);                   // the first second
    const held = FENCE - w.state.x;
    expect(Math.abs(held - 12.47)).toBeLessThan(0.3);
    expect(Math.abs(13.2 - held - 0.73)).toBeLessThan(0.3);
    for (let i = 0; i < 180; i++) w.tick(back);                  // the rest of the 4 s: held
    expect(FENCE - w.state.x).toBeCloseTo(held, 6);
    expect(w.wallHits().length).toBeGreaterThan(0);
    expect(w.wallHits().every((h) => h.poly.path.includes('g15582') && Math.abs(h.x - FENCE) < 0.1)).toBe(true);
    expect(w.wallHits().every((h) => polygonNormal(h.poly.points)![0] < 0)).toBe(true);   // the -x face, toward the body
    for (let i = 0; i < 42; i++) w.tick(STILL);                  // let go 0.7 s
    const from = FENCE - w.state.x;
    for (let i = 0; i < 180; i++) w.tick(FORWARD);               // full forward 3 s
    expect(Math.abs(FENCE - w.state.x - from - 33.01)).toBeLessThan(1);
  }, 60_000);
}, 120_000);

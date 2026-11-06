// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildGrid, isWallSurface, probeGround, segmentHits, selectFloor, type Grid, type WorldPoly } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { simMapFromBytes } from '../src/simMap';
import { WorldState } from '../src/worldState';
import { Traversal } from '../src/traversal';
import { BODY_RADIUS, groundGrid, groundPolygons, STEP_PROBE_LIFT_READING, wallProbeHeights, Walker, WEDGE_PUSH_OUT_ADAPTATION } from '../src/mover';
import { CLIMBABLE } from '../src/climb';

/**
 * HOTFIX BRIDGE-WEDGE, HF2-slim (Trello c22ltqhr; research 217 s2.10; LATER 620, LATER 283). Reading, pending capture,
 * and one adaptation. Two pieces (the air `pushOut` of `agent/hotfix-bridge-wedge` is not here):
 *
 * 1. The walls in the air, every tick, at the feet the tick leaves (`AIR_WALL_HEIGHTS_READING`): the original's frame
 *    displacement carries the fall (`FUN_0054d9a0` D:L416501-416530), `FUN_0054aa30` casts its segments along it
 *    (D:L415157-415166) and `FUN_005483d0` resolves them every tick in the air (`FUN_005506a0` D:L417822-417826). The
 *    hull's hit is one-sided (research 281 s4.3): the airborne pass meets a face only from in front of its own normal.
 * 2. A body already inside the walls whose every push-out crosses a face is put once at the nearest free point
 *    (`WEDGE_PUSH_OUT_ADAPTATION`): a stand-in for the segment body's resolution until SEGMENT-BODY lands. Bounded: it
 *    never touches a body with no penetration (the last block holds it).
 */

const quad = (pts: number[], ditype: number, path: string): WorldPoly => ({
  modelName: 'worldmodel', path, region: 0, ditype, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from(pts),
});

function world(polys: WorldPoly[]): Grid {
  const owners = polys.map((p, first) => ({ modelName: p.modelName, path: p.path, first, count: 1 }));
  return buildGrid({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 }, [], [], polys, owners);
}
const floor0 = (): WorldPoly => quad([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200], 3, 'worldmodel/floor');

/** A floor at y 0 and a thin fin on z 0 from x -50 to 50, `top` tall, its one face toward -z (Crossroads' rubble fin). */
const finWorld = (top: number): Grid => world([floor0(), quad([50, 0, 0, -50, 0, 0, -50, top, 0, 50, top, 0], 2, 'worldmodel/fin')]);

/**
 * Airborne at (0, `feet`, `z0`), falling at 90 and carried along z at `vz` (a unit a tick at 60); the stick at rest. The
 * flight's game frames fall on its third, fifth, ... ticks (`airClock`), so from z -2.5 the third tick is the one that
 * crosses the fin's plane, and it is a frame's: the feet 15 -> 11.74, the low line 21.5 -> 18.24.
 */
function fallAt(grid: Grid, feet: number, z0: number, vz = 60): { w: Walker; crossing: { y0: number; y1: number; z1: number } } {
  const w = new Walker(grid);
  expect(w.place(0, 1, z0)).toBe(true);
  Object.assign(w.state, { x: 0, y: feet, z: z0, vx: 0, vz });
  w.setAirborne(true, -90);
  let crossing = { y0: NaN, y1: NaN, z1: NaN };
  for (let i = 0; i < 60; i++) {
    const y0 = w.state.y, before = w.state.z;
    w.tick({ forward: 0, right: 0, boost: false });
    if (Number.isNaN(crossing.y0) && Math.sign(before) !== Math.sign(before + vz / 60)) crossing = { y0, y1: w.state.y, z1: w.state.z };
  }
  return { w, crossing };
}

describe('HOTFIX BRIDGE-WEDGE (1): the walls in the air at the feet the tick leaves, front faces only', () => {
  const [low] = wallProbeHeights('stand');

  it("a fin whose top the low line passes on the crossing tick's frame stops the body on its front side", () => {
    const { w, crossing } = fallAt(finWorld(20), 15, -2.5);
    expect(crossing.y0 + low).toBeGreaterThan(20);              // the line over the top at the tick's start
    expect(crossing.y1 + low).toBeLessThan(20);                 // under it after the frame
    expect(crossing.z1).toBeLessThan(0);                        // met there: the move across is not taken
    expect(w.airborne).toBe(false);
    expect(w.state.y).toBeCloseTo(0, 6);
    // SEGMENT-BODY: held at the crossing tick's start, z -0.5 -- in the air the move is put out by the depth (D:L413543-
    // 413556) and more than two hits jam it (D:L413602-413611); it lands facing -z, away from the fin, and a still body
    // looks along its facing (D:L415135-415161), so nothing pushes it after. Was the disc's stand-off, -3.5.
    expect(w.state.z).toBeCloseTo(-0.5, 3);
  });

  it('a fin whose top is under the low line on both sides of the crossing is passed over', () => {
    const { w, crossing } = fallAt(finWorld(8), 15, -2.5);
    expect(crossing.y1 + low).toBeGreaterThan(8);
    expect(crossing.z1).toBeGreaterThan(0);
    expect(w.state.z).toBeGreaterThan(BODY_RADIUS);
  });

  it('a still airborne body in front of a fin is not moved in the air (no air push-out), nor on landing', () => {
    const w = new Walker(finWorld(20));
    expect(w.place(0, 1, -1)).toBe(true);
    Object.assign(w.state, { x: 0, y: 15, z: -1, vx: 0, vz: 0 });
    w.setAirborne(true, -90);
    let ticks = 0;
    while (w.state.y + low > 20 && ticks++ < 10) {
      w.tick({ forward: 0, right: 0, boost: false });
      if (w.state.y + low > 20) expect(w.state.z).toBe(-1);       // the line over the top: nothing met
    }
    // The airborne pass clips the move only (FUN_005483d0 D:L413557-413567) and a still body has none to clip; the port's
    // pushOut acts on the ground, as on main.
    expect(w.state.z).toBe(-1);
    for (let i = 0; i < 30 && w.airborne; i++) { w.tick({ forward: 0, right: 0, boost: false }); if (w.airborne) expect(w.state.z).toBe(-1); }
    expect(w.airborne).toBe(false);
    w.tick({ forward: 0, right: 0, boost: false });
    // SEGMENT-BODY: a still body facing away from the fin has no displacement to clip (D:L413557-413567) and looks away
    // (D:L415135-415161): it stays at -1. Was: stood off to the disc's -3.5 on landing.
    expect(w.state.z).toBe(-1);
  });

  it("a fall crossing the fin's BACK face is not stopped by the airborne pass (research 281 s4.3: one-sided)", () => {
    // From +z, carried -z: the fin's own face is toward -z, so the body meets it from behind. The tick-start lines are
    // over the top (the port's slide, as before); the post-fall lines meet only a back face, which no segment hits.
    const { w, crossing } = fallAt(finWorld(20), 15, 2.5, -60);
    expect(crossing.y1 + low).toBeLessThan(20);
    expect(crossing.z1).toBeLessThan(0);                           // carried across, as on main
    expect(w.state.z).toBeLessThan(-BODY_RADIUS);
  });

  it("a fall carried at a rim: the segment arm stops it at the rim's face on the crossing frame and it lands in front, never through (HF2-slim's landing on the rim is the disc arm's)", () => {
    // A block 10 tall from z 0 on (its face toward -z, its top a floor). Carried 1.5 a tick from z -4, the third tick
    // crosses z 0 and is the flight's first game frame: the feet 5 -> 1.6, the low line 11.5 (over the face's top) -> 8.1
    // (under it), and the pick from 5 + STEP_PROBE_LIFT_READING finds the top at 10.
    const grid = world([
      floor0(),
      quad([50, 0, 0, -50, 0, 0, -50, 10, 0, 50, 10, 0], 2, 'worldmodel/rim'),
      quad([-50, 10, 0, -50, 10, 100, 50, 10, 100, 50, 10, 0], 3, 'worldmodel/rimTop'),
    ]);
    // SEGMENT-BODY (re-measured 2026-11-04; reading, pending the capture of a SEAL dropped past a face's top, research 213
    // s3 item 2, H94): on the crossing frame (the third tick) the segments at the feet + 6.5 meet the rim's face below its
    // top, three hits, and the move across is put out (D:L413543-413556, D:L413602-413611): z held at -1, the carry gone;
    // it lands in front of the face on the floor. Was HF2-slim's landing on the rim (y 10, z > 0) -- an adaptation with
    // no line of the original (`mover.ts`), now the disc arm's only (`WALL_BODY_READING` 'segments').
    const w = new Walker(grid);
    expect(w.place(0, 1, -4)).toBe(true);
    Object.assign(w.state, { x: 0, y: 5, z: -4, vx: 0, vz: 90 });
    w.setAirborne(true, -100);
    const met: string[][] = [];
    for (let i = 0; i < 12; i++) { w.tick({ forward: 0, right: 0, boost: false }); met.push(w.wallHits().map((h) => h.poly.path)); }
    expect(met[2]).toContain('worldmodel/rim');                     // the crossing frame meets the face
    expect(w.airborne).toBe(false);
    expect(w.state.y).toBeCloseTo(0, 3);                           // in front of the face, on the floor
    expect(w.state.z).toBeCloseTo(-1, 3);                          // never through it
    expect(5 + STEP_PROBE_LIFT_READING + 1).toBeGreaterThan(10);
  });
});

/**
 * How far a heading must carry the body in 60 ticks to count as walked out: under the radius, since a free point beside
 * the slot can stand 4.4 from the map's own corner (x 1687 at Crossroads' rubble), as a body placed there on main does.
 */
const WALKED = 3;

/** Walks 60 ticks at full stick in each of eight headings from a copy of `make()`'s end; how far each got. */
function walkOut(make: () => Walker): number[] {
  const from = make().state;
  const out: number[] = [];
  for (let k = 0; k < 8; k++) {
    const w = make();
    w.state.yaw = k * 45;
    for (let i = 0; i < 60; i++) w.tick({ forward: 1, right: 0, boost: false });
    out.push(Math.hypot(w.state.x - from.x, w.state.z - from.z));
  }
  return out;
}

const MP72 = fixture('RUN/MP72.ZDB');

/**
 * The playtest's case (2026-11-01, `game_MP72_3201`, player 6, ticks 95100-95116): with `terrorist_demo_1`'s arch
 * destroyed, a running jump off the deck comes down at (1676.4, 84.3, 1419.3), v (8.9, -84.8, 64.4), over the rubble's
 * fin (`arch=arch/destroyed`, the plane z 1422.31, its one face toward -z, top 80.39) into the slot between it and
 * `destroyed/dia`'s face at z 1425.33 (toward -z) -- 3.02 wide, the floor 57.6 -- and stood wedged at (1675.8, 57.6,
 * 1422.8) for good: every push out of the 3.5 disc crossed a face (the crossing guard).
 */
describe.skipIf(!MP72)(`HOTFIX BRIDGE-WEDGE on Crossroads with terrorist_demo_1 destroyed${MP72 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const blown = () => {
    const map = simMapFromBytes(MP72!, 'RUN/MP72.ZDB');
    const w = new WorldState(map.meta!, map.ground, map.grid);
    w.skipEffects = true;
    w.applyInitial();
    expect(w.executeAction('terrorist_strike1')).toBe(true);
    return map.grid;
  };
  const grid = MP72 ? blown() : (null as unknown as Grid);
  const fall = (x: number, vx: number, vz: number, idle: number) => () => {
    const w = new Walker(grid);
    expect(w.place(x, 100, 1419.3)).toBe(true);
    Object.assign(w.state, { x, y: 84.3, z: 1419.3, vx, vz, yaw: 190.57 });
    w.setAirborne(true, -84.8);
    for (let i = 0; i < 30 + idle; i++) w.tick({ forward: 0, right: 0, boost: false });
    return w;
  };

  it("the slot is the disc's: the fin and dia's face 3.02 apart, the fin's top under the feet where the fall crosses it", () => {
    const [low] = wallProbeHeights('stand');
    const at = (y: number) => segmentHits(grid, [1675.8, y, 1418], [1675.8, y, 1428], isWallSurface).map((h) => +h.point[2].toFixed(2));
    expect(at(57.6 + low)).toEqual([1422.31, 1425.33]);
    expect(1425.33 - 1422.31).toBeLessThan(2 * BODY_RADIUS);
    expect(at(80)).toContain(1422.31);
    expect(at(81)).not.toContain(1422.31);
    expect(probeGround(grid, 1675.8, 1423.8).map((h) => +h.y.toFixed(1))).toContain(57.6);
    expect(probeGround(grid, 1675.8, 1418).map((h) => +h.y.toFixed(1))).toContain(57.6);   // the free side's floor
  });

  // The playtest's trajectory and variations along the slot and in the carry: never frozen.
  const cases: [number, number, number][] = [
    [1676.4, 8.9, 64.4], [1668, 8.9, 64.4], [1672, 0, 64.4], [1680, -8.9, 64.4], [1684, 8.9, 64.4], [1676.4, 8.9, 55],
  ];
  for (const [x, vx, vz] of cases) {
    it(`from (${x}, 84.3, 1419.3) v (${vx}, -84.8, ${vz}): out of the slot within 4 idle ticks of the landing, and walks out`, () => {
      const make = fall(x, vx, vz, 4);
      const w = make();
      expect(w.airborne).toBe(false);
      expect(w.state.y).toBeCloseTo(57.6, 0);
      // Not in the slot: the disc clear of both faces.
      const z = w.state.z;
      expect(z <= 1422.32 - BODY_RADIUS || z >= 1425.32 + BODY_RADIUS).toBe(true);   // the planes in float32: 1422.313, 1425.325
      const moved = walkOut(make).filter((d) => d > WALKED).length;
      expect(moved).toBeGreaterThanOrEqual(6);
    });
  }

  it('a still body dropped into the slot falls without hanging, is put out on landing, and walks out', () => {
    const drop = (y: number) => () => {
      const w = new Walker(grid);
      expect(w.place(1675.8, 100, 1423.8)).toBe(true);
      Object.assign(w.state, { x: 1675.8, y, z: 1423.8, vx: 0, vz: 0 });
      w.setAirborne(true, 0);
      let last = w.state.y, ticks = 0;
      while (w.airborne && ticks++ < 120) {
        w.tick({ forward: 0, right: 0, boost: false });
        expect(w.state.y).toBeLessThanOrEqual(last);              // the fall is never held up
        last = w.state.y;
      }
      expect(w.airborne).toBe(false);
      expect(ticks).toBeLessThan(60);
      for (let i = 0; i < 4; i++) w.tick({ forward: 0, right: 0, boost: false });
      return w;
    };
    for (const y of [72, 64]) expect(walkOut(drop(y)).filter((d) => d > WALKED).length).toBeGreaterThanOrEqual(6);
  });
});

const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : '';
const haveDisc = (map: string) => !!DISC && existsSync(resolve(DISC, 'RUN', `${map}.ZDB`));

/**
 * The airborne pass's sweep pins (BRIDGE-WEDGE's review, 2026-11-02; agent-mail evidence gameplay/bridge-wedge/bw): a
 * standing run off each edge at full stick for 120 ticks, then at rest until landed. With BRIDGE-WEDGE's own two-sided
 * pass (it pushed out too) these ended pinned against faces met from behind (MP9's turret, MP1's `land40/invis40`,
 * MP51's crates); on main they walk out. Under this head's clip-only pass only MP9 still tells one-sided from two-sided
 * (made two-sided, MP9 pins and the synthetic back-face fin above is stopped; MP1 and MP51 pass either way, measured
 * 2026-11-02 after fold 2), so MP9 and the synthetic case are the guards of the front-face rule; MP1 and MP51 stay as
 * no-pin checks. No second real-map start that tells them apart was found in MP9's and MP1's stand-run sweep starts
 * (151 and 139, each walked both ways, on `agent/hotfix-bridge-wedge`). Dev-disc: each map read from `SOCOM_DISC`, skipped
 * without it.
 */
const PINS = [
  { map: 'MP1', x: 2140.72, z: 1968.24, out: [-0.202, 0.979], top: 109.86 },
  { map: 'MP9', x: 1081.96, z: 1206.1, out: [0, 1], top: 17.24 },
  { map: 'MP51', x: 1349.15, z: 409.6, out: [0.908, -0.419], top: -7.39 },
] as const;
for (const c of PINS) {
  describe.skipIf(!haveDisc(c.map))(`HOTFIX BRIDGE-WEDGE: ${c.map}'s back-face case does not pin${haveDisc(c.map) ? '' : ' (SOCOM_DISC absent)'}`, () => {
    it(`the run off (${c.x}, ${c.z}) lands and walks out in at least 6 of 8 headings`, () => {
      const map = simMapFromBytes(new Uint8Array(readFileSync(resolve(DISC, 'RUN', `${c.map}.ZDB`))), `RUN/${c.map}.ZDB`);
      const grid = groundGrid(map.ground!), polys = groundPolygons(map.ground!);
      const make = () => {
        const w = new Walker(grid);
        w.driver = new Traversal(grid, polys);
        w.place(c.x - c.out[0] * 6, c.top + STEP_PROBE_LIFT_READING, c.z - c.out[1] * 6);
        w.state.yaw = (Math.atan2(-c.out[0], -c.out[1]) * 180) / Math.PI;
        for (let i = 0; i < 420; i++) {
          w.tick({ forward: i < 120 ? 1 : 0, right: 0, boost: false });
          if (i >= 120 && !w.airborne && w.action === null) break;
        }
        return w;
      };
      expect(make().airborne).toBe(false);
      expect(walkOut(make).filter((d) => d > WALKED).length).toBeGreaterThanOrEqual(6);
    }, 120_000);
  });
}

/**
 * The fold (f9's fixed-starts 22-map sweep on ce721adc5, agent-mail evidence gameplay/hotfix-bridge-wedge): four starts
 * that land on main ended airborne on the hotfix, MP61's falling through the world (y -4836.76). Each is walked exactly as
 * `ledgeSweep.probe.test.ts` walks a listed start: placed 6 back from the edge on its top, the eight-heading start probe
 * (each heading 60 ticks, the state put back), the slide's hold read once, then 120 ticks at the configuration's push and
 * up to 300 at rest while airborne or in an action. Each must end on a floor: not airborne, the floor under the feet, and
 * never under the map. Dev-disc.
 */
const FALLS = [
  { map: 'MP61', cfg: 'prone', stance: 'prone', push: 1, x: 834.59, z: 994.69, out: [0, -1], top: 61.44 },
  { map: 'MP1', cfg: 'prone', stance: 'prone', push: 1, x: 1360.21, z: 1368.16, out: [0, -1], top: 111.67 },
  { map: 'MP5', cfg: 'crouch', stance: 'crouch', push: 1, x: 591.88, z: 1373.13, out: [-0.938, 0.348], top: 153.63 },
  { map: 'MP5', cfg: 'stand-run', stance: 'stand', push: 1, x: 591.88, z: 1373.13, out: [-0.938, 0.348], top: 153.63 },
] as const;
const still = (forward: number) => ({ forward, right: 0, boost: false });
for (const c of FALLS) {
  describe.skipIf(!haveDisc(c.map))(`HOTFIX BRIDGE-WEDGE fold: ${c.map} ${c.cfg} off (${c.x}, ${c.z}) lands${haveDisc(c.map) ? '' : ' (SOCOM_DISC absent)'}`, () => {
    it('ends on a floor, not airborne and not under the map, as on main', () => {
      const map = simMapFromBytes(new Uint8Array(readFileSync(resolve(DISC, 'RUN', `${c.map}.ZDB`))), `RUN/${c.map}.ZDB`);
      const grid = groundGrid(map.ground!), polys = groundPolygons(map.ground!);
      const w = new Walker(grid), t = new Traversal(grid, polys);
      w.driver = t;
      expect(w.place(c.x - c.out[0] * 6, c.top + STEP_PROBE_LIFT_READING, c.z - c.out[1] * 6)).toBe(true);
      w.stance = c.stance;
      const yaw = (Math.atan2(-c.out[0], -c.out[1]) * 180) / Math.PI;
      w.state.yaw = yaw;
      let best = 0;
      w.driver = null;
      for (let k = 0; k < 8 && best < 1; k++) {
        const kept = w.saveState(), x0 = w.state.x, z0 = w.state.z;
        w.state.yaw = k * 45;
        for (let i = 0; i < 60; i++) w.tick(still(1));
        best = Math.max(best, Math.hypot(w.state.x - x0, w.state.z - z0));
        w.restoreState(kept);
      }
      w.driver = t;
      w.state.yaw = yaw;
      (w as unknown as { slide(x: number, z: number, fx: number, fz: number): unknown }).slide(w.state.x, w.state.z, w.state.x, w.state.z);
      let climbed = false;
      for (let i = 0; i < 120; i++) { w.tick(still(c.push)); if (t.active) { climbed = true; break; } }
      for (let i = 0; i < 300 && !climbed && (w.action !== null || w.airborne); i++) { w.tick(still(0)); if (t.active) climbed = true; }
      expect(climbed).toBe(false);
      expect(w.airborne).toBe(false);
      expect(w.state.y).toBeGreaterThan(c.top - 100);                // never through the world (MP61 fell to -4836.76)
      const floor = selectFloor(probeGround(grid, w.state.x, w.state.z), w.state.y + STEP_PROBE_LIFT_READING, w.state.y);
      expect(floor).not.toBeNull();
      expect(Math.abs(floor!.y - w.state.y)).toBeLessThan(0.5);
    }, 120_000);
  });
}

/**
 * MP72's `worldmodel/b2_wc03` (the reviews of 747f8863c and 1c594ffa4): a prone body dropped onto the floor at y 42.50 by
 * x 1082.29, z 1221.65-1222.85, rests at z 1223.07 on main and walks out; a longer reach (`agent/hotfix-bridge-wedge`'s
 * folds 2 and 3) carried it 5 through the face. Dropped from 30 above with the stick held at yaw 90, main keeps it at
 * z 1223.12 through its hard landing and walks it out along z 1223.07. HF2-slim's plain reach leaves both alone. Fixture.
 */
describe.skipIf(!MP72)(`HF2-slim: MP72's b2_wc03 drops stay where main leaves them${MP72 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  for (const z0 of [1221.65, 1222.25, 1222.85]) {
    it(`prone, dropped at (1082.29, 42.50, ${z0}): rests where dropped (main pushed it to z 1223.07)`, () => {
      const map = simMapFromBytes(MP72!, 'RUN/MP72.ZDB');
      const w = new Walker(map.grid);
      expect(w.place(1082.29, 42.5, z0)).toBe(true);
      w.stance = 'prone';
      w.setAirborne(true, 0);
      for (let i = 0; i < 90; i++) w.tick(still(0));
      expect(w.airborne).toBe(false);
      // SEGMENT-BODY: prone, a deep hit is the jam, never a push (D:L413602-413611); the face is 6.6-7.8 off (the disc's
      // radius 8 pushed it 0.22-1.42), so the feet are clear. The sibling below, the stick held at yaw 90, never passes
      // through the face. Was main's z 1223.07.
      expect(w.state.z).toBeCloseTo(z0, 1);
      expect(w.state.y).toBeCloseTo(42.5, 1);
    });
  }
  for (const z0 of [1221.65, 1222.25, 1222.85]) {
    it(`prone, dropped from 30 above (1082.29, 42.50, ${z0}) with the stick held at yaw 90: never through the face`, () => {
      const map = simMapFromBytes(MP72!, 'RUN/MP72.ZDB');
      const w = new Walker(map.grid);
      expect(w.place(1082.29, 42.5, z0)).toBe(true);
      w.stance = 'prone';
      w.state.yaw = 90;
      w.state.y = 72.5;
      w.setAirborne(true, 0);
      let maxZ = -Infinity;
      for (let i = 0; i < 120; i++) { w.tick(still(1)); if (!w.airborne) maxZ = Math.max(maxZ, w.state.z); }
      expect(w.airborne).toBe(false);
      expect(maxZ).toBeLessThan(1224.5);                            // main: z 1223.12, then along 1223.07
    });
  }
});

/**
 * The bound (5d, 2026-11-03): the push-out acts only on a body already inside geometry; a body with no penetration is
 * never touched. Walks on the fixtures' maps (MP2, MP6, MP72) from their spawn slots, every stance, eight headings, with
 * a jump in each, run in lockstep with the push-out on and off (`WEDGE_PUSH_OUT_ADAPTATION.on`, false = main's resolution):
 * the walker's state is identical, value for value, at every tick.
 */
const BOUND_MAPS = (['MP2', 'MP6', 'MP72'] as const).map((m) => [m, fixture(`RUN/${m}.ZDB`)] as const);
describe(`HF2-slim's bound: a healthy body is untouched by the wedge push-out`, () => {
  for (const [name, bytes] of BOUND_MAPS) {
    it.skipIf(!bytes)(`${name}: spawn-slot walks identical with the push-out on and off${bytes ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
      const map = simMapFromBytes(bytes!, `RUN/${name}.ZDB`);
      const starts = map.slots.slice(0, 4).map((s) => s.position);
      expect(starts.length).toBeGreaterThan(0);
      let compared = 0;
      for (const [x, y, z] of starts) for (const stance of ['stand', 'crouch', 'prone'] as const) for (let k = 0; k < 8; k++) {
        const pair = [true, false].map(() => {
          const w = new Walker(map.grid);
          w.place(x, y + STEP_PROBE_LIFT_READING, z);
          w.stance = stance;
          w.state.yaw = k * 45;
          return w;
        });
        for (let i = 0; i < 90; i++) {
          const input = { forward: 1, right: i % 30 < 15 ? 0 : 0.5, boost: false };
          const after = pair.map((w, n) => {
            WEDGE_PUSH_OUT_ADAPTATION.on = n === 0;
            if (i === 20 && stance === 'stand') w.jump();
            w.tick(input);
            return JSON.stringify([w.state, w.airborne, w.stance]);
          });
          WEDGE_PUSH_OUT_ADAPTATION.on = true;
          expect(after[0]).toBe(after[1]);
          compared++;
        }
      }
      expect(compared).toBeGreaterThan(1000);
    }, 120_000);
  }
});

/**
 * The review of 1c594ffa4 (D; probe and rows: agent-mail evidence gameplay/hotfix-bridge-wedge5): bodies dropped beside
 * tall wall faces. The face is `groundPolygons`' polygon `poly`; the start its vertex mean plus `side` x its horizontal
 * normal (the first three vertices' cross product) x `off`, placed on the floor under (the face's lowest y + 2 +
 * `STEP_PROBE_LIFT_READING`), the stance set, then dropped from that floor (`setAirborne(true, 0)`) at the walker's own
 * yaw and left at rest 150 ticks. On 1c594ffa4 (and since df48d0f32) MP9's ended airborne, MP1's floorless and MP51's
 * 105.9 under its start; each must end as on main c15928e75. Dev-disc.
 */
// SEGMENT-BODY (re-measured 2026-11-04, the merged tree; the dev disc): `rest` is where the segment arm leaves the two that
// moved, both on a floor and not airborne. MP9's prone drop stays on the floor it was laid on, y 161.32 -- a still prone
// body is jammed, never pushed (D:L413602-413611); the disc pushed it off that floor's edge to main's y 114.30. MP1's
// standing drop is put out off the face by the deep-hit rule along its facing (D:L415135-415161, D:L413602-413614) and
// ends on the floor 38 below main's, 13 further in z. Main's are kept beside them.
// R4B-09 (research 383): MP1's face is the same `land27/invis27` polygon, now 3288 -- r0004 hangs a new node with one
// polygon under `land18`, which comes before it in the list (OT.R97).
const FACE_DROPS = [
  { map: 'MP9', poly: 12898, side: 1, off: 0.5, stance: 'prone', main: [1801.22, 114.30, 1737.03], rest: [1807.30, 161.32, 1739.90], what: 'land_04/congo2_tree4' },
  { map: 'MP1', poly: 3288, side: 1, off: 0.5, stance: 'stand', main: [2228.66, 117.48, 2671.49], rest: [2226.98, 79.48, 2684.61], what: 'land27/invis27' },
  { map: 'MP1', poly: 3288, side: -1, off: 0.5, stance: 'prone', main: [2227.14, 116.40, 2673.63], what: 'land27/invis27' },
  { map: 'MP51', poly: 1358, side: 1, off: 0.5, stance: 'stand', main: [1525.56, 62.83, 635.38], what: 'wc06/window_frame' },
] as const;
for (const c of FACE_DROPS) {
  const at: readonly number[] = 'rest' in c ? c.rest : c.main;
  /** The drop beside the face, left at rest 150 ticks (above). */
  const drop = (): Walker => {
    const map = simMapFromBytes(new Uint8Array(readFileSync(resolve(DISC, 'RUN', `${c.map}.ZDB`))), `RUN/${c.map}.ZDB`);
    const grid = groundGrid(map.ground!), p = groundPolygons(map.ground!)[c.poly]!, pts = p.points, k = p.ptcount;
    let minY = Infinity, cx = 0, cz = 0;
    for (let i = 0; i < k; i++) { minY = Math.min(minY, pts[i * 3 + 1]!); cx += pts[i * 3]!; cz += pts[i * 3 + 2]!; }
    cx /= k; cz /= k;
    const ax = pts[3]! - pts[0]!, ay = pts[4]! - pts[1]!, az = pts[5]! - pts[2]!, bx = pts[6]! - pts[0]!, by = pts[7]! - pts[1]!, bz = pts[8]! - pts[2]!;
    let nx = ay * bz - az * by, nz = ax * by - ay * bx;
    const h = Math.hypot(nx, nz); nx /= h; nz /= h;
    const w = new Walker(grid);
    expect(w.place(cx + c.side * nx * c.off, minY + 2 + STEP_PROBE_LIFT_READING, cz + c.side * nz * c.off)).toBe(true);
    w.stance = c.stance;
    w.setAirborne(true, 0);
    for (let i = 0; i < 150; i++) w.tick(still(0));
    return w;
  };
  describe.skipIf(!haveDisc(c.map))(`HF2-slim: ${c.map} ${c.what}, ${c.stance}, side ${c.side}, ${c.off} off: ${'rest' in c ? 'the segment arm\'s rest' : 'as on main'}${haveDisc(c.map) ? '' : ' (SOCOM_DISC absent)'}`, () => {
    it(`rests at (${at.join(', ')}), on a floor, not airborne`, () => {
      const w = drop();
      expect(w.airborne).toBe(false);
      const floor = selectFloor(probeGround(w.grid, w.state.x, w.state.z), w.state.y + STEP_PROBE_LIFT_READING, w.state.y);
      expect(floor).not.toBeNull();
      expect(Math.abs(floor!.y - w.state.y)).toBeLessThan(0.5);
      expect(w.state.x).toBeCloseTo(at[0]!, 1);
      expect(w.state.y).toBeCloseTo(at[1]!, 1);
      expect(w.state.z).toBeCloseTo(at[2]!, 1);
    }, 120_000);
    // Fresh review 1's F9 (B203), corrected by fresh review 2's F1: a rest the segment arm moved is a new place, so the
    // owner's bar -- nobody stuck at the exploded bridge -- is asked of it: from the rest, turned to each of four facings,
    // 4 s of full stick ahead in the stance it rests in, and again after a real stand press (`changeStance`, the gate's
    // own answer, ticked until nothing is pending, then 1.5 s); a direction is clear when the body ends more than 8 (over
    // twice the radius 3.5) across the ground from its rest. Measured 2026-11-04: MP1's standing rest walks out at 90,
    // 180 and 270 (250-254 u). MP9's prone rest does not: it crawls 0.00 in all four -- the prone body against the face is
    // put back on every move with a hit (D:L413602-413611) -- and the stand press is forgotten for want of headroom
    // (`stanceGate('stand')` 'reset'), so it stays prone and no direction clears: stuck in every stance, where main
    // dropped it to y 114.30. LATER 687 (closed 2026-11-05): no player's route reaches the rest (the sweep below), so the
    // drop is a synthetic placement only. Pinned as measured, not as a gap: the original's answer there is not read.
    if ('rest' in c) {
      it(c.stance === 'prone'
        ? 'LATER 687: stuck at the rest -- the stand press is forgotten for headroom, and no direction clears, prone or after it'
        : 'walks out: from the rest, 4 s of full stick moves the body clear in two or more of four directions (stood up if it must)', () => {
        const press = (w: Walker): void => {
          w.changeStance('stand');
          for (let i = 0; i < 90 && w.pendingStance !== null; i++) w.tick(still(0));
          for (let i = 0; i < 90; i++) w.tick(still(0));
        };
        const clear = (stand: boolean): number[] => [0, 90, 180, 270].filter((yaw) => {
          const w = drop();
          if (stand) press(w);
          const x0 = w.state.x, z0 = w.state.z;
          w.state.yaw = yaw;
          for (let i = 0; i < 240; i++) w.tick(still(1));
          return Math.hypot(w.state.x - x0, w.state.z - z0) > 8;
        });
        const own = clear(false), stood = clear(true);
        if (c.stance === 'prone') {
          const w = drop();
          expect(w.stanceGate('stand'), 'no headroom: the press is forgotten').toBe('reset');
          press(w);
          expect(w.stance).toBe('prone');
          expect(w.pendingStance).toBeNull();
          expect(own, 'prone: the directions clear').toEqual([]);
          expect(stood, 'after the stand press: the directions clear').toEqual([]);
          return;
        }
        expect(own, `${c.stance}: the directions clear in its own stance`).toEqual([90, 180, 270]);
        expect(stood.length, `stood up: clear at ${stood.join(', ')}`).toBeGreaterThanOrEqual(2);
      }, 120_000);
    }
  });
}

/**
 * LATER 687 (closed 2026-11-05: unreachable). MP9's `land_04/congo2_tree4` rest (above) lies on the trunk's leaning face
 * (polygon 12898, n_y 0.79), 46 over the ground under it and 26-34 over the reachable ground at the trunk's west foot.
 * No climb takes a body onto the tree: every `congo2_tree4` polygon carries appflags 0, none `CLIMBABLE` (`climbClass`'s
 * table climbs only a contact flagged 1, 3, 4 or 5), so no climb is ever offered off it. A player's own moves were swept
 * from the ground on every side (12 bearings, 30 out; 276 routes: prone presses and crawls, stand and crouch walks
 * pressed into the trunk then prone, running jumps, dives; every climb offered taken -- none was; 2026-11-05, L-REPORT):
 * none reached the rest or stood on the tree. The uphill side's running jumps reach the lower floor but not the rest
 * (REVIEW-L-1: from 70 out at bearings 240-330, jumps pressed 30-55 out land on the tree's lower floor, y 150.4-152.7 by
 * polygons 12885-12889; walked, jumped and crawled on from there at 16 headings, none reached the rest or stuck). Held
 * here by the tree's flags, a light subset -- 12 bearings x four moves from 30 out -- and a control: a prone body
 * falling onto the rest from 10 above (no player's way in) reaches it and rests there.
 */
describe.skipIf(!haveDisc('MP9'))(`LATER 687: no player's route reaches MP9's congo2_tree4 rest${haveDisc('MP9') ? '' : ' (SOCOM_DISC absent)'}`, () => {
  const REST = [1807.30, 161.32, 1739.90] as const, AXIS = [1804, 1741] as const;
  const load = () => {
    const map = simMapFromBytes(new Uint8Array(readFileSync(resolve(DISC, 'RUN', 'MP9.ZDB'))), 'RUN/MP9.ZDB');
    return { grid: groundGrid(map.ground!), polys: groundPolygons(map.ground!) };
  };
  const terrain = (grid: Grid, x: number, z: number): number | null => {
    const ys = probeGround(grid, x, z).filter((h) => h.poly.path === 'worldmodel/land_04' && h.normal[1] > 0.5).map((h) => h.y);
    return ys.length ? Math.max(...ys) : null;
  };
  /** A route's watch: the ticks its feet stood on a floor of the tree, and whether it came within 3 of the rest. */
  const route = (grid: Grid, polys: WorldPoly[]) => {
    const w = new Walker(grid), t = new Traversal(grid, polys);
    w.driver = t;
    const seen = { tree: 0, rest: false };
    const step = (forward: number): void => {
      if (t.climbPrompt() !== null) t.action();                  // every climb offered, taken
      w.tick(still(forward));
      const s = w.state;
      const fl = w.airborne ? null : selectFloor(probeGround(grid, s.x, s.z), s.y + STEP_PROBE_LIFT_READING, s.y);
      if (fl && fl.poly.path.includes('congo2_tree4') && Math.abs(fl.y - s.y) < 1) seen.tree++;
      if (Math.hypot(s.x - REST[0], s.z - REST[2]) < 3 && Math.abs(s.y - REST[1]) < 3) seen.rest = true;
    };
    /** Placed on the ground `d` out at bearing `a`, facing the trunk's axis. */
    const start = (a: number, d: number): boolean => {
      const r = (a * Math.PI) / 180, x = AXIS[0] + Math.sin(r) * d, z = AXIS[1] + Math.cos(r) * d, g = terrain(grid, x, z);
      if (g === null || !w.place(x, g + STEP_PROBE_LIFT_READING, z)) return false;
      w.state.yaw = (Math.atan2(-(AXIS[0] - x), -(AXIS[1] - z)) * 180) / Math.PI;
      return true;
    };
    /** Full stick at the axis until within `d` of it or blocked (under 0.3 in 10 ticks), 3 s at most. */
    const approach = (d: number): void => {
      let x0 = w.state.x, z0 = w.state.z;
      for (let i = 0; i < 180 && Math.hypot(w.state.x - AXIS[0], w.state.z - AXIS[1]) > d; i++) {
        step(1);
        if (i % 10 === 9) { if (Math.hypot(w.state.x - x0, w.state.z - z0) < 0.3) return; x0 = w.state.x; z0 = w.state.z; }
      }
    };
    return { w, t, seen, step, start, approach };
  };
  const BEARINGS = Array.from({ length: 12 }, (_, i) => i * 30);

  it("no climb off the tree (every congo2_tree4 polygon's appflags 0), and none of 48 routes from 30 out reaches the rest or stands on the tree", () => {
    const { grid, polys } = load();
    const tree = polys.filter((p) => p.path.includes('congo2_tree4'));
    expect(tree.length).toBe(300);
    expect(tree.filter((p) => (p.appflags ?? 0) !== 0).length, 'tree polygons with a flag').toBe(0);
    expect(tree.some((p) => CLIMBABLE.has(p.appflags ?? 0)), 'a climbable tree polygon').toBe(false);
    const ends: string[] = [];
    let routes = 0;
    const moves: Record<string, (r: ReturnType<typeof route>) => void> = {
      'stand walk, prone, crawl': (r) => { r.approach(0); for (let i = 0; i < 60; i++) r.step(1); r.w.changeStance('prone'); for (let i = 0; i < 90; i++) r.step(0); for (let i = 0; i < 120; i++) r.step(1); },
      'crouch walk, prone, crawl': (r) => { r.w.stance = 'crouch'; r.approach(0); for (let i = 0; i < 60; i++) r.step(1); r.w.changeStance('prone'); for (let i = 0; i < 90; i++) r.step(0); for (let i = 0; i < 120; i++) r.step(1); },
      'running jump at 10': (r) => { r.approach(10); r.w.jump(); for (let i = 0; i < 120; i++) r.step(1); },
      'dive at 12': (r) => { r.approach(12); r.t.dive(r.w); for (let i = 0; i < 400 && r.t.inDive(); i++) r.step(1); for (let i = 0; i < 120; i++) r.step(1); },
    };
    for (const [name, move] of Object.entries(moves)) for (const a of BEARINGS) {
      const r = route(grid, polys);
      expect(r.start(a, name.startsWith('dive') ? 40 : 30)).toBe(true);
      routes++;
      move(r);
      for (let i = 0; i < 300 && (r.w.airborne || r.w.action !== null || r.t.active); i++) r.step(0);
      if (r.seen.tree > 0 || r.seen.rest) ends.push(`${name} from ${a}: ${r.seen.tree} ticks on the tree, rest ${r.seen.rest}`);
    }
    expect(routes).toBe(48);
    expect(ends, 'routes that reached the tree').toEqual([]);
  }, 120_000);

  it('the control: a prone body falling onto the rest from 10 above rests there, on the tree', () => {
    const { grid, polys } = load();
    const r = route(grid, polys);
    expect(r.w.place(REST[0], REST[1] + 3, REST[2])).toBe(true);
    Object.assign(r.w.state, { y: r.w.state.y + 10 });
    r.w.stance = 'prone';
    r.w.setAirborne(true, 0);
    for (let i = 0; i < 120; i++) r.step(0);
    expect(r.seen.tree).toBeGreaterThan(0);
    expect(r.seen.rest).toBe(true);
    expect(r.w.airborne).toBe(false);
  }, 120_000);
});

/**
 * The bound, widened (the review of 20c326dfb, finding 1): the push-out fired from `step` on every all-refused try,
 * floor refusals included, so healthy bodies on steep ground were moved -- MP6's `worldmodel/g156` (polygon 1053), a
 * standing body landing on the hillside 7 off the face at a depth of 0.012, and MP9's `worldmodel/land_36` (polygon 861),
 * a crouched body pressing into steep terrain at 0.089. Bodies dropped beside each face (both sides, 0.5 to 7 off, the
 * three stances, from the floor and from 7 above), left 30 ticks, then pressed toward the face for 60: their state is
 * identical with the push-out on and off at every tick. Dev-disc (MP6 from the fixtures when present).
 */
const STEEP = [
  { map: 'MP6', poly: 1053, what: 'g156' },
  { map: 'MP9', poly: 861, what: 'land_36' },
] as const;
const mapBytes = (m: string): Uint8Array | null => fixture(`RUN/${m}.ZDB`) ?? (haveDisc(m) ? new Uint8Array(readFileSync(resolve(DISC, 'RUN', `${m}.ZDB`))) : null);
for (const c of STEEP) {
  const bytes = mapBytes(c.map);
  describe.skipIf(!bytes)(`HF2-slim's bound: ${c.map} ${c.what}, healthy bodies beside steep faces are untouched${bytes ? '' : ' (no map data)'}`, () => {
    it('identical with the push-out on and off at every tick', () => {
      const map = simMapFromBytes(bytes!, `RUN/${c.map}.ZDB`);
      const grid = groundGrid(map.ground!), p = groundPolygons(map.ground!)[c.poly]!, pts = p.points, k = p.ptcount;
      let minY = Infinity, cx = 0, cz = 0;
      for (let i = 0; i < k; i++) { minY = Math.min(minY, pts[i * 3 + 1]!); cx += pts[i * 3]!; cz += pts[i * 3 + 2]!; }
      cx /= k; cz /= k;
      const ax = pts[3]! - pts[0]!, ay = pts[4]! - pts[1]!, az = pts[5]! - pts[2]!, bx = pts[6]! - pts[0]!, by = pts[7]! - pts[1]!, bz = pts[8]! - pts[2]!;
      let nx = ay * bz - az * by, nz = ax * by - ay * bx;
      const h = Math.hypot(nx, nz); nx /= h; nz /= h;
      let compared = 0;
      for (const side of [1, -1]) for (const off of [0.5, 1.2, 2, 3.2, 5, 7]) for (const stance of ['stand', 'crouch', 'prone'] as const) for (const dy of [0, 7]) {
        const x = cx + side * nx * off, z = cz + side * nz * off, yaw = (Math.atan2(side * nx, side * nz) * 180) / Math.PI;
        const pair = [0, 1].map(() => {
          const w = new Walker(grid);
          if (!w.place(x, minY + 2 + STEP_PROBE_LIFT_READING, z)) return null;
          w.stance = stance; w.state.y += dy; w.setAirborne(true, 0);
          return w;
        });
        if (!pair[0] || !pair[1]) continue;
        for (let i = 0; i < 90; i++) {
          const after = pair.map((w, n) => {
            WEDGE_PUSH_OUT_ADAPTATION.on = n === 0;
            if (i === 30) w!.state.yaw = yaw;
            w!.tick(still(i < 30 ? 0 : 1));
            return JSON.stringify([w!.state, w!.airborne, w!.stance]);
          });
          WEDGE_PUSH_OUT_ADAPTATION.on = true;
          expect(after[0], `${c.map} side ${side} off ${off} ${stance} dy ${dy} tick ${i}`).toBe(after[1]);
          compared++;
        }
      }
      expect(compared).toBeGreaterThan(1000);
    }, 120_000);
  });
}

/**
 * The cost cut's pin (f9's MP2 cells on 20c326dfb, bot step p99 +2.6%): the air pass shares the airborne tick's one
 * floor pick with `fall` instead of making its own. Every walker state must stay as it was: walks from MP2's spawn slots in
 * three stances, the stick and the facing redrawn every 45 ticks from a fixed sequence, a jump now and then, hashed every
 * 50 ticks -- the hash is f9ffb6828's (before the cut), so any change of state turns it red.
 */
const MP2 = fixture('RUN/MP2.ZDB');
describe.skipIf(!MP2)(`HF2-slim's cost cut leaves every walker state as it was${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it("the segment arm's MP2 walk hash", async () => {
    const { createHash } = await import('node:crypto');
    const map = simMapFromBytes(MP2!, 'RUN/MP2.ZDB');
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const walkers: Walker[] = [];
    for (const s of map.slots) for (const st of ['stand', 'crouch', 'prone'] as const) {
      const w = new Walker(map.grid);
      if (w.place(s.position[0], s.position[1] + 5.5, s.position[2])) { w.stance = st; walkers.push(w); }
    }
    const inputs = walkers.map(() => ({ forward: 1, right: 0, boost: false }));
    const hash = createHash('sha256');
    let airborne = 0, launched = 0, stood = 0;
    for (let t = 0; t < 1000; t++) {
      for (let i = 0; i < walkers.length; i++) {
        const w = walkers[i]!;
        if (t % 45 === 0) { inputs[i] = { forward: rnd() < 0.7 ? 1 : 0, right: rnd() < 0.3 ? 1 : 0, boost: false }; w.state.yaw = rnd() * 360; }
        if (t % 97 === i % 97 && w.stance === 'stand' && w.jump()) { if (w.action?.name === 'launch') launched++; else stood++; }
        w.tick(inputs[i]!);
        airborne += +w.airborne;
      }
      if (t % 50 === 0) for (const w of walkers) hash.update(JSON.stringify(w.state));
    }
    expect(airborne).toBeGreaterThan(1000);                        // the air pass runs, often
    const digest = hash.digest('hex');
    // SEGMENT-BODY: the segment arm's walkers (`airWalls` is the disc arm's: this pins the segment walker's state, not
    // HF2-slim's cost cut), re-measured on the merged tree 2026-11-04. Was f9ffb6828's 813cf01c..., the disc arm.
    // SEGMENT-BODY part 2 (the weapon line, research 86 s3.8) re-measured it with the r0001 reading's contact gate: of the
    // walk's 499 jumps 217 launched and 282 stood (7ade854e...; 312 and 187 before the line). Part 4 (2026-11-04): the
    // r0004 jump-near-wall capture proved the running jump reads no stored contact (`JUMP_CONTACT_PROVEN` 'none'), so
    // only the speed decides: 339 launch and 160 stand (8ed3ea02...). Part 6 (2026-11-04, LATER 676): the speed is the
    // clip's, before the walls cut it (`FUN_0057e1b0` D:L440812-440814; ac's r0004 ditch capture): 383 and 116, the hash
    // re-measured. R4B-12 (2026-11-05) moved it to 0a7b0923... with r0004's forward-only standing jump; OT.R108 (the
    // owner, 2026-11-06) rejected that segment and the air control is kept, so the hash is Part 6's again, re-measured.
    expect([launched, stood]).toEqual([383, 116]);
    expect(digest).toBe('c2b30349ff5ef7ca715d45c59f6264c5464645b4d6f96abe85c821c28732ceb5');
  }, 120_000);
});

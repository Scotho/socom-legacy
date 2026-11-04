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
    expect(w.state.z).toBeCloseTo(-BODY_RADIUS, 3);
  });

  it('a fin whose top is under the low line on both sides of the crossing is passed over', () => {
    const { w, crossing } = fallAt(finWorld(8), 15, -2.5);
    expect(crossing.y1 + low).toBeGreaterThan(8);
    expect(crossing.z1).toBeGreaterThan(0);
    expect(w.state.z).toBeGreaterThan(BODY_RADIUS);
  });

  it('a still airborne body in front of a fin is not moved in the air (no air push-out), and stands off the fin on landing', () => {
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
    expect(w.state.z).toBeCloseTo(-BODY_RADIUS, 3);
  });

  it("a fall crossing the fin's BACK face is not stopped by the airborne pass (research 281 s4.3: one-sided)", () => {
    // From +z, carried -z: the fin's own face is toward -z, so the body meets it from behind. The tick-start lines are
    // over the top (the port's slide, as before); the post-fall lines meet only a back face, which no segment hits.
    const { w, crossing } = fallAt(finWorld(20), 15, 2.5, -60);
    expect(crossing.y1 + low).toBeLessThan(20);
    expect(crossing.z1).toBeLessThan(0);                           // carried across, as on main
    expect(w.state.z).toBeLessThan(-BODY_RADIUS);
  });

  it('a fall carried over a rim lands on the rim, not pushed back: the walls are met at the feet the pick puts on it', () => {
    // A block 10 tall from z 0 on (its face toward -z, its top a floor). Carried 1.5 a tick from z -4, the third tick
    // crosses z 0 and is the flight's first game frame: the feet 5 -> 1.6, the low line 11.5 (over the face's top) -> 8.1
    // (under it), and the pick from 5 + STEP_PROBE_LIFT_READING finds the top at 10.
    const grid = world([
      floor0(),
      quad([50, 0, 0, -50, 0, 0, -50, 10, 0, 50, 10, 0], 2, 'worldmodel/rim'),
      quad([-50, 10, 0, -50, 10, 100, 50, 10, 100, 50, 10, 0], 3, 'worldmodel/rimTop'),
    ]);
    const w = new Walker(grid);
    expect(w.place(0, 1, -4)).toBe(true);
    Object.assign(w.state, { x: 0, y: 5, z: -4, vx: 0, vz: 90 });
    w.setAirborne(true, -100);
    let crossing = NaN;
    for (let i = 0; i < 6 && w.airborne; i++) {
      const before = w.state.z;
      w.tick({ forward: 0, right: 0, boost: false });
      if (before < 0 && before + 1.5 > 0) crossing = i;
    }
    expect(crossing).toBe(2);
    expect(w.airborne).toBe(false);
    expect(w.state.y).toBeCloseTo(10, 3);                          // on the rim
    expect(w.state.z).toBeGreaterThan(0);
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
    it(`prone, dropped at (1082.29, 42.50, ${z0}): rests at z 1223.07, as on main`, () => {
      const map = simMapFromBytes(MP72!, 'RUN/MP72.ZDB');
      const w = new Walker(map.grid);
      expect(w.place(1082.29, 42.5, z0)).toBe(true);
      w.stance = 'prone';
      w.setAirborne(true, 0);
      for (let i = 0; i < 90; i++) w.tick(still(0));
      expect(w.airborne).toBe(false);
      expect(w.state.z).toBeCloseTo(1223.07, 1);
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
const FACE_DROPS = [
  { map: 'MP9', poly: 12898, side: 1, off: 0.5, stance: 'prone', main: [1801.22, 114.30, 1737.03], what: 'land_04/congo2_tree4' },
  { map: 'MP1', poly: 3287, side: 1, off: 0.5, stance: 'stand', main: [2228.66, 117.48, 2671.49], what: 'land27/invis27' },
  { map: 'MP1', poly: 3287, side: -1, off: 0.5, stance: 'prone', main: [2227.14, 116.40, 2673.63], what: 'land27/invis27' },
  { map: 'MP51', poly: 1358, side: 1, off: 0.5, stance: 'stand', main: [1525.56, 62.83, 635.38], what: 'wc06/window_frame' },
] as const;
for (const c of FACE_DROPS) {
  describe.skipIf(!haveDisc(c.map))(`HF2-slim: ${c.map} ${c.what}, ${c.stance}, side ${c.side}, ${c.off} off: as on main${haveDisc(c.map) ? '' : ' (SOCOM_DISC absent)'}`, () => {
    it(`rests at (${c.main.join(', ')}), on a floor, not airborne`, () => {
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
      expect(w.airborne).toBe(false);
      const floor = selectFloor(probeGround(grid, w.state.x, w.state.z), w.state.y + STEP_PROBE_LIFT_READING, w.state.y);
      expect(floor).not.toBeNull();
      expect(Math.abs(floor!.y - w.state.y)).toBeLessThan(0.5);
      expect(w.state.x).toBeCloseTo(c.main[0], 1);
      expect(w.state.y).toBeCloseTo(c.main[1], 1);
      expect(w.state.z).toBeCloseTo(c.main[2], 1);
    }, 120_000);
  });
}

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
  it('MP2 walks hash to f9ffb6828', async () => {
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
    let airborne = 0;
    for (let t = 0; t < 1000; t++) {
      for (let i = 0; i < walkers.length; i++) {
        const w = walkers[i]!;
        if (t % 45 === 0) { inputs[i] = { forward: rnd() < 0.7 ? 1 : 0, right: rnd() < 0.3 ? 1 : 0, boost: false }; w.state.yaw = rnd() * 360; }
        if (t % 97 === i % 97 && w.stance === 'stand') w.jump();
        w.tick(inputs[i]!);
        airborne += +w.airborne;
      }
      if (t % 50 === 0) for (const w of walkers) hash.update(JSON.stringify(w.state));
    }
    expect(airborne).toBeGreaterThan(1000);                        // the air pass runs, often
    const digest = hash.digest('hex');
    expect(digest).toBe('813cf01c0e66e8796fa772bea2cfe9308b0741905b7a4029cbfd54e9505275bd');
  }, 120_000);
});

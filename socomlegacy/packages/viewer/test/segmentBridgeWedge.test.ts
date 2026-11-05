// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildGrid, isWallSurface, probeGround, segmentHits, type Grid, type WorldPoly } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { simMapFromBytes } from '../src/simMap';
import { WorldState } from '../src/worldState';
import { BODY_RADIUS, wallProbeHeights, Walker } from '../src/mover';

/**
 * SEGMENT-BODY's own bridge-wedge cases (moved here from the branch's bridgeWedge.test.ts at the merge of main, which
 * keeps main's HF2-slim file under that name). BRIDGE-WEDGE (Trello c22ltqhr; research 217 §2.8). The walls in the air, every tick, against the feet after the fall's
 * step. The original's frame displacement `+0xf44` carries the fall: in `Jump launch` / `Jump fall` (actions 8, 9) the
 * local velocity is (0, -`+0x133c`, 0) (`FUN_0054d9a0` D:L416501-416514), `+0xf44` is it times dt (D:L416520), the carried
 * velocity's dt added across (D:L416524-416530); `FUN_0054aa30` casts its segments from the feet + `step_height` along
 * that displacement, normalised in three axes (D:L415157-415166, D:L415401-415410), and `FUN_005483d0` resolves them on
 * every tick, in the air too (`FUN_005506a0` D:L417822-417826). So a face whose top the probe line passes on its way
 * down is met the tick it does. The port's airborne sub-step met the walls only at the tick-start lines; the fall then
 * dropped the feet with no wall test (`AIR_WALL_HEIGHTS_READING`).
 */

const quad = (pts: number[], ditype: number, path: string): WorldPoly => ({
  modelName: 'worldmodel', path, region: 0, ditype, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from(pts),
});

/**
 * A floor at y 0 and a thin fin on z 0 from x -50 to 50, `top` tall, its one face toward -z (Crossroads' rubble fin).
 * SEGMENT-BODY: wound so its own normal (Newell's) is -z -- before it, the quad was wound +z, which the disc's two-sided
 * contacts never told apart; a hull face is hit only from its front (research 281 s4.3).
 */
function finWorld(top: number): Grid {
  const polys = [
    quad([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200], 3, 'worldmodel/floor'),
    quad([50, 0, 0, -50, 0, 0, -50, top, 0, 50, top, 0], 2, 'worldmodel/fin'),
  ];
  const owners = polys.map((p, first) => ({ modelName: p.modelName, path: p.path, first, count: 1 }));
  return buildGrid({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 }, [], [], polys, owners);
}

/**
 * Airborne at (0, `feet`, `z0`), falling at 90 and carried +z at 60 (a unit a tick); the stick at rest. The flight's
 * game frames fall on its third, fifth, ... ticks (`airClock`), so from z -2.5 the third tick is the one that crosses
 * the fin's plane, and it is a frame's: the feet 15 -> 11.74, the low line 21.5 -> 18.24.
 */
function fallAt(top: number, feet: number, z0: number): { w: Walker; crossing: { y0: number; y1: number; z1: number } } {
  const w = new Walker(finWorld(top));
  expect(w.place(0, 1, z0)).toBe(true);
  Object.assign(w.state, { x: 0, y: feet, z: z0, vx: 0, vz: 60 });
  w.setAirborne(true, -90);
  let crossing = { y0: NaN, y1: NaN, z1: NaN };
  for (let i = 0; i < 60; i++) {
    const y0 = w.state.y, before = w.state.z;
    w.tick({ forward: 0, right: 0, boost: false });
    if (before < 0 && Number.isNaN(crossing.y0) && before + 1 > 0) crossing = { y0, y1: w.state.y, z1: w.state.z };
  }
  return { w, crossing };
}

describe('SEGMENT-BODY bridge wedge: the segments meet the walls in the air along the fall (WALL_BODY_READING segments)', () => {
  const [low] = wallProbeHeights('stand');

  it("a fin whose top the low line passes on the crossing tick's frame stops the body on its own side", () => {
    // SEGMENT-BODY (re-judged): on the frame that would carry the feet 15 -> 11.74 and across the plane, the segments
    // along that slanted displacement cross the fin's front -- three hits, the deepest over 1: the jam rule zeroes the
    // move across (`FUN_005483d0` D:L413602-413611; the height is the altitude's, `AIR_HEIGHT_READING`), and the carried velocity loses its part
    // into the face (D:L413588-413594). The body falls straight on from 0.5 short of the plane and lands there (was
    // the disc's 3.5: `BODY_RADIUS`, the port's stand-off).
    const top = 20;
    const { w } = fallAt(top, 15, -2.5);
    expect(w.airborne).toBe(false);
    expect(w.state.y).toBeCloseTo(0, 6);
    expect(w.state.z).toBeLessThan(0);
    expect(w.state.z).toBeCloseTo(-0.5, 3);
  });

  it('a fin whose top is under the low line on both sides of the crossing is passed over: the segments start at the feet + step_height', () => {
    const top = 8;                                                // under 11.74 + 6.5 and 15 + 6.5
    const { w, crossing } = fallAt(top, 15, -2.5);
    expect(crossing.y1 + low).toBeGreaterThan(top);
    expect(crossing.z1).toBeGreaterThan(0);
    expect(w.state.z).toBeGreaterThan(BODY_RADIUS);
  });

  it('a body falling straight down beside a fin is not put out: its segments run down along the fall', () => {
    // SEGMENT-BODY (re-judged): the displacement is the fall alone, so the direction is straight down and the side
    // vector (-dz, 0, dx) is none (`FUN_0054aa30` D:L415157-415181): no segment crosses the fin, and the body lands 1 off
    // it. The disc put it out to 3.5 in the air (`AIR_WALL_HEIGHTS_READING`'s second resolution, the disc's stand-off).
    const top = 20;
    const w = new Walker(finWorld(top));
    expect(w.place(0, 1, -1)).toBe(true);
    Object.assign(w.state, { x: 0, y: 15, z: -1, vx: 0, vz: 0 });
    w.setAirborne(true, -90);
    for (let i = 0; i < 30; i++) {
      w.tick({ forward: 0, right: 0, boost: false });
      if (w.airborne) expect(w.state.z).toBe(-1);
    }
    expect(w.airborne).toBe(false);
    expect(w.state.z).toBe(-1);
    expect(low).toBe(6.5);
  });
});

const MP72 = fixture('RUN/MP72.ZDB');

/**
 * The playtest's case (2026-11-01, `game_MP72_3201`, player 6, ticks 95100-95116): with `terrorist_demo_1`'s arch
 * destroyed, a running jump off the deck comes down at (1676.4, 84.3, 1419.3), v (8.9, -84.8, 64.4), over the rubble's
 * fin (`arch=arch/destroyed`, the plane z 1422.31, its face toward -z, top 80.5 at x 1676.8) into the slot between it
 * and `destroyed/dia`'s face at z 1425.33 -- 3.02 wide, the floor 57.6 -- and stands wedged at (1675.8, 57.6, 1422.8).
 */
describe.skipIf(!MP72)(`SEGMENT-BODY bridge wedge on Crossroads with terrorist_demo_1 destroyed (the segment path)${MP72 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const world = () => {
    const map = simMapFromBytes(MP72!, 'RUN/MP72.ZDB');
    const w = new WorldState(map.meta!, map.ground, map.grid);
    w.skipEffects = true;
    w.applyInitial();
    expect(w.executeAction('terrorist_strike1')).toBe(true);
    return map.grid;
  };
  const fall = (grid: Grid) => {
    const w = new Walker(grid);
    expect(w.place(1676.4, 100, 1419.3)).toBe(true);
    Object.assign(w.state, { x: 1676.4, y: 84.3, z: 1419.3, vx: 8.9, vz: 64.4, yaw: 190.57 });
    w.setAirborne(true, -84.8);
    const path: [number, number, number][] = [];
    for (let i = 0; i < 30; i++) { w.tick({ forward: 0, right: 0, boost: false }); path.push([w.state.x, w.state.y, w.state.z]); }
    return { w, path };
  };

  it("the slot is the disc's: the fin and dia's face 3.02 apart at both lines, the fin's top under the feet where the fall crosses it", () => {
    const grid = world();
    const [low] = wallProbeHeights('stand');
    const at = (y: number) => segmentHits(grid, [1675.8, y, 1418], [1675.8, y, 1428], isWallSurface).map((h) => +h.point[2].toFixed(2));
    expect(at(57.6 + low)).toEqual([1422.31, 1425.33]);
    expect(1425.33 - 1422.31).toBeLessThan(2 * BODY_RADIUS);
    expect(at(80)).toContain(1422.31);
    expect(at(81)).not.toContain(1422.31);                         // the fin's top: between 80 and 81
    const floor = probeGround(grid, 1675.8, 1423.8).map((h) => +h.y.toFixed(1));
    expect(floor).toContain(57.6);
    // The fall crosses z 1422.31 with its feet at 81.2: over the fin's top, so no line meets it (the original's segments
    // start at the feet + step_height, D:L415401-415410) -- the entry is the original's too, at this reading.
    const { path } = fall(grid);
    const cross = path.findIndex(([, , z]) => z > 1422.31);
    expect(path[cross]![1]).toBeGreaterThan(80.5);
  });

  it("the fall comes over the fin, meets dia's face and is put back out past the fin's back: it lands on the fin's -z side", () => {
    // SEGMENT-BODY (re-judged; was "the fall lands in the slot", the disc's). In the air a hit puts the displacement out
    // by the segment end's depth behind the face (`FUN_005483d0` D:L413543-413556, the jump's and the knock's actions),
    // and the depth less 1 again when the deepest is over 1 with two hits or fewer (D:L413612-413614): dia's face, met
    // from in front over the slot, carries the body back -z through the fin's back -- a face crossed from behind, no hit
    // (research 281 s4.3) -- and it lands on the floor at 57.48 before the fin. Research 217 s2.8's "the original lands
    // there too" read the entry, not this push; owed the capture (research 213 s3 item 2, H94).
    const { w, path } = fall(world());
    expect(path.some(([, , z]) => z > 1422.31)).toBe(true);        // over the fin's plane in the air
    expect(w.airborne).toBe(false);
    expect(w.state.y).toBeCloseTo(57.48, 1);
    expect(w.state.z).toBeLessThan(1422.31);
  });

  // LATER 283, LATER 620 (SEGMENT-BODY, the acceptance): the original's body is its segments, not a disc, and a hull hit is
  // one-sided (research 281 §4.3): in the slot its centre and side lines run along x (or meet dia's face from in front,
  // which takes only the move's z and puts it out by the depth less 1), and -z its lines cross the fin from behind, no
  // hit. The disc of 3.5 could not stand in 3.02 and the crossing guard refused every push: it stood. Placed where the
  // playtest's body stood (1675.8, 57.6, 1422.8).
  const inSlot = (grid: Grid, yaw: number) => {
    const w = new Walker(grid);
    expect(w.place(1675.8, 60, 1422.8)).toBe(true);
    expect(w.state.y).toBeCloseTo(57.6, 1);
    w.state.yaw = yaw;
    for (let i = 0; i < 120; i++) w.tick({ forward: 1, right: 0, boost: false });
    return w;
  };
  it('LATER 283: from the slot the body walks out along it (+x) within 2 s', () => {
    expect(inSlot(world(), 270).state.x).toBeGreaterThan(1680);        // facing +x
  });
  it('LATER 620: from the slot the body walks out -z through the fin, met from behind', () => {
    expect(inSlot(world(), 0).state.z).toBeLessThan(1415);             // facing -z
  });
});

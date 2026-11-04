import { describe, expect, it } from 'vitest';
import { buildGrid, type WorldPoly } from '@s2u/scene';
import { BODY_RADIUS, PRONE_FAN_READING, PRONE_PROBE_TILT_READING, WALL_END_CONTACT_READING, WALL_PROBE_READING, Walker } from '../src/mover';

/**
 * MV-PARITY (b2), the review's F1: a body walking past a face's END with less than the radius to spare. While the end
 * is nearest the end's hit takes the face's own normal (`WALL_END_CONTACT_READING`) and removes nothing from a move
 * along the face (`FUN_005483d0` D:L413557-413567), so nothing moves the body sideways; once its centre is past the
 * end the face's interior is nearest and the port's stand-off (`WALL_PROBE_READING`, its disc of `r`) puts it out to
 * `r` in one tick -- a sideways pop of `r` less the clearance (1.5 at z 2). The old push off the corner spread it over
 * three ticks. The original has no stand-off there: its clip moves nothing along the face, its fan's segments run
 * parallel to it, and it walks on at the clearance it had. So the pop is the disc stand-off's, named in
 * `WALL_PROBE_READING`'s ledger row; a stand-off taken along the end's normal (tried in this fold) smoothed it but left
 * M51's capture-backed ditch hold (`m51DitchBlock.disc.test.ts`) jittering in and out of contact, the velocity unclipped
 * (65) every third tick. The smoothness case below is held as `it.fails` until the stand-off is the original's
 * (LATER 283's segment probe). A free-standing slab: two faces back to back on z 0 from x 10 to 60.
 */
const quad = (pts: number[], ditype: number, path: string): WorldPoly => ({
  modelName: 'worldmodel', path, region: 0, ditype, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from(pts),
});

function slabWorld() {
  const polys = [
    quad([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200], 3, 'worldmodel/floor'),
    quad([10, 0, 0, 60, 0, 0, 60, 30, 0, 10, 30, 0], 2, 'worldmodel/slab_n'),   // facing +z
    quad([60, 0, 0, 10, 0, 0, 10, 30, 0, 60, 30, 0], 2, 'worldmodel/slab_s'),   // facing -z
  ];
  const owners = polys.map((p, first) => ({ modelName: p.modelName, path: p.path, first, count: 1 }));
  return buildGrid({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 }, [], [], polys, owners);
}

function walkPast(z0: number) {
  const w = new Walker(slabWorld());
  expect(w.place(-10, 10, z0)).toBe(true);
  w.state.yaw = -90;                                               // facing +x
  let worst = 0;
  for (let i = 0; i < 60; i++) {
    const z = w.state.z;
    w.tick({ forward: 1, right: 0, boost: false });
    worst = Math.max(worst, Math.abs(w.state.z - z));
  }
  return { w, worst };
}

describe("MV-PARITY (b2) F1: walking past a face's end with less than the radius to spare", () => {
  for (const z0 of [2, -2, 3]) {
    it(`at z ${z0}: walks on along the slab, on its own side, at the stand-off; the pop is r less the clearance`, () => {
      const { w, worst } = walkPast(z0);
      expect(w.state.x).toBeGreaterThan(30);
      expect(Math.abs(w.state.z)).toBeCloseTo(BODY_RADIUS, 3);
      expect(Math.sign(w.state.z)).toBe(Math.sign(z0));
      expect(worst).toBeCloseTo(BODY_RADIUS - Math.abs(z0), 3);    // WALL_PROBE_READING's gap, named
    });
  }
  it.fails("GAP (WALL_PROBE_READING): no tick's sideways move outruns the walk itself (65 / 60)", () => {
    expect(walkPast(2).worst).toBeLessThan(65 / 60);
  });
});

/**
 * The B194 merge seam (MV-PARITY b2 x PRONE-TILT-2, `faceOfPush` in `mover.ts`): the tilted prone low line's push
 * (`Walker.tiltedAhead`) is a face hit along the wall's normal, as the level line's is, so its normal joins the slide's
 * face hits before the face ends' pass: an end met in the same pass clips the move less that face's part, the hits taken
 * one after another (`FUN_005483d0` D:L413533-413597, each removing the move's part along its normal, D:L413557-413567).
 * The scene: a 20-degree slope rising along +x; wall A across x 50 facing the crawl (-x); wall B slanted, its end at
 * (42, 1) and running away to +z at 70 degrees from -x, facing the body. A prone body laid on the slope, its root's tilt
 * settled, crawls +x until A's tilted line holds it 8 out along the travel, then turns toward +z: each tick the hold's
 * distance from A changes (8 along a turning travel), so the move keeps a part along A's normal, while the body slides
 * along A into B's end, within the prone disc's 3.12 (`PRONE_FAN_READING` across x r 8). Pinned: the port's own output
 * with the seam, written when the test was (the reading, pending review); without it the end clip took the move with A's
 * part in it and the crawl ended 0.52 away.
 */
describe('the B194 merge seam: a tilted prone push and a face end in the same pass', () => {
  const K = Math.tan(20 * Math.PI / 180);
  const slopeX = (): WorldPoly => quad([-200, -200 * K, -200, 200, 200 * K, -200, 200, 200 * K, 200, -200, -200 * K, 200], 3, 'worldmodel/slope');
  /** A vertical wall from a to b (x, z), wound so its normal ((p1 - p0) x (p2 - p1)) faces `toward`. */
  const wall = (a: [number, number], b: [number, number], toward: [number, number], path: string): WorldPoly => {
    const n = [b[1] - a[1], -(b[0] - a[0])], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const [p, q] = (toward[0] - mid[0]!) * n[0]! + (toward[1] - mid[1]!) * n[1]! < 0 ? [b, a] : [a, b];
    return quad([p[0], -150, p[1], p[0], 150, p[1], q[0], 150, q[1], q[0], -150, q[1]], 2, path);
  };
  const END: [number, number] = [42, 1], PHI = 70 * Math.PI / 180;
  const grid = () => {
    const polys = [slopeX(), wall([50, -150], [50, 150], [0, 0], 'worldmodel/a'),
      wall(END, [END[0] - 30 * Math.cos(PHI), END[1] + 30 * Math.sin(PHI)], [0, 0], 'worldmodel/b')];
    const owners = polys.map((p, first) => ({ modelName: p.modelName, path: p.path, first, count: 1 }));
    return buildGrid({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 }, [], [], polys, owners);
  };

  it('the clipped move: the crawl along A into B\'s end, A\'s part taken first', () => {
    expect(WALL_END_CONTACT_READING).toBe('face-normal');
    expect(PRONE_PROBE_TILT_READING).toBe('root');
    const disc = WALL_PROBE_READING.prone.r * PRONE_FAN_READING.across;
    expect(disc).toBeCloseTo(3.12, 9);
    const w = new Walker(grid());
    expect(w.place(30, 40, 0)).toBe(true);
    w.stance = 'prone';
    w.state.yaw = -90;                                             // facing +x
    for (let i = 0; i < 60; i++) w.tick({ forward: 0, right: 0, boost: false });   // laid on the slope
    let q0: number[] = [];
    for (let i = 0; i < 120; i++) {                                // the crawl into A's hold
      w.tick({ forward: 1, right: 0, boost: false });
      if (i === 100) q0 = [...w.rootTilt.q!];
    }
    const q = w.rootTilt.q!;
    expect(q.some((v, i) => Math.abs(v) > 0.05 && i < 3)).toBe(true);              // tilted: on the slope
    for (let i = 0; i < 4; i++) expect(q[i]).toBeCloseTo(q0[i]!, 6);              // and settled
    expect(w.state.x).toBeCloseTo(42, 3);                          // held 8 out from A along the travel
    let nearest = Infinity;
    const at: number[][] = [];
    for (let i = 0; i < 180; i++) {                                // the turn toward +z, along A into B's end
      w.state.yaw -= 0.25;
      w.tick({ forward: 1, right: 0, boost: false });
      nearest = Math.min(nearest, Math.hypot(w.state.x - END[0], w.state.z - END[1]));
      if (i === 11 || i === 179) at.push([w.state.x, w.state.z]);
    }
    expect(nearest).toBeLessThan(disc);                            // B's end within the prone disc
    // The first tick the tilted push and B's end share a pass (the turn's 12th), and where the crawl ends: the port's
    // own output with the seam (reading, pending review). Without it: about (41.998, -2.113), then 0.52 away at the end.
    expect(at[0]![0]).toBeCloseTo(42.0006, 3);
    expect(at[0]![1]).toBeCloseTo(-2.1121, 3);
    expect(at[1]![0]).toBeCloseTo(44.3431, 3);
    expect(at[1]![1]).toBeCloseTo(14.6883, 3);
  });
});

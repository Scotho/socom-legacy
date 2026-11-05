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
 * (65) every third tick. The smoothness case was held as `it.fails` until the stand-off was the original's (LATER 283's
 * segment probe); SEGMENT-BODY builds it (below). A free-standing slab: two faces back to back on z 0 from x 10 to 60.
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

/**
 * SEGMENT-BODY (re-judged; research 217 s2.9): the disc's end clip and its stand-off pop are gone. Walking past the slab
 * the side line on its side, from 0.3 r to 1.2 r across the travel (1.05 to 4.2, D:L415171-415220, D:L415549-415577),
 * crosses the slab's near face from in front once the body is within 4.2 of it; the hit takes nothing from a move along
 * the face (its normal is across it) and, more than 1 deep, puts the body out by the depth less 1 (D:L413612-413614):
 * it walks on 4.2 - 1 = 3.2 off (was `BODY_RADIUS`). From z 3 that is 0.2 out; from 2, 1.2 in one tick.
 */
const SIDE_HOLD = 1.2 * BODY_RADIUS - 1;
describe("MV-PARITY (b2) F1: walking past a face's end with less than the radius to spare", () => {
  for (const z0 of [2, -2, 3]) {
    it(`at z ${z0}: walks on along the slab, on its own side, put out to its side line's reach less 1`, () => {
      const { w, worst } = walkPast(z0);
      expect(w.state.x).toBeGreaterThan(30);
      expect(Math.abs(w.state.z)).toBeCloseTo(SIDE_HOLD, 3);
      expect(Math.sign(w.state.z)).toBe(Math.sign(z0));
      expect(worst).toBeCloseTo(SIDE_HOLD - Math.abs(z0), 3);
    });
  }
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

  // SEGMENT-BODY (re-judged): the seam was the disc's (`faceOfPush`, the end clip); under the segment body the crawl is held
  // where its head line along the facing (1.1 x 14.49 = 15.94, lifted through the root, D:L415531-415535) first crosses A
  // -- prone, one hit over 1 deep is the jam (D:L413602-413611) -- and the turn toward +z slides it along A to B, through
  // neither face. Was: held 8 out (the disc's line ahead), the port's own positions after the turn pinned.
  it('the clipped move: the crawl held off A, then along A to B, through neither', () => {
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
    expect(50 - w.state.x).toBeGreaterThan(1.1 * 14.49 - 0.5);    // held off A by the head line
    expect(50 - w.state.x).toBeLessThan(1.1 * 14.49 + 0.5);
    const bSide = (x: number, z: number): number => (x - END[0]) * Math.sin(PHI) + (z - END[1]) * Math.cos(PHI);
    const side0 = Math.sign(bSide(w.state.x, w.state.z));
    for (let i = 0; i < 180; i++) {                                // the turn toward +z, along A toward B
      w.state.yaw -= 0.25;
      w.tick({ forward: 1, right: 0, boost: false });
      expect(w.state.x).toBeLessThan(50);                          // never through A
      if (w.state.z > END[1]) expect(Math.sign(bSide(w.state.x, w.state.z))).toBe(side0);   // nor through B
    }
  });
});

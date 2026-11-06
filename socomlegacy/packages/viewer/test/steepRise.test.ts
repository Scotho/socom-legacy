// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildGrid, polygonNormal, probeGround, SEAL_TUNING, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { groundGrid, groundPolygons, STEP_PROBE_LIFT_READING, Walker } from '../src/mover';
import { simMapFromBytes } from '../src/simMap';
import { Traversal } from '../src/traversal';

/**
 * LATER 590, closed (segment-body-2 task S, 2026-11-05; reading, pending review): the grounded step refuses no rise for a
 * floor's slope. The walk compares no rise (`FUN_005b5d40` D:L470163-470290: the highest floor at or under the probe's
 * origin, else the lowest, refused only past 20 over the feet); a steep face stops a body only where `FUN_0054aa30`'s
 * segments at `step_height` 6.5 over the feet meet it (D:L415167; the centre record 1.1 x 1.4 r ahead) and
 * `FUN_005483d0` resolves the hit (a normal under `max_slope` levelled, the move's part along it taken away,
 * D:L413533-413567; the look-ahead lifted by `step_height`, D:L413711-413736). The port's `groundEndpoint` refusal (W2.2b,
 * `fbc82b31a`, no function cited; bounded on 2026-10-31 to faces `step_height` tall, `STEEP_RISE_FACE_MIN_READING`) is
 * gone; research 217 section 2.7.
 *
 * The no-disc half: a flat floor meeting a tall steep face, which the segments hold a body off at every heading tried,
 * with the refusal or without (the refusal never acted there: the segments stop the body first). The disc half: MP9's trunk crease (L-REPORT, REVIEW-L-1), Vigilance's pocket (the owner's
 * report, v0.3.32) and MP7's `g537`, the interim's named spots. Disc-backed: skipped without `SOCOM_DISC`.
 */
const DISC = process.env.SOCOM_DISC;
const go = (forward: number) => ({ forward, right: 0, boost: false });

describe('LATER 590: the segments hold a body off a tall steep face (synthetic: a flat floor meeting a steep plane)', () => {
  // The flat floor at y 0 to x 10, then a plane rising +x from there, 50 across, n_y 0.62 or 0.50 (under `max_slope`'s
  // 0.643). Walked at it from the fall line to 76 degrees off it, standing, crouched and prone, the body never stands on
  // it: the centre record at the feet + `step_height` and the side lines meet the face before the feet reach its foot,
  // and the hit's levelled normal takes the move's part into it (D:L413533-413567). Measured with and without the
  // refusal (scratch, 2026-11-05): the same ends to the hundredth, so the refusal held nothing here.
  for (const NY of [0.62, 0.5]) {
    const G = Math.sqrt(1 - NY * NY) / NY;
    const quad = (path: string, pts: number[]): WorldPoly => ({ modelName: 'worldmodel', path, region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from(pts) });
    const polys = [
      quad('worldmodel/flat', [-190, 0, -190, -190, 0, 190, 10, 0, 190, 10, 0, -190]),
      quad('worldmodel/steep', [10, 0, -190, 10, 0, 190, 60, 50 * G, 190, 60, 50 * G, -190]),
    ];
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
    const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: p.path, first: i, count: 1 }));
    it(`n_y ${NY}: the face is steeper than max_slope and faces up`, () => {
      const n = polygonNormal(polys[1]!.points)!;
      expect(n[1]).toBeCloseTo(NY, 5);
      expect(n[1]).toBeLessThan(Math.cos((SEAL_TUNING.maxSlopeDeg * Math.PI) / 180));
    });
    for (const [stance, yaw] of [['stand', 270], ['stand', 300], ['stand', 330], ['stand', 346.3], ['crouch', 330], ['prone', 270], ['prone', 330]] as const) {
      it(`n_y ${NY}, ${stance} at yaw ${yaw}: 3 s at full stick, the body stays on the flat, held by the segments`, () => {
        const w = new Walker(buildGrid(params, [], [], polys, owners));
        w.place(0, STEP_PROBE_LIFT_READING, 0);
        w.stance = stance; w.state.yaw = yaw;
        let top = 0, hitTicks = 0, maxX = 0;
        for (let i = 0; i < 180; i++) {
          w.tick(go(1));
          top = Math.max(top, w.state.y); maxX = Math.max(maxX, w.state.x);
          if (w.wallHits().some((h) => h.poly.path === 'worldmodel/steep')) hitTicks++;
        }
        expect(top).toBe(0);
        expect(maxX).toBeLessThan(10);
        expect(hitTicks).toBeGreaterThan(100);
      });
    }
  }
});

function disc(name: string) {
  const map = simMapFromBytes(new Uint8Array(readFileSync(resolve(DISC!, 'RUN', `${name}.ZDB`))), `RUN/${name}.ZDB`);
  const grid = groundGrid(map.ground!), polys = groundPolygons(map.ground!);
  return { grid, polys };
}
type Disc = ReturnType<typeof disc>;
/** A body placed at `at` (its feet), facing `yaw`, walked `ticks` at `push`, then left till it is grounded and idle. */
function walkFrom(d: Disc, at: readonly [number, number, number], stance: 'stand' | 'crouch' | 'prone', yaw: number, push = 1, ticks = 120) {
  const w = new Walker(d.grid);
  w.driver = new Traversal(d.grid, d.polys);
  w.place(at[0], at[1] + STEP_PROBE_LIFT_READING, at[2]);
  w.stance = stance; w.state.yaw = yaw;
  const y0 = w.state.y, x0 = w.state.x, z0 = w.state.z;
  let top = y0;
  const hit = new Set<string>();
  for (let i = 0; i < ticks; i++) { w.tick(go(push)); top = Math.max(top, w.state.y); for (const h of w.wallHits()) hit.add(h.poly.path); }
  for (let i = 0; i < 300 && ((w as unknown as { action_: unknown }).action_ !== null || w.airborne); i++) w.tick(go(0));
  return { moved: Math.hypot(w.state.x - x0, w.state.z - z0), climbed: top - y0, hit, y0 };
}

describe.skipIf(!DISC)('LATER 590: no steep-rise refusal on the disc', () => {
  describe('MP9, the trunk crease at congo2_tree4\'s west-north-west foot (L-REPORT; 24 of 276 routes ended there)', () => {
    let d: Disc;
    beforeAll(() => { d = disc('MP9'); });
    // The rest the routes reached: `land_04` (n_y 0.62, a face 43.5 tall) under the feet, the trunk downhill. With the
    // refusal every heading moved 0.00-0.18 (uphill refused with no wall hit, downhill the trunk).
    const REST = [1794.86, 127.0, 1747.5] as const;
    for (const stance of ['stand', 'crouch'] as const) {
      it(`${stance}: from the rest, the body leaves it (over 1) within 2 s in every one of eight headings`, { timeout: 120_000 }, () => {
        const moved = Array.from({ length: 8 }, (_, k) => +walkFrom(d, REST, stance, k * 45).moved.toFixed(2));
        for (const [k, m] of moved.entries()) expect(m, `heading ${k * 45} (${moved.join(', ')})`).toBeGreaterThan(1);
      });
    }
    it('the route that reached it (a stand walk from bearing 300, 30 out, into the trunk) ends where a heading leaves', { timeout: 120_000 }, () => {
      const C = [1804.0, 1741.0] as const, a = (300 * Math.PI) / 180;
      const x = C[0] + Math.sin(a) * 30, z = C[1] + Math.cos(a) * 30;
      const w = new Walker(d.grid);
      w.driver = new Traversal(d.grid, d.polys);
      const g = Math.max(...probeGround(d.grid, x, z).filter((h) => h.poly.path === 'worldmodel/land_04').map((h) => h.y));
      w.place(x, g + STEP_PROBE_LIFT_READING, z);
      w.state.yaw = (Math.atan2(-(C[0] - x), -(C[1] - z)) * 180) / Math.PI;
      for (let i = 0; i < 90; i++) w.tick(go(1));
      const end = [w.state.x, w.state.y, w.state.z] as const;
      const best = Math.max(...Array.from({ length: 8 }, (_, k) => walkFrom(d, end, 'stand', k * 45).moved));
      expect(best, `the walk's end (${end.map((v) => v.toFixed(2)).join(', ')})`).toBeGreaterThan(1);
    });
  });

  describe('MP51, Vigilance\'s pocket (the owner\'s report, v0.3.32: feet (711.610, 65.773, 1150.560), yaw 29.206)', () => {
    let d: Disc;
    beforeAll(() => { d = disc('MP51'); });
    const SPOT = [711.61, 65.773, 1150.56] as const;
    // Full-stick crouch moves with the standing run's body (LATER 591), so a half-stick crouch walk is its own case.
    for (const [stance, push] of [['stand', 1], ['crouch', 1], ['crouch', 0.5]] as const) {
      it(`${stance} at stick ${push}: the body leaves the spot in every one of eight headings from the reported yaw`, { timeout: 120_000 }, () => {
        const moved = Array.from({ length: 8 }, (_, k) => +walkFrom(d, SPOT, stance, (29.206 + 45 * k) % 360, push).moved.toFixed(2));
        for (const [k, m] of moved.entries()) expect(m, `heading ${k} (${moved.join(', ')})`).toBeGreaterThan(1);
      });
    }
  });

  describe('MP7, the trough at g537 (OBF-21: (1242.1, 118.22, 1569.5), polygons 8.70 and 10.28 tall, n_y 0.50 and 0.61)', () => {
    let d: Disc;
    beforeAll(() => { d = disc('MP7'); });
    const SPOT = [1242.1, 118.22, 1569.5] as const;
    it('standing, heading 90 (-x): the body walks across g537 rising 6.87, and no segment meets a g537 face on the way', { timeout: 120_000 }, () => {
      // The walk crosses the faces on a grade of about 0.25, so the centre record at the feet + 6.5 passes over them:
      // the original's segments do not meet them, and its walk compares no rise. The interim rule held it at 0.00.
      // It also rests on `SLIDE_SPAN_MEASURE_READING` 'column' (`./steepSlide`): the faces' column span there is under
      // `SLIDE_SPAN_MIN` 4, so `FUN_0054f330` (D:L417237) leaves them unslid; under 'vertices' (8.70, 10.28) they would
      // slide the body and it would not cross. A capture of this walk settles both.
      const r = walkFrom(d, SPOT, 'stand', 90);
      expect(r.moved).toBeGreaterThan(1);
      expect(r.climbed).toBeCloseTo(6.87, 1);
      expect([...r.hit].filter((p) => p.endsWith('/g537'))).toEqual([]);
    });
    it('standing, headings 135, 180 and 225: the body leaves the trough (the interim rule held 90, 135 and 180 at 0.00)', { timeout: 120_000 }, () => {
      for (const yaw of [135, 180, 225]) expect(walkFrom(d, SPOT, 'stand', yaw).moved, `heading ${yaw}`).toBeGreaterThan(1);
    });
  });
});

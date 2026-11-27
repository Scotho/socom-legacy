// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isWallSurface, polygonNormal, probeGround, selectFloor, type Grid, type WorldPoly } from '@s2u/scene';
import { simMapFromBytes } from '../src/simMap';
import { probeLiftOf, throttleFrameEnds, Walker } from '../src/mover';

/**
 * LATER 1148, the census's fault at 42550490c1 (research 444 s9; the box census
 * `agent-mail/evidence/weekend-mega-2026-11-14/box/later1148-42550490c/keep/`, N-census-AFTER.log): three wall faces held by
 * the walk before phase B were walked through after it, and on MP8 a run's feet stood 1.1 u inside the base of
 * `worldmodel/land49/g3373` (the coordinator's MP8 trace). Simulation track; reading, pending review.
 *
 * Each face is met from behind its own normal, where the body's segments do not meet it (the hull's hit is one-sided,
 * research 281 s4.3), and the floor ends at the face: what held the walk was the floor. At 42550490c1 the tick BETWEEN two
 * game frame ends took its move whole over no floor and stood past the face for that tick. The original makes one move a
 * frame, the walls only shortening it, and probes the floor once at its end (`FUN_005483d0` D:L413918, `FUN_005b0840`
 * D:L467215-467256): it never stands where no frame's move ends. So no tick of the port's ground walk ends over no floor
 * (a refused frame is put back at the last hit), and no face the floor held is crossed.
 *
 * The walls' walk is the census's own (`floorlessEdgeCensus.devdisc.test.ts`, `wallRuns`): the face's index among the map's
 * `isWallSurface` collision faces, a standing body 6 out on the side named (-1: behind the normal) from the face's middle on
 * the floor at its foot, facing it, at full stick for 90 ticks; PASSED when a tick's move crosses the face's footprint with
 * the feet in its height. The dev disc: `SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`; skipped (and said) without it.
 */

const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const zdb = (stem: string): string | null => { const p = DISC ? join(DISC, 'RUN', `${stem}.ZDB`) : ''; return p && existsSync(p) ? p : null; };
const HAVE = !!zdb('MP51') && !!zdb('MP52') && !!zdb('MP8');
const TICKS = 90;
const grids = new Map<string, Grid>();
const gridOf = (stem: string): Grid => {
  let g = grids.get(stem);
  if (!g) { g = simMapFromBytes(new Uint8Array(readFileSync(zdb(stem) as string)), `RUN/${stem}.ZDB`).grid; grids.set(stem, g); }
  return g;
};

/** Whether segment p0-p1 crosses segment a-b in x/z (strictly): the census's `crossesXZ`. */
function crossesXZ(p0x: number, p0z: number, p1x: number, p1z: number, ax: number, az: number, bx: number, bz: number): boolean {
  const d = (p1x - p0x) * (bz - az) - (p1z - p0z) * (bx - ax);
  if (Math.abs(d) < 1e-12) return false;
  const t = ((ax - p0x) * (bz - az) - (az - p0z) * (bx - ax)) / d;
  const u = ((ax - p0x) * (p1z - p0z) - (az - p0z) * (p1x - p0x)) / d;
  return t > 0 && t <= 1 && u > 0 && u < 1;
}

/** A grounded tick that ends with no floor the walk takes under the feet (the walk's own pick), as text; else null. */
function floorless(grid: Grid, w: Walker, tick: number): string | null {
  if (w.airborne) return null;
  const s = w.state;
  if (selectFloor(probeGround(grid, s.x, s.z), s.y + probeLiftOf('stand'), s.y)) return null;
  return `tick ${tick} (frame end ${throttleFrameEnds(tick + 1)}) at (${s.x.toFixed(3)}, ${s.y.toFixed(3)}, ${s.z.toFixed(3)})`;
}

interface WallWalk { passed: string | null; floorless: string[]; path: string }

function wallWalk(stem: string, index: number, side: 1 | -1): WallWalk {
  const grid = gridOf(stem);
  const faces: WorldPoly[] = [];
  for (const object of grid.objects) {
    if (object.kind !== 'collision') continue;
    for (const poly of object.polys) if (isWallSurface(poly)) faces.push(poly);
  }
  const poly = faces[index]!, n = polygonNormal(poly.points)!;
  const h = Math.hypot(n[0], n[2]);
  const nx = n[0] / h, nz = n[2] / h, tx = -nz, tz = nx, p = poly.points, k = p.length / 3;
  let tMin = Infinity, tMax = -Infinity, yMin = Infinity, yMax = -Infinity, ox = 0, oz = 0;
  for (let j = 0; j < k; j++) { ox += p[j * 3]!; oz += p[j * 3 + 2]!; }
  ox /= k; oz /= k;
  for (let j = 0; j < k; j++) {
    const t = (p[j * 3]! - ox) * tx + (p[j * 3 + 2]! - oz) * tz;
    tMin = Math.min(tMin, t); tMax = Math.max(tMax, t);
    yMin = Math.min(yMin, p[j * 3 + 1]!); yMax = Math.max(yMax, p[j * 3 + 1]!);
  }
  const ax = ox + tx * tMin, az = oz + tz * tMin, bx = ox + tx * tMax, bz = oz + tz * tMax;
  const mx = ox + tx * (tMin + tMax) / 2, mz = oz + tz * (tMin + tMax) / 2;
  const w = new Walker(grid);
  expect(w.place(mx + nx * side * 6, yMin + 2 + probeLiftOf('stand'), mz + nz * side * 6)).toBe(true);
  w.state.yaw = (Math.atan2(nx * side, nz * side) * 180) / Math.PI;
  const out: WallWalk = { passed: null, floorless: [], path: poly.path };
  for (let t = 0; t < TICKS && !out.passed; t++) {
    const x0 = w.state.x, z0 = w.state.z;
    w.tick({ forward: 1, right: 0, boost: false });
    const y = w.state.y;
    if (y >= yMin - 1 && y <= yMax - 6.5 && crossesXZ(x0, z0, w.state.x, w.state.z, ax, az, bx, bz))
      out.passed = `tick ${t}: (${x0.toFixed(3)}, ${z0.toFixed(3)}) -> (${w.state.x.toFixed(3)}, ${w.state.z.toFixed(3)})`;
    const f = floorless(grid, w, t);
    if (f) out.floorless.push(f);
  }
  return out;
}

describe.skipIf(!HAVE)(`LATER 1148: the ground walk's tick between frame ends goes no further than the frame's move${HAVE ? '' : ' (no dev disc -- skipped)'}`, () => {
  for (const [stem, index, poly] of [
    ['MP51', 3234, 'worldmodel/wc16B'],
    // LATER 1003: the hull now joins the archive's libraries (`hullModels`); 50 joined wall faces come before the railcars in
    // the walk -- 29 of the turrets (mp52gren_turret_1 8, mp52gren_turret_2 8, mp52gun_turret_1 13) and 21 of the Mixer's
    // library car (mp52_car_smashed01) -- so the same two railcar walls are indices 1836 and 1988 (were 1786 and 1938).
    ['MP52', 1836, 'worldmodel/mp52_railcar01=mp52_railcar01/g2209_2'],
    ['MP52', 1988, 'worldmodel/mp52_railcar01b=mp52_railcar01b/g2209_2'],
  ] as const) {
    it(`${stem} wall${index}/-1 (${poly}) holds the run from behind its normal, and no tick ends over no floor`, () => {
      const r = wallWalk(stem, index, -1);
      // The face walked is the named one (the delta review of fe279f8761, F1): an index that a change before it shifts fails
      // here, not silently on another wall (at ffe59b3684 the 1938 row walked mp52_railcar03's g2210 and passed).
      expect(r.path, `${stem} wall${index}: the walked face`).toBe(poly);
      expect(r.passed, `walked through at ${r.passed}`).toBeNull();
      expect(r.floorless, 'grounded ticks ending over no floor').toEqual([]);
    });
  }

  it('MP8: the run at worldmodel/land49/g3372\'s edge (673.51, 1327.46) never stands over no floor (inside g3373\'s base)', () => {
    // The coordinator's MP8 trace (core72c5/later1148-traces/mp8.trace.test.ts): placed 1.5 inside the census candidate's
    // edge along its normal, at full stick for 90 ticks.
    const grid = gridOf('MP8');
    const c = { x: 673.51, z: 1327.46, y: 105.8993148803711 }, L = Math.hypot(0.08, 1), nx = 0.08 / L, nz = 1 / L;
    const w = new Walker(grid);
    expect(w.place(c.x - nx * 1.5, c.y + probeLiftOf('stand') + 0.1, c.z - nz * 1.5)).toBe(true);
    w.state.yaw = (Math.atan2(-nx, -nz) * 180) / Math.PI;
    const bad: string[] = [];
    for (let t = 0; t < TICKS && !w.airborne; t++) {
      w.tick({ forward: 1, right: 0, boost: false });
      const f = floorless(grid, w, t);
      if (f) bad.push(f);
    }
    expect(bad, 'grounded ticks ending over no floor').toEqual([]);
  });
});

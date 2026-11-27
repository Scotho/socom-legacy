// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { groundGrid, groundPolygons, probeLiftOf, Walker } from '../src/mover';
import { simMapFromBytes } from '../src/simMap';
import { Traversal } from '../src/traversal';

/**
 * The port's standing rest AT MP51's `worldmodel/wc23A` (Kill item 1; reading, pending review), against IQ-152 capture 2
 * (Shadow PC 4, r0004; a capture of the original, unscored; its record is on the hub, not in the tree): a STANDING body
 * strafing RIGHT into wc23A near (379.76, 154.96, 1495.29) stops 5.684 / 5.684 / 5.683 u from the face's plane. The
 * side stand-off is the first hit, anywhere in [5.39, 5.39 + one frame's move) by the start distance modulo the move
 * (`standoffBand.test.ts`; research 217's correction; r0001 `FUN_005483d0` D:L413601-413614): this pins the port's rest
 * at wc23A INSIDE that band, strafing right and walking forward alike, from capture 2's own start (12.18 u off the face on
 * its normal), and prints it beside r0004's. It does NOT claim the exact value: the port rests 7.392, r0004 5.684, both
 * in the band. Face choice: the near-vertical wc23A face whose plane is nearest the capture's point. Dev-disc: skipped
 * without SOCOM_DISC. Seat-kill's read: pilot/kill/keyjob-side-standoff-read.md (the hub).
 */
const DISC = process.env.SOCOM_DISC;
const AT = [379.76, 154.96, 1495.29] as const;
/** Capture 2's own placement: 12.18 u off the face's plane (n (0.0175, 0, -0.9998), d -1492.233), so the first hit compares. */
const START = 12.18;
/** The band (`standoffBand.test.ts`): the reach 5.39 and one 30 Hz frame's move at the run, 2.17. */
const BAND = [5.39, 5.39 + 2.17] as const;

describe.skipIf(!DISC)('the port\'s standing rest against MP51 wc23A (IQ-152 capture 2: r0004 5.684 strafing right)', () => {
  let grid: ReturnType<typeof groundGrid>, polys: ReturnType<typeof groundPolygons>;
  beforeAll(() => {
    const map = simMapFromBytes(new Uint8Array(readFileSync(resolve(DISC!, 'RUN/MP51.ZDB'))), 'RUN/MP51.ZDB');
    grid = groundGrid(map.ground!);
    polys = groundPolygons(map.ground!);
  });

  it('prints the rest distance from wc23A\'s face plane, strafing right and walking forward', { timeout: 60_000 }, () => {
    // the wc23A face nearest the capture's point whose plane is near-vertical
    let best: { n: number[]; p: number[]; d: number; path: string } | null = null;
    for (const poly of polys as unknown as { points: ArrayLike<number>; owner?: { path: string }; path?: string }[]) {
      const path = poly.owner?.path ?? poly.path ?? '';
      if (!path.includes('wc23A')) continue;
      const q = poly.points, a = [q[0]!, q[1]!, q[2]!], b = [q[3]!, q[4]!, q[5]!], c = [q[6]!, q[7]!, q[8]!];
      const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!], v = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
      let n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
      const len = Math.hypot(n[0]!, n[1]!, n[2]!);
      if (!(len > 0)) continue;
      n = n.map((x) => x / len);
      if (Math.abs(n[1]!) > 0.3) continue;
      const d = Math.abs((AT[0] - a[0]!) * n[0]! + (AT[1] - a[1]!) * n[1]! + (AT[2] - a[2]!) * n[2]!);
      if (!best || d < best.d) best = { n, p: a, d, path };
    }
    expect(best, 'a near-vertical wc23A face near the capture point').not.toBeNull();
    const { n, p } = best!;
    // the side of the plane the capture point is on: the body stands there
    const side = Math.sign((AT[0] - p[0]!) * n[0]! + (AT[2] - p[2]!) * n[2]!) || 1;
    const nx = n[0]! * side, nz = n[2]! * side, h = Math.hypot(nx, nz);
    const dist = (x: number, z: number): number => ((x - p[0]!) * nx + (z - p[2]!) * nz) / h;
    const rests: number[] = [];
    const lines: string[] = [`face ${best!.path} n=(${(nx / h).toFixed(3)}, ${(nz / h).toFixed(3)}) captureDist=${dist(AT[0], AT[2]).toFixed(3)}`];
    for (const [label, input, yawOf] of [
      ['strafe right', { forward: 0, right: 1 }, (fx: number, fz: number) => Math.atan2(-fz, fx)],
      ['walk forward', { forward: 1, right: 0 }, (fx: number, fz: number) => Math.atan2(-fx, -fz)],
    ] as const) {
      const w = new Walker(grid);
      w.driver = new Traversal(grid, polys);
      const sx = AT[0] + (nx / h) * START, sz = AT[2] + (nz / h) * START;
      expect(w.place(sx, AT[1] + probeLiftOf('stand'), sz)).toBe(true);
      // travel into the face: direction -n; forward = -(sin yaw, cos yaw); strafe right = (cos yaw, -sin yaw)
      w.state.yaw = (yawOf(-nx / h, -nz / h) * 180) / Math.PI;
      for (let i = 0; i < 120; i++) w.tick({ ...input, boost: false });
      rests.push(dist(w.state.x, w.state.z));
      lines.push(`${label}: rest ${dist(w.state.x, w.state.z).toFixed(3)} u from the plane (r0004 strafe right: 5.684) at (${w.state.x.toFixed(2)}, ${w.state.y.toFixed(2)}, ${w.state.z.toFixed(2)})`);
    }
    console.log(`STANDOFF-WC23A ${lines.join(' | ')}`);
    for (const r of rests) { expect(r).toBeGreaterThanOrEqual(BAND[0] - 0.05); expect(r).toBeLessThan(BAND[1] + 0.05); }
    expect(rests[0]).toBeCloseTo(rests[1]!, 6);                               // the fan follows the move
  });
});

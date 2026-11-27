// @vitest-environment node
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isGroundSurface, isWallSurface, polygonNormal, probeGround, selectFloor, type Grid, type WorldPoly } from '@s2u/scene';
import { simMapFromBytes } from '../src/simMap';
import { probeLiftOf, Walker, type Stance } from '../src/mover';
import { CENSUS_BAND_LOW, stepCrossing } from './helpers/faceCrossing';

/**
 * LATER 1148, phase A: THE CENSUS of floorless edges (research 444, s4). A MEASUREMENT of the port, not a parity pin:
 * it asserts only that its counts are finite, and prints (and with `P1_OUT` writes as JSON) what it found. Simulation
 * track; nothing here is a value of the game's, and nothing was run on the original.
 *
 * What it measures, per map:
 * 1. **Floorless edges.** Every ground polygon's boundary (`isGroundSurface`, the probe's own test), sampled every
 *    `P1_SPACING` units: a sample is a CANDIDATE where the column 0.05 outside the edge has no floor the walk takes
 *    (`selectFloor(probeGround(..))`, the walk's own pick, from the edge's height + the probe's lift) and a floor is
 *    met again within `FRAME_STEP_MAX` (2.2) outward -- a floorless gap narrower than a standing frame's step (65 u/s x
 *    one 30 Hz frame = 2.17: the band `seal_run` 65, `scene/src/tuning.ts:305`). The gap's width and the far floor's
 *    height are recorded with the crouched frame's step (14.8 / 30 = 0.49: `seal_crouchwalk`, tuning.ts:331) beside it,
 *    since research 444 s2 reads the original's hold as a gap wider than the frame's step.
 * 2. **The walk at each.** A `Walker`, in each gait of `P1_GAITS`
 *    (`GAITS`), facing straight out, for 90 ticks: `left` when airborne or past the gap at any tick, else `held` when it moved and
 *    stopped within 0.6 of the edge (the floor's refusal), else `short` (a wall or nothing moving). Placed `P1_START` (5)
 *    inside where the floor holds a run-up, else 1.5. The final distance to the edge (`heldAt`, negative inside) and
 *    the fastest tick's speed are kept.
 * 3. **The walls, a baseline.** Wall faces (`isWallSurface`, at least `WALL_MIN_RISE` over the floor at their foot),
 *    sampled by stride to `P1_WALLS` a map: a standing body placed 6 out from the face's middle on the floor at its foot,
 *    facing it, at full stick for `TICKS` (90) ticks; PASSED when a tick's move meets the face's POLYGON at a body height
 *    (`stepCrossing`: the step's band, 2 over the feet to the walker's own head line for the tick, entering from the
 *    face's FRONT and reaching the walker's low line or higher -- a front contact wholly under it, within step height,
 *    is listed, never counted (the main controller's ruling (a), logged for the owner); LATER 1167,
 *    product track -- it was the face's bounding line in plan with the feet in the face's height, which counted the open
 *    side of a slanted strip, MP61's `access5/whats_left`). The old verdict is kept beside it and every face whose
 *    verdict differs is printed (`wall FLIP`). Today's count is the baseline a change to the ground walk must not raise.
 *
 * Parameterised for the fix's run: `P1_BASELINE=<an earlier P1_OUT>` prints the candidates held then and not now, and
 * the walls passed now and not then. Bounded: `P1_MAX` candidates walked a map (deterministic stride over all found),
 * `P1_BUDGET_MS` (30000) on a map's edge scan (a truncated scan is said). `P1_MAPS` (comma list) limits the maps.
 *
 * The maps: every `RUN/MP*.ZDB` of the dev disc (`SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`), else the fixtures'
 * (`test-fixtures/RUN/`, MP2, MP6, MP71, MP72). A map with neither is skipped and named in the output.
 * Run (from socomlegacy/packages/viewer): `P1_MAPS=MP72 npx vitest run test/floorlessEdgeCensus.devdisc.test.ts`.
 */

const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures');
const num = (name: string, fallback: number): number => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};
const SPACING = num('P1_SPACING', 4);
const START = num('P1_START', 5);
const MAX_WALKS = num('P1_MAX', 150);
const MAX_WALLS = num('P1_WALLS', 150);
const BUDGET_MS = num('P1_BUDGET_MS', 30000);
const TICKS = 90;
/**
 * The gaits walked, `stance:stick` (the stick's forward push, 0..1). Default: the standing run (full stick, the
 * original's "running" -- the walk has no sprint, camera.ts:61-64, W2.R2), a standing walk at 0.4 of the stick (the
 * port reaches 26.0 u/s with it, the original's walk speed in relay-1's rows; the stick itself is a setting of this census,
 * the rig's stick not being the port's), and the crouched walk at full stick (`seal_crouchwalk` 14.8).
 */
const GAITS = (process.env.P1_GAITS ?? 'stand:1,stand:0.4,crouch:1').split(',').map((g) => g.trim()).filter(Boolean)
  .map((g) => { const [st, k] = g.split(':'); return { key: g, stance: st as Stance, stick: Number(k ?? 1) }; });
const STANCES_RUN = GAITS.map((g) => g.key);
/** A standing frame's step at the run band, 65 / 30 (`seal_run`, scene/src/tuning.ts:305), rounded up for the scan. */
const FRAME_STEP_MAX = 2.2;
/** The crouched frame's step, 14.8 / 30 (`seal_crouchwalk`, scene/src/tuning.ts:331): beside each gap, for research 444 s2. */
const CROUCH_FRAME_STEP = 14.8 / 30;
/** A wall face counted in the baseline rises at least this over the floor at its foot (twice `step_height` 6.5). */
const WALL_MIN_RISE = 13;
const FWD = { forward: 1, right: 0, boost: false };   // the wall baseline's push: the standing run

type MapSource = { stem: string; path: string } | { stem: string; path: null };

function mapSources(): MapSource[] {
  const want = process.env.P1_MAPS ? process.env.P1_MAPS.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) : null;
  const inDir = (dir: string): string[] => existsSync(dir) ? readdirSync(dir).filter((f) => /^MP\d+\.ZDB$/i.test(f)).map((f) => f.replace(/\.ZDB$/i, '').toUpperCase()) : [];
  const disc = DISC ? inDir(join(DISC, 'RUN')) : [];
  const fixtures = inDir(join(FIXTURES, 'RUN'));
  const stems = want ?? [...new Set([...disc, ...fixtures])].sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));
  return stems.map((stem) => {
    if (disc.includes(stem)) return { stem, path: join(DISC, 'RUN', `${stem}.ZDB`) };
    if (fixtures.includes(stem)) return { stem, path: join(FIXTURES, 'RUN', `${stem}.ZDB`) };
    return { stem, path: null };
  });
}

interface Candidate {
  id: string; x: number; z: number; nx: number; nz: number; y: number; gap: number; farY: number;
  poly: string; seed?: string; start?: number; original?: Record<string, 'left' | 'held'>;
  walks: Record<string, Walk>;
}
/**
 * One walk off an edge: `left` (airborne, or past the gap), `held` (moving, and stopped within `HELD_NEAR` of the edge:
 * the floor refusal), `short` (stopped further in, or never moving: a wall or a body at the start, not the floor's).
 */
type Walk = { result: 'left' | 'held' | 'short'; heldAt: number; speed: number; start: number } | 'unplaceable';
/** A stop this near the edge (or past it) is the floor's refusal; further in it is something else's. */
const HELD_NEAR = 0.6;
/**
 * `passed`: a step's band met the face's polygon entered from its FRONT -- the gate (LATER 1167; the main controller's ruling,
 * the hull's one-sided rule, research 281 s4.3, a reading); `behind`: the tick a step's band met it from its BACK only
 * (listed, never counted; reading pending a capture); `passedLine`: the old bounding-line test, kept to list the flips.
 */
interface WallRun { id: string; x: number; z: number; poly: string; passed: boolean; passedLine: boolean; behind?: number; below?: number; belowAt?: string; why?: string }
interface MapResult {
  stem: string; skipped?: string; truncated: boolean; edgeSamples: number; found: number;
  candidates: Candidate[]; held: Record<string, number>; short: Record<string, number>; walls: WallRun[]; wallsPassed: number; ms: number;
}

/** Named spots walked whatever the stride takes: the RED's (crossroadsWallTop.test.ts; MP72 b2_wc07's west edge). */
/**
 * Each seed may carry the ORIGINAL's outcome per gait, from relay-1's r0004 rows as the bugs lane read them
 * (`agent-mail/evidence/weekend-mega-2026-11-14/bugs/P10-crossroads-rows-read.md`, UNREVIEWED; research 444 s7), and its
 * start (the rows' x 1528 on the top): the census prints MATCH or DIFFERS beside the port's. z 1220's walk is trial (B),
 * relayed as crossing 3 of 3 (its rows not read here).
 */
const SEEDS: Record<string, { x: number; y: number; z: number; nx: number; nz: number; seed: string; start?: number; original?: Record<string, 'left' | 'held'> }[]> = {
  MP72: [
    { x: 1526.77, y: 98.81, z: 1269.25, nx: -1, nz: 0, start: 1.23, seed: 'LATER 1148 RED (b2_wc07 top, where he landed)', original: { 'stand:1': 'left', 'stand:0.4': 'held' } },
    { x: 1526.77, y: 98.81, z: 1220, nx: -1, nz: 0, start: 1.23, seed: 'LATER 1148 trial B (b2_wc07 top, wedge 0.39)', original: { 'stand:0.4': 'left' } },
    { x: 1526.77, y: 98.81, z: 1243.5, nx: -1, nz: 0, seed: 'LATER 1148 (b2_wc07 top, jump 5)' },
  ],
};

const floorAt = (grid: Grid, x: number, z: number, y: number): ReturnType<typeof selectFloor> =>
  selectFloor(probeGround(grid, x, z), y + probeLiftOf('stand'), y);

/** The first floor outward from (x, z) along n within FRAME_STEP_MAX, the column 0.05 out being floorless; else null. */
function scanGap(grid: Grid, x: number, z: number, nx: number, nz: number, y: number): { gap: number; farY: number } | null {
  if (floorAt(grid, x + nx * 0.05, z + nz * 0.05, y)) return null;
  for (let d = 0.1; d <= FRAME_STEP_MAX + 1e-9; d += 0.05) {
    const f = floorAt(grid, x + nx * d, z + nz * d, y);
    if (f) return { gap: d, farY: f.y };
  }
  return null;
}

const r2 = (v: number): number => Math.round(v * 100) / 100;

function findCandidates(grid: Grid, stem: string): { candidates: Candidate[]; samples: number; truncated: boolean } {
  const t0 = Date.now();
  const out: Candidate[] = [];
  let samples = 0, truncated = false;
  outer: for (const object of grid.objects) {
    if (object.kind !== 'collision') continue;
    for (const poly of object.polys) {
      if (!isGroundSurface(poly)) continue;
      const n = polygonNormal(poly.points);
      if (!n || Math.abs(n[1]) < 0.7) continue;                 // a floor the walk stands on, not a steep face
      const p = poly.points, k = p.length / 3;
      let cx = 0, cz = 0;
      for (let i = 0; i < k; i++) { cx += p[i * 3]!; cz += p[i * 3 + 2]!; }
      cx /= k; cz /= k;
      for (let i = 0; i < k; i++) {
        const j = (i + 1) % k;
        const ax = p[i * 3]!, ay = p[i * 3 + 1]!, az = p[i * 3 + 2]!, bx = p[j * 3]!, by = p[j * 3 + 1]!, bz = p[j * 3 + 2]!;
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.5) continue;
        let nx = (bz - az) / len, nz = -(bx - ax) / len;
        if (nx * ((ax + bx) / 2 - cx) + nz * ((az + bz) / 2 - cz) < 0) { nx = -nx; nz = -nz; }
        const count = Math.max(1, Math.floor(len / SPACING));
        for (let s = 0; s < count; s++) {
          if (Date.now() - t0 > BUDGET_MS) { truncated = true; break outer; }
          const f = (s + 0.5) / count, ex = ax + (bx - ax) * f, ez = az + (bz - az) * f, ey = ay + (by - ay) * f;
          samples++;
          const near = floorAt(grid, ex - nx * 0.05, ez - nz * 0.05, ey);
          if (!near || Math.abs(near.y - ey) > 0.5) continue;    // the edge is not the floor stood on here
          const g = scanGap(grid, ex, ez, nx, nz, near.y);
          if (!g) continue;
          out.push({ id: `${stem}@${r2(ex)},${r2(ez)}>${r2(nx)},${r2(nz)}`, x: ex, z: ez, nx, nz, y: near.y, gap: g.gap, farY: g.farY, poly: poly.path, walks: {} });
        }
      }
    }
  }
  return { candidates: out, samples, truncated };
}

function walkOff(grid: Grid, c: Candidate, stance: Stance, stick: number): Walk {
  const w = new Walker(grid);
  w.stance = stance;
  const placed = (back: number): boolean => w.place(c.x - c.nx * back, c.y + probeLiftOf(stance) + 0.1, c.z - c.nz * back) && Math.abs(w.state.y - c.y) <= 0.5;
  const start = c.start !== undefined ? (placed(c.start) ? c.start : 0) : placed(START) ? START : placed(1.5) ? 1.5 : 0;   // a seed's own start, else a run-up of START where the floor holds one
  if (start === 0) return 'unplaceable';
  w.stance = stance;
  w.state.yaw = (Math.atan2(-c.nx, -c.nz) * 180) / Math.PI;    // the walk's forward is (-sin yaw, -cos yaw), mover.ts:3218
  const along = (): number => (w.state.x - c.x) * c.nx + (w.state.z - c.z) * c.nz;
  const input = { forward: stick, right: 0, boost: false };
  let speed = 0;                                                 // the fastest tick's ground speed, units a second
  for (let i = 0; i < TICKS; i++) {
    const x0 = w.state.x, z0 = w.state.z;
    w.tick(input);
    speed = Math.max(speed, Math.hypot(w.state.x - x0, w.state.z - z0) * 60);
    if (w.airborne || along() > c.gap) return { result: 'left', heldAt: r2(along()), speed: r2(speed), start };
  }
  return { result: speed > 1 && along() > -HELD_NEAR ? 'held' : 'short', heldAt: r2(along()), speed: r2(speed), start };
}

/** Whether segment p0-p1 crosses segment a-b in x/z (strictly). */
function crossesXZ(p0x: number, p0z: number, p1x: number, p1z: number, ax: number, az: number, bx: number, bz: number): boolean {
  const d = (p1x - p0x) * (bz - az) - (p1z - p0z) * (bx - ax);
  if (Math.abs(d) < 1e-12) return false;
  const t = ((ax - p0x) * (bz - az) - (az - p0z) * (bx - ax)) / d;
  const u = ((ax - p0x) * (p1z - p0z) - (az - p0z) * (p1x - p0x)) / d;
  return t > 0 && t <= 1 && u > 0 && u < 1;
}

function wallRuns(grid: Grid, stem: string): WallRun[] {
  const faces: WorldPoly[] = [];
  for (const object of grid.objects) {
    if (object.kind !== 'collision') continue;
    for (const poly of object.polys) if (isWallSurface(poly)) faces.push(poly);
  }
  const stride = Math.max(1, Math.floor(faces.length / MAX_WALLS));
  const out: WallRun[] = [];
  for (let i = 0; i < faces.length && out.length < MAX_WALLS; i += stride) {
    const poly = faces[i]!, n = polygonNormal(poly.points);
    if (!n) continue;
    const h = Math.hypot(n[0], n[2]);
    if (h < 1e-6) continue;
    const nx = n[0] / h, nz = n[2] / h, tx = -nz, tz = nx, p = poly.points, k = p.length / 3;
    let tMin = Infinity, tMax = -Infinity, yMin = Infinity, yMax = -Infinity, ox = 0, oz = 0;
    for (let j = 0; j < k; j++) { ox += p[j * 3]!; oz += p[j * 3 + 2]!; }
    ox /= k; oz /= k;
    for (let j = 0; j < k; j++) {
      const t = (p[j * 3]! - ox) * tx + (p[j * 3 + 2]! - oz) * tz;
      tMin = Math.min(tMin, t); tMax = Math.max(tMax, t);
      yMin = Math.min(yMin, p[j * 3 + 1]!); yMax = Math.max(yMax, p[j * 3 + 1]!);
    }
    if (tMax - tMin < 2) continue;
    const ax = ox + tx * tMin, az = oz + tz * tMin, bx = ox + tx * tMax, bz = oz + tz * tMax;
    const mx = ox + tx * (tMin + tMax) / 2, mz = oz + tz * (tMin + tMax) / 2;
    for (const side of [1, -1]) {
      const w = new Walker(grid);
      const px = mx + nx * side * 6, pz = mz + nz * side * 6;
      if (!w.place(px, yMin + 2 + probeLiftOf('stand'), pz)) continue;
      const fy = w.state.y;
      if (fy < yMin - 1 || fy + WALL_MIN_RISE > yMax) continue;  // no floor at the face's foot, or a face to step over
      w.state.yaw = (Math.atan2(nx * side, nz * side) * 180) / Math.PI;   // facing the face: forward = -side n
      let passed = false, passedLine = false, why: string | undefined, whyIn: string | undefined, behind: number | undefined, below: number | undefined, belowAt: string | undefined;
      // A flip's reason, per tested height: the step against the face's PLANE (its signed distance at the step's two
      // ends: no sign change, the step never reaches the plane there) and, where it crosses, the crossing point against
      // the polygon (along the face's line and in height, inside or not).
      const len3 = Math.hypot(n[0], n[1], n[2]), un = [n[0] / len3, n[1] / len3, n[2] / len3] as const;
      const P0 = [p[0]!, p[1]!, p[2]!] as const;
      const planeD = (x: number, y: number, z: number): number => (x - P0[0]) * un[0] + (y - P0[1]) * un[1] + (z - P0[2]) * un[2];
      const inPoly = (x: number, y: number, z: number): boolean => {
        // project onto the face's plane axes (t along the line, y up) and test the polygon there
        const pt = [(x - ox) * tx + (z - oz) * tz, y];
        let inside = false;
        for (let j = 0, q = k - 1; j < k; q = j++) {
          const aT = (p[j * 3]! - ox) * tx + (p[j * 3 + 2]! - oz) * tz, aY = p[j * 3 + 1]!;
          const bT = (p[q * 3]! - ox) * tx + (p[q * 3 + 2]! - oz) * tz, bY = p[q * 3 + 1]!;
          if ((aY > pt[1]!) !== (bY > pt[1]!) && pt[0]! < ((bT - aT) * (pt[1]! - aY)) / (bY - aY) + aT) inside = !inside;
        }
        return inside;
      };
      const detail = (a: readonly [number, number, number], b: readonly [number, number, number], hs: readonly number[]): string => hs.map((h) => {
        const d0 = planeD(a[0], a[1] + h, a[2]), d1 = planeD(b[0], b[1] + h, b[2]);
        if (d0 * d1 > 0) return `+${h.toFixed(2)} plane ${d0.toFixed(2)}->${d1.toFixed(2)} (not reached)`;
        const f = d0 / (d0 - d1), x = a[0] + (b[0] - a[0]) * f, y = a[1] + h + (b[1] - a[1]) * f, z = a[2] + (b[2] - a[2]) * f;
        return `+${h.toFixed(2)} plane crossed at t ${((x - ox) * tx + (z - oz) * tz).toFixed(2)} y ${y.toFixed(2)} ${inPoly(x, y, z) ? 'INSIDE' : 'outside'} the polygon, entered from its ${d1 < d0 ? 'front' : d1 > d0 ? 'back' : '(no move against it)'}`;
      }).join(', ');
      const lines = (): readonly [number, number] => (w as unknown as { probeHeights(): readonly [number, number] }).probeHeights();
      for (let t = 0; t < TICKS && !(passed && passedLine); t++) {   // a back entry does not stop the run: a front one may follow
        const x0 = w.state.x, y0 = w.state.y, z0 = w.state.z;
        w.tick(FWD);
        const y = w.state.y;
        const lineHit = y >= yMin - 1 && y <= yMax - 6.5 && crossesXZ(x0, z0, w.state.x, w.state.z, ax, az, bx, bz);
        const [low, head] = lines(), hs = [CENSUS_BAND_LOW, low, (low + head) / 2, head];   // the reason's sample heights
        const entry = stepCrossing(poly, [x0, y0, z0], [w.state.x, y, w.state.z], CENSUS_BAND_LOW, head);
        // The gate (the main controller's ruling (a), logged for the owner): a FRONT entry whose band crossing reaches
        // the walker's own low line or higher -- the reading of the original's two segment lines (6.5 and the head):
        // a contact under the low line is within step height, no wall by its rule. One wholly under it is listed.
        const upper = entry?.front ? stepCrossing(poly, [x0, y0, z0], [w.state.x, y, w.state.z], low, head) : null;
        const faceHit = !!upper?.front;
        if (entry?.front && !faceHit && below === undefined) {
          below = t;
          const under: number[] = [];
          for (let hh = CENSUS_BAND_LOW; hh <= low + 1e-9; hh += 0.01) {
            if (detail([x0, y0, z0], [w.state.x, y, w.state.z], [hh]).includes('INSIDE')) under.push(hh);
          }
          belowAt = under.length ? `${under[0]!.toFixed(2)}..${under[under.length - 1]!.toFixed(2)}` : 'under 0.01 wide';
        }
        if (entry && !entry.front && behind === undefined) behind = t;
        if (lineHit && !faceHit && !passedLine) why = `tick ${t} (the line crossed, ${entry?.front ? 'the polygon entered from its front only under the walker low line' : entry ? 'the polygon entered from its back only' : 'no polygon'}): ${detail([x0, y0, z0], [w.state.x, y, w.state.z], hs)}`;
        if (faceHit && !passed) {
          // The witnesses inside the band, scanned at 0.01: the heights the step meets the polygon, with the side (one
          // side a step: n . (to - from)). A crossing narrower than 0.01 or only on an edge can print none beside a
          // counted pass (the band test, not the scan, decides; the re-read of 444f3b0665, finding 3).
          const front: number[] = [], back: number[] = [];
          for (let h = CENSUS_BAND_LOW; h <= head + 1e-9; h += 0.01) {
            const one = detail([x0, y0, z0], [w.state.x, y, w.state.z], [h]);
            if (one.includes('INSIDE')) (one.includes('from its front') ? front : back).push(h);
          }
          const span = (v: number[]): string => (v.length ? `${v[0]!.toFixed(2)}..${v[v.length - 1]!.toFixed(2)} (${v.length})` : 'none');
          const witness = `front at ${span(front)}, back at ${span(back)}`;
          whyIn = `tick ${t} (the polygon crossed in the band ${CENSUS_BAND_LOW}..${head.toFixed(2)}: ${witness}): ${detail([x0, y0, z0], [w.state.x, y, w.state.z], hs)}; the lines low ${low.toFixed(2)} head ${head.toFixed(2)}`;
        }
        passedLine ||= lineHit;
        passed ||= faceHit;
      }
      out.push({ id: `${stem}@wall${i}/${side}`, x: r2(px), z: r2(pz), poly: poly.path, passed, passedLine, ...(!passed && behind !== undefined ? { behind } : {}), ...(!passed && below !== undefined ? { below, belowAt } : {}), ...(passedLine && !passed && why ? { why } : {}), ...(passed && whyIn ? { why: whyIn } : {}) });
      break;                                                     // one side a face
    }
  }
  return out;
}

function censusOf(src: MapSource): MapResult {
  const t0 = Date.now();
  const empty = { truncated: false, edgeSamples: 0, found: 0, candidates: [], held: {}, short: {}, walls: [], wallsPassed: 0 };
  if (!src.path) return { stem: src.stem, skipped: 'no ZDB on the dev disc or in the fixtures', ...empty, ms: 0 };
  const grid = simMapFromBytes(new Uint8Array(readFileSync(src.path)), `RUN/${src.stem}.ZDB`).grid;
  const { candidates: all, samples, truncated } = findCandidates(grid, src.stem);
  const stride = Math.max(1, Math.ceil(all.length / MAX_WALKS));
  const walked: Candidate[] = [];
  for (const s of SEEDS[src.stem] ?? []) {
    const near = floorAt(grid, s.x - s.nx * 0.1, s.z - s.nz * 0.1, s.y);
    if (!near) continue;
    const g = scanGap(grid, s.x, s.z, s.nx, s.nz, near.y);
    walked.push({ id: `${src.stem}@seed:${s.seed}`, x: s.x, z: s.z, nx: s.nx, nz: s.nz, y: near.y, gap: g?.gap ?? NaN, farY: g?.farY ?? NaN, poly: near.poly.path, seed: s.seed, start: s.start, original: s.original, walks: {} });
  }
  walked.push(...all.filter((_, i) => i % stride === 0));
  const held: Record<string, number> = {}, short: Record<string, number> = {};
  for (const c of walked) for (const g of GAITS) {
    const r = walkOff(grid, c, g.stance, g.stick);
    c.walks[g.key] = r;
    if (r !== 'unplaceable' && r.result === 'held') held[g.key] = (held[g.key] ?? 0) + 1;
    if (r !== 'unplaceable' && r.result === 'short') short[g.key] = (short[g.key] ?? 0) + 1;
  }
  const walls = wallRuns(grid, src.stem);
  return { stem: src.stem, truncated, edgeSamples: samples, found: all.length, candidates: walked, held, short, walls, wallsPassed: walls.filter((w) => w.passed).length, ms: Date.now() - t0 };
}

function say(m: MapResult): string {
  if (m.skipped) return `${m.stem}: SKIPPED (${m.skipped})`;
  const lines = [`${m.stem}: ${m.edgeSamples} edge samples${m.truncated ? ' (TRUNCATED by P1_BUDGET_MS)' : ''}, ${m.found} candidates, ${m.candidates.length} walked; held at the edge ${STANCES_RUN.map((s) => `${s} ${m.held[s] ?? 0}`).join(', ')}; stopped short ${STANCES_RUN.map((s) => `${s} ${m.short[s] ?? 0}`).join(', ')}; walls ${m.walls.length} run, ${m.wallsPassed} passed from the front (under the low line: ${m.walls.filter((w) => w.below !== undefined).length}; crossed from behind: ${m.walls.filter((w) => w.behind !== undefined).length}; the bounding line: ${m.walls.filter((w) => w.passedLine).length}); ${m.ms} ms`];
  const shown = m.candidates.filter((c) => c.seed || Object.values(c.walks).some((w) => w !== 'unplaceable' && w.result === 'held')).slice(0, 10);
  for (const c of shown) {
    const walks = STANCES_RUN.map((s) => { const w = c.walks[s]; return `${s} ${w === 'unplaceable' || !w ? 'unplaceable' : `${w.result === 'held' ? 'HELD' : w.result} at ${w.heldAt} @${w.speed} u/s from ${w.start}`}`; }).join(', ');
    const vs = c.original ? ` | the ORIGINAL (rows, as relayed): ${Object.entries(c.original).map(([g, o]) => { const w = c.walks[g]; const port = w && w !== 'unplaceable' ? (w.result === 'left' ? 'left' : 'held') : 'unplaceable'; return `${g} ${o} -> ${port === o ? 'MATCH' : 'DIFFERS'}`; }).join(', ')}` : '';
    lines.push(`  ${c.seed ? `[${c.seed}] ` : ''}(${r2(c.x)}, ${r2(c.y)}, ${r2(c.z)}) n (${r2(c.nx)}, ${r2(c.nz)}) gap ${r2(c.gap)} (crouch frame ${r2(CROUCH_FRAME_STEP)}) far y ${r2(c.farY)} ${c.poly}: ${walks}${vs}`);
  }
  for (const w of m.walls.filter((x) => x.passed)) lines.push(`  wall PASSED: ${w.id} from (${w.x}, ${w.z}) ${w.poly}${w.why ? ` -- ${w.why}` : ''}`);
  // LATER 1167: every back entry (no collision by the hull's one-sided rule; listed, never counted).
  for (const w of m.walls.filter((x) => x.behind !== undefined)) lines.push(`  wall CROSSED FROM BEHIND (not counted): ${w.id} at tick ${w.behind} from (${w.x}, ${w.z}) ${w.poly}`);
  // LATER 1167 (ruling (a)): a front entry wholly under the walker's low line (within step height): listed, never counted.
  for (const w of m.walls.filter((x) => x.below !== undefined)) lines.push(`  wall ENTERED FROM THE FRONT UNDER THE LOW LINE (not counted): ${w.id} at tick ${w.below}, feet +${w.belowAt} from (${w.x}, ${w.z}) ${w.poly}`);
  // LATER 1167: every face whose verdict the polygon test changed from the bounding-line test's, both ways.
  for (const w of m.walls.filter((x) => x.passed !== x.passedLine)) lines.push(`  wall FLIP ${w.passedLine ? 'pass->no-pass' : 'no-pass->PASS'}: ${w.id} from (${w.x}, ${w.z}) ${w.poly}${w.why ? ` -- ${w.why}` : ''}`);
  return lines.join('\n');
}

function compare(results: MapResult[], baselinePath: string): string {
  const base = JSON.parse(readFileSync(baselinePath, 'utf8')) as MapResult[];
  const lines: string[] = [`against the baseline ${baselinePath}:`];
  for (const m of results) {
    const b = base.find((x) => x.stem === m.stem);
    if (!b || m.skipped) continue;
    for (const st of STANCES_RUN) {
      const was = new Set(b.candidates.filter((c) => { const w = c.walks[st]; return w && w !== 'unplaceable' && w.result === 'held'; }).map((c) => c.id));
      const now = new Set(m.candidates.filter((c) => { const w = c.walks[st]; return w && w !== 'unplaceable' && w.result === 'held'; }).map((c) => c.id));
      const freed = [...was].filter((id) => !now.has(id)), newly = [...now].filter((id) => !was.has(id));
      lines.push(`  ${m.stem} ${st}: held then ${was.size}, now ${now.size}; no longer held ${freed.length}${freed.length ? ` (${freed.slice(0, 5).join('; ')})` : ''}; newly held ${newly.length}`);
    }
    // LATER 1167: a baseline written before the polygon test has `passed` in the bounding line's meaning (no
    // `passedLine` field): compared against today's `passedLine` then, and said so (the review of 07a32c0052, finding 2).
    // A baseline from the two in-between commits (07a32c0052 four heights, 149ab064c8 the two-sided band) is read as
    // today's: compare only against one written at 444f3b0665 or later (the re-read's finding 2).
    const oldMeaning = b.walls.length > 0 && b.walls.every((w) => (w as Partial<WallRun>).passedLine === undefined);
    const passedThen = new Set(b.walls.filter((w) => w.passed).map((w) => w.id));
    const now = m.walls.filter((w) => (oldMeaning ? w.passedLine : w.passed));
    const newlyPassed = now.filter((w) => !passedThen.has(w.id)).map((w) => w.id);
    lines.push(`  ${m.stem} walls${oldMeaning ? ' (the baseline predates LATER 1167: compared by the bounding line)' : ''}: passed then ${passedThen.size}, now ${now.length}; NEWLY PASSED ${newlyPassed.length}${newlyPassed.length ? ` (${newlyPassed.slice(0, 5).join('; ')})` : ''}`);
    if (!oldMeaning) {
      const behindThen = new Set(b.walls.filter((w) => w.behind !== undefined).map((w) => w.id));
      const newlyBehind = m.walls.filter((w) => w.behind !== undefined && !behindThen.has(w.id)).map((w) => `${w.id} tick ${w.behind}`);
      lines.push(`  ${m.stem} walls newly crossed from behind (listed, not counted): ${newlyBehind.length}${newlyBehind.length ? ` (${newlyBehind.join('; ')})` : ''}`);
      const belowThen = new Set(b.walls.filter((w) => w.below !== undefined).map((w) => w.id));
      const newlyBelow = m.walls.filter((w) => w.below !== undefined && !belowThen.has(w.id)).map((w) => `${w.id} tick ${w.below}`);
      lines.push(`  ${m.stem} walls newly entered from the front under the low line (listed, not counted): ${newlyBelow.length}${newlyBelow.length ? ` (${newlyBelow.join('; ')})` : ''}`);
      const lineThen = new Set(b.walls.filter((w) => w.passedLine).map((w) => w.id));
      const newlyLine = m.walls.filter((w) => w.passedLine && !lineThen.has(w.id)).map((w) => w.id);
      lines.push(`  ${m.stem} walls by the bounding line: then ${lineThen.size}, now ${m.walls.filter((w) => w.passedLine).length}; NEWLY ${newlyLine.length}${newlyLine.length ? ` (${newlyLine.slice(0, 5).join('; ')})` : ''}`);
    }
  }
  return lines.join('\n');
}

const SOURCES = mapSources();
const ANY = SOURCES.some((s) => s.path);

describe.skipIf(!ANY)(`LATER 1148 census: floorless edges the ground walk holds at, and walls walked into${ANY ? '' : ' (no dev disc and no fixtures -- skipped)'}`, () => {
  it(`measures ${SOURCES.map((s) => s.stem).join(', ')}`, () => {
    const results = SOURCES.map(censusOf);
    console.log(results.map(say).join('\n'));
    if (process.env.P1_BASELINE) console.log(compare(results, process.env.P1_BASELINE));
    if (process.env.P1_OUT) writeFileSync(process.env.P1_OUT, JSON.stringify(results, null, 1));
    for (const m of results) {
      expect(Number.isFinite(m.found)).toBe(true);
      expect(Number.isFinite(m.wallsPassed)).toBe(true);
      for (const st of STANCES_RUN) expect(Number.isFinite(m.held[st] ?? 0)).toBe(true);
    }
  }, 600_000);
});

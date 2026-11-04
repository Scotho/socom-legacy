// @vitest-environment node
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isGroundSurface, isWallSurface, probeGround, segmentHits, selectFloor, upNormal, type Grid, type WorldPoly } from '@s2u/scene';
import { groundGrid, groundPolygons, STEP_PROBE_LIFT_READING, Walker, type WalkInput } from '../src/mover';
import { simMapFromBytes } from '../src/simMap';
import { Traversal } from '../src/traversal';
import { readTacData } from '../src/tacMap';
import { parseZdb } from '@s2u/archive';
import { slideEligible, slideSpanOf } from '../src/steepSlide';

/**
 * OBF-21 probe (not a gate): every MP map's walkable ledge edges walked off at stand (walk, run), crouch and prone, with
 * the page's traversal driver (fallback clip shapes), and each end tested for "stuck": no way out in eight directions,
 * hung in the air, under the floor, or stopped short of the edge with no wall hit. Opt-in: OBF21_LEDGE_SWEEP=1 and
 * SOCOM_DISC; OBF21_MAPS=MP2,MP6 narrows it; OBF21_PER_CLASS bounds the edges per drop class per map (default 40);
 * OBF21_OUT names a JSONL file for the flagged cases. A start the walk cannot leave, inside a wall's radius or with a
 * wall within 12 every way is skipped (`startStuck`): the probe asks what the ledge does, not where a placement lands.
 * The edges: each side of a walkable ground polygon (n_y at or over cos 50) at least 4 long whose floor 2 beyond is more
 * than 1 under it (or none), sampled evenly per drop class (1-6.5, 6.5-8, 8-20, over 20 or no floor).
 */
const DISC = process.env.SOCOM_DISC;
const ON = !!process.env.OBF21_LEDGE_SWEEP && !!DISC;
const MAPS = (process.env.OBF21_MAPS ?? 'MP1,MP2,MP5,MP6,MP7,MP8,MP9,MP10,MP11,MP12,MP51,MP52,MP53,MP61,MP62,MP64,MP71,MP72,MP73,MP81,MP82,MP83').split(',');
const PER_CLASS = Number(process.env.OBF21_PER_CLASS ?? 40);
const OUT = process.env.OBF21_OUT ?? '';
/** OBF21_NEAR="x,z,r": only the edges whose midpoint is within r of (x, z) (0 per class = no cap). */
/** OBF21_ALL_STARTS=1: steep tops' edges too, and a start inside a wall's radius or walled in kept (only one that cannot move is skipped). */
const ALL_STARTS = !!process.env.OBF21_ALL_STARTS;
/**
 * OBF21_REGION="ax,az,bx,bz": only the quarter on B's half of the line from A to B and on its left as seen from A
 * looking at B (the game's axes: forward (fx, fz), right (-fz, fx), so left (fz, -fx)).
 */
const REGION = process.env.OBF21_REGION ? process.env.OBF21_REGION.split(',').map(Number) : null;
function inRegion(x: number, z: number): boolean {
  if (!REGION) return true;
  const [ax, az, bx, bz] = REGION as [number, number, number, number];
  const len = Math.hypot(bx - ax, bz - az), fx = (bx - ax) / len, fz = (bz - az) / len;
  const mx = (ax + bx) / 2, mz = (az + bz) / 2;
  return (x - mx) * fx + (z - mz) * fz > 0 && (x - mx) * fz + (z - mz) * -fx > 0;
}
const NEAR = process.env.OBF21_NEAR ? process.env.OBF21_NEAR.split(',').map(Number) : null;

const MAX_SLOPE_COS = Math.cos((50 * Math.PI) / 180);
const CLASSES = [[1, 6.5], [6.5, 8], [8, 20], [20, 1e9]] as const;
const CONFIGS: { name: string; stance: 'stand' | 'crouch' | 'prone'; push: number }[] = [
  { name: 'stand-walk', stance: 'stand', push: 0.5 },
  { name: 'stand-run', stance: 'stand', push: 1 },
  { name: 'crouch', stance: 'crouch', push: 1 },
  { name: 'prone', stance: 'prone', push: 1 },
];

interface Edge { x: number; z: number; ox: number; oz: number; top: number; drop: number }

function floorAt(grid: Grid, x: number, y: number, z: number) {
  return selectFloor(probeGround(grid, x, z), y + STEP_PROBE_LIFT_READING, y);
}

function edgesOf(grid: Grid, polys: readonly WorldPoly[]): Edge[][] {
  const byClass: Edge[][] = CLASSES.map(() => []);
  for (const p of polys) {
    if (!isGroundSurface(p)) continue;
    const n = upNormal(p);
    if (!n || (!ALL_STARTS && n[1] < MAX_SLOPE_COS) || n[1] < 0.05) continue;
    const pts = p.points, k = pts.length / 3;
    let cx = 0, cz = 0;
    for (let i = 0; i < k; i++) { cx += pts[i * 3]!; cz += pts[i * 3 + 2]!; }
    cx /= k; cz /= k;
    for (let i = 0; i < k; i++) {
      const a = i * 3, b = ((i + 1) % k) * 3;
      const dx = pts[b]! - pts[a]!, dz = pts[b + 2]! - pts[a + 2]!, len = Math.hypot(dx, dz);
      if (len < 4) continue;
      let ox = dz / len, oz = -dx / len;
      const mx = (pts[a]! + pts[b]!) / 2, mz = (pts[a + 2]! + pts[b + 2]!) / 2;
      if ((mx - cx) * ox + (mz - cz) * oz < 0) { ox = -ox; oz = -oz; }
      const my = (pts[a + 1]! + pts[b + 1]!) / 2;
      const inside = floorAt(grid, mx - ox * 6, my, mz - oz * 6);
      if (!inside || Math.abs(inside.y - my) > 1.5) continue;
      const out = floorAt(grid, mx + ox * 2, inside.y, mz + oz * 2);
      const drop = out ? inside.y - out.y : 1e9;
      if ((NEAR && Math.hypot(mx - NEAR[0]!, mz - NEAR[1]!) > NEAR[2]!) || !inRegion(mx, mz)) continue;
      const c = CLASSES.findIndex(([lo, hi]) => drop > lo && drop <= hi);
      if (c < 0) continue;
      byClass[c]!.push({ x: mx, z: mz, ox, oz, top: inside.y, drop });
    }
  }
  return byClass.map((list) => {
    if (PER_CLASS <= 0 || list.length <= PER_CLASS) return list;
    const stride = list.length / PER_CLASS, picked: Edge[] = [];
    for (let i = 0; i < PER_CLASS; i++) picked.push(list[Math.floor(i * stride)]!);
    return picked;
  });
}

const input = (forward: number, right = 0): WalkInput => ({ forward, right, boost: false });

function enclosed(grid: Grid, x: number, y: number, z: number): boolean {
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const hits = segmentHits(grid, [x, y + 6.5, z], [x + Math.cos(a) * 12, y + 6.5, z + Math.sin(a) * 12], isWallSurface);
    if (hits.length === 0) return false;
  }
  return true;
}

function moves(w: Walker, t: Traversal, yaw: number): number {
  const kept = w.saveState();
  void t;                                                        // the driver stays on the walker; its own state is not kept
  w.state.yaw = yaw;
  const x0 = w.state.x, z0 = w.state.z;
  for (let i = 0; i < 60; i++) w.tick(input(1));
  const d = Math.hypot(w.state.x - x0, w.state.z - z0);
  w.restoreState(kept);
  return d;
}

// OBF-21 experiment only (opt-in, never in the suite's run): OBF21_NO_STEEP_RISE=1 replaces `Walker.groundEndpoint` with
// a copy of it as of 35f251c1b without its one line `if (rise > 0 && floor.normal[1] < MAX_SLOPE_COS) return false;`;
// OBF21_NO_STEEP_RISE=eligible keeps that refusal only where the face would slide the body (`slideEligible`). It
// measures what the rule holds; nothing in src changes, and the copy must be re-taken if the method changes.
if (process.env.OBF21_NO_STEEP_RISE) {
  const proto = Walker.prototype as unknown as Record<string, unknown>;
  proto.groundEndpoint = function groundEndpoint(this: Walker, x: number, z: number): boolean {
    const self = this as unknown as { state: { x: number; y: number; z: number }; grid: Grid; takeOff(): void; start(n: string, s: null): void; setFloorNormal(n: readonly number[]): void };
    const s = self.state, floor = selectFloor(probeGround(self.grid, x, z), s.y + STEP_PROBE_LIFT_READING, s.y);
    if (!floor) return false;
    const rise = floor.y - s.y;
    // `unbounded` (LATER 590's record): the rule as it stood before the owner's interim bound, a steep rise refused
    // whatever the face's height -- the sweep's "before" against the code as built.
    if (process.env.OBF21_NO_STEEP_RISE === 'unbounded' && rise > 0 && floor.normal[1] < Math.cos((50 * Math.PI) / 180)) return false;
    if (process.env.OBF21_NO_STEEP_RISE === 'eligible' && rise > 0 && floor.normal[1] < Math.cos((50 * Math.PI) / 180)
      && slideEligible(floor.normal[1], slideSpanOf(floor.poly.points, x, z), (this as unknown as { stance: string }).stance === 'prone')) return false;
    s.x = x; s.z = z;
    if (rise < -8) { self.takeOff(); self.start('fall', null); } else { s.y = floor.y; self.setFloorNormal(floor.normal); }
    return true;
  };
}

/**
 * OBF21_POLYWALK=1 (with OBF21_NEAR): a second probe -- every ground polygon of any slope within the radius, the body
 * placed on its centroid at each stance, walked 120 ticks in eight headings; a heading that ends under 1 from the start
 * is logged, and a start where all eight do is `stuck`. It reaches the tops the edge walk skips (steep, rounded).
 */
describe.skipIf(!ON || !process.env.OBF21_POLYWALK)('OBF-21 polygon walk (probe)', () => {
  it('walks off every ground polygon near the point', { timeout: 590_000 }, () => {
    if (OUT) writeFileSync(OUT, '');
    for (const name of MAPS) {
      const path = resolve(DISC!, `RUN/${name}.ZDB`);
      const map = simMapFromBytes(new Uint8Array(readFileSync(path)), `RUN/${name}.ZDB`);
      const grid = groundGrid(map.ground!), polys = groundPolygons(map.ground!);
      let runs = 0, stuck = 0, held = 0;
      for (const p of polys) {
        if (!isGroundSurface(p)) continue;
        const pts = p.points, k = pts.length / 3;
        let cx = 0, cy = 0, cz = 0;
        for (let i = 0; i < k; i++) { cx += pts[i * 3]!; cy += pts[i * 3 + 1]!; cz += pts[i * 3 + 2]!; }
        cx /= k; cy /= k; cz /= k;
        if ((NEAR && Math.hypot(cx - NEAR[0]!, cz - NEAR[1]!) > NEAR[2]!) || !inRegion(cx, cz)) continue;
        for (const cfg of CONFIGS) {
          const w = new Walker(grid), t = new Traversal(grid, polys);
          w.driver = t;
          if (!w.place(cx, cy + STEP_PROBE_LIFT_READING, cz)) continue;
          const f0 = floorAt(grid, w.state.x, w.state.y, w.state.z);
          if (!f0 || f0.poly.path !== p.path || Math.abs(f0.y - cy) > 1) continue;   // another floor over it: not this top
          w.stance = cfg.stance;
          runs++;
          const ends: string[] = [];
          let out = 0;
          for (let h = 0; h < 8; h++) {
            const kept = w.saveState();
            w.state.yaw = h * 45;
            let trav = '';
            for (let i = 0; i < 120; i++) { w.tick(input(cfg.push)); if (t.active) { trav = t.state().kind; break; } }
            const d = Math.hypot(w.state.x - cx, w.state.z - cz);
            if (d >= 1 || trav) out++;
            else ends.push(`yaw${h * 45}:${d.toFixed(2)}`);
            w.restoreState(kept);
          }
          if (ends.length) held++;
          if (out === 0) stuck++;
          if (ends.length && OUT) appendFileSync(OUT, `${JSON.stringify({ map: name, cfg: cfg.name, poly: p.path, at: [+cx.toFixed(2), +cy.toFixed(2), +cz.toFixed(2)], ny: +(upNormal(p)?.[1] ?? 0).toFixed(3), held: ends, stuck: out === 0 })}
`);
        }
      }
      console.log(`${name} polywalk: runs ${runs} held-somewhere ${held} stuck ${stuck}`);
    }
  });
});

describe.skipIf(!ON)('OBF-21 ledge sweep (probe)', () => {
  it('walks off every sampled ledge edge of each map', { timeout: 590_000 }, () => {
    if (OUT) writeFileSync(OUT, '');
    const summary: string[] = [];
    for (const name of MAPS) {
      const path = resolve(DISC!, `RUN/${name}.ZDB`);
      if (!existsSync(path)) { summary.push(`${name}: absent`); continue; }
      const map = simMapFromBytes(new Uint8Array(readFileSync(path)), `RUN/${name}.ZDB`);
      const grid = groundGrid(map.ground!), polys = groundPolygons(map.ground!);
      if (process.env.OBF21_NAV) {
        const bytes = new Uint8Array(readFileSync(path));
        const nav = readTacData(bytes, parseZdb(bytes)).data?.points.filter((p) => p.kind === 1) ?? [];
        console.log(`${name} nav: ${nav.map((p) => `${p.name} (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`).join('; ')}`);
      }
      const classes = edgesOf(grid, polys);
      const counts: Record<string, number> = {};
      let runs = 0;
      for (let c = 0; c < classes.length; c++) for (const e of classes[c]!) for (const cfg of CONFIGS) {
        const w = new Walker(grid), t = new Traversal(grid, polys);
        w.driver = t;
        if (!w.place(e.x - e.ox * 6, e.top + STEP_PROBE_LIFT_READING, e.z - e.oz * 6)) continue;
        if (Math.abs(w.state.y - e.top) > 1.5) continue;
        w.stance = cfg.stance;
        const yaw = (Math.atan2(-e.ox, -e.oz) * 180) / Math.PI;
        w.state.yaw = yaw;
        let startBest = 0;
        w.driver = null;
        for (let k = 0; k < 8 && startBest < 1; k++) startBest = Math.max(startBest, moves(w, t, k * 45));
        w.driver = t;
        w.state.yaw = yaw;
        const W = w as unknown as Record<string, (...a: number[]) => [number, number]>;
        const held = W.slide!.call(w, w.state.x, w.state.z, w.state.x, w.state.z);
        const inRadius = Math.hypot(held[0] - w.state.x, held[1] - w.state.z) > 0.01;
        if (startBest < 1 || (!ALL_STARTS && (inRadius || enclosed(grid, w.state.x, w.state.y, w.state.z)))) { counts.startStuck = (counts.startStuck ?? 0) + 1; continue; }
        runs++;
        const flags: string[] = [];
        let hung = 0, maxHung = 0, lastY = w.state.y, wallTicks = 0, traversal = '';
        for (let i = 0; i < 120; i++) {
          w.tick(input(cfg.push));
          if (t.active) { traversal = t.state().kind; break; }
          if (w.wallHits().length) wallTicks++;
          if (w.airborne && Math.abs(w.state.y - lastY) < 1e-3) { hung++; maxHung = Math.max(maxHung, hung); } else hung = 0;
          lastY = w.state.y;
        }
        const busy = () => (w as unknown as { action_: unknown }).action_ !== null || w.airborne;
        for (let i = 0; i < 300 && !traversal && busy(); i++) { w.tick(input(0)); if (t.active) traversal = t.state().kind; }
        if (traversal) { counts[`traversal:${traversal}`] = (counts[`traversal:${traversal}`] ?? 0) + 1; continue; }
        const s = w.state;
        const past = (s.x - e.x) * e.ox + (s.z - e.z) * e.oz;
        if (maxHung >= 10) flags.push(`hung${maxHung}`);
        if (w.airborne) flags.push('endAirborne');
        const f = floorAt(grid, s.x, s.y, s.z);
        if (!f) flags.push('noFloor');
        else if (f.y - s.y > 0.5 || (!w.airborne && s.y - f.y > 0.5)) flags.push(`offFloor${(s.y - f.y).toFixed(2)}`);
        if (past < 1 && wallTicks === 0) flags.push(`short${past.toFixed(2)}`);
        let best = 0;
        for (let k = 0; k < 8 && best < 1; k++) best = Math.max(best, moves(w, t, k * 45));
        if (best < 1) {
          flags.push(`stuck${best.toFixed(2)}`);
          let edge = true;
          for (let d = 2; d <= 30 && edge; d += 2) if (probeGround(grid, s.x + e.ox * d, s.z + e.oz * d).length) edge = false;
          if (edge) flags.push('noGroundBeyond');
          if (enclosed(grid, s.x, s.y, s.z)) flags.push('enclosed');
        }
        if (flags.length) {
          for (const fl of flags) { const key = fl.replace(/[-\d.]+$/, ''); counts[key] = (counts[key] ?? 0) + 1; }
          if (OUT) appendFileSync(OUT, `${JSON.stringify({ map: name, cfg: cfg.name, edge: { x: +e.x.toFixed(2), z: +e.z.toFixed(2), out: [+e.ox.toFixed(3), +e.oz.toFixed(3)], top: +e.top.toFixed(2), drop: +e.drop.toFixed(2) }, end: [+s.x.toFixed(2), +s.y.toFixed(2), +s.z.toFixed(2)], past: +past.toFixed(2), wallTicks, flags })}\n`);
        }
      }
      summary.push(`${name}: edges ${classes.map((l) => l.length).join('/')} runs ${runs} ${JSON.stringify(counts)}`);
      console.log(summary[summary.length - 1]);
    }
    console.log(summary.join('\n'));
    expect(summary.length).toBe(MAPS.length);
  });
});

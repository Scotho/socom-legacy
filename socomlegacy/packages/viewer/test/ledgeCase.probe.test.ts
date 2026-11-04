// @vitest-environment node
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'vitest';
import { isWallSurface, polygonNormal, probeGround, selectFloor, type Grid, type WorldPoly } from '@s2u/scene';
import { groundGrid, groundPolygons, STEP_PROBE_LIFT_READING, Walker, type WalkInput } from '../src/mover';
import { simMapFromBytes } from '../src/simMap';
import { Traversal } from '../src/traversal';
import { slideEligible, slideSpanOf } from '../src/steepSlide';

/**
 * OBF-21 probe: cases of the ledge sweep re-walked and diagnosed (OBF21_CASES = a JSONL file of the sweep's records;
 * OBF21_TRACE=1 prints every tenth tick; OBF21_LOG a file to write to; OBF21_PROFILE=1 the floor every 0.1 along the
 * edge's outward line). Per case: where the body ends, the floor and the walls there, which side of each wall within
 * the radius the body stands on (the polygon's own winding), and for eight directions the wall slide's point, whether
 * the crossing guard refuses it, the floor there, and a 60-tick walk.
 */
const DISC = process.env.SOCOM_DISC;
const FILE = process.env.OBF21_CASES ?? '';
const CASES = FILE && existsSync(FILE) ? readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const STANCE: Record<string, 'stand' | 'crouch' | 'prone'> = { 'stand-walk': 'stand', 'stand-run': 'stand', crouch: 'crouch', 'crouch-walk': 'crouch', prone: 'prone' };
const PUSH: Record<string, number> = { 'stand-walk': 0.5, 'stand-run': 1, crouch: 1, 'crouch-walk': 0.5, prone: 1 };
const LOG = process.env.OBF21_LOG ?? '';
const out = (line: string): void => { if (LOG) appendFileSync(LOG, `${line}\n`); else console.log(line); };
const inp = (f: number, r = 0): WalkInput => ({ forward: f, right: r, boost: false });

function wallsNear(polys: readonly WorldPoly[], x: number, y: number, z: number): string[] {
  const found: string[] = [];
  for (const p of polys) {
    if (!isWallSurface(p)) continue;
    const pts = p.points;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < pts.length; i += 3) {
      minX = Math.min(minX, pts[i]!); maxX = Math.max(maxX, pts[i]!);
      minY = Math.min(minY, pts[i + 1]!); maxY = Math.max(maxY, pts[i + 1]!);
      minZ = Math.min(minZ, pts[i + 2]!); maxZ = Math.max(maxZ, pts[i + 2]!);
    }
    if (x < minX - 5 || x > maxX + 5 || z < minZ - 5 || z > maxZ + 5 || maxY < y + 1 || minY > y + 22) continue;
    found.push(`${p.path} x${minX.toFixed(1)}..${maxX.toFixed(1)} y${minY.toFixed(1)}..${maxY.toFixed(1)} z${minZ.toFixed(1)}..${maxZ.toFixed(1)}`);
  }
  return found;
}

function floorsNear(grid: Grid, x: number, y: number, z: number): string {
  const f = selectFloor(probeGround(grid, x, z), y + STEP_PROBE_LIFT_READING, y);
  if (!f) return 'none';
  const pts = f.poly.points;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < pts.length; i += 3) { minX = Math.min(minX, pts[i]!); maxX = Math.max(maxX, pts[i]!); minZ = Math.min(minZ, pts[i + 2]!); maxZ = Math.max(maxZ, pts[i + 2]!); }
  return `${f.poly.path} y${f.y.toFixed(2)} x${minX.toFixed(1)}..${maxX.toFixed(1)} z${minZ.toFixed(1)}..${maxZ.toFixed(1)}`;
}

// OBF-21 experiment only (opt-in): OBF21_NO_STEEP_RISE as in `ledgeSweep.probe.test.ts` (a copy of `Walker.groundEndpoint`
// as of 35f251c1b without its steep-rise line; `eligible` keeps it where the face would slide the body).
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

describe.skipIf(CASES.length === 0 || !DISC)('OBF-21 ledge cases (probe)', () => {
  it('diagnoses each', { timeout: 590_000 }, () => {
    if (LOG) writeFileSync(LOG, '');
    const maps = new Map<string, { grid: Grid; polys: WorldPoly[] }>();
    for (const c of CASES) {
      let m = maps.get(c.map);
      if (!m) {
        maps.clear();
        const map = simMapFromBytes(new Uint8Array(readFileSync(resolve(DISC!, `RUN/${c.map}.ZDB`))), `RUN/${c.map}.ZDB`);
        m = { grid: groundGrid(map.ground!), polys: groundPolygons(map.ground!) };
        maps.set(c.map, m);
      }
      const { grid, polys } = m;
      const e = c.edge;
      const w = new Walker(grid), t = new Traversal(grid, polys);
      w.driver = t;
      // A case may give its own start (`start` [x, y, z], `yaw` degrees, the walk's heading) instead of an edge's.
      if (c.start) w.place(c.start[0], c.start[1] + STEP_PROBE_LIFT_READING, c.start[2]);
      else w.place(e.x - e.out[0] * 6, e.top + STEP_PROBE_LIFT_READING, e.z - e.out[1] * 6);
      w.stance = STANCE[c.cfg] ?? 'stand';
      w.state.yaw = c.yaw ?? (Math.atan2(-e.out[0], -e.out[1]) * 180) / Math.PI;
      const say = (tag: string): void => {
        const s = w.state;
        out(`  ${tag} ${s.x.toFixed(2)} ${s.y.toFixed(2)} ${s.z.toFixed(2)} air ${w.airborne} v ${s.vx.toFixed(1)},${s.vy.toFixed(1)},${s.vz.toFixed(1)} act ${(w as unknown as { action_: { name: string } | null }).action_?.name ?? '-'} hits ${w.wallHits().length}`);
      };
      out(`CASE ${c.map} ${c.cfg} edge ${e.x},${e.z} out ${e.out} top ${e.top} drop ${e.drop}`);
      for (let i = 0; i < 120; i++) { w.tick(inp(PUSH[c.cfg] ?? 1)); if (process.env.OBF21_TRACE && i % 10 === 0) say(`t${i}`); }
      for (let i = 0; i < 300 && ((w as unknown as { action_: unknown }).action_ !== null || w.airborne); i++) w.tick(inp(0));
      say('end');
      const s = w.state;
      out(`  floor ${floorsNear(grid, s.x, s.y, s.z)}`);
      for (const l of wallsNear(polys, s.x, s.y, s.z)) out(`  wall ${l}`);
      {
        let front = 0, back = 0;
        const sides: string[] = [];
        for (const p of polys) {
          if (!isWallSurface(p)) continue;
          const pts = p.points;
          let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity;
          for (let i = 0; i < pts.length; i += 3) {
            minX = Math.min(minX, pts[i]!); maxX = Math.max(maxX, pts[i]!); minY = Math.min(minY, pts[i + 1]!); maxY = Math.max(maxY, pts[i + 1]!);
            minZ = Math.min(minZ, pts[i + 2]!); maxZ = Math.max(maxZ, pts[i + 2]!);
          }
          const yl = s.y + 6.5;
          if (s.x < minX - 3.6 || s.x > maxX + 3.6 || s.z < minZ - 3.6 || s.z > maxZ + 3.6 || maxY < yl || minY > yl) continue;
          const n = polygonNormal(pts);
          if (!n) continue;
          const d = (s.x - pts[0]!) * n[0] + (s.y + 6.5 - pts[1]!) * n[1] + (s.z - pts[2]!) * n[2];
          if (Math.abs(d) > 3.6) continue;
          if (d >= 0) front++; else back++;
          sides.push(`${p.path.split('/').pop()}:${d.toFixed(2)}`);
        }
        out(`  sides front ${front} back ${back} [${sides.join(' ')}]`);
      }
      if (process.env.OBF21_TICKDEBUG) {
        const kept = w.saveState();
        const priv = w as unknown as { slideSpeed_: number; posture_: string; inAir: boolean };
        const W2 = w as unknown as Record<string, (...a: number[]) => unknown>;
        const sl = W2.slide!.call(w, s.x, s.z - 0.16, s.x, s.z) as [number, number];
        out(`  slide(-z 0.16) -> ${sl[0].toFixed(3)},${sl[1].toFixed(3)} crosses ${W2.crosses!.call(w, s.x, s.z, sl[0], sl[1])} hits ${w.wallHits().length} ${w.wallHits().map((h) => h.poly.path.split('/').pop() + '@L' + h.line + 'y' + h.y.toFixed(1) + ':' + h.x.toFixed(2) + ',' + h.z.toFixed(2)).join(' ')}`);
        w.state.yaw = c.yaw ?? 0;
        for (let i = 0; i < 6; i++) {
          w.tick(inp(1));
          out(`  dbg${i} ${s.x.toFixed(3)} ${s.y.toFixed(3)} ${s.z.toFixed(3)} v ${s.vx.toFixed(2)},${s.vz.toFixed(2)} slide ${priv.slideSpeed_.toFixed(2)} posture ${priv.posture_} air ${priv.inAir} hits ${w.wallHits().map((h) => h.poly.path.split('/').pop() + '@L' + h.line + 'y' + h.y.toFixed(1) + ':' + h.x.toFixed(2) + ',' + h.z.toFixed(2)).join(' ')}`);
        }
        w.restoreState(kept);
      }
      const W = w as unknown as Record<string, (...a: number[]) => unknown>;
      const parts: string[] = [];
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4, dx = Math.cos(a), dz = Math.sin(a);
        const sl = W.slide!.call(w, s.x + dx, s.z + dz, s.x, s.z) as [number, number];
        const cr = W.crosses!.call(w, s.x, s.z, sl[0], sl[1]);
        const f = selectFloor(probeGround(grid, sl[0], sl[1]), s.y + STEP_PROBE_LIFT_READING, s.y);
        parts.push(`(${dx.toFixed(1)},${dz.toFixed(1)})->${sl[0].toFixed(2)},${sl[1].toFixed(2)}${cr ? ' X' : ''} f${f ? (f.y - s.y).toFixed(2) + (f.normal[1] < Math.cos(50 * Math.PI / 180) ? 'steep' : '') : '-'}`);
      }
      out(`  dirs ${parts.join(' | ')}`);
      if (process.env.OBF21_PROFILE) {
        const [px, pz] = c.profile ?? e.out;
        let last = '';
        for (let d = -8; d <= 8.001; d += 0.1) {
          const x = s.x + px * d, z = s.z + pz * d;
          const all = probeGround(grid, x, z);
          const f = selectFloor(all, s.y + STEP_PROBE_LIFT_READING, s.y);
          const line = f ? `${(f.y - s.y).toFixed(2)} ny ${f.normal[1].toFixed(3)} span ${slideSpanOf(f.poly.points, x, z)?.toFixed(2)} ${f.poly.path}` : 'none';
          if (line !== last) out(`  prof d ${d.toFixed(1)}: ${line} | all ${all.map((h) => (h.y - s.y).toFixed(2)).join(',')}`);
          last = line;
        }
      }
      for (let k = 0; k < 8; k++) {
        const kept = w.saveState();
        w.state.yaw = k * 45;
        const x0 = w.state.x, z0 = w.state.z, y0 = w.state.y;
        let kinds = '';
        for (let i = 0; i < 60; i++) {
          w.tick(inp(1));
          const kd = t.state().kind;
          if (kd !== 'none' && !kinds.includes(kd)) kinds += kd + ',';
        }
        out(`  walk yaw${k * 45}: d ${Math.hypot(w.state.x - x0, w.state.z - z0).toFixed(2)} dy ${(w.state.y - y0).toFixed(2)} air ${w.airborne} act ${(w as unknown as { action_: { name: string } | null }).action_?.name ?? '-'} trav ${kinds} at ${w.state.x.toFixed(2)},${w.state.y.toFixed(2)},${w.state.z.toFixed(2)} hits ${w.wallHits().length}`);
        w.restoreState(kept);
      }
    }
  });
});

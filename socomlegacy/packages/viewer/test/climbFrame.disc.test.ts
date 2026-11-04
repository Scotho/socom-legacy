// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import {
  flattenScene, isWallSurface, modelGate, parseSceneGraph, polygonNormal, probeGround, segmentHits, surfaceWord, SURFACE_SKIP,
  worldCollision, worldDi, SEAL_TUNING, type CollisionOwner, type Grid, type SceneNode, type WorldPoly,
} from '@s2u/scene';
import { simMapFromBytes, stemOf } from '../src/simMap';
import { groundPolygons, WALL_PROBE_READING } from '../src/mover';
import {
  CLIMB_EDGE_INSET_PLACEHOLDER, CLIMBABLE, climbClass, columnTop, contactFromHits, contactOf, crossSection, footStepOffset, moveHit,
  obstacleRay, planClimb, type ClimbContact, type WalkHit,
} from '../src/climb';

/**
 * LATER 115 (research 313 section 8.9) measured, LATER 142 (section 8.10; reading, pending review) built: the column's
 * frame is the collider's own (`FUN_002dbfb0` D:L180187-180212 through `FUN_003109f0` D:L212151, `FUN_00308160`
 * D:L206756, `FUN_00308640` D:L206996; the cut `FUN_002dc090` D:L180218-180248): each tilted node's frame reaches its
 * polygons (`CollisionOwner.frame`, `WorldPoly.frame`) and `contactOf` takes the column and the cut in it. Off the dev
 * disc (`SOCOM_DISC`; skipped -- and said so -- without it).
 *
 * The model here is LATER 115's (reviewed as a faithful model of the read): the frame rebuilt from the scene graph
 * (`flattenScene`, `worldDi`: `placeCollision`'s order, asserted against the hull), the archive's own model-space points,
 * `columnTop` on them (the port's `'inside'` limit only where no edge spans the column at all), `crossSection` at the
 * local height, carried back out -- at the hit as `contactOf` takes it (`CLIMB_EDGE_INSET_PLACEHOLDER`: a hit within 0.01
 * of its cut's end moved 0.01 in). The build against it: (a) the frames carried; (b) hits ON each tilted face, the cut
 * at 9 heights, 16 points along it: the top within f32 rounding, the class alike on every floor in front; (c) on MP1,
 * five spots at the stand-off through the walk's contact selection (bodies, both probe lines over every wall within
 * reach, `contactFromHits`); (d) LATER 115's sample, the build against the model.
 */

const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : '';
/** The maps that hold a tilted climb face (MP52's railcars lean under `TILT`: float noise). */
const MAPS = ['MP1', 'MP2', 'M52', 'M82'] as const;
const HAVE_DISC = DISC !== '' && MAPS.every((m) => existsSync(join(DISC, 'RUN', `${m}.ZDB`)));
/** A collider whose local up axis leans over this many degrees counts as tilted. */
const TILT = 0.005;
/** The model's own inset (`CLIMB_EDGE_INSET_PLACEHOLDER`, pinned to it below): the model does not read the code under test. */
const INSET = 0.01;
const FRONT = 3.45;
/** The walk's wall probe radius (`mover.ts` `slide`: a hit only within it, `near.d < r`), standing and crouched alike. */
const REACH = WALL_PROBE_READING.stand.r;
const LINES = [['stand', SEAL_TUNING.stepHeight], ['stand', 17.394 + 2], ['crouch', 10.138 + 2]] as const;

type P3 = [number, number, number];
interface Frame { m: Float32Array; local: Float32Array; tilt: number }

/** `FUN_00308160`'s inverse (the 3x3 transposed over |row0|^2), then the hit carried in (`FUN_003085c0`). */
function toLocal(f: Frame, p: readonly number[]): P3 {
  const m = f.m, q = 1 / (m[0]! ** 2 + m[1]! ** 2 + m[2]! ** 2);
  const d = [p[0]! - m[12]!, p[1]! - m[13]!, p[2]! - m[14]!];
  const row = (o: number) => (d[0]! * m[o]! + d[1]! * m[o + 1]! + d[2]! * m[o + 2]!) * q;
  return [row(0), row(4), row(8)];
}
/** `FUN_00308640`: a local point carried out (row vector times the matrix). */
function toWorld(f: Frame, l: readonly number[]): P3 {
  const m = f.m;
  return [0, 1, 2].map((c) => l[0]! * m[c]! + l[1]! * m[4 + c]! + l[2]! * m[8 + c]! + m[12 + c]!) as P3;
}
/** The column with `contactOf`'s `'inside'` limit, in the frame the points are in. */
function column(p: Float32Array, hx: number, hz: number): { top: P3; bottom: P3 } | null {
  const col = columnTop(p, hx, hz);
  const n = polygonNormal(p);
  if (col || !n || Math.hypot(n[0], n[2]) < 1e-6) return col;
  const h = Math.hypot(n[0], n[2]), nx = n[0] / h, nz = n[2] / h;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < p.length; i += 3) { const a = -nz * p[i]! + nx * p[i + 2]!; lo = Math.min(lo, a); hi = Math.max(hi, a); }
  const a = Math.max(lo, Math.min(hi, -nz * hx + nx * hz)), off = nx * hx + nz * hz;
  return columnTop(p, nx * off - nz * a, nz * off + nx * a, true);
}

interface Loaded { grid: Grid; polys: WorldPoly[]; frames: Map<number, Frame>; owners: CollisionOwner[] }
const loaded = new Map<string, Loaded>();
function load(stem: string): Loaded {
  const done = loaded.get(stem);
  if (done) return done;
  const path = `RUN/${stem}.ZDB`, bytes = new Uint8Array(readFileSync(join(DISC, path)));
  const sim = simMapFromBytes(bytes, path), polys = groundPolygons(sim.ground);
  const placed = placedFrames(parseSceneGraph(Zar.parse(zdbMember(bytes, parseZdb(bytes), `${stemOf(path)}_GEO.ZED`))));
  expect(placed.length).toBe(polys.length);
  const frames = new Map<number, Frame>();
  polys.forEach((p, i) => {
    const f = placed[i]!;
    for (let k = 0; k < p.points.length; k += 3) {
      const w = toWorld(f, [f.local[k]!, f.local[k + 1]!, f.local[k + 2]!]);
      expect(Math.max(...w.map((v, c) => Math.abs(v - p.points[k + c]!)))).toBeLessThan(1e-3);
    }
    frames.set(p.points.byteOffset, f);
  });
  const out = { grid: sim.grid, polys, frames, owners: sim.ground.owners };
  loaded.set(stem, out);
  return out;
}
/** Each hull polygon's collider: its node's matrix (`flattenScene`) and its points before it, in `placeCollision`'s order. */
function placedFrames(models: SceneNode[]): (Frame & { path: string })[] {
  const out: (Frame & { path: string })[] = [];
  for (const f of flattenScene(models, 'worldmodel')) {
    const up = Math.hypot(f.world[4]!, f.world[5]!, f.world[6]!);
    const tilt = (Math.acos(Math.max(-1, Math.min(1, f.world[5]! / up))) * 180) / Math.PI;
    for (const poly of worldDi(f)) out.push({ m: f.world, local: Float32Array.from(poly.points), tilt, path: f.path });
  }
  return out;
}
/** A climb face as the walk and `contactOf` take one. */
function climbFace(p: WorldPoly): boolean {
  if (!CLIMBABLE.has(p.appflags ?? 0) || (surfaceWord(p) & SURFACE_SKIP) !== 0 || !moveHit(p)) return false;
  const n = polygonNormal(p.points);
  return !!n && Math.hypot(n[0], n[2]) >= 0.7;
}

/**
 * `CLIMB_EDGE_INSET_PLACEHOLDER`: the hit moved 0.01 into its cut (its first two crossings) when within that of an end,
 * one beyond the pair's ends by more than that taken as it is. The model copies the build's choice here -- the inset along
 * the world's cut, in both frames -- so it shares the placeholder and does not check it independently (LATER 142's
 * review, F4); the model's own part is the frame: the archive's points, the column and the cut in them.
 */
function inset(p: Float32Array, hit: readonly number[]): P3 {
  const h: P3 = [hit[0]!, hit[1]!, hit[2]!], d = INSET, cut = crossSection(p, h[1]);
  if (cut.length < 2) return h;
  const [a, b] = cut as [P3, P3], len = Math.hypot(b[0] - a[0], b[2] - a[2]);
  if (!(len > 2 * d)) return h;
  const s = ((h[0] - a[0]) * (b[0] - a[0]) + (h[2] - a[2]) * (b[2] - a[2])) / len;
  if (s < -d || s > len + d) return h;
  const t = Math.max(d, Math.min(len - d, s));
  return t === s ? h : [a[0] + ((b[0] - a[0]) * t) / len, h[1], a[2] + ((b[2] - a[2]) * t) / len];
}
/** The model's contact: its column and cut in the collider's frame on the archive's own points, at the hit inset. */
function colliderContact(m: Loaded, poly: WorldPoly, x: number, z: number, hit: readonly number[]): ClimbContact | null {
  const w = contactOf(poly, poly.appflags ?? 0, x, z, hit);
  if (!w) return null;
  const f = m.frames.get(poly.points.byteOffset)!, l = toLocal(f, inset(poly.points, hit)), col = column(f.local, l[0], l[2]);
  const cut = crossSection(f.local, l[1]).map((q) => toWorld(f, q));
  return {
    ...w, top: col ? toWorld(f, col.top)[1] : NaN, bottom: col ? toWorld(f, col.bottom)[1] : NaN,
    edge: cut.length >= 2 ? [cut[0]![0], cut[0]![2], cut[1]![0], cut[1]![2]] : null,
  };
}
/** `obstacleRay` with the collider's frame for the contact it finds. */
function colliderRay(m: Loaded, c: ClimbContact, x: number, y: number, z: number): ClimbContact | null {
  const Y = c.top + 0.5;
  if (!(Y < y + 21.1)) return null;
  for (const hit of segmentHits(m.grid, [x, Y, z], [x + (c.x - x) * 1.1, Y, z + (c.z - z) * 1.1])) {
    if (hit.poly === c.poly || hit.poly.path === c.poly.path || !moveHit(hit.poly)) continue;
    const next = colliderContact(m, hit.poly, x, z, hit.point);
    if (next) return next;
  }
  return null;
}
const ys = (p: Float32Array) => Array.from({ length: p.length / 3 }, (_, i) => p[i * 3 + 1]!);
const kind = (h: number, app: number) => climbClass(h, app)?.kind ?? 'none';
const tilted = (m: Loaded) => m.polys.filter((p) => climbFace(p) && m.frames.get(p.points.byteOffset)!.tilt > TILT);
const normalOf = (p: WorldPoly) => { const n = polygonNormal(p.points)!, h = Math.hypot(n[0], n[2]); return [n[0] / h, n[2] / h] as const; };

/**
 * The walk's contact for a body at (x, feet, z) in `stance`, as the walk forms it: both probe lines' hits (the low line
 * at `step_height`, the head line at the idle head + 2) over every wall within reach -- each wall's cut at the line's
 * height, its point nearest the body, kept within the probe radius (`mover.ts` `slide`) -- and the contact
 * `contactFromHits` picks from them (the head line's only when nearer and higher, D:L413823-413848). The walls are the
 * slide's (`mover.ts` `wallsNear` / `wallsOf`): the grid's collision objects whose owner the model gate passes
 * (`modelGate`, the moving owners -- the doors -- among them) and of their polygons those `isWallSurface` takes; the
 * slide's ring of nine cells is not mirrored (every wall within the 3.5 reach lies in it). Then, when that contact is on
 * one of MP1's tilted fence faces, the whole offer, the build's and the model's, the body facing the face.
 */
function offerAt(m: Loaded, x: number, feet: number, z: number, stance: 'stand' | 'crouch') {
  const lines = [SEAL_TUNING.stepHeight, (stance === 'stand' ? 17.394 : 10.138) + 2];
  const hits: WalkHit[] = [];
  const walls = m.grid.objects.flatMap((o) => (o.kind === 'collision' && modelGate(o.owner) ? o.polys.filter(isWallSurface) : []));
  lines.forEach((line, li) => {
    const hy = feet + line;
    for (const p of walls) {
      const y = ys(p.points);
      if (!(hy > Math.min(...y) && hy < Math.max(...y))) continue;
      const hc = crossSection(p.points, hy);
      if (hc.length < 2) continue;
      const dx = hc[1]![0] - hc[0]![0], dz = hc[1]![2] - hc[0]![2], l2 = dx * dx + dz * dz;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - hc[0]![0]) * dx + (z - hc[0]![2]) * dz) / l2)) : 0;
      const hx = hc[0]![0] + dx * t, hz = hc[0]![2] + dz * t;
      if (Math.hypot(hx - x, hz - z) < REACH) hits.push({ poly: p, line: li as 0 | 1, x: hx, y: hy, z: hz });
    }
  });
  const sel = contactFromHits(hits, x, z);
  if (!sel) return null;
  const p = sel.poly, hit: P3 = [sel.x, sel.y, sel.z], [nx, nz] = normalOf(p);
  const b = contactOf(p, p.appflags ?? 0, x, z, hit)!, c = colliderContact(m, p, x, z, hit)!;
  const pb = planClimb(m.grid, obstacleRay(m.grid, b, x, feet, z) ?? b, x, feet, z, -nx, -nz);   // the build
  const pm = planClimb(m.grid, colliderRay(m, c, x, feet, z) ?? c, x, feet, z, -nx, -nz);        // the model
  // The world's frame: the contact's polygon without its frame (the obstacle ray's replacement contacts keep theirs).
  const w = contactOf({ ...p, frame: undefined }, p.appflags ?? 0, x, z, hit)!;
  const pw = planClimb(m.grid, obstacleRay(m.grid, w, x, feet, z) ?? w, x, feet, z, -nx, -nz);
  return { path: p.path, hit, d: Math.hypot(hit[0] - x, hit[2] - z), pb, pm, pw, b };
}
/** The floor under (x, z) nearest `y`: the body's feet. */
const feetAt = (m: Loaded, x: number, y: number, z: number) => probeGround(m.grid, x, z).map((h) => h.y).sort((a, b) => Math.abs(a - y) - Math.abs(b - y))[0]!;

describe.skipIf(!HAVE_DISC)(`movement.climb: LATER 115, LATER 142 -- the column's frame on the disc's tilted climb faces${HAVE_DISC ? '' : ' (no dev disc: SOCOM_DISC -- skipped)'}`, () => {
  it('the tilted climb faces, their nodes and their largest lean in degrees: on MP1, MP2, M52 and M82 only (all 34 maps, the scene graph alone)', () => {
    const found: Record<string, Record<string, number>> = {};
    for (const file of readdirSync(join(DISC, 'RUN')).filter((n) => /\.ZDB$/i.test(n)).sort()) {
      const bytes = new Uint8Array(readFileSync(join(DISC, 'RUN', file)));
      const models = parseSceneGraph(Zar.parse(zdbMember(bytes, parseZdb(bytes), `${stemOf(file)}_GEO.ZED`)));
      const polys = worldCollision(models, 'worldmodel');
      placedFrames(models).forEach((f, i) => {
        if (f.tilt <= TILT || !climbFace(polys[i]!)) return;
        const at = (found[stemOf(file)] ??= {});
        at[f.path] = Math.max(at[f.path] ?? 0, Math.round(f.tilt * 100) / 100);
      });
    }
    expect(found).toEqual({
      MP1: {
        'worldmodel/alaska4d_fence01': 5, 'worldmodel/alaska4d_fence01=alaska4d_fence01': 5,
        'worldmodel/alaska4d_fence02': 8, 'worldmodel/alaska4d_fence02=alaska4d_fence02': 8,
      },
      MP2: { 'worldmodel/container_blue01=container_blue01/climb': 1.47 },
      M52: {
        'worldmodel/m52_truck_uncovered': 6.38, 'worldmodel/m52_truck_uncovered=m52_truck_uncovered': 6.38,
        'worldmodel/m52_railcar03=m52_railcar03/g2214': 2.42, 'worldmodel/m52_railcar02=m52_railcar02/g2218': 0.08,
      },
      M82: { 'worldmodel/m82truck_utility=m82truck_utility/climb': 0.43 },
    });
  }, 600_000);

  it('MP1\'s tilted fences are all appflags 5, the others appflags 4; each tilted node\'s frame reaches its polygons, no upright node\'s and no door\'s', () => {
    const apps: Record<string, number[]> = {};
    // A door's owner carries no frame (LATER 142, the doors): the original builds the frame live each call (`FUN_003109f0`
    // walks the current matrices) and the port turns a door's points in place in the world, so the world frame is the
    // live one; a frame kept from the load would go stale as the door moves. `readDoors` (`doors.ts`) drops it.
    const framedDoors = Object.fromEntries(MAPS.map((stem) => [stem, load(stem).owners.filter((o) => o.sweep && o.frame).length]));
    expect(framedDoors).toEqual({ MP1: 0, MP2: 0, M52: 0, M82: 0 });      // RED before the doors hunk: MP1 7, M82 12
    for (const stem of MAPS) {
      const m = load(stem);
      apps[stem] = [...new Set(tilted(m).map((p) => p.appflags ?? 0))].sort();
      const door = new Set(m.owners.filter((o) => o.sweep).flatMap((o) => Array.from({ length: o.count }, (_, k) => o.first + k)));
      m.polys.forEach((p, i) => {
        const f = m.frames.get(p.points.byteOffset)!, up = f.m[1] === 0 && f.m[4] === 0 && f.m[6] === 0 && f.m[9] === 0 && f.m[5]! > 0;
        if (up || door.has(i)) { expect(p.frame).toBeUndefined(); return; }
        expect(p.frame).toBeDefined();                                        // RED before the build: undefined
        expect(Array.from(p.frame!)).toEqual(Array.from(f.m));
        // `FUN_00308160`'s inverse holds: a rotation with uniform scale (every carried frame on the four maps).
        const r = [0, 4, 8].map((o) => Math.hypot(f.m[o]!, f.m[o + 1]!, f.m[o + 2]!));
        expect(Math.max(...r) / Math.min(...r)).toBeLessThan(1 + 1e-4);
      });
    }
    expect(apps).toEqual({ MP1: [5], MP2: [4], M52: [4], M82: [4] });
    expect(CLIMB_EDGE_INSET_PLACEHOLDER).toBe(INSET);                       // RED before the build: undefined
  }, 600_000);

  it('hits on each tilted face: the build\'s column top against the model\'s within f32 rounding, the cut alike, the class equal on every floor in front', () => {
    let hits = 0, most = 0;
    for (const stem of MAPS) {
      const m = load(stem);
      for (const p of tilted(m)) {
        const [nx, nz] = normalOf(p), lo = Math.min(...ys(p.points)), hi = Math.max(...ys(p.points)), app = p.appflags ?? 0;
        for (let k = 0; k < 9; k++) {
          const cut = crossSection(p.points, lo + ((k + 0.5) / 9) * (hi - lo));
          if (cut.length < 2) continue;
          for (let j = 0; j < 16; j++) {
            const u = (j + 0.5) / 16, hit = cut[0]!.map((v, c) => v + (cut[1]![c]! - v) * u);
            const fx = hit[0]! + nx * FRONT, fz = hit[2]! + nz * FRONT;
            const b = contactOf(p, app, fx, fz, hit), c = colliderContact(m, p, fx, fz, hit);
            if (!b || !c) continue;
            hits++;
            expect(Number.isFinite(b.top)).toBe(Number.isFinite(c.top));
            most = Math.max(most, Math.abs(b.top - c.top));                   // RED before the build: 17.82 (fence02)
            expect(!!b.edge).toBe(!!c.edge);
            for (const g of probeGround(m.grid, fx, fz)) {
              if (g.y < c.bottom - 2 || g.y > c.top + 1) continue;
              const off = footStepOffset(p.material);
              expect(kind(b.top + off - g.y, app)).toBe(kind(c.top + off - g.y, app));
            }
          }
        }
      }
    }
    expect(hits).toBe(11232);
    expect(most).toBeLessThan(2.5e-4);                                       // the archive's points against the hull's carried in
  }, 600_000);

  // MP1, five spots at the stand-off through the walk's contact selection: the build as the model, and where it leaves the
  // world frame.
  const at = (x: number, y: number, z: number, stance: 'stand' | 'crouch') => { const m = load('MP1'); return offerAt(m, x, feetAt(m, x, y, z), z, stance)!; };
  const same = (r: ReturnType<typeof at>) => {
    expect(r.pb?.kind).toBe(r.pm?.kind);
    if (r.pb && r.pm) r.pb.target.forEach((v, i) => expect(v).toBeCloseTo(r.pm!.target[i]!, 2));
  };

  it('MP1 (1615.65, 1985.91), standing and crouched, the hit on fence01\'s top edge at its cut\'s end: the target the hit, not 3 in from a short cut\'s end', () => {
    // LATER 115's first spot, standing and crouched: the low line's hit on fence01's top edge at the cut's end. The world
    // frame aimed 3 in from the end of a short level cut, (1616.45, 1981.41); in the collider's frame the cut at the
    // hit's local height runs the fence's length, so the target is the hit. (LATER 115's model at the boundary hit itself
    // refused: f32 rounding -- 1e-5 inside, it offers; research 313 section 8.10.)
    for (const stance of ['stand', 'crouch'] as const) {
      const r = at(1615.65, 49.97, 1985.91, stance);
      expect(r.path).toBe('worldmodel/alaska4d_fence01');
      expect(r.hit.map((v) => Math.round(v * 10) / 10)).toEqual([1614, 56.5, 1983.2]);
      expect(r.pb?.kind).toBe('over');
      expect([r.pb!.target[0], r.pb!.target[2]].map((v) => Math.round(v * 100) / 100)).toEqual([1614.02, 1983.16]);   // RED: [1616.45, 1981.41]
      same(r);
    }
  }, 600_000);

  it('MP1 (1699.86, 1967.64) and (1669.85, 1954.25): LATER 115\'s 34.25 spot equal in both frames (57.88), the inside witness 60.18', () => {
    // LATER 115's second: the hit at the face's end. Its model's 34.25 was the boundary hit's f32 rounding (1e-4 inside,
    // 57.88); at the hit as `contactOf` takes it, both frames' top is 57.88.
    const end = at(1699.86, 50.26, 1967.64, 'stand');
    expect(end.hit.map((v) => Math.round(v * 10) / 10)).toEqual([1698.6, 56.8, 1964.7]);
    expect(end.pb?.kind).toBe('over');
    expect(end.pb!.target[1]).toBeCloseTo(57.88, 1);
    expect(end.pw?.kind).toBe('over');                                       // the world's frame, LATER 142's review F4
    expect(end.pw!.target[1]).toBeCloseTo(57.88, 1);                        // 57.884 to the collider's 57.876
    same(end);
    // The step-2 witness, crouched, inside the cut: 60.18 (the world frame's 60.20).
    const inside = at(1669.85, 48.18, 1954.25, 'crouch');
    expect(inside.hit.map((v) => Math.round(v * 10) / 10)).toEqual([1669.6, 54.7, 1956.2]);
    expect(inside.pb!.target[1]).toBeCloseTo(60.18, 1);
    same(inside);
  }, 600_000);

  it('MP1 (2410.75, 3111.25), standing, a static-body census case: the still body\'s contact refused in the world frame, offered in the collider\'s (252.20) -- not a pose the walk forms', () => {
    // A static-body census case (LATER 142's re-review, G1, as LATER 115's F7): the body stood still at this spot and the
    // walk's contact selection applied once -- offered in the collider's frame only, fence02's top at the hit's height in
    // the world's frame putting the obstacle ray (the top + 0.5) on another polygon; the collider's top is 0.63 higher.
    // The walk never forms it: through the port's walk (36 poses near it: back-offs 0, 1, 3 and 6, 1 across either
    // way, the yaw 20 degrees either way) today's code offers wherever the build does, the target 251.4 to 252.2
    // against 252.2. The census's numbers, kept; not a capture spot (research 313 section 8.10).
    const offered = at(2410.75, 245.07, 3111.25, 'stand');
    expect(offered.path).toBe('worldmodel/alaska4d_fence02');
    expect(offered.pb?.kind).toBe('over');                                   // RED: refused (undefined)
    expect(offered.pb!.target[1]).toBeCloseTo(252.2, 1);
    same(offered);
  }, 600_000);

  it('MP1 (1802, 1953), standing: the target 66.17 in the collider\'s frame, 56.55 in the world\'s', () => {
    // The largest height change found (bodies every 0.25, both stances): the target 9.62 higher than the world frame's.
    const higher = at(1802, 50.05, 1953, 'stand');
    expect(higher.path).toBe('worldmodel/alaska4d_fence01');
    expect(higher.pb!.target[1]).toBeCloseTo(66.17, 1);                      // RED: 56.55
    same(higher);
  }, 600_000);

  it('MP1\'s fences, LATER 115\'s sample (one body 3.45 in front of a 16 x 9 grid per face, single-line hits within 3.5): the build offers as the model, the targets alike', () => {
    const m = load('MP1');
    let offered = 0, other = 0, most = 0;
    for (const p of tilted(m)) {
      if (p.path.includes('=')) continue;                          // the twin: the same face, held twice
      const [nx, nz] = normalOf(p), lo = Math.min(...ys(p.points)), hi = Math.max(...ys(p.points)), app = p.appflags ?? 0;
      let flo = Infinity, fhi = -Infinity;
      for (let i = 0; i < p.points.length; i += 3) { const a = -nz * p.points[i]! + nx * p.points[i + 2]!; flo = Math.min(flo, a); fhi = Math.max(fhi, a); }
      for (let j = 0; j < 16; j++) {
        const a = flo + ((j + 0.5) / 16) * (fhi - flo);
        for (let k = 0; k < 9; k++) {
          const y = lo + ((k + 0.5) / 9) * (hi - lo), cut = crossSection(p.points, y);
          if (cut.length < 2) continue;
          const a0 = -nz * cut[0]![0] + nx * cut[0]![2], a1 = -nz * cut[1]![0] + nx * cut[1]![2], u = (a - a0) / (a1 - a0);
          if (!(u > 0 && u < 1)) continue;
          const fx = cut[0]![0] + (cut[1]![0] - cut[0]![0]) * u + nx * FRONT, fz = cut[0]![2] + (cut[1]![2] - cut[0]![2]) * u + nz * FRONT;
          for (const g of probeGround(m.grid, fx, fz)) {
            for (const [, line] of LINES) {
              const hy = g.y + line;
              if (Math.abs(hy - y) > (hi - lo) / 18 + 1e-6) continue;
              const hc = crossSection(p.points, hy);
              if (hc.length < 2) continue;
              const dx = hc[1]![0] - hc[0]![0], dz = hc[1]![2] - hc[0]![2], l2 = dx * dx + dz * dz;
              const t = l2 > 0 ? Math.max(0, Math.min(1, ((fx - hc[0]![0]) * dx + (fz - hc[0]![2]) * dz) / l2)) : 0;
              const hit: P3 = [hc[0]![0] + dx * t, hy, hc[0]![2] + dz * t];
              if (Math.hypot(hit[0] - fx, hit[2] - fz) >= REACH) continue;
              const b = contactOf(p, app, fx, fz, hit), c = colliderContact(m, p, fx, fz, hit);
              if (!b || !c) continue;
              const pb = planClimb(m.grid, obstacleRay(m.grid, b, fx, g.y, fz) ?? b, fx, g.y, fz, -nx, -nz);
              const pm = planClimb(m.grid, colliderRay(m, c, fx, g.y, fz) ?? c, fx, g.y, fz, -nx, -nz);
              if (pb && pm) {
                offered++;
                expect(pb.kind).toBe(pm.kind);
                most = Math.max(most, Math.hypot(pb.target[0] - pm.target[0], pb.target[1] - pm.target[1], pb.target[2] - pm.target[2]));
              } else if (!!pb !== !!pm) other++;
            }
          }
        }
      }
    }
    // LATER 115's world frame against the model on this sample: 439 offered both ways, the target over 2 apart in xz at
    // 4 and in height at 5, at most 5.29 and 5.68 (research 313 section 8.9).
    expect({ offered, other }).toEqual({ offered: 439, other: 0 });
    expect(most).toBeLessThan(0.01);                                          // RED before the build: 5.68 or more
  }, 600_000);
});

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  GAME_FRAME_DT, M67, SURFACE_SIDE, SURFACE_SKIP, WALL_NY, flightMeets, gridCast, ignoredBy, isGroundSurface, isShotSurface,
  hullModels, launchGrenade, mapCollision, parseSceneGraph, planeHeightAt, polygonNormal, probeGround, projectileNodeSides,
  segmentHits, selectFloor, stepGrenade, surfaceWord, upNormal,
  type Grid, type GrenadeEvent, type Hit, type HullHit, type SegmentHit, type V3, type WorldPoly,
} from '@s2u/scene';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { describe, expect, it } from 'vitest';
import { probeLiftOf } from '../../src/mover';
import { simMapFromBytes } from '../../src/simMap';

/**
 * GRENADE-ONE-SIDED's real-map DROP SWEEP (the main controller's merge bar, 2026-11-25T05:50Z). A dev-disc MEASUREMENT of
 * the port's flight (`@s2u/scene` `stepGrenade` over `gridCast`, the one-sided sweep: GRENADE_FLIGHT_ONE_SIDED_READING) on
 * the disc's own hulls; it sets no value of the game's (the flight's numbers are the scene's: M67, gravity 98, muzzle 1;
 * the sweep's own spacings and heights are this instrument's, not the game's).
 *
 * THE SAMPLES -- a floor the mover stands on: a floor the column probe reports (`probeGround`), not steeper than a wall
 * (its up normal's y at least `WALL_NY` 0.7, research 24 s2's wall line), that a prone body's own pick takes
 * (`selectFloor` from the floor + `probeLiftOf('prone')`: no other floor within the pick's reach above it), with room
 * over it (`clear`: the two-sided distance to the next face up, at least `MIN_ROOM`). From
 * - a ground-plane grid every `spacing` units over the collision bounds (offset off the grid's lines), every such floor
 *   of each column; and
 * - THE FACE CENSUS: every ground face with an up normal's y of at least `WALL_NY`, at its vertex centroid, when the
 *   column there reports that very face and it qualifies as above.
 * THE FLIGHTS from each sample: `drop` (straight down from rest, from `min(DROP_H, clear/2)` over the floor), `fast`
 * (the same at 150 u/s down, a long throw's descent) and, on the grid, `throw` x 4 headings (+x, +z, -x, -z): from
 * `THROW_BACK` back and `min(THROW_H, clear/2)` up (the segment to the start clear of every face, a floor below it), a
 * short arc landing at the sample, its rise kept under 0.9 of `clear`. Each is flown to its FIRST contact (a bounce or
 * an impact), `MAX_FRAMES` at most.
 *
 * A PASS-THROUGH (the bar: none), before the first contact:
 * - **hull**: a frame's segment crosses a GROUND face (`isGroundSurface`: surface bit 0, bit 18 clear, not water; up
 *   normal's y at least `WALL_NY` -- a steeper one crossed is counted beside, `steepCrossed`) from its UP side to below, ahead of the frame's contact (or with none), and the flight did NOT meet it
 *   (`flightMeets` false: no side bit, or a map hull node's face not entered from its front -- `segment.ts`
 *   `entersFront`, on the crossing's own Newell plane since the sweep's cause B; r0004 patch and clutter nodes are met
 *   from both sides, `projectileNodeSides`);
 * - **column**: a frame with no contact starts at or over a floor (up normal's y at least `WALL_NY`) the column probe
 *   reports at its start and ends more than `BELOW_TOL` under the SAME face in the column at its end (the floor the
 *   mover stands on, passed whatever the segment query says);
 * - **void**: under the map's lowest collision vertex with no contact (out of the world); reported with the first face
 *   the flight crossed and did not meet (any face: how it got out) and the floor the sample stood on.
 * **open** (the sweep's cause D, counted BESIDE the bar and printed, never failing it): out of the world as `void`, but
 *   with NO face crossed and not met -- the flight left through an opening of the hull (an open hull edge), which the
 *   one-sided rule never touched: the two-sided flight it replaced flies it alike. Named in research 85 §5.1 and LATER
 *   (the open hull edges' row).
 * One the material table explains is counted BESIDE the bar, never in it (the original's own rule after a face is
 * recorded, `HandleIntersections`; not the one-sided question): **material** -- a floor crossed whose material is
 * passed over (`ignoredBy`, PENETRATION 1: `INVISIBLE_DI`, met or not -- recorded, it would still be passed) or lets the
 * grenade through (`pass` events: glass, a railing; also counted as `matPass`), and a column or void pass after such a
 * crossing.
 */

const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const RUN = DISC ? join(DISC, 'RUN') : '';
export const DISC_MAPS: readonly string[] = RUN && existsSync(RUN)
  ? readdirSync(RUN).filter((f) => /^MP\d+\.ZDB$/i.test(f)).map((f) => f.replace(/\.ZDB$/i, '').toUpperCase())
    .sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)))
  : [];
export const HAVE_DISC = DISC_MAPS.length > 0;

const BELOW_TOL = 0.5;
const MIN_ROOM = 1;
const DROP_H = 12;
const FAST_VY = -150;
const THROW_H = 8;
const THROW_BACK = 6;
const THROW_RISE = 20;
const MAX_FRAMES = 60;
const PRONE_LIFT = probeLiftOf('prone');
const MAX_GROUPS_SHOWN = Number(process.env.DROP_SWEEP_SHOW) || 3;
const HEADINGS: readonly [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];

export interface FaceFacts {
  face: string; owner: string; material: string; word: number; side: boolean; bit18: boolean;
  /** The Newell normal's y (`polygonNormal`, the winding) and the hull test's own normal's (`(p2 - p1) x (p0 - p1)`, normalised). */
  windingNy: number; triNy: number;
  /** The largest distance of a vertex from the hull test's own plane (through p1): a warped face's. */
  warp: number;
  /** The one-sided rule's verdict from above: side bit set, bit 18 clear, the hull test's own normal pointing up. */
  admitsFromAbove: boolean;
}
export interface PassThrough extends Partial<FaceFacts> {
  kind: 'hull' | 'column' | 'void' | 'material' | 'open';
  flight: string; source: 'grid' | 'census';
  sample: V3; start: V3; at: V3;
  /** Whether the column probe reports the face at the crossing; whether the frame's segment query listed it. */
  probeReports?: boolean; segmentLists?: boolean;
  /** hull: the frame's start and end, signed distance from the hull test's own plane (its `frontSides` needs >= 0, < 0). */
  triA?: number; triB?: number;
  /** void: the face the sample stood on. */
  stood?: string;
}
export interface MapSweep {
  stem: string; spacing: number; ms: number; columns: number; floors: number; noFloor: number; steep: number; covered: number; noRoom: number;
  censusFaces: number; censusSkipped: number; drops: number; throws: number; throwsSkipped: number; noContact: number;
  matPass: number; steepCrossed: number; staticBad: number; passes: PassThrough[]; material: PassThrough[];
  /** Cause D, beside the bar: out of the world with no face crossed and not met (an open hull edge). */
  open: PassThrough[];
}

const r2 = (v: number): string => (Math.round(v * 100) / 100).toString();
const fmt = (p: readonly number[]): string => p.map(r2).join(', ');

function faceLabel(grid: Grid, poly: WorldPoly, owner: { path: string }): string {
  for (const o of grid.objects) {
    if (o.kind !== 'collision' || o.owner !== owner) continue;
    const i = o.polys.indexOf(poly);
    if (i >= 0) return `${o.owner.path}#${i}`;
  }
  return `${owner.path}#?`;
}

/** The hull test's own plane (`segment.ts` `frontSides`): its unit normal `(p2 - p1) x (p0 - p1)` and p1. */
function triPlane(points: Float32Array): { n: V3; p: V3 } | null {
  const ux = points[6]! - points[3]!, uy = points[7]! - points[4]!, uz = points[8]! - points[5]!;
  const vx = points[0]! - points[3]!, vy = points[1]! - points[4]!, vz = points[2]! - points[5]!;
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz);
  return l > 0 ? { n: [nx / l, ny / l, nz / l], p: [points[3]!, points[4]!, points[5]!] } : null;
}
const planeDist = (t: { n: V3; p: V3 }, q: readonly number[]): number =>
  t.n[0] * (q[0]! - t.p[0]) + t.n[1] * (q[1]! - t.p[1]) + t.n[2] * (q[2]! - t.p[2]);

function faceFacts(grid: Grid, poly: WorldPoly, owner: { path: string }, material: string): FaceFacts {
  const w = surfaceWord(poly), wn = polygonNormal(poly.points), tp = triPlane(poly.points);
  let warp = 0;
  if (tp) for (let i = 0; i < poly.points.length; i += 3) warp = Math.max(warp, Math.abs(planeDist(tp, [poly.points[i]!, poly.points[i + 1]!, poly.points[i + 2]!])));
  const triNy = tp ? tp.n[1] : NaN;
  return {
    face: faceLabel(grid, poly, owner), owner: owner.path, material, word: w, side: (w & SURFACE_SIDE) !== 0, bit18: (w & SURFACE_SKIP) !== 0,
    windingNy: wn ? wn[1] : NaN, triNy, warp, admitsFromAbove: (w & SURFACE_SIDE) !== 0 && (w & SURFACE_SKIP) === 0 && triNy > 0,
  };
}

/** The room over a floor: the nearest face two-sided above y + 0.05, up to `cap`. */
function clearance(grid: Grid, x: number, y: number, z: number, cap: number): number {
  const hits = segmentHits(grid, [x, y + 0.05, z], [x, y + cap, z], isShotSurface);
  return hits.length ? hits[0]!.point[1] - y : cap;
}

/** A floor the mover stands on: the prone body's own pick from it is itself (no other floor within its reach above). */
const standsOn = (floors: readonly Hit[], f: Hit): boolean => selectFloor(floors, f.y + PRONE_LIFT, f.y)?.poly === f.poly;

interface FlightResult { pass: PassThrough | null; contact: boolean; matPass: number; steepCrossed: number }
type Frame = { a: V3; b: V3; hs: HullHit[]; raw: SegmentHit[] };

function fly(grid: Grid, defaultMaterial: string, pos: V3, vel: V3, flight: string, source: 'grid' | 'census', sample: V3,
  worldMinY: number): FlightResult {
  const real = gridCast(grid, defaultMaterial);
  let frame: Frame | null = null;
  const cast = (a: V3, b: V3): HullHit[] => {
    const hs = real(a, b);
    frame = { a, b, hs, raw: segmentHits(grid, a, b, isShotSurface) };
    return hs;
  };
  const g = launchGrenade([...pos], [vel[0] / M67.muzzleVelocity, vel[1] / M67.muzzleVelocity, vel[2] / M67.muzzleVelocity], M67);
  let matPass = 0, steepCrossed = 0;
  let materialFloor: FaceFacts | null = null;    // the first floor crossed that its material passes (ignored or through)
  let firstUnmet: (FaceFacts & { at: V3 }) | null = null;   // the first face of any kind crossed and not met
  const base = { flight, source, sample, start: pos };
  for (let i = 0; i < MAX_FRAMES && g.state === 'flight'; i++) {
    frame = null;
    const events: GrenadeEvent[] = stepGrenade(g, GAME_FRAME_DT, cast);
    const f = frame as Frame | null;
    const contact = events.find((e) => e.kind === 'bounce' || e.kind === 'explode');
    if (f) {
      if (f.raw.length !== f.hs.length) throw new Error(`the cast and the segment query disagree (${f.hs.length} / ${f.raw.length})`);
      let cut = Infinity;
      if (contact && 'point' in contact) {
        let best = Infinity;
        for (const h of f.hs) {
          const dd = Math.hypot(h.point[0] - contact.point[0], h.point[1] - contact.point[1], h.point[2] - contact.point[2]);
          if (flightMeets(h, g) && dd < best) { best = dd; cut = h.t; }
        }
      }
      const d: V3 = [f.b[0] - f.a[0], f.b[1] - f.a[1], f.b[2] - f.a[2]];
      for (let k = 0; k < f.hs.length; k++) {
        const h = f.hs[k]!, raw = f.raw[k]!;
        if (h.t >= cut) continue;
        if (!flightMeets(h, g)) firstUnmet ??= { ...faceFacts(grid, raw.poly, raw.owner, h.material.name), at: [...h.point] };
        if (!isGroundSurface(raw.poly)) continue;
        const up = upNormal(raw.poly);
        if (!up || up[1] < 1e-6 || up[0] * d[0] + up[1] * d[1] + up[2] * d[2] >= 0) continue;   // not from the up side
        if (up[1] < WALL_NY) { steepCrossed++; continue; }
        const passed = events.some((e) => e.kind === 'pass' && Math.hypot(e.point[0] - h.point[0], e.point[1] - h.point[1], e.point[2] - h.point[2]) < 1e-4);
        if (passed) matPass++;
        if (ignoredBy(h.material) || passed) { materialFloor ??= faceFacts(grid, raw.poly, raw.owner, h.material.name); continue; }
        if (flightMeets(h, g)) continue;
        const tp = triPlane(raw.poly.points);
        return {
          contact: false, matPass, steepCrossed,
          pass: {
            kind: 'hull', ...base, at: [...h.point], ...faceFacts(grid, raw.poly, raw.owner, h.material.name),
            probeReports: probeGround(grid, h.point[0], h.point[2]).some((p) => p.poly === raw.poly), segmentLists: true,
            ...(tp ? { triA: planeDist(tp, f.a), triB: planeDist(tp, f.b) } : {}),
          },
        };
      }
      if (!contact) {
        const before = probeGround(grid, f.a[0], f.a[2]).filter((p) => f.a[1] >= p.y - 1e-3);
        for (const p of probeGround(grid, f.b[0], f.b[2])) {
          if (p.normal[1] < WALL_NY || f.b[1] >= p.y - BELOW_TOL || !before.some((q) => q.poly === p.poly)) continue;
          const k = f.raw.findIndex((r) => r.poly === p.poly);
          const facts = faceFacts(grid, p.poly, p.owner, k >= 0 ? f.hs[k]!.material.name : '?');
          const pass: PassThrough = { kind: 'column', ...base, at: [...g.pos], ...facts, probeReports: true, segmentLists: k >= 0 };
          if (k >= 0 && ignoredBy(f.hs[k]!.material)) pass.kind = 'material';
          else if (materialFloor) Object.assign(pass, { kind: 'material' }, k >= 0 ? {} : materialFloor);
          return { contact: false, matPass, steepCrossed, pass };
        }
      }
    }
    if (contact) return { pass: null, contact: true, matPass, steepCrossed };
    if (g.pos[1] < worldMinY - 1) {
      if (materialFloor) return { contact: false, matPass, steepCrossed, pass: { kind: 'material', ...base, at: [...g.pos], ...materialFloor } };
      const stood = probeGround(grid, sample[0], sample[2]).find((q) => Math.abs(q.y - sample[1]) < 1e-3);
      const via: Partial<FaceFacts> = {};
      if (firstUnmet) { const { at: _at, ...facts } = firstUnmet; Object.assign(via, facts); }
      return {
        contact: false, matPass, steepCrossed,
        pass: { kind: firstUnmet ? 'void' : 'open', ...base, at: firstUnmet ? firstUnmet.at : [...g.pos], ...via, ...(stood ? { stood: faceLabel(grid, stood.poly, stood.owner) } : {}) },
      };
    }
  }
  return { pass: null, contact: false, matPass, steepCrossed };
}

/**
 * The sweep review's N6: the owners of the map's OWN hull -- its worldmodel and the archive's joined libraries
 * (`hullModels`), read without the r0004 patch (`applyR0004MapPatch` not run) and without CLUTTER.ZAR (no instance) --
 * that `projectileNodeSides` would take for a patch or clutter node (two-sided). None is the bar: the marks
 * (`R0004_NODE_NAME_PREFIX`, `CLUTTER_PATH_ROOT`) are the port's own names, and a disc node so named would be met from
 * behind on the one-sided hull. The loader's own path (`simMap.ts` `simMapFromBytes`), less the patch and the clutter.
 */
export function hullOwnersMarked(stem: string): string[] {
  const bytes = new Uint8Array(readFileSync(join(RUN, `${stem}.ZDB`)));
  const toc = parseZdb(bytes);
  const models = parseSceneGraph(Zar.parse(zdbMember(bytes, toc, `${stem}_GEO.ZED`)));
  const { owners } = mapCollision(hullModels(bytes, toc, stem, models), stem, () => [], 'worldmodel');
  // Non-vacuity: an empty owner list (a loader that returned nothing) must not read as 'no hull owner marked'.
  if (owners.length === 0) throw new Error(`hullOwnersMarked: ${stem} has no hull owners (the loader returned none)`);
  return [...new Set(owners.map((o) => o.path).filter((p) => projectileNodeSides(p) === 'two-sided'))];
}

/** The worker's event loop given a turn now and then, so vitest's own messages are answered during a long sweep. */
let lastYield = 0;
async function yieldSometimes(): Promise<void> {
  if (Date.now() - lastYield < 200) return;
  await new Promise<void>((r) => setImmediate(r));
  lastYield = Date.now();
}

/** One map swept: loaded, flown, and let go before the next (the host is memory-tight). */
export async function sweepMap(stem: string, spacing: number): Promise<MapSweep> {
  const t0 = Date.now();
  let map: ReturnType<typeof simMapFromBytes> | null = simMapFromBytes(new Uint8Array(readFileSync(join(RUN, `${stem}.ZDB`))), `RUN/${stem}.ZDB`);
  const grid = map.grid, defaultMaterial = map.defaultMaterial ?? '';
  map = null;
  const out: MapSweep = {
    stem, spacing, ms: 0, columns: 0, floors: 0, noFloor: 0, steep: 0, covered: 0, noRoom: 0, censusFaces: 0, censusSkipped: 0,
    drops: 0, throws: 0, throwsSkipped: 0, noContact: 0, matPass: 0, steepCrossed: 0, staticBad: 0, passes: [], material: [],
    open: [],
  };
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity, minY = Infinity;
  for (const o of grid.objects) {
    if (o.kind !== 'collision') continue;
    for (const p of o.polys) {
      for (let i = 0; i < p.points.length; i += 3) {
        minX = Math.min(minX, p.points[i]!); maxX = Math.max(maxX, p.points[i]!);
        minY = Math.min(minY, p.points[i + 1]!);
        minZ = Math.min(minZ, p.points[i + 2]!); maxZ = Math.max(maxZ, p.points[i + 2]!);
      }
      if (isGroundSurface(p)) {
        const up = upNormal(p), tp = triPlane(p.points);
        if (up && up[1] >= WALL_NY && !((surfaceWord(p) & SURFACE_SIDE) !== 0 && tp && tp.n[1] > 0)) out.staticBad++;
      }
    }
  }
  const record = (r: FlightResult): void => {
    out.matPass += r.matPass;
    out.steepCrossed += r.steepCrossed;
    if (r.pass?.kind === 'material') out.material.push(r.pass);
    else if (r.pass?.kind === 'open') out.open.push(r.pass);
    else if (r.pass) out.passes.push(r.pass);
    else if (!r.contact) out.noContact++;
  };
  const drops = (x: number, y: number, z: number, clear: number, source: 'grid' | 'census'): void => {
    const h = Math.min(DROP_H, clear / 2), sample: V3 = [x, y, z], start: V3 = [x, y + h, z];
    record(fly(grid, defaultMaterial, start, [0, 0, 0], 'drop', source, sample, minY));
    record(fly(grid, defaultMaterial, start, [0, FAST_VY, 0], 'fast', source, sample, minY));
    out.drops += 2;
  };
  // The grid.
  for (let x = minX + spacing / 2 + 0.137; x < maxX; x += spacing) {
    for (let z = minZ + spacing / 2 + 0.291; z < maxZ; z += spacing) {
      await yieldSometimes();
      out.columns++;
      const floors = probeGround(grid, x, z);
      if (!floors.length) { out.noFloor++; continue; }
      for (const f of floors) {
        if (f.normal[1] < WALL_NY) { out.steep++; continue; }
        if (!standsOn(floors, f)) { out.covered++; continue; }
        const clear = clearance(grid, x, f.y, z, DROP_H * 2);
        if (clear < MIN_ROOM) { out.noRoom++; continue; }
        out.floors++;
        drops(x, f.y, z, clear, 'grid');
        const h = Math.min(THROW_H, clear / 2);
        const top: V3 = [x, f.y + h, z];
        const vy = Math.min(THROW_RISE, Math.sqrt(Math.max(0, 2 * M67.gravity * (0.9 * clear - h))));
        const tFall = (vy + Math.sqrt(vy * vy + 2 * M67.gravity * h)) / M67.gravity;
        const vh = THROW_BACK / tFall;
        for (const [hx, hz] of HEADINGS) {
          const start: V3 = [x - hx * THROW_BACK, f.y + h, z - hz * THROW_BACK];
          // The start in the sample's own open space (the segment to it clear) and over a floor (not over the hull's open
          // underside, as under a terrain face that overhangs a stream bed: MP10's underwater_9).
          if (segmentHits(grid, top, start, isShotSurface).length || !probeGround(grid, start[0], start[2]).some((q) => q.y <= start[1])) { out.throwsSkipped++; continue; }
          record(fly(grid, defaultMaterial, start, [hx * vh, vy, hz * vh], 'throw', 'grid', [x, f.y, z], minY));
          out.throws++;
        }
      }
    }
  }
  // The face census.
  for (const o of grid.objects) {
    if (o.kind !== 'collision') continue;
    for (const p of o.polys) {
      if (!isGroundSurface(p)) continue;
      const up = upNormal(p);
      if (!up || up[1] < WALL_NY) continue;
      await yieldSometimes();
      out.censusFaces++;
      const k = p.points.length / 3;
      let cx = 0, cz = 0;
      for (let i = 0; i < k; i++) { cx += p.points[i * 3]!; cz += p.points[i * 3 + 2]!; }
      cx /= k; cz /= k;
      const y = planeHeightAt(p.points, cx, cz);
      const floors = probeGround(grid, cx, cz), f = floors.find((q) => q.poly === p);
      const clear = y === null ? 0 : clearance(grid, cx, y, cz, DROP_H * 2);
      if (y === null || !f || !standsOn(floors, f) || clear < MIN_ROOM) { out.censusSkipped++; continue; }
      drops(cx, y, cz, clear, 'census');
    }
  }
  out.ms = Date.now() - t0;
  return out;
}

function groupLines(stem: string, label: string, passes: readonly PassThrough[]): string[] {
  const groups = new Map<string, PassThrough[]>();
  for (const p of passes) {
    const key = `${p.kind} ${p.face ?? '-'}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const lines: string[] = [];
  let shown = 0;
  for (const [key, ps] of groups) {
    if (shown++ >= MAX_GROUPS_SHOWN) { lines.push(`  ${label} ${stem} ... ${groups.size - MAX_GROUPS_SHOWN} more faces`); break; }
    const p = ps[0]!, flights = [...new Set(ps.map((q) => `${q.flight}/${q.source}`))].join(',');
    lines.push(`  ${label} ${stem} ${key} x${ps.length} (${flights}) e.g. sample (${fmt(p.sample)}) start (${fmt(p.start)}) at (${fmt(p.at)})`
      + (p.face !== undefined
        ? ` ${p.material} word 0x${p.word!.toString(16)} side ${p.side ? 1 : 0} bit18 ${p.bit18 ? 1 : 0} n_y newell ${p.windingNy!.toFixed(3)} tri ${p.triNy!.toFixed(3)} warp ${p.warp!.toFixed(2)}`
          + `${p.triA !== undefined ? ` triA ${p.triA.toFixed(3)} triB ${p.triB!.toFixed(3)}` : ''}${p.stood !== undefined ? ` stood ${p.stood}` : ''} probe ${p.probeReports ? 'reports' : 'not'} segment ${p.segmentLists ? 'lists' : 'MISSES'} admitsFromAbove ${p.admitsFromAbove ? 'yes' : 'NO'}`
        : ''));
  }
  return lines;
}

export function sweepTable(rows: readonly MapSweep[]): string {
  // The face lines first and the table LAST, so a short tail of the run (obfrun keeps 60 lines) still holds the table.
  const lines: string[] = [];
  for (const r of rows) lines.push(...groupLines(r.stem, 'MATERIAL', r.material).slice(0, 1));
  for (const r of rows) lines.push(...groupLines(r.stem, 'OPEN', r.open).slice(0, 1));
  for (const r of rows) lines.push(...groupLines(r.stem, 'PASS', r.passes));
  lines.push('GRENADE DROP SWEEP  map spacing | columns floors noFloor steep covered noRoom | census faces/skipped | drops throws(skipped) | noContact matPass steepX staticBad | material | open (beside) | PASSES (hull/column/void) | s');
  for (const r of rows) {
    const n = (k: PassThrough['kind']): number => r.passes.filter((p) => p.kind === k).length;
    lines.push(`  ${r.stem.padEnd(5)} ${String(r.spacing).padStart(3)} | ${r.columns} ${r.floors} ${r.noFloor} ${r.steep} ${r.covered} ${r.noRoom} | ${r.censusFaces}/${r.censusSkipped} | ${r.drops} ${r.throws}(${r.throwsSkipped}) | ${r.noContact} ${r.matPass} ${r.steepCrossed} ${r.staticBad} | ${r.material.length} | ${r.open.length} | ${r.passes.length} (${n('hull')}/${n('column')}/${n('void')}) | ${(r.ms / 1000).toFixed(1)}`);
  }
  return lines.join(String.fromCharCode(10));
}

/**
 * One group of maps swept as a test file: each map its own case, a measurement (skipped by name when the disc lacks the
 * map), then ONE case holding the bar over the group, the table printed first (one failure block, so the table stays in
 * a short tail). `DROP_SWEEP_MAPS` (a comma list) replaces the group, `DROP_SWEEP_SPACING` the spacing, `DROP_SWEEP_OUT`
 * (a path outside the tree) receives every pass-through as JSON.
 */
export function defineDropSweep(label: string, group: readonly string[], spacing: number): void {
  const maps = process.env.DROP_SWEEP_MAPS ? process.env.DROP_SWEEP_MAPS.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) : group;
  const step = Number(process.env.DROP_SWEEP_SPACING) || spacing;
  const rows: MapSweep[] = [];
  describe.skipIf(!HAVE_DISC)(`GRENADE-ONE-SIDED drop sweep ${label}`, () => {
    for (const stem of maps) {
      const have = DISC_MAPS.includes(stem);
      // The sweep review's N6: the owner-path marks `projectileNodeSides` reads take no disc hull node for a patch or
      // clutter node -- the map's own hull, read without the r0004 patch and without CLUTTER.ZAR, has none two-sided.
      it.skipIf(!have)(`${stem}: no disc hull node carries the r0004 patch's or the clutter's owner mark`, () => {
        expect(hullOwnersMarked(stem), 'disc hull owners the flight would meet two-sided').toEqual([]);
      });
      it.skipIf(!have)(`${stem}: swept (grid ${step} u + face census)${have ? '' : ' -- SKIPPED: not on the disc'}`, async () => {
        rows.push(await sweepMap(stem, step));
      }, 600_000);
    }
    it(`group ${label} (${maps.join(', ')}): no grenade passes through a floor`, () => {
      console.log(sweepTable(rows));
      if (process.env.DROP_SWEEP_OUT) writeFileSync(process.env.DROP_SWEEP_OUT, JSON.stringify(rows.map((r) => ({ ...r })), null, 1));
      const bad = rows.filter((r) => r.passes.length).map((r) => `${r.stem} ${r.passes.length}`);
      expect(bad.join(', ') || 'none', 'maps with pass-throughs').toBe('none');
    });
  });
}

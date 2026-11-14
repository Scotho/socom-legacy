// @vitest-environment node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { archivePositionForm, interpretChainPartsAs, walkChain, type PositionForm } from '@s2u/mesh';
import {
  flattenScene, loadModelLibrary, NODE_INSTANCE, parseSceneGraph, placeInstances, polygonNormal, resolveChunk, segmentHits, surfaceMaterial,
  SURFACE_SIDE, SURFACE_SKIP, surfaceWord, transformPoint, applyR0004MapPatch, modelGate,
  type CollisionOwner, type Grid, type ModelLibrary, type PlacedModel, type WorldPoly,
} from '@s2u/scene';
import { blastExposed, blastSeesThrough, ROOT_HEIGHT } from '../../viewer/src/net/blast';
import { assetLibStems } from '../../viewer/src/mapTextures';
import { roundAdmits } from '../../viewer/src/round';
import { reachGate } from '../../viewer/src/sceneHealth';
import { roomOn, surfacesOver } from './sceneRoundsDisc';

/**
 * NADE-BLAST geometry census (the owner's reports of 2026-11-11: grenades through walls, mostly on DESERT GLORY (MP6,
 * new in v0.4.18) and FROSTFIRE (MP2); "it does make me question some collision on certain object types being off
 * maybe"), dev disc. A measurement through the repository's readers -- the room's own map (`roomOn`: `loadSimMap`,
 * r0004's G1 edits, the room's opening world state) and the room's own blast predicates (`blastExposed`, `roundAdmits`,
 * `reachGate`) -- that changes nothing the game does. It prints its tables and asserts only that it ran; the numbers are
 * filed in research 400 (`docs/research/400-grenade-blast-geometry.md`). It skips without the disc (a skip, not a pass).
 *
 * Three parts, per map (MP6 and MP2 against MP51 and MP72, which drew no report):
 *
 * 1. The collision faces by object type (`typeOf`, a name rule on the owner's path -- a census key, not a reading):
 *    (a) one-faced: an admitted wall face (`roundAdmits`, |n_y| < 0.7) with no admitted face met from its front on the
 *        `BACK` u behind its centroid (`segmentHits` front-only from behind) -- what a blast behind it passes under the
 *        one-sided line (v0.4.15, 07386ff045); (b) faces the blast's lines never meet: side bit 1 clear, camera-only, or
 *        on an owner the query's gate refuses (`modelGate`: off or no `m_hasDI`); (c) faces of a material the line to
 *        the head sees through since v0.4.18 (a27aa6298f, `blastSeesThrough`); (e) wall faces whose material has a
 *        PENETRATION of 0.0001 or more, which line 1's reach gate (`FUN_003c80e0`) only shrinks instead of stopping.
 *    And (d), from the drawn side: every opaque drawn wall triangle (a placement `placeInstances` draws at the opening --
 *    the name rule's alternate states left out, as `loadMap` does -- not in the alpha pass, fogged, |n_y| < 0.7) is
 *    probed `COVER` u either side along its normal for collision: an admitted face the head's line stops at ('solid'),
 *    an admitted see-through face only ('see-through only'), a face the lines never meet only ('unmet only'), or none
 *    ('no collision'). Area-weighted, by type, and the worst placements listed.
 * 2. The sweep: every admitted wall face at least `MIN_FACE` u high and wide, sampled every `STEP` u along it; a body
 *    `BEHIND` u off the face on a floor level with the face's foot (either side), a grenade 30/45/60 u straight across
 *    the face on the other side and 45 u at +-35 degrees, at rest (`REST_LIFT`) and in the air (`AIR_LIFT`), standing and
 *    crouched; the body's and the blast's approach to the face clear of every admitted face up to `NEAR` u off its plane
 *    (so the face, or a wall up to `NEAR` thick, is what lies between), and neither point inside a closed solid
 *    (`inSolid`: a tank, a container, a building with no inside -- where no grenade or body can be). Each case is
 *    judged by the line to the head (the port's `HEAD_OVER`; and the posed eye, research 180) under
 *    four rules -- v0.4.18's (one-sided, see-through: `blastExposed`), one-sided only (v0.4.15-17), see-through only, and
 *    neither (LATER 416, v0.4.14) -- and by line 1 (`reachGate` on the line to `ROOT_HEIGHT`, a stand-in for the unread
 *    end point, C1), one-sided (the reading) and two-sided (the port's `BLAST_REACH_LINE_SIDES_READING`). Every line the
 *    port leaves open is checked against the drawn triangles: on a line with no admitted face, drawn geometry is (d) on
 *    the line; on a line a rule opened, it says the face let through is drawn solid there (not a gap between bars).
 * 3. The ranking: of the cases the port hurts (v0.4.18's line open), the share opened by each rule change, the share
 *    line 1 would stop, the share the head height alone opens, and the share through drawn geometry with no collision.
 */
const DISC = [process.env.SOCOM_DISC, process.env.SOCOM_PC_ROOT ? join(process.env.SOCOM_PC_ROOT, 'game/disc') : undefined]
  .find((d) => !!d && ['MP6', 'MP2', 'MP51', 'MP72'].every((m) => existsSync(join(d, `RUN/${m}.ZDB`))));
const MAPS = ['MP6', 'MP2', 'MP51', 'MP72'] as const;

type V3 = [number, number, number];
type Posture = 'stand' | 'crouch';
/** The room's `HEAD_OVER` (`room.ts:1477`, unexported, no source: synthesis item 2). */
const HEAD_OVER: Record<Posture, number> = { stand: 18.3, crouch: 11.1 };
/** Research 180 s1.3's posed eye (`HEAD_HEIGHT_READING`): the nearest read stand-in for the head bone (`actor+0x308`). */
const EYE: Record<Posture, number> = { stand: 15.88, crouch: 9.9 };
/** A face's back probe: how far behind it a backing face is looked for. */
const BACK = 10;
/** The drawn triangle's collision probe, either side. */
const COVER = 4;
const MIN_FACE = 6, STEP = 12, BEHIND = 6;
/** The approach checks stop this far off the face's plane, each side: a wall up to this thick is the face's own. */
const NEAR = 4.5;
const REST_LIFT = 1, AIR_LIFT = 15;
const RADIUS = 150;   // the M67's (`roomBlastOcclusion` pins it off the kit table)
const ALTERNATE_STATE = /^(vis_)?whats_left$|^parts$|^(beer|radio)_parts$|^nolight$|_off$|_pulse$/i;   // loadMap.ts:1335

/** The census key: a name rule on the path, first match wins (not a reading of the game: a way to count). */
const TYPES: [string, RegExp][] = [
  ['camera blockers', /camonly|camcollide|cam_collide|nocam/],
  ['doors', /door/],
  ['windows and glass', /window|wglass|glass|pane/],
  ['bars, jails, grates', /jail|hostagerescue|celldoor|cdoor|grat|bars/],
  ['vehicles', /truck|jeep|railcar|train|boat|heli|\bcart|turret|crane/],
  ['crates, boxes, pallets, containers', /crate|box|palet|pallet|container|basket/],
  ['barrels, tanks, pipes', /barrel|tank|pipe|oil_tower|refinery/],
  ['sandbags', /sandbag/],
  ['tents, canvas, awnings', /tent|canvas|awning|gazebo/],
  ['fences, rails, posts, poles', /fence|rail|post|pole|chain|stopper/],
  ['invisible blockers', /invis|\/stop|specdi|_dis\b|_dis_|deck_dis|climber|wedge|\/secret/],
  ['furniture and props', /table|chair|shel|bed\b|desk|light|lamp|beer|bottle|cup|plate|ashtray|sign|planter|dumpster|tire|coals|palm|tree|meter|reflect/],
  ['walls (standalone)', /wall/],
  ['building shells', /build|bldg|barrack|warehouse|shed|garage|house|hut|wc\d|flr|floor|ceil|cieling|roof|deck|stair|tower|catwalk|bridge|tun\d|tunnel|access|ac\d|lad|ldr|\/b\d|\/t\d|\/t1|rmp|crnblock|di_above|emb|out_di/],
  ['terrain, rocks, rubble', /ground|land|rock|pile|crater|rubble|sand|cliff|hill|water/],
  ['unnamed geometry (gNNN)', /\/g\d+(_\d+)?(\/|$)/],
];
const typeOf = (path: string): string => {
  const p = path.toLowerCase();
  for (const [t, re] of TYPES) if (re.test(p)) return t;
  return 'other';
};

const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const add = (a: readonly number[], b: readonly number[], k = 1): V3 => [a[0]! + b[0]! * k, a[1]! + b[1]! * k, a[2]! + b[2]! * k];
const len = (a: readonly number[]): number => Math.hypot(a[0]!, a[1]!, a[2]!);
const cross = (a: readonly number[], b: readonly number[]): V3 => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
/** The room's `sightFrom` (IMPACT_SIGHT_READING, 0.1 toward the end point): copied, the room keeps it private. */
const sight = (p: V3, h: V3): V3 => {
  const d = sub(h, p), l = len(d);
  return l > 0.1 ? add(p, d, 0.1 / l) : p;
};
const f1 = (v: number): string => v.toFixed(1);
const pct = (n: number, d: number): string => (d > 0 ? `${((100 * n) / d).toFixed(1)}%` : '-');

function polyArea(p: Float32Array): number {
  const n = p.length / 3;
  let s: V3 = [0, 0, 0];
  for (let i = 1; i < n - 1; i++) {
    const c = cross(sub([p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!], [p[0]!, p[1]!, p[2]!]), sub([p[i * 3 + 3]!, p[i * 3 + 4]!, p[i * 3 + 5]!], [p[0]!, p[1]!, p[2]!]));
    s = add(s, c);
  }
  return len(s) / 2;
}
function centroid(p: Float32Array): V3 {
  const n = p.length / 3;
  let c: V3 = [0, 0, 0];
  for (let i = 0; i < n; i++) c = add(c, [p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!]);
  return [c[0] / n, c[1] / n, c[2] / n];
}

/** `loadMap.ts` `mdlArchives`: `WORL_MDL.ZED`, then the asset libraries but `CLIB`, each in its position form. */
function library(bytes: Uint8Array, toc: ReturnType<typeof parseZdb>, stem: string): ModelLibrary {
  const members = [...new Set(['WORL_MDL.ZED', ...assetLibStems(bytes, toc, stem, { add: () => {} }).filter((lib) => lib !== 'CLIB').map((lib) => `${lib}_MDL.ZED`)])];
  const out: { zar: Zar; form: PositionForm }[] = [];
  for (const member of members) {
    try { out.push({ zar: Zar.parse(zdbMember(bytes, toc, member)), form: archivePositionForm(member) }); } catch { /* none of its own */ }
  }
  return loadModelLibrary(out.map((a) => a.zar), out.map((a) => a.form));
}

/** An opaque drawn triangle in the world: its points, its placement. */
interface Tri { a: V3; b: V3; c: V3; n: V3; area: number; path: string }
/** The drawn triangles of the placements the page draws at the opening (`loadMap`'s `place` and `decoder`, simplified). */
function drawnTriangles(lib: ModelLibrary, placed: PlacedModel[]): Tri[] {
  const out: Tri[] = [];
  for (const p of placed) {
    if (p.facade !== 0 || p.path.split(/[/=]/).some((s) => ALTERNATE_STATE.test(s))) continue;
    const entry = lib.get(p.modelName);
    if (!entry) continue;
    for (const [i, chunk] of p.chunks.entries()) {
      if (p.alphaPass?.[i]) continue;
      const at = resolveChunk(entry, chunk);
      if (at === null) continue;
      let meshes;
      try { meshes = interpretChainPartsAs(walkChain(entry.buffer, at.offset, chunk), entry.form ?? 'bias').meshes; } catch { continue; }
      for (const m of meshes) {
        if (!m.fog) continue;   // skies, water, self-lit glows
        const w: V3[] = [];
        for (let v = 0; v < m.positions.length; v += 3) w.push(transformPoint(p.rowMajor, m.positions[v]!, m.positions[v + 1]!, m.positions[v + 2]!));
        for (let t = 0; t < m.indices.length; t += 3) {
          const a = w[m.indices[t]!]!, b = w[m.indices[t + 1]!]!, c = w[m.indices[t + 2]!]!;
          const cr = cross(sub(b, a), sub(c, a)), l = len(cr);
          if (!(l > 1e-6)) continue;
          out.push({ a, b, c, n: [cr[0] / l, cr[1] / l, cr[2] / l], area: l / 2, path: p.path });
        }
      }
    }
  }
  return out;
}

/** A 2-D bucket of the drawn triangles, for the segment test. */
class TriGrid {
  private cells = new Map<string, Tri[]>();
  constructor(tris: Tri[], private size = 32) {
    for (const t of tris) {
      const x0 = Math.floor(Math.min(t.a[0], t.b[0], t.c[0]) / size), x1 = Math.floor(Math.max(t.a[0], t.b[0], t.c[0]) / size);
      const z0 = Math.floor(Math.min(t.a[2], t.b[2], t.c[2]) / size), z1 = Math.floor(Math.max(t.a[2], t.b[2], t.c[2]) / size);
      if ((x1 - x0 + 1) * (z1 - z0 + 1) > 400) continue;   // a dome or a ground sheet: not cover
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const k = `${x},${z}`;
        let c = this.cells.get(k);
        if (!c) this.cells.set(k, c = []);
        c.push(t);
      }
    }
  }
  /** The drawn triangles the segment a->b crosses (either side), nearest first. */
  hits(a: V3, b: V3): { t: number; tri: Tri }[] {
    const s = this.size, out: { t: number; tri: Tri }[] = [], seen = new Set<Tri>();
    const d = sub(b, a);
    for (let x = Math.floor(Math.min(a[0], b[0]) / s); x <= Math.floor(Math.max(a[0], b[0]) / s); x++) {
      for (let z = Math.floor(Math.min(a[2], b[2]) / s); z <= Math.floor(Math.max(a[2], b[2]) / s); z++) {
        for (const tri of this.cells.get(`${x},${z}`) ?? []) {
          if (seen.has(tri)) continue;
          seen.add(tri);
          const t = mollerTrumbore(a, d, tri);
          if (t !== null) out.push({ t, tri });
        }
      }
    }
    return out.sort((p, q) => p.t - q.t);
  }
}
function mollerTrumbore(o: V3, d: V3, tri: Tri): number | null {
  const e1 = sub(tri.b, tri.a), e2 = sub(tri.c, tri.a), p = cross(d, e2), det = dot(e1, p);
  if (Math.abs(det) < 1e-9) return null;
  const inv = 1 / det, s = sub(o, tri.a), u = dot(s, p) * inv;
  if (u < 0 || u > 1) return null;
  const q = cross(s, e1), v = dot(d, q) * inv;
  if (v < 0 || u + v > 1) return null;
  const t = dot(e2, q) * inv;
  return t > 1e-4 && t < 1 - 1e-4 ? t : null;
}

/** Line 1 (`FUN_003c80e0`, `blastLine`'s rule) with its sides chosen: the reading's one-sided, or the port's two-sided. */
function line1(grid: Grid, from: V3, to: V3, oneSided: boolean, def: string): boolean {
  const order = new Map<WorldPoly, number>();
  const hits = segmentHits(grid, from, to, (p) => { order.set(p, order.size); return roundAdmits(p); }, undefined, oneSided);
  const first = new Map<CollisionOwner, (typeof hits)[number]>();
  for (const h of hits) {
    const kept = first.get(h.owner);
    if (!kept || order.get(h.poly)! < order.get(kept.poly)!) first.set(h.owner, h);
  }
  return reachGate(RADIUS, len(sub(to, from)), [...first.values()].map((h) => surfaceMaterial(h.poly.material, def).penetration));
}

type Rule = 'v18' | 'oneSidedOnly' | 'seeThroughOnly' | 'neither';
/** The line to the head under each rule: v0.4.18's (`blastExposed`), and the three with one or both changes put back. */
function line2(grid: Grid, from: V3, to: V3, rule: Rule, def: string): boolean {
  if (rule === 'v18') return blastExposed(grid, from, to, def);
  const seeThrough = rule === 'seeThroughOnly';
  const admits = (p: WorldPoly): boolean => roundAdmits(p) && !(seeThrough && blastSeesThrough(surfaceMaterial(p.material, def)));
  return segmentHits(grid, from, to, admits, undefined, rule === 'oneSidedOnly').length === 0;
}

interface FaceRow { type: string; material: string; pen: number; area: number; admitted: boolean; why: string; wall: boolean; oneFaced: boolean | null; oneFacedL2: boolean | null; openBehind: boolean | null; seeThrough: boolean; path: string }
interface CoverRow { type: string; path: string; area: number; cover: 'solid' | 'see-through only' | 'unmet only' | 'no collision'; sameGroup: boolean | null }
interface Case {
  stem: string; type: string; path: string; material: string; side: 'front' | 'back'; posture: Posture; dist: number; angle: number; lift: number;
  feet: V3; blast: V3; crossesFace: boolean;
  v18: boolean; oneSidedOnly: boolean; seeThroughOnly: boolean; neither: boolean; eyeV18: boolean; l1One: boolean; l1Two: boolean; drawnOnLine: string | null;
  /** On a line v0.4.18's rule opens and v0.4.14's stops: the faces (owner:material) v0.4.14's met. */
  openers: string[];
}

const report: Record<string, unknown> = {};

describe.skipIf(!DISC)(`NADE-BLAST geometry census: MP6, MP2 against MP51, MP72 (dev disc${DISC ? '' : ': SOCOM_DISC / SOCOM_PC_ROOT absent -- skipped'})`, () => {
  const cases: Case[] = [];
  const facesBy: Record<string, FaceRow[]> = {};
  const coverBy: Record<string, CoverRow[]> = {};
  const droppedBy: Record<string, { nestedDi: number; gated: number }> = {};

  for (const stem of MAPS) {
    it(`${stem}: the census and the sweep ran`, async () => {
      const s = await roomOn(DISC!, stem);
      const grid = s.map.grid, def = s.map.defaultMaterial ?? '', ground = s.map.ground;
      const faces: FaceRow[] = [];
      facesBy[stem] = faces;

      // --- 1. Faces by type: (a), (b), (c), (e). ---
      const clear = (a: V3, b: V3): boolean => segmentHits(grid, a, b, (p) => roundAdmits(p)).length === 0;
      const floorNear = (x: number, z: number, y: number, below: number, above: number): number | null => {
        const ys = surfacesOver(ground, x, z).filter((v) => v >= y - below && v <= y + above);
        return ys.length ? ys.at(-1)! : null;
      };
      // Inside a closed solid (a tank, a container, a building with no inside): the first face up met from behind (its
      // front up), and three of four level rays leaving through a face from behind. A grenade or a body cannot be there.
      const inSolid = (q: V3): boolean => {
        const first = (dir: V3): boolean => {
          // A face coincident with the first (MP2's container06 roof under `g3896`'s downward face) is as near: any of them.
          const hs = segmentHits(grid, q, add(q, dir, 200), (p) => roundAdmits(p));
          return hs.some((h) => h.t - hs[0]!.t < 0.005 && dot(h.normal, dir) > 0);
        };
        if (!first([0, 1, 0])) return false;
        return [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]].filter((d) => first(d as V3)).length >= 3;
      };
      const gated = new Set<CollisionOwner>();
      const wallFaces: { poly: WorldPoly; owner: CollisionOwner; n: V3; type: string }[] = [];
      for (const o of grid.objects) {
        if (o.kind !== 'collision') continue;
        const type = typeOf(o.owner.path), open = modelGate(o.owner);
        if (!open) gated.add(o.owner);
        for (const poly of o.polys) {
          const m = surfaceMaterial(poly.material, def), w = surfaceWord(poly), n = polygonNormal(poly.points);
          const admitted = open && roundAdmits(poly);
          const why = !open ? 'owner gated (off / no m_hasDI)' : (w & SURFACE_SKIP) !== 0 ? 'camera-only' : (w & SURFACE_SIDE) === 0 ? 'side bit 1 clear' : 'met';
          const wall = n !== null && Math.abs(n[1]) < 0.7;
          let oneFaced: boolean | null = null, oneFacedL2: boolean | null = null, openBehind: boolean | null = null;
          if (admitted && wall && n) {
            const c = centroid(poly.points), from = add(c, n, -BACK), to = add(c, n, 0.5);
            const hits = segmentHits(grid, from, to, (p) => roundAdmits(p), undefined, true);
            oneFaced = hits.length === 0;
            oneFacedL2 = hits.every((h) => blastSeesThrough(surfaceMaterial(h.poly.material, def)));
            if (oneFaced) {
              // Room behind it for a grenade: a floor at the face's foot BEHIND u back, and a crouched body's column clear.
              let ymin = Infinity;
              for (let i = 1; i < poly.points.length; i += 3) ymin = Math.min(ymin, poly.points[i]!);
              const hl = Math.hypot(n[0], n[2]), bx = c[0] - (n[0] / hl) * BEHIND, bz = c[2] - (n[2] / hl) * BEHIND;
              const fl = floorNear(bx, bz, ymin, 4, 2);
              openBehind = fl !== null && clear([bx, fl + 0.5, bz], [bx, fl + 11.1, bz]) && !inSolid([bx, fl + 6, bz]);
            }
            wallFaces.push({ poly, owner: o.owner, n, type });
          }
          faces.push({ type, material: m.name, pen: m.penetration, area: polyArea(poly.points), admitted, why, wall, oneFaced, oneFacedL2, openBehind, seeThrough: blastSeesThrough(m), path: o.owner.path });
        }
      }

      // The collision the port's readers leave out: a nested instance node's own `di` (`worldDi`, research 24 s1.1).
      const bytes = new Uint8Array(readFileSync(join(DISC!, `RUN/${stem}.ZDB`)));
      const toc = parseZdb(bytes);
      const models = parseSceneGraph(Zar.parse(zdbMember(bytes, toc, `${stem}_GEO.ZED`)));
      applyR0004MapPatch(models, stem);
      let nestedDi = 0;
      for (const f of flattenScene(models)) if (f.nested && f.node.type === NODE_INSTANCE) nestedDi += f.node.collision.length;
      droppedBy[stem] = { nestedDi, gated: [...gated].reduce((n, o) => n + o.count, 0) };

      // --- 1(d). The drawn wall triangles against the collision. ---
      const tris = drawnTriangles(library(bytes, toc, stem), placeInstances(models));
      const cover: CoverRow[] = [];
      coverBy[stem] = cover;
      const group = (p: string): string => p.split('/').slice(0, 2).join('/').split('=')[0]!;
      for (const t of tris) {
        if (Math.abs(t.n[1]) >= 0.7 || t.area < 1) continue;
        const c: V3 = [(t.a[0] + t.b[0] + t.c[0]) / 3, (t.a[1] + t.b[1] + t.c[1]) / 3, (t.a[2] + t.b[2] + t.c[2]) / 3];
        const hits = segmentHits(grid, add(c, t.n, -COVER), add(c, t.n, COVER), () => true);
        let kind: CoverRow['cover'] = 'no collision', same: boolean | null = null;
        const met = hits.filter((h) => modelGate(h.owner) && roundAdmits(h.poly));
        const solid = met.filter((h) => !blastSeesThrough(surfaceMaterial(h.poly.material, def)));
        if (solid.length > 0) { kind = 'solid'; same = solid.some((h) => group(h.owner.path) === group(t.path)); }
        else if (met.length > 0) kind = 'see-through only';
        else if (hits.length > 0) kind = 'unmet only';
        cover.push({ type: typeOf(t.path), path: t.path, area: t.area, cover: kind, sameGroup: same });
      }
      const triGrid = new TriGrid(tris);

      // --- 2. The sweep. ---
      const seen = new Set<string>();
      for (const { poly, owner, n, type } of wallFaces) {
        const p = poly.points;
        let ymin = Infinity, ymax = -Infinity;
        for (let i = 1; i < p.length; i += 3) { ymin = Math.min(ymin, p[i]!); ymax = Math.max(ymax, p[i]!); }
        if (ymax - ymin < MIN_FACE) continue;
        const h: V3 = [n[0], 0, n[2]], hl = len(h);
        if (hl < 0.7) continue;
        const nh: V3 = [h[0] / hl, 0, h[2] / hl], t: V3 = [-nh[2], 0, nh[0]];
        const c = centroid(p);
        let smin = Infinity, smax = -Infinity;
        for (let i = 0; i < p.length; i += 3) { const sv = dot(sub([p[i]!, p[i + 1]!, p[i + 2]!], c), t); smin = Math.min(smin, sv); smax = Math.max(smax, sv); }
        if (smax - smin < MIN_FACE) continue;
        const stops: number[] = [];
        for (let sv = smin + 3; sv <= smax - 3; sv += STEP) stops.push(sv);
        if (stops.length === 0) stops.push((smin + smax) / 2);
        const material = surfaceMaterial(poly.material, def).name;
        for (const sv of stops) {
          const onFace = add(c, t, sv);
          for (const side of [1, -1] as const) {
            const fx = onFace[0] + nh[0] * BEHIND * side, fz = onFace[2] + nh[2] * BEHIND * side;
            const bodyFloor = floorNear(fx, fz, ymin, 4, 2);
            if (bodyFloor === null) continue;
            const key = `${Math.round(fx / 2)},${Math.round(fz / 2)},${Math.round(bodyFloor)},${Math.round(Math.atan2(nh[0] * side, nh[2] * side) * 8)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const feet: V3 = [fx, bodyFloor, fz];
            if (inSolid([fx, bodyFloor + 6, fz])) continue;
            // The body stands in the open off the face: nothing between the face and it, nothing on its column.
            if (!clear([onFace[0] + nh[0] * NEAR * side, bodyFloor + 6, onFace[2] + nh[2] * NEAR * side], [fx, bodyFloor + 6, fz])) continue;
            for (const posture of ['stand', 'crouch'] as const) {
              const head: V3 = [fx, bodyFloor + HEAD_OVER[posture], fz];
              if (!clear([fx, bodyFloor + 0.5, fz], head)) continue;
              const eye: V3 = [fx, bodyFloor + EYE[posture], fz], root: V3 = [fx, bodyFloor + ROOT_HEIGHT[posture], fz];
              for (const [dist, angle] of [[30, 0], [45, 0], [60, 0], [45, 35], [45, -35]] as const) {
                const a = (angle * Math.PI) / 180, back: V3 = [-nh[0] * side, 0, -nh[2] * side];
                const dir: V3 = [back[0] * Math.cos(a) - back[2] * Math.sin(a), 0, back[0] * Math.sin(a) + back[2] * Math.cos(a)];
                const bx = onFace[0] + dir[0] * dist, bz = onFace[2] + dir[2] * dist;
                const blastFloor = floorNear(bx, bz, bodyFloor, 12, 12);
                if (blastFloor === null) continue;
                if (inSolid([bx, blastFloor + 6, bz])) continue;
                for (const lift of [REST_LIFT, AIR_LIFT]) {
                  const blast: V3 = [bx, blastFloor + lift, bz];
                  // The blast's approach to the face clear: the face is what lies between.
                  if (!clear([onFace[0] - nh[0] * NEAR * side, blastFloor + lift, onFace[2] - nh[2] * NEAR * side], blast)) continue;
                  const from = sight(blast, head);
                  const crossesFace = segmentHits(grid, from, head, (q) => q === poly).length > 0;
                  const opened = (r: Rule): boolean => line2(grid, from, head, r, def);
                  const row: Case = {
                    stem, type, path: owner.path, material, side: side === 1 ? 'front' : 'back', posture, dist, angle, lift, feet, blast, crossesFace,
                    v18: opened('v18'), oneSidedOnly: opened('oneSidedOnly'), seeThroughOnly: opened('seeThroughOnly'), neither: opened('neither'),
                    eyeV18: blastExposed(grid, sight(blast, eye), eye, def),
                    l1One: line1(grid, sight(blast, root), root, true, def), l1Two: line1(grid, sight(blast, root), root, false, def),
                    drawnOnLine: null, openers: [],
                  };
                  if (row.v18) row.drawnOnLine = triGrid.hits(from, head)[0]?.tri.path ?? null;
                  if (row.v18 && !row.neither) {
                    // The faces the v0.4.14 rule stopped at and v0.4.18's lets through: what opened the line.
                    row.openers = [...new Set(segmentHits(grid, from, head, (q) => roundAdmits(q)).map((x) => `${x.owner.path}:${surfaceMaterial(x.poly.material, def).name}`))];
                  }
                  cases.push(row);
                }
              }
            }
          }
        }
      }
      expect(faces.length).toBeGreaterThan(0);
      expect(cases.filter((r) => r.stem === stem).length).toBeGreaterThan(0);
    }, 900_000);
  }

  it('the measure holds -- no line crossing a met face is open with no rule changed -- and its headline is pinned (research 400 s2)', () => {
    const through = (stem: string, posture: Posture) => cases.filter((r) => r.stem === stem && r.posture === posture && r.crossesFace);
    for (const stem of MAPS) for (const posture of ['stand', 'crouch'] as const) expect(through(stem, posture).filter((r) => r.neither)).toEqual([]);
    // [lines crossing the face, open under v0.4.18's rule, under one-sided only, under see-through only].
    const head = (stem: string, posture: Posture): number[] => {
      const t = through(stem, posture);
      return [t.length, t.filter((r) => r.v18).length, t.filter((r) => r.oneSidedOnly).length, t.filter((r) => r.seeThroughOnly).length];
    };
    expect([head('MP6', 'stand'), head('MP6', 'crouch'), head('MP2', 'stand'), head('MP2', 'crouch')])
      .toEqual([[9009, 426, 14, 417], [10438, 557, 41, 535], [1142, 158, 33, 140], [1731, 458, 50, 427]]);
  });

  afterAll(() => {
    if (!DISC) return;
    // --- Part 1 tables. ---
    for (const stem of MAPS) {
      const faces = facesBy[stem] ?? [], cover = coverBy[stem] ?? [];
      const types = [...new Set(faces.map((f) => f.type))].sort();
      const rows = types.map((type) => {
        const fs = faces.filter((f) => f.type === type), walls = fs.filter((f) => f.admitted && f.wall);
        const oneFaced = walls.filter((f) => f.oneFaced), seeTh = fs.filter((f) => f.admitted && f.seeThrough);
        const unmet = fs.filter((f) => !f.admitted), pen = walls.filter((f) => f.pen >= 0.0001 && !f.seeThrough);
        const cv = cover.filter((c) => c.type === type), cvArea = cv.reduce((n, c) => n + c.area, 0);
        const by = (k: CoverRow['cover']): number => cv.filter((c) => c.cover === k).reduce((n, c) => n + c.area, 0);
        return {
          type, faces: fs.length, 'wall faces (met)': walls.length,
          '(a) one-faced': `${oneFaced.length} (${pct(oneFaced.length, walls.length)})`,
          '(a) of them with room behind': oneFaced.filter((f) => f.openBehind).length,
          '(a) one-faced for line 2': walls.filter((f) => f.oneFacedL2).length,
          '(b) unmet': `${unmet.length} [${[...new Set(unmet.map((f) => f.why))].join('; ')}]`,
          '(c) see-through': `${seeTh.length} [${[...new Set(seeTh.map((f) => f.material))].join(' ')}]`,
          '(d) drawn wall area': Math.round(cvArea),
          '(d) no collision': pct(by('no collision'), cvArea), '(d) see-through only': pct(by('see-through only'), cvArea), '(d) unmet only': pct(by('unmet only'), cvArea),
          '(e) PEN>0 wall faces': `${pen.length} [${[...new Set(pen.map((f) => `${f.material} ${f.pen}`))].join(', ')}]`,
        };
      });
      console.log(`\n=== ${stem}: collision faces by type (dropped by the readers: ${droppedBy[stem]?.nestedDi} nested-instance di polygons; gated owners' polygons ${droppedBy[stem]?.gated}) ===`);
      for (const row of rows) console.log(Object.entries(row).map(([k, v]) => (k === 'type' ? String(v).padEnd(34) : `${k}: ${String(v)}`)).join(' | '));
      // The worst drawn placements: wall area with no collision, or see-through only.
      const worst = new Map<string, { type: string; none: number; see: number; total: number }>();
      for (const c of cover) {
        const w = worst.get(c.path) ?? { type: c.type, none: 0, see: 0, total: 0 };
        w.total += c.area;
        if (c.cover === 'no collision') w.none += c.area;
        if (c.cover === 'see-through only') w.see += c.area;
        worst.set(c.path, w);
      }
      const list = [...worst.entries()].filter(([, w]) => w.none + w.see >= 50).sort((a, b) => (b[1].none + b[1].see) - (a[1].none + a[1].see)).slice(0, 25);
      console.log(`--- ${stem}: drawn placements with the most wall area not stopped by collision (none, or see-through only) ---`);
      console.table(list.map(([path, w]) => ({ path, type: w.type, 'wall area': Math.round(w.total), 'no collision': Math.round(w.none), 'see-through only': Math.round(w.see) })));
      report[`${stem}.faces`] = rows;
      report[`${stem}.drawnWorst`] = list;
    }

    // --- Parts 2 and 3. ---
    const rank = MAPS.flatMap((stem) => (['stand', 'crouch'] as const).map((posture) => {
      const all = cases.filter((r) => r.stem === stem && r.posture === posture);
      const through = all.filter((r) => r.crossesFace), over = all.filter((r) => !r.crossesFace);
      const hurt = all.filter((r) => r.v18), tHurt = through.filter((r) => r.v18);
      const opened = hurt.filter((r) => !r.neither);
      const n = (xs: Case[], f: (r: Case) => boolean): string => `${xs.filter(f).length} (${pct(xs.filter(f).length, xs.length)})`;
      return {
        map: stem, posture, cases: all.length,
        'THROUGH: the head line crosses the face': through.length,
        'THROUGH: open, v0.4.18 (port today)': n(through, (r) => r.v18),
        'THROUGH: open, one-sided only (v0.4.15-17)': n(through, (r) => r.oneSidedOnly),
        'THROUGH: open, see-through only': n(through, (r) => r.seeThroughOnly),
        'THROUGH: open, neither (v0.4.14)': n(through, (r) => r.neither),
        'THROUGH open: line 1 one-sided stops': n(tHurt, (r) => !r.l1One),
        'THROUGH open: line 1 two-sided stops': n(tHurt, (r) => !r.l1Two),
        'OVER/AROUND: cases': over.length,
        'OVER/AROUND: open, v0.4.18': n(over, (r) => r.v18),
        'OVER open: line 1 one-sided stops': n(over.filter((r) => r.v18), (r) => !r.l1One),
        'OVER open: eye shut (head height alone)': n(over.filter((r) => r.v18), (r) => !r.eyeV18),
        'ALL hurt': hurt.length,
        'ALL hurt: opened by one-sided alone': n(hurt, (r) => !r.neither && r.oneSidedOnly && !r.seeThroughOnly),
        'ALL hurt: opened by see-through alone': n(hurt, (r) => !r.neither && r.seeThroughOnly && !r.oneSidedOnly),
        'ALL hurt: opened by either': n(hurt, (r) => !r.neither && r.oneSidedOnly && r.seeThroughOnly),
        'ALL hurt: opened only by both': n(hurt, (r) => !r.neither && !r.oneSidedOnly && !r.seeThroughOnly),
        'ALL hurt: no face on the line': n(hurt, (r) => r.neither),
        'ALL hurt: drawn geometry, no face, on the line': n(hurt, (r) => r.neither && r.drawnOnLine !== null),
        'ALL hurt: opened by a rule, drawn geometry on the line': n(hurt, (r) => !r.neither && r.drawnOnLine !== null),
        'ALL hurt: opened by see-through alone, drawn on the line': n(hurt, (r) => !r.neither && r.seeThroughOnly && !r.oneSidedOnly && r.drawnOnLine !== null),
        'ALL hurt: opened by one-sided alone, drawn on the line': n(hurt, (r) => !r.neither && r.oneSidedOnly && !r.seeThroughOnly && r.drawnOnLine !== null),
        'ALL hurt: line 1 one-sided stops': n(hurt, (r) => !r.l1One),
        'ALL hurt: line 1 two-sided stops': n(hurt, (r) => !r.l1Two),
        'ALL hurt: eye shut (head height alone)': n(hurt, (r) => !r.eyeV18),
        'ALL hurt: opened by a rule and line 1 one-sided stops': n(opened, (r) => !r.l1One),
      };
    }));
    console.log('\n=== The sweep: a body 6 u off a wall face, an M67 30-60 u across it (THROUGH: the head line crosses that face) ===');
    for (const key of Object.keys(rank[0]!)) console.log(`${key.padEnd(56)} ${rank.map((r) => String((r as Record<string, unknown>)[key]).padEnd(15)).join(' ')}`);
    report.rank = rank;

    // The faces that opened lines (v0.4.18 open, v0.4.14 shut), by owner: the worst spots, with one case each to capture.
    for (const stem of MAPS) {
      const by = new Map<string, { cases: number; oneSided: number; seeThrough: number; l1: number; drawn: number; sample: Case }>();
      for (const r of cases.filter((x) => x.stem === stem && x.v18 && !x.neither)) {
        for (const o of r.openers) {
          const e = by.get(o) ?? { cases: 0, oneSided: 0, seeThrough: 0, l1: 0, drawn: 0, sample: r };
          if (r.drawnOnLine !== null) e.drawn++;
          e.cases++;
          if (r.oneSidedOnly && !r.seeThroughOnly) e.oneSided++;
          if (r.seeThroughOnly && !r.oneSidedOnly) e.seeThrough++;
          if (!r.l1One) e.l1++;
          if (r.crossesFace && !e.sample.crossesFace) e.sample = r;
          by.set(o, e);
        }
      }
      const top = [...by.entries()].sort((a, b) => b[1].cases - a[1].cases).slice(0, 25);
      console.log(`--- ${stem}: the faces that open lines (v0.4.18 open, v0.4.14 shut), by owner:material ---`);
      for (const [o, e] of top) {
        const s = e.sample;
        console.log(`${String(e.cases).padStart(5)} one-sided ${String(e.oneSided).padStart(4)} see-through ${String(e.seeThrough).padStart(4)} line1-stops ${String(e.l1).padStart(4)} drawn-on-line ${String(e.drawn).padStart(4)}  ${typeOf(o.split(':')[0]!).padEnd(34)} ${o}  e.g. ${s.posture} feet ${s.feet.map(f1).join(',')} blast ${s.blast.map(f1).join(',')}`);
      }
      report[`${stem}.openers`] = top.map(([o, e]) => ({ owner: o, type: typeOf(o.split(':')[0]!), ...e }));
      // Over the top: the port hurts, line 1 (one-sided) stops -- the low walls and sills, by the sampled face's owner.
      const low = new Map<string, { cases: number; sample: Case }>();
      for (const r of cases.filter((x) => x.stem === stem && x.v18 && x.neither && !x.l1One)) {
        const e = low.get(r.path) ?? { cases: 0, sample: r };
        e.cases++;
        low.set(r.path, e);
      }
      const lows = [...low.entries()].sort((a, b) => b[1].cases - a[1].cases).slice(0, 15);
      console.log(`--- ${stem}: over the top -- no face on the head line, line 1 (one-sided, to ROOT_HEIGHT) stopped, by the wall's owner ---`);
      for (const [o, e] of lows) console.log(`${String(e.cases).padStart(5)}  ${e.sample.type.padEnd(34)} ${o}:${e.sample.material}  e.g. ${e.sample.posture} feet ${e.sample.feet.map(f1).join(',')} blast ${e.sample.blast.map(f1).join(',')}`);
      report[`${stem}.over`] = lows.map(([o, e]) => ({ owner: o, ...e }));
      const drawn = new Map<string, number>();
      for (const r of cases.filter((x) => x.stem === stem && x.v18 && x.neither && x.drawnOnLine)) drawn.set(r.drawnOnLine!, (drawn.get(r.drawnOnLine!) ?? 0) + 1);
      console.log(`--- ${stem}: drawn geometry on an open head line with no collision face on it ---`);
      for (const [p, k] of [...drawn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`${String(k).padStart(5)}  ${p}`);
      report[`${stem}.drawnOnLine`] = [...drawn.entries()];
    }
    if (process.env.BLAST_CENSUS_OUT) writeFileSync(process.env.BLAST_CENSUS_OUT, JSON.stringify(report));   // a dev aid: the tables as JSON
  });
});

import type { GroundData } from '../../mover';
import { commonGroundSurface, isGroundWords, packCollision, type CollisionMesh, type HullPoly, type Surface } from './collision';
import { addCorner, addFace, addVert, emptyMesh, facePoints, liveFaces, polygonNormal, type EditMesh, type Vec3 } from './editMesh';
import { transformVerts } from './ops';
import { appendOwnedPolys, buildHullMesh, GEOMETRY_OWNER_MODEL, type GeoObject, type WorldGeometry } from './world';

/**
 * Collision editing (the owner, 2026-11-15: "a collision edit toggle in geometry mode ... it should be like I was just
 * editing another geometry"; a browser adaptation, FG.R2, as Hammer's clip brushes and Source 2's collision meshes are
 * edited with the same tools as the rest): the hull as editable geometry. Each world node's polygons are one object (a
 * face a polygon, its surface words on it: `Face.surface`), so every tool of Geometry mode -- the selection modes, the
 * gizmo, Delete, Dissolve, Extrude, Create, the Outliner, undo -- works on it unchanged. An object edited here is the
 * node's hull from then on (`manual`); Build takes it over the hull it makes from the draws (`applyHullEdits`).
 *
 * Left out of the editing, kept as read: a door's or a gate's polygons (an owner with a swing, `sweep`) and a tilted
 * node's (an owner with a `frame`, which the climb reads): their owners are the game's moving and climbing parts.
 */

/** A hull object's node (`LoadedMap.worldNodes` index), -1 the polygons under no node; absent, an object made here. */
export type HullNode = number;

/**
 * The owners whose polygons are edited: not a door's swing, not a tilted node's frame, not a solid object's hull (Build
 * makes that one from the object, `GEOMETRY_OWNER_MODEL`).
 */
const editable = (c: CollisionMesh, owner: number): boolean => {
  const o = owner >= 0 ? c.owners[owner] : undefined;
  return !!o && !o.sweep && !o.frame && o.modelName !== GEOMETRY_OWNER_MODEL;
};

/** Each owner's node: the read ones' (`ownerNodes`), an owner Build added after them its template's (its path less `#...`). */
const ownerNodeCache = new WeakMap<CollisionMesh, Int32Array>();
function nodeOfOwnerIn(g: WorldGeometry, c: CollisionMesh, owner: number): number {
  let m = ownerNodeCache.get(c);
  if (!m) {
    m = new Int32Array(c.owners.length).fill(-1);
    const byPath = new Map<string, number>();
    c.owners.forEach((o, i) => {
      const read = g.ownerNodes && i < g.ownerNodes.length ? g.ownerNodes[i]! : undefined;
      if (read !== undefined) { m![i] = read; if (!byPath.has(o.path)) byPath.set(o.path, read); return; }
      m![i] = byPath.get(o.path.replace(/#.*$/, '')) ?? -1;
    });
    ownerNodeCache.set(c, m);
  }
  return m[owner] ?? -1;
}

/**
 * The hull `c` (what Build makes from `g`, `buildHullMesh`) as editable objects: one each node holding editable
 * polygons, named as the node's geometry object is, its id `hull:` and that object's.
 */
export function hullObjectsOf(g: WorldGeometry, c: CollisionMesh): GeoObject[] {
  const byNode = new Map<number, HullPoly[]>();
  for (const p of c.polys) {
    if (!editable(c, p.owner)) continue;
    const n = nodeOfOwnerIn(g, c, p.owner);
    const l = byNode.get(n);
    if (l) l.push(p); else byNode.set(n, [p]);
  }
  const out: GeoObject[] = [];
  for (const [n, polys] of [...byNode].sort((a, b) => a[0] - b[0])) {
    const geoObj = g.objects.find((o) => o.group === n);
    const name = geoObj?.name ?? (n < 0 ? 'World root' : `Node ${n}`);
    // A face keeps its owner when it is one read off the disc (its index the same at every Build); an owner Build added
    // (a reshaped node's) is numbered anew each Build, so its faces go back under owners of their own.
    const read = g.collision?.owners.length ?? 0;
    const mesh = meshOfPolys(polys.map((p) => (p.owner < read ? p : { points: p.points, surface: p.surface })));
    out.push({ id: `hull:${geoObj?.id ?? n}`, name, kind: 'mesh', mesh, hullNode: n });
  }
  // Each solid object's collision (`buildHullMesh`'s `forge/<id>` owner): an object of its own, as a node's.
  const bySolid = new Map<string, HullPoly[]>();
  for (const p of c.polys) {
    const o = c.owners[p.owner];
    if (!o || o.modelName !== GEOMETRY_OWNER_MODEL || !o.path.startsWith(SOLID_PREFIX)) continue;
    const id = solidIdOf(o.path);
    const l = bySolid.get(id);
    if (l) l.push(p); else bySolid.set(id, [p]);
  }
  for (const o of g.objects) {
    const polys = bySolid.get(o.id);
    if (!o.solid || !polys) continue;
    out.push({ id: `hull:${o.id}`, name: o.name, kind: 'mesh', mesh: meshOfPolys(polys.map((p) => ({ points: p.points, surface: p.surface }))), hullOf: o.id });
  }
  return out;
}

/** A solid object's owners in the hull Build makes (`buildHullMesh`): `forge/<id>#<n>`, a polygon each (`appendOwnedPolys`). */
const SOLID_PREFIX = 'forge/';
const solidIdOf = (path: string): string => path.slice(SOLID_PREFIX.length).replace(/#.*$/, '');
/** A hull object made in collision editing: of no node and no solid object. */
const madeHere = (o: GeoObject): boolean => o.hullNode === undefined && o.hullOf === undefined;

/** Polygons as a mesh: a face each, its points welded where they meet, its surface words on it. */
export function meshOfPolys(polys: readonly (Omit<HullPoly, 'owner'> & { owner?: number })[]): EditMesh {
  const m = emptyMesh([{ style: HULL_STYLE, normals: false, faceNormals: false, centroids: false, rank: 0 }]);
  const weld = new Map<string, number>();
  for (const p of polys) {
    const n = polygonNormal(p.points);
    const corners = p.points.map((q) => {
      const k = `${q[0]},${q[1]},${q[2]}`;
      let v = weld.get(k);
      if (v === undefined) { v = addVert(m, q); weld.set(k, v); }
      return addCorner(m, v, { uv: [0, 0], color: [1, 1, 1, 1], normal: n });
    });
    const f = addFace(m, corners, 0);
    m.faces[f]!.surface = [...p.surface] as Surface;
    if (p.owner !== undefined && p.owner >= 0) m.faces[f]!.owner = p.owner;
  }
  return m;
}

/** The style a hull mesh's faces carry: never compiled to a draw (the hull is drawn as its own view, `hullView`). */
const HULL_STYLE = {
  textureName: null, lit: false, order: 0, orderEnd: 0, cull: false, alternate: false, scroll: null, fog: false,
} as unknown as EditMesh['styles'][number]['style'];

/** A face's surface words: its own, else (a face a tool made) the object's commonest floor words facing up, wall words not. */
export function wordsOf(o: GeoObject, fallback: Surface | null): (f: number) => Surface {
  const tally = (keep: (s: Surface) => boolean): Surface | null => {
    const n = new Map<string, { s: Surface; n: number }>();
    for (const f of liveFaces(o.mesh)) {
      const s = o.mesh.faces[f]!.surface;
      if (!s || !keep(s)) continue;
      const k = s.join(','), e = n.get(k);
      if (e) e.n++; else n.set(k, { s, n: 1 });
    }
    let best: { s: Surface; n: number } | null = null;
    for (const e of n.values()) if (!best || e.n > best.n) best = e;
    return best ? best.s : null;
  };
  const ground = tally(isGroundWords) ?? fallback ?? [3, 0, 0, 0, 0];
  const side = tally((s) => !isGroundWords(s)) ?? ground;
  return (f) => {
    const s = o.mesh.faces[f]!.surface;
    if (s) return [...s] as Surface;
    return [...(polygonNormal(facePoints(o.mesh, f))[1] >= 0.7 ? ground : side)] as Surface;
  };
}

/** A hull object's polygons: a face each (a face of more than its plane's points kept whole, as the disc's are). */
export function polysOfHullObject(o: GeoObject, fallback: Surface | null): (Omit<HullPoly, 'owner'> & { owner?: number })[] {
  const words = wordsOf(o, fallback);
  return liveFaces(o.mesh).map((f) => {
    const owner = o.mesh.faces[f]!.owner;
    return { points: facePoints(o.mesh, f).map((p) => [...p] as Vec3), surface: words(f), ...(owner !== undefined ? { owner } : {}) };
  });
}

/**
 * Build with the collision edits (`hull`, the edited hull objects): each node whose object was edited (`manual`) has its
 * editable polygons replaced by its object's faces, a polygon each under an owner of its own (the node's first owner's
 * words); a node whose object was deleted (`WorldGeometry.clearedNodes`) has them taken out; an object made here adds
 * its faces under an owner of its own. Every other node keeps what Build made from the draws.
 */
export function applyHullEdits(g: WorldGeometry, c: CollisionMesh, hull: WorldGeometry, fallback: Surface | null): void {
  const replaced = new Set<number>(hull.clearedNodes ?? []);
  for (const o of hull.objects) if (o.manual && o.hullNode !== undefined) replaced.add(o.hullNode);
  // A solid object's collision edited (or deleted): its own owner's polygons out, its hull object's faces in.
  const solids = new Set<string>(hull.clearedSolids ?? []);
  for (const o of hull.objects) if (o.manual && o.hullOf !== undefined) solids.add(o.hullOf);
  if (!replaced.size && !solids.size && !hull.objects.some(madeHere)) return;
  if (solids.size) {
    c.polys = c.polys.filter((p) => {
      const o = c.owners[p.owner];
      return !(o && o.modelName === GEOMETRY_OWNER_MODEL && solids.has(solidIdOf(o.path)));
    });
  }
  const templates = new Map<number, number>();
  c.polys.forEach((p) => { if (editable(c, p.owner)) { const n = nodeOfOwnerIn(g, c, p.owner); if (!templates.has(n)) templates.set(n, p.owner); } });
  c.polys = c.polys.filter((p) => !(editable(c, p.owner) && replaced.has(nodeOfOwnerIn(g, c, p.owner))));
  // A face read from the disc goes back under its own owner, in its own node's object only (a copy or a separated piece
  // is made since), every owner's faces one run however many objects they are in -- so the probe's one polygon an owner
  // reads as the disc's; a face made since goes under an owner of its own.
  const byOwner = new Map<number, HullPoly[]>();
  const fresh: { o: GeoObject; polys: Omit<HullPoly, 'owner'>[] }[] = [];
  for (const o of hull.objects) {
    if (!madeHere(o) && !o.manual) continue;
    const polys: Omit<HullPoly, 'owner'>[] = [];
    for (const p of polysOfHullObject(o, fallback)) {
      if (p.owner !== undefined && editable(c, p.owner) && o.hullNode === nodeOfOwnerIn(g, c, p.owner)) {
        const l = byOwner.get(p.owner);
        const poly: HullPoly = { points: p.points, surface: p.surface, owner: p.owner };
        if (l) l.push(poly); else byOwner.set(p.owner, [poly]);
      } else polys.push({ points: p.points, surface: p.surface });
    }
    if (polys.length) fresh.push({ o, polys });
  }
  for (const run of byOwner.values()) c.polys.push(...run);
  for (const { o, polys } of fresh) {
    const t = o.hullNode !== undefined ? templates.get(o.hullNode) : undefined;
    const template = t !== undefined ? { ...c.owners[t]!, path: `${c.owners[t]!.path}#collision` }
      : o.hullOf !== undefined ? { modelName: GEOMETRY_OWNER_MODEL, path: `${SOLID_PREFIX}${o.hullOf}#collision`, first: 0, count: 0 }
      : { modelName: GEOMETRY_OWNER_MODEL, path: `forge/collision/${o.id}`, first: 0, count: 0 };
    appendOwnedPolys(c, polys, template);
  }
}

/** Build with the collision edits: the hull Build makes from the draws (`buildHullMesh`), the edited hull objects over it. */
export function buildHullWith(g: WorldGeometry, hull: WorldGeometry | null): GroundData | null {
  const c = buildHullMesh(g);
  if (!c) return null;
  if (hull) applyHullEdits(g, c, hull, commonGroundSurface(c));
  return packCollision(c);
}

/**
 * The hull objects for collision editing now: those made from what Build would make of `g` this moment, with the
 * objects already edited (`manual`) or made in `was` kept in their place, and the nodes deleted there left out.
 */
export function hullGeometryOf(g: WorldGeometry, was: WorldGeometry | null): WorldGeometry | null {
  const c = buildHullMesh(g);
  if (!c) return null;
  // A solid object's edited collision goes with the object: kept while it stands, dropped once it is deleted.
  const alive = new Set(g.objects.map((o) => o.id));
  const keep = was?.objects.filter((o) => (o.manual || madeHere(o)) && (o.hullOf === undefined || alive.has(o.hullOf))) ?? [];
  const kept = new Set(keep.flatMap((o) => (o.hullNode !== undefined ? [o.hullNode] : [])));
  const keptSolids = new Set(keep.flatMap((o) => (o.hullOf !== undefined ? [o.hullOf] : [])));
  const cleared = new Set(was?.clearedNodes ?? []);
  const clearedSolids = new Set((was?.clearedSolids ?? []).filter((id) => alive.has(id)));
  const fresh = hullObjectsOf(g, c).filter((o) => o.hullOf !== undefined
    ? !keptSolids.has(o.hullOf) && !clearedSolids.has(o.hullOf)
    : !kept.has(o.hullNode!) && !cleared.has(o.hullNode!));
  return {
    objects: [...fresh, ...keep], collision: null, ownerNodes: g.ownerNodes,
    ...(cleared.size ? { clearedNodes: [...cleared] } : {}), ...(clearedSolids.size ? { clearedSolids: [...clearedSolids] } : {}),
  };
}

/**
 * The collision types a face can be set to (the owner, 2026-11-15: "set certain faces as walls, passthrough, ladders,
 * etc."; a browser adaptation, its words the disc's own combinations, measured on MP6, MP51 and MP72 2026-11-15): a floor
 * is `ditype` 3 (the ground probe's and the column probe's: stood on, and a wall where steep -- the floors and the
 * stairs' ramps read on the three maps); a wall `ditype` 2 (the column probe's only); a pass-through `ditype` 2 with `m_cameratype` 1 (the
 * walk's probes skip it, `SURFACE_SKIP`: MP6's 120, all `ditype` 2, under nodes named `camonly_collide`,
 * `tunnel_camonlycollide`, ...); a ladder `ditype` 2 with app flags `APP_LADDER` (2) (MP72's two). The material, the
 * region and the flags' other bits (inside, reverb) are kept.
 */
export const COLLISION_TYPES = [
  { type: 'floor', label: 'Floor', note: 'Stood on; a wall too where steep (the disc\'s floors and steps)' },
  { type: 'wall', label: 'Wall', note: 'Blocks; never stood on' },
  { type: 'passthrough', label: 'Pass-through', note: 'The walk ignores it (the disc\'s camera-only collision)' },
  { type: 'climbable', label: 'Climbable', note: 'Climbed, by its climb flag (1-5; 2 a ladder)' },
] as const;
export type CollisionType = (typeof COLLISION_TYPES)[number]['type'];

/** The app flags' value field (bits 0-2 of the flags word, `m_appflags`): the climb (`../../climb` `CLIMBABLE`, 2 a ladder). */
const APP_MASK = 7;
const APP_LADDER_VALUE = 2;

/**
 * The climb flags the Climbable type sets (the owner, 2026-11-15: "a climbable tab with a dropdown to pick the flag (1 -
 * 5)"), as the game reads `m_appflags` (`../../climb`, `FUN_005b2620` / `FUN_005b3ce0` / `FUN_00580b70`; the ladder
 * `FUN_0059d9f0`): 1 and 3 climbed by the height; 2 a ladder; 4 the crates', by the height only for 5 < h <= 32 and a
 * step up with no press for 5 < h <= 10; 5 always "Climb over". On MP6, MP51 and MP72 (2026-11-15) 4 is the commonest,
 * 5 on MP6's 8, 2 on MP72's ladder; 1 and 3 on none of the three.
 */
export const CLIMB_FLAGS = [
  // 1 and 3 named apart (the owner, 2026-11-15: "they have the same name, fix this"): the climb code reads them alike
  // (`../../climb` `climbClass`), so 3's name says so rather than invent a difference.
  { flag: 1, label: '1 · Climb by height', short: '1 Climb' },
  { flag: 2, label: '2 · Ladder', short: '2 Ladder' },
  { flag: 3, label: '3 · Climb by height, alternate (plays as 1)', short: '3 Climb alt' },
  { flag: 4, label: '4 · Crate (step up, 5-32)', short: '4 Crate' },
  { flag: 5, label: '5 · Climb over', short: '5 Climb over' },
] as const;
/** The climb flag Climbable takes unless one is chosen: the disc's commonest. */
export const CLIMB_FLAG_DEFAULT = 4;

/**
 * `s` made a face of collision type `type` (`COLLISION_TYPES`), its material, region and other flag bits kept. Floor,
 * wall and pass-through clear the climb flag (one tab, one behaviour); climbable sets `climb` (1-5), the face stood on
 * or not as it was -- a ladder (2) a wall, as the disc's ladder faces are (`ditype` 2).
 */
export function withCollisionType(s: Surface, type: CollisionType, climb: number = CLIMB_FLAG_DEFAULT): Surface {
  const [ditype, material, cameratype, region, flags] = s;
  const noClimb = flags & ~APP_MASK;
  switch (type) {
    case 'floor': return [3, material, cameratype & ~1, region, noClimb];
    case 'wall': return [2, material, cameratype & ~1, region, noClimb];
    case 'passthrough': return [2, material, (cameratype & ~3) | 1, region, noClimb];
    case 'climbable': return [climb === APP_LADDER_VALUE ? 2 : ditype, material, cameratype & ~1, region, noClimb | (climb & APP_MASK)];
  }
}

/** A face's climb flag (0 none). */
export const climbFlagOf = (s: Surface): number => s[4] & APP_MASK;

/** A face's corners as a key, order and winding left out, to a sixteenth of a unit (the hull's quantum). */
const cornersKey = (o: GeoObject, f: number): string =>
  facePoints(o.mesh, f).map((p) => p.map((v) => Math.round(v * 16)).join(',')).sort().join('|');

/**
 * The faces `faces` stand for, with their twins: every face of `hull`, in any object, with the very corners of one of
 * them. The disc's hull often holds a surface twice -- one polygon each way, or one under each of two nodes (measured
 * 2026-11-15: 1,004 of MP51's 7,647 editable polygons, 440 of MP6's 5,510, have such a twin) -- and a pick takes only
 * the nearer; a collision type set on the one alone leaves the other as it was, to the walk and to the view.
 */
export function withTwins(hull: WorldGeometry, faces: readonly { o: GeoObject; f: number }[]): { o: GeoObject; f: number }[] {
  const want = new Set(faces.map(({ o, f }) => cornersKey(o, f)));
  const out: { o: GeoObject; f: number }[] = [];
  for (const o of hull.objects) for (const f of liveFaces(o.mesh)) if (want.has(cornersKey(o, f))) out.push({ o, f });
  return out;
}

/** The collision type a face's words make (the Sample tool's read): a ladder, a pass-through, a floor, else a wall. */
export function collisionTypeOf(s: Surface): CollisionType {
  if ((s[4] & APP_MASK) !== 0) return 'climbable';
  if ((s[2] & 1) === 1) return 'passthrough';
  return (s[0] & 1) === 1 ? 'floor' : 'wall';
}

/**
 * `withTwins` for many lookups (a paint stroke's): the hull's faces filed by their corners once, each face then answered
 * with every face that has its corners (itself among them).
 */
export function twinIndexOf(hull: WorldGeometry): (o: GeoObject, f: number) => { o: GeoObject; f: number }[] {
  const byKey = new Map<string, { o: GeoObject; f: number }[]>();
  for (const o of hull.objects) for (const f of liveFaces(o.mesh)) {
    const k = cornersKey(o, f);
    const l = byKey.get(k);
    if (l) l.push({ o, f }); else byKey.set(k, [{ o, f }]);
  }
  return (o, f) => byKey.get(cornersKey(o, f)) ?? [{ o, f }];
}

/**
 * C1 (the owner, 2026-11-15: "moving a cube after editing its collision leaves its edited collision where it was"): the
 * hull objects edited by hand (`manual`) that stand for drawn object `o` -- its own when it is solid (`hullOf`), its
 * node's when it is a world node moved whole (`hullNode`). One not edited needs no following: Build makes it from the
 * object where it stands.
 */
export function followersOf(hull: WorldGeometry | null, o: GeoObject): GeoObject[] {
  if (!hull) return [];
  return hull.objects.filter((h) => h.manual && (h.hullOf === o.id || (o.group !== undefined && h.hullNode === o.group)));
}

/** A follower moved by `mat` (column-major), as its object was: every point, no texture to keep. */
export function moveFollower(h: GeoObject, mat: ArrayLike<number>): void {
  const all = new Set<number>();
  for (const f of liveFaces(h.mesh)) for (const v of h.mesh.faces[f]!.corners.map((c) => h.mesh.cVert[c]!)) all.add(v);
  transformVerts(h.mesh, all, mat);
}

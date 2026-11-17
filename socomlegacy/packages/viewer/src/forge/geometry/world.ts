import type { LoadedMap, LoadedMesh } from '../../loadMap';
import type { GroundData } from '../../mover';
import type { CollisionOwner, GridParams } from '@s2u/scene';
import { commonGroundSurface, floorOrWall, hullOfMesh, importCollision, isGroundWords, packCollision, surfaceMatcher, type CollisionMesh, type HullPoly, type Surface } from './collision';
import { addCorner, addFace, addVert, cloneMesh, compact, cornerAttrs, dot, emptyMesh, facePoints, faceVerts, polygonNormal, triangulate, vertPos, type EditMesh, type Vec3 } from './editMesh';
import { applyMat, transformVerts } from './ops';
import type { TextureSize } from './texturing';
import { compileMesh, importWorld, NO_NODE, type DrawSources } from './worldMesh';

/**
 * A map's editable geometry (a browser adaptation, FG.R2): its objects -- the map's own world first, then what was made
 * or separated by hand -- and the hull layer. The compile (`compileGeometry`) gives the draws and the hull the page and
 * the walk read in place of `LoadedMap.world` and `LoadedMap.ground`; on an untouched map they are those, exactly.
 */

export interface GeoObject {
  id: string;
  name: string;
  mesh: EditMesh;
  /** What it is: a node of the map's own world, a primitive, or a mesh separated off another. */
  kind: 'world' | 'box' | 'plane' | 'sphere' | 'cylinder' | 'mesh';
  /**
   * A node of the map's world: the faces of `mesh` (the world's one mesh, shared by every node's object) whose
   * `Face.group` is this -- so the compile merges the nodes' faces into the disc's draws, as the engine's merge did.
   * Absent: every face of `mesh` is the object's.
   */
  group?: number;
  hidden?: boolean;
  /**
   * A hull built from its faces, on these surface words (`./collision` `hullOfMesh`), rebuilt at each compile; absent,
   * it has none of its own -- the map's world, whose hull is the imported layer.
   */
  solid?: Surface;
  /**
   * A node of the map's world moved whole (object mode) since it was read: the column-major matrix taking where it was
   * to where it is. Build carries the node's own hull by it, polygon for polygon (the disc's surfaces kept).
   */
  moved?: number[];
  /** A node of the map's world reshaped (its points, edges or faces edited): Build makes its hull from its faces. */
  reshaped?: true;
  /**
   * The object's own axes (column-major 4x4, rotation only): a node's as the scene graph places it, a made object's as
   * its turns have left it; absent, the world's. The gizmo's Local space stands on them in object mode.
   */
  basis?: number[];
  /**
   * A hull object's world node (`./hullGeometry`: collision editing), -1 for the polygons under none; absent on drawn
   * geometry and on a hull object made in collision editing.
   */
  hullNode?: number;
  /**
   * A hull object's solid geometry object (its id): the collision Build makes from that object's faces (`o.solid`), edited
   * as a node's is -- a custom map's floor and boxes, a native map's own primitives, copies and pieces (the owner,
   * 2026-11-15: collision editing "doesn't seem to work in custom maps").
   */
  hullOf?: string;
  /** A hull object edited in collision editing: Build takes its faces as its node's hull (`./hullGeometry` `applyHullEdits`). */
  manual?: true;
  /**
   * The object's scale along its own axes (`basis`) as its scales have left it, 1 each when absent: what the Inspector
   * shows and edits (the owner, 2026-11-15). The points carry it; this only says how much.
   */
  scale?: [number, number, number];
}

export interface WorldGeometry {
  objects: GeoObject[];
  /** The map's own hull, as read (polygons edited on their own); null on a map with none. */
  collision: CollisionMesh | null;
  /** Per hull owner, the world node it is under (`LoadedMap.ownerNodes`), or null when the load had no tags. */
  ownerNodes: readonly number[] | null;
  /**
   * The world's mesh as it was read, never edited (a copy, shared by every undo step): what Build compares a reshaped
   * node's faces against, to keep the disc's hull where nothing changed (`buildHull`). Absent on a map with no world.
   */
  original?: EditMesh;
  /** A hull geometry's nodes whose object was deleted in collision editing: Build leaves them no editable hull. */
  clearedNodes?: number[];
  /** A hull geometry's solid objects (their ids) whose hull object was deleted in collision editing: Build leaves them none. */
  clearedSolids?: string[];
}

let nextId = 0;
export const newObjectId = (): string => `geo${Date.now().toString(36)}${(nextId++).toString(36)}`;

/**
 * A map's geometry for editing: an object each node of its world model that draws (`LoadedMap.worldNodes`, the
 * scene graph's own pieces: a building, a terrain section), all over the world's one mesh; the faces under no node one
 * more. A load without the node tags has the whole world one object. The hull is the layer.
 */
export function geometryOfMap(map: Pick<LoadedMap, 'world' | 'ground' | 'worldNodes' | 'ownerNodes'> & { grid?: GridParams }): WorldGeometry {
  const mesh = importWorld(map.world, map.grid);
  const counts = new Map<number, number>();
  for (const f of mesh.faces) if (f && f.group !== undefined) counts.set(f.group, (counts.get(f.group) ?? 0) + 1);
  const objects: GeoObject[] = [];
  if (map.worldNodes && counts.size) {
    map.worldNodes.forEach((n, i) => { if (counts.has(i)) objects.push({ id: n.key, name: n.name, kind: 'world', mesh, group: i, ...(n.anchor ? { basis: rotationOf(n.anchor) } : {}) }); });
    if (counts.has(-1)) objects.push({ id: 'world:root', name: 'World root', kind: 'world', mesh, group: -1 });
  } else if (map.world.length) objects.push({ id: 'world', name: 'World', kind: 'world', mesh });   // an empty world (a blank base) has none
  return { objects, collision: map.ground ? importCollision(map.ground) : null, ownerNodes: map.ownerNodes ?? null,
    ...(objects.length ? { original: cloneMesh(mesh) } : {}) };
}

/**
 * The map's world objects as `geometryOfMap` makes them -- a node of its world model that draws (a building, a terrain
 * section), the faces under no node one more, or the whole world one object on a load without the tags -- read off the
 * draws' node tags alone, nothing imported (bug 18: the Outliner lists the map's sections before Geometry mode opens).
 */
export function worldSectionsOf(map: Pick<LoadedMap, 'world' | 'worldNodes'>): { id: string; name: string }[] {
  const used = new Set<number>();
  for (const d of map.world) if (d.triNodes) for (const n of d.triNodes) used.add(n === NO_NODE ? -1 : n);
  if (map.worldNodes && used.size) {
    const out = map.worldNodes.flatMap((n, i) => (used.has(i) ? [{ id: n.key, name: n.name }] : []));
    if (used.has(-1)) out.push({ id: 'world:root', name: 'World root' });
    return out;
  }
  return map.world.length ? [{ id: 'world', name: 'World' }] : [];
}

/** An object's live faces. */
export function objectFaces(o: GeoObject): number[] {
  const out: number[] = [];
  o.mesh.faces.forEach((f, i) => { if (f && (o.group === undefined || f.group === o.group)) out.push(i); });
  return out;
}

/** An object's points. */
export const objectVerts = (o: GeoObject): Set<number> => new Set(objectFaces(o).flatMap((f) => faceVerts(o.mesh, f)));

export interface CompiledGeometry { world: LoadedMesh[]; ground: GroundData | null }

/** The model name a hand-made object's hull is owned under. */
export const GEOMETRY_OWNER_MODEL = 'forge.geometry';

/**
 * The draws: each mesh once, in the order its first object stands (the world's first), a hidden object's faces left
 * out. The hull is `buildHull`'s, not rebuilt here (the owner, 2026-11-14: collision only on Build).
 */
export function compileDraws(g: WorldGeometry, sources?: DrawSources, grid?: GridParams): LoadedMesh[] {
  const meshes: EditMesh[] = [];
  for (const o of g.objects) if (!meshes.includes(o.mesh)) meshes.push(o.mesh);
  return meshes.flatMap((m) => {
    const hidden = new Set(g.objects.filter((o) => o.mesh === m && o.hidden).map((o) => o.group ?? null));
    if (hidden.has(null)) return [];
    return compileMesh(m, hidden.size ? (f) => hidden.has(f.group ?? -1) : undefined, sources, grid);
  });
}

/** The draws and the hull: `compileDraws`, and the hull layer with each solid object's (`buildHull`). */
export function compileGeometry(g: WorldGeometry): CompiledGeometry {
  return { world: compileDraws(g), ground: buildHull(g) };
}

/** The hull owners under a world node's object (`GeoObject.group`), by the load's tags. */
export function ownersOf(g: WorldGeometry, o: GeoObject): number[] {
  if (o.group === undefined || !g.ownerNodes) return [];
  const out: number[] = [];
  g.ownerNodes.forEach((n, i) => { if (n === o.group) out.push(i); });
  return out;
}

/** The commonest surface words among a node's own hull: what its rebuilt hull, or a copy of it, stands on. */
export function nodeSurface(g: WorldGeometry, o: GeoObject): Surface | null {
  if (!g.collision) return null;
  const mine = new Set(ownersOf(g, o));
  const tally = new Map<string, { s: Surface; n: number }>();
  for (const p of g.collision.polys) {
    if (!mine.has(p.owner)) continue;
    const k = p.surface.join(',');
    const e = tally.get(k);
    if (e) e.n++; else tally.set(k, { s: p.surface, n: 1 });
  }
  // Bug 16: the commonest the ground probe stands on (ditype bit 0): one set of words for a whole copy or piece must be
  // a floor's, whose wall bit (ditype 3) still makes its walls walls -- a wall-only word (ditype 2) is no floor.
  let best: { s: Surface; n: number } | null = null;
  for (const e of tally.values()) if (isGroundWords(e.s) && (!best || e.n > best.n)) best = e;
  return best ? [...best.s] as Surface : commonGroundSurface(g.collision);
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** `a` after `b` (column-major 4x4s: `a b`). */
export function mul4(a: readonly number[], b: readonly number[]): number[] {
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r]! += a[k * 4 + r]! * b[c * 4 + k]!;
  return out;
}

/**
 * The hull Build makes (the owner, 2026-11-14: only on Build). The map's own layer, and on it:
 * - a node of the world moved whole: its owners' polygons carried by the move, each keeping the disc's surface words (a
 *   tilted owner's frame turned with it);
 * - a node reshaped: its owners' polygons taken out, and a hull from its faces (`hullOfMesh`) on its commonest surface
 *   (a browser adaptation: how the original's tools made a hull is not known);
 * - each visible solid object (a primitive, a copy, a piece separated): a hull from its faces.
 * A hidden object keeps its hull: hiding is the view's.
 */
export function buildHull(g: WorldGeometry): GroundData | null {
  const c = buildHullMesh(g);
  return c ? packCollision(c) : null;
}

/** `buildHull`'s layer before it is packed: what collision editing starts from and adds its edits to (`./hullGeometry`). */
export function buildHullMesh(g: WorldGeometry): CollisionMesh | null {
  if (!g.collision) return null;
  const c: CollisionMesh = { grid: g.collision.grid, owners: g.collision.owners.map((o) => ({ ...o })), polys: [...g.collision.polys] };
  for (const o of g.objects) {
    if (o.group === undefined || (!o.moved && !o.reshaped)) continue;
    const owners = new Set(ownersOf(g, o));
    if (!owners.size) continue;
    if (o.reshaped) {
      reshapedHull(g, c, o, owners);
      continue;
    }
    const m = o.moved!;
    if (m.every((x, i) => x === IDENTITY[i])) continue;
    c.polys = c.polys.map((p) => (owners.has(p.owner) ? { ...p, points: p.points.map((q) => applyMat(m, q)) } : p));
    for (const i of owners) {
      const frame = c.owners[i]!.frame;
      // A frame is row-major (`CollisionOwner.frame`): the move's transpose times it.
      if (frame) c.owners[i] = { ...c.owners[i]!, frame: Float32Array.from(transpose4(mul4(m, transpose4(Array.from(frame))))) };
    }
  }
  // Each Build starts from the read layer, so a solid object's hull is made anew, never found from the last one.
  // Its faces floors facing up, walls else (`floorOrWall`; the owner, 2026-11-17: "wall collision for walls and floor for floors").
  for (const o of g.objects) if (o.solid) appendOwnedPolys(c, hullOfMesh(o.mesh, floorOrWall(o.solid), objectFaces(o)), { modelName: GEOMETRY_OWNER_MODEL, path: `forge/${o.id}`, first: 0, count: 0 });
  return c;
}

/** Within this of a polygon's plane (units, 0.2 m at the disc's scale), and inside its box grown by it, a face is on or near it. */
const NEAR = 2;

interface Slab { n: Vec3; d: number; min: Vec3; max: Vec3; c: Vec3 }
const slabOf = (pts: readonly (readonly number[])[]): Slab | null => {
  if (pts.length < 3) return null;
  const n = polygonNormal(pts);
  if (!(Math.hypot(n[0], n[1], n[2]) > 0.5)) return null;
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity], c: Vec3 = [0, 0, 0];
  for (const q of pts) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k]!, q[k]!); max[k] = Math.max(max[k]!, q[k]!); c[k] = c[k]! + q[k]! / pts.length; }
  return { n, d: dot(n, pts[0]!), min, max, c };
};
/** `p` within `NEAR` of `s`'s plane and inside its box grown by `NEAR`. */
const onSlab = (s: Slab, p: Vec3): boolean => Math.abs(dot(s.n, p) - s.d) <= NEAR
  && p[0] >= s.min[0] - NEAR && p[0] <= s.max[0] + NEAR && p[1] >= s.min[1] - NEAR && p[1] <= s.max[1] + NEAR && p[2] >= s.min[2] - NEAR && p[2] <= s.max[2] + NEAR;
/** Two polygons near each other: either's centre on the other (a small one lying on a large one, either way round). */
const near = (a: Slab, b: Slab): boolean => onSlab(a, b.c) || onSlab(b, a.c);

/**
 * A reshaped node's hull at Build (the owner, 2026-11-15, after stairs walked jagged once their node was edited: "do 1"
 * -- keep the disc's hull where nothing changed). The disc's hull is authored apart from the draws (a staircase is one
 * ramp polygon over its drawn steps: MP51's wc01, 12 steps under one ramp; a node's own `di_` meshes), as Hammer's clip
 * brushes and Unreal's simple collision are, so a hull made from every drawn face walks the steps one ledge at a time.
 * So: the node's faces are compared with the read ones (`WorldGeometry.original`, carried by its whole move `moved`);
 * the disc's polygons on or near a face changed or deleted go (moved with the node as a whole otherwise), and the hull
 * of the changed faces takes their place -- with the unchanged faces near a polygon that went, so no hole opens where a
 * polygon covered more than the faces changed. Each triangle's words are the node's disc polygon's it lies on
 * (`surfaceMatcher`, bug 16). Untouched stairs keep their ramp; drawn-only detail (railings, trim) stays without a hull.
 */
function reshapedHull(g: WorldGeometry, c: CollisionMesh, o: GeoObject, owners: ReadonlySet<number>): void {
  const base = o.moved && !o.moved.every((x, i) => x === IDENTITY[i]) ? o.moved : null;
  const carry = (q: Vec3): Vec3 => (base ? applyMat(base, q) : q);
  // The node's disc polygons, carried by its whole move.
  const disc: HullPoly[] = c.polys.filter((p) => owners.has(p.owner)).map((p) => (base ? { ...p, points: p.points.map(carry) } : p));
  if (base) for (const i of owners) {
    const frame = c.owners[i]!.frame;
    if (frame) c.owners[i] = { ...c.owners[i]!, frame: Float32Array.from(transpose4(mul4(base, transpose4(Array.from(frame))))) };
  }
  // The faces changed (new, or a point moved off its read place) and the read faces gone (deleted, or changed: as read).
  const orig = g.original;
  const live = objectFaces(o);
  const changed: number[] = [], kept: number[] = [];
  const goneSlabs: Slab[] = [];
  const triSlabs = (pts: Vec3[]): Slab[] => triangulate(pts).flatMap(([a, b, d]) => { const s = slabOf([pts[a]!, pts[b]!, pts[d]!]); return s ? [s] : []; });
  const liveSet = new Set(live);
  if (!orig) changed.push(...live);
  else {
    for (const f of live) {
      const now = o.mesh.faces[f]!, was = orig.faces[f];
      const same = !!was && was.group === now.group && !was.disp && !now.disp && was.corners.length === now.corners.length
        && now.corners.every((cn, k) => {
          const a = vertPos(o.mesh, o.mesh.cVert[cn]!), b = carry(vertPos(orig, orig.cVert[was.corners[k]!]!));
          return Math.abs(a[0] - b[0]) < 1e-3 && Math.abs(a[1] - b[1]) < 1e-3 && Math.abs(a[2] - b[2]) < 1e-3;
        });
      if (same) { kept.push(f); continue; }
      changed.push(f);
      if (was && was.group === o.group) goneSlabs.push(...triSlabs(facePoints(orig, f).map(carry)));
    }
    orig.faces.forEach((was, f) => { if (was && was.group === o.group && !liveSet.has(f)) goneSlabs.push(...triSlabs(facePoints(orig, f).map(carry))); });
  }
  // The disc's polygons on or near a face that changed or went: they go.
  const discSlabs = disc.map((p) => slabOf(p.points));
  const drop = new Set<number>();
  if (!orig) disc.forEach((_, k) => drop.add(k));
  else discSlabs.forEach((s, k) => { if (s && goneSlabs.some((t) => near(s, t))) drop.add(k); });
  let k = 0;
  c.polys = c.polys.flatMap((p) => {
    if (!owners.has(p.owner)) return [p];
    const i = k++;
    return drop.has(i) ? [] : [disc[i]!];
  });
  if (!changed.length && !drop.size) return;
  // The unchanged faces under a polygon that went: their hull fills it.
  const dropped = [...drop].flatMap((i) => (discSlabs[i] ? [discSlabs[i]!] : []));
  const fill = kept.filter((f) => triSlabs(facePoints(o.mesh, f)).some((t) => dropped.some((s) => near(s, t))));
  const faces = [...changed, ...fill];
  if (!faces.length || !disc.length) return;
  const template = c.owners[Math.min(...owners)]!;
  appendOwnedPolys(c, hullOfMesh(o.mesh, surfaceMatcher(disc, commonGroundSurface(c)), faces), { ...template, path: `${template.path}#edit` });
}

/**
 * A hand-made hull's polygons appended, each under an owner of its own (`template`'s, the first reusing `reuse` when
 * given). The probe takes one polygon an owner under a point -- the first that crosses it (`probeGround`'s
 * `firstHit`) -- and a disc node is made so its floors do not stand over each other; a hull made from faces has no such
 * care (a box's top over its bottom), so no two of its polygons share an owner.
 */
export function appendOwnedPolys(c: CollisionMesh, polys: readonly Omit<HullPoly, 'owner'>[], template: CollisionOwner, reuse?: number): void {
  polys.forEach((p, k) => {
    let owner: number;
    if (k === 0 && reuse !== undefined) owner = reuse;
    else { c.owners.push({ ...template, path: k === 0 ? template.path : `${template.path}#${k}`, first: c.polys.length, count: 0 }); owner = c.owners.length - 1; }
    c.polys.push({ ...p, owner });
  });
}

const transpose4 = (m: readonly number[]): number[] => [0, 1, 2, 3].flatMap((r) => [0, 1, 2, 3].map((c) => m[c * 4 + r]!));

/** A copy of the whole geometry (an undo step): each mesh copied once, the world's nodes sharing their copy. */
export function cloneGeometry(g: WorldGeometry): WorldGeometry {
  const copies = new Map<EditMesh, EditMesh>();
  const copyOf = (m: EditMesh): EditMesh => { let c = copies.get(m); if (!c) { c = cloneMesh(m); copies.set(m, c); } return c; };
  return {
    objects: g.objects.map((o) => ({ ...o, mesh: copyOf(o.mesh), ...(o.solid ? { solid: [...o.solid] as Surface } : {}) })),
    // The hull layer is not edited yet (Build makes the hull from it), so a step shares it.
    collision: g.collision,
    ownerNodes: g.ownerNodes,
    ...(g.original ? { original: g.original } : {}),
    ...(g.clearedNodes ? { clearedNodes: [...g.clearedNodes] } : {}),
    ...(g.clearedSolids ? { clearedSolids: [...g.clearedSolids] } : {}),
  };
}

export function addObject(g: WorldGeometry, object: Omit<GeoObject, 'id'> & { id?: string }): GeoObject {
  const o: GeoObject = { ...object, id: object.id ?? newObjectId() };
  g.objects.push(o);
  return o;
}

export function removeObject(g: WorldGeometry, id: string): void {
  g.objects = g.objects.filter((o) => o.id !== id);
}

/**
 * An object moved whole (object mode), its mappings locked to it. A node of the map's world keeps the move it has had
 * (`GeoObject.moved`), so Build carries its own hull with it.
 */
export function transformObject(o: GeoObject, mat: ArrayLike<number>, size?: TextureSize): void {
  transformVerts(o.mesh, objectVerts(o), mat, { textureLock: true, ...(size ? { size } : {}) });
  if (o.group !== undefined) o.moved = mul4(Array.from(mat), o.moved ?? IDENTITY);
  // Its axes and its scale along them carried through the change: the frame's columns' lengths, then the frame made square.
  const [sx, sy, sz] = o.scale ?? [1, 1, 1];
  const scaled = [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, 0, 0, 0, 1];
  const full = mul4(Array.from(mat), mul4(o.basis ?? IDENTITY, scaled));
  const len = (c: number): number => Math.hypot(full[c * 4]!, full[c * 4 + 1]!, full[c * 4 + 2]!);
  const scale: [number, number, number] = [len(0), len(1), len(2)];
  if (scale.every((s) => Math.abs(s - 1) < 1e-6)) delete o.scale; else o.scale = scale;
  o.basis = rotationOf(full);
}

/** A 4x4's rotation alone: its axes made unit and square to each other, no translation. */
export function rotationOf(m: ArrayLike<number>): number[] {
  const unit = (v: number[]): number[] => { const l = Math.hypot(v[0]!, v[1]!, v[2]!) || 1; return v.map((x) => x / l); };
  const x = unit([m[0]!, m[1]!, m[2]!]);
  let y = [m[4]!, m[5]!, m[6]!];
  const d = x[0]! * y[0]! + x[1]! * y[1]! + x[2]! * y[2]!;
  y = unit([y[0]! - x[0]! * d, y[1]! - x[1]! * d, y[2]! - x[2]! * d]);
  const z = [x[1]! * y[2]! - x[2]! * y[1]!, x[2]! * y[0]! - x[0]! * y[2]!, x[0]! * y[1]! - x[1]! * y[0]!];
  return [x[0]!, x[1]!, x[2]!, 0, y[0]!, y[1]!, y[2]!, 0, z[0]!, z[1]!, z[2]!, 0, 0, 0, 0, 1];
}

/** A node of the map's world reshaped: Build makes its hull from its faces from now on (`GeoObject.reshaped`). */
export function markReshaped(o: GeoObject): void {
  if (o.group === undefined) return;
  o.reshaped = true;
  // The whole move it has had stays (`moved`): Build compares its faces with the read ones carried by it, so a node
  // moved and then reshaped keeps the disc's hull, moved, where its faces were not changed.
}

/**
 * What a new object is made from (`addObject`'s argument, no id): a copy of a whole object or of some of its faces --
 * the clipboard's item (`GeometryEditor`'s copy), a duplicate's. It shares nothing with the geometry it came from.
 */
export type GeoObjectCopy = Omit<GeoObject, 'id'>;

/** A whole object's copy (`objectCopy`'s), not yet added: a node of the world's faces alone, a plain mesh then. */
export function objectCopy(g: WorldGeometry, o: GeoObject, name = `${o.name} copy`): GeoObjectCopy {
  const mesh = o.group === undefined ? cloneMesh(o.mesh) : compact(cloneMesh({ ...o.mesh, faces: o.mesh.faces.map((f) => (f && f.group === o.group ? f : null)) }));
  for (const f of mesh.faces) if (f) delete f.group;
  // A copy of a node of the world is solid on the node's own commonest surface (its hull made from its faces at Build).
  const surface = o.solid ? [...o.solid] as Surface : o.group !== undefined ? nodeSurface(g, o) : null;
  return { name, kind: o.kind === 'world' ? 'mesh' : o.kind, mesh, ...(surface ? { solid: surface } : {}) };
}

/** A copy of an object (Ctrl-drag in object mode), moved by `mat` when given. */
export function duplicateObject(g: WorldGeometry, o: GeoObject, mat?: ArrayLike<number>): GeoObject {
  const copy = addObject(g, objectCopy(g, o));
  if (mat) transformObject(copy, mat);
  return copy;
}

/**
 * Some of an object's faces copied out as an object of their own, not yet added (Hammer's copy of faces): their points,
 * corners, styles, mappings and displacements, the source left as it was. Null when none of `faces` is there.
 */
export function facesCopy(g: WorldGeometry, from: GeoObject, faces: readonly number[], name: string): GeoObjectCopy | null {
  const live = faces.filter((f) => from.mesh.faces[f]);
  if (!live.length) return null;
  const src = from.mesh;
  const m = emptyMesh(src.styles.map(({ unused: _unused, ...s }) => ({ ...s, style: { ...s.style } })));
  const vMap = new Map<number, number>(), cMap = new Map<number, number>();
  for (const f of live) {
    const face = src.faces[f]!;
    const corners = face.corners.map((c) => {
      let nc = cMap.get(c);
      if (nc === undefined) {
        const v = src.cVert[c]!;
        let nv = vMap.get(v);
        if (nv === undefined) { nv = addVert(m, vertPos(src, v)); vMap.set(v, nv); }
        nc = addCorner(m, nv, cornerAttrs(src, c));
        cMap.set(c, nc);
      }
      return nc;
    });
    const nf = addFace(m, corners, face.style, face.normal);
    const copy = m.faces[nf]!;
    if (face.mapping) copy.mapping = { ...face.mapping };
    if (face.disp) copy.disp = { power: face.disp.power, heights: [...face.disp.heights] };
  }
  // Solid on the source's surface (a node's commonest), as a separated piece is.
  const surface = from.solid ? [...from.solid] as Surface : from.group !== undefined ? nodeSurface(g, from) : null;
  return { name, kind: 'mesh', mesh: m, ...(surface ? { solid: surface } : {}) };
}

/** A copy of a copy, in place (a paste's, a duplicate's): its own mesh and surface, so the clipboard pastes again unchanged. */
export function inPlaceCopy(c: GeoObjectCopy): GeoObjectCopy {
  return { ...c, mesh: cloneMesh(c.mesh), ...(c.solid ? { solid: [...c.solid] as Surface } : {}) };
}

/**
 * Faces of an object made an object of their own (Hammer's separate): moved out with their points, corners and styles,
 * so a building carved out of the map's world moves, hides and copies as one. Points the two share are copied, the
 * seam opening only where one is moved.
 */
export function separateFaces(g: WorldGeometry, from: GeoObject, faces: readonly number[], name: string): GeoObject | null {
  // The copy first (its surface read while the node still has its faces), then the faces taken out of the source.
  const piece = facesCopy(g, from, faces, name);
  if (!piece) return null;
  for (const f of faces) from.mesh.faces[f] = null;
  // The node it came from is reshaped (its hull made from its faces left); the piece is solid on the node's surface.
  markReshaped(from);
  return addObject(g, piece);
}

/** Objects merged into the first (their faces appended, styles carried). */
export function mergeObjects(g: WorldGeometry, ids: readonly string[]): GeoObject | null {
  const objs = ids.map((id) => g.objects.find((o) => o.id === id)).filter((o): o is GeoObject => !!o);
  if (objs.length < 2) return objs[0] ?? null;
  const into = objs[0]!;
  for (const o of objs.slice(1)) {
    const m = into.mesh, src = o.mesh;
    const styleMap = src.styles.map(({ base: _base, ...s }) => { m.styles.push({ ...s, style: { ...s.style }, rank: m.styles.length }); return m.styles.length - 1; });
    const vBase = m.verts.length / 3;
    m.verts.push(...src.verts);
    const cBase = m.cVert.length;
    m.cVert.push(...src.cVert.map((v) => v + vBase));
    m.cUv.push(...src.cUv); m.cColor.push(...src.cColor); m.cNormal.push(...src.cNormal); m.cCentroid.push(...src.cCentroid);
    for (const f of src.faces) if (f) m.faces.push({ ...f, corners: f.corners.map((c) => c + cBase), style: styleMap[f.style]!, ...(into.group !== undefined ? { group: into.group } : {}) });
    removeObject(g, o.id);
  }
  return into;
}

/** The point an object's mesh puts `p` at after `mat` (a gizmo preview). */
export const movedPoint = (mat: ArrayLike<number>, p: readonly number[]): readonly number[] => applyMat(mat, p);

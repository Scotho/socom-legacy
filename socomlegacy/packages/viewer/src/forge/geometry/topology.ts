import {
  addCorner, addFace, addVert, cornerAttrs, faceVerts, length, lerp, normalize, polygonNormal, sub, vertPos,
  type CornerAttrs, type EditMesh, type Face, type Vec3,
} from './editMesh';
import { floorOrWall } from './collision';

/**
 * The geometry tools' edit structure (a browser adaptation, after Blender's BMesh; the Forge's owner (crispy, OT.R112), 2026-11-19: "rebuild it as
 * half edge ... do it all"). The mesh stays what it is stored, drawn and compiled as (`./editMesh`: points, corners,
 * faces as rings) -- Blender keeps its meshes so too and builds its BMesh only while editing -- and a `Topo` over it
 * gives the tools three things they each worked out on their own before:
 *
 * - **Adjacency.** Each point's faces, kept as faces change, so an edge's faces, the face across an edge and the faces
 *   round a point *in their turn* (`fan`) are a lookup, not a walk over the whole mesh. An edge holds any number of faces
 *   (BMesh's radial cycle, not a strict half-edge's one twin): the disc's maps have walls standing on floors -- three
 *   faces on an edge -- and load as they are, nothing split.
 * - **A few operators every tool is built from** (`splitEdge`, `splitFace`, `joinFaces`, `makeFace`, `kill`,
 *   `setRing`, `flip`): BMesh's Euler operators. Each keeps the adjacency right, marks what it touched and logs how to
 *   undo itself.
 * - **A transaction** (`transact`): at the end the faces the tool touched are checked -- each simple (three points or
 *   more, none twice), with area, no edge run twice the same way, the surface no more open and no more non-manifold
 *   than it was -- and on a failed check, or a `MeshError` an operator throws, the log is played back: a tool does all
 *   of its work or none of it. A tool may also undo back to a `savepoint` (one point of many that cannot dissolve).
 */

/** A change an operator refuses, or a check that fails: the transaction is undone, the tool does nothing. */
export class MeshError extends Error {
  constructor(message: string) { super(message); this.name = 'MeshError'; }
}

/** A face this small has no area: a sliver no tool may leave. */
export const SLIVER_AREA = 1e-7;

/** A ring of points' area (Newell). */
export function ringArea(points: readonly (readonly number[])[]): number {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!, q = points[(i + 1) % points.length]!;
    x += p[1]! * q[2]! - p[2]! * q[1]!;
    y += p[2]! * q[0]! - p[0]! * q[2]!;
    z += p[0]! * q[1]! - p[1]! * q[0]!;
  }
  return Math.hypot(x, y, z) / 2;
}

export type Attrs = Required<CornerAttrs>;
export type FaceProps = Omit<Face, 'corners' | 'normal'>;

/** The faces round a point in their turn: `faces[i]` runs `inn[i]` -> the point -> `out[i]`, and `out[i]` is `inn[i + 1]`. */
export interface Fan {
  faces: number[];
  inn: number[];
  out: number[];
  /** The fan goes all the way round (no border at the point). */
  closed: boolean;
}

export interface TransactOptions {
  /** The tool may open the surface (a delete, an edge pulled out, a bridge of open edges): the border check is skipped. */
  open?: boolean;
  /** The tool may put a third face on an edge (an edge between two faces pulled out into a fin). */
  many?: boolean;
  /** The tool may leave faces of no area (Shift-drag's extrude starts at depth nothing). */
  slivers?: boolean;
  /** The tool may run an edge the way a face beside it does (an edge pulled out, turned after by its drag). */
  twice?: boolean;
}

const dirKey = (a: number, b: number): string => `${a}>${b}`;
const copyFace = (f: Face): Face => ({
  ...f, corners: [...f.corners], normal: f.normal && [...f.normal] as Vec3,
  ...(f.mapping ? { mapping: { ...f.mapping, u: [...f.mapping.u] as Vec3, v: [...f.mapping.v] as Vec3 } } : {}),
  ...(f.surface ? { surface: [...f.surface] as Face['surface'] } : {}),
});

export class Topo {
  /** Per point, the live faces using it (each once). */
  private readonly vf: number[][] = [];
  /** How to undo each change, in order. */
  private readonly log: (() => void)[] = [];
  // The mesh at the start, for the checks.
  private readonly v0: number;
  private readonly c0: number;
  private readonly f0: number;
  private readonly faceWas = new Map<number, Face | null>();
  private readonly posWas = new Map<number, Vec3>();
  private readonly vertWas = new Map<number, number>();
  /** Faces made, changed or killed since the start. */
  readonly touched = new Set<number>();

  /**
   * Over the whole mesh, or -- for looking only, never an edit -- over `faces` alone (one object of a map's world, whose
   * objects share its mesh: a loop walked in it stays in it).
   */
  constructor(readonly m: EditMesh, faces?: Iterable<number>) {
    if (faces) { for (const i of faces) if (m.faces[i]) this.link(i, faceVerts(m, i)); }
    else m.faces.forEach((f, i) => { if (f) this.link(i, faceVerts(m, i)); });
    this.v0 = m.verts.length / 3;
    this.c0 = m.cVert.length;
    this.f0 = m.faces.length;
  }

  /* ---------- the adjacency ---------- */

  private link(f: number, ring: readonly number[]): void {
    for (const v of new Set(ring)) { const l = this.vf[v]; if (l) l.push(f); else this.vf[v] = [f]; }
  }
  private unlink(f: number, ring: readonly number[]): void {
    for (const v of new Set(ring)) { const l = this.vf[v]; if (!l) continue; const i = l.indexOf(f); if (i >= 0) l.splice(i, 1); }
  }

  live(f: number): boolean { return !!this.m.faces[f]; }
  ring(f: number): number[] { return faceVerts(this.m, f); }
  pos(v: number): Vec3 { return vertPos(this.m, v); }
  normal(f: number): Vec3 { return polygonNormal(this.ring(f).map((v) => this.pos(v))); }
  area(f: number): number { return ringArea(this.ring(f).map((v) => this.pos(v))); }
  /** The live faces using point `v`. */
  facesAt(v: number): number[] { return [...(this.vf[v] ?? [])]; }
  /** Whether face `f` runs `a` then `b`. */
  runs(f: number, a: number, b: number): boolean {
    const vs = this.ring(f);
    for (let i = 0; i < vs.length; i++) if (vs[i] === a && vs[(i + 1) % vs.length] === b) return true;
    return false;
  }
  /** The live faces along edge `a`-`b`, either way round. */
  facesOn(a: number, b: number): number[] {
    return (this.vf[a] ?? []).filter((f) => this.runs(f, a, b) || this.runs(f, b, a));
  }
  hasEdge(a: number, b: number): boolean { return this.facesOn(a, b).length > 0; }
  /** The points joined to `v` by an edge. */
  spokes(v: number): number[] {
    const out = new Set<number>();
    for (const f of this.vf[v] ?? []) {
      const vs = this.ring(f);
      vs.forEach((x, i) => { if (x === v) { out.add(vs[(i + 1) % vs.length]!); out.add(vs[(i + vs.length - 1) % vs.length]!); } });
    }
    out.delete(v);
    return [...out];
  }
  /** Face `f`'s corner on point `v` (its first). */
  cornerAt(f: number, v: number): number {
    const face = this.m.faces[f]!;
    const k = face.corners.findIndex((c) => this.m.cVert[c] === v);
    if (k < 0) throw new MeshError(`point ${v} is not on face ${f}`);
    return face.corners[k]!;
  }
  /** The point after (`+1`) or before (`-1`) `v` round face `f`. */
  step(f: number, v: number, d: 1 | -1): number {
    const vs = this.ring(f);
    const i = vs.indexOf(v);
    return vs[(i + d + vs.length) % vs.length]!;
  }

  /**
   * The faces round `v` in their turn (`Fan`), or null where they make no single fan: an edge at `v` with more than two
   * faces, two faces running an edge the same way, `v` twice in a face, or two fans touching only at `v`.
   */
  fan(v: number): Fan | null {
    const fs = this.vf[v] ?? [];
    if (!fs.length) return null;
    const byInn = new Map<number, number>(), byOut = new Map<number, number>();
    const inn = new Map<number, number>(), out = new Map<number, number>();
    for (const f of fs) {
      const vs = this.ring(f);
      const i = vs.indexOf(v);
      if (vs.indexOf(v, i + 1) >= 0) return null;
      const a = vs[(i + vs.length - 1) % vs.length]!, b = vs[(i + 1) % vs.length]!;
      if (byInn.has(a) || byOut.has(b)) return null;
      byInn.set(a, f); byOut.set(b, f); inn.set(f, a); out.set(f, b);
    }
    // An open fan starts at the face whose edge in has no face before it.
    const opens = fs.filter((f) => !byOut.has(inn.get(f)!));
    if (opens.length > 1) return null;
    const start = opens.length === 1 ? opens[0]! : fs[0]!;
    const fan: Fan = { faces: [], inn: [], out: [], closed: opens.length === 0 };
    let f: number | undefined = start;
    while (f !== undefined && fan.faces.length < fs.length) {
      fan.faces.push(f); fan.inn.push(inn.get(f)!); fan.out.push(out.get(f)!);
      f = byInn.get(out.get(f)!);
      if (f === start) break;
    }
    if (fan.faces.length !== fs.length) return null;
    return fan;
  }

  /** The border of a set of faces: each edge one of them runs and none runs back, as `from` -> `to` in face `face`. */
  border(faces: readonly number[]): { from: number; to: number; face: number; i: number }[] {
    const mine = new Set(faces.filter((f) => this.live(f)));
    const runsIn = new Set<string>();
    for (const f of mine) { const vs = this.ring(f); vs.forEach((v, i) => runsIn.add(dirKey(v, vs[(i + 1) % vs.length]!))); }
    const out: { from: number; to: number; face: number; i: number }[] = [];
    for (const f of mine) {
      const vs = this.ring(f);
      vs.forEach((a, i) => { const b = vs[(i + 1) % vs.length]!; if (!runsIn.has(dirKey(b, a))) out.push({ from: a, to: b, face: f, i }); });
    }
    return out;
  }

  /* ---------- the log ---------- */

  /** Where the log stands: `undoTo` it to take back everything since. */
  savepoint(): number { return this.log.length; }
  undoTo(mark: number): void {
    while (this.log.length > mark) this.log.pop()!();
  }
  /** Every change undone. */
  rollback(): void { this.undoTo(0); this.touched.clear(); }

  private keepFace(f: number): void {
    if (f < this.f0 && !this.faceWas.has(f)) { const face = this.m.faces[f]; this.faceWas.set(f, face ? copyFace(face) : null); }
  }

  /* ---------- the operators ---------- */

  addVert(p: readonly number[]): number {
    if (![p[0], p[1], p[2]].every((x) => Number.isFinite(x))) throw new MeshError('a point not finite');
    const v = addVert(this.m, p);
    this.log.push(() => { this.m.verts.length = v * 3; });
    return v;
  }
  setPos(v: number, p: readonly number[]): void {
    if (![p[0], p[1], p[2]].every((x) => Number.isFinite(x))) throw new MeshError('a point not finite');
    const was = this.pos(v);
    if (v < this.v0 && !this.posWas.has(v)) this.posWas.set(v, was);
    this.m.verts[v * 3] = p[0]!; this.m.verts[v * 3 + 1] = p[1]!; this.m.verts[v * 3 + 2] = p[2]!;
    this.log.push(() => { this.m.verts[v * 3] = was[0]; this.m.verts[v * 3 + 1] = was[1]; this.m.verts[v * 3 + 2] = was[2]; });
    for (const f of this.vf[v] ?? []) this.touchFace(f);
  }
  addCorner(v: number, a: CornerAttrs): number {
    const c = addCorner(this.m, v, a);
    const m = this.m;
    this.log.push(() => { m.cVert.length = c; m.cUv.length = c * 2; m.cColor.length = c * 4; m.cNormal.length = c * 3; m.cCentroid.length = c * 3; });
    return c;
  }
  /** A copy of corner `c` (on point `v`, else its own). */
  cloneCorner(c: number, v = this.m.cVert[c]!): number { return this.addCorner(v, cornerAttrs(this.m, c)); }
  /** A corner's normal set (a face's corners given its facing). */
  setCornerNormal(c: number, n: readonly number[]): void {
    const was = [this.m.cNormal[c * 3]!, this.m.cNormal[c * 3 + 1]!, this.m.cNormal[c * 3 + 2]!];
    for (let k = 0; k < 3; k++) this.m.cNormal[c * 3 + k] = n[k]!;
    this.log.push(() => { for (let k = 0; k < 3; k++) this.m.cNormal[c * 3 + k] = was[k]!; });
  }
  /** Face `f` marked changed (its look or its points' places), its disc normal dropped. */
  touchFace(f: number): void {
    const face = this.m.faces[f];
    if (!face) return;
    this.keepFace(f);
    const was = face.normal;
    face.normal = null;
    this.log.push(() => { face.normal = was; });
    this.touched.add(f);
  }
  /** Face `f`'s fields set (`mapping`, `surface` ...). */
  setFace(f: number, patch: Partial<Omit<Face, 'corners'>>): void {
    const face = this.m.faces[f];
    if (!face) throw new MeshError(`face ${f} is gone`);
    this.keepFace(f);
    const was = copyFace(face);
    Object.assign(face, patch);
    this.log.push(() => { for (const k of Object.keys(face) as (keyof Face)[]) delete face[k]; Object.assign(face, was); });
    this.touched.add(f);
  }

  /** Face `f`'s ring replaced by `corners`. */
  setRing(f: number, corners: number[]): void {
    const face = this.m.faces[f];
    if (!face) throw new MeshError(`face ${f} is gone`);
    this.keepFace(f);
    const was = face.corners, wasN = face.normal;
    this.unlink(f, faceVerts(this.m, f));
    face.corners = corners;
    face.normal = null;
    this.link(f, faceVerts(this.m, f));
    this.log.push(() => { this.unlink(f, faceVerts(this.m, f)); face.corners = was; face.normal = wasN; this.link(f, faceVerts(this.m, f)); });
    this.touched.add(f);
  }

  /** A new face on `corners`, its fields `props`. */
  makeFace(corners: number[], props: FaceProps): number {
    const f = addFace(this.m, corners, props.style);
    Object.assign(this.m.faces[f]!, props, { corners, normal: null });
    this.link(f, faceVerts(this.m, f));
    this.log.push(() => { this.unlink(f, faceVerts(this.m, f)); this.m.faces.length = f; });
    this.touched.add(f);
    return f;
  }

  /** A face's fields for a new face like it (its style, object, mapping), whether it is live or killed in this edit. */
  propsOf(src: number, opts: { mapping?: boolean; surface?: boolean } = {}): FaceProps {
    const s = this.m.faces[src] ?? this.faceWas.get(src);
    if (!s) throw new MeshError(`face ${src} is gone`);
    const props: FaceProps = { style: s.style };
    if (s.group !== undefined) props.group = s.group;
    if (s.mapping && opts.mapping !== false) props.mapping = { ...s.mapping, u: [...s.mapping.u] as Vec3, v: [...s.mapping.v] as Vec3 };
    if (s.surface && opts.surface) props.surface = [...s.surface];
    return props;
  }

  /**
   * A new face like `src`: its draw style, object (group), texture mapping, and on a hull its collision words made a
   * floor's or a wall's by the new face's own facing (`floorOrWall`; the Forge's owner (crispy, OT.R112), 2026-11-18: "make sure to add the
   * collision flags properly"); each corner given the face's normal.
   */
  faceLike(corners: number[], src: number, opts: { mapping?: boolean } = {}): number {
    const s = this.m.faces[src] ?? this.faceWas.get(src);
    const f = this.makeFace(corners, this.propsOf(src, opts));
    if (s?.surface) this.m.faces[f]!.surface = floorOrWall(s.surface)(this.ring(f).map((v) => this.pos(v)));
    this.normalsDown(f);
    return f;
  }

  /** Each corner of face `f` given its face's normal (a face a tool reshaped). */
  normalsDown(f: number): void {
    if (!this.m.faces[f]) return;
    const n = this.normal(f);
    for (const c of this.m.faces[f]!.corners) this.setCornerNormal(c, n);
    this.touchFace(f);
  }

  kill(f: number): void {
    const face = this.m.faces[f];
    if (!face) return;
    this.keepFace(f);
    this.unlink(f, faceVerts(this.m, f));
    this.m.faces[f] = null;
    this.log.push(() => { this.m.faces[f] = face; this.link(f, faceVerts(this.m, f)); });
    this.touched.add(f);
  }

  /** Face `f` turned over (its ring reversed, its normals negated). */
  flip(f: number): void {
    const face = this.m.faces[f];
    if (!face) return;
    this.setRing(f, [...face.corners].reverse());
    const n = face.normal;
    face.normal = n && [-n[0], -n[1], -n[2]];
    for (const c of new Set(face.corners)) this.setCornerNormal(c, [-this.m.cNormal[c * 3]!, -this.m.cNormal[c * 3 + 1]!, -this.m.cNormal[c * 3 + 2]!]);
  }

  /** The corner attributes partway from corner `c` to corner `d` (`t` from `c`; the centroid `c`'s). */
  between(c: number, d: number, t: number): Attrs {
    const A = cornerAttrs(this.m, c), B = cornerAttrs(this.m, d);
    return { uv: lerp(A.uv, B.uv, t), color: lerp(A.color, B.color, t), normal: normalize(lerp(A.normal, B.normal, t)), centroid: [...A.centroid] };
  }

  /**
   * Edge `a`-`b` split at `t` (0 at `a`): a new point there, set into every face along the edge between its two corners
   * with attributes spread from theirs. Returns the new point.
   */
  splitEdge(a: number, b: number, t = 0.5): number {
    const fs = this.facesOn(a, b);
    if (!fs.length) throw new MeshError(`no edge ${a}-${b}`);
    const v = this.addVert(lerp(this.pos(a), this.pos(b), t));
    for (const f of fs) {
      const face = this.m.faces[f]!;
      const vs = faceVerts(this.m, f);
      const corners = [...face.corners];
      // Every place the face runs the edge (once in a simple face), from the back so the indices hold.
      for (let i = vs.length - 1; i >= 0; i--) {
        const x = vs[i]!, y = vs[(i + 1) % vs.length]!;
        if (!((x === a && y === b) || (x === b && y === a))) continue;
        const s = x === a ? t : 1 - t;
        corners.splice(i + 1, 0, this.addCorner(v, this.between(face.corners[i]!, face.corners[(i + 1) % vs.length]!, s)));
      }
      this.setRing(f, corners);
    }
    return v;
  }

  /**
   * Face `f` cut in two between its points `x` and `y` (not neighbours round it): `f` keeps the run from `x` to `y`, a new
   * face the run from `y` round to `x`; both keep its style, object, mapping and words, each its own corners at the cut.
   * Returns [f, the new face].
   */
  splitFace(f: number, x: number, y: number): [number, number] {
    const face = this.m.faces[f];
    if (!face) throw new MeshError(`face ${f} is gone`);
    const vs = faceVerts(this.m, f);
    const i = vs.indexOf(x), j = vs.indexOf(y);
    const n = vs.length;
    if (i < 0 || j < 0 || i === j || (i + 1) % n === j || (j + 1) % n === i) throw new MeshError('a face is cut between two points apart round it');
    if (this.hasEdge(x, y)) throw new MeshError('the cut is an edge already');
    const first: number[] = [], second: number[] = [];
    for (let k = i; ; k = (k + 1) % n) { first.push(face.corners[k]!); if (k === j) break; }
    for (let k = j; ; k = (k + 1) % n) { second.push(face.corners[k]!); if (k === i) break; }
    const props = this.propsOf(f, { surface: true });
    this.setRing(f, first);
    const g = this.makeFace(second.map((c) => this.cloneCorner(c)), props);
    return [f, g];
  }

  /**
   * Faces `f` and `g` joined into one where they meet (BMesh's join-faces): they must share one unbroken run of edges,
   * which `g` runs the other way from `f` (the same winding); the run's inner points leave the ring. The result keeps
   * `f`'s fields. Returns `f`, or null -- nothing changed -- where they cannot join into one simple face.
   */
  joinFaces(f: number, g: number): number | null {
    if (f === g || !this.live(f) || !this.live(g)) return null;
    const F = this.m.faces[f]!, G = this.m.faces[g]!;
    const fv = faceVerts(this.m, f), gv = faceVerts(this.m, g);
    const n = fv.length, k = gv.length;
    if (new Set(fv).size !== n || new Set(gv).size !== k) return null;
    const gNext = new Map<number, number>();
    gv.forEach((v, i) => gNext.set(v, gv[(i + 1) % k]!));
    // f's edges a -> b that g runs back (b -> a).
    const shared = fv.map((a, i) => gNext.get(fv[(i + 1) % n]!) === a);
    const count = shared.filter(Boolean).length;
    if (!count || count >= n || count >= k) return null;
    // One unbroken run: one place only where a shared edge follows an unshared one.
    let start = -1;
    for (let i = 0; i < n; i++) if (shared[i] && !shared[(i + n - 1) % n]) { if (start >= 0) return null; start = i; }
    if (start < 0) return null;
    // The run is f's edges start .. start+count-1, from fv[start] to fv[start+count]. The joined ring: f from the run's
    // end round to its start, then g on from the run's start round to just before its end.
    const runStart = fv[start]!;
    const ring: number[] = [];
    for (let s = 0; s <= n - count; s++) ring.push(F.corners[(start + count + s) % n]!);
    const gi = gv.indexOf(runStart);
    for (let s = 1; s < k - count; s++) ring.push(G.corners[(gi + s) % k]!);
    const verts = ring.map((c) => this.m.cVert[c]!);
    if (verts.length < 3 || new Set(verts).size !== verts.length) return null;
    this.kill(g);
    this.setRing(f, ring);
    return f;
  }

  /* ---------- the checks ---------- */

  /** A point as it was at the start (undefined for one made since). */
  private posBefore(v: number): Vec3 | undefined {
    if (v >= this.v0) return undefined;
    return this.posWas.get(v) ?? this.pos(v);
  }
  /** A face's ring of points as it was at the start, or null for one made since or dead then. */
  private ringBefore(f: number): number[] | null {
    if (f >= this.f0) return null;
    if (this.faceWas.has(f)) {
      const was = this.faceWas.get(f)!;
      return was ? was.corners.map((c) => this.vertWas.get(c) ?? this.m.cVert[c]!) : null;
    }
    return this.m.faces[f] ? faceVerts(this.m, f) : null;
  }

  /**
   * The touched faces checked (`transact`); throws `MeshError` on the first failure. Each live one: three points or
   * more, none twice, every point finite, an area (unless `slivers`, or it had none before). Over every edge they hold
   * now or held before: no more runs twice the same way than before; unless `open`, no more border by length; unless
   * `many`, no more edges of three faces or more by length.
   */
  check(opts: TransactOptions = {}): void {
    const m = this.m;
    const edges = new Map<string, [number, number]>();
    const note = (vs: readonly number[]): void => vs.forEach((a, i) => { const b = vs[(i + 1) % vs.length]!; if (a !== b) edges.set(a < b ? `${a}_${b}` : `${b}_${a}`, [Math.min(a, b), Math.max(a, b)]); });
    for (const f of this.touched) {
      const before = this.ringBefore(f);
      if (before) note(before);
      if (!m.faces[f]) continue;
      const vs = faceVerts(m, f);
      // A face the disc already had so (some hull polygons pass a point twice, or have two points) is not the tool's.
      const wasSimple = !before || (before.length >= 3 && new Set(before).size === before.length);
      if (wasSimple && vs.length < 3) throw new MeshError(`face ${f} has ${vs.length} points`);
      if (wasSimple && new Set(vs).size !== vs.length) throw new MeshError(`face ${f} passes a point twice`);
      const ps = vs.map((v) => vertPos(m, v));
      if (!ps.every((p) => p.every(Number.isFinite))) throw new MeshError(`face ${f} has a point not finite`);
      if (!opts.slivers && ringArea(ps) < SLIVER_AREA) {
        const was = before && before.every((v) => this.posBefore(v)) ? ringArea(before.map((v) => this.posBefore(v)!)) : Infinity;
        if (was >= SLIVER_AREA) throw new MeshError('a face would have no area');
      }
      note(vs);
    }
    const killedOrChanged = [...this.faceWas.keys()];
    const runsIn = (vs: readonly number[] | null, a: number, b: number): number => {
      if (!vs) return 0;
      let n = 0;
      for (let i = 0; i < vs.length; i++) if (vs[i] === a && vs[(i + 1) % vs.length] === b) n++;
      return n;
    };
    let twiceB = 0, twiceA = 0, borderB = 0, borderA = 0, manyB = 0, manyA = 0;
    for (const [a, b] of edges.values()) {
      let abB = 0, baB = 0, abA = 0, baA = 0;
      // Before: the faces at `a` then that no edit changed, and every face changed.
      for (const f of this.vf[a] ?? []) if (f < this.f0 && !this.faceWas.has(f)) { const r = faceVerts(m, f); abB += runsIn(r, a, b); baB += runsIn(r, b, a); }
      for (const f of killedOrChanged) { const r = this.ringBefore(f); abB += runsIn(r, a, b); baB += runsIn(r, b, a); }
      for (const f of this.vf[a] ?? []) { const r = faceVerts(m, f); abA += runsIn(r, a, b); baA += runsIn(r, b, a); }
      const pa = this.posBefore(a), pb = this.posBefore(b);
      const lenB = pa && pb ? length(sub(pa, pb)) : 0, lenA = length(sub(this.pos(a), this.pos(b)));
      // By length, as the border: an edge run twice the same way (the disc's strips have some) split in two is no more.
      twiceB += lenB * (Math.max(0, abB - 1) + Math.max(0, baB - 1));
      twiceA += lenA * (Math.max(0, abA - 1) + Math.max(0, baA - 1));
      const nB = abB + baB, nA = abA + baA;
      if (nB === 1) borderB += lenB;
      if (nA === 1) borderA += lenA;
      if (nB > 2) manyB += lenB * (nB - 2);
      if (nA > 2) manyA += lenA * (nA - 2);
    }
    const tol = (x: number): number => 1e-6 * (1 + x);
    if (!opts.twice && twiceA > twiceB + tol(twiceB)) throw new MeshError('an edge would be run twice the same way');
    if (!opts.open && borderA > borderB + tol(borderB)) throw new MeshError('the surface would open');
    if (!opts.many && manyA > manyB + tol(manyB)) throw new MeshError('an edge would hold more than two faces');
  }
}

/** Why the last transaction was undone (for the tools' messages and the tests). */
export let lastRefusal = '';

/**
 * A tool run as one transaction over a fresh `Topo`: its changes checked (`Topo.check`) and kept, or -- on a failed
 * check or a `MeshError` -- all undone and `refused` returned. Any other error undoes too and is thrown on (a bug).
 */
export function transact<T>(m: EditMesh, opts: TransactOptions, refused: T | ((why: string) => T), run: (t: Topo) => T): T {
  const t = new Topo(m);
  lastRefusal = '';
  try {
    const r = run(t);
    t.check(opts);
    return r;
  } catch (e) {
    t.rollback();
    if (e instanceof MeshError) {
      lastRefusal = e.message;
      return typeof refused === 'function' ? (refused as (why: string) => T)(e.message) : refused;
    }
    throw e;
  }
}

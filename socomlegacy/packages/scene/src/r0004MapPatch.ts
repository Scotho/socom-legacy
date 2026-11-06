import { chopF32 } from './grid';
import { IDENTITY, NODE_GENERIC, NODE_INSTANCE, type CollisionPoly, type SceneNode } from './sceneGraph';
import { R0004_MAP_EDITS } from './r0004MapPatchTable';

/**
 * R4B-09 (G1, research 383): r0004's per-map collision edits, applied once to a map's parsed scene graph when the map
 * loads -- the page's (`viewer/src/loadMap.ts` `place`) and the room's (`viewer/src/simMap.ts` `simMapFromBytes`) through
 * this one function, so both build the same hull. OT.R97: r0004 is the specification for gameplay.
 *
 * r0004 replaces the level loader (r4 0x2d4c20 in place of r0001's `FUN_001ea720`, D:L49713-49741): after the level
 * loads and before `CMission_Open` it matches the level's name against a list (`R0004_DISPATCH`, r4 0x2d4c68-0x2d5214)
 * and runs the matched map's routines, which find scene nodes by name and edit them: new collision nodes and polygons,
 * vertex snaps on existing polygons, surface-word rewrites, the per-node "stop at the first hit" byte, prop moves,
 * nodes switched off, and two node-list overwrites. The data is the generated `R0004_MAP_EDITS`
 * (`./r0004MapPatchTable`, from the transcription v2 by `tools/r0004MapPatchGen.ts`); every value in it is a reading,
 * pending review (R4B.R3). The operations below are what each record means, cited to the r4 code it was read from.
 *
 * Mutates `models` in place, as the engine edits its loaded graph in place: the caller's draw, hull, doors and turrets
 * then all read the edited graph. Call it once per parse.
 */

/** One float as its IEEE-754 single bits. */
type Bits = number;

/** A node as the routines name it: the first name through `FindByName`, each next one a child of that name. */
export type R0004NodePath = readonly string[];

/** One compare of a guard: the vertex (null: the loop's own), the axis, strict `>` / `<` or `==` against the bits. */
export interface R0004Term { v: number | null; axis: number; cmp: 'gt' | 'lt' | 'eq'; bits: Bits }
/** One store of a snap: a vertex's axis set to the bits, or less the operand (`sub.s`, the EE's chop). */
export interface R0004Store { v: number | null; axis: number; set?: Bits; sub?: Bits }
/** A new polygon: its surface word (+8) and its points, xyz bits each, in its node's frame. */
export interface R0004Poly { word: number; points: readonly Bits[] }

export type R0004Op =
  | { op: 'addNode'; pcs: readonly string[]; parent: { name: string } | { worldChildrenNamed: string }; polys: readonly R0004Poly[] }
  | { op: 'addPolys'; pcs: readonly string[]; node: R0004NodePath; order: number; polys: readonly R0004Poly[] }
  | { op: 'snap'; pcs: readonly string[]; node: R0004NodePath; branches: readonly { guard: readonly R0004Term[]; stores: readonly R0004Store[] }[] }
  | { op: 'point'; pcs: readonly string[]; node: R0004NodePath; poly: number; v: number | null; axis: number; set: Bits }
  | { op: 'word'; pcs: readonly string[]; node: R0004NodePath; and: number; or: number }
  | { op: 'stopFlag'; pcs: readonly string[]; node: R0004NodePath; clear?: boolean; copyFrom?: R0004NodePath }
  | { op: 'move'; pcs: readonly string[]; node: R0004NodePath; index: number; set?: Bits; add?: Bits; sub?: Bits }
  | { op: 'identity'; pcs: readonly string[]; node: R0004NodePath }
  | { op: 'rotY'; pcs: readonly string[]; node: R0004NodePath; angle: number }
  | { op: 'hide'; pcs: readonly string[]; node: R0004NodePath }
  | { op: 'hideGridNamed'; pcs: readonly string[]; name: string; box: readonly { index: number; cmp: 'gt' | 'lt'; bits: Bits }[] }
  | { op: 'assignDi'; pcs: readonly string[]; node: R0004NodePath; from: R0004NodePath }
  | { op: 'stray' | 'noop' | 'render'; pcs: readonly string[]; node?: R0004NodePath; why: string };

export interface R0004MapEdits { dispatchEntry: string; routines: readonly string[]; ops: readonly R0004Op[] }

/**
 * The dispatcher's chain (r4 0x2d4c68-0x2d5214; the cluster note's section 2, dot's enumeration): `strstr(level, id)` in
 * this order, the first match wins; `exact` ids match only a name of `strlen == 3` (r4's `$s0` from the `strlen` at
 * 0x2d4c68), so `mp1` cannot fire on `mp10`-`mp12`, `mp5` on `mp51`-`mp53`, `mp6` on `mp61`-`mp64`, `mp8` on
 * `mp81`-`mp83`. Not patched: `mp7`, `mp53`, the HDD maps, the other missions.
 */
export const R0004_DISPATCH: readonly { id: string; exact: boolean }[] = [
  ['mp11', false], ['mp10', false], ['mp12', false], ['mp1', true], ['mp51', false], ['mp52', false], ['mp5', true],
  ['mp61', false], ['mp62', false], ['mp64', false], ['mp6', true], ['mp71', false], ['mp72', false], ['mp73', false],
  ['mp81', false], ['mp82', false], ['mp83', false], ['mp2', true], ['mp8', true], ['mp9', true], ['m52', false],
  ['m61', false], ['m73', true],
].map(([id, exact]) => ({ id: id as string, exact: exact as boolean }));

/**
 * The level's name the chain reads: `0x414e00` (r1 `FUN_0027f800`), the lobby's mission written `"mp%d"` (research 154,
 * `FUN_0027f810` D:L197344-197345), so a map archive's stem in lower case (`MP72.ZDB` -> `mp72`, `M52.ZDB` -> `m52`).
 */
export const levelNameOf = (stem: string): string => stem.replace(/^.*[\\/]/, '').replace(/\.zdb$/i, '').toLowerCase();

/** The map's edits, or null when the chain matches nothing. */
export function r0004EditsFor(level: string): { id: string; edits: R0004MapEdits } | null {
  for (const { id, exact } of R0004_DISPATCH) {
    if (exact && level.length !== 3) continue;
    if (!level.includes(id)) continue;
    const edits = R0004_MAP_EDITS[id];
    return edits ? { id, edits } : null;
  }
  return null;
}

/**
 * [placeholder] The new collision nodes' local matrix: the CNode constructor's identity (r4 0x3343d0 calls
 * `FUN_001bff28`; r1 `FUN_00316e30` D:L215806-215844), so their points sit in the parent's frame -- the transcription's
 * reading of the code; no capture has dumped a new node. Its flag word: active (`FUN_00317060`, D:L215871) and has-DI
 * (`FUN_003130b0(n, 1)`, D:L213593), its layer bits (`m_region_shift`, +0x5c bits 13-17) whatever the pool's memory
 * held -- 0 here, read by no query the port makes with a mask. Settled by ac's capture (CAPTURE-SPEC-COMBINED part B).
 */
export const R0004_NEW_NODE_PLACEHOLDER = { matrix: IDENTITY, flags: (1 << 0) | (1 << 12) } as const;

/**
 * [placeholder] Whether the polygons an `m_di` overwrite drops from a node's list (mp51 `di_roof_h02_2`'s own nine, mp62
 * `di2`'s five) still collide by some other path: false -- the intersect walks the node's own list (r1 `FUN_002d3030`,
 * D:L175290-175300), so they are gone; the overwritten node lists the source's polygons (r4 0x25a130 = r1 `FUN_00259af0`
 * -> `FUN_00259d20`, the pointers copied). Settled by ac's capture.
 */
export const R0004_DROPPED_DI_COLLIDES_PLACEHOLDER = false;

/**
 * [placeholder] That a node switched off (node vtable +0x38, r4 0x1ec450: +0x5c bit 0 := 0) no longer collides, nor does
 * anything under it: `FUN_002d3030` tests the node's `m_active` and `m_hasDI` before its polygons and before it recurses
 * into its children (D:L175073-175074; the children's loop, D:L175383-175389, is inside that test) -- read, not
 * captured. The port carries it as the owner's flag bit 0, cleared down the subtree (`flattenScene`'s `flags`).
 * Settled by ac's capture.
 */
export const R0004_SWITCH_OFF_REMOVES_COLLISION_PLACEHOLDER = true;

/**
 * [placeholder] The barrels' turn (mp51 `wc13` / `wc24` `wood_barrel`, r4 0x2d6d3c / 0x2d6e1c): `sceVu0RotMatrixY`
 * (r4 0x1c0118 = r1 `FUN_001c0118`) on the identity by -/+2.0943899 rad. The matrix's bits come from the VU0 sine
 * (`FUN_001bff50`), which the transcription does not evaluate, and the layout is libvu0's documented one (row 0 =
 * (c, 0, -s), row 2 = (s, 0, c)), not read from the code: the port rounds `Math.cos`/`Math.sin` to single precision.
 * Settled by a dump of the two barrels' matrices.
 */
export const R0004_ROTY_MATRIX_PLACEHOLDER = { rows: 'c 0 -s / 0 1 0 / s 0 c', trig: 'Math.cos, Math.sin to f32' } as const;

/**
 * [reading] How many `crate_bananas_stacked4` caps mp72 gets: one per direct child of the world root of that name (r4
 * 0x2d7120-0x2d72e8, strcmp at 0x2d715c), which on r0001's MP72.ZDB is two (the third crate sits under
 * `b2_wc03_crates`). Disc data through the scene graph reader; `r0004MapPatchDisc.test.ts` pins it. A capture proves it.
 */
export const R0004_CRATE_CAP_COUNT_READING = 2;

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);
/** The float a word of bits holds. */
export function bitsToFloat(bits: Bits): number { u32[0] = bits >>> 0; return f32[0]!; }
/** A float's single bits. */
export function floatToBits(v: number): Bits { f32[0] = v; return u32[0]!; }

/** The surface word (+8 of a `CDIPoly`) of a polygon, from the fields the reader keeps (`readPoly`; research 36 §6). */
export function packSurfaceWord(p: CollisionPoly): number {
  return ((p.ditype & 3) | ((p.ptcount & 0xff) << 2) | ((p.material & 0xff) << 10) | ((p.cameratype & 3) << 18)
    | ((p.appflags & 7) << 20) | ((p.inside & 1) << 23) | ((p.shadow & 3) << 24) | ((p.reverbZone & 1) << 27)) >>> 0;
}
/** The bits `packSurfaceWord` carries: a rewrite may touch no other. */
const WORD_KEPT = 0x0bffffff;
function unpackInto(p: CollisionPoly, w: number): void {
  p.ditype = w & 3; p.material = (w >>> 10) & 0xff; p.cameratype = (w >>> 18) & 3; p.appflags = (w >>> 20) & 7;
  p.inside = (w >>> 23) & 1; p.shadow = (w >>> 24) & 3; p.reverbZone = (w >>> 27) & 1;
}

/** A new `CDIPoly` (r1 `FUN_002dc4c0`, D:L180438-180462: region and refcount 0) with the transcription's word and points. */
export function polyFrom(p: R0004Poly): CollisionPoly {
  const w = p.word >>> 0;
  const ptcount = (w >>> 2) & 0xff;
  if (p.points.length !== ptcount * 3) throw new Error(`r0004 polygon: ptcount ${ptcount} but ${p.points.length / 3} points`);
  const poly: CollisionPoly = {
    region: 0, refcount: 0, ditype: 0, ptcount, material: 0, cameratype: 0, appflags: 0, inside: 0, shadow: 0, reverbZone: 0,
    points: Float32Array.from(p.points, bitsToFloat),
  };
  unpackInto(poly, w);
  return poly;
}

/** What one application did, op by op: what the dev-disc test and the research note count. */
export interface R0004Applied {
  pcs: readonly string[];
  op: R0004Op['op'];
  /** The nodes it found (or, for `addNode`, the parents it attached under); an empty list for a name the graph lacks. */
  nodes: string[];
  /** Polygons added, vertices or polygons changed, nodes hidden or moved. */
  changed: number;
  /** A node it edited inside a model that instances share: every placement of that model takes the edit. */
  shared?: string[];
  why?: string;
}
export interface R0004Report { level: string; id: string | null; applied: R0004Applied[] }

interface Found { node: SceneNode; path: string; inModel: boolean }

/**
 * [reading] Which node a repeated name finds: the first in the graph's file order (the models, then the world, depth
 * first), as `FindByName`'s linear search takes the registry's first match (r1 `FUN_00311ef0`, D:L212946-212977) --
 * the registry's own fill order is not read. It decides MP62's three `di2` (the first sits at `di3`'s translation,
 * (1744.81, 174.94, 1342.38), the pairing the routine's `di2.m_di := di3.m_di` implies: the disc's partial support),
 * MP6's two `g65` and five `g67`, and MP82's four `cam_di`. To proven: ac's dump of the node each lookup returned.
 */
export const R0004_NODE_NAME_FIRST_READING = 'the first in file order' as const;

/**
 * `FindByName` (r4 0x32f490 = r1 `FUN_00311ef0`, D:L212946-212977): the first node of the registry whose name matches,
 * the registry filled as the level is read -- here the graph in file order (the models, then the world), depth first.
 * Children of an instance are its model's (`CNode::CreateInstance` copies the model into the node; `buildScene.ts`
 * `worldDi`), so a path may step through one; what it then finds is the shared model's node (`inModel`).
 */
class Graph {
  private readonly byName = new Map<string, Found>();
  private readonly models = new Map<string, SceneNode>();
  readonly root: SceneNode;
  constructor(readonly forest: SceneNode[], rootName: string, readonly level: string) {
    for (const m of forest) this.models.set(m.name, m);
    const root = this.models.get(rootName);
    if (!root) throw new Error(`r0004: no model named ${rootName}`);
    this.root = root;
    const walk = (n: SceneNode, path: string, inModel: boolean): void => {
      if (!this.byName.has(n.name)) this.byName.set(n.name, { node: n, path, inModel });
      for (const c of n.children) walk(c, `${path}/${c.name}`, inModel);
    };
    for (const m of forest) walk(m, m.name, m !== root);
  }
  /**
   * A path's nodes: the first name by `FindByName` -- the level's own name being the world root
   * (`R0004_MAP_ROOT_READING`) -- then every child of each next name, through an instance into its model.
   */
  resolve(path: R0004NodePath): Found[] {
    const first = path[0] === this.level ? { node: this.root, path: this.root.name, inModel: false } : this.byName.get(path[0]!);
    let found: Found[] = first ? [first] : [];
    for (const name of path.slice(1)) {
      const next: Found[] = [];
      for (const f of found) {
        const model = f.node.type === NODE_INSTANCE && f.node.modelName !== null ? this.models.get(f.node.modelName) : undefined;
        for (const c of f.node.children) if (c.name === name) next.push({ node: c, path: `${f.path}/${c.name}`, inModel: f.inModel });
        for (const c of model?.children ?? []) if (c.name === name) next.push({ node: c, path: `${model!.name}/${c.name}`, inModel: true });
      }
      found = next;
    }
    return found;
  }
}

/**
 * [reading] A new node whose parent the routine finds by the level's own name (`mp72`, `m52`, ...) hangs under the world
 * root, in the world's frame. The disc decides it on MP2: its terrain model `mp2` is placed at (960, 0, 800), and the
 * new node's first corner, (617, 142, 961) as the table gives it, is a corner of the barracks' own floor in the world's
 * frame (`r0004MapPatchDisc.test.ts`); under the model it would float 960 and 800 away. On every other map a model of
 * that name, where there is one, is placed at the identity, and where there is none (MP1, MP12, MP9, ...) `FindByName`
 * still finds a node -- the routine's `AddChild` through it would fault on a null -- that the port's graph does not
 * name. So the world root, by that evidence; a capture of a new node's parent proves it.
 */
export const R0004_MAP_ROOT_READING = 'the world root' as const;

/**
 * [reading] Three snap boxes written in world coordinates, which on r0001's data hit nothing: the guards compare a
 * polygon's stored, node-local points (G1b: no matrix is read in a snap), and these boxes sit on world-frame vertices.
 * MP72 r4 0x2d818c (`b1_wc02`, the vertex at world (1875.23, 101.624, 1699.99), local (600.31, 59.12, 277.31)) and
 * r4 0x2d82dc (`b1_wc04`, world (1327.615, 59.733, 1904.539) -- the same vertex the routine at r4 0x2d8cf4 then moves
 * by its local box (52.695, 17.233, 481.85)); MP9 r4 0x2e4344 (`land_19/congo_tree1`, the tree's own world origin; the
 * node holds no polygon of its own, its model's are on a child `di`). The port does what the code does on the stored
 * points: nothing. A dump of `b1_wc02`'s points on r0004 (ac's capture) settles whether r0004 sees them otherwise.
 */
export const R0004_WORLD_FRAME_BOXES_READING: readonly { map: string; pc: string; node: string }[] = [
  { map: 'mp72', pc: '0x2d818c', node: 'b1_wc02' },
  { map: 'mp72', pc: '0x2d82dc', node: 'b1_wc04' },
  { map: 'mp9', pc: '0x2e4344', node: 'land_19/congo_tree1' },
];

const lt = (a: number, b: number): boolean => a < b;
function holds(cmp: 'gt' | 'lt' | 'eq', value: number, bits: Bits): boolean {
  const bound = bitsToFloat(bits);
  return cmp === 'gt' ? lt(bound, value) : cmp === 'lt' ? lt(value, bound) : value === bound;
}

function bboxOf(polys: readonly CollisionPoly[]): Float32Array {
  const b = Float32Array.from([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);
  for (const p of polys) {
    for (let i = 0; i < p.points.length; i += 3) {
      for (let a = 0; a < 3; a++) { b[a] = Math.min(b[a]!, p.points[i + a]!); b[a + 3] = Math.max(b[a + 3]!, p.points[i + a]!); }
    }
  }
  return b;
}

/** A new collision node (r4 0x3343d0 ctor, `AddDI`, has-DI, bbox; `R0004_NEW_NODE_PLACEHOLDER`). */
function newNode(name: string, polys: readonly CollisionPoly[], matrix: Float32Array): SceneNode {
  return {
    name, modelName: null, type: NODE_GENERIC, flags: R0004_NEW_NODE_PLACEHOLDER.flags, matrix: Float32Array.from(matrix),
    bbox: bboxOf(polys), regionmask: 0, visuals: 0, visualParams: [], visualMaterials: [], children: [], collision: [...polys],
  };
}

/** The node's stop-at-first-hit byte (+0x80 bit 0): the constructor's 1 unless an edit set it (`SceneNode.stopAtFirstHit`). */
const stopOf = (n: SceneNode): boolean => n.stopAtFirstHit ?? true;

/** Applies one op; returns what it did. */
function apply(g: Graph, op: R0004Op): R0004Applied {
  const out: R0004Applied = { pcs: op.pcs, op: op.op, nodes: [], changed: 0 };
  const targets = (path: R0004NodePath): Found[] => {
    const found = g.resolve(path);
    out.nodes.push(...found.map((f) => f.path));
    const shared = found.filter((f) => f.inModel).map((f) => f.path);
    if (shared.length) out.shared = [...(out.shared ?? []), ...shared];
    return found;
  };
  switch (op.op) {
    case 'addNode': {
      const polys = op.polys.map(polyFrom);
      const name = `r0004@${op.pcs[0]}`;
      if ('worldChildrenNamed' in op.parent) {
        // r4 0x2d7120-0x2d72e8: a cap under each direct child of the world root so named -- the new node `AddChild`ed to
        // the crate (node vtable +0x18 on the crate, r4 0x2d719c; G1b section 4), at the identity in the crate's frame.
        // Under it here too, so its owner's path is beneath the crate's (the Forge's hide takes it with the crate);
        // `flattenScene` realises an instance node's own children in its frame.
        const crates = g.root.children.filter((c) => c.name === (op.parent as { worldChildrenNamed: string }).worldChildrenNamed);
        for (const crate of crates) {
          crate.children.push(newNode(name, polys.map((p) => ({ ...p, points: Float32Array.from(p.points) })), R0004_NEW_NODE_PLACEHOLDER.matrix));
          out.nodes.push(`${g.root.name}/${crate.name}`);
          out.changed += polys.length;
        }
        return out;
      }
      const parents = targets([op.parent.name]);
      if (parents.length === 0) { out.why = `no node named ${op.parent.name}: not attached`; return out; }
      parents[0]!.node.children.push(newNode(name, polys, R0004_NEW_NODE_PLACEHOLDER.matrix));
      out.changed = polys.length;
      return out;
    }
    case 'addPolys': {
      for (const f of targets(op.node)) { f.node.collision.push(...op.polys.map(polyFrom)); out.changed += op.polys.length; }
      return out;
    }
    case 'snap': {
      for (const f of targets(op.node)) {
        for (const poly of f.node.collision) {
          const n = poly.points.length / 3;
          const perVertex = op.branches.every((b) => b.guard.every((t) => t.v === null) && b.stores.every((s) => s.v === null));
          const at = (v: number, axis: number): number => poly.points[v * 3 + axis]!;
          const run = (vertex: number | null): boolean => {
            for (const b of op.branches) {
              if (!b.guard.every((t) => { const v = t.v ?? vertex!; return v < n && holds(t.cmp, at(v, t.axis), t.bits); })) continue;
              for (const s of b.stores) {
                const v = s.v ?? vertex!;
                if (v >= n) continue;
                const i = v * 3 + s.axis;
                poly.points[i] = s.set !== undefined ? bitsToFloat(s.set) : chopF32(poly.points[i]! - bitsToFloat(s.sub!));
              }
              return true;
            }
            return false;
          };
          if (perVertex) { for (let v = 0; v < n; v++) if (run(v)) out.changed++; }
          else if (run(null)) out.changed++;
        }
      }
      return out;
    }
    case 'point': {
      for (const f of targets(op.node)) {
        const poly = f.node.collision[op.poly];
        if (!poly || op.v === null || op.v >= poly.points.length / 3) continue;
        poly.points[op.v * 3 + op.axis] = bitsToFloat(op.set);
        out.changed++;
      }
      return out;
    }
    case 'word': {
      if ((~op.and & ~WORD_KEPT) !== 0 || (op.or & ~WORD_KEPT) !== 0) throw new Error(`r0004 ${op.pcs[0]}: a rewrite of bits the reader does not keep`);
      for (const f of targets(op.node)) {
        for (const p of f.node.collision) { unpackInto(p, ((packSurfaceWord(p) & op.and) | op.or) >>> 0); out.changed++; }
      }
      return out;
    }
    case 'stopFlag': {
      const from = op.copyFrom ? g.resolve(op.copyFrom)[0]?.node : undefined;
      for (const f of targets(op.node)) {
        f.node.stopAtFirstHit = op.clear ? false : from ? stopOf(from) : stopOf(f.node);
        out.changed++;
      }
      return out;
    }
    case 'move': {
      for (const f of targets(op.node)) {
        const m = f.node.matrix;
        m[op.index] = op.set !== undefined ? bitsToFloat(op.set)
          : op.add !== undefined ? chopF32(m[op.index]! + bitsToFloat(op.add)) : chopF32(m[op.index]! - bitsToFloat(op.sub!));
        out.changed++;
      }
      return out;
    }
    case 'identity': {
      for (const f of targets(op.node)) { f.node.matrix.set(IDENTITY); out.changed++; }
      return out;
    }
    case 'rotY': {
      // R0004_ROTY_MATRIX_PLACEHOLDER: the rotation applied to the (identity) matrix, rows c 0 -s / 0 1 0 / s 0 c.
      const c = Math.fround(Math.cos(op.angle)), s = Math.fround(Math.sin(op.angle));
      for (const f of targets(op.node)) {
        const m = f.node.matrix;
        const rot = Float32Array.from([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
        const out16 = new Float32Array(16);
        for (let r = 0; r < 4; r++) for (let col = 0; col < 4; col++) {
          let sum = 0;
          for (let k = 0; k < 4; k++) sum += m[r * 4 + k]! * rot[k * 4 + col]!;
          out16[r * 4 + col] = sum;
        }
        m.set(out16);
        out.changed++;
      }
      return out;
    }
    case 'hide': {
      for (const f of targets(op.node)) { f.node.flags = (f.node.flags & ~1) >>> 0; out.changed++; }
      return out;
    }
    case 'hideGridNamed': {
      // r4 0x2d8350-0x2d8494: every world-grid node of the name whose local translation lies strictly inside the box.
      const walk = (n: SceneNode, path: string): void => {
        if (n.name === op.name && op.box.every((b) => holds(b.cmp, n.matrix[b.index]!, b.bits))) {
          n.flags = (n.flags & ~1) >>> 0;
          out.nodes.push(path);
          out.changed++;
        }
        for (const c of n.children) walk(c, `${path}/${c.name}`);
      };
      walk(g.root, g.root.name);
      return out;
    }
    case 'assignDi': {
      // r4 0x25a130 = r1 `FUN_00259af0` -> `FUN_00259d20`: the destination's list becomes the source's pointers; the
      // dropped polygons are gone (`R0004_DROPPED_DI_COLLIDES_PLACEHOLDER`).
      const src = g.resolve(op.from)[0];
      for (const f of targets(op.node)) {
        if (!src) continue;
        out.changed += f.node.collision.length;
        f.node.collision = [...src.node.collision];
      }
      return out;
    }
    default:
      out.why = op.why;
      return out;
  }
}

/**
 * r0004's edits for the level, applied to its graph in the code's order. `stem` is the archive's (`MP72`); the chain
 * reads it as the level's name (`levelNameOf`). A level the chain does not match is left as read.
 */
export function applyR0004MapPatch(models: SceneNode[], stem: string, rootName = 'worldmodel'): R0004Report {
  const level = levelNameOf(stem);
  const match = r0004EditsFor(level);
  if (!match) return { level, id: null, applied: [] };
  return { level, id: match.id, applied: applyR0004Ops(models, level, match.edits.ops, rootName) };
}

/** A list of edits applied to a graph for the level named `level` (the map's own list, or a test's). */
export function applyR0004Ops(models: SceneNode[], level: string, ops: readonly R0004Op[], rootName = 'worldmodel'): R0004Applied[] {
  const g = new Graph(models, rootName, level);
  return ops.map((op) => apply(g, op));
}

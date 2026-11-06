import { chunkKey } from './modelLibrary';
import {
  IDENTITY, multiply, toColumnMajor, transformPoint, NODE_INSTANCE, type CollisionPoly, type SceneNode, NODE_FLAGS_LIT,
  VISUAL_FLAG_CULL, facadeOf, visualHasDetail, visualInAlphaPass } from './sceneGraph';

/**
 * Turning `MP*_GEO.ZED`'s prototype forest into placements: what gets drawn where, and which chain in
 * which model buffer draws it.
 *
 * The rule is `hookupVisuals` (`research/recom/src/gamez/zVisual/vis_main.cpp:58-175`). A model's chunk
 * keys are numbered `N` by the model's own visual-bearing nodes, depth first, never descending through
 * an instance; `I` by the model's instance contexts; `V` by the node's visuals. So a chunk does not
 * belong to "the world" as a whole -- it belongs to one node of the world, and takes that node's matrix
 * times every matrix above it.
 */

/** A realised node: one node of one model, in one context, with its matrix accumulated to the root. */
export interface SceneInstance {
  /** The model whose buffer holds this node's chunks. */
  modelName: string;
  node: SceneNode;
  /** Its index among the model's visual-bearing nodes -- the chunk key's `N` -- or -1 when it has none. */
  nodeIndex: number;
  /** The chunk key's `I`, or null when the model has no instances and takes the fallback naming. */
  instanceIndex: number | null;
  /** Row-major, row-vector: this node's matrix times every parent's, up to the root (24 section 1.1). */
  world: Float32Array;
  /** The path of node names from the root, for diagnostics. */
  path: string;
  /**
   * The facade turn the node is drawn under (LATER 120): the value of the last facade node to turn the draw walk's
   * matrix-stack entry this node is drawn with, or an entry beneath it (`StackEntry`), 0 when none is turned. Everything
   * under a flagged node turns with it; so do the nodes drawn after an identity-like flagged node under the entry it
   * shares (MP11's `light_bulb`: `bulb_1`, `wire` and `frame` after its `flare`).
   */
  facade: number;
  /**
   * Whether the node was reached through a realised prototype -- inside an instance's model rather than in
   * the root model's own tree. It decides whether an instance node's own `di` reaches the world (`worldDi`).
   */
  nested: boolean;
  /**
   * The node's flag word as the probe reads it (`collisionOwners`): its own, with `m_active` (bit 0) cleared when a
   * node above it is switched off. `FUN_002d3030` tests a node's `m_active` before its polygons and before it recurses
   * into its children (D:L175073-175074, the children's loop D:L175383-175389 inside that test), so a switched-off
   * node's whole subtree is out of the query; an instance's model root is the instance node itself in the engine
   * (`CNode::CreateInstance` copies the model into it, `worldDi`), so it takes the instance's. No node of the disc is
   * switched off above a polygon (`r0004MapPatchDisc.test.ts`); r0004 switches some off (R4B-09, research 383).
   */
  flags: number;
}

/** One drawn placement: a node's chunks and the matrix that puts them in the world. */
export interface PlacedModel {
  modelName: string;
  path: string;
  nodeIndex: number;
  instanceIndex: number | null;
  /** The chain keys of `modelName`'s buffer this placement draws, one per visual. */
  chunks: string[];
  /** Per chunk, in `chunks` order: whether the engine culls its back faces (`VISUAL_FLAG_CULL`). */
  cull: boolean[];
  /**
   * Per chunk: whether the engine draws it in the alpha pass after the walk, far to near (`visualInAlphaPass`:
   * `vparams` bit 0 set, bit 8 clear). Absent on a placement built by hand.
   */
  alphaPass?: boolean[];
  /** Per chunk: its `Material_Palette` entry, 1-based, 0 for none (`SceneNode.visualMaterials`). Absent on one built by hand. */
  material?: number[];
  /**
   * PF-30, per chunk: whether its detail pass may draw (`visualHasDetail`: `vparams` bit 14, `DETAIL_BIT14_READING`).
   * Absent on a placement built by hand.
   */
  detail?: boolean[];
  /**
   * PF-30, per chunk: the visual's centroid in model space (`SceneNode.visualCentres`, `DETAIL_CENTROID_READING`), null
   * where its record has none; `rowMajor` carries it into the world. Absent on a placement built by hand.
   */
  centres?: ([number, number, number] | null)[];
  /** PF-30, per chunk: the visual's detail gate range squared (`SceneNode.visualDetailRanges`), null for none. */
  detailRanges?: (number | null)[];
  /**
   * The facade turn this placement is drawn under (`SceneInstance.facade`, LATER 120): non-zero, the engine turns it to
   * face the camera about its own origin (`facadeOf` on it or above it, or an identity-like facade node before it under
   * the entry it shares).
   */
  facade: number;
  /** 16 floats, column-major: what three.js wants (the transpose of `rowMajor`). */
  world: Float32Array;
  /** 16 floats, row-major, as the engine computes it. */
  rowMajor: Float32Array;
  /**
   * Whether the engine lights this placement on VU1 -- `NODE_FLAGS_LIT` on its node or on the model it
   * instances. False on every node of most maps: the multiplayer world is drawn from the vertex colours
   * the exporter baked, and only the odd fern, palm or flare is lit at run time.
   */
  lit: boolean;
  /**
   * The node's own `nparams` bbox, model space (min xyz, max xyz): what the grid files the placement by,
   * carried through `rowMajor` (`grid.ts`, `worldFootprint`). Absent on a placement built by hand.
   */
  bbox?: Float32Array;
}

/** One collision polygon, placed: its points carried into the world frame. */
export interface PlacedCollision {
  modelName: string;
  path: string;
  poly: CollisionPoly;
  /** xyz per point, world space. */
  points: Float32Array;
}

/** A prototype that instances itself, directly or through others, would never stop expanding. */
const MAX_DEPTH = 16;

/**
 * `FUN_003084f0` (D:L206890-206916): whether the draw walk skips a node's push -- its translation words exactly 0 and
 * its diagonal words exactly 1.0, compared as bit patterns (so -0.0 is not 0); the off-diagonal words are not read.
 */
export function identityLike(m: Float32Array): boolean {
  const w = new Uint32Array(m.buffer, m.byteOffset, 16);
  return w[12] === 0 && w[13] === 0 && w[14] === 0 && w[0] === 0x3f800000 && w[5] === 0x3f800000 && w[10] === 0x3f800000;
}

/**
 * LATER 120: an entry of the draw walk's matrix stack. `FUN_003389c0` pushes one for a node that is not identity-like
 * (D:L236075-236079) and draws any other node with the entry on top; a facade node's turn (`FUN_00317fc0`, D:L236080-236081)
 * rewrites the rows of the entry on top -- its own when it pushed, else the one it shares -- and that entry stays turned
 * until it is popped (D:L236222-236225), so every node drawn after under it, or under an entry pushed on it, is drawn
 * turned. The port takes each top-level child of the world as an atom, drawn on a fresh entry and popped after it
 * (`FUN_00337f40` D:L235715-235717, D:L235753-235754), so no turn reaches past it -- a reading that rests on an unread
 * bit: atoms are what `FUN_00338480`'s gather collects (D:L235896, D:L235971-235987), which the world root reaches only
 * with its flag bit 24 (+0x5f bit 0) set in memory (`FUN_0033b110` D:L237277-237282, likewise D:L178672-178677) -- clear
 * on every node as stored; drawn inline instead, its children would share the root's entry -- and the gather also makes
 * atoms of the children of nodes whose first visual is of type 1 or 2 (`FUN_00317f70`, `FUN_00317ef0`), not modelled
 * here. No disc case depends on it: on the 34 maps no identity-like facade node shares the world root's entry (research
 * 101 A11). `turned` is the facade value written, 0 for none; a value of 3 turns nothing (`FUN_00317fc0` returns before
 * writing) and leaves it as it was.
 */
interface StackEntry { readonly below: StackEntry | null; turned: number }

/** The facade turn a node on `entry` is drawn under: the nearest turned entry's, 0 for none. */
function turnedOf(entry: StackEntry | null): number {
  for (let e = entry; e; e = e.below) if (e.turned !== 0) return e.turned;
  return 0;
}

/** The entry a node is drawn on (a push, or `top` shared), its own facade's turn written. */
function entryFor(node: SceneNode, top: StackEntry | null): StackEntry {
  const entry = identityLike(node.matrix) && top ? top : { below: top, turned: 0 };
  const own = facadeOf(node.flags);
  if (own === 1 || own === 2) entry.turned = own;
  return entry;
}

/**
 * How many instance contexts the exporter wrote chunk keys for, per model.
 *
 * A model's subtree is realised once as the prototype itself and once more for every context its
 * container is realised in, so `contexts(C) = sum over containers M of (1 + contexts(M)) * howOftenMContainsC`,
 * and the world model, which nothing contains, has none. Frostfire's six nested rail models are the
 * evidence: `tankrailsupport` has 4 instance nodes in the graph but 28 `I` keys in the buffer, and only
 * this recursion reaches 28.
 */
export function countInstances(models: SceneNode[]): Map<string, number> {
  const containers = new Map<string, Map<string, number>>();     // model -> container -> how many times
  for (const model of models) {
    const rec = (node: SceneNode): void => {
      for (const child of node.children) {
        if (child.type === NODE_INSTANCE && child.modelName !== null) {
          const byContainer = containers.get(child.modelName) ?? new Map<string, number>();
          byContainer.set(model.name, (byContainer.get(model.name) ?? 0) + 1);
          containers.set(child.modelName, byContainer);
        }
        rec(child);
      }
    };
    rec(model);
  }

  const counts = new Map<string, number>();
  const busy = new Set<string>();
  const contexts = (name: string): number => {
    const known = counts.get(name);
    if (known !== undefined) return known;
    if (busy.has(name)) throw new Error(`model ${name} instances itself, directly or through another model`);
    busy.add(name);
    let total = 0;
    for (const [container, times] of containers.get(name) ?? []) total += (1 + contexts(container)) * times;
    busy.delete(name);
    counts.set(name, total);
    return total;
  };
  for (const model of models) contexts(model.name);
  for (const name of containers.keys()) contexts(name);
  return counts;
}

/**
 * How many instance contexts of each model the load has created by the time it reaches `rootName`: the
 * first `I` index the root's own realisations take.
 *
 * `hookupVisuals` numbers a model's contexts by its `m_list` (`vis_main.cpp:77-111`), the instance nodes in
 * the order the load created them. The graph's models are read in file order, and reading a model creates
 * one context per instance node in its tree, depth first, each copy re-making the instances inside the
 * prototype it copies (`CNode::CreateInstance`, `CNode::_Copy`, `zNode/node_main.cpp:312-333`) -- the same
 * recursion `countInstances` sums. The world model is read last, so every prototype's own contexts (the
 * copies inside other prototypes, never placed and never prelit) come first and the world's placements
 * take the numbers after them. Frostfire's tank rails are the evidence: `tankrailbarshi`'s `I000` is the
 * bare material colour, (128, 109, 35) on every vertex, and `I001`..`I017` the seventeen prelit rails.
 */
export function contextsBefore(models: SceneNode[], rootName = 'worldmodel'): Map<string, number> {
  const byName = new Map(models.map((m) => [m.name, m]));
  const created = new Map<string, number>();
  const create = (name: string, depth: number): void => {
    created.set(name, (created.get(name) ?? 0) + 1);
    const prototype = byName.get(name);
    if (prototype && depth < MAX_DEPTH) instancesIn(prototype, depth + 1);
  };
  const instancesIn = (node: SceneNode, depth: number): void => {
    for (const child of node.children) {
      if (child.type === NODE_INSTANCE) { if (child.modelName !== null) create(child.modelName, depth); }
      else instancesIn(child, depth);
    }
  };
  for (const model of models) {
    if (model.name === rootName) break;
    instancesIn(model, 0);
  }
  return created;
}

/**
 * Realises the scene: every node of every model, in every context reachable from the root model, with
 * its world matrix. An instance node is emitted itself (it can carry collision of its own) and then the
 * model it names is realised beneath it.
 *
 * The `I` index is the context's place in the load's creation order (`contextsBefore`): the root's
 * realisations take the numbers after the contexts the models read before it created, in traversal
 * order. Nothing about where a prop sits depends on it -- the chains of one model differ only in their
 * baked per-instance vertex lighting, their positions being identical -- but that lighting is the picture.
 */
export function flattenScene(models: SceneNode[], rootName = 'worldmodel'): SceneInstance[] {
  const byName = new Map(models.map((m) => [m.name, m]));
  const root = byName.get(rootName);
  if (!root) throw new Error(`the scene graph has no model named ${rootName}`);
  const counts = countInstances(models);
  const taken = contextsBefore(models, rootName);
  const out: SceneInstance[] = [];

  const takeIndex = (name: string): number | null => {
    const total = counts.get(name) ?? 0;
    if (total === 0) return null;                               // the fallback naming: one set of chunks
    const next = taken.get(name) ?? 0;
    taken.set(name, next + 1);
    return Math.min(next, total - 1);
  };

  const realise = (model: SceneNode, parent: Float32Array, path: string, instanceIndex: number | null, depth: number, top: StackEntry | null, activeAbove: boolean): void => {
    let nodeIndex = 0;
    const nested = depth > 0;
    const rec = (node: SceneNode, above: Float32Array, where: string, below: StackEntry | null, upActive: boolean): void => {
      const world = multiply(node.matrix, above);
      const entry = entryFor(node, below);
      const active = upActive && (node.flags & 1) !== 0;
      out.push({ modelName: model.name, node, nodeIndex: node.visuals > 0 ? nodeIndex++ : -1, instanceIndex, world, path: where, facade: turnedOf(entry), nested, flags: flagsOf(node, active) });
      // The world's own children are taken as atoms (`StackEntry`: a reading on an unread bit, no disc case depending on
      // it): each starts on a fresh entry of its own. Another root (a clutter
      // model, a weapon, an effect) is drawn whole on the one entry its draw pushes (that path is not read; no disc case).
      const atoms = depth === 0 && node === model && rootName === 'worldmodel';
      for (const child of node.children) {
        const childPath = `${where}/${child.name}`;
        const childTop = atoms ? null : entry;
        if (child.type !== NODE_INSTANCE) {
          rec(child, world, childPath, childTop, active);
          continue;
        }
        const childWorld = multiply(child.matrix, world);
        const childEntry = entryFor(child, childTop);
        const childActive = active && (child.flags & 1) !== 0;
        out.push({ modelName: model.name, node: child, nodeIndex: -1, instanceIndex, world: childWorld, path: childPath, facade: turnedOf(childEntry), nested, flags: flagsOf(child, childActive) });
        const prototype = child.modelName === null ? undefined : byName.get(child.modelName);
        if (prototype && depth < MAX_DEPTH) {
          realise(prototype, childWorld, `${childPath}=${prototype.name}`, takeIndex(prototype.name), depth + 1, childEntry, childActive);
        }
        // An instance node's own children, after its model (none on the disc as read; R4B-09's crate caps hang so,
        // `AddChild` on the crate at r4 0x2d719c -- research 383): in its frame, under its path.
        for (const own of child.children) rec(own, childWorld, `${childPath}/${own.name}`, childEntry, childActive);
      }
    };
    rec(model, parent, path, top, activeAbove);
  };

  realise(root, IDENTITY, rootName, takeIndex(rootName), 0, null, true);
  return out;
}

/** A node's flag word with `m_active` cleared when it or a node above it is switched off (`SceneInstance.flags`). */
const flagsOf = (node: SceneNode, active: boolean): number => (active ? node.flags : (node.flags & ~1) >>> 0);

/**
 * Every drawn placement of the scene: one per realised node that has visuals and that the draw walk's `m_active` gate
 * lets through, with its chunk keys.
 *
 * LATER 707 (research 383 §5, research 318 §1.2): `FUN_003389c0` -- the world's node draw, from the grid walk
 * `FUN_00339de0` (D:L236971) -- tests the node's `+0x5c` bit 0 first (D:L236069) and only inside that test draws its
 * visuals (D:L236189-236192) and recurses into its children (D:L236208-236219): a node off draws nothing of its subtree,
 * an instance's model with it -- the draw's twin of the probe's gate (`FUN_002d3030` D:L175073-175074). `flattenScene`
 * carries the bit down (`SceneInstance.flags`). As read no node of any map's graph is off (34 maps,
 * `drawGateDisc.test.ts`), so the gate hides only r0004's switch-offs (`r0004MapPatch.ts` `hide`): MP71's `b1`, MP72's
 * basket, MP73's six chairs. The chunk keys of the rest are unchanged (the `N` index counts every visual-bearing node).
 */
export function placeInstances(models: SceneNode[], rootName = 'worldmodel'): PlacedModel[] {
  const modelFlags = new Map(models.map((m) => [m.name, m.flags]));
  return flattenScene(models, rootName)
    .filter((f) => f.node.visuals > 0 && (f.flags & 1) !== 0)
    .map((f) => ({
      modelName: f.modelName,
      path: f.path,
      nodeIndex: f.nodeIndex,
      instanceIndex: f.instanceIndex,
      chunks: Array.from({ length: f.node.visuals }, (_, v) => chunkKey(f.nodeIndex, f.instanceIndex, v)),
      cull: Array.from({ length: f.node.visuals }, (_, v) => ((f.node.visualParams[v] ?? VISUAL_FLAG_CULL) & VISUAL_FLAG_CULL) !== 0),
      alphaPass: Array.from({ length: f.node.visuals }, (_, v) => visualInAlphaPass(f.node.visualParams[v] ?? 0)),
      material: Array.from({ length: f.node.visuals }, (_, v) => f.node.visualMaterials?.[v] ?? 0),
      detail: Array.from({ length: f.node.visuals }, (_, v) => visualHasDetail(f.node.visualParams[v] ?? 0)),
      centres: Array.from({ length: f.node.visuals }, (_, v) => f.node.visualCentres?.[v] ?? null),
      detailRanges: Array.from({ length: f.node.visuals }, (_, v) => f.node.visualDetailRanges?.[v] ?? null),
      facade: f.facade,
      world: toColumnMajor(f.world),
      rowMajor: f.world,
      lit: ((f.node.flags | (modelFlags.get(f.modelName) ?? 0)) & NODE_FLAGS_LIT) !== 0,
      bbox: f.node.bbox,
    }));
}

/**
 * The `di` polygons a realised node contributes to the world the engine holds: its own, except on an instance
 * node inside a realised prototype, which contributes none of its own (research 24 section 1.1's 3,318).
 *
 * The exporter writes a prototype's root `di` onto every node that instances it as well, and the engine keeps
 * both copies only where it reads the instance from the world's own file: `CNode::CreateInstance(sload)` copies
 * the model (its `di` with it) and then `ReadDataBegin` adds the node's own `di` on top (reCOM
 * `research/recom/src/gamez/zNode/node_io.cpp:46-51`, `node_saveload.cpp:49-74`). An instance inside a prototype is
 * not read again when the prototype is instanced: `CNode::_Copy` re-makes it from a model
 * (`zNode/node_main.cpp:312-333`; reCOM's transcription passes the container's `m_model` there, and leaves the
 * `di` copy itself a TODO at `:308`), so the file's copy on it never reaches the world. The prototype's own copy is
 * still there -- the viewer realises it as the model root under the instance node (`flattenScene`'s `=`) -- so
 * nothing is lost but a duplicate. On Frostfire that is the ten `railpostfiller` posts inside the three tank
 * rails, 20 polygons: 3,338 before, 3,318 after, the count and bounds research 24 section 1.1 walked in the
 * image (checked 2026-09-28; MP6 carries 79 such, MP72 none).
 */
export function worldDi(f: SceneInstance): CollisionPoly[] {
  return f.nested && f.node.type === NODE_INSTANCE ? [] : f.node.collision;
}

/** Every collision polygon of the scene, its points carried from model space into the world frame (`worldDi`). */
export function placeCollision(models: SceneNode[], rootName = 'worldmodel'): PlacedCollision[] {
  const out: PlacedCollision[] = [];
  for (const f of flattenScene(models, rootName)) {
    for (const poly of worldDi(f)) {
      const points = new Float32Array(poly.points.length);
      for (let i = 0; i < poly.points.length; i += 3) {
        const p = transformPoint(f.world, poly.points[i]!, poly.points[i + 1]!, poly.points[i + 2]!);
        points[i] = p[0]; points[i + 1] = p[1]; points[i + 2] = p[2];
      }
      out.push({ modelName: f.modelName, path: f.path, poly, points });
    }
  }
  return out;
}

import { Matrix4, Vector3 } from 'three';
import type { CollisionOwner, EffectProgram, Footprint, WorldPoly } from '@s2u/scene';
import type { GateSpec } from '../gates';
import type { LoadedMap } from '../loadMap';
import type { MapAction } from '../mapActions';
import { under, type MapInitial, type MapInstance } from '../mapMeta';
import { accessShapes, gateShapes, type GuideShapes } from './interactOverlay';
import { groundPolygons, packGround } from '../mover';
import { DOOR_GATE_WIRE_SLOTS } from '../net/codec';
import type { SceneDestructible, SceneProgram } from '../sceneHealth';

/**
 * The layout's placed gates and C4 barriers (the owner, 2026-11-06; a browser adaptation, FG.R2, no original): each a
 * copy of one of a disc map's own access objects -- a placed root (`worldmodel/accessN`) whose destructible's death
 * executes an action (research 174 s3: health -> `EXECUTE_ACTION set_accessN` -> `destroy_accessN`), and on Death Trap and
 * Enowapi a gate's sliding leaf under it with the lever that slides it (research 174 s5, 175 s5.3; `../gates`).
 *
 * A copy brings the object whole -- its nodes (`MapMeta.instances`), the ones zAnim starts off (`initial`: the wreck),
 * its collision (the hull's owners under the root), its drawn props, its destructibles, the actions their deaths
 * execute and those actions' programs, and a gate's spec and lever -- moved by `T(at) Ry(yaw) T(-anchor)` and renamed:
 * the root's node `forge_<kind>_<n>`, its paths under `worldmodel/forge_<kind>_<n>`, its actions' and levers' valves
 * and its programs after it (`renamedProgram`), so a copy keeps its own health, its own valves and its own wreck, and
 * never drives or is driven by the base map's object of the same disc name.
 *
 * A gate's lever is no object of the disc's (its panel is the map's own geometry): the copy's lever action stands at
 * the gate itself (the owner's choice, 2026-11-06), its range and prompt the disc lever's. H424 (b): the owner's to answer;
 * the default meanwhile (FP.R6) -- a placed gate only, so a Forge layout's own Play; a disc map played unchanged keeps
 * its own gates and their own switches.
 */

/** The lever prompt's height above the gate's lowest point, at most (a browser adaptation, FG.R2; H424 (b)). */
export const FORGE_GATE_LEVER_HEIGHT_ADAPTATION = 10;

/** One access object of a library map, with what a copy carries. */
export interface AccessTemplate {
  kind: 'gate' | 'barrier';
  /** The library archive's stem and the root node's name (`access1`): `AccessMarker`'s. */
  source: string;
  name: string;
  /** The placed root's path (`worldmodel/access1`). */
  root: string;
  lib: LoadedMap;
  /** The point a copy stands on: the middle of its collision's footprint, at its lowest. */
  anchor: [number, number, number];
  instances: MapInstance[];
  initial: MapInitial[];
  owners: { owner: CollisionOwner; polys: WorldPoly[] }[];
  pieces: { prop: LoadedMap['props'][number]; index: number }[];
  destructibles: SceneDestructible[];
  /** The actions the deaths execute (the C4 targets' `access_actionN`), with their programs. */
  actions: { action: MapAction; program: SceneProgram | null }[];
  /** A gate: its spec, and each lever's action record. */
  gate: { spec: GateSpec; levers: MapAction[] } | null;
}

/** The names a copy renames: nodes, valves and animations, each disc name to its copy's. */
export interface Renames { nodes: Record<string, string>; valves: Record<string, string>; anims: Record<string, string> }

const pick = (map: Record<string, string>, name: string): string => map[name] ?? map[name.toLowerCase()] ?? name;

/**
 * `program` with the names it holds renamed: its own name, its node references (`nodes`), every valve it tests or sets
 * (a context valve -- the running action's own -- kept), the action an `EXECUTE_ACTION` names (by its valve) and the
 * animations it calls, stops or pauses. A name not in `renames` is kept (a library animation, a node outside the copy).
 */
export function renamedProgram(program: EffectProgram, renames: Renames): EffectProgram {
  const clone = JSON.parse(JSON.stringify(program)) as EffectProgram;
  clone.name = pick(renames.anims, clone.name);
  clone.nodes = clone.nodes.map((n) => pick(renames.nodes, n));
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (!o || typeof o !== 'object') return;
    const r = o as Record<string, unknown>;
    if (typeof r['valve'] === 'string' && r['context'] !== true) r['valve'] = pick(renames.valves, r['valve']);
    if (r['op'] === 'executeAction' && typeof r['anim'] === 'string') r['anim'] = pick(renames.valves, r['anim']);
    else if ((r['op'] === 'call' || r['op'] === 'stopAnimation' || r['op'] === 'pauseAnimation') && typeof r['anim'] === 'string') r['anim'] = pick(renames.anims, r['anim']);
    for (const v of Object.values(r)) if (v && typeof v === 'object') walk(v);
  };
  walk(clone.sequences);
  return clone;
}

/** The valves a program executes actions by (`EXECUTE_ACTION`'s name is the action's valve). */
function executedValves(program: EffectProgram): string[] {
  const out: string[] = [];
  for (const s of program.sequences) for (const op of s.ops) if (op.op === 'executeAction') out.push(op.anim);
  return out;
}

const lastName = (path: string): string => path.split('/').pop()!.split('=')[0]!;

/**
 * The library map's access objects: each placed root carrying a destructible whose death executes an action of the
 * map's, a gate when a gate's leaf lies under it (`LoadedMap.gates`), else a barrier -- those C4 can take and a copy can
 * draw (below).
 */
export function accessTemplates(lib: LoadedMap, source: string): AccessTemplate[] {
  const meta = lib.meta, scene = meta?.scene;
  if (!meta || !scene || !lib.ground) return [];
  const polys = groundPolygons(lib.ground);
  const roots = [...new Set(scene.destructibles.filter((d) => executedValves(d.program).length > 0).map((d) => d.root))];
  return roots.flatMap((root): AccessTemplate[] => {
    const owners = lib.ground!.owners.filter((o) => under(o.path, root)).map((owner) => ({ owner, polys: polys.slice(owner.first, owner.first + owner.count) }));
    if (!owners.length) return [];
    const destructibles = scene.destructibles.filter((d) => under(d.root, root));
    // A C4 target (`SceneHealth.accepts`: a health above 0; a plank reading 0 is a hit trigger, research 174) the copy
    // can draw (props of its own: Desert Glory's wall is the map's geometry).
    if (!destructibles.some((d) => d.health > 0)) return [];
    const valves = new Set(destructibles.flatMap((d) => executedValves(d.program)).map((v) => v.toLowerCase()));
    const actions = meta.actions.filter((a) => valves.has(a.valve.toLowerCase()))
      .map((action) => ({ action, program: scene.programs.find((p) => p.program.name.toLowerCase() === (action.anims[0] ?? '').toLowerCase()) ?? null }));
    const spec = (lib.gates ?? []).find((g) => under(g.path, root)) ?? null;
    const gate = spec ? { spec, levers: spec.levers.map((l) => meta.actions[l.action]!).filter(Boolean) } : null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const { polys: ps } of owners) for (const p of ps) for (let k = 0; k < p.points.length; k += 3) {
      minX = Math.min(minX, p.points[k]!); maxX = Math.max(maxX, p.points[k]!);
      minY = Math.min(minY, p.points[k + 1]!);
      minZ = Math.min(minZ, p.points[k + 2]!); maxZ = Math.max(maxZ, p.points[k + 2]!);
    }
    const pieces: AccessTemplate['pieces'] = [];
    for (const prop of lib.props) (prop.paths ?? []).forEach((p, index) => { if (under(p, root)) pieces.push({ prop, index }); });
    if (!pieces.length) return [];
    return [{
      kind: gate ? 'gate' : 'barrier', source, name: lastName(root), root, lib,
      anchor: [(minX + maxX) / 2, minY, (minZ + maxZ) / 2],
      instances: meta.instances.filter((i) => under(i.path, root)),
      initial: meta.initial.filter((e) => under(e.path, root)),
      owners, pieces, destructibles, actions, gate,
    }];
  });
}

/** The move from the template's anchor to `at`, turned `yaw` radians about y: T(at) Ry(yaw) T(-anchor). */
export function accessMove(t: Pick<AccessTemplate, 'anchor'>, at: readonly number[], yaw: number): Matrix4 {
  return new Matrix4().makeRotationY(yaw).setPosition(at[0]!, at[1]!, at[2]!)
    .multiply(new Matrix4().makeTranslation(-t.anchor[0], -t.anchor[1], -t.anchor[2]));
}

const movedPoint = (m: Matrix4, p: readonly number[]): [number, number, number] => {
  const v = new Vector3(p[0], p[1], p[2]).applyMatrix4(m);
  return [v.x, v.y, v.z];
};
const movedPoints = (m: Matrix4, points: ArrayLike<number>): Float32Array => {
  const out = new Float32Array(points.length);
  const v = new Vector3();
  for (let i = 0; i < points.length; i += 3) {
    v.set(points[i]!, points[i + 1]!, points[i + 2]!).applyMatrix4(m);
    out[i] = v.x; out[i + 1] = v.y; out[i + 2] = v.z;
  }
  return out;
};

/** A placed copy's root node: `forge_gate_<n>` or `forge_barrier_<n>`, numbered in the layout's order of its kind. */
export const placedAccessName = (kind: 'gate' | 'barrier', i: number): string => `forge_${kind}_${i + 1}`;

/** The template's props moved by `m` and renamed beneath `root`, their textures `<archive>/<name>` when `foreign`. */
function copiedProps(t: AccessTemplate, m: Matrix4, rename: (p: string) => string, foreign: boolean): LoadedMap['props'] {
  return t.pieces.map(({ prop, index }) => {
    const world = new Matrix4().fromArray(Array.from(prop.matrices.subarray(index * 16, index * 16 + 16)));
    return {
      modelName: prop.modelName, order: prop.order, alternate: prop.alternate, facade: prop.facade, lod: prop.lod,
      parts: prop.parts.map((part) => (foreign && part.textureName !== null ? { ...part, textureName: `${t.lib.archive}/${part.textureName}` } : part)),
      matrices: Float32Array.from(m.clone().multiply(world).elements),
      paths: [rename(prop.paths![index]!)],
    };
  });
}

/** The template alone, its anchor at the origin: what the editor draws for a placed gate or barrier (`buildWorld`). */
export function accessModelMap(t: AccessTemplate): LoadedMap {
  const m = accessMove(t, [0, 0, 0], 0);
  // The wreck and the debris start off (zAnim's initial state): the editor draws the object whole.
  const off = t.initial.filter((e) => e.deactivate).map((e) => e.path);
  const shown = { ...t, pieces: t.pieces.filter(({ prop, index }) => !off.some((p) => under(prop.paths![index]!, p))) };
  return { ...t.lib, world: [], lines: null, props: copiedProps(shown, m, (p) => p, false).map(({ paths: _p, ...rest }) => rest), doors: [], turrets: [], gates: [] };
}

/** A placed gate or barrier: its template's kind, its source and name, its place and turn (`Layout.gates`/`barriers`). */
export interface AccessMarker { kind: 'gate' | 'barrier'; source: string; name: string; at: readonly number[]; yaw: number }

/**
 * `map` with the layout's gates and barriers beside its own: each its template's copy (above), its nodes, actions,
 * programs and destructibles after the map's (every index the map's own hold kept), its polygons packed into the hull
 * after the map's owners, its gate after the map's gates. One whose template is not found is left out and counted.
 * FP-1a (Codex on #745): a gate rides the snapshot's door tail after the doors (`DOOR_GATE_WIRE_SLOTS`, `../net/codec`);
 * a found gate past it is left out whole and counted (`pastBound`), as `./placedDoors` `withPlacedDoors` counts a door;
 * a barrier takes no slot.
 */
export function withPlacedAccess(map: LoadedMap, placed: readonly AccessMarker[] | undefined,
  templateOf: (m: AccessMarker) => AccessTemplate | null): { map: LoadedMap; unplaced: number; pastBound: number } {
  if (!placed?.length) return { map, unplaced: 0, pastBound: 0 };
  if (!map.ground || !map.meta) return { map, unplaced: placed.length, pastBound: 0 };
  const polys = groundPolygons(map.ground);
  const owners: CollisionOwner[] = map.ground.owners.map((o) => ({ ...o }));
  const props = [...map.props];
  const gates = [...(map.gates ?? [])];
  // The composed metadata's actions (Play's objectives write the layout's bomb sites there first, `./objectives`
  // `applyForgeObjectives`; the room's bomb reads them there, match `BombAuthority.of`), never the base's stale
  // `map.actions`; the copies' after them, and `map.actions` the same list.
  const actions = [...map.meta.actions];
  const instances = [...map.meta.instances];
  const instanceByPath = new Map(map.meta.instanceByPath);
  const initial = [...map.meta.initial];
  const scene = map.meta.scene ?? { destructibles: [], programs: [] };
  const destructibles = [...scene.destructibles];
  const programs = [...scene.programs];
  const textures = { ...map.textures }, textureFlags = { ...map.textureFlags };
  const textureMips = map.textureMips ? { ...map.textureMips } : undefined;
  const counts = { gate: 0, barrier: 0 };
  let unplaced = 0, pastBound = 0;
  const doors = map.doors?.length ?? 0;
  for (const marker of placed) {
    const t = templateOf(marker);
    if (!t || t.kind !== marker.kind) { unplaced++; continue; }
    if (t.gate && doors + gates.length >= DOOR_GATE_WIRE_SLOTS) { pastBound++; continue; }
    const name = placedAccessName(marker.kind, counts[marker.kind]++);
    const rootPath = `worldmodel/${name}`;
    const rename = (p: string): string => (under(p, t.root) ? `${rootPath}${p.slice(t.root.length)}` : p);
    const m = accessMove(t, marker.at, marker.yaw);
    const foreign = t.lib.archive !== map.archive;
    if (foreign) {
      for (const { prop } of t.pieces) for (const part of prop.parts) {
        const tex = part.textureName;
        if (tex === null) continue;
        const key = `${t.lib.archive}/${tex}`;
        if (t.lib.textures[tex]) textures[key] = t.lib.textures[tex]!;
        if (t.lib.textureFlags[tex] !== undefined) textureFlags[key] = t.lib.textureFlags[tex]!;
        if (textureMips && t.lib.textureMips?.[tex]) textureMips[key] = t.lib.textureMips[tex]!;
      }
    }
    // The names this copy renames: its root, its actions' and levers' valves, its programs.
    const renames: Renames = { nodes: { [t.name]: name, [t.name.toLowerCase()]: name }, valves: {}, anims: {} };
    t.actions.forEach(({ action }, k) => {
      renames.valves[action.valve] = renames.valves[action.valve.toLowerCase()] = `${name}_access${k + 1}`;
      for (const anim of action.anims) renames.anims[anim] = renames.anims[anim.toLowerCase()] = `${name}_${anim}`;
    });
    t.gate?.spec.levers.forEach((l, k) => { renames.valves[l.valve] = renames.valves[l.valve.toLowerCase()] = `${name}_lever${k + 1}`; });
    // Its nodes, after the map's, and the ones zAnim starts off.
    const idOf = new Map<number, number>();
    for (const inst of t.instances) {
      const id = instances.length;
      idOf.set(inst.id, id);
      const path = rename(inst.path);
      instances.push({ ...inst, id, path, node: inst.path === t.root ? name : inst.node, root: rename(inst.root) });
      if (!instanceByPath.has(path)) instanceByPath.set(path, id);
    }
    for (const e of t.initial) initial.push({ ...e, path: rename(e.path) });
    // Its collision, after the map's owners: a gate's leaf's owners kept by index for its spec.
    const ownerIndex = new Map<CollisionOwner, number>();
    for (const { owner, polys: own } of t.owners) {
      const { frame: _f, restFrame: _r, ...rest } = owner as CollisionOwner & { restFrame?: unknown };
      const copy: CollisionOwner = { ...rest, path: rename(owner.path), first: polys.length, count: own.length };
      for (const { frame: _pf, ...poly } of own as (WorldPoly & { frame?: unknown })[]) polys.push({ ...poly, path: copy.path, points: movedPoints(m, poly.points) });
      ownerIndex.set(owner, owners.length);
      owners.push(copy);
    }
    props.push(...copiedProps(t, m, rename, foreign));
    // The actions its deaths execute, and their programs, renamed: the C4 target's prompt at its own place, moved.
    for (const { action, program } of t.actions) {
      // Its own path, under the copy's root (its program's nodes still placed in the copy, `placeRefs`' scope), never the
      // root itself: the game takes the action on the aimed node's nearest path (`../mapActions` `actionForNode`), and a
      // type-less one there would shadow a gate's lever on the root.
      actions.push({ ...action, node: `${name}_action`, path: `${rootPath}/${name}_action`, valve: pick(renames.valves, action.valve), anims: action.anims.map((a) => pick(renames.anims, a)), at: movedPoint(m, action.at) });
      if (program) programs.push({ ...program, program: renamedProgram(program.program, renames) });
    }
    // Its destructibles, bound to its own nodes.
    const rootId = instanceByPath.get(rootPath) ?? -1;
    for (const d of t.destructibles) {
      destructibles.push({
        ...d, id: destructibles.length, key: `${d.anim}#${name}@${rename(d.root)}`, instance: idOf.get(d.instance) ?? rootId,
        targetPath: rename(d.targetPath), root: rename(d.root), nodes: d.nodes.map((n) => (n === null ? null : rename(n))),
        program: renamedProgram(d.program, renames),
      });
    }
    // A gate: its leaf's spec after the map's gates, its levers' actions at the gate itself.
    if (t.gate) {
      const g = t.gate.spec;
      const leafOwners = t.owners.map(({ owner }) => owner).filter((o) => under(o.path, g.path));
      const leafIdx = leafOwners.map((o) => ownerIndex.get(o)!);
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const i of leafIdx) { const o = owners[i]!; for (const p of polys.slice(o.first, o.first + o.count)) for (let k = 0; k < p.points.length; k += 3) {
        minX = Math.min(minX, p.points[k]!); maxX = Math.max(maxX, p.points[k]!); minY = Math.min(minY, p.points[k + 1]!); maxY = Math.max(maxY, p.points[k + 1]!);
        minZ = Math.min(minZ, p.points[k + 2]!); maxZ = Math.max(maxZ, p.points[k + 2]!);
      } }
      const parent = Array.from(m.clone().multiply(new Matrix4().fromArray(g.parent)).elements);
      // The open end's footprint too: the parent-space slide carried into the world by the moved parent.
      const shift = new Vector3(...g.open).applyMatrix4(new Matrix4().fromArray(parent).setPosition(0, 0, 0));
      const sweep: Footprint = { minX: Math.min(minX, minX + shift.x), maxX: Math.max(maxX, maxX + shift.x), minZ: Math.min(minZ, minZ + shift.z), maxZ: Math.max(maxZ, maxZ + shift.z) };
      for (const i of leafIdx) owners[i]!.sweep = sweep;
      const at: [number, number, number] = [(minX + maxX) / 2, minY + Math.min(FORGE_GATE_LEVER_HEIGHT_ADAPTATION, (maxY - minY) / 2), (minZ + maxZ) / 2];
      const levers = g.levers.map((l, k) => {
        const disc = t.gate!.levers[k];
        const index = actions.length;
        // The action names the copy's root node: the game picks an action by the node under the reticle or a parent of
        // it (`../mapActions` `actionForNode`, `FUN_005aa240`), and every polygon of the copy lies under its root -- so the
        // gate itself is where its lever is pulled (the disc's lever names its own panel, which a copy has not).
        if (disc) actions.push({ ...disc, node: name, path: rootPath, valve: pick(renames.valves, l.valve), anims: disc.anims.map((a) => pick(renames.anims, a)), at });
        return { action: index, node: name, path: rootPath, valve: pick(renames.valves, l.valve), program: renamedProgram(l.program, renames) };
      });
      gates.push({ ...g, index: gates.length, path: rename(g.path), parent, owners: leafIdx, sweep, levers });
    }
  }
  const ground = packGround(map.ground.grid, polys, owners);
  const meta = { ...map.meta, actions, instances, instanceByPath, initial, scene: { ...scene, destructibles, programs } };
  return {
    map: { ...map, ground, props, gates, actions, meta, textures, textureFlags, ...(textureMips ? { textureMips } : {}) },
    unplaced, pastBound,
  };
}

/**
 * A template's gizmo (`./interactOverlay`; the owner, 2026-11-06), in its library map's world: its C4 prompt's reach and
 * side (`accessShapes`, the death's action's place and range), and a gate's slide and its lever's reach (`gateShapes`)
 * -- the disc lever's own place for the map's own gate (`lever: 'disc'`), the gate itself for a placed copy's (its
 * lever's prompt stands there, `withPlacedAccess`).
 */
export function accessGizmo(t: AccessTemplate, lever: 'disc' | 'atGate'): GuideShapes {
  const segments: number[] = [], triangles: number[] = [];
  const action = t.actions[0]?.action;
  if (action) {
    const s = accessShapes(t.anchor, action.at, action.range > 0 ? action.range : 0);
    segments.push(...s.segments); triangles.push(...s.triangles);
  }
  if (t.gate) {
    const g = t.gate.spec;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const { owner, polys } of t.owners) if (under(owner.path, g.path)) for (const p of polys) for (let k = 0; k < p.points.length; k += 3) {
      minX = Math.min(minX, p.points[k]!); maxX = Math.max(maxX, p.points[k]!); minY = Math.min(minY, p.points[k + 1]!); maxY = Math.max(maxY, p.points[k + 1]!);
      minZ = Math.min(minZ, p.points[k + 2]!); maxZ = Math.max(maxZ, p.points[k + 2]!);
    }
    if (Number.isFinite(minX)) {
      const centre = [(minX + maxX) / 2, minY + Math.min(FORGE_GATE_LEVER_HEIGHT_ADAPTATION, (maxY - minY) / 2), (minZ + maxZ) / 2];
      const slide = new Vector3(...g.open).applyMatrix4(new Matrix4().fromArray(g.parent).setPosition(0, 0, 0));
      const disc = t.gate.levers[0];
      const at = lever === 'disc' && disc ? disc.at : centre;
      const s = gateShapes(centre, [slide.x, slide.y, slide.z], at, disc && disc.range > 0 ? disc.range : 0);
      segments.push(...s.segments); triangles.push(...s.triangles);
    }
  }
  return { segments, triangles };
}

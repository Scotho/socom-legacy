import { forgeObjectPath } from './forgeObjects';
import { Matrix4, Vector3 } from 'three';
import type { CollisionOwner, EffectCondition, EffectOp, EffectProgram, Footprint, WorldPoly } from '@s2u/scene';
import type { PieceTrigger, SwitchScript, SwitchStep, SwitchTarget } from '@s2u/creator-contracts';
import type { GateLeverSpec, GateSpec } from '../gates';
import type { LoadedMap } from '../loadMap';
import type { MapAction } from '../mapActions';
import { under, type MapInitial, type MapInstance } from '../mapMeta';
import { accessShapes, gateShapes, type GuideShapes } from './interactOverlay';
import { groundPolygons, packGround } from '../mover';
import { placeRefs, type SceneDestructible, type SceneProgram } from '../sceneHealth';

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
 * A gate's lever is a separate object on the disc (research 174 s5; measured on MP11 and MP62, 2026-11-08): the SWITCH
 * record's node `epanel_diN` -- one collision polygon, a 5 x 5.6 plate, nothing drawn -- and `lever_N`, a `gateswitch`
 * prop (its base and its `gatehand`), the plate centred on the lever. A placed gate brings none (the owner, 2026-11-08:
 * C4 or an RPG alone opens it, as the original's gate itself has no prompt; was: the lever's action at the gate itself,
 * the owner's 2026-11-06 choice); a placed switch (`SwitchMarker`) is a copy of its gate's own disc lever, plate and
 * prop, running that gate's own lever program renamed onto the copies.
 */

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
  /** A gate: its spec, each lever's action record, and each lever's parts to copy as a switch. */
  gate: { spec: GateSpec; levers: MapAction[]; switches: SwitchPart[] } | null;
}

/** One disc lever of a gate, what a placed switch copies (research 174 s5). */
export interface SwitchPart {
  /** The SWITCH record (`epanel_diN`): its range, prompt and valve. */
  action: MapAction;
  /** Its program as the gate's spec holds it (`GateSpec.levers[k]`), and as the set holds it (its references' scope). */
  lever: GateLeverSpec;
  scene: SceneProgram | null;
  /** The handle's placed root (`worldmodel/lever_N`), its program's root reference placed (`placeRefs`). */
  handle: string;
  /** The plate: the collision under the record's node. */
  plate: { owner: CollisionOwner; polys: WorldPoly[] }[];
  /** The handle's props (`gateswitch`'s base and hand). */
  pieces: { prop: LoadedMap['props'][number]; index: number }[];
  /** The handle's and the plate's nodes. */
  instances: MapInstance[];
  /** The point a copy stands on: the handle's origin. */
  anchor: [number, number, number];
}

/**
 * A placed switch as `withPlacedAccess` takes it: its gate's place among the placed gates, or a base map's action by its
 * valve (`action`; neither, it drives nothing).
 */
export interface SwitchPlacement {
  gate?: number; action?: string; at: readonly number[]; yaw: number;
  /** Its look (`SwitchLookId`; absent, the lever panel) and its record's own fields (absent, its action's). */
  look?: SwitchLookId; prompt?: string; range?: number; elevation?: number; points?: number;
  /** The prop it is used on (`SwitchMarker.piece` / `node`): a prop of the layout's, or a map node's path; absent, its look. */
  piece?: number;
  node?: string;
  /** Its script (`SwitchScript`, `scriptPrograms`): what a pull runs instead of a gate or a map action. */
  script?: SwitchScript;
}

/**
 * What a switch looks like (the owner, 2026-11-08; a browser adaptation, FG.R2): a disc object copied whole as its
 * body -- its props and its collision (the pick lands on it) -- with the record it carries on the disc, whose prompt a
 * switch takes where its action has none (a barrier's death action carries none). `lever`: a gate's lever panel (Death
 * Trap's `lever_N` `gateswitch` and its `epanel_diN` plate); `radio`: Sujo's airstrike radio (`radio_portable`, its
 * body's collision and its two plates, measured 2026-11-08); `plate`: the lever's plate alone, nothing drawn.
 */
export type SwitchLookId = 'lever' | 'radio' | 'plate';
export interface SwitchLook {
  lib: LoadedMap;
  pieces: { prop: LoadedMap['props'][number]; index: number }[];
  owners: { owner: CollisionOwner; polys: WorldPoly[] }[];
  instances: MapInstance[];
  /** The point a copy stands on. */
  anchor: [number, number, number];
  /** Each placed path's prefix and what follows the switch's root in its place ('' the root itself). */
  prefixes: readonly (readonly [string, string])[];
  /** The record it carries on the disc: its prompt, reach and place. */
  record: MapAction;
}

/**
 * LEVER_MOUNT_HEIGHT_READING (the owner, 2026-11-10: "by default it is impossible for a player to see the prompt"): how
 * far above the floor a placed lever's handle stands -- Death Trap's `lever_2` over its floor, measured off the disc
 * (2026-11-10; its `lever_1` stands 52.7 on a raised ledge, Enowapi's 6 and 8.4). The lever's pick plate (`epanel_diN`'s
 * one polygon, 5.3 by 5.6 round the handle) is what the use prompt's ray must strike: anchored at the handle, a placed
 * lever stood with its plate half under the floor.
 */
export const LEVER_MOUNT_HEIGHT_READING = 12.7;

/**
 * A Forge switch's reach where it runs no map action of its own (a script, a gate's lever, a look's record): Sujo's and
 * Enowapi's airstrike radios' `range` 30 (`actions.rdr`, research 174) -- the disc's lever records' 15 is measured from
 * the plate on a wall, too near for a switch stood in the open (the owner, 2026-11-10). Its own `range` overrides it.
 */
export const FORGE_SWITCH_REACH = 30;

/** A gate's lever as a look: its handle's props and its plate, the handle `LEVER_MOUNT_HEIGHT_READING` above where it stands; `plateOnly`, the plate alone. */
export function leverLook(part: SwitchPart, lib: LoadedMap, plateOnly = false): SwitchLook {
  return {
    lib, pieces: plateOnly ? [] : part.pieces, owners: part.plate,
    instances: plateOnly ? part.instances.filter((i) => under(i.path, part.action.path)) : part.instances,
    anchor: [part.anchor[0], part.anchor[1] - LEVER_MOUNT_HEIGHT_READING, part.anchor[2]], prefixes: [[part.handle, ''], [part.action.path, '/panel_di']], record: part.action,
  };
}

/**
 * A map's airstrike radio as a look: the SWITCH whose prompt is `action_helo.tif` (Sujo's and Enowapi's `radio_call_N`,
 * research 174) and its placed object whole -- the world model's child it lies under (`worldmodel/radio_strike`), its
 * props and its collision; standing on its collision's lowest point under the prop. Null on a map with none, or one whose
 * radio has no props (Sandstorm's, part of a destructible building, is not taken: its root holds the whole building).
 */
export function radioLook(lib: LoadedMap): SwitchLook | null {
  const meta = lib.meta;
  if (!meta || !lib.ground) return null;
  const record = meta.actions.find((a) => a.typeCode === 2 && a.bitmap === 'action_helo.tif' && a.path.split('/').length > 2);
  if (!record) return null;
  const root = record.path.split('/').slice(0, 2).join('/');
  if ((meta.scene?.destructibles ?? []).some((d) => under(d.root, root) || under(root, d.root))) return null;
  const polys = groundPolygons(lib.ground);
  const owners = lib.ground.owners.filter((o) => under(o.path, root)).map((owner) => ({ owner, polys: polys.slice(owner.first, owner.first + owner.count) }));
  const pieces: SwitchLook['pieces'] = [];
  for (const prop of lib.props) (prop.paths ?? []).forEach((p, index) => { if (under(p, root)) pieces.push({ prop, index }); });
  const first = pieces[0];
  if (!first || !owners.length) return null;
  let minY = Infinity;
  for (const { polys: ps } of owners) for (const q of ps) for (let k = 1; k < q.points.length; k += 3) minY = Math.min(minY, q.points[k]!);
  const at = first.index * 16;
  return {
    lib, pieces, owners, instances: meta.instances.filter((i) => under(i.path, root)),
    anchor: [first.prop.matrices[at + 12]!, minY, first.prop.matrices[at + 14]!], prefixes: [[root, '']], record,
  };
}

/** A look alone, its anchor at the origin: what the editor draws for a placed switch (`buildWorld`). */
export function lookModelMap(look: SwitchLook): LoadedMap {
  const m = accessMove({ anchor: look.anchor }, [0, 0, 0], 0);
  return { ...look.lib, world: [], lines: null, props: copiedPieces(look.lib, look.pieces, m, (p) => p, false).map(({ paths: _p, ...rest }) => rest), doors: [], turrets: [], gates: [] };
}

/** What a script's targets and actions resolve to where it is composed (`withPlacedAccess`). */
export interface ScriptResolve {
  /** A target's placed path (a map node's own, a piece's owner, a damage trigger's or a gate's copy root); null, not here. */
  target(t: SwitchTarget): string | null;
  /** A damage trigger's death action's valve (its copy's); null, not here. */
  barrierValve(i: number): string | null;
  /** A base map action's valve as the map spells it; null, not here. */
  action(valve: string): string | null;
}

/**
 * `map` with each of the layout's pieces a placed node (the owner, 2026-11-08; a browser adaptation, FG.R2): its owner
 * path (`forge/piece_<n>`, the hull's and its drawn placements' name) an instance of its own after the map's, so a
 * switch's script that hides or shows it reaches every page on the room's wire (MAP-03 carries instances only).
 */
export function withPieceInstances(map: LoadedMap, owners: readonly string[]): LoadedMap {
  if (!map.meta || !owners.length) return map;
  const instances = [...map.meta.instances];
  const instanceByPath = new Map(map.meta.instanceByPath);
  for (const path of owners) {
    if (instanceByPath.has(path)) continue;
    const id = instances.length;
    instances.push({ id, path, node: path.split('/').pop()!, modelName: 'forge', root: path });
    instanceByPath.set(path, id);
  }
  return { ...map, meta: { ...map.meta, instances, instanceByPath } };
}

/**
 * A script blast's round (FORGE_SCRIPT_BLAST_ADAPTATION): MPBOMB's, the one ZWEAPON record with no muzzle velocity and
 * no model -- the one a program fires in place (Demolition's `base_explosion1`); Explosion_Damage 50, Explosion_Radius
 * 300 u, its look the `satchel` effect.
 */
export const SCRIPT_BLAST_WEAPON = 'MPBOMB';
export const SCRIPT_BLAST_AMMO = 'MPBOMB Ammo';
export const SCRIPT_BLAST_DAMAGE = 50;
export const SCRIPT_BLAST_RADIUS = 300;

/** A script flag's valve: one namespace, shared by every switch of the layout (a power switch's flag read by another's `if`). */
export const scriptFlagValve = (flag: string): string => `forge_flag_${flag}`;

/**
 * A switch's script as programs (the owner, 2026-11-08; a browser adaptation, FG.R2, of the original's own commands --
 * `@s2u/scene` `EffectOp`): one sequence started with the animation, its references the switch's own path (its root, so
 * a sound or an effect with no place of its own is at the switch) and each target's placed path (`placeRefs`' path
 * references, `FORGE_PATH_REF_ADAPTATION`). An effect at a target is a program of its own rooted there, called (`call`
 * plays a common effect at the calling program's root, COMMON_EFFECT_CALL_READING). A toggle (`second`) tests its own
 * valve (the context's, as the disc's lever programs do): 0 runs `steps` and sets 1, else `second` and sets 0. A step
 * whose object or action is not here is left out.
 */
export function scriptPrograms(name: string, path: string, script: SwitchScript, r: ScriptResolve): { main: EffectProgram; extra: EffectProgram[] } {
  const nodes = ['NA', path];
  const extra: EffectProgram[] = [];
  const node = (p: string): number => { const i = nodes.indexOf(p); if (i >= 0) return i; nodes.push(p); return nodes.length - 1; };
  const flagTest = (flag: string, equals: number): EffectCondition => ({ kind: 'valve', valve: scriptFlagValve(flag), operation: 2, operand: equals });
  const compile = (steps: readonly SwitchStep[]): EffectOp[] => steps.flatMap((st): EffectOp[] => {
    switch (st.do) {
      case 'run': {
        const valve = 'action' in st ? r.action(st.action) : r.barrierValve(st.barrier);
        return valve ? [{ op: 'executeAction', anim: valve }] : [];
      }
      case 'show': case 'hide': {
        const p = r.target(st.target);
        return p ? [{ op: 'active', node: node(p), on: st.do === 'show' }] : [];
      }
      case 'wait': return [{ op: 'wait', seconds: st.seconds, range: 0, frames: null }];
      case 'message': return [{ op: 'message', text: st.text, locId: null, scale: 1 }];
      case 'sound': {
        const p = st.at ? r.target(st.at) : path;
        return p ? [{ op: 'sound', sound: st.name, node: node(p), volume: 1, newPlay: true }] : [];
      }
      case 'effect': {
        if (!st.at) return [{ op: 'call', anim: st.name }];
        const p = r.target(st.at);
        if (!p) return [];
        const fx = `${name}_fx${extra.length + 1}`;
        extra.push({ name: fx, root: 1, flags: 0, nodes: ['NA', p], sequences: [{ name: 'run', activation: 1, ops: [{ op: 'call', anim: st.name }] }] });
        return [{ op: 'call', anim: fx }];
      }
      case 'set': return [{ op: 'valve', valve: scriptFlagValve(st.flag), operation: 0x0b, operand: st.value }];
      // MPBOMB's round at the target (else the script's own root), fired as Crossroads' bridges and Demolition's
      // `base_explosion1` fire it (f1 0.001 and f2 0.01, the round's fuse and second timer: research 332 s0, s7), the
      // record's own numbers, marked a Forge script's (`EffectOp.forge`: the round the world runner hands on).
      case 'blast': {
        const p = st.at ? r.target(st.at) : path;
        if (!p) return [];
        return [{ op: 'fireWeapon', weapon: SCRIPT_BLAST_WEAPON, ammo: SCRIPT_BLAST_AMMO, node: node(p), f1: 0.001, f2: 0.01, forge: true }];
      }
      case 'if': return [{ op: 'if', conditions: [flagTest(st.flag, st.equals)] }];
      case 'else': return [{ op: 'else' }];
      case 'end': return [{ op: 'endif' }];
      default: return [];
    }
  });
  const ops: EffectOp[] = compile(script.steps);
  return { main: { name: `${name}_run`, root: 1, flags: 0, nodes, sequences: [{ name: 'run', activation: 1, ops }] }, extra };
}

/**
 * The base map's actions a switch may run (the owner, 2026-11-08): each with a valve and a program of the map's set --
 * a SWITCH (Crossroads' call strikes, Sujo's radios) or a type-less one a death executes (a barrier's, a plank's) --
 * but a door's and a plant site's (their own systems: `../doors`, the bomb) and a gate's lever (its own: `../gates`
 * `GateSet`, which a plain run would not move). By valve, once each, in the map's order.
 */
export function mapActionTargets(map: Pick<LoadedMap, 'meta' | 'gates'>): MapAction[] {
  const meta = map.meta;
  if (!meta?.scene) return [];
  const levers = new Set((map.gates ?? []).flatMap((g) => g.levers.map((l) => l.action)));
  const programs = new Set(meta.scene.programs.map((p) => p.program.name.toLowerCase()));
  const seen = new Set<string>();
  return meta.actions.filter((a, i) => {
    const v = a.valve.toLowerCase();
    if (!v || seen.has(v) || levers.has(i) || a.typeCode === 0 || a.typeCode === 4) return false;
    if (!programs.has((a.anims[0] ?? '').toLowerCase())) return false;
    seen.add(v);
    return true;
  });
}

/**
 * A map-action switch's program (the owner, 2026-11-08; a browser adaptation, FG.R2, of the original's own command): one
 * sequence, started with the animation (activation 1, `../effectRunner`), of one `EXECUTE_ACTION` naming the target's
 * valve -- the command a destructible's death runs (research 174 s3: `EXECUTE_ACTION set_access1`), so the target runs
 * its own program at its own node with its own valve, refused while it runs or once used (`WorldState.executeAction`).
 */
export function mapActionProgram(name: string, valve: string): EffectProgram {
  return { name, root: 0, flags: 0, nodes: ['NA'], sequences: [{ name: 'run', activation: 1, ops: [{ op: 'executeAction', anim: valve }] }] };
}

/** A gate's disc levers as switches: each lever's record, program, handle, plate and props. None missing a part. */
function switchParts(lib: LoadedMap, spec: GateSpec, polys: readonly WorldPoly[]): SwitchPart[] {
  const meta = lib.meta!, scene = meta.scene!;
  return spec.levers.flatMap((lever): SwitchPart[] => {
    const action = meta.actions[lever.action];
    if (!action) return [];
    const sp = scene.programs.find((p) => p.program.name.toLowerCase() === lever.program.name.toLowerCase()) ?? null;
    const placedRefs = sp ? placeRefs(meta, sp.program.nodes, sp.search, sp.program.root, action.path, sp.parents) : [];
    const handle = placedRefs[lever.program.root] ?? null;
    if (!handle) return [];
    const plate = lib.ground!.owners.filter((o) => under(o.path, action.path)).map((owner) => ({ owner, polys: polys.slice(owner.first, owner.first + owner.count) }));
    const pieces: SwitchPart['pieces'] = [];
    for (const prop of lib.props) (prop.paths ?? []).forEach((p, index) => { if (under(p, handle)) pieces.push({ prop, index }); });
    const first = pieces[0];
    if (!plate.length || !first) return [];
    const at = first.index * 16;
    const anchor: [number, number, number] = [first.prop.matrices[at + 12]!, first.prop.matrices[at + 13]!, first.prop.matrices[at + 14]!];
    const instances = meta.instances.filter((i) => under(i.path, handle) || under(i.path, action.path));
    return [{ action, lever, scene: sp, handle, plate, pieces, instances, anchor }];
  });
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

/**
 * The library's programs a template's deaths and actions call, stop or pause, at any depth (`CALL_ANIMATION`,
 * `STOP_ANIMATION`, `PAUSE_ANIMATION`), but its actions' own (copied with them): what a copy carries beside them.
 */
export function calledOf(t: Pick<AccessTemplate, 'lib' | 'destructibles' | 'actions'>, renames: Pick<Renames, 'anims'>): SceneProgram[] {
  const set = new Map((t.lib.meta?.scene?.programs ?? []).map((p) => [p.program.name.toLowerCase(), p]));
  const out = new Map<string, SceneProgram>();
  const queue: EffectProgram[] = [...t.destructibles.map((d) => d.program), ...t.actions.flatMap((a) => (a.program ? [a.program.program] : []))];
  while (queue.length) {
    const p = queue.pop()!;
    for (const s of p.sequences) for (const op of s.ops) {
      if (op.op !== 'call' && op.op !== 'stopAnimation' && op.op !== 'pauseAnimation') continue;
      const key = (op as { anim: string }).anim.toLowerCase();
      const sp = set.get(key);
      if (!sp || out.has(key) || renames.anims[key] !== undefined) continue;
      out.set(key, sp);
      queue.push(sp.program);
    }
  }
  return [...out.values()];
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
  // Every destructible's root (the owner, 2026-11-10: "every trigger from every map"): was only those whose death
  // executes a map action, which left out a truck that only blows up or a plank that only breaks (Desert Glory's). A
  // root under another's is that one's part, kept once at the outermost.
  const all = [...new Set(scene.destructibles.map((d) => d.root))];
  const roots = all.filter((r) => !all.some((o) => o !== r && under(r, o)));
  return roots.flatMap((root): AccessTemplate[] => {
    const owners = lib.ground!.owners.filter((o) => under(o.path, root)).map((owner) => ({ owner, polys: polys.slice(owner.first, owner.first + owner.count) }));
    if (!owners.length) return [];
    const destructibles = scene.destructibles.filter((d) => under(d.root, root));
    // A copy needs props of its own to draw (Desert Glory's wall is the map's geometry, below). Its destructibles may be
    // C4 targets (`SceneHealth.accepts`: a health above 0) or hit triggers (health 0, any delivered hit runs the death:
    // `FUN_00273a50` D:L120978-121059; Fish Hook's and Sandstorm's planks, research 174, 175 s5.4) -- the owner,
    // 2026-11-07, both placeable as damage triggers (`accessTriggerOf`); was: hit triggers left out.
    const valves = new Set(destructibles.flatMap((d) => executedValves(d.program)).map((v) => v.toLowerCase()));
    const actions = meta.actions.filter((a) => valves.has(a.valve.toLowerCase()))
      .map((action) => ({ action, program: scene.programs.find((p) => p.program.name.toLowerCase() === (action.anims[0] ?? '').toLowerCase()) ?? null }));
    const spec = (lib.gates ?? []).find((g) => under(g.path, root)) ?? null;
    const gate = spec ? { spec, levers: spec.levers.map((l) => meta.actions[l.action]!).filter(Boolean), switches: switchParts(lib, spec, polys) } : null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const { polys: ps } of owners) for (const p of ps) for (let k = 0; k < p.points.length; k += 3) {
      minX = Math.min(minX, p.points[k]!); maxX = Math.max(maxX, p.points[k]!);
      minY = Math.min(minY, p.points[k + 1]!);
      minZ = Math.min(minZ, p.points[k + 2]!); maxZ = Math.max(maxZ, p.points[k + 2]!);
    }
    const pieces: AccessTemplate['pieces'] = [];
    for (const prop of lib.props) (prop.paths ?? []).forEach((p, index) => { if (under(p, root)) pieces.push({ prop, index }); });
    // Its drawing where it is the map's own geometry (Desert Glory's wall): the world chunks under it, kept apart by their
    // node (`LoadedMesh.switchPath`, as the world's state shows and hides them), each a piece in world space.
    pieces.push(...worldPiecesUnder(lib, root));
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

const IDENTITY_16 = Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/**
 * The world chunks drawn under `root` (`LoadedMesh.switchPath`: a chunk under a path the map's zAnim references, which
 * a destructible's program does), as pieces a copy draws as it draws a prop's: one per node and state (`alternate`, the
 * wreck), its parts the chunks, its one placement the identity (the chunks are in world space already), its path the
 * node -- so `copiedPieces` moves and renames it, and the world's state shows and hides it, as a prop's.
 */
export function worldPiecesUnder(lib: Pick<LoadedMap, 'world'>, root: string): AccessTemplate['pieces'] {
  const groups = new Map<string, LoadedMap['world']>();
  for (const mesh of lib.world) {
    const path = mesh.switchPath;
    if (!path || !under(path, root)) continue;
    const key = `${path}\u0000${mesh.alternate ? 1 : 0}`;
    const list = groups.get(key) ?? [];
    list.push(mesh);
    groups.set(key, list);
  }
  return [...groups.values()].map((parts) => ({
    prop: {
      modelName: `${lastName(parts[0]!.switchPath!)} (map geometry)`, parts, matrices: IDENTITY_16.slice(),
      order: Math.min(...parts.map((p) => p.order)), alternate: parts[0]!.alternate, facade: 0, lod: null, paths: [parts[0]!.switchPath!],
    },
    index: 0,
  }));
}

/** What sets an access object off: C4 or damage where a destructible's health is above 0, else any hit (never C4). */
export function accessTriggerOf(t: Pick<AccessTemplate, 'destructibles'>): 'c4' | 'hit' {
  return t.destructibles.some((d) => d.health > 0) ? 'c4' : 'hit';
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
  return copiedPieces(t.lib, t.pieces, m, rename, foreign);
}

/** `pieces` of `lib` moved by `m` and renamed, their textures `<archive>/<name>` when `foreign`. */
function copiedPieces(lib: LoadedMap, pieces: readonly { prop: LoadedMap['props'][number]; index: number }[], m: Matrix4, rename: (p: string) => string, foreign: boolean): LoadedMap['props'] {
  return pieces.map(({ prop, index }) => {
    const world = new Matrix4().fromArray(Array.from(prop.matrices.subarray(index * 16, index * 16 + 16)));
    return {
      modelName: prop.modelName, order: prop.order, alternate: prop.alternate, facade: prop.facade, lod: prop.lod,
      parts: prop.parts.map((part) => (foreign && part.textureName !== null ? { ...part, textureName: `${lib.archive}/${part.textureName}` } : part)),
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

/**
 * A gate's switch alone, its handle's origin at the origin: what the editor draws for a placed switch (`buildWorld`) --
 * the gate's first disc lever's `gateswitch` props. Null for a gate with no lever to copy.
 */
export function switchModelMap(t: AccessTemplate): LoadedMap | null {
  const part = t.gate?.switches[0];
  if (!part) return null;
  const m = accessMove({ anchor: part.anchor }, [0, 0, 0], 0);
  return { ...t.lib, world: [], lines: null, props: copiedProps({ ...t, pieces: part.pieces }, m, (p) => p, false).map(({ paths: _p, ...rest }) => rest), doors: [], turrets: [], gates: [] };
}

/** A placed gate or barrier: its template's kind, its source and name, its place and turn (`Layout.gates`/`barriers`). */
export interface AccessMarker { kind: 'gate' | 'barrier'; source: string; name: string; at: readonly number[]; yaw: number }

/**
 * `map` with the layout's gates and barriers beside its own: each its template's copy (above), its nodes, actions,
 * programs and destructibles after the map's (every index the map's own hold kept), its polygons packed into the hull
 * after the map's owners, its gate after the map's gates. One whose template is not found is left out and counted.
 */
export function withPlacedAccess(map: LoadedMap, placed: readonly AccessMarker[] | undefined,
  templateOf: (m: AccessMarker) => AccessTemplate | null, switches: readonly SwitchPlacement[] = [],
  lookOf: (id: SwitchLookId) => SwitchLook | null = () => null,
  pieceOwner: (i: number) => string | null = (i) => `forge/piece_${i}`, triggers: readonly PieceTrigger[] = []): { map: LoadedMap; unplaced: number } {
  if (!placed?.length && !switches.length && !triggers.length) return { map, unplaced: 0 };
  if (!map.ground || !map.meta) return { map, unplaced: (placed?.length ?? 0) + switches.length + triggers.length };
  const polys = groundPolygons(map.ground);
  const owners: CollisionOwner[] = map.ground.owners.map((o) => ({ ...o }));
  const props = [...map.props];
  const gates = [...(map.gates ?? [])];
  const actions = [...(map.actions ?? map.meta.actions)];
  const instances = [...map.meta.instances];
  const instanceByPath = new Map(map.meta.instanceByPath);
  const initial = [...map.meta.initial];
  const scene = map.meta.scene ?? { destructibles: [], programs: [] };
  const destructibles = [...scene.destructibles];
  const programs = [...scene.programs];
  const textures = { ...map.textures }, textureFlags = { ...map.textureFlags };
  const textureMips = map.textureMips ? { ...map.textureMips } : undefined;
  const counts = { gate: 0, barrier: 0 };
  /** Each placed gate in its order: its copy's name, its template, its renames and its spec's index in `gates`. */
  const placedGates: ({ name: string; t: AccessTemplate; renames: Renames; spec: number } | null)[] = [];
  /** Each placed damage trigger in its order: its copy's name and its death action's valve (a script's `run barrier`). */
  const placedBarriers: ({ name: string; valve: string | null } | null)[] = [];
  let unplaced = 0;
  /** A template's textures, under `<archive>/<name>` for a foreign library's (as the props are drawn). */
  const takeTexturesOf = (lib: LoadedMap, pieces: readonly { prop: LoadedMap['props'][number] }[]): void => {
    if (lib.archive === map.archive) return;
    for (const { prop } of pieces) for (const part of prop.parts) {
      const tex = part.textureName;
      if (tex === null) continue;
      const key = `${lib.archive}/${tex}`;
      if (lib.textures[tex]) textures[key] = lib.textures[tex]!;
      if (lib.textureFlags[tex] !== undefined) textureFlags[key] = lib.textureFlags[tex]!;
      if (textureMips && lib.textureMips?.[tex]) textureMips[key] = lib.textureMips[tex]!;
    }
  };
  for (const marker of placed ?? []) {
    const t = templateOf(marker);
    if (!t || t.kind !== marker.kind) { unplaced++; (marker.kind === 'gate' ? placedGates : placedBarriers).push(null); continue; }
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
    // The programs its deaths and actions call, stop or pause that its library's set holds (a truck's fire, a plank's
    // splinters: `calledOf`), renamed onto the copy -- so a copy from another map runs its own, not a base program of the
    // same name or none (the owner, 2026-11-10: "properly run its logic/sound/animation").
    const called = calledOf(t, renames);
    for (const sp of called) renames.anims[sp.program.name] = renames.anims[sp.program.name.toLowerCase()] = `${name}_${sp.program.name}`;
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
    for (const sp of called) programs.push({ ...sp, program: renamedProgram(sp.program, renames) });
    // A script's wreck of it (FORGE_SCRIPT_WRECK_ADAPTATION, `../sceneHealth` `wreck`): its outermost records' death,
    // whether or not that death executes an action (a truck that only blows up has none).
    const wreck = `${name}_wreck`;
    if (marker.kind === 'barrier') placedBarriers.push({ name, valve: wreck });
    // Its destructibles, bound to its own nodes.
    const rootId = instanceByPath.get(rootPath) ?? -1;
    for (const d of t.destructibles) {
      destructibles.push({
        ...d, id: destructibles.length, key: `${d.anim}#${name}@${rename(d.root)}`, instance: idOf.get(d.instance) ?? rootId,
        targetPath: rename(d.targetPath), root: rename(d.root), nodes: d.nodes.map((n) => (n === null ? null : rename(n))),
        program: renamedProgram(d.program, renames), ...(marker.kind === 'barrier' && d.root === t.root ? { wreck } : {}),
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
      const at: [number, number, number] = [(minX + maxX) / 2, minY + Math.min(10, (maxY - minY) / 2), (minZ + maxZ) / 2];
      void at;
      // No lever of its own (the owner, 2026-11-08): the disc's gate itself has no prompt -- its levers are panels apart
      // (research 174 s5) -- so a copy opens only by a placed switch (below) and is otherwise C4's or an RPG's.
      placedGates.push({ name, t, renames, spec: gates.length });
      gates.push({ ...g, index: gates.length, path: rename(g.path), parent, owners: leafIdx, sweep, levers: [] });
    }
  }
  // The switches: each a copy of its look (`SwitchLook`: a gate's lever panel, Sujo's radio, or the lever's plate alone)
  // -- its collision and its props, moved by T(at) Ry(yaw) T(-anchor) and renamed under `forge_switch_<n>` -- and a
  // SWITCH record on the copy's root (its collision lies under it, so the pick finds it: `../mapActions`
  // `actionForNode`). A gate's switch runs that gate's own lever program renamed onto the copies (the handle, the gate's
  // root, its valves); a map action's runs `mapActionProgram` on the action of that valve the map already holds (case
  // aside, as `WorldState.executeAction` finds it). The record's prompt, reach, height reach and points are the switch's
  // own where it sets them, else its action's own record's (a map action's, a gate lever's). One with neither a gate nor
  // a target here, or no look, is left out.
  const baseActions = [...actions];
  switches.forEach((sw, n) => {
    const g = sw.gate === undefined ? null : placedGates[sw.gate] ?? null;
    const part = g?.t.gate?.switches[0] ?? null;
    const target = sw.action !== undefined && !g ? baseActions.find((a) => a.valve.toLowerCase() === sw.action!.toLowerCase()) ?? null : null;
    // A gate's own lever when it asks for the lever panel; else the look asked for (the lever: `lookOf`'s default).
    const look = sw.look === undefined && part && g ? leverLook(part, g.t.lib) : lookOf(sw.look ?? 'lever');
    const scripted = !g && !target && sw.script !== undefined;
    if (!look || (g ? !part : !target && !scripted)) { unplaced++; return; }
    const sname = `forge_switch_${n + 1}`;
    // FORGE_SWITCH_PROP_ADAPTATION (the owner, 2026-11-10: "have a custom prop as an option"): on a prop -- a layout's
    // (`pieceOwner`, a placed node: `withPieceInstances`) or a map object's -- its record sits on that prop's own path, so
    // the use prompt's ray striking the prop finds it (`../mapActions` `actionForNode`: the struck node or a parent); no
    // look is copied. A prop with no collision is never struck, and one with a map action of its own already is not taken.
    const linked = sw.node !== undefined || sw.piece !== undefined;
    const linkPath = sw.node ?? (sw.piece !== undefined ? pieceOwner(sw.piece) : null);
    if (linked && (linkPath === null || !owners.some((o) => under(o.path, linkPath))
      || baseActions.some((a) => under(a.path, linkPath) || under(linkPath, a.path)))) { unplaced++; return; }
    const rootPath = linked ? linkPath! : `worldmodel/${sname}`;
    if (linked && !instanceByPath.has(rootPath)) {
      const id = instances.length;
      instances.push({ id, path: rootPath, node: rootPath.split('/').pop()!, modelName: 'forge', root: rootPath });
      instanceByPath.set(rootPath, id);
    }
    const renameSw = (p: string): string => {
      for (const [from, to] of look.prefixes) if (under(p, from)) return `${rootPath}${to}${p.slice(from.length)}`;
      return p;
    };
    const m = accessMove({ anchor: look.anchor }, sw.at, sw.yaw);
    if (!linked) takeTexturesOf(look.lib, look.pieces);
    for (const inst of linked ? [] : look.instances) {
      const id = instances.length;
      const path = renameSw(inst.path);
      const top = look.prefixes.find(([from]) => inst.path === from);
      instances.push({ ...inst, id, path, node: top ? (top[1] ? top[1].split('/').pop()! : sname) : inst.node, root: renameSw(inst.root) });
      if (!instanceByPath.has(path)) instanceByPath.set(path, id);
    }
    for (const { owner, polys: own } of linked ? [] : look.owners) {
      const { frame: _f, restFrame: _r, ...rest } = owner as CollisionOwner & { restFrame?: unknown };
      const copy: CollisionOwner = { ...rest, path: renameSw(owner.path), first: polys.length, count: own.length };
      for (const { frame: _pf, ...poly } of own as (WorldPoly & { frame?: unknown })[]) polys.push({ ...poly, path: copy.path, points: movedPoints(m, poly.points) });
      owners.push(copy);
    }
    if (!linked) props.push(...copiedPieces(look.lib, look.pieces, m, renameSw, look.lib.archive !== map.archive));
    // A prop's record stands at its collision's middle (where its prompt is aimed); the look's at the look's record's place.
    const linkedAt = (): [number, number, number] => {
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (const o of owners) if (under(o.path, rootPath)) for (const q of polys.slice(o.first, o.first + o.count)) for (let k = 0; k < q.points.length; k += 3)
        for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a]!, q.points[k + a]!); hi[a] = Math.max(hi[a]!, q.points[k + a]!); }
      return [(lo[0]! + hi[0]!) / 2, (lo[1]! + hi[1]!) / 2, (lo[2]! + hi[2]!) / 2];
    };
    const valve = `${sname}_valve`;
    // Its record: the action's own (a map action's, else the gate lever's), its prompt the look's where that has none,
    // the switch's own fields over them; on the copy's root, at the look's own record's place.
    const own = target ?? part?.action ?? look.record;
    const record: MapAction = {
      ...own, type: 'SWITCH', typeCode: 2, node: linked ? rootPath.split('/').pop()! : sname, path: rootPath, valve,
      bitmap: sw.prompt ?? (own.bitmap || look.record.bitmap), range: sw.range ?? (target ? own.range : FORGE_SWITCH_REACH), elevation: sw.elevation ?? own.elevation,
      points: sw.points ?? own.points, at: linked ? linkedAt() : movedPoint(m, look.record.at), anims: [],
    };
    if (scripted) {
      // A script's: its steps made programs (`scriptPrograms`), its targets the copies' own names where this map holds them.
      const resolve: ScriptResolve = {
        target: (tg) => ('map' in tg ? tg.map : 'piece' in tg ? pieceOwner(tg.piece)
          : 'barrier' in tg ? (placedBarriers[tg.barrier] ? `worldmodel/${placedBarriers[tg.barrier]!.name}` : null)
          : 'object' in tg ? forgeObjectPath(tg.object)   // a Forge object's place (`./forgeObjects`)
          : placedGates[tg.gate] ? `worldmodel/${placedGates[tg.gate]!.name}` : null),
        barrierValve: (i) => placedBarriers[i]?.valve ?? null,
        action: (v) => baseActions.find((a) => a.valve.toLowerCase() === v.toLowerCase())?.valve ?? null,
      };
      const { main, extra } = scriptPrograms(sname, rootPath, sw.script!, resolve);
      actions.push({ ...record, anims: [main.name] });
      for (const p of [main, ...extra]) programs.push({ program: p, search: p.nodes.map(() => 0) });
      return;
    }
    if (!g) {
      const program = mapActionProgram(`${sname}_run`, target!.valve);
      actions.push({ ...record, anims: [program.name] });
      programs.push({ program, search: [0] });
      return;
    }
    // The program's names: the handle (every `lever_N` it turns: Enowapi's shared program turns two) to the copy's, the
    // gate's root to the gate copy's, every valve of the gate's levers to this switch's own, the program to its own name.
    const lever = part!;
    const handleName = lever.handle.split('/').pop()!;
    const renames: Renames = { nodes: { ...g.renames.nodes, [handleName]: sname, [handleName.toLowerCase()]: sname }, valves: { ...g.renames.valves }, anims: { ...g.renames.anims } };
    for (const n2 of lever.lever.program.nodes) if (/^lever_\d+$/i.test(n2)) renames.nodes[n2] = sname;
    for (const l of g.t.gate!.levers) renames.valves[l.valve] = renames.valves[l.valve.toLowerCase()] = valve;
    for (const a of lever.action.anims) renames.anims[a] = renames.anims[a.toLowerCase()] = `${sname}_${a}`;
    const program = renamedProgram(lever.lever.program, renames);
    const index = actions.length;
    actions.push({ ...record, anims: lever.action.anims.map((a) => pick(renames.anims, a)) });
    if (lever.scene) programs.push({ ...lever.scene, program: renamedProgram(lever.scene.program, renames) });
    const spec = gates[g.spec]!;
    gates[g.spec] = { ...spec, levers: [...spec.levers, { action: index, node: sname, path: rootPath, valve, program }] };
  });
  // The layout's props made damage triggers (`PieceTrigger`; FORGE_PIECE_TRIGGER_ADAPTATION): each a destructible on its
  // prop's own collision (`pieceOwner`, the hull's owner and a placed node: `withPieceInstances`), its record's health,
  // armour and shield the trigger's, its death a program of the script's steps (`scriptPrograms`) after the prop's hide
  // -- what tells every page it died (`WorldState.apply`, SUP-02: a live record whose target the room's state turns off).
  // A switch's `run` of it (`wreck`) runs that death, as a lethal hit does (`../sceneHealth` `wreck`).
  const triggerResolve: ScriptResolve = {
    target: (tg) => ('map' in tg ? tg.map : 'piece' in tg ? pieceOwner(tg.piece)
      : 'barrier' in tg ? (placedBarriers[tg.barrier] ? `worldmodel/${placedBarriers[tg.barrier]!.name}` : null)
      : 'object' in tg ? forgeObjectPath(tg.object)   // a Forge object's place (`./forgeObjects`)
      : placedGates[tg.gate] ? `worldmodel/${placedGates[tg.gate]!.name}` : null),
    barrierValve: (i) => placedBarriers[i]?.valve ?? null,
    action: (v) => actions.find((a) => a.valve.toLowerCase() === v.toLowerCase())?.valve ?? null,
  };
  triggers.forEach((t, n) => {
    // A prop of the layout's, or a node of the map's own (`PieceTrigger.node`): never one a disc destructible holds already.
    if (t.node === undefined && t.piece === undefined) return;      // linked to nothing yet: nothing to strike
    const path = t.node ?? pieceOwner(t.piece!);
    // It must be solid to be struck (a prop with no collision is never a target) -- and a placed node, made here when no
    // switch's script made it already (`withPieceInstances`'s).
    if (path === null || !owners.some((o) => under(o.path, path))
      || (t.node !== undefined && scene.destructibles.some((d) => under(d.targetPath, path) || under(path, d.targetPath)))) { unplaced++; return; }
    let instance = instanceByPath.get(path);
    if (instance === undefined) {
      instance = instances.length;
      instances.push({ id: instance, path, node: path.split('/').pop()!, modelName: 'forge', root: path });
      instanceByPath.set(path, instance);
    }
    const name = `forge_trigger_${n + 1}`;
    const { main, extra } = scriptPrograms(name, path, { steps: [{ do: 'hide', target: t.node !== undefined ? { map: t.node } : { piece: t.piece! } }, ...(t.script?.steps ?? [])] }, triggerResolve);
    for (const p of extra) programs.push({ program: p, search: p.nodes.map(() => 0) });
    destructibles.push({
      id: destructibles.length, key: `${name}#0@${path}`, anim: name, instance, targetPath: path,
      health: t.health, armor: t.armor, shield: t.shield, program: main, root: path,
      nodes: main.nodes.map((x) => (x === 'NA' ? null : x)), wreck: `${name}_wreck`,
    });
  });
  const ground = packGround(map.ground.grid, polys, owners);
  const meta = { ...map.meta, actions, instances, instanceByPath, initial, scene: { ...scene, destructibles, programs } };
  return {
    map: { ...map, ground, props, gates, actions, meta, textures, textureFlags, ...(textureMips ? { textureMips } : {}) },
    unplaced,
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
      const centre = [(minX + maxX) / 2, minY + Math.min(10, (maxY - minY) / 2), (minZ + maxZ) / 2];
      const slide = new Vector3(...g.open).applyMatrix4(new Matrix4().fromArray(g.parent).setPosition(0, 0, 0));
      const disc = t.gate.levers[0];
      // A placed copy has no lever of its own (its switch is placed apart): its slide alone.
      const at = lever === 'disc' && disc ? disc.at : centre;
      const s = gateShapes(centre, [slide.x, slide.y, slide.z], at, lever === 'disc' && disc && disc.range > 0 ? disc.range : 0);
      segments.push(...s.segments); triangles.push(...s.triangles);
    }
  }
  return { segments, triangles };
}

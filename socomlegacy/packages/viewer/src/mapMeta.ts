import { parseRdr, rdrGet, Zar, zdbMember, type RdrNode, type ZdbEntry } from '@s2u/archive';
import { decodeEffectProgram, flattenScene, missionNameOf, parseAnimSets, type SceneNode, type ZAnimArchive, type ZAnimNodeRef } from '@s2u/scene';
import { readMapActions, type MapAction } from './mapActions';
import { sceneOf, type SceneMeta } from './sceneHealth';

export { actionAtPick } from './mapActions';

/**
 * A map's typed metadata (socomlegacy/docs/research/209-the-mutable-world.md; the map-parity plan's MAP-01): one reading,
 * for the page (`./loadMap`) and the room (`./simMap`), of what the world's mutable state is built on --
 *
 * - its actions (`./mapActions`: every `actions.rdr` record on its placed node, typed, the loader's defaults applied);
 * - every placed node's **instance id**: its index in `flattenScene(models, 'worldmodel')`, the engine's render walk.
 *   This is a protocol id, a port rule (ruling PF.R15), not a reading of the game: the original addresses nodes by
 *   pointer. It is deterministic from the archive; reordering it is a protocol bump;
 * - the zAnim node references' **initial state** (`MZANIM.ZAR`, `@s2u/scene` `nodeRefInit`): the nodes the animation
 *   sets deactivate at initialisation (bit 31) and what each saves for the round's reset (research 171 s4) -- MAP-02
 *   applies them; nothing is mutable here.
 */

/** One node `flattenScene` emits under the world model. */
export interface MapInstance {
  /** Its index in `flattenScene(models, 'worldmodel')` order (PF.R15). */
  id: number;
  path: string;
  /** The node's name (`destroyed`). */
  node: string;
  /** The model it belongs to (`arch` for a node of the realised arch, `worldmodel` for the world's own). */
  modelName: string;
  /**
   * The outermost realised prototype it lies in -- its path up to the end of the first `=` segment
   * (`worldmodel/seal_demo_1/arch=arch`) -- or its own path for a node of the world model's own tree.
   */
  root: string;
}

/** A node the animation sets set up (research 209 s4): its path and the init bits of the reference that names it. */
export interface MapInitial {
  path: string;
  /** Bit 31: made inactive at initialisation. */
  deactivate: boolean;
  /** Bit 28: its active state is saved and restored at the round's reset. */
  saveActive: boolean;
  /** Bits 26 or 27: its translation or its rotation is saved (`ZAnimNodeRef.init` keeps them apart). */
  saveTransform: boolean;
  /** Bit 29: its parent is saved. */
  saveParent: boolean;
}

export interface MapMeta {
  stem: string;
  /** Every placed record, typed: `typeCode` 8 for a type-less one. */
  actions: MapAction[];
  /** `flattenScene` order; `id` is the index. */
  instances: MapInstance[];
  /** A path's first instance (a path repeats where a parent holds two children of one name). */
  instanceByPath: Map<string, number>;
  /** The paths zAnim deactivates at initialisation (node-ref bit 31), with their save bits: MAP-02 applies them. */
  initial: MapInitial[];
  /** Unplaced action nodes, unresolved references, animations whose root is a template no placement carries. */
  diagnostics: string[];
  /**
   * MAP-06 (`./sceneHealth`, research 209 s13): the map's destructibles -- each kind-3 damage block on each placement of
   * its root -- and its set's programs by name, for the world's host. Absent on a map built by hand (none).
   */
  scene?: SceneMeta;
  /**
   * W0 (`AUTOSTART_RESET_READING`): the autostarting animations' opening `OBJECT_ACTIVE_STATE` commands on their
   * placements, in file order -- what the original's restart of the sets replays at every round (`WorldState.reset`
   * re-applies them after the restore). Absent on a map built by hand (none).
   */
  autostart?: { path: string; on: boolean }[];
}

/** Whether `path` is `root` or lies under it: a child after `/`, the realised prototype after `=`. The one subtree test. */
export function under(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`) || path.startsWith(`${root}=`);
}

/** `MapInstance.root`: the path up to the end of its first `=` segment, else the path. */
function rootOf(path: string): string {
  const eq = path.indexOf('=');
  if (eq < 0) return path;
  const end = path.indexOf('/', eq);
  return end < 0 ? path : path.slice(0, end);
}

/**
 * NODE_REF_SCOPE_READING: where a node reference's name is looked up (`ZAnimNodeRef.search`, reCOM's `node_search`,
 * zanim.h:421, its values not named there) -- 0 over the whole placed world: beneath each placement of the animation's
 * root first, else the first placement of the name in `flattenScene` order (SUP-02, `SCENE_INSTANCE_SCOPE_READING`);
 * 1 beneath the animation's root reference (`Anim_Params.rootNodeIndex`), the first placement beneath each placement
 * of the root [reading: the engine's lookup is not traced. On the three fixtures every reference with an init bit is
 * search 0 or 1 with parent index 0. Frostfire's `door_slab` root is placed three times and names its `pane1` with
 * search 0: each placement's own pane is saved; research 209 s4, research 210 s6].
 */
export const NODE_REF_SCOPE_READING = { world: 0, underRoot: 1 } as const;

/**
 * ZANIM_PARENT_SCOPE_READING (PAR-92, research 319 §1.2-§1.3, §4.1 B2): a node reference whose parent is not 0
 * (`ZAnimNodeRef.parent`, `ZANIM_PARENT_SENTINEL_READING`) is placed beneath its parent's placement only, never over the
 * world, and its search mode is not read -- `FUN_0026f4e0` resolves the parent first (recursively) and looks the name
 * up beneath that node with no world fallback (D:L118221-118228); a parent of 0xf9 (`root`) beneath the root's placement
 * (the animation's instance, else its root reference's node, D:L118170-118179: one per placement of the root here, as
 * `SCENE_INSTANCE_SCOPE_READING` takes them); `caller` (0xfa) beneath the caller's node, which a placement at the map's
 * load has not, so nothing; a parent past the table nothing (`ZANIM_PARENT_OUT_OF_TABLE_PLACEHOLDER`). Parent 0 is
 * unchanged (`NODE_REF_SCOPE_READING`) [reading: the resolver is read, not traced running; how deep the node's
 * find-by-name looks (its argument 1 to the node's +0x24 method, research 319 U6) is not, so "beneath" is the port's
 * whole subtree. On the disc (research 319 §4.2, U3/U4): 22 in-range parents on MP10, MP11 and MP62, 27 on the
 * campaign maps, 636 parents 0xf9 on the four `otc_` character animations of the twelve].
 */
export const ZANIM_PARENT_SCOPE_READING = { beneathParentOnly: true, rootBeneathRoot: true } as const;

/**
 * AUTOSTART_INITIAL_READING (MAP-02 fix round): an animation whose `Anim_Params` flags read 1 in their low two bits
 * starts with its set at the map's load -- `FUN_0026c600` (D:L116312-116387) starts the set's animations whose runtime
 * bit is set, and research 115 R115.6 reads that bit as `params.flags & 3 == 1` (its menu fader's autostart reading) --
 * and the `OBJECT_ACTIVE_STATE` commands that open its start sequences (activation 1, before any other command) take
 * effect at once: they are part of the opening state, and the round's reset gives that state back (the port saves after
 * them; the original restores and starts the set again, `AUTOSTART_RESET_READING`) [reading: research 209 s9-s10,
 * research 237 §0]. Desert Glory's nine `beerN` (flags 0x21) open with `OBJECT_ACTIVE_STATE beer_parts off` and nothing
 * else.
 */
// LATER 486: the original's gate is `flags & 7 == 1` (research 106 §158-159; FUN_002713f0 D:L119327-119333); the two agree
// unless `flags & 7 == 5`, and no map animation on the disc has it (research 237 §6, `startsWithSetDisc.test.ts`).
export const AUTOSTART_INITIAL_READING = { startsWithSet: (flags: number): boolean => (flags & 3) === 1 } as const;

/**
 * AUTOSTART_RESET_READING (W0, research 237 §0): the round's reset re-runs the animations that start with their set, so
 * an autostart's opening commands hold at round 2 as at round 1. The original restores the references' saved init (saved
 * at the reference's init, before the set starts: `FUN_0026b5e0` D:L115740-115750, a `beer_parts` saved on) and then
 * starts the sets again: online the round's end state's UnInit `FUN_002232a0` (D:L75850-75866) runs, on `common` and
 * `mission` (0x3e5260, 0x3e5268), `FUN_0026c2e0` (D:L116142-116181: every animation stopped, the set's started byte +1
 * cleared), `FUN_0026c4f0` (D:L116270-116309: `FUN_0026b430` per saved reference) and `FUN_0026c600` (D:L116312-116387:
 * runs only while +1 is 0, so again); the offline reopen `FUN_002ac0e0` (D:L151966-151983: the same stop and restore on
 * 0x3f12f8/0x3f1300, `common`/`mission`) is followed by the round's start `FUN_002a7d40` (D:L149735-149742), which starts
 * both sets. Every start of a 0x21 animation is `FUN_002713f0` (flags bit 11 clear: never `FUN_00271250`/`FUN_00271390`,
 * whose later-start branch skips kind 3, D:L116360-116366; `beerN` and `set_apache` are kind 1). The port: `reset`
 * restores the saved references, then re-applies every autostart's opening `OBJECT_ACTIVE_STATE` commands in file order
 * (`MapMeta.autostart`; `openingCommands`, VALVE ops passed over) -- MP6's `beer_parts` off again, MP73's `chopper1` off
 * and `radio_call` on (neither saved). The room runs no autostart program (its world leaves `runAutostartPrograms`
 * unset). The page runs them after this opening (`WorldState.startAutostarts`, AS-1): the waits, loops, sounds and
 * calls. An opening VALVE op's value is not kept (the reset's own clear to 0 is what the disc's opening valve ops set).
 * `OBJECT_MOTION_SI_SCRIPT` moves nothing (`./worldState` `SI_SCRIPT_MOTION_PLACEHOLDER`) [reading: the
 * restore-then-start order is read, not watched; so is the runtime test `FUN_0026c600` makes (byte +5 bit 3 of the
 * animation) being `Anim_Params` flags bit 11 (research 106) -- a reading, not a trace; one look at a Desert Glory bottle
 * and Sandstorm's (MP73) radio in round 2 settles it].
 */
export const AUTOSTART_RESET_READING = 're-run' as const;

/**
 * The node references an autostarting animation turns off or on at its start, in order (`AUTOSTART_INITIAL_READING`):
 * each activation-1 sequence's `OBJECT_ACTIVE_STATE` commands up to its first command that is neither that nor a
 * `VALVE` -- a valve op takes no time, so MP73's `set_apache` (`chopper1` off, three valves set to 0, `radio_call` on)
 * reaches its last command in the same frame. The valves themselves are not kept: the round's reset clears every
 * valve to 0 (`FUN_002b5510`), which is what the disc's opening valve ops set (`AUTOSTART_RESET_READING`).
 */
function openingCommands(anim: ZAnimArchive['sets'][number]['anims'][number]): { ref: ZAnimNodeRef; on: boolean }[] {
  let program: ReturnType<typeof decodeEffectProgram>;
  try { program = decodeEffectProgram(anim); } catch { return []; }
  const out: { ref: ZAnimNodeRef; on: boolean }[] = [];
  for (const seq of program.sequences) {
    if (seq.activation !== 1) continue;
    for (const op of seq.ops) {
      if (op.op === 'valve') continue;
      if (op.op !== 'active') break;
      const ref = op.node >= 0 ? anim.nodeRefs[op.node] : undefined;
      if (ref) out.push({ ref, on: op.on });
    }
  }
  return out;
}

const isInit = (r: ZAnimNodeRef): boolean =>
  r.init.deactivate || r.init.saveActive || r.init.saveTranslation || r.init.saveRotation || r.init.saveParent;

/**
 * Reads a map's metadata. `models` is the archive's scene graph (the caller has it); `anims` its `MZANIM.ZAR`, read
 * here when not given. Never throws: what does not read is a diagnostic.
 */
export function readMapMeta(bytes: Uint8Array, toc: ZdbEntry[], stem: string, models: SceneNode[], anims?: ZAnimArchive): MapMeta {
  const diagnostics: string[] = [];
  const { actions, diagnostics: actionLines } = readMapActions(bytes, toc, stem, models);
  diagnostics.push(...actionLines);

  let flat: ReturnType<typeof flattenScene> = [];
  try {
    flat = flattenScene(models, 'worldmodel');
  } catch (e) {
    diagnostics.push(`meta: ${e instanceof Error ? e.message : String(e)}`);
  }
  const instances = flat.map((f, id): MapInstance => ({ id, path: f.path, node: f.node.name, modelName: f.modelName, root: rootOf(f.path) }));
  const instanceByPath = new Map<string, number>();
  for (const i of instances) if (!instanceByPath.has(i.path)) instanceByPath.set(i.path, i.id);

  let archive = anims;
  if (!archive) {
    try {
      archive = parseAnimSets(Zar.parse(zdbMember(bytes, toc, 'MZANIM.ZAR')));
    } catch (e) {
      diagnostics.push(`meta: MZANIM.ZAR: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  // PAR-92: a parent past its table is kept unresolved by the reader (`ZANIM_PARENT_OUT_OF_TABLE_PLACEHOLDER`): said here.
  for (const anim of archive?.sets.flatMap((s) => s.anims) ?? []) for (const r of anim.nodeRefs) if (r.unresolved) diagnostics.push(`meta: ${r.unresolved}`);
  const byPath = new Map<string, MapInitial>();
  const autostart: { path: string; on: boolean }[] = [];
  const find = (name: string, scope: string | null): string | null => {
    const n = name.toLowerCase();
    return instances.find((i) => i.node.toLowerCase() === n && (scope === null || (i.path !== scope && under(i.path, scope))))?.path ?? null;
  };
  const placements = (name: string): string[] => {
    const n = name.toLowerCase();
    return instances.filter((i) => i.node.toLowerCase() === n).map((i) => i.path);
  };
  const keep = (path: string, r: ZAnimNodeRef): void => {
    const was = byPath.get(path);
    const saveTransform = r.init.saveTranslation || r.init.saveRotation;
    byPath.set(path, {
      path, deactivate: (was?.deactivate ?? false) || r.init.deactivate, saveActive: (was?.saveActive ?? false) || r.init.saveActive,
      saveTransform: (was?.saveTransform ?? false) || saveTransform, saveParent: (was?.saveParent ?? false) || r.init.saveParent,
    });
  };
  for (const anim of archive?.sets.flatMap((s) => s.anims) ?? []) {
    const refs = anim.nodeRefs.filter(isInit);
    const opening = AUTOSTART_INITIAL_READING.startsWithSet(anim.params.flags) ? openingCommands(anim) : [];
    if (refs.length === 0 && opening.length === 0) continue;
    const rootRef = anim.nodeRefs[anim.params.rootNodeIndex];
    const rootName = rootRef && rootRef.name !== 'NA' ? rootRef.name : null;
    const roots = rootName === null ? [] : placements(rootName);
    // SUP-02 (SCENE_INSTANCE_SCOPE_READING, research 210 s6): a search-0 reference is looked up beneath each placement
    // of the root first, the world's first placement only where a placement holds none -- as `./sceneHealth`'s
    // `placeRefs` places a program's references -- so each of Frostfire's three slabs saves its own pane1.
    const worldPaths = (name: string): string[] => {
      if (roots.length === 0) return placements(name).slice(0, 1);
      const first = placements(name)[0];
      return [...new Set(roots.map((root) => find(name, root) ?? first).filter((p): p is string => p !== undefined))];
    };
    const beneath = (name: string, parents: readonly string[]): string[] =>
      [...new Set(parents.map((p) => find(name, p)).filter((p): p is string => p !== null))];
    // PAR-92 (ZANIM_PARENT_SCOPE_READING): a non-zero parent places the reference beneath the parent's placements only.
    // `seen` guards a parent chain that loops back (none on the disc).
    const pathsOf = (r: ZAnimNodeRef, seen: ReadonlySet<ZAnimNodeRef> = new Set<ZAnimNodeRef>()): string[] => {
      if (r === rootRef) return roots;
      if (r.parent === 'root') return beneath(r.name, roots);
      if (typeof r.parent !== 'number') return [];                   // `caller`, or a parent past the table: none at the load
      if (r.parent !== 0) {
        const parent = anim.nodeRefs[r.parent];
        return parent && !seen.has(parent) ? beneath(r.name, pathsOf(parent, new Set([...seen, r]))) : [];
      }
      return r.search === NODE_REF_SCOPE_READING.world ? worldPaths(r.name)
        : r.search === NODE_REF_SCOPE_READING.underRoot ? roots.map((root) => find(r.name, root)).filter((p): p is string => p !== null) : [];
    };
    const scopeOf = (r: ZAnimNodeRef): string => (r.parent === 0 ? `search ${r.search}` : `search ${r.search}, parent ${r.parent}`);
    const missing: string[] = [];
    for (const r of refs) {
      const paths = pathsOf(r);
      if (paths.length === 0) missing.push(`${r.name} (${scopeOf(r)})`);
      for (const path of paths) keep(path, r);
    }
    // MAP-02 fix round (AUTOSTART_INITIAL_READING): an animation started with its set turns its nodes off at once.
    // W0: a reference of another scope (MP73's `radio_call`, search 3) is placed as the program runner places it
    // (`./sceneHealth` `placeRefs`: beneath the root, else the world's first placement), so the replay reaches it.
    // PAR-92: a reference with a parent is placed beneath it, whatever its search (ZANIM_PARENT_SCOPE_READING).
    const openingPaths = (r: ZAnimNodeRef): string[] => (r === rootRef || r.parent !== 0 || r.search === NODE_REF_SCOPE_READING.world
      || r.search === NODE_REF_SCOPE_READING.underRoot ? pathsOf(r) : worldPaths(r.name));
    for (const { ref, on } of opening) {
      for (const path of openingPaths(ref)) {
        autostart.push({ path, on });
        const was = byPath.get(path);
        if (on && !was?.deactivate) continue;                      // on, and nothing turned it off: nothing to say
        byPath.set(path, { path, deactivate: !on, saveActive: was?.saveActive ?? false, saveTransform: was?.saveTransform ?? false, saveParent: was?.saveParent ?? false });
      }
    }
    if (missing.length === 0) continue;
    if (rootName === null) diagnostics.push(`meta: zAnim ${anim.name} has no root reference: ${missing.join(', ')} not placed`);
    else if (roots.length === 0) diagnostics.push(`meta: zAnim ${anim.name}: its root ${rootName} is not placed (a template): ${missing.length} references unresolved`);
    else diagnostics.push(`meta: zAnim ${anim.name}: ${missing.join(', ')} not placed under ${rootName}`);
  }
  const initial = [...byPath.values()].sort((a, b) => instanceByPath.get(a.path)! - instanceByPath.get(b.path)!);
  // MAP-06: the destructibles on their placements, and the programs their deaths and the actions run. R4B-05: with the
  // mission's name, r0004's shield edits (`./sceneHealth` `R0004_SHIELD_EDITS`).
  const scene = archive ? sceneOf({ instances }, archive, missionNameOf(stem)) : undefined;
  // SUP-03: a damage block whose root is placed nowhere (Vigilance's access6, plankaccess1..3) is stored, never a target.
  for (const name of scene?.unplaced ?? []) diagnostics.push(`meta: zAnim ${name}: a destructible whose root is not placed: no target`);
  return { stem, actions, instances, instanceByPath, initial, diagnostics, ...(scene ? { scene } : {}), ...(autostart.length ? { autostart } : {}) };
}

/**
 * Where the renderer's name rule for alternate states (`./loadMap` `ALTERNATE_STATE`, hidden by name) and zAnim's
 * initial state (`MapMeta.initial`, a placement under a deactivated path) disagree, over the placements under a path
 * the map's zAnim references name (the lamps' `nolight` and what only the common set names are not zAnim's to judge
 * here): one line, or null when they agree. MAP-02 switches the renderer to `initial`; until then the line says where.
 */
export function alternateDisagreement(paths: readonly string[], hiddenByName: (path: string) => boolean, initial: readonly MapInitial[]): string | null {
  const off = initial.filter((e) => e.deactivate).map((e) => e.path);
  const named = initial.map((e) => e.path);
  const hiddenOnly: string[] = [], offOnly: string[] = [];
  for (const p of paths) {
    if (!named.some((root) => under(p, root))) continue;
    const byName = hiddenByName(p), byZAnim = off.some((root) => under(p, root));
    if (byName && !byZAnim) hiddenOnly.push(p);
    else if (byZAnim && !byName) offOnly.push(p);
  }
  if (hiddenOnly.length === 0 && offOnly.length === 0) return null;
  const first = (list: string[]): string => (list.length ? `, first ${list[0]}` : '');
  return `alternate: the name rule and zAnim's initial state disagree -- ${hiddenOnly.length} placements hidden by name that zAnim leaves active${first(hiddenOnly)}; ${offOnly.length} shown that zAnim deactivates${first(offOnly)} (MAP-02 replaces the rule)`;
}

/**
 * PF-31 (ruling PF.R51): one of the map's fixed spectator views, `READERM.ZAR/mission.rdr`'s `Scenic_Views` -- the
 * places the spectator camera's mode 2 steps through (`FUN_002ab260` over the list, `FUN_00295260` D:L139531-139585;
 * research 91 §12, 190 §2: camera views, not rules). `at` in world units, `pitch` / `yaw` / `roll` in degrees.
 */
export interface ScenicView { name: string; at: [number, number, number]; pitch: number; yaw: number; roll: number }

/**
 * SCENIC_VIEWS_READING: the `Scenic_Views` layout, as transcribed from the fixtures' `mission.rdr` (MP2's six, MP6's
 * nine, MP72's eleven; research 232 §5): a list of records `Pos (x y z) Rot (a b c) Desc (name)`; `FUN_002ab260`
 * (D:L151453) copies a record's first three floats to the camera's position and the next three (`+0xc..+0x14`) to its
 * angles, its name at `+0x18`. `Rot` read as pitch (down negative; MP72 writes it 0-360, 337 for -23, folded to
 * (-180, 180]), yaw (the port's yaw convention: MP6's Hostage Room and Hostage Building views face the cell door at
 * 243 and 333 by the port's `atan2(-dx, -dz)`, against 238 and 328 written) and roll (0 on every view read). Not
 * measured running: whether the engine applies `Rot` in this order is owed a capture (a scenic view's picture).
 */
export const SCENIC_VIEWS_READING = { fields: ['Pos', 'Rot', 'Desc'], rot: ['pitch', 'yaw', 'roll'] } as const;

/** A degree angle folded to (-180, 180]: MP72's 337 is -23. */
function signedDegrees(v: number): number {
  const a = ((v % 360) + 360) % 360;
  return a > 180 ? a - 360 : a;
}

/** The `Scenic_Views` of a decoded `mission.rdr` (SCENIC_VIEWS_READING), in file order; a record that does not read is left out. */
export function scenicViewsFromRdr(mission: RdrNode): ScenicView[] {
  const list = rdrGet(mission, 'Scenic_Views');
  if (!Array.isArray(list)) return [];
  // One record is unwrapped by `rdrGet` (a one-element list): the record itself then, not a list of them.
  const records = list.length > 0 && typeof list[0] === 'string' ? [list] : list;
  const out: ScenicView[] = [];
  for (const record of records) {
    if (!Array.isArray(record)) continue;
    const pos = rdrGet(record, 'Pos'), rot = rdrGet(record, 'Rot'), desc = rdrGet(record, 'Desc');
    if (!Array.isArray(pos) || pos.length !== 3 || !Array.isArray(rot) || rot.length !== 3) continue;
    const p = pos.map(Number), r = rot.map(Number);
    if (![...p, ...r].every(Number.isFinite)) continue;
    out.push({ name: typeof desc === 'string' ? desc : '', at: [p[0]!, p[1]!, p[2]!], pitch: signedDegrees(r[0]!), yaw: r[1]!, roll: signedDegrees(r[2]!) });
  }
  return out;
}

/** The map's scenic views off its archive's `READERM.ZAR/mission.rdr` (read as `./loadMap`'s `missionName` reads `description`); none without the file. */
export function scenicViewsOf(bytes: Uint8Array, toc: ZdbEntry[]): ScenicView[] {
  const readerm = Zar.parse(zdbMember(bytes, toc, 'READERM.ZAR'));
  const mission = readerm.root.children.find((k) => k.name.toLowerCase() === 'mission.rdr');
  return mission ? scenicViewsFromRdr(parseRdr(readerm.data(mission))) : [];
}

import { NODE_CALLER, NODE_ROOT, type CollisionOwner, type EffectCondition, type EffectOp, type EffectProgram, type Grid, type ParticleSource } from '@s2u/scene';
import { groundPolygons, type GroundData } from './mover';
import { AUTOSTART_INITIAL_READING, under, type MapMeta } from './mapMeta';
import type { EnvWire } from './net/protocol';
import { EffectRun, opacityTick, type EffectHost } from './effectRunner';
import { valveApply, valveTest } from './doors';
import { placeRefs, SceneHealth, SKIP_EFFECTS_VALVE, type SceneMeta, type SceneProgram, type SceneRunContext } from './sceneHealth';

/**
 * The world's mutable state (MAP-02; socomlegacy/docs/research/209-the-mutable-world.md s8-s10): one per room and one per
 * page, never shared -- which placed nodes are active, the action valves, the actions used this round -- applied to the
 * collision (each owner's `m_active`, `CollisionOwner.flags` bit 0, the bit `modelGate` reads) and, through the hooks,
 * to the drawing (`WorldView.setNodeActive`). Headless: the page and the match server run this same code (`./sim`).
 *
 * **What the game does** (research 171 s4, 173 s4, 174 s3; research 209 s4):
 *
 * - At initialisation every zAnim node reference with bit 31 makes its node inactive, and then a reference with bit 28
 *   saves the node's active state (`FUN_0026b5e0` D:L115740-115750): `applyInitial`, from `MapMeta.initial`.
 *   Crossroads' `healthy` and `destroyed` both carry an active scene flag before this (171 s4): the raw node flag alone
 *   is wrong, which is why the state starts from the references and not from the flags.
 * - A node's activity reaches its subtree: the engine's walks skip an inactive node and what hangs under it (the
 *   grid's ordered traversal, `grid_main.cpp:303`; the probe's model gate and its recursion into `+0x70`, research 23
 *   s1.1). Crossroads' rubble is 8 polygons at `/destroyed` and 162 at `/destroyed/dia` (171 s3): turning `destroyed`
 *   on must reach `dia`. Here each node keeps its own flag, and a node is active when it and every ancestor are
 *   (`isActive`): turning a parent on leaves a child that was turned off on its own off, as the engine's flags do.
 * - At the round's reset `FUN_002ac0e0` (D:L151976-151991) restores what the references saved (`FUN_0026b430`
 *   D:L115690-115721, `FUN_0026c4f0`) and calls `FUN_002b5510` (D:L157445-157456): the action valves to 0, the running
 *   animations stopped, the use bookkeeping cleared -- `reset`.
 *
 * **Port rules** (no original; research 209 s9): the revision (`Grid.revision`, one more at every change) is what
 * the readers that cache the grid compare against; an instance's id is its `flattenScene` index (ruling PF.R15,
 * `MapMeta.instances`); a node's own flag is kept by its path, so the few paths that repeat (research 209 s5) switch
 * together.
 */

/** One placed node's state, for MAP-03's wire: its own flag now and after `applyInitial`. */
export interface InstanceState { id: number; path: string; active: boolean; initial: boolean /* after applyInitial */ }

/**
 * What the page lends the world: a subtree drawn or hidden, and every change's revision; and (MAP-06) a scene program's
 * effects -- a sound, a particle source, a debris source -- at a placed node (null: none placed). The room lends none.
 */
export interface WorldHooks {
  /** Every placement at or under `path` (`under`) is to be drawn (`on`) or hidden. */
  visible?(path: string, on: boolean): void;
  /** The world changed: its revision now. */
  changed?(revision: number): void;
  /** A program's `SOUND` (a new play only: `newPlay`), at the node's place, at the command's volume. */
  sound?(name: string, path: string | null, volume: number): void;
  /** A program's `PARTICLE_SOURCE`, at its root. */
  particles?(source: ParticleSource, path: string | null): void;
  /**
   * A program's `DESTRUCTION_SOURCE`, at its node: the node alone (`GLASS_FRAGMENTS_PLACEHOLDER` -- the command's payload
   * beyond its node byte is undecoded, so no fragment is thrown).
   */
  destruction?(path: string | null): void;
  /**
   * XR-04: a program's `CALL_ANIMATION` of an animation the map's set lacks -- the common set's (`CZANIM`) effects,
   * Crossroads' `fire_explode_med` and `dust_explode_long` -- at the calling program's root (`COMMON_EFFECT_CALL_READING`);
   * a presentation run's only (ruling PF.R26).
   */
  call?(name: string, path: string | null): void;
  /**
   * A program's `MESSAGE` with its own text (a Forge switch's script, `../forge/placedAccess` `scriptPrograms`; the owner,
   * 2026-11-08): the message window's post. A located message (`locId`) is not posted: its table is not read here. A
   * joiner's replay (`silent`) posts none.
   */
  message?(text: string, colour?: number): void;
  /**
   * FORGE_SCRIPT_BLAST_ADAPTATION: a Forge script's `FIRE_WEAPON` (`EffectOp.forge`; a disc program's round is not handed
   * on, BRIDGE_FIRE_WEAPON_READING) at its node's place. `scriptRound` is its drawing (a page's run, never a joiner's
   * replay); `blast` its damage (a run that is no presentation: the room's world, PF.R26).
   */
  scriptRound?(op: Extract<EffectOp, { op: 'fireWeapon' }>, path: string | null): void;
  blast?(op: Extract<EffectOp, { op: 'fireWeapon' }>, path: string | null): void;
  /**
   * PB-9b (research 284 s3): a program's `OBJECT_OPACITY_FROM_TO` on a placed node -- its opacity now (`WorldView.setNodeOpacity`);
   * the bases' pulse outlines. Drawing only: the room lends none.
   */
  opacity?(path: string, opacity: number): void;
}

/**
 * GLASS_FRAGMENTS_PLACEHOLDER (SUP-02; research 210 s6, 176 s4.2): what a `DESTRUCTION_SOURCE` throws -- Frostfire's
 * `breakapane` emits one at its root `pane1` -- is not decoded past its node byte (`@s2u/scene` `effects.ts`: `{ op:
 * 'destruction', node }`), and no capture shows a pane break: a broken pane plays its `.GLS_BRK_VSMALL` and goes off,
 * and nothing more is drawn. The page's `destruction` hook logs the node once.
 */
export const GLASS_FRAGMENTS_PLACEHOLDER = 'sound-and-pane-off' as const;

/**
 * SCENE_DEATH_ON_WIRE_READING (SUP-02; research 210 s6): the room decides a destructible's death and sends only the
 * geometry (MAP-03's `EnvWire`: the instances off their opening state), not the health. A page's world takes a live
 * destructible whose target the room's state turns off as dead -- one a distinct target (the first record bound to it,
 * as the room's `SceneHealth.at` picks), none for a record whose target is under another dead one's or whose animation
 * another's death runs as a program -- its record spent
 * (health at most 0: no C4 target) and, unless the state is a joiner's (`silent`, the game's `skip_effects`), its
 * death's sequences run for their effects -- `breakapane`'s `.GLS_BRK_VSMALL` and `DESTRUCTION_SOURCE` -- once, for
 * presentation only (ruling PF.R26, research 210 s7-s8): the run turns no node and sets no valve, at once or later
 * (`access_part_fly`'s caller off at 2 s), so the page's state stays the wire's. A death that does not turn its target off is never
 * heard on the page (MP6's bottles, tin cups, plates and lights): the wire carries no health. A spent destructible whose target the room's state gives back is whole again (the room's round
 * reset, followed without the page's own: the page's offline room, `./net/loopback`) [reading: the original's own
 * network path for a scene object's death (a damage message replayed on each console, or a valve) is not traced;
 * research 209 s11's valve replay is the nearest read].
 */
export const SCENE_DEATH_ON_WIRE_READING = 'targetOff' as const;

/**
 * SCENE_SOUND_PLACE_READING (SUP-02; research 210 s6): a scene program's `SOUND` at a node is placed at the centre of
 * the box of the node's polygons as they stand now (a pane in a swinging leaf where the leaf is) -- `MapMeta` carries no
 * node's world origin; null for a node with no polygons, played unplaced [reading: the game plays it at the node's
 * position, `FUN_002659c0` (D:L112363-112416); a pane's own origin is not read].
 */
export const SCENE_SOUND_PLACE_READING = 'polygonBoxCentre' as const;

/**
 * DEBRIS_NODE_READING (XR-04, ruling PF.R29; research 213 s2.1, s2.3, s4): a node whose zAnim reference saves its parent
 * (bit 29, `MapInitial.saveParent`) is flown debris -- Crossroads' `part_1..15` under each arch's `parts` (0xbc08xx00)
 * and the bases' crate parts, the nodes `FOR_CHILDREN` reparents to the world (`OBJECT_MAKE_WORLDCHILD`) and `flyparts`
 * flies -- and a silent run (the room's, `ROOM_SKIP_EFFECTS_READING`) never turns one on, so the wire never carries it.
 * The bridges' programs hold no `IF skip_effects` around their debris (research 213 s2.1), so the guard the access
 * barriers use does not separate it [reading: that every save-parent node is presentation is read on Crossroads' two
 * arches and two bases only; the original's joiner (owner session B item 12) is not captured].
 */
export const DEBRIS_NODE_READING = 'saveParent' as const;

/**
 * COMMON_EFFECT_CALL_READING (XR-04; research 213 s2.1, s4): a `CALL_ANIMATION` whose animation the map's set lacks --
 * `*_demo_site1`'s `fire_explode_med` (twice) and `dust_explode_long`, the common set's (`CZANIM`) -- goes to the page's
 * effects by the `call` hook, at the calling program's root (an arch's `worldmodel/seal_demo_1`), on a presentation run
 * only; the room ignores it [reading: the command's own node byte (ref 3 `damage_point` in its payload, research 213
 * s2.1; `SCENE_INSTANCE_SCOPE_READING`) is not decoded, and the +0x18 f32 (30 up) is not applied].
 */
export const COMMON_EFFECT_CALL_READING = 'callerRoot' as const;

/** `tag_NODE_PARAMS`' `m_active` (bit 0) and `m_hasDI` (bit 12; `@s2u/scene` `probe.ts` `modelGate`). */
const NODE_ACTIVE = 1, NODE_HAS_DI = 1 << 12;

/**
 * SHOT_GEOMETRY_LIVE_READING (research 91 §23, research 209 §10): a round walks the world as it stands when it is
 * resolved. `FUN_003c9b70` (D:L319922-320065) walks the round's hits of this frame -- the projectile's own hit list
 * (`+0x28`), nearest first by `FUN_00309200`'s distances -- and hands each to `FUN_003c8920`, whose first act reads the
 * struck polygon's material off that hit (`FUN_002dc1d0`, D:L319383); nothing there reads a past state of the world.
 * Online each console walks the shooter's round on its own copy (`FUN_005abbc0` D:L464698, research 91 §23). This
 * reading covers that walk alone: the resolving console meets its own live world, `'present'`, the query `roundPath`
 * makes. Where the round is resolved is not the original's: the original's resolving console is the shooter's, whose
 * copy lags the host, while our room resolves geometry at its present and rewinds actors only (`match/src/room.ts`,
 * `MAX_REWIND_MS`) -- a barrier opening inside the rewind window passes a round the original's shooter would hit. That
 * is PF.R12, the ruled departure the owner holds (H100), not this reading. [reading: filed by #441 from research 91 §23
 * without the ELF; re-read at the decompilation on the owner's host by the takeover, 2026-10-24, pending review.]
 */
export const SHOT_GEOMETRY_LIVE_READING = 'present' as const;

/**
 * WORLD_RESET_SAVED_READING: the round's reset restores the active state of the nodes a reference saved (bit 28,
 * `MapInitial.saveActive`) and only those; a node no reference saves keeps the state the round left it in
 * [reading: `FUN_0026b430` D:L115690-115721 restores per saved reference; that no other path of `FUN_002ac0e0`
 * (D:L151976-151991) restores a node is not traced. Research 209 s10].
 */
export const WORLD_RESET_SAVED_READING = true;

/**
 * ROOM_SKIP_EFFECTS_READING (SUP-03): the room's world runs every scene program with `skip_effects` reading 1, as a
 * joiner's replay does (`WorldState.skipEffects`). What a program guards with `IF skip_effects == 0` is presentation --
 * Vigilance's and Desert Glory's `destroy_accessN` put their debris there (`bad_parts` on, the parts flown, `.WOOD_DEBRIS`;
 * research 176 s7.1, 209 s13) -- and the game's own late join replays the state without it (`FUN_002b4440`
 * D:L156767, `JOIN_SILENT_READING`, research 209 s11), so the state the room holds and sends never carries the debris; the page plays it
 * [reading: that no guarded branch on the 22 maps changes what is authoritative is read on the five sprint maps'
 * guarded programs only; research 210 s8].
 */
export const ROOM_SKIP_EFFECTS_READING = true;

/**
 * SI_SCRIPT_MOTION_PLACEHOLDER (LATER 409, research 237 §0.2 and §6): `OBJECT_MOTION_SI_SCRIPT` (command 26) moves
 * nothing and ends in the tick it begins -- its begin and tick are not read, only its record size and start/end times
 * (`FUN_0025f1b0` D:L108613-108635, `FUN_0025f3c0` D:L108678-108718; research 319 §4.2 U1 names it undecoded), and
 * MP6's six `f18_*.zan` `Script_Data` are 0 bytes. So Desert Glory's `f181` / `f182` turn the jet on and off in one
 * tick. Settled by reading command 26's begin and tick at the source -- `FUN_0025bc20`'s 26th registration
 * (D:L106890) pairs address `0x25f140` (inside `FUN_0025f050`'s range; not a decompiled function of its own) with `FUN_0025f050` (`FUN_0025f1b0`'s only caller, D:L108557), by analogy with the
 * 25th (D:L106889, opacity's begin and tick); that the 26th is command 26 is an inference (the name string at 0x3ece80
 * unread) -- and where the `.zan` bytes live if not in `Script_Data`.
 */
export const SI_SCRIPT_MOTION_PLACEHOLDER = 'returns at once' as const;

/**
 * PB-9b: a scene program's context in the world (`SceneRunContext`), with `display` -- a run for the page's drawing alone
 * (`WorldState.runDisplay`): its active commands draw, the world's own flags untouched.
 */
type WorldRunContext = SceneRunContext & {
  display?: boolean;
  /** AS-1: an autostart program. Its `RANDOM_WEIGHT` draws `WorldState.autostartRandom`. */
  autostart?: boolean;
  /**
   * The autostart this run is (or is called from), by name: when the effect runner already plays it (`ambientOwned`),
   * its sounds, calls and particles stay there; this run still applies `OBJECT_ACTIVE_STATE` to the world nodes.
   */
  autostartName?: string;
  /**
   * P8 (`SWITCH_PREDICT_ADAPTATION`; the P8 review's F2): the predicted press this run belongs to -- the token
   * `executeAction` was given, carried to every run it starts (a `CALL_ANIMATION` of the map's set, an
   * `EXECUTE_ACTION`) -- so a refusal drops the whole tree (`dropTree`).
   */
  tree?: object;
};

/** A map with no metadata (a hull built by hand): no actions, no instances, nothing initially inactive. */
export function bareMeta(stem = ''): MapMeta {
  return { stem, actions: [], instances: [], instanceByPath: new Map(), initial: [], diagnostics: [] };
}

/**
 * A room's own copy of a hull (MAP-02; `match/src/server.ts` `forkSimMap`, `./net/loopback` `simMapOfLoaded`): its own
 * owners -- whose flags the room's world turns -- and its own points -- which the room's doors turn -- and the packed
 * fields copied too. Build the room's grid off the copy (`groundGrid`): the grid links the owner objects themselves.
 */
export function forkGround(g: GroundData): GroundData {
  return { grid: { ...g.grid }, owners: g.owners.map((o) => ({ ...o })), points: Float32Array.from(g.points), fields: Uint32Array.from(g.fields) };
}

/** A Forge switch's own valve or a script's flag (`./forge/placedAccess`: `forge_switch_<n>_valve`, `forge_flag_<name>`). */
export const isForgeScriptValve = (name: string): boolean => /^forge_switch_\d+_valve$/.test(name) || name.startsWith('forge_flag_');

export class WorldState {
  /** Each node's own flag, by path; a path not here is active (every node carrying polygons is, research 23 s1.1). */
  private readonly own = new Map<string, boolean>();
  /** The own flags after `applyInitial` (`InstanceState.initial`); empty before it. */
  private readonly initialOwn = new Map<string, boolean>();
  /** What `save` kept: the saved references' own flags (bit 28). */
  private saved = new Map<string, boolean>();
  /** Each owner's flag word as the hull had it, for setting bit 0 back on it. */
  private readonly base: (number | undefined)[];
  private readonly valves = new Map<string, number>();
  private readonly used = new Set<number>();
  private readonly hooks: WorldHooks[] = [];
  /** MAP-06: the scene programs running (a death's sequence, an action's animation), with the action each runs for. */
  private runs: { run: EffectRun; action: number }[] = [];
  /** MAP-06: the map's destructibles and programs (`MapMeta.scene`; none on a map built by hand). */
  readonly scene: SceneMeta;
  /** MAP-06 (`./sceneHealth`): the scene objects' health, reset with the geometry. */
  readonly health: SceneHealth;
  /** XR-04 (`DEBRIS_NODE_READING`): the nodes a reference saves the parent of -- never turned on by a silent run. */
  private readonly debris: ReadonlySet<string>;
  /** PB-9b: the nodes a display run (`runDisplay`) has drawn on, which the world's own flags leave off. */
  private readonly displayed = new Set<string>();
  /** PB-9b: each node's last opacity a program wrote (the `opacity` hook's, `WorldView.setNodeOpacity`'s): `basePulse`. */
  private readonly opacities = new Map<string, number>();
  /** P8's review F2: per predicted press (`WorldRunContext.tree`), each node's opacity before its runs first wrote it. */
  private readonly treeOpacity = new WeakMap<object, Map<string, number | undefined>>();
  /**
   * SUP-03: the deaths run with `skip_effects` reading 1 (`SceneRunContext.silent`): the room's world
   * (`ROOM_SKIP_EFFECTS_READING`); a page's runs its effects (false).
   */
  skipEffects = false;
  /**
   * AS-1 (research 237 §0.2): the page runs each autostart program after the opening fold (`startAutostarts`) -- the
   * set's start, `FUN_0026c600` D:L116360-116372, starting each animation the gate passes (`AUTOSTART_INITIAL_READING`,
   * research 115 R115.6's reading). The room leaves this unset -- the wire stays the opening state.
   */
  runAutostartPrograms = false;
  /**
   * The unit draw those programs' `RANDOM_WEIGHT` and ranged `WAIT`s take (`FUN_0025dcf0` D:L107783-107792, `rand() /
   * 2^31`). Other scene programs keep 0.5, the draw their tests were written against.
   */
  autostartRandom: () => number = Math.random;
  /**
   * LATER 409 F1: the effect runner's ambient effects (`EffectData.ambient`, lower case) -- the autostarts it plays,
   * found by `effectData.ts` `draws` over the map's set and the effect library (a `CALL_ANIMATION` into the common set
   * that draws). Null until the page hands them over (`setAmbient`); meanwhile the map's own programs decide
   * (`drawsAmbient`), which cannot see a library call.
   */
  private ambient: ReadonlySet<string> | null = null;

  constructor(readonly meta: MapMeta, readonly ground: GroundData, readonly grid: Grid, hooks?: WorldHooks) {
    this.base = ground.owners.map((o) => o.flags);
    if (hooks) this.hooks.push(hooks);
    this.scene = meta.scene ?? { destructibles: [], programs: [] };
    this.health = new SceneHealth(this.scene.destructibles, this);
    this.debris = new Set(meta.initial.filter((e) => e.saveParent).map((e) => e.path));
  }

  /** `Grid.revision`: what the cached readers compare against. */
  get revision(): number {
    return this.grid.revision;
  }

  /** Whether the node at `path` is active: its own flag and every ancestor's (`under`). */
  isActive(path: string): boolean {
    return activeIn(this.own, path);
  }

  /**
   * Sets the node at `path` active or not -- its own flag: every owner and placement under it follows (`under`: the
   * path, `path/`, `path=`), a descendant turned off on its own staying off. False when its flag already was `on`.
   */
  setActive(path: string, on: boolean): boolean {
    if ((this.own.get(path) ?? true) === on) return false;
    const was = new Map(this.own);
    this.own.set(path, on);
    this.sync(was, [path]);
    return true;
  }

  /**
   * zAnim's initial state (`FUN_0026b5e0` D:L115740-115750; `MapMeta.initial`): the bit-31 nodes made inactive, then the
   * bit-28 nodes' state saved (`save`). Called once, before the first spawn.
   */
  applyInitial(): void {
    const was = new Map(this.own);
    const changed: string[] = [];
    for (const e of this.meta.initial) {
      if (!e.deactivate || this.own.get(e.path) === false) continue;
      this.own.set(e.path, false);
      changed.push(e.path);
    }
    this.initialOwn.clear();
    for (const [path, on] of this.own) this.initialOwn.set(path, on);
    this.save();
    this.sync(was, changed, changed.length > 0);
    if (this.runAutostartPrograms) this.startAutostarts();
  }

  /** Saves the active state of every node a reference saves (bit 28; `FUN_0026b5e0`). */
  save(): void {
    this.saved = new Map(this.meta.initial.filter((e) => e.saveActive).map((e) => [e.path, this.own.get(e.path) ?? true]));
  }

  /**
   * The round's reset (`FUN_002ac0e0` D:L151976-151991): the saved nodes back to their saved state (`FUN_0026b430`,
   * WORLD_RESET_SAVED_READING), the action valves to 0, the running animations stopped and the uses cleared
   * (`FUN_002b5510` D:L157445-157456), the health with them (MAP-06: `FUN_00273960`, `FUN_00273ee0`); the revision
   * moves whatever changed. Then, as the original starts the sets again after its restore, every autostart's opening
   * `OBJECT_ACTIVE_STATE` commands are re-applied in order (`MapMeta.autostart`, `./mapMeta` `AUTOSTART_RESET_READING`):
   * a node no reference saves (MP73's `radio_call`, `chopper1`) is set as the restarted animation sets it.
   */
  reset(): void {
    // PB-9b: the running animations stopped first, as `FUN_002232a0` stops the sets (`FUN_0026c2e0`, D:L75851-75866)
    // before the saved references come back -- each stop runs its cleanup (`EffectRun.stop`): a base's pulse turns its
    // outline off.
    for (const r of [...this.runs]) r.run.stop();
    this.displayed.clear();
    const was = new Map(this.own);
    const changed: string[] = [];
    for (const [path, on] of this.saved) {
      if ((this.own.get(path) ?? true) === on) continue;
      this.own.set(path, on);
      changed.push(path);
    }
    // W0 (`./mapMeta` AUTOSTART_RESET_READING): the sets started again -- each autostart's opening commands, in order.
    for (const { path, on } of this.meta.autostart ?? []) {
      if ((this.own.get(path) ?? true) === on) continue;
      this.own.set(path, on);
      changed.push(path);
    }
    this.valves.clear();
    this.used.clear();
    this.runs = [];
    this.health.reset();
    this.sync(was, changed, true);
    // AS-1: the sets started again (`FUN_0026c600`), the page's programs with them. The opening commands above are the
    // room's; the programs are not (`runAutostartPrograms`).
    if (this.runAutostartPrograms) this.startAutostarts();
  }

  /** An action valve's value (the short at `CValve+4`); 0 when never set. */
  valve(name: string): number {
    return this.valves.get(name) ?? 0;
  }

  setValve(name: string, v: number): void {
    this.valves.set(name, v);
  }

  /** Whether the action has been used this round (its `+0x3f` bit 1; `FUN_002b5510` clears it). */
  actionUsed(id: number): boolean {
    return this.used.has(id);
  }

  markUsed(id: number): void {
    this.used.add(id);
  }

  /** MAP-03's wire: every placed node whose own flag differs from its flag after `applyInitial`, in id order. */
  states(): InstanceState[] {
    const paths = new Set([...this.own.keys(), ...this.initialOwn.keys()]);
    const out: InstanceState[] = [];
    for (const path of paths) {
      const active = this.own.get(path) ?? true, initial = this.initialOwn.get(path) ?? true;
      if (active === initial) continue;
      const id = this.meta.instanceByPath.get(path);
      if (id !== undefined) out.push({ id, path, active, initial });
    }
    return out.sort((a, b) => a.id - b.id);
  }

  /**
   * A server's states (MAP-03's `applyWire`; `states()`'s list): each listed instance's own flag as listed, every other
   * node's back at its flag after `applyInitial` -- the list is the whole of how the world differs from its opening.
   * A live destructible whose target this turns off died in the room (`SCENE_DEATH_ON_WIRE_READING`; one a target, none
   * under another dead one's target): spent here, its death's sequences run for their effects once -- unless `silent`,
   * the game's `skip_effects` (a joiner's state); a spent one whose target it turns back on is whole again.
   */
  apply(states: readonly { id: number; active: boolean }[], silent: boolean): void {
    const want = new Map(this.initialOwn);
    for (const s of states) {
      const path = this.meta.instances[s.id]?.path;
      if (path !== undefined) want.set(path, s.active);
    }
    // SUP-02 (SCENE_DEATH_ON_WIRE_READING): the live destructibles before the room's state is laid on.
    const live = this.scene.destructibles.filter((d) => !this.health.isSpent(d.id) && this.isActive(d.targetPath));
    const gone = this.scene.destructibles.filter((d) => this.health.isSpent(d.id) && !this.isActive(d.targetPath));
    this.lay(want);
    for (const d of gone) if (this.isActive(d.targetPath)) this.health.revive(d.id);
    // The room ran one death where several records' targets went off: one a distinct target (the first record bound to
    // it, `SceneHealth.at`'s pick), none for a record whose target is under another's, and none for a record whose
    // animation another's death runs as a program (MP7's `ant_base1` calls `spinner_hit`; its record is not spent).
    const off = live.filter((d) => !this.isActive(d.targetPath));
    const called = new Map(off.map((d) => [d.id, this.runsOf(d.program)]));
    const died = off.filter((d, i) => off.findIndex((e) => e.targetPath === d.targetPath) === i
      && !off.some((e) => e.targetPath !== d.targetPath && under(d.targetPath, e.targetPath))
      && !off.some((e) => e !== d && called.get(e.id)!.has(d.anim.toLowerCase())));
    // PF.R26: the page's run is presentation only (`SceneRunContext.presentation`): nothing to lay back afterwards.
    for (const d of died) this.health.takeDeath(d.id, !silent);
  }

  /**
   * The animations a program runs, at any depth, by lower-case name: its `CALL_ANIMATION`s and its `EXECUTE_ACTION`s'
   * (the action whose valve it names, its first animation: `executeAction`).
   */
  private runsOf(program: EffectProgram): Set<string> {
    const out = new Set<string>();
    const walk = (p: EffectProgram): void => {
      for (const seq of p.sequences) {
        for (const op of seq.ops) {
          let name: string | undefined;
          if (op.op === 'call') name = op.anim;
          else if (op.op === 'executeAction') name = this.meta.actions.find((a) => a.valve.toLowerCase() === op.anim.toLowerCase())?.anims[0];
          if (name === undefined || out.has(name.toLowerCase())) continue;
          out.add(name.toLowerCase());
          const lib = this.program(name);
          if (lib) walk(lib.program);
        }
      }
    };
    walk(program);
    return out;
  }

  /** The own flags made `want`'s (absent: on), the drawing and the revision told of what changed. */
  private lay(want: ReadonlyMap<string, boolean>): void {
    const was = new Map(this.own);
    const changed: string[] = [];
    for (const path of new Set([...this.own.keys(), ...want.keys()])) {
      const on = want.get(path) ?? true;
      if ((this.own.get(path) ?? true) === on) continue;
      this.own.set(path, on);
      changed.push(path);
    }
    if (changed.length) this.sync(was, changed);
  }

  /**
   * MAP-03's wire (protocol 10, `./net/protocol` `EnvWire`): the world for a welcome or a snapshot -- the revision, the
   * round epoch the room names (`Room.roundSerial`), and the WHOLE of `states()` (never a delta: `apply` takes its list
   * as the whole difference, research 209 s8).
   */
  wireAll(epoch = 0): EnvWire {
    return { revision: this.revision, epoch: epoch & 0xffff, states: this.states().map((s) => ({ id: s.id, active: s.active })) };
  }

  /** A room's `EnvWire` laid on this world (`apply`; `silent` the game's `skip_effects`). The epoch is the caller's to check. */
  applyWire(env: EnvWire, silent: boolean): void {
    this.apply(env.states, silent);
  }

  /** One step of the world's running programs (MAP-06: the deaths' sequences, the actions' animations). */
  step(dt: number): void {
    for (const r of [...this.runs]) r.run.update(dt);
    this.runs = this.runs.filter((r) => !r.run.finished);
  }

  /** Whether a scene program is running (a death's sequence, an action's animation). */
  get busy(): boolean {
    return this.runs.some((r) => !r.run.finished);
  }

  /** The set's program by name (case aside): the first of the name (`MapMeta.scene`). */
  program(name: string): SceneProgram | undefined {
    const n = name.toLowerCase();
    return this.scene.programs.find((p) => p.program.name.toLowerCase() === n);
  }

  /**
   * Starts a scene program with its context (`FUN_00272bb0`): its timeless head runs now, as the game's first tick, the
   * rest at `step`. `action` is the `MapMeta.actions` index it runs for (`executeAction`), -1 for none.
   */
  runProgram(program: EffectProgram, ctx: WorldRunContext, action = -1): EffectRun {
    const run = new EffectRun(program, this.sceneHost, ctx);
    this.runs.push({ run, action });
    run.update(0);
    return run;
  }

  /**
   * PB-9b (research 284 s3, s8; ruling PB2.R5): a program of the set run for the page's drawing alone -- the bases'
   * `pulse_terrorist` / `pulse_seal`, which the map's `objectives` calls on the bomb's pickup (`./bombPage` `worldPulse`).
   * Its `OBJECT_ACTIVE_STATE` draws its node (`visible`) and leaves the world's own flags -- the wire's state, the
   * room's -- as they are; its `OBJECT_OPACITY_FROM_TO` reaches the `opacity` hook. Its references are placed over the
   * world (`placeRefs`, no scope). False when the set has no program of the name (a Breach map's `pulse_seal`: nothing
   * drawn, research 284 s5) or one of it still runs: a call of a running animation starts none (`FUN_002734b0`
   * D:L120717-120801, `FUN_00270ef0` D:L119201). Presentation only: the room runs none (`ROOM_SKIP_EFFECTS_READING`).
   * BASE_PULSE_MISSING_CALL_READING (research 284 s5, s7; a note, no constant): a Breach map's `bomb_owner == 2` pickup
   * calls the `pulse_seal` its set lacks; read as nothing drawn -- the false return here -- `FUN_0025d5c0`'s miss path
   * (D:L107485ff) not read.
   */
  runDisplay(name: string): boolean {
    const lib = this.program(name);
    if (!lib || this.running(name)) return false;
    const nodes = placeRefs(this.meta, lib.program.nodes, lib.search, lib.program.root, null, lib.parents);
    this.runProgram(lib.program, { root: nodes[lib.program.root] ?? null, nodes, caller: null, valve: null, silent: false, display: true });
    return true;
  }

  /**
   * PB-9b's development read (`./hook` `ViewerHook.basePulse`; an instrument, no behaviour): the display runs going now
   * (`runDisplay`: the bases' pulse), by program name, and each node a display run draws now (`display`) at the last
   * opacity a program wrote it. Empty after a drop (the stop's cleanup turns the outline off) and after the reset.
   */
  basePulse(): { running: string[]; opacity: Record<string, number> } {
    const running = this.runs.filter((r) => !r.run.finished && (r.run.context as WorldRunContext).display === true).map((r) => r.run.program.name);
    const opacity: Record<string, number> = {};
    for (const path of this.displayed) { const f = this.opacities.get(path); if (f !== undefined) opacity[path] = f; }
    return { running, opacity };
  }

  /**
   * The forge's placed plant sites' outlines (`./forge/siteOutlines`; a browser adaptation, FG.R2): a node no program of
   * the set names, drawn on or off for the page alone (no world flag of its own: the map's scene does not hold it). What
   * `./bombPage` `worldPulse` drives where the map's `objectives` has no outline of its own to light.
   */
  displayNode(path: string, on: boolean): void {
    if (on) this.displayed.add(path); else this.displayed.delete(path);
    this.emit(path, on);
  }

  /** `displayNode`'s opacity: the node's opacity now, as a display run's `OBJECT_OPACITY_FROM_TO` writes it. */
  displayOpacity(path: string, opacity: number): void {
    this.opacities.set(path, opacity);
    for (const h of [...this.hooks]) h.opacity?.(path, opacity);
  }

  /** Whether a program of the name (case aside) is running. */
  running(name: string): boolean {
    const n = name.toLowerCase();
    return this.runs.some((r) => !r.run.finished && r.run.program.name.toLowerCase() === n);
  }

  /**
   * `STOP_ANIMATION` from the page (PB-9b: `bomb_drop`'s, research 284 s3): every running program of the name stopped,
   * its cleanup run (`EffectRun.stop`; `FUN_0025d490` D:L107435-107462 -> `FUN_002707c0` D:L118829ff).
   */
  stopProgram(name: string): void {
    const n = name.toLowerCase();
    for (const r of [...this.runs]) if (!r.run.finished && r.run.program.name.toLowerCase() === n) r.run.stop();
    this.runs = this.runs.filter((r) => !r.run.finished);
  }

  /**
   * `EXECUTE_ACTION` (174 s3): the action whose valve is `valve` (`FUN_002b4e80`, `MapMeta.actions`, case aside) runs its
   * animation with its node and its valve as the context (`FUN_002b44e0`) -- refused while that action's animation
   * still runs (D:L156787), and (XR-04) once it was used this round (`markUsed`: a switch runs once a round; the game
   * hides the switch, research 213 s4). `silent` is a joiner's replay (`skip_effects` reads 1), the room's own world's
   * by default (`skipEffects`, ROOM_SKIP_EFFECTS_READING); `presentation` a page's run of the room's (PF.R26). True when
   * it started.
   */
  executeAction(valve: string, silent = this.skipEffects, presentation = false, tree?: object): boolean {
    // FORGE_SCRIPT_WRECK_ADAPTATION (`SceneHealth.wreck`): a Forge switch's wreck of a placed damage trigger is its death.
    const wrecked = this.health.wreck(valve, silent, presentation);
    if (wrecked !== null) return wrecked;
    const v = valve.toLowerCase();
    const i = this.meta.actions.findIndex((a) => a.valve.toLowerCase() === v);
    if (i < 0 || this.used.has(i) || this.runs.some((r) => r.action === i && !r.run.finished)) return false;
    const a = this.meta.actions[i]!;
    const lib = this.program(a.anims[0] ?? '');
    if (!lib) return false;
    const nodes = placeRefs(this.meta, lib.program.nodes, lib.search, lib.program.root, a.path, lib.parents);
    this.runProgram(lib.program, { root: nodes[lib.program.root] ?? null, nodes, caller: a.path, valve: a.valve, silent, presentation, ...(tree ? { tree } : {}) }, i);
    return true;
  }

  /**
   * P8 (`SWITCH_PREDICT_ADAPTATION`, `./actionPage`): every run of the predicted press `tree` (the token given to
   * `executeAction`) dropped where it stands -- its own, the programs of the set it called and the actions it executed
   * (the P8 review's F2) -- with no further command and no cleanup sequence, so nothing more is heard, when the room
   * refused the press. A presentation run changes no node or valve (PF.R26); the opacity it wrote is put back, each
   * node to its value before the tree first wrote it (1, the node's own, where none was written), and the drawing told.
   * A network adaptation with no original (the original has no refusal to run back).
   */
  dropTree(tree: object): void {
    this.runs = this.runs.filter((r) => r.run.finished || (r.run.context as WorldRunContext).tree !== tree);
    const before = this.treeOpacity.get(tree);
    if (!before) return;
    this.treeOpacity.delete(tree);
    for (const [path, was] of before) {
      if (was === undefined) this.opacities.delete(path); else this.opacities.set(path, was);
      for (const h of [...this.hooks]) h.opacity?.(path, was ?? 1);
    }
  }

  /**
   * AS-1: every animation that starts with its set (`AUTOSTART_INITIAL_READING`, `params.flags & 3 == 1`), except the
   * mode script `objectives`. The room already runs that script (round cues, the bomb, extraction; research 237 HX.R6,
   * research 174 LATER 149). A second copy would post its lines and music beside the room's. Browser adaptation: it
   * does not change the round. Each other program runs for the drawing (`display`, `presentation`: PF.R26 -- active
   * commands draw, valves are not written, the wire's own flags stay the opening fold). A program the effect runner
   * already plays (`ambientOwned`) keeps its sounds and calls there.
   */
  private startAutostarts(): void {
    for (const lib of this.scene.programs) {
      if (!AUTOSTART_INITIAL_READING.startsWithSet(lib.program.flags)) continue;
      if (lib.program.name.toLowerCase() === 'objectives') continue;
      if (this.running(lib.program.name)) continue;
      const nodes = placeRefs(this.meta, lib.program.nodes, lib.search, lib.program.root, null, lib.parents);
      this.runProgram(lib.program, {
        root: nodes[lib.program.root] ?? null, nodes, caller: null, valve: null, silent: false,
        display: true, presentation: true, autostart: true,
        autostartName: lib.program.name,
      });
    }
  }

  /**
   * LATER 409 F1: the effect runner's ambient effects (`EffectData.ambient`), or null (none landed). Read at each
   * command, so a run started before the effect data landed (`./main` asks for it once the map is shown) leaves its
   * sounds and calls to the effect runner from then on.
   */
  setAmbient(names: readonly string[] | null): void {
    this.ambient = names ? new Set(names.map((n) => n.toLowerCase())) : null;
  }

  /** Whether the effect runner already plays the autostart `ctx` runs for (`setAmbient`, else `drawsAmbient`). */
  private ambientOwned(ctx: WorldRunContext): boolean {
    const name = ctx.autostartName;
    if (name === undefined) return false;
    return this.ambient ? this.ambient.has(name.toLowerCase()) : drawsAmbient(this.scene.programs, name);
  }

  /**
   * The host the scene programs run on (`./effectRunner`; the `DoorSet` host is the model): `OBJECT_ACTIVE_STATE` on the
   * world's nodes, `VALVE` on its valves (the context's with flag bit 0), `EXECUTE_ACTION`, `CALL_ANIMATION` at the
   * caller's root (`SCENE_INSTANCE_SCOPE_READING`), the effects to the hooks.
   */
  private readonly sceneHost: EffectHost = {
    random: (run) => ((run.context as WorldRunContext).autostart ? this.autostartRandom() : 0.5),
    test: (c: EffectCondition, run: EffectRun): boolean => {
      if (c.kind !== 'valve') return false;
      const ctx = run.context as SceneRunContext, name = c.context ? ctx.valve : c.valve;
      return valveTest(name === null ? 0 : this.valveIn(ctx, name), c.operation, c.operand);
    },
    begin: (op: EffectOp, run: EffectRun) => {
      const ctx = run.context as WorldRunContext;
      const at = (node: number): string | null => (node === NODE_ROOT ? ctx.root : node === NODE_CALLER ? ctx.caller : ctx.nodes[node] ?? null);
      switch (op.op) {
        // PF.R26: a presentation run (a page's death off the wire) turns no node and sets no valve; an action it executes
        // runs as presentation too (Vigilance's sound lives in the action's destroy program).
        // XR-04 (DEBRIS_NODE_READING, PF.R29): a silent run never turns flown debris on.
        case 'active': {
          const p = at(op.node);
          if (p !== null && ctx.display) { this.display(p, op.on); return; }
          if (p !== null && !ctx.presentation && !(ctx.silent && op.on && this.debris.has(p))) this.setActive(p, op.on);
          return;
        }
        // PB-9b: a node's opacity, to the drawing (`FUN_0025f960` / `FUN_0025f880`, `opacityTick`); a node not placed
        // ends the command at once, as `FUN_0025f880` does with no node (D:L108815-108817).
        case 'opacity': {
          const p = at(op.node);
          if (p === null) return;
          const tree = ctx.tree;
          if (tree) {
            // P8's review F2: what the drop of a refused press puts back.
            let before = this.treeOpacity.get(tree);
            if (!before) this.treeOpacity.set(tree, before = new Map());
            if (!before.has(p)) before.set(p, this.opacities.get(p));
          }
          return opacityTick(op, (f) => { this.opacities.set(p, f); for (const h of [...this.hooks]) h.opacity?.(p, f); });
        }
        case 'valve': {
          const name = op.context ? ctx.valve : op.valve;
          // FORGE_SCRIPT_VALVE_ADAPTATION (the owner, 2026-11-08; a browser adaptation, FG.R2): a page's presentation run
          // writes no valve (PF.R26) -- but a Forge switch's own valve and its scripts' flags are no room's wire: every
          // page plays every press of them in order (the room's `action` events), so it keeps them itself, and a toggle's
          // next pull, or an `if` on a flag, plays what the room's run does. A disc program's valves are as before.
          if (ctx.presentation && !(name !== null && isForgeScriptValve(name))) return;
          if (name !== null) this.setValve(name, valveApply(this.valveIn(ctx, name), op.operation, op.operand));
          return;
        }
        case 'executeAction': this.executeAction(op.anim, ctx.silent, ctx.presentation === true, ctx.tree); return;
        case 'call': {
          if (this.ambientOwned(ctx)) return;
          const lib = this.program(op.anim);
          // COMMON_EFFECT_CALL_READING: an animation the set lacks is the page's effect, at the calling program's root.
          if (!lib) { if (ctx.presentation) for (const h of [...this.hooks]) h.call?.(op.anim, ctx.root); return; }
          const nodes = placeRefs(this.meta, lib.program.nodes, lib.search, lib.program.root, ctx.root, lib.parents);
          this.runProgram(lib.program, { ...ctx, root: nodes[lib.program.root] ?? null, nodes });
          return;
        }
        case 'sound':
          if (this.ambientOwned(ctx)) return;
          if (op.newPlay !== false) for (const h of [...this.hooks]) h.sound?.(op.sound, at(op.node) ?? ctx.root, op.volume);
          return;
        case 'particles':
          if (this.ambientOwned(ctx)) return;
          for (const h of [...this.hooks]) h.particles?.(op.source, ctx.root);
          return;
        case 'destruction': for (const h of [...this.hooks]) h.destruction?.(at(op.node) ?? ctx.root); return;
        case 'message':
          if (ctx.silent || op.text === null) return;
          for (const h of [...this.hooks]) h.message?.(op.text, op.colour);
          return;
        case 'fireWeapon': {
          // BRIDGE_FIRE_WEAPON_READING (research 213 s2.2, s6; ruling PF.R32): a disc program's `fireWeapon` -- no blast,
          // no damage. FORGE_SCRIPT_BLAST_ADAPTATION: a Forge script's to the hooks (`WorldHooks.scriptRound`, `blast`).
          if (!op.forge || this.ambientOwned(ctx)) return;
          const p = at(op.node) ?? ctx.root;
          if (!ctx.silent) for (const h of [...this.hooks]) h.scriptRound?.(op, p);
          if (!ctx.presentation) for (const h of [...this.hooks]) h.blast?.(op, p);
          return;
        }
        // SI_SCRIPT_MOTION_PLACEHOLDER (AS-1): `OBJECT_MOTION_SI_SCRIPT` (command 26) falls here too -- no motion, done
        // in the tick it begins (its begin and tick unread).
        default: return;
      }
    },
  };

  /**
   * PB-9b: a display run's `OBJECT_ACTIVE_STATE` (`runDisplay`): the node drawn on while every ancestor is active, or
   * drawn as the world's own flags have it when turned off.
   */
  private display(path: string, on: boolean): void {
    if (on) this.displayed.add(path); else this.displayed.delete(path);
    const ancestors = [...this.own].every(([root, own]) => own || root === path || !under(path, root));
    this.emit(path, on ? ancestors : this.isActive(path));
  }

  /** A valve as a program reads it: `skip_effects` is 1 in a joiner's replay (`SceneRunContext.silent`). */
  private valveIn(ctx: SceneRunContext, name: string): number {
    return ctx.silent && name.toLowerCase() === SKIP_EFFECTS_VALVE ? 1 : this.valve(name);
  }

  /**
   * Where a program's sound at `path` plays (`SCENE_SOUND_PLACE_READING`): the centre of the box of the polygons at or
   * under it, where they stand now in the hull; null when none are.
   */
  placeOf(path: string): [number, number, number] | null {
    // FORGE_OBJECT_PLACE_ADAPTATION: a Forge object's place (an empty's, an ambient effect's: `MapMeta.forgePlaces`).
    const forge = this.meta.forgePlaces?.[path];
    if (forge) return [forge[0], forge[1], forge[2]];
    const polys = groundPolygons(this.ground);
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const o of this.ground.owners) {
      if (!under(o.path, path)) continue;
      for (const p of polys.slice(o.first, o.first + o.count)) {
        for (let k = 0; k < p.points.length; k += 3) {
          for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a]!, p.points[k + a]!); hi[a] = Math.max(hi[a]!, p.points[k + a]!); }
        }
      }
    }
    if (lo[0] === Infinity) return null;
    return [(lo[0]! + hi[0]!) / 2, (lo[1]! + hi[1]!) / 2, (lo[2]! + hi[2]!) / 2];
  }

  /** Hooks the world on; the returned function unhooks it. */
  on(hook: WorldHooks): () => void {
    this.hooks.push(hook);
    return () => {
      const i = this.hooks.indexOf(hook);
      if (i >= 0) this.hooks.splice(i, 1);
    };
  }

  /**
   * After own flags changed (`was` before): every owner's bit 0 set to its node's activity, the drawing told -- a path
   * turned on and active shown, then the nodes still off under it hidden again; a path turned off hidden -- and the
   * revision moved.
   */
  private sync(was: ReadonlyMap<string, boolean>, changed: readonly string[], bump = changed.length > 0): void {
    const owners = this.ground.owners;
    // R4B-09 (research 383): a node r0004 switched off at load stays off, whatever the zAnim references say.
    for (let i = 0; i < owners.length; i++) setOwnerActive(owners[i]!, this.base[i], !owners[i]!.switchedOff && activeIn(this.own, owners[i]!.path));
    const off = [...this.own].filter(([, on]) => !on).map(([path]) => path);
    for (const path of changed) {
      const on = this.own.get(path) ?? true;
      if ((was.get(path) ?? true) === on) continue;
      if (!on) { this.emit(path, false); continue; }
      if (!this.isActive(path)) continue;                     // an ancestor is still off: it stays hidden
      this.emit(path, true);
      // PB-9b: a node a display run has on stays drawn (`display`).
      for (const r of off) if (r !== path && under(r, path) && !this.displayed.has(r)) this.emit(r, false);
    }
    if (!bump) return;
    this.grid.revision++;
    for (const h of [...this.hooks]) h.changed?.(this.grid.revision);
  }

  private emit(path: string, on: boolean): void {
    for (const h of [...this.hooks]) h.visible?.(path, on);
  }
}

/**
 * `effectData.ts` `draws` over the map's own programs only: an autostart the effect runner already starts, because it or
 * a program it calls (four deep) draws particles or a light. Research 89 §12. The fallback until `setAmbient`: a call
 * into the effect library is not seen here.
 */
function drawsAmbient(programs: readonly SceneProgram[], name: string, depth = 0): boolean {
  const p = programs.find((x) => x.program.name.toLowerCase() === name.toLowerCase());
  if (!p || depth > 4) return false;
  return p.program.sequences.some((s) => s.ops.some((o) =>
    o.op === 'particles' || o.op === 'light' || (o.op === 'call' && drawsAmbient(programs, o.anim, depth + 1))));
}

/** Whether `path` and every ancestor of it are on in `own` (a path absent is on). */
function activeIn(own: ReadonlyMap<string, boolean>, path: string): boolean {
  for (const [root, on] of own) if (!on && under(path, root)) return false;
  return true;
}

/**
 * An owner's flag word for its node's activity: the hull's word with bit 0 set when active -- every node that carries
 * polygons on the 22 maps is active on the disc (research 23 s1.1, counted 2026-09-28), so the set bit is the disc's,
 * whatever a hull copied from a turned one carries -- and cleared when not. An owner inferred without the graph (no word)
 * keeps none while active (the gate's pass) and takes `m_hasDI` alone while not.
 */
function setOwnerActive(owner: CollisionOwner, base: number | undefined, on: boolean): void {
  if (base === undefined && on) { delete owner.flags; return; }
  const word = base ?? NODE_HAS_DI;
  owner.flags = on ? word | NODE_ACTIVE : word & ~NODE_ACTIVE;
}

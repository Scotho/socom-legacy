import { Euler, Group, LineSegments, Matrix4, Mesh, PlaneGeometry, Quaternion, Vector3, type Camera, type Material, type Object3D } from 'three';
import type { LineBasicNodeMaterial, MeshBasicNodeMaterial } from 'three/webgpu';
import {
  gridCast, launchGrenade, stepGrenade, materialAnim, launchMotion, launchTracer, NODE_CALLER, NODE_ROOT, probeFloor, segmentHit, stepMotion, stepTracer, tracerHead,
  GAME_FRAME_DT, TRACER_ANIM, TRACER_POOL,
  type DecalEntry, type EffectCondition, type EffectContext, type EffectOp, type EffectProgram, type Grenade, type Grid, type MotionState,
  type MotionWorld, type ObjectMotion, type TracerFlight, type TracerKind,
} from '@s2u/scene';
import type { Rgba } from '@s2u/gs';
import { EffectRun, indoorsOperand, type EffectHost, type OpTick } from './effectRunner';
import { buildEffectModel, effectBrighten, markMaterial } from './effectMaterials';
import { ParticleSystem } from './particles';
import type { AlphaPassSource } from './alphaInterleave';
import { EffectLights } from './effectLights';
import type { EffectData, EffectTexture } from './effectData';
import { markGeometry, paintMark, WALK_DECAL_RENDER_ORDER, type FireEvent, type MarkTable } from './fire';
import type { SurfaceShade } from './surfaceShade';
import { markClipGeometry, squareInto, type MarkClipper, type MarkFrame } from './markClip';
import { fixSoundName } from '@s2u/sound';
import { cameraFloor } from './floorPick';
import { worldColumn } from './net/placing';

/**
 * Full PreTick -> PostTick on the first visual round frame [placeholder: the initial scheduling is not yet read]: reuse
 * the existing projectile step, whose integration and timer arithmetic are readings (research 332 section 7).
 * FIRE_WEAPON's phase relative to the original pool is untraced; research 332 section 6 names what settles it.
 */
const SCRIPT_ROUND_INITIAL_PHASE_READING = stepGrenade;

/**
 * The items whose explosion sets no camera blast point: `HandleDetonateExplosion` `FUN_003c8330` D:L319186-319191 tests
 * the round's record's `+0x7c` -- its item id (the weapon list `0x4b5210` is searched by id at `+0x7c`: `FUN_003c4b40`
 * D:L316433-316449; research 181) -- against these twelve, in its order, and sets the pending point
 * (D:L319192-319195) for every other. MPBOMB (154, 0x9a) is not here.
 */
export const CAMERA_BLAST_EXEMPT_ITEMS: readonly number[] = [
  0xb6, 0xb2, 0xb1, 0xae, 0xad, 0xac, 0x9f, 0x80, 0x7f, 0x7b, 0x7d, 0x7a,
];

/**
 * The gunplay's effects (socomlegacy/docs/research/89), drawn in walk mode: the game's own zAnim effect animations out of the
 * map's `CZANIM.ZAR` and `MZANIM.ZAR`, run by the zAnim sequencer (`./effectRunner`) over the game's own models
 * (`EFFE_GEO`/`EFFE_MDL`) and particle textures (`ALPH_TXR`), in the world's GS arithmetic (`./effectMaterials`).
 *
 * - **A round** (`onRound`, from `Fire.subscribe`; the game's `FUN_005c5340`): the weapon's `FireAnimName` -- the M4A1
 *   SD's `muzzle_m4SD`, which calls `shell_eject` and `shell_smoke_med`; the M4A1's `muzzle_m4` adds `flash_fire_hider`;
 *   in the aim view the `_zoom` variant -- with the weapon's node, the `firepoint`'s place in it and the fire direction.
 * - **The flash follows the gun** (research 149): the muzzle animation is handed the weapon's node itself (`EffectPlace.node`
 *   an `Object3D`, the engine's type-3 pointer: `FUN_00272c30` D:L120469-120478), and every command that places something
 *   at the caller -- `fire_fix`'s rotate and translate once a tick (`FUN_00263890` D:L111288-111346), the `LIGHT`'s tick
 *   (`FUN_00264cb0` D:L111995-112031), a following particle source -- reads its matrix as it is that frame, so the flash
 *   and its light ride the muzzle while the SEAL runs and jumps; the position (type 5) is a value, the `firepoint`'s
 *   place in the weapon, carried through that matrix.
 * - **The casing** (`OBJECT_MOTION`, `@s2u/scene`'s `effectMotion`): thrown from the weapon's node to its right, tumbling,
 *   bouncing on the hull by its material's coefficient with its material's sound, gone at rest or at 1.2 s; at most
 *   four at once with the bounces (the `bullet_ejecting` valve), the rest a 0.7 s flight through everything.
 * - **The smoke** (`PARTICLE_SOURCE`, `./particles`): `shell_smoke_med`'s source is switched off in the retail data, so
 *   the rifles draw none; the particle manager runs every other source (the impacts, the grenades').
 * - **The impact** (`FUN_003c8920`): `bullet_hit_<material>` of the map's `MZANIM` at the hit, with the round's velocity
 *   and the surface normal -- sparks on metal, dust and chunks on stone and dirt, the splash and ring on water.
 * - **The marks** (`marks()`, for `Fire.setMarks`): `decals.rdr`'s row for the hit polygon's material.
 * - **`play(name, place)`**: any animation of the map's zAnim archives at a place -- the API the grenades take their
 *   impacts and explosions through (`frag_grenade_stone`, `he_grenade`, `grenade_hit_snow` ...).
 * - **A tracer** (`launchTracer`, research 89 §19): the kind's zAnim (`TRACER_ANIM`: `tracer_ally_anim` or
 *   `tracer_enemy_anim`) on an object the flight carries from the round's start toward its end, a game frame at a
 *   time (`FUN_003d5030`, `FUN_003d4bf0`); the original draws no model for it (`DAT_003e1568`). At most `TRACER_POOL`
 *   live; a full pool launches none. Without the zAnim the firearm keeps its one-frame line. `holdTracers` (a dev
 *   instrument) leaves a tracer at its end.
 */

export type Vec3 = [number, number, number];

/** TRAVERSAL SEAM: a running effect as `spawn` hands it back. */
/**
 * Where an effect plays: what the engine hands `FUN_00272bb0` (research 89 §1) -- the caller's node (type 3, the
 * commands' `NODE_CALLER`), a position (5), a velocity (6) and a direction (7). A round's muzzle animation gets the
 * weapon's node, the `firepoint`'s place in it and the fire direction (`FUN_005c5340`); a bullet's hit the hit point,
 * the round's direction and the surface normal (`FUN_003c8920`).
 */
export interface EffectPlace extends EffectContext {
  /**
   * The caller's node: the live node itself (its world matrix read afresh on every tick that places something at it,
   * as the engine resolves 0xfa through `FUN_00272390` to the context's node pointer each tick: `FUN_0026f4e0`
   * D:L118164-118168, D:L119952-119970), or a world matrix the caller moves in place (the ripples' node), or none.
   */
  node?: CallerNode | null;
}

/** A caller's node (the engine's type-3 parameter): the `Object3D` itself, or a `Matrix4` its owner moves in place. */
export type CallerNode = Object3D | Matrix4;

/** The effect animation a weapon's round plays: `FireAnimName`, or its `_zoom` variant in the aim view (89 §4). */
export function muzzleAnimation(fireAnim: string | null, zoomed: boolean): string | null {
  if (!fireAnim) return null;
  return zoomed ? `${fireAnim}_zoom` : fireAnim;
}

/** A round's impact animation (`FUN_003c4700`: `"%s_%s"` of the weapon's `HitAnimName` and the material's name). */
export function impactAnimation(hitAnim: string, material: string | undefined): string | null {
  return material ? `${hitAnim}_${material}`.toLowerCase() : null;
}

/**
 * The mark table the hit polygon's material resolves through (research 89 §5): the SOILS name, then the set's row --
 * none for a material without one (`FUN_003d0ba0`: no default).
 */
export function markTable(
  materials: readonly string[], rows: readonly DecalEntry[], bitmaps: ReadonlyMap<string, Rgba>, defaultMaterial = 0,
  material?: (texture: string) => Material | null,
): MarkTable {
  const byName = new Map(rows.map((r) => [r.material, r]));
  return {
    row: (m) => byName.get(materials[m === 0 ? defaultMaterial : m] ?? '') ?? null,
    bitmap: (texture) => bitmaps.get(texture.toLowerCase()) ?? null,
    ...(material ? { material } : {}),
  };
}

/**
 * `RANGE_TEST`'s comparison (`FUN_0025de90` D:L107912-107942): the squared distance between its two points against the
 * range at +0x24, by the first of the flag bits set -- 0x40 nearer than, 0x80 nearer or as near, 0x100 farther than,
 * 0x200 as far or farther, 0x400 exactly as far, 0x800 not as far; with none set it never holds. On the disc 0x40 is
 * `bullet_hit_person`'s (0x61: its close blood within 130 of the camera) and `raindrops01`'s (0x49, MP52), 0x100
 * `shell_eject`'s and the smokes' (0x109) and `camera_shake`'s (0x121) -- every RANGE_TEST of every MP map's
 * `CZANIM.ZAR` and `MZANIM.ZAR` (research 238 §8).
 */
export function rangeTestHolds(flags: number, distanceSquared: number, rangeSquared: number): boolean {
  if (flags & 0x40) return distanceSquared < rangeSquared;
  if (flags & 0x80) return distanceSquared <= rangeSquared;
  if (flags & 0x100) return distanceSquared > rangeSquared;
  if (flags & 0x200) return distanceSquared >= rangeSquared;
  if (flags & 0x400) return distanceSquared === rangeSquared;
  if (flags & 0x800) return distanceSquared !== rangeSquared;
  return false;
}

/** A running animation the caller keeps (the ripples' endless loops): its place can move, and it can be stopped. */
export interface EffectHandle {
  readonly name: string;
  /** Its place: move `place.node` (a `Matrix4`) in place to carry what follows it. */
  readonly place: EffectPlace;
  alive(): boolean;
  /** Ended (`!alive()`): the traversal's ripple keeper reads it. */
  readonly finished: boolean;
  stop(): void;
}

/** `FUN_0058a820`'s speed class, 0-based: still (|v|² < 0.25), moving, running (|v|² >= 400). */
export function speedClass(v: readonly number[]): 0 | 1 | 2 {
  const s = v[0]! * v[0]! + v[1]! * v[1]! + v[2]! * v[2]!;
  return s < 0.25 ? 0 : s < 400 ? 1 : 2;
}

/** The wading ripples by speed class (`FUN_005b52b0`, decomp 469808-469920): the body in the water, and under it. */
export const RIPPLES = {
  big: ['big_ripple_anim', 'big_ripple_anim_walk', 'big_ripple_anim_run'],
  small: ['small_ripple_anim', 'small_ripple_anim_walk', 'small_ripple_anim_run'],
} as const;

/** Every ripple loop's name, for the stats' `water.ripples` (the runs alive, whoever keeps them). */
const RIPPLE_NAMES: ReadonlySet<string> = new Set([...RIPPLES.big, ...RIPPLES.small]);
/** `seal_fall_in_water` (decomp 469892-469896): the fall's splash; its runs are the stats' `water.splashes`. */
const FALL_IN_WATER_ANIM = 'seal_fall_in_water';

/** A footprint's side (`FUN_005a3280`'s 3.5, decomp 460186) and the pool it shares with the marks' kind (150). */
export const FOOTPRINT_SIZE = 3.5;
export const MAX_FOOTPRINTS = 150;

/**
 * MAX_EFFECT_RUNS_ADAPTATION -- a browser adaptation with no original counterpart (the game's zAnim list is its own
 * pools'; nothing here reads it): the most effect runs the page holds, the rounds' oldest retired first, silently (`makeRoom`).
 * A hidden tab runs no animation frame, so the runs another player's rounds start off the socket were never stepped or
 * retired, and the return stepped -- and sounded -- every one at once (the owner's report, 2026-11-06: an audio fault
 * that "starts while the browser is tabbed off and never recovers"). Measured, not read: 16 shooters, each firing a
 * round that hits every game frame (`GAME_FRAME_DT`, faster than any firearm), stepped at 60 Hz on Frostfire's data,
 * peak at 983 runs (2026-11-06); the cap is over twice that bound, so no visible match meets it, and a stalled frame
 * loop's backlog stops at it (`effects.test.ts`, "a hidden tab's round backlog", which holds the 2x margin).
 */
export const MAX_EFFECT_RUNS_ADAPTATION = 2048;

/**
 * PLAYER_INDOORS_FEET_READING (INV-RAIN F3; research 89 §21, research 81 §10): `PLAYER_INDOORS` (set 0 command 72)'s
 * tick (0x2b3880) answers bit 2 of the player's byte `+0x1060`, 0 with no player; what sets that bit is not traced, and
 * the `m_inside` of the floor the ground probe picks under the player's feet stands in for it (`Effects.indoors`), the
 * same floor byte the camera's probe writes for `CAMERA_INDOORS` (66, `FUN_002dc180`). They differ in the original
 * only if the bit is set from something other than the feet's floor. Settled by tracing the writes of `+0x1060` bit 2.
 */
export const PLAYER_INDOORS_FEET_READING = 'feetFloorInside' as const;

/**
 * The camera's floor pick and its constant (INV-RAIN's review F1, research 89 §21): `./floorPick`'s, the one transcription
 * of `FUN_00295b00` -> `FUN_002d4c20` the sound (`./walkSounds`) and the eye's region (`./regionCull`) read too.
 */
export { CAMERA_FLOOR_ABOVE, cameraFloor } from './floorPick';

/** One live instance of an effect model (a casing, a flash), made for a run and dropped with it. */
interface Instance { object: Object3D; model: string }

/**
 * The tracer object's scale: the round builds its matrix as an identity scaled by 7.5 (`0x40f00000`, `FUN_003cabe0`
 * D:L320498-320502) and the launch sets it on the object (`FUN_00315820`, `FUN_003d5030` D:L327256-327257).
 */
export const TRACER_OBJECT_SCALE = 7.5;

/**
 * TRACER_ORIENTATION_READING: the object's rotation takes its +x to the shot's direction (`FUN_00306d40` from (1, 0, 0)
 * to the direction, then `FUN_00307170`, `FUN_003cabe0` D:L320508-320514); its roll about the shot -- `FUN_00306d40`'s
 * exact construction -- is unread, and the port rolls it to the world's up. The scale is `TRACER_OBJECT_SCALE`; the place
 * the flight's (`FUN_003157d0`). Was (#425's takeover, first cut): "the launch writes the object's place only". [reading]
 */
export const TRACER_ORIENTATION_READING = 'x along the shot, rolled to the world up' as const;

/**
 * TRACER_RETIRED_ANIM_READING: a retired tracer's zAnim runs out on its own. The launch keeps the anim's handle in the
 * pool slot's `+4` (D:L327210) and then writes 0 there (D:L327224), so the slot's free never stops it
 * (`FUN_003d4ed0` D:L327136-327137 stops a non-zero `+4` only): the anim plays its `redpuffs` and its 0.3 s wait to the
 * end. Whether a follow source on the freed, unlinked object still emits is unread; the port keeps the object where the
 * flight left it until the run ends. [reading]
 */
export const TRACER_RETIRED_ANIM_READING = 'runs out' as const;

/** One tracer in the pool: its flight and the zAnim run on its object. */
interface LiveTracer {
  kind: TracerKind;
  flight: TracerFlight;
  place: EffectPlace;
  pose: Matrix4;
  run: EffectRun;
}

interface RunContext {
  place: EffectPlace;
  instance: Instance | null;
  /** A map's ambient effect: its looping (`~`) sounds are the audio's emitters', not played here. */
  ambient?: boolean;
  /**
   * PAR-45 (research 283): the run whose `CALL_ANIMATION` started this one (`begin`'s `call`), so a handle's `stop()`
   * reaches it -- `smoke_grenade`'s `smoke_stream`. Held on the child, not as a list on the caller: an endless caller
   * (MP2's ambient `firey_flames` calling its lights on and off) keeps no growing list.
   */
  parent?: EffectRun;
  /** A round's run (`onRound`, and what its runs call): `retireRounds` lets it go at a hidden tab's return. */
  round?: boolean;
}

export interface EffectStats {
  loaded: boolean;
  programs: number;
  models: string[];
  textures: number;
  missing: string[];
  runs: number;
  played: Record<string, number>;
  shells: number;
  particles: number;
  sources: number;
  emitted: number;
  lastShell: { position: Vec3; velocity: Vec3 } | null;
  /** The `LIGHT` passes live now, begun so far, their overlays, and their ranges now. */
  lights: ReturnType<EffectLights['stats']>;
  /** The mission's ambient effects running now. */
  ambient: string[];
  /**
   * The SEAL's splashes (`seal_fall_in_water` runs started), the ripple loops running (`RIPPLES`' runs alive, whoever
   * keeps them: since PAR-10 the traversal's keeper, research 257 s3), the footprints placed.
   */
  water: { splashes: number; ripples: string; footprints: number };
  /** The effect models drawn now, by name. */
  shown: string[];
  /** Where the muzzle flash drawn now sits (its instance's origin: the muzzle), or null -- the browser spec's reading. */
  flashAt: Vec3 | null;
  /** Travelling tracers in the pool now (research 89 §19): each one's place and speed. */
  tracers: { kind: TracerKind; head: Vec3; speed: number }[];
  bounces: number;
  sounds: string[];
}

/** The zAnim main gravity (`Anim_Main_Params`, -98 on every archive: 77 §9). */
export const ZANIM_GRAVITY = -98;

const unit = (v: Vec3): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]); return l > 0 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 0, 0]; };

export class Effects {
  readonly object = new Group();
  private programs = new Map<string, EffectProgram>();
  private readonly models = new Map<string, Group>();
  private textures = new Map<string, EffectTexture>();
  private readonly materials = new Map<string, MeshBasicNodeMaterial | LineBasicNodeMaterial>();
  private runs: EffectRun[] = [];
  private readonly particles: ParticleSystem;
  /** The map's scene nodes the ambient effects sit at (`EffectData.sceneNodes`). */
  private sceneNodes = new Map<string, Matrix4>();
  /** The ambient effects running (`EffectData.ambient`). */
  private ambientRuns: EffectRun[] = [];
  /** The `LIGHT` commands' passes over the world (`./effectLights`). */
  readonly lights = new EffectLights();
  private readonly valves = new Map<string, number>();
  private readonly played: Record<string, number> = {};
  private grid: () => Grid | null = () => null;
  private bounces = 0;
  private lastShell: EffectStats['lastShell'] = null;
  private readonly sounds: string[] = [];
  private camera: Camera | null = null;
  private data: EffectData | null = null;
  /** Travelling tracers (`FUN_003d5030`'s pool). */
  private tracers: LiveTracer[] = [];
  /** The page's time not yet stepped into the tracers' game frames (`FUN_003d4bf0` runs once a game frame). */
  private tracerTime = 0;
  /** Research 332 section 7: local visual rounds outlive the one-command parent animation. */
  private scriptRounds: { round: Grenade; ready: boolean }[] = [];
  private scriptTime = 0;
  /**
   * A dev instrument, not the original's (`tracerhold`, with `devmode`; `./source` `tracerHold`): a tracer is put at
   * its end and not retired, so a freeze can look at it. Off unless that URL flag is set.
   */
  private tracerHold = false;
  /** Inside `onRound`: the runs started are a round's (`RunContext.round`). */
  private inRound = 0;
  /** Inside `update`'s stepping: a retired run leaves the list at the frame's sweep, not mid-step. */
  private stepping = false;
  /** Retiring (`makeRoom`, `retireRounds`): a stopped run's cleanup sounds nothing (MAX_EFFECT_RUNS_ADAPTATION). */
  private hush = 0;

  constructor(
    private readonly random: () => number = Math.random,
    private readonly sound: (name: string, at: Vec3, volume: number) => void = () => {},
  ) {
    this.object.name = 'effects';
    this.particles = new ParticleSystem(random);
    this.object.add(this.particles.object);
    this.object.add(this.lights.object);
  }

  /** What the lights re-draw (the world's group, the held weapon): `EffectLights.setReceivers`. */
  setLightReceivers(roots: () => Object3D[]): void {
    this.lights.setReceivers(roots);
  }

  /**
   * The camera's pending blast point (`HandleDetonateExplosion` `FUN_003c8330` D:L319186-319195: `DAT_004b51c8` and its
   * flag `DAT_004b51d8`, set for an item not on its list, `CAMERA_BLAST_EXEMPT_ITEMS`), for a script round's explosion
   * (research 332 section 7): the page shakes the camera by the distance (`./matchThrow` `blastPointShake`, the
   * grenades' rule: research 83, `FUN_00550ef0`). Null (the default): none.
   */
  setBlastPoint(listener: ((at: Vec3) => void) | null): void {
    this.blastPoint = listener;
  }

  private blastPoint: ((at: Vec3) => void) | null = null;

  /** The hull the casings bounce on (the walk's grid). */
  setWorld(grid: () => Grid | null): void {
    this.grid = grid;
  }

  /**
   * INV-RAIN F3: the local player's feet (`Walk.feet`: the mover's while walking, else null -- the last answer kept), for
   * `PLAYER_INDOORS` (72). Null (the default): no player, false.
   */
  setPlayer(feet: (() => Vec3 | null) | null): void {
    this.playerFeet = feet;
  }

  /**
   * INV-RAIN F3: the map's hull the indoors tests probe (`indoors`) -- the walk's grid while walking, else the map's own
   * (`Walk.gridOfGround`): a page off the walk (a spectator, the free camera) still has a camera whose floor the
   * original probes every frame (`FUN_00295b00`). Null (the default): `setWorld`'s grid.
   */
  setHull(grid: (() => Grid | null) | null): void {
    this.hull = grid;
  }

  private playerFeet: (() => Vec3 | null) | null = null;
  private hull: (() => Grid | null) | null = null;
  /** The camera's and the player's last indoors answers (`indoors`): kept where no floor is found. */
  private cameraInside = false;
  private playerInside = false;

  /**
   * INV-RAIN F3 (research 89 §21; research 81 §10): set 0's `CAMERA_INDOORS` (66) and `PLAYER_INDOORS` (72) answered from
   * the floor's `m_inside`, as `WalkSounds.frame` feeds `GameAudio.setEnvironment`.
   *
   * - **66**: the tick (0x2936b0, research 81) answers the byte the camera's floor probe writes at its `+0x2b8` from the
   *   polygon's `m_inside` (`FUN_002dc180`); `FUN_00295b00` probes under the camera node's world origin (`FUN_00310980`,
   *   D:L140037-140038) and writes the byte only when a floor is found (D:L140039, D:L140053-140055) -- so here the
   *   camera's own pick (`cameraFloor`: the highest floor at or below the camera), the last answer kept where none is.
   * - **72**: the tick (0x2b3880) answers bit 2 of the player's byte `+0x1060`, 0 with no player (research 81); what sets
   *   that bit is not traced, and the floor under the player's feet stands in for it (`PLAYER_INDOORS_FEET_READING`). No
   *   player (`setPlayer(null)`) answers false, the tick's 0. A player whose feet the walk does not give (`Walk.feet`
   *   null: fly mode, a dead page watching) or whose feet find no floor keeps the last answer: the bit keeps its value
   *   while the player object lives (the review's F4); `reset` (a new map) answers false again.
   *
   * Both probe `setHull`'s grid (the map's own off the walk), else `setWorld`'s.
   */
  private indoors(who: 'camera' | 'player'): boolean {
    const grid = this.hull?.() ?? this.grid();
    if (who === 'camera') {
      const cam = this.camera;
      if (!cam || !grid) return this.cameraInside;
      const at = new Vector3().setFromMatrixPosition(cam.matrixWorld);
      const floor = cameraFloor(grid, at.x, at.y, at.z)?.poly;
      if (floor) this.cameraInside = (floor.inside ?? 0) !== 0;
      return this.cameraInside;
    }
    if (!this.playerFeet) return (this.playerInside = false);
    const feet = this.playerFeet();
    if (!feet || !grid) return this.playerInside;
    const floor = probeFloor(grid, feet[0], feet[1], feet[2])?.poly;
    if (floor) this.playerInside = (floor.inside ?? 0) !== 0;
    return this.playerInside;
  }

  /** LATER 593: the world's alpha pass the particles are drawn between by range (`WorldView.alphaPass`); null, none. */
  setAlphaPass(source: AlphaPassSource | null): void {
    this.particles.setAlphaPass(source);
  }

  /** The frame's brighten, `1 + FIX/128` (`./lighting`'s `brightenOf`). */
  setBrighten(value: number): void {
    effectBrighten.value = value;
  }

  /** A map's effect data (`./effectData`), or null: the effects stop and their objects go. */
  setData(data: EffectData | null): void {
    this.reset();
    // The models' packet geometries are the map's own (`buildEffectModel`: one per packet); the runs' clones share them.
    for (const model of this.models.values()) model.traverse((o) => { if (o instanceof Mesh || o instanceof LineSegments) o.geometry.dispose(); });
    this.models.clear();
    for (const m of this.materials.values()) { m.map?.dispose(); m.dispose(); }
    this.materials.clear();
    this.data = data;
    this.programs = new Map();
    for (const p of data?.programs ?? []) if (!this.programs.has(p.name.toLowerCase())) this.programs.set(p.name.toLowerCase(), p);
    this.textures = new Map(data?.textures ?? []);
    this.particles.setTextures(this.textures);
    this.sceneNodes = new Map((data?.sceneNodes ?? []).map(([n, m]) => [n, new Matrix4().fromArray(m)]));
    this.lights.setTexture(this.textures.get('light_map.tif') ?? null);
    for (const model of data?.models ?? []) this.models.set(model.name, buildEffectModel(model, this.textures, this.materials));
    // The mission's ambient effects start with the map, as the game starts its activation-1 animations.
    for (const name of data?.ambient ?? []) {
      const program = this.programs.get(name.toLowerCase());
      if (program) this.ambientRuns.push(this.start(program, { node: null }, true));
    }
  }

  /**
   * Everything the map's effects draw with, in one group for the renderer to compile before the first shot (research
   * 90 item 16: the first explosion's frames up to 417 ms were first use -- programs built, bitmaps uploaded): the
   * effect models, a particle group per particle texture, the marks' and the footprints' materials; and the light
   * passes' overlays over every receiver, beside it (`EffectLights.warmMeshes`). `warmStarted` takes them out of the
   * drawn scene once the compile call has its list, `warmDone` after.
   */
  warmUp(): Group {
    const g = new Group();
    g.name = 'effects warm-up';
    g.position.set(0, -1e6, 0);
    const d = this.data;
    if (!d) return g;
    for (const model of this.models.values()) g.add(model.clone(true));
    const particleTextures = new Set<string>();
    for (const p of d.programs) for (const s of p.sequences) for (const o of s.ops) if (o.op === 'particles') for (const t of o.source.textures) particleTextures.add(t.name.toLowerCase());
    for (const m of this.particles.warm(particleTextures)) { m.visible = true; }
    // With the marks' own `color` lane (`markGeometry`): a quad without one linked another program, and the first mark
    // drawn linked its own (research 90 §9).
    // One material a bitmap, kept in `materials` (a footprint's the one `footfall` draws with) so the next `setData`
    // disposes it; one quad for the effects' life -- a material and a bitmap a row a map were never freed before.
    const rows: [string, string][] = [...d.marks.map((r): [string, string] => ['mark', r.texture]), ...d.footprints.map(([, t]): [string, string] => ['footprint', t])];
    for (const [kind, tex] of rows) {
      const t = this.textures.get(tex.toLowerCase());
      if (!t) continue;
      const key = kind === 'footprint' ? `footprint|${tex}` : `mark|${tex.toLowerCase()}`;
      let material = this.materials.get(key);
      if (!material) { material = markMaterial(t); this.materials.set(key, material); }
      g.add(new Mesh(this.warmQuad, material));
    }
    // The light passes' overlays, beside what they re-draw: the page compiles them with the scene.
    this.lights.warmMeshes();
    g.traverse((o) => { o.frustumCulled = false; });
    this.object.add(g);
    return g;
  }

  /**
   * The compile call has taken its list of what to build (synchronously): the warm-up's objects leave the drawn scene,
   * so the frames drawn while the programs build do not build them in the frame (research 90 item 19).
   */
  warmStarted(g: Group): void {
    this.object.remove(g);
    this.lights.warmHide();
  }

  /** The pre-warm is done: its group goes (the particle groups stay, hidden until they draw). */
  warmDone(g: Group): void {
    this.object.remove(g);
    this.lights.warmDone();
  }

  /** The per-material marks for `Fire.setMarks`, or null without the tables. */
  marks(): MarkTable | null {
    const d = this.data;
    if (!d || d.materials.length === 0 || d.marks.length === 0) return null;
    const bitmaps = new Map<string, Rgba>();
    for (const [name, t] of d.textures) bitmaps.set(name, t.rgba);
    return markTable(d.materials, d.marks, bitmaps, d.defaultMaterial, (texture) => {
      const t = this.textures.get(texture.toLowerCase());
      return t ? markMaterial(t) : null;
    });
  }

  /** Whether the map has an animation of that name (looked up without regard to case, as `FUN_0026a250` does). */
  has(name: string): boolean {
    return this.programs.has(name.toLowerCase());
  }

  /** Runs the animation `name` of the map's zAnim archives at `place`; false when the map has none of that name. */
  play(name: string, place: EffectPlace): boolean {
    return this.run(name, place) !== null;
  }

  /**
   * As `play`, with a handle on the run (to move and stop an endless one); null when the map has none of that name. Its
   * `stop()` stops the runs the run called too, all the way down (PAR-45, research 283: `smoke_grenade` calls
   * `smoke_stream` as a run of its own); `alive()` and `finished` are the run's own.
   */
  run(name: string, place: EffectPlace): EffectHandle | null {
    const program = this.programs.get(name.toLowerCase());
    if (!program) return null;
    const r = this.start(program, place);
    return { name: program.name, place, alive: () => !r.finished, get finished() { return r.finished; }, stop: () => this.stopCalled(r) };
  }

  /** `root` stopped, and every run it called, or a run it called called, still in the list (PAR-45). */
  private stopCalled(root: EffectRun): void {
    root.stop();
    for (const run of this.runs) {
      for (let up = (run.context as RunContext).parent; up; up = (up.context as RunContext).parent) {
        if (up === root) { run.stop(); break; }
      }
    }
  }

  // ---- the SEAL in water (FUN_005b52b0) and on sand and snow (FUN_005a3280) --------------------------------------

  private readonly footprints: Mesh[] = [];
  private nextFootprint = 0;
  private readonly footprintGeometry = new PlaneGeometry(1, 1);
  /** The warm-up's mark quad, with the marks' own `color` lane (`markGeometry`), made once. */
  private readonly warmQuad = markGeometry(new PlaneGeometry(1, 1));
  private water = { splashes: 0, footprints: 0 };
  /** The world's drawn colour under a footprint (`./surfaceShade`), or null: unity (research 89 §5, the mark's colour). */
  private shade: SurfaceShade | null = null;
  /** EFFECTS: the clip to the drawn world (`./markClip`), or null: the flat square with one shade. */
  private clipper: MarkClipper | null = null;
  private readonly footFrame: MarkFrame = { origin: [0, 0, 0], right: [0, 0, 0], up: [0, 0, 0], forward: [0, 0, 0], side: 0 };

  /** The world's drawn colour under a point, for the footprints (`./surfaceShade`); null: unity. */
  setShade(shade: SurfaceShade | null): void {
    this.shade = shade;
  }

  /** EFFECTS (research 89 §13): clip each footprint to the drawn ground under it, shaded per vertex (`./markClip`). */
  setClip(clipper: MarkClipper | null): void {
    this.clipper = clipper;
  }

  /** The footprints placed so far, oldest first until the pool wraps (tests). */
  footprintMeshes(): readonly Mesh[] {
    return this.footprints;
  }

  /**
   * A footfall (`FUN_005a3570`): the footprint of `decals.rdr`'s `FOOTSTEP_DECALS` for the ground's material -- SAND's
   * and SNOW's, none on the rest -- `FOOTPRINT_SIZE` across, flat on the ground, its length along the SEAL's forward
   * (`FUN_005a3280`, decomp 460186-460214). None prone. The game's `seal_footfall_<material>` zAnims are looked up and
   * exist on no map, so a footfall draws nothing else.
   */
  footfall(at: Vec3, material: number, normal: Vec3, forward: Vec3, prone: boolean): boolean {
    if (prone || !this.data) return false;
    const name = this.materialName(material);
    const texture = this.data.footprints.find(([m]) => m === name)?.[1];
    const t = texture ? this.textures.get(texture) : undefined;
    if (!t) return false;
    let mesh = this.footprints.length < MAX_FOOTPRINTS ? undefined : this.footprints[this.nextFootprint];
    const key = `footprint|${texture}`;
    let material3 = this.materials.get(key);
    if (!material3) { material3 = markMaterial(t); this.materials.set(key, material3); }
    if (!mesh) {
      mesh = new Mesh(this.clipper ? markClipGeometry() : markGeometry(this.footprintGeometry), material3);
      mesh.renderOrder = WALK_DECAL_RENDER_ORDER;        // OBF-32: a walk decal, after its ground's passes, under the particles (`./fire`)
      this.footprints.push(mesh);
      this.object.add(mesh);
    }
    this.nextFootprint = (this.nextFootprint + 1) % MAX_FOOTPRINTS;
    mesh.material = material3;
    const n = new Vector3(...normal).normalize();
    // Up the print: the SEAL's forward laid on the ground (`cross(cross(orient, n), n)`, the sign a reading).
    const f = new Vector3(...forward);
    const up = f.clone().addScaledVector(n, -f.dot(n));
    if (up.lengthSq() < 1e-9) up.set(1, 0, 0).addScaledVector(n, -n.x);
    up.normalize();
    const right = new Vector3().crossVectors(up, n).normalize();
    if (this.clipper) {
      // A `FUN_003139e0` decal (research 89 §13): clipped to the ground's drawn triangles, projected straight down on
      // them, each vertex the ground's colour there; the bare square at unity where nothing is drawn under it.
      if (!mesh.geometry.userData.markClip) { mesh.geometry.dispose(); mesh.geometry = markClipGeometry(); }
      const f = this.footFrame;
      f.origin[0] = at[0]; f.origin[1] = at[1]; f.origin[2] = at[2];
      f.right[0] = right.x; f.right[1] = right.y; f.right[2] = right.z;
      f.up[0] = up.x; f.up[1] = up.y; f.up[2] = up.z;
      f.forward[0] = -n.x; f.forward[1] = -n.y; f.forward[2] = -n.z;
      f.side = FOOTPRINT_SIZE;
      if (this.clipper.clip(f, mesh.geometry, 0.05) === 0) squareInto(f, mesh.geometry, 0.05, null);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.identity();
      mesh.visible = true;
      mesh.updateMatrixWorld(true);
      this.water.footprints++;
      return true;
    }
    if (mesh.geometry.userData.markClip) { mesh.geometry.dispose(); mesh.geometry = markGeometry(this.footprintGeometry); }
    // A footprint is a `FUN_003139e0` decal too: modulated by the ground's own drawn colour (research 89 §5).
    paintMark(mesh.geometry, this.shade?.(at, normal) ?? null);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.makeBasis(right.multiplyScalar(FOOTPRINT_SIZE), up.multiplyScalar(FOOTPRINT_SIZE), n)
      .setPosition(new Vector3(...at).addScaledVector(n, 0.05));
    mesh.visible = true;
    mesh.updateMatrixWorld(true);
    this.water.footprints++;
    return true;
  }

  /**
   * TRAVERSAL SEAM (web research 86 section 5.4): `play`, handing back the run -- whether it has finished, and a stop --
   * for an effect its caller keeps alive and replaces (`FUN_005b52b0`'s ripples: a new one only when the last ended).
   * The place is held, not copied: moving `place.position` moves the effect (the engine's tag-3 pointer).
   */
  spawn(name: string, place: EffectPlace): EffectHandle | null {
    return this.run(name, place);
  }

  private start(program: EffectProgram, place: EffectPlace, ambient = false, parent: EffectRun | null = null): EffectRun {
    this.played[program.name] = (this.played[program.name] ?? 0) + 1;
    if (program.name.toLowerCase() === FALL_IN_WATER_ANIM) this.water.splashes++;
    const round = this.inRound > 0 || (parent ? (parent.context as RunContext).round === true : false);
    const run = new EffectRun(program, this.host, { place, instance: null, ambient, ...(parent ? { parent } : {}), ...(round ? { round } : {}) } satisfies RunContext);
    if (this.runs.length >= MAX_EFFECT_RUNS_ADAPTATION) this.makeRoom();
    this.runs.push(run);
    run.update(0);
    return run;
  }

  /**
   * A round from `Fire` (research 89 §4, `FUN_005c5340`): the weapon's `FireAnimName` -- its `_zoom` variant in the aim
   * view -- with the weapon's node (the object itself: x along the barrel, y up, z to its right), the `firepoint`'s place
   * in it and the fire direction; then, where the round met the hull, `<HitAnimName>_<material>` (`FUN_003c8920`: the
   * map's `bullet_hit_metal_thick` ...) at the hit with the round's direction and the surface normal.
   */
  /** Whether this map can draw `kind`'s tracer: its zAnim is in the map's archives. False: the firearm keeps its one-frame line. */
  willDrawTracer(kind: TracerKind): boolean {
    return this.programs.has(TRACER_ANIM[kind].toLowerCase());
  }

  /** The dev instrument (`./source` `tracerHold`): leave a tracer at its end instead of retiring it. */
  holdTracers(on: boolean): void {
    this.tracerHold = on;
  }

  /**
   * `FUN_003d5030`: a tracer for the round from `from` to `to` -- the kind's zAnim on an object the flight carries
   * (research 89 §19). `range` the weapon's (`FireWeapon.range`), else the original's 300. False when the map holds no
   * zAnim for the kind, the pool is full (the original launches none), or the shot is under `TRACER_MIN_SHOT`.
   */
  launchTracer(from: readonly number[], to: readonly number[], kind: TracerKind, range?: number): boolean {
    const program = this.programs.get(TRACER_ANIM[kind].toLowerCase());
    if (!program || this.tracers.length >= TRACER_POOL) return false;
    const flight = launchTracer(from, to, this.random, range);
    if (!flight) return false;
    if (this.tracerHold) { const p = flight.pos; p[0] = flight.end[0]; p[1] = flight.end[1]; p[2] = flight.end[2]; }
    const pose = new Matrix4();
    this.aimTracer(pose, flight);
    const head = tracerHead(flight);
    const place: EffectPlace = { node: pose, position: [head[0], head[1], head[2]], velocity: [0, 0, 0] };
    const run = this.start(program, place);
    this.tracers.push({ kind, flight, place, pose, run });
    return true;
  }

  /** The run on a tracer's object outlives its program until the flight retires (`tracerHolds`). */
  private tracerHolds(run: EffectRun): boolean {
    return this.tracers.some((t) => t.run === run);
  }

  /**
   * The page's `dt` in whole game frames: each frame first frees the tracers that retired on the frame before
   * (`FUN_003d4ed0`, D:L327043), then steps the rest (`FUN_003d4bf0`) -- so a tracer is drawn at its end for one frame.
   */
  private stepTracers(dt: number): void {
    if (this.tracerHold) {
      for (const t of this.tracers) { t.flight.done = false; this.placeTracer(t); }
      return;
    }
    this.tracerTime += dt;
    const frames = Math.floor((this.tracerTime + 1e-9) / GAME_FRAME_DT);
    this.tracerTime = Math.max(0, this.tracerTime - frames * GAME_FRAME_DT);
    for (let k = 0; k < frames; k++) {
      for (const t of this.tracers.filter((x) => x.flight.done)) this.retireTracer(t);
      for (const t of this.tracers) stepTracer(t.flight, GAME_FRAME_DT);
    }
    for (const t of this.tracers) this.placeTracer(t);
  }

  /**
   * FIRE_WEAPON's pool round: the shared projectile step moves it and counts the fuse; the next frame emits
   * (FUN_003c9fb0 D:L320104-320129, FUN_003ca5a0 D:L320411-320420). Research 332 section 7.
   * Pure presentation: no player/scene damage and no network message. The room already owns those.
   */
  private stepScriptRounds(dt: number): void {
    if (this.scriptRounds.length === 0) { this.scriptTime = 0; return; }
    this.scriptTime += dt;
    while (this.scriptTime + 1e-9 >= GAME_FRAME_DT) {
      this.scriptTime = Math.max(0, this.scriptTime - GAME_FRAME_DT);
      const held: typeof this.scriptRounds = [];
      for (const r of this.scriptRounds) {
        const grid = this.grid();
        const cast = grid ? gridCast(grid, this.materialName(0)) : () => [];
        if (!r.ready) {
          // Zero muzzle speed still falls (FUN_003ca5a0 D:L320297-320379). The existing projectile step owns
          // gravity, collision and both timers; its events are presentation only, never applied as damage.
          r.ready = SCRIPT_ROUND_INITIAL_PHASE_READING(r.round, GAME_FRAME_DT, cast).some(e => e.kind === 'explode');
          if (r.ready || r.round.state !== 'removed') held.push(r);
          continue;
        }
        const { pos: position, record } = r.round;
        // FUN_003c8330 D:L319216-319246: highest column hit <= y + 0.5, within 10 below;
        // its material's animation when present, otherwise the weapon's default (both from ZWEAPON).
        const hit = grid ? worldColumn(cast, position).find(h => h.point[1] <= position[1] + 0.5) : undefined;
        const variant = hit && hit.point[1] > position[1] - 10 && record.materialAnim
          ? materialAnim(record.materialAnim, hit.material.name) : null;
        this.play(variant && this.has(variant) ? variant : record.explosionAnim, { position });
        // FUN_003c8330 D:L319186-319195: an item not on the list sets the camera's pending blast point, read by the
        // camera's shake by the distance (research 83, FUN_00550ef0) -- the page's (`setBlastPoint`).
        if (!CAMERA_BLAST_EXEMPT_ITEMS.includes(record.id)) this.blastPoint?.([position[0], position[1], position[2]]);
      }
      this.scriptRounds = held;
    }
  }

  private placeTracer(t: LiveTracer): void {
    const head = tracerHead(t.flight);
    const p = t.place.position ?? (t.place.position = [0, 0, 0]);
    p[0] = head[0]; p[1] = head[1]; p[2] = head[2];
    this.aimTracer(t.pose, t.flight);
  }

  /** The flight's place wins over the animation's own motion (`FUN_003157d0` each frame). */
  private poseTracers(): void {
    for (const t of this.tracers) {
      const inst = (t.run.context as RunContext).instance;
      if (inst) this.applyPose(inst.object, t.pose);
    }
  }

  /**
   * The slot freed (`FUN_003d4ed0`): the tracer leaves the pool; its zAnim is not stopped -- it runs out where the flight
   * left it, and the update drops its object when the run ends (`TRACER_RETIRED_ANIM_READING`).
   */
  private retireTracer(t: LiveTracer): void {
    const i = this.tracers.indexOf(t);
    if (i >= 0) this.tracers.splice(i, 1);
  }

  /** The object at the flight's place, turned along the shot and scaled (`TRACER_ORIENTATION_READING`, `TRACER_OBJECT_SCALE`). */
  private aimTracer(m: Matrix4, flight: TracerFlight): void {
    const at = flight.pos, e = flight.end;
    const x = new Vector3(e[0] - at[0], e[1] - at[1], e[2] - at[2]);
    if (x.lengthSq() < 1e-12) x.setFromMatrixColumn(m, 0);   // at its end: the frame's turn kept
    if (x.lengthSq() < 1e-12) x.set(1, 0, 0);
    x.normalize();
    const up = Math.abs(x.y) > 0.99 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
    const z = new Vector3().crossVectors(x, up).normalize();
    const y = new Vector3().crossVectors(z, x).normalize();
    const s = TRACER_OBJECT_SCALE;
    m.makeBasis(x.multiplyScalar(s), y.multiplyScalar(s), z.multiplyScalar(s));
    m.setPosition(at[0], at[1], at[2]);
  }

  private applyPose(object: Object3D, m: Matrix4): void {
    object.matrix.copy(m);
    object.matrixAutoUpdate = false;
    object.matrixWorldNeedsUpdate = true;
    object.visible = true;
  }

  onRound(e: FireEvent, weapon: { node: CallerNode; muzzle: Vec3 | null } | null, zoomed: boolean): void {
    if (e.type !== 'round') return;
    this.inRound++;
    try { this.playRound(e, weapon, zoomed); } finally { this.inRound--; }
  }

  private playRound(e: Extract<FireEvent, { type: 'round' }>, weapon: { node: CallerNode; muzzle: Vec3 | null } | null, zoomed: boolean): void {
    // LATER 366 (OT.R80): a round sent from the head because a wall stood before the muzzle keeps its tracer at the
    // muzzle (`tracerFrom`), the original's tracer origin (research 89 §4 and §19, `FUN_003d5030`). P12b: another's round
    // that struck a body runs its tracer to the round's end past it (`tracerTo`, the room's `shot.end`), not the body.
    if (e.tracer) this.launchTracer(e.tracerFrom ?? e.from, e.tracerTo ?? e.to, e.tracerKind ?? 'ally', e.weapon.range);
    const hitAnim = this.data?.hitAnims.find(([w]) => w === e.weapon.name)?.[1] ?? 'bullet_hit';
    const dir = unit([e.to[0] - e.from[0], e.to[1] - e.from[1], e.to[2] - e.from[2]]);
    const name = muzzleAnimation(e.weapon.fireAnim, zoomed);
    // The weapon's node itself (`FUN_005c5340` D:L479478: type 3 the node, type 5 the `firepoint`'s +0x30 translation,
    // type 6 the velocity), never a copy of its matrix: the flash is re-placed at it each tick it lives (research 149).
    if (name && weapon) this.play(name, { node: weapon.node, position: weapon.muzzle ?? [0, 0, 0], velocity: dir });
    if (e.hit && typeof e.material === 'number' && e.normal) {
      const anim = impactAnimation(hitAnim, this.materialName(e.material));
      if (anim) this.play(anim, { position: [...e.to], velocity: dir, normal: [...e.normal] });
    }
  }

  /** A polygon's material byte to its SOILS name, 0 taking the map's `DefaultMaterial` (`FUN_002dc1d0`). */
  materialName(byte: number): string | undefined {
    const d = this.data;
    if (!d) return undefined;
    return d.materials[byte === 0 ? d.defaultMaterial : byte];
  }

  /** Holds every effect where it is (the hook's, for a picture of a flash that lives three frames). */
  paused = false;

  /** One frame: every run's tick, the particles, and the runs that ended. */
  update(dt: number, camera: Camera | null): void {
    this.camera = camera;
    if (this.paused) dt = 0;
    this.stepScriptRounds(dt);
    this.stepTracers(dt);
    this.stepping = true;
    try {
      for (let i = 0; i < this.runs.length; i++) this.runs[i]!.update(dt);   // calls append runs, which start this tick
    } finally { this.stepping = false; }
    this.poseTracers();
    this.sweepRuns();
    this.particles.update(dt, camera);
    this.lights.update(dt);
  }

  /** The runs that ended leave the list, and their objects the scene. */
  private sweepRuns(): void {
    const alive: EffectRun[] = [];
    for (const run of this.runs) {
      if (!run.finished) { alive.push(run); continue; }
      const ctx = run.context as RunContext;
      // A tracer that draws the run's own model keeps it until the flight retires (`tracerHolds`).
      if (ctx.instance && !this.tracerHolds(run)) this.object.remove(ctx.instance.object);
    }
    this.runs = alive;
  }

  /** Whether the run is a map's ambient effect or one it called (never retired by the cap). */
  private ambientRooted(run: EffectRun): boolean {
    for (let r: EffectRun | undefined = run; r; r = (r.context as RunContext).parent) if ((r.context as RunContext).ambient) return true;
    return false;
  }

  /**
   * MAX_EFFECT_RUNS_ADAPTATION (a browser adaptation): room for one more run -- the live ones over the cap retired,
   * silently: the rounds' runs first, oldest first (a second or two each), and only when none is left the other runs,
   * oldest first (the review's F1: a smoke grenade's long screen, likely the oldest run, is not the first to go). Never a
   * map's ambient run or one it called, nor a travelling tracer's (its pool is the original's `TRACER_POOL`). Mid-step
   * they leave the list at the frame's sweep; else at once.
   */
  private makeRoom(): void {
    if (!this.stepping) this.sweepRuns();
    let live = 0;
    for (const run of this.runs) if (!run.finished) live++;
    let left = live - MAX_EFFECT_RUNS_ADAPTATION + 1;
    if (left <= 0) return;
    this.hush++;
    try {
      for (const rounds of [true, false]) {
        for (const run of this.runs) {
          if (left <= 0) break;
          if (run.finished || ((run.context as RunContext).round === true) !== rounds) continue;
          if (this.ambientRooted(run) || this.tracerHolds(run)) continue;
          run.stop();
          left--;
        }
      }
    } finally { this.hush--; }
    if (!this.stepping) this.sweepRuns();
  }

  /**
   * A browser adaptation (MAX_EFFECT_RUNS_ADAPTATION's report): every round's run -- its muzzle, casing, impact and
   * tracer, and what they called -- let go at once, silently, with the tracers' flights. A hidden tab's return calls it
   * (`./matchFirearm`): a round's effects outlive it by a second or two, so nothing seen is lost, and none of a frozen
   * backlog steps or sounds. The map's ambient effects, the grenades' and the scripts' runs stay.
   */
  retireRounds(): void {
    for (const t of [...this.tracers]) this.retireTracer(t);
    this.tracerTime = 0;
    this.hush++;
    try {
      for (const run of this.runs) if ((run.context as RunContext).round && !run.finished) run.stop();
    } finally { this.hush--; }
    if (!this.stepping) this.sweepRuns();
  }

  /** Everything playing stops (a new map). */
  reset(): void {
    for (const t of [...this.tracers]) this.retireTracer(t);
    this.tracerTime = 0;
    this.scriptRounds = [];
    this.scriptTime = 0;
    for (const run of this.runs) {
      run.stop();
      const ctx = run.context as RunContext;
      if (ctx.instance) this.object.remove(ctx.instance.object);
    }
    this.runs = [];
    this.ambientRuns = [];
    this.valves.clear();
    this.particles.clear();
    this.lights.clear();
    this.clearFootprints();
    this.lastShell = null;
    this.cameraInside = false;
    this.playerInside = false;
  }

  /**
   * The footprints go (they are the temporary decal pool's, with the marks): a round's end (CMPExitState
   * `FUN_00223970` L76084 -> `FUN_0031c880` -> `FUN_003bf050(0x4b5030)` L219059) and a new map (`reset`).
   */
  clearFootprints(): void {
    for (const m of this.footprints) { this.object.remove(m); m.geometry.dispose(); }
    this.footprints.length = 0;
    this.nextFootprint = 0;
  }

  stats(): EffectStats {
    return {
      loaded: this.data !== null, programs: this.programs.size, models: [...this.models.keys()], textures: this.textures.size,
      missing: this.data?.missing.slice(0, 16) ?? [],
      runs: this.runs.length, played: { ...this.played }, shells: this.shellsLive(), particles: this.particles.count(),
      sources: this.particles.activeSources(), emitted: this.particles.emitted,
      lastShell: this.lastShell, bounces: this.bounces, sounds: this.sounds.slice(-16), lights: this.lights.stats(),
      ambient: this.ambientRuns.filter((r) => !r.finished).map((r) => r.program.name),
      water: { ...this.water, ripples: this.runs.filter((r) => !r.finished && RIPPLE_NAMES.has(r.program.name.toLowerCase())).map((r) => r.program.name).join(',') },
      shown: [
        ...this.runs.map((r) => (r.context as RunContext).instance).filter((i): i is Instance => !!i && i.model !== '' && i.object.visible).map((i) => i.model),
      ],
      flashAt: this.flashAt(),
      tracers: this.tracers.map((t) => ({ kind: t.kind, head: tracerHead(t.flight), speed: t.flight.speed })),
    };
  }

  /** The drawn muzzle flash's place in the world (a `muzzle_flash_*` instance's origin), or null. */
  private flashAt(): Vec3 | null {
    for (const run of this.runs) {
      const inst = (run.context as RunContext).instance;
      if (!inst || !inst.object.visible || !inst.model.startsWith('muzzle_flash')) continue;
      const p = inst.object.getWorldPosition(new Vector3());
      return [p.x, p.y, p.z];
    }
    return null;
  }

  private shellsLive(): number {
    let n = 0;
    for (const run of this.runs) {
      const inst = (run.context as RunContext).instance;
      if (inst && inst.model.startsWith('bullet_shell') && inst.object.visible) n++;
    }
    return n;
  }

  /**
   * The run's own node (`NODE_ROOT`, anim+0x3c): a copy of its root model (`create_instance`: a casing a round), or,
   * for an animation rooted at no model (`FRAG_sparks` moves its bare root and hangs its sparks on it), an empty node.
   * Made on first use.
   */
  private instanceOf(run: EffectRun): Instance | null {
    const ctx = run.context as RunContext;
    if (ctx.instance) return ctx.instance;
    const name = run.program.nodes[run.program.root] ?? '';
    const model = run.program.root > 0 ? this.models.get(name) : undefined;
    const object = model ? model.clone(true) : new Group();
    if (!model) object.name = run.program.name;      // a bare node carries its animation's name (the tests find it so)
    object.visible = false;
    this.object.add(object);
    ctx.instance = { object, model: model ? name : '' };
    return ctx.instance;
  }

  /** A node of a run: its instance's root (`NODE_ROOT`, or the root's own name), a named sub-node of it, or null. */
  private nodeOf(run: EffectRun, node: number): Object3D | null {
    const inst = this.instanceOf(run);
    if (!inst) return null;
    if (node === NODE_ROOT) return inst.object;
    const name = run.program.nodes[node];
    if (!name) return null;
    return inst.model === name ? inst.object : inst.object.getObjectByName(name) ?? null;
  }

  /**
   * The caller's node for a run (`NODE_CALLER`) as a world matrix now, or null: an `Object3D`'s world matrix is brought
   * up to date and read on every call -- the engine resolves the context's node pointer afresh on each tick that uses
   * it (`FUN_0026f4e0` 0xfa -> `FUN_00272390`, D:L118164-118168), so a flash held at the caller rides the moving gun.
   */
  private callerMatrix(run: EffectRun): Matrix4 | null {
    const n = (run.context as RunContext).place.node;
    if (!n) return null;
    if (!(n as Object3D).isObject3D) return n as Matrix4;
    const o = n as Object3D;
    o.updateWorldMatrix(true, false);
    return o.matrixWorld;
  }

  /** A command's node as a world matrix: the caller's, the run's instance's, a named one, or null. */
  private nodeMatrix(run: EffectRun, node: number): Matrix4 | null {
    if (node === NODE_CALLER) return this.callerMatrix(run);
    if (node === 0) return null;
    // A node the map's scene holds (a mission's flame at `r_tower_flames`), and the camera (the snow and the rain
    // fall about it): the engine's node search finds them in the world (`_zanim_node_ref`'s search scope).
    const name = node === NODE_ROOT ? run.program.nodes[run.program.root] : run.program.nodes[node];
    if (name === 'camera' && this.camera) { this.camera.updateMatrixWorld(); return this.camera.matrixWorld; }
    const scene = name && !this.models.has(name) ? this.sceneNodes.get(name) : undefined;
    if (scene) return scene;
    const o = this.nodeOf(run, node);
    if (!o) return null;
    o.updateWorldMatrix(true, false);
    return o.matrixWorld;
  }

  /** Where a run is, for its sounds: the caller's origin, else the context's position. */
  private runPosition(run: EffectRun): Vec3 {
    const m = this.callerMatrix(run);
    if (m) return [m.elements[12]!, m.elements[13]!, m.elements[14]!];
    return (run.context as RunContext).place.position ?? [0, 0, 0];
  }

  /**
   * One `RANGE_TEST` point (`FUN_0025de90` D:L107850-107908): the origin, plus the context's position when `context`
   * (`FUN_00272720(ctx, 5)`), carried to the world through `node`'s matrix when it names one the page holds
   * (`FUN_00310980`: the point in the node's frame) -- a node the page does not hold (`camera_shake`'s `player`) leaves
   * the point as it is, as the original does with a null node (D:L107880, D:L107906). The fixed offsets the flags 0x02
   * and 0x10 add (+0x0c, +0x18) are set by no retail program (research 238 §8) and are not decoded.
   */
  private rangePoint(run: EffectRun, context: number, node: number | null): Vector3 {
    const p = new Vector3();
    const at = (run.context as RunContext).place.position;
    if (context && at) p.set(at[0], at[1], at[2]);
    const m = node === null ? null : this.nodeMatrix(run, node);
    return m ? p.applyMatrix4(m) : p;
  }

  private world(): MotionWorld | null {
    const grid = this.grid();
    if (!grid) return null;
    const fallback = this.data?.defaultMaterial ?? 0;
    const soil = (byte: number): number => (byte === 0 ? fallback : byte);
    // Newell's normal points either way: the one facing where the probe came from.
    const facing = (n: readonly number[], a: Vec3, b: Vec3): Vec3 => {
      const d = (b[0] - a[0]) * n[0]! + (b[1] - a[1]) * n[1]! + (b[2] - a[2]) * n[2]!;
      return d > 0 ? [-n[0]!, -n[1]!, -n[2]!] : [n[0]!, n[1]!, n[2]!];
    };
    return {
      segment: (a: Vec3, b: Vec3) => {
        const h = segmentHit(grid, a, b);
        return h ? { point: [...h.point], normal: facing(h.normal, a, b), material: soil(h.poly.material) } : null;
      },
      floor: (from: Vec3, depth: number) => {
        const to: Vec3 = [from[0], from[1] - depth, from[2]];
        const h = segmentHit(grid, from, to);
        return h ? { point: [...h.point], normal: facing(h.normal, from, to), material: soil(h.poly.material) } : null;
      },
    };
  }

  private readonly host: EffectHost = {
    random: () => this.random(),
    test: (c: EffectCondition, run: EffectRun): boolean => {
      if (c.kind === 'valve') return valveTest(this.valves.get(c.valve) ?? 0, c.operation, c.operand);
      if (c.kind === 'range') {
        // `RANGE_TEST` (`FUN_0025de90` D:L107850-107942; research 238 §8): two points the flags pick -- the first the
        // context's position (0x04) carried through the node at +8 (0x01), the second the context's position (0x20)
        // through the node at +9 (0x08) -- compared by `rangeTestHolds`. `shell_eject`'s 0x109 is the camera against
        // the caller; `bullet_hit_person`'s 0x61 the camera against the hit. Before the camera is known nothing holds.
        if (!this.camera) return false;
        const a = this.rangePoint(run, c.flags & 0x04, c.flags & 0x01 ? c.node : null);
        const b = this.rangePoint(run, c.flags & 0x20, c.flags & 0x08 ? c.other : null);
        return rangeTestHolds(c.flags, a.distanceToSquared(b), c.rangeSquared);
      }
      // INV-RAIN F3: set 0's CAMERA_INDOORS (66) and PLAYER_INDOORS (72) from the floor's `m_inside` (`indoors`).
      const who = indoorsOperand(c);
      if (who) return this.indoors(who);
      return false;
    },
    begin: (op: EffectOp, run: EffectRun): OpTick | void => this.begin(op, run),
    answersIndoors: true,   // INV-RAIN F3: `test` answers set 0's 66 and 72 (`indoors`); other hosts fold them as unread
  };

  private begin(op: EffectOp, run: EffectRun): OpTick | void {
    const ctx = run.context as RunContext;
    switch (op.op) {
      case 'fireWeapon': {
        const record = this.data?.scriptWeapons?.find(w => w.name === op.weapon && w.ammo === op.ammo);
        if (!record || record.muzzleVelocity !== 0 || record.model !== 'NONE') return;
        const node = this.nodeMatrix(run, op.node);
        if (op.node !== 0 && !node) return;
        const position = new Vector3(...(op.offset ?? [0, 0, 0]));
        if (op.atContext && ctx.place.position) position.add(new Vector3(...ctx.place.position));
        if (node) position.applyMatrix4(node);
        const fuse = op.f1 === -1 ? record.fuse : op.f1;
        if (!Number.isFinite(fuse) || fuse < 0) return;
        const round = launchGrenade([position.x, position.y, position.z], [0, 0, 0], record);
        round.fuse = fuse;
        round.removal = op.f2 === -1 ? record.removal : op.f2;
        this.scriptRounds.push({ round, ready: false });
        return;
      }
      case 'call': {
        const program = this.programs.get(op.anim.toLowerCase());
        if (program) this.start(program, ctx.place, false, run);   // PAR-45: the caller recorded, for its handle's stop
        return;
      }
      case 'valve': {
        this.valves.set(op.valve, valveApply(this.valves.get(op.valve) ?? 0, op.operation, op.operand));
        return;
      }
      case 'active': {
        const node = this.nodeOf(run, op.node);
        if (node) node.visible = op.on;
        return;
      }
      case 'translate': {
        const node = this.nodeOf(run, op.node);
        if (!node) return;
        // `FUN_00263890`: the offset (flag 1), or the node's own place plus it (flag 4), plus the context's position
        // (flag 2); through the reference node's matrix when there is one (the muzzle: the `firepoint`'s place in the
        // weapon), else as it is (a hit: the world point).
        const ref = op.ref === 0 ? null : this.nodeMatrix(run, op.ref);
        const v = new Vector3();
        let set = false;
        if (op.flags & 4) { v.copy(node.position).add(new Vector3(...op.xyz)); set = true; } else if (op.flags & 1) { v.set(...op.xyz); set = true; }
        if ((op.flags & 2) && ctx.place.position) { v.add(new Vector3(...ctx.place.position)); set = true; }
        if (ref) node.position.copy(v.applyMatrix4(ref));
        else if (set) node.position.copy(v);
        return;
      }
      case 'rotate': {
        const node = this.nodeOf(run, op.node);
        if (!node) return;
        // `FUN_00263730`: the reference node's world rotation (unless flag 4), then the euler angles set (1) or added (2).
        const ref = op.ref === 0 ? null : this.nodeMatrix(run, op.ref);
        if (ref && (op.flags & 4) === 0) node.quaternion.setFromRotationMatrix(new Matrix4().extractRotation(ref));
        const e = new Quaternion().setFromEuler(new Euler(op.xyz[0], op.xyz[1], op.xyz[2], 'YXZ'));
        if (op.flags & 1) node.quaternion.copy(e);
        if (op.flags & 2) node.quaternion.multiply(e);
        return;
      }
      case 'fromTo': {
        const node = this.nodeOf(run, op.node);
        if (!node) return;
        let t = 0;
        const apply = (): void => {
          const k = op.seconds > 0 ? Math.min(1, t / op.seconds) : 1;
          node.scale.set(op.from[0] + (op.to[0] - op.from[0]) * k, op.from[1] + (op.to[1] - op.from[1]) * k, op.from[2] + (op.to[2] - op.from[2]) * k);
        };
        apply();
        return (dt) => { t += dt; apply(); return t >= op.seconds; };
      }
      case 'motion': return this.motion(op.motion, run);
      case 'particles': {
        const node = this.nodeMatrix(run, op.source.node);
        // Flag A 0x10: the source follows its node while it lives (`FUN_00329b40` reads the node's matrix each tick).
        const follow = op.source.follow ? () => this.nodeMatrix(run, op.source.node) : null;
        this.particles.emit(op.source, node, ctx.place, run.program.name, () => !run.finished, run, follow);
        return;
      }
      case 'light': {
        // Where it is, computed by the tick every frame (`FUN_00264cb0` D:L111995-112031): the context's point (flag 0x8,
        // the `firepoint` in the weapon's frame), plus its offset (0x4), carried through its node's matrix as it is now
        // (0x2: the caller's, `FUN_00310980`) -- `light_at_muzzle` (0x4ea) lights the moving muzzle, `zoom_flash_fire`
        // (0x4e2) the weapon node's origin. With none of the three, the run's place.
        const l = op.light;
        const where = (): Vec3 => {
          const v = new Vector3();
          let placed = false;
          if (l.atContext && ctx.place.position) { v.set(...ctx.place.position); placed = true; }
          if (l.offset[0] !== 0 || l.offset[1] !== 0 || l.offset[2] !== 0) { v.add(new Vector3(...l.offset)); placed = true; }
          const m = l.node !== null ? this.nodeMatrix(run, l.node) : null;
          if (m) { v.applyMatrix4(m); placed = true; }
          return placed ? [v.x, v.y, v.z] : this.runPosition(run);
        };
        this.lights.begin(l, where(), () => !run.finished, where);
        // The command runs its length (+0x3c) before its sequence goes on [reading: the tick keys the ranges by the
        // command's own time]; the light itself lasts until the animation ends.
        let t = 0;
        return l.duration > 0 ? (dt) => (t += dt) >= l.duration : undefined;
      }
      case 'pauseAnimation': {
        const name = op.anim.toLowerCase();
        for (const r of this.runs) if (r !== run && r.program.name.toLowerCase() === name) r.paused = true;
        return;
      }
      case 'stopAnimation': {
        const name = op.anim.toLowerCase();
        for (const r of this.runs) if (r !== run && r.program.name.toLowerCase() === name) r.stop();
        return;
      }
      case 'sound': {
        // A retune starts no voice (FUN_002659c0 112365-112390); a priority-slot play (0x400 / 0x800) the game sounds
        // unplaced in FUN_00348dc0's one-voice slot (245376-245420), which the viewer drops (SOUND_PRIORITY_SLOT_READING).
        if (op.newPlay === false) return;
        if (ctx.ambient && op.sound.startsWith('~')) return;
        const at = op.node > 0 ? this.nodeMatrix(run, op.node) : null;
        // The command's own volume (flag 0x10's f32 at +8, else 1.0: `FUN_002659c0` 112363-112461), as the zAnim path.
        this.playSound(op.sound, at ? [at.elements[12]!, at.elements[13]!, at.elements[14]!] : this.runPosition(run), op.volume);
        return;
      }
      default: return;
    }
  }

  private playSound(raw: string, at: Vec3, volume: number): void {
    if (this.hush > 0) return;                       // MAX_EFFECT_RUNS_ADAPTATION: a retired run's cleanup is silent
    const name = fixSoundName(raw);   // the one name table (`@s2u/sound`)
    this.sounds.push(name);
    if (this.sounds.length > 64) this.sounds.splice(0, this.sounds.length - 64);
    this.sound(name, at, volume);
  }

  /** `OBJECT_MOTION` on a run's node: the launch now, the flight in its tick. */
  private motion(m: ObjectMotion, run: EffectRun): OpTick | void {
    const node = this.nodeOf(run, m.node);
    if (!node) return;
    const frame = m.frame === 0 ? null : this.nodeMatrix(run, m.frame);
    const inst = (run.context as RunContext).instance;
    const height = inst ? heightOf(inst.object) : 0.14;
    const place = (run.context as RunContext).place;
    const state: MotionState = launchMotion(m, node.position.toArray() as Vec3, frame ? rowsOf(frame) : null, this.random, ZANIM_GRAVITY, height, place.velocity ?? [0, 0, 0]);
    const isShell = inst?.model.startsWith('bullet_shell') ?? false;
    const world = this.world();
    const apply = (): void => {
      node.position.set(state.position[0], state.position[1], state.position[2]);
      node.quaternion.setFromEuler(new Euler(state.euler[0], state.euler[1], state.euler[2], 'YXZ'));
      if (isShell) this.lastShell = { position: [...state.position], velocity: [...state.velocity] };
    };
    apply();
    return (dt: number): boolean => {
      const bounces = stepMotion(m, state, dt, world);
      for (const b of bounces) {
        this.bounces++;
        if ((m.flags & 0x20) === 0) continue;
        const sound = b.entry?.sound ?? m.sound;
        const ref = b.entry?.refSpeed ?? m.refSpeed;
        if (sound) this.playSound(sound, b.point, ref > 0 ? Math.min(1, b.speed / ref) : 1);
      }
      apply();
      return state.done;
    };
  }
}

/** A matrix's rotation rows, row-vector convention (`v * M`): three's column-major basis vectors, unit length. */
function rowsOf(m: Matrix4): Vec3[] {
  const e = m.elements;
  return [unit([e[0]!, e[1]!, e[2]!]), unit([e[4]!, e[5]!, e[6]!]), unit([e[8]!, e[9]!, e[10]!])];
}

/** An object's height in its own frame (the casing's box: 0.14). */
function heightOf(object: Object3D): number {
  let min = Infinity, max = -Infinity;
  object.traverse((o) => {
    const p = (o as { geometry?: { attributes?: { position?: { array: ArrayLike<number> } } } }).geometry?.attributes?.position?.array;
    if (!p) return;
    for (let i = 1; i < p.length; i += 3) { min = Math.min(min, p[i]!); max = Math.max(max, p[i]!); }
  });
  return Number.isFinite(max - min) ? max - min : 0;
}

/** `FUN_00353fd0`'s tests: 0 true, 1 !=, 2 ==, 3 >, 4 <, 5 >=, 6 <= (the valve against the operand). */
export function valveTest(value: number, operation: number, operand: number): boolean {
  switch (operation) {
    case 0: return true;
    case 1: return value !== operand;
    case 2: return value === operand;
    case 3: return value > operand;
    case 4: return value < operand;
    case 5: return value >= operand;
    case 6: return value <= operand;
    default: return false;
  }
}

/** `FUN_00353fd0`'s operations: 0x0b set, 0x0c add, 0x0d subtract (not below 0), 0x0e multiply; the tests leave it. */
export function valveApply(value: number, operation: number, operand: number): number {
  switch (operation) {
    case 0x0b: return operand;
    case 0x0c: return value + operand;
    case 0x0d: return Math.max(0, value - operand);
    case 0x0e: return value * operand;
    default: return value;
  }
}

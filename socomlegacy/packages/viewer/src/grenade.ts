import {
  AdditiveBlending, DataTexture, DoubleSide, Group, LinearFilter, Mesh, MeshBasicMaterial, NormalBlending, PlaneGeometry,
  RGBAFormat, Sprite, SpriteMaterial, UnsignedByteType, BufferGeometry, Float32BufferAttribute, Line,
  LineBasicMaterial, LineSegments, Points, PointsMaterial, Quaternion, type Material, type Object3D, type Texture,
} from 'three';
import type { Rgba } from '@s2u/gs';
import { passingSound } from '@s2u/sound';
import {
  actorToWorldDir, actorToWorldPoint, AN_M8, CLAYMORE, CLAYMORE_RULES, claymoreCone, countsTowardClaymoreLimit, explosionDamage, GAME_FRAME_DT, GameFrameAccumulator, ITEM,
  BOUNCE_LIFT, GRENADE_BLAST, gridCast, handAnim, heldPower, HE, surfaceMaterial,
  launchGrenade, M67, MARK141, THROW_ARC, throwArc,
  materialAnim, maxThrowDistance, PLACE_CLAYMORE_ANIM, proximityTripped, PUT_ON_WALL_ANIM, releaseSeconds, stepGrenade, stepThrowPower, throwAnim, throwClipSeconds, THROW_ANIMS,
  throwVelocity, tumbleQuaternion, weaponCategory,
  type Grenade, type GrenadeEvent, type Grid, type HullCast, type HullHit, type ThrowAnim, type ThrowLaunch, type ThrowStance,
  type ThrowableRecord, type V3,
} from '@s2u/scene';
import type { GrenadeAssets } from './grenadeAssets';
import { GRENADE_BITMAPS } from './grenadeAssets';
import { markMaterial } from './effectMaterials';
import { markGeometry, paintMark, WALK_DECAL_RENDER_ORDER } from './fire';
import { detonationOf, SMOKE_PLACEHOLDER, type Detonation } from './smoke';
export { detonationOf, SMOKE_PLACEHOLDER, type Detonation } from './smoke';   // moved to the three-free ./smoke (BOTS-LAND)
import type { SurfaceShade } from './surfaceShade';
import { markClipGeometry, PERM_DECAL_TRIANGLES, squareInto, type MarkClipper, type MarkFrame } from './markClip';
import { BOMB_MODEL_READING } from './bombPage';
import type { PlaySnapshot, WalkView } from './walk';
import type { ProjectilePhase } from './joinState';
import type { EffectHandle } from './effects';
import { aimPick, C4_PLANT_SECONDS, c4PlantAllowed, C4Settle, c4TargetOf, EquipmentSlots, slotSelectable, wadingDepth, type EquipmentSlotState } from './equipment';
import { blastLine, type SceneHealth } from './sceneHealth';
import { blastFlashLevel } from './net/blast';
import { placeGround, worldColumn } from './net/placing';
import { isHoldClip, TICK, type ActionEndReason } from './mover';
import { climbHoldsBody } from './traversal';
import { C4_FALLBACK_PLACEHOLDER, C4_KIT_TIMER_SECONDS, C4_PLANT_LEAVE_CANCEL_ADAPTATION, releaseAimSin, releasePowerClears, releaseStance, throwClear } from './throwCommit';
import { netCapLive, netCapRefuses } from './net/netCap';
import { TICK_HZ } from './net/protocol';
import {hdTextures} from './hdTexturePack';

/**
 * SOCOM II's frag grenade in walk mode (the grenades workstream; socomlegacy/docs/research/85). The physics is
 * `@s2u/scene`'s `projectile.ts`, the game's own; this file is the page's part: the slot, the held throw, the clip's
 * timing, the grenades in flight over the map's hull, what is drawn, and the events the audio, weapon and UI
 * workstreams hang off.
 *
 * - **The slots.** In SOCOM II a grenade is a kit slot, taken up from R2's inventory or by L1/L2 (`SwapWeapon1/2`)
 *   swapping to the slot assigned to them (research 85 §9.1), and thrown with the fire button (R1). Here: `3` and `4`
 *   the kit's equipment slots 1 and 2 (`equipmentSlots`: the M67, the HE; the page binds them, `./kit`'s `hotkey`),
 *   `1` the rifle back; the pad's R2 (`cycleInventory`, through `./kit`'s inventory: L1 and L2 are the
 *   primary's and the sidearm's slots, the WEAPON workstream's `Kit`); the fire trigger (the left
 *   button, the touch fire button, R1) throws while one is up (`main.ts` routes it).
 * - **The throw.** Held, the power chases the button's pressure (`stepThrowPower`: a key or a click is pressure 1, so
 *   the power is how long it was held: 0.54 at a quarter second, 0.95 at one); let go, `GetThrowAnim` picks the clip
 *   (a toss under power 0.6 with the aim under sin 0.3), played on the body (`./throwPose`), and at its release phase
 *   the grenade leaves the posed right hand's (2, 0, 0) (`GrenadeSource.handPoint`) at `throwVelocity`'s velocity, its
 *   fuse (`Timer1` 3 s) starting then. The smoke pours out from 3 s to 40 s; the flash whites the screen out by the game's rule.
 * - **The flight.** `stepGrenade` once per game frame at `GAME_FRAME_DT` (525/15734 s; PF-04, research 208), over `gridCast` of the walk's hull with the map's
 *   `DefaultMaterial`: gravity 98, the bounce at each material's ELASTICITY_COEFF, the rest under 5 units/s, the
 *   explosion at 3 s where it lies, the removal at 3.1.
 * - **Drawn.** The `grenade` model (`WEAP_GEO`; the HE's `HEgrenade`) on the right hand's `grenade` node (`heldNode`;
 *   `HAND_PLACEHOLDER` without a posed body) and in flight, turned by its own tumble (`@s2u/scene` `tumbleQuaternion`: the
 *   free-flight step `FUN_003c9530`, research 202 §2.6; PF-07a); the explosion as the `frag_grenade` zAnim's parts read off their
 *   commands (`EXPLOSION_READING`): the flash, a fireball, sparks, smoke, dust and a ground roll, with the bitmaps
 *   `GRENADE_BITMAPS` names; the scorch from `GRENADE_BLAST`; while the throw is held, the game's yellow arc
 *   (`drawArc`, `FUN_005970b0`: research 85 §11). Optionally the flight's trail (a debug line, off).
 */

/*
 * The flight's step (PF-04; the 1/60 flight tick retired): the projectile tick `FUN_003c9fb0` runs once per game
 * frame with the frame's dt (research 179 §9.13, 181 §6.4 X4), and the frame is `GAME_FRAME_DT` = 525/15734 s
 * (`@s2u/scene`, research 208 -- the measured dt supersedes C1's nominal 1001/30000). The page's 60 Hz frames feed a
 * `GameFrameAccumulator` (`fly`), and the room steps its copy the same way (`room.ts` `flyGrenades`), so the two agree.
 */
/** MISSION R8's slerp ends (`GrenadeThrower.drawLive`), reused. */
const SLERP_FROM = new Quaternion();
const SLERP_TO = new Quaternion();

/** Where the grenade sits in the hand before the clip lifts it, actor frame (x right, y up, z behind) [placeholder]. */
export const HAND_PLACEHOLDER: V3 = [3.5, 12.5, -4];

/**
 * PAR-34 (research 252 s3) -- **a browser adaptation, no original**: the longest step the held throw's power chase
 * (`stepThrowPower`, `FUN_00594cf0`'s `power += (pressure - power) x rate x dt`) takes at once. The power counts the
 * frame's real seconds (ACT.R8); a frame longer than this is credited in equal steps of at most this, so a slow frame
 * or a stall (the chase's factor `rate x dt` past 1) cannot carry the power past the pressure. It is the pages' own step
 * bound (the frame's 0.1 s clamp), so at 10 fps and above the chase is stepped exactly as before.
 */
export const THROW_POWER_STEP_MAX_S = 0.1;

/**
 * The explosion as the `frag_grenade` zAnim composes it (`RUN/CZANIM.ZAR`: `FRAG_sparks`, `dust_explode_long`,
 * `light_flash_large`, `bsmoke_explode_large`, `dust_ground_roll`, the sound `.GREN_MED`). **[reading]**: the particle
 * command (set 0, command 0x27, ~300 bytes) is not decoded field by field; the numbers below are the floats that
 * stand out in each and read as velocity ranges (x, y, z), sizes, lives and grey levels (research 85 §6).
 */
export const EXPLOSION_READING = {
  /** `light_flash_large` (command 0x32): (214.2, 242.25, 216.75, 64), 100 -> 190, 0.5 s. */
  flash: { color: [216.75 / 255, 242.25 / 255, 214.2 / 255] as V3, radius: [100, 190] as const, life: 0.5 },
  /** `bsmoke_explode_large`'s `fire_explode`: x, z +-70, y 0..240; 8-10 across. */
  fire: { count: 14, vx: 70, vy: [0, 240] as const, size: [8, 10] as const, grow: 2.2, life: [0.35, 0.6] as const, gravity: 0 },
  /** `FRAG_sparks`' `spark_streak`: x, z +-200, y 110..180, pulled down by 1000; 0.5-0.8 across, 0.63-0.65 s. */
  spark: { count: 24, vx: 200, vy: [110, 180] as const, size: [0.5, 0.8] as const, grow: 1, life: [0.63, 0.65] as const, gravity: 1000 },
  /** `GreyDustCloudUp` / `BlackDustCloudUp`: x -40..40, y 50..100; 10-12 across; 6.5-7.5 s and 9.5-10.5 s; 0.5 -> 0.2 grey. */
  smoke: { count: 10, vx: 40, vy: [50, 100] as const, size: [10, 12] as const, grow: 3, life: [6.5, 10.5] as const, gravity: 0, grey: [0.5, 0.2] as const },
  /** `dust_explode_long`: +-15; 5-10 across; 6.5-9.5 s; grey 0.6. */
  dust: { count: 8, vx: 15, vy: [-15, 15] as const, size: [5, 10] as const, grow: 3, life: [6.5, 9.5] as const, gravity: 0, grey: [0.6, 0.6] as const },
  /** `dust_ground_roll`'s `DustRoll`: x, z +-140 along the ground; 12-15 across; 2.6-3.0 s; grey 0.4. */
  roll: { count: 12, vx: 140, vy: [0, 6] as const, size: [12, 15] as const, grow: 2, life: [2.6, 3] as const, gravity: 0, grey: [0.4, 0.3] as const },
} as const;

export type GrenadePhase = 'holstered' | 'ready' | 'holding' | 'throwing';

/** User-requested readout policy, not an original HUD reading; research 209 §17. */
export const C4_FUSE_BAR_SELECTION_ADAPTATION = 'own-local-rest-soonest-fuse' as const;

/**
 * The throwables and charges the page's hand takes up, by `zweapon.rdr`'s `InternalName`: the hand grenades, the
 * claymore, and (web sprint 4 M7, research 94 §C5) the PMN and C4, whose records come off the disc (`setRecords`).
 */
export type GrenadeItem = 'M67' | 'HE' | 'AN-M8' | 'Mark141' | 'Claymore' | 'PMN Mine' | 'C4';
const GRENADE_ITEMS: ReadonlySet<string> = new Set<GrenadeItem>(['M67', 'HE', 'AN-M8', 'Mark141', 'Claymore', 'PMN Mine', 'C4']);
/** The items the page holds without the disc's tables: `@s2u/scene`'s transcriptions, each proven against the file. */
export type BakedItem = 'M67' | 'HE' | 'AN-M8' | 'Mark141' | 'Claymore';
/**
 * The throwables the viewer carries without the disc: `mp_seal1`'s M67 and HE, the AN-M8 smoke of `mp_seal2`/`mp_seal4`,
 * the Mark141 flashbang, which no MP default kit carries, and `mp_seal4`'s claymore.
 */
export const THROWABLES: Readonly<Record<BakedItem, ThrowableRecord>> = { M67, HE, 'AN-M8': AN_M8, Mark141: MARK141, Claymore: CLAYMORE };
/**
 * The baked throwables' rounds' `Piercing` (`ZAMMO` `+0x14`, `FUN_003d4520`; research 91 §5, zweapon.rdr: the M67 4,
 * the HE 1; the smoke, the flash and the claymore 0) -- what the room's `BAKED_THROWN` (match `room.ts`) holds. With
 * the disc's kit table, its entries' own (`setRecords` / `setRounds`: `KitThrowable.piercing`, `KitRound.piercing`).
 */
export const BAKED_PIERCING: Readonly<Record<BakedItem, number>> = { M67: 4, HE: 1, 'AN-M8': 0, Mark141: 0, Claymore: 0 };
/** A kit table's entry: a record with its round's `Piercing` (`@s2u/scene` `KitThrowable`, `KitRound`). */
export type PiercedRecord = { readonly record: ThrowableRecord; readonly piercing: number };
/**
 * LATER 122: how the page tells that C4's saved target "moved since the save" (`FUN_005c1970` D:L476913-476940 against
 * the save, D:L475421-475440). The original compares the object's position -- its own `+0x30` plus its parent's world
 * matrix's translation row alone (`FUN_003109f0`, then `FUN_00309240`, a plain add, D:L476918-476919 and
 * D:L475430-475431; `FUN_00309200` the subtraction), strictly -- so no rotation enters it anywhere: a node turned in
 * place, or a leaf under a turning parent, has not moved there. The page's hull keeps no node positions.
 * `'struck-polygon'`: the polygon the plant struck is no longer where it was (a coordinate off by more than 1e-4), the
 * settle's own test (`./equipment` `C4Settle`, research 210). **The port's departure:** a turned node's polygons move,
 * so the page gives the charge back where the original plants it. Open: only whether a scene animation writes a node's
 * `+0x30` (a translation), the case both count. Research 209 §16.1.
 */
export const C4_TARGET_MOVED_READING = 'struck-polygon' as const;
/** A set of the thrower's records, by item (the baked ones, and the disc's once `setRecords` has them). */
export type ThrowableRecords = Readonly<Partial<Record<GrenadeItem, ThrowableRecord>>>;
/**
 * PAR-96 B6 (research 256 §8.2, §8.5 U2): CLAYMORE_HELD_TRIGGER_READING -- the page asks the claymore's and the PMN's fire
 * once per press (`pull` -> `startPlacing`): a refusal's message once a press, a placing never started under a held
 * trigger. The original re-asks the whole fire every frame while the trigger is held -- a refusal leaves the pull's count
 * `+0x818` unraised (D:L475328 against D:L475330-475336), so the fire gate passes again (`FUN_005c0ae0` D:L476439-476441,
 * the controller's `+0x118` state 1 or 2, D:L476380-476420): the binoculars' test (D:L475305), the count and the water's
 * bare return (D:L475318-475320) asked again, the message re-posted as its 2 s run out, the placing started once the
 * count falls or the feet leave deep water. Not ported: the re-ask would run through the page's trigger (`matchThrow.ts`
 * `trigger`, the binoculars' `fireRefused`) as well as `update`. Settled by a capture: four down, the trigger held 5 s
 * (the message three times or once); held in deep water while stepping out (placed or not); the controller's `+0x118`
 * frame by frame (research 305's owed read of its writer).
 */
export const CLAYMORE_HELD_TRIGGER_READING = 'per press' as const;

/**
 * READING (named; NU-1b B6, research 313 sections 5 and 8.1, re-filed by NU-1b's read; research 251 section 12.8's air
 * case): a grenade's wind-up under a climb's clip is held (`'held'`). The controller chases the power and asks the release
 * only while `FUN_0059d830` answers (`FUN_00594cf0` D:L453478-453480), and `FUN_0059d830` asks `FUN_005a7de0(actor, 1, 1)`
 * (D:L457365), which the climb's bare `NoFire` refuses (research 86 section 1; `./traversal` `climbHoldsBody`): the power
 * frozen, no release asked, and at the climb's end the chase runs -- a button let go asks the release at once, at the
 * frozen power. The release request's own refusal (D:L475491-475498: nothing spent, the power zeroed) meets one case, a
 * release asked on the frame the climb is pushed. The room's half is `room.ts` `takeThrowStart`'s `'nofire'` (the frame's
 * `fire`). The placing is not this row's (#96, H162): it asks no `FUN_0059d830` (D:L475305-475340). Owed: a capture of a
 * frag held through a climb and let go under it (research 313 section 8.2). P36 (TB-12; research 256 section 6) widens the
 * same gate to every playing clip's `NoFire` (`GrenadeSource.fireAllowed`); the climb stays its own read, as named here.
 */
export const CLIMB_THROW_REFUSED_READING = 'held' as const;

/** What the hand can hold besides the rifle: a throwable, or the claymore's Detonator (`CLAYMORE_RULES`). */
export type HeldItem = GrenadeItem | 'Detonator';
/** A kit slot: the rifle, a throwable, the Detonator. */
export type KitItem = 'rifle' | HeldItem;
/**
 * The kit's items in slot order as the viewer holds them (the Mark 23, slot 1, is not in the viewer); the Detonator
 * last, as `FUN_005c74e0` appends it to a kit with a claymore.
 */
export const KIT_ITEMS: readonly KitItem[] = ['rifle', 'M67', 'HE', 'AN-M8', 'Mark141', 'Claymore', 'Detonator'];

/**
 * The kit's equipment slots, in order: the throwables of `KIT_ITEMS` the pouch carries (a capacity over 0) -- the
 * M67 and the HE first, `mp_seal1`'s two (`character.rdr`: M4A1, Mark 23, M67, HE). The PC's `3` and `4` take up the
 * first two (the owner, 2026-09-29); R2's inventory reaches every one.
 */
export function equipmentSlots(records: ThrowableRecords = THROWABLES): GrenadeItem[] {
  return KIT_ITEMS.filter((k): k is GrenadeItem => k !== 'rifle' && k !== 'Detonator' && (records[k as GrenadeItem]?.capacity ?? 0) > 0);
}

/** A placed item rather than a thrown one: `Muzzle_Velocity` 0 (the claymore; the C4 is no MP SEAL kit's). */
export const isPlaced = (r: ThrowableRecord): boolean => r.muzzleVelocity === 0;

/**
 * PLACEHOLDER (named): whether the smoke screen is drawn here even when the effects ran `smoke_grenade`. False since the
 * effects' `large_smoke` puffs read as a wall (effects round 3, research 89 §12); this screen is the stand-in only on a
 * map whose archives lack `smoke_grenade`.
 */
export const SMOKE_ALWAYS_PLACEHOLDER = false;

/**
 * PF-28 fix round 3 (research 231 s2; research 89 s12, 85 s9.6): the zAnim a late joiner's AN-M8 smoke runs -- the
 * stream alone, `smoke_grenade`'s called program: its two `large_smoke` particle sources, no sound op. The AN-M8's own
 * `ExplosionAnim`, `smoke_grenade`, is the detonation (sparks, a flash, `!SMK_CANISTER`, then the call): a joiner never
 * runs it (PF.R47, nothing replayed).
 */
export const JOIN_SMOKE_STREAM = 'smoke_stream';

/**
 * PF-28 (research 231 s2): a late joiner's AN-M8 smoke, when the effects player has `JOIN_SMOKE_STREAM`, is that stream
 * started from its beginning at the join -- the grenade page's door to the effects (`setEffectPlayer`, `main.ts`) takes no
 * start offset (since PAR-45 it hands `Effects.run`'s handle, kept only for `clearSmokes`) --
 * so it runs its 20 s of emission from then, not from the smoke's age, and without the canister's burst an observer saw;
 * without the player (or the stream), the placeholder puffs pour from the detonation's age. The original's late-join
 * smoke is capture B's. [reading]
 */
export const JOIN_SMOKE_LOOK_READING = 'stream from its start' as const;

/**
 * PAR-45 (research 283): what `clearSmokes` (the replay's seek, `REPLAY_ADAPTATION`) leaves of a smoke it stops -- the
 * puffs already in the air run out their lifetimes, as `./particles` lets a dead source's (research 89 s3); only the
 * emission stops. The original frees a source's live particles with the source (`FUN_0032a6b0` D:L227162 ->
 * `FUN_00327f70` D:L227179, D:L225737-225758), but whether a stopped or ended animation frees its sources at once or
 * once its particles are spent is not settled (`FUN_00270570` D:L118733-118816, read in part). [reading]
 */
export const CLEAR_SMOKES_PUFFS_READING = 'left to run out' as const;

/**
 * The scorch's upper allowance (AD-4; research 202 §3.4): the explosion (`FUN_003c7af0` D:L318876) asks
 * `FUN_0031df50(10.0, world, pos)` (0x41200000), and `FUN_002d4c20` (D:L175857-175892) keeps a surface no more than this
 * over the blast. Was the scorch probe's reading `{ above: 10, below: 10 }` (retired, research 85 §10): the below bound
 * was the viewer's own (the game's column has none, `./net/placing` `worldColumn`).
 */
export const SCORCH_ABOVE = 10;

/**
 * The scorch's ground out of the world column under a blast at height `y` (`FUN_002d4c20` D:L175857-175892): the highest
 * surface no more than `SCORCH_ABOVE` over it, with no lower bound and no material test; at equal heights the first in
 * the column's order (a later entry replaces only a strictly higher one, the `<=` at D:L175888). Null: none, and then
 * the game makes no decal (D:L318877). The column's order is the cast's (highest first), not the world's node walk.
 */
export function scorchHit(hits: readonly HullHit[], y: number): HullHit | null {
  let best: HullHit | null = null;
  for (const h of hits) if (h.point[1] <= y + SCORCH_ABOVE && (best === null || h.point[1] > best.point[1])) best = h;
  return best;
}

/** The ground under a blast: the column's hit and its unit normal, up the column. */
interface ScorchGround { point: V3; normal: V3 }

/**
 * Two unit axes across a unit normal, `t1 x t2 = n`: t1 the world x laid on the plane (the world z when the normal is
 * near x). For the up normal, (1, 0, 0) and (0, 0, -1).
 */
function tangents(n: V3): [V3, V3] {
  const a: V3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
  const d = a[0] * n[0] + a[1] * n[1] + a[2] * n[2];
  let t1: V3 = [a[0] - d * n[0], a[1] - d * n[1], a[2] - d * n[2]];
  const l = Math.hypot(...t1);
  t1 = [t1[0] / l, t1[1] / l, t1[2] / l];
  const t2: V3 = [n[1] * t1[2] - n[2] * t1[1], n[2] * t1[0] - n[0] * t1[2], n[0] * t1[1] - n[1] * t1[0]];
  return [t1, t2];
}

/** The game releases from the hand bone's (2, 0, 0) (`CZKit_TickExplosives`, `FUN_002869d0` with 0x66b6d0). */
export const RELEASE_POINT: V3 = [2, 0, 0];

/** What the walk offers the grenade: the hull, the mover as the body reads it, the view. */
export interface GrenadeSource {
  grid(): Grid | null;
  /** PAR-46a (research 283 s8): the map's hull, walking or not -- the drawn flights' and scorches' (`hull()`). */
  hullGrid?(): Grid | null;
  snapshot(): PlaySnapshot | null;
  view(): WalkView;
  /** A point in a posed part's frame in the world (`Play.partPoint`): the hand the grenade leaves; null before a pose. */
  handPoint?(part: 'rhand' | 'lhand', p: V3): V3 | null;
  /**
   * M7: every actor's origin (the page's SEAL and the others it draws) -- what an armed PMN tests (`proximityTripped`,
   * `FUN_00543930`). Absent: the page's own SEAL's feet.
   */
  actors?(): readonly V3[];
  /**
   * LATER 645 (research 81 s5): the page's player's feet, the actor `FUN_00598000` takes another's rocket against
   * (`+0x1c`, D:L454629) -- `WalkMode.feet()`, as LATER 644's bullets; null or absent, no rocket is tested.
   */
  listenerFeet?(): V3 | null;
  /**
   * The item's node under the right hand (`Play.itemNode`: the `grenade` node `FUN_00553290` makes for class 3 under
   * `rhand`, D:L419036-419038): the grenade or the charge rides it while it is up. The firearm stays on its own mount.
   */
  heldNode?(): Group | null;
  /**
   * The sidearm in the hand (`+0xf79` 2): a throw or a placing plays the pistol's version of its clip (`handAnim`,
   * `FUN_00588bc0` through `FUN_0058c820`). Absent: the rifle's.
   */
  pistol?(): boolean;
  /**
   * The view mode, the actor's byte `+0x200` (`./zoom`'s state: 0 third person, 1-3 first person, 3 the night vision,
   * 4 the 9x view, 5 and up a scope): the arc is drawn below 4, pale in 3. Without it, 0.
   */
  viewState?(): number;
  /**
   * EFFECTS: hangs a scorch on the moving placement at `path` (`WorldView.attachToNode`, as `FireSource`'s): the game
   * links the blast set's entries into the hit visual's own list too (`FUN_003b3800` 306396-306416), so a scorch on a
   * door's leaf moves with it. Returns the detacher, or null for a node that does not move.
   */
  attachToNode?(path: string, mark: Object3D): (() => void) | null;
  /**
   * LATER 277 (`WorldView.holdOnNode`, as `FireSource`'s): `gone` once the scorch's node is switched off -- a bridge or
   * a base blown, a pane broken -- since the blast set's entries are drawn in that node's packet too (`FUN_003b3800`).
   */
  holdOnNode?(path: string, gone: () => void): (() => void) | null;
  /** SUP-03: the view's ray (`WalkMode.fireAim`): what the reticle is on is C4's target (`./equipment` `aimPick`). */
  aim?(): { eye: readonly number[]; far: readonly number[] } | null;
  /** NET-CAP (research 312 §10): the page is in a match -- a network game (`SOLO_IS_NETWORK_READING`) -- so `FUN_005c0ae0`'s cap holds (`./net/netCap`). Absent or false: offline, no cap. */
  online?(): boolean;
  /**
   * THROW-INTERRUPT (research 326 §2.4): the page's own SEAL dead, as the room has it (`WalkMode.isDead`, the net
   * client's `kill`). A dead SEAL's wind-up throws nothing and a throw not yet let go is cut (`GrenadeThrower.die`).
   * Absent: never dead.
   */
  dead?(): boolean;
  /**
   * P36 (TB-12; research 256 section 6, research 251 section 12.8; reading, pending review): the playing clip's `NoFire`
   * as the round's gate judges it (`WalkMode.fireAllowed`, `./net/fireCapability` -- the room's frame `fire`, which
   * `room.ts` `takeThrowStart` refuses as 'nofire'). `FUN_0059d830` asks `FUN_005a7de0(actor, 1, 1)` (D:L457365), its
   * phase test the top's `NoFire` whatever the clip: false holds the chase and refuses the release request
   * (`GrenadeThrower.update`, `startThrow`). Absent: open.
   */
  fireAllowed?(): boolean;
  /**
   * Research 209 §18: the room's tick (`Room.tick`, the in-page clock's). The online C4's one-second fallback counts
   * these, not a stalled frame's wall time, and only after that clock's `detonate` has been applied.
   * Absent: a test's own frames, and a remote server's lost message, still count game frames.
   */
  simTick?(): number | undefined;
}

/** What the held throw's arc shows (`FUN_005970b0`; `GrenadeStats.arc`). */
export interface ArcStats {
  visible: boolean;
  /** The strip's segments (`throwArc`: 101 for the game's 100). */
  segments: number;
  /** `THROW_ARC.color`, or `nightColor` in view mode 3. */
  color: V3;
  /** The launch the arc draws: `GetThrowAnim`'s table point in the world and the throw's velocity for the power now. */
  from: V3;
  velocity: V3;
  /** The strip's first point (a second before the hand) and last (twice the fall to the feet's level). */
  start: V3;
  end: V3;
  t1: number;
}

/** A throw as it left the hand: for the hook, the audio and the tests. */
export interface ThrowInfo {
  power: number;
  anim: ThrowAnim;
  launch: ThrowLaunch;
  /** The aim's sine the throw took (the walk's pitch). */
  aimSin: number;
  stance: ThrowStance;
  from: V3;
  velocity: V3;
  /** The sound the game's throw zAnim plays (`FireAnimName` `frag_start` -> `.THROW_OBJECT`). */
  sound: string;
  /** The throw zAnim itself (`frag_start`, `HE_start`), for the audio's zAnim map. */
  fireAnim: string;
  /** The throwable, and whether the release came from the posed hand (else the table's point). */
  item: GrenadeItem;
  /** Absolute kit slot, when a loadout is present (research 361 §1). */
  slot?: number;
  fromHand: boolean;
}

export interface BounceInfo { material: string; pos: V3; speed: number; sound: boolean; anim: string }
export interface ExplosionInfo {
  pos: V3;
  /** `Explosion_Radius` x10. */
  radius: number;
  /** The zAnim (`frag_grenade`; the material's own `frag_grenade_<material>` where the game has one). */
  anim: string;
  /**
   * The throwable's own explosion zAnim (`DefaultSpecialAnimName`: `frag_grenade`, `HE_grenade`): the material
   * variants call it (set 0 command 0x45) rather than play `.GREN_MED` themselves.
   */
  baseAnim: string;
  /** The material under it, when it lay on one. */
  material: string | null;
  /** `explosionDamage` at the player's feet, 0 beyond the radius (nothing takes it). */
  damageToPlayer: number;
  distanceToPlayer: number | null;
  /** The throwable, and what it does going off. */
  item: string;
  detonation: Detonation;
  /**
   * The flashbang's white-out level for the player (`flashLevel`: 1-3, the map's `blindplayer0<level>`), from the
   * distance and how squarely the SEAL faces it; null for the others, out of reach, or no SEAL on the ground.
   */
  flash: 1 | 2 | 3 | null;
  /** Whether the game's own zAnim ran through the effects (`setEffectPlayer`), so no placeholder was drawn. */
  byEffects: boolean;
}

/** Where the effects play a zAnim: the point, and the surface's normal when it lay on one. */
export interface EffectAt { position: V3; normal?: V3 | null; velocity?: V3 | null }

/** The events other workstreams hang off (`on`). */
export interface GrenadeEvents {
  /**
   * The slot changed. The firearm stays in the hand while an item is up (`FUN_005a64c0`: no re-parent for class 3;
   * research 85 s8.1); the launcher's raise is the one that stows it (`./matchThrow`).
   */
  equip: (equipped: boolean, item: HeldItem | null) => void;
  /**
   * The throw's clip starts (`./throwPose` plays `anim.clip`: the pistol's version with the sidearm in the hand,
   * `handAnim`); the hand lets go in `releaseIn` s. `hold`: the clip the mover holds on (`HOLD_CLIPS`: the played clip
   * when it is one, else its rifle type's -- the same clock on the disc).
   */
  throwStart: (info: { anim: ThrowAnim; power: number; releaseIn: number; hold: string; slot?: number }) => void;
  /**
   * A charge set down (the claymore, the PMN, C4): where, facing which way (`yaw`, and `facing` as a unit vector: the
   * match's `throw` of it carries it as its velocity), and its zAnim (`c4_start`: `.PLACE_CHARGE`). C4's names its
   * target and the struck node and point (PF-13: the `throw`'s `target` and `surface`, which the room checks).
   */
  place: (info: {
    item: GrenadeItem; slot?: number; pos: V3; yaw: number; facing: V3; fireAnim: string; target?: number; surface?: { path: string; point: V3 };
    /** LATER 305: the camera eye C4's aim ray left when it struck `surface` (the room's optional `eye`). */
    eye?: V3;
  }) => void;
  /** The grenade leaves the hand (audio: `.THROW_OBJECT`). */
  throw: (info: ThrowInfo) => void;
  /**
   * THROW-INTERRUPT (research 326 §2.4): a throw or a placing not yet let go, cut by the page's own death -- nothing
   * thrown, set down or spent here (the original's drop at the death is the room's, `FUN_005b8920`); `./matchThrow`
   * stops its clip.
   */
  cut: (info: { reason: 'death'; item: GrenadeItem }) => void;
  /**
   * LATER 529 (F3 of LATER 526's review): a throw asked, its hand not yet open, cancelled by the turret's take and kept
   * for the room's word on it (`mountTake`) -- before the take's pop, so `./matchThrow` keeps its clip
   * (`ThrowPose.keep`).
   */
  mountTaken: () => void;
  /**
   * LATER 529 (F3): that throw handed back at the room's refusal of the take (`mountUntake`) -- after the walk laid the
   * body's hold back, so `./matchThrow` lays its clip back (`ThrowPose.resume`). `overrun`: the seconds the wait ran past
   * the hand's opening (0: the hand is still to open), the clip's to hold at the release phase for the let-go (the review's F1).
   */
  mountHandedBack: (info: { overrun: number }) => void;
  /** Research 304: accepted remote release, separate from the local event that transmits a throw. */
  remoteRelease: (info: { item: string; id: number; fireAnim: string; from: V3; owner?: number }) => void;
  /**
   * M203-FIRE-SOUND (research 94 §C4.5): another's launched round the room told live (`launchRemote`, never a joiner's
   * hydrate) -- the copy's release plays the report (`FUN_005c5340` D:L479449-479450) and the round's own FireAnimName on
   * its projectile (`FUN_003caf60` D:L320608-320613); `./matchThrow` hears both.
   */
  remoteLaunch: (info: { item: string; id: number; fireAnim: string; from: V3; owner?: number }) => void;
  /**
   * LATER 645 (research 81 s5): another's rocket (class 0xb9) passed the page's feet -- one game frame's segment, `from`
   * -> `to`, came strictly under `ROCKET_BY_DISTANCE` of `actor` at a point inside it (`passingSound`); told once a
   * rocket (`FUN_00598000` D:L454640-454646). `./matchThrow` plays `.ROCKET_BY` (`GameAudio.onRoundPast`, rocket).
   */
  rocketPast: (info: { from: V3; to: V3; actor: V3 }) => void;
  /** A bounce (audio: the material's `grenade_hit_*` zAnim when `sound`). */
  bounce: (info: BounceInfo) => void;
  /** The explosion (audio `.GREN_MED`; the look workstream's screen shake by distance). */
  explode: (info: ExplosionInfo) => void;
  /** The claymore not set down: `CLAYMORE_RULES.maxPlacedMessage` for `seconds` (the UI's message line). */
  refuse: (info: { item: GrenadeItem; text: string; seconds: number }) => void;
  /** The Detonator fired (`CZKit_DetonateRemoteExplosives`): how many charges it set off, from where. */
  detonate: (info: { count: number; from: V3 }) => void;
}

export interface GrenadeStats {
  equipped: boolean;
  /** The throwable up, or the one that would be taken (`KIT_ITEMS`); `leftByItem` its count and the other's. */
  item: GrenadeItem;
  leftByItem: Partial<Record<GrenadeItem, number>>;
  /** M7: the three equipment slots' items as the loadout holds them (null: no kit given, the legacy pouch). */
  kit: (string | null)[] | null;
  /** Selected absolute kit slot and each slot's independently held magazines (research 361). */
  slot: number | null;
  equipmentSlots: EquipmentSlotState[];
  /** Its HUD icon (`IconTextureName`; the Detonator's while it is up). */
  icon: string;
  /** What is in the hand: a throwable, the Detonator, or null for the rifle. */
  held: HeldItem | null;
  /**
   * The SEAL's own claymores down (`claymoresDown`; `CLAYMORE_RULES.maxPlaced` at most). PAR-96: kept by this name for the
   * instruments and the e2e specs that read it, each over a claymore; was every charge of the SEAL's set down.
   */
  placed: number;
  /** The placing action's clock running (`CLAYMORE_RULES.placeSeconds` to the charge on the ground). */
  placing: boolean;
  /** The refusal on screen (`CLAYMORE_RULES.maxPlacedMessage`), null when none. */
  message: string | null;
  /** Whether the grenade rides the posed hand's node (else the placeholder hold). */
  inHand: boolean;
  phase: GrenadePhase;
  power: number;
  left: number;
  thrown: number;
  record: Pick<ThrowableRecord, 'name' | 'fuse' | 'removal' | 'gravity' | 'explosionRadius' | 'explosionDamage' | 'capacity' | 'model'>;
  live: {
    pos: V3; vel: V3; state: Grenade['state']; fuse: number; bounces: number; age: number; tumble: V3;
    /** PF-28: the timer to the removal; another player's projectile's `pid`, a charge's owner and facing (yaw, degrees). */
    removal: number; pid?: number; owner?: number; facing?: number;
  }[];
  /** PF-28: the smokes pouring (`SMOKE_PLACEHOLDER`'s puffs): where, how long since the detonation, until when. */
  smokes: { pos: V3; age: number; until: number; pid?: number }[];
  lastThrow: (Omit<ThrowInfo, 'anim' | 'launch'> & { clip: string; toss: boolean; pitchDeg: number; speed: number; maxSpeed: number; range: number; releaseIn: number }) | null;
  bounces: BounceInfo[];
  explosions: ExplosionInfo[];
  effects: number;
  model: boolean;
  trail: boolean;
  defaultMaterial: string;
  /** The yellow arc while the throw is held; null when none is drawn. */
  arc: ArcStats | null;
  /** EFFECTS (research 89 §13): the colour the last scorch was modulated by (the world's under it); null: unity. */
  scorchShade: [number, number, number, number] | null;
  /** The permanent decal pool's entries taken this map (`PERM_DECAL_TRIANGLES` at most): the scorches' triangles. */
  scorchTriangles: number;
}

/** How many scorches without a drawn surface under them are asked again a frame (`GrenadeThrower.shadeLate`). */
const SHADE_RETRIES_PER_FRAME = 4;

const rand = (lo: number, hi: number, r: () => number): number => lo + (hi - lo) * r();

interface Particle { sprite: Sprite; vel: V3; life: number; age: number; size: [number, number]; gravity: number; fade: number; still?: boolean }
/** A grenade in the air or on the ground; `rest` is the material it came to rest on, null while it has not. */
/**
 * PF-13, LATER 122: a C4 plant's save (`FUN_005be9a0` D:L475408-475440): the target, the struck node, point and
 * material, and the polygon struck with its points then (`watch`; `C4_TARGET_MOVED_READING`).
 */
interface C4Aimed {
  target: number; material: string; surface: { path: string; point: V3 };
  /** LATER 305: the eye the pick was cast from (`aim().eye`), sent with the plant's `throw`. */
  eye: V3;
  watch: { poly: { readonly points: ArrayLike<number> }; at: readonly number[] };
}
interface Live {
  g: Grenade; model: Group | null; trail: V3[]; line: Line | null; dots: Points | null; rest: string | null;
  /** A placed charge's facing (the SEAL's yaw when it was set down, degrees); undefined for a thrown grenade. */
  facing?: number;
  /** Another player's (`launchRemote`): not the page's to count or set off. */
  remote?: boolean;
  /** Another player's placed charge: its owner's id (the `grenade` event's `id`), whose Detonator alone sets it off. */
  owner?: number;
  /**
   * PF-28 (PF.R47; research 231 s2): the room's stable id for another player's projectile (the `grenade` event's `pid`,
   * the join envelope's): one told twice -- the event, then a rejoin's welcome -- is replaced, never doubled. The page's
   * own throws have none.
   */
  pid?: number;
  /**
   * PF-28 fix round: its smoke is the effects player's (true; not the placeholder puffs, false), started once. PAR-45:
   * absent while none pours for it -- not gone off yet, or stopped by `clearSmokes` -- so a hydrate after a clear starts
   * it again.
   */
  effectSmoke?: boolean;
  /**
   * MISSION R8 (the drawing only, see `drawLive`): the position and the tumble before the last game frame's step;
   * undefined until the first step (drawn where it is).
   */
  from?: { pos: V3; tumble: V3 };
  /** LATER 645: another's rocket has passed the page's feet (`FUN_00598000`'s `+6` bit 4, D:L454641/D:L454646): told no more. */
  rocketBy?: true;
  /** Research 209 §18: game frames an online C4 has waited past Timer1 for the room's `detonate`, when no room tick is wired. */
  serverFuseWait?: number;
  /** Research 209 §18: the room tick when that wait started (`simTick`). */
  serverFuseTick?: number;
}
/**
 * A throw on its way: `GetThrowAnim`'s pick (`anim`: the release fraction, the hand point) and the clip played
 * (`played`), the power the release request took. The aim and the stance are not kept: the hand-open reads them as they
 * are then (PAR-20 D11, `letGo`).
 */
/**
 * `popped`: the body's throw clip came off before the hand opened (a knock, a flinch's fall: `followBody`), the kit's
 * timer running on (`KNOCKED_THROW_POWER_READING`).
 */
interface Pending { anim: ThrowAnim; played: ThrowAnim; power: number; left: number; total: number; popped?: boolean }

/** THROW_DIAG_ADAPTATION (LATER 247): why the last release request was refused (`startThrow`), for `diag` alone. */
export type ThrowRefusal = 'noSnap' | 'dead' | 'netCap' | 'airborne' | 'climb' | 'nofire' | 'stance' | 'power' | 'clear';

/**
 * THROW-INTERRUPT (research 326 §2.4, §7) [reading]: the power a throw knocked off before its release leaves with. The
 * knock pops the throw's clip (`FUN_0057e770` -> `FUN_0058a4d0`, D:L440997) and clears neither the kit's pending bit nor
 * its timer (`+1` 0x02, `+0x87c`: cleared only at D:L471751-471755, D:L475503-475507, D:L476897-476901,
 * D:L480873-480877), so the grenade still leaves at the timer (`FUN_005c1970` D:L476883-476901), with the controller's
 * power as it stands then (D:L477024). That power is zeroed in between only if the controller's wind-up block runs
 * after the pop (`FUN_0059d830` answering, D:L453478-453489): refused while the knock has the SEAL in the air
 * (`+0x105e` 0x20, D:L457369; the knock's lift D:L441064), its refusals over the knock's own clip (`FUN_005a7de0`'s
 * phase test, D:L462620 on) not read. `'kept'`: the release's power, the port as it stood; `'zeroed'`: power 0, the
 * tap's toss. Settles: those refusals read over the knock clips with their `NoFire`, or capture TI-1 (a standing throw
 * knocked off by a blast before its hand opens, the grenade's landing against the power held).
 */
export const KNOCKED_THROW_POWER_READING = 'kept' as 'kept' | 'zeroed';

/**
 * GRENADE-RETHROW (research 326 §2.1, §7; the tester's report, 2026-11-09) [reading]: the updates from the throw clip's
 * pop to the next wind-up's first chase when the trigger is held through it. No cooldown stands between two grenades of
 * one slot (`FUN_005c5340`'s after-shot lock wants `ReloadAfterShot`, D:L479318-479343, which no throwable carries), so
 * the clip's pop is the only gate. While the throw is on top `FUN_0059d830` answers 0 (D:L457352-457362) and the plain
 * trigger branch reads the button's level (D:L453543-453567); a press with a grenade left sets the wind-up bit there
 * (D:L453633-453637). At the pop (the update `FUN_005a7d10` first finds no throw, D:L453484) the bit-0x80 branch clears
 * both bits, zeroes the power and remaps the edge (D:L453485-453500); on the next update a button still down reads as a
 * fresh press and, the slot holding one (`FUN_005bdb00` -> `FUN_005bda70`, D:L474519-474538), sets the wind-up bit
 * again (D:L453633-453637); the update after it chases the power from 0 (D:L453505-453517). So 2: the chase's first
 * update is the second after the pop's. The original's are controller updates (`FUN_00594cf0`, one a game frame, a fixed
 * step); the port counts `update` calls, one a page frame at a variable step (the "next update throws" precedent,
 * `release`), so the re-arm lands two page frames after the pop -- about 14 ms at 144 Hz, 33 ms at 60 Hz, 67 ms at 30 Hz:
 * frame-rate dependent (review F2). Settles: a PCSX2 capture of the controller's `+0x170`, `+0x118` and `+0x11c`
 * per frame through a second throw held from the first's follow-through (research 326 §7).
 */
export const THROW_REARM_UPDATES_READING = 2;

/**
 * A1 (research 215 s8.6 "A1"; the push read) [placeholder]: a held throwable's fuse at the turret's take. The take pops the
 * body's stack (`FUN_0058c350` D:L447983-447988) and its take-up zeroes the controller's power (`FUN_00592d40` D:L478915),
 * so a wind-up or a throw whose hand has not opened throws nothing (`GrenadeThrower.mountTake`). What the kit does then
 * with the throwable in the hand -- its pending bit and its timer (`+1` 0x02, `+0x87c`, KNOCKED_THROW_POWER_READING's) --
 * is unread across the take-up (`FUN_005c4b10` D:L478777-478935); no fuse runs in the hand here, so nothing goes off.
 * Settled by that read, or a capture (a mount taken with a grenade held, and with a throw asked).
 */
export const MOUNT_HELD_THROW_FUSE_PLACEHOLDER = 'none in the hand' as const;

/**
 * The clip the mover holds on for a played throw or placing (`HOLD_CLIPS`, the command's hold code): the played clip
 * when it is a hold of its own (the pistol's toss and plant), else its rifle type's -- the pistol's other versions have
 * the rifle's playback, keys, `NoInterrupt` and root travel on the disc (`test/moverHold.test.ts`, `equipmentAnim.test.ts`).
 */
export function holdClipOf(played: ThrowAnim, base: ThrowAnim): string {
  return isHoldClip(played.clip) ? played.clip : base.clip;
}

type Listeners = { [K in keyof GrenadeEvents]: GrenadeEvents[K][] };

/**
 * PF-36 (ruling PF.R56; research 235 s4): how the page learns the room's pid for its own throw or charge -- the room's
 * `placed` event to the thrower alone (`GrenadeThrower.tagOwn`, matched by kind and launch point). A port rule with no
 * original counterpart (the original's placer holds its own object) [reading]. Until wave 4 wires it (`netPage.ts`,
 * `main.ts`) the owner's copy has no pid, so the room's `detonate` cannot reach it (research 235 s5).
 */
export const OWN_PID_READING = 'placed event' as const;

/**
 * Browser adaptation, not a fuse (research 209 §18): how long an online C4 that the room has named waits past
 * `Timer1` for the room's `detonate` before the page's copy goes off anyway. The wait is room ticks when `simTick`
 * is wired, so a stalled frame's wall time cannot spend it before that clock's `detonate` is applied. With no room
 * tick (a remote server's lost message, a test) it is still game frames. `nomatch` never waits (`online()` is false,
 * and the local fuse still opens the barricade).
 */
export const C4_SERVER_DETONATE_GRACE_S_ADAPTATION = 1;

/**
 * LATER 643 (research 85 §6.1): a browser guard, no original (the console flies every copy from the release on one
 * clock). The most game frames another's copy is started into its flight at once (`GrenadeThrower.launchRemote`'s
 * `ageTicks`, the room's `grenade` event's `age`): the room's own bound on one step's flight
 * (`ROOM_FLIGHT_MAX_FRAMES_ADAPTATION`, match `room.ts`: the queue's 10 s, 300 frames), pinned equal by central
 * `roomGrenadeFuse.test.ts`, so a page never flies a copy further at once than the room flew its own.
 */
export const REMOTE_AGE_MAX_FRAMES_ADAPTATION = 300;

export class GrenadeThrower {
  /** Everything drawn: the hand's grenade, the ones in flight, the effects, the scorches. `main.ts` adds it once. */
  readonly object = new Group();
  private templates: Partial<Record<GrenadeItem, Group>> = {};
  private readonly hand = new Group();
  private handModel: Group | null = null;
  /** The clone on the body's held node, and which item it is. */
  private heldModel: { item: HeldItem; object: Group } | null = null;
  /** The Detonator is up (`item_` stays the claymore, the slot it came from). */
  private detonatorUp = false;
  private detonatorTemplate: Group | null = null;
  /**
   * The placing action: the kit's timer to the charge down (`left`), its clip's whole length, the time since its start,
   * and C4's clip callback still to come (`callback`, seconds to it; null for the claymore's and the PMN's, which have
   * none, and for C4's once it ran or was removed). PAR-20 D09 (research 256 s3).
   */
  private placing: { left: number; total: number; elapsed: number; callback: number | null } | null = null;
  private refusal: { text: string; left: number } | null = null;
  private item_: GrenadeItem = 'M67';
  /** The thrower's records by item: the baked ones, and the disc's as `setRecords` hands them in (M7). */
  private readonly records: Partial<Record<GrenadeItem, ThrowableRecord>>;
  /** M7: the loadout's three equipment slots (`setKit`), their items by name; null: the legacy pouch (every record). */
  private kit: (string | null)[] | null = null;
  private slotAmmo: EquipmentSlots | null = null;
  private selectedSlot: number | null = null;
  /** FUN_005c0020's +0x828 marker: only the Action shortcut restores its prior slot (research 361 §2). */
  private actionReturn: { item: KitItem; slot: number | null } | null = null;
  /** SUP-03: the page's scene health, whose destructibles are C4's targets (`setWorld`); null: none, C4 refused. */
  private world: () => { health: Pick<SceneHealth, 'c4TargetAt' | 'blastAt'> & Partial<Pick<SceneHealth, 'hitAt'>> } | null = () => null;
  /** M7: a C4 plant's placing in progress (the kit goes back to the firearm after it, `FUN_005c4b10`). */
  private plantingC4 = false;
  /** PF-13: the settle on the target under the reticle (kit `+0x8a4`; `./equipment` `C4Settle`), stepped each frame. */
  private readonly c4Settle = new C4Settle();
  /** PF-13: the plant in progress's target and struck point, for the `place` event (the wire's `throw`). */
  private c4Aimed: C4Aimed | null = null;
  /** AD-5, LATER 102: each record's round's `Piercing` by item id, for the scene blast (`BAKED_PIERCING`, then the disc's). */
  private readonly piercings = new Map<number, number>(
    (Object.keys(BAKED_PIERCING) as BakedItem[]).map((k) => [THROWABLES[k].id, BAKED_PIERCING[k]]));
  private textures = new Map<string, Texture>();
  private defaultMaterial = '';
  private cast: HullCast | null = null;
  private castGrid: Grid | null = null;
  private equipped_ = false;
  private phase_: GrenadePhase = 'holstered';
  private power = 0;
  private left: Partial<Record<GrenadeItem, number>>;
  private thrown = 0;
  private pending: Pending | null = null;
  /**
   * PAR-19 D08 (research 251 section 4.2): the body's one-shot the throw started (`throwStart`'s `hold`) as the snapshot
   * shows it (`PlaySnapshot.hold`, `holdSerial`: the shared model's body owner, `Walker.bodyOwner`), its serial taken at
   * the first snapshot that shows it; null with none.
   */
  private bodyHold: { clip: string; serial: number | null } | null = null;
  /**
   * Why the body's hold ended (`noteHoldEnd`), heard from the mover before this frame's snapshot drops it. A heard
   * end (a knock, a `replaced`) keeps C4's 99 s interim (`C4_FALLBACK_PLACEHOLDER`, H156). No reason means the hold
   * vanished unheard, which `C4_PLANT_LEAVE_CANCEL_ADAPTATION` cancels. Cleared while the hold is still showing, so
   * the end of the clip this one replaced is not kept for this one.
   */
  private holdEnd: ActionEndReason | null = null;
  private recover = 0;
  private readonly live: Live[] = [];
  /** The page's frames into game frames: the flight steps once per game frame (PF-04, PF.R8). */
  private readonly flight = new GameFrameAccumulator();
  private readonly particles: Particle[] = [];
  private readonly scorches: Mesh[] = [];
  /** EFFECTS: the scorches riding a moving node, and each one's detacher (`GrenadeSource.attachToNode`). */
  private readonly onNode = new Map<Mesh, () => void>();
  /** LATER 277: each scorch's hold on its hit node (`GrenadeSource.holdOnNode`), released with it. */
  private readonly heldOn = new Map<Mesh, () => void>();
  /**
   * The game's permanent decal pool (`PERM_DECAL_TRIANGLES`, research 89 §5): each scorch's entries (its kept world
   * triangles; the bare square's two while nothing drawn is under it yet), and their sum this map. Full, a scorch is
   * refused; nothing is recycled but a scorch whose node is switched off (LATER 277, `dropScorch`); the pool empties
   * with the map (`reset`, `FUN_003bf050`).
   */
  private readonly scorchTriangles = new Map<Mesh, number>();
  private permTriangles = 0;
  private lastThrow: GrenadeStats['lastThrow'] = null;
  private readonly bounceLog: BounceInfo[] = [];
  private readonly explosionLog: ExplosionInfo[] = [];
  private trail = false;
  private readonly listeners: Listeners = { equip: [], throwStart: [], place: [], throw: [], cut: [], mountTaken: [], mountHandedBack: [], remoteRelease: [], remoteLaunch: [], rocketPast: [], bounce: [], explode: [], refuse: [], detonate: [] };
  private readonly scorchGeometry = new PlaneGeometry(1, 1);
  /** `grenade_mark.tif` as decoded (`GrenadeAssets.bitmaps`), for the scorch's material; null: the dark stand-in. */
  private scorchBitmap: Rgba | null = null;
  /** The scorches' one material (the marks' GS arithmetic, `markMaterial`), made on first use, a map's life. */
  private scorchMaterial: Material | null = null;
  /** EFFECTS: the world's drawn colour under a point (`./surfaceShade`), or null: every scorch at unity. */
  private shade: SurfaceShade | null = null;
  private scorchShade: [number, number, number, number] | null = null;
  /** Scorches laid where no drawn surface was yet under them (the props stream in after the map shows), asked again. */
  private readonly unshaded = new Map<Mesh, V3>();
  /** EFFECTS: the clip to the drawn world (`./markClip`), or null: the flat square with one shade. */
  private clipper: MarkClipper | null = null;
  /** Clipped scorches with nothing drawn under them yet (the bare square meanwhile), clipped again a few a frame. */
  private readonly unclipped = new Map<Mesh, MarkFrame>();
  /** The held throw's arc (`FUN_005970b0`): one strip, refilled each frame while it shows. */
  private readonly arcLine: LineSegments;
  private arc: ArcStats | null = null;

  constructor(
    private readonly source: GrenadeSource,
    records: ThrowableRecords = THROWABLES,
    private readonly random: () => number = Math.random,
  ) {
    this.records = { ...records };
    this.left = this.capacities();
    this.object.add(this.hand);
    this.hand.visible = false;
    this.arcLine = arcStrip();
    this.object.add(this.arcLine);
  }

  /**
   * EFFECTS (socomlegacy/docs/research/89): whether the explosion draws `EXPLOSION_READING`'s sprites -- only when the page
   * has not the game's own zAnim explosion to run (`main.ts` answers false once the map's effect data is in).
   */
  private placeholderBurst: () => boolean = () => true;
  setPlaceholderBurst(when: () => boolean): void {
    this.placeholderBurst = when;
  }

  /** Subscribes to an event; returns the unsubscribe. */
  on<K extends keyof GrenadeEvents>(kind: K, fn: GrenadeEvents[K]): () => void {
    (this.listeners[kind] as GrenadeEvents[K][]).push(fn);
    return () => {
      const list = this.listeners[kind] as GrenadeEvents[K][];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    };
  }

  private emit<K extends keyof GrenadeEvents>(kind: K, ...args: Parameters<GrenadeEvents[K]>): void {
    for (const fn of this.listeners[kind] as ((...a: typeof args) => void)[]) fn(...args);
  }

  /** The current throwable's record. */
  private get record(): ThrowableRecord { return this.records[this.item_] ?? M67; }
  /**
   * An item's count left (0 for none). Own keys only (2026-10-02, ported from Chris's browser-beta-v5, d578f347): a name
   * that is no item -- `constructor`, `toString` -- reads none, not an `Object.prototype` member.
   */
  private leftOf(item: GrenadeItem): number {
    if (this.slotAmmo) return this.slotAmmo.totals()[item] ?? 0;
    return Object.hasOwn(this.left, item) ? this.left[item] ?? 0 : 0;
  }

  private selectedLeft(): number {
    return this.slotAmmo && this.selectedSlot !== null ? this.slotAmmo.magazine(this.selectedSlot)?.rounds ?? 0 : this.leftOf(this.item_);
  }

  /** The exact slot in hand, rather than the first duplicate's index (FUN_005c4b10, research 361 §2). */
  heldSlot(): number | null { return this.equipped_ && !this.detonatorUp ? this.selectedSlot : null; }

  magazineOf(slot: number): { rounds: number; capacity: number; mags: number } | null { return this.slotAmmo?.magazine(slot) ?? null; }

  private spendSelected(): boolean {
    if (this.slotAmmo) return this.selectedSlot !== null && this.slotAmmo.spend(this.item_, this.selectedSlot) !== null;
    if (this.leftOf(this.item_) <= 0) return false;
    this.left[this.item_] = this.leftOf(this.item_) - 1;
    return true;
  }

  /**
   * LOW-2 round 2 (web research 223 s6): a throw the room refused stale never left its pouch: the item back in the
   * page's, one, never past the pouch full (`capacities`); false for a name that is no throwable, or a full pouch.
   */
  giveBack(item: string, slot?: number): boolean {
    if (!GRENADE_ITEMS.has(item)) return false;
    if (this.slotAmmo) return this.slotAmmo.refund(item, slot);
    const full = this.capacities()[item as GrenadeItem] ?? 0;
    const left = this.leftOf(item as GrenadeItem);
    if (left >= full) return false;
    this.left[item as GrenadeItem] = left + 1;
    return true;
  }

  /**
   * OT.R59 (RECONNECT-GHOST, a labelled adaptation): the room's pouch laid on the page's at a resume -- each throwable or
   * charge the page carries set to the room's count (never past the pouch full, `capacities`), no refill; a name the
   * page's pouch does not hold is passed over.
   */
  setLeft(pouch: Readonly<Record<string, number>>, slots?: readonly EquipmentSlotState[]): void {
    if (this.slotAmmo) {
      if (slots === undefined) this.slotAmmo.restoreLegacy(pouch);
      else this.slotAmmo.restore(slots, pouch);
      return;
    }
    const full = this.capacities();
    for (const [item, n] of Object.entries(pouch)) {
      if (!GRENADE_ITEMS.has(item) || !Object.hasOwn(this.left, item) || !Number.isFinite(n)) continue;
      this.left[item as GrenadeItem] = Math.max(0, Math.min(Math.floor(n), full[item as GrenadeItem] ?? 0));
    }
  }

  /**
   * M7: the disc's records (`KitTable.throwables`: the hand grenades, the claymore, the PMN, C4), each replacing the
   * baked one of its name; items that are not the hand's (the Satchel, MPBOMB) are passed over by every hand path and
   * kept for a scene program's round alone (`sceneRecords`, `fireScene`).
   */
  setRecords(records: Iterable<ThrowableRecord | PiercedRecord>): void {
    for (const entry of records) {
      const r = this.pierced(entry);
      if (!GRENADE_ITEMS.has(r.name)) { this.sceneRecords.set(r.name, r); continue; }
      const item = r.name as GrenadeItem;
      this.records[item] = r;
      const t = this.modelTemplates?.[r.model];
      if (t) this.templates[item] = t;
      this.left[item] ??= 0;
    }
  }

  /** An entry's record; a kit table's entry also leaves its round's `Piercing` by id (`piercings`). */
  private pierced(entry: ThrowableRecord | PiercedRecord): ThrowableRecord {
    if (!('record' in entry)) return entry;
    this.piercings.set(entry.record.id, entry.piercing);
    return entry.record;
  }

  /**
   * LATER 32: the record the page holds for a wire's kind (`zweapon.rdr`'s `InternalName`) -- the baked one, or the
   * disc's once `setRecords` has it -- null for a name that is not the hand's (own keys only, as `launchRemote` reads
   * them). The replay's fold reads it (`ReplayClientOptions.throwable`), so it folds the same records the page draws.
   */
  recordOf(kind: string): ThrowableRecord | null {
    return Object.hasOwn(this.records, kind) ? this.records[kind as GrenadeItem] ?? null : null;
  }

  /**
   * M7 (spec W4.R5; research 94 §A6): the loadout's three equipment slots, in kit order, by their items' names (null
   * or a name the hand does not take for an empty slot, a launcher, a round, 2X, the thermal scope). The pouch becomes
   * the kit's (each slot its record's `Ammo_Capacity` x `NumMags`, `./equipment` `pouchOf`), R2 steps through the kit's
   * own items, and `3`/`4`/`5` take its slots. Null goes back to the legacy pouch (every record).
   */
  setKit(slots: readonly (string | null)[] | null): void {
    this.kit = slots ? [...slots] : null;
    this.slotAmmo = slots ? new EquipmentSlots(slots.flatMap((name, i) => {
      const record = name !== null && GRENADE_ITEMS.has(name) ? this.records[name as GrenadeItem] : undefined;
      return record ? [{ slot: i + 2, record }] : [];
    })) : null;
    this.selectedSlot = this.slotAmmo?.first(this.item_, false) ?? null;
    this.left = this.capacities();
  }

  /** A live kit change/reconnect preserves matching slot rings; a newly named slot starts empty, never refilled. */
  takeKit(slots: readonly (string | null)[]): void {
    const before = this.slotAmmo?.state() ?? [], held = this.held(), selected = this.selectedSlot;
    this.setKit(slots);
    this.slotAmmo!.restoreLegacy({});
    this.slotAmmo!.restore(this.slotAmmo!.state().map(s => before.find(w => w.slot === s.slot && w.kind === s.kind) ?? s));
    if (selected !== null && this.slotAmmo!.kind(selected) === held) this.selectedSlot = selected;
    else if (held !== null && held !== 'Detonator') this.equip(false);
  }

  /**
   * SUP-03: the page's world (`./worldState`), whose scene destructibles are C4's targets (`SceneHealth.c4TargetAt`; the
   * type-less actions retired: research 210 s8).
   */
  setWorld(world: () => { health: Pick<SceneHealth, 'c4TargetAt' | 'blastAt'> & Partial<Pick<SceneHealth, 'hitAt'>> } | null): void {
    this.world = world;
  }

  /**
   * SUP-03, PF-13: the destructible C4 would be planted on now: the one under the reticle (`./equipment` `aimPick`), in
   * reach, taking the charge's `Explosion_Damage` (`c4TargetOf`), held there `C4_AIM_SETTLE_S` and not on an
   * `INVISIBLE_DI` surface (`c4PlantAllowed`), C4 in the kit -- its id, else null (the HUD's C4 prompt). The SEAL's own
   * speed is not read (PF.R13).
   */
  c4Target(): number | null {
    return this.c4Now()?.target ?? null;
  }

  /** The view's pick and the charge's damage, with C4 in the kit and one left; null otherwise. */
  private c4Pick(): { pick: ReturnType<typeof aimPick>; feet: V3; health: Pick<SceneHealth, 'c4TargetAt'>; damage: number; eye: V3 } | null {
    const snap = this.source.snapshot(), world = this.world(), grid = this.source.grid(), aim = this.source.aim?.() ?? null;
    if (!snap || !world || !grid || !aim || !this.kit?.includes('C4') || this.leftOf('C4') <= 0 || !this.records.C4) return null;
    return { pick: aimPick(grid, aim.eye, aim.far, this.defaultMaterial), feet: snap.feet, health: world.health, damage: this.records.C4.explosionDamage, eye: [aim.eye[0]!, aim.eye[1]!, aim.eye[2]!] };
  }

  /** The plant C4 would make now (`c4Target`): its target and the struck node and point; null when refused. */
  private c4Now(): C4Aimed | null {
    const c = this.c4Pick();
    if (!c?.pick) return null;
    const target = c4TargetOf(c.health, c.pick, c.feet, c.damage);
    if (!c4PlantAllowed({ target, settledFor: this.c4Settle.settledFor(target), material: c.pick.material })) return null;
    return {
      target: target!, material: c.pick.material, surface: { path: c.pick.path, point: [...c.pick.point] }, eye: c.eye,
      watch: { poly: c.pick.poly, at: Array.from(c.pick.poly.points) },       // LATER 122: the save's place
    };
  }

  /**
   * PF-13: the settle's frame (`FUN_005be6f0` D:L475130-475197): the plantable destructible under the reticle (reach aside:
   * the plant tests it) and the polygon struck -- none, another, or moved restarts the clock.
   */
  private c4Tick(dt: number): void {
    const c = this.c4Pick();
    if (!c) { this.c4Settle.reset(); return; }
    const target = c.pick ? c.health.c4TargetAt(c.pick.path, c.damage) : null;
    this.c4Settle.step(dt, target, c.pick?.poly ?? null);
  }

  /**
   * The pouch full: the kit's slots' counts (M7), else every baked record at its capacity (the legacy pouch). The map's
   * other records (C4, the PMN; LATER 32: held from the map's load so a replay draws them) enter a pouch only by a kit.
   */
  private capacities(): Partial<Record<GrenadeItem, number>> {
    const out: Partial<Record<GrenadeItem, number>> = {};
    for (const [k, r] of Object.entries(this.records) as [GrenadeItem, ThrowableRecord][]) {
      if (!this.kit && !Object.prototype.hasOwnProperty.call(THROWABLES, k)) continue;
      out[k] = this.kit ? 0 : r.capacity;
    }
    for (const name of this.kit ?? []) {
      const r = name !== null && GRENADE_ITEMS.has(name) ? this.records[name as GrenadeItem] : undefined;
      if (r) out[r.name as GrenadeItem] = (out[r.name as GrenadeItem] ?? 0) + r.capacity * Math.max(1, r.mags);
    }
    return out;
  }

  /** The inventory's steps: the legacy `KIT_ITEMS`, or the kit's own items in kit order and the Detonator with a claymore (M7). */
  private kitItems(): readonly KitItem[] {
    if (!this.kit) return KIT_ITEMS;
    const items: KitItem[] = ['rifle'];
    for (const name of this.kit) if (name !== null && this.records[name as GrenadeItem] && !items.includes(name as KitItem)) items.push(name as KitItem);
    if (this.kit.includes('Claymore')) items.push('Detonator');   // FUN_005c74e0: the Detonator with a claymore in the kit
    return items;
  }

  /**
   * `FUN_005bdc30`'s gate for a throwable's slot (`./equipment` `slotSelectable`): C4 is the Action button's. PAR-96: the
   * context's `claymoresDown` is the SEAL's claymores, the count `FUN_005bdc30` asks for the Detonator (D:L474637-474641).
   */
  private gate(item: GrenadeItem): boolean {
    const r = Object.hasOwn(this.records, item) ? this.records[item] : undefined;   // a name that is no item: refused
    return !!r && slotSelectable(r.id, { claymoresDown: this.claymoresDown(), roundsFor: () => 0 });
  }
  private get template(): Group | null { return this.detonatorUp ? this.detonatorTemplate : this.templates[this.item_] ?? null; }
  /** What is in the hand. */
  held(): HeldItem | null { return !this.equipped_ ? null : this.detonatorUp ? 'Detonator' : this.item_; }
  /**
   * PAR-96 (research 256 §8.1; R256.6): the SEAL's claymores down -- `FUN_003cc1f0` over the placed list (`facing`), by
   * owner (not `remote`), of the entries marked `+0xc5`, the claymore's alone (D:L474101), live
   * (`countsTowardClaymoreLimit`, CLAYMORE_COUNT_LIVE_READING). Asked by the claymore's and the PMN's fire
   * (`startPlacing`) and the Detonator's gate (`gate`, `available`, `takeDetonator`). Was `placedCount`: every charge of
   * the SEAL's set down, its PMNs and C4 among them.
   */
  claymoresDown(): number { return this.live.filter((l) => l.facing !== undefined && !l.remote && countsTowardClaymoreLimit(l.g)).length; }

  /**
   * The placing's kit timer left, in seconds -- the claymore's and the PMN's 1.3 s that `FUN_005be9a0` writes into its
   * kit object's `+0x87c` (D:L475324-475327), C4's 99 s -- or null when no placing runs. A read for the parity
   * harness's recorder (research 366 section 2, `claymore.timer`); it changes nothing.
   */
  placingClock(): number | null { return this.placing ? this.placing.left : null; }
  /** NET-CAP (research 312 §10, `./net/netCap`): online, the hand's record refused while more than five of the page's own live projectiles of the four classes (`live`, not `remote`; set down: `facing`) -- none while nothing flies. */
  private netCapRefused(): boolean {
    if (!this.source.online?.()) return false;
    const live = this.live.filter((l) => l.g.state !== 'removed').map((l) => ({ mine: !l.remote, id: l.g.record.id, placed: l.facing !== undefined && l.g.record.name !== 'Backblast' }));
    return netCapRefuses(this.record.id, netCapLive(live));
  }

  /**
   * PF-28 (the integration review of sprint 29): whether the page flies projectiles of its own -- a throw, a charge, a
   * launcher's round not told by the room (`launchRemote` marks every other's `remote`). A rejoin's join envelope names
   * them too (the room re-owns the seat's list to its new id), and they carry no pid to be replaced by: `NetPage` skips
   * its own id's entries while this is true (`NetPageDeps.ownProjectiles`).
   */
  ownLive(): boolean { return this.live.some((l) => !l.remote); }

  /**
   * A new map: its throwables' models by model name (`WorldView.grenades`) and assets; the pouch refilled, the air and
   * the ground cleared.
   */
  setMap(templates: Readonly<Record<string, Group>> | null, assets: GrenadeAssets | null | undefined): void {
    this.reset();
    if (this.bombModel) { this.object.remove(this.bombModel); this.bombModel = null; }   // XR-06: the last map's bomb
    this.templates = {};
    this.modelTemplates = templates;
    for (const item of Object.keys(this.records) as GrenadeItem[]) {
      const t = templates?.[this.records[item]!.model];
      if (t) this.templates[item] = t;
    }
    this.detonatorTemplate = templates?.[CLAYMORE_RULES.detonator.model] ?? null;
    this.refreshHandModel();
    this.dropHeld();
    for (const t of this.textures.values()) t.dispose();
    this.textures.clear();
    for (const [name, rgba] of Object.entries(assets?.bitmaps ?? {})) this.textures.set(name, textureOf(rgba));
    this.scorchBitmap = assets?.bitmaps?.[GRENADE_BITMAPS.scorch] ?? null;
    if (this.scorchMaterial) { (this.scorchMaterial as MeshBasicMaterial).map?.dispose(); this.scorchMaterial.dispose(); }
    this.scorchMaterial = null;
    this.scorchWarm?.geometry.dispose();                // the warm-up's scorch was the old material's
    this.scorchWarm = null;
    this.scorchClipWarm?.geometry.dispose();            // and its clipped twin (the next map's warm-up makes both again)
    this.scorchClipWarm = null;
    this.defaultMaterial = assets?.defaultMaterial ?? '';
    this.cast = null;
    this.castGrid = null;
  }

  /**
   * A spawn's fresh kit (research 91 §4.3: `FUN_00598b90` -> `FUN_00599b60` -> `FUN_00599f00` 455760-455800 rebuild it
   * at every respawn and every round's start, grenades included): the pouch full, nothing held or cooking, the rifle
   * back in the hand. What is in the air, the charges down and the scorches stay: they are the world's, not the kit's (a round's start
   * drops the air, `clearAir`, and its end the scorches, `clearScorches`).
   */
  refill(): void {
    this.left = this.capacities();
    this.slotAmmo?.fill();
    this.selectedSlot = this.slotAmmo?.first(this.item_, false) ?? null;
    this.actionReturn = null;
    this.plantingC4 = false;
    this.c4Aimed = null;
    this.pending = null;
    this.power = 0;
    this.recover = 0;
    this.placing = null;
    this.refusal = null;
    this.dropHeldThrough();                       // GRENADE-RETHROW: nothing held or cooking
    if (!this.equipped_ && this.phase_ === 'holstered') return;
    this.equipped_ = false;
    this.detonatorUp = false;
    this.refreshHandModel();
    this.phase_ = 'holstered';
    this.emit('equip', false, null);
  }

  /**
   * The scorches go and the permanent pool is empty again (`permTriangles` 0): a round's end (CMPExitState
   * `FUN_00223970` L76084 -> `FUN_0031c880` -> `FUN_003bf050(0x4b5050)` L219060) and a new map (`reset`). What is in
   * the air and the pouch are not the pool's.
   */
  clearScorches(): void {
    for (const s of this.scorches) { this.detach(s); this.object.remove(s); s.geometry.dispose(); }
    this.scorches.length = 0;
    this.scorchTriangles.clear();
    this.permTriangles = 0;
    this.unshaded.clear();
    this.unclipped.clear();
    this.scorchShade = null;
  }

  /**
   * What is in the air or set down goes -- the page's own throws and charges and the others' copies -- without a blast,
   * a sound or a mark: a round's start is a fresh level and an abandon leaves it (ROUND_START_PROJECTILES_READING,
   * research 95 §8; the room clears its own the same way, `Room.clearAir`). The pouch, the hand, the effects already
   * playing and the scorches are not the air's (`refill`, `clearRoundEffects`, `clearScorches`).
   */
  clearAir(): void {
    for (const l of this.live) this.dropLive(l);
    this.live.length = 0;
    for (const sm of this.smokes) delete sm.pid;                 // PF-28: pouring on, their pids no longer this round's
  }

  /**
   * ROUND_END_EFFECTS_READING (research 283 §9): a round's end stops the effects playing -- every smoke pouring (the
   * effects player's runs and the placeholder puffs' sources, `clearSmokes`) and every placeholder puff, flash and spark
   * already in the air, not left to run out: the original's round end ages every live particle past its life
   * (`FUN_002aa910` D:L151219 -> `FUN_00326fb0`) and stops the zAnim sets' runs (D:L151211-151218). The page runs it at
   * the next `roundStart` beside `clearAir` (`./matchThrow`). The scorches are `clearScorches`'.
   */
  clearRoundEffects(): void {
    this.clearSmokes();
    for (const p of this.particles) { this.object.remove(p.sprite); p.sprite.material.dispose(); }
    this.particles.length = 0;
  }

  /** Clears the air, the effects and the marks, and refills the pouch (a new map, or the hook). */
  reset(): void {
    for (const l of this.live) this.dropLive(l);
    this.live.length = 0;
    for (const p of this.particles) { this.object.remove(p.sprite); p.sprite.material.dispose(); }
    this.particles.length = 0;
    this.smokes.length = 0;
    this.smokeRuns.length = 0;                                   // PAR-45: a new map's effects are reset; their handles go
    this.clearScorches();
    this.left = this.capacities();
    this.slotAmmo?.fill();
    this.actionReturn = null;
    this.plantingC4 = false;
    this.c4Aimed = null;
    this.thrown = 0;
    this.pending = null;
    this.recover = 0;
    this.power = 0;
    this.lastThrow = null;
    this.bounceLog.length = 0;
    this.explosionLog.length = 0;
    this.flight.reset();
    this.placing = null;
    this.refusal = null;
    this.dropHeldThrough();                                      // GRENADE-RETHROW: a new map's hand holds no trigger
    if (this.detonatorUp) { this.detonatorUp = false; this.refreshHandModel(); }   // no charge down: no Detonator
    if (this.phase_ !== 'holstered') this.phase_ = this.leftOf(this.item_) > 0 ? 'ready' : 'holstered';
  }

  equipped(): boolean { return this.equipped_; }
  phase(): GrenadePhase { return this.phase_; }
  /** The throwable up (or next taken). */
  item(): GrenadeItem { return this.item_; }
  /** The HUD icon of what is in the hand: the throwable's while it is up, null for the rifle's. */
  icon(): string | null { return !this.equipped_ ? null : this.detonatorUp ? CLAYMORE_RULES.detonator.icon : this.record.icon; }

  /**
   * Takes a throwable up (true; `item`, else the last one), puts it away for the rifle (false) or toggles; false when
   * there is none of it left. Mid-throw the slot stays. The equip event.
   */
  equip(on: boolean = !this.equipped_, item: GrenadeItem = this.item_, slot?: number): boolean {
    if (this.phase_ === 'throwing' || this.phase_ === 'holding') return this.equipped_;
    const at = this.slotAmmo ? slot ?? this.slotAmmo.byName(item) : null;
    if (on && (this.slotAmmo ? at === null || this.slotAmmo.kind(at) !== item : this.leftOf(item) <= 0)) return this.equipped_;
    if (on === this.equipped_ && (!on || (item === this.item_ && at === this.selectedSlot)) && !this.detonatorUp) return this.equipped_;
    this.equipped_ = on;
    this.detonatorUp = false;
    this.dropHeldThrough();                       // GRENADE-RETHROW: a take-up is press-only (research 211 §10)
    if (on) { this.item_ = item; this.selectedSlot = at; }
    this.refreshHandModel();
    this.phase_ = on ? 'ready' : 'holstered';
    this.power = 0;
    this.emit('equip', on, on ? item : null);
    return on;
  }

  /**
   * Selects a kit item by name (the rifle, a throwable, the Detonator); false when it cannot be taken up. PAR-19 D07
   * (research 251 section 4.1): during the throw's pre-release wind-up (`holding`: the pressure held, no throw clip on
   * the body yet) an otherwise eligible selection of another slot takes it and drops the wind-up -- the power and the
   * pressure cleared, nothing spent, nothing thrown (`FUN_00594cf0` D:L453288-453310 asks the shoulder press of the
   * kit's gates whatever the trigger holds; `FUN_005c4b10` drops the wind-up, D:L478905-478915: the controller's wind-up
   * bit 0x40 cleared, D:L478914, and its power `+0x11c` zeroed by `FUN_00592d40`, D:L478915 -> D:L451964). An
   * ineligible one is refused and the wind-up goes on; the item already in the hand changes nothing (`FUN_005c4b10`'s
   * same-slot branch); once released (`throwing`) the selection is refused as before. The page's shoulder gate (`./matchThrow`, `./matchFirearm`'s `busy`) is the caller's.
   */
  select(item: KitItem, slot?: number): boolean {
    const at = item !== 'rifle' && item !== 'Detonator' && this.slotAmmo
      ? slot ?? this.slotAmmo.byName(item) : null;
    if (this.phase_ === 'holding' && (item !== (this.held() ?? 'rifle') || at !== this.selectedSlot)) {
      if (!this.windUpSelectable(item)) return false;
      this.phase_ = 'ready';
      this.power = 0;
      this.pressure = 0;
    }
    if (item === 'rifle') return !this.equip(false);
    if (item === 'Detonator') return this.available('Detonator') && this.takeDetonator();
    if (!this.gate(item)) return false;
    return this.equip(true, item, at ?? undefined) && this.item_ === item && this.selectedSlot === at && !this.detonatorUp;
  }

  /**
   * The R2 inventory's question (`./inventoryMenu`, `FUN_005bdc30`), asked without taking anything up: whether the kit's
   * equipment slot `slot` (1-3, as `selectEquipment` reads it) holds a throwable or a charge the hand may take now, or
   * (`'detonator'`) whether the Detonator may be. The item there, by name, or null.
   */
  takeable(slot: 1 | 2 | 3 | 'detonator'): string | null {
    if (slot === 'detonator') return this.available('Detonator') ? 'Detonator' : null;
    const name = this.kit ? this.kit[slot - 1] : equipmentSlots(this.records)[slot - 1];
    return name !== undefined && name !== null && GRENADE_ITEMS.has(name) &&
      (this.kit ? this.gate(name as GrenadeItem) : this.available(name as GrenadeItem)) ? name : null;
  }

  /** PAR-19 D07: a slot the wind-up gives way to -- the rifle, or one `available` (`FUN_005bdc30`, `FUN_005be030`). */
  private windUpSelectable(item: KitItem): boolean {
    return item === 'rifle' || (item === 'Detonator' ? this.available(item) :
      GRENADE_ITEMS.has(item) && (this.slotAmmo ? this.slotAmmo.first(item, false) !== null && this.gate(item) : this.available(item)));
  }

  /** Whether a kit slot can be taken up now (`FUN_005bdc30`: the Detonator only with a claymore down, D:L474637-474641). */
  private available(item: KitItem): boolean {
    if (item === 'rifle') return true;
    if (item === 'Detonator') return this.claymoresDown() > 0 && (!this.kit || this.kit.includes('Claymore'));
    return this.leftOf(item) > 0 && this.gate(item);
  }

  /**
   * The Detonator up (`FUN_005c8a20(0xc1)`): after a claymore goes down, or from the kit while one is down
   * (`FUN_005bdc30`). `force` is the placement's own switch, mid-clip.
   */
  private takeDetonator(force = false): boolean {
    if (!force && (this.phase_ === 'throwing' || this.phase_ === 'holding')) return false;
    if (this.claymoresDown() === 0) return false;
    if (this.detonatorUp) return true;
    this.equipped_ = true;
    this.detonatorUp = true;
    this.item_ = 'Claymore';
    this.selectedSlot = this.slotAmmo?.byName('Claymore') ?? null;
    this.refreshHandModel();
    if (this.phase_ !== 'throwing') this.phase_ = 'ready';
    this.power = 0;
    this.emit('equip', true, 'Detonator');
    return true;
  }

  /**
   * The next item of the kit that has any left, in kit order. Was R2's one-press stand-in for the game's `Inventory`
   * menu (`FUN_0021bda0`); retired from the pad on 2026-10-04 -- R2 opens that menu now (`./inventoryMenu`).
   */
  cycleInventory(): KitItem {
    const now = this.held() ?? 'rifle';
    const items = this.kitItems();
    for (let k = 1; k <= items.length; k++) {
      const next = items[(Math.max(0, items.indexOf(now)) + k) % items.length]!;
      if (this.available(next)) { this.select(next); break; }
    }
    return this.held() ?? 'rifle';
  }

  /** The throw's clip done: the next of the same in the hand, or none left and back to the rifle. */
  private finishThrow(): void {
    this.power = 0;                               // NU-2 D7: the throw off the top, the power cleared (D:L453483-453489)
    // GRENADE-RETHROW (THROW_REARM_UPDATES_READING): the trigger held through the clip re-arms at its pop -- the edge's
    // remap (D:L453490-453500) turns the held button into a fresh press -- when the slot still holds one, asked now.
    const rearm = this.heldThrough;
    this.heldThrough = false;
    this.rearmIn = 0;
    if (this.plantingC4) {                        // M7: after the plant, back to the firearm (FUN_005c4b10, L475463)
      this.plantingC4 = false;
      this.c4Aimed = null;
      this.phase_ = 'holstered';
      this.equipped_ = false;
      this.refreshHandModel();
      this.emit('equip', false, null);
      const back = this.actionReturn;
      this.actionReturn = null;
      if (back) this.select(back.item, back.slot ?? undefined);
      return;
    }
    // Manual selection has no +0x828 return marker; an empty grenade remains selected (research 361 §2).
    if (this.slotAmmo || this.detonatorUp || this.leftOf(this.item_) > 0) {
      this.phase_ = 'ready';
      if (rearm && this.equipped_ && !this.detonatorUp && !isPlaced(this.record) && this.selectedLeft() > 0) this.rearmIn = THROW_REARM_UPDATES_READING;
      return;
    }
    this.phase_ = 'holstered';
    this.equipped_ = false;
    this.emit('equip', false, null);
  }

  /**
   * GRENADE-RETHROW (THROW_REARM_UPDATES_READING): the held trigger's re-armed wind-up, from power 0, once the pop's
   * updates have run -- the plain branch's press (D:L453633-453637) asking the slot again (`FUN_005bdb00`).
   */
  private rearmWindUp(): void {
    if (this.phase_ !== 'ready' || !this.equipped_ || this.detonatorUp || isPlaced(this.record)) return;
    if (this.source.dead?.() || !this.source.snapshot() || this.selectedLeft() <= 0) return;
    this.phase_ = 'holding';
    this.power = 0;
    this.pressure = 1;
  }

  private refreshHandModel(): void {
    if (this.handModel) this.hand.remove(this.handModel);
    const t = this.template;
    this.handModel = t ? t.clone() : null;
    if (this.handModel) this.hand.add(this.handModel);
  }

  private dropHeld(): void {
    this.heldModel?.object.removeFromParent();
    this.heldModel = null;
  }

  /** The debug trail behind each grenade in flight (off by default: the game draws none). */
  setTrail(on: boolean): void { this.trail = on; }

  /**
   * The fire button pressed with the grenade up: the throw's hold begins, its power from 0 (`FUN_00594cf0`); with the
   * claymore or the PMN up, its fire asked once (`startPlacing`, CLAYMORE_HELD_TRIGGER_READING).
   */
  pull(): void {
    // PAR-86 review F1 (research 251 s12.8): the button is a level, read live each update (`FUN_00594cf0` D:L453481,
    // `FUN_002c6350`); pressed again during a wind-up -- let go in the air, where no chase asked the release -- it holds
    // the wind-up on (the bit set again, D:L453633-453637), its power as it stands.
    // THROW-INTERRUPT (research 326 §2.4): a dead SEAL's controller takes no trigger (`FUN_0059d830` refuses with the
    // alive bit `+0xe1` 0x10 clear, D:L457349, cleared at the death, D:L413024 -> D:L144775).
    if (this.source.dead?.()) return;
    // P36: a press is not refused under a `NoFire` top -- the plain trigger's branch sets the wind-up bit (D:L453633-453637,
    // research 251 s12.8); only the chase and the release request ask `FUN_0059d830` (`update`, `startThrow`).
    if (this.equipped_ && this.phase_ === 'holding') { this.pressure = 1; return; }
    // GRENADE-RETHROW (research 326 §2.1; THROW_REARM_UPDATES_READING): pressed under the throw's clip -- pending or
    // after the hand opened -- the press is not dropped: the plain branch reads the button's level (D:L453543-453567)
    // and no release can be asked under the clip (D:L476442, D:L462620-462634), so the level is kept for the pop.
    if (this.equipped_ && this.phase_ === 'throwing' && !this.placing && !this.plantingC4 && !this.detonatorUp && !isPlaced(this.record)) {
      this.heldThrough = true;
      return;
    }
    if (!this.equipped_ || this.phase_ !== 'ready' || !this.source.snapshot()) return;
    if (this.detonatorUp) { this.detonateCharges(); return; }
    if (this.selectedLeft() <= 0) return;
    if (isPlaced(this.record)) { this.startPlacing(); return; }
    this.phase_ = 'holding';
    this.power = 0;
    this.pressure = 1;
  }

  /** The fire button let go: the pressure is 0, and the next update throws (`stepThrowPower`'s release). */
  release(): void {
    this.pressure = 0;
    this.dropHeldThrough();                       // GRENADE-RETHROW: let go before the re-arm, a tap -- nothing re-arms
  }

  /**
   * Browser input ownership: taking a held trigger into a menu must not synthesize a throw. GRENADE-RETHROW: nor re-arm
   * one at the pop (the round screens' path tells the hand no let-go, OBF-31).
   */
  cancelMenuHold(): void {
    if (this.phase_ === 'holding') { this.phase_ = 'ready'; this.power = 0; this.pressure = 0; }
    this.dropHeldThrough();
  }

  /** GRENADE-RETHROW: the trigger held through a throw's clip forgotten (a let-go, the menus, a death, the turret's take). */
  private dropHeldThrough(): void {
    this.heldThrough = false;
    this.rearmIn = 0;
  }

  /**
   * A1 (LATER 239, 218; the push read; the take-up's power 0, `FUN_00592d40` D:L478915): the turret's take with a throw
   * held, or on its way with the hand not yet open. Nothing is thrown and the item is kept (`left` is spent only when the
   * hand opens, `letGo`); the power is 0. The body's clip is the take's to pop (`Walker.mountTake`), and nothing here
   * follows it, so not THROW-INTERRUPT's `popped` (a knock's release at the timer). A throw already out flies on; a placing
   * is the take's 'replaced' end (`releasePlant`, C4_FALLBACK_PLACEHOLDER). MOUNT_HELD_THROW_FUSE_PLACEHOLDER: a held
   * throwable's fuse at the take is unread (none runs in the hand here). `./matchActions` calls this before the body's pop.
   *
   * LATER 532: returns the trigger's level under a wind-up kept (`holding`: the button's pressure, `pull`/`release`), for
   * `./matchActions` to keep through the wait; null when no wind-up was kept (nothing cancelled, or a throw asked).
   */
  mountTake(): boolean | null {
    this.takeKept = null;
    this.dropHeldThrough();                              // GRENADE-RETHROW: from the take the trigger is the turret's (`./matchThrow` `trigger`)
    if (this.phase_ !== 'holding' && !(this.phase_ === 'throwing' && this.pending)) return null;
    // LATER 526: what the cancel ends, kept for the room's refusal of the take (`mountUntake`).
    this.takeKept = { phase: this.phase_, pending: this.pending, bodyHold: this.bodyHold, holdEnd: this.holdEnd, power: this.power, pressure: this.pressure, wait: 0 };
    const asked = this.pending !== null;
    const level = this.phase_ === 'holding' ? this.pressure > 0 : null;
    this.pending = null; this.bodyHold = null; this.holdEnd = null;
    this.phase_ = this.equipped_ ? 'ready' : 'holstered'; this.power = 0; this.pressure = 0;
    if (asked) this.emit('mountTaken');                  // LATER 529 (F3): its clip kept before the body's pop
    return level;
  }

  /**
   * LATER 526 (research 215 s8.6 "A1"; PTW.R3 with `room.ts` `takeMount`): the room refused the take this page made at send
   * time. `FUN_005463c0` refuses before any of its take's steps (D:L412131-412166), so the take-up's power 0 (`FUN_00592d40`
   * D:L478915) never ran and the throw stands: the cancel `mountTake` made is handed back -- the wind-up at the power it
   * had, or the throw asked with its hand still to open, its body's clip as the walk lays it back (`WalkMode.mountUntake`).
   * `held`: the trigger as the walk's commands carry it now (`WalkMode.triggerHeld`) -- through the wait the trigger was the
   * turret's (`./matchThrow` `trigger`), so a let-go then was not heard here: a wind-up not held throws at the next update,
   * as a let-go does. Once only; nothing when nothing was cancelled or the kit has moved on since (a new throw).
   *
   * LATER 529 (F3 of LATER 526's review): a throw asked is told handed back (`mountHandedBack`), so its clip goes back on
   * the body (`./matchThrow`, `ThrowPose.resume`), its hand's clock stepped by the wait as the clip's is (the review's F1: one
   * clock; a death in the wait hands nothing back, F4 of the review).
   *
   * LATER 532 (LATER 529's F4): the original's chase ran on through the wait, so a wind-up handed back is stepped over the
   * wait's commands (`wait`, M through the last sent, in order) as the controller tick chases it (`FUN_00594cf0`
   * D:L453508-453516, `stepThrowPower`: `DAT_006505e0` up, `DAT_006505d8` down, the release when the pressure falls to
   * `DAT_00650668` of the power, D:L453509) -- each command one `TICK`, the port's command period, the page's pressure for
   * a held trigger 1 (`pull`) -- and not after a command that left the body off the floor (`air`: the chase and its
   * release run only while `FUN_0059d830` answers, D:L453478-453480, which it does not in the air, D:L457369-457371; as
   * `update`'s `airborneBefore`). Each command's level is the page's own record of its hand (`./matchActions`, LATER 532),
   * not a value of the original's command. Released at a let-go's command, the throw starts at the first update after the
   * refusal (the walk is still locked at it, review F1), at the power the chase reached -- not at the let-go's time: the
   * page hears the refusal a round trip late (LATER 530). Not
   * kept per command: a climb's clip on the re-run body (`CLIMB_THROW_REFUSED_READING`'s gate), so it is not applied
   * over the wait. `wait` absent: the take-time power, the trigger as `held` tells it (LATER 526's shape).
   */
  mountUntake(held: boolean, wait?: readonly { held: boolean; air: boolean }[]): void {
    const k = this.takeKept;
    this.takeKept = null;
    if (!k || this.pending || (this.phase_ !== 'ready' && this.phase_ !== 'holstered')) return;
    if (this.source.dead?.()) return;                    // LATER 529 (F4): a death in the wait ended it; nothing comes back to the dead body
    this.phase_ = k.phase; this.pending = k.pending; this.bodyHold = k.bodyHold; this.holdEnd = k.holdEnd; this.power = k.power;
    // LATER 532 review F2: with the wait given, `held` is the record's last level, so the pressure is that level's (1 for a
    // held trigger, as `pull`), not the take-time one (a let-go before the take with a re-press riding M came back 0).
    this.pressure = k.phase === 'holding' && held ? (wait ? 1 : k.pressure) : 0;
    if (k.pending) {
      // LATER 529 (F1): one clock with the clip (`ThrowPose.resume` runs it by the same wait): the original's hand opened
      // during the wait, at the clip's release frame; one the wait passed opens at this refusal (the accepted late hand).
      const left = k.pending.left - k.wait;
      k.pending.left = Math.max(0, left);
      this.emit('mountHandedBack', { overrun: Math.max(0, -left) });
    }
    if (k.phase !== 'holding' || !wait) return;
    for (const c of wait) {
      if (c.air) continue;                                  // off the floor after the command before: no chase, no release
      const step = stepThrowPower(this.power, c.held ? 1 : 0, TICK);
      this.power = step.power;
      // LATER 532 review F1: not thrown here. `TurretPage` hands the throw back (`untook`) before it unlocks the walk, and
      // `WalkMode.hold` refuses under the lock, so a throw started now would hold no body. The pressure 0 and the phase
      // 'holding' at the stepped power leave it to the next update's chase, whose release (`stepThrowPower` returns the
      // power unchanged) starts the throw at exactly this power, the walk unlocked.
      if (step.release) { this.pressure = 0; return; }
    }
  }

  /** LATER 526: the throw `mountTake` cancelled, until the room's word on the take (`mountUntake`); null: none. */
  private takeKept: {
    phase: GrenadePhase; pending: Pending | null; bodyHold: { clip: string; serial: number | null } | null;
    holdEnd: ActionEndReason | null; power: number; pressure: number;
    /** LATER 529 (F1): the seconds of `update` run since the take -- the wait the hand's clock is stepped by at the refusal. */
    wait: number;
  } | null = null;

  private pressure = 0;
  /** GRENADE-RETHROW: the trigger pressed under the throw's clip and not let go since (`pull`), read at the pop (`finishThrow`). */
  private heldThrough = false;
  /** GRENADE-RETHROW: the updates left until the held trigger's wind-up (THROW_REARM_UPDATES_READING); 0 none. */
  private rearmIn = 0;
  /** THROW_DIAG_ADAPTATION (LATER 247): the updates run, the clock `lastRefusal_` is stamped with; nothing reads it but `diag`. */
  private frames_ = 0;
  /** THROW_DIAG_ADAPTATION (LATER 247): the last release refused and why (`refuseRelease`); recorded only. */
  private lastRefusal_: { reason: ThrowRefusal; at: number } | null = null;
  /**
   * PAR-86 (research 251 s12.8): the body off the floor as the last update left it, as the controller's chase reads it:
   * `FUN_00594cf0` runs before the driver and chases the power, and asks the release, only while `FUN_0059d830`
   * answers (D:L453478-453480), which it does not off the floor: the airborne bit `+0x105e` 0x20 or the state 6
   * (D:L457369-457371). So the wind-up is held through a flight, its power as the take-off left it.
   */
  private airborneBefore = false;
  /**
   * NU-1b B6 (`CLIMB_THROW_REFUSED_READING`): a climb's clip on top as the last update left the body -- the chase stands
   * under it as off the floor (`FUN_0059d830` -> `FUN_005a7de0(actor, 1, 1)`, D:L457365; D:L453478-453480).
   */
  private climbBefore = false;
  /**
   * P36 (TB-12; research 256 section 6): the playing clip's `NoFire` refusing as the last update left the body
   * (`GrenadeSource.fireAllowed` false) -- the chase stands under it, the climb's case widened to every top
   * (`FUN_0059d830` -> `FUN_005a7de0(actor, 1, 1)`, D:L457365; D:L453478-453480).
   */
  private noFireBefore = false;

  /**
   * The hook's throw: `holdSeconds` of the button held (`heldPower`), then let go -- the clip, the release and the
   * flight as a real throw's. `immediate` lets go of the grenade now rather than at the clip's release fraction.
   */
  throwNow(holdSeconds: number, immediate = true): ThrowInfo | null {
    if (!this.source.snapshot()) return null;
    this.dropHeldThrough();                                                // GRENADE-RETHROW: the hook's throw re-arms nothing
    if (this.phase_ === 'throwing' && !this.pending) this.finishThrow();   // skip the last clip's tail
    if (!this.equipped_ && !this.equip(true)) return null;
    if (this.phase_ !== 'ready') return null;
    if (this.selectedLeft() <= 0) return null;
    this.power = heldPower(holdSeconds);
    this.startThrow();
    if (!immediate || !this.pending) return null;
    this.pending.left = 0;
    return this.letGo();
  }

  /**
   * One frame: the hold's power, the clip's release, the flight at the game frame, the effects, the hand.
   *
   * PAR-34 (research 252 s3; ACT.R8): `real` is the frame's real seconds (`./frameTime`, through `./matchThrow`'s
   * frame), which the timed rules count -- the held throw's power (`THROW_POWER_STEP_MAX_S`), the C4 settle
   * (`FUN_005be6f0`), the flight's game frames (the fuse: the room steps its copy each room tick, `room.ts`
   * `flyGrenades`) and a smoke's life. The throw's clips (the release, the recovery, a placing) are the body's clips and
   * keep the clamped step `dt`, as the room counts a throw's repeat on the command clock (`room.ts` `throwGrenade`:
   * `frame.count - p.lastThrow < repeat`); a refusal's message and the effects' particles are presentation and keep it
   * too. `real` defaults to `dt`.
   */
  update(dt: number, real = dt): void {
    this.frames_++;                                       // THROW_DIAG_ADAPTATION: the diag's clock alone
    // GRENADE-RETHROW (THROW_REARM_UPDATES_READING): the held trigger's wind-up, its chase this update -- the second after
    // the pop's update (the fresh press's update, then the chase's, D:L453633-453637, D:L453505-453517); page frames here,
    // the original's fixed controller updates there (review F2: frame-rate dependent).
    if (this.rearmIn > 0 && --this.rearmIn === 0) this.rearmWindUp();
    const snap = this.source.snapshot();
    this.followBody(snap);
    if (this.takeKept) this.takeKept.wait += dt;          // LATER 529 (F1): the turret's take, waiting for the room's word
    if (this.source.dead?.()) this.die();                 // THROW-INTERRUPT: before the chase and the clocks
    this.c4Tick(real);
    if (!snap) {
      // Out of the walk: a hold is dropped, what is in the air carries on. No snapshot is a browser-only exit
      // (`C4_PLANT_LEAVE_CANCEL_ADAPTATION`: leaving the walk, the fly toggle): a C4 plant still on its clip callback
      // is dropped here, unspent, and the firearm returns. An in-game end is not this path.
      if (this.phase_ === 'holding') { this.phase_ = 'ready'; this.power = 0; }
      if (this.placing?.callback != null) {
        this.bodyHold = null;
        this.holdEnd = null;
        this.releasePlant(null);
        if (this.phase_ === 'throwing' && !this.pending) this.finishThrow();
      }
    }
    if (this.phase_ === 'holding' && snap && !this.airborneBefore && !this.climbBefore && !this.noFireBefore) {   // PAR-86, NU-1b B6, P36: no chase off the floor or under a NoFire top
      const n = Math.max(1, Math.ceil(real / THROW_POWER_STEP_MAX_S - 1e-9));
      for (let i = 0; i < n; i++) {
        const step = stepThrowPower(this.power, this.pressure, real / n);
        this.power = step.power;
        if (step.release) { this.startThrow(); break; }
      }
    }
    this.airborneBefore = snap?.airborne === true;
    this.climbBefore = CLIMB_THROW_REFUSED_READING === 'held' && climbHoldsBody(snap?.traversal?.clip);
    this.noFireBefore = snap !== null && this.noFireRefuses();
    if (this.refusal && (this.refusal.left -= dt) <= 0) this.refusal = null;
    if (this.placing) {
      const pl = this.placing;
      pl.left -= dt;
      pl.elapsed += dt;
      // C4's clip callback at phase .45 zeroes the kit's timer (`LAB_005bfe40`, D:L475443-475445): the normal plant.
      if (pl.callback !== null && (pl.callback -= dt) <= 0) { pl.callback = null; pl.left = 0; }
      if (pl.left <= 0) {
        const { total, elapsed } = pl;
        this.placing = null;
        this.recover = Math.max(0, total - elapsed);
        if (!this.placeCharge()) this.recover = 0;
      }
    } else if (this.pending) {
      this.pending.left -= dt;
      if (this.pending.left <= 0) this.letGo();
    } else if (this.phase_ === 'throwing') {
      this.recover -= dt;
      if (this.recover <= 0) this.finishThrow();
    }
    this.fly(real);
    this.shadeLate();
    this.smokeFrame(dt, real);
    this.effects(dt);
    this.placeHand(snap);
    this.drawArc(snap);
  }

  /**
   * PAR-19 D08 (research 251 section 4.2): the throw's busy tail ends with the body's one-shot. Once the snapshot showed
   * the throw's hold and shows it no more -- the stick's cut past its `NoInterrupt` (`FUN_00550ef0` D:L418180-418190,
   * `FUN_00587c20` D:L445549-445564), a knock, the clip's end -- a throw already released is done (`finishThrow`): the
   * grenade in the air and the spent ammo stay, nothing is refunded. A throw not yet released, and a throw whose hold
   * the body never showed (refused in the air, no mover) keep their own clocks. A C4 placing whose hold comes off
   * before the callback keeps the 99 s kit timer when an in-game end was heard (`noteHoldEnd`: a knock or `replaced`,
   * `C4_FALLBACK_PLACEHOLDER`, H156; research 230 §2.1, `FUN_0028da00` D:L135092-135104). The hold gone with no end
   * heard is the debug re-place (`C4_PLANT_LEAVE_CANCEL_ADAPTATION`). The claymore's and the PMN's timers have no
   * callback and run on as before.
   */
  private followBody(snap: PlaySnapshot | null): void {
    const b = this.bodyHold;
    if (!b || !snap) return;
    if (b.serial === null) {
      if (snap.hold === b.clip && snap.holdSerial !== undefined) {
        b.serial = snap.holdSerial;
        this.holdEnd = null;
      }
      return;
    }
    if (snap.hold === b.clip && snap.holdSerial === b.serial) { this.holdEnd = null; return; }
    this.bodyHold = null;
    if (this.pending) this.pending.popped = true;          // THROW-INTERRUPT: off the body before the hand opened
    const reason = this.holdEnd;
    this.holdEnd = null;
    this.releasePlant(reason);
    if (this.phase_ === 'throwing' && !this.pending && !this.placing) this.finishThrow();
  }

  /**
   * The mover's end of the current throw or placing (`WalkMode.onActionEnd`), before `update` reads the snapshot.
   * The page wires this for a throw or a place hold (`throwPoseEnds`).
   */
  noteHoldEnd(reason: ActionEndReason): void {
    this.holdEnd = reason;
  }

  /**
   * A C4 plant whose clip callback has not run, and whose hold is gone. A heard in-game end keeps the kit's 99 s
   * timer (`C4_FALLBACK_PLACEHOLDER`). No end heard, and no snapshot (the caller passes null), is
   * `C4_PLANT_LEAVE_CANCEL_ADAPTATION`: the placing drops so `finishThrow` returns the firearm, unspent. The claymore
   * and the PMN have no callback and are left to their own timers.
   */
  private releasePlant(reason: ActionEndReason | null): void {
    if (!this.placing || this.placing.callback === null) return;
    if (reason === null && C4_PLANT_LEAVE_CANCEL_ADAPTATION === 'cancel') {
      this.placing = null;
      this.recover = 0;
      return;
    }
    if (C4_FALLBACK_PLACEHOLDER === 'kitTimer') this.placing.callback = null;
  }

  /** C4_FUSE_BAR_SELECTION_ADAPTATION: use the live projectile clock, never a second HUD timer. */
  c4Fuse(): { fill: number } | null {
    let next: (typeof this.live)[number] | undefined;
    for (const l of this.live) {
      if (l.remote || l.g.record.name !== 'C4' || l.g.state !== 'rest' || l.g.fuse <= 0 || l.g.record.fuse <= 0) continue;
      if (!next || l.g.fuse < next.g.fuse) next = l;
    }
    return next ? { fill: Math.min(1, Math.max(0, next.g.fuse / next.g.record.fuse)) } : null;
  }

  stats(): GrenadeStats {
    const r = this.record;
    return {
      equipped: this.equipped_, item: this.item_, leftByItem: { ...this.left, ...this.slotAmmo?.totals() },
      kit: this.kit && [...this.kit], slot: this.heldSlot(), equipmentSlots: this.slotAmmo?.state() ?? [], icon: this.icon() ?? r.icon,
      held: this.held(), placed: this.claymoresDown(), placing: this.placing !== null, message: this.refusal?.text ?? null,
      inHand: this.heldModel !== null && this.heldModel.object.visible,
      phase: this.phase_, power: this.power, left: this.selectedLeft(), thrown: this.thrown,
      record: { name: r.name, fuse: r.fuse, removal: r.removal, gravity: r.gravity, explosionRadius: r.explosionRadius, explosionDamage: r.explosionDamage, capacity: r.capacity, model: r.model },
      live: this.live.map(({ g, pid, owner, facing }) => ({
        pos: [...g.pos], vel: [...g.vel], state: g.state, fuse: g.fuse, bounces: g.bounces, age: g.age, tumble: [...g.tumble], removal: g.removal,
        ...(pid !== undefined ? { pid } : {}), ...(owner !== undefined ? { owner } : {}), ...(facing !== undefined ? { facing } : {}),
      })),
      smokes: this.smokes.map((sm) => ({ pos: [...sm.pos], age: sm.age, until: sm.until, ...(sm.pid !== undefined ? { pid: sm.pid } : {}) })),
      lastThrow: this.lastThrow && { ...this.lastThrow },
      bounces: this.bounceLog.slice(-16),
      explosions: this.explosionLog.slice(-8),
      effects: this.particles.length,
      model: this.template !== null,
      trail: this.trail,
      defaultMaterial: this.defaultMaterial,
      arc: this.arc && {
        ...this.arc, color: [...this.arc.color], from: [...this.arc.from], velocity: [...this.arc.velocity],
        start: [...this.arc.start], end: [...this.arc.end],
      },
      scorchShade: this.scorchShade && [...this.scorchShade],
      scorchTriangles: this.permTriangles,
    };
  }

  /**
   * EFFECTS (research 89 §13, the mark's colour): the world's drawn vertex colour under a point, which the game
   * modulates a scorch's texel by (`FUN_003beca0` puts the ground vertices' own colour words in its packet); null: unity.
   */
  setShade(shade: SurfaceShade | null): void {
    this.shade = shade;
  }

  /** EFFECTS (research 89 §13): clip each scorch to the drawn ground under it, shaded per vertex (`./markClip`). */
  setClip(clipper: MarkClipper | null): void {
    this.clipper = clipper;
  }

  /** The scorches on the ground, oldest first (the tests read their colour). */
  scorchMeshes(): readonly Mesh[] {
    return this.scorches;
  }

  /**
   * The kit's equipment slots in order (`equipmentSlots`): what the PC's `3` and `4` take up (the page binds them,
   * `./kit`'s `hotkey`). `slot` 1 or 2; false when the slot is empty or its item cannot be taken up now (none left).
   */
  selectEquipment(slot: number): boolean {
    if (this.kit) {
      // M7 (W4.R5): the kit's slot `slot` of three, as the loadout holds it; a slot the hand does not take (a launcher,
      // a round, 2X, the thermal scope, C4, an empty one) takes nothing up and leaves the hand as it was.
      const name = this.kit[slot - 1];
      return name !== undefined && name !== null && GRENADE_ITEMS.has(name) && this.select(name as GrenadeItem, slot + 1);
    }
    const item = equipmentSlots(this.records)[slot - 1];
    return item !== undefined && this.select(item);
  }

  /**
   * M7 (research 94 §C5.1): C4 is planted by the Action button, never taken up from its slot (`FUN_005bdc30` refuses
   * 0x97): with C4 left in the kit, a C4 target settled under the reticle (`c4Target`; PF-13) and no throw in hand, the
   * kit switches to C4 and fires it (`FUN_005c0020(1.0, 0.2, kit, 0x97)`, `FUN_00594cf0` L452025-452060) -- the placing
   * (`C4_PLANT_SECONDS`, 1.098 s of `Put on wall`), the charge at the saved target-ray point,
   * its `Timer1` (6 s) running from there, and the firearm back. False when refused.
   */
  plantC4(): boolean {
    const snap = this.source.snapshot();
    if (!snap || !this.kit?.includes('C4') || this.leftOf('C4') <= 0 || !this.records.C4) return false;
    if (this.phase_ === 'throwing' || this.phase_ === 'holding' || this.placing) return false;
    const aimed = this.c4Now();
    if (aimed === null) return false;
    this.actionReturn = { item: this.held() ?? 'rifle', slot: this.heldSlot() };
    this.equipped_ = true;
    this.detonatorUp = false;
    this.item_ = 'C4';
    this.selectedSlot = this.slotAmmo?.first('C4') ?? null;
    this.refreshHandModel();
    this.phase_ = 'ready';
    this.power = 0;
    this.emit('equip', true, 'C4');
    this.plantingC4 = true;
    this.c4Aimed = aimed;
    if (!this.startPlacing()) { this.finishThrow(); return false; }
    return true;
  }

  // ---- the placed charges ---------------------------------------------------------------------------------------

  /**
   * The claymore's fire (`FUN_005be9a0`, type -0x67; `CLAYMORE_RULES`): refused with the game's message once
   * `maxPlaced` of the SEAL's claymores are down (`claymoresDown`), not started while the SEAL wades deeper than `maxWaterDepth` (PF-13: never for moving; the PMN
   * the same); else the `Place claymore` action -- its clip (`PLACE_CLAYMORE_ANIM`) on the body through the throw's pose
   * layer (the `throwStart` event) and its clock to the charge on the ground (`placeSeconds`; C4's `C4_PLANT_SECONDS`).
   * False when it does not start.
   */
  private startPlacing(): boolean {
    const snap = this.source.snapshot();
    if (!snap || this.placing) return false;
    // NET-CAP (research 312 §10): refused before the placing's fire (`FUN_005be9a0`), with no message (D:L476470-476491).
    // Never C4 (`plantC4`): the Action button's plant (`FUN_00592d50` D:L452030-452055 -> `FUN_005c0020(..., 0x97)`)
    // goes straight to `FUN_005be9a0` when `FUN_003d1e20` answers 0, as it does for C4 (D:L475985-475994), never
    // asking `FUN_005c0ae0`.
    if (this.item_ !== 'C4' && this.netCapRefused()) return false;
    // The claymore's and the PMN's fire (-0x67, -0x62): four of the SEAL's claymores down at most (PAR-96: the PMN is
    // limited by them and never counts itself, D:L475307, D:L475339); C4's (-0x69) has no such count.
    if (this.item_ !== 'C4' && this.claymoresDown() >= CLAYMORE_RULES.maxPlaced) {
      if (!this.refusal) {
        this.refusal = { text: CLAYMORE_RULES.maxPlacedMessage, left: CLAYMORE_RULES.refuseSeconds };
        this.emit('refuse', { item: this.item_, text: this.refusal.text, seconds: CLAYMORE_RULES.refuseSeconds });
      }
      return false;
    }
    const grid = this.source.grid();
    if (this.item_ !== 'C4' && grid && wadingDepth(grid, snap.feet) > CLAYMORE_RULES.maxWaterDepth) return false;
    // C4's own action, `Put on wall` (D:L475420); the claymore's and the PMN's `Place claymore` (D:L475322, 475354) -- each
    // the pistol's version with the sidearm in the hand (`handAnim`, `FUN_0058c820`).
    const base = this.item_ === 'C4' ? PUT_ON_WALL_ANIM : PLACE_CLAYMORE_ANIM;
    const anim = handAnim(base, this.source.pistol?.() ?? false);
    const at = this.item_ === 'C4' ? C4_PLANT_SECONDS : CLAYMORE_RULES.placeSeconds;
    // The claymore's and the PMN's kit timer is the placing's 1.3 s (0x3fa66666, D:L475323-475327, D:L475355-475359);
    // C4's is 99 s, ended at the clip's phase .45 by its callback (D:L475443-475451; PAR-20 D09, research 256 s3).
    this.placing = this.item_ === 'C4'
      ? { left: C4_KIT_TIMER_SECONDS, total: throwClipSeconds(anim), elapsed: 0, callback: at }
      : { left: at, total: throwClipSeconds(anim), elapsed: 0, callback: null };
    this.phase_ = 'throwing';
    this.power = 0;
    const hold = holdClipOf(anim, base);
    this.holdEnd = null;
    this.bodyHold = { clip: hold, serial: null };
    this.emit('throwStart', { anim, power: 0, releaseIn: at, hold, ...(this.selectedSlot !== null ? { slot: this.selectedSlot } : {}) });
    return true;
  }

  /**
   * LATER 122 (`FUN_005c1970` D:L476938-476940), at the clip's callback and at the kit timer's 99 s fallback alike -- both
   * run that block once `+0x87c` is at or under 0 (D:L476883-476905): the plant gives up on exactly three things, the
   * saved object gone or refusing the charge (`c4TargetAt`: the destructible still at that node, health above 0, shield
   * at most the charge's damage, `C4_ACCEPT_DAMAGE_READING`), or moved since the save (`C4_TARGET_MOVED_READING`).
   * Reach, the reticle and the line are not asked again; the room judges the plant's start eye (LATER 144). The saved
   * hit's material tests after it (D:L476966-476980) read the save, which the clip cannot change (LATER 268). Was
   * (2026-10-19): reach, the reticle and `c4Line` asked again, which dropped a plant whose camera turned during the clip.
   */
  private c4CommitOk(aimed: C4Aimed): boolean {
    const world = this.world(), record = this.records.C4;
    if (!world || !record) return false;
    if (world.health.c4TargetAt(aimed.surface.path, record.explosionDamage) !== aimed.target) return false;
    const { poly, at } = aimed.watch;                                  // C4_TARGET_MOVED_READING: the struck polygon
    return !Array.prototype.some.call(poly.points, (v: number, i: number) => Math.abs(v - at[i]!) > 1e-4);
  }

  /**
   * Sets a charge down now. C4 uses its saved target-ray hit (FUN_005c1970 D:L476979-476985);
   * claymore/PMN use the ground -- the placing action's end (`FUN_005c2430` then `FUN_005bc730`): the ground `placeGround`
   * gives under the right hand's point (`+0x300`) -- the highest accepted surface at or under it in the world column,
   * else the lowest (AD-4) -- when it is over the feet less `placeDrop` (D:L477005), the charge facing the SEAL's way,
   * still; its fuse never runs (`+0xc5`). Then the Detonator comes up (`FUN_005c8a20(0xc1)`). Null when there is
   * no SEAL, no claymore up, or no ground in reach (nothing is set down, as the game's test fails).
   */
  placeCharge(): V3 | null {
    const snap = this.source.snapshot();
    if (!snap || !this.equipped_ || this.detonatorUp || !isPlaced(this.record) || this.selectedLeft() <= 0) return null;
    const aimed = this.item_ === 'C4' ? this.c4Aimed : null;
    let pos: V3, rest: string;
    if (this.item_ === 'C4') {
      // FUN_005c1970 D:L476979-476985: C4 uses the saved target-ray point, not the hand's ground column
      // (research 209 §16). LATER 122: only while that object is there, takes the charge and has not moved
      // (D:L476938-476940) -- at the callback and at the 99 s fallback alike.
      if (!aimed || !this.c4CommitOk(aimed)) return null;
      pos = [...aimed.surface.point];
      rest = aimed.material;
    } else {
      const hand = this.source.handPoint?.('rhand', [0, 0, 0]) ?? actorToWorldPoint(snap.feet, snap.yaw, [2, 8, -8]);
      const cast = this.hull();
      const low = snap.feet[1] - CLAYMORE_RULES.placeDrop;
      // Claymore/PMN only: FUN_005c1970 D:L477001-477010, the separate ground-placement branch.
      const ground = cast ? placeGround(cast, hand) : null;
      if (!ground || !(ground.point[1] > low)) return null;
      pos = [ground.point[0], ground.point[1], ground.point[2]];
      rest = ground.material.name;
    }
    const record = this.record;
    const g = launchGrenade(pos, [0, 0, 0], record);
    g.state = 'rest';
    const model = this.templates[this.item_]?.clone() ?? null;
    if (model) { model.position.set(...pos); model.rotation.set(0, (snap.yaw * Math.PI) / 180, 0); this.object.add(model); }
    this.live.push({ g, model, trail: [], line: null, dots: null, rest, facing: snap.yaw });
    if (!this.spendSelected()) return null;
    const yawR = (snap.yaw * Math.PI) / 180;
    this.emit('place', {
      item: this.item_, ...(this.selectedSlot !== null ? { slot: this.selectedSlot } : {}),
      pos, yaw: snap.yaw, facing: [-Math.sin(yawR), 0, -Math.cos(yawR)], fireAnim: record.fireAnim,
      ...(aimed ? { target: aimed.target, surface: aimed.surface, eye: aimed.eye } : {}),
    });
    if (record.id === CLAYMORE.id) this.takeDetonator(true);    // FUN_005c8a20(0xc1): the claymore's only (L474128-474130)
    return pos;
  }

  /**
   * The Detonator's fire (`CZKit_DetonateRemoteExplosives`, 0x5c0130): every claymore of the SEAL's within
   * `CLAYMORE_RULES.detonateRange` goes off on the next tick; then the claymore comes back up (`FUN_005c8a20(0x99)`;
   * the rifle when none is left [reading: the game selects the empty slot]). The count set off. The hook calls it
   * without the Detonator up (the fire's rule all the same).
   */
  detonateCharges(): number {
    const snap = this.source.snapshot();
    if (!snap) return 0;
    let n = 0;
    for (const l of this.live) {
      // The SEAL's own claymores (`+0xc5`, the owner `+0xac`): never a PMN, C4 or another player's.
      if (l.facing === undefined || l.remote || l.g.record.id !== CLAYMORE.id || l.g.state !== 'rest') continue;
      const d = Math.hypot(l.g.pos[0] - snap.feet[0], l.g.pos[1] - snap.feet[1], l.g.pos[2] - snap.feet[2]);
      if (d <= CLAYMORE_RULES.detonateRange) { l.g.trigger = true; n++; }   // `+0xc4` (FUN_003c5730): the fuse is held
    }
    this.emit('detonate', { count: n, from: [snap.feet[0], snap.feet[1], snap.feet[2]] });
    if (this.detonatorUp && this.phase_ === 'ready') {
      if (this.slotAmmo || this.leftOf('Claymore') > 0) this.equip(true, 'Claymore');
      else this.equip(false);
    }
    return n;
  }

  // ---- the throw ----------------------------------------------------------------------------------------------

  /**
   * The body's state for `GetThrowAnim` (D:L441773-441796; PF-20, research 217 s3): in state 3 (the body's peek held,
   * `snap.peek`) the side comes from the lean clip playing -- 0x1e / 0x20 (`Peek right`, `Crouch peek right`) the right
   * toss, released at 0.55; 0x1d / 0x1f the left, at 0.87 -- and with neither playing (no lean clip, or a prone lean:
   * 0xe9 / 0xea are not among them) it returns 0 and there is no throw (null). Never the camera's eased peek value: no
   * magnitude is tested (research 181 s2.10). Out of state 3, the stance state (OBF-23, `releaseStance`: the
   * crouch-run's 1, not its standing posture).
   */
  private stance(snap: PlaySnapshot): ThrowStance | null {
    const peek = snap.peek ?? 0;
    if (peek === 0) return releaseStance(snap);
    if (!snap.leanClip || snap.stance === 'prone') return null;
    return peek > 0 ? 'peek-right' : 'peek-left';
  }

  /**
   * The button let go: the release request (`FUN_005be9a0`'s hand-grenade branch, D:L475490-475511), then
   * `GetThrowAnim`'s clip, the release a fraction into it (`releaseSeconds`). PAR-20 D10 and D12 (research 256 s1, s5): a
   * power under the threshold (`releasePowerClears`) or a stance segment that meets the world (`throwClear`) is refused
   * before anything is committed -- no clip, no hold, nothing spent, the grenade still up and the power zeroed
   * (`refuseRelease`).
   */
  private startThrow(): void {
    const snap = this.source.snapshot();
    if (!snap) { this.lastRefusal_ = { reason: 'noSnap', at: this.frames_ }; this.phase_ = 'ready'; return; }
    // THROW-INTERRUPT (research 326 §2.4): the request asks `FUN_0059d830` (D:L475491), which refuses a dead SEAL (the
    // alive bit, D:L457349): refused as a short tap, the power zeroed (D:L475497-475498).
    if (this.source.dead?.()) { this.refuseRelease('dead'); return; }
    // NET-CAP (research 312 §10): `FUN_005c0ae0` refuses before `FUN_005be9a0`'s release request (`FUN_005c0fd0` D:L476569, D:L476637-476638): nothing pushed, nothing spent (NET_CAP_REFUSED_USE_PLACEHOLDER: as a short tap).
    if (this.netCapRefused()) { this.refuseRelease('netCap'); return; }
    // PAR-86 (research 251 s12.8): the request asks `FUN_0059d830` before its clearance (D:L475491-475495), in the
    // kit's frame after the driver -- off the floor it answers 0 (D:L457369-457371): refused as a short tap
    // (D:L475497-475498).
    if (snap.airborne) { this.refuseRelease('airborne'); return; }
    // NU-1b B6 (CLIMB_THROW_REFUSED_READING): the same request under a climb's clip -- its bare `NoFire` through
    // `FUN_005a7de0(actor, 1, 1)` (D:L457365) -- refused as a short tap (D:L475497-475498): only a release asked on the
    // frame the climb was pushed reaches it, the chase standing under the climb after.
    if (CLIMB_THROW_REFUSED_READING === 'held' && climbHoldsBody(snap.traversal?.clip)) { this.refuseRelease('climb'); return; }
    // P36 (TB-12; research 256 section 6): the climb is one top among them -- any playing clip's `NoFire` refuses the same
    // `FUN_005a7de0(actor, 1, 1)` (D:L457365), as the room's `takeThrowStart` refuses 'nofire' (the frame's `fire`):
    // refused as a short tap (D:L475497-475498), no `throwStart` told, nothing spent.
    if (this.noFireRefuses()) { this.refuseRelease('nofire'); return; }
    // TRAVERSAL SEAM (web research 86 section 4.4): state 3 with no standing or crouched lean clip playing -- a prone
    // peek among them -- has no throw: `GetThrowAnim` returns 0, so the clearance `FUN_005499e0` answers 0
    // (D:L414008-414012) and the request refuses as a short tap does, the power zeroed (D:L475497-475498; research 256 s5).
    const stance = this.stance(snap);
    if (stance === null) { this.refuseRelease('stance'); return; }
    const aimSin = releaseAimSin(snap);                             // `GetThrowAnim` reads +0x1450 at the request (D:L441722)
    // The request's two tests (D:L475491-475497): the stance-specific clearance (PAR-20 D12, `FUN_005499e0`) and the power.
    const clear = throwClear(this.source.grid(), snap, this.power, aimSin);
    if (!releasePowerClears(this.power)) { this.refuseRelease('power'); return; }
    if (!clear) { this.refuseRelease('clear'); return; }
    const anim = throwAnim(this.power, aimSin, stance, snap.vx * snap.vx + snap.vz * snap.vz);
    // The pushed motion is the pistol's version with the sidearm in the hand (`FUN_00588bc0` -> `FUN_0058c820`), and the
    // release is timed on it (`FUN_005802b0`); `GetThrowAnim`'s fraction and hand point stand.
    const played = handAnim(anim, this.source.pistol?.() ?? false);
    const releaseIn = releaseSeconds(played);
    this.pending = { anim, played, power: this.power, left: releaseIn, total: throwClipSeconds(played) };
    this.phase_ = 'throwing';
    const hold = holdClipOf(played, anim);
    this.holdEnd = null;
    this.bodyHold = { clip: hold, serial: null };
    this.emit('throwStart', { anim: played, power: this.power, releaseIn, hold, ...(this.selectedSlot !== null ? { slot: this.selectedSlot } : {}) });
  }

  /**
   * THROW-INTERRUPT (research 326 §2.4): the page's own SEAL dead (`GrenadeSource.dead`). The original's death
   * (`FUN_00547af0`) first runs `FUN_005b8920` on the kit (D:L413023): a throw released and not yet out (the pending bit
   * `+1` 0x02, D:L471751) is cleared there and, for a throwable, spent and launched at once at power 0 -- `FUN_005976a0(0)`
   * and `FUN_00597630(.., 0)` (D:L471842, D:L471845) against the timer's launch's power (D:L477108, D:L477111): the tap's
   * toss from the hand, live (research 85 §4's table) -- while a charge is cleared unspent (D:L471756-471759). That drop
   * is the room's to make, the death being the room's; on the page the throw not yet let go is cut -- no let-go at the
   * release's power, nothing drawn, set down or spent, no `throw` -- and a wind-up throws nothing (no release is taken
   * once the alive bit is clear, D:L457349). A throw already let go flies on.
   */
  private die(): void {
    this.dropHeldThrough();                               // GRENADE-RETHROW: no wind-up for the dead (D:L457349)
    if (this.phase_ === 'holding') { this.phase_ = 'ready'; this.power = 0; this.pressure = 0; }
    if (!this.pending && !this.placing) return;
    const item = this.item_;
    this.pending = null;
    this.placing = null;
    this.bodyHold = null;
    this.holdEnd = null;
    this.recover = 0;
    this.pressure = 0;
    this.emit('cut', { reason: 'death', item });
    this.finishThrow();                                   // the power 0; the item still up, nothing spent
  }

  /**
   * P36 (TB-12; research 256 section 6): `FUN_0059d830`'s `FUN_005a7de0(actor, 1, 1)` (D:L457365) refusing over the
   * playing clip's `NoFire` -- the source's `fireAllowed` false; no source hook, open.
   */
  private noFireRefuses(): boolean {
    return this.source.fireAllowed?.() === false;
  }

  /**
   * The release request refused (`FUN_005be9a0` D:L475497-475498): `FUN_00592d40` zeroes the controller's power
   * (D:L451964); no throw is pushed and nothing is spent, the grenade stays up for the next press.
   */
  private refuseRelease(reason: ThrowRefusal): void {
    this.lastRefusal_ = { reason, at: this.frames_ };            // THROW_DIAG_ADAPTATION: recorded only, read by `diag`
    this.phase_ = 'ready';
    this.power = 0;
    this.pressure = 0;
  }

  /**
   * THROW_DIAG_ADAPTATION (LATER 247; a browser instrument with no original, changing nothing): the hand's throw state as
   * the last update left it -- the phase, the power and the button's pressure, the chase's floor and motion reads
   * (`airborneBefore`, `climbBefore`, P36's `noFireBefore`), the last release refused and why (`lastRefusal`, its `at` the thrower's update
   * count), whether the body's hold is followed and a release is pending. Read only: it writes nothing.
   */
  diag(): {
    phase: GrenadePhase; power: number; pressure: number; airborneBefore: boolean; climbBefore: boolean; noFireBefore: boolean;
    lastRefusal: { reason: ThrowRefusal; at: number } | null; bodyHold: boolean; pending: boolean;
  } {
    return {
      phase: this.phase_, power: this.power, pressure: this.pressure, airborneBefore: this.airborneBefore,
      climbBefore: this.climbBefore, noFireBefore: this.noFireBefore, lastRefusal: this.lastRefusal_ && { ...this.lastRefusal_ },
      bodyHold: this.bodyHold !== null, pending: this.pending !== null,
    };
  }

  /**
   * The hand opens: the velocity off the clip's hand (`throwVelocity`), a grenade in the air, its fuse lit. PAR-20 D11
   * (research 256 s2): `FUN_005c1970` reads the body as it is now -- the hand (D:L477060-477067), the stance's range
   * (D:L477069-477075) and the aim's elevation (`+0x1450`, D:L477105-477109) -- while the clip stays the release
   * request's pick; the power is the controller's, unchanged since the release (D:L477024).
   */
  private letGo(): ThrowInfo | null {
    const p = this.pending, snap = this.source.snapshot();
    this.pending = null;
    // NU-2 D7: no throw left on top, so the power is cleared here too (D:L453483-453489).
    if (!p || !snap) { this.phase_ = this.equipped_ ? 'ready' : 'holstered'; this.power = 0; return null; }
    const aimSin = releaseAimSin(snap), stance = releaseStance(snap);
    // The hand as posed now, the game's release point (the left hand for the left lean's toss); the table's point for
    // the hand when there is no posed body (`GetThrowAnim`'s, as the game's own arc preview uses).
    const part = p.anim === THROW_ANIMS.peekLeftToss ? 'lhand' : 'rhand';
    const hand = this.source.handPoint?.(part, RELEASE_POINT) ?? null;
    // THROW-INTERRUPT: a throw knocked off its clip leaves at the kit's timer with the power `KNOCKED_THROW_POWER_READING` reads.
    if (p.popped && KNOCKED_THROW_POWER_READING === 'zeroed') p.power = 0;
    const { launch, from, velocity } = launchOf(snap, p.power, aimSin, stance, p.anim, hand);
    const record = this.record;
    if (!this.spendSelected()) { this.phase_ = 'ready'; this.power = 0; return null; }
    const g = launchGrenade(from, velocity, record);
    const model = this.template ? this.template.clone() : null;
    if (model) { model.position.set(...from); this.object.add(model); }
    this.live.push({ g, model, trail: [[...from]], line: null, dots: null, rest: null });
    this.thrown++;
    this.recover = Math.max(0, p.total - releaseSeconds(p.played));
    this.phase_ = 'throwing';
    // NU-2 D7 (research 320 sections 4 and 7): the power is kept through the clip -- the controller zeroes `ctrl+0x11c`
    // only once the release bit is set and `FUN_005a7d10` finds no throw (D:L453483-453489), `finishThrow` here; the
    // throw meter holds the release's power to the clip's end. Was: `this.power = 0` here, at the hand-open.
    const info: ThrowInfo = {
      power: p.power, anim: p.anim, launch, aimSin, stance, from, velocity, sound: '.THROW_OBJECT',
      fireAnim: record.fireAnim, item: this.item_, fromHand: hand !== null,
      ...(this.selectedSlot !== null ? { slot: this.selectedSlot } : {}),
    };
    this.lastThrow = {
      power: p.power, aimSin, stance, from, velocity, sound: info.sound, fireAnim: info.fireAnim,
      item: info.item, fromHand: info.fromHand, clip: p.played.clip, toss: p.anim.toss,
      pitchDeg: (launch.pitch * 180) / Math.PI, speed: launch.speed, maxSpeed: launch.maxSpeed, range: launch.range,
      releaseIn: releaseSeconds(p.played),
    };
    this.emit('throw', info);
    return info;
  }

  // ---- the arc ------------------------------------------------------------------------------------------------

  /**
   * The yellow arc (`FUN_005970b0`, the player controller's draw; socomlegacy/docs/research/85 §11): while the fire button
   * holds a hand grenade (`+0x170` bit 6, set on the press for category 0x79 with one left) and it has not been let go
   * (bit 7), in view modes under 4 (`FUN_005b90f0`, `FUN_005b9990`), the throw the release would make now -- the
   * power, the aim, `GetThrowAnim`'s clip and its table point (not the hand bone), the same `throwVelocity` -- drawn
   * as `ai::DrawFunc<CDynGrenade>`'s parabola (`throwArc`): no hull, no bounce, no marker.
   */
  private drawArc(snap: PlaySnapshot | null): void {
    this.arc = null;
    const mode = this.source.viewState?.() ?? 0;
    const show = !!snap && this.phase_ === 'holding' && this.equipped_ && !this.detonatorUp && !isPlaced(this.record) &&
      this.selectedLeft() > 0 && mode < 4;
    const stance = snap ? this.stance(snap) : null;              // null: state 3 with no lean clip to toss from, no throw
    if (!show || !snap || stance === null) { this.arcLine.visible = false; return; }
    const aimSin = Math.sin((snap.pitch * Math.PI) / 180);
    const anim = throwAnim(this.power, aimSin, stance, snap.vx * snap.vx + snap.vz * snap.vz);
    const { from, velocity } = launchOf(snap, this.power, aimSin, stance, anim, null);
    const arc = throwArc(from, velocity, anim.offset[1]);
    const color: V3 = [...(mode === 3 ? THROW_ARC.nightColor : THROW_ARC.color)];
    fillStrip(this.arcLine, arc.points, arc.alphas, color);
    this.arcLine.visible = arc.alphas.length > 0;
    this.arc = {
      visible: this.arcLine.visible, segments: arc.alphas.length, color, from, velocity,
      start: arc.points[0] ?? from, end: arc.points[arc.points.length - 1] ?? from, t1: arc.t1,
    };
  }

  /**
   * MULTIPLAYER (web sprint 3): another player's throw, flown here with the same physics for its looks, bounces and
   * blast (the server deals the damage): no count spent, no hand, no throw clip. `owner`: the thrower's id (the `grenade`
   * event's), which a placed charge keeps and a Detonator's fire is scoped to.
   *
   * PF-28 (ruling PF.R47; research 231 s2): `hydrate` -- the room's stable `pid`, and for a late joiner (the welcome's
   * envelope, `./joinState`) the projectile's phase: `from` and `velocity` are then where it is now and how fast (a
   * placed charge's `velocity` its facing), laid at its age with its fuse and removal left -- in flight, at rest, or an
   * AN-M8 detonated as its smoke from the detonation's age (`SMOKE_PHASE_ON_WIRE_READING`); a detonated blast or flash
   * lays nothing. No explode listener runs for it, so no blast, no sound and no scorch is replayed. A `pid` already
   * live is replaced, never doubled.
   *
   * LATER 643 (research 85 §6.1): `ageTicks` -- the room's age for a live throw or round (the `grenade` event's `age`,
   * ticks from its release as the room flew it) -- starts the copy that far into its flight (`startAged`), so it bursts
   * when the room's does; absent or under a game frame, it starts at the event, as before. A hydrate, a placed charge
   * and a Detonator's fire take none.
   */
  launchRemote(item: GrenadeItem | string, from: V3, velocity: V3, owner?: number, hydrate?: { pid: number } & Partial<ProjectilePhase>, ageTicks?: number): void {
    if (item === 'Detonator') {
      // M7: another player's Detonator fired (the room's `detonate`, from his feet): his claymores within its reach go off
      // here for their looks, as the room sets them off -- his own only (`CZKit_DetonateRemoteExplosives` 0x5c0130: the
      // charge's `+0xac`, the actor's id; 2026-10-02, ported from Chris's browser-beta-v5, d578f347).
      for (const l of this.live) {
        if (!l.remote || l.owner !== owner || l.g.record.id !== CLAYMORE.id || l.g.state !== 'rest') continue;
        if (Math.hypot(l.g.pos[0] - from[0], l.g.pos[1] - from[1], l.g.pos[2] - from[2]) <= CLAYMORE_RULES.detonateRange) l.g.trigger = true;
      }
      return;
    }
    let smoked: { effect: boolean } | null = null;
    if (hydrate?.state !== undefined) {
      // A joiner's hydrate of a projectile this page already holds (a rejoin's welcome after the event): the old copy
      // goes, and its smoke's puffs with it (PF-28); a stream the effects player already runs is not started twice (its
      // handle is `clearSmokes`' alone, PAR-45). An ordinary event's pid replaces nothing: pids are new
      // within a round, and the smokes' are cleared with the air (`clearAir`).
      const at = this.live.findIndex((l) => l.pid === hydrate.pid);
      if (at >= 0) {
        const old = this.live[at]!;
        if (old.g.state === 'detonated' && old.effectSmoke !== undefined) smoked = { effect: old.effectSmoke };
        this.dropLive(old);
        this.live.splice(at, 1);
      }
      for (let i = this.smokes.length - 1; i >= 0; i--) if (this.smokes[i]!.pid === hydrate.pid) this.smokes.splice(i, 1);
    }
    const round = this.rounds.get(item);
    if (round) {
      if (hydrate?.state !== undefined) { this.hydrateLive(round, from, velocity, owner, hydrate as { pid: number } & ProjectilePhase, smoked); return; }
      this.launchRound(round, from, velocity);
      const l = this.live[this.live.length - 1]!;
      l.remote = true;                                           // another's round, not the page's own (`ownLive`)
      if (hydrate) l.pid = hydrate.pid;
      // M203-FIRE-SOUND (research 94 §C4.5): a live launch is told -- its report and zAnim (`./matchThrow`).
      this.emit('remoteLaunch', { item: round.name, id: round.id, fireAnim: round.fireAnim, from: [...from], ...(owner !== undefined ? { owner } : {}) });
      this.startAged(l, ageTicks);
      return;
    }
    const record = Object.hasOwn(this.records, item) ? this.records[item as GrenadeItem] : undefined;   // own keys: the wire's kind
    if (!record) return;
    if (hydrate?.state !== undefined) { this.hydrateLive(record, from, velocity, owner, hydrate as { pid: number } & ProjectilePhase, smoked); return; }
    this.emit('remoteRelease', { item, id: record.id, fireAnim: record.fireAnim, from, owner });
    if (isPlaced(record)) {
      // M7: another player's charge set down -- still where its throw says, facing its velocity (the room's `placeCharge`);
      // its fuse (C4's) or its trip (the PMN's) runs here for its looks, the room deals its blast.
      const g = launchGrenade(from, [0, 0, 0], record);
      g.state = 'rest';
      const yaw = (Math.atan2(-velocity[0], -velocity[2]) * 180) / Math.PI;
      const t = this.templates[item as GrenadeItem];
      const model = t ? t.clone() : null;
      if (model) { model.position.set(...from); model.rotation.set(0, (yaw * Math.PI) / 180, 0); this.object.add(model); }
      this.live.push({ g, model, trail: [], line: null, dots: null, rest: null, facing: yaw, remote: true, ...(owner !== undefined ? { owner } : {}), ...(hydrate ? { pid: hydrate.pid } : {}) });
      return;
    }
    const g = launchGrenade(from, velocity, record);
    const model = this.template ? this.template.clone() : null;
    if (model) { model.position.set(...from); this.object.add(model); }
    const l: Live = { g, model, trail: [[...from]], line: null, dots: null, rest: null, remote: true, ...(hydrate ? { pid: hydrate.pid } : {}) };
    this.live.push(l);
    this.startAged(l, ageTicks);
  }

  /**
   * LATER 643 (research 85 §6.1): another's copy, just launched, flown `ageTicks` into its flight -- the flight's own
   * frames, `round(ageTicks / TICK_HZ / GAME_FRAME_DT)` of them as the room counts its date-back (match `room.ts`
   * `flyGrenades`), each the step `fly` takes (`stepLive`: the hull, a bounce, a rest, a burst; an armed PMN's trip
   * before it), at most REMOTE_AGE_MAX_FRAMES_ADAPTATION -- not a jump along the arc. The page's frame clock (`flight`)
   * is not moved: the copy is ahead of it by those frames, and steps with the others from there. A bounce or a burst on
   * the way is handled as it is in flight (`handle`), heard at the start.
   */
  private startAged(l: Live, ageTicks: number | undefined): void {
    if (ageTicks === undefined || !(ageTicks > 0)) return;
    const frames = Math.min(REMOTE_AGE_MAX_FRAMES_ADAPTATION, Math.round(ageTicks / TICK_HZ / GAME_FRAME_DT));
    if (!(frames >= 1)) return;
    const cast = this.hull() ?? ((): [] => []);
    for (let k = 0; k < frames && l.g.state !== 'removed'; k++) {
      if (l.g.record.proximity !== undefined) proximityTripped(l.g, this.actorsNow());
      this.stepLive(l, cast);
    }
    if (l.g.state === 'removed') {
      const at = this.live.indexOf(l);
      if (at >= 0) { this.dropLive(l); this.live.splice(at, 1); }
    } else if (l.model && l.facing === undefined) l.model.position.set(...l.g.pos);
  }

  /**
   * PF-36 (ruling PF.R56; research 235 s4): the room's `placed` -- its `pid` for the page's own throw or charge of `kind`
   * launched from `from` (`OWN_PID_READING`): the page's own copy without a pid of that kind and launch point (within
   * 0.01) takes it, so the room's `detonate` can name it. None found, nothing.
   */
  tagOwn(kind: string, from: V3, pid: number): void {
    const l = this.live.find((x) => !x.remote && x.pid === undefined && x.g.record.name === kind
      && Math.hypot(x.g.launch[0] - from[0], x.g.launch[1] - from[1], x.g.launch[2] - from[2]) <= 0.01);
    if (l) l.pid = pid;
  }

  /**
   * PF-36 (ruling PF.R56; research 235 s4): the room's `detonate` -- the resting charge with `pid` (the page's own,
   * tagged by `tagOwn`, or another's) was damaged and goes off: its trigger (`+0xc4`) set, so its next frame's step
   * explodes it through `explode` (the sound, the scorch, the smoke: a live event, not a hydrate). An unknown pid, or one
   * not at rest, is ignored.
   */
  detonateRemote(pid: number): void {
    const l = this.live.find((x) => x.pid === pid);
    if (l && l.g.state === 'rest') l.g.trigger = true;
  }

  /**
   * Research 386 §3.2 (LATER 63): a scene program's `FIRE_WEAPON` round the room set off at `pos` (its `sceneRound`) --
   * Blizzard's outhouse's C4 at its toilet: a copy of the item's round at rest there, unseen, its trigger (`+0xc4`) set,
   * so its next frame's step explodes it through `explode` -- the record's effects, sound and scorch, as any other's;
   * another's (`remote`), so the page deals no blast (the room did). A name the page's records do not hold is ignored.
   */
  fireScene(item: string, pos: V3): void {
    const record = Object.hasOwn(this.records, item) ? this.records[item as GrenadeItem] : this.rounds.get(item) ?? this.sceneRecords.get(item);
    if (!record) return;
    const g = launchGrenade([pos[0], pos[1], pos[2]], [0, 0, 0], record);
    g.state = 'rest';
    g.trigger = true;
    this.live.push({ g, model: null, trail: [], line: null, dots: null, rest: null, remote: true });
  }

  /**
   * PF-28: a joiner's projectile at its phase (`launchRemote`'s `hydrate`): its `Grenade` where the room has it -- the
   * position, the velocity as it is (not scaled by `Muzzle_Velocity` again), the state, the age and the two timers --
   * with its model; a placed charge facing its `velocity`; an AN-M8 detonated as its canister and its smoke from the
   * detonation's age (`-fuse`) to the removal (`removal` left), the `explode` path skipped. A detonated blast or flash
   * lays nothing (gone off before the join: not replayed). Its bounces and dud are the room's (`firstBounce` spent once
   * it has bounced; a dud stays one). The arming distance is measured from where it is now (the launch point is not on
   * the wire). The smoke is the effects player's `JOIN_SMOKE_STREAM` when it has it -- the stream alone, never the
   * detonation's `smoke_grenade` (its burst and `!SMK_CANISTER`: nothing replayed) -- from its start
   * (JOIN_SMOKE_LOOK_READING), else the placeholder puffs from the detonation's age; `smoked`, a smoke this page already
   * runs for the same pid (a rejoin), is not started again when it is the stream.
   */
  private hydrateLive(record: ThrowableRecord, from: V3, velocity: V3, owner: number | undefined, h: { pid: number } & ProjectilePhase, smoked: { effect: boolean } | null): void {
    const smoke = detonationOf(record) === 'smoke';
    if (h.state === 'detonated' && !smoke) return;
    const placed = isPlaced(record);
    const g = launchGrenade(from, [0, 0, 0], record);
    g.vel = placed || h.state !== 'flight' ? [0, 0, 0] : [velocity[0], velocity[1], velocity[2]];
    g.state = h.state;
    g.age = h.age;
    g.fuse = h.fuse;
    g.removal = h.removal;
    g.bounces = h.bounces ?? 0;
    g.firstBounce = g.bounces === 0;                             // FIRST_BOUNCE_DAMPING spent at the first bounce
    g.dud = h.dud === true;
    const yaw = placed ? (Math.atan2(-velocity[0], -velocity[2]) * 180) / Math.PI : undefined;
    const template = this.rounds.has(record.name) ? this.modelTemplates?.[record.model] ?? null : this.templates[record.name as GrenadeItem] ?? null;
    const model = template ? template.clone() : null;
    if (model) {
      model.position.set(...from);
      if (yaw !== undefined) model.rotation.set(0, (yaw * Math.PI) / 180, 0);
      this.object.add(model);
    }
    const l: Live = {
      g, model, trail: [[...from]], line: null, dots: null, rest: null, remote: true, pid: h.pid,
      ...(yaw !== undefined ? { facing: yaw } : {}), ...(owner !== undefined ? { owner } : {}),
    };
    this.live.push(l);
    if (h.state === 'detonated') {
      // The effects player's stream when it has it (no burst, no sound), else the puffs (`explode`'s fallback).
      const ran = smoked ? smoked.effect : !!this.playEffect && this.playEffect(JOIN_SMOKE_STREAM, { position: [...from], normal: null });
      const byEffects = !!ran;
      l.effectSmoke = byEffects;
      if (byEffects) this.keepSmokeRun(ran);
      if (!byEffects || SMOKE_ALWAYS_PLACEHOLDER) {
        const since = Math.max(0, -h.fuse);
        this.smokes.push({ pos: [...from], until: since + Math.max(0, h.removal), next: 0, age: since, pid: h.pid });
      }
    }
  }

  /** M4: the launched rounds by `InternalName` (`@s2u/scene` `KitTable.rounds`), for the page's and the others' rounds. */
  private readonly rounds = new Map<string, ThrowableRecord>();
  /**
   * Codex P2 on PR #739: the kit table's throwables the hand never takes (`setRecords` passes them over: `GRENADE_ITEMS`),
   * by `InternalName` -- MPBOMB (item 154, `zweapon.rdr`, class `explosive`, so in `KitTable.throwables` and never
   * `KitTable.rounds`), whose records a scene program's `FIRE_WEAPON` reuses (the Crossroads bridges, the bases: research
   * 171 §4, §8; research 386 §3.2). Read by `fireScene` alone; no slot, select, give-back or remote throw sees them.
   */
  private readonly sceneRecords = new Map<string, ThrowableRecord>();
  /** Every model the map's grenade templates hold, by model name (a round's `ModelName`, when the map has it). */
  private modelTemplates: Readonly<Record<string, Group>> | null = null;

  /** XR-06: the world bomb's model, made on its first placing from `BOMB_MODEL_READING`'s (the fittings' `Satchel`). */
  private bombModel: Object3D | null = null;

  /**
   * XR-06 (research 214 s1; `./bombPage` `BombPageView.worldBomb`): DEMOLITION's bomb lying in the world -- on the ground,
   * planted, defused -- drawn with the model the game hangs there, the fittings' `Satchel` (`BOMB_MODEL_READING`,
   * `./grenadeAssets`), at the point unturned (`FUN_0059dab0`: its frame stands it on its origin), or taken away (null).
   * A map whose fittings lack it draws none.
   */
  worldBomb(): { place(pos: readonly [number, number, number] | null): void } {
    return {
      place: (pos) => {
        if (!pos) { if (this.bombModel) this.bombModel.visible = false; return; }
        if (!this.bombModel) {
          const want = BOMB_MODEL_READING.model.toLowerCase();
          const key = Object.keys(this.modelTemplates ?? {}).find((k) => k.toLowerCase() === want);
          const t = key ? this.modelTemplates![key] : undefined;
          if (!t) return;
          this.bombModel = t.clone();
          this.bombModel.rotation.set(0, 0, 0);                    // `FUN_00307360(0,0,0)`: no turn
          this.object.add(this.bombModel);
        }
        this.bombModel.position.set(pos[0], pos[1], pos[2]);
        this.bombModel.visible = true;
      },
    };
  }

  /**
   * PAR-41 (RE-5's dev read, `./devSeen`; the dev hook's `devSeen()`): the world bomb's drawn model (`worldBomb`) as the
   * development instrument reads it -- whether shown and where, copied at the call, never the model -- or null before its
   * first placing on this map. Read only; a browser adaptation, changing nothing drawn.
   */
  worldBombForDev(): { visible: boolean; pos: [number, number, number] } | null {
    const m = this.bombModel;
    return m ? { visible: m.visible, pos: [m.position.x, m.position.y, m.position.z] } : null;
  }

  /** M4: the kit tables' launched rounds (`KitTable.rounds`' records): what `launchRemote` knows by name. */
  setRounds(records: Iterable<ThrowableRecord | PiercedRecord>): void {
    this.rounds.clear();
    for (const entry of records) { const r = this.pierced(entry); this.rounds.set(r.name, r); }
  }

  /**
   * M4 (research 94 §C4.2-§C4.3): a launcher's round in flight -- the page's own (`Fire`'s `launch`) or another player's
   * -- from `from` at `velocity` (world units a second: the round's `Muzzle_Velocity` along the lofted aim): the same
   * projectile as a grenade (`@s2u/scene` `launchGrenade`/`stepGrenade`), with the round's gravity (98 u/s^2), its
   * arming distance (a dud inside it), its impact and its `Timer1`; the blast, the effects and the scorch as a frag's.
   * No count is spent here: the round's slot is the page's `Fire`'s.
   */
  launchRound(record: ThrowableRecord, from: V3, velocity: V3): void {
    const s = record.muzzleVelocity || 1;
    // `launchGrenade` scales the given velocity by `Muzzle_Velocity` (`SetProjectile`: `MV x dir`): hand it the direction.
    const g = launchGrenade(from, [velocity[0] / s, velocity[1] / s, velocity[2] / s], record);
    const template = this.modelTemplates?.[record.model] ?? null;
    const model = template ? template.clone() : null;
    if (model) { model.position.set(...from); this.object.add(model); }
    this.live.push({ g, model, trail: [[...from]], line: null, dots: null, rest: null });
  }

  // ---- the flight ---------------------------------------------------------------------------------------------

  private hull(): HullCast | null {
    const grid = this.source.hullGrid?.() ?? this.source.grid();   // PAR-46a: the map's, walking or not
    if (!grid) return this.cast;              // no hull read: the last hull still holds what is in the air
    if (grid !== this.castGrid) { this.castGrid = grid; this.cast = gridCast(grid, this.defaultMaterial); }
    return this.cast;
  }

  private fly(dt: number): void {
    if (!this.live.length) { this.flight.reset(); return; }
    const cast = this.hull() ?? ((): [] => []);
    const frames = this.flight.advance(dt);
    // Research 209 §18: the page frame that applies `detonate` is often shorter than a game frame (a 60 Hz rAF, the
    // flight at 29.97 Hz). A resting charge whose trigger is already set still explodes in this frame, with the gate.
    // A Detonator's claymore takes this step too, so the page's copy can be one game frame ahead of the room. That
    // lead is the drawing only.
    if (frames === 0) {
      for (const l of [...this.live]) {
        if (!l.g.trigger || l.g.state !== 'rest') continue;
        for (const e of stepGrenade(l.g, GAME_FRAME_DT, cast)) this.handle(l, e);
      }
      for (let i = this.live.length - 1; i >= 0; i--) if (this.live[i]!.g.state === 'removed') { this.dropLive(this.live[i]!); this.live.splice(i, 1); }
    }
    for (let left = frames; left > 0; left--) {
      // M7: an armed PMN tripped by any actor inside its ProximityDistance (`FUN_00543930`; PMN_FRIENDLY_READING).
      if (this.live.some((l) => l.g.record.proximity !== undefined)) {
        const actors = this.actorsNow();
        for (const l of this.live) if (l.g.record.proximity !== undefined) proximityTripped(l.g, actors);
      }
      for (const l of this.live) this.stepLive(l, cast);
      for (let i = this.live.length - 1; i >= 0; i--) if (this.live[i]!.g.state === 'removed') { this.dropLive(this.live[i]!); this.live.splice(i, 1); }
    }
    for (const l of this.live) this.drawLive(l, dt);
  }

  /** The actors an armed PMN is tripped by (`proximityTripped`): the source's, else the page's own feet. */
  private actorsNow(): readonly V3[] {
    const snap = this.source.snapshot();
    return this.source.actors?.() ?? (snap ? [[snap.feet[0], snap.feet[1], snap.feet[2]] as V3] : []);
  }

  /** One game frame of one copy (`fly`, `startAged`): the online C4's hold, the step on the hull and its events, the trail. */
  private stepLive(l: Live, cast: HullCast): void {
    this.holdOnlineC4(l);
    l.from = { pos: [...l.g.pos], tumble: [...l.g.tumble] };    // MISSION R8: what the drawing runs from
    const flying = l.g.state === 'flight';
    for (const e of stepGrenade(l.g, GAME_FRAME_DT, cast)) this.handle(l, e);
    if (flying) this.rocketPast(l, l.from.pos);
    if (this.trail && l.g.state === 'flight') l.trail.push([...l.g.pos]);
  }

  /**
   * LATER 645 (research 81 s5; reading, pending review): `FUN_00598000`'s rocket branch on the page's player. Each tick
   * the projectile's segment is its last position to its new one (`FUN_003ca5a0` copies `+0x54` into `+0x48`,
   * D:L320297-320299, then writes the stepped point to `+0x54`, the rocket's at D:L320305-320342); a rocket (the ID's
   * category 0xb9, `FUN_003d1e10` D:L454625-454627, here `weaponCategory`) not yet heard (`+6` bit 4, D:L454641) whose
   * segment's nearest point, inside it, is strictly under 100 from the feet (D:L454640, `passingSound`) is heard and
   * marked, whether or not a sound plays (the mark is set past the play, D:L454646). The console's own rocket is skipped
   * (`+4` bit 3, D:L454627): `remote` only. Every flying step, `startAged`'s catch-up among them, as its bounces are.
   */
  private rocketPast(l: Live, from: V3): void {
    if (!l.remote || l.rocketBy || weaponCategory(l.g.record.id) !== 0xb9) return;
    const feet = this.source.listenerFeet?.();
    if (!feet) return;
    const to: V3 = [...l.g.pos];
    if (!passingSound(feet, from, to, true)) return;
    l.rocketBy = true;
    this.emit('rocketPast', { from: [...from], to, actor: [feet[0], feet[1], feet[2]] });
  }

  /**
   * Research 209 §18: in a match, a C4 the room has named (the page's own, after `tagOwn`, or another's) does not
   * go off on its own fuse. `HandleTimers` and the blast are one detonation on the original; this copy holds the fuse
   * one game frame above zero until `detonateRemote` sets `trigger`, and the room's `detonate` is that frame.
   * About a second of room ticks with no message, the copy goes off anyway (a dropped connection). The tick is
   * the room's (`simTick`), so a stalled frame cannot spend the second before those ticks are applied.
   * `nomatch` is not online.
   */
  private holdOnlineC4(l: Live): void {
    if (!this.source.online?.() || l.pid === undefined || l.g.record.name !== 'C4' || l.g.state !== 'rest' || l.g.trigger) return;
    if (l.g.fuse > GAME_FRAME_DT) return;
    const sim = this.source.simTick?.();
    if (sim !== undefined) {
      if (l.serverFuseTick === undefined) l.serverFuseTick = sim;
      if (sim - l.serverFuseTick < C4_SERVER_DETONATE_GRACE_S_ADAPTATION * TICK_HZ) l.g.fuse = GAME_FRAME_DT * 2;
      return;
    }
    const waited = (l.serverFuseWait ?? 0) + GAME_FRAME_DT;
    l.serverFuseWait = waited;
    if (waited < C4_SERVER_DETONATE_GRACE_S_ADAPTATION) l.g.fuse = GAME_FRAME_DT * 2;
  }

  private handle(l: Live, e: GrenadeEvent): void {
    if ((e.kind === 'bounce' || e.kind === 'pass') && e.owner !== undefined) this.contact(l, e.owner, e.point);
    if (e.kind === 'bounce') {
      const info: BounceInfo = { material: e.material, pos: e.point, speed: e.speed, sound: e.sound, anim: materialAnim(l.g.record.hitAnim, e.material) };
      this.bounceLog.push(info);
      if (this.bounceLog.length > 64) this.bounceLog.shift();
      this.emit('bounce', info);
    } else if (e.kind === 'rest') {
      l.rest = e.material;
    } else if (e.kind === 'explode') {
      this.explode(e.point, l.rest, l.g.record, l);
    }
  }

  /**
   * The model where the flight has it. MISSION R8 -- a known deviation, a browser adaptation with no original (the
   * owner, 2026-10-04: "the speed is good, but the feeling was wrong"; "yes to the interp fix"; research 208 section 9):
   * the flight steps once per 30 Hz game frame (the original's arithmetic, kept), so the model is DRAWN between the last
   * two frames' positions by `flight.alpha()`, its tumble slerped, so it moves at the screen's rate instead of holding
   * for drawn frames and jumping. The flight, its events and the room are untouched; the original draws every frame it
   * steps (30 fps on a 30 fps screen).
   */
  private drawLive(l: Live, dt: number): void {
    if (l.model && l.g.state !== 'detonated' && l.facing === undefined) {
      const t = this.flight.alpha(), from = l.from;
      if (from) {
        const p = l.g.pos;
        l.model.position.set(from.pos[0] + (p[0] - from.pos[0]) * t, from.pos[1] + (p[1] - from.pos[1]) * t, from.pos[2] + (p[2] - from.pos[2]) * t);
      } else l.model.position.set(...l.g.pos);
      if (weaponCategory(l.g.record.id) === 0x79) {
        // A hand grenade: the node's turn is the free-flight step's (`FUN_003c9530` -> `FUN_00307360` ->
        // `FUN_00315790`), which `SetModelOrientation` (0x3cabe0) leaves alone for category 0x79 -- in flight and after,
        // a bounce and the rest keep the last free step's turn (research 202 §2.6, V5 §7.2; PF-07a).
        const [x, y, z, w] = tumbleQuaternion(l.g.tumble);
        l.model.quaternion.set(x, y, z, w);
        if (from) {
          const [fx, fy, fz, fw] = tumbleQuaternion(from.tumble);
          l.model.quaternion.slerpQuaternions(SLERP_FROM.set(fx, fy, fz, fw), SLERP_TO.set(x, y, z, w), t);
        }
      } else if (l.g.state !== 'flight') {
        l.model.rotation.set(Math.PI / 2, l.model.rotation.y, 0);   // a launched round at rest: lying on its side
      }
    }
    if (this.trail && l.trail.length > 1) {
      if (!l.line) {
        l.line = new Line(new BufferGeometry(), new LineBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.9, toneMapped: false, depthTest: false, fog: false }));
        l.line.frustumCulled = false;
        l.line.renderOrder = 10003;                   // a debug overlay: drawn over the world
        this.object.add(l.line);
      }
      l.line.geometry.setAttribute('position', new Float32BufferAttribute(l.trail.flat(), 3));
      if (!l.dots) {
        // A dot a tick along the line, so the arc reads as a flight rather than a hairline.
        l.dots = new Points(new BufferGeometry(), new PointsMaterial({ color: 0xffe080, size: 5, sizeAttenuation: false, toneMapped: false, depthTest: false, fog: false }));
        l.dots.frustumCulled = false;
        l.dots.renderOrder = 10003;
        this.object.add(l.dots);
      }
      l.dots.geometry.setAttribute('position', new Float32BufferAttribute(l.trail.flat(), 3));
    }
  }

  private dropLive(l: Live): void {
    if (l.model) this.object.remove(l.model);
    if (l.line) { this.object.remove(l.line); l.line.geometry.dispose(); (l.line.material as LineBasicMaterial).dispose(); }
    if (l.dots) { this.object.remove(l.dots); l.dots.geometry.dispose(); (l.dots.material as PointsMaterial).dispose(); }
  }

  // ---- the explosion ------------------------------------------------------------------------------------------

  /**
   * The effects' door (`./effects`' `run`): the page hands it in, and a zAnim it can run replaces this file's
   * placeholder sprites for that explosion. Null (or null or false back) keeps the placeholders. Its answer is read for
   * its truth, as `play`'s yes or no was; a smoke's handle is kept for `clearSmokes` alone (PAR-45, research 283).
   */
  setEffectPlayer(play: ((anim: string, at: EffectAt) => EffectHandle | boolean | null) | null): void {
    this.playEffect = play;
  }

  private playEffect: ((anim: string, at: EffectAt) => EffectHandle | boolean | null) | null = null;

  /**
   * PAR-45 (research 283; a browser adaptation for the replay's seek, `REPLAY_ADAPTATION`, never called by a match):
   * every smoke pouring here stops -- the effects player's runs (`smoke_grenade` with the `smoke_stream` it called, a
   * joiner's `JOIN_SMOKE_STREAM`) and the placeholder puffs' sources (`smokes`) -- and the projectiles' `effectSmoke`
   * marks go, so a hydrate after it starts the stream again. The puffs already in the air run out their lifetimes, this
   * file's own sprites likewise (`CLEAR_SMOKES_PUFFS_READING`). `clearAir` and `reset` are unchanged.
   */
  clearSmokes(): void {
    for (const h of this.smokeRuns) h.stop();
    this.smokeRuns.length = 0;
    this.smokes.length = 0;
    for (const l of this.live) delete l.effectSmoke;
  }

  /** PAR-45: the handles of the smokes the effects player runs (`effectSmoke`'s), for `clearSmokes`. */
  private readonly smokeRuns: EffectHandle[] = [];

  private keepSmokeRun(ran: EffectHandle | boolean | null): void {
    if (ran && typeof ran === 'object') this.smokeRuns.push(ran);
  }

  /**
   * LATER 851 (research 85 §5.2): a contact of the page's own copy, offline -- a bounce or a pass on the hull polygon
   * of `owner` -- is a hit on the struck node (`FUN_003c8f50` D:L319747-319750 -> `FUN_00273a50` -> `FUN_003c7490`'s
   * impact branch), as the room's `sceneContact`: the record's `ImpactDamage` and `Damage_Modifier`, its range falloff
   * from where the frame began (`GRENADE_CONTACT_RANGE_READING`: `l.from`, `stepLive`), its round's `Piercing`. Remote
   * and online copies stay presentation: the room applies theirs (as `explode`'s blast).
   */
  private contact(l: Live, owner: string, point: V3): void {
    if (l.remote || this.source.online?.()) return;
    const r = l.g.record;
    this.world()?.health.hitAt?.(owner, {
      kind: 'impact', rating: r.impactDamage ?? 0, modifier: r.damageModifier ?? 0, point: [...point], piercing: this.piercings.get(r.id) ?? 0,
      range: { from: [...(l.from?.pos ?? l.g.pos)], effective: r.effectiveRange, maximum: r.maximumRange },
    });
  }

  private explode(pos: V3, material: string | null, record: ThrowableRecord, l: Live): void {
    // LATER 102 (research 209 §15): every local offline explosion reaches the room's scene path
    // (`Room.sceneBlast` -> `SceneHealth.blastAt`). FUN_003c7ee0 D:L319005-319073 -> FUN_003c80e0 -> FUN_00273a50
    // D:L120978-121059. The rating and radius are the record's (research 94 §C4/§C5, research 176 §7.3): C4 18 in
    // 50 u, the RPG and the LAW HEAT 20 in 150 u, the M67 10 in 150 u. A shield of 17 takes 20 and 18 and refuses 10
    // before falloff. Remote/replay and online blasts stay visual here; the room applies them.
    if (!l.remote && !this.source.online?.()) {
      const grid = this.source.hullGrid?.() ?? this.source.grid();
      const rating = record.explosionDamage + (record.damageModifier ?? 0);
      // `GetDamage`'s factor at the target's midpoint (`FUN_003c7600` D:L318769-318831): the claymore's 1/32 outside its
      // cone (the room's `blast` too); the backblast's 0 everywhere offline (`DAT_0045a0c1` clear, D:L318784-318787) --
      // its cone is online's, the room's (LATER 270). A thrown grenade and a rocket have no placed facing: the factor 1.
      const facing: V3 | null = l.facing === undefined ? null : [-Math.sin(l.facing * Math.PI / 180), 0, -Math.cos(l.facing * Math.PI / 180)];
      this.world()?.health.blastAt(pos, rating, record.explosionRadius, (to, target) => {
        if (record.ignoreExplosionDI === true) return true; // C4 Ammo's bare field, research 235 §1.
        if (!grid) return false;
        // The room's sightFrom (research 94 §C4.3): retain its existing BOUNCE_LIFT toward the midpoint.
        const length = Math.hypot(to[0] - pos[0], to[1] - pos[1], to[2] - pos[2]);
        const from: V3 = length > BOUNCE_LIFT
          ? [0, 1, 2].map(i => pos[i]! + (to[i]! - pos[i]!) * BOUNCE_LIFT / length) as V3 : pos;
        return blastLine(grid, from, to, target, record.explosionRadius,
          p => surfaceMaterial(p.material, this.defaultMaterial).penetration);
      }, {
        piercing: this.piercings.get(record.id) ?? 0,                  // AD-5: the room's `sceneBlast` (ZAMMO `+0x14`)
        cone: (to) => {
          if (record.id === ITEM.BACKBLAST) return 0;
          if (!facing) return 1;
          const off = [to[0] - pos[0], to[1] - pos[1], to[2] - pos[2]] as V3;
          return record.id === CLAYMORE.id && !claymoreCone(off, facing, record.explosionRadius) ? 1 / 32 : 1;
        },
      });
    }
    const snap = this.source.snapshot();
    const distance = snap ? Math.hypot(pos[0] - snap.feet[0], pos[1] - snap.feet[1], pos[2] - snap.feet[2]) : null;
    const detonation = detonationOf(record);
    // The flash's rule (0x597c00): the SEAL's forward against the unit direction to the flash. P2 (TB-1; research 85
    // s9.5): the page's own only without a room (the `&nomatch` free walk) -- with one, the white-out is the room's gated
    // blast's (`blast.flash`, `NetPage`'s `whiteOut`): `FUN_005a5250`'s slot 0 is reached only inside `FUN_005a0e70`
    // (D:L459228), past the line and the friendly-fire gate (FLASH_FRIENDLY_FIRE_READING).
    let flash: 1 | 2 | 3 | null = null;
    if (detonation === 'flash' && snap && !this.source.online?.()) flash = blastFlashLevel(snap, pos);   // the room's own reckoning
    const anim = material && record.materialAnim ? materialAnim(record.materialAnim, material) : record.explosionAnim;
    const at: EffectAt = { position: [...pos], normal: material ? [0, 1, 0] : null };
    const ran = !!this.playEffect && (this.playEffect(anim, at) || (anim !== record.explosionAnim && this.playEffect(record.explosionAnim, at)));
    const byEffects = !!ran;
    const info: ExplosionInfo = {
      pos: [...pos], radius: record.explosionRadius, anim, baseAnim: record.explosionAnim,
      material, distanceToPlayer: distance,
      damageToPlayer: distance === null || !snap ? 0 : this.damageAt(distance, record, l, pos, snap.feet),
      item: record.name, detonation, flash, byEffects,
    };
    this.explosionLog.push(info);
    if (this.explosionLog.length > 32) this.explosionLog.shift();
    if (!byEffects) {
      if (detonation === 'blast') this.burst(pos);
      else if (detonation === 'flash') this.glow(pos);
    }
    if (detonation === 'smoke' && (!byEffects || SMOKE_ALWAYS_PLACEHOLDER)) {
      this.smokes.push({ pos: [...pos], until: record.removal - record.fuse, next: 0, age: 0, ...(l.pid !== undefined ? { pid: l.pid } : {}) });
    }
    if (detonation === 'smoke') l.effectSmoke = byEffects;          // PF-28: a rejoin does not start it again
    if (detonation === 'smoke' && byEffects) this.keepSmokeRun(ran);
    // AD-4: the decal on a hit only (`FUN_003c7af0` D:L318876-318880); was a flat scorch at the blast when none was found.
    const ground = detonation === 'blast' && material !== null ? this.groundUnder(pos) : null;
    if (ground && material !== null) this.scorch(pos, material, ground);
    // The smoke's canister lies where it went off; the others are gone.
    if (l.model) l.model.visible = detonation === 'smoke';
    this.emit('explode', info);
  }

  /** Each smoke's puffs; `pid` the room's projectile id it pours from (PF-28: a rejoin replaces it, never doubles it). */
  private readonly smokes: { pos: V3; until: number; next: number; age: number; pid?: number }[] = [];

  /** `GetDamage` (0x3c7600) at the SEAL's feet: a claymore's a 32nd outside its cone (`claymoreCone`). */
  private damageAt(distance: number, record: ThrowableRecord, l: Live, pos: V3, feet: readonly number[]): number {
    const d = explosionDamage(distance, record);
    if (l.facing === undefined || record.id !== CLAYMORE.id) return d;
    const r = (l.facing * Math.PI) / 180;
    // CLAYMORE_CONE_POINT_READING (research 85 §9.7.2): the feet + 10 here, the feet in the room's (`room.ts` `blast`),
    // and the baked radius here against the record's there; which point `GetDamage` is handed is not settled. Unchanged.
    const inside = claymoreCone([feet[0]! - pos[0], feet[1]! + 10 - pos[1], feet[2]! - pos[2]], [-Math.sin(r), 0, -Math.cos(r)]);
    return inside ? d : d / 32;
  }

  /** The flashbang's light as a glow (the placeholder for `flashcrash_grenade`'s `explosion_light`). */
  private glow(pos: V3): void {
    const R = EXPLOSION_READING;
    const flash = this.sprite(GRENADE_BITMAPS.fire, true, [1, 1, 1]);
    flash.position.set(pos[0], pos[1] + 3, pos[2]);
    this.particles.push({ sprite: flash, vel: [0, 0, 0], life: R.flash.life * 1.5, age: 0, size: [R.flash.radius[0] / 3, R.flash.radius[1] / 3], gravity: 0, fade: 1 });
  }

  /**
   * `SMOKE_PLACEHOLDER`: each smoke's puffs, from its detonation to its removal. PAR-34: its life (`age` to `until`,
   * the record's) counts the frame's real seconds; the puffs' cadence is the effect's and keeps the clamped step.
   */
  private smokeFrame(dt: number, real = dt): void {
    const S = SMOKE_PLACEHOLDER, r = this.random;
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const sm = this.smokes[i]!;
      sm.age += real;
      if (sm.age >= sm.until) { this.smokes.splice(i, 1); continue; }
      sm.next -= dt;
      while (sm.next <= 0) {
        sm.next += S.every;
        const grey = rand(S.grey[1], S.grey[0], r);
        const s = this.sprite(GRENADE_BITMAPS.puff, false, [grey, grey, grey]);
        s.position.set(sm.pos[0], sm.pos[1] + S.lift, sm.pos[2]);
        const a = rand(0, Math.PI * 2, r), sp = rand(0.2, 1, r) * S.spread;
        this.particles.push({
          sprite: s, vel: [Math.cos(a) * sp, rand(S.rise[0], S.rise[1], r), Math.sin(a) * sp],
          life: rand(S.life[0], S.life[1], r), age: 0, size: ((w: number): [number, number] => [w, w * S.grow])(rand(S.size[0], S.size[1], r)), gravity: 0, fade: 0.9, still: true,
        });
      }
    }
  }

  /** The `frag_grenade` zAnim's parts as sprites (`EXPLOSION_READING`). */
  private burst(pos: V3): void {
    const R = EXPLOSION_READING, r = this.random;
    // The flash is a light in the game (radius 100 -> 190 over 0.5 s); the world's materials take no three.js light,
    // so it is drawn as a glow a fifth of that across, fading over the light's life [reading].
    const flash = this.sprite(GRENADE_BITMAPS.fire, true, R.flash.color);
    flash.position.set(pos[0], pos[1] + 4, pos[2]);
    this.particles.push({ sprite: flash, vel: [0, 0, 0], life: R.flash.life, age: 0, size: [R.flash.radius[0] / 5, R.flash.radius[1] / 5], gravity: 0, fade: 0.9 });
    type Emitter = { count: number; vx: number; vy: readonly [number, number]; size: readonly [number, number]; grow: number; life: readonly [number, number]; gravity: number; grey?: readonly [number, number] };
    const emit = (e: Emitter, bitmap: string, additive: boolean, ground = false): void => {
      for (let i = 0; i < e.count; i++) {
        const grey = e.grey ? rand(e.grey[1], e.grey[0], r) : 1;
        const s = this.sprite(bitmap, additive, [grey, grey, grey]);
        s.position.set(pos[0], pos[1] + (ground ? 1 : 3), pos[2]);
        const a = rand(0, Math.PI * 2, r), sp = rand(0.3, 1, r) * e.vx;
        const size = rand(e.size[0], e.size[1], r);
        this.particles.push({
          sprite: s, vel: [Math.cos(a) * sp, rand(e.vy[0], e.vy[1], r), Math.sin(a) * sp],
          life: rand(e.life[0], e.life[1], r), age: 0, size: [size, size * e.grow], gravity: e.gravity, fade: additive ? 1 : 0.85,
        });
      }
    };
    emit(R.fire, GRENADE_BITMAPS.fire, true);
    emit(R.spark, GRENADE_BITMAPS.spark, true);
    emit(R.smoke, GRENADE_BITMAPS.smoke, false);
    emit(R.dust, GRENADE_BITMAPS.dust, false);
    emit(R.roll, GRENADE_BITMAPS.puff, false, true);
  }

  private sprite(bitmap: string, additive: boolean, color: V3): Sprite {
    const map = this.textures.get(bitmap) ?? null;
    const material = new SpriteMaterial({
      map, color: map ? undefined : additive ? 0xffc070 : 0x807870, transparent: true, depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending, fog: true, toneMapped: false,
    });
    material.color.setRGB(...color);
    const s = new Sprite(material);
    s.frustumCulled = false;
    s.renderOrder = additive ? 10002 : 10001;
    this.object.add(s);
    return s;
  }

  private effects(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) {
        this.object.remove(p.sprite);
        p.sprite.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.vel[1] -= p.gravity * dt;
      const drag = Math.exp((p.still ? -SMOKE_PLACEHOLDER.drag : -2.5) * dt);
      p.vel = [p.vel[0] * drag, p.vel[1] * (p.gravity ? 1 : drag), p.vel[2] * drag];
      p.sprite.position.x += p.vel[0] * dt;
      p.sprite.position.y += p.vel[1] * dt;
      p.sprite.position.z += p.vel[2] * dt;
      const size = p.size[0] + (p.size[1] - p.size[0]) * Math.sqrt(t);
      p.sprite.scale.set(size, size, 1);
      // A smoke puff holds thick most of its life, then thins (the screen's); a blast's part fades from the start.
      const fading = p.still ? Math.min(1, (1 - t) / 0.35) : (1 - t) * (1 - t);
      p.sprite.material.opacity = p.fade * fading * (t < (p.still ? 0.15 : 0.04) ? t / (p.still ? 0.15 : 0.04) : 1);
    }
  }

  /**
   * `GRENADE_BLAST`'s `grenade_mark.tif` flat under a grenade that lay on the ground (the material's size, STONE's when
   * unlisted), on the ground under it (`groundUnder`; research 85 §7.3) [reading: the game marks under a blast in the
   * air too, sized by the probed surface's material; the viewer marks at rest only, by the material it lay on, and at
   * STONE's size for a material `GRENADE_BLAST` does not list (research 85 section 10, "the scorch")]. The unclipped
   * square (no clipper) stays flat.
   */
  private scorch(pos: V3, material: string, ground: ScorchGround | null): void {
    const [min, max] = GRENADE_BLAST[material] ?? GRENADE_BLAST.STONE!;
    // The permanent pool full (`FUN_003bf1a0` 313254 refuses every entry): no scorch at all, the old ones kept.
    if (this.permTriangles >= PERM_DECAL_TRIANGLES) return;
    if (this.clipper) { this.scorchClipped(ground?.point ?? pos, ground?.normal ?? [0, 1, 0], min, max); return; }
    // Its own four corners, for its own colour (the shared quad's, cloned), as `./fire`'s marks.
    const mark = new Mesh(markGeometry(this.scorchGeometry), this.scorchMaterialOf());
    // A `FUN_003139e0` decal like a bullet mark (research 89 §13): modulated by the ground's own drawn colour under it.
    this.scorchShade = this.shade?.(pos, [0, 1, 0]) ?? null;
    paintMark(mark.geometry, this.scorchShade);
    if (this.shade && !this.scorchShade) this.unshaded.set(mark, [...pos]);
    const size = rand(min, max, this.random);
    mark.scale.set(size, size, 1);
    mark.rotation.set(-Math.PI / 2, 0, rand(0, Math.PI * 2, this.random));
    mark.position.set(pos[0], pos[1] - 0.05, pos[2]);
    this.keepScorch(mark, this.squareEntries());
  }

  /** The bare square's pool entries: its two triangles, or the one the pool still has room for. */
  private squareEntries(): number {
    return Math.min(2, PERM_DECAL_TRIANGLES - this.permTriangles);
  }

  /** A scorch into the scene and the permanent pool, `entries` of its room taken. */
  private keepScorch(mark: Mesh, entries: number): void {
    // OBF-32: a walk decal, linked into the struck visual's chain as a bullet mark is (`FUN_003b3800`): drawn after its
    // ground's own passes, under the smoke's particles (`./fire` `WALK_DECAL_RENDER_ORDER`). Was unset (0).
    mark.renderOrder = WALK_DECAL_RENDER_ORDER;
    this.object.add(mark);
    this.scorches.push(mark);
    this.scorchTriangles.set(mark, entries);
    this.permTriangles += entries;
  }

  /**
   * The ground under a blast as the game finds it (`FUN_003c7af0` D:L318876; AD-4, research 202 §3.4): the world's
   * vertical line at the blast's x and z (`FUN_0031df50(10.0, world, pos)`, `./net/placing` `worldColumn`), the highest
   * surface no more than `SCORCH_ABOVE` over the blast, the first of equal heights, no lower bound and no material test
   * (`scorchHit`, `FUN_002d4c20`); its record -- point, normal -- is what `FUN_003d0ba0` frames the decal on. Null: no
   * ground in the column, and no decal (D:L318877). The column's classes are the throw's hull (`gridCast`): which
   * surfaces the game's query admits upstream is apart, as the decal's own visibility is (the scorch is drawn at rest
   * only). Was: 10 above and 10 below, the placement's filter (VOLUMETRIC, PENETRATION 1, LIQUID), a flat scorch on none.
   */
  private groundUnder(pos: V3): ScorchGround | null {
    const cast = this.hull();
    if (!cast) return null;
    const hit = scorchHit(worldColumn(cast, pos), pos[1]);
    if (!hit) return null;
    const l = Math.hypot(...hit.normal);
    if (!(l > 0)) return null;
    const k = hit.normal[1] < 0 ? -1 / l : 1 / l;         // the side the column came from: the ground's top
    return { point: [...hit.point], normal: [hit.normal[0] * k, hit.normal[1] * k, hit.normal[2] * k] };
  }

  /**
   * The scorch as the game builds a `FUN_003139e0` decal (research 89 §13-§15): the square flat on the ground under the
   * blast, projected along that ground's normal negated (`FUN_003d0ba0` 323891 hands the column's record +0x10 scaled by
   * -1 to `FUN_00307810`), clipped to the drawn ground's triangles, each vertex the ground's colour there
   * (`./markClip`); the bare square at unity where nothing is drawn under it yet, clipped again a few a frame. Straight
   * down instead, a big sloped triangle's far vertices pass the 4.8 depth test and the scorch is dropped whole.
   */
  private scorchClipped(pos: V3, normal: V3, min: number, max: number): void {
    const size = rand(min, max, this.random);
    const turn = rand(0, Math.PI * 2, this.random);
    const c = Math.cos(turn), s = Math.sin(turn);
    // The square's turn about the normal as the unclipped one takes it about the up axis (on flat ground the axes are
    // exactly its: right (c, 0, -s), up (-s, 0, -c)) [reading: `FUN_00307810` takes no turn; the viewer's random one kept].
    const [t1, t2] = tangents(normal);
    const frame: MarkFrame = {
      origin: [...pos],
      right: [c * t1[0] + s * t2[0], c * t1[1] + s * t2[1], c * t1[2] + s * t2[2]],
      up: [-s * t1[0] + c * t2[0], -s * t1[1] + c * t2[1], -s * t1[2] + c * t2[2]],
      forward: [-normal[0], -normal[1], -normal[2]], side: size,
    };
    const mark = new Mesh(markClipGeometry(), this.scorchMaterialOf());
    // One pool entry per kept world triangle, the first ones while there is room (`FUN_003b3800` 306401-306417): a
    // scorch that only partly fits is partly drawn (SCORCH_PARTIAL_ORDER_READING: in the viewer's candidate order, not
    // the game's walk).
    const kept = this.clipper!.clip(frame, mark.geometry, 0.05, PERM_DECAL_TRIANGLES - this.permTriangles);
    if (kept > 0) {
      const centre = this.clipper!.centre;
      this.scorchShade = this.clipper!.centreFound ? [centre[0]!, centre[1]!, centre[2]!, centre[3]!] : null;
    } else {
      squareInto(frame, mark.geometry, 0.05, null);
      this.unclipped.set(mark, frame);
      this.scorchShade = null;
    }
    mark.matrixAutoUpdate = false;
    mark.position.set(pos[0], pos[1], pos[2]);          // for the tests; the matrix stays the identity (world space)
    mark.updateMatrixWorld(true);
    this.keepScorch(mark, kept > 0 ? kept : this.squareEntries());
    if (kept > 0) this.hangOnNode(mark);
  }

  /** EFFECTS: a scorch off the node it rode (a round's end, a new map); its matrix back to the world's identity. */
  private detach(mesh: Mesh): void {
    this.heldOn.get(mesh)?.();                          // LATER 277: no longer held on its node
    this.heldOn.delete(mesh);
    const off = this.onNode.get(mesh);
    if (!off) return;
    off();
    this.onNode.delete(mesh);
    mesh.matrix.identity();
    mesh.matrixWorldNeedsUpdate = true;
  }

  /** EFFECTS: the scorch just clipped onto the node the clip chose, when that node moves (`FUN_003b3800` 306396-306416). */
  private hangOnNode(mesh: Mesh): void {
    this.detach(mesh);
    const path = this.clipper?.lastNodePath ?? null;
    if (!path) return;
    const off = this.source.attachToNode?.(path, mesh) ?? null;
    if (off) this.onNode.set(mesh, off);
    // LATER 277: held on its node whatever it is; switched off, the scorch goes (`dropScorch`).
    const release = this.source.holdOnNode?.(path, () => this.dropScorch(mesh)) ?? null;
    if (release) this.heldOn.set(mesh, release);
  }

  /**
   * LATER 277: a scorch whose node was switched off (`NODE_OFF_MARKS_READING`, `./world`) -- drawn no more, off its node,
   * its permanent pool entries freed: one rule with the marks', as `FUN_003b36f0` (D:L306336-306342) frees both kinds
   * of a visual's list together.
   */
  private dropScorch(mesh: Mesh): void {
    this.heldOn.delete(mesh);
    mesh.visible = false;
    this.unshaded.delete(mesh);
    this.unclipped.delete(mesh);
    this.detach(mesh);
    this.object.remove(mesh);
    mesh.geometry.dispose();
    const i = this.scorches.indexOf(mesh);
    if (i >= 0) this.scorches.splice(i, 1);
    this.permTriangles -= this.scorchTriangles.get(mesh) ?? 0;
    this.scorchTriangles.delete(mesh);
  }

  /** EFFECTS: how many scorches ride a moving node now (tests and the hook). */
  scorchesOnNodes(): number {
    return this.onNode.size;
  }

  /**
   * What a throw and its blast first draw, for the page to compile with the SEAL (`ViewerRenderer.prepare`, research 90
   * §9, #23): the arc's strip (hidden until R1 is held; the scene-wide warm-up reaches it last, after the throw on a
   * quick one -- it linked at the hold) and a scorch with the material every blast will use (made at the first blast
   * before, on a quad with a `color` lane no warmed draw had). The scorch is not in the scene: `prepare` parks it for
   * the call, so no frame draws it.
   */
  warmObjects(): Object3D[] {
    if (!this.scorchWarm) {
      this.scorchWarm = new Mesh(markGeometry(this.scorchGeometry), this.scorchMaterialOf());
      this.scorchWarm.name = 'scorch (warm-up)';
      this.scorchWarm.frustumCulled = false;
      // The clipped scorch (./markClip) draws a different lane set (no normal): warm that program too, on a square.
      const clipped = markClipGeometry();
      squareInto({ origin: [0, 0, 0], right: [1, 0, 0], up: [0, 0, -1], forward: [0, -1, 0], side: 1 }, clipped, 0.05, null);
      this.scorchClipWarm = new Mesh(clipped, this.scorchMaterialOf());
      this.scorchClipWarm.name = 'scorch clipped (warm-up)';
      this.scorchClipWarm.frustumCulled = false;
    }
    // FLASH-WARM (product track, a renderer warm-up): the map's throwable models -- the templates the hand's model and
    // every thrown copy are cloned from, sharing their geometries and bitmaps -- are in no scene, so their buffers and
    // textures were made at the first selection or throw (the owner's measurement at bb133165e: the first Mark141's
    // window made 4 geometries and a texture the second did not). Parked by `prepare` for the call, like the scorch.
    return [this.arcLine, this.scorchWarm, this.scorchClipWarm!, ...Object.values(this.modelTemplates ?? {})];
  }

  private scorchWarm: Mesh | null = null;
  private scorchClipWarm: Mesh | null = null;

  /**
   * The scorches' material: `grenade_mark.tif` in the marks' GS arithmetic (`markMaterial`: texel x the vertex colour,
   * clamped, brightened with the frame; source alpha over, no depth write), pulled a step nearer than a bullet mark;
   * without the bitmap a dark stand-in, modulated all the same.
   */
  private scorchMaterialOf(): Material {
    if (this.scorchMaterial) return this.scorchMaterial;
    const bitmap = this.scorchBitmap;
    const m: Material = bitmap ? markMaterial({ rgba: bitmap, gs: null }) : new MeshBasicMaterial({
      color: 0x151210, vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide, fog: true, toneMapped: false,
      opacity: 0.6,
    });
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -2;
    this.scorchMaterial = m;
    return m;
  }

  /** EFFECTS: a few of the clipped scorches still without a drawn surface under them, clipped again (`unclipped`). */
  private clipLate(): void {
    if (!this.clipper || this.unclipped.size === 0) return;
    let asked = 0;
    for (const [mesh, frame] of this.unclipped) {
      if (asked++ >= SHADE_RETRIES_PER_FRAME) break;
      this.unclipped.delete(mesh);
      // The square's entries back to the pool, the clip's taken: at most what it held plus the room left.
      const held = this.scorchTriangles.get(mesh) ?? 0;
      const kept = this.clipper.clip(frame, mesh.geometry, 0.05, held + PERM_DECAL_TRIANGLES - this.permTriangles);
      if (kept === 0) { this.unclipped.set(mesh, frame); continue; }
      this.scorchTriangles.set(mesh, kept);
      this.permTriangles += kept - held;
      this.hangOnNode(mesh);
      if (mesh === this.scorches.at(-1) && this.clipper.centreFound) {
        const c = this.clipper.centre;
        this.scorchShade = [c[0]!, c[1]!, c[2]!, c[3]!];
      }
    }
  }

  /** EFFECTS: a few of the scorches still without a drawn surface under them, asked again (`unshaded`). */
  private shadeLate(): void {
    this.clipLate();
    if (!this.shade || this.unshaded.size === 0) return;
    let asked = 0;
    for (const [mesh, at] of this.unshaded) {
      if (asked++ >= SHADE_RETRIES_PER_FRAME) break;
      const rgba = this.shade(at, [0, 1, 0]);
      this.unshaded.delete(mesh);
      if (rgba) {
        paintMark(mesh.geometry, rgba);
        if (mesh === this.scorches.at(-1)) this.scorchShade = rgba;
      } else this.unshaded.set(mesh, at);               // to the back of the queue: the others get their turn
    }
  }

  // ---- the hand -----------------------------------------------------------------------------------------------

  private placeHand(snap: PlaySnapshot | null): void {
    const held = !!snap && this.equipped_ && (this.detonatorUp || this.selectedLeft() > 0) &&
      (this.phase_ === 'ready' || this.phase_ === 'holding' || !!this.pending || !!this.placing);
    // On the body's `grenade` node under `rhand` (`FUN_00553290`; the clips' `rifle` track carries the firearm apart).
    const node = this.source.heldNode?.() ?? null;
    const template = this.template;
    if (node && template) {
      const item = this.held() ?? this.item_;
      if (!this.heldModel || this.heldModel.item !== item || this.heldModel.object.parent !== node) {
        this.dropHeld();
        const object = template.clone();
        node.add(object);
        this.heldModel = { item, object };
      }
      this.heldModel.object.visible = held;
      this.hand.visible = false;
      return;
    }
    this.dropHeld();
    const show = held && this.source.view() === 'third' && this.handModel !== null;
    this.hand.visible = show;
    if (!show || !snap) return;
    let offset: V3 = HAND_PLACEHOLDER;
    if (this.pending) {
      // The clip lifts the hand toward its release point [placeholder for the skeleton's hand].
      const k = 1 - Math.max(0, this.pending.left) / Math.max(1e-6, releaseSeconds(this.pending.played));
      const to = this.pending.anim.offset;
      offset = [offset[0] + (to[0] - offset[0]) * k, offset[1] + (to[1] - offset[1]) * k, offset[2] + (to[2] - offset[2]) * k];
    }
    const at = actorToWorldPoint(snap.feet, snap.yaw, offset);
    this.hand.position.set(...at);
    this.hand.rotation.set(0, (snap.yaw * Math.PI) / 180, 0);
  }
}

/** A world point into the actor frame at `feet`, turned by `yawDeg` (the inverse of `actorToWorldPoint`). */
export function worldToActor(feet: readonly number[], yawDeg: number, w: readonly number[]): V3 {
  const r = (yawDeg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const dx = w[0]! - feet[0]!, dz = w[2]! - feet[2]!;
  return [dx * c - dz * s, w[1]! - feet[1]!, dx * s + dz * c];
}

/**
 * The throw's launch in the world, as `CZKit_TickExplosives` (the release) and `FUN_005970b0` (the arc) both work it
 * out: `throwVelocity` from the release point in the actor frame -- the posed `hand` when given, else `GetThrowAnim`'s
 * table point -- turned by the SEAL's yaw.
 */
export function launchOf(
  snap: PlaySnapshot, power: number, aimSin: number, stance: ThrowStance, anim: ThrowAnim, hand: V3 | null,
): { launch: ThrowLaunch; from: V3; velocity: V3 } {
  const local = hand ? worldToActor(snap.feet, snap.yaw, hand) : anim.offset;
  const launch = throwVelocity(power, aimSin, local, maxThrowDistance(stance));
  const from = hand ?? actorToWorldPoint(snap.feet, snap.yaw, anim.offset);
  return { launch, from, velocity: actorToWorldDir(snap.yaw, launch.velocity) };
}

/**
 * PLACEHOLDER (named): the arc's lines are translucent, so they go to the line list `FUN_003373b0` (0x488df8), whose
 * drawing was not traced; the opaque line path beside it (`FUN_00360030`) tests Z (`TEST_1` = 0x5000c), so the list
 * is taken to as well -- the ground hides the arc's part under it.
 */
export const ARC_DEPTH_TEST_PLACEHOLDER = true;

/**
 * The arc's strip: a line segment a pair of points, each end the colour with the segment's alpha (both ends alike, as
 * `FUN_005fff40` sends them), blended, unfogged (the line's `PRIM` 0x49 has no FGE), one pixel wide as a GS line.
 */
function arcStrip(): LineSegments {
  const n = (THROW_ARC.segments + 1) * 2;
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(n * 3), 3));
  geometry.setAttribute('color', new Float32BufferAttribute(new Float32Array(n * 4), 4));
  const line = new LineSegments(geometry, new LineBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, depthTest: ARC_DEPTH_TEST_PLACEHOLDER, fog: false, toneMapped: false,
  }));
  line.name = 'throwArc';
  line.frustumCulled = false;
  line.visible = false;
  return line;
}

function fillStrip(line: LineSegments, points: readonly V3[], alphas: readonly number[], color: V3): void {
  const pos = line.geometry.getAttribute('position') as Float32BufferAttribute;
  const col = line.geometry.getAttribute('color') as Float32BufferAttribute;
  const n = Math.min(alphas.length, pos.count / 2);
  for (let i = 0; i < n; i++) {
    const a = points[i]!, b = points[i + 1]!, w = alphas[i]!;
    pos.setXYZ(2 * i, a[0], a[1], a[2]);
    pos.setXYZ(2 * i + 1, b[0], b[1], b[2]);
    col.setXYZW(2 * i, color[0], color[1], color[2], w);
    col.setXYZW(2 * i + 1, color[0], color[1], color[2], w);
  }
  pos.needsUpdate = true;
  col.needsUpdate = true;
  line.geometry.setDrawRange(0, n * 2);
}

function textureOf(rgba: Rgba): DataTexture {
  const t = new DataTexture(rgba.data, rgba.width, rgba.height, RGBAFormat, UnsignedByteType);
  hdTextures.register(t, rgba);   // OT.R92 (HD-3): inert until the test room's HD pack is set
  t.magFilter = LinearFilter;
  t.minFilter = LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

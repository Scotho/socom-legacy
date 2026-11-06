import { Matrix4, Vector3, type Object3D, type PerspectiveCamera, type Scene } from 'three';
import { ITEM, itemClass, materialTable, SEAL_TUNING, tracerRound, UNITS_PER_METRE, type KitRound, type Side, type WeaponRecord, type WeaponRumble } from '@s2u/scene';
import { Accuracy, defaultFireMode, fireInterval, FIRE_MODE_NAMES, itemReticleOf, kickStarts, kickTicks, lookRates, nextFireMode, perturb, roundsPerPull, type Cone } from './accuracy';
import type { BodyView } from './bodyView';
import type { FlyCamera } from './camera';
import type { EffectData } from './effectData';
import { Effects, type Vec3 } from './effects';
import { cameraAimCap, Fire, reloadEndOfBody, type FireEvent } from './fire';
import { armingGreyOf, KitRounds } from './firearms';
import { rocketRoundOf, type EquipmentSlotState } from './equipment';
import type { Input } from './gamepad';
import { RangeFinder, type Hud, type HudSources } from './hud';
import { Kit, pressShoulder, type Firearm } from './kit';
import type { LensRows } from './lensFx';
import type { LoadedMap } from './loadMap';
import { firearmSlotPresent, heldWeaponModels, initialFirearmSlot, type FirearmSlot, type PlayerLoadout } from './loadout';
import { MarkClipper } from './markClip';
import { pitchStickInView } from './look';
import { fireWeaponOf, type NetPage } from './netPage';
import { setLensRows, setNightVision } from './nightVision';
import type { Play } from './play';
import { aimPoint } from './playerCamera';
import { reloadHoldPeriod } from './reloadClip';
import { reloadPopped, StillReloadLife } from './stillReloadLife';
import type { HeldRef, RemotePlayers } from './remotePlayers';
import {
  handReticleType, Perception, perceptionLook, perceptionMagnification, Reticle, reticleClimbing, reticleShown, reticleTargetState,
  type HudRenderer, type PerceptionLook, type ReticleTarget,
} from './reticle';
import { EYE_HEIGHT } from './mover';
import { FONT_TEXT_01 } from './hudFont';
import { crosshairPick, pickSurfaces } from './net/hostageOrder';
import { lensStep, scopeBitmaps, showScopeNodes, thermalFitted, viewLens, type ViewLens } from './sights';
import { surfaceShade, type SurfaceShade } from './surfaceShade';
import type { WalkMode } from './walk';
import type { WorldView } from './world';
import { heldRefOf } from './matchCore';
import { takeKit as takeRoomKit, type TakeKitDeps } from './takeKit';
import { launcherKitRounds } from './net/pickupRules';
import { eyeBob, fireRefused, reloadRefused, Zoom, type ZoomHold } from './zoom';
import { shortTurn } from './yaw';
import { TICK_HZ } from './net/protocol';
import { TURRET_RETICLE_STANCE_READING } from './net/emplacement';   // AR-6: the one name, headless (the room's too)
import { TURRET_MOUNT_ASK_WINDOW_READING } from './turretPage';
import { lookContextOf } from './net/lookGate';
import { RAISE_TIMES, ZERO_RAISE_TIMES } from './weaponRaise';
import { deathRumble, hurtRumble, padActuator, Rumble, rumbleOutput, ScopePulse, shotRumble } from './rumble';

/**
 * ONE-WIRE (web research 222; ONL-18d's firearm, research 166 §8): the match's firearm, the one both pages mount --
 * `/testroom` (`./main`) and the front end's match (`./matchMount`). The fire (`./fire`), the bloom (`./accuracy`), the
 * view states (`./zoom`), the kit and its swap (`./kit`), the launcher rounds' slots and the fire modes (`./firearms`),
 * the reticle's HUD pass (`./reticle`), the rounds' effects (`./effects`) and the scope's and the goggles' lens. Every
 * round, reload and launch goes to the room only through `NetPage`'s own sends (`fireEvent`, `throwEvent`): the room
 * validates each.
 *
 * What else can be in the hand plugs in (`FirearmHands`: the throwables, the launcher and the R2 inventory of
 * `./matchThrow`, with `/testroom`'s turret asked first), and the sound (`FirearmSound`, `./matchSound`'s); since
 * MATCH-THROW (research 222 §8) both pages mount both, the front end with no turret (`./matchCore`
 * `FRONT_END_CAPABILITIES`). Read no page markup here (OT.R12).
 */

/**
 * `materials.rdr`'s materials by name (the built-ins and SOILS, `@s2u/scene`'s transcription): research 84. A name not
 * in the table reads `UNKNOWN` (PENETRATION 0, no flags), as `surfaceMaterial` takes it (`FUN_002dc1d0`).
 */
const SOIL_TABLE = materialTable();
const SOIL_MATERIAL = new Map(SOIL_TABLE.map((m) => [m.name, m]));
/** The HUD's name for a fire mode (`./hud`: the `firemode.tif` rounds, 1 / 3 / 4 of them). */
const HUD_FIRE_MODE = { 1: 'single', 2: 'burst', 3: 'auto' } as const;
/** The kit's two firearm slots: `rifle` slot 0 (L1), `pistol` slot 1 (L2). */
const SLOT_OF: Readonly<Record<Firearm, FirearmSlot>> = { rifle: 0, pistol: 1 };
/** OT.R59 (RECONNECT-GHOST): the commands' weapon (0 the rifle, 1 the sidearm) as the kit's firearm. */
const FIREARM_OF: Readonly<Record<0 | 1, Firearm>> = { 0: 'rifle', 1: 'pistol' };

/** A magazine as the HUD's weapon box reads it. */
export type BoxMagazine = HudSources['magazine'];

/**
 * What else is in the hand (`./matchThrow`'s: the throwables `./grenade`, the launcher `./rocket`, the R2 inventory
 * `./inventoryMenu`; `/testroom`'s turret `./turretPage` before them): each asked where the firearm's own line meets it.
 */
export interface FirearmHands {
  /** Own planted C4's live fuse share, independent of the current weapon (research 209 §17). */
  c4Fuse?(): { fill: number } | null;
  /** A LAW or RPG-7 raised (`RocketLauncher.up`). */
  launcherUp(): boolean;
  /**
   * ARMING-GREY (issue #300): the raised launcher's id (`RocketLauncher.held`), for the selected record the reticle's
   * colour pass tests (`armingRecord`). Absent or null: none known, no grey.
   */
  launcher?(): number | null;
  /** The launcher's round's icon for the fire-mode cell (`firemode_AT4.tif`, `FUN_00237b40`). */
  launcherRoundIcon(): string | null;
  /** A throwable, a charge or the Detonator up (`GrenadeThrower.equipped`). */
  itemUp(): boolean;
  /** A throw held or thrown: no swap (`FUN_005a8cb0`'s gate). */
  busy(): boolean;
  /** The slot usable and within the count (`inventoryKit().takeable`, `FUN_00594cf0`'s fourth test). */
  takeable(slot: number): boolean;
  /** A shoulder press taking a firearm: what is up put away first (`./kit` `pressShoulder`). */
  putAway(): void;
  /** A spawn's kit made (`spawnKit`): the equipment slots and the inventory's shoulders, with the kit's round slots. */
  spawned(rounds: KitRounds): void;
  /**
   * NU-5 L1: a rocket launcher claimed into the live kit (`takeKit`'s `launcherTaken`): the launcher's slots read again
   * from the kit and its round slots (`RocketLauncher.setKit`), nothing refilled (`./matchThrow`'s). Absent: the page's
   * launcher keeps the kit it had.
   */
  kitTaken?(rounds: KitRounds): void;
  /**
   * OT.R59 (RECONNECT-GHOST): a resumed seat's pouch and launcher as the room holds them (`takeKit`'s `resumed`), laid by
   * the throwables (`./matchThrow`). Absent: the page keeps its own.
   */
  resumed?(r: { pouch: Readonly<Record<string, number>>; equipmentSlots?: readonly EquipmentSlotState[]; held: number | null; weapon?: 0 | 1 }): void;
  /** The trigger pressed or let go, before the firearm's: true when another owner took it (the turret, the launcher, a throwable). */
  trigger(down: boolean): boolean;
  /** A round mode's round leaving (M4): flown on the page (`GrenadeThrower.launchRound`) and its zAnim heard. */
  launched(record: KitRound['record'], from: [number, number, number], velocity: [number, number, number]): void;
  /**
   * A script round's camera blast point (`./effects` `Effects.setBlastPoint`; `FUN_003c8330` D:L319186-319195: the
   * planted bomb's MPBOMB, research 332 section 7): the throwables shake the camera by the distance (`./matchThrow`
   * `blastPointShake`). Absent: no shake.
   */
  blast?(at: Vec3): void;
  /** The HUD weapon box's icon while an item is up (the launcher's, the throwable's), or null for the firearm's. */
  icon(): string | null;
  /** The box's count while something else is in the hand (the turret's, the launcher's, a throwable's), or null. */
  magazine(): BoxMagazine | null;
  /** Mounted on a turret: the firearm is still (no round, no drain, no reload). */
  mounted(): boolean;
  /**
   * TURRET-AMMO (issue #284, research 215 s8): R, asked first at every press (`FireSource.reloadTaken`): true when another
   * owner of the hand took it -- mounted, the turret's reload sent (`./turretPage` `TurretPage.reload`). Absent, the rifle's.
   */
  reload?(): boolean;
  /** PAR-55 (research 215 s8): mounted, the fire-mode row's mode -- the turret's slot's own -- or null for the firearm's. */
  fireMode?(): number | null;
  /** PAR-56: mounted, the turret's weapon's item id (the slot in the hand), or null. */
  weapon?(): number | null;
  /** LATER 97: mounted, the turret's `THERMAL` (`./zoom` `ZoomMount`); absent or not mounted, false. */
  thermal?(): boolean;
  /** LATER 165: mounted, the held turret's placement id (`TurretPlacement.id`); absent or not mounted, null. */
  turret?(): number | null;
  /** LATER 237: this page's own mount on the room's count (`TurretPage.mountTaken`: `after`, `now`); absent or none, null. */
  mountTaken?(): { after: number; now: number } | null;
  /** LATER 237: the last command this page sent (its `lastSeq`); absent or offline, null. */
  commandSeq?(): number | null;
  /** NU-2: the item in the hand's `ID` -- a throwable, a charge, the Detonator -- or null (`FUN_005be300` asks it). */
  handItem?(): number | null;
  /** NU-2: the throw's power the meter is laid at (`./reticle` `meterPower`: 0 with none left), 0 with nothing up. */
  throwPower?(): number;
}

/**
 * PAR-56: `FUN_005bc300` (D:L473775-473806): the fire-mode row is hidden for the hand's item of the classes
 * (`FUN_003d1a60`, `@s2u/scene` `itemClass`) 121 grenade, 151 explosive, 190 gear, 201 armour and 230 -- the
 * MGL FRAG TURRET's (D:L473799-473803) -- and shown for every other, PKM's and LMG's turret class 205 among them.
 */
export function fireModeRowShown(id: number): boolean {
  return !['grenade', 'explosive', 'gear', 'armour', 'turret2'].includes(itemClass(id));
}

/** The sound the firearm makes (`./matchSound`'s, both pages' since MATCH-SOUND: research 222 §7). */
export interface FirearmSound {
  /** Each round and reload (`WalkSounds.fireEvent`). */
  fireEvent(e: FireEvent): void;
  /** The effects' sound door (`Effects`' second argument). */
  effect(name: string, at: [number, number, number], volume: number): void;
  /** The goggles on or off while walking (`.NV_GOGGLES_ON` / `_OFF`). */
  goggles(on: boolean): void;
  /** Another player's round, with its effects (`GameAudio.onFire`). */
  roundFired(e: Extract<FireEvent, { type: 'round' }>): void;
  /**
   * LATER 644: another player's round's path, `from` to `to`, against the page's feet `actor` (`GameAudio.onRoundPast`:
   * `.BUL_PASSING` at its nearest point within 20, `FUN_00598000`). Absent, no passing sound.
   */
  roundPast?(from: readonly [number, number, number], to: readonly [number, number, number], actor: readonly [number, number, number]): void;
}

export interface MatchFirearmDeps {
  scene: Scene;
  fly: FlyCamera;
  walk: WalkMode;
  play: Play;
  /**
   * The others: a body under the reticle is the aim point (INT-NET-2); another's round's muzzle. NU-3b C4: the bodies the
   * eye's pick ray meets, a player's side and feet -- the reticle's target (`FUN_005aa690`); absent, no target.
   */
  remote: Pick<RemotePlayers, 'aimDistance' | 'weaponFrame'> & Partial<Pick<RemotePlayers, 'aimBodies' | 'teamOf' | 'feet'>>;
  hud: Hud;
  loadouts: PlayerLoadout;
  view(): WorldView | null;
  map(): LoadedMap | null;
  body(): BodyView | null;
  net(): NetPage | null;
  /** The game's input held (the loading screen's hold, `/testroom`'s open ARMORY or WEAPON EXCHANGE): no trigger pressed. */
  blocked(): boolean;
  /** The fog again, with the goggles' lens over it or not. */
  refreshFog(lens: readonly number[] | null): void;
  /** A spawn takes the room's kit (protocol 7); absent, always (the front end's match is a room's). */
  network?(): boolean;
  /** What else is in the hand (`./matchThrow` `MatchThrowables.hands`); absent, nothing. */
  hands?: FirearmHands;
  /** The sound (`./matchSound` `MatchSound.firearm`); absent, none. */
  sound?: FirearmSound;
  /**
   * MAP-10b (`./turretPage` `muzzleOf`): the firepoint frame (three's column-major order) of the turret a body holds, or
   * null: another's round from a turret is flashed there, not on the rifle in its hand. Absent: none holds one.
   */
  mountedMuzzle?(id: number): ArrayLike<number> | null;
  /** CTL-2: VIBRATION (`DAT_00650698`) as the START menu and the card leave it, asked each frame; absent, off. */
  vibration?(): boolean;
  /** CTL-2 (`RUMBLE_MENU_STOP_READING`): the START menu open now, asked each frame (never at the mount); absent, never. */
  menuOpen?(): boolean;
  /**
   * A browser adaptation (`./effects` `MAX_EFFECT_RUNS_ADAPTATION`): the page's visibility. Hidden, another player's
   * rounds start no effect run (their report and passing sound still play); the return to visible retires the rounds'
   * runs. Absent: the page's `document` (none: always visible).
   */
  visibility?: PageVisibility;
}

/** What `MatchFirearmDeps.visibility` reads of a `Document` (a browser adaptation). */
export interface PageVisibility {
  readonly hidden: boolean;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

export interface MatchFirearm {
  readonly fire: Fire;
  readonly kit: Kit;
  readonly zoom: Zoom;
  readonly accuracy: Accuracy;
  readonly reticle: Reticle;
  readonly effects: Effects;
  readonly rangeFinder: RangeFinder;
  /** The trigger, pressed or let go: nothing while held or dead; another owner's first (`FirearmHands.trigger`). */
  trigger(down: boolean): void;
  /** The zoom's steps (walking, alive): `in` d-pad Up, `out` d-pad Down, `cycle` the right button. */
  stepZoom(how: 'in' | 'out' | 'cycle'): number;
  /** A view state, the way the game's own changes go (the knock cleared leaving the scope, `FUN_005b9020`). */
  setZoom(state: number): void;
  /** The fire-mode switch (`FUN_005c4600`; L3); its name. */
  switchFireMode(): string;
  /** The fire mode on the HUD and the fire's round slot. */
  showFireMode(): void;
  /** The fire mode in the hand. */
  fireMode(): number;
  /** NU-5 L1: the kit's slots with their round rings' counts (`KitRounds.held`), for the world drops' launcher test. */
  heldRounds(): readonly { slot: number; id: number; rounds: number }[];
  /** The fire mode's name (`FIRE_MODE_NAMES`). */
  fireModeName(): string;
  /** The page's half of `FUN_005a8cb0`: walking, not reloading, no throw held or thrown. */
  kitFree(): boolean;
  /** `FUN_00594cf0`'s four tests for a shoulder press on `slot` (research 201 §1). */
  shoulderGate(slot: number): boolean;
  /** L1 / L2 on a firearm: the press gated whole first, what is up put away, the firearm taken. */
  selectFirearm(to: Firearm): boolean;
  /** The firearm in the hand (`m_item`). */
  item(): Firearm;
  /** The two firearm slots' records on the body. */
  records(): readonly [WeaponRecord, WeaponRecord];
  /** A firearm's record (`rifle` slot 0, `pistol` slot 1). */
  record(item: Firearm): WeaponRecord;
  /** A firearm's HUD icon (`IconTextureName`, research 94 §C9). */
  icon(item: Firearm): string;
  /** The held models on the body. */
  heldKit(): { rifle: HeldRef | null; pistol: HeldRef | null };
  /** The map camera's vertical FOV, degrees. */
  baseFov(): number;
  /** The lens on the lit colours (`./sights` `ViewLens`). */
  lens(): ViewLens;
  /** `padFrame` under the hold: the trigger let go. */
  held(): void;
  /** R1, the trigger, off the merged lanes' change. */
  triggerLane(before: Input, after: Input): void;
  /** The view's walk lines (`playLanes`): the scope's view from the head, its slow move, the binoculars. */
  viewLanes(walking: boolean): void;
  /** The frame, in its order: the bob before the camera steps ... */
  beforeMove(): void;
  /** ... after the walk: the view tick, the bloom, the zoom and its FOV, the lens (`gunFrame`) ... */
  gunFrame(dt: number, walking: boolean): void;
  /** ... the swap's hand-off and its mounts ... */
  kitFrame(dt: number, walking: boolean): void;
  /** ... before the net's frame: the dead fire nothing (`FUN_00592560`) ... */
  beforeNet(): void;
  /** ... the fire's rate, reload and held rounds (none mounted on a turret, nor off the walk; the tracer's frame always) ... */
  fireFrame(dt: number, walking: boolean): void;
  /** ... the effects' runs, casings and particles ... */
  effectsFrame(dt: number, camera: PerspectiveCamera): void;
  /** ... after the world's draw: the reticle placed, sized and coloured ... */
  aimReticle(dt: number): void;
  /** ... shown or not (`reticleShown`; PAR-94 B2: `spawned`, the page's own spawn heard this match) and drawn ... */
  showReticle(renderer: HudRenderer, walking: boolean, tacMap: boolean, scoreboard: boolean, spawned: boolean): void;
  /** ... and the HUD's weapon box and readouts (`extra`: what the page's other parts add, the climb and the action's prompt). */
  feedHud(walking: boolean, extra?: Pick<HudSources, 'climb' | 'nearby'>): void;
  /** A map: the old marks and effects gone, the full magazines, the new map's bitmaps. */
  clearMap(map: LoadedMap): void;
  /** The map's world built: the marks' shade and clip (returned, for the page's other markers: the scorches). */
  setWorld(built: WorldView): { shade: SurfaceShade; clipper: MarkClipper };
  /** The map's view: its FOV, the view states and the bloom reset, the night. */
  setView(map: LoadedMap): void;
  /** The map's effect data: the runs, the scope lenses' rows, the marks by material, the penetration. */
  setEffects(data: EffectData | null): void;
  /** The loadout's two firearms hung on the body (`force`: a new body). */
  hangKit(force?: boolean): void;
  /** A spawn's kit (`FUN_00599b60` -> `FUN_00599f00`, research 91 §4.3, R94.3). */
  spawnKit(side: Side, given?: readonly number[] | null, type?: number | null): void;
  /**
   * PF-34 (`./takeKit`, research 234 s4, s6): the room's `kit` after a pickup -- the live kit, the rings from the room's,
   * no fill; a page that mounts the world drops hands it as its `kitChanged` (`./matchNet` `PART_DEPS`).
   */
  takeKit(loadout: readonly number[], slot: FirearmSlot | null, rounds: [number[], number[]], filled?: [number[], number[]],
    resumed?: { pouch: Readonly<Record<string, number>>; equipmentSlots?: readonly EquipmentSlotState[]; held: number | null; weapon?: 0 | 1 }): void;
  /** `NetPageDeps`: the page's own death (MATCH-04), another's round, the own round's room hit. */
  died(): void;
  /** j5t3o2iU: the page's own body hurt and alive (`NetPageDeps.ownHurt`): `FUN_00597b00`'s motors (`./rumble` `hurtRumble`). */
  hurt(): void;
  /**
   * CTL-2: a fire step of the hands' (`FUN_005c5340`'s end, `FUN_005c3360` D:L477739-477751) -- a throw's release, a
   * charge's placing, a rocket's launch (`./matchThrow`) -- with the fired record's `Rumble_Modifiers`.
   */
  shotRumble(rumble: WeaponRumble | undefined): void;
  roundEffects: NonNullable<import('./netPage').NetPageDeps['roundEffects']>;
  roundImpact: NonNullable<import('./netPage').NetPageDeps['roundImpact']>;
  /**
   * MAP-10b (research 215 s7): this page's own round from the turret it holds, drawn as its firearm's are -- the round's
   * path and marks and the tracer (`Fire.drawRound`, the tracer's rule on the turret's weapon id and `count`), the
   * record's muzzle effect on the firepoint's frame (`frame`, TURRET_MUZZLE_NODE_READING), the impact where it stopped,
   * and its report at the muzzle (`FirearmSound.fireEvent`). The room fires it from the claim; nothing here is sent.
   */
  turretRound(record: WeaponRecord, from: [number, number, number], dir: [number, number, number], frame: ArrayLike<number> | null, count: number): void;
  /**
   * TURRET-CONE P2 (research 215 s8.2): the cone a mounted round rolls on (`TurretPage.setSpread`) -- the kit's cone on the
   * turret slot's record (`FUN_005bd100` D:L474214-474271, the view under 4 mounted; the bloom `gunFrame` runs at
   * `TURRET_RETICLE_STANCE_READING`'s row), as it stands: asked before `turretRound` it is the cone before that round's
   * bloom, as the original rolls at `+0x74` (D:L475601) before the round's step (D:L475604). Not mounted: the hand's cone.
   */
  turretCone(): Cone;
  /** Everything the firearm made let go (a front end's match is mounted and let go per game). */
  dispose(): void;
}

export function mountFirearm(d: MatchFirearmDeps): MatchFirearm {
  const { scene, fly, walk, play, remote, hud, loadouts, hands, sound } = d;
  /**
   * OBF-31 (`./matchSound` `ROUND_SCREENS_STOP_ALL_READING`): a round screen up -- MPExitState alone is ticked
   * (`FUN_002ce9e0` D:L171877-171888, `FUN_00223680` D:L75899-75958), so the page's trigger and reload are not: no press
   * taken, a held one let go, no round, no reload begun or landed. The engine's 3 s before it unchanged.
   */
  const screens = (): boolean => d.net()?.screenUp?.() ?? false;   // no NetPage (offline), never
  /** The two firearm slots' records on the body, 2X applied: `rifle` slot 0 (L1), `pistol` slot 1 (L2). */
  let kitRecs = loadouts.records();
  // NET-LOOK's review (finding 1): the page's look gate on the room's context, the held weapon's record (`lookContextOf`).
  walk.setLookContext?.((w) => lookContextOf(kitRecs[w]));
  let kitItem: Firearm = 'rifle';
  const kitRecord = (item: Firearm) => kitRecs[SLOT_OF[item]];
  /** The HUD weapon box's icon for a firearm: its record's `IconTextureName` (research 94 §C9). */
  const kitIcon = (item: Firearm): string => loadouts.icon(SLOT_OF[item]) ?? '';
  /**
   * W2.5 (`./fire`): the hitscan round of the firearm in the hand from the walk's eye along its aim, onto the hull the
   * mover stands on, a mark where it lands.
   */
  const fire: Fire = new Fire({
    grid: () => walk.grid(), aim: () => walk.fireAim(), tickAim: (at) => walk.tickAim(at),   // LATER 338
    roundSeq: (own) => d.net()?.roundSeq(own) ?? null,                      // LATER 587's second fold: the room's gate, mirrored
    startBody: () => walk.startBody?.() ?? null,                              // LATER 366 (OT.R80): the room's start lines
    muzzle: () => play.muzzle(), reloadSeconds:(family, reloadTime) => play.reloadSeconds(family ?? null, reloadTime ?? 0),   // WEAPON: the rifle in hand (`./play`)
    targetDistance: (eye, ray, reach) => remote.aimDistance(eye, ray, reach),   // INT-NET-2: a body under the reticle is the aim point
    // P12 (SW-2): every body on the round's line, each a surface the round goes on past (`./fire` `BODY_PENETRATION`).
    ...(remote.aimBodies ? { bodyDistances: (from: Vec3, ray: Vec3, reach: number) => remote.aimBodies!(from, ray, reach).map((b) => b.distance) } : {}),
    // AD-1 (research 232 section 8): the eye's aim ray's cap, the camera's +0xec -- the map's MID with the view's extension.
    aimCap: () => cameraAimCap(d.map()?.camera?.mid, zoom.renderView().farExtra),
    launchPoint: () => play.launchPoint(),                                    // M4: a round mode's `firepoint_203`
    look: () => (walk.mode() === 'walk' ? { pitch: (fly.pose().pitch * Math.PI) / 180, stance: walk.posture(), pitchPush: fly.pitchPush() } : null),
    kickPitch: (radians) => fly.addPitch(radians),                             // WEAPON: the kick (`./rifleKick`)
    // WEAPON: no round mid-swap (`./kit`), and nothing for the dead -- the dead's controller reads the respawn press
    // alone (FUN_00592560 L451644), so R is refused as the pad's R3 and the touch reload are. OBF-31: nor under the round
    // screens (`screens`): no round (`tryFire`), no reload begun or landed (`reload`, `beginReload`).
    ready: (): boolean => !kit.swapping() && !walk.isDead() && !screens() && firearmSlotPresent(loadouts.loadout(), SLOT_OF[kit.item()]),
    airborne: (): boolean => walk.mover()?.airborne ?? false,                  // WEAPON: no reload begins in the air
    // The binoculars (view state 4): no round leaves (FUN_005be9a0 475305) and no reload begins (FUN_005c2a90 477410).
    // PF-17 (research 218 §1.5): nor while the clip on top of the stack holds `NoFire` -- the room's 'nofire' gate. The
    // round's gate only (FUN_005a7de0): a reload under NoFire is taken, as the room takes it (`ready` is the reload's too).
    fireRefused: (): boolean => fireRefused(zoom.state()) || !walk.fireAllowed(),
    // LATER 180 (research 215 s8.3): no bullet-class round until the body's rifle reads fully up (`FUN_005c0ae0`
    // D:L476423-476438; `RAISE_ENVELOPE_STEP_READING`). Mounted the turret takes the trigger (`TurretTrigger`'s latch).
    raiseRefused: (): boolean => play.weaponStats().raise.weight < 1,
    inHand: (): boolean => !hands?.itemUp() && !hands?.launcherUp(),   // LATER 179's review (F1): the dry branch reads the hand's item (D:L476574-476590)
    reloadRefused: (): boolean => reloadRefused(zoom.state()),
    reloadTaken: (): boolean => hands?.reload?.() ?? false,                  // TURRET-AMMO: mounted, R is the turret's (every binding's)
    // PF-18 (research 218 §2): no reload in the page's own flinch; PF-19 (218 §3): nor inside `Prone cover`.
    flinching: (): boolean => walk.flinching() || walk.knockCovered(),
    climbHolds: (): boolean => walk.climbHolds(),                             // NU-1b B5: no reload begins under a climb (D:L477404)
    reloadCut: () => play.takeReloadCut(),                                    // PF-18 (218 §2.2): the lock ends at the clip's cut
    attachToNode: (path, mark) => d.view()?.attachToNode(path, mark) ?? null,  // EFFECTS: a mark rides a door's leaf
    holdOnNode: (path, gone) => d.view()?.holdOnNode(path, gone) ?? null,       // LATER 277: and goes with a node switched off
  }, kitRecs[0]);                   // the primary the kit holds: its rate, its muzzle effect, its sounds
  scene.add(fire.object);
  walk.setReloadLock((cmd) => fire.reloadLocked(cmd));                              // NU-1b B1: the climb's offer asks FUN_005a7ab0
  /**
   * Research 84 (`./accuracy`, `./zoom`): the gunplay of the firearm in the hand -- its reticle's bloom and climb, where
   * each round goes inside it, its fire modes, and the view states the scope steps through -- each the record's own.
   */
  const accuracy = new Accuracy(kitRecs[0]);
  // CTL-2 (research 302 §10): the pad's two motors (`./rumble`) -- the shot's, the death's and the scope's pulse -- and their
  // output to the Gamepad (RUMBLE_OUTPUT_ADAPTATION), never while VIBRATION is OFF.
  // The toggle is asked by each setter as it runs (`DAT_00650698`), never here: both pages make the START menu after this.
  const rumble = new Rumble(() => d.vibration?.() ?? false), pulse = new ScopePulse(), rumbleOut = rumbleOutput();
  let menuWasOpen = false;
  const zoom = new Zoom(kitRecs[0]);
  /** M4 (`./firearms`): the kit's launcher-round slots and their counts; a carrier's modes run on into them (R94.8). */
  let kitRounds = new KitRounds(loadouts.tables(), loadouts.loadout());
  let fireMode = defaultFireMode(kitRecs[0], kitRounds.held());
  /** The map camera's vertical FOV in degrees; the zoom divides its tangent. */
  let baseFov = 49;
  fire.setGun({
    trigger: () => accuracy.trigger(),
    roundsPerPull: () => roundsPerPull(fireMode),
    interval: (fireWait) => fireInterval(fireWait, fireMode),
    round: (dir) => {
      // The round goes by the cone as the frame left it (FUN_005bd100 runs before the shot), then counts.
      const out = perturb(dir, accuracy.cone(zoom.state(), zoom.magnification()));
      // The round's row is the body in use, FUN_0058a720(body, 1) (477722): a crouch run knocks the stand row's.
      const stance = walk.posture();
      if (accuracy.round(zoom.state(), stance).dropZoom) dropScope();  // FUN_005c5340: back to first person, the knock kept
      // FUN_005c3360 D:L477739-477751: the fired record's motors -- in a round mode the round's (FUN_005c6600 moves the slot
      // to the round's, as `armingRecord` reads it: the M203 HE, not the rifle; the review's F1), else the rifle's.
      const mode = fire.roundMode();
      shotRumble(rumble, mode === null ? slotRecord().rumble : kitRounds.round(mode.id)?.record.rumble);
      return out;
    },
    // Research 84 section 8: the camera kicks only scoped, on a pull's first round, and the kick ticks only scoped.
    kickStarts: () => kickStarts(zoom.state(), accuracy.rounds()),
    kickTicks: () => kickTicks(zoom.state()),
  });
  /** PAR-55: the HUD's fire-mode row shows another owner's mode (the turret's) until it lets the hand go. */
  let heldMode = false;
  const showFireMode = (): void => {
    const m = HUD_FIRE_MODE[fireMode as 1 | 2 | 3];
    if (m) hud.setFireMode(m);
    if (hands?.launcherUp()) { hud.setFireModeIcon(hands.launcherRoundIcon()); return; }   // M7: the launcher's round (firemode_AT4.tif)
    // M4: a round mode (> 3) redirects the fire to the round's slot (`FUN_005c6600`) and shows its icon (`FUN_00237b40`).
    const round = fireMode > 3 && kitItem === 'rifle' ? kitRounds.round(fireMode) : null;
    const ring = round ? kitRounds.ring(fireMode) : null;
    fire.setRound(round && ring ? { id: fireMode, round, ring } : null);
    hud.setFireModeIcon(round && ring ? round.icon : null);
  };
  /** The fire-mode switch (`FUN_005c4600`; L3): not while scoped, nor while an item or a launcher is up (one mode). */
  const switchFireMode = (): string => {
    // PAR-56: mounted, the slot in the hand (`+0x824`, FUN_005c4b10 D:L478842) is the turret's, and FUN_005c4600 steps
    // its mode (D:L478569-478579) -- its one mode (research 215 s8): the rifle's mode, round and zoom hold stay.
    if (hands?.mounted()) return FIRE_MODE_NAMES[hands.fireMode?.() ?? fireMode] ?? String(fireMode);
    if (!hands?.itemUp() && !hands?.launcherUp()) fireMode = nextFireMode(fire.weaponRecord(), fireMode, zoom.target() > 1.01, kitItem === 'rifle' ? kitRounds.held() : []);
    // FUN_00216770 70387-70389: a launcher-round mode past first person (the night vision) drops to first person.
    if (zoomHold() === 'round' && zoom.state() > 1) setZoom(1);
    zoom.setHold(zoomHold());
    showFireMode();
    return FIRE_MODE_NAMES[fireMode] ?? String(fireMode);
  };
  /**
   * What is in the hand for the zoom (`./zoom` `ZoomHold`, `FUN_005445b0`'s state-1 gates): a raised LAW / RPG-7, an item
   * (a throwable, a charge, the Detonator), the firearm in a launcher-round mode (> 3), else the firearm itself. The
   * firearm is the slot `+0x824` names -- a swap's target from its press (`FUN_005c4b10` D:L478842; `FUN_005445b0` reads
   * through `FUN_005c3780`), with that slot's own fire mode -- not `m_item`, which a swap to the rifle moves at its end.
   */
  const zoomHold = (): ZoomHold => {
    // LATER 97: mounted, the selected slot is the turret's, in its own mode -- no carrier, so no round mode
    // (`FUN_005bd7e0` D:L474373 on `+0x824`, `FUN_003c5d80`) and no drop by `FUN_00216770` (D:L70387-70389).
    if (hands?.mounted()) return 'firearm';
    if (hands?.launcherUp()) return 'launcher';
    if (hands?.itemUp()) return 'item';
    const slot = kit.state().swap?.to ?? kitItem;
    const mode = slot === kitItem ? fireMode : fireModes[slot];
    return mode > 3 && slot === 'rifle' ? 'round' : 'firearm';
  };
  /**
   * LATER 233: the second round's drop from a scope (`FUN_005c5340` D:L479399-479404: a view over 4 and the pull's round
   * count `+0x818` at 2 or more -> `FUN_005448a0(camera, 1)`) is the set alone: no `FUN_005b9020` (`kit+0x20/+0x24`), whose
   * only callers are d-pad Down's (D:L410660, D:L410682). The knock carried into the scope stays, as at the mount (LATER
   * 168). Was: `setZoom(1)`, which cleared it (`leaveScope`).
   */
  const dropScope = (): void => {
    const before = zoom.state();
    zoom.set(1);
    accuracy.enterView(before, zoom.state());
  };
  const setZoom = (state: number): void => {
    const before = zoom.state();
    zoom.set(state);
    if (before >= 4 && zoom.state() < 4) accuracy.leaveScope();
    accuracy.enterView(before, zoom.state());                   // FUN_005b9180: the scope's +0.5 exertion
  };
  /**
   * LATER 97 (`./zoom` `Zoom.setMount`): the turret held told to the zoom -- the mount's view (1, or 2 on a THERMAL
   * turret, from a head view: `FUN_005463c0` D:L412247-412255) and the release's (2 -> 1: `FUN_00545ee0`
   * D:L412018-412019) -- with the view's effects as the set's own. Before a step and each frame.
   * LATER 168 (research 84 X10, O5, O6): the knock is left as it is -- the set `FUN_005448a0` (D:L410927-411019) and the
   * mount `FUN_005463c0` (D:L412247-412255) call no `FUN_005b9020` (`kit+0x20/+0x24`); only d-pad Down's 4 or 5 -> 1 does
   * (`FUN_00544400` D:L410660, D:L410682). So a scoped player who mounts carries the knock onto the turret's view, where it
   * returns at the turret record's `ReticuleKnockReturn` (`SWAP_KNOCK_READING`). Was: `leaveScope` here, as `setZoom`'s.
   */
  const syncMount = (): void => {
    const before = zoom.setMount(hands?.mounted() ? { thermal: hands.thermal?.() ?? false } : null);
    // LATER 237 (the review's finding 1): the take heard re-derives whatever the view -- a mount from first or third
    // person leaves the set as it is (`Zoom.setMount` returns null) -- once a K (`rederivedAt`).
    if (hands?.mounted()) rederiveKnock();
    if (before === null) return;
    accuracy.enterView(before, zoom.state());
  };
  const stepZoom = (how: 'in' | 'out' | 'cycle'): number => {
    // The dead do not zoom [reading: death sets 0 (`FUN_00547af0`); whether the d-pad reaches `FUN_005445b0` while dead
    // was not traced -- the dead fire nothing either, `FUN_00592560`].
    if (walk.mode() !== 'walk' || walk.isDead()) return zoom.state();
    syncMount();
    zoom.setHold(zoomHold());
    const before = zoom.state();
    // LATER 97 (research 215 s8.2, TURRET-CONE's review F2): mounted, `FUN_005445b0` steps 0 to 1, or 2 on a THERMAL
    // turret (Z2), and holds 1 and 2 (Z3, Z11); Down takes either to 0 (O2, O3); the cycle's unchanged step drops to 0
    // (`Zoom.cycle`). No view of 4 or above, no Scope sent.
    if (how === 'in') zoom.zoomIn(); else if (how === 'out') zoom.zoomOut(); else zoom.cycle();
    // LATER 236 (the back-dated mount's adaptation, LATER 124/96 -- page = room, not the console): d-pad Down's clear
    // (`FUN_005b9020`, D:L410660, D:L410682) runs at once. The command this frame sends carries no Scope -- the lanes run
    // before the walk builds it (`matchLanes.ts` `viewLanes`, `walk.ts` `send`) -- so the room clears on that same command,
    // and its ring entry is the cleared knock the take's re-derive reads when it is K (LATER 237). Was: Option A's clear at
    // the end of the frame's `gunFrame`, fitted to a hand-built stream that put the Scope bit a command late.
    if (before >= 4 && zoom.state() < 4) accuracy.leaveScope();
    accuracy.enterView(before, zoom.state());
    return zoom.state();
  };
  /** LATER 237: this page's knock at the command each frame ran (`commandSeq`), the last `KNOCK_RING` -- read at a take. */
  const knockAt: { seq: number; off: [number, number] }[] = [];
  /**
   * LATER 237 (the review's finding 4): the ring spans the ask's window (`TURRET_MOUNT_ASK_WINDOW_READING`, the last ask +
   * 2 s) in commands, and half a second more: a take heard later than that finds no entry at K and re-derives nothing.
   */
  const KNOCK_RING = Math.ceil(TURRET_MOUNT_ASK_WINDOW_READING * TICK_HZ) + TICK_HZ / 2;
  const recordKnock = (): void => {
    const seq = hands?.commandSeq?.() ?? null;
    if (seq === null) return;
    const off = accuracy.state().offset, last = knockAt[knockAt.length - 1];
    if (last?.seq === seq) { last.off = [off[0], off[1]]; return; }
    knockAt.push({ seq, off: [off[0], off[1]] });
    if (knockAt.length > KNOCK_RING) knockAt.shift();
  };
  /** LATER 237: the room's mount command the knock was last re-derived from (one take, once). */
  let rederivedAt: number | null = null;
  /**
   * LATER 237 (research 84 X10): the take heard -- the knock re-derived from the room's mount command K (`mountTaken().after`,
   * the broadcast's `steer.after`: `room.ts` `resolveMounts` takes the mount once its command has run). The room ran this
   * page's commands above K mounted, the turret record's return each (`FUN_005c2670` D:L477300-477320: each axis toward 0 by
   * `ReticuleKnockReturn x dt`, the 'stand' row, `TURRET_RETICLE_STANCE_READING`); this page walked them on the rifle's. So:
   * this page's knock at K (the ring's entry at K or the nearest below -- a frame runs whole commands), returned over the
   * commands since up to the one before this frame's (`now - 1`: `lastSeq` in the frame is its own command, whose return the
   * frame's `accuracy.update` runs, as `mountFireRefused` counts `lastSeq - after`). The rifle's return and any round this page
   * ran meanwhile (the room's mount clip refused them) drop out. No `after` (a room without the clips): nothing, as before.
   * A1 (research 215 s8.6 "A1"; the controller's call 3): a worded take returns no `mountTaken` (`TurretPage`: the room ran
   * the commands below M on foot, as this page did, so there is no back-dated stretch), and nothing is re-derived. It
   * remains the fallback for a back-dated take: an older room's, or an older page's ask (retired with it, LATER 303).
   */
  const rederiveKnock = (): void => {
    const taken = hands?.mountTaken?.() ?? null, rec = mountedRecord();
    if (!taken || !rec || rederivedAt === taken.after) return;
    let at: { seq: number; off: [number, number] } | undefined;
    for (const k of knockAt) if (k.seq <= taken.after) at = k;
    if (!at) return;
    rederivedAt = taken.after;
    const back = rec.stances[TURRET_RETICLE_STANCE_READING].knockReturn * Math.max(0, taken.now - 1 - taken.after) / TICK_HZ;
    const toward = (v: number): number => (v > 0 ? Math.max(0, v - back) : Math.min(0, v + back));
    accuracy.load({ ...accuracy.save(), offX: toward(at.off[0]), offY: toward(at.off[1]) });
  };
  /** LATER 165: the scene paths `cutTurretParts` last took out of the draw. */
  let cut: readonly string[] = [];
  /**
   * LATER 165: in view state 2 -- a THERMAL turret's -- the held turret's parts are not drawn on this page: the set into 2
   * at the mount (`FUN_005463c0` D:L412253) and by d-pad Up (`FUN_005445b0` D:L410785, D:L410850) runs `FUN_003aa020(turret,
   * 0)` (D:L300960-300993), the opacity +0x9c at 0 on its `PARTS` nodes (+0x280, +0x284, +0x288: turret, gun, firepoint),
   * +0x28c and its `scope` / `thermal_scope` nodes (+0x290, +0x294); the draw walk multiplies it down each subtree and draws
   * no visual at or under 1/128 (`FUN_003374c0` D:L235418-235437; research 182 s2.23). Outside 2 the run puts 1.0 back each
   * frame while the camera's body holds a THERMAL turret (`FUN_001f0750` D:L52887-52891 -> `FUN_00543200`
   * D:L409997-410036), the release at once (`FUN_00545ee0` D:L412021). Only this console's turret object is written: the
   * others' pages draw it. Each frame, as the restore runs. The part paths are taken; that the `thermal_scope` node lies
   * beneath them on every THERMAL placement is not yet held by a dev-disc case (named in research 215 s8.2, LATER 165).
   */
  const cutTurretParts = (): void => {
    const id = zoom.state() === 2 && hands?.mounted() ? hands.turret?.() ?? null : null;
    const place = id === null ? undefined : d.map()?.turrets?.find((t) => t.id === id);
    const want = place ? [place.parts.turret, place.parts.gun, place.parts.firepoint] : [];
    if (want.join('\n') === cut.join('\n')) return;
    const view = d.view();
    for (const path of cut) view?.setNodeCut(path, false);
    for (const path of want) view?.setNodeCut(path, true);
    cut = want;
  };
  /** Each firearm's fire mode, kept while the other is in the hand (`defaultFireMode`: automatic where it has it, OT.R100). */
  const fireModes: Record<Firearm, number> = { rifle: defaultFireMode(kitRecs[0], kitRounds.held()), pistol: defaultFireMode(kitRecs[1]) };
  /** The walk's tick count the zoom last marked its tick at (`Zoom.markTick`). */
  let zoomTicks = -1;
  /** The page's half of `FUN_005a8cb0`: walking, not reloading, not while a throw is held or thrown. */
  const kitFree = (): boolean => walk.mode() === 'walk' && !fire.state().magazine.reloading && !(hands?.busy() ?? false);
  /**
   * NU-3a's fold F1: the selected slot `+0x824` -- a swap's target from its press (`FUN_005c4b10` D:L478842), else the firearm
   * in the hand -- whose record the kit's tick runs (`FUN_005c2670` D:L477280) and whose set the reticle asks (`FUN_005be300`
   * via `FUN_005c67d0`, D:L478908). Not `m_item`, which a swap to the rifle moves only at its clip's end (`./kit` `finish`).
   */
  const slotRecord = (): WeaponRecord => kitRecord(kit.state().swap?.to ?? kitItem);
  /**
   * TURRET-RETICLE (issue #283; research 215 s8.2): mounted, the selected slot is the turret's -- the mount adds a slot
   * holding the turret's record and takes it up (`FUN_005463c0` D:L412214-412218 -> `FUN_005c4b10`), so the kit's tick
   * (`FUN_005c2670`) and the set (`FUN_005be300` on `+0x824`, D:L478907-478912) run that record until the release takes
   * the kept slot up again (D:L412005). The turret's item id (`FirearmHands.weapon`) and its record off the kit table
   * (`turretRecords`, `turret2Records`); null when not mounted, or with no id or record known.
   */
  const mountedId = (): number | null => (hands?.mounted() ? hands.weapon?.() ?? null : null);
  const mountedRecord = (): WeaponRecord | null => {
    const id = mountedId(), t = id === null ? null : loadouts.tables();
    return id === null ? null : t?.turretRecords?.get(id) ?? t?.turret2Records?.get(id) ?? null;
  };
  /**
   * The zoom's record and hold to the new slot at the switch's press (`Zoom.switchWeapon`; `FUN_005c4b10` writes
   * `+0x824`, D:L478842): a step taken since the last tick goes again against it; the view's effects follow the replay
   * (this tick's first-pass raises and leaves taken back, `undoViewTick`; the replay's path applied, `applyViewPath`).
   */
  const switchZoom = (to: Firearm): void => {
    const r = zoom.switchWeapon(kitRecord(to), zoomHold());
    if (r.replayed) accuracy.undoViewTick();
    accuracy.applyViewPath(r.path);
  };
  /**
   * WEAPON (`./kit`): the kit's two firearms and the swap between them; `m_item` drives the record the rounds, the bloom,
   * the zoom and the fire mode use, the anim set, the reticle set and the HUD's icon.
   */
  const kit: Kit = new Kit({
    swapClip: (to) => walk.swapWeapon(to),
    swapProgress: () => walk.swapProgress(),            // the walk's clock: the mounts change on the clip's frame
    // FUN_005a8cb0 / FUN_005bdc30's gates: not while reloading, not while a throw is held or thrown. FUN_005c4fd0's (not in
    // the 9x view or a scope) is the walk's, on the view the last tick left (`WalkMode.swapGate`; research 201 s1, 211 s2).
    canSwap: (): boolean => kitFree(),
    item: (item) => {
      fireModes[kitItem] = fireMode;
      kitItem = item;
      const record = kitRecord(item);
      fire.setWeapon(record);
      accuracy.setWeapon(record);
      zoom.setWeapon(record);
      fireMode = fireModes[item];
      showFireMode();
      play.setItem(item);
    },
    // FUN_005c4b10: the trigger lets go; the new slot `+0x824` is the zoom's record at once (`switchZoom`). A view of 4
    // and up may be on screen and it stays, as the original's (research 201 s2 A31: the switch drops no scope; 211 s2).
    // PARITY-1 D02: the swap's command ends the still clip's life (an after-shot's: the swap is refused under a reload), as
    // the room's `aim` clears `reloadLife` with the after-shot lock (`room.ts` 2171); `setWeapon` ends it without a `reloadEnd`.
    // NU-3a's fold F1: the bloom's record too (`FUN_005c2670` reads `+0x824`, D:L477280; the room's `aim` at the same press).
    started: (to) => { fire.release(); switchZoom(to); accuracy.setWeapon(kitRecord(to)); stillReload.end(); },
  });
  showFireMode();
  /**
   * `FUN_00594cf0`'s four tests for a shoulder press on `slot` (research 201 §1): the body free (`kitFree`, and the
   * mover's `WalkMode.swapGate`), no swap playing, the slot usable and within the count (`FirearmHands.takeable`).
   * Explicit absent firearm markers are unusable even with no hands plugin (FUN_005bdc30; research 362 §2).
   */
  const shoulderGate = (slot: number): boolean => kitFree() && !kit.swapping() && walk.swapGate()
    && (slot !== 0 && slot !== 1 || firearmSlotPresent(loadouts.loadout(), slot)) && (hands ? hands.takeable(slot) : true);
  /** L1 / L2: the press gated whole first (`shoulderGate`), then what is up put away and the firearm taken (`Kit.select`). */
  const selectFirearm = (to: Firearm): boolean => {
    if (walk.mode() !== 'walk') return false;
    return pressShoulder({ gate: () => shoulderGate(SLOT_OF[to]), putAway: () => { hands?.putAway(); }, take: () => kit.select(to) });
  };
  /**
   * The loadout's two firearms on the body (web sprint 4, M3): each slot's `ModelName` built on demand from the map's
   * weapons and hung at its own grip; a slot with no model holds nothing.
   */
  let heldKit: { rifle: HeldRef | null; pistol: HeldRef | null } = { rifle: null, pistol: null };
  const heldRef = (model: string | null): HeldRef | null => heldRefOf(d.view(), d.map(), model);
  const hangKit = (force = false): void => {
    const was = heldKit;
    heldKit = { rifle: heldRef(loadouts.model(0)), pistol: heldRef(loadouts.model(1)) };
    // The same model on the same body stays where it hangs (a respawn with an unchanged kit).
    if (force || heldKit.rifle?.object !== was.rifle?.object) play.setWeapon(heldKit.rifle?.object ?? null, heldKit.rifle?.points ?? []);
    if (force || heldKit.pistol?.object !== was.pistol?.object) play.setSidearm(heldKit.pistol?.object ?? null, heldKit.pistol?.points ?? []);
    // The thermal scope (item 195) in the kit: a sniper's `scope` node hidden, `thermal_scope` shown (FUN_005b82e0); the
    // 552's `silencer` shown only for a suppressed primary (FUN_005c0250, the 552SD's) -- `./sights`.
    const recs = loadouts.records();
    if (heldKit.rifle) showScopeNodes(heldKit.rifle.object, loadouts.loadout(), recs[0].id);
    if (heldKit.pistol) showScopeNodes(heldKit.pistol.object, loadouts.loadout(), recs[1].id);
  };
  /**
   * The held weapon's node itself and its `firepoint` in the weapon's frame, for a round's muzzle animation: the node,
   * never a copy of its matrix, so the flash rides the gun (research 149; `FUN_005c5340` D:L479478).
   */
  const weaponFrame = (): { node: Object3D; muzzle: [number, number, number] | null } | null => {
    const held = kit.item() === 'pistol' ? heldKit.pistol : heldKit.rifle;
    const object = held?.object;
    const points = held?.points ?? [];
    if (!object || !play.weaponStats().held) return null;
    const at = (name: string): [number, number, number] | null => { const p = points.find((q) => q.name === name); return p ? [p.at[0], p.at[1], p.at[2]] : null; };
    return { node: object, muzzle: at('firepoint') ?? at('firepont') };
  };
  /**
   * A spawn's kit: the side's pick or its type's `default_weapons` on the body, its native initial hand, every magazine
   * full; a slot whose record changed comes up in its own default fire mode. In a match the room's spawn names the kit
   * (protocol 7: its pick, R94.3); without one a network server's is the type's own, and only no match takes the page's
   * pick. `type` (protocol 9): the character type the room rebuilt the body as.
   */
  const spawnKit = (side: Side, given: readonly number[] | null = null, type: number | null = null): void => {
    fireModes[kitItem] = fireMode;                       // the mode in the hand kept with its firearm
    const before = kitRecs;
    loadouts.spawn(side, { network: d.network?.() ?? true, kit: given, type });
    walk.setHeldModels?.(heldWeaponModels(loadouts.tables(), loadouts.loadout()));   // SEGMENT-BODY part 4 (F1): the weapon line
    kitRecs = loadouts.records();
    kitRounds = new KitRounds(loadouts.tables(), loadouts.loadout());   // M4: every round slot full (FUN_00599f00)
    hands?.spawned(kitRounds);                          // M7: the equipment slots; the inventory's shoulders (FUN_00599b60)
    if (kitRecs[0].id !== before[0].id || (fireModes.rifle > 3 && !kitRounds.ring(fireModes.rifle))) fireModes.rifle = defaultFireMode(kitRecs[0], kitRounds.held());
    if (kitRecs[1].id !== before[1].id) fireModes.pistol = defaultFireMode(kitRecs[1]);
    fireMode = fireModes[kitItem];
    if (d.view()) hangKit();
    kit.reset();
    const first = FIREARM_OF[initialFirearmSlot(loadouts.tables(), loadouts.loadout())];
    kit.place(first);                                    // FUN_005c0250: a FULL_SLOT primary starts on the secondary
    kitItem = first;
    walk.placeFirearm?.(SLOT_OF[first]);
    const record = kitRecord(first);
    fire.setWeapon(record);
    accuracy.setWeapon(record);
    accuracy.reset();                                    // NU-3a C3: a life starts at rest (`setWeapon` carries since)
    // AD-3 (the re-check of F2): the spawn rebuilds the observing body (`FUN_00599b60`: online at every round start through
    // `FUN_00598b90` D:L455158, and at a respawn), its perception list emptied (`PERCEPTION_RECORD_LIFE_READING`).
    perception.clear();
    lastFeet.clear();
    // FUN_00599b60 -> FUN_00553ea0 D:L419886-419889: a spawn re-inits the view -- third person, 1.0 -- a living body's at a
    // classic round's start too (FUN_00223680 L75913-75931), whatever scope the last round ended in (`Zoom.respawn`).
    zoom.respawn(record);
    fireMode = fireModes[first];
    play.setItem(first);
    fire.refill();
    showFireMode();
  };
  /** PF-34 (`./takeKit`, research 234 s6): the firearm's kit state lent to the room's `kit` after a pickup. */
  const kitTaker: TakeKitDeps = {
    loadouts, fire, accuracy, hand: () => kitItem, records: (r) => { kitRecs = r; }, modes: fireModes, heldRounds: () => kitRounds.held(),
    inHand: () => !hands?.itemUp() && !hands?.launcherUp(),   // research 323 F1: an item up, the selection is no firearm's
    renew: () => { fireMode = fireModes[kitItem]; if (d.view()) hangKit(); showFireMode(); },
    // NU-5 L1 (research 323 §1.6): the kit's round slots after a launcher claim -- each carried round keeping its rounds,
    // the claimed launcher's round with `rounds` (`launcherKitRounds`) -- handed to the launcher (`FirearmHands.kitTaken`).
    launcherTaken: (_slot, round, rounds) => {
      if (round === null) return;
      kitRounds = launcherKitRounds(kitRounds, loadouts.tables(), loadouts.loadout(), loadouts.loadout()[round]!, rounds);
      hands?.kitTaken?.(kitRounds);
    },
    // NU-5 X1 / research 324 P2: the pick-up's `Swap rifle` on the page's own body (`./walk` PICKUP_SWAP_OWN_LAG_READING).
    swapClip: (name) => { walk.pickupSwap(name); },
  };
  /**
   * LATER 180 (research 215 s8.3): the turret's trigger, mounted -- the controller's press asks the raise mounted too
   * (D:L453634; `FUN_00594cf0` runs mounted, D:L453073), so the body's raise hears it (`play.setWeaponInput`).
   */
  let mountedTrigger = false;
  /** The trigger, pressed or let go: nothing while the input is held, nothing for the dead; another owner's first. */
  const trigger = (down: boolean): void => {
    if (down && d.blocked()) return;                    // the loading screen's hold, the ARMORY (web sprint 5 S3)
    if (down && walk.isDead()) return;                  // the dead fire nothing and pull no pin (`FUN_00592560`)
    // OBF-31: under the round screens the trigger is not ticked -- neither the hands' (a throw, a rocket) nor the firearm's
    // press; a let-go frees the firearm's pull alone (the hands' state is the next round's to clear)
    if (screens()) { if (!down) fire.release(); return; }
    if (hands?.trigger(down)) {                         // the turret's, the launcher's, a throwable's (`FirearmHands.trigger`)
      // TURRET-CONE P1 (research 215 s8.2): mounted, the kit's pull is the turret slot's -- its count `kit+0x818` is zeroed
      // while the trigger is up and at its release (`FUN_005c0ae0` D:L476380-476382, D:L476399-476400, via `FUN_005c0fd0` D:L476569); the port resets on the press and the release, as
      // `fire.setGun`'s `trigger` does -- the same for any round, since a round always follows a press.
      if (hands.mounted()) { accuracy.trigger(); mountedTrigger = down; }
      return;
    }
    if (down) fire.pull();
    else fire.release();
  };
  /**
   * EFFECTS (socomlegacy/docs/research/89, `./effects`): the game's own zAnim effect animations out of the map's
   * `CZANIM.ZAR` -- a round's `FireAnimName`, the casings bouncing on the hull with their material's sound, the marks
   * per surface (`Fire.setMarks`) -- their sounds through the sound plugin's door (silent without it).
   */
  const effects = new Effects(Math.random, (name, at, volume) => { sound?.effect(name, at, volume); });
  fire.setTracerRule(tracerRound);                  // EFFECTS: every fourth round of a tracer weapon; never the M4A1 SD's
  fire.setTracerModel((kind) => effects.willDrawTracer(kind));   // research 89 §19: the travelling model replaces the line
  effects.setBlastPoint(hands?.blast ? (at) => hands.blast!(at) : null);   // FUN_003c8330 D:L319186-319195: the script round's shake
  scene.add(effects.object);
  effects.setWorld(() => walk.grid());
  // The `LIGHT` passes re-draw the lit world, the held weapons and the SEAL's body (`./effectLights`, research 89 §10).
  effects.setLightReceivers(() => [d.view()?.group, heldKit.rifle?.object, heldKit.pistol?.object, d.body()?.group].filter((o): o is NonNullable<typeof o> => !!o));
  /** The map's `LensFX_NVG` colour; the scope lenses' rows off the effect data; the lens in play. */
  let nightLens: [number, number, number, number] | null = null;
  let lensRows = new Map<string, LensRows>();
  let lensOn: ViewLens = null;
  // WEAPON: the trigger raises the rifle (`./weaponRaise`), a reload plays its clip; `fire.subscribe` is also the sound's
  // hook (`FireEvent`: every round, every reload's start and end), and the room's -- only through `NetPage`.
  play.setWeaponInput(() => ({ trigger: fire.triggerHeld() || mountedTrigger, aiming: walk.view() === 'scope' }));
  // PARITY-1 D02 (research 251 s6): the still reload's clip on the page's command clock, asked by the walk's jump -- the
  // room's `reloadLife` from the command its `reload` names (`NetPage`: the last one sent at `reloadStart`).
  const stillReload = new StillReloadLife();
  walk.setStillClip(stillReload);
  /**
   * A browser adaptation, presentation only (`./effects` `MAX_EFFECT_RUNS_ADAPTATION`; the owner's report, 2026-11-06): a
   * hidden tab runs no animation frame, so another player's rounds off the socket would pile effect runs nothing steps,
   * and the return would step and sound them all at once. Hidden, they start none -- no muzzle, casing, impact or
   * tracer run; the report and the passing sound still play, as before (the controller's ruling, 2026-11-06: they start
   * at once and free on 'ended', so they are no backlog, and a tabbed-off player keeps hearing the gunfire). Back, the
   * rounds' runs go (`Effects.retireRounds`). The room's damage, the wire and every game rule are untouched.
   */
  const page: PageVisibility | null = d.visibility ?? (typeof document !== 'undefined' ? document : null);
  const pageHidden = (): boolean => page?.hidden === true;
  const onVisibility = (): void => { if (!pageHidden()) effects.retireRounds(); };
  page?.addEventListener('visibilitychange', onVisibility);
  const offs = [
    () => page?.removeEventListener('visibilitychange', onVisibility),
    () => walk.setStillClip(null),
    fire.subscribe((e) => {
      // PAR-79's review F1 (research 251 s12.3, "PAR-79"): `Fire`'s completed end is its own timer, not the clip's pop --
      // a clip the fall covered outlives it (its life stands through the flight); the life's own end (`ran`) takes it.
      // LATER 530: the turret's take cut it (`kept`) -- kept for the room's refusal, and handed back by it (`reloadResume`).
      if (e.type === 'reloadEnd') { if (e.kept) stillReload.keep(); else if (!e.completed) stillReload.end(); return; }
      if (e.type === 'reloadResume') { stillReload.resume(); return; }
      if (e.type !== 'reloadStart' && e.type !== 'afterShot') return;
      const src = play.motionSource(), s = walk.snapshot();
      stillReload.start(src?.clips ?? null, src?.table ?? null, walk.posture(), s ? [s.vx, s.vy, s.vz] : [0, 0, 0],
        e.family ?? play.weaponStats().item, e.seconds, walk.ticks());
    }),
    fire.subscribe((e) => { play.weaponEvent(e); sound?.fireEvent(e); d.net()?.fireEvent(e); }),   // the pose and the sound, per round and reload
    // A reload started still crouched, or prone, holds the mover to its clip's NoInterrupt (`FUN_005a82e0`; `reloadHold`),
    // on the reload's own clock (`seconds`: the record's ReloadTime still, else the clip's playback; research 150 F2).
    fire.subscribe((e) => { if (e.type === 'reloadStart' || e.type === 'afterShot') walk.holdReload(reloadHoldPeriod(e.family, e.seconds)); }),
    // PAR-19 D04 (research 251 s4.2): a reaction that pops the still reload's clip ends it, the magazine kept
    // (`reloadEndOfBody` maps a knock, a death or a flinch; the hold's `replaced` end -- off the floor -- ends none).
    walk.onActionEnd((e) => { const r = reloadEndOfBody(e); if (r) fire.cancelReload(r); }),
    // PAR-28 (research 251 s12): the stack's pops end the reload's clip and its lock on the command the room's
    // `endStillReload` ends its own -- a knock any clip under way (the second channel too), a climb's or a ladder's start
    // and a landing's clip a still clip on the stack (`reloadPopped`); the kit's timer is left.
    walk.onStackPop((pop, count) => { reloadPopped(pop, fire, stillReload, count); }),
    // M4 (research 94 §C4): a round mode's round leaves -- flown on the page where the throwables are mounted
    // (`FirearmHands.launched`) -- and is sent to the match as a throw of that round (the room flies it, deals the blast).
    // P4 (TB-10, WK-1): with its launch's journal id (`shot`, page-local), so the room's `stale` gives it back on the
    // firearm (`./matchThrow` `staleThrow` -> `Fire.refundRound`, by the round's class).
    fire.subscribe((e) => {
      if (e.type !== 'launch') return;
      const round = kitRounds.round(e.round.id);
      if (!round) return;
      hands?.launched(round.record, e.from, e.velocity);
      d.net()?.throwEvent(round.record.name, e.from, e.velocity, undefined, undefined, undefined, e.shot);
    }),
    // EFFECTS: the muzzle animation and the impact, per round; the `_zoom` variant in the scope (the view from the head).
    fire.subscribe((e) => {
      if (e.type !== 'round') return;
      effects.onRound(e, weaponFrame(), walk.view() === 'scope');
      // ACCURACY: every surface the round went through is struck too (FUN_003c8920 per hit), its impact without a muzzle.
      // The tracer left with the round itself; a through-hit does not launch another.
      for (const t of e.through ?? []) effects.onRound({ ...e, to: t.point, normal: t.normal, material: t.material, hit: true, through: undefined, tracer: undefined, tracerKind: undefined }, null, false);
    }),
  ];
  /** W2.4 (`./reticle`): the game's rifle reticle, a HUD pass over the world, in walk mode only; the range finder. */
  const reticle = new Reticle();
  const rangeFinder = new RangeFinder();
  /** The weapon id whose scope bitmaps the reticle holds (`scopeBitmaps`), -1 for none yet. */
  let scopeBitmapsOf = -1;
  /** NU-3a C3: what was in the hand at the last HUD frame (the item's id, else the firearm's) and the set it asked, or null. */
  let handLast: { hand: number; set: number } | null = null;
  /** The look a frame ago, degrees (the turn and pitch rates the bloom reads), or null to start again. */
  let lastLook: { yaw: number; pitch: number } | null = null;
  let lastFov = -1;
  /**
   * The SELECTED slot's record as the reticle's colour pass reads it (`FUN_005c3780` D:L477826-477834 in `FUN_00215c10`
   * D:L70222-70258: `FUN_005c6600` on `+0x824`, the round's slot for a carrier in a round mode), for its arming grey
   * (`armingGreyOf`, R94.16 as corrected by ARMING-GREY, issue #300):
   * - mounted, the turret's (TURRET-RETICLE, the review's F1; research 215 s8.2) -- class 0xcd (PKM, LMG) or 0xe6 (MGL),
   *   whatever round mode the held rifle keeps and whatever the turret's record, known to the page or not (the narrow
   *   re-read: gated on the mount, not on a known turret id): null, none of the two classes;
   * - a raised LAW or RPG-7 rides its round mode (spawned on its first round and cycled back to one while the kit holds
   *   it, `FUN_005c4600` D:L478580-478600), so `FUN_005c6600` (D:L479628-479660) moves the slot to its rocket's -- LAW HEAT
   *   185, RPG 186, class 0xb9 -- the page's kit table's record of it (`rocketRoundOf`);
   * - an item up (a throwable, a charge, the Detonator): the item's own, never class 0x91 or 0xb9: null;
   * - else the firearm's round mode (`Fire.roundMode`, M4) -- an M203, F2000 or GL round, class 0xab, which the gate
   *   refuses -- or none.
   */
  const armingRecord = (): { id: number; armingDistance?: number } | null => {
    if (hands?.mounted()) return null;
    if (hands?.launcherUp()) {
      const launcher = hands.launcher?.() ?? null;
      const round = launcher === null ? null : rocketRoundOf(launcher);
      const r = round === null ? null : kitRounds.round(round);
      return r && round !== null ? { id: round, armingDistance: r.record.armingDistance } : null;
    }
    if (hands?.itemUp()) return null;
    return fire.roundMode();
  };
  /** The selected record's `ArmingDistance`, units, for the grey (`armingGreyOf`), null for none. */
  const roundArming = (): number | null => armingGreyOf(armingRecord());
  const feetXZ = (): [number, number] | null => { const f = walk.feet(); return f ? [f[0], f[2]] : null; };
  /**
   * NU-3b C4 (research 321 section 4.1): the actor under the reticle (`FUN_005aa690`) -- the nearest living body the eye's
   * pick ray meets before a blocking surface (`FUN_005aa6e0`: `crosshairPick` over the room's capsules, `aimBodies`, and
   * the hull's surfaces, out to the shot's own eye ray's reach, `Fire.eyeReach`: AD-1's F1; was: "out to
   * `ORDER_PICK_REACH_READING`") -- its side by the room's seats against the page's (`teamOf`,
   * the client's team; none: `unseated`), how far across the ground from the page's feet, its name (`NetPage.nameOf`) and
   * its clan tag (its score row's `clan`, as the spectator HUD's), and its health as the room sent its part bytes to the
   * page (NU-3c, research 321 section 4.2.1: `NetClient.healthOf`; null for none sent -- a seat never sent; was: unknown,
   * NU-3b's placeholder).
   */
  /**
   * NU-3b C5 (research 321 section 4.1): nothing left to fire in the hand's item's mode (`FUN_005bdb00` -> `FUN_005bda70`,
   * no magazine of the slot holding rounds): an item, the launcher or a turret by its count (`FirearmHands.magazine`), a
   * round mode by its ring, else every round of the firearm in the hand (`Fire.magazineTotal`).
   */
  const handEmpty = (): boolean => {
    const m = hands?.magazine() ?? null;
    if (m) return m.rounds <= 0 && m.spare <= 0;
    const ring = fireMode > 3 && kitItem === 'rifle' ? kitRounds.ring(fireMode) : null;
    return (ring ? ring.total() : fire.magazineTotal()) <= 0;
  };
  /** The pick (`FUN_005aa690`): the body under the reticle and its feet, or null. */
  const aimPick = (): { id: number; at: [number, number, number] } | null => {
    const a = walk.fireAim(), own = walk.feet();
    if (!a || !own || !remote.aimBodies) return null;
    const d0 = a.far[0] - a.eye[0], d1 = a.far[1] - a.eye[1], d2 = a.far[2] - a.eye[2], l = Math.hypot(d0, d1, d2);
    if (!(l > 0)) return null;
    const dir: [number, number, number] = [d0 / l, d1 / l, d2 / l];
    const reach = fire.eyeReach();                                  // AD-1 F1: FUN_005aa6e0's own reach, as the shot's eye ray
    const far: [number, number, number] = [a.eye[0] + dir[0] * reach, a.eye[1] + dir[1] * reach, a.eye[2] + dir[2] * reach];
    const grid = walk.grid();
    const surfaces = grid ? pickSurfaces(grid, a.eye, far, d.map()?.grenade?.defaultMaterial ?? '') : [];
    const id = crosshairPick(remote.aimBodies([a.eye[0], a.eye[1], a.eye[2]], dir, reach), surfaces).picked;
    const at = id === null ? null : remote.feet?.(id) ?? null;
    return id === null || !at ? null : { id, at };
  };
  /**
   * AD-3 (research 321 sections 4.1 and 7.5): the target as `reticleTargetState` reads it -- the perception's mark of it
   * (`Perception.identified`, the record's bit 0x200) and, for a body the room names a hostage (`NetPage.hostages`, HX-1's
   * list), the special kind and its record's name (`display`, the same as its `name` on every MP map; the room's list
   * carries the `name`). An escort VIP is in that list on game type 3: `ExtractionAuthority` admits ESCORT as well as
   * EXTRACTION (research 175 §2.1, research 334).
   */
  const aimTarget = (pick: { id: number; at: [number, number, number] } | null): ReticleTarget | null => {
    const own = walk.feet();
    if (!pick || !own) return null;
    const { id, at } = pick;
    const net = d.net(), team = remote.teamOf?.(id) ?? null, mine = net?.client.role === 'player' ? net.client.team : null;
    const hostage = net?.hostages?.().get(id) ?? null;
    return {
      side: team === null || mine === null ? 'unseated' : team === mine ? 'teammate' : 'other',
      ground: Math.hypot(at[0] - own[0], at[2] - own[2]),
      name: hostage && 'name' in hostage && typeof hostage.name === 'string' ? hostage.name : net?.displayNameOf?.(id) ?? net?.nameOf(id) ?? '', tag: net?.rows.find((r) => r.id === id)?.clan ?? null,
      health: net?.client.healthOf(id) ?? null,
      identified: perception.identified(id), ...(hostage ? { kind: 'hostage' as const } : {}),
    };
  };
  /**
   * AD-3 (research 321 sections 4.1 and 7.5; `./reticle` `PERCEPTION`): the body's perception records, stepped once a HUD
   * frame for every body the page knows -- the room's seats but its own, its hostages and the body under the reticle --
   * as the human's controller steps its records (`FUN_005ca9f0`, `FUN_005c9b30`): the look (`perceptionLook`) from the
   * camera's eye and forward at the view's magnification (its target), the reach under the map's MID; the speed across the ground from
   * the body's drawn feet a frame apart; the sight `PERCEPTION_SIGHT_PLACEHOLDER`'s, asked only of a body the passes take;
   * one query a body a frame (`PERCEPTION_QUERY_PLACEHOLDER`). No time passed, no pass. The records are emptied at the
   * page's own spawn (`spawnKit`: the observer's rebuild, `PERCEPTION_RECORD_LIFE_READING`) and kept across another
   * body's death and respawn; a seat gone from the room loses its record (`Perception.keepOnly`, the page's bookkeeping).
   * (Was, the F2 fold: kept for the mount.)
   */
  const perception = new Perception();
  const lastFeet = new Map<number, [number, number, number]>();
  const camEye = new Vector3(), camForward = new Vector3();
  const perceive = (dt: number, picked: number | null): void => {
    const net = d.net(), own = walk.feet(), a = walk.fireAim();
    if (!net || !own || !a || !(dt > 0)) return;
    const living = new Map<number, boolean>();
    for (const r of net.rows) if (r.id !== net.client.id) living.set(r.id, r.alive !== false);
    for (const [id, h] of net.hostages?.() ?? []) living.set(id, h.alive !== false);
    if (picked !== null) living.set(picked, true);
    // The page's own bookkeeping (no original read): a body no longer in the room keeps no record (`keepOnly`).
    const known = new Set(living.keys());
    perception.keepOnly(known);
    for (const id of [...lastFeet.keys()]) if (!known.has(id)) lastFeet.delete(id);
    // The game's camera, not the drawn one the near clearance moves (#479's re-review F1: `WalkMode.gameCamera`).
    const game = walk.gameCamera();
    if (game) {
      camEye.set(game.eye[0], game.eye[1], game.eye[2]);
      camForward.set(game.target[0] - game.eye[0], game.target[1] - game.eye[1], game.target[2] - game.eye[2]).normalize();
    } else {
      camEye.setFromMatrixPosition(fly.camera.matrixWorld);
      fly.camera.getWorldDirection(camForward);
    }
    const grid = walk.grid(), material = d.map()?.grenade?.defaultMaterial ?? '', mid = d.map()?.camera?.mid ?? null;
    // AD-3's review F1: the body's +0x204 (FUN_005c9520 D:L481801-481806) is the view state's magnification at once
    // (`Zoom.target`), not the one on screen easing toward it (was: `zoom.magnification()`).
    const magnification = perceptionMagnification(zoom.state(), zoom.target());
    for (const [id, alive] of living) {
      const feet = remote.feet?.(id) ?? null;
      if (!feet || !alive) { perception.step(id, 'inactive', dt); lastFeet.delete(id); continue; }
      const prev = lastFeet.get(id);
      lastFeet.set(id, feet);
      const target: [number, number, number] = [feet[0], feet[1] + EYE_HEIGHT, feet[2]];
      let look: PerceptionLook = perceptionLook({
        alive, distance: Math.hypot(feet[0] - own[0], feet[1] - own[1], feet[2] - own[2]),
        apex: [camEye.x, camEye.y, camEye.z], forward: [camForward.x, camForward.y, camForward.z], target, magnification, mid,
        speedSquared: prev ? ((feet[0] - prev[0]) ** 2 + (feet[2] - prev[2]) ** 2) / (dt * dt) : 0, seen: true,
      });
      if (look === 'seen' && grid) {
        const distance = Math.hypot(target[0] - a.eye[0], target[1] - a.eye[1], target[2] - a.eye[2]);
        if (crosshairPick([{ id, distance }], pickSurfaces(grid, a.eye, target, material)).picked !== id) look = 'unseen';
      }
      perception.step(id, look, dt);
    }
  };

  return {
    fire, kit, zoom, accuracy, reticle, effects, rangeFinder, trigger, stepZoom, setZoom, switchFireMode, showFireMode, hangKit, spawnKit,
    // The mode in the hand kept with its firearm first (`spawnKit`'s first line): `renew` re-reads it after a claim.
    takeKit: (l, s, r, f, resumed) => {
      fireModes[kitItem] = fireMode; takeRoomKit(kitTaker, l, s, r, f);
      walk.setHeldModels?.(heldWeaponModels(loadouts.tables(), loadouts.loadout()));   // SEGMENT-BODY part 4 (F1): the pickup's kit
      // OT.R59 (condition 4 (a)): the room's firearm in the hand at once, no swap clip -- the Fire record, the HUD's box and
      // the hung model with it; then the room's pouch and launcher (`hands.resumed`).
      if (resumed?.weapon !== undefined) {
        const to = FIREARM_OF[resumed.weapon];
        if (kit.item() !== to || kit.swapping()) { kit.place(to); if (d.view()) hangKit(); }
      }
      if (resumed) hands?.resumed?.(resumed);                     // OT.R59: the room's pouch and launcher at a resume
    },
    kitFree, shoulderGate, selectFirearm,
    fireMode: () => fireMode,
    // NU-5 L1: the kit's round slots' counts, for the world drops' launcher test (`./net/pickupRules` `pickupKitOf`).
    heldRounds: () => kitRounds.held(),
    fireModeName: () => FIRE_MODE_NAMES[fireMode] ?? String(fireMode),
    item: () => kitItem,
    records: () => kitRecs,
    record: kitRecord,
    icon: kitIcon,
    heldKit: () => heldKit,
    baseFov: () => baseFov,
    lens: () => lensOn,
    held: () => { fire.release(); },
    triggerLane: (before, after) => { if (after.fire !== before.fire) trigger(after.fire); },
    viewLanes: (walking) => {
      // The view from the head in every zoom view past third person (first person, the night vision, the scope).
      walk.setScoped(walking && zoom.lens());
      walk.setScopedMove(walking && zoom.moveScale() < 1);   // FUN_005966a0: the move stick x 0.2 in the 9x view or a scope
      walk.setBinoculars(walking && zoom.binoculars());      // the others see the binoculars raised (`Button.Binoculars`)
    },
    beforeMove: () => { fly.setBody(walk.mode() === 'walk' && eyeBob(zoom.state()), walk.posture() === 'prone'); },   // the bob: states 1-3 (research 83)
    gunFrame: (dt, walking) => {
      // The view a switch is weighed against: once a walk tick (`Zoom.markTick`, sprint 25).
      if (walk.ticks() !== zoomTicks) { zoomTicks = walk.ticks(); zoom.markTick(); accuracy.markViewTick(); }
      // NU-3a's fold F1: the bloom runs the selected slot's record -- the press's (`started`), a swap the room undid or redid
      // (`./kit` `undo`, `redo`: no `item` when the hand's firearm did not change), a pickup into the slot mid-swap.
      // TURRET-RETICLE: mounted, the turret slot's record (the swap carries the size, research 321 s3.2: lifted to its TargetMin).
      const turret = mountedRecord();
      accuracy.setWeapon(turret ?? slotRecord());
      // BLOOM-SWAP (research 321 section 3.4): the kit's tick runs the selected slot's item (`FUN_005c2670` D:L477280) -- a
      // grenade, a charge or the Detonator up (`handItem`, from its press: `./grenade` `equip`, L2's and the R2 menu's
      // alike) closes the kit's size at its own TargetConstrict to 0 (D:L477282-477288). Not the raised launcher's (its
      // own 2 to 6 range: not built, research 321 section 3.4), nor mounted.
      accuracy.setItem(turret || hands?.launcherUp() ? null : itemReticleOf(loadouts.tables(), hands?.itemUp() ? hands.handItem?.() ?? null : null));
      // LATER 97 (research 84 X10, X11): the mount sets 1, or 2 on a THERMAL turret, from a head view; the release takes
      // 2 to 1 (`syncMount`).
      syncMount();
      cutTurretParts();
      // One frame of the gun (research 84): the bloom's 60 Hz ticks off the mover and the look's rates (`FUN_005c2670`),
      // the zoom's run and the FOV it sets, the look's scale for the scope. Leaving the walk drops the zoom.
      const snap = walking ? walk.snapshot() : null;
      if (!snap) {
        if (zoom.state() !== 0) { zoom.reset(); accuracy.leaveScope(); }
        lastLook = null;
      } else {
        const pose = fly.pose();
        // A jump of LOOK_JUMP_READING or more in one frame is a placement (the hook, a respawn), not a turn (`lookRates`).
        const { yawRate, pitchRate } = lastLook ? lookRates(shortTurn(lastLook.yaw, pose.yaw), pose.pitch - lastLook.pitch, dt) : { yawRate: 0, pitchRate: 0 };
        lastLook = { yaw: pose.yaw, pitch: pose.pitch };
        // The exertion's throttles (research 84 section 17): the move stick after the scope's x 0.2 (+0x240/+0x244), the
        // turn axis from the turn rate (turn_maxrate x +0x23c, research 83), the raw pitch stick from the pitch rate.
        const wish = fly.groundWish(), slow = zoom.moveScale();
        const sticks = {
          forward: wish.forward * slow, right: wish.right * slow,
          turn: yawRate / SEAL_TUNING.turnMaxRate,
          pitch: pitchStickInView(pitchRate, zoom),   // LATER 351, 476: v.y at the look's own scale, no stick gain in the divisor
        };
        accuracy.update(dt, {
          stance: turret ? TURRET_RETICLE_STANCE_READING : snap.stance, rawStance: turret ? TURRET_RETICLE_STANCE_READING : walk.stance(), velocity: [snap.vx, snap.vy, snap.vz], airborne: snap.airborne,
          yawRate, pitchRate, zoomState: zoom.state(), sticks,
        });
      }
      zoom.update(dt);
      recordKnock();                                             // LATER 237: the knock at this frame's command
      // CTL-2: the START menu's open resets the motors and stops the pulse (FUN_00204a40: FUN_00592ac0 D:L61940, the
      // +0x5e1 bit D:L62000; RUMBLE_MENU_STOP_READING); the scope's pulse (FUN_005b9280 runs only scoped: state >= 4); the
      // frame's two motor bytes (FUN_005929a0) to the pad (RUMBLE_OUTPUT_ADAPTATION).
      const menuOpen = d.menuOpen?.() ?? false;
      if (menuOpen && !menuWasOpen) rumble.reset();
      menuWasOpen = menuOpen;
      if (snap && !menuOpen && zoom.state() >= 4) pulse.tick(dt, accuracy.state().exertion, zoom.state(), rumble);
      rumbleOut(rumble.frame(dt), padActuator());
      const fov = zoom.fov(baseFov);
      if (Math.abs(fov - lastFov) > 1e-6) { fly.setFov(fov); lastFov = fov; }
      // The look's divisor (FUN_005966a0, `FUN_005be660`): the LOOK workstream's law takes the magnification and mode 4.
      fly.setZoom(1 / zoom.lookScale() / (zoom.state() === 4 ? 5 : 1), zoom.state() === 4);
      // Research 381: the scope's sway moves the view (FUN_005b9030 D:L471951-471957; FUN_005bd100
      // D:L474218-474223; PlayerUpd D:L453669-453676) -- the world under the scope's fixed cross, which so stays on
      // the round; 0 below state 4.
      fly.setKitOffset(...accuracy.viewOffset(zoom.state()));
      // FUN_001f6ce0: the readout is the state's own value (9.0 in the binoculars, ZoomMode[state - 4] in a scope), and
      // the RANGE line sits where the view's ChangeReticule type puts it (the binoculars' (515, 40)).
      hud.setZoom(zoom.hudZoom(), zoom.binoculars());
      // The lit colours' one lens (`./sights` `viewLens`, `lensStep`): the night vision's goggles in view state 3, or a
      // scoped view's lens (FUN_001f0750 L53084-53160, research 94 section C7): `to_thermal_lens_fx` while the kit holds
      // item 195, else the scope's own -- one owner, one write a change; none with an item up.
      reticle.setNight(zoom.view() === 'nightvision');
      const want = viewLens(zoom.state(), thermalFitted(loadouts.loadout()), !!d.map()?.night?.mission, walking && !hands?.itemUp());
      const step = lensStep(lensOn, want);
      if (step) {
        lensOn = step.apply;
        if (step.apply === 'goggles') setNightVision(nightLens);   // the lit colours through VU1 command 0x5c (`./nightVision`)
        else setLensRows(step.apply ? lensRows.get(step.apply)?.rows ?? null : null);
        if (step.goggles) {
          d.refreshFog(step.apply === 'goggles' ? nightLens : null);   // and the fog's colour times the lens's (`cam+0xd0`)
          if (walking) sound?.goggles(step.apply === 'goggles');      // without a place: vtable+0xc (decomp 410944)
        }
      }
    },
    kitFrame: (dt, walking) => {
      if (walking) kit.frame(dt); else kit.settle();   // WEAPON: the swap's hand-off and end (`./kit`)
      play.setMounts(kit.state().mounts);
      // LATER 180 (research 215 s8.3): mounted, the turret's slot is in the hand and its raise times are zero (the mount's
      // take-up, D:L412218 -> `FUN_005dfff0`); off it, the firearm's (`FUN_005dffc0`). Before the raise ticks (`play.frame`).
      // LATER 655 (research 321 s3.4; reading, pending review): an item up -- a hand grenade, a charge, the gear -- is a
      // selected slot of none of the firearm categories, so its take-up gives zero times too (`FUN_005c4b10`
      // D:L478849-478853); the grenade's lower then clears the envelope at once (`FUN_005dfe30` D:L494249-494256) and the
      // rifle's first round after the return waits on the raise from 0. A raised launcher keeps the firearm's (LATER 192).
      const mounted = mountedId() !== null;
      if (!mounted) mountedTrigger = false;
      play.setRaiseTimes(mounted || hands?.itemUp() ? ZERO_RAISE_TIMES : RAISE_TIMES);
    },
    // DEAD: the dead's controller (`FUN_00592560` L451642-451730) takes the respawn press alone -- a held trigger lets go.
    beforeNet: () => { if (walk.isDead() && fire.triggerHeld()) fire.release(); },
    fireFrame: (dt, walking) => {
      if (!walking || screens()) fire.release();       // leaving the walk lets a held trigger go; OBF-31: so do the round screens
      // OBF-31b: and a mounted trigger held into them, as its release in `trigger` lets it go (the turret's own latch is
      // let go in `./matchActions` `turretFrame`): the raise's feed and the slot's pull count
      if (screens() && mountedTrigger) { accuracy.trigger(); mountedTrigger = false; }
      // MAP-10b: mounted, the rifle is still (no round, no drain, no reload) and the turret's trigger claims the rounds.
      // A1 (LATER 218): the kit's timer is handed to the turret at the take (`Fire.mountTake`, `./matchActions` `took`), so
      // nothing of the rifle's stands frozen here through the mount -- its reload or after-shot was cut or carried then.
      const mounted = hands?.mounted() ?? false;
      if (mounted && fire.triggerHeld()) fire.release();
      if (!mounted) fire.update(dt);                   // W2.5: the reload, the rate, a held trigger's rounds, the tracer's one frame
      else { fire.mountWait(dt); fire.tracerFrame(); } // PAR-54: mounted, the turret's tracer still goes after its frame; LATER 526 R1: the refused take's wait runs
    },
    effectsFrame: (dt, camera) => { effects.update(dt, camera); },   // EFFECTS: the zAnim effect runs, the casings, the particles
    aimReticle: (dt) => {
      const aim = walk.aim();
      if (!aim) return;
      // The reticle on the aim point (FUN_00297410's, 1000 ahead along the look): the frame's centre at rest.
      fly.camera.updateMatrixWorld();
      const [nx, ny] = aimPoint(fly.camera, aim);
      const [sx, sy] = fly.screenShift();   // the shake and the bob move the world, not the HUD (research 83)
      reticle.setAimPoint(nx - sx, ny - sy);
      // Research 84: the HUD's size (halved in third person) and the knock's climb; the scope's overlay at 5 and up, the
      // binoculars' two-lens mask in 4 (ChangeReticule type 7: whatever is in the hand, no reticle with it).
      const r = accuracy.reticle(zoom.state());
      reticle.setSize(r.size, r.offset);
      const item = hands?.itemUp() ?? false;
      reticle.setMode(zoom.binoculars() ? 'binoculars' : zoom.view() === 'scope' && !item ? 'scope' : 'reticle');
      // The reticle set (FUN_005be300: by its ID, the view and the slot's fire mode -- a launcher round's 3), the hand's
      // item's while one is up (NU-2: a grenade's 4, the throw meter at the throw's power); its scope's bitmaps
      // (`./sights`), on a change only.
      // NU-3a's fold F1: the set is asked of the selected slot (`FUN_005be300(kit, +0x824)` D:L478908 via `FUN_005c67d0`),
      // from a swap's press; was: `fire.weaponRecord().id`, the hand's (`m_item`), which a swap to the rifle moves at its end.
      const held = slotRecord().id;
      // NU-3a C2: a raised LAW or RPG-7 is the hand's item -- the rocket launchers' class 145-150, a carrier
      // (`FUN_003c5d80` via `FUN_003d1e10`): set 3 whichever of the two (the hands say only that one is up).
      // TURRET-RETICLE (issue #283; research 215 s8.2): mounted, the turret slot is up whatever was (`FUN_005463c0`
      // D:L412218): its id is asked -- 205, 207, 230 all set 0 (D:L474926-474939; none a carrier, `FUN_003c5d80`), the
      // record's one zoom mode giving no magnification -- at its own mode; the held item and a raised launcher are not.
      const turretId = mountedId();
      const handItem = turretId !== null ? null : hands?.launcherUp() ? ITEM.LAW : hands?.handItem?.() ?? null;
      // N1 of the re-review of 2a2b732bf: the selected slot's own mode (`+0x6fc[slot] < 5`, D:L474944-474945), as `zoomHold`
      // reads it; was: `fireMode`, the hand's, so an M203 rifle in a round mode drew set 1 from a swap's press to its end.
      const slot = kit.state().swap?.to ?? kitItem;
      const set = turretId !== null
        ? handReticleType(null, turretId, zoom.state(), 1, hands?.fireMode?.() ?? 1)
        : handReticleType(handItem, held, zoom.state(), zoom.target(), slot === kitItem ? fireMode : fireModes[slot]);
      // NU-3a C3 (research 321 section 3.2): the switch (`FUN_005c4b10`) writes the hand's new item and marks a set it
      // changed (D:L478907-478912); this frame takes the mark (`FUN_005be5f0` D:L475036-475047): +0.5 exertion, capped.
      const hand = turretId ?? handItem ?? held;
      if (handLast && hand !== handLast.hand && set !== handLast.set) accuracy.reticleSetChanged();
      handLast = { hand, set };
      reticle.setSet(set);
      // LATER 164 (research 321 s2.5): set 0 laid in view state 2 -- a THERMAL turret's (research 84 X10, Z2) -- shows the
      // scope's tube over the cross (`ChangeReticule` D:L69663-69670). The original lays it at a set change and at every view
      // change while a lens plays (`FUN_001f0750` D:L52912-52920 -> `FUN_005be570(kit, 1)`), and the six maps with a THERMAL
      // turret hold every lens zAnim it plays (research 321 s2.5); so the page asks it each frame.
      reticle.setTube(set === 0 && zoom.state() === 2);
      reticle.setMeter(turretId !== null ? 0 : hands?.throwPower?.() ?? 0);
      const scoped = turretId ?? held;
      if (scoped !== scopeBitmapsOf) { scopeBitmapsOf = scoped; reticle.setScopeBitmaps(scopeBitmaps(scoped)); }
      // Grey while the aimed point is inside the selected record's arming distance -- a rocket launcher's or its rocket's
      // only (ARMING-GREY, `armingGreyOf`; R94.16; the range finder's metres x 10).
      const arming = roundArming();
      const aimed = arming === null ? null : rangeFinder.measure(walk.grid(), walk.fireAim(), performance.now() / 1000);
      // WEAPON: the accuracy pip (FUN_005aa6e0 / FUN_00215250): where the raised muzzle's ray is blocked short of the aim.
      // PB-2b F2: none mounted -- the rifle rides the back (TURRET_HELD_WEAPON_READING) and the hand is the turret's.
      const block = play.weaponStats().raise.weight > 0 && !zoom.scoped() && !item && !hands?.mounted() ? fire.blockedMuzzle() : null;
      let pip: [number, number] | null = null;
      if (block) {
        const [bx, by] = aimPoint(fly.camera, block);
        const f = reticle.state().frame;
        if (f.height > 0) pip = [(bx - nx) * f.width * (448 / f.height), (by - ny) * 448];
      }
      // NU-3b C4, C5 (research 321 sections 4.1-4.2; `FUN_00215c10` D:L69908-70292): the blocked muzzle's grey (the pip's
      // offset against the bloom's unhalved size), the empty black, the target's colour, its name and a teammate's bar, the
      // arming grey, the climbing grey. Was: `armingColour('rest', ...)`, the rest and the arming grey alone.
      // AD-3: the perception's pass first (the controller's, every frame), then the target with its mark; the round's type
      // and the page's side for the ESCORT rule (`FUN_002c30b0`).
      const pick = aimPick();
      perceive(dt, pick?.id ?? null);
      const net = d.net();
      const drawn = reticleTargetState({
        blocked: pip, size: accuracy.state().size, empty: handEmpty(), c4: handItem === ITEM.C4, target: aimTarget(pick),
        scoped: zoom.view() === 'scope' && !item, online: net !== null,
        gameType: net?.gameType?.() ?? null, observerTerrorist: net?.client.role === 'player' && net.client.team === 'terrorist',
        teammateNames: d.hud.teammateNamesOn(),   // NU-9 T4: the valve the HUD read at the mount (research 329 §4.3)
        aimed: aimed === null ? null : aimed * 10, arming, climbing: reticleClimbing(walk.traversal()?.clip?.()?.clip),
      });
      reticle.setColour(drawn.colour);
      reticle.setTarget(drawn.name, drawn.bar);
      reticle.setPip(pip, zoom.state() > 4, dt);
    },
    showReticle: (renderer, walking, tacMap, scoreboard, spawned) => {
      // No reticle while dead -- the death camera to the spawn (`FUN_00216770` L70413: ChangeReticule -1; `reticleShown`).
      // PAR-94 B2: none before the room's spawn of the page either (the HUD's actor gate, `FUN_001f7ff0` D:L56631).
      reticle.setVisible(reticleShown({ walking, spawned, dead: walk.isDead(), tacMap, scoreboard, screenUp: d.net()?.screenUp() ?? false }));
      reticle.render(renderer);
    },
    feedHud: (walking, extra = {}) => {
      hud.setC4FuseBar(hands?.c4Fuse?.() ?? null);
      // WEAPON: the firearm's own icon; the throwable's or launcher's HUDW icon while it is up.
      hud.setWeaponIcon(hands?.icon() ?? kitIcon(kit.item()));
      // No fire-mode row with a throwable, a charge or the Detonator up (FUN_005bc300); PAR-56: mounted, the turret
      // slot is up whatever was (FUN_005463c0 D:L412218, research 215 s8): the row is its class's; unknown, shown.
      const turret = hands?.mounted() ? hands.weapon?.() ?? null : undefined;
      hud.setFireModeRow(turret === undefined ? !hands?.itemUp() : turret === null || fireModeRowShown(turret));
      // PAR-55 (research 215 s8): mounted, the row is the turret's slot's own mode, no round's icon; the firearm's back after.
      const held = hands?.fireMode?.() ?? null;
      if (held !== null) {
        heldMode = true;
        const m = HUD_FIRE_MODE[held as 1 | 2 | 3];
        if (m) hud.setFireMode(m);
        hud.setFireModeIcon(null);
      } else if (heldMode) { heldMode = false; showFireMode(); }
      hud.feed({
        // An item up: its count (research 85; a launcher's rounds, research 94 §C9); mounted, the turret's
        // (TURRET_AMMO_HUD_READING); else the firearm's magazine.
        magazine: hands?.magazine() ?? fire.state().magazine,
        // LATER 403 / 414: the stance word shows when the stance is TAKEN -- FUN_00221c40 draws actor+0x374 only once
        // FUN_00582500 reads and clears actor+0x105f bit 0 (D:L75029-75037, D:L442890-442900): the walker's bit
        // (`takeStanceTaken`), read once a frame, mounted too -- the mount's FUN_002956e0 casts the turret to a CZSealBody,
        // finds none and takes its controller's actor (D:L139718-139722), which the mount made the SEAL's own controller
        // (FUN_005463c0 D:L412189), so the shown actor stays the SEAL (LATER 414's review).
        yaw: fly.pose().yaw, ...(walk.takeStanceTaken() ? { stanceTaken: walk.stance() } : {}),
        climb: extra.climb,   // the traversal's climb (absent: none fed)
        range: walking ? rangeFinder.measure(walk.grid(), walk.fireAim(), performance.now() / 1000) : null,
        nearby: extra.nearby ?? null,                  // the page's action prompt (`/testroom`'s doors, switches, bomb, turret)
        position: walking ? feetXZ() : null,
      });
    },
    clearMap: (map) => {
      reticle.setBitmaps(map.reticle, map.hud?.[FONT_TEXT_01.texture] ?? null);   // NU-3b C4: the target's name's font
      fire.reset();                                   // a new map: no marks, full magazines
      effects.setData(null);                          // EFFECTS: the old map's effects go; the new map's follow it
      fire.setMarks(null);
      fire.setPenetration(null);
      fire.setBitmap(map.bulletMark);                 // decals.rdr's bullet mark off EFFE_TXR, or the dark disc
    },
    setWorld: (built) => {
      // EFFECTS (research 89 §5, §13): a mark and a footprint take the drawn world's colour under them, and are clipped to
      // its triangles, shaded per vertex, as `FUN_003b3ab0` builds them.
      const shade = surfaceShade(built.group);
      fire.setShade(shade);
      effects.setShade(shade);
      const clipper = new MarkClipper(built.group);
      fire.setClip(clipper);
      effects.setClip(clipper);
      return { shade, clipper };
    },
    setView: (map) => {
      // The map's own vertical field of view: `m_vfov` is a half-angle in radians, 24.5 degrees on all but one map.
      if (map.camera) {
        baseFov = (2 * map.camera.vfov * 180) / Math.PI;
        accuracy.setFov({ hfov: map.camera.hfov, vfov: map.camera.vfov });
      }
      zoom.reset();
      accuracy.reset();
      // Research 84 section 14: a night map's zoom steps into the night vision (NightMission, CWorld+0x5dc), its lens colour.
      zoom.setNight(!!map.night?.mission);
      nightLens = map.night?.lens ?? null;
      fly.setFov(baseFov);
      lastFov = -1;
    },
    setEffects: (data) => {
      effects.setData(data);
      if (!data) return;
      lensRows = new Map(data.lenses ?? []);          // research 94 section C7: the scope lenses' SCALE_COLOR rows
      // A scope's lens re-applied from the new rows on the next frame (the goggles' rows are the map's, not this data's).
      if (lensOn && lensOn !== 'goggles') { setLensRows(null); lensOn = null; }
      fire.setMarks(effects.marks());                 // decals.rdr's row per surface material, or the one mark
      // ACCURACY (research 84 section 13): the round goes through what the game lets it -- the material byte's name (the
      // effects' table: built-ins, then SOILS; 0 the map's DefaultMaterial) to its material: its PENETRATION for the round,
      // its flags too for the eye's aim ray (`FUN_005aa6e0`'s pass rule, research 84 §19: `Fire.setMaterials`).
      fire.setMaterials((byte) => {
        const name = byte === undefined ? undefined : effects.materialName(byte);
        return (name ? SOIL_MATERIAL.get(name) : undefined) ?? SOIL_TABLE[0]!;
      });
    },
    // MATCH-04: the page's own death -- FUN_00547af0 sets the view state to 0 (D:L413083, D:L413095) and the camera's
    // projection to 1.0 at once (FUN_0029b2f0, D:L413084): `Zoom.reset`. The knock cleared with it is the page's
    // [reading]: what clears the kit's +0x20/+0x24 at a death or a spawn was not found (research 101 A30).
    died: () => { zoom.reset(); accuracy.leaveScope(); deathRumble(rumble); },   // CTL-2: FUN_00547af0's motors
    hurt: () => { hurtRumble(rumble); },                                          // j5t3o2iU: FUN_00597b00's motors
    shotRumble: (r) => { shotRumble(rumble, r); },
    roundEffects: (e, id) => {
      // MAP-10b: a mounted body's round leaves the turret's firepoint (`mountedMuzzle`), not the rifle in its hand.
      // A browser adaptation: a hidden tab starts no effect run for it (`onVisibility`); its sounds below still play.
      if (!pageHidden()) {
        const mounted = d.mountedMuzzle?.(id) ?? null;
        effects.onRound(e, mounted ? { node: new Matrix4().fromArray(Array.from(mounted)), muzzle: [0, 0, 0] } : remote.weaponFrame(id), false);
      }
      sound?.roundFired(e);
      // LATER 644 (research 81 "A round passing"): `FUN_00598000` takes a projectile's segment against the
      // player's place (`+0x1c`, the feet; the `CSealCtrl` vtable's slot +0x44) and plays `.BUL_PASSING` within 20
      // (D:L454629-454637), skipping only a round this console's player fired (`+4` bit 3, set at `FUN_005c5340`
      // D:L479363-479364; D:L454627) -- no tracer or team test. Another's round, then, on its whole path: to the
      // round's end past a body (`tracerTo`, P12b), else `to` (research 81 s13). The page's own rounds never come here.
      const feet = walk.feet();
      if (feet) sound?.roundPast?.(e.from, e.tracerTo ?? e.to, feet);
    },
    roundImpact: (e) => { if (!pageHidden()) effects.onRound(e, null, false); },   // INT-NET-2: the own round's blood, the room's body hit (a hidden tab's: none, `onVisibility`)
    turretCone: () => {
      const turret = mountedRecord();
      if (turret) accuracy.setWeapon(turret);                    // the turret slot's record, as `gunFrame` names it each frame
      return accuracy.cone(zoom.state(), zoom.magnification());
    },
    turretRound: (record, from, dir, frame, count) => {
      // TURRET-CONE P1 (research 215 s8.2): every mounted round runs the kit's round step on the selected slot's record --
      // `FUN_005be9a0` D:L475604 -> `FUN_005c5340` (the slot's record, D:L479219) -> `FUN_005c3360` (D:L479542) -- which
      // mounted is the turret's (`gunFrame` sets it, `mountedRecord`): at its stance row (`TURRET_RETICLE_STANCE_READING`,
      // `FUN_0058a720(body, 1)` D:L477722) the bloom `+= TargetDilateUponFire x (1 + the burst scalar)` clamped to
      // `[TargetMin, TargetMax]` (D:L477797-477805), its `ReticuleKnock` (0 on every turret's 'stand') and the knock's clamp
      // at its `ReticuleKnockMax` (D:L477784-477795), the exertion's 0.35 -- `Accuracy.round`, the rifle's. The line came
      // in rolled already (TURRET-CONE P2: `TurretPage.round` on `turretCone()`, asked before this bloom, P1's review F2),
      // and the room bounds the claim of it inside its own run of the cone (`room.ts` `turretRound`, TURRET-CONE's room
      // half). Class 230's launched round the same, before its own path below.
      if (accuracy.round(zoom.state(), TURRET_RETICLE_STANCE_READING).dropZoom) setZoom(1);   // FUN_005c5340, as the rifle's
      shotRumble(rumble, record.rumble);                                // CTL-2: FUN_005c3360's motors, the turret's record
      // PAR-59 (research 215 s8): MGL FRAG TURRET (class 230) fires no bullet (`FUN_003d1e20`): its own round, launched from
      // the firepoint at its `Muzzle_Velocity` down the gun's line as the room launches it (`room.ts` `turretLaunch`), flown
      // here as a launcher's round is (`FirearmHands.launched`: the flight, the zAnim) -- no line drawn, nothing sent.
      if (itemClass(record.id) === 'turret2') {
        const round = loadouts.tables()?.rounds.get(record.id)?.record;
        if (!round) return;
        const mv = round.muzzleVelocity;
        hands?.launched(round, [...from], [dir[0] * mv, dir[1] * mv, dir[2] * mv]);
        return;
      }
      const drawn = fire.drawRound(from, dir, record.maximumRange * UNITS_PER_METRE, record.piercing ?? 0, record.id, count);
      if (!drawn) return;
      const e: Extract<FireEvent, { type: 'round' }> = {
        type: 'round', weapon: fireWeaponOf(record), from: [...from], to: drawn.to, hit: drawn.hit !== null, rounds: 0,
        normal: drawn.hit ? [...drawn.hit.normal] : null, material: drawn.hit?.material ?? null,
        ...(drawn.tracer ? { tracer: true as const, tracerKind: 'turret' as const } : {}),
      };
      effects.onRound(e, frame ? { node: new Matrix4().fromArray(Array.from(frame)), muzzle: [0, 0, 0] } : null, false);
      for (const t of drawn.through) effects.onRound({ ...e, to: t.point, normal: t.normal, material: t.material ?? null, hit: true, tracer: undefined, tracerKind: undefined }, null, false);
      sound?.fireEvent(e);
    },
    dispose: () => {
      rumble.reset(); rumbleOut(rumble.bytes(), padActuator());   // CTL-2: no motor left running past the match
      hud.setC4FuseBar(null);
      walk.setLookContext?.(null);
      for (const off of offs) off();
      fire.release();
      fire.unbindKey();
      fire.dispose();
      scene.remove(fire.object);
      effects.setData(null);
      effects.reset();
      scene.remove(effects.object);
      reticle.setBitmaps(null);                         // its textures and materials freed (`Reticle.clear`)
      if (lensOn) { setLensRows(null); setNightVision(null); lensOn = null; }   // the page-wide lens let go
      play.setWeaponInput(() => ({ trigger: false, aiming: false }));
      heldKit = { rifle: null, pistol: null };
    },
  };
}

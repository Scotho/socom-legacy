import { Matrix4, type Object3D, type Scene } from 'three';
import { CLAYMORE_RULES, EMPTY_ITEM, itemClass, launchReportItem, type KitTable, type ThrowableRecord } from '@s2u/scene';
import type { GameAudio } from './audio';
import type { FlyCamera } from './camera';
import { EQUIPMENT_SLOTS, equipmentKind, launcherLowerSeconds, slotSelectable, throwableOf } from './equipment';
import type { KitRounds } from './firearms';
import { WhiteOut } from './flash';
import { GrenadeThrower, type GrenadeItem, type PiercedRecord } from './grenade';
import { InventoryMenu, type InventoryKit, type SlotInfo } from './inventoryMenu';
import type { LoadedMap } from './loadMap';
import type { PlayerLoadout } from './loadout';
import { CAMERA_BLAST_EXEMPT_ITEMS, muzzleAnimation } from './effects';
import { explosionShake, type Shake } from './look';
import type { BoxMagazine, FirearmHands, MatchFirearm } from './matchFirearm';
import type { PART_DEPS } from './matchNet';
import type { PoseLayer } from './animator';
import type { NetPage, NetPageDeps } from './netPage';
import type { Play } from './play';
import { handGrenade } from './weaponRaise';
import { meterPower } from './reticle';
import { launcherMovingLowerSeconds } from './mover';
import { RocketLauncher } from './rocket';
import type { SceneHealth } from './sceneHealth';
import type { SurfaceShade } from './surfaceShade';
import type { MarkClipper } from './markClip';
import { ThrowPose, throwPoseEnds } from './throwPose';
import type { WalkMode } from './walk';
import type { WorldView } from './world';
import { fireRefused } from './zoom';

/**
 * MATCH-THROW (web research 222 §8): what else is in the hand -- the throwables and charges (`./grenade`, research 85),
 * the LAW and the RPG-7 (`./rocket`, research 94 §C4), the flashbang's blind (`./flash`), the throw's clip on the body
 * (`./throwPose`) and the R2 inventory that takes them up (`./inventoryMenu`, SOCOM II's `CWeaponSel`) -- written once for
 * both pages' matches: `/testroom` (`./main`, where they were module-level wiring) and the front end's (`./matchMount`).
 * The part plugs into the firearm as its `FirearmHands` (`hands`) and hands `NetPage` the throwables' hooks
 * (`./matchNet` `PART_DEPS.throwables`: `netDeps`). Every throw, charge, Detonator and launcher change goes to the room
 * only through `NetPage.throwEvent` (the room validates each); a round mode's round is the firearm's (`throwEvent` there).
 * Its sounds are the match's audio's (`./matchSound`'s `GameAudio`), its effects the firearm's (`effects.play`). Every
 * line is the one `main.ts` held; nothing here imports `./main` or reads page markup (OT.R12).
 */

/**
 * NU-8b B4 (research 326 section 1.1 and section 6 B4, D7; reading, pending review): the take-up's blend, seconds -- the
 * selector `FUN_005a64c0` snapshots the pose drawn (`FUN_0028e3e0`, D:L461917) and sets both of the body's blend words to
 * 0x3e99999a, 0.3 (D:L461919-461920), pushing nothing and changing no play.
 */
export const TAKE_UP_BLEND = 0.3;

/**
 * NU-8b B4 (research 326 section 6 B4 and section 7; reading, pending review) [reading]: which of the page's take-ups ask
 * the body's `TAKE_UP_BLEND` cross-fade. Built: a throwable, the claymore or the PMN taken up (`GrenadeThrower`'s `equip`
 * true) -- the kit's class handed to the selector is 3 for 0x79 and 0x97, 0 for every other item not a firearm or a
 * launcher (`FUN_005c1660` D:L476709-476734), and both take its `bVar6` branch from a firearm or another such item
 * (D:L461889-461895, D:L461916-461920) -- **not from a raised launcher**: with the hand word `+0xf79` at 4 (set by the
 * raise, `FUN_005a6d30` D:L462119) the selector goes to `FUN_005a6b70` instead (D:L461870-461876), which lowers the
 * launcher through its own clip (`FUN_00588bc0`, D:L462043-462093) and asks no snapshot (NU-8b's review, F1). It runs
 * in the kit's frame (`FUN_00551ec0` D:L418611 -> `FUN_005dfc80` ->
 * `FUN_005c1660` D:L494228), after the driver and its blend (D:L418454-418455), so the frame drawn next has run one tick
 * of it, as a push has (PAR-67's frame order; `PoseLayer.crossFadeRun`). Not built, named: (a) the put-away after a
 * take-up from a launcher (`FUN_005a6b70` wrote the word 0 or 3, D:L462086, so the block D:L461896-461914 runs) asks the
 * same 0.3 s; the ordinary put-away to the firearm (the word still 1 or 2) takes the swap's branch, no snapshot
 * (D:L461927-461929, D:L461966-461968). Was: "(a) the put-away to the firearm the hand already holds takes the same
 * branch (D:L461896-461914) and asks the same 0.3 s -- outside B4's row" -- the review's F2;
 * (b) C4's Action-button plant (`plantC4`), whose switch and `Put on wall` push fall in one frame, their order not read;
 * (c) the Detonator's switches, the placement's own mid-clip one among them (`FUN_005c8a20`, not read); (d) the others'
 * bodies, where no take-up is on the wire (`REMOTE_TAKE_UP_FADE_READING`, research 326 section 7). Settles: capture NU8-1
 * (the take-up's check in a stride).
 */
export const TAKE_UP_FADE_READING = 'a throwable, the claymore or the PMN' as const;

/**
 * M203-FIRE-SOUND (issue #285; research 94 §C4.5): the kit another's launch report is found in when the page holds none
 * for its owner (no `remoteKit`, or an owner it has no kit for) -- none, so a report the kit leads to (the M79's, a
 * rocket launcher's: `FUN_005c67d0` D:L479676-479708) stays silent, and the round's zAnim is still heard. The original's
 * copy always holds its owner's chosen kit (research 324 §2); a page without one is the port's own state. The M203's
 * report (the M203 and F2000 rounds, the MGL turret's) needs no kit (D:L479422-479426). Settles: the page's kit for
 * every seat that can launch (a late joiner's, a spectator's), read against the welcome's and the spawn's kits.
 */
export const LAUNCH_REPORT_KIT_READING: readonly number[] | null = null;

/**
 * LATER 192 (research 215 s8.5; reading, pending review): a held launcher pull waits out the raise's refusal alone
 * (`FUN_005c0ae0` D:L476423-476438) and launches on the first frame the raise reads 1; a pull the launcher's own wait
 * refuses -- its take-up clip (`launcherRaiseSeconds`), the round's FireWait -- is dropped, as before. Whether the
 * original fires a held trigger at those waits' end for class 0x91 (the kit's `+0x81c`, D:L476446-476448; the take-up
 * clip's gate) is unread. Settles: those read, or a capture of a LAW pressed and held through its take-up.
 */
export const LAUNCHER_PULL_WAIT_READING = 'the raise only' as const;

/** The R2 inventory's Detonator slot: after the loadout's five, while the kit carries a claymore (`FUN_005c74e0`). */
const DETONATOR_SLOT = 5;

/** What the part reads. */
export interface MatchThrowDeps {
  scene: Scene;
  walk: WalkMode;
  fly: Pick<FlyCamera, 'shakeScreen'>;
  play: Play;
  loadouts: PlayerLoadout;
  view(): WorldView | null;
  map(): LoadedMap | null;
  net(): NetPage | null;
  /** The firearm (`./matchFirearm`), mounted after this part (it takes this part's `hands`): read at a call, never at the mount. */
  firearm(): MatchFirearm;
  /** The match's audio (`./matchSound` `MatchSound.audio`): the throws' zAnims, the bounces' and the blasts' fallbacks. */
  audio: Pick<GameAudio, 'onAnimCallback' | 'onFire' | 'play'>;
  /** The claymore refused (the game's message line, 0x65f880); absent, not shown (both pages: `./matchMessages` `refusalLine`). */
  refuse?(text: string): void;
  /** SUP-03: the page's scene health, whose destructibles are C4's targets; absent, none (C4 refused). */
  world?(): { health: Pick<SceneHealth, 'c4TargetAt' | 'blastAt'> } | null;
  /** Research 304: another's accepted release heard -- a teammate's warning (`./matchSound` `grenadeWarning`); absent, none. */
  warning?(release: { id: number; owner?: number; from: [number, number, number] }): void;
  /**
   * M203-FIRE-SOUND (research 94 §C4.5): another player's kit as the page holds it (`RemotePlayers.playerKit`), or null --
   * where a launch's report is found (`FUN_005c67d0`); absent or null, `LAUNCH_REPORT_KIT_READING`'s.
   */
  remoteKit?(owner: number): readonly number[] | null;
  /** Research 209 §18: the in-page room's tick, so a C4's fallback counts it. Absent off that room. */
  simTick?(): number | undefined;
}

/** The page's other owner of the hand (`/testroom`'s turret, `./matchActions`): asked before this part's own. */
export interface PageHands {
  /** The trigger taken (the turret's); false, this part's. */
  trigger?(down: boolean): boolean;
  /** The box's count while it holds the hand (the turret's), or null. */
  magazine?(): BoxMagazine | null;
  /** Mounted on it: the firearm is still. */
  mounted?(): boolean;
  /** PAR-55: the box's icon while it holds the hand (the turret's HUDW icon), or null. */
  icon?(): string | null;
  /** PAR-55: the fire-mode row's mode while it holds the hand (the turret's slot's own), or null. */
  fireMode?(): number | null;
  /** PAR-56: the item id of the weapon while it holds the hand (the turret's), or null. */
  weapon?(): number | null;
  /** TURRET-AMMO (issue #284): R taken while it holds the hand (the turret's reload sent, `TurretPage.reload`); false, the rifle's. */
  reload?(): boolean;
  /** LATER 97: the held turret's `THERMAL` (its definition's), false with none held. */
  thermal?(): boolean;
  /** LATER 165: the held turret's placement id (`TurretPlacement.id`), null with none held. */
  turret?(): number | null;
  /** LATER 237: this page's own mount on the room's count (`TurretPage.mountTaken`), null with none. */
  mountTaken?(): { after: number; now: number } | null;
  /** LATER 237: the last command this page sent, null offline. */
  commandSeq?(): number | null;
  /**
   * TRIGGER-SWAP fold: null while it owns the trigger (mounted, or its release clip playing); else the turret rounds of a
   * hold still held through the dismount (the kit's count, `FUN_005be9a0` D:L475514-475516), 0 with none.
   */
  heldPulls?(): number | null;
}

/** The throwables part's `NetPage` hooks, as `PART_DEPS.throwables` lists them. */
/**
 * The throwables' NetPage deps: `PART_DEPS.throwables`, owed where the part is on, and `roundEndEffects`
 * (ROUND_END_EFFECTS_READING), handed with them but optional in `NetPageDeps` -- a page with the part off has no effects to
 * stop at the engine's read.
 */
export type MatchThrowNetDeps = Required<Pick<NetPageDeps, (typeof PART_DEPS)['throwables'][number] | 'roundEndEffects'>>;

export interface MatchThrowables {
  readonly grenade: GrenadeThrower;
  readonly rocket: RocketLauncher;
  readonly throwPose: ThrowPose;
  readonly whiteOut: WhiteOut;
  readonly inventory: InventoryMenu;
  /** The firearm's `FirearmHands`: this part's, with the page's other owner (`/testroom`'s turret) asked first. */
  hands(page?: PageHands): FirearmHands;
  /** The throwables' `NetPage` hooks (`PART_DEPS.throwables`). */
  netDeps(): MatchThrowNetDeps;
  /** A kit slot up (`FUN_005c4b10`): the firearms, the equipment, the Detonator -- the shoulders' and the number keys'. */
  takeSlot(slot: number): boolean;
  /** The R2 inventory's view of the kit. */
  inventoryKit(): InventoryKit;
  /** The slot in the hand (`FUN_005be040`). */
  inventoryCurrent(): number;
  /** The kit's equipment slot 1-3 up: a launcher, a throwable or a charge. */
  selectEquipment(slot: 1 | 2 | 3): boolean;
  /** The HUD weapon box's icon: the launcher's, the throwable's, else the firearm's. */
  equipmentIcon(): string;
  /** The box's count while an item is up, or null for the firearm's magazine. */
  equipmentMagazine(): BoxMagazine | null;
  /** An equipment slot's item name (the kit table's `InternalName`), null for none. */
  equipmentName(id: number): string | null;
  /**
   * A map: its throwables' models and assets, the disc's throwable records (the map's kit table, LATER 32), the C4
   * targets, the throw's clip stopped.
   */
  setMap(built: WorldView, map: LoadedMap): void;
  /**
   * LATER 32: the page's record for a wire's kind (`GrenadeThrower.recordOf`): the baked ones and the disc's -- the
   * replay's fold reads it (`./replay/mount` `replayClient`'s `throwable`). Null for none.
   */
  throwable(kind: string): ThrowableRecord | null;
  /** The marks' shade and clip of the drawn world (`MatchFirearm.setWorld`'s): the scorches take them. */
  setMarks(m: { shade: SurfaceShade; clipper: MarkClipper }): void;
  /**
   * A round's start where the ARMORY's glue does not carry it (the front end; `/testroom`'s `newRound` clears the same
   * through `./armoryGlue`): what is in the air or set down gone without a blast (ROUND_START_PROJECTILES_READING, the
   * room's `clearAir`), the scorches' pool emptied (CMPExitState L76084 -> `FUN_003bf050(0x4b5050)`), the flashbang's wash
   * neutral -- a blind begun in the last round does not outlive the level it was set off in.
   */
  roundStart(): void;
  /**
   * Research 90 #23: the throw's arc and a blast's scorch (`GrenadeThrower.warmObjects`, one set a map) handed to the
   * page's renderer to compile ahead of the first throw -- `/testroom`'s `warmWalk` and the front end's map.
   */
  warm(prepare: (objects: readonly Object3D[]) => Promise<void> | void): Promise<void>;
  /** The frame, after the gun's: the throw clip's callbacks heard (`throw_whoosh`). */
  poseFrame(dt: number): void;
  /**
   * The frame, after the sound's: the throws, the launcher, the flash's wash; its glow for this frame's render. PAR-34
   * (research 252 s3; ACT.R8): `real`, the frame's real seconds (`./frameTime`; default `dt`), is what the grenades' timed
   * rules and the wash's blind count; the launcher's rate keeps the clamped step, the command clock the room checks
   * (`room.ts` `launchRocket`: `p.ran < p.rocketWaitUntil`).
   */
  frame(dt: number, real?: number): { passes: number; fix: number };
  /** Everything let go: off the scene, the listeners off, the wash stopped, the menu closed, the map's assets gone. */
  dispose(): void;
}

/** A point as the effects' place: a node at it (the sources that follow their caller's node), up, still. */
export function grenadePlace(pos: readonly number[]) {
  return {
    node: new Matrix4().makeTranslation(pos[0]!, pos[1]!, pos[2]!), position: [pos[0]!, pos[1]!, pos[2]!] as [number, number, number],
    normal: [0, 1, 0] as [number, number, number], velocity: [0, 0, 0] as [number, number, number],
  };
}

/** The disc's throwable records of a kit table (`KitTable.throwables`, research 94 §C5); none without it. */
function throwableRecords(table: KitTable | null | undefined): PiercedRecord[] {
  return [...(table?.throwables?.values() ?? [])];             // with each round's Piercing (the scene blast, AD-5)
}

/**
 * The camera's shake for a script round's blast point (`./effects` `Effects.setBlastPoint`; `FUN_003c8330`
 * D:L319186-319195 sets the pending point): `explosionShake` of the distance from the SEAL's feet, as the grenades'
 * `explode` listener shakes (research 83, `FUN_00550ef0`; `GrenadeThrower`'s `distanceToPlayer`). No SEAL: none.
 */
type P3 = readonly [number, number, number];
export function blastPointShake(at: P3, feet: P3 | null | undefined): Shake | null {
  return feet ? explosionShake(Math.hypot(at[0] - feet[0], at[1] - feet[1], at[2] - feet[2])) : null;
}

export function mountThrowables(d: MatchThrowDeps): MatchThrowables {
  const { scene, walk, fly, play, loadouts } = d;
  /**
   * OBF-31 (`./matchSound` `ROUND_SCREENS_STOP_ALL_READING`): a round screen up -- MPExitState alone is ticked
   * (`FUN_002ce9e0` D:L171877-171888), so no throw, rocket or charge is taken and none of this part's sounds starts
   * (a throw's zAnim, a launch's report, a bounce's or a blast's fallback, another's release). The engine's 3 s unchanged.
   */
  const screens = (): boolean => d.net()?.screenUp?.() ?? false;   // no NetPage (offline), never
  /** OBF-31 (N3): whether a screen was up at the last frame. */
  let screensWere = false;
  const audio: MatchThrowDeps['audio'] = {
    onAnimCallback: (name, at) => (screens() ? null : d.audio.onAnimCallback(name, at)),
    onFire: (name, at) => (screens() ? null : d.audio.onFire(name, at)),
    play: (...args) => (screens() ? false : d.audio.play(...args)),
  };
  const firearm = (): MatchFirearm => d.firearm();
  const offs: (() => void)[] = [];
  /**
   * M203-FIRE-SOUND (issue #285; research 94 §C4.5): a launched round's report at its launch point -- `FUN_005c5340`
   * plays the fire sound of the record the launch shows (`launchReportItem`: the M203's for its rounds and the MGL
   * turret's, D:L479422-479426; else the carrier in `kit`, `FUN_005c67d0` D:L479676-479708) by the camera's distance
   * (`FUN_003d2c50` D:L479449-479450 -> `GameAudio.onFire`: the M203's and M79's Close alone, `.RPG_7` at all three),
   * before the round's own fire launches it. None when the kit leads to no record.
   */
  const report = (round: number, kit: readonly number[] | null, at: [number, number, number]): void => {
    const id = launchReportItem(round, kit);
    const name = id === null ? undefined : loadouts.tables()?.arsenal.items.get(id)?.name;
    if (name) audio.onFire(name, at);
  };
  /**
   * The throwables (`./grenade`, socomlegacy/docs/research/85): the kit's equipment slots through the R2 inventory (the
   * game's `CWeaponSel`, `./inventoryMenu`; `3`/`4`/`5` a development build's) -- and the trigger throws: held for power,
   * let go to throw. The throw's clip plays on the body (`./throwPose`; the pistol's version with the sidearm in the
   * hand), the grenade rides the right hand's `grenade` node (`Play.itemNode`) with the firearm left on its own mount
   * (research 85 s8.1), and leaves the posed hand.
   */
  const grenade = new GrenadeThrower({
    grid: () => walk.grid(), snapshot: () => walk.snapshot(), view: () => walk.view(),
    hullGrid: () => walk.gridOfGround(),               // PAR-46a (research 283 s8): the throws' hull walking or not
    handPoint: (part, p) => play.partPoint(part, p), heldNode: () => play.itemNode(),
    pistol: () => firearm().item() === 'pistol',        // `+0xf79` 2: the throw's and the placing's pistol versions
    viewState: () => firearm().zoom.state(),            // the arc: none in the 9x view or a scope, pale in the night vision
    attachToNode: (path, mark) => d.view()?.attachToNode(path, mark) ?? null,   // EFFECTS: a scorch rides a door's leaf too
    holdOnNode: (path, gone) => d.view()?.holdOnNode(path, gone) ?? null,        // LATER 277: and goes with a node switched off
    aim: () => walk.fireAim(),                          // SUP-03: C4's target is the destructible under the reticle
    online: () => d.net() !== null,                     // NET-CAP: the page predicts the room's cap only where a room judges its throws
    simTick: () => d.simTick?.(),                       // research 209 §18: the in-page room's tick, the C4 fallback's clock
    dead: () => walk.isDead(),                          // THROW-INTERRUPT (research 326 §2.4): the room's death cuts a throw not yet let go
    fireAllowed: () => walk.fireAllowed(),              // P36 (TB-12): the playing clip's NoFire, the room's 'nofire' (FUN_005a7de0 D:L457365)
    // M7: the actors an armed PMN tests (`FUN_00543930`): the page's SEAL and the match's other living bodies.
    actors: () => {
      const own = walk.feet();
      const others = (d.net()?.client.bodies() ?? []).filter((b) => (b.flags & 64) !== 0).map((b) => [b.feet[0], b.feet[1], b.feet[2]] as [number, number, number]);
      return own ? [[own[0], own[1], own[2]] as [number, number, number], ...others] : others;
    },
  });
  scene.add(grenade.object);
  /**
   * THROW_DIAG_ADAPTATION (LATER 247; a browser instrument with no original, changing nothing): a development build's
   * `window.__throwDiag()` -- the thrower's `diag` and the walk's snapshot's peek, lean clip and traversal clip, read at
   * the call. Under the literal `import.meta.env.DEV`, which every `vite build` replaces with false and folds away.
   */
  const diagHost = globalThis as unknown as { __throwDiag?: () => unknown };
  if (import.meta.env.DEV) {
    diagHost.__throwDiag = () => {
      const s = walk.snapshot();
      return { ...grenade.diag(), peek: s?.peek ?? 0, lean: s?.leanClip === true, traversalClip: s?.traversal?.clip ?? null };
    };
  }
  /**
   * M7 (`./rocket`, research 94 §C4): the LAW and the RPG-7 -- equipment, raised from their slot, fired with the
   * trigger: the rocket straight at the point under the reticle, the backblast behind.
   */
  const rocket = new RocketLauncher({
    snapshot: () => walk.snapshot(), grid: () => walk.grid(), aim: () => walk.fireAim(),
    heldNode: () => play.heldNode(), carryNode: () => play.launcherNode(),
    model: (name) => d.view()?.held(name) ?? null, points: (name) => d.map()?.weapons?.[name]?.points ?? [],
  });
  /**
   * The firearm stowed while a launcher is up; a throwable or a charge leaves it in the hand (`FUN_005a64c0`
   * D:L461887-461920: no re-parent for class 3 -- the throw and placing clips' `rifle` track carry it; research 85 s8.1).
   */
  const stowRifle = (): void => play.setRifleStowed(rocket.up());
  /** The throw's clip over the locomotion, a pose layer as the reload is. */
  const throwPose = new ThrowPose(() => play.motionSource());
  /**
   * NU-8b B4 (`TAKE_UP_FADE_READING`): a take-up's cross-fade asked of the body on the next frame drawn, a push's request
   * (`PoseLayer.push`: the snapshot whatever else started), with the frame's tick already run (`crossFadeRun`).
   */
  let takeUpFade = false, poseDt = 0;
  const bodyLayer: PoseLayer = {
    sample: (c) => {
      const over = throwPose.layer.sample(c);
      if (!takeUpFade) return over;
      takeUpFade = false;
      return { ...(over ?? { parts: [], weight: 0 }), crossFade: TAKE_UP_BLEND, crossFadeRun: poseDt, push: true };
    },
  };
  play.addPoseLayer(bodyLayer);                         // the grenade's throw clip over the locomotion (`./throwPose`), and the take-up's fade
  /**
   * NU-8a B1 (research 326 §6 B1): the hand's item to the rifle's raise (`Play.setItemRaise`, `./weaponRaise`): a hand
   * grenade up with one left (the class 'y': down at once with the trigger idle, D:L453598-453600; the last one's launch
   * brings the firearm back, `THROW_LAST_GRENADE_RAISE_READING`), its wind-up (asks nothing, D:L453507-453517), and a
   * claymore's or a PMN's trigger, the firearm's rule (D:L453633-453634; a press shorter than a frame kept). The
   * Detonator's trigger is not fed (research 326 §7: its raise with no envelope is not read, not built), nor C4's
   * Action-button plant (`ACTION_PLANT_RAISE_READING`). The play stand-ins of the part's tests carry no feed.
   * LATER 192 (research 215 s8.5): a raised LAW's or RPG-7's trigger too -- class 0x91 is not 'y', so its press asks the
   * raise (D:L453633-453634), under the firearm's times (`FUN_003d1d90` in `FUN_005c4b10` D:L478849-478857: the page's
   * `RAISE_TIMES` off a mount, `./matchFirearm` `kitFrame`).
   */
  let placingDown = false, placingPress = false;
  /**
   * LATER 192 (research 215 s8.5; reading, pending review): the launcher's trigger held, a press since the raise last read
   * it (a tap shorter than a frame kept, as a placing's), and a pull the raise refused, asked again each frame while held.
   */
  let launcherDown = false, launcherPress = false, launcherWaits = false;
  /**
   * TRIGGER-SWAP (2026-11-09; reading, pending review): the kit pull count `kit+0x818` the hands' item raised since the
   * trigger's last press, handed to the firearm with a trigger still held (`FirearmHands.heldPulls`). A hand throw's launch
   * raises it (`FUN_005c1970` D:L477023-477025) and `FUN_005c0ae0`, run on every kit frame `FUN_005c1970` passes (the
   * launch's own among them, D:L476564-476569), zeroes it at edge 0 or 3 (D:L476380-476382, D:L476399-476400); the edge
   * `+0x118` is 2 a press, 1 held, 3 a let-go, 0 idle (D:L453543-453567). GRENADE-RETHROW folds (reviews F1, F3; reading,
   * pending review): the port's throw is released at the let-go and launched when its hand opens (`pending` -> `letGo`).
   * A press after the hand opened: the button was up at the launch, its 1 zeroed in that same kit frame -- 0, last grenade
   * or not. A press while the throw is pending (before its hand opens): 0 as well, last grenade or not -- capture GR-1 (research 326
   * §7.2; the class-0x79 path, 3/3, ±0) reads `+0x818` 0 from the launch through the pop and after: with a grenade in the
   * slot the re-arm's remap holds the edge at 0 through the pending window (D:L453633-453660), so the launch's own kit
   * frame zeroes the count at the edge 0 (`FUN_005c0ae0` D:L476380-476382, called at D:L476566-476569; the mechanism a
   * reading, pending review); was: 1 until the pop, then 0 with one left and 1 on the slot's last. Or 1 when a rocket
   * left (the launcher's class through `FUN_005be9a0`'s round branch, D:L475514-475516); else 0. The wind-up itself raises
   * none (the throwable's class 'y' branch, D:L475490-475512).
   */
  let holdPulls = 0;
  /**
   * TRIGGER-SWAP fold (reading, pending review): when the last rocket's FireWait on the kit's one rate timer `kit+0x81c`
   * runs out (page time, ms; 0 none) -- the launch writes it (`FUN_005be9a0` D:L475514-475517) and the firearm's round is
   * refused while it runs (`FUN_005c0ae0` D:L476446-476448), a slot change leaving it (`FUN_005c4b10`). Handed to the
   * firearm at the lower (`Fire.holdWait`), run down meanwhile on the page's clock as the launcher's own wait is
   * (KIT_TIMER_TICK_READING: the original runs it down only on the kit frames `FUN_005c1970` lets through,
   * D:L476565-476569, D:L476643-476647, unread for the lower clip).
   */
  let kitTimerEnd = 0;
  /** TRIGGER-SWAP: a rocket that left raises the hold's count (`holdPulls`), while the trigger is held; the fold: and the kit's timer. */
  const launch = (): void => {
    const e = rocket.pull();
    if (!e) return;
    if (launcherDown) holdPulls = 1;
    kitTimerEnd = performance.now() + (e.fireWait ?? 0) * 1000;
  };
  /** TRIGGER-SWAP fold: the firearm's held trigger suspended at a slot change (`MatchFirearm.suspendTrigger`), else let go. */
  const suspendFirearm = (): void => { const f = firearm(); if (f.suspendTrigger) f.suspendTrigger(); else f.fire.release(); };
  /**
   * LATER 192: the body's raise below 1 refuses the rocket -- class 0x91 is a bullet class (`FUN_003d1e20`
   * D:L324476-324483) and not 0xcd, so `FUN_005c0ae0` refuses every frame below 1 (D:L476423-476438), as the firearm's
   * `raiseRefused` (`./matchFirearm`). A play with no body (the part's tests' stand-ins): none.
   */
  const raiseRefused = (): boolean => (play.weaponStats?.().raise.weight ?? 1) < 1;
  const placingUp = (): boolean => { const held = grenade.held(); return held === 'Claymore' || held === 'PMN Mine'; };
  /**
   * LATER 192's review, F1: the launcher's trigger lets go once the launcher is not up or the body is dead --
   * `RocketLauncher.drop` (OT.R59, `RECONNECT_HELD_LAUNCHER_ADAPTATION`) sends no `equip`, and the dead's controller takes
   * the respawn press alone (`FUN_00592560` D:L451644-451731; the firearm's `beforeNet`, `./matchFirearm`). Asked by the
   * raise's feed (`Play.frame`, before this part's `frame`) and by the part's `frame`.
   */
  const launcherLetGo = (): void => {
    if (rocket.up() && !walk.isDead()) return;
    launcherDown = launcherPress = launcherWaits = false;
  };
  play.setItemRaise?.(() => {
    const held = grenade.held();
    launcherLetGo();
    const press = placingPress || launcherPress;
    placingPress = launcherPress = false;
    return {
      grenade: held !== null && handGrenade(grenade.recordOf(held)?.id) && grenade.stats().left > 0,
      windUp: grenade.phase() === 'holding',
      trigger: placingDown || launcherDown || press,
    };
  });
  offs.push(grenade.on('equip', (on, item) => {
    // NU-8a B1: the placing's own latch let go at the slot change -- the port's: the original's trigger state stays
    // (`FUN_005c4b10` D:L478779-478936 leaves +0x118; TRIGGER-SWAP fold, research 211 §10); a take-up's wind-up is
    // press-only -- the one remap that re-arms a held button is a throw's pop (D:L453484-453500; GRENADE-RETHROW,
    // `THROW_REARM_UPDATES_READING`)
    placingDown = false;
    // NU-8b B4 (TAKE_UP_FADE_READING): the snapshot, unless the launcher is up -- then the launcher's lower clip instead
    // (`FUN_005a64c0` with the hand word 4 -> `FUN_005a6b70`, D:L461870-461876; the review's F1)
    if (on && item !== null && item !== 'Detonator' && item !== 'C4' && !rocket.up()) takeUpFade = true;
    // TRIGGER-SWAP fold (research 211 §10; reading, pending review): the firearm's held trigger suspended, not dropped --
    // no round of it with an item up, but the slot change leaves the trigger and the kit's count (`FUN_005c4b10`
    // D:L478779-478936), so the hold is the firearm's again at the put-away (`MatchFirearm.suspendTrigger`). Was: "a slot
    // change lets a held trigger go", the misreading. Stowed only for the launcher (`stowRifle`).
    suspendFirearm(); stowRifle();
    if (on) rocket.lower();                             // M7: one item in the hand
    if (!on) throwPose.letGo();                         // PAR-85 F1: a throw its hold carries pops at the hold's end
    // Out of the scope to first person with the rifle away [reading: the game's weapon switch, FUN_005c4b10, drops only
    // the night vision, to first person; what a scoped grenade does was not traced -- research 84 section 7]. The
    // binoculars stay (FUN_005c4b10 leaves state 4), and the throw waits for them to come down (FUN_005be9a0).
    if (on && firearm().zoom.state() >= 5) firearm().setZoom(1);
  }));
  // The throw's clip (and the claymore's placing) holds the mover as the game's one-shot does: the ground state stops
  // until the stick may cut it past the clip's NoInterrupt (`Walker.hold`, `HOLD_CLIPS`' header; the owner, 2026-09-29).
  // PAR-85 (research 251 section 12.9, B3): the hold first, then the clip it carries -- a throw on the stack's top pops
  // at its hold's end (`throwPoseEnds`), one the mover refused at its own last key; an end the hold's start heard (a
  // placing it replaced) is the earlier clip's, not this one's.
  offs.push(grenade.on('throwStart', ({ anim, hold }) => { const held = walk.hold(hold); throwPose.start(anim, held); }));
  // PAR-19 D08: the pose ends with its hold. The reason is the thrower's too: a heard end keeps C4's 99 s interim.
  offs.push(walk.onActionEnd((e) => { if (throwPoseEnds(e)) { grenade.noteHoldEnd(e.reason); throwPose.cut(); } }));
  // LATER 529 (F3 of LATER 526's review; research 215 s8.6 "A1"): the turret's take, sent at send time, pops the hold
  // 'replaced' and so the clip; kept first (the thrower's `mountTaken`, before the pop: `./matchActions` `took`), and laid
  // back, run on by the wait, when the room refuses the take and the thrower hands the throw back (`FUN_005463c0` refuses
  // before its take's steps, D:L412131-412166: the original's clip never left the stack).
  offs.push(grenade.on('mountTaken', () => { throwPose.keep(); }));
  // The callbacks the wait crossed (the grunt) are played at the refusal: the page never heard them, the original did (F3).
  offs.push(grenade.on('mountHandedBack', ({ overrun }) => {
    for (const name of throwPose.resume(overrun) ?? []) audio.onAnimCallback(name, walk.drawnFeet());
  }));
  /** THROW-INTERRUPT: the seq of the hand throwable's release request told to the room, until its `throw` or its cut. */
  let startSeq: number | null = null;
  // THROW-INTERRUPT (research 326 §2.4): a throw or a placing cut by the page's own death stops its clip; nothing goes to the room.
  offs.push(grenade.on('cut', () => { throwPose.cut(); startSeq = null; }));
  /**
   * THROW-INTERRUPT (research 326 §2.4): a hand throwable's release request told to the room (`NetPage.throwStartEvent`),
   * its seq echoed by the `throw` as `start` -- the room keeps the throwable in the hand for the original's drop at a
   * death before the hand opens (`FUN_005b8920`). A placing tells none (a charge is cleared unspent, D:L471756-471759).
   */
  offs.push(grenade.on('throwStart', ({ slot }) => {
    const held = grenade.held();
    startSeq = held !== null && handGrenade(grenade.recordOf(held)?.id) ? d.net()?.throwStartEvent?.(held, slot) ?? null : null;
  }));
  /**
   * PAR-77 (research 251 s12.7): the zAnim the page's own release plays -- `FUN_003d22b0(record, 0 < body+0x200)`, the
   * throw's in `FUN_005c5340` (D:L479429-479430) and the placing's in `FUN_005bc730` (D:L474051-474053), the firearm's
   * muzzle pick (`muzzleAnimation`): the FireAnimName in third person, its `<name>_zoom` past it (first person, night
   * vision), which no throwable or charge has on the disc, so none is heard there. The view state is the page's own.
   */
  const releaseAnim = (fireAnim: string): string => muzzleAnimation(fireAnim, firearm().zoom.state() > 0) ?? fireAnim;
  // `c4_start`: .PLACE_CHARGE. M7: the match hears it as a throw of the charge, its facing as the velocity (room.ts `placeCharge`).
  offs.push(grenade.on('place', (info) => {
    audio.onAnimCallback(releaseAnim(info.fireAnim), info.pos); d.net()?.throwEvent(info.item, info.pos, info.facing, info);
    firearm().shotRumble(grenade.recordOf(info.item)?.rumble);       // CTL-2: the placing's fire step (FUN_005c3360)
  }));
  // M7: the Detonator's fire, a throw of it (room.ts `detonate`: the SEAL's claymores within 500 u).
  offs.push(grenade.on('detonate', (info) => { d.net()?.throwEvent('Detonator', info.from, [0, 0, 0]); }));
  /** M7: the firearm may fire again only once the launcher is down (`launcherLowerSeconds`, PF-21; the room holds it so too). */
  let firearmReadyAt = 0;
  offs.push(rocket.on('equip', (on, id, by) => {
    suspendFirearm(); stowRifle();                      // TRIGGER-SWAP fold: suspended, as the grenade's equip above
    // LATER 192: the launcher's own latch let go at the slot change -- the port's, not `FUN_005c4b10`'s (which leaves the
    // trigger state; TRIGGER-SWAP fold, research 211 §10): a launcher raised over a held trigger still waits for a press
    launcherDown = launcherWaits = false;
    // TRIGGER-SWAP fold: a lower hands the firearm what is left of the last rocket's FireWait on the kit's timer
    if (!on) { const left = (kitTimerEnd - performance.now()) / 1000; kitTimerEnd = 0; if (left > 0) firearm().fire.holdWait?.(left); }
    const from = firearm().item() === 'pistol' ? 1 : 0;
    if (by === 'stick') {
      // PAR-83 (research 230 section 5.2.8): the stick's lower -- the room lays it from the same command's stick
      // (`room.ts` `launcherStick`), the walk gave its set back on that command: no event; the firearm in the hand, its
      // round held for the moving lower's life on the second channel (`launcherMovingLowerSeconds`, `FUN_005a7980`
      // D:L462492-462499; the page's clock, as PF-21's below).
      firearmReadyAt = performance.now() + launcherMovingLowerSeconds(from) * 1000;
    } else {
      // The match hears the item now in the hand: the launcher (raised), or the firearm back (room.ts `raiseLauncher`).
      const eye = walk.fireAim()?.eye ?? [0, 0, 0];
      d.net()?.throwEvent(on && id !== null ? equipmentName(id) ?? '' : firearm().record(firearm().item()).name, eye, [0, 0, 0]);
      if (!on) firearmReadyAt = performance.now() + launcherLowerSeconds(from) * 1000;   // PF-21 (research 217 §4.2)
      // PAR-81 (research 230 section 5.2.6): the launcher's set on the walk's commands, as the room lays it at this event's
      // seq (`room.ts` `raiseLauncher` / `lowerLauncher`): the jump refused from the raise's command to the lower's end.
      // PAR-83: the raise from the firearm in hand (its clip), whose end puts the base on top for the stick's lower.
      if (on) walk.launcherRaised(from);
      else walk.launcherLowered(from);
    }
    // A raised launcher stays at first person (FUN_005445b0's state-1 gate; FUN_00216770 drops a launcher round's to 1).
    if (on && firearm().zoom.state() > 1) firearm().setZoom(1);
    firearm().showFireMode();                           // the round's icon in the fire-mode cell while the launcher is up (FUN_00237b40)
  }));
  /**
   * M7 (research 94 §C4.3): a rocket leaves -- flown here as a launcher's round (`GrenadeThrower.launchRound`: the
   * acceleration, no fall, the arming dud, the impact), its trail zAnim heard (`law_trail`, `rpg_trail`), and sent to the
   * match as a throw of the round (the room flies it and deals its blast and its backblast's).
   */
  offs.push(rocket.on('launch', (e) => {
    grenade.launchRound(e.record, e.from, e.velocity);
    report(e.record.id, loadouts.loadout(), e.from);                 // M203-FIRE-SOUND: the launcher's `.RPG_7`
    audio.onAnimCallback(e.record.fireAnim, e.from);
    d.net()?.throwEvent(e.round.name, e.from, e.velocity, undefined, undefined, undefined, e.shot);   // LATER 503: its journal id
    firearm().shotRumble(e.record.rumble);                            // CTL-2: the rocket's fire step (FUN_005c3360)
  }));
  // The claymore refused once four are down: the game's message line (0x65f880) [placeholder: the page's own line].
  offs.push(grenade.on('refuse', (info) => { d.refuse?.(info.text); }));
  // PAR-83 (research 230 section 5.2.8): the walk's stick lowers the launcher (`FUN_00550ef0` D:L418263-418278) on the
  // command it rides; the room lowers it from that command's own stick, so no event goes (`equip`'s 'stick').
  offs.push(walk.onLauncherStickLower(() => { rocket.lower('stick'); }));
  // The throw's zAnim (`frag_start`, `HE_start`: `.THROW_OBJECT`); the bank's own name carries a trailing space. Research
  // 304: the weapon's FireAnimName alone -- a map whose zAnim lacks it hears nothing, no sound stands in. PAR-77: in third
  // person only (`releaseAnim`).
  offs.push(grenade.on('throw', (info) => {
    throwPose.released();                                            // LATER 529 (F1): a refused take's wait past the hand's opening, run on
    audio.onAnimCallback(releaseAnim(info.fireAnim), info.from);
    d.net()?.throwEvent(info.item, info.from, info.velocity, undefined, startSeq ?? undefined, info.slot);   // THROW-INTERRUPT: its request's seq
    startSeq = null;
    firearm().shotRumble(grenade.recordOf(info.item)?.rumble);       // CTL-2: the release's fire step (FUN_005c3360)
  }));
  /**
   * M203-FIRE-SOUND (research 94 §C4.5): another's launched round the room told live -- its copy's release plays the
   * report of the record the owner's kit leads to (`report`; `LAUNCH_REPORT_KIT_READING` where the page holds no kit for
   * the owner), then the round's own FireAnimName on its projectile (`FUN_003caf60` D:L320608-320613). A joiner's
   * catch-up is not told (`GrenadeThrower.launchRemote`).
   */
  offs.push(grenade.on('remoteLaunch', (info) => {
    const kit = (info.owner !== undefined ? d.remoteKit?.(info.owner) ?? null : null) ?? LAUNCH_REPORT_KIT_READING;
    report(info.id, kit, info.from);
    audio.onAnimCallback(info.fireAnim, info.from);
  }));
  /**
   * Research 304: another's throw or charge the room took (relayed to the others, never to its thrower: `FUN_005c5340`
   * D:L479219-479247) -- its FireAnimName at the release (`.THROW_OBJECT`, `c4_start`'s `.PLACE_CHARGE`), as the
   * thrower's page hears its own, and a teammate's spoken warning (`warning`). A joiner's catch-up hears neither. PAR-77:
   * the FireAnimName whatever the thrower's view -- that body's `+0x200` is not on the wire (research 251 s12.7 and its
   * readings table).
   */
  offs.push(grenade.on('remoteRelease', (info) => { audio.onAnimCallback(info.fireAnim, info.from); d.warning?.({ id: info.id, ...(info.owner !== undefined ? { owner: info.owner } : {}), from: info.from }); }));
  /**
   * EFFECTS (socomlegacy/docs/research/89): a grenade's bounce runs the game's own `grenade_hit_<material>` through
   * `effects.play` (its sound, and snow's and water's spurts), at the point as if the grenade's node were there (the
   * sparks' `OBJECT_TRANSLATE_STATE` takes the caller's place); the explosion goes through the grenade's own door
   * (`setEffectPlayer`). The audio's zAnim map is the fallback before the effect data is in.
   */
  offs.push(grenade.on('bounce', (info) => {                                               // grenade_hit_<material>
    if (!info.sound) return;
    if (!firearm().effects.play(info.anim, grenadePlace(info.pos))) audio.onAnimCallback(info.anim, info.pos);
  }));
  /**
   * The flashbang's blind (`./flash`): `blindplayer0<level>` by the game's rule of distance and facing (0x597c00) -- the
   * `TRUE_COLOR_SCALE` wash on the lit colours and the `BLUR3D` glow the renderer draws (`setGlow`, each frame). P2: the
   * page's own level only without a room (the free walk); with one, the room's (`netDeps().whiteOut`).
   */
  const whiteOut = new WhiteOut();
  offs.push(grenade.on('explode', (info) => {
    if (info.flash) whiteOut.start(info.flash);
    // The zAnim's sound: the effects play it with the run (`effects.play`'s sound door); without the run, the material's
    // variant, whose zAnim starts the base (`frag_grenade`: .GREN_MED) -- the audio follows the call (research 81 §6).
    if (!info.byEffects) audio.onAnimCallback(info.anim, info.pos);
    // The game's screen shake by the distance (research 83, `./look`) -- j5t3o2iU (the owner's report, 2026-11-02): only
    // for an item `HandleDetonateExplosion` sets the camera's blast point for (`FUN_003c8330` D:L319186-319195), never a
    // smoke's pop (122, 127) or a flash's (123): `CAMERA_BLAST_EXEMPT_ITEMS`, as a script round's (`./effects`).
    const id = grenade.recordOf(info.item)?.id;
    if (info.distanceToPlayer !== null && !(id !== undefined && CAMERA_BLAST_EXEMPT_ITEMS.includes(id))) {
      const s = explosionShake(info.distanceToPlayer); if (s) fly.shakeScreen(s);
    }
  }));
  // The grenades' explosions through the effects' door: the game's own zAnim (`frag_grenade_stone`, `smoke_grenade`,
  // `flashcrash_grenade` ...) where the map has it; the grenade's placeholders only where it does not. The run's handle
  // (`effects.run`, as true as `play`'s yes) lets `clearSmokes` stop a pouring smoke (PAR-45, research 283).
  grenade.setEffectPlayer((anim, at) => firearm().effects.run(anim, { ...grenadePlace(at.position), normal: at.normal ?? [0, 1, 0], velocity: at.velocity ?? [0, 0, 0] }));   // the node: the sparks launch from it

  /**
   * M7 (spec W4.R5; research 94 §A6, §C4-§C5): the loadout's three equipment slots on the page -- the thrower's pouch and
   * slots (`GrenadeThrower.setKit`, its records the disc's), the rocket launcher's (`RocketLauncher.setKit`, sharing the
   * fire's round slots) -- at every spawn.
   */
  function spawnEquipment(kitRounds: KitRounds): void {
    const table = loadouts.tables(), loadout = loadouts.loadout();
    grenade.setRecords(throwableRecords(table));
    grenade.setKit(EQUIPMENT_SLOTS.map((s) => table?.arsenal.items.get(loadout[s])?.name ?? throwableOf(null, loadout[s])?.name ?? null));
    rocket.setKit(table, loadout, kitRounds);
    walk.launcherCleared();                             // PAR-81: the spawn's kit holds no launcher up (its `equip` lowered none in the room)
  }

  /** The live kit's slot identities changed without a spawn: preserve the remaining rings (research 361 §3). */
  function takeEquipmentKit(): void {
    const table = loadouts.tables(), loadout = loadouts.loadout();
    grenade.setRecords(throwableRecords(table));
    grenade.takeKit(EQUIPMENT_SLOTS.map(s => table?.arsenal.items.get(loadout[s])?.name ?? throwableOf(null, loadout[s])?.name ?? null));
  }
  /** M7 (research 94 §C9): the HUD weapon box's icon -- the launcher's, the throwable's or charge's, else the firearm's. */
  function equipmentIcon(): string {
    return rocket.icon() ?? grenade.icon() ?? firearm().icon(firearm().kit.item());
  }
  /** M7: the box's count while an item is up -- the launcher's rounds, the throwable's left -- or null for the firearm's magazine. */
  function equipmentMagazine(): BoxMagazine | null {
    if (rocket.up()) { const n = rocket.count(); return { rounds: n, capacity: n, spare: 0, reloading: false }; }
    if (grenade.equipped()) {
      const s = grenade.stats(), mag = s.slot === null ? null : grenade.magazineOf(s.slot);
      return { rounds: mag?.rounds ?? s.left, capacity: mag?.capacity ?? (s.held === 'Detonator' ? s.left : s.record.capacity), spare: mag?.mags ?? 0, reloading: false };
    }
    return null;
  }
  /** The name of an equipment slot's item (the kit table's `InternalName`), null for none. */
  function equipmentName(id: number): string | null {
    return loadouts.tables()?.arsenal.items.get(id)?.name ?? throwableOf(null, id)?.name ?? null;
  }
  /**
   * The kit as the R2 inventory sees it (`./inventoryMenu`): the loadout's five slots, the Detonator a sixth while the kit
   * carries a claymore (`FUN_005c74e0` adds it); each slot takeable by `FUN_005bdc30` (`./equipment` `slotSelectable`, a
   * throwable's count left: `GrenadeThrower.takeable`); the slot in the hand (`FUN_005be040`).
   */
  function inventoryKit(): InventoryKit {
    const loadout = loadouts.loadout();
    const detonator = grenade.stats().kit?.includes('Claymore') ?? false;
    const takeable = (slot: number): boolean => {
      if (slot === DETONATOR_SLOT) return grenade.takeable('detonator') !== null;
      const id = loadout[slot];
      if (id === undefined || id === EMPTY_ITEM) return false;
      if (slot < 2) return slotSelectable(id, { claymoresDown: 0, roundsFor: () => 0 });
      // PF-37 (research 236 s4): the depth `RocketLauncher.selectSlot` reads (FUN_005857e0's wading test).
      if (equipmentKind(id) === 'launcher') return slotSelectable(id, { claymoresDown: 0, roundsFor: (l) => rocket.roundsFor(l), wadingDepth: () => rocket.wadingDepth() });
      return grenade.takeable(slot - 1 as 1 | 2 | 3) !== null;
    };
    return { count: detonator ? DETONATOR_SLOT + 1 : DETONATOR_SLOT, takeable, current: inventoryCurrent() };
  }
  /** The exact slot in the hand (`FUN_005be040`); duplicate items remain distinct (research 361 §2). */
  function inventoryCurrent(): number {
    const loadout = loadouts.loadout();
    const up = rocket.held();
    if (up !== null) return EQUIPMENT_SLOTS.find((s) => loadout[s] === up) ?? 0;
    const held = grenade.held();
    if (held === 'Detonator') return DETONATOR_SLOT;
    if (held !== null) {
      const at = grenade.heldSlot();
      if (at !== null) return at;
    }
    const kit = firearm().kit;
    return (kit.state().swap?.to ?? kit.item()) === 'pistol' ? 1 : 0;
  }
  /** A kit slot up (`FUN_005c4b10`): the firearms by `selectFirearm`, the equipment by `selectEquipment`, the Detonator. */
  function takeSlot(slot: number): boolean {
    if (walk.mode() !== 'walk') return false;
    if (slot === 0 || slot === 1) return firearm().selectFirearm(slot === 0 ? 'rifle' : 'pistol');
    if (!firearm().shoulderGate(slot)) return false;    // FUN_00594cf0: the press gated whole, whatever its slot
    if (slot === DETONATOR_SLOT) {
      if (firearm().kit.swapping() || grenade.phase() === 'throwing') return false;   // PAR-19 D07: the wind-up yields
      rocket.lower();
      return grenade.select('Detonator');
    }
    return slot >= 2 && slot <= 4 ? selectEquipment(slot - 1 as 1 | 2 | 3) : false;
  }
  /** A slot's icon in the menu (`FUN_005be110`): the record's `IconTextureName`, lower case; the Detonator's. */
  function slotIcon(slot: number): string | null {
    if (slot === DETONATOR_SLOT) return CLAYMORE_RULES.detonator.icon.toLowerCase();
    if (slot === 0 || slot === 1) return loadouts.icon(slot);
    const id = loadouts.loadout()[slot];
    if (id === undefined || id === EMPTY_ITEM) return null;
    const table = loadouts.tables();
    return (table?.arsenal.items.get(id)?.icon ?? throwableOf(table, id)?.icon ?? null)?.toLowerCase() ?? null;
  }
  /**
   * A slot's words in the menu (`FUN_002193d0`, research 212 §4.1): the record's id and DisplayName; a firearm's magazine
   * as the weapon box reads it (`Fire.magazineOf`); an equipment slot's count left over its Ammo_Capacity with no MAGS
   * (`INVENTORY_THROWABLE_COUNT_READING`); the Detonator's nothing but its name.
   */
  function slotInfo(slot: number): SlotInfo | null {
    const table = loadouts.tables();
    if (slot === DETONATOR_SLOT) {
      const item = table?.arsenal.byName.get('Detonator') ?? null;
      return { id: item?.id ?? 193, name: item?.displayName ?? 'Detonator', rounds: 0, capacity: 0, mags: 0 };
    }
    const id = loadouts.loadout()[slot];
    if (id === undefined || id === EMPTY_ITEM) return null;
    const item = table?.arsenal.items.get(id) ?? null;
    const name = item?.displayName ?? throwableOf(table, id)?.name ?? null;
    if (name === null) return null;
    if (slot === 0 || slot === 1) {
      const m = firearm().fire.magazineOf(firearm().records()[slot]);
      return { id, name, rounds: m.rounds, capacity: m.capacity, mags: m.spare };
    }
    const mag = grenade.magazineOf(slot);
    const capacity = mag?.capacity ?? item?.magazine ?? throwableOf(table, id)?.capacity ?? 0;
    const thrown = grenade.stats().kit?.[slot - 2];
    const left = equipmentKind(id) === 'launcher' ? rocket.roundsFor(id)
      : mag?.rounds ?? (thrown ? grenade.stats().leftByItem[thrown as GrenadeItem] ?? 0 : 0);
    return { id, name, rounds: left, capacity, mags: mag?.mags ?? 0 };
  }
  /** `FUN_005a8cb0` whole -- the page's half (`kitFree`), no swap playing, the mover's half (`WalkMode.swapGate`: on the ground, no action). */
  function kitChangeGate(): boolean {
    return firearm().kitFree() && !firearm().kit.swapping() && walk.swapGate();
  }
  /**
   * R2, the Inventory alive (the owner, 2026-10-04: "the quick menu select just never shows"; research 94 §4.3, research
   * 188 §1.2): SOCOM II's `CWeaponSel` (`./inventoryMenu`) -- R2 opens it on the slot in the hand, d-pad Up / Down step,
   * L1 / L2 put the highlighted slot on that shoulder, Triangle closes it, a fresh Cross or R2 takes the slot up, 5 s idle
   * closes it. Retires the one-press cycle that stood in for it (`INVENTORY_MENU_READING`'s buttons and edge). Its gate is
   * the kit's (`FUN_005a8cb0`, `kitChangeGate`): walking, alive, on the ground, no action, not reloading, not mid-throw,
   * not mid-swap. A confirm asks the shoulder press's whole gate (`shoulderGate`); refused -- in the air, say -- the menu
   * stays open as the original's does (L72691-72705); passed, the slot is taken up (nothing changes when it is the one in
   * the hand, as `FUN_005c4b10` changes nothing) and the menu closes.
   */
  const inventory = new InventoryMenu({
    kit: inventoryKit,
    alive: () => walk.mode() === 'walk' && !walk.isDead(),
    canChange: kitChangeGate,
    take: (slot) => {
      if (walk.mode() !== 'walk' || !firearm().shoulderGate(slot)) return false;
      takeSlot(slot);
      return true;
    },
    icon: slotIcon,
    info: slotInfo,
    clock: () => performance.now() / 1000,
  });
  /**
   * The kit's equipment slot `slot` (1-3, W4.R5) up: a rocket launcher (`RocketLauncher.selectSlot`) or a throwable or
   * charge (`GrenadeThrower.selectEquipment`); a slot neither takes (2X, the thermal scope, C4, a round, an empty one:
   * `FUN_005bdc30`) does nothing. Not mid-swap (the kit's own gate), not while a throw is held or thrown; the firearm in
   * the hand stays the kit's item under it, as R2's inventory leaves it.
   */
  function selectEquipment(slot: 1 | 2 | 3): boolean {
    if (walk.mode() !== 'walk' || firearm().kit.swapping()) return false;
    if (grenade.phase() === 'throwing') return false;                                 // PAR-19 D07
    // PF-21 (research 217 §4.2): the launcher raised from the firearm in hand, its own clip's length (the room's).
    if (rocket.selectSlot(slot, firearm().item() === 'pistol' ? 1 : 0)) { if (grenade.equipped()) grenade.select('rifle'); return true; }
    return grenade.selectEquipment(slot);
  }

  const hands = (page: PageHands = {}): FirearmHands => ({
    c4Fuse: () => grenade.c4Fuse(),
    launcherUp: () => rocket.up(),
    launcher: () => rocket.held(),                     // ARMING-GREY (#300): the raised launcher, for the reticle's arming grey
    launcherRoundIcon: () => rocket.roundIcon(),
    itemUp: () => grenade.equipped(),
    busy: () => grenade.phase() === 'throwing',                                        // PAR-19 D07: FUN_005a8cb0 sees no wind-up
    takeable: (slot) => inventoryKit().takeable(slot),
    putAway: () => {
      if (grenade.equipped()) grenade.select('rifle');
      rocket.lower();                                   // M7: the launcher away too
    },
    spawned: (rounds) => {
      grenade.setRounds([...(loadouts.tables()?.rounds.values() ?? [])]);
      spawnEquipment(rounds);                           // M7: the three equipment slots, as the loadout holds them
      inventory.respawned();                            // the body re-made around its controller: the shoulders stand (FUN_00599b60)
    },
    kitTaken: (rounds) => { takeEquipmentKit(); rocket.setKit(loadouts.tables(), loadouts.loadout(), rounds); },   // NU-5 L1: a claimed launcher (research 323 §1.6)
    // OT.R59 (RECONNECT-GHOST): a resumed seat -- the room's pouch laid (no refill), the launcher down when the room holds none.
    resumed: (r) => {
      takeEquipmentKit();
      grenade.setLeft(r.pouch, r.equipmentSlots);
      // RECONNECT_HELD_LAUNCHER_ADAPTATION (server `room.ts`, condition 4 (b)): lowered at once, as the room lowered it --
      // no throw to the room, no lower clip, the firearm's trigger free; the rifle off the back, the walk's set cleared.
      if (r.held === null && rocket.up()) { rocket.drop(); firearmReadyAt = 0; stowRifle(); walk.launcherCleared(); }
    },
    trigger: (down) => {
      // OBF-31: under the round screens the trigger is not ticked -- taken, nothing done, a waiting rocket let go
      if (screens()) { launcherWaits = false; return true; }
      // TRIGGER-SWAP (`holdPulls`): each press starts the hold's count afresh at 0 and a let-go zeroes it -- a press under a
      // throw, pending or after its hand opened, 0 from the launch, last grenade or not (GR-1, research 326 §7.2)
      holdPulls = 0;
      // MAP-10b: mounted, the trigger is the turret's (`./matchActions`: the room fires its rounds), never the rifle's.
      if (page.trigger?.(down)) return true;
      // The binoculars (view state 4): FUN_005be9a0 runs no class's use -- no rocket, no pin pulled, no charge placed; the
      // firearm's trigger is held as the game's is and its rounds refused one by one (`Fire`'s `fireRefused`).
      if (down && fireRefused(firearm().zoom.state()) && (rocket.up() || grenade.equipped())) return true;
      if (rocket.up()) {                                // M7: the launcher's trigger (a rocket a pull)
        // LATER 192 (research 215 s8.5): the press asks the raise (`setItemRaise`'s feed); below 1 the rocket waits
        // (`FUN_005c0ae0` D:L476423-476438) and `frame` asks again while held; a let-go first, none (D:L476381-476416).
        // LATER 199: then the playing motion's NoFire (`FUN_005a7de0(actor, 1, ..)` D:L476442), the launcher's class as
        // every bullet class: refused, the held pull waits and is asked again each frame, as the raise's. `FUN_005a7de0`
        // (D:L462594) is a wider gate; only its NoFire part is held here, the rest ledgered (`NOFIRE_STATE_READING`, `LAUNCHER_STICK_LOWER_READING`).
        launcherDown = down;
        if (down) launcherPress = true;
        launcherWaits = down && (raiseRefused() || !walk.fireAllowed());
        if (down && !launcherWaits) launch();
        return true;
      }
      if (down && performance.now() < firearmReadyAt) return true;   // M7: the firearm still coming back up
      if (grenade.equipped()) {
        if (placingUp()) { placingDown = down; if (down) placingPress = true; }   // NU-8a B1: the raise hears it (D:L453633-453634)
        if (down) grenade.pull();
        else grenade.release();
        return true;
      }
      return false;
    },
    // TRIGGER-SWAP: the held trigger handed to the firearm once nothing here owns it -- no item up, the launcher neither up nor
    // still coming down (`firearmReadyAt`), not mounted -- with the hold's count (`holdPulls`); the fold: and the turret's
    // rounds of a hold held through the dismount (`PageHands.heldPulls`, null while the page still owns it)
    heldPulls: () => {
      if (screens() || page.mounted?.() || rocket.up() || grenade.equipped() || performance.now() < firearmReadyAt) return null;
      const turret = page.heldPulls ? page.heldPulls() : 0;
      return turret === null ? null : holdPulls + turret;
    },
    // M4 (research 94 §C4): a round mode's round flown here as a grenade is (`GrenadeThrower.launchRound`: the round's
    // gravity, arming distance, impact, blast), its launch zAnim heard (`m203he_start`). M203-FIRE-SOUND (research 94
    // §C4.5): the release's report first -- the M203's `.M203_GREN` for its rounds and the MGL turret's, the M79's own.
    launched: (record, from, velocity) => {
      grenade.launchRound(record, from, velocity);
      report(record.id, loadouts.loadout(), from);
      audio.onAnimCallback(record.fireAnim, from);
    },
    // A script round's blast point (research 332 section 7: the planted bomb's MPBOMB, drawn and heard by the effects;
    // the room deals its blast): the camera's shake by the distance, as the grenades' `explode` above.
    blast: (at) => { const s = blastPointShake(at, walk.snapshot()?.feet); if (s) fly.shakeScreen(s); },
    icon: () => page.icon?.() ?? rocket.icon() ?? grenade.icon(),   // PAR-55: mounted, the turret's (research 215 s8)
    // MAP-10b: mounted, the turret's rounds (TURRET_AMMO_HUD_READING); an item up, its count (research 85, 94 §C9).
    magazine: () => page.magazine?.() ?? equipmentMagazine(),
    mounted: () => page.mounted?.() ?? false,
    fireMode: () => page.fireMode?.() ?? null,
    weapon: () => page.weapon?.() ?? null,
    reload: () => page.reload?.() ?? false,                                 // TURRET-AMMO: mounted, R is the turret's
    thermal: () => page.thermal?.() ?? false,                               // LATER 97: the mounted zoom's 2
    turret: () => page.turret?.() ?? null,                                  // LATER 165: the parts view 2 hides
    mountTaken: () => page.mountTaken?.() ?? null,                          // LATER 237: the knock re-derived from K
    commandSeq: () => page.commandSeq?.() ?? null,                          // LATER 237
    // NU-2 (research 320 sections 1 and 4): the reticle's set is the hand's item's (`FUN_005be300`) -- its record's ID,
    // else the arsenal table's; the Detonator 193 with no table read (`arsenal-items.json`'s id, `readArsenal` over
    // `RUN/ZWEAPON.ZAR`, research 320 section 1) -- and the meter is laid at the throw's power, 0 with none left.
    handItem: () => {
      const held = grenade.held();
      if (held === null) return null;
      return grenade.recordOf(held)?.id ?? loadouts.tables()?.arsenal.byName.get(held)?.id ?? (held === 'Detonator' ? 193 : null);
    },
    throwPower: () => {
      if (!grenade.equipped()) return 0;
      const s = grenade.stats();
      return meterPower(s.power, s.left);
    },
  });

  return {
    grenade, rocket, throwPose, whiteOut, inventory, hands,
    netDeps: () => ({
      // ROUND_END_EFFECTS_READING (research 283 §9-§10): the effects playing stop at the engine's read (`NetPage`,
      // `ENGINE_READ_S` after the `roundOver`), as the original's `FUN_002aa910` before the round screen; not the air or
      // the scorches (the round's start's, `roundStart`, which runs this clear again as a backstop).
      roundEndEffects: () => { grenade.clearRoundEffects(); firearm().effects?.clearRound(); },
      // The room's projectiles flown here.
      remoteGrenade: (kind, from, velocity, owner, pid, phase, ageTicks) => grenade.launchRemote(kind as GrenadeItem, from, velocity, owner, pid === undefined ? undefined : { pid, ...phase }, ageTicks),   // LATER 643: the room's age
      ownProjectiles: () => grenade.ownLive(),       // PF-28: a rejoin's envelope does not double the page's own throws
      // LOW-2: exact slot from the sequence journal. LATER 503: a rocket's round back on the launcher, by its launch. P4
      // (TB-10, WK-1): a carrier's round (class 171-184, a fire mode of the rifle, research 94 §C4.2) back on the firearm,
      // whose journal spent it (`Fire.launch`); the two journals count their ids apart, so the round's class picks one.
      staleThrow: (kind, slot, shot) => {
        if (shot !== undefined) {
          const id = loadouts.tables()?.arsenal.byName.get(kind)?.id;
          if (id !== undefined && itemClass(id) === 'launcherRound') firearm().fire.refundRound(shot);
          else rocket.refund(shot);
          return;
        }
        slot === undefined ? grenade.giveBack(kind) : grenade.giveBack(kind, slot);
      },
      tagOwnProjectile: (kind, from, pid) => grenade.tagOwn(kind, from, pid),   // PF-36: the room's pid for the page's own
      detonateProjectile: (pid) => grenade.detonateRemote(pid),                 // PF-36: a charge shot or blasted in the room
      sceneRound: (kind: string, at: [number, number, number]) => grenade.fireScene(kind, at),                    // research 386 §3.2: a scene FIRE_WEAPON's round
      // P2 (TB-1; research 85 s9.5): the room's gated blast's level on the page's own SEAL -- with a room the page reckons
      // none of its own (`GrenadeThrower.explode`'s `online()`), so the white-out is the room's alone.
      whiteOut: (level) => whiteOut.start(level),
    }),
    takeSlot, inventoryKit, inventoryCurrent, selectEquipment, equipmentIcon, equipmentMagazine, equipmentName,
    setMap: (built, map) => {
      grenade.setMap(built.grenades, map.grenade);
      // LATER 32: the disc's records (C4's and the PMN's among them) with the map, not only at the local seat's spawn --
      // a replay's watcher never spawns, and another's C4 or PMN (`launchRemote`) is laid only with its record. The map's
      // kit table, the one `loadouts.setMap` holds and `spawnEquipment` reads; after `setMap`, so the models are found.
      grenade.setRecords(throwableRecords(map.arsenal?.table ?? null));
      grenade.setWorld(() => d.world?.() ?? null);      // SUP-03: C4's targets are the page's world's destructibles
      throwPose.stop();     // the M67's model, its effect bitmaps, the map's DefaultMaterial
    },
    throwable: (kind) => grenade.recordOf(kind),
    setMarks: ({ shade, clipper }) => {
      grenade.setShade(shade);
      grenade.setClip(clipper);
    },
    // ROUND_END_EFFECTS_READING (research 283 §9): the effects playing stop with the round -- a smoke thrown at its end
    // does not pour on into the next (`FUN_002aa910` D:L151211-151219); the room's smoke went with its `clearAir`.
    roundStart: () => { grenade.clearAir(); grenade.clearScorches(); grenade.clearRoundEffects(); firearm().effects?.clearRound(); whiteOut.stop(); },
    warm: async (prepare) => { await prepare(grenade.warmObjects()); },
    poseFrame: (dt) => {
      poseDt = dt;                                      // NU-8b B4: the take-up's fade, a tick run when it is drawn
      throwPose.holdOn(!!walk.snapshot()?.hold);       // PAR-85 F1: a held throw whose hold left with its mover pops
      for (const name of throwPose.step(dt)) audio.onAnimCallback(name, walk.drawnFeet());   // the throw clip's `throw_whoosh`
    },
    frame: (dt, real = dt) => {
      grenade.update(dt, real);        // the held throw, the grenades in the air once per game frame (PF-04), the explosions (PAR-34: the timed rules in real time)
      rocket.update(dt);               // M7: the launcher's rate (the room's command clock: PAR-34), its model in the hand or on spinehi
      // LATER 192 (research 215 s8.5): a held pull the raise refused, asked again after this frame's raise tick (`Play.frame`
      // runs before this part's frame on both pages, as before the firearm's `fire.update`): the rocket on the first frame
      // the raise reads 1 (D:L476433-476438); not for the dead, nor in the binoculars (`FUN_005be9a0` D:L475303-475305).
      launcherLetGo();                                  // F1: a drop or a death lets the held trigger go
      const up = screens();
      if (!launcherDown || up) launcherWaits = false;   // OBF-31: a waiting rocket let go under the round screens
      // OBF-31 (the review's N3): a pin pulled in the 3 s let go at the screens' first frame -- no throw (the trigger's
      // let-go is swallowed there, `./matchFirearm`), the next round's hand free
      if (up && !screensWere) grenade.cancelMenuHold();
      // OBF-31b: the launcher's and a placing's held triggers let go there too, as their releases in `trigger` let them go
      // (the raise's feed); a placing's `grenade.release` is not asked -- N3's cancel above is its let-go
      if (up && !screensWere) launcherDown = placingDown = false;
      screensWere = up;
      if (launcherWaits && !raiseRefused() && walk.fireAllowed() && !fireRefused(firearm().zoom.state())) { launcherWaits = false; launch(); }   // LATER 199: NoFire too
      whiteOut.update(real);           // the flashbang's wash on the lit colours (PAR-34: its blind in real time), and its glow for this frame's render
      return whiteOut.glow();
    },
    dispose: () => {
      if (import.meta.env.DEV) delete diagHost.__throwDiag;   // THROW_DIAG_ADAPTATION: the instrument goes with the part
      for (const off of offs.splice(0)) off();
      grenade.setEffectPlayer(null);
      inventory.close();
      throwPose.stop();
      rocket.lower();
      whiteOut.stop();                                  // the wash is the lit colours' (`./trueColourScale`): back to neutral
      grenade.setMap(null, null);                       // the air, the scorches, the pouch, the map's bitmaps and materials
      scene.remove(grenade.object);
    },
  };
}

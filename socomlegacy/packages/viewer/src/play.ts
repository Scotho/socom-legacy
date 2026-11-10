import type { Camera, Group, Object3D } from 'three';
import { IDENTITY, multiply, partMatrix, sampleClip, Skeleton, transformPoint, type MotionClip, type Pnt3D, type WeaponPoint } from '@s2u/scene';
import { Animator, type AnimEvent, type AnimStats, type MoverSnapshot, type PoseLayer } from './animator';
import { EYE_MODEL, type LoadedBody } from './body';
import type { BodyView } from './bodyView';
import type { Pose } from './camera';
import type { FireEvent } from './fire';
import { pressedSince, releasedSince, type Input } from './gamepad';
import { HELD_ITEM, HeldMounts, ITEM_NODE, heldSkeleton, launchPoint, mountMatrix, muzzlePoint, PISTOL_ITEM, type Carries, type Mount } from './heldItem';
import type { Firearm } from './kit';
import type { MotionEntry, MotionTable } from './motionTable';
import { ACTION_CLIPS, actionRoots, type MoverActionName, type Stance, type WalkMode } from './walk';
import type { PlaySnapshot } from './mover';
import { placedVolumes, posedVolumes, type Capsule } from './net/hitVolumes';
export { actionRoots };
import { SEAL_ANIMS, oneShotSeconds, type AnimSet } from './locomotion';
import { reloadMoving, type ReloadItem, type ReloadStance } from './reloadClip';
import { reloadCutOf, type ReloadCutNote } from './reloadLock';
import { WeaponPose, type WeaponPoseStats } from './weaponPose';
import { RaiseFeed, WeaponRaise, type ItemRaise, type RaiseStats, type RaiseTimes } from './weaponRaise';

/**
 * The play mode (web sprint 2, W2.2b; ruling W2.R1): the walk mode with the body. Entering walk (`G`, the panel's
 * switch, the pad's Start) shows the map's SEAL at the mover's feet, facing the body's yaw, running the game's clips
 * (`./animator`). The frame is drawn from the walk's own camera -- the game's third-person camera
 * (`./playerCamera`, `FUN_0029a950`; it replaced the cloud sprint's measured shoulder rig at the merge of the two
 * sprint 2s) -- or, zoomed (the right mouse button, d-pad Up), the view from the head: first person (the owner's
 * ruling of 2026-10-01 restored it), the night vision or the scope. Leaving hides the body. The
 * W2.1 body switch is **"show the body in fly mode"**: with it on, the body stays in view where the play left it --
 * or at slot A in its bind pose, W2.1's picture, until played.
 */

/** Which view draws the frame: the game's third-person camera in play, the head (first person or the scope), or fly. */
export type ViewKind = 'third' | 'scope' | 'fly';

/**
 * Whether the body is drawn: always over the shoulder, never in the scope -- a view from the body's own eyes, where
 * the head would fill the screen -- and in the fly camera only when the panel's switch asks.
 */
export function bodyVisible(kind: ViewKind, flyToggle: boolean): boolean {
  return kind === 'third' || (kind === 'fly' && flyToggle);
}

/**
 * The pad's lanes as the play mode acts on them (W2.R5; `./gamepad`'s `Input`, the pad and the touch buttons merged):
 * the jump on the press, the crouch on the release -- the game toggles the stance when the button comes up
 * (docs/PLAYTEST.md step 8, `host_crouch_shortcut.h:5-6`). The fire lane is the trigger's (`main.ts`), and the stance
 * lane's tap and hold are `StanceButton`'s (`./stanceButton`).
 */
export function playActions(before: Input, after: Input): { jump: boolean; crouch: boolean } {
  return { jump: pressedSince(before, after).includes('jump'), crouch: releasedSince(before, after).includes('crouch') };
}

// The stance button's machine and rules live in `./stanceButton` (the pad's Triangle here, the PC's `C` in `./walk`).
export { StanceButton, STANCE_HOLD_S_PLACEHOLDER, stanceOnHold, stanceOnTap } from './stanceButton';

/**
 * The scene skeleton of a decoded body (`@s2u/scene`'s `Skeleton`: the animator writes it, `setLocal` per part), from
 * the parts the worker sent. The model node's matrix is the identity on all 411 characters (78 §3.1). The parts'
 * `nparams` boxes come with them (`BodyPart.bbox`): the in-page room's hit capsules are sized by them, as the server's
 * are (`./teamBody` `hitBodiesOfPage`, `./net/hitVolumes`; the S2 review: without them every capsule's radius was 0);
 * the nodes' types and flags are not sent, and are left empty -- nothing here reads them.
 */
export function bodySkeleton(body: LoadedBody): Skeleton {
  return new Skeleton(body.model, IDENTITY, body.parts.map((p, index) => ({
    index, name: p.name, parent: p.parent, bindLocal: Float32Array.from(p.bindLocal),
    bbox: p.bbox && p.bbox.length === 6 ? Float32Array.from(p.bbox) : new Float32Array(6), type: 0, flags: 0,
  })));
}

/**
 * The body's eyes through a pose, model space: the mean of the eye gear's origins (`character.rdr`'s offsets on the
 * head, 78 §5) carried through the posed palette -- 18.16 over the feet in the bind pose (78 §6.3, `LoadedBody.eye`).
 * Null for a body with no eye gear (a bare body: no `character.rdr`).
 */
export function eyePoint(body: LoadedBody, palette: readonly Float32Array[]): [number, number, number] | null {
  const eyes = body.fittings.filter((f) => EYE_MODEL.test(f.model) && palette[f.part]);
  if (!eyes.length) return null;
  let x = 0, y = 0, z = 0;
  for (const f of eyes) {
    const p = transformPoint(multiply(f.offset, palette[f.part]!), 0, 0, 0);
    x += p[0]; y += p[1]; z += p[2];
  }
  return [x / eyes.length, y / eyes.length, z / eyes.length];
}

/** The clips and the table as the worker read them (`./motionTable`, `PlayData`). */
export interface PlayClips { clips: MotionClip[]; table: [string, MotionEntry][] | null }

/**
 * What the weapon's trigger and aim are this frame (the page's: `Fire.triggerHeld`, and `aiming` while in the scope);
 * ER-1: the marked-enemy count and the gate (`./weaponRaise` `RaiseInput`); ER-2: a copy's owner's raise state off the
 * wire (`raised`, `BodyFlag.Raised`; absent for the page's own body and a pre-14 replay's copy).
 */
export interface WeaponInput { trigger: boolean; aiming: boolean; enemies?: number; gated?: boolean; raised?: boolean }

/** What `weapon()` on the hook reports: the raise, the layers, whether the rifle is in hand, and the muzzle. */
export interface WeaponStats {
  held: boolean;
  /** WEAPON: the firearm the anim set and the fire use (`m_item`), and where each weapon rides. */
  item: Firearm;
  mounts: { rifle: Mount; pistol: Mount };
  raise: RaiseStats;
  pose: WeaponPoseStats | null;
  muzzle: [number, number, number] | null;
}

/**
 * PB.R2's goldens (PB-1, PB-2): what the hook's `ownBody()` reads of the page's own body as drawn -- the gear shown beyond
 * its own (`Play.shownGear`: the carrier's Satchel), the main clip and its key (`Play.animStats`; a turret's hold is
 * `seal_turret_poses` at its key), the throw layer's clip (`./throwPose`: the plant's Place claymore) and where each weapon
 * rides (`WeaponStats.mounts`). A development instrument, a browser adaptation: read-only, it changes nothing of the game.
 */
export interface OwnBodyStats {
  gear: string[];
  clip: string | null;
  frame: number | null;
  throwClip: string | null;
  mounts: WeaponStats['mounts'];
  /** PB-2b F5: the drawn rifle's (or pistol's) muzzle in the world (`weaponStats().muzzle`), null when none is drawn in hand. */
  muzzle: WeaponStats['muzzle'];
}

/** PB.R2's goldens: the hook's `ownBody()` on both pages (`./main`'s `__viewer`, `./matchMount`'s), one read. */
export function ownBodyRead(play: Play, pose: { stats(): { clip: string | null } }): OwnBodyStats {
  const anim = play.animStats();
  return { gear: play.shownGear(), clip: anim?.clip || null, frame: anim?.clip ? anim.frame : null, throwClip: pose.stats().clip, mounts: { ...play.weaponStats().mounts }, muzzle: play.weaponStats().muzzle };
}

/** What `stats().view` reports: which view draws the frame, and the drawn camera's pose. */
export interface ViewStats {
  kind: ViewKind;
  pose: Pose;
}

/** The mover's snapshot at rest where it stands: what the body plays in fly mode once it has been played. */
const at = (s: MoverSnapshot): MoverSnapshot => ({
  ...s, vx: 0, vz: 0, vy: 0, airborne: false, landing: null, ground: { state: 'idle', forward: 0, right: 0, cls: -1 }, action: null,
});

/**
 * What the play mode tells the page (`Play.onEvent`) -- for the audio, above all. The animator's (`AnimEvent`: a
 * `motion.rdr` `zanim_callback` crossed, a footfall, a play started) with the world point of the foot for a footfall
 * (the posed `lfoot` / `rfoot` joint, the node `FUN_005a3570` sounds at), and the mover's own: a take-off and a
 * landing (its contact speed, units a second down, and the clip the game gives it: `FUN_005af590`; the game plays the
 * surface's landing sound on every landing, `FUN_005ac1f0`).
 */
export type PlayEvent =
  | (Extract<AnimEvent, { kind: 'footfall' }> & { position: [number, number, number] | null })
  | Exclude<AnimEvent, { kind: 'footfall' }>
  | { kind: 'takeoff'; running: boolean }
  | { kind: 'land'; speed: number; clip: 'land' | 'landHard' | 'hit' | 'hitStomach' | 'landDeath' | 'landBackwards' | null; cls?: 0 | 1 | 2 | 3 };

/** A camera's pose in the fly camera's convention (yaw 0 looks down -z; degrees). */
function poseOf(camera: Camera): Pose {
  camera.updateMatrixWorld();
  const e = camera.matrixWorld.elements, p = camera.position;
  const dx = -e[8]!, dy = -e[9]!, dz = -e[10]!, n = Math.hypot(dx, dy, dz) || 1;
  return { x: p.x, y: p.y, z: p.z, yaw: (Math.atan2(-dx, -dz) * 180) / Math.PI, pitch: (Math.asin(Math.max(-1, Math.min(1, dy / n))) * 180) / Math.PI };
}

/**
 * `FUN_00550ef0` (decomp 418182-418185): the cut that ends the action on top of the stack once past its `NoInterrupt` -- a
 * move axis (`actor+0x240`, `+0x244`: the pad's stick as `FUN_00551ec0` copies it before the driver, D:L418613-418615 --
 * the snapshot's `cutStick`, PAR-64) or the turn axis (`actor+0x23c`, the turn over `turn_maxrate`) over `INTERRUPT_STICK`
 * 0.1 -- the test `Walker.holdCut` makes for the mover's holds, on the same stick. (Before PAR-64 the layer read the
 * ground state's stick: 0 under a hold, ramped from rest.) A remote body's snapshot (`./net/body` `snapshotOf`, asked by
 * `Play.frame` for its dance and holds) carries its replicated ground stick as its `cutStick` -- the wire has no pad
 * copy; a snapshot with none at all has no move axis to cut with: only its turn is read.
 */
export function reloadCut(snap: Pick<PlaySnapshot, 'cutStick' | 'turnRate' | 'airborne' | 'landedBare'>): boolean {
  return reloadCutOf(snap.cutStick ?? NO_CUT_STICK, snap.turnRate, snap.airborne || snap.landedBare === true);   // PF-18: one test (`./reloadLock`); PAR-62: none on a bare landing
}

/** PAR-64: `reloadCut`'s move axes for a snapshot that carries none (`PlaySnapshot.cutStick` absent). */
const NO_CUT_STICK = Object.freeze({ forward: 0, right: 0 });

/**
 * The play mode's state on the page: the body, its skeleton, the clips and the animator over them, and the panel's
 * body switch. `frame` runs once a frame after the walk's own; the view itself is the walk's (`./walk`, the game's
 * camera, `./playerCamera`), and the zoom puts it in the scope, at the head (`WalkMode.setScoped`).
 */
export class Play {
  /**
   * Research 303: the victory dance on this body -- the room's variant (`victory` events: the page's own through
   * `./victory` `VictoryPage`, another's through `./remotePlayers`), drawn as a one-shot over the locomotion on its own
   * clock; one held back (`victoryPending`) until the map's clips are in (`./victoryData` `withVictoryClips`), never
   * another clip in its place.
   */
  private victory: { serial: number; clip: string; elapsed: number; seconds: number; frames: number } | null = null;
  private victorySeen = -1;
  private victoryPending: { serial: number; clip: string; elapsed: number } | null = null;
  /** The room's dance `serial` on `clip`, `elapsed` seconds in; false when seen, playing or held back for its clip. */
  startVictory(serial: number, clip: string, elapsed = 0): boolean {
    const c = this.clips?.clips.find((x) => x.name === clip);
    const m = this.clips?.table?.find(([n]) => n === clip)?.[1];
    if (serial <= this.victorySeen || this.victory) return false;
    if (!c || !m?.playback) { this.victoryPending = { serial, clip, elapsed }; return false; }
    this.victoryPending = null;
    this.victorySeen = serial;
    this.victory = { serial, clip, elapsed, seconds: oneShotSeconds(m.playback, c.frameCount), frames: c.frameCount };
    return true;
  }
  stopVictory(): void { this.victory = null; this.victoryPending = null; }
  /** A dance playing or held back for its clip. */
  victoryActive(): boolean { return this.victory !== null || this.victoryPending !== null; }
  victoryState(): Readonly<{ serial: number; clip: string; elapsed: number; seconds: number; frames: number }> | null { return this.victory && { ...this.victory }; }
  /** A new match or map: none playing, and any serial new again. */
  resetVictory(): void { this.stopVictory(); this.victorySeen = -1; }

  private body: BodyView | null = null;
  private loaded: LoadedBody | null = null;
  private skeleton: Skeleton | null = null;
  private clips: PlayClips | null = null;
  private animator: Animator | null = null;
  private flyToggle = false;
  /** The mover's last state in play, for the body left standing in fly mode; null until the first play. */
  private last: (MoverSnapshot & { feet: [number, number, number]; drawnFeet?: [number, number, number] }) | null = null;
  private kind: ViewKind = 'fly';
  private drawn: Camera | null = null;
  /** WEAPON: the rifle's raise (`./weaponRaise`), its layers over the clips (`./weaponPose`), the hand's node. */
  private readonly raise = new WeaponRaise();
  /** The raise's weight this frame, for the animator (`MoverSnapshot.aimWeight`). */
  private aimWeight = 0;
  private weaponPose: WeaponPose | null = null;
  private weaponInput: () => WeaponInput = () => ({ trigger: false, aiming: false });
  /** NU-8a B1: the raise's feed (the hold's start, the hand), and the page's own kit's hand, or null for a copy. */
  private readonly raiseFeed = new RaiseFeed();
  private itemRaise: (() => ItemRaise) | null = null;
  private hand: Group | null = null;
  private weapon: Object3D | null = null;
  private muzzleAt: Pnt3D | null = null;
  /** M4: the primary model's `firepoint_203` (a launcher round mode's fire point, `./heldItem` `launchPoint`), or null. */
  private launchAt: Pnt3D | null = null;
  /** WEAPON: the sidearm's model and muzzle, the firearm in use, and where each weapon rides (`./kit`). */
  private sidearm: Object3D | null = null;
  private sidearmMuzzle: Pnt3D | null = null;
  private item: Firearm = 'rifle';
  private mounts: { rifle: Mount; pistol: Mount } = { rifle: 'hand', pistol: 'spawn' };
  /** PB-2b's rework: the mounts the traversal pose drawn last frame set over the kit's (the turret's stow), or none. */
  private poseMounts: { rifle?: Mount; pistol?: Mount } | null = null;
  /** WEAPON: which weapons were drawn last frame, each on its mount at once (`HeldMounts`: no ease, C3-MOUNT). */
  private readonly held = new HeldMounts();
  private stance: Stance = 'stand';
  private readonly listeners = new Set<(e: PlayEvent) => void>();
  /** The rifle put away while another item is in the hand (the grenade: `./grenade`'s `equip`). */
  private stowed = false;
  /** GRENADES: pose layers laid over the clips from outside (the throw, `./throwPose`), kept across a new body or pack. */
  private readonly extraLayers: PoseLayer[] = [];
  private unhook: (() => void) | null = null;
  /**
   * PB-1: the gear shown beyond the body's own (`setGearVisible`: the bomb carrier's satchel), laid on each body built --
   * the port rebuilds the page's body (a map, a side, a type) where the original keeps its actor, as `./remotePlayers`
   * keeps the others' by id.
   */
  private readonly gearShown = new Set<string>();
  /** The last action seen, by its serial: a take-off and a landing are told once. */
  private seenAction: { name: MoverActionName; serial: number } | null = null;
  private wasAirborne = false;
  /** PAR-91: the own body's real seconds dead (0 alive), and whether its corpse rule (`frame`'s `ownCorpseS`) has run out. */
  private deadFor = 0;
  private corpseGone = false;
  /** NU-11b H2: the seat a ghost this frame (`frame`'s `ghost`): its own body not drawn. */
  private ghost = false;
  /**
   * OBF-15 (OBF.R9): the weapons the page's own seat dropped (`dropHeld`), off its dead body until the respawn -- the
   * dying console's drop is the weapon node taken off the body's mount, the mount cleared (`FUN_0059f730`
   * D:L458419-458432). Drawn off only while dead: a live exchange's drop of the old weapon (`FUN_0059f0c0`) leaves the
   * hand to the new kit. And whether dead this frame (`frame`'s `walk.isDead`).
   */
  private readonly droppedHeld = new Set<'rifle' | 'pistol'>();
  private ownDead = false;

  /** A map's body, or none: the animator is rebuilt over its skeleton (the clips are the source's, kept). */
  setBody(view: BodyView | null, body: LoadedBody | null): void {
    this.body = view;
    this.loaded = view ? body : null;
    this.skeleton = view && body ? heldSkeleton(bodySkeleton(body)) : null;
    this.hand = view && this.skeleton && this.skeleton.indexOf(HELD_ITEM.name) >= 0 ? view.addProp(HELD_ITEM.name, HELD_ITEM.parent) : null;
    this.launcher = null;                             // M7: the new body's `launcher` node, made on first ask
    this.itemProp = null;                             // the new body's `grenade` node, made on first ask
    if (view && this.skeleton && this.skeleton.indexOf(PISTOL_ITEM.name) >= 0) view.addProp(PISTOL_ITEM.name, PISTOL_ITEM.parent);
    // The weapons ride the body's own frame: their matrices are set from their mounts each frame (`mountMatrix`).
    for (const o of [this.weapon, this.sidearm]) if (o && view) view.group.add(o);
    if (view) for (const name of this.gearShown) view.setGearVisible(name, true);   // PB-1: the satchel, if carried
    this.last = null;
    this.held.reset();
    this.raise.reset();
    this.raiseFeed.reset();
    this.rebuild();
  }

  /**
   * NU-12 B1, B2 (research 328 R328.1-R328.4, §1.2-§1.5): the body rebuilt at a spawn, as the original rebuilds it at a
   * round's start, a respawn and the next match (`FUN_00598b90` -> `FUN_00599b60` D:L455158 -> `FUN_00553ea0`
   * D:L455663): a new animation stack (`FUN_0028edd0` D:L419420) whose first play is `Stand` in state 0 with the push's
   * blend timer zeroed (`FUN_0058c350` D:L447984-447993, `FUN_0058c600` D:L448130-448131; the second timer `+0x10d0`
   * D:L419725) -- so nothing of the last pose is frozen or blended (`SPAWN_FIRST_POSE_READING`, *note only*: `'stand at
   * once'`); the raise at rest -- the envelope at `seal+0x1160` cleared (`FUN_00286d70(param_1 + 0x458)` D:L419499),
   * the state at `+0xf74` set down (`param_1[0x3dd] = 2` D:L419662), the offsets `./weaponRaise` names (was: "D:L419710",
   * whose `FUN_005dffc0` sets the envelope's times only; then "D:L419534-419537, `FUN_00598280`", the action offer's
   * words and the controller's constructor -- the re-review's N2), no dance, no reload or fire layer under way. The page's animator is made again
   * over the same body and clips (`rebuild`, as `setBody` does), the firearm in the hand kept (the own kit's `spawnKit`
   * sets the rifle at the spawn event, before this; a copy's follows its snapshot), the pose layers laid from outside
   * kept (their owners reset theirs: `./remotePlayers` stops the binoculars and the hands). Was: the animator kept across the spawn,
   * the last pose -- a corpse's key, a crouch or prone idle -- eased into `seal_stand` over its 0.5 s `BlendTime`.
   */
  respawn(): void {
    this.stopVictory();
    this.held.reset();
    this.raise.reset();
    this.raiseFeed.reset();
    this.seenAction = null;
    this.wasAirborne = false;
    this.deadFor = 0;
    this.corpseGone = false;
    this.droppedHeld.clear();                         // OBF-15: the new body hangs its weapons again
    this.poseMounts = null;
    this.rebuild();
  }

  /**
   * RSP-6 (research 351 §3): the current body's existing corpse timer has hidden it. This reads the same state as
   * `updateView`; it neither advances the timer nor claims partial model alpha. With no body, expiry is unavailable.
   */
  ownCorpseExpired(): boolean { return this.body !== null && this.corpseGone; }

  /** NU-12 B1: the walk's spawns last seen (`WalkMode.spawns`), null before the first frame that told them. */
  private spawnsSeen: number | null = null;

  /**
   * WEAPON: the map's held weapon (`WorldView.weapon`, the M4A1 SD) hung on the hand's `rifle` node at its grip, and
   * its named points (`LoadedMap.weapon.points`) for the muzzle. Null takes it off.
   */
  setWeapon(object: Object3D | null, points: readonly WeaponPoint[]): void {
    this.weapon?.removeFromParent();
    this.weapon = object;
    this.muzzleAt = object ? muzzlePoint(points) : null;
    this.launchAt = object ? launchPoint(points) : null;
    this.hangHeld(object);
  }

  /**
   * OBF-15 (OBF.R9; `FUN_0059f730` D:L458419-458432): the page's own death dropped this weapon (`./drops` `ownDropped`):
   * its dead body no longer draws it -- the room's drop is the one rifle seen. The respawn hangs it again.
   */
  dropHeld(item: 'rifle' | 'pistol'): void {
    this.droppedHeld.add(item);
  }

  /** WEAPON: the map's sidearm (`WorldView.sidearm`, the kit's Mark 23) and its points; it rides its mount (`./kit`). */
  setSidearm(object: Object3D | null, points: readonly WeaponPoint[]): void {
    this.sidearm?.removeFromParent();
    this.sidearm = object;
    this.sidearmMuzzle = object ? muzzlePoint(points) : null;
    this.hangHeld(object);
  }

  /**
   * WEAPON: the firearm the anim set uses (`m_item`: `Animator.setWeapon`, the pistol's versions of the clips) and the
   * Fire set's and the reload's versions (`./weaponPose`).
   */
  setItem(item: Firearm): void {
    if (item !== this.item) this.raiseFeed.firearmChanged();   // NU-8a B1: a copy's hand is the new firearm's
    this.item = item;
    this.animator?.setWeapon(item);
    if (this.weaponPose) this.weaponPose.item = item;
  }

  /** WEAPON: where each weapon rides this frame (`Kit.state().mounts`). */
  setMounts(mounts: { rifle: Mount; pistol: Mount }): void {
    this.mounts = { ...mounts };
  }

  /**
   * Where each weapon is drawn: the kit's mounts, with what the traversal pose drawn has set over them -- the turret's
   * mount clip stows the weapon in the hand at its phase and the release hands it back (`TraversalPose.mounts`,
   * `./net/emplacement` `turretStow`, TURRET_HELD_WEAPON_READING; research 215 s7.3): the own body and every other alike,
   * a welcome's too. *Was* (PB-2b): the kit's alone, the rifle node drawn in the hold where the mount clip left it.
   */
  private drawnMounts(): { rifle: Mount; pistol: Mount } {
    return this.poseMounts ? { ...this.mounts, ...this.poseMounts } : this.mounts;
  }

  /** `FUN_005a82e0`: faster than 20 units a second (`|v|^2 > 400`) is the moving reload -- the room's test (`./reloadClip`). */
  private movingForReload(): boolean {
    const v = this.last;
    return v !== null && reloadMoving(v.vx, v.vy, v.vz);
  }

  private hangHeld(object: Object3D | null): void {
    if (!object) return;
    object.matrixAutoUpdate = false;
    object.visible = false;
    this.body?.group.add(object);
  }

  /** The weapons on their mounts in the body's frame; hidden before the first play and while stowed in the hand. */
  private placeHeld(): void {
    const skeleton = this.skeleton;
    const played = this.last !== null && this.animator !== null && skeleton !== null;
    const carries = (this.loaded?.carries ?? null) as Carries | null;
    for (const [item, object] of [['rifle', this.weapon], ['pistol', this.sidearm]] as const) {
      if (!object) continue;
      const mount = this.drawnMounts()[item];
      const m = this.held.place(item, played ? mountMatrix(skeleton!, item, mount, carries, this.animator!.heldLocal(item)) : null);
      object.visible = m !== null && !(this.stowed && mount === 'hand') && !(this.ownDead && this.droppedHeld.has(item));   // OBF-15
      if (m) { object.matrix.fromArray(m); object.matrixWorldNeedsUpdate = true; }
    }
  }

  /** WEAPON: where the trigger and the aim are read from each frame (the page wires `Fire` and the walk's view). */
  setWeaponInput(read: () => WeaponInput): void {
    this.weaponInput = read;
  }

  /** LATER 180 (research 215 s8.3): the raise's times for the slot in the hand (`WeaponRaise.setTimes`). */
  setRaiseTimes(times: RaiseTimes): void {
    this.raise.setTimes(times);
  }

  /**
   * NU-8a B1 (research 326 §6 B1): what the page's own kit's hand tells the rifle's raise each frame (`./matchThrow`: a
   * hand grenade up, its wind-up, a placing's trigger). Never set, the body is a copy whose hand the raise infers from its
   * throws (`./weaponRaise` `REMOTE_HAND_RAISE_READING`).
   */
  setItemRaise(read: () => ItemRaise): void {
    this.itemRaise = read;
  }

  /**
   * WEAPON: a round or a reload from `Fire` (`Fire.subscribe`): a reload plays the stance's still clip, or the moving
   * overlay when the body is over 20 a second as it starts (`FUN_005a82e0` 462821: the same test `reloadSeconds` just
   * answered `Fire` with; research 150). Its end lets a clip at its last key finish its cross-fade; a cut-short one stops.
   */
  /**
   * PF-18 (ruling PF.R37; research 218 §2): the reload clip's cut since the last call (`./weaponPose` `takeReloadCut`),
   * for `Fire`'s lock (`FireSource.reloadCut`: the fire held to the carried overlay's last key, or freed at the cut).
   */
  takeReloadCut(): ReloadCutNote | null {
    return this.weaponPose?.takeReloadCut() ?? null;
  }

  weaponEvent(e: FireEvent): void {
    if (e.type === 'reloadStart') this.weaponPose?.startReload(this.stance, e.seconds, e.family ?? null, this.movingForReload());
    // M4: the bolt's or the pump's after-shot clip plays on the reload's layer (`FUN_005a82e0(body, 1)`).
    else if (e.type === 'afterShot') this.weaponPose?.startReload(this.stance, e.seconds, e.family, this.movingForReload());
    else if (e.type === 'reloadEnd') {
      if (e.kept) this.weaponPose?.keepReload();                 // LATER 530: the take's cut, kept for its refusal
      this.weaponPose?.stopReload(e.completed);
    } else if (e.type === 'reloadResume') this.weaponPose?.resumeReload(e.wait);   // LATER 530: the refused take's clip back, run on by the wait
  }

  /**
   * REMOTE-RELOAD (`./netPage` REMOTE_RELOAD_MOTION_READING): another body's reload, heard from the room's take
   * (`RemotePlayers.reload`), starts its reload clip as `weaponEvent`'s `reloadStart` does the page's own -- the
   * `stance` the room's posture at the take (null: this play's own), `moving` the room's (`reloadMoving` at the take),
   * `family` the room's clip family (null: the item's), `seconds` the room's clip length. The copy's stick cuts a still
   * one in `frame` (`reloadCut` on its replicated stick) and the clip runs out on its own clock.
   */
  remoteReload(stance: ReloadStance | null, seconds: number, family: ReloadItem | null, moving: boolean): void {
    this.weaponPose?.startReload(stance ?? this.stance, seconds, family, moving);
  }

  /**
   * REMOTE-RELOAD (the review's F1): a reaction on the copy ends its reload clip as the page's own ends there. `death`:
   * any clip -- the body is gone. `flinch`: only the still clip crouched or prone (`WeaponPose.stillHeld`), the one the
   * page's own reload holds the mover to and its flinch ends (`./fire` `reloadEndOfBody`, family 'reload'; the room keeps
   * the lock); a standing still clip and the moving overlay play on. (A knock's clearing of the moving overlay and the
   * stack, `FUN_0057e770` D:L440992-440998, is not wired for another body: LATER 811.)
   */
  stopRemoteReload(why: 'death' | 'flinch'): void {
    if (why === 'flinch' && this.weaponPose?.stillHeld() !== true) return;
    this.weaponPose?.stopReload();
  }

  /**
   * WEAPON: the reload's length for the stance the SEAL is in and whether it moves -- the reload clip's `playback`
   * (`./weaponPose`) of the clip `family` (M4: the class's, `./reloadClip`), or the record's `ReloadTime` still -- or
   * null without the clips (`Fire` keeps its own estimate then).
   */
  reloadSeconds(family: ReloadItem | null = null, reloadTime = 0): number | null {
    return this.weaponPose?.reloadSeconds(this.stance, this.movingForReload(), family, reloadTime) ?? null;
  }

  /**
   * M4: the posed primary's `firepoint_203` in the world, as `muzzle` poses the `firepoint` -- null when the model names
   * none (`./fire` `FIREPOINT_203_READING`), with the pistol in hand, or before a pose.
   */
  launchPoint(): [number, number, number] | null {
    const last = this.last, skeleton = this.skeleton, at = this.launchAt, object = this.weapon;
    if (this.item === 'pistol' || !last || !skeleton || !at || !object || !this.animator || this.drawnMounts().rifle !== 'hand') return null;
    if (skeleton.indexOf('rifle') < 0 || !this.held.placed('rifle')) return null;
    const p = transformPoint(Float32Array.from(object.matrix.elements), at[0], at[1], at[2]);
    return p ? actorToWorld(last.feet, last.yaw, p) : null;
  }

  /**
   * WEAPON: the posed weapon's `firepoint` in the world (`./heldItem`), or null with no body, weapon or play yet: the
   * weapon as it is drawn (its mount's matrix, at once after a swap: `HeldMounts`), so a round leaves the muzzle seen.
   */
  muzzle(): [number, number, number] | null {
    const last = this.last, skeleton = this.skeleton;
    const pistol = this.item === 'pistol';
    const at = pistol ? this.sidearmMuzzle : this.muzzleAt, object = pistol ? this.sidearm : this.weapon;
    if (!last || !skeleton || !at || !object || !this.animator || this.drawnMounts()[this.item] !== 'hand') return null;
    if (skeleton.indexOf(this.item) < 0 || !this.held.placed(this.item)) return null;
    const p = transformPoint(Float32Array.from(object.matrix.elements), at[0], at[1], at[2]);
    return p ? actorToWorld(last.feet, last.yaw, p) : null;
  }

  /**
   * ENEMY-RAISE ER-2: the raise state is up -- `FUN_005e0010`'s 1 (`body+0xf74 & 0xef`, D:L494306-494309), the moving bit
   * aside -- which the owning page sends on each command (`./walk` `setRaiseSource`, `Command.raised`) as the original's
   * owner packs it into byte +0x7e every frame (`FUN_002bd640` D:L161978).
   */
  raisedUp(): boolean {
    return this.raise.stats().state === 'up';
  }

  /** WEAPON: the hook's `weapon()`. */
  weaponStats(): WeaponStats {
    return {
      held: this.weapon !== null && this.hand !== null, item: this.item, mounts: { ...this.drawnMounts() },
      raise: this.raise.stats(), pose: this.weaponPose?.stats() ?? null, muzzle: this.muzzle(),
    };
  }

  /**
   * WEAPON: shows the gear by its `character.rdr` name -- `Satchel` for the bomb carrier (`HIDDEN_AT_SPAWN`; PB-1: lent to
   * `./bombPage` as the own body's), kept for a body built later; false when no body of this one's has it.
   */
  setGearVisible(name: string, on: boolean): boolean {
    if (on) this.gearShown.add(name); else this.gearShown.delete(name);
    return this.body?.setGearVisible(name, on) ?? false;
  }

  /**
   * PB.R2's goldens: the gear shown beyond the body's own (`setGearVisible`), a copy -- the hook's `ownBody()` reads it.
   * It is the gear asked for, not proven drawn: a body without the named node reports it too (wave 2's review F4).
   */
  shownGear(): string[] {
    return [...this.gearShown];
  }

  /** The source's clips and table (`playFromDisc`), or none: without them the body stands in its bind pose. */
  setClips(clips: PlayClips | null): void {
    this.clips = clips && clips.clips.length ? clips : null;
    this.roots = this.clips ? actionRoots(this.clips.clips) : null;
    this.rootsSent = false;
    this.rebuild();
  }
  /** The action clips' root keys (`actionRoots`), handed to the walk once each time they change (with the table, PF-17). */
  private roots: Map<string, Float32Array> | null = null;
  private rootsSent = false;

  /** HX-2 (research 238 §3): the body's anim set (`./locomotion` `AnimSet`), null the Seal set's; the animator rebuilt over it. */
  setAnimSet(anims: AnimSet | null): void {
    if (anims === this.anims) return;
    this.anims = anims;
    this.rebuild();
  }
  private anims: AnimSet | null = null;

  /** The panel's body switch: the body in fly mode (W2.1's switch, turned). */
  setFlyToggle(on: boolean): void {
    this.flyToggle = on;
  }

  /**
   * One frame: in walk mode the body at the mover's drawn feet, facing the body's yaw, its clip advanced by `dt` and
   * its pose on the bones -- shown in third person, hidden in the scope; in fly mode, once played, the body left standing
   * where the mover was. `camera` is the one the frame is drawn with, for `viewStats`. `real` is the frame's real seconds
   * (PAR-34, `./frameTime`), which only the rifle's lowering countdown counts (`WeaponRaise.frame`); the clips keep `dt`.
   * PAR-91 (research 317 R317.2, §1.8, §5 B3): `ownCorpseS` is how long the page's own dead body is drawn, in real
   * seconds from its death -- `./net/deaths` `corpseShownS(rules, 'own', waiting)`, the mounts' (`OWN_BODY_FADE_READING`:
   * `BODY_FADE_S` in a respawn game, `Infinity` in classic); the default, none. The death is the walk's (`isDead`).
   * NU-11b H2 (research 314 §4.3): `ghost`, the seat a late joiner's ghost (the mounts' `NetPage.ghost()`; never a classic
   * dead player, whose corpse PAR-91 keeps): its own body is not drawn -- the ghost set-up puts the local actor in the
   * death state with its body node's opacity 0, made inactive (`FUN_002b7d60` D:L158634-158638 -> `FUN_00543d50`
   * D:L410437-410441) -- until the round's reload (`FUN_002232a0` D:L75846-75849 -> `FUN_00543b90`); the default, none.
   */
  frame(dt: number, walk: Pick<WalkMode, 'snapshot' | 'view'> & Partial<Pick<WalkMode, 'setPosedRoot' | 'mover' | 'setActionRoots' | 'setMotionTable' | 'victoryMotionActive' | 'isDead' | 'spawns' | 'launcherSetOn'>>, camera: Camera, real = dt, ownCorpseS = Infinity, ghost = false): void {
    // NU-12 B1 (research 328 R328.1-R328.2): a spawn of the walk's (`WalkMode.spawns`, counted by its `respawn`) is the
    // original's rebuild of the body: its animation dropped before this frame (`respawn`), so it draws `Stand` alone.
    const spawns = walk.spawns?.();
    if (spawns !== undefined) {
      if (this.spawnsSeen !== null && spawns !== this.spawnsSeen) this.respawn();
      this.spawnsSeen = spawns;
    }
    // PAR-91: the own corpse's clock, the frame's real seconds from the death (PAR-34's, as `RemotePlayers`' `fadeAge`:
    // 0 alive, `real` added each dead frame), and whether it has run out. The material has no opacity
    // (`BODY_FADE_PLACEHOLDER`): the original's 10 s fade (`FUN_00552780` D:L418720-418743, stepped by `FUN_00551ec0`
    // D:L418492-418505) is drawn whole, then hidden; the respawn's frame (alive) draws it again.
    const dead = walk.isDead?.() === true;
    this.ownDead = dead;                                 // OBF-15: the dropped weapons drawn off while dead
    this.deadFor = dead ? this.deadFor + real : 0;
    this.corpseGone = dead && this.deadFor >= ownCorpseS;
    this.ghost = ghost;                                  // NU-11b H2: a ghost's own body unseen
    if (this.victoryPending) {
      const p = this.victoryPending; p.elapsed += dt;
      this.startVictory(p.serial, p.clip, p.elapsed);
    }
    if (!this.rootsSent && walk.setActionRoots) {
      walk.setActionRoots(this.roots);
      walk.setMotionTable?.(this.clips?.table ? new Map(this.clips.table) : null);   // PF-17: `WalkMode.fireAllowed`'s NoFire
      this.rootsSent = true;
    }
    const snap = walk.snapshot();
    this.kind = snap === null ? 'fly' : walk.view() === 'scope' ? 'scope' : 'third';
    // WEAPON: the rifle's raise from the trigger and the aim while walking. In fly mode the body left standing keeps
    // the rifle where the play left it (the raise does not tick) and a reload stops.
    if (snap) {
      this.stance = snap.stance;
      // NU-8a B1: a throw's release is its hold's start, the hand the own kit's or a copy's inferred (`RaiseFeed`).
      const w = this.raise.frame(dt, this.raiseFeed.input(snap, this.item === 'pistol', this.weaponInput(), this.itemRaise?.() ?? null), real);
      // LATER 203: under the launcher's set (`DAT_0044d408`: the launcher up, the rifle stowed here, and through the still
      // lower's clip to its end -- `WalkMode.launcherSetOn`, the review's F1): no Fire layer (`FUN_0057a330` D:L438829
      // asks the set is not the launcher's) and the aim's weight 1.0 (D:L439153-439154).
      const launcherSet = this.stowed || walk.launcherSetOn?.() === true;
      this.animator?.setLauncherSet(launcherSet);                 // LATER 504: the set's own rows drawn (`seal_launcher`)
      if (this.weaponPose) this.weaponPose.fireWeight = launcherSet ? 0 : w;
      // The stick or the turn past 0.1 cuts a still reload clip (FUN_00550ef0 418182-418185; research 150 §2).
      this.weaponPose?.step(dt, reloadCut(snap), snap.airborne);   // PAR-79: the fall covers a still clip in the air
      // MOTION: the same weight scales the aim's twist and lets the head look run when 0 (FUN_0057a330 439152-439193).
      this.aimWeight = launcherSet ? 1 : w;                      // LATER 203: 1.0 under the launcher set
    } else { this.weaponPose?.stopReload(); this.raiseFeed.reset(); }
    if (this.victory) {
      this.victory.elapsed += dt;
      // Cut as the mover cuts it (the stick or the turn past 0.1: `reloadCut`'s test), at its end, or -- the page's own body
      // -- when its mover's dance is gone (`WalkMode.victoryMotionActive`: an action, a hold, a death took the stack).
      if (!snap || reloadCut(snap) || this.victory.elapsed >= this.victory.seconds || walk.victoryMotionActive?.() === false) this.stopVictory();
    }
    const dance = this.victory;
    this.poseMounts = dance ? null : snap?.traversal?.mounts ?? null;      // PB-2b's rework: the turret's stow
    this.bodyFrame(dt, snap && { ...snap, aimWeight: dance ? 0 : this.aimWeight,
      ...(dance ? { traversal: { clip: dance.clip, frame: Math.min(dance.frames - 1, dance.elapsed / dance.seconds * (dance.frames - 1)), loop: false, rootY: null } } : {}),
    });
    // The rifle rides the clips' `rifle` node: in W2.1's bind pose, never played, the hand holds nothing.
    this.placeHeld();
    if (snap) this.moverEvents(snap, walk.mover?.() ?? null);
    // FUN_0029a950 reads the posed root: the walk's camera stands on it from its next tick.
    walk.setPosedRoot?.(snap && this.animator ? this.animator.rootY() : null);
    this.drawn = camera;
  }

  /**
   * Listens to the play mode's events (`PlayEvent`): the clips' callbacks and footfalls, the plays started, the take-offs
   * and the landings. Returns the unsubscribe. The listeners outlive a new map's body and clips.
   */
  /** The firearm away (true: a launcher is up, `./matchThrow`) or back on its mount; an item up leaves it (research 85 s8.1). */
  setRifleStowed(on: boolean): void {
    this.stowed = on;
  }

  /** GRENADES: a pose layer over the clips after the weapon's (the throw's clip, `./throwPose`); kept on a rebuild. */
  addPoseLayer(layer: PoseLayer): void {
    this.extraLayers.push(layer);
    this.animator?.addPoseLayer(layer);
  }

  /** GRENADES: the source's clips by name and their `motion.rdr` table, or null before the pack is in. */
  motionSource(): { clips: ReadonlyMap<string, MotionClip>; table: MotionTable | null } | null {
    if (!this.clips) return null;
    return { clips: new Map(this.clips.clips.map((c) => [c.name, c])), table: this.clips.table ? new Map(this.clips.table) : null };
  }

  /** GRENADES: the held item's node under `rhand` (`HELD_ITEM`), to hang another item on while the rifle is stowed. */
  heldNode(): Group | null {
    return this.hand;
  }

  /**
   * M7 (research 94 §C8): the `launcher` node the body's set-up hangs on `spinehi` (`CZSealBody_AddWeapon`'s caller,
   * L419672-419687), where a carried LAW or RPG-7 rides (`./rocket`). Made on first ask, one a body; the clips' own
   * `launcher` track is not played on it (`HOLSTER_TRACK_READING`): it sits at the bone's origin.
   */
  launcherNode(): Group | null {
    if (!this.launcher && this.body && this.skeleton) this.launcher = this.body.addProp('launcher', 'spinehi');
    return this.launcher;
  }
  private launcher: Group | null = null;

  /**
   * The equipment's hand (research 85 s8.1): the `grenade` node the body's set-up makes for class 3 -- the hand grenades
   * and the charges -- under `rhand` (`FUN_00553290`, D:L419036-419038: `FUN_00316e30`'s new node, no matrix set: the
   * hand's own frame, `ITEM_NODE_LOCAL_READING`), where the grenade, the claymore, the PMN, C4 and the Detonator ride
   * while they are up. No clip carries a `grenade` track: it sits at the bone's origin. Made on first ask, one a body.
   */
  itemNode(): Group | null {
    if (!this.itemProp && this.body && this.skeleton) this.itemProp = this.body.addProp(ITEM_NODE.name, ITEM_NODE.parent);
    return this.itemProp;
  }
  private itemProp: Group | null = null;

  /**
   * GRENADES: a point in a posed part's own frame (`rhand`, `lhand`, the held item's node), in the world -- null with no
   * body, no clips or before the first play. `CZKit_TickExplosives` releases a grenade from the hand's (2, 0, 0).
   */
  partPoint(name: string, p: Pnt3D): [number, number, number] | null {
    const last = this.last, skeleton = this.skeleton;
    if (!last || !skeleton || !this.animator) return null;
    const i = skeleton.indexOf(name);
    if (i < 0) return null;
    const at = transformPoint(skeleton.world[i]!, p[0], p[1], p[2]);
    return actorToWorld(last.feet, last.yaw, [at[0], at[1], at[2]]);
  }

  onEvent(listener: (e: PlayEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(e: PlayEvent): void {
    for (const l of this.listeners) l(e);
  }

  /** The mover's take-offs and landings, each once, from the snapshot's action and the hook's landing record. */
  private moverEvents(snap: MoverSnapshot, mover: ReturnType<WalkMode['mover']>): void {
    const a = snap.action ?? null;
    if (a && (a.name === 'jump' || a.name === 'launch') && (this.seenAction?.serial !== a.serial)) {
      this.emit({ kind: 'takeoff', running: a.name === 'launch' });
    }
    if (this.wasAirborne && !snap.airborne) {
      const landing = mover?.landing ?? null;
      this.emit({ kind: 'land', speed: landing?.speed ?? 0, clip: landing?.clip ?? null, cls: landing?.cls ?? 0 });
    }
    this.seenAction = a && { name: a.name, serial: a.serial };
    this.wasAirborne = snap.airborne;
  }

  /** An animator event to the page's listeners, a footfall with its foot's world point. */
  private relay(e: AnimEvent): void {
    if (e.kind !== 'footfall') { this.emit(e); return; }
    const part = this.skeleton?.indexOf(e.foot === 'left' ? 'lfoot' : 'rfoot') ?? -1;
    const m = part >= 0 ? this.skeleton!.palette()[part] : undefined;
    const last = this.last;
    this.emit({ ...e, position: m && last ? actorToWorld(last.feet, last.yaw, [m[12]!, m[13]!, m[14]!]) : null });
  }

  /** What the clips are doing: the hook's `stats().anim`; null with no body, no clips, or before the first play. */
  animStats(): AnimStats | null {
    return this.animator && this.last ? this.animator.stats() : null;
  }

  /** The camera drawing the frame, for the hook's `stats().view`. */
  viewStats(): ViewStats {
    const drawn = this.drawn;
    return { kind: this.kind, pose: drawn ? poseOf(drawn) : { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 } };
  }

  /** The posed root's height over the feet (the clip's), or null before the first play. */
  rootY(): number | null {
    return this.animator && this.last ? this.animator.rootY() : null;
  }

  /** The body's eyes in the world through its pose (`eyePoint`), or null with no body, no eye gear or no play yet. */
  eyeWorld(): [number, number, number] | null {
    const palette = this.skeleton?.palette(), last = this.last;
    const eye = palette && this.loaded && last ? eyePoint(this.loaded, palette) : null;
    return eye && last ? actorToWorld(last.feet, last.yaw, eye) : null;
  }

  /**
   * HIT-POSE (research 217 s3.6): the body's hit capsules as it is drawn this frame -- its skeleton's pose
   * (`./net/hitVolumes` `posedVolumes`: the animator's, its root tilt and its lean in it) placed where the body is drawn
   * (`drawnFeet`, else `feet`) at its yaw, as the room places its own live pose's (`placedVolumes`). Null with no body,
   * no clips or no play yet.
   */
  drawnCapsules(): Capsule[] | null {
    const last = this.last;
    if (!this.animator || !this.skeleton || !last) return null;
    return placedVolumes(last.drawnFeet ?? last.feet, last.yaw, posedVolumes(this.skeleton));
  }

  /**
   * SIGHT-POINTS (LATER 793; research 321 s4.1.1 point 8, s7.5; reading, pending review): the body's skeleton node
   * `name` in the world through its pose -- the node's origin up its parent chain (the palette, model space: as
   * `FUN_002869d0` D:L130737-130766 with a null offset) put in the world at the simulated feet and yaw (as `eyeWorld`;
   * `FUN_00308640(body+0x28, p, 1)`, translation included). `head` is the perception sight query's start, the observer's
   * slot +0x34 (`FUN_005a31c0` D:L460165-460171, body+0x308). Null with no body, no such node or no play yet.
   */
  nodeWorld(name: string): [number, number, number] | null {
    const i = this.skeleton?.indexOf(name) ?? -1, last = this.last;
    const m = i >= 0 ? this.skeleton!.palette()[i] : undefined;
    return m && last ? actorToWorld(last.feet, last.yaw, [m[12]!, m[13]!, m[14]!]) : null;
  }

  private bodyFrame(dt: number, snap: (MoverSnapshot & { feet: [number, number, number]; drawnFeet?: [number, number, number] }) | null): void {
    const view = this.body;
    if (!view) return;
    view.setVisible(bodyVisible(this.kind, this.flyToggle) && !this.corpseGone && !this.ghost);   // PAR-91: the own corpse past its rule; NU-11b H2: a ghost's
    if (snap) this.last = { ...snap, feet: [...snap.feet], ...(snap.drawnFeet ? { drawnFeet: [...snap.drawnFeet] as [number, number, number] } : {}) };
    const mover = snap ?? (this.last && at(this.last));
    if (!mover || !this.last) return;                  // never played: W2.1's bind pose at slot A stays
    if (!snap && !view.group.visible) return;
    view.place(this.last.drawnFeet ?? this.last.feet, mover.yaw);   // MISSION R8: drawn there; start points read `feet`
    if (this.animator && this.skeleton) {
      this.animator.step(dt, mover);
      view.setPose(this.skeleton.local);
    }
  }

  private rebuild(): void {
    this.unhook?.();
    this.unhook = null;
    const table = this.clips?.table ? new Map(this.clips.table) : null;
    if (this.skeleton && this.clips) restHolds(this.skeleton, this.clips.clips);
    this.animator = this.skeleton && this.clips ? new Animator(this.skeleton, this.clips.clips, table, this.anims ? { anims: this.anims } : {}) : null;
    // WEAPON: the Fire set and the reload over the clips, as pose layers (the picker is untouched).
    this.weaponPose = this.animator && this.clips ? new WeaponPose(new Map(this.clips.clips.map((c) => [c.name, c])), table) : null;
    this.animator?.setWeapon(this.item);
    if (this.weaponPose) this.weaponPose.item = this.item;
    if (this.animator && this.weaponPose) {
      this.animator.addPoseLayer(this.weaponPose.fireLayer);
      this.animator.addPoseLayer(this.weaponPose.reloadLayer);
    }
    if (this.animator) for (const layer of this.extraLayers) this.animator.addPoseLayer(layer);
    if (this.animator) this.unhook = this.animator.onEvent((e) => this.relay(e));
  }
}

/**
 * WEAPON: the held items' rest -- the grip in the hand as the stand clips hold it (`seal_stand`'s `rifle` track,
 * `seal_p_stand`'s `pistol` track, key 0: `(1.266, 0.258, -0.148)` from `rhand`) -- so a clip that carries no track for
 * the item in the hand (the jumps, the hits) keeps the hold rather than the node's bare identity [reading: the game's
 * node keeps the last pose written to it].
 */
function restHolds(skeleton: Skeleton, clips: readonly MotionClip[]): void {
  for (const [part, clipName] of [['rifle', 'seal_stand'], ['pistol', 'seal_p_stand']] as const) {
    const i = skeleton.indexOf(part);
    const clip = clips.find((c) => c.name === clipName);
    const track = clip ? sampleClip(clip, 0).parts.find((p) => p.name === part) : undefined;
    if (i < 0 || !track) continue;
    (skeleton.parts[i]!.bindLocal as Float32Array).set(partMatrix(track.rotation, track.translation));
    skeleton.setLocal(i, skeleton.parts[i]!.bindLocal);
  }
  skeleton.update();
}

/**
 * The actor's frame to the world: a point in the model's own axes (x to its right, y up, z behind) at the feet,
 * turned by the facing's yaw (degrees, as `Pose.yaw`: yaw 0 faces -z).
 */
export function actorToWorld(feet: readonly number[], yaw: number, v: readonly [number, number, number]): [number, number, number] {
  const r = (yaw * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [feet[0]! + v[0] * c + v[2] * s, feet[1]! + v[1], feet[2]! - v[0] * s + v[2] * c];
}

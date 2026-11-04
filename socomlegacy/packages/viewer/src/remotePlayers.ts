import { Matrix4, Vector3, type Object3D, type PerspectiveCamera, type Scene } from 'three';
import { itemClass, type WeaponPoint } from '@s2u/scene';
import type { LoadedBody } from './body';
import { buildBody, type BodyView } from './bodyView';
import type { Lighting } from './lighting';
import type { LoadedMap } from './loadMap';
import { snapshotOf } from './net/body';
import { BinocularPose } from './binocularPose';
import { ThrowPose } from './throwPose';
import { corpseShownS, flinchRefused, pushPopped, type FlinchGateBody } from './net/deaths';
import type { AnimStats, TraversalPose } from './animator';
import { ACTION_CLIPS, ACTION_FAMILY, ACTION_SECONDS, groundGrid, STEP_PROBE_LIFT_READING, type PlaySnapshot, type SwapProgress } from './mover';
import { GAME_FRAME_DT, probeGround, selectFloor, type Grid } from '@s2u/scene';
import { rootTiltStart, stepRootTilt, tiltTopOfSnapshot, tiltWindowOf, type RootTiltState } from './rootTilt';
import { AXIS_DEAD, CIV_ANIM_SET, HOSTAGE_TOP_SPEED_READING, oneShotSeconds, SEAL_ANIMS } from './locomotion';
import { fadeStep } from './net/escortee';
import { BodyFlag, TICK_HZ, type BodyState, type Rules, type Team } from './net/protocol';
import { FLINCH_CUT_COMMANDS, noInterruptCommands } from './net/flinchReload';
import { Play, reloadCut, type PlayClips, type PlayEvent } from './play';
import { cloneHeld } from './sights';
import { bodyForTeam, escorteeBody, hitBodiesOfPage, type HitBodyOfPage } from './teamBody';
import { bodyVolumes, rayBody, stanceVolumes, type StanceVolumes, type V3 as Vec3 } from './net/hitVolumes';
import { launcherCarryMatrix, type Mount } from './heldItem';
import { handedAt, handOffOf, type Firearm } from './kit';

/**
 * The other player's weapons by the replicated weapon (`BodyState.weapon`: 0 the primary, 1 the secondary), where the
 * local kit leaves them once its swap has ended (`./kit`: `FUN_005a60d0(seal, 2, 0)` carries the rifle while the pistol
 * is in the hand; `FUN_005a75d0` holsters the pistol).
 */
export function remoteKit(weapon: 0 | 1): { item: Firearm; mounts: { rifle: Mount; pistol: Mount } } {
  return weapon === 1 ? { item: 'pistol', mounts: { rifle: 'carry', pistol: 'hand' } } : { item: 'rifle', mounts: { rifle: 'hand', pistol: 'holster' } };
}

/**
 * The swap clip a replicated body is playing -- the standing, crouched or prone swap action, or the moving overlay, as
 * `Walker.swapProgress` reads them -- its direction (the clip backwards is the pistol back to the rifle) and its
 * progress 0..1 on the snapshot's own clock; null when none plays.
 */
export function remoteSwap(snap: PlaySnapshot): { to: Firearm; action: SwapProgress['action']; overlay: boolean; progress: number } | null {
  const a = snap.action;
  if (a && (a.name === 'swapStand' || a.name === 'swapCrouch' || a.name === 'swapProne') && a.seconds) {
    return { to: a.reversed ? 'rifle' : 'pistol', action: a.name, overlay: false, progress: Math.min(1, a.t / a.seconds) };
  }
  const o = snap.overlay;
  if (o && o.clip === SEAL_ANIMS.swapMoving && o.seconds > 0) {
    return { to: o.reversed ? 'rifle' : 'pistol', action: null, overlay: true, progress: Math.min(1, o.t / o.seconds) };
  }
  return null;
}

/**
 * PAR-84 (research 230 section 5.2.10, build step 7), NU-6 R1 (research 324 §4, §6 R1; the gameplay controller's ruling
 * of 2026-10-14 after the review): the action another page draws a body by -- every action the room's body carries, the
 * launcher's raise and still lower (`rifleToLauncher`, `pistolToLauncher`) among them. The original sends no Push
 * Blend for the two (`LAUNCHER_RAISE_NETWORK_LOG_READING` false: no `network_log` on their rows, `FUN_002bbaf0`
 * D:L160789-160790), but each copy plays them itself from the character message's item: the field selects the
 * launcher's slot (D:L162369-162373 -> `FUN_005c8a20` D:L481436 -> `FUN_005c50b0` class 4, D:L478996-478998), the copy's
 * own raise tick runs the selector (`FUN_005c1660` D:L476734 -> `FUN_005a64c0` -> `FUN_005a6d30` D:L461886), which
 * installs the set and pushes the raise (D:L462105, D:L462113, D:L462116) without sending it on (`FUN_00588bc0` sends
 * only for an actor whose `IsRemote` answers 0, D:L446408-446414); the lower the same way back (`FUN_005a6b70`
 * D:L461875). So the room's mover action stands in for the copy's own clip, as the swap's already does (research 324
 * §1.3). Was (PAR-84, until NU-6 R1): "another console draws its copy's own ground, so another page drops the two and
 * plays the body's ground as the room sends it (idle under the clip). Every other action is kept."
 *
 * NU-5 X1 (research 323 §1.5; research 324 §1.4, §6 P2): but the exchange's `Swap rifle` (`swapRifleExchange`) is
 * dropped -- the taker's own console alone pushes it (`FUN_00588bc0` D:L458209-458211; a copy with a model on the node
 * takes the other branch, D:L458217-458235) and it is sent to no other: SOLDIER's `Swap rifle` row carries no
 * `network_log` (`FUN_002bbaf0` D:L160789-160790; read over the tracked `READERC.ZAR`, `roomPickups.test.ts`;
 * `PICKUP_CLIP_NETWORK_LOG_READING`, research 324 §7). The
 * launcher claim's (`swapRifleClaim`) is kept: every console pushes it itself (D:L458199-458206).
 */
export function remoteBodyAction(action: PlaySnapshot['action']): PlaySnapshot['action'] {
  return action?.name === 'swapRifleExchange' ? null : action;
}

/**
 * REMOTE_LAUNCHER_HAND_READING (NU-6 P3 with R1; research 324 §1.6, §4, §6 P3): a rocket launcher is drawn in another
 * body's hand while the body's item is a launcher's (the room's `p.held`, the slot left 0 or 1) and on through the still
 * lower's clip to its end: the raise re-parents the launcher node to the hand at its push (`FUN_005a6d30`
 * D:L462120-462126), the lower re-parents nothing (`FUN_005a6b70` D:L462045-462092), and the driver's end test puts it
 * back under `spinehi` at the gear's offset at the reversed clip's end (`FUN_00582540` D:L443057-443071 ->
 * `FUN_005a60d0(.., firearm, 4)` D:L461769-461820; `REMOTE_LAUNCHER_MOUNT_READING`). In the hand it hangs on the hand's
 * held node at its origin, as the page's own raised launcher does (`./rocket` `draw`; the launcher clips' own `launcher`
 * track is not played: `HOLSTER_TRACK_READING`), and the firearm is stowed meanwhile, as the page's own is
 * (`Play.setRifleStowed`, `./matchThrow` `stowRifle`). Its model is the item's own. [reading: the decompilation's path,
 * not measured running. The stick's moving lower (PAR-83, `room.ts` `launcherStick`) rides no body action, so another
 * page puts the launcher back at the item's change; that clip's own end mount is not read. Which id the original's item
 * field carries for a raised launcher -- the launcher's or its round's -- is `REMOTE_LAUNCHER_ITEM_PLACEHOLDER`'s
 * (research 324 §1.6, note only): either way the copy raises it. Capture NU6-4 settles both]
 */
export const REMOTE_LAUNCHER_HAND_READING = 'the item, and through the still lower' as const;

/**
 * NU-6 P3 (`REMOTE_LAUNCHER_HAND_READING`): the rocket launcher in a body's hand -- the item's id when the item is of the
 * rocket launcher class (`@s2u/scene` `itemClass`), the one already in the hand (`inHand`) while the still lower's clip
 * (a launcher action reversed) plays, else null.
 */
export function remoteLauncherInHand(item: number, action: PlaySnapshot['action'], inHand: number | null): number | null {
  if (item !== NO_ITEM && itemClass(item) === 'rocketLauncher') return item;
  const lowering = action !== null && action.reversed && (action.name === 'rifleToLauncher' || action.name === 'pistolToLauncher');
  return lowering ? inHand : null;
}

/**
 * The other player's weapons from its snapshot, hand-off included: while a swap clip plays they hang as the local
 * `Kit` hangs them on the same clip and progress (the multiplayer merge review's hole 3) -- the rifle on the `swap`
 * mount posed by the clip, `m_item` the pistol from the start going out (`FUN_005a7260`) and until the end coming back
 * (`FUN_005a70f0`), the pistol into the hand (`FUN_005a7730`) or the holster (`FUN_005a75d0`) as the clip passes its
 * `HAND_OFF_READING` phase -- so the hand-off is drawn mid-clip, not when the replicated weapon changes at the swap's
 * start. No new field on the wire: the clip, its clock and its direction already ride the body (`BodyState.action*`,
 * `overlay*`, `ActionReversed` / `OverlayReversed`). Before the hand-off the pistol is where the settled kit keeps it
 * (the holster; the local kit's spawn mount on the hips is not replicated).
 */
export function remoteKitOf(snap: PlaySnapshot & { weapon: 0 | 1 }): ReturnType<typeof remoteKit> {
  const swap = remoteSwap(snap);
  if (!swap || swap.progress >= 1) return remoteKit(swap ? (swap.to === 'pistol' ? 1 : 0) : snap.weapon);
  const handed = handedAt(swap.to, swap.progress, handOffOf(swap));
  const pistol: Mount = swap.to === 'pistol' ? (handed ? 'hand' : 'holster') : (handed ? 'holster' : 'hand');
  return { item: 'pistol', mounts: { rifle: 'swap', pistol } };
}

/**
 * The other players, drawn 1:1 (web sprint 3, M5): each is the map's own character -- its character type's (web sprint
 * 5 S2, protocol 9: the type the room rebuilt it as, named by its `spawn` and the welcome's list; SEAL 1 / TERRORIST 1
 * until named, R95.5; `LoadedMap.types`, research 95 §6) -- in its own gear, with its own `Play` running the game's
 * clips from the replicated mover (`./net/body` `snapshotOf`), its type's primary in its hand raised by the replicated aim and trigger and its
 * secondary on its mount (`SideKit`), and since NU-6 its kit's rocket launcher on its `launcher` node (`firstLauncher`,
 * `REMOTE_LAUNCHER_MOUNT_READING`). A body the snapshots stop naming is taken away.
 *
 * A death plays the clip the server chose from `damanim.rdr`'s lists (`./net/deaths`, research 91 section 3) and the
 * body lies, whole and with no weapon in its hands, until its seat is alive again (NU-4, research 317 R317.1, R317.3,
 * R317.4: `./net/deaths` `corpseShownS`, the room's rules told by `setRules`). Was: "the body goes when the game's fade
 * would have taken it (0.1 a second: 10 s)" -- that fade is the dying console's own body's in a respawn game, not the
 * others'. BODY_FADE_PLACEHOLDER: a body is drawn whole or hidden -- the skinned material has no opacity yet, so the
 * partial alpha of an early respawn press (`REMOTE_BODY_FADE_READING`) is not drawn.
 */

/** A held weapon to hang: the map's built model (`WorldView.held`, cloned for each body) and its named points. */
export interface HeldRef { object: Object3D; points: readonly WeaponPoint[] }
/**
 * The two firearms a player carries (web sprint 4, M3/M9): the loadout's primary and secondary models (`./loadout`) --
 * the player's own kit when the room has named it (`kit`, protocol 7), else its character type's (`type`, protocol 9;
 * SEAL 1 / TERRORIST 1 until named, R95.5), as the local player spawns with.
 */
export type SideKit = (team: Team, kit: readonly number[] | null, type?: number) => {
  rifle: HeldRef | null; pistol: HeldRef | null;
  /** The kit drawn and its two firearms' ids: the copies' scope nodes follow them (`./sights` `cloneHeld`). */
  loadout?: readonly number[]; ids?: readonly [number, number];
  /**
   * NU-6 P2, F2 of its review: the kit's first rocket launcher's model (`FUN_005c6a40` D:L479823, D:L479872-479876), or
   * null for none (or no model the map builds); absent, none is drawn. Never a firearm slot's model.
   */
  launcher?: HeldRef | null;
};

/** No item (`EMPTY_ITEM`): a body whose kit is not known says so in `BodyState.weapon`. */
const NO_ITEM = 255;

/**
 * NU-6 P2 (research 324 §1.1, §1.6): the kit's first rocket launcher, the one the body's `launcher` node carries --
 * `FUN_005c6a40` / `FUN_005c6da0` take the first slot whose item is of the rocket launcher class (`FUN_003d1cb0`, class
 * 0x91, D:L479823; `@s2u/scene` `itemClass`, `FUN_003d1a60`'s ranges) and set the node's model to that slot's instance
 * (D:L479872-479876) -- or null for a kit with none (no side read).
 */
export function firstLauncher(kit: readonly number[] | null): number | null {
  for (const id of kit ?? []) if (itemClass(id) === 'rocketLauncher') return id;
  return null;
}

/** NU-6 P2: the launcher a body draws -- its id, its model's copy (null when the map has none), on which node. */
interface DrawnLauncher { id: number; object: Object3D | null; place: 'carry' | 'hand' }

/**
 * REMOTE_KIT_APPLY_READING (NU-6 K1; research 324 §2, R324.9): another console takes up a player's kit -- the owner's
 * chosen list, the SealObject's 48 bytes at `+0x34` (`FUN_0053ee10` -> `FUN_0053ed50`, the character's `+0x2f0`) -- when
 * the copy is made (`FUN_002bf070` D:L162596 -> `FUN_00599690` D:L455441-455446 -> `FUN_0053ec60`, D:L407354-407378) and
 * at each round's re-place (`FUN_00598b90` D:L455069-455081 through `FUN_002bd3d0` D:L161729-161745), never on a field
 * update (D:L162408-162410 only counts it); between them the copy's live kit changes only by a pick-up's accept and the
 * item field's install-if-absent (D:L162373-162378). The page's moments are the same: a player's `spawn` (protocol 7: the
 * room names its kit, the rebuild's moment, `FUN_00599f00`) and the welcome's list, and `taken.kit` at an accept; the
 * item a snapshot says is in the hand (`BodyState.weapon`, by id) is hung at once when it differs -- the room owns the
 * kit (W4.R6), so the two never disagree but across a join (a joiner's copy: `REMOTE_JOIN_KIT_PLACEHOLDER`, research
 * 324 §2, note only). [reading: the decompilation's path, not measured running; capture NU6-5 settles the join]
 * Was: REMOTE_KIT_APPLY_PLACEHOLDER, "when another console's body takes up a received kit (`FUN_0053ec60`, called at
 * L455079 and L455445) is not traced (research 94 §A6)" -- the same value, `'spawn'`.
 */
export const REMOTE_KIT_APPLY_READING = 'spawn' as const;

/**
 * REMOTE_RESPAWN_REBUILD_READING (NU-12 B2; research 328 §1.1, §6): another console rebuilds a copy at its owner's
 * respawn mid-match, as at the round's reload (`FUN_00223680` D:L75920-75931 over every actor, a copy's kit taken at
 * D:L455072-455081): the player record's state field (`FUN_002be150` D:L162349-162350) reaches `FUN_00544210`
 * (D:L410551-410563), which sets `+0xfcf` on a dead (2 or 3) to alive (1) change when the controller's `+0x34` answers
 * true; the actor's update (`FUN_00547350` D:L412722-412726) then runs `FUN_00598b90(copy, 1)` -- the rebuild
 * (`FUN_00599b60` D:L455158), whose first play is `Stand` with no blend (research 328 §1.3). So the page rebuilds the
 * copy's animation (`Play.respawn`) at its seat's `spawn` and, where no spawn is counted, at a dead-to-alive change.
 * [reading: one inference -- `+0x34` as the copy's controller's, and `FUN_00547350` as the actor's per-frame update
 * reached through the vtable; settled by `+0x34` read, or capture NU12-2] Was (research 328 before its review's F2): "the
 * respawn's network path is not read; built as the round's until read".
 */
export const REMOTE_RESPAWN_REBUILD_READING = 'rebuilt' as const;

/**
 * NU-12 B2 (research 328 §5 B2; the build brief's F3): a body as the client draws it at the view tick, with the count of
 * its seat's `spawn` events (the room's, `room.ts` `spawn`, broadcast for every seat) that the drawn snapshot is past --
 * `./net/client` `bodies` -- or none from a source that counts none (the wire's `BodyState` alone).
 */
export type SpawnedBodyState = BodyState & { spawns?: number };

/** The requested key and body actually drawn, for local bot verification (FBA.R10, a browser adaptation). */
export interface RemoteAppearance { id: number; key: string | null; definition: string | null; model: string }

interface Remote {
  /** FBA.R10: the appearance key asked and the body actually drawn (the native type's when the key has none). */
  appearance: Omit<RemoteAppearance, 'id'>;
  /** `type`: the character type the body was built as (protocol 9; 0 until the room names one). */
  id: number; team: Team; type: number; view: BodyView; play: Play; weapon: Object3D | null; sidearm: Object3D | null; item: Firearm; snap: ReturnType<typeof snapshotOf> | null;
  /** The binoculars raised (`BodyFlag.Binoculars`, view state 4): the `*2binocular` clip over the body (`./binocularPose`). */
  binocs: BinocularPose;
  /** The throw's or the placing's clip, from the hold its body carries (`BODY_HOLD_SHIFT`; `./throwPose` `follow`). */
  hands: ThrowPose;
  /** The kit the weapons were hung from (five item ids), or null for the side's type's. */
  kit: number[] | null;
  deadFor: number; deathClip: string | null;
  /**
   * PRONE-TILT (`./rootTilt`, research 217 s7): the root's tilt this page runs for the body from its own floor (the
   * floor pick under the drawn feet, `tiltFloor`) on the walker's 60 Hz tick, as the room's walker runs it for the
   * seat; absent until the body's first living frame.
   */
  tilt?: { acc: number; state: RootTiltState; normal: Vec3 };
  /**
   * PAR-34 (research 252 s3; ACT.R8): seconds dead of real time (the frame's real seconds, `frame`'s `real`), what the
   * corpse rule counts (`corpseShownS`; NU-4: another seat's has no timer, so it never runs out -- was: the fade at
   * `BODY_FADE_S`); `deadFor` is the death pose's clock, a clip on the clamped step. Both start at the death (0, or a
   * joiner's corpse's age, `hydrateCorpse`).
   */
  fadeAge: number;
  /**
   * A flinch playing (`flinch`): its clip and how long it has played, or null. `pushed`: a one-shot a map program pushed
   * (`pushMotion`, a door's `Open door`), which `FUN_005a2690`'s gate does not apply to (`stepFlinch`).
   */
  flinch: { clip: string; t: number; pushed?: true } | null;
  /**
   * LATER 512: the flinch a door push covered (`pushOver`), its time frozen there, played on when the push's clip has run or
   * been cut (`stepFlinch`); undefined or null: none.
   */
  under?: { clip: string; t: number } | null;
  /** LATER 512's re-look: the landing clip's action serial playing when a door push came (`pushOver`), or null: none. */
  coverLand?: number | null;
  /** The weapons' named points (the muzzle's `firepoint`), rifle and pistol. */
  points: { rifle: readonly WeaponPoint[]; pistol: readonly WeaponPoint[] };
  /** HX-2: the hostage's index among the map's escortees (`setEscortee`), or null for a player. */
  escortee: number | null;
  /** HX-2: the escortee's stance last frame, and its stand-to-crouch transition while it plays (`escorteeSnapshot`). */
  stanceWas: PlaySnapshot['stance'] | null;
  transition: { serial: number; t: number; seconds: number } | null;
  /** HX-2: the opacity the view was last set to (`BodyView.setOpacity`). */
  opacityShown: number;
  /** NU-6 P2: the rocket launcher drawn on the body (`placeLauncher`), or null for none. */
  launcher: DrawnLauncher | null;
  /** NU-12 B2: its seat's spawns as the last body drawn counted them (`SpawnedBodyState.spawns`), or none. */
  spawns?: number;
  /** CPS bodies (a browser adaptation): the body's object tree watched for a change (`TreeWatch`), made at first use. */
  watch?: TreeWatch;
  /** CPS bodies: the zone gate's verdict last laid on the tree (`applyZoneGate`) and the tree's version it was laid on. */
  gateOn?: boolean;
  gateTree?: number;
  /** CPS bodies: the tree's first node named `head` (`headAt`), or null for none, as of the tree's version `headTree`. */
  headNode?: Object3D | null;
  headTree?: number;
  /** CPS bodies: the walk its play reads each frame (`remoteWalk`), made once (was: a new one a body a frame). */
  walk?: RemoteWalk;
}

/** What a remote body's `Play.frame` reads: its snapshot as of the call, in the third person. */
type RemoteWalk = Parameters<Play['frame']>[1];

/** CPS bodies (a browser adaptation): a body's walk, read at each call -- the snapshot is the body's current one. */
function remoteWalk(r: Remote): RemoteWalk {
  return { snapshot: () => r.snap, view: () => 'third' };
}

/** CPS bodies: `headAt`'s scratch; its value is copied out before the call returns. */
const _headAt = new Vector3();

/**
 * CPS bodies (the client performance sprint, its Log of 2026-11-03T02:52Z (B); a browser adaptation that changes
 * nothing drawn): a body's object tree's version, raised whenever an object is hung in it or taken out of it anywhere
 * (three's `childadded` / `childremoved`, dispatched by `Object3D.add` and `remove` -- `attach`, `removeFromParent` and
 * `clear` go through them -- on the parent). Every object of the tree is listened to: those hung since the last look
 * are walked to at the next `version()`, which a change has already raised. An object taken out keeps its listener, so
 * a change under it later raises the version once more: a walk too many, never one missed.
 */
class TreeWatch {
  private changes = 0;
  private stale = true;
  private readonly listened = new WeakSet<Object3D>();
  private readonly changed = (): void => { this.changes++; this.stale = true; };

  constructor(private readonly root: Object3D) {}

  /** The tree's version: the same number while no object has been hung in it or taken out since. */
  version(): number {
    if (this.stale) {
      this.stale = false;
      this.root.traverse((o) => {
        if (this.listened.has(o)) return;
        this.listened.add(o);
        o.addEventListener('childadded', this.changed);
        o.addEventListener('childremoved', this.changed);
      });
    }
    return this.changes;
  }
}

/** A remote body's snapshot (`./net/body` `snapshotOf`). */
type RemoteSnapshot = ReturnType<typeof snapshotOf>;

/**
 * HX-2 (web sprint 31; research 238 §3): a hostage's snapshot as its body plays it -- by the stance code and the speed
 * alone (199 §9, §12.10: the remote's replicated stance byte 0x7f drives body `+0x374`, the sticks `SetThrottle`, the
 * generic stance/speed selector the rest). Standing and moving faster than the dead stick (`AXIS_DEAD` of the forward
 * top): the No_weapon set's forward bands at speed / 65 (`HOSTAGE_TOP_SPEED_READING`, `bandPick` over `CIV_SETS`);
 * crouched, its idle (the set's crouched top is 0); going down, `transition`'s `civ_stand2crouch` once
 * (HOSTAGE_CROUCH_CLIP_READING). The item, the aim, the trigger, the binoculars, the jumps' landings, the swap overlay and
 * the traversal clip are not a hostage's (HOSTAGE_HANDS_PLACEHOLDER): left out. LATER 354: a blast's knock is -- its
 * Fall, Land and get-up (the No_weapon set's `GLOBAL` include: `seal_fallforward01` .. `seal_getupbackwards01`) and its
 * flight, as the room's snapshot carries them, over the stance's clip.
 */
/**
 * PRONE-TILT-2 (5) (research 217 s7.10; reading, pending review): whether a hostage's root runs the tilt on the page. Its
 * body is the SEAL's actor (`CSealEx`, the one vtable holding `FUN_005506a0`), so `FUN_00548090` runs for it; every clip of
 * its No_weapon set (`civ_*`) has no `Normalize`, so it writes only while a knock's `GLOBAL` clip owns the body (a
 * reaction or a get-up: `Land forward` / `Land backwards` (0.5, 0.9), `Prone cover` bare), as the room's `HostageFollow`
 * walker does while `thrown`. Otherwise the hostage lies level.
 */
export function escorteeTilts(snap: { action: { name: string } | null }): boolean {
  const f = snap.action ? ACTION_FAMILY[snap.action.name as keyof typeof ACTION_FAMILY] : undefined;
  return f === 'reaction' || f === 'getUp';
}

/** `HOSTAGE_PRONE_TILT_READING`'s alternatives. */
export type HostageProneTilt = 'unprone' | 'ai-stance';
/**
 * PRONE-TILT-2 review F1 (research 217 s7.10; reading, pending review): whether a knocked hostage's tilt takes the prone
 * ease (0.2 a game frame, `FUN_00548090` D:L413265-413272, posture word 2). `'unprone'`: no -- page and room alike (the room's
 * `HostageFollow` walker is never prone). The knock pops the body's stack to its base (`FUN_0058a4d0`, D:L442089) and
 * `FUN_005807d0` pushes the fall, for a living body, at posture word 0 when its controller is not remote (vtable +0x34,
 * `CRemoteCtrl::IsRemote`, research 193 s9, false), else at the caller's word (D:L442094-442102); the hostage's
 * No_weapon set has no prone motion (research 189 #13), so its get-down is no prone play. [reading: that the hostage's AI
 * controller answers `IsRemote` false where the room runs it (the 0 branch), and that `+0x174` follows the stack's top
 * word (research 92's inference), are not read.] `'ai-stance'`: the AI's stance (`extraction.ts`'s
 * `ai.stance`) as the posture, the ease when it is prone -- not built for the room. Settled by a PCSX2 read of a
 * get-down hostage's `+0x174` and root quaternion through a blast on a slope.
 */
export const HOSTAGE_PRONE_TILT_READING = 'unprone' as HostageProneTilt;

/**
 * PRONE-TILT (research 217 s7): one call of the rule for a body the page draws off the wire -- its top play from the
 * snapshot (`tiltTopOfSnapshot`, the action's length from `ACTION_SECONDS`: PRONE-TILT-2 (4)), the floor normal asked
 * only on a writing tick (`normal`). `hostage`: an escortee's body (`escorteeTilts`).
 */
export function remoteTiltStep(state: RootTiltState, snap: Pick<PlaySnapshot, 'stance' | 'action' | 'hold' | 'traversal' | 'yaw' | 'airborne'>,
  normal: () => readonly number[], hostage = false): RootTiltState {
  const top = tiltTopOfSnapshot(snap, (a) => (ACTION_CLIPS as Readonly<Record<string, { frames: number }>>)[a]?.frames ?? 1,
    (a) => (ACTION_SECONDS as Readonly<Record<string, number>>)[a] ?? 0);
  return stepRootTilt(state, {
    normal, yaw: snap.yaw, span: tiltWindowOf(top.clip), phase: top.phase,
    prone: snap.stance === 'prone' && !top.diving && !(hostage && HOSTAGE_PRONE_TILT_READING === 'unprone'),
    proneTransition: top.proneTransition, diving: top.diving, airborne: snap.airborne,
  });
}

export function escorteeSnapshot(snap: RemoteSnapshot, transition: { serial: number; t: number; seconds: number } | null): RemoteSnapshot {
  const m = Math.min(1, Math.hypot(snap.vx, snap.vz) / HOSTAGE_TOP_SPEED_READING.forward);
  const moving = snap.stance === 'stand' && m > AXIS_DEAD;
  const knock = snap.action && (ACTION_FAMILY[snap.action.name] === 'reaction' || ACTION_FAMILY[snap.action.name] === 'getUp') ? snap.action : null;
  return {
    ...snap, airborne: snap.airborne && knock !== null, landing: null, overlay: null, traversal: null, peek: 0,
    action: knock ?? (transition ? { name: 'standToCrouch', serial: transition.serial, t: transition.t, seconds: transition.seconds, reversed: false } : null),
    ground: moving ? { state: 'stand', forward: m, right: 0, cls: 1 } : { state: 'idle', forward: 0, right: 0, cls: -1 },
    item: NO_ITEM, weapon: 0, aiming: false, trigger: false, boost: false, binoculars: false,
  };
}

/**
 * A clip's key at `seconds` into it, reaching its last key at `run(playback, keys)` seconds and held there: its
 * `motion.rdr` playback (the clip's own seconds; keys / 30 without the entry). Null with the clip not loaded.
 */
function keyAt(clip: string, seconds: number, clips: PlayClips | null, run: (playback: number, keys: number) => number): TraversalPose | null {
  const c = clips?.clips.find((k) => k.name === clip);
  if (!c) return null;
  const entry = clips?.table?.find(([name]) => name === clip)?.[1];
  const playback = entry?.playback ?? c.frameCount / 30;
  const frame = Math.min(c.frameCount - 1, (seconds / run(playback, c.frameCount)) * (c.frameCount - 1));
  return { clip, frame, loop: false, rootY: null };
}

/**
 * A death clip at `seconds` into it, as the animator's one-node play (the traversal seam, `./animator`), held on the
 * last key once played. D20 (PAR-23, research 230 section 5.2 item 3): the original pushes the death as an ordinary
 * one-shot (`FUN_005a2490` D:L459804, `FUN_00588bc0(.., 8, 0, 0xd)`), whose play stops at phase (n - 1) / n
 * (`FUN_0028cc10` D:L134482-134495), runs at `dt / (T x (n - 1) / n)` (`FUN_0028c4f0` D:L134236-134275, `FUN_0028ada0`
 * D:L133349-133366) and samples key `phase x n` (`FUN_0028d670` D:L134881-134901): the last key n - 1 at
 * `T x ((n - 1) / n)^2` (`oneShotSeconds`).
 */
export function deathPose(clip: string, seconds: number, clips: PlayClips | null): TraversalPose | null {
  return keyAt(clip, seconds, clips, oneShotSeconds);
}

/**
 * A flinch at `seconds` into it (`flinch`): its key on the death's one-shot clock, or null once at its last key,
 * `T x ((n - 1) / n)^2` (`oneShotSeconds`) -- the body back to its own play -- or with the clip not loaded. PAR-58
 * (research 230 section 5.2 item 3): the flinch is pushed as the death is (`FUN_005a2690` D:L460019 / D:L460042,
 * `FUN_00588bc0(.., 0, 0xd)`), its play's flags 0x4 and 0x2 set after (D:L460021-460024) being none `FUN_0028c4f0`
 * reads (0x8, 0x40); and it pops there: the ground driver's end test (`FUN_00550ef0` D:L418193 -> `FUN_00582540`
 * D:L442925 -> `FUN_0028c6e0` D:L134283-134302, past the stop `(n - 1) / n` by half a tick's step) answers 1 for it
 * (D:L443131-443132: no flinch action is one of its cases, and no callback is set on it) and `FUN_005870e0` pops it
 * (D:L418203), the reload's refusal (0x4) going with it (`Room.flinch`'s window, PTW.R3). The stick's cut before it
 * (D:L418180-418185 with `FUN_00587c20`; PAR-60, research 230 section 5.2.1) ends the victim's own (`room.ts`
 * `flinchCut`, `./walk` `setFlinchPose`); another's body here is cut the same way by the victim's replicated stick
 * (`stepFlinch`; LATER 404, research 230 section 5.2.12: FLINCH_CUT_REMOTE_READING read), else plays to this end. The
 * legs' blend is FLINCH_LAYER_PLACEHOLDER's, a capture's.
 */
export function flinchPose(clip: string, seconds: number, clips: PlayClips | null): TraversalPose | null {
  const c = clips?.clips.find((k) => k.name === clip);
  if (!c) return null;
  const playback = clips?.table?.find(([name]) => name === clip)?.[1]?.playback ?? c.frameCount / 30;
  return seconds < oneShotSeconds(playback, c.frameCount) ? keyAt(clip, seconds, clips, oneShotSeconds) : null;
}

/**
 * FLINCH_LAYER_PLACEHOLDER (research 91 section 21.1): the game starts the flinch as the actor's motion through
 * `FUN_00588bc0(actor, motion, state, 0, 0xd)` (`FUN_005a2690` L460019, L460042), whose layering over the body's other
 * play -- the 0xd and the motion's flags set after it -- is unread; the page draws the clip whole-body through the
 * traversal seam, so a body hit on the run is drawn in the standing flinch while its feet slide on. And it starts the
 * clip when the reliable `flinch` event arrives, about one interpolation delay before the body is drawn at the hit's
 * tick (the event carries no tick): the flinch is drawn a little early. On the page's own body (MATCH-FIX-2) the
 * whole-body clip is posed in the scope too, the body hidden: the muzzle the local round's leg starts from (`./fire`,
 * the accuracy pip's `blockedMuzzle` in third person) and the posed root the walk's camera stands on (`FUN_0029a950`)
 * follow it while it plays -- cosmetic (the room's round has no origin from the page), and what the game's posed actor
 * would give if its flinch is whole-body, which is the unread part (`play.test.ts` pins the page's).
 */
export const FLINCH_LAYER_PLACEHOLDER = 'whole body, from the event' as const;

/**
 * LATER 512's re-look: the landings that play a clip (`Walker`'s landing `clip`: `FUN_005af590`), each an action on the
 * snapshot with its serial -- a new one pops the stack to its base (`FUN_0058a5e0` D:L466897). The knock's landings
 * (`landDeath`, `landBackwards`) are `pushPopped`'s already.
 */
const LANDING_CLIP_ACTIONS: ReadonlySet<string> = new Set(['land', 'landHard', 'hit', 'hitStomach']);

/**
 * One frame of a body's flinch (`RemotePlayers.frame`): a dead body's is dropped (its death clip is its play); else the
 * flinch runs `dt` on and, unless `FUN_005a2690` would refuse it now (`./net/deaths` `flinchRefused`,
 * FLINCH_GATE_READING: a ladder or a hang, a knock fall, a swap, the long hits; PF-21), its key is the body's traversal
 * pose (FLINCH_LAYER_PLACEHOLDER) -- over the ground play, a jump, a landing, a climb's step-up or a stance transition
 * alike -- dropped once played through or once refused. The room gates the start (`Room.flinch`), the launcher's raise
 * included, which a remote snapshot does not carry. LATER 404 (research 230 section 5.2.12): and dropped as the
 * victim's own is cut -- the ground driver pops a one-shot top from its second tick after the push
 * (`FLINCH_CUT_COMMANDS`) and past the clip's NoInterrupt (`noInterruptCommands`) when the move axes or the turn stand
 * past 0.1 (`reloadCut`, D:L418182-418185) -- on the victim's replicated stick (the snapshot's ground axes, `cutStick`,
 * and `turnRate`): another console copies the replicated axes into the same fields (D:L418613-418615), unscaled. The
 * clock is the event's arrival (the event carries no tick, FLINCH_LAYER_PLACEHOLDER's note), the stick the last
 * snapshot's.
 */
export function stepFlinch(
  r: { flinch: { clip: string; t: number; pushed?: true } | null; under?: { clip: string; t: number } | null; coverLand?: number | null },
  snap: { alive: boolean; traversal?: TraversalPose | null; action: PlaySnapshot['action'] } & Pick<FlinchGateBody, 'overlay' | 'launcher'>
    & Partial<Pick<PlaySnapshot, 'cutStick' | 'turnRate' | 'airborne' | 'landedBare' | 'landing'>>,
  dt: number, clips: PlayClips | null,
): void {
  if (!snap.alive) { r.flinch = null; r.under = null; return; }
  if (!r.flinch) return;
  r.flinch.t += dt;
  // A program's push (`pushMotion`: a door's `Open door`) has no `FUN_005a2690` before it -- `ai::ANIMATE` pushes through
  // `FUN_00588bc0` directly (D:L487256-487260) -- so the flinch's gate is not asked of it; what pops the stack takes it
  // off (`./net/deaths` `pushPopped`: a knock, a ladder's mount, a climb's start; #485's review F3).
  // The review's F2: a landing that plays a clip pops the stack to its base too (`FUN_0058a5e0` D:L466897; research 92
  // section 4), as the room's `flinchLanding` and the page's `flinchDown` drop the door clip and the flinch together. The
  // folds' re-look: a NEW landing -- the snapshot's `landing` is the last landing since the feet left the floor, a lasting
  // state -- so a landing clip's action (`LANDING_CLIP_ACTIONS`) whose serial is not the one playing at the push.
  // (The room's `flinchLanding` acts only on a flinch covered in the air; this pops on any new landing clip -- the same,
  // since a landing needs the air first: the fix's re-look, (3).)
  const landNow = snap.action && LANDING_CLIP_ACTIONS.has(snap.action.name) ? snap.action.serial : null;
  const clipLanding = landNow !== null && landNow !== (r.coverLand ?? null);
  const popped = r.flinch.pushed ? pushPopped(snap) || clipLanding : flinchRefused(snap);
  const gone = popped || remoteCut(r.flinch, snap, clips);
  const pose = gone ? null : flinchPose(r.flinch.clip, r.flinch.t, clips);
  if (pose) { snap.traversal = pose; return; }
  // LATER 512 (research 92 section 4): a push's clip run or cut hands back the flinch it covered, on from its frozen time
  // (`FUN_0028da00` D:L135098-135110); a pop to the base (`pushPopped`: a knock, a ladder, a climb) takes both.
  const under = r.flinch.pushed && !popped ? r.under ?? null : null;
  r.under = null;
  r.coverLand = null;
  r.flinch = under;
  const back = under ? flinchPose(under.clip, under.t, clips) : null;
  if (back) snap.traversal = back; else r.flinch = null;
}

/**
 * LATER 512: a map program's push (`pushMotion`, a door's `Open door`) on another's body -- over a flinch, which it
 * covers without popping (only the top advances): the flinch kept under it (`under`, its time frozen); over another push,
 * the flinch below both kept; over nothing, none.
 */
export function pushOver(
  r: { flinch: { clip: string; t: number; pushed?: true } | null; under?: { clip: string; t: number } | null; coverLand?: number | null },
  clip: string, coverLand: number | null = null,
): void {
  r.under = r.flinch && !r.flinch.pushed ? { clip: r.flinch.clip, t: r.flinch.t } : r.flinch?.pushed ? r.under ?? null : null;
  r.coverLand = coverLand;                                        // the landing clip playing now is no new landing
  r.flinch = { clip, t: 0, pushed: true };
}

/**
 * LATER 404 (research 230 section 5.2.12): whether the victim's replicated stick has cut another body's one-shot top
 * now -- from `FLINCH_CUT_COMMANDS` after its push and past its clip's NoInterrupt, the move axes or the turn past 0.1
 * (`reloadCut`, the victim's own test). No stick on the snapshot (a stand-in): no cut.
 */
function remoteCut(f: { clip: string; t: number }, snap: Partial<Pick<PlaySnapshot, 'cutStick' | 'turnRate' | 'airborne' | 'landedBare'>>, clips: PlayClips | null): boolean {
  if (snap.cutStick === undefined || snap.turnRate === undefined) return false;
  const c = clips?.clips.find((k) => k.name === f.clip);
  const entry = clips?.table?.find(([name]) => name === f.clip)?.[1];
  const after = Math.max(FLINCH_CUT_COMMANDS, c && entry?.playback ? noInterruptCommands(entry.playback, c.frameCount, entry.noInterrupt ?? null) : 0) / TICK_HZ;
  return f.t >= after - 1e-9 && reloadCut({ cutStick: snap.cutStick, turnRate: snap.turnRate, airborne: snap.airborne === true, landedBare: snap.landedBare });
}

/**
 * REMOTE_STEP_STICK_READING (2026-10-02, research 91 section 22.3): `FUN_005a39b0` (460385-460434) picks the step or the
 * stealth step by the actor's controller's three stick floats (past +-0.5); another player's controller on a console is
 * not read, so the page takes its replicated ground motion's forward and right (`BodyState.groundForward/Right`, the
 * mover's stick) and their larger magnitude, as the page's own walk takes its stick (`./walkSounds`). The footfall's
 * gate is the actor's `+0xe0` bit 2 (`FUN_005a3570` D:L460295), set by `FUN_00552850` (D:L418748-418861, research 179
 * section 11.20) on the viewer's own actor and at most three others within 500 units: `footfallsHeard`
 * (FOOTFALL_CAP_READING, FOOTFALL_NEAREST_READING).
 */
export const REMOTE_STEP_STICK_READING = 'ground motion forward/right' as const;

/**
 * NU-7 G1 (research 325 §1.4, §5; reading, pending review): another console's copy plays the thrower's standing throw from
 * the Push Blend (`network_log`, research 230 §5.2.11's reading; D:L441900, D:L446408-446416, D:L160789-160796,
 * D:L160762-160766, D:L445755-445756) and its `throw_whoosh` sounds on the copy's own phase (`FUN_00550ef0` ->
 * `FUN_0057a330` D:L418454 -> `FUN_0028c9e0` D:L439009, no controller test D:L134377-134450): the body's own clip's
 * callbacks, played (`RemotePlayers.takeThrowCallbacks`). Open: the arguments of `FUN_00588bc0` at D:L445756 (not
 * recovered by the decompiler), the `network_log` bit; settles: capture NU7-3.
 */
export const REMOTE_THROW_GRUNT_READING = 'the body\'s own clip' as const;

/** The step a remote body's footfall sounds (`GameAudio.onFootstep`'s place and step), or null for none. */
export interface RemoteStep { at: [number, number, number]; stance: 0 | 1 | 2; stick: number }

/**
 * Another player's footfall heard (ported from Chris's browser-beta-v5, d578f347): `FUN_005a3570` (460266-460378) runs
 * in the actor update with no locality test (`FUN_005506a0` L417909), so a console hears the others' steps -- at the
 * foot (`vtable+0x14`, `FUN_005a39b0`), the crawl prone, whose left foot's call is skipped; the step or the stealth
 * step by the stick (REMOTE_STEP_STICK_READING). Null for any other event, and for the prone left foot.
 */
export function remoteFootfall(e: PlayEvent, s: Pick<PlaySnapshot, 'feet' | 'stance' | 'ground'>): RemoteStep | null {
  if (e.kind !== 'footfall') return null;
  const stance = s.stance === 'prone' ? 2 : s.stance === 'crouch' ? 1 : 0;
  if (stance === 2 && e.foot === 'left') return null;
  const at = e.position ?? s.feet;
  return { at: [at[0], at[1], at[2]], stance, stick: Math.max(Math.abs(s.ground.forward), Math.abs(s.ground.right)) };
}

/**
 * FOOTFALL_CAP_READING (PF-25, PF.R43; research 179 section 11.20, research 219 section 4): `FUN_005a3570` sounds a step
 * only with the actor's `+0xe0` bit 2 (D:L460295); `FUN_00552850` (D:L418748-418861) sets it per viewer, on the viewer's
 * own actor always (L418860) and on at most `DAT_0064fc78` = 3 (`consts.out`) other actors of its list (`+0xd8`) whose
 * distance squared (the entry's +0x10) is under 250000.0 (500 units; strict). A reading: the console's own build of the
 * list, and its skip of a remote player's flagged actor (`+0x265` bits 0/1, not modelled), are not reproduced here.
 */
export const FOOTFALL_CAP_READING = { others: 3, range2: 250000 } as const;

/**
 * FOOTFALL_NEAREST_READING (PF-25, PF.R43; research 179 section 11.20): which three -- the page takes the nearest by
 * distance squared to the listener (ties in the snapshot's order). Owed: whether `FUN_00552850`'s `+0xd8` list is
 * sorted by distance; if it is not, the original's three are the list's first three in range, not the nearest.
 */
export const FOOTFALL_NEAREST_READING = 'nearest' as const;

/**
 * The other bodies whose footfalls the page hears this frame (FOOTFALL_CAP_READING, FOOTFALL_NEAREST_READING): the
 * living ones under 500 units of `listener` (the page's own feet), nearest first, at most three; null -- every living
 * body -- without a listener (the map viewer's watcher, a page not in a body). The page's own steps are never here
 * (`./walkSounds` sounds them unranked: L418860).
 */
export function footfallsHeard(bodies: readonly Pick<BodyState, 'id' | 'feet' | 'flags'>[], listener: readonly [number, number, number] | null): Set<number> | null {
  if (!listener) return null;
  const near: { id: number; d2: number }[] = [];
  for (const b of bodies) {
    if (!(b.flags & BodyFlag.Alive)) continue;                       // a dead body takes no slot: PF.R43's choice -- FUN_00552850 has no alive test; whether a corpse stays in +0xd8 is unread
    const dx = b.feet[0] - listener[0], dy = b.feet[1] - listener[1], dz = b.feet[2] - listener[2];
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < FOOTFALL_CAP_READING.range2) near.push({ id: b.id, d2 });
  }
  near.sort((a, b) => a.d2 - b.d2);                                   // stable: ties keep the snapshot's order
  return new Set(near.slice(0, FOOTFALL_CAP_READING.others).map((n) => n.id));
}

/**
 * A living remote body's footfall to sound (`remoteFootfall`), with its id and its feet (the floor's material there), and
 * since PAR-8 its facing (`yaw`, degrees, the replicated mover's): the line its footprint runs along -- `FUN_005a3570`
 * prints beside the step's sound (`FUN_005a3280`, `./matchEffects`; web research 257 s1). `RemotePlayers` always passes
 * it; a caller without a facing (a test of the sound alone) prints nothing.
 */
export type RemoteStepHook = (id: number, step: RemoteStep, feet: [number, number, number], yaw?: number) => void;

/**
 * PAR-41 (RE-5's dev read, `./devSeen`): one drawn body as `RemotePlayers.seenForDev` gives it -- its fields copied when
 * read, and its group, the node drawn, to be read and never written. A browser adaptation: no original.
 */
export interface SeenRemoteBody {
  readonly id: number;
  /** A hostage's index among the map's escortees (`setEscortee`), or null for a player. */
  readonly escortee: number | null;
  /** Alive in the snapshot the body was last drawn from, or null before one. */
  readonly alive: boolean | null;
  readonly deadFor: number;
  readonly deathClip: string | null;
  /** The clip its `Play` plays and the clip's key (`Play.animStats`), or null before its first play. */
  readonly anim: { readonly clip: string; readonly frame: number } | null;
  readonly group: Object3D;
  /** The body's fittings by `character.rdr` name (`BodyView.stats.fittingNames`). */
  readonly fittingNames: readonly string[];
}

/** PAR-41: what `RemotePlayers.seenForDev` gives -- the drawn bodies, the ghosts (`markGhost`), the gear asked by id. */
export interface SeenRemotes {
  readonly bodies: readonly SeenRemoteBody[];
  readonly ghosts: readonly number[];
  readonly gearShown: ReadonlyMap<number, readonly string[]>;
}

export class RemotePlayers {
  /**
   * Research 303: the others' VICTORY DANCES (`./netPage`'s `victory`: the room's variant, `elapsed` in for a joiner) --
   * on the body's own `Play`, a dance heard before its body is drawn held until it is (its clock running meanwhile); a
   * stop, a death or a `clear` ends it. The clips are the map's (`./victoryData` `withVictoryClips`): none in its place.
   */
  private readonly pendingVictories = new Map<number, { serial: number; clip: string; elapsed: number }>();
  /** Each drawn body's dance and its clip's frame (the browser spec's hook). */
  victoryStates(): { id: number; clip: string | null; frame: number | null }[] {
    return [...this.remotes.values()].map((r) => ({ id: r.id, clip: r.play.victoryState()?.clip ?? null, frame: r.play.animStats()?.frame ?? null }));
  }
  /**
   * PAR-41 (RE-5's dev read, `./devSeen`; the dev hook's `devSeen()`): each drawn body, the ghosts and the gear asked, as
   * the development instrument reads them -- copies made at the call, so a write to what it gives changes nothing kept
   * (a body's group is the node drawn: read, never written). Read only; a browser adaptation, changing nothing drawn.
   */
  seenForDev(): SeenRemotes {
    const bodies = [...this.remotes.values()].map((r): SeenRemoteBody => {
      const anim = r.play.animStats();
      return {
        id: r.id, escortee: r.escortee, alive: r.snap ? r.snap.alive : null, deadFor: r.deadFor, deathClip: r.deathClip,
        anim: anim ? { clip: anim.clip, frame: anim.frame } : null, group: r.view.group, fittingNames: [...r.view.stats.fittingNames],
      };
    });
    const gearShown = new Map<number, readonly string[]>();
    for (const [id, names] of this.gearShown) gearShown.set(id, [...names]);
    return { bodies, ghosts: [...this.ghosts], gearShown };
  }
  /** A seat's dance started (`clip`) or stopped (null). */
  victory(id: number, serial: number, clip: string | null, elapsed = 0): void {
    const r = this.remotes.get(id);
    if (!clip) { this.pendingVictories.delete(id); r?.play.stopVictory(); return; }
    if (r) r.play.startVictory(serial, clip, elapsed);
    else this.pendingVictories.set(id, { serial, clip, elapsed });
  }
  /**
   * LATER 31 (research 249 §1): the replay mode's re-told welcome (a seek) -- every body's dance stopped and its record of
   * the serials seen forgotten (`Play.resetVictory`), a held one dropped, so the fold's dances told after the welcome
   * (RE-1: each at its `elapsed` at the target) are drawn whatever was seen at the old playhead. `./netPage` calls it in
   * the replay mode only: a live page keeps refusing a stale or repeated serial.
   */
  resetVictories(): void {
    this.pendingVictories.clear();
    for (const r of this.remotes.values()) r.play.resetVictory();
  }

  private readonly remotes = new Map<number, Remote>();
  private map: LoadedMap | null = null;
  private lighting: Lighting | null = null;
  private clips: PlayClips | null = null;
  private kitOf: SideKit | null = null;
  private readonly teams = new Map<number, Team>();
  /** FBA.R10: optional authored appearance keys, independent of the native ARMORY type and its loadout. */
  private readonly characterKeys = new Map<number, string>();
  /** Protocol 7: each player's kit as the room named it (a `spawn`, the welcome's players). */
  private readonly kits = new Map<number, number[]>();
  /** Protocol 9: each player's character type as the room named it (a `spawn`, the welcome's players). */
  private readonly types = new Map<number, number>();
  private typeKit: ((team: Team, type: number) => readonly number[]) | null = null;
  /** XR-06: the gear shown beyond the body's own (the bomb carrier's satchel), by player id: laid on each body built. */
  private readonly gearShown = new Map<number, Set<string>>();
  /** HX-2: the ids the room names hostages, each its escortee (an index of the map's, or its character's name). */
  private readonly escortees = new Map<number, number | string>();
  /** HX-2: each hostage's opacity, and whether the rescued fade runs it down (`setOpacity`). */
  private readonly opacities = new Map<number, { opacity: number; fading: boolean }>();

  /** `steps`: each living body's footfalls (`remoteFootfall`), for the page's sounds; null hears none. */
  constructor(private readonly scene: Scene, private readonly steps: RemoteStepHook | null = null) {}

  /** PF-25: the page's own feet, the footfall cap's listener (`footfallsHeard`); null hears every living body. */
  private listener: [number, number, number] | null = null;

  /**
   * NU-4 (research 317 s1.8, s5 B1): the room's rules (the welcome's, `./netPage`), which the corpse rule reads
   * (`corpseShownS`). Until told, the page's own default (`NetPage`'s, the respawn rules); another seat's corpse lies
   * until its seat is alive under both.
   */
  setRules(rules: Rules): void {
    this.rules = rules;
  }
  private rules: Rules = 'respawn';
  /** The others whose footfalls this frame's play may sound (`footfallsHeard`), chosen once a frame; null: all. */
  private heard: Set<number> | null = null;

  /**
   * PF-25 (FOOTFALL_CAP_READING): where the page's own body stands, set each frame before `frame` -- the three nearest
   * others within 500 units of it are heard; null (no body: the watcher, a spectator's free view) hears every one.
   */
  setListener(feet: readonly [number, number, number] | null): void {
    this.listener = feet ? [feet[0], feet[1], feet[2]] : null;
  }

  /**
   * A new map (its bodies, textures, and each side's two firearms): every remote is rebuilt from it on its next snapshot.
   * `typeKit`: each side's types' kits by id (`./loadout` `typeLoadout`), the kit a body is drawn with until its own is named.
   */
  setMap(map: LoadedMap | null, lighting: Lighting, kitOf: SideKit | null, typeKit: ((team: Team, type: number) => readonly number[]) | null = null): void {
    this.clear();
    this.kits.clear();
    this.types.clear();
    this.escortees.clear();
    this.opacities.clear();
    this.typeKit = typeKit;
    this.map = map;
    this.lighting = lighting;
    this.kitOf = kitOf;
    this.volumes = null;
    this.tiltGrid = undefined;                                       // PRONE-TILT: the new map's floor, built on first use
  }

  setClips(clips: PlayClips | null): void {
    this.clips = clips;
    this.volumes = null;
    for (const r of this.remotes.values()) r.play.setClips(clips);
  }

  /**
   * MAP-10b (research 215 s7): a living body's pose on a turret by its id -- the turret anim set's mount clip, its hold,
   * the release's reversed clip (`./turretPage` `turretPose`) -- drawn in place of its own play while it returns one,
   * over a flinch (the room starts none on a mounted body). Null: none.
   */
  setMountPose(pose: ((id: number) => TraversalPose | null) | null): void {
    this.mountPose = pose;
  }
  private mountPose: ((id: number) => TraversalPose | null) | null = null;

  /** Every clip a body is drawn with (`PlayClips`), for the pages that time their own clips (`./turretPage`). */
  playClips(): PlayClips | null {
    return this.clips;
  }

  /** PRONE-TILT: the map's ground grid for the bodies' floor picks (`groundGrid`, built once a map), or null. */
  private tiltGrid: Grid | null | undefined = undefined;

  /**
   * PRONE-TILT (`./rootTilt`, research 217 s7): one body's root tilt advanced by `dt` once a 30 Hz game frame
   * (`GAME_FRAME_DT`, the walker's `tiltClock`; PRONE-TILT-2, the EPH pass's Q2) -- each frame it writes, the floor picked under its feet (`FUN_005b0420`'s pick, as `Walker.tiltFloorNormal`; kept when it
   * misses) and the rule stepped on the snapshot's top play (`tiltTopOfSnapshot`). The quaternion it wrote, or null.
   */
  private remoteTilt(r: Remote, snap: PlaySnapshot, dt: number, hostage = false): RootTiltState['q'] {
    const t = r.tilt ??= { acc: 0, state: rootTiltStart(), normal: [0, 1, 0] };
    t.acc += Math.max(0, dt);
    // PRONE-TILT-2 (the EPH pass, Q2; proven): once a 30 Hz game frame, as the walker's `tiltClock` (D:L417863).
    for (let n = 0; t.acc >= GAME_FRAME_DT - 1e-9 && n < 8; n++) {
      t.acc -= GAME_FRAME_DT;
      const pick = (): Vec3 => {                                    // only on a tick the rule writes (`TiltInput.normal`)
        if (this.tiltGrid === undefined) this.tiltGrid = this.map?.ground ? groundGrid(this.map.ground) : null;
        const grid = this.tiltGrid, [x, y, z] = snap.feet;
        const floor = grid ? selectFloor(probeGround(grid, x, z), y + STEP_PROBE_LIFT_READING, y) : null;
        if (floor) t.normal = [floor.normal[0], floor.normal[1], floor.normal[2]];
        return t.normal;
      };
      t.state = remoteTiltStep(t.state, snap, pick, hostage);
    }
    if (t.acc >= GAME_FRAME_DT) t.acc = 0;                         // a backlog past 8 frames is dropped
    return t.state.q;
  }

  /**
   * INT-NET-2 (research 84 §19): the distance along the eye's unit `dir` to the nearest living body drawn, within `reach`,
   * or null -- the aim point `FUN_005aa6e0` takes on a body (`./fire` `FireSource.targetDistance`). Each body on the
   * room's capsules (`./net/hitVolumes` `bodyVolumes` / `rayBody`, its type's stance volumes as `Room.volumesOf` picks
   * them, from the page's own bodies as the loopback's are: `./teamBody` `hitBodiesOfPage`) at its drawn feet, yaw and
   * posture: the page converges on the shape the room judges the hit by. Ported from Chris's browser-beta-v5 (d578f347,
   * `remotePlayers.ts` `aimDistance`), whose raycast against the skinned meshes (skinned on the CPU every shot) is not
   * taken: the drawn mesh is not what decides the hit.
   */
  aimDistance(eye: Vec3, dir: Vec3, reach: number): number | null {
    let best: number | null = null;
    for (const r of this.remotes.values()) {
      const s = r.snap;
      if (!s?.alive || !r.view.group.visible) continue;
      const volumes = typeof r.escortee === 'number' ? this.escorteeVolumesOf(r.escortee) : this.volumesOf(r.team, r.type);
      const hit = rayBody(eye, dir, reach, bodyVolumes(s.feet, s.yaw, s.stance, volumes, s.rootTilt));   // PRONE-TILT: as the room's
      if (hit && (best === null || hit.t < best)) best = hit.t;
    }
    return best;
  }

  /**
   * HX-4a (research 239 s1; `./net/hostageOrder` `ORDER_PICK_READING`): every living drawn body the ray meets within
   * `reach`, by id, at the distance `aimDistance` measures it -- the hostage order's pick (`FUN_005aa6e0`: the nearest body
   * before a blocking surface, `crosshairPick`), a hostage's body among the others'. A hostage on its own character's
   * capsules (`escorteeVolumesOf`, as `aimDistance` and the room's `hostageVolumes` take it; HX-OBEY, research 239 s9.3:
   * it was cast on SEAL type 0's, a shape the room never judges a hostage by).
   */
  aimBodies(eye: Vec3, dir: Vec3, reach: number): { id: number; distance: number }[] {
    const out: { id: number; distance: number }[] = [];
    for (const [id, r] of this.remotes) {
      const s = r.snap;
      if (!s?.alive || !r.view.group.visible) continue;
      const volumes = typeof r.escortee === 'number' ? this.escorteeVolumesOf(r.escortee) : this.volumesOf(r.team, r.type);
      const hit = rayBody(eye, dir, reach, bodyVolumes(s.feet, s.yaw, s.stance, volumes, s.rootTilt));   // PRONE-TILT: as the room's
      if (hit) out.push({ id, distance: hit.t });
    }
    return out;
  }

  /** Each side's types' stance volumes, built once a map and its clips (`Room`'s rule: the type's, its side's first's, the SEAL's). */
  private volumes: Record<Team | 'escortees', (StanceVolumes | null)[]> | null = null;
  /** HX-2: a hostage's volumes, as `Room.volumesOf({ escortee })`: its own, the first hostage's, SEAL 1's. */
  private escorteeVolumesOf(index: number): StanceVolumes | null {
    this.volumesOf('seal', 0);
    const list = this.volumes!.escortees;
    return list[index] ?? list[0] ?? this.volumes!.seal[0] ?? null;
  }
  private volumesOf(team: Team, type: number): StanceVolumes | null {
    if (!this.volumes) {
      const bodies = this.map ? hitBodiesOfPage(this.map, this.clips) : { seal: [], terrorist: [], escortees: [] };
      const built = new Map<object, StanceVolumes>();
      const side = (list: readonly (HitBodyOfPage | null)[]): (StanceVolumes | null)[] => list.map((h) => {
        if (!h) return null;
        let v = built.get(h);
        if (!v) { v = stanceVolumes(h); built.set(h, v); }
        return v;
      });
      this.volumes = { seal: side(bodies.seal), terrorist: side(bodies.terrorist), escortees: side(bodies.escortees ?? []) };
    }
    const side = this.volumes[team];
    return side[type] ?? side[0] ?? this.volumes.seal[0] ?? null;
  }

  /** A player's team, from the server's `welcome` / `joined` / `promoted`. */
  setTeam(id: number, team: Team): void {
    this.teams.set(id, team);
    const r = this.remotes.get(id);
    if (r && r.team !== team) this.remove(id);
  }

  /** XR-06: a player's side as the room named it, or null (`./bombPage` `teamOf`: the carrier's side). */
  teamOf(id: number): Team | null {
    return this.teams.get(id) ?? null;
  }

  /**
   * XR-06 (research 214 s1; `./bodyView` `HIDDEN_AT_SPAWN`): a piece of a player's gear shown or hidden by its
   * `character.rdr` name -- the bomb carrier's "Satchel", shown on the pickup (`FUN_005bbf10` -> `FUN_0059df60(owner, 1)`)
   * and hidden on a drop or a plant. Kept by id, so a body built later (a respawn, a team change, a map) wears it too.
   */
  setGearVisible(id: number, name: string, on: boolean): void {
    const shown = this.gearShown.get(id) ?? new Set<string>();
    if (on) shown.add(name); else shown.delete(name);
    if (shown.size) this.gearShown.set(id, shown); else this.gearShown.delete(id);
    this.remotes.get(id)?.view.setGearVisible(name, on);
  }

  /**
   * HX-2 (web sprint 31; research 238 §1, §3): the room names `id` a hostage -- `which` its index among the map's
   * escortees (`chartype.rdr` order) or its `character.rdr` character (`mp_fem2`, as HX-1's welcome list names it). Its
   * body is that escortee's (`./teamBody` `escorteeBody`; none, and the id is not drawn, when the map has no such body),
   * played in the No_weapon set by its stance and speed (`escorteeSnapshot`), no weapon hung, no binoculars raised. A
   * drawn body of another kind is rebuilt on its next snapshot.
   */
  setEscortee(id: number, which: number | string): void {
    if (this.escortees.get(id) === which) return;
    this.escortees.set(id, which);
    this.remove(id);
  }

  /**
   * HX-2: a hostage's opacity, 0..1 (HX-1's `hostageState`: 1 shown, 0 hidden). `fading` (rescued: the AI's state 0x11)
   * runs it down from there at `HOSTAGE_FADE_READING` a second on this page (each console fades its own copy, 199 §12.3);
   * at 0 the body is hidden and leaves the aim (HOSTAGE_HIDDEN_READING). Kept by id: a body built later takes it.
   */
  setOpacity(id: number, opacity: number, fading = false): void {
    this.opacities.set(id, { opacity: Math.min(1, Math.max(0, opacity)), fading });
  }

  /** What a remote body's clips are doing (`Play.animStats`), or null with no body drawn for `id`. */
  animStats(id: number): AnimStats | null {
    return this.remotes.get(id)?.play.animStats() ?? null;
  }

  forget(id: number): void {
    this.escortees.delete(id);
    this.opacities.delete(id);
    this.teams.delete(id);
    this.gearShown.delete(id);
    this.kits.delete(id);
    this.types.delete(id);
    this.deathsHeard.delete(id);                                 // NU-11b H1: the seat left; a new seat of its id is first seen afresh
    this.characterKeys.delete(id);
    this.remove(id);
  }

  /**
   * A server-named regional appearance; changing it rebuilds the body alone through the native actor path on the next
   * snapshot. The seat's death goes with it (the area (c) review's finding 5): its clip and age into the pending pair the
   * rebuild reads, as a joiner's corpse's do (`hydrateCorpse`); its heard mark (NU-11b H1) is the seat's, kept by `remove`.
   */
  setCharacter(id: number, key: string | null): void {
    if ((this.characterKeys.get(id) ?? null) === key) return;
    if (key === null) this.characterKeys.delete(id); else this.characterKeys.set(id, key);
    const r = this.remotes.get(id);
    if (r?.snap && !r.snap.alive) {
      if (r.deathClip) this.pendingDeaths.set(id, r.deathClip); else this.pendingDeaths.delete(id);
      this.pendingAges.set(id, r.fadeAge);
    }
    this.remove(id);
  }

  /** Read-only copies of the bodies actually drawn, including native fallback when an appearance is unavailable. */
  appearances(): RemoteAppearance[] {
    return [...this.remotes.values()].map((r) => ({ id: r.id, ...r.appearance }));
  }

  /**
   * Protocol 9: a player's character type (its `spawn`, the welcome's players): a drawn body of another type is taken
   * away and built again as this one on its next snapshot, as a new side is (`setTeam`).
   */
  setType(id: number, type: number): void {
    if (!Number.isInteger(type) || type < 0) return;
    this.types.set(id, type);
    const r = this.remotes.get(id);
    if (r && r.type !== type) this.remove(id);
  }

  /** A player's character type as the page knows it (0, SEAL 1 / TERRORIST 1, until named). */
  playerType(id: number): number {
    return this.types.get(id) ?? 0;
  }

  /**
   * A player's kit (protocol 7: its `spawn`, the welcome's players): five item ids; a drawn body whose kit changed has
   * its two firearms hung again (REMOTE_KIT_APPLY_READING) -- a `spawn`, the welcome's, and a pick-up's `taken.kit` at
   * the accept, at once and with no action on the body (research 324 §1.4: `FUN_0059f0c0` on every console).
   */
  setKit(id: number, kit: readonly number[]): void {
    if (kit.length !== 5) return;
    this.kits.set(id, [...kit]);
    const r = this.remotes.get(id);
    if (r && !sameKit(r.kit, kit)) this.hang(r, [...kit]);
  }

  /** A player's kit as the page knows it, or null (its side's type's then). */
  playerKit(id: number): readonly number[] | null {
    return this.kits.get(id) ?? null;
  }

  /**
   * One frame: every body at its interpolated state, in its clip. PAR-34 (research 252 s3; ACT.R8): `real` is the frame's
   * real seconds (`./frameTime`, through `NetPage.frame`; default `dt`), which the timed fades count -- a corpse's rule
   * (`corpseShownS`, `fadeAge`; NU-4: none for another seat's, which lies until its seat is alive) and a rescued
   * hostage's (`fadeStep`, `HOSTAGE_FADE_READING`) -- so a body leaves the view
   * and the aim after the same real time at any frame rate, and each body's `Play` (its rifle's lowering countdown,
   * `WeaponRaise`). The clips (the death pose, the flinch, the hands, the
   * binoculars, a hostage's stance change, a victory) are animations and keep the clamped `dt`.
   */
  frame(dt: number, bodies: readonly SpawnedBodyState[], camera: PerspectiveCamera, real = dt): void {
    this.throwCalls = [];
    for (const p of this.pendingVictories.values()) p.elapsed += dt;
    const seen = this.seenThisFrame;                             // CPS bodies: one set, emptied each frame
    seen.clear();
    // PF-25: the cap's choice, once a frame, before any play runs; HX-2: a hostage takes no slot (research 238 s7: unread)
    this.heard = footfallsHeard(this.escortees.size ? bodies.filter((b) => !this.escortees.has(b.id)) : bodies, this.listener);
    for (const b of bodies) {
      seen.add(b.id);
      const r = this.remotes.get(b.id) ?? this.add(b.id);
      if (!r) continue;
      const pending = this.pendingVictories.get(b.id);
      if (pending) { r.play.startVictory(pending.serial, pending.clip, pending.elapsed); this.pendingVictories.delete(b.id); }
      const wasDead = r.snap?.alive === false;
      const firstSight = r.snap === null;                              // NU-11b H1: this body's first frame on this page
      r.snap = snapshotOf(b);
      r.snap.action = remoteBodyAction(r.snap.action);            // NU-6 R1: every action drawn, the launcher's clips too (was PAR-84's drop)
      const hostage = typeof r.escortee === 'number';   // HX-2: a hostage's body (`setEscortee`)
      if (hostage) r.snap = escorteeSnapshot(r.snap, this.escorteeTransition(r, r.snap.stance, dt));
      if (r.snap.alive) this.ghosts.delete(b.id);                       // PF-28: a ghost drawn again once alive
      // NU-11b H1 (research 314 §4.3; GHOST_BODY_READING): a body first seen dead whose death this page never heard -- a seat
      // made the ghost of the round in play while this page was in it -- is drawn as nothing, as the welcome's ghosts are:
      // the ghost's actor is unseen on every console (`FUN_00543d50` D:L410440-410441, D:L410444-410445, D:L410457-410459).
      else if (firstSight && !hostage && !this.deathsHeard.has(b.id)) this.ghosts.add(b.id);
      // The `kill` event (reliable, no tick) arrives about INTERP_DELAY_MS (`./net/client`) before the body is drawn
      // dead, as the flinch's does (FLINCH_LAYER_PLACEHOLDER): an older alive snapshot keeps the clip `died()` set; only
      // a dead-to-alive change, a respawn, clears it (ported from Chris's browser-beta-v5, d578f347).
      if (r.snap.alive) { r.deadFor = 0; r.fadeAge = 0; if (wasDead) r.deathClip = null; } else { r.deadFor += dt; r.fadeAge += real; }
      // NU-12 B2 (research 328 R328.1, §4.3 D5; the build brief's F3, F4): the original rebuilds every copy at the round's
      // reload and at its owner's respawn (`REMOTE_RESPAWN_REBUILD_READING`), its first play `Stand` with no blend. The
      // copy is rebuilt on the first body drawn past its seat's `spawn` (a survivor at a round's start, a living seat
      // re-placed by the room's `abandon` or `rebuildWaiting`, a respawn), and on a dead-to-alive change where no spawn is
      // counted: its play's animation dropped (`Play.respawn`; optional for the tests' stand-ins, as `setRifleStowed`)
      // and its binoculars stopped -- a survivor's otherwise lowers its old stance's raise backwards over the new body --
      // and its flinch and its hands' layer dropped (the review's F2: the new stack, `FUN_0028edd0` D:L419420, and the
      // pops, D:L447984, take both). Was: the copy's play kept across the spawn, the last pose eased into `seal_stand`
      // over 0.5 s.
      const spawned = (b.spawns !== undefined && r.spawns !== undefined && b.spawns !== r.spawns)
        || (wasDead && r.snap.alive && REMOTE_RESPAWN_REBUILD_READING === 'rebuilt');
      r.spawns = b.spawns;
      if (spawned) { r.play.respawn?.(); r.binocs.stop(); r.flinch = null; r.hands.stop(); }
      // NU-11b H1 (the gameplay seat's condition 1): the seat's spawn ends the death this page heard.
      if (spawned) this.deathsHeard.delete(b.id);
      // LATER 512b (research 215 section 8.6, "The flinch at the take"): a body on its turret's pose has been taken,
      // and the take pops every play -- `FUN_0058c350`'s `FUN_0058a5e0(actor, 0, 1)` (D:L447984, its loop
      // D:L446796-446798) -- so its flinch, a door's push and the flinch under the push go there; drawn under the pose,
      // they could be drawn again after a short mount. Was: kept.
      const mount = r.snap.alive ? this.mountPose?.(b.id) ?? null : null;   // MAP-10b: the turret anim set's clip
      if (mount) { r.flinch = null; r.under = null; r.coverLand = null; }
      // The flinch (`flinch`) over the body's own play, while it runs (`stepFlinch`); a dead body's is dropped.
      stepFlinch(r, r.snap, dt, this.clips);
      // PRONE-TILT: the root's tilt from this page's own floor under the body, on the walker's tick (`remoteTilt`): a living
      // SEAL's, off a turret; a hostage's while a knock owns its body (PRONE-TILT-2 (5), `escorteeTilts`; its own clips
      // have no window); a corpse's stays level (the page's death poses, CORPSE_TILT_READING), as the room's capsules do.
      if (r.snap.alive && !mount && (!hostage || escorteeTilts(r.snap))) r.snap.rootTilt = this.remoteTilt(r, r.snap, dt, hostage);
      else if (hostage) { r.tilt = undefined; r.snap.rootTilt = null; }
      // PF-28 (GHOST_BODY_READING): a ghost -- dead with no death, seated and never spawned -- is drawn as nothing.
      // HX-2: a hostage's opacity (the rescued fade, `setOpacity`); at 0 it is inactive: not drawn, not aimed at
      const fade = hostage ? this.opacities.get(b.id) : undefined;
      if (fade?.fading) fade.opacity = fadeStep(fade.opacity, real);   // PAR-34: the rescued fade in real time
      const opacity = fade?.opacity ?? 1;
      if (hostage && opacity !== r.opacityShown) { r.view.setOpacity(opacity); r.opacityShown = opacity; }
      // NU-4 (research 317 R317.1, R317.3, R317.4): a corpse until its seat is alive (`corpseShownS`, on PAR-34's real
      // seconds); B4, a hostage's at any age (`FUN_005714b0` writes no alpha: `DEAD_IN_FADE_READING`). Was: `BODY_FADE_S`.
      const corpse = hostage || r.fadeAge < corpseShownS(this.rules, 'other');
      const shown = !this.ghosts.has(b.id) && (r.snap.alive || corpse) && opacity > 0;
      r.view.group.visible = shown;
      if (!shown) continue;
      if (!r.snap.alive) r.play.stopVictory();
      if (!r.snap.alive && r.deathClip) r.snap.traversal = deathPose(r.deathClip, r.deadFor, this.clips);
      if (mount) r.snap.traversal = mount;                              // MAP-10b: drawn over the body's play
      if (hostage) {
        // HX-2: no kit, no hands, no binoculars (HOSTAGE_HANDS_PLACEHOLDER): its own play only
        r.play.frame(dt, r.walk ??= remoteWalk(r), camera, real);   // PAR-34 (F2): the rifle's lowering in real time
        r.view.group.visible = true;
        continue;
      }
      // Protocol 7: the item in the hand by id; one the kit does not hold in that slot is hung at once -- a firearm's
      // only: NU-6 P3 (research 324 §6 P3), a raised rocket launcher (the item a launcher's, the slot left 0 or 1) is
      // drawn in the hand on its own node below and never written into the kit (was: hung into slot 0 / 1, drawn in the
      // firearm's grip, the stored kit changed until the lower).
      const held = r.snap.item, known = r.kit ?? this.typeKit?.(r.team, r.type) ?? null;
      const launcherHand = remoteLauncherInHand(held, r.snap.action, r.launcher?.place === 'hand' ? r.launcher.id : null);
      if (held !== NO_ITEM && launcherHand !== held && known?.[r.snap.weapon] !== held) {
        const next = [...(known ?? [NO_ITEM, NO_ITEM, NO_ITEM, NO_ITEM, NO_ITEM])];
        next[r.snap.weapon] = held;
        this.kits.set(r.id, next);
        this.hang(r, next);
      }
      const kit = remoteKitOf(r.snap);                     // WEAPON: the replicated primary or sidearm in the hand
      if (kit.item !== r.item) { r.item = kit.item; r.play.setItem(kit.item); }
      r.play.setMounts(kit.mounts);
      // NU-6 P2, P3: the rocket launcher in the hand while raised and through the still lower, the firearm stowed
      // meanwhile (REMOTE_LAUNCHER_HAND_READING); else the kit's first launcher on its carry (REMOTE_LAUNCHER_MOUNT_READING).
      this.placeLauncher(r, launcherHand);
      r.play.setRifleStowed?.(launcherHand !== null);
      // The binoculars up (protocol: `BodyFlag.Binoculars`, additive): the stance's `*2binocular` clip, held; down, reversed.
      r.binocs.update(dt, r.snap.alive && r.snap.binoculars, r.snap.stance, kit.item);
      // A throw, a placing (research 85 s8.1); a dead body's is stopped at once, not run out over its death clip.
      if (r.snap.alive) r.hands.follow(r.snap.hold ?? null, kit.item === 'pistol', r.snap.holdSerial);
      else { r.hands.follow(null, false); r.hands.stop(); }
      // NU-7 G1 (REMOTE_THROW_GRUNT_READING): the clip's callbacks (`throw_whoosh`) at the body's drawn feet, for the match's
      // audio (`takeThrowCallbacks`); none for the hold the body was first drawn with (a joiner's catch-up).
      const hold = r.snap.alive && r.snap.hold ? `${r.snap.hold}:${r.snap.holdSerial ?? 0}` : null, first = this.caughtUp.get(r);
      this.caughtUp.set(r, first === undefined || first === hold ? hold : null);
      for (const name of r.hands.step(dt)) if (this.caughtUp.get(r) === null) this.throwCalls.push({ name, at: [r.snap.feet[0], r.snap.feet[1], r.snap.feet[2]] });
      r.play.frame(dt, r.walk ??= remoteWalk(r), camera, real);   // PAR-34 (F2): the rifle's lowering in real time
      // NU-4 B1 (research 317 s5, the review's F4): at a remote's death `FUN_00547af0` hides its item nodes
      // (D:L413122-413134, under `IsRemote`, D:L413120): the actor's +0x390 the rifle and +0x398 the pistol -- the nodes
      // `FUN_00553290` (slots 1-3, D:L419036-419056) keeps at +0x388 + 8 x slot (D:L419059), made for slots 1 and 2
      // (D:L419663-419664) -- and +0x3a8 the launcher, written by the set-up itself under `spinehi` +0x310 (D:L419676;
      // research 94's launcher). Not +0x3a0, the grenade. So a corpse draws no weapon, in its hands or on its mounts,
      // until its actor is rebuilt alive (its play hangs them again) -- its rocket launcher included (NU-6 P2, research
      // 324 §6 P2; was: "the page draws no launcher on a remote body").
      // (Was, until the NU-4 review's F2: "slot 1 the rifle, 2 the pistol" with +0x3a8 read as a slot of the same maker.)
      if (!r.snap.alive) for (const o of [r.weapon, r.sidearm]) if (o) o.visible = false;
      const launcher = r.launcher?.object;
      if (launcher) launcher.visible = r.snap.alive;
      r.view.group.visible = true;
    }
    for (const id of [...this.remotes.keys()]) if (!seen.has(id)) this.remove(id);
  }

  /**
   * NU-7 G1 (`REMOTE_THROW_GRUNT_READING`): the throw clips' callbacks the last `frame` crossed on the others' bodies, each
   * at its body's drawn feet, taken once -- the match's sound (`./matchSound` `frame`) plays them, as the page plays its
   * own pose's (`./matchThrow` `poseFrame`).
   */
  takeThrowCallbacks(): { name: string; at: [number, number, number] }[] {
    const calls = this.throwCalls;
    this.throwCalls = [];
    return calls;
  }
  private throwCalls: { name: string; at: [number, number, number] }[] = [];
  /** CPS bodies (a browser adaptation): the ids `frame` drew this frame, the one set emptied at each frame's start. */
  private readonly seenThisFrame = new Set<number>();
  /** NU-7 G1: each body's hold (clip and parity) as first drawn, until it changes -- a joiner's catch-up, unheard -- else null. */
  private readonly caughtUp = new WeakMap<Remote, string | null>();

  /** Where each body's muzzle is (the shots' tracers and flashes start there), or null. */
  muzzle(id: number): [number, number, number] | null {
    return this.remotes.get(id)?.play.muzzle() ?? null;
  }

  /**
   * Another player flinched (`flinch`, the room's clip: `./net/deaths` `flinchClip`; the owner, 2026-10-02): its body plays
   * the clip from now, over its own play, until it has run. A dead body or one not drawn yet plays none.
   */
  flinch(id: number, clip: string): void {
    const r = this.remotes.get(id);
    if (r && r.snap?.alive !== false) { r.flinch = { clip, t: 0 }; r.under = null; }   // LATER 512: `FUN_0058a4d0` pops to the base first
  }

  /**
   * A one-shot a map program pushed on another player's body (`motion`, the room's clip: a door's `Open door`, research
   * 92 section 2): played as a flinch's clip is, whole-body over its own play (FLINCH_LAYER_PLACEHOLDER's layering) until
   * it has run, without `FUN_005a2690`'s gate (`stepFlinch`, `pushed`). A dead body or one not drawn yet plays none.
   */
  pushMotion(id: number, clip: string): void {
    const r = this.remotes.get(id);
    // LATER 512: a flinch under it kept; the landing clip playing at the push recorded (no new landing: the re-look).
    // `coverLand` is read off the latest snapshot received: a push event that arrives before the snapshot showing a landing
    // begun just before the push counts that landing as new (the fix's re-look, (2); FLINCH_LAYER_PLACEHOLDER's clock caveat).
    const a = r?.snap?.action;
    if (r && r.snap?.alive !== false) pushOver(r, clip, a && LANDING_CLIP_ACTIONS.has(a.name) ? a.serial : null);
  }

  /** A kill: the victim's death clip (the server's choice), played from now. */
  died(id: number, clip: string | null): void {
    this.ghosts.delete(id);
    this.deathsHeard.add(id);                                    // NU-11b H1: a death heard, so never a ghost at first sight
    const r = this.remotes.get(id);
    if (r) { r.deathClip = clip; r.deadFor = 0; r.fadeAge = 0; r.flinch = null; r.under = null; } else if (clip) this.pendingDeaths.set(id, clip);
  }
  private readonly pendingDeaths = new Map<number, string>();
  /** PF-28: a joiner's corpse's age (seconds), for a body not drawn yet (its first snapshot follows the welcome). */
  private readonly pendingAges = new Map<number, number>();
  /** PF-28: the seats drawn as nothing until alive (`markGhost`). */
  private readonly ghosts = new Set<number>();
  /**
   * NU-11b H1: the seats whose death this page heard (`died`, `hydrateCorpse`) since their spawn: a body first seen dead
   * without one is a ghost. Kept across a rebuild of the copy (`remove`); dropped at the seat's spawn (`frame`), its
   * leaving (`forget`) and another room (`clear`).
   */
  private readonly deathsHeard = new Set<number>();

  /**
   * PF-28 (ruling PF.R47; research 231 s4; `CORPSE_HYDRATE_READING`): a late joiner's corpse from the welcome's envelope
   * -- its death clip (the room's choice; null for none) at `ageS` seconds since the death, so its pose is the clip's at
   * that age and the corpse rule (`corpseShownS`) counts from the death, not from the joiner's first sight (NU-4: it lies
   * until its seat is alive; was: "it fades at `BODY_FADE_S` from the death"). No kill line or sound: the page's `kill`
   * path is not run.
   */
  hydrateCorpse(id: number, clip: string | null, ageS: number): void {
    this.ghosts.delete(id);
    this.deathsHeard.add(id);                                    // NU-11b H1 (condition 2): the welcome's corpse is a heard death
    const r = this.remotes.get(id);
    if (r) { r.deathClip = clip; r.deadFor = ageS; r.fadeAge = ageS; r.flinch = null; return; }
    if (clip) this.pendingDeaths.set(id, clip); else this.pendingDeaths.delete(id);
    this.pendingAges.set(id, ageS);
  }

  /**
   * PF-28 (`GHOST_BODY_READING`): a seat dead with no death -- a ghost seated in a classic round in play, never spawned
   * in it (research 91 s12) -- drawn as nothing until a snapshot has it alive (a footfall slot it never takes: dead).
   */
  markGhost(id: number): void {
    this.ghosts.add(id);
  }

  /**
   * A body's weapon node itself and its `firepoint` (the muzzle animation's frame, research 89 section 4), or null: the node,
   * not a copy of its matrix, so another player's flash rides his gun as he runs (research 149; the effects read the node's
   * world matrix on every tick that places something at the caller).
   */
  weaponFrame(id: number): { node: Object3D; muzzle: [number, number, number] | null } | null {
    const r = this.remotes.get(id);
    const pistol = r?.item === 'pistol';
    const object = pistol ? r?.sidearm : r?.weapon;
    if (!r || !object || !r.view.group.visible) return null;
    const p = r.points[pistol ? 'pistol' : 'rifle'].find((q) => q.name === 'firepoint' || q.name === 'firepont');
    return { node: object, muzzle: p ? [p.at[0], p.at[1], p.at[2]] : null };
  }

  /** LATER 489: the ids of the bodies drawn here (a seat's, a hostage's), for the region gate's frame. */
  ids(): number[] {
    return [...this.remotes.keys()];
  }

  /**
   * LATER 489 (research 329 §1.2; `./regionCull`): the scene walk `FUN_003389c0` (D:L236069-236074, D:L236164) draws a
   * node only when `+0x5c` bit 0 holds and, when `+0x5f` bit 7 (the zone test's enable; set for a new node by `FUN_00317060`
   * D:L215962-215966) is set, `FUN_00290b80(camera, 1 << its zone index)` passes -- a clear bit draws the node untested.
   * `drawn` (`RegionCull.drawn`) false takes the body's objects off the render's layer 0, every child with it (the walk's
   * gate is the whole node's); null puts every body back. The group stays active -- the aim, the hostage order's pick, the
   * muzzle and the head read `group.visible` as before: no draw stamp is read on those paths, and a shot's grid query skips
   * no body by region (every queued query's mask is all ones, `FUN_0031dd90` D:L219893-219895: LATER 493). A remote body
   * has no character shadow to keep (the page's own body alone casts one, `./charShadow`). Called each frame after the
   * gate's frame and before the render (LATER 489's review, F1).
   * CPS bodies (a browser adaptation, the same layers): a body is walked only when its verdict or its tree (`TreeWatch`)
   * changed since its last walk -- the walk sets every object's layer 0 to the verdict and nothing else writes layer 0,
   * so a body whose verdict and tree are unchanged already holds what the walk would write. The verdict is still asked of
   * every body, every call.
   */
  applyZoneGate(drawn: ((id: number) => boolean) | null): void {
    for (const [id, r] of this.remotes) {
      const on = drawn ? drawn(id) : true;
      const tree = (r.watch ??= new TreeWatch(r.view.group)).version();
      if (r.gateOn === on && r.gateTree === tree) continue;
      r.view.group.traverse((o) => { if (on) o.layers.enable(0); else o.layers.disable(0); });
      r.gateOn = on;
      r.gateTree = tree;
    }
  }

  feet(id: number): [number, number, number] | null {
    const s = this.remotes.get(id)?.snap;
    return s ? [s.feet[0], s.feet[1], s.feet[2]] : null;
  }

  /**
   * NU-9 (c) T2 (research 329 §1.3, §5 T2): a drawn body's `head` bone in world space -- the over-head tag's anchor, the
   * actor's skeleton node named `head` (0x65c500, `FUN_00553ea0` D:L419621) put in world space by the actor's matrix
   * (`FUN_005a3070` D:L460118-460121); the bones carry their parts' names (`./bodyView` `buildBody`). Null for no body or
   * one not drawn (`group.visible` false: a ghost, a corpse past its rule, a rescued hostage at 0).
   * CPS bodies (a browser adaptation, the same point): the node the search finds is kept per body and searched for again
   * only when the body's tree (`TreeWatch`) changed -- the same first node named `head` in the tree's pre-order.
   */
  headAt(id: number): [number, number, number] | null {
    const r = this.remotes.get(id);
    if (!r || !r.view.group.visible) return null;
    const tree = (r.watch ??= new TreeWatch(r.view.group)).version();
    if (r.headTree !== tree) {
      r.headNode = r.view.group.getObjectByName('head') ?? null;
      r.headTree = tree;
    }
    const head = r.headNode;
    if (!head) return null;
    const p = head.getWorldPosition(_headAt);
    return [p.x, p.y, p.z];
  }

  /**
   * NU-9 (c) T1's fade clock (research 329 §1.5): the real seconds since the body was drawn dead (PAR-34's `fadeAge`; a
   * joiner's corpse from its age, `hydrateCorpse`), as `FUN_00548050` (D:L413162-413174) gives the game clock less the
   * death's stamp; null while it is drawn alive, or with no body.
   */
  deathAge(id: number): number | null {
    const r = this.remotes.get(id);
    return r?.snap && !r.snap.alive ? r.fadeAge : null;
  }

  count(): number {
    return this.remotes.size;
  }

  /** MENU-SIDE: the side whose body a player is drawn with (its team when the body was built), or null before it is. */
  bodySide(id: number): Team | null {
    return this.remotes.get(id)?.team ?? null;
  }

  /**
   * HX-2: the escortee's stand-to-crouch transition this frame (HOSTAGE_CROUCH_CLIP_READING): started when its stance
   * turns from stand to crouch, run `dt` on, ended once its one-shot has played (`oneShotSeconds` of the clip's playback
   * and keys) or the stance leaves crouch; a body first seen crouched starts crouched.
   */
  private escorteeTransition(r: Remote, stance: PlaySnapshot['stance'], dt: number): Remote['transition'] {
    const was = r.stanceWas;
    r.stanceWas = stance;
    if (stance !== 'crouch') r.transition = null;
    else if (was === 'stand') {
      const name = CIV_ANIM_SET.standToCrouch;
      const clip = this.clips?.clips.find((c) => c.name === name);
      const playback = this.clips?.table?.find(([n]) => n === name)?.[1]?.playback ?? null;
      const seconds = clip && playback !== null ? oneShotSeconds(playback, clip.frameCount) : 0;
      r.transition = seconds > 0 ? { serial: ((r.transition?.serial ?? 0) + 1) & 0xff, t: 0, seconds } : null;
    } else if (r.transition) {
      r.transition.t += dt;
      if (r.transition.t >= r.transition.seconds) r.transition = null;
    }
    return r.transition ? { ...r.transition } : null;
  }

  private add(id: number): Remote | null {
    const map = this.map, lighting = this.lighting;
    if (!map || !lighting) return null;
    const which = this.escortees.get(id);
    if (which !== undefined) return this.addEscortee(id, which, map, lighting);
    const team = this.teams.get(id) ?? 'seal', type = this.types.get(id) ?? 0;
    const key = this.characterKeys.get(id), available = map.characters?.bodies;
    const character = key && available && Object.hasOwn(available, key) ? available[key] : undefined;
    const loaded: LoadedBody | undefined = character ?? bodyForTeam(map, team, type) ?? undefined;
    if (!loaded) return null;
    const view = buildBody(loaded, map, lighting);
    for (const name of this.gearShown.get(id) ?? []) view.setGearVisible(name, true);   // XR-06: the satchel, if carried
    this.scene.add(view.group);
    const play = new Play();
    play.setBody(view, loaded);
    play.setFlyToggle(true);
    play.setClips(this.clips);
    const r: Remote = {
      id, team, type, view, play, weapon: null, sidearm: null, item: 'rifle', snap: null, deadFor: this.pendingAges.get(id) ?? 0, fadeAge: this.pendingAges.get(id) ?? 0, deathClip: this.pendingDeaths.get(id) ?? null, flinch: null,
      appearance: { key: key ?? null, definition: loaded.character, model: loaded.model },
      points: { rifle: [], pistol: [] }, kit: null, binocs: new BinocularPose(() => play.motionSource()),
      hands: new ThrowPose(() => play.motionSource()),
      escortee: null, stanceWas: null, transition: null, opacityShown: 1, launcher: null,
    };
    play.addPoseLayer(r.binocs.layer);
    play.addPoseLayer(r.hands.layer);
    // WEAPON (web sprint 4, M3/M9): the player's two firearms -- its own kit when named, else its side's type's -- each its
    // own model at its own grip, as the local kit hangs them.
    this.hang(r, this.kits.get(id) ?? null);
    this.pendingDeaths.delete(id);
    this.pendingAges.delete(id);
    play.setWeaponInput(() => ({ trigger: r.snap?.trigger ?? false, aiming: r.snap?.aiming ?? false }));
    const steps = this.steps;
    if (steps) {
      play.onEvent((e) => {
        if (this.heard && !this.heard.has(id)) return;                // PF-25: not one of the three this frame
        const step = r.snap?.alive ? remoteFootfall(e, r.snap) : null;
        if (step) steps(id, step, r.snap!.feet, r.snap!.yaw);
      });
    }
    this.remotes.set(id, r);
    return r;
  }

  /**
   * HX-2: a hostage's body (`setEscortee`): the escortee's mesh (`escorteeBody`), its play in the No_weapon set
   * (`CIV_ANIM_SET`), no weapon, sidearm or binocular layer, no footfalls (the set's clips carry no step callbacks); its
   * pending death clip and age taken as a player's are.
   */
  private addEscortee(id: number, which: number | string, map: LoadedMap, lighting: Lighting): Remote | null {
    const loaded = escorteeBody(map, which);
    if (!loaded) return null;
    const index = typeof which === 'number' ? which : (map.types?.escortees ?? []).indexOf(loaded);
    const view = buildBody(loaded, map, lighting);
    this.scene.add(view.group);
    const play = new Play();
    play.setBody(view, loaded);
    play.setFlyToggle(true);
    play.setAnimSet(CIV_ANIM_SET);
    play.setClips(this.clips);
    const r: Remote = {
      id, team: this.teams.get(id) ?? 'seal', type: 0, view, play, weapon: null, sidearm: null, item: 'rifle', snap: null,
      deadFor: this.pendingAges.get(id) ?? 0, fadeAge: this.pendingAges.get(id) ?? 0, deathClip: this.pendingDeaths.get(id) ?? null, flinch: null,
      appearance: { key: null, definition: loaded.character, model: loaded.model },
      points: { rifle: [], pistol: [] }, kit: null, binocs: new BinocularPose(() => null), hands: new ThrowPose(() => null),
      escortee: index, stanceWas: null, transition: null, opacityShown: 1, launcher: null,
    };
    this.pendingDeaths.delete(id);
    this.pendingAges.delete(id);
    this.remotes.set(id, r);
    return r;
  }

  /** A body's two firearms hung from a kit (null: its side's type's): the old models off, clones of the kit's on. */
  private hang(r: Remote, kit: number[] | null): void {
    const refs = this.kitOf?.(r.team, kit, r.type) ?? { rifle: null, pistol: null };
    r.play.setWeapon(null, []);
    r.play.setSidearm(null, []);
    r.weapon = refs.rifle ? cloneHeld(refs.rifle.object, refs.loadout ?? null, refs.ids?.[0] ?? null) : null;
    if (r.weapon && refs.rifle) r.play.setWeapon(r.weapon, refs.rifle.points);
    r.sidearm = refs.pistol ? cloneHeld(refs.pistol.object, refs.loadout ?? null, refs.ids?.[1] ?? null) : null;
    if (r.sidearm && refs.pistol) r.play.setSidearm(r.sidearm, refs.pistol.points);
    r.points = { rifle: refs.rifle?.points ?? [], pistol: refs.pistol?.points ?? [] };
    r.kit = kit;
    // NU-6 P2: the kit's rocket launcher on its node, hung again from the new kit (`taken.kit`, a `spawn`, the welcome).
    this.dropLauncher(r);
    this.placeLauncher(r, null);
  }

  /**
   * NU-6 P2 (research 324 §1.6, R324.7, §6 P2): the body's rocket launcher -- `hand`, the id raised in the hand, else
   * the kit's first launcher (`firstLauncher`; the kit the firearms were hung from, else the side's type's) carried on
   * the body's `launcher` node under `spinehi` at the `launcher` gear's offset (`REMOTE_LAUNCHER_MOUNT_READING`,
   * `./heldItem` `launcherCarryMatrix`) -- re-placed only when the id or the node changes. Its model is the kit
   * callback's own `launcher` (`SideKit`; the map builds every rocket launcher's model, `./loadMap` `heldWeapons`), asked
   * for the body's kit, or for one with the launcher in an equipment slot when the kit holds another (a raise the kit does
   * not hold). A copy, its scope nodes as the kit's (`./sights` `cloneHeld`). Was (until F2 of the review): the callback
   * asked for the kit with the launcher in the firearm's slot, its rifle's model taken -- a map without the tables drew
   * the baked rifle on `spinehi`.
   */
  private placeLauncher(r: Remote, hand: number | null): void {
    const id = hand ?? firstLauncher(r.kit ?? this.typeKit?.(r.team, r.type) ?? null);
    const place = hand !== null ? 'hand' : 'carry';
    const was = r.launcher;
    if (was && was.id === id && was.place === place) return;
    if (was && was.id !== id) this.dropLauncher(r);
    if (id === null) return;
    const node = place === 'hand' ? r.play.heldNode?.() ?? null : r.play.launcherNode?.() ?? null;
    let object = r.launcher?.object ?? null;
    if (!r.launcher) {
      const base = r.kit ?? this.typeKit?.(r.team, r.type) ?? [NO_ITEM, NO_ITEM, NO_ITEM, NO_ITEM, NO_ITEM];
      const kit = firstLauncher(base) === id ? base : [base[0] ?? NO_ITEM, base[1] ?? NO_ITEM, id, NO_ITEM, NO_ITEM];
      const ref = this.kitOf?.(r.team, kit, r.type)?.launcher ?? null;
      object = ref ? cloneHeld(ref.object, null, id) : null;
    }
    r.launcher = { id, object, place };
    if (!object) return;
    if (!node) { object.removeFromParent(); return; }
    node.add(object);
    (place === 'carry' ? new Matrix4().fromArray(launcherCarryMatrix()) : new Matrix4())
      .decompose(object.position, object.quaternion, object.scale);
  }

  /** NU-6 P2: the body's launcher taken off its node. */
  private dropLauncher(r: Remote): void {
    r.launcher?.object?.removeFromParent();
    r.launcher = null;
  }

  private remove(id: number): void {
    const r = this.remotes.get(id);
    if (!r) return;
    this.dropLauncher(r);
    this.scene.remove(r.view.group);
    r.play.setWeapon(null, []);
    r.play.setSidearm(null, []);
    r.view.dispose();
    this.remotes.delete(id);
    this.ghosts.delete(id);
  }

  clear(): void {
    this.pendingVictories.clear();
    this.characterKeys.clear();
    for (const id of [...this.remotes.keys()]) this.remove(id);
    // PF-28 (the integration review of sprint 29): and what a join envelope or a kill left for ids never drawn -- the
    // joiner's own id is always among the ghosts -- so another room's id is not hidden, aged or posed by this one's.
    this.ghosts.clear();
    this.deathsHeard.clear();                                    // NU-11b H1: another room's deaths are not this one's
    this.pendingAges.clear();
    this.pendingDeaths.clear();
  }
}

function sameKit(a: readonly number[] | null, b: readonly number[]): boolean {
  return a !== null && a.length === b.length && a.every((v, i) => v === b[i]);
}

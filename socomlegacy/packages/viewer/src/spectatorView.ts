import { pressedSince, releasedSince, type Input, type PadFlag } from './gamepad';
import type { ScenicView } from './mapMeta';
import { BodyFlag, type Role, type Rules, type Team } from './net/protocol';
import { nextFollow } from './net/rules';

/**
 * PF-31 (ruling PF.R51; research 179 §9.6, 91 §12, 232 §5): the spectator's camera and the benched dead player's
 * teammate cycle, as the game has them -- one module, headless (no three.js), that `./netPage` holds and feeds the
 * keys, the pad and the frame.
 *
 * - **The spectator camera** (`FUN_00295260` D:L139463-139590; its state block is the camera's +0xf4, `FUN_0029b0c0`
 *   D:L142660): byte 0 the mode -- 0 the free-motion camera (`FUN_002964f0` translates the camera only in 0, D:L140442),
 *   1 follows a player (`FUN_00297410` orbits the actor only in 1, D:L140957-140960), 2 the map's scenic views
 *   (`./mapMeta` `ScenicView`, `mission.rdr`'s `Scenic_Views`; the zoom runs only in 2, D:L140512) -- and byte 1 the
 *   remembered mode (PT-19b, research 244 §3; research 91's row and 232 §5 had 0 follow, 1 free, superseded). Every pad
 *   test is `== 3`, the byte's just-released state (SPECTATOR_RELEASE_READING): Triangle (byte +7) jumps to the
 *   visible player (`FUN_00294f40`, `jumpToVisible`) and follows it; X (+10) goes scenic -> free -> scenic and follow ->
 *   free -> follow, free the hub (`spectatorToggle`); Up (+5) / Down (+6) step the scenic view +1 / -1 and enter scenic
 *   mode (`FUN_002ab260` D:L151453-151489). X, Up and Down are one `else if` chain (D:L139480, D:L139531, D:L139559):
 *   one of them a frame. The slots are the raw pad's, not the controller config's (research 179 §9.6).
 * - **The cycle** (the latch D:L451683-451694; the actor D:L412733-412750): Right (+3) / Left (+4) released set the
 *   next / previous request, read by `FUN_00547170` / `FUN_00546fa0` -- argument 0 for a spectator (every living
 *   non-spectator), 1 for a dead player (the living teammates, escortees and hostages excluded, D:L412604-412609, and
 *   its own body alive or dead, D:L412605, D:L412658: DEAD-CYCLE, LATER 78), each walk from the camera's bound actor's
 *   slot (D:L412584, D:L412637: LATER 79; `./net/rules` `nextFollow`). The
 *   latch runs only with respawn off, for a ghost, or for a spectator (D:L451681-451682, DEAD_CYCLE_RESPAWN_READING).
 * - **The keys** (a development build's, OT.R29: the page's listener is gated, this module adds none): on `keyup`, the
 *   arrows as the d-pad, X (and V, the page's old free-camera key) as X, C (the walk's stance key, Triangle) as
 *   Triangle, and **Space** the next target, kept beside ArrowRight as the PC convenience (the owner's word, PF.R51).
 */

/** The spectator camera's mode (`FUN_00295260`'s byte 0, the camera's +0xf4: 0 free, 1 follow, 2 scenic; PT-19b). */
export type SpectatorMode = 'follow' | 'free' | 'scenic';

/** A body as the room sends it (`./net/protocol` `BodyState`): what the camera and the cycle read. */
export interface SpectatorBody {
  id: number; feet: readonly number[]; yaw: number; flags: number;
  /** The replicated actor look/stance. Optional only for old non-rendering hosts. */
  pitch?: number; stance?: number; peek?: number; travRootY?: number;
}

/** A camera pose for `NetPageDeps.spectate` (`./camera` `Pose`): world units, degrees. */
export interface SpectatorPose { x: number; y: number; z: number; yaw: number; pitch: number }

/** The page's seat, read when a control acts or a frame runs. */
export interface SpectatorSeat {
  role: Role;
  /** The seat's own id (a player's), or null. */
  self: number | null;
  team: Team | null;
  /** Every seat's side, by id. */
  teams: ReadonlyMap<number, Team>;
  rules: Rules;
  /** A late joiner's ghost (research 91 §12). */
  ghost: boolean;
}

/** What `SpectatorView` asks of its page. */
export interface SpectatorHost {
  bodies(): readonly SpectatorBody[];
  seat(): SpectatorSeat;
  /** Stand the fly camera at a pose, or leave it free (null). */
  spectate(pose: SpectatorPose | null): void;
  /** WALL-CAM: the live actor's camera, including its obstruction pass (research 382 §2). */
  follow?(body: SpectatorBody, dt: number): void;
  /** A new binding starts a fresh pass; leaving follow discards the old obstruction hold. */
  resetFollow?(): void;
  /** The dead player's first cycle: the camera leaves the own body (the walk to the fly camera). */
  leaveSelf(): void;
  /**
   * DEAD-CYCLE (LATER 78): the dead player's cycle comes back to its own body -- the own body's view again
   * (DEAD_CYCLE_OWN_VIEW_READING). Absent: the view's state goes back to the own body (`watching` null) and no pose is
   * handed, the page's camera where the last pose stood it.
   */
  returnSelf?(): void;
  /** The map's scenic views (`scenicViews(map)`), read when a control or a frame needs them: a map loaded later is seen. */
  views?(): readonly ScenicView[];
  /** An escortee or hostage (`+200 & 0x20000`): never a dead player's to follow (HX-1: the room's hostages, by id). */
  escortee?(id: number): boolean;
  /**
   * SPECTATOR-VIEW W6: the projection's magnification (SCENIC_ZOOM: tan(half FOV) / m), told when it changes -- the
   * scenic zoom, its resets to 1. Absent: the page's projection is never scaled.
   */
  magnify?(magnification: number): void;
  /** The review's B1: INVERT PITCH's sign, `DAT_003df198` (+1 off, -1 on; SCENIC_LOOK), read each scenic frame. Absent: 1. */
  pitchSign?(): number;
}

/** The view's eye for the Triangle jump: the camera's position, its unit forward, and its far distance. */
export interface SpectatorEye { position: readonly number[]; forward: readonly number[]; far: number }

/** The part of a `KeyboardEvent` the keys read. */
export interface SpectatorKey {
  type: string; code: string; repeat: boolean; preventDefault(): void;
  ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean;
}

/**
 * SPECTATOR_RELEASE_READING: the spectator's and the cycle's controls act on the release -- `FUN_00295260` tests bytes
 * +5/+6/+7/+10 `== 3` (D:L139463-139590) and the latch +3/+4 `== 3` (D:L451683-451694), the pad state just released
 * (research 179 §9.6); the page's keys on `keyup`. Not measured running.
 */
export const SPECTATOR_RELEASE_READING = 'release' as const;

/**
 * SPECTATOR_CYCLE_ORDER_READING: next / previous walk the actor list (`FUN_00546fa0` steps its slot index down,
 * `FUN_0029e470(0x4362e0, i)`, D:L412590-412615); the port's seat-id order stands in for the slot order. `FUN_00547170`
 * walks it up by slot (D:L412639, D:L412663; read 2026-10-17, DEAD-CYCLE, research 314 §5.6), and both start at the
 * bound actor's slot (`FUN_0029f180`, D:L412584, D:L412637) and never test it (`./net/rules` `nextFollow`,
 * `previousFollow`). Owed: whether a seat's id is its slot. The walk binds the camera
 * through its vtable +0xc (D:L412618, D:L412675): `CAppCamera`'s (`PTR_PTR_00406170`, D:L142824; the disc ELF's word at
 * 0x40617c) is `FUN_0029b3c0`, which calls `FUN_002956e0` (D:L142768) -- so the cycle writes the remembered mode as the
 * jump does (`bindRemembered`, D:L139680-139686) and enters follow (PT-19b's fix round, research 244 §3.1).
 */
export const SPECTATOR_CYCLE_ORDER_READING = 'actor list' as const;

/**
 * SPECTATOR_OWN_SLOT_PLACEHOLDER (DEAD-CYCLE, research 314 §5.6, §8): where a spectator's walk starts in free and scenic.
 * The walk starts at the camera's bound actor's slot (D:L412584, D:L412637); X from follow binds the spectator's own
 * object (D:L139501-139504), and so do Up / Down onto a scenic view (D:L139552-139555, D:L139580-139583), the entry
 * (`FUN_00599b60` D:L455701; SPECTATOR_START_READING) and likely the turnover's respawn (SPECTATOR_TURNOVER_POSE_PLACEHOLDER)
 * -- so in free and scenic the walk starts at the own object's slot (its +8, `FUN_0029f180` D:L145045-145048), which the
 * walk never takes (a spectator, refused first, D:L412601-412603, D:L412654-412656). Where that slot sits among the
 * players' is unread. The port's stand-in: before every player -- Right the first living body in id order, Left the last
 * (the same for a slot after every player; only a slot among them would differ). In follow the walk starts at the
 * followed body, dead or gone (AD-8 keeps it bound). Settled by reading the spectator object's list entry
 * (`FUN_002b7d60` D:L158609-158650) or ONL-32's capture of a spectator's Right from free with players on both sides of it.
 */
export const SPECTATOR_OWN_SLOT_PLACEHOLDER = 'before every player' as const;

/**
 * DEAD_CYCLE_OWN_VIEW_READING (DEAD-CYCLE, LATER 78; research 314 §5.6, §8): the own body's view when a dead player's
 * cycle comes back to it. The walk binds the own actor (D:L412618, D:L412675 -> `FUN_0029b3c0` -> `FUN_002956e0`); the
 * death camera's +0x144, set to 7 every frame a remote teammate was bound (`FUN_002980d0` D:L141378-141389), is not
 * written back by a local actor's bind (that line writes 7 only for a controller whose +0x2c is 0; the initialiser
 * `FUN_00299150` alone writes 0, D:L141657, at the respawn and the turnover), so the original's own view after the cycle
 * is state 7's frame -- the orbit about the own body turned by the stick (`FUN_00297a30` D:L141219-141221) -- not state
 * 3's turn toward the killer or 6's own turn (D:L141145-141218). The port's death camera has no state 7 (`./deathCamera`
 * models 3 and 6), so the own body's view comes back as it was before the cycle, through `SpectatorHost.returnSelf`.
 * Settled by porting state 7, or ONL-32's capture of a dead player cycling back to his body.
 */
export const DEAD_CYCLE_OWN_VIEW_READING = 'the death camera as before the cycle' as const;

/**
 * DEAD_CYCLE_RESPAWN_READING: the cycle latch runs when respawn is off (`DAT_00437ce8+0xdc` 0), for a ghost (`+0xd2`)
 * or for a spectator (`FUN_002c2fa0`), D:L451681-451682 (research 179 §9.6): a dead player in a respawn game watches
 * his own body until he respawns.
 */
export const DEAD_CYCLE_RESPAWN_READING = 'respawn off, a ghost or a spectator' as const;

/**
 * JUMP_TO_VISIBLE_READING: `FUN_00294f40` (D:L139348-139446; the band D:L139415-139424) takes, over the
 * non-spectator characters in list order, the one nearest the view's centre segment (`FUN_00308800`
 * D:L207111-207228: the distance to the segment from the eye to the far point), the first taken; a later one replaces
 * the best when its segment distance is more than 10 % under the best's, or within 10 % of it when its range to the
 * eye is under 110 % of the best's and one of the two (distance, range) is under the best's.
 * The 0.1 is the band. Read as: the segment's far end is the camera's far distance along its forward (`+0xf0`, its
 * value unread), the body's point its feet (`+0x1c`). **Every body, dead or alive** (re-filed 2026-10-14, SPECTATOR-VIEW
 * W5; research 248 F3, 314 §5.2): the walk tests a type-2 entry and not a spectator (D:L139398-139408) and nothing else --
 * no alive, team, sight or frustum test; was "only the living (the follow camera follows the living)", a port choice.
 * The list's order is the seat ids' (SPECTATOR_CYCLE_ORDER_READING: the same list, `DAT_004362e4`, the cycle walks).
 */
export const JUMP_TO_VISIBLE_READING = 0.1;

/**
 * HX-1 (web sprint 31; research 237 s4): whether a spectator's cycle and jump take a hostage. The cycle's walk
 * (`FUN_00546fa0` D:L412598-412609) tests, for a spectator (argument 0), only a type-2 entry of the actor list, alive, not
 * a spectator; the escortee test (`+200 & 0x20000`) is in the dead player's arm alone (argument 1). The jump
 * (`FUN_00294f40` D:L139404-139408) tests a type-2 entry, not a spectator, and no escortee bit. So the spectator's
 * targets include the hostages -- a reading with a step: that a hostage's SealObject is a type-2 entry of `0x4362e0`
 * (its killer lookup's list, `FUN_0059ee20` D:L458070-458078) is inferred, not read; capture C2 settles it. 'excluded'
 * would leave the room's hostages (the host's `escortee`) out of both. The dead player's cycle excludes them always.
 * [reading]
 */
export const SPECTATOR_HOSTAGE_READING: 'included' | 'excluded' = 'included';

/**
 * SPECTATOR_START_READING (PT-19b and its fix round, research 244 §3.1): the state before any control -- free,
 * remembered free, no scenic view. [reading]
 * - The camera's initialiser `FUN_00299150` writes +0xf4 = 0, +0xf5 = +0xf4 and +0x110 = -1 (D:L141664-141666), its
 *   constructor `FUN_0029b5d0` the same (D:L142860-142862).
 * - The online set-up `FUN_00599b60` makes the object the local one (D:L455685) and then, past every arm -- the
 *   spectator's, which skips the initialiser (D:L455693-455698), included -- binds the camera to it through its vtable
 *   +0xc (D:L455701). That slot of `CAppCamera`'s vtable (`PTR_PTR_00406170`, D:L142824; the disc ELF's word at 0x40617c)
 *   is `FUN_0029b3c0`, which calls `FUN_002956e0` on the object (D:L142768); the object being the local one, the mode
 *   is 0, free (D:L139699-139700), and byte 1 keeps 0 (D:L139681-139682).
 * - Index -1 is none: `FUN_002ab260`'s first +1 step gives view 0, its first -1 step the last; D:L139535 and D:L139563
 *   enter scenic only at an index >= 0. A remembered free makes X from free do nothing (`spectatorToggle`): the
 *   spectator leaves free by Right, Left, Triangle, Up or Down.
 * Owed: which of the camera's other binds run at a round's turnover (D:L49732 `FUN_001ea720` and D:L151885
 * `FUN_002abd40` bind the local object; D:L151957 `FUN_002ac0e0` passes 0, which `FUN_0029b3c0` ignores, D:L142748;
 * the initialiser's callers D:L75869, D:L149685, D:L150568, D:L150604): the port does not reset the mode at a round.
 */
export const SPECTATOR_START_READING = { mode: 'free', remembered: 'free', scenic: -1 } as const;

/**
 * SPECTATOR_TURNOVER_EVENT_READING (AD-9, research 314 §5.5, §8): the event at which a spectator's camera is reset to
 * SPECTATOR_START_READING with no followed actor and the magnification 1 (`SpectatorView.reset`). The original's is the
 * MP exit state's tick on game state 3 or 5 -- the respawns, then the restart's reset (`FUN_00223680` D:L75920-75938,
 * `FUN_002a7d40` D:L149685) -- and its UnInit's second reset at the pop (`FUN_002232a0` D:L75869); not a death, a bind or
 * the match's end. The port has no MP exit state: the page leaves the round screen at the room's `roundStart`, which
 * stands for that tick. [reading, pending review]
 */
export const SPECTATOR_TURNOVER_EVENT_READING = 'roundStart' as const;

/**
 * SPECTATOR_TURNOVER_POSE_PLACEHOLDER (AD-9, research 314 §5.5 item 3, §8): where a spectator's camera stands after a
 * turnover. The reset leaves the bound object (+0xbc / +0xc0); the turnover's respawns attach the camera to the console's
 * own actor (D:L75925-75933 -> D:L455697-455701 -> `FUN_0029b3c0`) only if a spectator's actor is a type-2, unretired
 * entry (D:L75927-75930, unread), else it keeps orbiting the actor it followed (`FUN_0029b330` D:L142720-142725). The
 * port's stand-in: no pose handed, the page's fly camera where it was.
 */
export const SPECTATOR_TURNOVER_POSE_PLACEHOLDER = 'the fly camera where it stands' as const;

/**
 * SPECTATOR_ENTRY_POSE_PLACEHOLDER (PT-19b's fix round, research 244 §3.1): where the free camera stands when a
 * spectator enters. The original binds it to the local spectator object (SPECTATOR_START_READING) and places it from
 * that object (`FUN_0029b3c0` D:L142748-142781, the offsets of `DAT_0044c408`'s first record), so it stands where the
 * spectator's object stands; where the online set-up puts a spectator's object is unread. The port hands no pose at
 * entry: the fly camera stays where the page has it. Settled by reading the spectator object's placement
 * (`FUN_00599b60`, `FUN_00543d50`) or a capture of a spectator joining.
 */
export const SPECTATOR_ENTRY_POSE_PLACEHOLDER = 'the page camera as it stands' as const;

/**
 * The follow camera: behind the followed body and over it at the game's third-person distances at rest, the spawn
 * pitch `init_aim_pitch` (`./playerCamera`; research 83, research 88's Frostfire row: standing 25.709 over, 24.906
 * behind at -9.167 degrees), looking where it looks.
 */
export const FOLLOW_BEHIND = 24.906;
export const FOLLOW_OVER = 25.709;
export const FOLLOW_PITCH = -9.167;

/*
 * AD-8 (web sprint 40, the reconciliation's C83; research 314 §5.4): the followed body's death, departure and deletion.
 * - **Death: the body kept.** The frame `FUN_002998f0` runs the follow (+0x139 2) through `FUN_00296f10` and its orbit
 *   `FUN_00297410` (D:L141991-141999, D:L140696-140697); neither clears the camera's actor +0xbc or picks another. The
 *   death camera starts only for a bound actor whose controller is local (D:L140893-140910) -- never a spectator's
 *   followed player, another console's -- and its killer / saved-actor rebinds (`FUN_002980d0` D:L141484, D:L141529,
 *   D:L141616) sit in states 2 and 4, entered only offline (D:L141363-141376): a spectator's follow is never rebound.
 *   The port's first-living-seat rule (the SPECTATOR-VIEW review's N1 of 2026-10-14, research 314 §8) is retired.
 * - **Departure: retired, kept.** `FUN_002bef60` (D:L162520-162539) retires the leaver's actor through `FUN_005998b0` --
 *   health 0, team mask 0, the retired identity, state 8 (D:L455516-455525) -- and touches no camera; the actor stays
 *   in the list until deleted. The port's room drops a leaver's body from its next snapshot, so the view keeps the last
 *   body it saw (FOLLOW_RETIRED_BODY_PLACEHOLDER).
 * - **Deletion: one a run.** `FUN_0029f510` deletes the first pending removal only (D:L145118-145123), a periodic task
 *   (registered at D:L50922; it then ticks the listed actors, D:L145122-145123); the view deletes one retired body a frame (FOLLOW_DELETE_QUEUE_PLACEHOLDER), and once the followed body
 *   is deleted hands no pose (FOLLOW_AFTER_DELETE_PLACEHOLDER).
 * Manual cycling (Right / Left) steps from the kept body's slot since DEAD-CYCLE (LATER 79, research 314 §5.6). The
 * benched dead player's teammate view (`followWatched`) keeps a dead teammate's body too since LATER 69 (§5.6).
 */

/**
 * FOLLOW_RETIRED_BODY_PLACEHOLDER (AD-8; research 314 §5.4 item 2, §8): the followed leaver between its departure and
 * its deletion. The original retires the actor (state 8, the retired identity; `FUN_005998b0` D:L455516-455525) and
 * keeps it in the actor list, where the camera keeps it; the port's room drops a leaver's body at its `left`, so the view
 * keeps the last body the page saw, its Alive flag cleared -- a body no candidate of the cycle, followed where it was.
 * Where the retired actor stands and whether it is drawn are unread; settled by ONL-32's capture of a spectator
 * following a player who leaves the game. A second user (DEAD-WATCH, research 314 §5.6): the benched teammate view
 * (`followWatched`) whose watched teammate leaves -- the original keeps that retired actor bound too (the death camera
 * at 7 binds no one online); the port's view keeps no retired body and hands no pose from the departure, the camera
 * where the last pose stood it, moving with the sticks. The same capture, of a dead player watching a teammate who
 * leaves, settles it.
 */
export const FOLLOW_RETIRED_BODY_PLACEHOLDER = 'the last body the page saw, not alive, kept' as const;

/**
 * FOLLOW_DELETE_QUEUE_PLACEHOLDER (AD-8; research 314 §5.4 item 3, §8): when a retired leaver's removal is queued and how
 * often the queue runs. `FUN_0029f510` deletes one pending entry a run (D:L145118-145123) and then runs every listed
 * actor's slot +0x14 (D:L145122-145123) -- likely the actor list's per-frame tick; it is registered at D:L50922 among
 * arguments 0.8 / 0.9 / 1.0 / 3.0 / 4.5 (D:L50920-50924), likelier an ordering than a period. The queue's writers are the
 * body's clean-up after a timer (`FUN_0056ee80` D:L432650-432688) and a message's handler (`FUN_005dd990` D:L493130-493142), the retirement none. The
 * port queues a leaver when its body leaves the room's list and deletes the first queued one each frame, after the
 * frame's departures are queued -- so a leaver is kept one frame at least. Settled by reading that scheduling and the
 * clean-up's timer for a retired actor, or ONL-32's trace of two players leaving at once.
 */
export const FOLLOW_DELETE_QUEUE_PLACEHOLDER = 'queued at the departure; one deleted a frame' as const;

/**
 * FOLLOW_AFTER_DELETE_PLACEHOLDER (AD-8; research 314 §5.4 item 3.4, §8): what a spectator's camera follows once its
 * actor is deleted. `FUN_0029f850` (D:L145217-145247) writes no camera's +0xbc / +0xc0 / +0x10c, and whether the camera
 * is notified (an entry of the actor list, or through slot +0x54) is unread; no replacement is invented: the view hands
 * no pose and keeps its mode and target until a control binds another. What the page shows meanwhile: the HUD's follow
 * box with the departed player's name and no stats (`hud.ts`'s follow arm; the page's names outlive a `left`,
 * `netPage.ts`'s `left` case), and the fly camera, handed no pose, moving with the sticks while the mode reads follow.
 * Settled by reading the camera's membership of the actor list, or ONL-32's trace of +0xbc / +0xc0 / +0x10c across a
 * followed actor's deletion. A second user (DEAD-WATCH, research 314 §5.6): the benched teammate view, which hands no
 * pose from the departure on (FOLLOW_RETIRED_BODY_PLACEHOLDER's second user), so past the deletion too, its watched
 * teammate kept until a cycle.
 */
export const FOLLOW_AFTER_DELETE_PLACEHOLDER = 'the camera left where it stands' as const;

/**
 * SPECTATOR-VIEW W6 (research 248 F5, 314 §5.2): the scenic view's magnification, `FUN_002964f0`'s mode-2 arm -- m + dt x
 * the zoom stick x m x `rate`, held to [`min`, `max`] (D:L140408, D:L140513-140521) -- and set back to 1 when it is more
 * than `reset` from 1 (`FUN_001b3620` the absolute value): at X out of scenic (`FUN_00295260` D:L139485-139498), at Up /
 * Down onto a view (D:L139536-139550, D:L139564-139578) and at a bind out of scenic -- the jump and the cycle,
 * `FUN_002956e0` D:L139687-139697; the camera's initialiser writes 1 (`FUN_00299150` D:L141671). The magnification is
 * the projection's x / y scale (D:L140524-140527; `FUN_0029b2f0`'s, `./zoom`'s FOV reading: tan(half FOV) / m), handed
 * to the page by `SpectatorHost.magnify`.
 */
export const SCENIC_ZOOM = { rate: 1.3, min: 1, max: 30, reset: 0.01 } as const;

/**
 * SPECTATOR-VIEW W6: the look `FUN_002964f0` turns the camera's angles by in modes 0 and 2 alike -- the yaw (+0xfc) and
 * the pitch (+0xf8) each dt x the stick x `rate` rad/s (D:L140414-140415), the pitch x `DAT_003df198` (D:L140426) and
 * held to +-`pitchLimit` rad (D:L140427-140433), the yaw wrapped over a turn (D:L140434-140439); the angles a scenic view
 * starts from are its record's `Rot` (`FUN_002ab260` writes +0xf8.. D:L151481-151483, at Up / Down D:L139532, D:L139560
 * and at X back D:L139521). `DAT_003df198` is the INVERT PITCH sign, +-1 -- the START menu's row flips it (D:L61699-61721),
 * the stored option sets it (D:L125167-125171); the port's `LookOptions.invertPitch` (`./look`), handed in by
 * `SpectatorHost.pitchSign`. (2026-10-14, the review's B1: was `pitchScale: 1.0`, read as the ELF's constant 1.0
 * (research 248 §4), which is only the sign's initial value.)
 */
export const SCENIC_LOOK = { rate: 1.8849558, pitchLimit: 1.5 } as const;

/**
 * SCENIC_LOOK_AXES_READING (SPECTATOR-VIEW W6; research 248 §4's "axis mapping, processed-input range" open): which of
 * the page's `Input` axes stand for the pad's channels `FUN_002964f0` reads, and their signs in the port's angles.
 * - zoom: +0x224, the left stick's y after the pad's processing (D:L179557-179559, D:L179811), up positive (research 116
 *   §7, 184): the page's `moveY`, forward / up positive -- the stick up magnifies.
 * - yaw: +0x228, the right stick's x (D:L179561, D:L179808), left positive: the page's `lookX` is right positive, so
 *   `-lookX`; the yaw grows to the left in the port's convention, which takes the record's `Rot` yaw as written
 *   (SCENIC_VIEWS_READING) -- the stick right turns right.
 * - pitch: +0x22c, the right stick's y (D:L179563, D:L179809), up positive: the page's `lookY`; the pitch is `Rot`'s
 *   first, down negative -- the stick up looks up, INVERT PITCH off. The step is x `DAT_003df198`, the INVERT PITCH sign
 *   (D:L140426; SCENIC_LOOK), which the page's raw `lookY` does not carry: `SpectatorHost.pitchSign` gives it. (2026-10-14,
 *   the review's B1: was "with no INVERT PITCH", a misreading of `DAT_003df198` as a constant.)
 * The processed range is the page's (`padStick`'s dead zone and rescale), not the pad's 0.3 and radial step (research
 * 184). Not ported with it: the bounds pass after the zoom (D:L140531-140593: the authored extents, the cell heights --
 * a scenic position stands as authored), and the LOD scale the zoom writes (+0x2c8 = +0x2cc / m, D:L140528;
 * LOD_SCALE_READING: the page's render view takes the scope's magnification only). Owed: ONL-32's capture of a scenic
 * view turned and zoomed with each stick.
 */
export const SCENIC_LOOK_AXES_READING = { zoom: 'moveY', yaw: '-lookX', pitch: 'lookY' } as const;

/** `FUN_002964f0`'s mode-2 magnification after `dt` seconds of the zoom stick at `input` (SCENIC_ZOOM; D:L140513-140521). */
export function scenicMagnification(m: number, dt: number, input: number): number {
  const next = m + dt * input * m * SCENIC_ZOOM.rate;
  return next < SCENIC_ZOOM.min ? SCENIC_ZOOM.min : next > SCENIC_ZOOM.max ? SCENIC_ZOOM.max : next;
}

const DEGREES = 180 / Math.PI;

/**
 * The scenic look after `dt` seconds of the page's look stick (`lookX` right, `lookY` up; SCENIC_LOOK_AXES_READING), in
 * the port's degrees: the yaw wrapped into [0, 360] as D:L140434-140439 wraps [0, 2 pi], the pitch x `pitchSign` (INVERT
 * PITCH, -1 on) and held to +-1.5 rad (SCENIC_LOOK; D:L140425-140433).
 */
export function scenicLook(
  look: { yaw: number; pitch: number }, dt: number, lookX: number, lookY: number, pitchSign = 1,
): { yaw: number; pitch: number } {
  let yaw = look.yaw + dt * -lookX * SCENIC_LOOK.rate * DEGREES;
  const limit = SCENIC_LOOK.pitchLimit * DEGREES;
  const raw = look.pitch + dt * lookY * SCENIC_LOOK.rate * pitchSign * DEGREES;   // x DAT_003df198, D:L140426
  const pitch = raw > limit ? limit : raw < -limit ? -limit : raw;
  while (yaw < 0) yaw += 360;
  while (yaw > 360) yaw -= 360;
  return { yaw, pitch };
}

/** What a control asks for. */
type SpectatorAction = 'next' | 'previous' | 'scenicNext' | 'scenicPrevious' | 'toggle' | 'jump';

/** The pad's slots (`./gamepad` `PAD_LAYOUT`): d-pad Right / Left the peek's, Up / Down the zoom's, Cross the action, Triangle the stance. */
const PAD_SLOTS = { next: 'leanRight', previous: 'leanLeft', scenicNext: 'zoom', scenicPrevious: 'zoomOut', toggle: 'action', jump: 'stance' } as const satisfies Record<SpectatorAction, PadFlag>;

/** The keys (a development build's): the arrows the d-pad, X (V its alias) Cross, C Triangle, Space the next target (the owner). */
const SPECTATOR_KEYS: Readonly<Record<string, SpectatorAction>> = {
  ArrowRight: 'next', Space: 'next', ArrowLeft: 'previous', ArrowUp: 'scenicNext', ArrowDown: 'scenicPrevious', KeyX: 'toggle', KeyV: 'toggle', KeyC: 'jump',
};

/**
 * X, `FUN_00295260` D:L139480-139530, on the mode and the remembered mode: from scenic, remember scenic and go free
 * (D:L139482-139484; the magnification back to 1, D:L139485-139498, SCENIC_ZOOM); from follow, bind the camera to the local
 * object, remember follow and go free (D:L139500-139508); from free, go to the remembered mode (D:L139519) -- scenic
 * stands the view at the index (`FUN_002ab260` step 0, D:L139520-139523), follow binds the actor at +0x18 (`FUN_002956e0`,
 * D:L139525-139527, which keeps the remembered follow), and a remembered free runs neither branch: nothing changes.
 */
export function spectatorToggle(mode: SpectatorMode, remembered: SpectatorMode): { mode: SpectatorMode; remembered: SpectatorMode } {
  if (mode === 'free') return { mode: remembered, remembered };
  return { mode: 'free', remembered: mode };
}

/**
 * The remembered mode after `FUN_002956e0` binds the camera (the Triangle jump's end, D:L139442): it takes the mode left
 * when that is free or follow, and keeps its own from scenic (D:L139680-139686; the magnification back to 1 there,
 * D:L139687-139697, is `SpectatorView`'s, SCENIC_ZOOM).
 */
export function bindRemembered(mode: SpectatorMode, remembered: SpectatorMode): SpectatorMode {
  return mode === 'scenic' ? remembered : mode;
}

/** Whether the dead's cycle runs (DEAD_CYCLE_RESPAWN_READING). */
export function deadCycleRuns(seat: Pick<SpectatorSeat, 'role' | 'rules' | 'ghost'>): boolean {
  return seat.role === 'spectator' || seat.rules !== 'respawn' || seat.ghost;
}

/**
 * `nextFollow`'s twin, the walk `FUN_00546fa0` (DEAD-CYCLE, LATER 79): from `current`'s place in id order -- the bound
 * actor's slot, D:L412584, a candidate or not -- down a slot at a time (D:L412611), wrapping below 0 to the last
 * (D:L412592-412594), never `current` itself (D:L412615); from after the last when `current` is null; null with no other
 * candidate (D:L412617).
 */
export function previousFollow(current: number | null, candidates: readonly number[]): number | null {
  const ids = candidates.filter((id) => id !== current).sort((a, b) => b - a);
  if (!ids.length) return null;
  if (current === null) return ids[0]!;
  return ids.find((id) => id < current) ?? ids[0]!;
}

/** The map's scenic views (`LoadedMap.scenicViews`), none when it has none. */
export function scenicViews(map: { scenicViews?: readonly ScenicView[] }): readonly ScenicView[] {
  return map.scenicViews ?? [];
}

/** `FUN_002ab260`'s step over `count` views from `index` (D:L151453-151470): a positive step wraps forward, else from at least 0 back. */
export function scenicStep(index: number, step: number, count: number): number {
  if (count === 0) return index;
  if (step >= 1) return (index + step) % count;
  const at = Math.max(index, 0) + step;
  return at < 0 ? at + count : at;
}

const sub = (a: readonly number[], b: readonly number[]): number[] => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const length = (a: readonly number[]): number => Math.sqrt(dot(a, a));

/** `FUN_00308800`: a point's distance to the segment a-b -- to the nearer end past either, else to the line. */
export function segmentDistance(p: readonly number[], a: readonly number[], b: readonly number[]): number {
  const ab = sub(b, a), ap = sub(p, a);
  if (dot(ab, ap) <= 0) return length(ap);
  const bp = sub(p, b);
  if (dot(sub(a, b), bp) <= 0) return length(bp);
  const cross = [ab[1]! * ap[2]! - ab[2]! * ap[1]!, ab[2]! * ap[0]! - ab[0]! * ap[2]!, ab[0]! * ap[1]! - ab[1]! * ap[0]!];
  return length(cross) / length(ab);
}

/** `FUN_00294f40`: the body nearest the view's centre segment, dead or alive, the nearer within the band (JUMP_TO_VISIBLE_READING); null with none. */
export function jumpToVisible(eye: SpectatorEye, bodies: readonly SpectatorBody[]): number | null {
  const a = eye.position, f = eye.forward;
  const b = [a[0]! + f[0]! * eye.far, a[1]! + f[1]! * eye.far, a[2]! + f[2]! * eye.far];
  const band = JUMP_TO_VISIBLE_READING;
  let best: number | null = null, line = 0, range = 0;
  for (const body of [...bodies].sort((x, y) => x.id - y.id)) {   // W5: no alive filter (D:L139398-139408)
    const d = segmentDistance(body.feet, a, b);
    let take = best === null;
    if (!take) {
      const rel = (d - line) / line;
      if (rel < -band) take = true;
      else if (rel < band) {
        const relRange = (length(sub(body.feet, a)) - range) / range;
        take = relRange < band && (rel < 0 || relRange < 0);
      }
    }
    if (take) { best = body.id; line = d; range = length(sub(body.feet, a)); }
  }
  return best;
}

/**
 * The eye of a three.js camera (structurally: no three.js import here): its world position and its -z axis off
 * `matrixWorld` (column-major), and its far distance; undefined for a stand-in without them (the page tests' `{}`).
 */
export function cameraEye(camera: { matrixWorld?: { elements: ArrayLike<number> }; far?: number }): SpectatorEye | undefined {
  const m = camera.matrixWorld?.elements;
  if (!m || m.length < 16 || typeof camera.far !== 'number') return undefined;
  const f = [-m[8]!, -m[9]!, -m[10]!];
  const n = length(f) || 1;
  return { position: [m[12]!, m[13]!, m[14]!], forward: [f[0]! / n, f[1]! / n, f[2]! / n], far: camera.far };
}

function alive(b: SpectatorBody): boolean {
  return (b.flags & BodyFlag.Alive) !== 0;
}

/** The follow camera's pose behind `body` (`FOLLOW_BEHIND`, `FOLLOW_OVER`, `FOLLOW_PITCH`). */
export function followPose(body: SpectatorBody): SpectatorPose {
  const y = (body.yaw * Math.PI) / 180;
  return { x: body.feet[0]! + Math.sin(y) * FOLLOW_BEHIND, y: body.feet[1]! + FOLLOW_OVER, z: body.feet[2]! + Math.cos(y) * FOLLOW_BEHIND, yaw: body.yaw, pitch: FOLLOW_PITCH };
}

/**
 * One page's spectator camera and dead cycle. `NetPage` constructs it with its host, forwards its keys (`key`), its pad
 * (`pad`, once a frame) and its frame (`frame`), benches and resets it, and reads `watching` for WEAPON EXCHANGE's gate.
 */
export class SpectatorView {
  /** SPECTATOR_START_READING; no pose at entry (SPECTATOR_ENTRY_POSE_PLACEHOLDER: the fly camera where the page has it). */
  private modeNow: SpectatorMode = SPECTATOR_START_READING.mode;
  private rememberedNow: SpectatorMode = SPECTATOR_START_READING.remembered;
  private targetNow: number | null = null;
  private scenicNow: number = SPECTATOR_START_READING.scenic;
  private benchedNow = false;
  private watchingNow: number | null = null;
  private last: Input | null = null;
  private eye: SpectatorEye | null = null;
  /**
   * W6: the camera's +0x118 (SCENIC_ZOOM; `FUN_00299150` D:L141671 writes 1), and the last value the page was told --
   * none yet, so the first frame tells 1: the page's one camera (the walker's too) may come from an earlier page.
   */
  private magNow: number = SCENIC_ZOOM.min;
  private magTold = Number.NaN;
  /** W6: the scenic look, the camera's +0xf8 / +0xfc in the port's degrees, from the view's `Rot` at entry (SCENIC_LOOK). */
  private look = { yaw: 0, pitch: 0 };
  /** W6: the sticks of the last pad frame (zero while the menu holds it, D:L140400; SCENIC_LOOK_AXES_READING). */
  private sticks = { zoom: 0, lookX: 0, lookY: 0 };
  /** AD-8: the bodies of the last frame, by id -- what a departure leaves (FOLLOW_RETIRED_BODY_PLACEHOLDER). */
  private seen = new Map<number, SpectatorBody>();
  /** AD-8: the retired leavers in their removal queue's order, the first deleted first (FOLLOW_DELETE_QUEUE_PLACEHOLDER). */
  private retiredNow: SpectatorBody[] = [];
  constructor(private readonly host: SpectatorHost) {}

  /** The spectator camera's mode. */
  get mode(): SpectatorMode { return this.modeNow; }
  /** The mode X returns to from free (`FUN_00295260`'s byte 1, the camera's +0xf5). */
  get remembered(): SpectatorMode { return this.rememberedNow; }
  /** The spectator's followed player, or null. */
  get target(): number | null { return this.targetNow; }
  /** The scenic view's index, -1 before any. */
  get scenic(): number { return this.scenicNow; }
  /** W6: the magnification (SCENIC_ZOOM), 1 but in a scenic view zoomed (and within 0.01 of 1 after it). */
  get magnification(): number { return this.magNow; }
  /** Classic's dead and the ghosts: watching until the next round. */
  get benched(): boolean { return this.benchedNow; }
  /** The benched player's followed teammate, or null (the own body). */
  get watching(): number | null { return this.watchingNow; }
  /** AD-8: the leavers kept retired until their deletion, in the queue's order (FOLLOW_RETIRED_BODY_PLACEHOLDER). */
  get retired(): readonly SpectatorBody[] { return this.retiredNow; }

  /** Benched: classic's dead, or a ghost, until the next round (`FUN_005979a0` L454484-454489). */
  bench(): void {
    this.benchedNow = true;
  }

  /**
   * Back in play (a spawn, a new round, a promotion): the bench and its camera left. For a spectator it is the round's
   * turnover (AD-9, research 314 §5.5; the page's unbench at `roundStart`, SPECTATOR_TURNOVER_EVENT_READING, and at its
   * welcome, the entry's same reset, D:L50946 -- but not a replay seek's welcome, the fold's carrier (W37.R4), which is no
   * entry: REPLAY-SEEK-KEEP, a browser adaptation with no original (#270, #271), keeps the watcher's camera, as RE-3 keeps
   * the countdown and PAR-94d the banner. Its edge, named: a seek landing in a LATER round keeps the follow too, though a
   * live turnover would have reset it -- the seek replays no `roundStart`; a `roundStart` played through still resets.
   * Also at `abandoned` -- the original's camera at that dialog, `FUN_002bc530`,
   * unread -- and `promoted`, where the page has already let the view go): the camera's initialiser `FUN_00299150` -- the
   * mode free (D:L141664), the remembered mode free (D:L141665), the scenic index -1 (D:L141666), the followed actor none
   * (+0x10c, D:L141670), the
   * magnification 1 with no 0.01 test (D:L141671; the picture's projection by the HUD's round reset, D:L57659 ->
   * D:L53354). The actor list is not the camera's: AD-8's retired leavers and their queue stand. No pose is handed
   * (SPECTATOR_TURNOVER_POSE_PLACEHOLDER): the page shows the free info box (no followed name) and X does nothing until a
   * cycle, the jump or a scenic view.
   */
  reset(): void {
    this.host.resetFollow?.();
    this.benchedNow = false;
    this.watchingNow = null;
    if (this.host.seat().role !== 'spectator') {
      // W6, an adaptation's guard (the gameplay seat's condition): the page has one camera for the walker and the
      // spectator, so a seat in play (a spawn, a promotion) is never left magnified.
      this.setMagnification(SCENIC_ZOOM.min);
      return;
    }
    const from = this.modeNow;
    this.modeNow = SPECTATOR_START_READING.mode;
    this.rememberedNow = SPECTATOR_START_READING.remembered;
    this.scenicNow = SPECTATOR_START_READING.scenic;
    this.targetNow = null;
    this.setMagnification(SCENIC_ZOOM.min);
    if (from !== 'free') this.host.spectate(null);   // SPECTATOR_TURNOVER_POSE_PLACEHOLDER: the fly camera where it stands
  }

  /**
   * A key (the page's `keyup` and `keydown` alike: only the release acts, SPECTATOR_RELEASE_READING). True when it
   * acted (and was prevented); `blocked` is the menu's (DEAD_CYCLE_WHILE_MENU_READING): no key acts then.
   */
  key(e: SpectatorKey, blocked = false): boolean {
    if (e.type !== (SPECTATOR_RELEASE_READING === 'release' ? 'keyup' : 'keydown') || e.repeat || blocked) return false;
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    const action = SPECTATOR_KEYS[e.code];
    if (action === undefined || !this.act(action)) return false;
    e.preventDefault();
    return true;
  }

  /**
   * The pad, once a frame: its edges against the last frame's (released, SPECTATOR_RELEASE_READING). `blocked` (the
   * menu open, HUD mode 1) takes the frame without acting, so a release under the menu never fires after it.
   */
  pad(input: Input, blocked = false): void {
    const before = this.last ?? input;
    this.last = { ...input };
    // W6: the sticks the scenic look and zoom read (SCENIC_LOOK_AXES_READING); none while the menu holds the pad (D:L140400).
    this.sticks = blocked ? { zoom: 0, lookX: 0, lookY: 0 } : { zoom: input.moveY, lookX: input.lookX, lookY: input.lookY };
    if (blocked) return;
    const edges = new Set(SPECTATOR_RELEASE_READING === 'release' ? releasedSince(before, input) : pressedSince(before, input));
    if (edges.has(PAD_SLOTS.jump)) this.act('jump');
    if (edges.has(PAD_SLOTS.toggle)) this.act('toggle');
    else if (edges.has(PAD_SLOTS.scenicNext)) this.act('scenicNext');
    else if (edges.has(PAD_SLOTS.scenicPrevious)) this.act('scenicPrevious');
    if (edges.has(PAD_SLOTS.next)) this.act('next');
    else if (edges.has(PAD_SLOTS.previous)) this.act('previous');
  }

  /**
   * A frame of `dt` seconds (0: no clock, nothing turns): the view's eye kept for Triangle, the followed player or the
   * scenic view stood at -- turned and zoomed by the sticks (W6, `FUN_002964f0`) -- the watched teammate followed.
   */
  frame(eye?: SpectatorEye, dt = 0): void {
    if (eye) this.eye = eye;
    if (this.magTold !== this.magNow) this.setMagnification(this.magNow);   // the first frame: the page told 1
    if (this.host.seat().role === 'spectator') {
      // AD-8's bookkeeping is a spectator's only (a player follows no one): a player's frame reads the room's bodies no
      // more often than before AD-8 (RE-3's live digest, `netPageClock.test.ts`).
      this.retireAndDelete();
      if (this.modeNow === 'follow') this.follow(dt);
      else if (this.modeNow === 'scenic') {
        if (dt > 0) {
          this.look = scenicLook(this.look, dt, this.sticks.lookX, this.sticks.lookY, this.host.pitchSign?.() ?? 1);   // D:L140414-140439
          this.setMagnification(scenicMagnification(this.magNow, dt, this.sticks.zoom));    // D:L140408, D:L140512-140528
        }
        this.standScenic();
      }
    } else if (this.magNow !== SCENIC_ZOOM.min) {
      // The port's promotion (a spectator seated as a player; a lobby spectator stays one in the original, research 314
      // R314.1): an adaptation's guard so the walker's view is never left magnified -- the initialiser's 1 (D:L141671).
      this.setMagnification(SCENIC_ZOOM.min);
    }
    if (this.benchedNow && this.watchingNow !== null) this.followWatched(dt);
    else if (this.host.seat().role !== 'spectator' || this.modeNow !== 'follow') this.host.resetFollow?.();
  }

  /** W6: the magnification, the page told when it changes (`SpectatorHost.magnify`). */
  private setMagnification(m: number): void {
    this.magNow = m;
    if (m !== this.magTold) { this.magTold = m; this.host.magnify?.(m); }
  }

  /** W6: back to 1 when more than 0.01 from it (SCENIC_ZOOM: D:L139485-139498, D:L139536-139550, D:L139564-139578, D:L139687-139697). */
  private resetMagnification(): void {
    if (Math.abs(this.magNow - 1) > SCENIC_ZOOM.reset) this.setMagnification(1);
  }

  /** One control: true when it is this seat's (a spectator's, or a benched player's cycle while it runs). */
  private act(action: SpectatorAction): boolean {
    const seat = this.host.seat();
    if (seat.role === 'spectator') {
      this.spectatorAct(action);
      return true;
    }
    if (!this.benchedNow || !deadCycleRuns(seat) || (action !== 'next' && action !== 'previous')) return false;
    this.cycleTeammate(action === 'next', seat);
    return true;
  }

  private spectatorAct(action: SpectatorAction): void {
    switch (action) {
      case 'next': case 'previous': {
        const living = this.spectatorBodies().filter(alive).map((b) => b.id);
        // DEAD-CYCLE (LATER 79): the walk starts at the camera's bound actor (D:L412584, D:L412637) -- in follow the
        // followed body, dead or gone (AD-8); in free and scenic the spectator's own object, null here
        // (SPECTATOR_OWN_SLOT_PLACEHOLDER: before every player).
        const from = this.modeNow === 'follow' ? this.targetNow : null;
        const found = action === 'next' ? nextFollow(from, living) : previousFollow(from, living);
        // The walk binds only when it finds someone (D:L412617, D:L412674): with nobody, nothing changes.
        if (found === null) return;
        this.targetNow = found;
        // The walk binds through the camera's +0xc, `FUN_0029b3c0` -> `FUN_002956e0` (D:L412618, D:L412675, D:L142768).
        if (this.modeNow === 'scenic') this.resetMagnification();     // W6: the bind out of scenic, D:L139687-139697
        this.rememberedNow = bindRemembered(this.modeNow, this.rememberedNow);
        this.modeNow = 'follow';
        return;
      }
      case 'scenicNext': case 'scenicPrevious': {
        const at = scenicStep(this.scenicNow, action === 'scenicNext' ? 1 : -1, this.views().length);
        this.scenicNow = at;
        if (at < 0 || this.views().length === 0) return;      // D:L139535, D:L139563: scenic only at an index >= 0
        this.enterView();                                       // W6: the record's angles (D:L139532, D:L139560)
        this.resetMagnification();                              // W6: D:L139536-139550, D:L139564-139578
        this.modeNow = 'scenic';
        this.standScenic();
        return;
      }
      case 'toggle': {
        const from = this.modeNow;
        const next = spectatorToggle(from, this.rememberedNow);
        this.modeNow = next.mode;
        this.rememberedNow = next.remembered;
        if (this.modeNow === 'free') {
          if (from === 'scenic') this.resetMagnification();   // W6: D:L139485-139498
          if (from !== 'free') this.host.spectate(null);      // free: the fly camera left where it stands
        } else if (this.modeNow === 'scenic') {
          this.scenicNow = scenicStep(this.scenicNow, 0, this.views().length);
          this.enterView();                                     // W6: the record reloaded, its angles (D:L139521)
          this.standScenic();
        }                                                       // follow: the actor kept (+0x18); the frame follows it
        return;
      }
      case 'jump': {
        if (!this.eye) return;
        const id = jumpToVisible(this.eye, this.spectatorBodies());
        if (id === null) return;
        if (this.modeNow === 'scenic') this.resetMagnification();               // W6: the bind out of scenic, D:L139687-139697
        this.rememberedNow = bindRemembered(this.modeNow, this.rememberedNow);   // FUN_002956e0 D:L139680-139686
        this.targetNow = id;
        this.modeNow = 'follow';                                // D:L139702-139704: another actor, follow
        return;
      }
    }
  }

  /** The bodies a spectator's cycle and jump choose from (`SPECTATOR_HOSTAGE_READING`). */
  private spectatorBodies(): readonly SpectatorBody[] {
    const all = this.host.bodies();
    return SPECTATOR_HOSTAGE_READING === 'included' ? all : all.filter((b) => !(this.host.escortee?.(b.id) ?? false));
  }

  /**
   * AD-8: the followed player at the follow camera's distances, dead or alive (the actor kept, D:L140893-140918; never
   * rebound, D:L141363-141376); a leaver at its retired body (FOLLOW_RETIRED_BODY_PLACEHOLDER); once deleted, no pose
   * (FOLLOW_AFTER_DELETE_PLACEHOLDER).
   */
  private follow(dt = 0): void {
    const id = this.targetNow;
    const body = this.host.bodies().find((b) => b.id === id) ?? this.retiredNow.find((b) => b.id === id);
    if (body) {
      if (this.host.follow) this.host.follow(body, dt);
      else this.host.spectate(followPose(body)); // Compatibility for non-rendering hosts without a world.
    }
  }

  /**
   * AD-8, once a frame: the first queued removal deleted (`FUN_0029f510` D:L145118-145123; FOLLOW_DELETE_QUEUE_PLACEHOLDER),
   * then each body gone from the room's list since the last frame retired -- kept not alive at its last place -- and
   * queued (`FUN_005998b0` D:L455516-455525; FOLLOW_RETIRED_BODY_PLACEHOLDER). A body back in the list is no longer retired.
   */
  private retireAndDelete(): void {
    this.retiredNow.shift();
    const now = new Map(this.host.bodies().map((b) => [b.id, b] as const));
    if (this.retiredNow.length) this.retiredNow = this.retiredNow.filter((b) => !now.has(b.id));
    for (const [id, b] of this.seen) {
      if (!now.has(id)) this.retiredNow.push({ ...b, flags: b.flags & ~BodyFlag.Alive });
    }
    this.seen = now;
  }

  private views(): readonly ScenicView[] {
    return this.host.views?.() ?? [];
  }

  /** W6: the scenic look starts at the view's `Rot` (`FUN_002ab260` D:L151481-151483). */
  private enterView(): void {
    const v = this.views()[this.scenicNow];
    if (v) this.look = { yaw: v.yaw, pitch: v.pitch };
  }

  /** The scenic view's authored position, at the look the sticks turned from its start (W6, research 248 F5). */
  private standScenic(): void {
    const v = this.views()[this.scenicNow];
    if (v) this.host.spectate({ x: v.at[0], y: v.at[1], z: v.at[2], yaw: this.look.yaw, pitch: this.look.pitch });
  }

  /** The dead's living teammates: not the own seat, the same side, no escortee or hostage (D:L412604-412609). */
  private teammates(seat: SpectatorSeat): number[] {
    return this.host.bodies()
      .filter((b) => alive(b) && b.id !== seat.self && seat.teams.get(b.id) === seat.team && !(this.host.escortee?.(b.id) ?? false))
      .map((b) => b.id);
  }

  /**
   * DEAD-CYCLE (LATER 78, 79; research 314 §5.6): the walk's stops are the living teammates and the own actor, alive or
   * dead (`DAT_00440c38`, D:L412605, D:L412658) -- its seat whether or not the room lists its body -- and it starts at
   * the camera's bound actor (D:L412584, D:L412637): the watched teammate, dead or gone (LATER 69 keeps it), or the own
   * body. Reaching the own seat is the own body's view again (`watching` null, `SpectatorHost.returnSelf`,
   * DEAD_CYCLE_OWN_VIEW_READING). (Was: the living teammates only, from the first / last of them when the watched one
   * was none.)
   */
  private cycleTeammate(forward: boolean, seat: SpectatorSeat): void {
    const self = seat.self;
    const stops = this.teammates(seat);
    if (self !== null) stops.push(self);
    const from = this.watchingNow ?? self;
    const next = forward ? nextFollow(from, stops) : previousFollow(from, stops);
    if (next === null) return;
    if (next === self) {
      this.watchingNow = null;
      this.host.resetFollow?.();
      this.host.returnSelf?.();
      return;
    }
    if (this.watchingNow === null) this.host.leaveSelf();
    this.watchingNow = next;
    this.followWatched();
  }

  /**
   * The watched teammate at the follow camera's distances, dead or alive (LATER 69, research 314 §5.6): the original's
   * dead watcher moves only on a cycle press (`FUN_00547350` D:L412733-412750, the latch's one writer the pad,
   * D:L451683-451694), and its death camera, at 7 once a remote teammate is bound (`FUN_002980d0` D:L141378-141389),
   * binds no one online (its binds D:L141484, D:L141529, D:L141616 in the offline states 2 and 4) and refuses a bind of
   * the actor it holds (`FUN_002956e0` D:L139710-139714). A body gone from the room's list hands no pose: the view stays
   * where the last one stood it (FOLLOW_RETIRED_BODY_PLACEHOLDER, FOLLOW_AFTER_DELETE_PLACEHOLDER's stand-in).
   * (Was NU-11's: on to the next living teammate when the watched one died.)
   */
  private followWatched(dt = 0): void {
    const body = this.host.bodies().find((b) => b.id === this.watchingNow);
    if (body) {
      if (this.host.follow) this.host.follow(body, dt);
      else this.host.spectate(followPose(body)); // Compatibility for non-rendering hosts without a world.
    }
  }
}

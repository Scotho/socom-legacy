import { GAME_FRAME_DT, SEAL_TUNING, type Grid, type WeaponRecord, type WeaponStance, type WeaponStanceName } from '@s2u/scene';
import { Accuracy, lookRates, tangentPerPixel, type AccuracyInput, type AccuracySave, type Cone } from '../accuracy';
import {
  CAM_BACK, CAM_FAR, CAM_MARGIN, cameraPass, isPeekCameraSurface, LEAD_DOWN, LEAD_PROBE, localCamera, lookHeight, newPassState, proneEyeTerms, scopeEye, toWorld,
} from '../cameraRig';
import { pitchStickOf } from '../look';
import { ACTION_SECONDS, isCameraClassSurface, rootY, SCOPED_STICK, type Stance } from '../mover';
import type { PlayingMotion } from './fireCapability';
import type { GateTop } from './actionGate';
import { Button, TICK_HZ, type Command } from './protocol';
import { shortTurn, wrapYaw } from '../yaw';

/**
 * The accuracy cone on the match server (OWNER-3 of the launch review, 2026-09-29: "port the server-side accuracy cone
 * now"; spec W3.R4 "the accuracy cone ... the server owns every result"). The page's rounds leave by `./accuracy`'s
 * cone: the reticle's bloom and knock (`FUN_005c2670`, `FUN_005c3360`), turned into tangents about the eye's look and
 * sampled in a square (`FUN_005bd100`, `FUN_00592260` -- `perturb`). The server cannot know the page's random sample,
 * so it does the other half: it runs the **same** `Accuracy` for each player from the commands it already receives
 * (the command's look, sticks and buttons, the server's own mover for the stance, the velocity and the air) and
 * refuses a round whose eye ray lies outside the cone that state allows.
 *
 * A round on the wire (protocol 5) names the eye its aim ray left from (`eye`, the camera's -- `./walk` `fireAim`), that
 * ray after the cone (`aim`), and the segment the round itself flew (`from`, `dir`: from the muzzle toward the point
 * under the reticle, `./fire`'s two legs). `check` answers three things:
 *
 * 1. **The eye is the camera's.** Third person: the eye lies on `FUN_0029a950`'s line from the look-at target back to
 *    the goal (`./cameraRig` `localCamera`, the server's feet, yaw, pitch, root and peek), anywhere the pass
 *    (`FUN_0029bf70`) could have pulled it in to, pushed at most `CAM_MARGIN` sideways and up by its four side probes.
 *    In the scope's view it is the head (`headPoint`: `scopeEye`, `FUN_0029ae50`).
 * 2. **The aim is inside the cone.** The look is the line from that eye to `FUN_00297410`'s far point, `CAM_FAR` along
 *    the pitched look from the target (the scope's: straight ahead); the aim's tangents about it (`coneCoords`, the
 *    inverse of `perturb`) must fall inside the cone -- the knock's offset plus or minus the bloom's radius, or, scoped,
 *    anywhere inside the sway's limits (not the sway's point: `CONE_SWAY_BOX_ADAPTATION`).
 * 3. **The round goes where the eye aimed.** The round's segment passes through the eye's ray ahead of both (the page
 *    aims the muzzle at the point the eye's ray meets: `./fire` `tryFire`).
 *
 * The tolerances, each named: the page draws between two ticks and its mouse look runs a frame ahead of the command
 * (so the look may be any blend of the ticks before, at and after the round's command); the page's bloom runs on its
 * frames and the server's on commands, both continuously (MISSION R8; `CONE_WINDOW_PLACEHOLDER`,
 * `coneSlackPx`: `CONE_SLACK_PX_PLACEHOLDER` plus one game frame of the knock's return); the body's posed root,
 * which the camera stands on, is the clips' and the server has only the stance's (`ROOT_POSE_SLACK_PLACEHOLDER`,
 * `stanceChangeTicks`); the target's lead probe (`FUN_0029cbb0`) shortens the lead by an amount the server
 * does not probe (bounded by the lead itself). Research 91 section 16 lists them.
 */

type V3 = [number, number, number];

/** Ticks of the server's cone before a round's command that the page's may match (100 ms: the page's frame-driven bloom). */
export const CONE_WINDOW_PLACEHOLDER = 6;
/**
 * Pixels of the reticle (`kit+0x84c`'s units) the page's bloom may stand off the server's for frame- against
 * tick-sampled turn and pitch rates. The whole slack is `coneSlackPx`: this plus one game frame of the knock's return.
 */
export const CONE_SLACK_PX_PLACEHOLDER = 2;

/**
 * The cone's slack in reticle pixels for a stance record: `CONE_SLACK_PX_PLACEHOLDER` plus one game frame of the
 * knock's return, `ReticuleKnockReturn x GAME_FRAME_DT` (`FUN_005c2670`: research 84 section 4, research 181 X1). The
 * page's `Accuracy` runs on its frames and the room's on 60 Hz commands, both continuously since MISSION R8 (they
 * stepped in separate `GameFrameAccumulator`s under PF-02). A round leaves after the page's `gunFrame`, tagged with
 * the last command `walk.frame` sent, so the page stands at most its part-tick (under 1/60 s) past the room: the
 * per-second laws put at most a tick between them (1.17 px of the M4A1's knock return; measured at most 0.39 px at
 * 144 Hz page frames, 0 at 30 Hz, research 208 section 9). The slack is kept unchanged (PF.R9) as the bound; the
 * honest-rounds test (`shotCone.test.ts`, "the page's own frames at 144 and 30 Hz ...") refuses none. The M4A1
 * standing is 2 + 2.34 = 4.34. Under PF-02's per-frame kits it was the smallest simple bound over every honest case
 * found (worst 3.18 px, at a round every 2 commands; at most 1.40 px at cadences the fire rate allows): the size's own
 * frame step is not added, for the room's strictness (research 169; the controller's ruling on the PF-02 review).
 */
export function coneSlackPx(s: Pick<WeaponStance, 'knockReturn'>): number {
  return CONE_SLACK_PX_PLACEHOLDER + s.knockReturn * GAME_FRAME_DT;
}
/**
 * Units the body's posed root (the clips', which the page's camera stands on: `PlayerCamera`'s header) may stand off the
 * stance's measured root the server has (`./mover` `rootY`): the standing jump lifts it 3.6 (10.5 to 15.1).
 */
export const ROOT_POSE_SLACK_PLACEHOLDER = 4;
/**
 * JUMP-AIM-ROOT (the ghost-bullet report on live v0.4.18, game 4180; research 80 s7, 2026-11-11; reading, pending
 * review): which bodies' aim frames stand on the jump clip's posed root (`aimRoot`). The original plays the standing jump
 * `seal_jump` from a crouch with the stance kept (research 80 s0, `FUN_005b4340`), and its camera reads the posed
 * skeleton root (`FUN_0029a950` through `FUN_002869d0`), which the clip lifts 10.51 -> 15.08 (research 80 s0, key 12) --
 * 9.6 u over the crouch's measured root 5.504, past `ROOT_POSE_SLACK_PLACEHOLDER`, so a crouched jumper's honest eye was
 * refused 'eye'. 'crouched': a crouched body takes the posed root -- in the jump action, and (the fold's blend-out,
 * the controller's ruling, 2026-11-11) whenever the posed root stands above the crouch root, so the ease back to the
 * crouch idle after the clip is covered (shadow's capture of the original, r0004, 3/3: the root eases 11.258 -> 5.504
 * over frames 30-44 with the stance kept; research 80 s7); its reach: the crouch walk's root (5.50-9.33) and a stance
 * change into the crouch too, as the page's camera stands on them. The standing body keeps the stance's measured root,
 * which `ROOT_POSE_SLACK_PLACEHOLDER` was sized to cover (10.51..15.08 within 11.484 +- 4), so its verdicts are today's.
 * 'every' would carry the posed root on the standing jump too (the page's camera does, but the slack already holds it).
 * Settles with the room's root slack re-sized against the posed root on every body (the slack is the page's own
 * tolerance, no original).
 */
export const JUMP_AIM_ROOT_BODIES_READING: 'crouched' | 'every' = 'crouched';

/**
 * JUMP-AIM-ROOT: the root a command's aim frame stands its camera on (`AimMover.moveRoot`; the room's `Room.aimRootOf`,
 * the page's `WalkMode.startBody`): a traversal move's own (`Traversal.rootY`) first, as before; else, for a body
 * `JUMP_AIM_ROOT_BODIES_READING` names, the posed root `posed` gives -- the room's `HitPoser` (the page's `Animator` on the
 * room's snapshot of the body, HIT-POSE's A = B), the page's own `Play` animator (`setPosedRoot`) -- for a crouched body
 * in the jump action, or whose posed root stands above the crouch root (`rootY('crouch')`; the crouch idles pose at or
 * under it: 5.5039, 5.0313, 4.7070, so a still crouch is today's). The root is the clips' own, so the eye rises only as
 * far as their root plus the slack (`seal_jump`'s 15.08 at most). Else null (the stance's measured root stands in);
 * `posed` null or not finite (no motion, no poser): null.
 */
export function aimRoot(moveRoot: number | null, body: { action: string | null; posture: Stance }, posed: () => number | null): number | null {
  if (moveRoot !== null) return moveRoot;
  const crouched = body.posture === 'crouch';
  if (!crouched && !(JUMP_AIM_ROOT_BODIES_READING === 'every' && body.action === 'jump')) return null;
  const r = posed();
  if (r === null || !Number.isFinite(r)) return null;
  return !crouched || body.action === 'jump' || r > rootY('crouch') ? r : null;
}
/**
 * PF-37 (research 236 s2, research 179 s"STANCE_CHANGE_TICKS", the flat 60 retired; ruling PF.R57): the ticks after a
 * posture change during which the posed root may be anywhere between the two stances' -- the change's own clip
 * (`../mover` `ACTION_CLIPS`: motion.rdr `playback`, MOTION_P.ZAR keys) run to its last key (`ACTION_SECONDS`,
 * `oneShotSeconds`, `FUN_0028c4f0`: playback x ((n-1)/n)^2), in 60 Hz ticks, rounded up: stand<->crouch 0.6027 s = 37,
 * crouch<->prone 0.8463 s = 51, stand<->prone 0.9452 s = 57 (in place of the flat 60). The tolerance itself is the
 * page's own (the camera stands on the clip's root); the lengths are disc data through a read formula. Getting up plays
 * the same clip backwards (`Walker.changeStance`'s reversed hold, the same `ACTION_SECONDS`):
 * `STANCE_REVERSE_TICKS_READING`. 0 for no change.
 */
export function stanceChangeTicks(from: Stance, to: Stance): number {
  if (from === to) return 0;
  const pair = (a: Stance, b: Stance): boolean => (from === a && to === b) || (from === b && to === a);
  const clip = pair('stand', 'crouch') ? 'standToCrouch' : pair('crouch', 'prone') ? 'crouchToProne' : 'standToProne';
  return Math.ceil(ACTION_SECONDS[clip] * TICK_HZ);
}
/**
 * Getting up (crouch -> stand, prone -> crouch, prone -> stand) takes the same ticks as going down: the mover plays the
 * same transition clip reversed at the same length (research 179: "assumed the same length"; the reversed play's speed
 * is a mover reading, not a measurement).
 */
export const STANCE_REVERSE_TICKS_READING = 'same as forward';
/** How near the round's segment must pass the eye's ray: numeric only (both are sent as JSON doubles). */
export const BIND_EPSILON = 0.01;
/**
 * HX-OBEY (`ORDER_EYE_TRUST_READING`; `ShotCone.eyeFitsOrder`): how far an order's eye may stand off the camera's real
 * locus -- the pass's four side probes push the eye at most `CAM_MARGIN` across and up (`CAM_MARGIN` x sqrt 2 on the
 * diagonal) and the locus is swept in 1 u steps (half a step more), plus `BIND_EPSILON`: 1.57 u. A bound that much
 * wider than the camera's locus, never the locus itself.
 */
export const ORDER_EYE_BOUND = CAM_MARGIN * Math.SQRT2 + 0.5 + BIND_EPSILON;
/**
 * LATER 139: what an honest aim line of THE PAGE may stand off a swept look line beyond the eye's own bound. The page's
 * pass shifts the eye (`FUN_0029bf70`'s side probes, at most `CAM_MARGIN` x sqrt 2), and the page casts from that eye
 * toward `FUN_00297410`'s far point, `CAM_FAR` (1000) along the pitched look from the target (`walk.ts` `fireAim`,
 * `matchThrow.ts`) -- seen along the look, the far point lands on the target, so every point of the page's line lies
 * between the shifted eye and the target: within the shift of the swept segment, with no angular term; and the wire's
 * look quantisation (a yaw half-step of 0.00275 deg, a pitch half-step of 0.005 deg) moves a point 40 u out by under
 * 0.004 u. 0.05 holds that with room. NOT the original's: it aims from the eye toward the moved target
 * (`FUN_0029bc90` D:L143105, `FUN_005aa6e0` D:L464110-464123), so after a side shift s its line parts from the look by
 * s/d (d the eye-to-target distance, at least 0.75). LATER 305 took the page's aim to parity and, rather than an s x/d
 * term here, added the original's own line beside this rule: a page eye the room reproduces, through the moved target
 * (`lookFitsPoint` with an eye, `C4_VIEW_LINE_PLACEHOLDER`). This rule stays for a page without one (and the fallback).
 */
export const C4_LOOK_EPSILON = 0.05;
/**
 * LATER 139 (research 210's ledger): how far across the look a named C4 or SWITCH point may lie from the camera's swept
 * locus at a command and still be the camera's aim (`lookFitsPoint`): the eye's bound (`ORDER_EYE_BOUND`) and
 * `C4_LOOK_EPSILON`. A reading of the rig; what settles it is honest page picks measured against the room's swept lines
 * over a drifting clip, the lead probe, the posed root and a peek.
 */
export const C4_LOOK_BOUND_PLACEHOLDER = ORDER_EYE_BOUND + C4_LOOK_EPSILON;
/**
 * LATER 305 (research 210 §9.1's ledger): how far a named C4 or SWITCH point may lie across the original's line -- the
 * page's validated eye through the frame's moved target (`lookFitsPoint` with an eye) -- and still be its aim: 0.05 u,
 * `C4_LOOK_EPSILON`'s room for the wire's look quantisation (under 0.004 u at 40 u) and the struck point's float
 * rounding. What settles it: honest page picks at a side-shifted, pulled-in eye measured against the room's swept rays.
 */
export const C4_VIEW_LINE_PLACEHOLDER = C4_LOOK_EPSILON;
/**
 * LATER 305 (research 84 §19's ledger): how far a claimed eye may stand from the eye the room reproduces for a cell of the
 * target's uncertainty -- the original's pass (`cameraPass`, `FUN_0029bf70`, the very function the page runs, at its
 * defaults) from that cell's goal eye toward its moved target -- beyond the cell's own spread (its half-diagonal, added
 * where it is used), and still be that camera's eye: 0.1 u, float residue between the page's and the room's arithmetic.
 * The residual steer it leaves a forger (the gameplay seat's read): the look turns at most atan((0.1 + half) / the eye's
 * distance to the moved target) -- about 1.6 degrees at 28 u with a 1 u cell, more on a close pull-in -- against LATER
 * 305's probe's 5-60 degrees before. What settles it: honest page eyes over a drifting clip, a peek and the posed root,
 * measured against the room's -- and the pass is not continuous across a cell (a wall's pull-in starting inside one can
 * put an honest eye at its edge past this of the eye reproduced at its middle: that claim gets the floor's verdict, so
 * honest view-line acceptances lost there are the cost to measure).
 */
export const VIEW_EYE_REPRO_PLACEHOLDER = 0.1;
/**
 * LATER 305 (`VIEW_PASS_CAP_ADAPTATION`; a server budget, no original: the console reproduces nothing): the most passes
 * (`cameraPass`) one claim's view-line rule runs, the cells taken nearest the nominal state first; past it the claim has
 * the far-point rule's verdict alone. Measured (a scratch probe, 2026-10-22): uncapped, a flood of near-miss claims that
 * pass the cheap bound at -70, prone just after a stance change (rootSlack 13.3, the lead on), cost 0.63 ms a claim --
 * 25 ms of the room's time a second for one connection at the text rate's cap (40 a second); capped at 24 (with the sweep
 * stopping once the budget is spent), 0.13-0.15 ms a claim -- about 6 ms a second per connection at that cap; an honest
 * claim 0.005-0.012 ms, against main's far-point check's 0.007.
 */
export const VIEW_PASS_CAP_ADAPTATION = 24;
/**
 * One command's time, seconds: the 60 Hz transport (`TICK_HZ`; PF.R8 keeps it, research 208 §2). The look's rate is its
 * change over this; `Accuracy.update` runs it continuously, as the page's frames are (MISSION R8).
 */
const COMMAND_DT = 1 / TICK_HZ;
/** Commands of history kept (a round may arrive after its command has run). */
const RING = 64;
const DEG = Math.PI / 180;

/**
 * CONE_SCOPE_LEVEL_READING (LATER 476's review, F1): the room's cone takes the look scale `lookScaleOf` gives the command
 * -- the scope bit and the binoculars bit, never the scope's level: the command carries no view state past 5, so a
 * scoped command is taken at the scope's LEAST magnification (`ZoomMode[1]`). On the M40A1's [1.5, 6, 12] at state 6
 * the page inverts 1/12 and the room 1/6: RECRUIT's full pitch push is 0.65 on the page, 0.325 in the room's cone.
 * Settled by the level on the wire, or the room tracking the zoom steps from the scope's own presses. P13 (the sweep's
 * AR-8): no verdict reads it while `CONE_SWAY_BOX_ADAPTATION` stands -- a scoped command's exertion feeds no check; it
 * goes live with that box's build (LATER 640), which settles it in the same change.
 */
export const CONE_SCOPE_LEVEL_READING = "the scope's least magnification: the command carries no level" as const;

/**
 * CONE_SWAY_BOX_ADAPTATION (P13, the online-parity sweep's AR-1; an adaptation -- the room's trust, no original: the game
 * has no server, research 91 §15): a scoped round's claim is checked against the whole box of the sway's limits, never the
 * sway's point. The page's scoped round leaves at the point (`FUN_005bd100` D:L474217-474226: radius 0, the offsets
 * `(-sway x, -sway y)`; research 84 §8), swinging inside +-`SniperDistLimit` x (0.8 x the exertion + 0.2, `Accuracy.swayLimit`) and divided by
 * the magnification (research 84 §17); the room's frame takes +-`SniperDistLimit` at the most exertion (`AimMover.sway`,
 * the exertion 1) at magnification 1 (`coneBox`), so a forged page may place a scoped round anywhere in that box -- at
 * least three times an honest round's reach at a 3x scope, and up to about eight at a low exertion (3 / 0.36: the sway
 * steps only while the exertion is over 0.2, `FUN_005b9280` D:L472139, so its limits never close below 0.36 of the
 * box). Honest play is untouched. Dead weight under it: the room's exertion, its
 * `enterView` at the scope's edge and the set-change raise move nothing the scoped check reads. The build (LATER 640):
 * the scoped claim against the sway's point over the window, plus or minus a named slack divided by `lookScaleOf`, bound
 * by honest rounds at 30, 60 and 144 page frames a second; with it the set-change raise and `enterRaises`, and
 * `CONE_SCOPE_LEVEL_READING` (the scope's level) goes live (AR-8). Research 91 §16.
 */
export const CONE_SWAY_BOX_ADAPTATION = 'the scoped claim inside the full sway limits at the most exertion, never the sway point' as const;

/** What the server's mover says about the body at a command (after it ran). */
export interface AimMover {
  feet: V3;
  velocity: V3;
  airborne: boolean;
  posture: Stance;
  /**
   * The raw stance, `FUN_0058a720(body, 0)` (`+0x174`, `Walker.stance`): the exertion's `SniperDecayRate` row
   * (`FUN_00550ef0` 418349; `AccuracyInput.rawStance`, m-3 of review 2) -- a crouch run decays at the crouch row while
   * its rounds read `posture`'s. Absent: `posture`.
   */
  stance?: Stance;
  /** The move's root (`Traversal.rootY`), or null: the stance's measured root stands in. */
  moveRoot: number | null;
  /** The peek value (`Traversal.peek`, -1 left .. 1 right). */
  peek: number;
  /**
   * PRONE-TILT-2 (2): the y of the body's saved floor normal after the command (`Walker.floorNormal`, `+0x1348`), the
   * prone eye's (`FUN_0029ae50` D:L142596; `../cameraRig` `proneEyeTerms`). Absent: flat, 1.
   */
  groundNormalY?: number;
  /** The firearm in hand (`MoverSim.weapon`: 0 the rifle, 1 the sidearm). */
  weapon: 0 | 1;
  /** The swap's clip plays after the command (`Walker.swapProgress() !== null`; the room's M-3 gate, review 3 B1). */
  swapping?: boolean;
  /**
   * PF-17 (PF.R36): the body's playing motion after the command (`./fireCapability` `motionOf`), or null. Absent: null.
   */
  motion?: PlayingMotion | null;
  /** PF-17 (PF.R36): whether a firearm's round may leave over it (`./fireCapability` `fireAllowed`). Absent: true. */
  fire?: boolean;
  /**
   * TURRET-CONE (research 215 s8.2): the stance row the cone runs at this command -- its bloom, its exertion's row, its
   * rounds' step and its slack -- in place of the body's: mounted, the turret record's `TURRET_RETICLE_STANCE_READING` row
   * ('stand', `../matchFirearm`), as the page's `gunFrame` runs the kit on the turret slot. The frame's `posture` stays the
   * body's for every other check. Absent: `posture` (and `stance` for the exertion).
   */
  coneStance?: Stance;
  /** LATER 107: the turret the body held after the command (`room.ts` `Player.mounted`), or null. Absent: none. */
  turret?: number | null;
  /** LATER 220: the walker's terms of the prompts' common gate after the command (`Walker.gateTop`). Absent: none. */
  gate?: GateTop | null;
  /**
   * LATER 476: the command's look scale (`./lookGate` `lookScaleOf`: the binoculars' 0.133, a scope's 1 / its least zoom,
   * else 1), which the exertion's pitch throttle inverts as the page's does (`../look` `pitchStickInView`; `FUN_005be660`
   * D:L453807-453812, the 0.2 at D:L453813-453816). Absent: 1. The room's is the command's (`CONE_SCOPE_LEVEL_READING`).
   */
  lookScale?: number;
}

/** One command as the cone saw it. */
export interface AimFrame {
  seq: number;
  /** The command's place in the player's own clock: commands run (what the fire rate and the reload lock count). */
  count: number;
  yaw: number; pitch: number;
  feet: V3;
  velocity: V3;
  /**
   * In the air after the command (`AimMover.airborne`, the body's `+0x105e` bit 5): the reload refuses it (m-7 of
   * review 2, `FUN_005c2a90` 477392-477394).
   */
  airborne: boolean;
  posture: Stance;
  moveRoot: number | null;
  peek: number;
  /** PRONE-TILT-2 (2): the y of the body's saved floor normal after the command (`AimMover.groundNormalY`). Absent: 1. */
  groundNormalY?: number;
  weapon: 0 | 1;
  /**
   * The swap's clip plays after the command (`AimMover.swapping`): a round or a reload at it is refused (M-3 of review
   * 2, `FUN_005a7de0` 452383; review 3 B1: the walker's clip, the one the page's kit reads, not a count).
   */
  swapping: boolean;
  /**
   * PF-17 (ruling PF.R36; research 194 A02, 218 s1): the body's playing motion after the command -- its clip, phase and
   * direction (`AimMover.motion`) -- and whether a firearm's round may leave over it (`FUN_005a7de0`'s phase test
   * against the clip's `NoFire`). The room refuses a round `'nofire'` against the frame of the command it names, never
   * the body's present.
   */
  motion: PlayingMotion | null;
  fire: boolean;
  /** TURRET-CONE: the stance row the cone ran at this command (`AimMover.coneStance`, else the posture). Absent: the posture. */
  coneStance?: Stance;
  /** LATER 107: the turret held after this command (`AimMover.turret`), or null: the hand's round at it (`room.ts` `fire`). */
  turret?: number | null;
  /** LATER 220: the walker's terms of the prompts' common gate after this command (`AimMover.gate`), or null. */
  gate?: GateTop | null;
  /** `Button.Aim`: the scope's view -- the eye is the head. */
  lens: boolean;
  /** `Button.Scope`: view state 4 and up -- the cone is the sway's point (`Accuracy.cone`). */
  scoped: boolean;
  /** `Button.Binoculars`: view state 4 -- no round leaves (`FUN_005be9a0` 475305). */
  binoculars?: boolean;
  /** The cone at this command, magnification 1 (a zoom only divides the offsets: `Accuracy.cone`). */
  cone: Cone;
  /** The scope's sway limits as tangents, at the most exertion (`Accuracy.swayLimit` x `tangentPerPixel`). */
  sway: [number, number];
  /** The root's uncertainty at this command (units). */
  rootSlack: number;
}

/** What a round claims: where its eye's ray left from and along what, and the round's own segment. */
export interface ShotClaim { eye: readonly number[]; aim: readonly number[]; from: readonly number[]; dir: readonly number[] }

export type ShotVerdict = null | 'stale' | 'eye' | 'cone' | 'bind';

// ---- small vectors ----
const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const add = (a: readonly number[], b: readonly number[]): V3 => [a[0]! + b[0]!, a[1]! + b[1]!, a[2]! + b[2]!];
const scale = (a: readonly number[], k: number): V3 => [a[0]! * k, a[1]! * k, a[2]! * k];
const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const cross = (a: readonly number[], b: readonly number[]): V3 =>
  [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const len = (a: readonly number[]): number => Math.hypot(a[0]!, a[1]!, a[2]!);
const unit = (a: readonly number[]): V3 => { const l = len(a); return l > 0 ? scale(a, 1 / l) : [0, 0, 0]; };
const lerp = (a: readonly number[], b: readonly number[], t: number): V3 =>
  [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t];

/** The camera's line for a frame (`ShotCone.rig`): the look-at target, the goal eye, the far point and the lead. */
function rigOf(f: AimFrame): { target: V3; eye: V3; far: V3; lead: number } {
  const root = f.moveRoot ?? rootY(f.posture);
  const local = localCamera(root, f.pitch, f.peek);
  const target = toWorld(f.feet, f.yaw, local.target);
  const eye = toWorld(f.feet, f.yaw, local.eye);
  const far = toWorld(f.feet, f.yaw, add(local.target, scale(local.ahead, CAM_FAR)));
  return { target, eye, far, lead: Math.abs(local.target[2]) };
}

/** LATER 139: the distance from `p` to the segment `a`-`b`, both seen along `dir` (a unit vector): across the look. */
function acrossLook(p: readonly number[], a: readonly number[], b: readonly number[], dir: readonly number[]): number {
  const flat = (v: readonly number[]): V3 => sub(v, scale(dir, dot(v, dir)));
  return pointSegment(flat(sub(p, a)), [0, 0, 0], flat(sub(b, a)));
}

/**
 * LATER 139 (the merge controller's approved plan, 2026-10-21; its review's corrections): whether `point` lies on an aim
 * line THE PAGE's camera of `blend` (a command's frames, `ShotCone.framesAround`) could have cast. The page's pass pulls
 * the eye in along the target-to-eye axis and shifts it by its side probes, and the page casts from that eye toward the
 * far point 1000 out (`walk.ts` `fireAim`), so every honest line of the page runs along the look through a point of the
 * locus `eyeFitsOrder` sweeps (the blends of neighbouring frames, the root over +-`rootSlack`, the lead probe over
 * 0..`LEAD_DOWN` back along the facing). The point counts when, seen along the look, it lies within
 * `C4_LOOK_BOUND_PLACEHOLDER` of one swept segment from the look-at target to `CAM_MARGIN` past the goal eye, ahead of
 * that segment's back end. The original aims toward the moved target instead (`FUN_0029bc90`, `FUN_005aa6e0`): LATER
 * 305. Only the third-person camera's locus counts (the review's F2): the head's own line is `c4Line`'s to judge.
 *
 * LATER 305 (the merge controller's option (i), 2026-10-22; reading, pending review): with `eye` -- the page's own eye
 * the event carried (`throw`'s and `action`'s optional `eye`), which the CALLER has already held to the camera's locus
 * (`ShotCone.eyeOnFrames` on the frames about the command, and no wall between the head and it: `room.ts` `pageEye`), never a
 * raw page value -- the line is the original's: from that eye through the frame's moved target (`viewLineFits`, the
 * round's sweep), and the point counts within `C4_VIEW_LINE_PLACEHOLDER` of it. Without an eye (a page before LATER 305,
 * the 99 s fallback's start) the swept-segment rule above, unchanged. The eye counts only where the room reproduces it
 * (`viewLineFits`: the original's pass on `grid`), so a forged eye beside the target steers nothing.
 */
export function lookFitsPoint(blend: readonly AimFrame[], point: readonly number[], eye?: readonly number[], grid?: Grid | null): boolean {
  if (eye) {
    // The eye counts only as an eye the room reproduces (`viewLineFits`), which needs the hull: none, no line.
    const ray = sub(point, eye), d = len(ray), flat = Math.hypot(ray[0], ray[2]) / (d || 1);
    if (!(d > 0) || !grid) return false;
    // A distance across the ray at the point, in the tangents `coneCoords` gives (its axes cos(pitch) long).
    const tol = C4_VIEW_LINE_PLACEHOLDER / (d * Math.max(flat, 0.05));
    return viewLineFits(blend, eye, ray, [-tol, tol, -tol, tol], grid);
  }
  const pairs = blend.length === 1 ? [[blend[0]!, blend[0]!]] : blend.slice(1).map((b, i) => [blend[i]!, b]);
  for (const [a, b] of pairs as [AimFrame, AimFrame][]) {
    const slack = Math.ceil(Math.max(a.rootSlack, b.rootSlack));
    const rootA = a.moveRoot ?? rootY(a.posture), rootB = b.moveRoot ?? rootY(b.posture);
    const ra = rigOf(a), rb = rigOf(b);
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const target = lerp(ra.target, rb.target, t), goal = lerp(ra.eye, rb.eye, t), dir = unit(sub(lerp(ra.far, rb.far, t), target));
      const past = add(goal, scale(unit(sub(goal, target)), CAM_MARGIN));
      const leadMax = Math.max(ra.lead, rb.lead) > Math.abs(LEAD_PROBE) ? Math.abs(LEAD_DOWN) : 0;
      const yaw = a.yaw + shortTurn(a.yaw, b.yaw) * t;
      const back = unit(sub(toWorld([0, 0, 0], yaw, [0, 0, 1]), [0, 0, 0]));   // the body's flat backward axis
      for (let r = -slack; r <= slack; r++) {
        const dy = (lookHeight(rootA + r) - lookHeight(rootA)) * (1 - t) + (lookHeight(rootB + r) - lookHeight(rootB)) * t;
        for (let s = 0; s <= leadMax; s++) {
          const dt: V3 = [back[0] * s, dy, back[2] * s];
          const near = add(target, dt), end = add(past, dt);
          if (dot(sub(point, end), dir) > 0 && acrossLook(point, near, end, dir) <= C4_LOOK_BOUND_PLACEHOLDER) return true;
        }
      }
    }
  }
  return false;
}

/** The distance from `p` to the segment `a`-`b`. */
export function pointSegment(p: readonly number[], a: readonly number[], b: readonly number[]): number {
  const ab = sub(b, a), l2 = dot(ab, ab);
  const t = l2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2)) : 0;
  return len(sub(p, add(a, scale(ab, t))));
}

/** The pitched straight ahead in the world, for a look in degrees (`localCamera`'s `ahead` turned by the yaw). */
export function aheadOf(yaw: number, pitch: number): V3 {
  const p = pitch * DEG;
  return toWorld([0, 0, 0], yaw, [0, Math.sin(p), -Math.cos(p)]);
}

/**
 * `perturb` inverted: the tangents `(a, b)` a ray stands at about `look` in `FUN_00592260`'s own axes (right =
 * look x (0, 1, 0), up = right x look, both cos(pitch) long), so `perturb(look, {offsetX: a, offsetY: b, radius: 0})`
 * points along `ray`. Null when the ray is not ahead of the look, or the look is vertical (no axes).
 */
export function coneCoords(look: readonly number[], ray: readonly number[]): [number, number] | null {
  const l = unit(look);
  const right: V3 = [-l[2], 0, l[0]];
  const up = cross(right, l);
  const r2 = dot(right, right);
  const d = dot(ray, l);
  if (!(d > 0) || r2 < 1e-12) return null;
  const v = scale(ray, 1 / d);
  return [dot(v, right) / r2, dot(v, up) / r2];
}

/**
 * SEC-F1 (OT.R98 step 1; product track: a detection statistic with no original -- it decides nothing and changes no
 * game value): a round's offset from its cone's centre as a fraction of the cone's half side -- the Chebyshev distance
 * of its tangents `ab` (`coneCoords`) from the cone's offset, over the radius, held at 1 past the edge: 0 the centre, 1
 * the square's edge (`ShotCone.check`'s box is that square). Null for no cone to measure in (the scope's radius 0).
 * The page's sample is `perturb`'s (`FUN_005bd100` / `FUN_00592260` as `../accuracy` transcribes them): each axis
 * `offset + radius x u|u|`, `u` uniform in [-1, 1), so this reads max(|u1|, |u2|)^2 -- its mean 1/2
 * (`HONEST_CENTRING_MEAN`), a tenth of it under 0.1 -- where a page that sends the centre reads 0.
 */
export function centringOf(ab: readonly [number, number], cone: Cone): number | null {
  if (!(cone.radius > 0)) return null;
  return Math.min(1, Math.max(Math.abs(ab[0] - cone.offsetX), Math.abs(ab[1] - cone.offsetY)) / cone.radius);
}
/**
 * SEC-F1: the mean of `centringOf` over the page's own sample: with M = max(|u1|, |u2|), P(M <= m) = m^2, so
 * E[M^2] = integral of m^2 x 2m dm over [0, 1] = 1/2 (its standard deviation sqrt(1/3 - 1/4) = 0.289). Arithmetic on the
 * transcription, not a measurement of pages running (`ShotCone.centring` says how the room's cone stands off the page's).
 */
export const HONEST_CENTRING_MEAN = 0.5;

/** The part of [0, 1] where `x0 + t (x1 - x0)` lies in [lo, hi]. */
function span(x0: number, x1: number, lo: number, hi: number): [number, number] {
  const d = x1 - x0;
  if (Math.abs(d) < 1e-15) return x0 >= lo && x0 <= hi ? [0, 1] : [1, 0];
  let a = (lo - x0) / d, b = (hi - x0) / d;
  if (a > b) [a, b] = [b, a];
  return [Math.max(0, a), Math.min(1, b)];
}

/**
 * Whether the round's segment (`from` along `dir`) passes through the eye's ray (`eye` along `aim`) at a point ahead of
 * both: the page aims the muzzle at the point the eye's ray meets, or fires from the eye along it.
 */
export function bound(claim: ShotClaim, eps = BIND_EPSILON): boolean {
  const d1 = unit(claim.dir), d2 = unit(claim.aim);
  const w = sub(claim.from, claim.eye);
  const n = cross(d1, d2), nn = dot(n, n);
  if (nn < 1e-18) return len(cross(w, d2)) <= eps;                 // parallel: the same line or none
  // The closest points: from + s d1 and eye + t d2.
  const b = dot(d1, d2), dd = dot(d1, w), e = dot(d2, w);
  const den = 1 - b * b;
  const s = (b * e - dd) / den, t = (e - b * dd) / den;
  if (s < -eps || t < -eps) return false;
  return len(sub(add(claim.from, scale(d1, s)), add(claim.eye, scale(d2, t)))) <= eps;
}

/**
 * LATER 178: one command as the cone ran it -- the record it ran under, its trigger and scope edges, its `Accuracy` input,
 * the kit's state after it, and the rounds bloomed while it was the newest command -- so a round can be bloomed at its
 * own command and the commands since run again (`ShotCone.round`).
 */
interface ConeRun {
  seq: number;
  weapon: WeaponRecord;
  trigger: boolean;
  scope: 'enter' | 'leave' | null;
  input: AccuracyInput;
  after: AccuracySave;
  rounds: { weapon: WeaponRecord; zoom: number; stance: WeaponStanceName }[];
  /**
   * LATER 233: a round named on this command dropped the scope (`Accuracy.round`'s `dropZoom`: a pull's second round or
   * later in a scope, `FUN_005c5340` D:L479399-479404), so the Scope bit gone on the next command is that drop -- the set
   * alone, no `FUN_005b9020` -- and takes no leave.
   */
  dropped: boolean;
}

/** One player's cone on the server: the page's `Accuracy`, fed from the commands. */
export class ShotCone {
  private readonly acc: Accuracy;
  private weapon: WeaponRecord;
  private readonly frames: AimFrame[] = [];
  /** LATER 178: the commands as the cone ran them, beside `frames` (the same seqs, the same length). */
  private readonly runs: ConeRun[] = [];
  private last: { yaw: number; pitch: number } | null = null;
  private trigger = false;
  private scoped = false;
  private posture: Stance | null = null;
  private changed = { at: -Infinity, span: 0, ticks: 0 };
  /** LATER 305: the map's hull the room reproduces a claimed eye on (`aimFits`); null, the far-point rule alone. */
  private grid: Grid | null = null;

  constructor(weapon: WeaponRecord) {
    this.weapon = weapon;
    this.acc = new Accuracy(weapon);
  }

  /**
   * The firearm changed (a swap on the server's mover, at its press; a pickup into the seat's slot): its own record, the
   * kit's state carried -- the size, the knock, the sway, the pull -- as the client's cone carries it (`Accuracy.setWeapon`;
   * research 321 section 7.1's C3-room, NU-3a). Was: "its own record, at rest (`Accuracy.setWeapon`, as the page's `kit`)".
   */
  setWeapon(weapon: WeaponRecord): void {
    if (weapon === this.weapon) return;
    this.weapon = weapon;
    this.acc.setWeapon(weapon);
  }

  /**
   * LATER 305: the hull for the view-line rule (`aimFits`) -- the room's, as it stands when the claim is judged. A hull
   * that has moved since the claim was made (a door, #337's cranes) can only send that claim to the far-point rule: the
   * eye it reproduces is a real camera's on the hull as it stands, never one a page chose.
   */
  setGrid(grid: Grid | null): void {
    this.grid = grid;
  }

  /** A new life: at rest, no history. */
  reset(): void {
    this.acc.reset();
    this.frames.length = 0;
    this.runs.length = 0;
    this.last = null;
    this.trigger = false;
    this.scoped = false;
    this.posture = null;
    this.changed = { at: -Infinity, span: 0, ticks: 0 };
  }

  /**
   * One command run on the server's mover: the page's `gunFrame` inputs from it (`./main`: the stance, the velocity and
   * the air from the mover; the turn and pitch rates from the look's change; the exertion's throttles from the stick,
   * slowed x 0.2 scoped, and the rates), the trigger's edges (`FUN_005c0ae0`: the pull's count starts again) and the
   * scope's (`FUN_005b9180` on entering, `FUN_005b9020` on leaving), then `COMMAND_DT` of `Accuracy`, continuously
   * (MISSION R8), as the page's own frames run it. LATER 168: a scope left by the mount -- the first command with a turret
   * held (`AimMover.turret`) after one without, whose Scope the room strips (`room.ts` `onTurret`) -- clears no knock: the
   * mount `FUN_005463c0` (D:L412247-412255) and the set `FUN_005448a0` (D:L410927-411019) call no `FUN_005b9020`, only
   * d-pad Down's 4 or 5 -> 1 does (D:L410660, D:L410682), as the page's `syncMount` keeps it. LATER 233: nor does a scope
   * left on the command after one a dropping round was named on (`ConeRun.dropped`: `FUN_005c5340` D:L479399-479404 sets
   * 1 alone), as the page's `dropScope` keeps it; a round that reaches the room after that command undoes its leave
   * (`round` -> `replay`).
   */
  tick(cmd: Command, m: AimMover, count: number): void {
    const b = cmd.buttons;
    const trigger = (b & Button.Trigger) !== 0, scoped = (b & Button.Scope) !== 0, lens = (b & Button.Aim) !== 0;
    const edge = trigger !== this.trigger;
    if (edge) { this.trigger = trigger; this.acc.trigger(); }
    const mounting = (m.turret ?? null) !== null && (this.frames[this.frames.length - 1]?.turret ?? null) === null;
    const dropped = this.runs[this.runs.length - 1]?.dropped ?? false;     // LATER 233: the command before's round dropped it
    let scope: ConeRun['scope'] = null;
    if (scoped !== this.scoped) {
      this.scoped = scoped;
      if (scoped) { this.acc.enterView(0, 4); scope = 'enter'; }
      else if (!mounting && !dropped) { this.acc.leaveScope(); scope = 'leave'; }
    }
    // The page's one placement rule (`lookRates`, LOOK_JUMP_READING): a look jump that large in a tick is no turn.
    const { yawRate, pitchRate } = this.last
      ? lookRates(shortTurn(this.last.yaw, cmd.yaw), cmd.pitch - this.last.pitch, COMMAND_DT)
      : { yawRate: 0, pitchRate: 0 };
    this.last = { yaw: cmd.yaw, pitch: cmd.pitch };
    const slow = scoped ? SCOPED_STICK : 1;
    const row = m.coneStance ?? m.posture;                         // TURRET-CONE: mounted, the turret record's row
    const input: AccuracyInput = {
      stance: row, rawStance: m.coneStance ?? m.stance ?? m.posture, velocity: m.velocity, airborne: m.airborne, yawRate, pitchRate, zoomState: scoped ? 5 : 0,
      sticks: {
        forward: cmd.forward * slow, right: cmd.right * slow,
        turn: yawRate / SEAL_TUNING.turnMaxRate, pitch: pitchStickOf(pitchRate, 1 / (m.lookScale ?? 1)),   // LATER 351, 476
      },
    };
    this.acc.update(COMMAND_DT, input);
    if (this.posture !== null && m.posture !== this.posture) {
      this.changed = { at: count, span: Math.abs(rootY(m.posture) - rootY(this.posture)), ticks: stanceChangeTicks(this.posture, m.posture) };
    }
    this.posture = m.posture;
    const t = tangentPerPixel();
    const limit = this.weapon.stances[row];
    this.frames.push({
      seq: cmd.seq, count, yaw: cmd.yaw, pitch: cmd.pitch, feet: [...m.feet], velocity: [...m.velocity], airborne: m.airborne, posture: m.posture,
      moveRoot: m.moveRoot, peek: m.peek, groundNormalY: m.groundNormalY ?? 1, weapon: m.weapon, swapping: m.swapping ?? false, motion: m.motion ?? null, fire: m.fire ?? true, coneStance: row, turret: m.turret ?? null, gate: m.gate ?? null,
      lens, scoped, binoculars: (b & Button.Binoculars) !== 0, cone: this.acc.cone(scoped ? 5 : 0, 1), sway: [limit.swayLimitX * t.x, limit.swayLimitY * t.y],
      rootSlack: ROOT_POSE_SLACK_PLACEHOLDER + (count - this.changed.at <= this.changed.ticks ? this.changed.span : 0),
    });
    if (this.frames.length > RING) this.frames.shift();
    this.runs.push({ seq: cmd.seq, weapon: this.weapon, trigger: edge, scope, input, after: this.acc.save(), rounds: [], dropped: false });
    if (this.runs.length > RING) this.runs.shift();
  }

  /** LATER 135: the newest frame in the history -- the body the room last ran -- or undefined (a pickup at a dropped command). */
  latest(): AimFrame | undefined { return this.frames[this.frames.length - 1]; }

  /**
   * LATER 139: the frames before, at and after command `seq` (the blend `eyeAt` sweeps); the newest alone when `seq` has
   * left the history, as `room.ts` `orderOrigin` falls back to it; none before any command.
   */
  framesAround(seq: number): AimFrame[] {
    const at = this.frames.findIndex((f) => f.seq === seq);
    if (at < 0) { const l = this.latest(); return l ? [l] : []; }
    return this.frames.slice(Math.max(0, at - 1), at + 2);
  }

  /**
   * PLANT-AIM (the review's F1): the far point of command `seq`'s look -- the camera rig's (`rigOf`: the look-at target
   * plus the look `CAM_FAR` out), the line `room.ts` `plantAimSees` re-picks along from its eye; undefined before any
   * command, the newest frame's when `seq` has left the history (as `framesAround`).
   */
  lookFar(seq: number): V3 | undefined {
    const f = this.frame(seq) ?? this.latest();
    return f ? rigOf(f).far : undefined;
  }

  /** LATER 139: whether `point` lies on a look of the camera's locus around command `seq` (`lookFitsPoint`). */
  lookAt(seq: number, point: readonly number[]): boolean {
    const blend = this.framesAround(seq);
    return blend.length > 0 && lookFitsPoint(blend, point);
  }

  /** The frame of a command still in the history. */
  frame(seq: number): AimFrame | undefined {
    for (let i = this.frames.length - 1; i >= 0; i--) if (this.frames[i]!.seq === seq) return this.frames[i];
    return undefined;
  }

  /**
   * A round the server took: the bloom, the knock and the pull's count, as the page's (`Accuracy.round`), at the row the
   * cone ran at that command (TURRET-CONE: mounted, the turret record's 'stand'; `FUN_005c3360` by `FUN_0058a720(body, 1)`).
   * LATER 178: a round named on a command run on another turret, or none, than a later command -- a mount or a release
   * run since, the round decided after it (`MOUNT_ROUND_AT_COMMAND_ADAPTATION`, `DISMOUNT_ROUND_AT_COMMAND_ADAPTATION`)
   * -- is bloomed at its own command by that command's record and the commands since are run again (`replay`): the order
   * the page ran them, its cone's frames re-recorded (since LATER 248, a swap run since too: LATER 210). Was: bloomed on the present
   * kit after them, by the record lent -- the turret's size clamped to the hand's `TargetMax` (the M9's 26 against the
   * PKM TURRET's 35), the knock's return three commands short, the commands run since without the round's bloom; an
   * honest turret round at the page's cone corner on the first command past the mount clip refused 'cone'.
   * LATER 233: a scoped round whose command is followed by a Scope leave already run -- the round reaching the room after
   * the command that shows its drop -- is bloomed at its own command too and the commands since run again, so a dropping
   * round (`ConeRun.dropped`) takes that leave back (`replay`); keyed on the round's own command, the same in either order.
   * LATER 248: any round with a command run since its own -- every round the room decides, which waits for the command
   * after (`room.ts` `due`) -- is bloomed at its own command and the commands since run again: the page ticks the cone
   * before the round (`matchFirearm.ts` `gunFrame`, then `fireFrame`), as `FUN_005c0fd0` runs the accuracy tick
   * `FUN_005c2670` (D:L476543) before the fire (D:L476624/476638), so the next command's tick follows the bloom. Was: an
   * ordinary round bloomed on the present kit, after the command since -- one tick off the page on every round. The
   * mount's, the release's and LATER 233's leave cases are all such rounds.
   */
  round(seq: number): void {
    const f = this.frame(seq) ?? this.frames[this.frames.length - 1];
    const zoom = f?.scoped ? 5 : 0, stance: WeaponStanceName = f?.coneStance ?? f?.posture ?? 'stand';
    const i = f ? this.runs.findIndex((r) => r.seq === f.seq) : -1, at = this.runs[i];
    const since = at !== undefined && i < this.runs.length - 1;       // LATER 248: a command run since the round's own
    if (at && since) {
      at.rounds.push({ weapon: at.weapon, zoom, stance });
      this.replay(i);
      return;
    }
    const out = this.acc.round(zoom, stance);
    this.runs[this.runs.length - 1]?.rounds.push({ weapon: this.weapon, zoom, stance });
    if (out.dropZoom && at) at.dropped = true;                       // LATER 233: on the round's own command
  }

  /**
   * LATER 178: the kit put back as it stood after command `runs[i]` ran, that command's rounds bloomed, then every command
   * since run again as it ran -- its record set (`Accuracy.setWeapon`, as the swap or the mount set it then), its edges,
   * its input -- its frame's cone re-recorded and its rounds bloomed by their own records; the record held now set last.
   * Its cost (the merge controller's condition 2): at most the commands still held after the round's (`RING` - 1); since
   * LATER 248 every round with a command run since its own -- the room's rounds, decided once the command after has run,
   * so one command in the ordinary case, a few behind a late page's -- and none for a round on the newest command
   * (`shotConeReplay.test.ts`). LATER 233: the round's own command marked
   * `dropped` when one of its rounds drops the scope, and a leave on the command after a dropped one taken back (recorded
   * as none, as `tick` records it).
   */
  private replay(i: number): void {
    const held = this.acc.save().weapon;
    for (let k = i; k < this.runs.length; k++) {
      const r = this.runs[k]!;
      if (k === i) this.acc.load(r.after);
      else {
        this.acc.setWeapon(r.weapon);
        if (r.trigger) this.acc.trigger();
        if (r.scope === 'leave' && this.runs[k - 1]!.dropped) r.scope = null;          // LATER 233: the drop's, no clear
        if (r.scope === 'enter') this.acc.enterView(0, 4); else if (r.scope === 'leave') this.acc.leaveScope();
        this.acc.update(COMMAND_DT, r.input);
        r.after = this.acc.save();
        const f = this.frames.find((x) => x.seq === r.seq);
        if (f) f.cone = this.acc.cone(f.scoped ? 5 : 0, 1);
      }
      for (const b of r.rounds) {
        const out = this.acc.round(b.zoom, b.stance, b.weapon);
        if (k === i && out.dropZoom) r.dropped = true;                                     // LATER 233
      }
    }
    this.acc.setWeapon(held);
  }

  /** The state, for the tests. */
  state(): ReturnType<Accuracy['state']> { return this.acc.state(); }

  /** Whether a round at command `seq` is one this player's cone allows (null) or why not. */
  check(seq: number, claim: ShotClaim): ShotVerdict {
    const at = this.frames.findIndex((f) => f.seq === seq);
    if (at < 0) return 'stale';
    const cur = this.frames[at]!;
    // The page draws between the tick before and this one, and its look may run up to the next tick.
    const blend = this.frames.slice(Math.max(0, at - 1), at + 2);
    if (!this.eyeFits(blend, claim.eye)) return 'eye';
    if (!this.aimFits(blend, cur, claim)) return 'cone';
    if (!bound(claim)) return 'bind';
    return null;
  }

  /**
   * SEC-F1 (OT.R98 step 1; product track, a statistic -- decides nothing): the claimed aim's offset from the centre of
   * the cone the room ran at command `seq` (`centringOf`), its tangents about that command's own look from the claimed
   * eye (`check`'s floor rule, `coords`) and against that command's own cone, before the round's bloom (`round` runs
   * after it). Null when the command is no longer held, the frame is scoped (no radius) or the aim is not ahead of the
   * look. Not the page's exact cone: the page's look may blend into the next tick's, its bloom runs on its frames and a
   * zoom divides its knock (`Accuracy.cone`'s `magnification`, the room's 1). A centre that stands off the page's moves
   * a centring page off 0 and, for a sample symmetric about its centre, raises an honest page's mean (the mean of a
   * convex, even function of the offset is least at none); a radius that stands off the page's scales the readings by
   * their ratio (the room's frame is the command's, a part-tick behind the page's at most: `coneSlackPx`).
   */
  centring(seq: number, claim: ShotClaim): number | null {
    const f = this.frame(seq);
    if (!f || f.scoped) return null;
    const c = this.coords(f, claim);
    return c ? centringOf(c.ab, f.cone) : null;
  }

  /**
   * TURRET-CONE (research 215 s8.2; `room.ts` `turretRound`): whether a mounted round's claimed `dir` lies inside this
   * player's cone about the gun's own line at command `seq` -- `line(frame)`, the room's `gunLine` at the frame's clamped
   * aim -- by `check`'s cone rule: the frames before, at and after it blended, the widest cone of the window
   * (`CONE_WINDOW_PLACEHOLDER`) with `coneSlackPx`'s slack. No eye and no bind: mounted, the kit's fire overwrites the
   * converged direction with the gun's line (`FUN_005be9a0` D:L475600) and rolls the cone on it (`FUN_00592260`,
   * D:L475601-475602), so the round leaves from the firepoint along that line, not down the eye's ray. TURRET-CONE's
   * re-review R1: the window takes no scoped frame -- no mounted command is scoped (the room strips Scope, `onTurret`; the
   * occupant never reaches view 4, `FUN_005445b0` D:L410791-410809), so a scoped frame is the rifle's before the mount,
   * whose sway box is no turret cone. Null: inside; 'stale': the command is not in the history; 'cone': outside (or behind
   * the gun).
   */
  checkLine(seq: number, dir: readonly number[], line: (f: AimFrame) => readonly number[]): null | 'stale' | 'cone' {
    const at = this.frames.findIndex((f) => f.seq === seq);
    if (at < 0) return 'stale';
    const blend = this.frames.slice(Math.max(0, at - 1), at + 2);
    const coords = (f: AimFrame): { ab: [number, number]; slack: number } | null => {
      const ab = coneCoords(line(f), dir);
      return ab && { ab, slack: 0 };
    };
    return this.coneFits(blend, this.frames[at]!, coords, true) ? null : 'cone';
  }

  /**
   * HX-OBEY (research 239 s9.3, `ORDER_EYE_TRUST_READING`): whether `eye` is one the page's camera could have had at command
   * `seq` -- the eye rule every round's claim passes (`check`'s `'eye'`): the frames before, at and after it, the scope's
   * head eye or the third-person line from the look-at target to the goal eye, with the pass's and the root's slack.
   * False for a command no longer in the history.
   */
  eyeAt(seq: number, eye: readonly number[]): boolean {
    const at = this.frames.findIndex((f) => f.seq === seq);
    return at >= 0 && this.eyeFitsOrder(this.frames.slice(Math.max(0, at - 1), at + 2), eye);
  }

  /**
   * LATER 305: `eyeAt`'s rule on frames the caller banked (`framesAround`) -- C4's plant start, whose command the history
   * (64 commands) no longer holds when the plant's throw (its clip ~66) arrives. False for no frames.
   */
  eyeOnFrames(frames: readonly AimFrame[], eye: readonly number[]): boolean {
    return frames.length > 0 && this.eyeFitsOrder([...frames], eye);
  }

  /**
   * SIMDROP-INSTR (an instrument with no original; it decides nothing -- `check` is unchanged): the point of the room's
   * eye locus at command `seq` nearest `eye`, and the distance between them, over `check`'s blend (the frames before, at
   * and after it) sampled as `eyeFits` samples it -- the head's eye where the pair's first frame looks through the lens,
   * else the third-person line from the look-at target to `CAM_MARGIN` past the goal eye -- without `eyeFits`'
   * tolerances (the root's slack, the pass's push, the lead). Null when the history no longer holds the command. A
   * `fire: cone: *` refusal's replay record reads it (`room.ts` `noteRefusal`).
   */
  eyeLocus(seq: number, eye: readonly number[]): { locus: V3; distance: number; lens: boolean } | null {
    const at = this.frames.findIndex((f) => f.seq === seq);
    if (at < 0) return null;
    const blend = this.frames.slice(Math.max(0, at - 1), at + 2);
    const pairs = blend.length === 1 ? [[blend[0]!, blend[0]!]] : blend.slice(1).map((b, i) => [blend[i]!, b]);
    let best: { locus: V3; distance: number; lens: boolean } | null = null;
    for (const [a, b] of pairs as [AimFrame, AimFrame][]) {
      for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        let point: V3;
        if (a.lens) point = lerp(this.head(a), this.head(b), t);
        else {
          const ra = this.rig(a), rb = this.rig(b);
          const target = lerp(ra.target, rb.target, t), goal = lerp(ra.eye, rb.eye, t);
          const past = add(goal, scale(unit(sub(goal, target)), CAM_MARGIN));
          const ab = sub(past, target), l2 = dot(ab, ab);
          point = add(target, scale(ab, l2 > 0 ? Math.max(0, Math.min(1, dot(sub(eye, target), ab) / l2)) : 0));
        }
        const distance = len(sub(eye, point));
        if (!best || distance < best.distance) best = { locus: point, distance, lens: a.lens };
      }
    }
    return best;
  }

  /**
   * The order's eye against the camera's real locus (`ORDER_EYE_TRUST_READING`; the review of f96db3ce: the round's
   * rule `eyeFits` spreads the root's 4 u and the lead's 0-8 u in every direction, 5-13 u wide, where the camera moves
   * only up with the root and only along its line with the lead). Either view counts (the head's eye is a camera of the
   * body's with or without the scope: `walk.ts` `follow`). Third person: for each blend of two neighbouring frames, the
   * locus is the segment from the look-at target to `CAM_MARGIN` past the goal eye (the pass pulls the eye in along it),
   * swept by the root over +-`rootSlack` (both ends up by what the look-at height moves: `lookHeight`, whose ramp
   * crouched runs 2.3 x the root, the review of 9cd2e1a0) and by the lead probe over 0..`LEAD_DOWN` back along the
   * body's flat facing -- BOTH ends: `playerCamera.ts` `tick` lays the eye at `targetL + back x dist`, so the led
   * target carries the eye back with it (`FUN_0029cbb0`) -- each in 1 u steps; the eye must lie within
   * `ORDER_EYE_BOUND` of one such segment. First person: within `rootSlack` of the head's eye (the round's rule).
   */
  private eyeFitsOrder(blend: AimFrame[], eye: readonly number[]): boolean {
    const pairs = blend.length === 1 ? [[blend[0]!, blend[0]!]] : blend.slice(1).map((b, i) => [blend[i]!, b]);
    for (const [a, b] of pairs as [AimFrame, AimFrame][]) {
      const slack = Math.ceil(Math.max(a.rootSlack, b.rootSlack));
      const rootA = a.moveRoot ?? rootY(a.posture), rootB = b.moveRoot ?? rootY(b.posture);
      for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        if (len(sub(eye, lerp(this.head(a), this.head(b), t))) <= Math.max(a.rootSlack, b.rootSlack) + BIND_EPSILON) return true;
        const ra = this.rig(a), rb = this.rig(b);
        const target = lerp(ra.target, rb.target, t), goal = lerp(ra.eye, rb.eye, t);
        const past = add(goal, scale(unit(sub(goal, target)), CAM_MARGIN));
        // The lead probe runs only looking down past `LEAD_PROBE` (the lead over 5): it moves the target, and the eye
        // with it, back toward the body along the flat facing by up to |LEAD_DOWN|.
        const leadMax = Math.max(ra.lead, rb.lead) > Math.abs(LEAD_PROBE) ? Math.abs(LEAD_DOWN) : 0;
        const yaw = a.yaw + shortTurn(a.yaw, b.yaw) * t;
        const back = unit(sub(toWorld([0, 0, 0], yaw, [0, 0, 1]), [0, 0, 0]));   // the body's flat backward axis
        for (let r = -slack; r <= slack; r++) {
          // The root moved by r: the whole rig rises by the look-at height's change (the ramp's, not r alone).
          const dy = (lookHeight(rootA + r) - lookHeight(rootA)) * (1 - t) + (lookHeight(rootB + r) - lookHeight(rootB)) * t;
          for (let s = 0; s <= leadMax; s++) {
            const dt: V3 = [back[0] * s, dy, back[2] * s];
            if (pointSegment(eye, add(target, dt), add(past, dt)) <= ORDER_EYE_BOUND) return true;
          }
        }
      }
    }
    return false;
  }

  // ---- the eye ----

  /** The camera's line for a frame: the look-at target, the goal eye (before the pass) and the lead, in the world. */
  private rig(f: AimFrame): { target: V3; eye: V3; far: V3; lead: number } {
    return rigOf(f);
  }

  /** The scope's eye for a frame (`headPoint`). */
  private head(f: AimFrame): V3 {
    return headPoint(f);
  }

  /** `anyView`: the head's eye and the third-person line both count, whatever the lens (an order's eye, `eyeAt`). */
  private eyeFits(blend: AimFrame[], eye: readonly number[], anyView = false): boolean {
    const pairs = blend.length === 1 ? [[blend[0]!, blend[0]!]] : blend.slice(1).map((b, i) => [blend[i]!, b]);
    for (const [a, b] of pairs as [AimFrame, AimFrame][]) {
      for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        if (a.lens || anyView) {
          if (len(sub(eye, lerp(this.head(a), this.head(b), t))) <= Math.max(a.rootSlack, b.rootSlack) + BIND_EPSILON) return true;
          if (!anyView) continue;
        }
        const ra = this.rig(a), rb = this.rig(b);
        const target = lerp(ra.target, rb.target, t), goal = lerp(ra.eye, rb.eye, t);
        // The pass reaches CAM_MARGIN past the goal; it pushes the eye at most CAM_MARGIN across and up (its four probes).
        const past = add(goal, scale(unit(sub(goal, target)), CAM_MARGIN));
        const tol = CAM_MARGIN * Math.SQRT2 + Math.max(a.rootSlack, b.rootSlack) + Math.max(ra.lead, rb.lead) + BIND_EPSILON;
        if (pointSegment(eye, target, past) <= tol) return true;
      }
    }
    return false;
  }

  // ---- the aim ----

  /**
   * The eye's ray against the cone (`check`'s `'cone'`). Today's rule first, the floor: the aim's tangents about the look
   * from the claimed eye toward the far point (`coords`). LATER 305 (reading, pending review): the page's third-person ray
   * runs from its eye through the moved look-at target (`FUN_005aa6e0` along the post-pass matrix, D:L142028; `walk.ts`
   * `follow`, `playerCamera.ts` `viewFar`), so a round the floor refuses still passes when it lies down that line from an
   * eye the room reproduces (`viewLineFits`: the original's pass on the hull, `cameraPass`, from each cell's goal eye) --
   * a union, never in place of the floor, so nothing today's rule takes is refused. The look's direction is the eye's
   * place (the eye toward the target): a merely bounded eye would let a forged one beside the target steer the round any
   * way (LATER 305's own probe: 5 to 60 degrees off the look, accepted, before this); a reproduced one is the camera's.
   * A page in the pass's hold or regrow (its eye not yet where the walls put it) gets the floor's verdict; no hull, the
   * floor alone. A turret's round is not this: `checkLine` casts along the gun's line.
   */
  private aimFits(blend: AimFrame[], cur: AimFrame, claim: ShotClaim): boolean {
    if (this.coneFits(blend, cur, (f) => this.coords(f, claim))) return true;
    if (!this.grid || blend.every((f) => f.lens)) return false;
    const box = this.coneBox(cur, false);
    return viewLineFits(blend, claim.eye, claim.aim, [box.loX - box.slack, box.hiX + box.slack, box.loY - box.slack, box.hiY + box.slack], this.grid);
  }

  /**
   * The cone rule `check` (the eye's ray) and `checkLine` (TURRET-CONE: the gun's line) share: the ray's tangents about each
   * frame's line (`coords`) must fall, for some blend of two neighbouring frames, inside the widest cone of the window
   * plus the slack and the line's own.
   */
  private coneFits(blend: AimFrame[], cur: AimFrame, coords: (f: AimFrame) => { ab: [number, number]; slack: number } | null, unscoped = false): boolean {
    const { loX, hiX, loY, hiY, slack } = this.coneBox(cur, unscoped);
    // The look may be any blend of two neighbouring frames': the tangents move (near enough) straight between theirs.
    const pairs = blend.length === 1 ? [[blend[0]!, blend[0]!]] : blend.slice(1).map((b, i) => [blend[i]!, b]);
    for (const [a, b] of pairs) {
      const ca = coords(a!), cb = coords(b!);
      if (!ca || !cb) continue;
      const tol = slack + Math.max(ca.slack, cb.slack);
      const sx = span(ca.ab[0], cb.ab[0], loX - tol, hiX + tol), sy = span(ca.ab[1], cb.ab[1], loY - tol, hiY + tol);
      if (Math.max(sx[0], sy[0]) <= Math.min(sx[1], sy[1])) return true;
    }
    return false;
  }

  /** The widest cone of the window about `cur` (tangents) and the slack's tangent (`coneFits`, `aimFits`). */
  private coneBox(cur: AimFrame, unscoped: boolean): { loX: number; hiX: number; loY: number; hiY: number; slack: number } {
    // The cone the page may have had: every frame of the window, its offset (a zoom divides it toward 0) and radius.
    // `unscoped` (`checkLine`, TURRET-CONE's re-review R1): a scoped frame is skipped -- the rifle's, before the mount.
    let loX = 0, hiX = 0, loY = 0, hiY = 0, slackPx = CONE_SLACK_PX_PLACEHOLDER;
    for (const f of this.frames) {
      if (f.seq > cur.seq || f.seq < cur.seq - CONE_WINDOW_PLACEHOLDER) continue;
      if (unscoped && f.scoped) continue;
      slackPx = Math.max(slackPx, coneSlackPx(this.weapon.stances[f.coneStance ?? f.posture]));
      if (f.scoped) {
        loX = Math.min(loX, -f.sway[0]); hiX = Math.max(hiX, f.sway[0]);
        loY = Math.min(loY, -f.sway[1]); hiY = Math.max(hiY, f.sway[1]);
      } else {
        const { offsetX: x, offsetY: y, radius: r } = f.cone;
        loX = Math.min(loX, x - r); hiX = Math.max(hiX, x + r);
        loY = Math.min(loY, y - r); hiY = Math.max(hiY, y + r);
      }
    }
    const t = tangentPerPixel();
    return { loX, hiX, loY, hiY, slack: slackPx * Math.max(t.x, t.y) };
  }

  /** The aim's tangents about a frame's look from the claimed eye, and that look's own slack (tangent): the floor's rule. */
  private coords(f: AimFrame, claim: ShotClaim): { ab: [number, number]; slack: number } | null {
    if (f.lens) {
      const ab = coneCoords(aheadOf(f.yaw, f.pitch), claim.aim);
      return ab && { ab, slack: 0 };
    }
    const r = this.rig(f);
    const ab = coneCoords(sub(r.far, claim.eye), claim.aim);
    // The far point stands off the server's by the root's and the lead's uncertainty, seen from ~CAM_FAR away.
    return ab && { ab, slack: (f.rootSlack + r.lead) / (CAM_FAR - CAM_BACK - CAM_MARGIN) };
  }
}

/**
 * LATER 305: the view-line sweep `ShotCone.aimFits` and `lookFitsPoint` share -- whether, for some blend of two
 * neighbouring frames of `blend` and some cell of the target's uncertainty, the tangents of `aim` about the looks from
 * `eye` toward the cell's corners (a convex hull: `viewCells`) meet `box` ([x0, x1, y0, y1], tangents) where `eye` is the
 * eye the room reproduces for that cell in either frame (`viewCells`: the original's pass on `grid`). The cells: the
 * nominal state's own (the root and the lead as the room has them, a point) and the 1 u cells of the root's slack and
 * the lead's run, tried nominal first and then nearest it, until `cap` passes (`VIEW_PASS_CAP_ADAPTATION`) are spent.
 */
export function viewLineFits(blend: readonly AimFrame[], eye: readonly number[], aim: readonly number[], box: readonly [number, number, number, number], grid: Grid, cap = VIEW_PASS_CAP_ADAPTATION): boolean {
  const meets = (pts: [number, number][]): boolean => hullMeetsBox(pts, box[0], box[1], box[2], box[3]);
  const pairs = blend.length === 1 ? [[blend[0]!, blend[0]!]] : blend.slice(1).map((b, i) => [blend[i]!, b]);
  const budget = { passes: cap };
  const swept = (pairs as [AimFrame, AimFrame][]).map(([a, b]) => ({ a, b, cellA: viewCells(a, eye, aim, grid, budget), cellB: viewCells(b, eye, aim, grid, budget) }));
  const tries = (cellA: ViewCells, cellB: ViewCells, r0: number, r1: number, s0: number, s1: number): boolean => {
    const ca = cellA(r0, r1, s0, s1), cb = cellB(r0, r1, s0, s1);
    if (!ca.eyeFits() && !cb.eyeFits()) return false;
    const pa = ca.ab(), pb = cb.ab();
    return pa !== null && pb !== null && meets([...pa, ...pb]);
  };
  // The nominal cell of every blend first (the gameplay seat's cheap path: it is the sweep's own first cell, so it
  // changes no verdict), then each blend's cells nearest it first, until the cap (`VIEW_PASS_CAP_ADAPTATION`).
  if (swept.some(({ cellA, cellB }) => tries(cellA, cellB, 0, 0, 0, 0))) return true;
  for (const { a, b, cellA, cellB } of swept) {
    const slack = Math.ceil(Math.max(a.rootSlack, b.rootSlack));
    const leadMax = Math.max(rigOf(a).lead, rigOf(b).lead) > Math.abs(LEAD_PROBE) ? Math.abs(LEAD_DOWN) : 0;
    const rs = slack > 0 ? Array.from({ length: 2 * slack }, (_, i) => [i - slack, i - slack + 1]) : [[0, 0]];
    const ss = leadMax > 0 ? Array.from({ length: leadMax }, (_, i) => [i, i + 1]) : [[0, 0]];
    const cells: [number, number, number, number][] = [];
    for (const [r0, r1] of rs as [number, number][]) for (const [s0, s1] of ss as [number, number][]) cells.push([r0, r1, s0, s1]);
    cells.sort((p, q) => Math.hypot(p[0] + p[1], p[2] + p[3]) - Math.hypot(q[0] + q[1], q[2] + q[3]));
    for (const [r0, r1, s0, s1] of cells) {
      if (budget.passes <= 0) return false;                                // spent: no cell left can reproduce the eye
      if (tries(cellA, cellB, r0, r1, s0, s1)) return true;
    }
  }
  return false;
}

/**
 * LATER 305: the eye the room reproduces for frame `f` with its target moved by `offset` (a cell's root and lead): the
 * original's pass (`cameraPass`, the page's own function at its defaults -- a fresh state takes the goal's distance at
 * once) from the goal eye toward the moved target on `grid`, on the surfaces the page's pass tests (the peek's own when
 * peeking, `playerCamera.ts` `tick`).
 */
export function reproducedEye(f: AimFrame, grid: Grid, offset: readonly number[] = [0, 0, 0]): V3 {
  const rig = rigOf(f);
  const moved = add(rig.eye, scale(unit(sub(rig.far, rig.eye)), len(sub(rig.eye, rig.target))));
  return cameraPass(grid, add(moved, offset), add(rig.eye, offset), newPassState(), undefined, f.peek !== 0 ? isPeekCameraSurface : isCameraClassSurface);
}

/** A frame's cells (`viewCells`): for the root over r0..r1 and the lead over s0..s1, the eye's fit and the corners' tangents. */
type ViewCells = (r0: number, r1: number, s0: number, s1: number) => { eyeFits(): boolean; ab(): [number, number][] | null };

/**
 * LATER 305: one frame's cells of the target's uncertainty (`viewLineFits`): for a cell (the root over r0..r1 -- its
 * `lookHeight` rise taken at its least and most over the cell -- and the lead over s0..s1), whether `eye` is the eye the
 * room reproduces there -- first within the cheap bound of the cell's camera line (`ORDER_EYE_BOUND` and the cell's
 * half-diagonal), then within `VIEW_EYE_REPRO_PLACEHOLDER` and the half-diagonal of the original's pass (`cameraPass`,
 * the page's own, at its defaults: a fresh state takes the goal's distance at once) from the cell's middle goal eye
 * toward its moved target on `grid` -- and the tangents of `aim` about the look from `eye` toward each corner of the
 * cell's target (null when a corner's look is not ahead of the ray), asked only for a cell kept. A head-view frame is its
 * one look in every cell.
 */
function viewCells(f: AimFrame, eye: readonly number[], aim: readonly number[], grid: Grid, budget: { passes: number }): ViewCells {
  if (f.lens) {
    const c = coneCoords(aheadOf(f.yaw, f.pitch), aim);
    return () => ({ eyeFits: () => true, ab: () => (c ? [c] : null) });
  }
  const rig = rigOf(f);
  // The look-at target the view passes through is the MOVED one: `FUN_00296f10` lays it on the goal eye's line to the
  // far point, `dist` (the goal eye's distance from the goal target) from the eye (`playerCamera.ts` `tick`); the pass
  // then moves only the eye. The root and the lead carry the goal eye, the target and the far point alike, so it too.
  const moved = add(rig.eye, scale(unit(sub(rig.far, rig.eye)), len(sub(rig.eye, rig.target))));
  const past = add(rig.eye, scale(unit(sub(rig.eye, rig.target)), CAM_MARGIN));
  const root = f.moveRoot ?? rootY(f.posture), base = lookHeight(root);
  const back = unit(toWorld([0, 0, 0], f.yaw, [0, 0, 1]));
  const at = (dy: number, s: number): V3 => [back[0] * s, dy, back[2] * s];
  const rises = new Map<number, [number, number]>();                     // a root cell's rise, once for all its lead cells
  return (r0, r1, s0, s1) => {
    let rise = rises.get(r0 * 1000 + r1);
    if (!rise) {
      let lo = Infinity, hi = -Infinity;
      for (let k = 0; k <= 4; k++) {
        const dy = lookHeight(root + r0 + ((r1 - r0) * k) / 4) - base;
        lo = Math.min(lo, dy); hi = Math.max(hi, dy);
      }
      rises.set(r0 * 1000 + r1, rise = [lo, hi]);
    }
    const [dyLo, dyHi] = rise;
    const mid = at((dyLo + dyHi) / 2, (s0 + s1) / 2), half = Math.hypot(dyHi - dyLo, s1 - s0) / 2;
    return {
      eyeFits: () => {
        if (pointSegment(eye, add(rig.target, mid), add(past, mid)) > ORDER_EYE_BOUND + half) return false;
        if (budget.passes <= 0) return false;                               // the claim's passes spent
        budget.passes--;
        return len(sub(eye, reproducedEye(f, grid, mid))) <= VIEW_EYE_REPRO_PLACEHOLDER + half;
      },
      ab: () => {
        const out: [number, number][] = [];
        for (const dy of [dyLo, dyHi]) {
          for (const s of [s0, s1]) {
            const c = coneCoords(sub(add(moved, at(dy, s)), eye), aim);
            if (!c) return null;
            out.push(c);
          }
        }
        return out;
      },
    };
  };
}

/**
 * LATER 305: whether the convex hull of `pts` (tangent pairs) meets the box [x0, x1] x [y0, y1] -- the separating axes
 * of a convex polygon and a box: the box's two and the hull's edge normals.
 */
export function hullMeetsBox(pts: readonly (readonly [number, number])[], x0: number, x1: number, y0: number, y1: number): boolean {
  if (pts.length === 0) return false;
  if (pts.every((p) => p[0] < x0) || pts.every((p) => p[0] > x1) || pts.every((p) => p[1] < y0) || pts.every((p) => p[1] > y1)) return false;
  if (pts.some((p) => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1)) return true;
  const hull = convexHull(pts);
  const box: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]!, b = hull[(i + 1) % hull.length]!;
    const n: [number, number] = [b[1] - a[1], a[0] - b[0]];
    if (n[0] === 0 && n[1] === 0) continue;
    const proj = (p: readonly [number, number]): number => p[0] * n[0] + p[1] * n[1];
    const hullLo = Math.min(...hull.map(proj)), hullHi = Math.max(...hull.map(proj));
    const boxLo = Math.min(...box.map(proj)), boxHi = Math.max(...box.map(proj));
    if (boxHi < hullLo || boxLo > hullHi) return false;
  }
  return true;
}

/** Andrew's monotone chain: the hull of `pts`, counter-clockwise, collinear points dropped (one or two points as given). */
function convexHull(pts: readonly (readonly [number, number])[]): (readonly [number, number])[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length <= 2) return p;
  const turn = (o: readonly number[], a: readonly number[], b: readonly number[]): number => (a[0]! - o[0]!) * (b[1]! - o[1]!) - (a[1]! - o[1]!) * (b[0]! - o[0]!);
  const lower: (readonly [number, number])[] = [], upper: (readonly [number, number])[] = [];
  for (const q of p) {
    while (lower.length >= 2 && turn(lower[lower.length - 2]!, lower[lower.length - 1]!, q) <= 0) lower.pop();
    lower.push(q);
  }
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && turn(upper[upper.length - 2]!, upper[upper.length - 1]!, q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * The scope's eye for a body: `FUN_0029ae50`'s eye (`scopeEye`, PF-05: the root + 4.4 and 2.5 ahead, prone 3.6 up and
 * 4.9 ahead) on the move's root or the stance's, shifted across by the peek -- the page's view from the head (`./walk`
 * `follow`, which stands it on the posed root: `ROOT_POSE_SLACK_PLACEHOLDER` covers the difference), the eye the cone
 * checks a scoped round's against, and the point the room measures every start from (SVC-23b: `room.ts`
 * `START_REACH_PLACEHOLDER`, research 169 §7 measure 5 (b)).
 */
export function headPoint(b: Pick<AimFrame, 'feet' | 'yaw' | 'posture' | 'moveRoot' | 'peek' | 'groundNormalY'>): V3 {
  return toWorld(b.feet, b.yaw, scopeEye(b.posture, b.moveRoot ?? rootY(b.posture), b.peek, proneEyeTerms(b.groundNormalY ?? 1)));
}

/** A body as the camera reads it: its feet, its look (degrees), its stance and the move's root, its peek. */
export interface CameraBody { feet: readonly number[]; yaw: number; pitch: number; posture: Stance; moveRoot?: number | null; peek?: number }

/**
 * The camera's eye and its look for a body with nothing behind it (no pass) -- the eye `FUN_0029a950` places and the line
 * to `FUN_00297410`'s far point: the centre of the cone a page with the camera in the open aims down (the load bots,
 * the tests).
 */
export function cameraLook(b: CameraBody): { eye: V3; look: V3 } {
  const local = localCamera(b.moveRoot ?? rootY(b.posture), b.pitch, b.peek ?? 0);
  const eye = toWorld(b.feet, b.yaw, local.eye);
  const far = toWorld(b.feet, b.yaw, add(local.target, scale(local.ahead, CAM_FAR)));
  return { eye, look: unit(sub(far, eye)) };
}

/** The yaw and pitch (degrees) whose `cameraLook` passes through `point`: a body turned to look at it. */
export function faceToward(b: Omit<CameraBody, 'yaw' | 'pitch'>, point: readonly number[]): { yaw: number; pitch: number } {
  const dx = point[0]! - b.feet[0]!, dz = point[2]! - b.feet[2]!;
  const yaw = wrapYaw(Math.atan2(-dx, -dz) / DEG);
  // Looking up lowers the eye and raises the look: the gap between the look and the line to the point falls with the
  // pitch, so halve the range on its sign.
  let lo = -89, hi = 89;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const { eye, look } = cameraLook({ ...b, yaw, pitch: mid });
    const u = unit(sub(point, eye));
    if (u[1] - look[1] > 0) lo = mid; else hi = mid;
  }
  return { yaw, pitch: (lo + hi) / 2 };
}

/**
 * A round down the cone's centre, as a page in the open sends it: the eye's ray from `cameraLook`, the round from
 * `from` (the muzzle) to the point `t` along that ray.
 */
export function centreClaim(b: CameraBody, from: readonly number[], t: number): ShotClaim & { eye: V3; aim: V3; from: V3; dir: V3 } {
  const { eye, look } = cameraLook(b);
  const point = add(eye, scale(look, t));
  return { eye, aim: look, from: [from[0]!, from[1]!, from[2]!], dir: unit(sub(point, from)) };
}

/** The look-at target's height the camera takes for a stance (`lookHeight` of the measured root), for the room's checks. */
export function targetHeight(posture: Stance, moveRoot: number | null = null): number {
  return lookHeight(moveRoot ?? rootY(posture));
}

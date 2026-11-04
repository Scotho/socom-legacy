import { SEAL_ANIMS } from './locomotion';
import type { Stance } from './mover';

/**
 * PRONE-TILT (socomlegacy/docs/research/217 section 7; reading, pending review): the skeleton root laid on the ground under
 * the feet -- the original's `FUN_00548090` (D:L413179-413287), run on every actor tick after the mover (`FUN_005506a0`
 * calls `FUN_005483d0` at D:L417825, then this at D:L417863). One rule, shared by the page's own body, the room's
 * bodies and the page's copies of the others (each from its own floor normal and its own tick):
 *
 * 1. A weight `w` from the top play's phase (`+0x1c`) across its motion's `Normalize` span `[A, B]` (the motion's
 *    `+0x24` / `+0x28`, loaded by `FUN_00287620` D:L131523-131584: `./motionTable` `MotionEntry.normalize`), A = B, A < B
 *    and A > B each its own branch (D:L413225-413255: `tiltWeight`). The dive (`DAT_003def08`, `seal_dive2prone`) takes
 *    0.5 / 0.9 instead (D:L413219-413223). In the air (`actor+0x105e` bit 5, the port's `Walker.airborne`) nothing is
 *    written unless the top play was pushed at posture word 8 (the dead), which takes 0.8 / 0.99 (D:L413208-413214).
 * 2. `w > 0`: the reference up (`DAT_003f64e0`, (0, 1, 0) in the original's RAM, research 215:864-870) lerped toward the
 *    floor hit's normal (`actor+0x410`: `FUN_005b0420` copies it at D:L467124-467134 when `FUN_0059acd0` answers 0 for
 *    the floor's owner, D:L467123, else keeps it, D:L467136-467140; research 217 s7.1) by `w` (`FUN_00308fc0`
 *    D:L207390-207417, a component-wise lerp, not normalised), then into the actor's frame by the inverse of its quaternion `+0x50`
 *    (D:L413256-413264: the port's yaw undone).
 * 3. Prone (`+0x174` 2) and neither `Crouch -> Prone` 0x13 nor `Stand -> Prone` 0x19 playing: a further lerp of 0.2 a
 *    call from the root's last up (`DAT_0066acd0`) toward it (D:L413265-413272); otherwise the vector as it is.
 * 4. The shortest-arc quaternion from the reference up to that vector (`FUN_00306d40` D:L206003-206095, at D:L413274)
 *    is written to the skeleton root's quaternion `*(actor+0x2e8)+0x20..+0x2c` and the root's matrix rebuilt
 *    (D:L413275-413282). No clamp, no dt: once a tick.
 *
 * What the rule leaves to the readings below: what the root's "last up" is (`PRONE_TILT_EASE_BASIS_READING`), what the
 * root holds on a tick the rule writes nothing (`ROOT_TILT_UNWRITTEN_READING`), whether the stand and crouch clips tilt
 * (`STAND_CROUCH_TILT_READING`) and whether the damage test reads the tilted body (`TILT_HIT_TEST_READING`).
 */

export type TiltVec = [number, number, number];
export type TiltQuat = [number, number, number, number];

/** `DAT_003f64e0`: the reference up, (0, 1, 0) as research 215:864-870 read it in the original's RAM (zero in the ELF). */
export const TILT_REFERENCE_UP: readonly [number, number, number] = Object.freeze([0, 1, 0]) as unknown as readonly [number, number, number];
/**
 * The settled prone body's ease, a call: `0x3e4ccccd` passed to `FUN_00308fc0` at D:L413267 -- a call once a 30 Hz game
 * frame (`./mover` `Walker.tiltClock`; proven by the EPH capture 2026-10-31, research 217 s7.11).
 */
export const PRONE_TILT_EASE = 0.2;
/** The dive's span over its phase, in place of the motion's (`FUN_00577e40(actor, DAT_003def08)`, D:L413219-413223). */
export const DIVE_TILT_WINDOW: readonly [number, number] = Object.freeze([0.5, 0.9]) as unknown as readonly [number, number];
/** In the air, a play pushed at posture word 8 (the dead): its span (D:L413208-413214); any other top writes nothing. */
export const DEAD_AIR_TILT_WINDOW: readonly [number, number] = Object.freeze([0.8, 0.99]) as unknown as readonly [number, number];
/** `Normalize` absent: `FUN_00287620` loads (1, 1) (D:L131523-131527) -- a weight past phase 1 only, so never. */
export const NORMALIZE_ABSENT: readonly [number, number] = Object.freeze([1, 1]) as unknown as readonly [number, number];

/** The readings' alternatives, each a named union: the constants below are typed by them (`as`, not narrowed), so
 * either branch of a switch type-checks. */
export type TiltEaseBasis = 'root-up' | 'world-up';
export type StandCrouchTilt = 'by-span' | 'never';
export type RootTiltUnwritten = 'clip' | 'held';
export type TiltHitTest = 'posed' | 'level';

/**
 * (a) What `DAT_0066acd0` holds when the settled prone body eases toward the ground: `FUN_005483d0` copies it each tick
 * from the matrix of the node the actor's vtable `+0x88` returns (D:L413948-413952) -- `skel_root` (`actor+0x2e8`,
 * `FUN_00553ea0` D:L419599-419607), the same matrix `FUN_00548090` rebuilds after its write (D:L413280-413282). So
 * `'root-up'`: the root's up as the last game frame left it, the body easing 0.2 a game frame to the full slope. `'world-up'`: the
 * yaw-only world up, a fixed 20% tilt (the reading if the animation pass rebuilds the root's matrix from the clip before
 * the copy, which is not read: `FUN_0057a330` writes the root's `+0x20` for the 180 without rebuilding it, D:L439116-439124).
 * Settled by a PCSX2 read of the root quaternion, `+0x410..+0x418` and `DAT_0066acd0..d8` over the M51 incline: **proven**
 * `'root-up'` 2026-10-31 (the EPH pass, runs 20261031T162022Z-162310Z: an exponential to the full slope, 0.200 +- 0.0005
 * of the remaining angle a guest frame, n = 4 runs x 13 frames; research 217 s7.11; no harness spec or golden trace holds
 * it yet, the unit tests hold the transcription).
 */
export const PRONE_TILT_EASE_BASIS_READING = 'root-up' as TiltEaseBasis;
/**
 * (b) Whether a standing or crouched body tilts: the rule tests no stance but the 0.2 ease, so it is the clips' windows
 * that say. `'by-span'`: the rule as read -- and every stand and crouch clip on the disc has no `Normalize` (345 of
 * `motion.rdr`'s 398 records; the loader's (1, 1)), so they tilt only past phase 1, which a play's phase never passes
 * (a loop wraps below 1, a one-shot holds at (n - 1) / n, `./locomotion` `motionOf`). `'never'`: no tilt off prone and
 * the dive whatever the span. Settled by the same PCSX2 read on flat ground and the incline, standing.
 */
export const STAND_CROUCH_TILT_READING = 'by-span' as StandCrouchTilt;
/**
 * (d) What the root holds on a tick the rule writes nothing (w 0, or in the air): `'clip'` -- the animation pass writes
 * the clip's root each tick (`FUN_005777d0` samples every tracked node, the root's record included, D:L437231-437289;
 * `FUN_0057a330`'s 180 overwrites the root's `+0x20` after it, D:L439116-439124) and `FUN_00548090` writes over it only
 * when `w > 0`; every clip's `skel_root` rotation is the identity but `seal_180`'s, `guard_susp_look_back`'s and
 * `seal_walk_alert02`'s (`MOTION_P.ZAR`, pinned in `rootTilt.test.ts`; none of them windowed), so the body is level --
 * and the ease's basis after such a tick is the reference up (those three clips' own turn not carried into it). `'held'`: the root keeps the last tilt written. Whether the pass's write lands on `+0x20` before this
 * rule each frame is not read; settled by the PCSX2 read during a prone throw (`seal_prone_throwgrenade` has no
 * `Normalize`) on the incline.
 */
export const ROOT_TILT_UNWRITTEN_READING = 'clip' as RootTiltUnwritten;
/**
 * (c) Whether the original's damage test meets the tilted body: `FUN_005abbc0` hits the skeleton's nodes (research 91
 * section 1.3), and the root's tilt is in those nodes' matrices; whether the hit test reads them after this rule's write
 * is not read. `'posed'`: the room's capsules turn with the root (`./net/hitVolumes` `bodyVolumes`); `'level'`: they stay
 * yaw-only. Settled by a capture of a shot along a prone body on a slope.
 */
export const TILT_HIT_TEST_READING = 'posed' as TiltHitTest;

/**
 * PRONE-TILT-2 (4) (research 217 s7.9; reading, pending review): whether a dead body runs the rule. `'by-span'`: it
 * does, on its top play's window, as the walker's `dead` body (the room's dead seat, the page's own) -- the rule keeps a
 * branch for a top pushed at the dead's posture word 8 in the air (D:L413207-413214), the eighteen death clips carry
 * `Normalize` (0.2, 0.8) and the knock's landings theirs, and `FUN_005af930`'s floor step (from `FUN_00550ef0` D:L418169)
 * marks a dead body's top at 8 (`FUN_0059b440` D:L456563-456565, `+0xe1` bit 4 clear), so the dead do reach the mover and
 * this rule. [reading: `FUN_00550ef0` clears `+0xf40` on entry (D:L418070) and returns for an actor in state 8 (`+0x174`,
 * D:L418112-418114) before it sets it (D:L418460) -- `FUN_005506a0` runs the mover and this rule only with it set
 * (D:L417822, D:L417863) -- so once a dead body's `+0x174` is 8 neither the pass nor the rule runs and the root holds;
 * where `+0x174` becomes 8 is not read. The page's death poses (`./net/deaths`) are not the walker's top and are drawn
 * level: not built for this reading.] `'level'`: a dead body writes nothing. Settled by a PCSX2 read of the root
 * quaternion `*(actor+0x2e8)+0x20..+0x2c` and `+0x174` on a SEAL killed, and one knocked dead, on M51's incline.
 */
export type CorpseTilt = 'level' | 'by-span';
export const CORPSE_TILT_READING = 'by-span' as CorpseTilt;

/**
 * The `Normalize` windows of the clips a body's top play can be on in the port (the Walker's actions and holds, its
 * ground plays and the dive), as `motion.rdr` gives them through `./motionTable` (`FUN_00287620` D:L131523-131584): the
 * clips listed carry one; every other has none ((1, 1), `NORMALIZE_ABSENT`). Pinned against the disc's table by
 * `rootTilt.test.ts`. The pistol's versions of the stance clips carry the rifle's windows (`seal_p_stand2prone` (0, 1),
 * `seal_p_prone` bare), so the rifle's names stand for both.
 */
export const TILT_WINDOWS: Readonly<Record<string, readonly [number, number]>> = Object.freeze({
  seal_crouch2prone: [0, 1], seal_stand2prone: [0, 1],
  seal_prone: [0, 0], seal_prone_crawl: [0, 0], seal_prone_turn: [0, 0], seal_prone_rstrafe: [0, 0], seal_prone_lstrafe: [0, 0],
  seal_prone_rifle2pistol: [0, 0], seal_prone_reload: [0, 0], seal_p_prone_reload: [0, 0], seal_prone_tossgrenade: [0, 0],
  guard_prone_cover: [0, 0], seal_prone2llean: [0, 0], seal_prone2rlean: [0, 0],
  seal_fallforward01: [0.55, 0.95], seal_fallbackwards01: [0.55, 0.95],
  seal_landforward01: [0.5, 0.9], seal_landbackwards01: [0.5, 0.9],
});

/** A clip's span (`TILT_WINDOWS`, else `NORMALIZE_ABSENT`). */
export function tiltWindowOf(clip: string): readonly [number, number] {
  return Object.prototype.hasOwnProperty.call(TILT_WINDOWS, clip) ? TILT_WINDOWS[clip]! : NORMALIZE_ABSENT;
}

/**
 * The weight of a phase over `[a, b]`, `FUN_00548090` D:L413225-413255 as written: a = b, 0 at or under a, 1 over it;
 * a < b, 0 at or under a, 1 at or over b, `(p - a) / (b - a)` between; a > b, 1 at or under b, 0 at or over a,
 * `1 - (p - b) / (a - b)` between.
 */
export function tiltWeight(phase: number, a: number, b: number): number {
  if (a === b) return phase <= a ? 0 : 1;
  if (a < b) return phase <= a ? 0 : phase >= b ? 1 : (phase - a) / (b - a);
  if (!(b < phase)) return 1;
  return a <= phase ? 0 : 1 - (phase - b) / (a - b);
}

/** What one call of the rule reads. */
export interface TiltInput {
  /**
   * The floor hit's normal under the feet, world axes (`actor+0x410`), or a function giving it: called only on a call
   * that writes (`w > 0`), the one place the rule reads the normal (D:L413259) -- a tick that writes nothing (D:L413256)
   * never asks it, so a standing body pays no floor pick.
   */
  normal: readonly number[] | (() => readonly number[]);
  /** The facing, degrees (`Pose.yaw`; the actor's quaternion `+0x50` is its turn about y). */
  yaw: number;
  /** The top play's motion's `Normalize` span. */
  span: readonly [number, number];
  /** The top play's phase (`+0x1c`): a one-shot's 0 .. (n - 1) / n, a loop's within its cycle. */
  phase: number;
  /** Prone: posture word 2 (`+0x174`; the dive's 6 is not). */
  prone: boolean;
  /** `Crouch -> Prone` (0x13) or `Stand -> Prone` (0x19) playing, either way (D:L413265-413266). */
  proneTransition: boolean;
  /** The dive (`DAT_003def08`) is the action (D:L413219). */
  diving: boolean;
  /** `actor+0x105e` bit 5: off the ground (D:L413207). */
  airborne: boolean;
  /**
   * The top play was pushed at posture word 8 (`+0x2b`, the dead; D:L413208). PRONE-TILT-2 (4): the walker passes its
   * `dead` -- the plays a dead body has on top in the air are pushed at 8: the death (`FUN_005a2490` D:L459804) and a dead
   * body's knock fall (`FUN_005807d0` D:L442094-442102: 8 when `+0xe1` bit 4 is clear, the dead actor's bit, research 225
   * s6; a living body's at 0 or its own posture word).
   */
  deadTop?: boolean;
  /** A dead body (`CORPSE_TILT_READING`): under `'level'` the rule writes nothing for it. */
  corpse?: boolean;
}

/** The root's tilt as one call leaves it: the quaternion it wrote (null: none; the clip's root stands) and the root's up. */
export interface RootTiltState {
  q: TiltQuat | null;
  up: TiltVec;
}

/** A body's state before its first call: no tilt, the reference up. */
export function rootTiltStart(): RootTiltState {
  return { q: null, up: [TILT_REFERENCE_UP[0], TILT_REFERENCE_UP[1], TILT_REFERENCE_UP[2]] };
}

const lerp3 = (t: number, a: readonly number[], b: readonly number[]): TiltVec => {
  // FUN_00308fc0 (D:L207390-207417): a at 0, b at 1, else a(1 - t) + bt -- no normalisation.
  if (t === 0) return [a[0]!, a[1]!, a[2]!];
  if (t === 1) return [b[0]!, b[1]!, b[2]!];
  const s = 1 - t;
  return [a[0]! * s + b[0]! * t, a[1]! * s + b[1]! * t, a[2]! * s + b[2]! * t];
};

/**
 * `FUN_00306d40` (D:L206003-206095): the rotation taking `u` (unit) toward `t` -- the half vector `h = |u + t|`, the
 * quaternion (u x h, u . h). `u + t` zero, or `u x h` zero with `u . t` under 0: the half turn about (u.y, -u.x, 0)
 * normalised, (1, 0, 0) when u.x is 0. `t` is not normalised first: a short `t` turns less than its angle.
 */
export function shortestArc(u: readonly number[], t: readonly number[]): TiltQuat {
  const hx = u[0]! + t[0]!, hy = u[1]! + t[1]!, hz = u[2]! + t[2]!;
  if (!(hx === 0 && hy === 0 && hz === 0)) {
    const len = Math.sqrt(hx * hx + hy * hy + hz * hz);
    const nx = hx / len, ny = hy / len, nz = hz / len;
    const cx = u[1]! * nz - u[2]! * ny, cy = u[2]! * nx - u[0]! * nz, cz = u[0]! * ny - u[1]! * nx;
    const crossZero = cx === 0 && cy === 0 && cz === 0;
    if (!crossZero || u[0]! * t[0]! + u[1]! * t[1]! + u[2]! * t[2]! >= 0) {
      return [cx, cy, cz, u[0]! * nx + u[1]! * ny + u[2]! * nz];
    }
  }
  if (u[0] === 0) return [1, 0, 0, 0];
  const k = 1 / Math.sqrt(u[1]! * u[1]! + u[0]! * u[0]!);
  return [u[1]! * k, -u[0]! * k, 0, 0];
}

/** A vector turned by a unit quaternion (x, y, z, w; three.js's convention, the clips' own, research 77 section 6). */
export function rotateByQuat(q: readonly number[], v: readonly number[]): TiltVec {
  const [x, y, z, w] = q as [number, number, number, number];
  const tx = 2 * (y * v[2]! - z * v[1]!), ty = 2 * (z * v[0]! - x * v[2]!), tz = 2 * (x * v[1]! - y * v[0]!);
  return [v[0]! + w * tx + (y * tz - z * ty), v[1]! + w * ty + (z * tx - x * tz), v[2]! + w * tz + (x * ty - y * tx)];
}

/**
 * A world vector into the body's frame (x right, y up, z behind): the yaw undone -- `./play` `actorToWorld`'s turn
 * inverted, as `FUN_00306fd0` turns it by the conjugate of the actor's quaternion (D:L413259-413264).
 */
export function worldToBody(yaw: number, v: readonly number[]): TiltVec {
  const r = (yaw * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [v[0]! * c - v[2]! * s, v[1]!, v[0]! * s + v[2]! * c];
}

/** The three readings the rule runs on, switchable together (the defaults are the constants above). */
export interface TiltReadings {
  basis: TiltEaseBasis;
  unwritten: RootTiltUnwritten;
  standCrouch: StandCrouchTilt;
}
export const TILT_READINGS: Readonly<TiltReadings> = Object.freeze({
  basis: PRONE_TILT_EASE_BASIS_READING, unwritten: ROOT_TILT_UNWRITTEN_READING, standCrouch: STAND_CROUCH_TILT_READING,
});

/** The root's state on a tick the rule writes nothing (`ROOT_TILT_UNWRITTEN_READING`). */
function unwritten(prev: RootTiltState, readings: Readonly<TiltReadings>): RootTiltState {
  return readings.unwritten === 'held' ? { q: prev.q && [...prev.q], up: [...prev.up] } : rootTiltStart();
}

/** One call of `FUN_00548090` on `prev` (the module's header): the root's new state. */
export function stepRootTilt(prev: RootTiltState, input: TiltInput, readings: Readonly<TiltReadings> = TILT_READINGS): RootTiltState {
  if (input.corpse && CORPSE_TILT_READING === 'level') return unwritten(prev, readings);
  let [a, b] = input.span;
  if (input.airborne) {
    if (!input.deadTop) return unwritten(prev, readings);
    [a, b] = DEAD_AIR_TILT_WINDOW;
  } else if (input.diving) [a, b] = DIVE_TILT_WINDOW;
  if (readings.standCrouch === 'never' && !input.prone && !input.diving) return unwritten(prev, readings);
  const w = tiltWeight(input.phase, a!, b!);
  if (!(w > 0)) return unwritten(prev, readings);
  const normal = typeof input.normal === 'function' ? input.normal() : input.normal;
  const toward = worldToBody(input.yaw, lerp3(w, TILT_REFERENCE_UP, normal));
  const target = input.prone && !input.proneTransition
    ? lerp3(PRONE_TILT_EASE, readings.basis === 'root-up' ? prev.up : TILT_REFERENCE_UP, toward)
    : toward;
  const q = shortestArc(TILT_REFERENCE_UP, target);
  return { q, up: rotateByQuat(q, TILT_REFERENCE_UP) };
}

/** What a body's top play is, as the rule reads it: the clip, its phase, and the dive and transition flags. */
export interface TiltTop {
  clip: string;
  phase: number;
  diving: boolean;
  proneTransition: boolean;
}

/** A one-shot's phase at `progress` (0..1 of its run) over `frames` keys: 0 .. (n - 1) / n, backwards from its end. */
export function oneShotPhase(progress: number, frames: number, reversed: boolean): number {
  const end = frames < 2 ? 1 : (frames - 1) / frames;
  const p = Math.min(1, Math.max(0, progress));
  return reversed ? end * (1 - p) : end * p;
}

/**
 * A traversal move's phase as the rule needs it: the dive's key over `DIVE_KEYS` (its span 0.5 / 0.9 asks the
 * phase itself); any other move's clip is windowless or bare (`TILT_WINDOWS`: the prone leans), which asks only whether
 * the phase is past 0 -- its first key 0, else `GROUND_PLAY_PHASE`.
 */
export function traversalPhase(frame: number, diving: boolean): number {
  return diving ? frame / DIVE_KEYS : frame > 0 ? GROUND_PLAY_PHASE : 0;
}

/**
 * The phase the port gives a looped ground play (the idles, the crawl, the turn): within the cycle, past 0. The one tick
 * a fresh loop sits at phase 0 (A = B = 0 then weighs 0, D:L413227) is not modelled: the port's ground plays are the
 * mover's state, which carries no phase.
 */
export const GROUND_PLAY_PHASE = 0.5;

/** `SEAL_ANIMS`' action clip of a mover action name (`./animator` `Animator.wanted`'s mapping). */
export function actionClipOf(name: string): string | null {
  if (name === 'fall') return SEAL_ANIMS.inAir;
  if (name === 'launch') return SEAL_ANIMS.launch;
  const clip = (SEAL_ANIMS as Readonly<Record<string, string>>)[name];
  return typeof clip === 'string' ? clip : null;
}

/** The ground play's clip for a posture: prone's idle stands for its crawl, turn and strafes (all bare on the disc). */
export function groundClipOf(posture: Stance): string {
  return posture === 'prone' ? SEAL_ANIMS.prone : posture === 'crouch' ? SEAL_ANIMS.crouch : SEAL_ANIMS.stand;
}

/**
 * `seal_dive2prone`'s key count (`MOTION_P.ZAR`, `./traversal` `FALLBACK`'s 16; pinned against the pack by
 * `rootTilt.test.ts`): the dive's phase is its drawn key over it, as the animator's (`Animator.traversalStep`).
 */
export const DIVE_KEYS = 16;

/** The dive's clip name (`./traversal` `TRAVERSAL_CLIP.dive`, not imported here: `./traversal` imports `./mover`). */
export const SEAL_ANIMS_DIVE = 'seal_dive2prone';

/** What `tiltTopOfSnapshot` reads of a body's snapshot (`./mover` `PlaySnapshot`, the wire's or the page's own). */
export interface TiltSnapshot {
  stance: Stance;
  action: { name: string; t: number; seconds: number | null; reversed: boolean } | null;
  hold?: string | null;
  traversal?: { clip: string; frame: number } | null;
}

/**
 * The top play from a snapshot, for a body the page draws off the wire (`./remotePlayers`): the walker's `tiltTop`
 * by the snapshot's fields -- the move's clip (the dive's by its key), the hold (whose clock the wire does not carry:
 * hold clips are windowless or bare, so its phase is taken past 0), the action by its clock, else the posture's
 * ground play. `frames` gives an action's key count (`./mover` `ACTION_CLIPS`), `seconds` the length of an action the
 * snapshot carries no `seconds` for (`./mover` `ACTION_SECONDS`).
 */
export function tiltTopOfSnapshot(snap: TiltSnapshot, frames: (action: string) => number, seconds?: (action: string) => number): TiltTop {
  const tr = snap.traversal;
  if (tr) {
    const diving = tr.clip === SEAL_ANIMS_DIVE;
    return { clip: tr.clip, phase: traversalPhase(tr.frame, diving), diving, proneTransition: false };
  }
  if (snap.hold) return { clip: snap.hold, phase: GROUND_PLAY_PHASE, diving: false, proneTransition: false };
  const a = snap.action;
  if (a) {
    // PRONE-TILT-2 (4): an action run till something ends it (`seconds` null: the knock's falls) plays its clip as a
    // one-shot, its phase by the clip's own length (`seconds`, `./mover` `ACTION_SECONDS`).
    const length = a.seconds ?? seconds?.(a.name) ?? null;
    const progress = length !== null && length > 0 ? a.t / length : 0;
    return {
      clip: actionClipOf(a.name) ?? '', phase: oneShotPhase(progress, frames(a.name), a.reversed), diving: false,
      proneTransition: a.name === 'crouchToProne' || a.name === 'standToProne',
    };
  }
  return { clip: groundClipOf(snap.stance), phase: GROUND_PLAY_PHASE, diving: false, proneTransition: false };
}


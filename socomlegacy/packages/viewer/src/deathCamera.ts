import { SEAL_TUNING } from '@s2u/scene';
import type { Vec3 } from './cameraRig';
import { SOLO_IS_NETWORK_READING } from './net/loopback';

/**
 * The death camera (`FUN_00297a30`, decomp 141072-141290, set up by `FUN_002980d0` 141292-141376): the player's own
 * camera once its SEAL is dead. `FUN_00297410` (140900-140913) turns the camera's mode `cam+0x144` to 1 when the viewed
 * actor is the player's (controller `+0x2c`) and in state 8 (dead); `FUN_002980d0` then picks, in a network game
 * (`DAT_0045a0c1`; the page's single-player match takes this branch too: SOLO_IS_NETWORK_READING, `./net/loopback`):
 *
 * - **mode 3, the killer's**, when the dead actor's killer (`actor+0xfc4`, 141355-141361: an actor of type 2) is another actor
 *   (141375): the eye swings about the body toward the side away from the killer -- the orbit's yaw
 *   `DAT_00416208 += dt x 1.30875 x (a.z b.x - a.x b.z)` (141213-141214), `a` the flat unit line from the body to the
 *   eye, `b` from the killer to the body -- the eye's height eased to 20 by the blend `DAT_00416218` (141282) and its
 *   reach pushed out (x 2.05 a tick) until 56 from the body across the ground (141284-141286); the look's far point
 *   blends from the aim to the killer's origin as `DAT_00416218` goes 0 -> 1 at 1 a second (`FUN_00297410`
 *   141051-141066).
 * - **mode 6, the lone death's**, with no killer or the SEAL its own (a suicide, a fall; 141372): the orbit turns on
 *   its own at 0.8725 rad a second (141217) -- in the original; OT.R116 takes the turn out (DEATH_CAM_SPIN_ADAPTATION).
 * - **mode 7, the stick's** (`DeathCamera.manual`): the first push of either controller channel past 0.01 while the
 *   bound actor is dead (`FUN_002980d0` D:L141595-141627) sets it for the rest of the death -- nothing writes 3 or 6
 *   back, only the reset `FUN_00299150` (D:L141657) writes 0 -- and the orbit then turns and tilts only while the
 *   stick is held (`FUN_00297a30` D:L141219-141221), with no killer, no height or reach and no killer blend (state 3
 *   alone returns 1 to the look, D:L141207; D:L141280). A dead player cycling back to his own body is at 7 too
 *   (`FUN_002980d0` D:L141378-141389 sets 7 every frame a teammate was bound; `takeDeathControl`).
 *
 * Both tilt the orbit by `DAT_00416210`, clamped for a dead actor (`actor+0xf7a` != 1) to [-1, -0.2] (141242-141252):
 * from 0 at the reset (`FUN_00299150` 141657-141662, which the respawn's new camera is), -0.2. The orbit is laid on
 * the camera's local eye, in the actor's space, before the actor's matrix (`FUN_003083c0(m, (pitch, yaw, 0))`, then
 * the eye through it, 141253-141275), and on the look's far point (140987-141028).
 *
 * OT.R104 (an owner's ruling against the original, 2026-11-05; `DEATH_KILLER_FOLLOW_S_ADAPTATION`): mode 3 lasts 5 s
 * from the camera's reset, then the camera goes on as mode 6 about the body -- which, by OT.R116 (2026-11-09,
 * `DEATH_CAM_SPIN_ADAPTATION`), holds still until the stick takes over.
 *
 * DEATH_ORBIT_EULER_READING: `FUN_003083c0`'s order is not read; the tilt is taken about x first, then the turn about
 * y (the actor space's own yaw, `./cameraRig` `toWorld`). With the turn so, the game's mode-3 formula brings the eye
 * round to the far side of the body from the killer, as its sign requires.
 */

/** Mode 6: the orbit's own turn in the original, rad a second (141217); OT.R116 applies DEATH_CAM_SPIN_ADAPTATION instead. */
export const DEATH_ORBIT_RATE = 0.8725;
/**
 * DEATH_CAM_SPIN_ADAPTATION (a browser adaptation: the owner's ruling OT.R116, MISSION, 2026-11-09): mode 6's own turn,
 * rad a second, as the page applies it -- 0, no self-turn. The owner, Craig, agreeing in Discord (as Scotho) with a
 * tester's "also can u cut outthe spin completely, just keep it manual, the death cam": "yup, game for that too, bit
 * annoying tbh"; in the main controller's seat 99: "and the death cam should be adjusted as he specified, only the
 * spinning cam while vieweing your own dead body. it starts spinning but then when you click your stick it stops and
 * you take control"; and "Keep the killer follow". The original turns the lone death's orbit at DEATH_ORBIT_RATE,
 * 0.8725 rad a second, every frame with no input (`FUN_00297a30` D:L141216-141218); setting this to DEATH_ORBIT_RATE
 * restores it. Mode 3's turn toward the killer (OT.R104's 5 s) and mode 7's stick are the original's, untouched.
 */
export const DEATH_CAM_SPIN_ADAPTATION: number = 0;
/** Mode 3: the gain on the killer's side's sine, rad a second (141214). */
export const DEATH_TURN_GAIN = 1.30875;
/** The orbit's tilt for a dead actor, clamped to [-1, -0.2] rad from 0 (141242-141252). */
export const DEATH_TILT_MIN = -1;
export const DEATH_TILT_MAX = -0.2;
/** Mode 3: the eye's height the blend eases to, and its least reach across the ground (141282-141286). */
export const DEATH_EYE_HEIGHT = 20;
export const DEATH_EYE_REACH = 56;
/** Mode 3: the eye's reach grows by this part of itself a tick while under `DEATH_EYE_REACH` (141285-141286). */
export const DEATH_EYE_PUSH = 1.05;

/**
 * DEATH_KILLER_FOLLOW_S_ADAPTATION (an adaptation: the owner's ruling OT.R104, MISSION, 2026-11-05: "5 seconds is
 * acceptable before the camera stops following"): how long, in seconds from the camera's reset (`newDeathCamera`: the
 * death, or the killer named by `WalkMode.setDeathKiller`), mode 3 reads the killer's place. The original has no such
 * limit: online state 3 reads the killer's place (+0x154) every frame for as long as the player is dead (`FUN_00297a30`
 * D:L141145-141215; `FUN_002980d0` D:L141369-141376; research 314 §5.4 item 4). At the limit the killer is dropped
 * for the rest of this death and the camera goes on as mode 6, the lone death's own orbit (0.8725 rad a second,
 * D:L141216-141218), from the yaw mode 3 left: the turn `yaw` is one field both modes step, so the first mode-6 tick
 * adds dt x 0.8725 to it and nothing else. With the killer gone, mode 3's height ease and reach push and the look's
 * blend toward the killer (`deathFar`) stop as they do for a death with no killer: the eye and the look are mode 6's.
 */
export const DEATH_KILLER_FOLLOW_S_ADAPTATION = 5;
/** The tick sum's float slack: 300 ticks of 1/60 s land a hair under 5. */
const FOLLOW_SLACK = 1e-9;

/** Mode 7's takeover: either controller channel at |v| >= 0.01 (`FUN_002980d0` D:L141612-141613; `FUN_001b3620` is fabs). */
export const DEATH_STICK_TAKEOVER = 0.01;
/** Mode 7: the orbit's turn and tilt are the channels x 2 x dt (`FUN_00297a30` D:L141220-141221). */
export const DEATH_STICK_RATE = 2;
/**
 * DEATH_STICK_TILT_READING: what drives the tilt channel, controller `+0x14` (D:L141142, D:L141221). No writer of
 * `+0x14` was found in the controller code (D:L449000-456000 searched; `FUN_005966a0` hands the pitch to `FUN_00594600`
 * and stores only the raw pitch axis at `+0x138`), so it is either the look stick's pitch axis or never written for a
 * local SEAL, the dead view then turning only. Taken: the pitch axis (`LookState.axis[1]`, up positive, after the gain
 * and zoom). Settled by a full cross-reference of the writes to controller `+0x14`, or a PCSX2 capture of a dead SEAL
 * at state 7 with the right stick held full up, then full down, for 1 s each (research 91, research 101).
 */
export const DEATH_STICK_TILT_READING: 'pitch axis' | 'none' = 'pitch axis';
/**
 * DEATH_STICK_TURN_SIGN_READING: the sign the port's look turn (`LookState.turnRate`, left positive) takes into the
 * turn channel `+0x10`. `+0x10` is the turn axis the living look reads (`FUN_005966a0` D:L453858; `look.ts` keeps its
 * sign flipped to right positive in `axis`), whose living turn is `actor+0x48` (`FUN_00550ef0` D:L418340), and the
 * orbit's `DAT_00416208` turns the eye as the actor's yaw does (`cameraRig.ts` `toWorld`): so a right push turns the
 * view right, as alive. Settled by a PCSX2 capture of a dead SEAL at state 6 with the right stick held full right for
 * 1 s (expected: about 2.24 rad in the stick's sense, then still) (research 91, research 101).
 */
export const DEATH_STICK_TURN_SIGN_READING = 1;

/** Mode 7's input this tick: the controller's turn channel `+0x10` (left positive) and tilt channel `+0x14`. */
export interface DeathStick {
  turn: number;
  tilt: number;
}
const NO_STICK: DeathStick = { turn: 0, tilt: 0 };

/**
 * The walk's look as mode 7's channels: the turn is the look's turn over `turn_maxrate` (the look law made it
 * `turn_maxrate x` the axis, `FUN_00550ef0` D:L418340; the touch look's share rides in it), the tilt the pitch axis
 * (DEATH_STICK_TILT_READING). No look, no push.
 */
export function deathStickOf(look: { turnRate: number; axis?: readonly number[] } | undefined): DeathStick {
  if (!look) return { ...NO_STICK };
  const turn = (DEATH_STICK_TURN_SIGN_READING * look.turnRate) / SEAL_TUNING.turnMaxRate;
  const tilt = DEATH_STICK_TILT_READING === 'pitch axis' ? look.axis?.[1] ?? 0 : 0;
  return { turn: turn === 0 ? 0 : turn, tilt: tilt === 0 ? 0 : tilt };
}

export interface DeathCamera {
  /** `DAT_00416208`: the orbit's turn, rad. */
  yaw: number;
  /** `DAT_00416210`: the orbit's tilt, rad. */
  tilt: number;
  /** `DAT_00416218`: mode 3's blend, 0 -> 1 at 1 a second. */
  blend: number;
  /** Mode 3's killer: its origin now, or null (the body gone from the snapshots: the last one seen stands). */
  killer: (() => Vec3 | null) | null;
  /** The killer's origin as last seen. */
  lastKiller: Vec3 | null;
  /** Seconds since the reset (OT.R104, `DEATH_KILLER_FOLLOW_S_ADAPTATION`): mode 3 ends at the limit. */
  age: number;
  /** Mode 2 (`DAT_0045a0c1` clear, 141363-141369): the orbit does not turn. Optional: absent is a network camera. */
  still?: boolean;
  /** Mode 7 (`+0x144 == 7`): the stick has taken over for the rest of this death (D:L141619; only the reset clears it). */
  manual: boolean;
}

/**
 * The camera at the death (`FUN_00299150`'s reset: every angle and the blend 0): mode 6 until a killer is named. `network`
 * is `DAT_0045a0c1` (`FUN_002980d0` 141363): the page's matches, online and its single-player one, run the network
 * branch (SOLO_IS_NETWORK_READING); false is the game's mode 2 (141363-141369: no orbit turn, `FUN_00297a30` having no
 * mode-2 branch at 141143-141221; the tilt clamp still applies), which the page never builds.
 */
export function newDeathCamera(killer: (() => Vec3 | null) | null = null, network = SOLO_IS_NETWORK_READING): DeathCamera {
  return { yaw: 0, tilt: 0, blend: 0, age: 0, killer: network ? killer : null, lastKiller: null, still: !network, manual: false };
}

/**
 * Mode 7 now (`FUN_002980d0` D:L141619): the stick's takeover, or the own body bound again after a dead player's cycle
 * (D:L141378-141389). The killer is dropped for the rest of the death (state 3 alone reads it, D:L141145-141215), and
 * with it OT.R104's clock.
 */
export function takeDeathControl(cam: DeathCamera): void {
  cam.manual = true;
  cam.killer = null;
  cam.lastKiller = null;
}

const turnY = (v: readonly number[], a: number): Vec3 => {
  const c = Math.cos(a), s = Math.sin(a);
  return [v[0]! * c + v[2]! * s, v[1]!, -v[0]! * s + v[2]! * c];
};
const tiltX = (v: readonly number[], a: number): Vec3 => {
  const c = Math.cos(a), s = Math.sin(a);
  return [v[0]!, v[1]! * c - v[2]! * s, v[1]! * s + v[2]! * c];
};

/** The orbit on an actor-space vector: the tilt, then the turn (DEATH_ORBIT_EULER_READING). */
export function orbit(cam: DeathCamera, v: readonly number[]): Vec3 {
  return turnY(tiltX(v, cam.tilt), cam.yaw);
}

/** Into [-pi, pi], as both angles are (D:L141223-141230). */
const wrap = (a: number): number => {
  while (a < -Math.PI) a += 2 * Math.PI;
  while (a > Math.PI) a -= 2 * Math.PI;
  return a;
};

/** The killer's origin, when mode 3 has one (the last seen when the body is not in the snapshots). */
function killerAt(cam: DeathCamera): Vec3 | null {
  if (!cam.killer) return null;
  const k = cam.killer();
  if (k) cam.lastKiller = [k[0], k[1], k[2]];
  return cam.lastKiller;
}

/**
 * One tick of `FUN_00297a30` on the camera's local eye (actor space: `+z` behind): the orbit turned (mode 3 toward the
 * killer's far side, mode 6 at DEATH_CAM_SPIN_ADAPTATION (OT.R116), mode 7 by the stick; mode 3 for
 * DEATH_KILLER_FOLLOW_S_ADAPTATION, OT.R104), tilted, and laid on the eye; mode 3's height and reach. `feet` and
 * `yawDegrees` are the dead actor's (its matrix); `stick` is the dead actor's controller this tick (`deathStickOf`).
 */
export function deathEye(cam: DeathCamera, eyeL: readonly number[], feet: readonly number[], yawDegrees: number, dt: number, stick: DeathStick = NO_STICK): Vec3 {
  // D:L141126 -> `FUN_002980d0` D:L141595-141627: the takeover first, so the push's own tick is mode 7's.
  if (!cam.manual && (Math.abs(stick.turn) >= DEATH_STICK_TAKEOVER || Math.abs(stick.tilt) >= DEATH_STICK_TAKEOVER)) takeDeathControl(cam);
  // OT.R104 (DEATH_KILLER_FOLLOW_S_ADAPTATION): the tick that reaches the limit is mode 6's; the killer is dropped for
  // this death, so `deathFar` (after this in the tick, `./playerCamera`) gives the aim.
  cam.age += dt;
  if (cam.killer && cam.age >= DEATH_KILLER_FOLLOW_S_ADAPTATION - FOLLOW_SLACK) { cam.killer = null; cam.lastKiller = null; }
  const killer = killerAt(cam);
  if (cam.manual) {
    // D:L141219-141221: the turn and the tilt move only while the stick is held.
    cam.yaw += stick.turn * DEATH_STICK_RATE * dt;
    cam.tilt = wrap(cam.tilt + stick.tilt * DEATH_STICK_RATE * dt);
  } else if (killer) {
    // 141149-141214: the eye turned by this frame's yaw, to the world; a = body -> eye, b = killer -> body, flat.
    const e = turnY(eyeL, cam.yaw), y = (yawDegrees * Math.PI) / 180;
    const w = turnY(e, y);
    const al = Math.hypot(w[0], w[2]), bx = feet[0]! - killer[0], bz = feet[2]! - killer[2], bl = Math.hypot(bx, bz);
    if (al > 0 && bl > 0) cam.yaw += dt * DEATH_TURN_GAIN * ((w[2] / al) * (bx / bl) - (w[0] / al) * (bz / bl));
  } else if (!cam.still) cam.yaw += dt * DEATH_CAM_SPIN_ADAPTATION;   // OT.R116; the original's DEATH_ORBIT_RATE (D:L141217)
  cam.yaw = wrap(cam.yaw);
  cam.tilt = Math.max(DEATH_TILT_MIN, Math.min(DEATH_TILT_MAX, cam.tilt));
  const eye = orbit(cam, eyeL);
  if (killer) {
    eye[1] += (DEATH_EYE_HEIGHT - eye[1]) * cam.blend;
    if (Math.hypot(eye[0], eye[2]) < DEATH_EYE_REACH) { eye[0] += eye[0] * DEATH_EYE_PUSH; eye[2] += eye[2] * DEATH_EYE_PUSH; }
  }
  return eye;
}

/**
 * The look's far point (`FUN_00297410` 141044-141066): `aim` is the orbited aim in the world; in mode 3 the blend
 * steps on (1 a second, to 1) and the point is `aim + blend x (killer - aim)`.
 */
export function deathFar(cam: DeathCamera, aim: Vec3, dt: number): Vec3 {
  const killer = cam.killer ? cam.lastKiller : null;
  if (!killer) return aim;
  cam.blend = Math.min(1, cam.blend + dt);
  const t = cam.blend;
  return [aim[0] + (killer[0] - aim[0]) * t, aim[1] + (killer[1] - aim[1]) * t, aim[2] + (killer[2] - aim[2]) * t];
}

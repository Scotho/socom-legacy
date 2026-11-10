import { Vector3, type Camera } from 'three';
import { segmentHit, segmentHits, SEAL_TUNING, type Grid, type WorldPoly } from '@s2u/scene';
import type { Stance } from './walk';
import { MAP_FOV } from './accuracy';
import { ACTION_SECONDS, isCameraClassSurface, STANCE } from './mover';
import { deathEye, deathFar, orbit, type DeathCamera, type DeathStick } from './deathCamera';
import {
  CAM_BACK, CAM_CLOSE, CAM_FAR, CAM_MARGIN, HEAD_EYE_WALL_BACK_PLACEHOLDER, headEye, localCamera, lookHeight, peekShift, ramp, scopeEyeHeight, scopePeekShift, toWorld,
  LEAD_DOWN, CAM_HOLD, CAM_REGROW, cameraPass, isPeekCameraSurface, newPassState, TYPE_ONE_CLEAR, type LocalCamera, type PassState, type Vec3,
} from './cameraRig';

// The camera's geometry lives headless in `./cameraRig` (the shared sim reads it too); the page imports it from here.
// LATER 305: the pass (`FUN_0029bf70`) too -- the room reproduces a claimed eye with the same one (`net/shotCone.ts`).
export { CAM_BACK, CAM_CLOSE, CAM_FAR, CAM_MARGIN, headEye, localCamera, lookHeight, peekShift, ramp, scopeEyeHeight, scopePeekShift, toWorld };
export { CAM_HOLD, CAM_REGROW, cameraPass, isPeekCameraSurface, newPassState };
export type { LocalCamera, PassState, Vec3 };

/**
 * The game's third-person camera (web sprint 2, W2.1; the spec's W2.R1): the walk is seen from behind and over the
 * SEAL's shoulder, as `FUN_00296f10` (the "CamC" of research 17 section 2's live trace, called every frame) places
 * it. Read from `game/analysis/socom2_game.elf.decomp.c`; the constants are the ELF's data, read at their addresses
 * (and equal on the console dump `logs/parity/spawn_pcsx2.rdram`); reCOM's `zCamera/zcam.h` names the parts
 * (`CAppCamera`, `m_cameraAim`, `m_camGoalPos`), its `camera.cpp` is stubs. Coordinates below are the actor's own
 * (research 17 section 2): +y up, **+z behind** (the eye's local z is +24.166 on the console), -z ahead.
 *
 * ```
 * FUN_00296f10(dt, cam, out)                                     decomp 140630-140830, the caller
 *   FUN_0029a950(&eyeL, cam, &targetL, &dist)                     the target and the goal, actor space
 *   FUN_00297410(dt, cam, &eyeL, &targetL, &far)                  to the world, and the look line
 *   target = eye + normalize(far - eye) * dist                    the look target, re-placed on the eye's line
 *   [+0x45 blend: the stored target and eye moved 6 dt toward the new pair (D:L140729-140788), on only with the
 *    death camera at 7 -- the dead player's teammate view, `PlayerCamera.ease` (INV-SPECTATE C, research 314 §5.7);
 *    a -5 / +5 nudge in an actor state not read here: not modelled]
 *   FUN_0029bf70(dt, cam, &target, &eye, &eye)                    the pass
 *   FUN_0029bc90(cam, &eye, &target, out)                         the placement
 *
 * FUN_0029a950 (decomp 142412-142562; research 17 section 3)     -- CONFIRMED against the console, to 0.001
 *   root = skeleton root node's translation (actor+0x2e8, FUN_002869d0), (0, rootY, 0) at rest
 *   ramp = rootY == 0 ? 10 : 5.5 + 4.5 * (rootY < 5.6 ? clamp((rootY - 2.169155) * 0.2914734, 0, 1) : 1)
 *   targetL.x = root.x + peek          peek = DAT_004161c0 * (2.5 left | 2.8 right): 0, no peek here
 *   targetL.y = rootY + ramp
 *   v = (root.x + peek, 0, root.z + 28);  dist = |v|             28: fStack_8 + 28.0
 *   n = normalize(rotate(actor+0x1070, v))                        the look quaternion: the camera's pitch
 *   targetL.z = n.y < 0 ? -3 * n.y                                DAT_003de288 = -3 (looking up: the target back)
 *             : -8 * n.y, and when that is under -5 (n.y > 0.625)  DAT_003de278 = -8, DAT_003de280 = -5
 *               a probe (FUN_0029cbb0) from the target 8 ahead: on a hit, + the part of the 8 past the hit --
 *               its start z an uninitialised stack word (`LEAD_PROBE_START_PLACEHOLDER`, LATER 308)
 *             [a second branch, -5 * n.y, when FUN_002b3580's object answers FUN_0054f6e0 / FUN_0059da60: not
 *              the console's at spawn, whose -1.274 = -8 x 0.1593]
 *   dist = dist + |n.y| * (14 - dist)                             FUN_001b3620 is fabs: steeper, nearer
 *   eyeL = targetL + n * dist
 *
 * FUN_00297410 (decomp 140831-141071)                             -- CONFIRMED (no tether in it)
 *   eyeL, targetL -> world through the actor matrix (FUN_00308640 with w = 1); a yaw spin only in actor state 8
 *   far = world(targetL + rotate(actor+0x1070, (0, 0, -1000)))    the aim: 1000 ahead along the pitched look
 *   [the +0x144 mode (FUN_00297a30), the network-game +0xf4 mode: not the walk's]
 *
 * FUN_0029bf70 (decomp 143197-143660; research 17 section 2's "four segment probes")   -- read; the no-hit case
 *                                                                  CONFIRMED against the console, to 0.001
 *   u = target - eye;  L = |u| + 0.75;  probe = target - û * L     the probe reaches 0.75 past the goal
 *   hits = the segment target -> probe (FUN_0031e0a0)
 *   hit = FUN_0029cd20 (decomp 143706-143770): the nearest to the target, passing over any polygon whose
 *         m_cameratype is exactly 1 (bit 18 set, bit 19 clear) within 2.75 of the target; any = hits not empty
 *         (DAT_00416038 = 1, whether or not the pick survived the filter)
 *   if cam+0x4c > 0: cam+0x4c -= dt                               the hold timer
 *   D = DAT_003de268                                                the camera's distance, kept across frames
 *   if L > D: if cam+0x4c <= 0 or D < 3.3 or any: D += 0.03 * (L - D)   DAT_003de270: out at 3 % a frame
 *   else:     D = L                                                 in at once
 *   no hit:   eye = target - û * D
 *   hit h:    D = min(D, max(0.75, |h - target| - 0.75));  eye = target + normalize(h - target) * D;  cam+0x4c = 1.5
 *   s = normalize_xz(-u.z, 0, u.x) * 0.75;  w = normalize(s x u) * 0.75
 *   four segments from the eye: to eye + s, eye - s, eye + w, eye - w   (records 0x416050, 0x4160b0, 0x416110,
 *                                                                          0x416170; batch FUN_0031de90)
 *   sideways: both hit -> eye = midpoint of the hits; one hit -> eye.xz += hit.xz - end.xz
 *   up/down:  both hit -> eye = midpoint of the hits; one hit -> eye += hit - end
 *   any side hit: cam+0x4c = 1.5
 *   if |eye - target| < 0.75: eye = target + normalize(eye - target) * 0.75    [0.75: `lui $v0,0x3f40` into $f12 at
 *                                                                                 0x29cab0, research 180 section 2.3, U3]
 *   The surfaces: DAT_0044d758 = 1 (no peek) -- bit 19 skipped, bit 18 tested, and a VOLUMETRIC material
 *   skipped (`FUN_002d2890` D:L174845-174864; research 230 §3.4). `isCameraClassSurface` (`./mover`, the headroom's
 *   same cast). A peek sets the mode to 0 (`isPeekCameraSurface`): bit 18 skipped, the material not consulted.
 *
 * FUN_0029bc90 (decomp 143081-143144)                            -- CONFIRMED
 *   f = normalize(target - eye);  x = normalize(-f.z, 0, f.x);  y = x cross f;  rows (x, y, -f, eye); cam+0xd8 = eye
 *   no roll (dynamics.rdr's camera_roll 0.0001 is not read here), no field of view: the map's `fov` is (camera.ts)
 * ```
 *
 * **Why the console's eye is 24.2 behind the actor, not 28.** Not the pass and not a tether: the pitch. The
 * console's look quaternion `actor+0x1070` on the dump is (-0.0799, 0, 0, 0.9968), a turn of -0.16 rad about x --
 * `dynamics.rdr`'s `init_aim_pitch` -9.167 degrees (the table's `+0x54`, -0.159994). With it `FUN_0029a950`'s
 * `n.y` = 0.1593, so dist = 28 - 0.1593 x 14 = 25.770, the target 1.274 ahead, and the eye local (0, 19.483,
 * 24.166): the console's `cam+0x2c` exactly (research 17 section 1, section 4.1 row #13). The pass then adds its
 * 0.75: `DAT_003de268` on the dump is 26.51936 = 25.770 + 0.75, and the placed eye (`cam+0xd8`) is 19.603 over the
 * feet and 24.906 behind -- the dump's (939.439, -126.264, 832.160) against the player's (939.4391, -145.8672,
 * 857.0661), to 0.001. (Research 17 section 1's "20.107" is that eye over the collision *hit*, 0.504 under the
 * feet; the spec's "24.2 behind" is the unpassed `cam+0x2c`.)
 *
 * **The tether.** `dynamics.rdr`'s `cam_tether_stiff` 0.95 (`+0x15c`) and `cam_net_pos_smooth` (`+0x164`) have no
 * reader in the decompilation but the static initialiser (decomp 328428-328433) and the loader: the camera's only
 * smoothing is the pass's distance, in at once and out at `DAT_003de270` = 0.03 a frame after a 1.5 s hold (1.0,
 * a snap, for the first 0.1 s after a camera switch: `FUN_00295f20`, `FUN_0029b0c0`). The 0.03 is per call, once a
 * game frame of 525/15734 s (research 180 section 0 item 2 and U2; research 208): a time constant of 1.09 s, not the
 * 0.55 s it had while it ran once a 60 Hz tick here (PF-02). The camera still ticks with the mover, so a tick of `dt`
 * lets out `1 - 0.97^(dt / GAME_FRAME_DT)` of the gap: 3 % a game frame, as the game's -- the continuous per-second
 * equivalent MISSION R8 rules for everything but the trajectories (a known deviation, research 208 section 9; the
 * original lets it out in once-a-frame steps).
 *
 * **The pitch** (`FUN_00594600`, decomp 452781-452958, then `FUN_005af470` writes the quaternion): the stick moves
 * it at `pitch_rate` 0.85 rad/s x axis (`+0xf4`; x 500 / `actor+0x1080`, which is 500 on the dump), between
 * `min_aim_pitch` -70 and `max_aim_pitch` 60 standing and crouched (`+0x5c`, `+0x58`) and the prone pair -20 and 25
 * (`+0x68`, `+0x64`; the prone limits also lean with the ground's slope along the facing, `./look` `proneAimLean`,
 * PRONE-TILT-2 (1): the walk passes it in, `./net/lookGate` `aimPitchLimitsOf`) -- the **aim** limits, not
 * `min/max_look_pitch` -60/80, which this routine does not read. The spawn pitch is `init_aim_pitch`.
 *
 * **The root** is the body's skeleton root as posed (`FUN_002869d0` on `actor+0x2e8`, decomp 142450-142460): the walk
 * hands the animator's over (`WalkMode.setPosedRoot`), so the target rises with the standing jump's root (10.5 to
 * 15.1) and sinks through a crouch's transition clip; a running jump lifts the feet themselves. With no clips the
 * stance's measured root stands in, eased over 0.2 s [estimate].
 *
 * **The peek** (`DAT_004161c0`, eased by `./traversal` at `cam_peek_decay_rate`) shifts `v` and the target across
 * (`peekShift`), so the eye goes about twice the shift out; the aim stays the pitched straight ahead (`ahead`).
 *
 * **Not modelled:** the skeleton root's own x and z (0 here, as in the game: `FUN_0057a330` zeroes them after each
 * update, decomp 439147-439148), and the two camera modes above. The lead probe `FUN_0029cbb0` casts in mode 0 (it sets
 * it itself, `FUN_002d4fd0(0)` D:L143678: bit 18 skipped, bit 19 tested, no material) and its hits pass
 * `FUN_0029cd20`'s cameratype-1 picker (D:L143689); the port's probe uses that mode and picker (research 382 §3).
 *
 * **The near rectangle, after the pass.** `FUN_0029bf70` stops the eye 0.75 short of a face (research 180 §2.3, the
 * minimum at `0x29cab0`). The projection's near plane stays the map's 4 (research 90 §5). A live match fits the
 * window, not the PS2 aspect (`main.ts` `fit`, `matchMount.ts` `fit`). The half-height is `4 * tan(vfov)` ≈ 1.82
 * and the half-width is that times the frame's aspect. At the game's frame (`GAME_ASPECT`, `tan(hfov) / tan(vfov)`
 * ≈ 1.54) the original's camera cuts a face the 0.75 probes left inside the rectangle (the same code path at the same
 * aspect: a reading) -- and the owner ruled it off (H309, 2026-10-23: "no see through anywhere"): at every aspect
 * `clearNearRect` moves the rendered eye until the live rectangle is clear of camera faces (`NEAR_CLEARANCE_ADAPTATION`,
 * an intended divergence by the owner's ruling; research 90 §10, LATER 279). The game's eye stays the pass's. A face
 * parallel to the view is not cleared by pulling the eye in along the boom: the corner stays in the face, so the step
 * is still along the face normal. That slide used to leave the look target where it was, so the drawn view yawed off
 * the aim and the reticle (`viewFar` of the pass, projected through the drawn camera) left the frame's centre. The
 * drawn look target now takes the same slide, and the view stays parallel to the aim. A wall directly behind the eye
 * is not in the forward rectangle, so the pull-in research 90 measured is unchanged.
 *
 * **A peek.** The look target is re-placed on the eye-to-aim line, about 5 to the side. `cameraPass` casts from
 * that target, so a target already past a face leaves the eye in the room (the 0.75 minimum), as the original's
 * pass does; its side ray ends a lean held into a wall (`FUN_00594cf0`, `./traversal`). With the near clearance, at
 * every aspect (H309), the drawn camera's peek target is pulled back the way `headEye` pulls the scope's eye: level from
 * the body's axis, 0.1 short of a camera face, and the same cast then pulls the drawn eye back if the 0.75 minimum still
 * put it through. Research 90 §10.
 */

/** The camera's tick: the mover's (`walk.ts`), the port's 60 Hz tick -- not the game's frame, `GAME_FRAME_DT` (PF.R8, research 208). */
const TICK = 1 / 60;
/** The spawn's pitch, degrees: `dynamics.rdr`'s `init_aim_pitch` (the header). */
export const INIT_AIM_PITCH = SEAL_TUNING.initAimPitch;
/**
 * How fast the root moves to a new stance's, units a second, when no posed root is on hand (no clips): the original
 * eases nothing -- `FUN_0029a950` reads the posed root -- so this fallback takes the disc's transition, the stand-crouch
 * span (11.484 - 5.504) over `seal_stand2crouch` as the port plays it, `ACTION_SECONDS.standToCrouch` = 0.65 x (26/27)^2
 * = 0.603 s (`motion.rdr` playback 0.65, 27 keys): 9.92 a second (PF-21, research 180 s1.10, research 217 s4; was the
 * 0.2 s estimate's 29.9). [reading: a fallback with no original counterpart; research 180 s1.10 gives 0.900 s (27 keys
 * at 30 a second, 6.64 a second), which leaves out the clip's playback -- the port's one-shot law is taken]
 */
export const ROOT_RATE_READING = (STANCE.stand.rootY - STANCE.crouch.rootY) / ACTION_SECONDS.standToCrouch;
/**
 * INV-SPECTATE C (research 314 §5.7; reading, pending review): the camera's blend rate, a second. With the blend flag
 * +0x45 set and +0x46 clear, `FUN_00296f10` takes the factor `dt * 6` (D:L140739) and clamps it to 1 (D:L140747-140749);
 * `FUN_00297410` sets the flag (and clears +0x46) only with the death camera at 7 and the new bind's latch +0x44 spent
 * (D:L141028-141032). [reading: the rate of the original's camera calls -- the dt `FUN_002998f0` hands down -- is not
 * traced against the page's frame; the port applies it once a page frame with the page's dt]
 */
export const WATCHED_EASE_RATE_READING = 6;
/** The blend's factor for a frame of `dt` seconds: `dt * WATCHED_EASE_RATE_READING`, at most 1 (D:L140739, D:L140747-140749). */
export function watchedEaseFactor(dt: number): number {
  return Math.min(1, Math.max(0, dt) * WATCHED_EASE_RATE_READING);
}

const sub = (a: readonly number[], b: readonly number[]): Vec3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const add = (a: readonly number[], b: readonly number[]): Vec3 => [a[0]! + b[0]!, a[1]! + b[1]!, a[2]! + b[2]!];
const scale = (a: readonly number[], k: number): Vec3 => [a[0]! * k, a[1]! * k, a[2]! * k];
const length = (a: readonly number[]): number => Math.hypot(a[0]!, a[1]!, a[2]!);
const unit = (a: readonly number[]): Vec3 => { const l = length(a); return l > 0 ? scale(a, 1 / l) : [0, 0, 0]; };
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * LATER 305 (the merge controller's call between readings, 2026-10-22; reading, pending review): the eye ray's aim point
 * -- the round's, C4's and the SWITCH's, the reticle's and the hostage order's pick. `FUN_005aa6e0` casts from the eye
 * (`cam+0xd8`) along the matrix `FUN_00296f10` builds after the pass (D:L142028: rows x, y, -f with f the eye toward the
 * moved target, the header's last line), so the line runs from the eye through `target`, not toward `far`
 * (`FUN_00297410`'s point, which the moved target was laid on before the pass's side probes shifted the eye); the round
 * then leaves the muzzle toward that line's hit (`FUN_005be9a0` D:L475550; research 84 §19). Kept `|far - eye|` long,
 * the length every caller already had; with no shift the eye, target and far are on one line and this is `far` within
 * float rounding. The view from the head never comes here: its target is on its look.
 */
export function viewFar(eye: Vec3, target: Vec3, far: Vec3): Vec3 {
  return add(eye, scale(unit(sub(target, eye)), length(sub(far, eye))));
}

/** The map's `m_near_plane` (research 90 §5). The pass does not read it. */
const NEAR_PLANE = 4;
/** The game's frame, width over height, at `MAP_FOV` (`tan(hfov) / tan(vfov)` ≈ 1.54): the original's own near rectangle. */
export const GAME_ASPECT = Math.tan(MAP_FOV.hfov) / Math.tan(MAP_FOV.vfov);
/**
 * NEAR_CLEARANCE_ADAPTATION (#479, Fuse's push, taken over; research 90 §10, LATER 279): an intended divergence by the
 * owner's ruling (H309, Craig, 2026-10-23, in the merge controller's seat: "no see through anywhere"). At every aspect
 * the DRAWN eye is moved until the live near rectangle's corners are clear of camera faces (`clearNearRect`), and a
 * peek's drawn target and eye are pulled back off a face (`headEye`); the original's pass (`FUN_0029bf70`) has neither,
 * and at its own frame cuts such a face (a reading). The game's eye -- the shot's, the order's, the perception's, the
 * listener's (`CameraView.aim`, `WalkMode.gameCamera`) -- stays the pass's. Was: only past the game's frame (the merge
 * controller's split, 2026-10-23), then ramped in from it (Craig's "gradually"), both superseded by H309's answer.
 */
export const NEAR_CLEARANCE_ADAPTATION = 'every aspect, the drawn camera only' as const;
/** Half-height of the near plane at `MAP_FOV`'s vertical angle. The half-width is this times the aspect. */
const NEAR_HALF_H = NEAR_PLANE * Math.tan(MAP_FOV.vfov);
/**
 * How far a near corner sits off a face after a push, and the smallest push. Not a reading of the original: the
 * gap that keeps the corner off the face once the eye has moved (research 90 §10).
 */
const NEAR_CLEAR = 0.08;
const NEAR_PUSH_MIN = 0.05;
/** A single step's cap. A graze needs more than the gap; it does not need a step across the room. Not a reading. */
const NEAR_PUSH_MAX = 8;
/**
 * Below this, moving the eye along an axis does not carry the corner off the face. A face nearly parallel to the
 * view rotates the rectangle, and the corner then moves a fraction of the eye's step (research 90 §10).
 */
const NEAR_SLOPE_MIN = 0.05;
const NEAR_ITERS = 8;
/** A look target with two camera faces inside this reach is inside a solid, not standing in the open beside one. */
const BURY_REACH = 1;

const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

/**
 * The four corners of the near rectangle, eye looking at `target`, at `aspect` (width/height). The same set
 * `PerspectiveCamera.unproject` gives for NDC z = -1 at vertical `MAP_FOV`, that aspect and near 4 (the pairing
 * differs; the points do not). The default is the game's frame (`GAME_ASPECT`). Null when the look is vertical.
 */
export function nearRectCorners(eye: Vec3, target: Vec3, aspect = GAME_ASPECT): Vec3[] | null {
  const forward = unit(sub(target, eye));
  if (forward[0] === 0 && forward[1] === 0 && forward[2] === 0) return null;
  const rl = Math.hypot(forward[2], forward[0]);
  if (rl < 1e-8) return null;
  const right: Vec3 = [forward[2] / rl, 0, -forward[0] / rl];
  const up: Vec3 = [
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ];
  const base = add(eye, scale(forward, NEAR_PLANE));
  const halfW = NEAR_HALF_H * aspect;
  const out: Vec3[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    out.push(add(add(base, scale(right, sx * halfW)), scale(up, sy * NEAR_HALF_H)));
  }
  return out;
}

/**
 * HEAD_VIEW_NEAR_ADAPTATION (OBF-1; OBF.R1, Craig, 2026-10-30, seat redotcom-20: "Just like the camera seeing through
 * the wall, first person or zoom should not see through the wall"): H309's "no see through anywhere" carried to the
 * view from the head -- first person, the night vision, the binoculars and the scope. `FUN_0029ae50` (D:L142565-142624)
 * stands that eye 2.5 ahead of the skeleton root standing and crouched (`./cameraRig` `scopeEye`): 1.0 off a wall the
 * body is pressed to at `BODY_RADIUS` 3.5, and `headEye` keeps it as close as 0.1. The frame clips at the map's
 * `m_near_plane` 4 (research 90 §5), so the wall in front was cut away and the room behind it drawn (research 90 §11;
 * `headViewWall.test.ts`, Frostfire's big tanks under the catwalk). `FUN_0029ae50` and its caller `FUN_00295b00`
 * (D:L139949) place the eye and nothing more, so the original's frame makes the same cut (a reading, not a capture).
 * The intended divergence, by the owner's ruling, is the projection only: while a camera face stands inside the near
 * rectangle the head view's near plane is drawn in short of it (`headViewNear`, `FlyCamera.setViewNear`). The eye does
 * not move -- the shot's (`WalkMode.fireAim`), the perception's and the listener's (the drawn camera is the game's in
 * this view) and the use prompt's are the head's as before -- and a point's place on the frame, the reticle's, does
 * not depend on the near plane. Third person keeps the map's 4 (LATER 279: there it would cut the body; the head view
 * hides the body).
 */
export const HEAD_VIEW_NEAR_ADAPTATION = 'the head view, the projection near plane only' as const;
/**
 * The share of the nearest face's distance along the near rectangle's rays the shortened plane takes, so it stays short
 * of the face (and of the view bob's offset window). Not a reading: presentation only (research 90 §11).
 */
const HEAD_VIEW_NEAR_SHARE = 0.9;
/**
 * The shortest near plane the head view takes, a face at the eye: the floor that bounds the depth buffer's loss (the
 * map's 4 over this, 80 times the precision spent near the eye while it lasts). Not a reading (research 90 §11).
 */
export const HEAD_VIEW_NEAR_MIN = 0.05;

/**
 * `HEAD_VIEW_NEAR_ADAPTATION`: the near plane the view from the head at `eye`, looking along `look` (any length), at
 * `aspect`, is drawn with -- null (the map's `m_near_plane`, 4) when no camera face stands between the eye and the
 * map's near rectangle, else `HEAD_VIEW_NEAR_SHARE` of the nearest such face's distance along the rays to its centre,
 * corners and edge midpoints, never under `HEAD_VIEW_NEAR_MIN`. The rectangle at a shorter plane is the same one scaled
 * toward the eye, so those rays bound it. The surfaces are the third-person pass's (`isCameraClassSurface`).
 */
export function headViewNear(grid: Grid | null, eye: Vec3, look: Vec3, aspect: number = GAME_ASPECT,
  accept: (p: WorldPoly) => boolean = isCameraClassSurface): number | null {
  if (!grid) return null;
  const corners = nearRectCorners(eye, add(eye, look), Number.isFinite(aspect) && aspect > 0 ? aspect : GAME_ASPECT);
  if (!corners) return null;
  const rays: Vec3[] = [add(eye, scale(unit(look), NEAR_PLANE)), ...corners];
  for (const [a, b] of [[0, 1], [2, 3], [0, 2], [1, 3]] as const) rays.push(lerp(corners[a]!, corners[b]!, 0.5));
  let t = 1;
  for (const end of rays) {
    const h = segmentHit(grid, eye, end, accept);
    if (h && h.t < t) t = h.t;
  }
  return t < 1 ? Math.max(HEAD_VIEW_NEAR_MIN, NEAR_PLANE * t * HEAD_VIEW_NEAR_SHARE) : null;
}

/** Two or more camera faces within `BURY_REACH` of the target: the target is inside a post, not out in the open. */
function buriedTarget(grid: Grid, target: Vec3, accept: (p: WorldPoly) => boolean): boolean {
  const dirs: Vec3[] = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]];
  let n = 0;
  for (const d of dirs) {
    const h = segmentHit(grid, target, add(target, scale(d, BURY_REACH)), accept);
    if (h && h.t < 0.999 && stopsCamera(h, target)) n++;
  }
  return n >= 2;
}

/**
 * A face the clearance may move for. `FUN_0029cd20` passes over cameratype 1 within 2.75 of the target; the near
 * rectangle does too, or a sheet the main probe ignores would pull the eye in (research 90 §10).
 */
function stopsCamera(hit: { point: Vec3; poly: WorldPoly }, target: Vec3): boolean {
  return hit.poly.cameratype !== 1 || length(sub(hit.point, target)) > TYPE_ONE_CLEAR;
}

/**
 * Keep the eye at least `CAM_MARGIN` from the target, unless that step would cross a camera face. The check is from
 * the point already on the safe side: the 0.75 minimum is what puts the eye through a face the target is against,
 * and staying closer is the departure (research 90 §10).
 */
function separate(grid: Grid, target: Vec3, after: Vec3, accept: (p: WorldPoly) => boolean): Vec3 {
  const off = sub(after, target);
  const reached = length(off);
  if (!(reached > 1e-8 && reached < CAM_MARGIN)) return after;
  const clamped = add(target, scale(off, CAM_MARGIN / reached));
  const crossed = segmentHits(grid, after, clamped, accept).some((h) => h.t > 0.001 && h.t < 0.999 && stopsCamera(h, target));
  return crossed ? after : clamped;
}

/** The corner's signed distance off `plane`, positive on the eye's side of the face. `span` is the look, eye to target. */
function cornerPen(eye: Vec3, span: Vec3, index: number, plane: Vec3, nrm: readonly number[], sign: number, aspect: number): number | null {
  const corners = nearRectCorners(eye, add(eye, span), aspect);
  if (!corners) return null;
  return dot(sub(corners[index]!, plane), nrm) * sign;
}

/**
 * How far to move the eye along a unit `dir` so corner `index` sits `NEAR_CLEAR` off the plane. The gap alone is
 * the step only when the corner moves with the eye; the finite difference is that ratio, with the look target
 * translated by the same step so the rectangle does not yaw. Null when the axis does not carry the corner off the face.
 */
function cornerStep(eye: Vec3, span: Vec3, dir: Vec3, pen: number, index: number, plane: Vec3, nrm: readonly number[], sign: number, aspect: number): number | null {
  const eps = 0.05;
  const moved = add(eye, scale(dir, eps));
  const next = cornerPen(moved, span, index, plane, nrm, sign, aspect);
  if (next === null) return null;
  const slope = (next - pen) / eps;
  if (!(slope > NEAR_SLOPE_MIN)) return null;
  return Math.min(Math.max((NEAR_CLEAR - pen) / slope, NEAR_PUSH_MIN), NEAR_PUSH_MAX);
}

/** Land at `to` unless that step crosses a camera face, in which case stop just short of it, then apply `separate`. */
function shiftEye(grid: Grid, target: Vec3, from: Vec3, to: Vec3, accept: (p: WorldPoly) => boolean): Vec3 {
  const blocked = segmentHits(grid, from, to, accept).find((h) => h.t > 0.001 && h.t < 0.999 && stopsCamera(h, target));
  if (!blocked) return separate(grid, target, to, accept);
  const nrm = blocked.normal;
  const sign = dot(sub(from, blocked.point), nrm) >= 0 ? 1 : -1;
  return separate(grid, target, add(blocked.point, scale(nrm, sign * NEAR_PUSH_MIN)), accept);
}

/**
 * The rendered eye, after `cameraPass`. Not `FUN_0029bf70`: the pass's 0.75 segments stay as read. This only moves
 * the eye the frame is drawn from, so the near rectangle does not enter a camera face (research 90 §10).
 *
 * The look span (`target - eye` on entry) is fixed. A resolved eye and that span are the drawn look: the caller
 * places the look target at `eye + span`, so a lateral slide (the only step that clears a face parallel to the view)
 * translates the camera and does not yaw it off the aim. The focus `target` is the body-side target supplied by the
 * presentation guard; the crossing test, the 0.75 separation and the type-1 filter use it.
 */
function clearNearRect(grid: Grid | null, target: Vec3, eye: Vec3, accept: (p: WorldPoly) => boolean, aspect: number, span = sub(target, eye)): Vec3 {
  if (!grid) return eye;
  const along = unit(span);
  const back = scale(along, -1);
  let out = eye;
  const buried = buriedTarget(grid, target, accept);
  for (let n = 0; n < NEAR_ITERS; n++) {
    const before = out;
    const cross = !buried
      ? segmentHits(grid, target, out, accept).find((h) => h.t > 0.001 && h.t < 0.999 && stopsCamera(h, target))
      : undefined;
    if (cross) {
      const nrm = cross.normal;
      const sign = dot(sub(target, cross.point), nrm) >= 0 ? 1 : -1;
      out = separate(grid, target, add(cross.point, scale(nrm, sign * NEAR_PUSH_MIN)), accept);
    } else {
      const look = add(out, span);
      const corners = nearRectCorners(out, look, aspect);
      if (!corners) return out;
      let pushed = false;
      for (let i = 0; i < corners.length; i++) {
        const corner = corners[i]!;
        const face = segmentHit(grid, out, corner, accept);
        if (!face || face.t <= 0.001 || face.t >= 0.999 || !stopsCamera(face, target)) continue;
        const nrm = face.normal;
        const sign = dot(sub(out, face.point), nrm) >= 0 ? 1 : -1;
        const pen = dot(sub(corner, face.point), nrm) * sign;
        const axes = [scale(nrm, sign), along, back];
        let move = scale(nrm, sign * NEAR_PUSH_MIN);
        for (const dir of axes) {
          if (length(dir) < 1e-8) continue;
          const step = cornerStep(out, span, dir, pen, i, face.point, nrm, sign, aspect);
          if (step === null) continue;
          move = scale(dir, step);
          break;
        }
        const next = shiftEye(grid, target, out, add(out, move), accept);
        if (length(sub(next, out)) < 1e-5) continue;
        out = next;
        pushed = true;
        break;
      }
      if (!pushed) return out;
    }
    if (length(sub(out, before)) < 1e-5) return out;
  }
  return out;
}

/** The placed camera: the eye, the look-at target (`FUN_0029bc90` looks from one to the other) and the aim point. */
/**
 * The camera between two ticks. `eye` and `target` are the DRAWN camera's (the frame's view); `aim` is the game's: the
 * pass's eye and target (`FUN_0029bf70`), the shot's and the order's (`WalkMode.placed`). They differ only by the drawn
 * camera's presentation (#479's review F1, research 382): body-side pull-backs (`HEAD_EYE_WALL_BACK_PLACEHOLDER`) and the near clearance
 * (`NEAR_CLEARANCE_ADAPTATION`, H309). A clearance slide moves `eye` and `target` by the same vector, so the drawn view
 * stays parallel to the aim and the reticle stays at the frame's centre.
 */
export interface CameraView { eye: Vec3; target: Vec3; far: Vec3; aim: { eye: Vec3; target: Vec3 } }
type TickView = { eye: Vec3; target: Vec3; far: Vec3; aimEye: Vec3; aimTarget: Vec3; feet: Vec3; peek: number };

/**
 * LEAD_PROBE_START_PLACEHOLDER (LATER 308; research 201 section 14, research 83 section 8.1): where the downward lead
 * probe (`FUN_0029cbb0`, looking well down: n.y > 0.625) starts. `FUN_0029a950` reads its start z, `param_3[2]` --
 * `sp+0x1c8` of `FUN_00296f10`'s frame, which nothing writes before the call -- and only then writes it
 * (D:L142498-142518): an uninitialised stack word, whatever the last call at that depth left. Two candidates:
 * `'target'`, this frame's target (the probe from the target 8 ahead, as the header reads it; Fuse's `325f24fb6`);
 * `'lastOutput'`, last frame's lead, which the word holds if nothing between two frames' calls writes that slot -- and
 * against a surface inside the 8 it is Z_n = L0 + 8 + W - Z_{n-1}, a two-frame orbit of the eye of several units with
 * the body still (Fuse's disc check r7). Settles it: a PCSX2 read of `sp+0x1c8` at the read, or a capture of the eye at
 * a steep look against a wall.
 */
export const LEAD_PROBE_START_PLACEHOLDER = 'target' as 'target' | 'lastOutput';

/**
 * The camera, a tick at a time (`WalkMode` runs `tick` after each of the mover's ticks) and drawn between the last
 * two (`view`), the way `Walker.eye` draws the feet: smooth at any frame rate.
 */
export class PlayerCamera {
  private pass = newPassState();
  private root: number | null = null;
  /** The last tick's lead (target z), the probe's start under `LEAD_PROBE_START_PLACEHOLDER`'s `'lastOutput'`. */
  private leadFrom: number | null = null;
  /** The last two ticks: the drawn camera (`eye`, `target`, `far`) and the game's eye and target (`aimEye`, `aimTarget`). */
  private prev: TickView | null = null;
  private cur: TickView | null = null;

  constructor(private readonly grid: Grid | null) {}

  /** TRAVERSAL SEAM (`./traversal`'s lean): the peek value `DAT_004161c0`, -1 left .. 1 right, the next tick reads. */
  peek = 0;

  /**
   * The frame's width/height this tick (`FlyCamera.aspect`, which `fit` wrote from the canvas, or the PS2 aspect
   * in that presentation): the near clearance's rectangle (`NEAR_CLEARANCE_ADAPTATION`).
   */
  nearAspect = GAME_ASPECT;

  /** The death camera (`./deathCamera`, `FUN_00297a30`) while the SEAL is dead, else null. */
  death: DeathCamera | null = null;
  /**
   * The dead actor's controller for the death camera's state 7 (`./deathCamera` `deathStickOf`; `FUN_00297a30`
   * D:L141130-141142), set by the walk before its ticks; null is no push. Read only while `death` is set.
   */
  deathStick: DeathStick | null = null;
  /** The death camera was at 7 last tick: its first tick at 7 spends the latch +0x44 (D:L141034-141041). */
  private deathManualWas = false;

  /**
   * INV-SPECTATE C: the blend flag +0x45 -- set by the dead player's teammate view (`SpectatorView.followWatched`,
   * the original's death camera at 7, `FUN_00297410` D:L141028-141032); a spectator's camera stays rigid, and the own
   * body's until its death camera is at 7 (DEATHCAM-MANUAL: `DeathCamera.manual` sets the flag the same way, the first
   * tick at 7 written straight as the bind's latch +0x44 is spent, D:L141034-141041; reading, pending review). While
   * on, each tick moves the stored target and eye toward the tick's new pair by `watchedEaseFactor(dt)` before the pass (`FUN_00296f10` D:L140739-140788, the vector helpers `FUN_00309200` / `FUN_00309180` /
   * `FUN_00309240`); while off, they are written straight (D:L140729-140736). A new bind is a fresh rig or `reset`,
   * whose first tick writes them straight (the latch +0x44, D:L141034-141041).
   */
  ease = false;
  /** The stored target +0x38 and eye +0x2c, the last tick's pair before the pass; null before a tick (a new bind). */
  private stored: { target: Vec3; eye: Vec3 } | null = null;

  /** Forgets the camera: the next tick places it at the goal with no hold, as a new camera does. */
  reset(): void {
    this.pass = newPassState();
    this.root = null;
    this.leadFrom = null;
    this.prev = null;
    this.cur = null;
    this.stored = null;
  }

  /**
   * One tick: the actor's feet, its yaw and the camera's pitch (degrees), its skeleton root's height over the feet.
   * `posed`: the root is the body's as posed this frame, which `FUN_0029a950` reads as it stands (the clips' own
   * blends move it); otherwise it is a stance's measured root, eased to over `ROOT_RATE_READING`.
   */
  tick(feet: readonly number[], yawDegrees: number, pitchDegrees: number, rootY: number, dt: number = TICK, posed = false): void {
    const root = this.root === null || posed ? rootY
      : Math.abs(rootY - this.root) <= ROOT_RATE_READING * dt ? rootY
        : this.root + Math.sign(rootY - this.root) * ROOT_RATE_READING * dt;
    this.root = root;
    const local = localCamera(root, pitchDegrees, this.peek);
    const world = (v: readonly number[]): Vec3 => toWorld(feet, yawDegrees, v);
    let lead = local.target[2];
    if (local.probe && this.grid) {
      const from = LEAD_PROBE_START_PLACEHOLDER === 'lastOutput' ? this.leadFrom ?? lead : lead;
      const a = world([local.target[0], local.target[1], from]), b = world([local.target[0], local.target[1], from + LEAD_DOWN]);
      // FUN_0029cbb0 D:L143678 casts in mode 0, then FUN_0029cd20 picks (D:L143689; research 382 §3).
      const h = segmentHits(this.grid, a, b, isPeekCameraSurface)
        .find((hit) => hit.poly.cameratype !== 1 || length(sub(hit.point, a)) > TYPE_ONE_CLEAR);
      if (h) lead += Math.hypot(b[0] - h.point[0], b[2] - h.point[2]);
    }
    this.leadFrom = lead;
    const targetL: Vec3 = [local.target[0], local.target[1], lead];
    const eyeL = add(targetL, scale(local.back, local.dist));
    // FUN_00297410 (decomp 140987-141028): far = targetL + rotate(actor+0x1070, (0, 0, -1000)) -- the look quaternion
    // turns a straight-ahead vector, so the peek's shift moves the eye and the target across and leaves the aim parallel
    // to the body's facing. (Along `-back` the aim swung ~5.7 degrees back toward the body at a held right peek.)
    // DEAD (`./deathCamera`): the orbit laid on the local eye and the aim, the killer's point blended into the aim.
    const d = this.death;
    const ahead = scale(local.ahead, CAM_FAR);
    let eye0 = world(d ? deathEye(d, eyeL, feet, yawDegrees, dt, this.deathStick ?? undefined) : eyeL);    // the orbit turns first (141213-141221)
    let far = world(add(targetL, d ? orbit(d, ahead) : ahead));
    if (d) far = deathFar(d, far, dt);
    // FUN_00296f10: the target on the line from the eye to the aim, `dist` from the eye.
    const accept = this.peek !== 0 ? isPeekCameraSurface : isCameraClassSurface;
    // FUN_00296f10: the target on the line from the eye to the aim, `dist` from the eye.
    let target = add(eye0, scale(unit(sub(far, eye0)), local.dist));
    // INV-SPECTATE C: the +0x45 blend (D:L140737-140788), the stored pair moved toward the new by the factor; else (and
    // on a new bind's first tick) the stored pair written straight (D:L140729-140736, D:L141034-141041).
    const was = this.stored;
    // DEATHCAM-MANUAL: the own body's death camera at 7 sets the flag too (D:L141028-141032), its first tick at 7 the latch's.
    const manual = d?.manual === true, latch = manual && !this.deathManualWas;
    this.deathManualWas = manual;
    if ((this.ease || manual) && was && !latch) {
      const f = watchedEaseFactor(dt);
      target = add(was.target, scale(sub(target, was.target), f));
      eye0 = add(was.eye, scale(sub(eye0, was.eye), f));
    }
    this.stored = { target, eye: eye0 };
    // The game's eye: FUN_0029bf70's pass alone, at every aspect -- the one the shot and the order are claimed from.
    const passed = cameraPass(this.grid, target, eye0, this.pass, dt, accept);
    // H309's drawn-camera protection also covers an ordinary downward target beyond a wall (research 382 §1).
    // Neither the target nor the pass's eye is a safe anchor: each is pulled back from the body's axis.
    const draw = this.draw(feet, target, passed, accept, this.peek !== 0);
    const next = { eye: draw.eye, target: draw.target, far, aimEye: passed, aimTarget: target,
      feet: [feet[0]!, feet[1]!, feet[2]!] as Vec3, peek: this.peek };
    this.prev = this.cur ?? next;
    this.cur = next;
  }

  /** Draws the last tick again at `view(0)` and `view(1)` alike: after a run of ticks driven by hand. */
  settle(): void {
    if (this.cur) this.prev = this.cur;
  }

  /** The camera between the last two ticks, `alpha` of the way (the mover's part-tick); null before the first tick. */
  view(alpha: number): CameraView {
    const cur = this.cur, prev = this.prev ?? cur;
    if (!cur || !prev) return { eye: [0, 0, 0], target: [0, 0, -1], far: [0, 0, -CAM_FAR], aim: { eye: [0, 0, 0], target: [0, 0, -1] } };
    const t = Math.max(0, Math.min(1, alpha));
    const eye = lerp(prev.eye, cur.eye, t), target = lerp(prev.target, cur.target, t);
    // Safe endpoints need not have a safe chord around a corner. Recheck the frame actually drawn, without
    // advancing the pass's timers or touching the interpolated game aim (H309, research 382 §1).
    const draw = this.draw(lerp(prev.feet, cur.feet, t), target, eye,
      (t < 1 ? prev.peek : cur.peek) !== 0 ? isPeekCameraSurface : isCameraClassSurface,
      (t < 1 ? prev.peek : cur.peek) !== 0);
    return {
      eye: draw.eye, target: draw.target, far: lerp(prev.far, cur.far, t),
      aim: { eye: lerp(prev.aimEye, cur.aimEye, t), target: lerp(prev.aimTarget, cur.aimTarget, t) },
    };
  }

  /** Presentation only: preserve the ordinary look span and the existing peek correction; never change the game pass. */
  private draw(feet: readonly number[], target: Vec3, eye: Vec3, accept: (p: WorldPoly) => boolean, peek: boolean): { eye: Vec3; target: Vec3 } {
    const bodySide = (point: Vec3): Vec3 => {
      if (!this.grid) return point;
      const axis: Vec3 = [feet[0]!, point[1], feet[2]!];
      const hit = segmentHits(this.grid, axis, point, accept).find((h) => stopsCamera(h, target));
      return hit ? add(hit.point, scale(unit(sub(axis, point)), HEAD_EYE_WALL_BACK_PLACEHOLDER)) : point;
    };
    const focus = bodySide(target);
    const pulled = bodySide(eye);
    // Keep the existing peek's two-anchor presentation; ordinary poses preserve their original look span.
    const span = peek ? sub(focus, pulled) : sub(target, eye);
    const aspect = Number.isFinite(this.nearAspect) && this.nearAspect > 0 ? this.nearAspect : GAME_ASPECT;
    const out = clearNearRect(this.grid, focus, pulled, accept, aspect, span);
    return { eye: out, target: add(out, span) };
  }

  /** The pass's distance, `DAT_003de268`. */
  distance(): number {
    return this.pass.dist;
  }

  /** The pass's hold, seconds left (`cam+0x4c`). */
  hold(): number {
    return this.pass.hold;
  }

  /** The root height the camera stands on (the stance's, moving to a new one over 0.2 s). */
  rootY(): number {
    return this.root ?? 0;
  }
}

/**
 * The camera's pitch limits in a stance, degrees: the aim pitch's (`FUN_00594600`; the header) -- `min/max_aim_pitch`
 * standing and crouched, the prone pair lying down, moved by `lean` (`../look` `proneAimLean`, PRONE-TILT-2 (1)).
 */
export function pitchLimits(stance: Stance, lean = 0): [number, number] {
  if (stance !== 'prone') return [SEAL_TUNING.aimPitch[0], SEAL_TUNING.aimPitch[1]];
  const [min, max] = SEAL_TUNING.proneAimPitch;
  return lean === 0 ? [min, max] : [min + lean, max + lean];
}


/** A world point's place on the frame, 0..1 across and down (the reticle's `setAimPoint`), through `camera`. */
export function aimPoint(camera: Camera, point: readonly number[]): [number, number] {
  const ndc = new Vector3(point[0], point[1], point[2]).project(camera);
  return [(ndc.x + 1) / 2, (1 - ndc.y) / 2];
}

import {
  GAME_FRAME_DT, isCameraSurface, segmentHit, segmentHits, surfaceWord, SURFACE_SIDE, SURFACE_SKIP, type Grid, type WorldPoly,
} from '@s2u/scene';
import { isCameraClassSurface, type Stance } from './mover';

/**
 * The third-person camera's geometry, headless (moved out of `./playerCamera` for the shared sim, OWNER-3 of the launch
 * review): where `FUN_0029a950` puts the look-at target and the eye in the actor's space, where `FUN_00297410` aims
 * (the far point, `CAM_FAR` along the pitched look), and the scope's eye over the feet. The page's `PlayerCamera`
 * runs these every tick; the match server (`@s2u/match`, through `./sim`) reads the same numbers to check that a
 * round's eye and aim are where this camera could have put them (`./net/shotCone`). The derivations are in
 * `./playerCamera`'s header; nothing here reads the hull but `headEye`, the line page and room both keep the head's eye
 * off a wall along (the pass, `cameraPass`, stays with the page's camera).
 */

export type Vec3 = [number, number, number];

const unit = (a: readonly number[]): Vec3 => {
  const l = Math.hypot(a[0]!, a[1]!, a[2]!);
  return l > 0 ? [a[0]! / l, a[1]! / l, a[2]! / l] : [0, 0, 0];
};

/** `FUN_0029a950`: the goal this far behind the target at a level pitch (`fStack_8 + 28.0`). */
export const CAM_BACK = 28;
/** `FUN_0029a950`: the distance a vertical look closes to (`14.0 - *param_4`). */
export const CAM_CLOSE = 14;
/** `FUN_0029bf70`: the probe's reach past the goal, the stand-off from a hit, the side probes' length (0.75). */
export const CAM_MARGIN = 0.75;
/** `FUN_00297410`: the aim point, this far along the pitched look from the target. */
export const CAM_FAR = 1000;
/** `FUN_0029a950`'s ramp (research 17 section 3). */
const RAMP_FROM = 2.169155, RAMP_SCALE = 0.2914734, RAMP_TOP = 5.6;
/** `FUN_0029a950`'s target lead, times `n.y`: `DAT_003de278` -8 looking down, `DAT_003de288` -3 looking up. */
export const LEAD_DOWN = -8, LEAD_UP = -3;
/** `DAT_003de280`: a lead under this probes ahead for a wall (`FUN_0029cbb0`). */
export const LEAD_PROBE = -5;

const DEG = Math.PI / 180;

/** `FUN_0029a950`'s ramp: 10 with no root (0), else 5.5 to 10 as the root rises from 2.169 to 5.6. */
export function ramp(rootY: number): number {
  if (rootY === 0) return 10;
  const f = rootY < RAMP_TOP ? Math.min(1, Math.max(0, (rootY - RAMP_FROM) * RAMP_SCALE)) : 1;
  return f * 4.5 + 5.5;
}

/** The look-at target's height over the feet: `rootY + ramp(rootY)` -- 21.484 standing, 15.378 crouched. */
export function lookHeight(rootY: number): number {
  return rootY + ramp(rootY);
}

/** `FUN_0029a950`'s output in actor space (+z behind): the target, the eye, the distance and the unit back axis. */
export interface LocalCamera {
  target: Vec3;
  eye: Vec3;
  dist: number;
  /** `n`: the unit vector from the target toward the eye. */
  back: Vec3;
  /**
   * The look: `rotate(actor+0x1070, (0, 0, -1))`, the pitched straight ahead `FUN_00297410` aims 1000 along from the
   * target. Not `-back`: the peek's shift is in `v`, and so in `back`, but never in the aim (decomp 140987-140996).
   */
  ahead: Vec3;
  /** Whether the lead is under -5: the target's probe ahead runs (`FUN_0029cbb0`). */
  probe: boolean;
}

/**
 * TRAVERSAL SEAM (web research 86 section 4): `FUN_0029a950`'s peek, the target's shift across the actor for the peek
 * value `DAT_004161c0` (-1 left .. 1 right): `peek x 2.5` to the left, `peek x 2.8` to the right (decomp 142476-142484).
 */
export function peekShift(peek: number): number {
  return peek < 0 ? peek * 2.5 : peek * 2.8;
}

/**
 * TRAVERSAL SEAM: the scope's eye's shift across for the peek value (`FUN_0029ae50`, the game's eye camera, decomp
 * 142613-142617):
 * `peek x 3.3` to the left, `peek x 4.35` to the right.
 */
export function scopePeekShift(peek: number): number {
  return peek < 0 ? peek * 3.3 : peek * 4.35;
}

/**
 * `FUN_0029a950` at a root height and a pitch (degrees, up positive), the root's x, z at 0, and the peek value
 * (`peekShift`; 0, no peek, by default): `v = (shift, 0, 28)`, `dist = |v|`, `n = normalize(pitch(v))`.
 */
export function localCamera(rootY: number, pitchDegrees: number, peek = 0): LocalCamera {
  const p = pitchDegrees * DEG;
  const shift = peekShift(peek);
  // (shift, 0, 28) turned about x by the pitch, normalised: looking down (p < 0) lifts the eye.
  const back: Vec3 = unit([shift, -Math.sin(p) * CAM_BACK, Math.cos(p) * CAM_BACK]);
  const ny = back[1];
  const lead = ny < 0 ? ny * LEAD_UP : ny * LEAD_DOWN;
  const flat = Math.hypot(CAM_BACK, shift);
  const dist = flat + Math.abs(ny) * (CAM_CLOSE - flat);
  const target: Vec3 = [shift, lookHeight(rootY), lead + 0];
  return {
    target, dist, back, probe: ny >= 0 && lead < LEAD_PROBE, ahead: [0, Math.sin(p), -Math.cos(p)],
    eye: [target[0] + back[0] * dist, target[1] + back[1] * dist, target[2] + back[2] * dist],
  };
}

/** Actor space to world: the actor at `feet`, facing `yaw` degrees (`camera.ts`: yaw 0 looks down -z). */
export function toWorld(feet: readonly number[], yawDegrees: number, v: readonly number[]): Vec3 {
  const y = yawDegrees * DEG, c = Math.cos(y), s = Math.sin(y);
  return [feet[0]! + v[0]! * c + v[2]! * s, feet[1]! + v[1]!, feet[2]! - v[0]! * s + v[2]! * c];
}

/**
 * `FUN_0029ae50`'s operands (D:L142565-142624; research 180 §1.3, confirmed by V1 #2 in its §8.3; research 84 §7 read
 * the formula first): the view from the head places its eye at the camera's node -- `cam+0xc8`, the body's `+0x2e8`
 * when no part is named (`FUN_002956e0` D:L139749-139750), which the `CZSealBody` constructor `FUN_0028e7b0`
 * (D:L419606-419608) fills with `FindPart("skel_root")` -- at its posed position, plus (0, `lift`, `ahead`) standing and
 * crouched; prone (action 2), y + (max(`proneLook` x q, 0) + `proneBase`) x `proneScale` / max(n_y, `normalFloor`) and
 * z = max(n_y, `normalFloor`) x `proneAhead` (0.7 x -7). [reading: the operands are the instructions'; that
 * `FUN_00295b00`'s view (which calls it, D:L139949) is the scope's and first person's is one interpretive step
 * (research 84/86); the z of 0 while `FUN_005a78d0` or `FUN_005a77e0(body, 1, 1, 1)` answers is not taken. Owed: a
 * first-person frame standing and prone with PINE `cam+0xd8` against the actor's `+0x1c..+0x24` (PLAT-36; research 206
 * §4.4 S2 item 2).]
 */
export const SCOPE_EYE_READING = {
  lift: 4.4, ahead: -2.5, proneBase: 1.8, proneLook: 6, proneScale: 2, normalFloor: 0.5, proneAhead: 0.7 * -7,
} as const;

/** The prone eye's two inputs: the look term q (`cam+0xb4` -> `+0x24`) and the ground normal's y (`body+0x1348`). */
export interface ProneEyeTerms { look: number; groundNormalY: number }

/**
 * The prone eye's look term q as page and room take it: a level look (q's meaning is owed: research 180 §1.3, "its
 * exact meaning is owed"; at a level or downward look max(6q, 0) is 0). Was `PRONE_EYE_TERMS_PLACEHOLDER`'s `look`;
 * its `groundNormalY` is now the body's own (`proneEyeTerms`, PRONE-TILT-2 (2)). Flat and level, the eye is 3.6 over the
 * root and 4.9 ahead.
 */
export const PRONE_EYE_LOOK_PLACEHOLDER = 0;

/**
 * PRONE-TILT-2 (2) (research 217 s7.7; reading, pending review): the prone eye's terms for a body whose saved floor normal
 * has y `groundNormalY` -- `FUN_0029ae50` reads the body's `+0x1348` (D:L142596), the y of the normal `FUN_0059b440`
 * saves at `+0x1344..+0x134c` each grounded tick (`./mover` `Walker.floorNormal`; not the tilt's `+0x410`). The room's
 * frame carries it (`./net/shotCone` `AimFrame.groundNormalY`, the room's walker's after the command) and the page takes
 * its own walker's, so the two place the same eye. Absent (a body with no walker): flat, 1.
 */
export function proneEyeTerms(groundNormalY = 1): Readonly<ProneEyeTerms> {
  return { look: PRONE_EYE_LOOK_PLACEHOLDER, groundNormalY };
}
const FLAT_PRONE_EYE: Readonly<ProneEyeTerms> = proneEyeTerms();

/**
 * The view from the head's eye in the actor's space (x right, y up over the feet, -z ahead): `FUN_0029ae50` on the
 * skeleton root at `root` over the feet (the posed one the animator hands the camera, or the stance's measured
 * `./mover` `rootY`), shifted across by the peek (`scopePeekShift`, the same function's x 3.3 / x 4.35).
 * First person, the scope and the room's head (`./net/shotCone` `headPoint`) all stand on it (PF-05).
 */
export function scopeEye(stance: Stance, root: number, peek = 0, terms: Readonly<ProneEyeTerms> = FLAT_PRONE_EYE): Vec3 {
  const e = SCOPE_EYE_READING;
  const x = scopePeekShift(peek);
  if (stance !== 'prone') return [x, root + e.lift, e.ahead];
  const n = Math.max(terms.groundNormalY, e.normalFloor);
  return [x, root + (Math.max(e.proneLook * terms.look, 0) + e.proneBase) * e.proneScale / n, n * e.proneAhead];
}

/**
 * Units the view from the head's eye is kept short of a wall between it and the body's axis (`./playerCamera`
 * `headEye`, the room's `startRefused`) [estimate: a hair, only to stay on the body's side]. Kept by PF-16: the prone
 * fan (`./mover` `PRONE_FAN_READING`) keeps a body crawled into a wall 8.0 off it, the eye 4.9 ahead inside, but it is
 * cast along the travel, not the facing -- strafing prone along a wall (3.12 off it) or peeking, the eye stands past
 * the face, in the original too (research 217 s2.4). LATER 279 does not close it: this host has no decompilation to
 * re-read, and the note says the original has no such stand-off. Needs a disc reading of `FUN_0029ae50`
 * (D:L142565-142624) before the constant can be retired; the tests that take `headEye` out go red (research 217 §2.4).
 * Also the third-person drawn camera's peek target and eye, at every aspect (`./playerCamera` `PlayerCamera.tick`, H309;
 * #479's takeover and re-review F3): presentation only, the game's eye stays the pass's (`CameraView.aim`); unsourced
 * there too (`FUN_0029bf70` has no such pull).
 */
export const HEAD_EYE_WALL_BACK_PLACEHOLDER = 0.1;

/**
 * The view from the head never passes a wall (PF-05): `FUN_0029ae50`'s eye (`scopeEye`: 4.9 ahead prone, 2.5 crouched
 * or standing, the peek across) may stand past a wall the body is pressed to, at `BODY_RADIUS` 3.5. Cast level from the
 * body's axis (the feet's x, z at the eye's height) to the eye; a camera surface between puts the eye
 * `HEAD_EYE_WALL_BACK_PLACEHOLDER` short of the hit, back along that line. One line for page and room: the page's
 * camera (`./walk` `follow`) and the room's starts (`room.ts` `startRefused`, from the exact `./net/shotCone`
 * `headPoint`) both call this, so an eye the page keeps short of a wall is the head the room measures from. The
 * surfaces differ only in strictness: the page's camera stops at a camera surface (`accept`, `isCameraSurface`); the
 * room passes every polygon, so a surface the camera skips (`cameratype` bit 19) still holds its head on the body's
 * side and no start is measured from past it.
 */
export function headEye(grid: Grid | null, feet: readonly number[], eye: Vec3,
  accept: (p: WorldPoly) => boolean = isCameraSurface): Vec3 {
  if (!grid) return eye;
  const axis: Vec3 = [feet[0]!, eye[1], feet[2]!];
  const hit = segmentHit(grid, axis, eye, accept);
  if (!hit) return eye;
  const back = unit([axis[0] - eye[0], axis[1] - eye[1], axis[2] - eye[2]]);
  const k = HEAD_EYE_WALL_BACK_PLACEHOLDER;
  return [hit.point[0] + back[0] * k, hit.point[1] + back[1] * k, hit.point[2] + back[2] * k];
}

/** The view from the head's eye over the feet (`scopeEye`'s y): 15.884 standing on 11.484, 9.904 crouched on 5.504. */
export function scopeEyeHeight(stance: Stance, root: number): number {
  return scopeEye(stance, root)[1];
}

// ---- the pass (`FUN_0029bf70`): moved here from `./playerCamera` for LATER 305, one pass for the page and the room ----

const sub = (a: readonly number[], b: readonly number[]): Vec3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const add = (a: readonly number[], b: readonly number[]): Vec3 => [a[0]! + b[0]!, a[1]! + b[1]!, a[2]! + b[2]!];
const scale = (a: readonly number[], k: number): Vec3 => [a[0]! * k, a[1]! * k, a[2]! * k];
const length = (a: readonly number[]): number => Math.hypot(a[0]!, a[1]!, a[2]!);

/** The pass's default tick: the mover's (`walk.ts`), the port's 60 Hz tick -- not the game's frame, `GAME_FRAME_DT` (PF.R8, research 208). */
const PASS_TICK = 1 / 60;
/** `FUN_0029bf70`: how far the distance lets out a game frame (`GAME_FRAME_DT`) after the hold (`DAT_003de270` = 0.03). */
export const CAM_REGROW = 0.03;
/** `FUN_0029bf70`: the hold after a hit, seconds (`cam+0x4c = 0x3fc00000`). */
export const CAM_HOLD = 1.5;
/** `FUN_0029bf70`: under this distance the hold does not hold (`3.3000002`). */
const CAM_HOLD_FLOOR = 3.3;
/** `FUN_0029cd20`: a camera-type-1 polygon this near the target is passed over by the main probe (and the near rectangle's, `./playerCamera`). */
export const TYPE_ONE_CLEAR = 2.75;
/**
 * TRAVERSAL SEAM: the surfaces the pass tests while peeking -- `FUN_0029bf70` sets `FUN_002d4fd0(DAT_004161c0 == 0)`
 * (decomp 143369-143373), so a peek puts the probes in the movement's mode: bit 18 skipped, not bit 19.
 */
export const isPeekCameraSurface = (p: WorldPoly): boolean => (surfaceWord(p) & (SURFACE_SIDE | SURFACE_SKIP)) === SURFACE_SIDE;

/** What `FUN_0029bf70` keeps between frames: `DAT_003de268` (the distance) and `cam+0x4c` (the hold). */
export interface PassState { dist: number; hold: number }

/** `DAT_003de268`'s start value in the ELF: 10000, so the first frame takes the goal's distance at once. */
export const newPassState = (): PassState => ({ dist: 10000, hold: 0 });

/**
 * `FUN_0029bf70`: the eye after the pass, from the target and the eye `FUN_00296f10` hands it (the header). The
 * surfaces by default mode 1's: bit 19 skipped, bit 18 tested, a VOLUMETRIC material skipped (`./mover`
 * `isCameraClassSurface`, `FUN_002d2890` D:L174845-174864; research 230 §3.4) -- the page's pass and the room's
 * reproduction of it (`./net/shotCone` `reproducedEye`) alike; a peek's is `isPeekCameraSurface`.
 */
export function cameraPass(grid: Grid | null, target: Vec3, eye: Vec3, state: PassState, dt: number = PASS_TICK,
  accept: (p: WorldPoly) => boolean = isCameraClassSurface): Vec3 {
  const hit = (a: Vec3, b: Vec3): Vec3 | null => (grid ? segmentHit(grid, a, b, accept)?.point ?? null : null);
  const toTarget = sub(target, eye);
  const dir = unit(toTarget);
  const reach = length(toTarget) + CAM_MARGIN;
  // FUN_0029cd20: the main probe's pick, and DAT_00416038 -- any hit at all, kept or passed over.
  const hits = grid ? segmentHits(grid, target, sub(target, scale(dir, reach)), accept) : [];
  const any = hits.length > 0;
  const main = hits.find((h) => h.poly.cameratype !== 1 || length(sub(h.point, target)) > TYPE_ONE_CLEAR)?.point ?? null;
  if (state.hold > 0) state.hold -= dt;
  if (reach > state.dist) {
    // DAT_003de270 a game frame (PF-02): a tick of dt lets out 1 - (1 - 0.03)^(dt / GAME_FRAME_DT) of the gap.
    if (state.hold <= 0 || state.dist < CAM_HOLD_FLOOR || any) {
      state.dist += (1 - (1 - CAM_REGROW) ** (dt / GAME_FRAME_DT)) * (reach - state.dist);
    }
  } else {
    state.dist = reach;
  }
  let out: Vec3;
  let u: Vec3;                                                          // uStack_10: the eye-to-target axis
  if (main === null) {
    out = sub(target, scale(dir, state.dist));
    u = scale(dir, state.dist);
  } else {
    const v = sub(main, target);
    state.dist = Math.min(state.dist, Math.max(CAM_MARGIN, length(v) - CAM_MARGIN));
    out = add(target, scale(unit(v), state.dist));
    u = scale(dir, reach);
    state.hold = CAM_HOLD;
  }
  // The four side probes, all from the eye as it stands now.
  const flat = Math.hypot(u[2], u[0]);
  const side: Vec3 = flat > 0 ? [(-u[2] / flat) * CAM_MARGIN, 0, (u[0] / flat) * CAM_MARGIN] : [0, 0, 0];
  const cross: Vec3 = [side[1] * u[2] - side[2] * u[1], side[2] * u[0] - side[0] * u[2], side[0] * u[1] - side[1] * u[0]];
  const up = scale(unit(cross), CAM_MARGIN);
  const ends = [add(out, side), sub(out, side), add(out, up), sub(out, up)] as const;
  const [a, b, c, d] = ends.map((end) => hit(out, end));
  const start = out;
  out = [...start];
  if (a && b) out = add(a, scale(sub(b, a), 0.5));
  else if (a) { out[0] += a[0] - ends[0][0]; out[2] += a[2] - ends[0][2]; }
  else if (b) { out[0] += b[0] - ends[1][0]; out[2] += b[2] - ends[1][2]; }
  if (c && d) out = add(c, scale(sub(d, c), 0.5));
  else if (c) out = add(out, sub(c, ends[2]));
  else if (d) out = add(out, sub(d, ends[3]));
  if (a || b || c || d) state.hold = CAM_HOLD;
  const off = sub(out, target);
  if (length(off) < CAM_MARGIN) out = add(target, scale(unit(off), CAM_MARGIN));
  return out;
}

/**
 * SCOPE-EXIT-AIM: the look carried across the scope's edge -- the owner's intentional divergence (research 381 section 6;
 * `SCOPE_EXIT_AIM_CARRY_ADAPTATION`). Pure: no state, nothing of the original's changed.
 *
 * The original (r0004, captured on PC 3, hand-scored, unreviewed; research 381 section 6): leaving the scope or the
 * binoculars, the camera's offset `cam+0x480/+0x484` falls to 0 (`FUN_005b9030` D:L471951-471957: the sway is drawn only
 * at view state 5 and up across, 4 and up down) and the look is unchanged, so the view jumps back by the sway's offset;
 * the kit's sway holds through the time out and resumes on re-entry, so the scope re-opens offset.
 *
 * The page's rule ("A-prime", stateless): at a view change that crosses the scope's 4-edge, the look turns by the angle
 * the scoped side's sway offset draws, so the drawn aim stays put -- out (>= 4 -> < 4) onto the cross the scope showed,
 * in (< 4 -> >= 4) by the exact inverse, so the scope opens with its cross on the centre the player saw. From the sway
 * now (never stored), at the level's magnification (the state's target, `Zoom.target()`), per axis as `scopeViewOffset`
 * gives it (the binoculars carry y only), through the direction: the cross's tangent point turned by the camera's YXZ
 * rotation, then yaw = atan2, pitch = asin -- not an atan per axis. Level steps inside the scope (5 <-> 6 ...) and
 * 4 <-> 5 are not transitions: they keep the original's move of the cross.
 */
import { MAP_FOV, scopeViewOffset } from './accuracy';
import { SCREEN, viewOffset } from './look';

/**
 * The owner's intentional divergence, MISSION OT.R136 (simulation track; research 381 section 6, its adaptations table;
 * named `*_ADAPTATION` as `CLAN_BAND_ALIGN_ADAPTATION` names an intended divergence, so the ledger holds it; the owner's
 * ruling relayed by the main controller 2026-11-22T05:02:55Z after the deciding capture): leaving the scope or the binoculars, the look turns so the
 * aim stays where the scoped cross was, and entering gives it back; the scoped sway (value, rate, limits, phase), the
 * knock and the rounds stay the original's. One rule for every player, no option. His words (verbatim): "kill is
 * requesting that the position of the crosshair moves with the sway of the zoomed in scope. so when you zoom back out
 * after swaying you don't get an awkward jittery adjustment in position. he demo'd it with an m4a1, and after watching, i
 * agree - if the original is not like this, it will be our fix to implement as an inentional divergenc.e" The original
 * jumps back (the capture, research 381 section 6).
 */
export const SCOPE_EXIT_AIM_CARRY_ADAPTATION =
  'the aim kept at the scoped cross on leaving the scope, given back on entering; the sway untouched -- the owner\'s intentional divergence, MISSION OT.R136' as const;

/** The look's turn, radians: yaw left positive (three.js about +y, wrapped to (-pi, pi]), pitch up positive. */
export interface LookCarry { dyaw: number; dpitch: number }

/** The look a carry starts from, radians, as `FlyCamera` holds it (YXZ: yaw about +y, then pitch about x). */
export interface CarryPose { yaw: number; pitch: number }

/** The page's base vertical FOV in degrees (`matchFirearm.ts` `baseFov`: twice the map camera's vfov). */
const MAP_BASE_FOV = (2 * MAP_FOV.vfov * 180) / Math.PI;

const NONE: LookCarry = { dyaw: 0, dpitch: 0 };

/**
 * The tangent point of the frame's centre under the kit's offset, camera space (x right, y up, at z = -1): the scope's
 * fixed cross, as `FlyCamera.setKitOffset` draws it (`./look` `viewOffset`, a frame 448 high at the vertical FOV whose
 * half-tangent is tan(base / 2) / m, `Zoom.fov`).
 */
export function crossTangent(state: number, sway: readonly [number, number], levelMag: number, baseFovDeg = MAP_BASE_FOV): [number, number] {
  const [sx, sy] = scopeViewOffset(state, sway);
  if (sx === 0 && sy === 0) return [0, 0];
  const [ox, oy] = viewOffset(sx, sy);                 // the window's shift, page pixels right and down
  const perPx = (2 * Math.tan((baseFovDeg * Math.PI) / 360)) / (levelMag * SCREEN.height);
  return [ox * perPx, -oy * perPx];
}

const wrap = (a: number): number => {
  const t = a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
  return t <= -Math.PI ? t + 2 * Math.PI : t;
};

/** (x, y, z) turned by pitch about x, then yaw about y (three.js 'YXZ': R = Ry(yaw) Rx(pitch)). */
function turned(x: number, y: number, z: number, yaw: number, pitch: number): [number, number, number] {
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
  const y1 = y * cp - z * sp, z1 = y * sp + z * cp;
  return [x * cy + z1 * sy, y1, -x * sy + z1 * cy];
}

/** The look along a direction: yaw = atan2(-x, -z) (the camera looks down -z), pitch = asin of y over the length. */
function lookAlong(d: readonly [number, number, number]): CarryPose {
  return { yaw: Math.atan2(-d[0], -d[2]), pitch: Math.atan2(d[1], Math.hypot(d[0], d[2])) };
}

/**
 * The look's turn at a view change `from` -> `to` (`SCOPE_EXIT_AIM_CARRY_ADAPTATION`): out of the scope (>= 4 -> < 4),
 * the turn that puts the look on the cross the scoped side drew; into it (< 4 -> >= 4), the exact inverse -- the look
 * whose cross falls on the look's centre now. Not a transition (both sides >= 4, or both < 4): none. `sway` the kit's
 * now (`Accuracy.state().sway`), `levelMag` the scoped side's level magnification (9 the binoculars, `ZoomMode[s - 4]`).
 */
export function scopeCarry(from: number, to: number, sway: readonly [number, number], levelMag: number, pose: CarryPose, baseFovDeg = MAP_BASE_FOV): LookCarry {
  const out = from >= 4 && to < 4, into = from < 4 && to >= 4;
  if (!out && !into) return NONE;
  const [tx, ty] = crossTangent(out ? from : to, sway, levelMag, baseFovDeg);
  if (tx === 0 && ty === 0) return NONE;
  if (out) {
    const to3 = lookAlong(turned(tx, ty, -1, pose.yaw, pose.pitch));
    return { dyaw: tx === 0 ? 0 : wrap(to3.yaw - pose.yaw), dpitch: to3.pitch - pose.pitch };
  }
  // In: c = (tx, ty, -1) / n; the pitch p' with (Rx(p') c).y = sin(pitch), i.e. cy cos p' - cz sin p' = sin(pitch) --
  // of its two roots, the one nearest the look's pitch. Then the yaw that turns Rx(p') c onto the look's heading.
  const n = Math.hypot(tx, ty, 1), cx = tx / n, cy = ty / n, cz = -1 / n;
  const a = cy, b = -cz, r = Math.hypot(a, b), phi = Math.atan2(b, a);
  const k = Math.acos(Math.max(-1, Math.min(1, Math.sin(pose.pitch) / r)));
  const p1 = phi + k, p2 = phi - k;
  const p = Math.abs(wrap(p1 - pose.pitch)) <= Math.abs(wrap(p2 - pose.pitch)) ? wrap(p1) : wrap(p2);
  const v = turned(cx, cy, cz, 0, p);
  const dyaw = tx === 0 ? 0 : wrap(-Math.atan2(-v[0], -v[2]));
  return { dyaw, dpitch: p - pose.pitch };
}

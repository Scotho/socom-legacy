import { segmentHit, surfaceMaterial, type Grid, type V3, type WorldPoly } from '@s2u/scene';
import { aimHitKept, aimQueryAdmits } from './net/aimQuery';

/**
 * LANE-KILL B-06 (research 256 s5.3; reading of r0004, two readers -- agent-mail pilot/kill/item-1-aim-source.md and
 * item-1-aim-second-read.md, AGREE WITH CORRECTIONS; reading, pending review): the body's throw aim, the vector
 * `actor+0x144c..0x1454` whose y is `+0x1450`. r0004 writes it every frame in `0x5e6690` (r0001 `FUN_005deec0`), called
 * from the body's aim step `0x5e7450` at 0x5e75cc and from the aim point's setter `0x5e6cb0` at 0x5e6db8. It is geometry,
 * not the camera's pitch: no smoothing, no stick term. Its readers are the release clearance (`0x54e6f0`, all three
 * floats), `GetThrowAnim`'s toss test (`0x585280` at 0x5852b8, the y), the hand-open (`0x5c8860`: its elevation from the
 * y at 0x5c9640-0x5c9680 and its own 25 u cast along all three floats, 0x5c92b4-0x5c93ac) and the drawn arc (`0x59cbb0`
 * at 0x59cca4, the y; agent-mail pilot/kill/item-1-arc-read.md). `actor+0x228` is only the network's byte copy of the y
 * (0x2bf8f0-0x2bf948). The page's (`grenadeCore.ts`); the room's own (`room.ts` `throwGrenade`) is owed.
 */

/**
 * READING (named; research 256 s7): the stance's aim cone `0x5e6dd0` holds the wanted vector to, degrees. States 0, 1
 * and 6 read one set (inside test 0x44f674/0x44f678/0x44f67c, the clamp's angles 0x44f638/0x44f63c/0x44f640), state 2
 * (prone) the other (0x44f680..0x44f688, 0x44f644..0x44f64c); any other state writes nothing. The six words lie in the
 * image's BSS (past the file's data), so their values cannot be read off the ELF: these are the constructor's defaults
 * (its stores at 0x42da3c-0x42da84: +85 / -85 / 85 standing and crouched, +20 / -20 / 45 prone) as the named stand-in.
 * Whether `dynamics.rdr`'s `max/min_aim_pitch` (60 / -70), `max_aim_yaw` (85) and the prone pair replace them
 * (`SEAL_TUNING.aimPitch`, research 83 s3) is inference, their writer not found. The clamp `0x5b3d60` (r0001
 * `FUN_005ae040`) takes the pitch as acos(h) signed by y and the yaw as acos(c) signed by x and holds each inside its
 * pair; its tail -- how the clamped vector is rebuilt (from the base `+0x1440`) -- is NOT read: the port rebuilds the
 * unit vector from the two held angles. Settles it: the six words read in a running r0004 (PCSX2), and `0x5b3d60`'s tail.
 * None of the capture's rest aims (elevations -2 to +49 deg, yaw under 0.1 deg) reaches either cone.
 */
export const THROW_AIM_CONE_READING = Object.freeze({
  stand: Object.freeze({ up: 85, down: 85, yaw: 85 }),
  prone: Object.freeze({ up: 20, down: 20, yaw: 45 }),
});

/** Where the aim's origin O sits over the feet: `up` world units in y, `ahead` along the body's facing. */
export interface ThrowAimOrigin { up: number; ahead: number }

/** The body's posture, as the port's snapshot names it. */
export type ThrowPosture = 'stand' | 'crouch' | 'prone';

/**
 * READING (named; research 256 s7) -- a capture of the original (r0004, PC 2 KILL-AIMORIGIN and KILL-LATCH, PC 3
 * kill-item1); the latch's mechanism a reading pending review: the throw aim's origin O over the feet, by the posture
 * the body had when the M67 came up. O = (feet.x, feet.y + H, feet.z), no forward or sideways term (r0004 0x5e67fc-0x5e681c put O on the
 * actor's x and z; `0x5e6690` overwrites the stored x and z with the body's). H is `actor+0x14a4`, written by
 * `0x5e7100` (from `0x5e6c20`, per frame) only when the held slot's attachment record exists and its `+0xc` is set
 * (0x5e7188-0x5e71c0): with a firearm up it follows the posed `aimpoint` (live, breathing with the idle); with the M67
 * up it keeps the last value written before the select -- the same H at rest, at the release request, through the
 * throw clip and at the hand-open, whatever the stance does after (agent-mail pilot/kill/item-1-aim-origin-reconcile.md
 * s0-s2). Which slot record is the empty one for the M67 is not read; the freeze is the captures':
 * - stand 13.11: PC 2 (r0004 under PCSX2 2.8.2, 2026-11-21, 12 throws, the M67 selected standing), record
 *   D:/s2u-records/KILL-AIMORIGIN-PC2/KILL-AIMORIGIN-PC2.zip (sha256
 *   91ec939a4637dc481c898b76511270f59c606508aa2bba185db26d187ae0947b), summary
 *   agent-mail/evidence/weekend-mega-2026-11-14/rig/KILL-AIMORIGIN-PC2/RESULTS.md: `+0x14a4` 13.092-13.128, one value
 *   per throw over every frame; PC 3's firearm-up rows (T4-d1025-aimdownb) 13.092-13.129, breathing.
 * - crouch 8.76: PC 3 (r0004 under PCSX2, 2026-11-21, the M67 selected crouched after every refill), record
 *   D:/s2u-captures/kill-item1-20261121T0305Z/kill-item1-20261121T0305Z.zip (sha256
 *   b65866b086c6451ff4093d6f91d8defab9e34070ab72a13c933aa1cfbafeb3de), summary
 *   agent-mail/evidence/weekend-mega-2026-11-14/rig/kill-item1-PC3/SUMMARY.md: H = 8.7635 +-0.001 from the logged aim
 *   and T over 305 samples, standing, at 10.25 u, 29 u and 100 u (`aimrest.csv`, `aimnudge.csv`). Three latches read
 *   about 8.27 instead: another of the crouch's idle heights (`THROW_AIM_ORIGIN_LATCH_POSE_PLACEHOLDER`, (b)).
 * - prone 1.356: PC 2 KILL-LATCH (r0004 under PCSX2 2.8.2, 2026-11-21, the M67 selected prone, then stood), record
 *   D:/s2u-records/KILL-LATCH-PC2/KILL-LATCH-PC2.zip (sha256
 *   5bcf4f60b800abcb29c421056a687fa17efce098c6579275d1457fc62670ccc0), summary
 *   agent-mail/evidence/weekend-mega-2026-11-14/rig/KILL-LATCH-PC2/RESULTS.md s1: `+0x14a4` 1.356 at the select in 3/3,
 *   kept bit for bit through the stand, the request and the hand-open. The same record confirms the freeze for the
 *   crouched selects (s1: 8.2748, 6.8964, 8.7764 kept through the stand) and a standing select's refusal at 20 u at the
 *   default look (s2).
 * - the crouch is not one height: KILL-LATCH's `setup.log` reads three steady idle heights (6.893-6.896, 8.273-8.280,
 *   8.776-8.795; each steady over its trial's 6 s, not one crouch settling; agent-mail
 *   pilot/kill/item-1-latch-timing.md s3); 8.76 is one idle of the three. The stance constants are a stand-in for the
 *   original's posed rule: `THROW_AIM_ORIGIN_LATCH_POSE_PLACEHOLDER`.
 * Not read: the M67's slot record at `0x5e7100` (which record is the empty one).
 * ASSUMED, no capture (the review of 4e26b9ad0e, findings 2, 3 and 7): the other grenades', the Detonator's and C4's
 * records write nothing either, as the M67's. So the page (`GrenadeCore.selectPosture_`) latches when the hand's item
 * replaces the firearm (`equip`, `takeDetonator`, `plantC4`) and keeps the latch from one of the hand's items to
 * another -- across grenade types, to and from the Detonator, and back to the throwable held before a C4 plant.
 */
export const THROW_AIM_ORIGIN_LATCH_READING = Object.freeze({
  stand: Object.freeze({ up: 13.11, ahead: 0 }),
  crouch: Object.freeze({ up: 8.76, ahead: 0 }),
  prone: Object.freeze({ up: 1.356, ahead: 0 }),
});

/**
 * PLACEHOLDER (named; research 256 s7; LANE-KILL B-06, the controller's ship-named ruling, 2026-11-21; LATER 1318): the
 * latch's height model. No value of its own: it marks `THROW_AIM_ORIGIN_LATCH_READING`'s stance constants as a stand-in
 * for the original's rule. The original latches H from the held weapon's posed aimpoint node, written every post-tick
 * and frozen one frame before the select, +-1 frame: the pad's select caller of 0x5cc160 is not identified (r0004
 * 0x5e6c20 -> 0x5e7100; agent-mail pilot/kill/item-1-latch-timing.md; a reading, re-read at the ELF by a second
 * reader, review-b06-final-3d89973e77). The port instead picks a constant by the stance flag at `equip()`, and the flag flips on
 * the stance press's frame. It differs in three cases:
 * (a) a select during a stance transition: right after a crouch press the port latches the crouch height at once; the
 *     original still latches about the standing height (13.1) at first, then in-between heights down through the clip
 *     (`seal_stand2crouch`, about 18 game frames); the mirror when standing up from a crouch;
 * (b) a settled crouch: the port's 8.76 is one idle of three; the original latches one of three steady heights by the
 *     crouch idle (about 6.89, 8.28, 8.78; KILL-LATCH `setup.log`, PC 3's 8.27 latches among them);
 * (c) a select with the firearm raised: about 15.8 standing on the original (one trial, KILL-LATCH
 *     `csv/VOID-crouch-test.csv`; no select captured in that state), 13.11 here.
 * It agrees for a settled stand (13.09-13.13), a settled prone (1.356) and the 8.78 crouch idle. Settles it: latching the
 * posed aimpoint node's height at the frame before the select, scored against KILL-LATCH and KILL-AIMORIGIN; and a
 * capture of `+0x14a4` per frame through a crouch press with a select at 1, 5 and 15 frames, plus each crouch idle.
 */
export const THROW_AIM_ORIGIN_LATCH_POSE_PLACEHOLDER = 'the stance constant at the select' as const;

/**
 * PLACEHOLDER (named; research 256 s7): the camera's `+0xec` cap on the aim ray's length (`0x5b0428-0x5b048c`: L =
 * min(max(the item's range, 600), the camera's `+0xec`)). The page's grenade source passes no camera cap (`null`: the
 * floored range alone, `aimReach`); on MP6 every T the capture's poses ask is a hit inside 600 (the
 * map's MID), so the cap changes none of them. Settles it: the source given the camera's far (`Fire.eyeReach`'s
 * `aimCap`) and the room the map's MID.
 */
export const THROW_AIM_CAP_PLACEHOLDER = null;

/**
 * PLACEHOLDER (named; research 256 s7): a body under the crosshair as the aim point. The eye query's hit list holds
 * bodies (`0x33b770`; a kept body's hit is T, 0x5b0a30) and its target lock (0x5b0780-0x5b09cc) a locked body's point;
 * the port casts the hull alone (its grid holds no bodies), so T is never a body. Settles it: the owners the eye query
 * walks read, and a capture of a rest aim with a body under the crosshair.
 */
export const THROW_AIM_BODIES_PLACEHOLDER = 'hull only' as const;

/**
 * The origin over the feet for the posture the M67 was selected at (`THROW_AIM_ORIGIN_LATCH_READING`) -- not the stance
 * now. The stance constant stands in for the original's posed height (`THROW_AIM_ORIGIN_LATCH_POSE_PLACEHOLDER`).
 */
export function throwAimOrigin(latch: ThrowPosture): ThrowAimOrigin {
  return THROW_AIM_ORIGIN_LATCH_READING[latch];
}

/** The body `throwAimVector` forms the aim for. */
export interface ThrowAimBody {
  /** The actor's position `+0x1c..+0x24`. */
  feet: readonly number[];
  /** The body's facing, degrees (the port's yaw: 0 faces -z), whose inverse turns T - O into the body's frame. */
  yaw: number;
  /** The body's posture now: the cone's (`0x5e6dd0`: prone the prone set -- state 2 -- standing or crouched the other). */
  stance: ThrowPosture;
  /**
   * The posture at the M67's select, which latches the origin's height (`throwAimOrigin`); absent, `stance` (a caller
   * with no select to read: a test's body, or the page's thrower whose select had no snapshot).
   */
  latch?: ThrowPosture;
}

/** The camera's aim ray `throwAimVector` takes T from (`0x5b0370`). */
export interface ThrowAimRay {
  /** The placed eye (`ctrl+0xd8`, after the camera's pass: 0x29d2b0-0x29d2c4). */
  eye: readonly number[];
  /** A point on the camera's centre line past the eye (the view's `far`): only its direction from `eye` is used. */
  far: readonly number[];
  /**
   * The ray's length L = min(max(the item's range, 600), the camera's `+0xec`) (0x5b0428-0x5b048c; `aimReach` with
   * `THROW_AIM_CAP_PLACEHOLDER`).
   */
  reach: number;
  /**
   * The eye query's kept test (0x5b0560-0x5b0664): dropped on a class-1 owner (bit 18 alone, `m_cameratype` 1) or a
   * material whose flags carry bit 0 or 1, else kept when its `+0x24` is under 0.98 or its flag bit 4 is set -- the
   * port's `aimQueryAdmits(p, 'eye') && aimHitKept(p, materialOf)`. Of the kept hits the nearest; a dropped one is never T.
   */
  kept: (p: WorldPoly) => boolean;
}

const DEG = Math.PI / 180;

/**
 * The throw aim as r0004's `0x5e6690` writes it, with the aim point T it was formed toward:
 *
 * - T (`actor+0x1464`, `0x5b0370` through `0x5e6cb0` with keep 0): the camera ray's nearest KEPT hit -- origin the placed
 *   eye, direction the centre line, `reach` long -- else the ray's far end (0x5b0a30, 0x5b0aa4). Not modelled: a body
 *   under the crosshair (`THROW_AIM_BODIES_PLACEHOLDER`), the target lock's point and a frame on which the camera's
 *   update skips the query (T then last frame's).
 * - O: the feet raised by the latched origin's `up` and carried `ahead` along the facing (`throwAimOrigin` of the
 *   posture at the M67's select, `body.latch`; `THROW_AIM_ORIGIN_LATCH_READING`, `ahead` 0), the same at rest, at the
 *   release request and at the hand-open.
 * - w = unit(the body's inverse rotation applied to T - O) (0x5e6838-0x5e68c8, `0x324370`, `0x3264b0`): the port turns
 *   by the yaw alone (a prone body's tilt is not in its snapshot).
 * - The cone (`0x5e6dd0`): with h = hypot(x, z) and c = -z / h (1 when h is 0), inside when h >= cos(up) (y >= 0) or
 *   cos(down) (y < 0) and c >= cos(yaw): w verbatim (0x5e6eb4-0x5e6f4c); else clamped (`0x5b3d60`,
 *   `THROW_AIM_CONE_READING`).
 * - The prone block that restores last frame's T (0x5e68d4-0x5e6b00: still, the camera off the body's vector past the
 *   prone bounds) is not modelled.
 *
 * The body frame is the port's actor frame: x right, y up, z behind (forward -z). T at O gives (0, 0, -1), as the
 * original's vector at rest with no aim point.
 */
export function throwAimVector(grid: Grid | null, ray: ThrowAimRay, body: ThrowAimBody): { aim: V3; point: V3 } {
  const point = throwAimPoint(grid, ray);
  const o = throwAimOrigin(body.latch ?? body.stance);
  // T - O in the actor frame (`worldToActor` on a direction: x right, z behind), O `ahead` along -z.
  const wx = point[0] - body.feet[0]!, wy = point[1] - body.feet[1]! - o.up, wz = point[2] - body.feet[2]!;
  const r = body.yaw * DEG, c = Math.cos(r), s = Math.sin(r);
  const lx = wx * c - wz * s, lz = wx * s + wz * c + o.ahead;
  const l = Math.hypot(lx, wy, lz);
  const w: V3 = l > 0 ? [lx / l, wy / l, lz / l] : [0, 0, -1];
  return { aim: coneHold(w, body.stance), point };
}

/** T: the ray's nearest kept hit, else its far end (`0x5b0370`, 0x5b0a30 / 0x5b0aa4). */
export function throwAimPoint(grid: Grid | null, ray: ThrowAimRay): V3 {
  const dx = ray.far[0]! - ray.eye[0]!, dy = ray.far[1]! - ray.eye[1]!, dz = ray.far[2]! - ray.eye[2]!;
  const n = Math.hypot(dx, dy, dz) || 1;
  const eye: V3 = [ray.eye[0]!, ray.eye[1]!, ray.eye[2]!];
  const end: V3 = [eye[0] + (dx / n) * ray.reach, eye[1] + (dy / n) * ray.reach, eye[2] + (dz / n) * ray.reach];
  const hit = grid ? segmentHit(grid, eye, end, ray.kept) : null;
  return hit ? [hit.point[0], hit.point[1], hit.point[2]] : end;
}

/** `0x5e6dd0`'s cone and `0x5b3d60`'s clamp (`THROW_AIM_CONE_READING`) on a unit vector in the body's frame. */
export function coneHold(w: V3, stance: ThrowAimBody['stance']): V3 {
  const cone = stance === 'prone' ? THROW_AIM_CONE_READING.prone : THROW_AIM_CONE_READING.stand;
  const h = Math.hypot(w[0], w[2]), c = h > 0 ? -w[2] / h : 1;
  const pitchOk = h >= Math.cos((w[1] >= 0 ? cone.up : cone.down) * DEG);
  if (pitchOk && c >= Math.cos(cone.yaw * DEG)) return w;
  // Outside: the pitch acos(h) signed by y, the yaw acos(c) signed by x, each held inside its pair; the rebuild from the
  // two angles is the port's (the tail of `0x5b3d60` not read).
  const pitch = Math.max(-cone.down * DEG, Math.min(cone.up * DEG, Math.sign(w[1]) * Math.acos(Math.min(1, h))));
  const yaw = Math.max(-cone.yaw * DEG, Math.min(cone.yaw * DEG, (w[0] < 0 ? -1 : 1) * Math.acos(Math.max(-1, Math.min(1, c)))));
  return [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), -Math.cos(pitch) * Math.cos(yaw)];
}

/**
 * The aim ray's length (`0x5b0428-0x5b048c`): the held item's range floored at 600, then capped by the camera's `+0xec`
 * -- `fireCore.ts` `aimReach`'s rule (AD-1), here with `THROW_AIM_CAP_PLACEHOLDER`'s cap (none).
 */
export function throwAimReach(range: number): number {
  const floored = range <= 600 ? 600 : range;
  const cap: number | null = THROW_AIM_CAP_PLACEHOLDER;
  return cap !== null && cap < floored ? cap : floored;
}

/** The eye query's kept test (`ThrowAimRay.kept`) on a map whose material byte 0 is `defaultMaterial`. */
export function throwAimKept(defaultMaterial: string): (p: WorldPoly) => boolean {
  return (p) => aimQueryAdmits(p, 'eye') && aimHitKept(p, (m) => surfaceMaterial(m, defaultMaterial));
}

/**
 * The body's aim for a throw read now (the page's `GrenadeThrower` at the release request, the hand-open and the drawn
 * arc; the room at the request's frame): `throwAimVector` along the camera's ray `ray` (the placed eye and a point on its
 * centre line) for an item of range `range`. No ray -- no camera, a test's source or a page off the walk, a case the
 * original never has -- the pitch's sine stands, as (0, s, -sqrt(1 - s^2)), the port's aim before B-06.
 */
export function bodyThrowAim(
  grid: Grid | null, ray: { eye: readonly number[]; far: readonly number[] } | null | undefined,
  body: ThrowAimBody & { pitch: number }, range: number, defaultMaterial: string,
): V3 {
  if (!ray) {
    const s = Math.sin(body.pitch * DEG);
    return [0, s, -Math.sqrt(Math.max(0, 1 - s * s))];
  }
  return throwAimVector(grid, { eye: ray.eye, far: ray.far, reach: throwAimReach(range), kept: throwAimKept(defaultMaterial) }, body).aim;
}

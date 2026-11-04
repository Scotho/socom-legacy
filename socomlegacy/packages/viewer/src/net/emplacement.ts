import { GAME_FRAME_DT, probeGround, selectFloor, TURRET_VERTICAL_READING, type Grid, type MotionClip, type TurretPlacement, type WeaponStanceName } from '@s2u/scene';
import { oneShotSeconds } from '../locomotion';
import { STEP_PROBE_LIFT_READING } from '../mover';
import type { MotionTable } from '../motionTable';
import type { Mount } from '../heldItem';
import { shortTurn, wrapYaw } from '../yaw';
import { TICK_HZ } from './protocol';

/**
 * The manual turrets' shared rules (MAP-10b, web sprint 27; ruling PF.R31; research 215 s5, 177 s2-s4): the mount test,
 * the aim's clamp to the placement's own limits, the gun's line and its muzzle -- headless, so the room
 * (`../../../match/src/room.ts`) and the page (`../turretPage.ts`) run the same arithmetic on the same
 * `@s2u/scene` `TurretPlacement`. The room owns the occupant; the aim travels as the occupant's `BodyState.yaw/pitch`
 * (degrees, the body's own convention: yaw 0 looks down -z, left positive; pitch up positive), clamped by the room.
 *
 * - **The mount** (`FUN_003a90c0` D:L300446-300516): refused when the turret is unavailable or occupied
 *   (D:L300471-300474), when the squared distance from the turret to the actor exceeds the squared `MOUNTABLE_RANGE`
 *   (22 x 22 = 484 by default; D:L300482-300486 -- x, y and z: the vertical separation is in the distance), when the squared
 *   vertical separation exceeds `DAT_003e0828` (D:L300487-300489, unread: `TURRET_VERTICAL_READING`, not applied), when the
 *   horizontal facings' dot -- the actor's and the turret's, each its matrix's z row normalised (D:L300491-300504) -- is
 *   under the cosine of `MOUNTABLE_ANGLE` (35 authored, 45 by default), and by a second test of the offset's direction
 *   against the actor's facing whose bound `DAT_003e0830` is unread (D:L300505-300512: `TURRET_APPROACH_READING`, not
 *   applied). Facing the gun's way within the angle is standing at its rear facing its line.
 * - **The aim** is clamped to the placement's `LIMITS` (radians, as the parser converts them, D:L301529-301540), the yaw
 *   measured from the gun's facing (`TurretPlacement.facing`) in the body's sense (`TURRET_YAW_SENSE_READING`).
 */

type V3 = [number, number, number];
const DEG = Math.PI / 180;

/** The emplacement on the wire (additive JSON under protocol 10, PF.R33): its id, the occupant's seat or null, its rounds. */
export interface TurretWire { id: number; occupant: number | null; ammo: number }

/**
 * [reading] The mount's second orientation test (`FUN_003a90c0` D:L300505-300512): the offset between the actor and the
 * turret, horizontal and normalised, against the actor's facing, refused past `-cos(DAT_003e0830)` -- a constant (degrees,
 * `FUN_001b3548(c x 0.017453292)` once, D:L300506-300509) the decompilation does not give, and the offset's sign is
 * `FUN_00309200`'s operand order, untraced. Null: not applied (a body facing the gun's way in front of it passes).
 * Owed: the constant's bytes off the ELF, or capture B 13 (a mount from in front and from behind, research 213 s3).
 */
export const TURRET_APPROACH_READING: number | null = null;

/**
 * [reading] The sense of the `LIMITS YAW` pair: measured from the gun's facing in the body's yaw (left positive, as the
 * actor's quaternion turns, `../yaw`). Crossroads' turret 1 (-10..110) is the only asymmetric pair on the three maps; its
 * side is not traced to a consumer. Owed: capture B 13 (both yaw stops on `mp72_turret01`, research 213 s3).
 */
export const TURRET_YAW_SENSE_READING = 'body' as const;

/**
 * [reading] TURRET-RETICLE (issue #283; research 215 s8.2): the stance row of the turret record's `Reticule_Modifiers` the
 * kit's bloom runs while mounted. The kit's tick takes the row by `FUN_0058a720(body, 1)` (`FUN_005c2670` D:L477256-477377,
 * research 84 s3), what that answers for a body in the turret anim set (its `Stand` held, `FUN_00585cd0`) is unread; the
 * set's motion is a `Stand` and the body is never crouched or prone there, so 'stand' (PKM TURRET 15-35, LMG TURRET 6-30,
 * MGL FRAG TURRET 2-6 off `zweapon.rdr`). Owed: that read, or capture B 13 (a mounted HUD frame at rest and after a burst).
 * Here, headless (the online parity sweep's AR-6, 2026-11-02): the page's kit (`../matchFirearm`) and the room's cone
 * (`../../../match/src/room.ts`, `AimMover.coneStance`) import this one name; it was the page's, the room's a literal.
 */
export const TURRET_RETICLE_STANCE_READING: WeaponStanceName = 'stand';

/**
 * [reading] Where a dismounted (or released) body stands: where the hold left it -- since PAR-44 (research 215 s7.5) the
 * hold's place (`holdStep`, TURRET_HOLD_OFFSET_READING), or the seat the mount's steer brought it to (`SeatSteer`,
 * TURRET_SEAT_READING) for a release while the steer runs. The release `FUN_00545ee0` (D:L411941-412028) plays `.RELEASE_TURRET`, frees the
 * turret, gives the kit its weapon back and plays the mount clip reversed (`FUN_005a6eb0` D:L462136-462170), and sets
 * nothing of the actor's place; the room holds the occupant's mover (no stick, jump, stance, swap, lean or Action reaches
 * it) but the steer and the hold, so a release starts it there. LATER 109 (research 215 s7.9; reading, pending review):
 * where the release STARTS the body, not where it ends -- a dismount's reversed clip then carries it 3.165 back along the
 * gun's line, through no wall (`ReleaseTravel`, TURRET_RELEASE_TRAVEL_READING); the room's other releases (a death, a
 * leave, the knock, the round's start) carry it nowhere. Was TURRET_DISMOUNT_PLACE_PLACEHOLDER ('where it mounted from',
 * before the steer). Owed: capture B 13 (a dismount's frame and the body's place after it).
 */
export const TURRET_DISMOUNT_PLACE_READING = 'where the hold left it' as const;

/**
 * [reading] The turret's rounds and their reload (TURRET-AMMO, issue #284; research 215 s8, "The original's reload",
 * reviewed 2026-10-17 AGREED WITH CORRECTIONS): `Ammo_Capacity x NumMags` on the turret at the round's start
 * (`TurretPlacement.ammoInit`, `FUN_003a9a80` D:L300860-300866; the reset `FUN_003aa9d0` D:L301330-301337). The mount
 * pours them into the kit slot's ten magazines, `Ammo_Capacity` each, the rest last (`turretPour`, `FUN_005bc5d0`
 * D:L473877-473906); the magazine's last round arms the reload (`FUN_005c5340` D:L479287-479294, D:L479318-479320), R
 * the same (`FUN_00594cf0` D:L453460-453463), for the record's `ReloadDelay` (`FUN_005c32b0` D:L477674-477676 /
 * D:L477661-477667) with no round leaving (`FUN_005c0fd0` D:L476549-476567); the landing walks to the next magazine
 * with rounds (`FUN_005c2a90` D:L477462-477483), no body clip. A dry pull with a magazine left reloads at once, not on
 * class 230 (D:L476590, D:L476616-476622). No network refill (D:L477490-477497); the release sums the magazines back
 * onto the turret (`FUN_005c3c10` D:L412003), so a dry turret stays dry for every occupant until the round's reset.
 * The pause on the command clock (the review's fold, F1): `turretReloadCountdown` -- the kit's timer run at the top of
 * each frame, the landing frame's fire step skipped too (`FUN_005c0fd0` D:L476549-476563), so the last round's arm at
 * command N lands on N+30 (0.5 s) or N+16 (0.25 s) and the first round after is N+31 / N+17. Three things are not read.
 * First, the PS2 FPU's own rounding: the countdown is IEEE float32 rounded to nearest (`Math.fround`); the R5900's FPU
 * (no denormals, its own rounding mode) is not modelled. It matters for 0.25 s: 15 decrements leave 1.1e-8, so a
 * subtraction rounded toward zero with the same frame time stops on the 15th (N+15, the first round N+16); 0.5 s stops
 * on the 30th either way. Second, the frame time: a constant float32 1/60 here, its producer unread. Third, where R's
 * arm falls in the frame: `FUN_00594cf0` runs as a controller vfunc (research 205 takes it for slot `+0xc`,
 * research 251 for `+0x10` called by `FUN_00550ef0` D:L418091) and the kit update from `FUN_005506a0` D:L417907, after
 * the controller's `+0x3c` (D:L417905); if R's controller update runs before that frame's kit update, its timer takes
 * its first decrement in R's own frame and lands one command earlier (N+29 / N+15). The room counts R's arm as the last
 * round's. Owed: capture B 13 (fire until empty: the pause, the box, the sound; R mounted: the first round after).
 * Was 'counts down; the round restores' (the depletion's consumer untraced, nothing reloading).
 */
export const TURRET_RELOAD_READING = 'magazines of Ammo_Capacity; the last round and R arm ReloadDelay; dry until the round resets' as const;

/** The game's frame time as the kit's timer takes it: 1/60 s in float32 (the room's command clock, `TICK_HZ` 60). */
const KIT_FRAME_S = Math.fround(1 / 60);

/**
 * TURRET-AMMO's review fold, F1 (TURRET_RELOAD_READING): the kit's reload timer (`kit+0x820`) as `FUN_005c0fd0` runs it
 * (D:L476549-476563) -- on each frame it enters non-zero, the frame's time is taken off first (D:L476551-476552, a
 * float32 store), then a result `< 0.0` lands the reload (`FUN_005c2a90`, D:L476553-476558) and zeroes the timer
 * (D:L476560); that frame's fire step is skipped either way (`bVar11 = false`, D:L476562). The arm is inside frame N's
 * fire step, so frame N+1 takes the first decrement. `commands`: the decrements until the timer stops -- the landing's
 * command is N + `commands`, the first round after N + `commands` + 1. `lands`: false when a decrement leaves exactly
 * 0.0 (`< 0.0` fails, D:L476553): the timer stops with no landing, the magazine unchanged. 0.5 s: 30, 0.25 s: 16.
 */
export function turretReloadCountdown(delay: number, frame: number = KIT_FRAME_S): { commands: number; lands: boolean } {
  let timer = Math.fround(delay), commands = 0;
  if (timer === 0 || !(frame > 0) || !Number.isFinite(timer)) return { commands: 0, lands: false };   // a 0 timer never runs (D:L476550)
  for (;;) {
    timer = Math.fround(timer - frame);
    commands++;
    if (timer < 0) return { commands, lands: true };
    if (timer === 0) return { commands, lands: false };
  }
}

/**
 * `FUN_005bc5d0` (D:L473877-473906): `rounds` poured into the kit slot's ten magazines (`m_reloads[slot][10]`), each
 * `capacity` while the rest exceeds it, then the rest; the others 0. Nothing is written for 0 rounds (D:L473891).
 */
export function turretPour(rounds: number, capacity: number): number[] {
  const slots = new Array<number>(10).fill(0);
  if (!(capacity > 0)) return slots;
  let rest = Math.max(0, Math.floor(rounds));
  for (let i = 0; i < slots.length && rest > 0; i++) {
    const take = Math.min(capacity, rest);
    slots[i] = take;
    rest -= take;
  }
  return slots;
}

/** What the mount test reads of a placement. */
export type Mountable = Pick<TurretPlacement, 'origin' | 'mountRange' | 'mountAngleCos' | 'facing'>;

/**
 * `FUN_003a90c0`: whether a body at `feet` facing `yaw` (degrees) may mount the placement -- free, within its range in
 * three dimensions (squared, `<=`), facing within its mount angle of the gun's facing (`>=` the cosine). The vertical
 * bound and the approach's side test are unread (`TURRET_VERTICAL_READING`, `TURRET_APPROACH_READING`) and not applied.
 */
export function canMount(t: Mountable, feet: readonly number[], yaw: number, occupied: boolean): boolean {
  if (occupied) return false;
  const dx = feet[0]! - t.origin[0], dy = feet[1]! - t.origin[1], dz = feet[2]! - t.origin[2];
  if (dx * dx + dy * dy + dz * dz > t.mountRange * t.mountRange) return false;
  const vertical: number | null = TURRET_VERTICAL_READING;
  if (vertical !== null && dy * dy > vertical) return false;
  return Math.cos(shortTurn(t.facing, yaw) * DEG) >= t.mountAngleCos;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * The aim held to the placement's own limits (degrees in, degrees out): the yaw's turn from the gun's facing clamped to
 * `limits.yaw` (the short way: past a stop by more than half a turn round is the nearer stop), the pitch to
 * `limits.pitch`. A limit the record lacks clamps nothing; an aim within both comes back as it went in.
 */
export function clampAim(t: Pick<TurretPlacement, 'facing' | 'limits'>, yaw: number, pitch: number): { yaw: number; pitch: number } {
  let outYaw = yaw, outPitch = pitch;
  if (t.limits.yaw) {
    const rel = shortTurn(t.facing, yaw);
    const held = clamp(rel, t.limits.yaw[0] / DEG, t.limits.yaw[1] / DEG);
    if (held !== rel) outYaw = wrapYaw(t.facing + held);
  }
  if (t.limits.pitch) outPitch = clamp(pitch, t.limits.pitch[0] / DEG, t.limits.pitch[1] / DEG);
  return { yaw: outYaw, pitch: outPitch };
}

/** The gun's line at an aim (degrees): yaw 0 down -z, left positive, pitch up positive -- the camera's own look (`cameraRig`). */
export function gunLine(yaw: number, pitch: number): V3 {
  const y = yaw * DEG, p = pitch * DEG;
  return [-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p)];
}

/** The gun's frame at an aim: its left, its up and its line, each a unit column. */
function frameAt(yaw: number, pitch: number): [V3, V3, V3] {
  const y = yaw * DEG, p = pitch * DEG;
  const left: V3 = [-Math.cos(y), 0, Math.sin(y)];
  const up: V3 = [Math.sin(y) * Math.sin(p), Math.cos(p), Math.cos(y) * Math.sin(p)];
  return [left, up, gunLine(yaw, pitch)];
}

/** The rotation (row r, column c) carrying the gun's rest frame (its facing, level) to the frame at the aim. */
function turnOf(t: Pick<TurretPlacement, 'facing'>, yaw: number, pitch: number): number[][] {
  const from = frameAt(t.facing, 0), to = frameAt(yaw, pitch);
  return [0, 1, 2].map((r) => [0, 1, 2].map((c) => to[0][r]! * from[0][c]! + to[1][r]! * from[1][c]! + to[2][r]! * from[2][c]!));
}

/**
 * The muzzle at an aim (degrees): the firepoint's rest place turned about the gun's pivot by the aim's turn from the
 * gun's facing and its pitch -- the round's start (the room) and the page's drawn firepoint alike.
 */
export function muzzleAt(t: Pick<TurretPlacement, 'facing' | 'gunOrigin' | 'firepointOrigin'>, yaw: number, pitch: number): V3 {
  const R = turnOf(t, yaw, pitch), g = t.gunOrigin, f = t.firepointOrigin;
  const v = [f[0] - g[0], f[1] - g[1], f[2] - g[2]];
  return [0, 1, 2].map((r) => g[r]! + R[r]![0]! * v[0]! + R[r]![1]! * v[1]! + R[r]![2]! * v[2]!) as V3;
}

/**
 * The gun part's move from rest to an aim, as `WorldView.moveNode` takes it (16 floats, three's column-major order,
 * applied after the placement's own matrix): the turn about the gun's pivot.
 */
export function gunDelta(t: Pick<TurretPlacement, 'facing' | 'gunOrigin'>, yaw: number, pitch: number): Float32Array {
  const R = turnOf(t, yaw, pitch), g = t.gunOrigin;
  const m = new Float32Array(16);
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) m[c * 4 + r] = R[r]![c]!;
  for (let r = 0; r < 3; r++) m[12 + r] = g[r]! - (R[r]![0]! * g[0] + R[r]![1]! * g[1] + R[r]![2]! * g[2]);
  m[15] = 1;
  return m;
}

// ---------------------------------------------------------------------------------------------------------------------
// The mount's body: its clips, its seat and the steer onto it (research 215 s7).

/**
 * The turret anim set's clips (`RUN/READERC.ZAR` `animset.rdr`, "turret anim set": `Stand` and `Turret poses`
 * `seal_turret_poses`, `Stand -> Turret` `seal_stand2turret`, `Pistol stand -> Turret` `seal_p_stand2turret`). The mount
 * `FUN_005463c0` (D:L412095-412318) takes the set (`FUN_005a6fc0` D:L462173-462200: `FUN_0058c4a0(actor, DAT_0044d410)`)
 * and pushes `Stand -> Turret` (`DAT_003df108`, D:L495413) from the rifle or `Pistol stand -> Turret` (`DAT_003df110`,
 * D:L495414) from the pistol, by the hand's `+0xf79`; the release plays the same clip reversed (`FUN_005a6eb0`
 * D:L462136-462170: `FUN_00588bc0(actor, motion, 0, 1, 0)`, its 4th argument the reverse, as the launcher's lower). The
 * set's `Stand` is the held pose. `motion.rdr`: both mount clips `playback` 0.3, `NoInterrupt`, `NoFire`, `NoPitchtwist`,
 * `refPt` (-3.31, -2.526, 7.655); `seal_turret_poses` looped, `playback` 1, `NoPitchtwist` (pinned against the fixture's
 * files by `test/turretMount.test.ts`).
 */
export const TURRET_MOUNT_CLIPS = Object.freeze({ rifle: 'seal_stand2turret', pistol: 'seal_p_stand2turret' } as const);
/** The turret anim set's `Stand` (and `Turret poses`): the pose a mounted body holds. */
export const TURRET_HOLD_CLIP = 'seal_turret_poses';
/** Every clip the mount draws: the page asks the pack for them, the room for the steer's roots. */
export const TURRET_CLIPS: readonly string[] = [TURRET_MOUNT_CLIPS.rifle, TURRET_MOUNT_CLIPS.pistol, TURRET_HOLD_CLIP];

/** The mount clip a body takes from the hand it holds (0 the rifle, 1 the pistol): `FUN_005a6fc0` by `+0xf79`. */
export function mountClipOf(weapon: 0 | 1): string {
  return weapon === 1 ? TURRET_MOUNT_CLIPS.pistol : TURRET_MOUNT_CLIPS.rifle;
}

/**
 * The mount clip as the steer reads it: its `refPt` (`motion.rdr`), its skeleton root per key (the actor's root,
 * `vtbl+0x88`, as each tick samples the clip), its keys and the seconds it runs in (a one-shot's, `oneShotSeconds`:
 * `FUN_0028c4f0`).
 */
export interface MountShape { clip: string; refPt: V3; root: Float32Array; keys: number; seconds: number }

/** The mount clip's shape off the clips and the table, or null when either lacks it (no steer then). */
export function mountShape(clips: readonly MotionClip[] | null, table: MotionTable | null, weapon: 0 | 1): MountShape | null {
  const name = mountClipOf(weapon);
  const clip = clips?.find((c) => c.name === name), entry = table?.get(name);
  const refPt = entry?.refPt, part = clip?.parts.find((p) => p.name === 'skel_root');
  if (!clip || !entry || !refPt || !part) return null;
  const keys = Math.max(1, clip.frameCount), t = part.translations, root = new Float32Array(keys * 3);
  for (let k = 0; k < keys; k++) for (let a = 0; a < 3; a++) root[k * 3 + a] = t.length > 3 ? t[k * 3 + a]! : t[a]!;
  return { clip: name, refPt: [refPt[0], refPt[1], refPt[2]], root, keys, seconds: oneShotSeconds(entry.playback ?? clip.duration, keys) };
}

/** The shape's root `seconds` into the clip: key `seconds / shape.seconds x (keys - 1)`, held at the last, linear between. */
export function mountRootAt(shape: MountShape, seconds: number): V3 {
  const k = Math.max(0, Math.min(shape.keys - 1, (seconds / shape.seconds) * (shape.keys - 1)));
  const i = Math.floor(k), j = Math.min(shape.keys - 1, i + 1), f = k - i, r = shape.root;
  return [0, 1, 2].map((a) => r[i * 3 + a]! + (r[j * 3 + a]! - r[i * 3 + a]!) * f) as V3;
}

/**
 * The seat (the actor's place) the mount steers to: `origin + R(facing) x (refPt - root)`, in the body's model frame (x
 * right, y up, z behind; `../yaw`'s facing). `FUN_005463c0` records the turret's own place (its placed node's translation,
 * D:L412298-412302), the facing (below) and the clip's `refPt` negated (`FUN_0058c2f0` D:L447933-447949, negated at
 * D:L412264-412267); `FUN_005b3340` (D:L468890-468927) aims the actor's root -- its skeleton root's local translation
 * (`*(actor+0x2e8)`, `skel_root`), through the actor's matrix -- at the place plus `refPt` turned to that facing. PB-2c
 * (research 215 s7.1, s7.5 item 2): the steer reads the root with its x and z zeroed (the tick zeroes them after each pose,
 * D:L439101-439102 / D:L439147-439148; the steer runs before the pose, D:L439020, D:L439091), and `refPt` as the clip root's
 * travel has moved it (`SeatSteer`); so `SeatSteer` hands this the root at (0, y, 0). *Was* (PB-2): the root's x and z in
 * it, the seat 8.47 behind the pivot at the clip's first root and 11.84 at its last.
 */
export function seatTarget(t: Pick<TurretPlacement, 'origin' | 'facing'>, refPt: readonly number[], root: readonly number[]): V3 {
  const y = t.facing * DEG, c = Math.cos(y), s = Math.sin(y);
  const x = refPt[0]! - root[0]!, z = refPt[2]! - root[2]!;
  return [t.origin[0] + x * c + z * s, t.origin[1] + refPt[1]! - root[1]!, t.origin[2] - x * s + z * c];
}

/**
 * [reading, pending review] The port's steer onto the seat (`SeatSteer`), as the game runs it while the mount clip plays
 * (PB-2, research 215 s7.1; PB-2c, s7.5 item 2). `FUN_005463c0` (D:L412260-412313) writes the seat's record on the motion
 * state it has just pushed -- the mount clip's, a one-shot (`motion.rdr` looped 0) -- and `FUN_0057a330` (D:L439017-439020)
 * steers a record on a one-shot with `FUN_005b3340` (D:L468759-468954); `FUN_005b2d20` (30 a second an axis, 4.712 rad/s,
 * the 0.993 / 46-tick / 30 ends) is the looped motions' branch (D:L439021-439080), not the mount's. Each tick of the clip
 * `FUN_005b3340` sets the actor's velocity to the whole offset to the seat (`seatTarget`) times the square root of the
 * motion's phase eased (`steerEase` of the phase as it stands, 0 to (n - 1) / n -- `FUN_002874f0` D:L131135-131148 of
 * `+0x1c`, D:L468929-468930), on all three axes (the vertical zeroed only under motions 0x2c "Stand -> Ladder" and 0x2e
 * "Climb off ladder", D:L468933-468941), with no clamp; turns the actor toward the recorded facing (`seatTurn`: the angle
 * over dt clamped to 2 pi rad/s, D:L468863-468867, times the cross product's length, sin of the angle, D:L468885-468886);
 * and, after the offset is taken, moves the stored `refPt` by the clip root's velocity x dt (D:L468947-468951;
 * `mountRootVelocity`). The recorded facing is the gun part's world forward at the mount, flattened (`FUN_005463c0`
 * D:L412268-412297: the turret's vfunc `+0xc`, `turret + 0x2c0`, which `FUN_003a7350` copies from the gun part each tick,
 * D:L299407-299410) -- the gun's yaw where its last occupant left it, the port's `TurretState.gunYaw` / the page's drawn
 * aim. The clip comes off at the driver's end test before the tick's advance (`mountPlayedOut`), and on that tick the hold
 * runs (`FUN_00585cd0`, D:L438897-438898), laying the gun's facing and placing the body. Nothing attaches the actor to a
 * node of the turret's rig (D:L412197-412316).
 *
 * The port: the ground through the mover's collision (`glide`); the actor's facing tracked from the mover's yaw at the
 * mount, handed to the mover through `face` -- the room lays it as the command's yaw past the look gate (OT.R38), the page
 * turns its own look alike. The vertical is no mover's, as the game's: after each move the actor's height is the floor's
 * (`FUN_005483d0` D:L413943-413946 -> `FUN_0059afd0`: the floor `+0x2e4`, or a root-relative height held at or above it),
 * so the steer's vertical never takes the body through its floor (mp51_turret03's seat 1.08 under its raised floor). Open:
 * where the mount's push falls in the game's frame (`FUN_002c7d00`'s place against the actor's tick: the whole mount a
 * frame later or not -- not the key it comes off at); the first tick's root y is the stand's pose (the port's key 0;
 * unused, the height being the floor's). Owed: capture B 13 (a mount from behind, from a side and from 20 away: the body's
 * path, its facing and its seat).
 */
export const TURRET_SEAT_READING = "FUN_005b3340 over the mount clip; its turn to the mover, the height the floor's" as const;

/** `FUN_005b3340`'s clamp of the turn's rate: 2 pi radians a second (D:L468863-468867), in degrees a second. */
export const SEAT_TURN_DEG_S = 360;

/**
 * `FUN_005b3340`'s turn over `dt` seconds from `yaw` toward `facing` (degrees, the body's yaw): the angle `a` between them
 * over dt, clamped to 2 pi rad/s (D:L468863-468867), times the cross product's length -- `sin a` for the two unit vectors
 * (D:L468885-468886) -- its side the cross product's y (D:L468882-468884). From 30 off it turns 3 degrees a tick at 60
 * ticks; under 6 off, `a sin a` a tick: it never closes on its own (the hold lays the rest, `FUN_00585cd0`).
 */
export function seatTurn(yaw: number, facing: number, dt: number): number {
  const turn = shortTurn(yaw, facing), a = Math.abs(turn) * DEG;
  if (a === 0 || !(dt > 0)) return wrapYaw(yaw);
  const step = Math.min(a / dt, 2 * Math.PI) * Math.sin(a) * dt / DEG;
  return wrapYaw(yaw + Math.sign(turn) * step);
}

/** `FUN_002874f0` (D:L131135-131148): 2p^2 to the half, 1 - 2(p - 1)^2 after -- the steer's ease of the clip's phase. */
export function steerEase(p: number): number {
  return p <= 0.5 ? 2 * p * p : 1 - 2 * (p - 1) * (p - 1);
}

/** A one-shot's end phase, (n - 1) / n (`FUN_0028cc10` D:L134494; `FUN_0028ada0`). */
const oneShotEnd = (keys: number): number => (keys < 2 ? 1 : (keys - 1) / keys);

/** The mount clip's `playback` (`motion.rdr`, the clip's `+0x10`) off its run: `seconds = playback x e^2` (`oneShotSeconds`). */
const playbackOf = (shape: MountShape): number => shape.seconds / oneShotEnd(shape.keys) ** 2;

/**
 * PB-2c: the mount clip's motion phase `run` seconds in -- `FUN_0028c4f0` (D:L134223-134270) adds dt x the entry's speed
 * `+0x18` (1: made so, `FUN_0028d860`, and set otherwise only by a reload's `ReloadTime`) x its weight `+0x8` (1: the one
 * entry, `FUN_0028bdf0`'s sum to 1) x its direction `+0x24` (1 forward) over `playback x e` -- held at the one-shot's end e.
 * The steer's ease reads this phase as it stands (`FUN_005b3340` D:L468835-468839, D:L468929); the key is `phase x n` (`FUN_0028d670`
 * D:L134879-134899), `mountRootAt`'s. NU-1c: `oneShotPhase` of the shape, the law the climbs share.
 */
export function mountPhase(shape: MountShape, run: number): number {
  return oneShotPhase(run, shape.seconds, shape.keys);
}

/**
 * NU-1c (research 313 section 3, research 215 s7.1): a one-shot's motion phase `run` seconds into a play that runs its
 * keys in `seconds` (`playback x e^2`, `oneShotSeconds`): `run / (playback x e)` held at its end e = (n - 1) / n
 * (`FUN_0028c4f0` D:L134223-134278) -- the phase `FUN_005b3340` eases (D:L468835-468839, D:L468929). A two-node play (the
 * crate/medium blend, `FUN_00581110`) is given its own `seconds` and the second node's keys, as `../clipPath`
 * `blendShapes` lays it. The mount's (`mountPhase`) and the climbs' (`../traversal`) one law.
 */
export function oneShotPhase(run: number, seconds: number, keys: number): number {
  const e = oneShotEnd(keys);
  return Math.min(e, Math.max(0, run) / ((seconds / e ** 2) * e));
}

/**
 * NU-1c: `FUN_005b3340`'s weight on the remaining offset at a phase -- the square root of the phase eased
 * (`FUN_002874f0` D:L131135-131148; D:L468929-468930): the share of the offset to its target the steer's velocity closes
 * this tick (the offset x the weight, over dt, D:L468943). The mount's and the climbs' one law.
 */
export function steerWeight(phase: number): number {
  return Math.sqrt(steerEase(phase));
}

/**
 * NU-1c (research 313 section 3; research 215 s7.1): `FUN_005b3340`'s clock, weight and turn on a one-shot's steer record
 * -- the part the mount (`SeatSteer`) and the climbs onto obstacles (`../traversal`) share. `FUN_0057a330` steers a record
 * on a one-shot with `FUN_005b3340` (D:L439017-439020) after the tick's advance (D:L438901), so each `advance` moves the
 * clock first (`run`, the ticks of `dt` so far), then reads the phase as it stands (`oneShotPhase`), its weight
 * (`steerWeight`) and the turn toward the recorded facing (`seatTurn`: 2 pi rad/s at most times the sine,
 * D:L468862-468886). What the weight is laid on is the caller's: the mount's whole offset to its seat (no root travel:
 * `+0x2c` zeroed under the seat's record, D:L439099-439105), the climb's offset past its clip's own root travel (the
 * play's velocity added to the root's, `FUN_0054d9a0` D:L416455). The one-shot branch abandons none and has no tick limit
 * (the 30 / 0.993 / 46 ticks are the looped branch's, `FUN_005b2d20`, D:L439024-439040).
 */
export class OneShotSteer {
  private ticks = 0;
  /** The ticks advanced so far (RESUME-MOUNTED's `SeatSteer.steered`, a resume mid-steer). */
  get steered(): number {
    return this.ticks;
  }
  /** The play's run so far (seconds): the steered ticks' dt. */
  run = 0;
  constructor(
    /** The play's run to its last key (`playback x e^2`), and its keys. */
    readonly seconds: number, readonly keys: number,
    /** The facing recorded (degrees, the body's yaw). */
    readonly toward: number,
  ) {}

  /** One tick: the clock moved, then the phase, the weight and the facing turned from `yaw` (`seatTurn`). */
  advance(yaw: number, dt: number): { phase: number; k: number; yaw: number } {
    this.ticks++;
    this.run = this.ticks * dt;
    const phase = oneShotPhase(this.run, this.seconds, this.keys);
    return { phase, k: steerWeight(phase), yaw: seatTurn(yaw, this.toward, dt) };
  }
}

/**
 * PB-2c: the mount clip root's velocity at `phase`, units a second in the body's frame -- what `FUN_0057a330` writes the
 * actor's `+0x2c` with before the steer (`FUN_0028c250` D:L134145-134181, D:L438909-438910, x `DAT_0064fc80` at D:L438985:
 * 1, set so each tick at D:L418170 and written otherwise only by the locomotion's set split): `FUN_00289bb0`
 * (D:L132691-132754) takes the root's change from the key the phase is on to the next (the last pair at the last key) times
 * the keys over the playback (`+0x10`), divided by the entry's speed where it is not 1 (it is 1 here). The port's
 * convention for the same read: `../mover` `Walker.clipVelocity`.
 */
export function mountRootVelocity(shape: MountShape, phase: number): V3 {
  const n = shape.keys, r = shape.root;
  if (n < 2) return [0, 0, 0];
  let a = Math.min(n - 1, Math.floor(phase * n + 1e-9)), b = a + 1;
  if (b >= n) { b = n - 1; a = n - 2; }
  const k = n / playbackOf(shape);
  return [(r[b * 3]! - r[a * 3]!) * k, (r[b * 3 + 1]! - r[a * 3 + 1]!) * k, (r[b * 3 + 2]! - r[a * 3 + 2]!) * k];
}

/**
 * PB-2c: whether the driver pops the mount clip on a tick whose phase before its advance is `run` seconds of the clip in
 * (`FUN_00550ef0` D:L418192-418193 -> `FUN_00582540` D:L442925 -> `FUN_0028c6e0` D:L134283-134308: the stored phase plus
 * half of `dt x +0x24 / (playback x e)`, past the stop e; the frame's dt `actor+0x2e0` the game's, `GAME_FRAME_DT`, as
 * research 251 PAR-69's uncut end takes it). The forward mount's end goes through `FUN_00582540`'s plain end (the reversed
 * bit read again at D:L442992; its `Stand -> Turret` test turns the set back on the reversed play alone, D:L443054-443057,
 * D:L443143-443150), so the clip pops (`FUN_005870e0` D:L418203) and the hold below it runs the same tick. `run < P e^2 - G/2`.
 */
export function mountPlayedOut(run: number, playback: number, keys: number): boolean {
  const e = oneShotEnd(keys);
  return Math.max(0, run) / (playback * e) + GAME_FRAME_DT / (2 * playback * e) > e;
}

/**
 * PB-2c: the ticks of `dt` the mount's steer runs before the clip comes off (`mountPlayedOut` asked before each tick's
 * advance): 16 at the port's 60 Hz for the 26-key mount clips at 0.3 (key 24.04 on the last), 8 at the game's frame (key
 * 24.06) -- never key 25. The hold takes the next tick.
 */
export function mountSteerTicks(playback: number, keys: number, dt: number): number {
  if (!(dt > 0) || !(playback > 0)) return 0;
  let j = 0;
  while (!mountPlayedOut(j * dt, playback, keys)) j++;
  return j;
}

/**
 * The mover the steer drives: its place and facing, and either its ground (`grid`: T81-4, the steer's move laid on the place
 * with no collision, the floor picked as `holdStep` picks it) or its own ground move (`glide`: a caller without the ground --
 * the synthetic movers of the tests; both the room and the page hand the walker since T81-4), and the optional turn.
 */
export interface SeatMover {
  state: { x: number; y: number; z: number; yaw: number; vx: number; vz: number };
  /** The ground the move's floor is picked on (`Walker.grid`): present, the steer's move takes the place directly. */
  readonly grid?: Grid;
  /** Whether the mover falls (`Walker.airborne`); absent, it does not. */
  readonly airborne?: boolean;
  /** `Walker.setAirborne`: `false` stands it on the floor where it is. */
  setAirborne?(on: boolean): void;
  /** The caller's own ground move, used only without `grid` (was the steer's move through `Walker.glide`, PB-2). */
  glide?(dx: number, dz: number): void;
  /** The steer's facing this tick (degrees, the body's yaw), when the mover takes it (TURRET_SEAT_READING). */
  face?(yaw: number): void;
}

/**
 * [reading, pending review] T81-4 (research 215 s7.1, s7.9): the mount clip's steer passes every wall, the turret's own hull
 * included. `FUN_005483d0` keeps the move's intended displacement (`+0x3d1..+0x3d3`, D:L413464-413466) before it resolves
 * the hits (D:L413470-413905) and, while the actor's anim set is the turret's (`+0x528` == `DAT_0044d410`, pushed at the
 * mount by `FUN_005a6fc0`), writes it back over the resolved one (D:L413908-413912); it integrates it unless the hold's
 * `Stand` is the top motion (D:L413914-413918) -- so through the mount clip the steer's velocity (`FUN_005b3340`) moves
 * the body with no wall stopping it, and in the hold `FUN_00585cd0` places it. The scope is the mount clip's steer alone:
 * the walk before the mount and after the release collides as before. LATER 109 (research 215 s7.9; reading, pending
 * review): widened to the release's reversed clip, which runs in the turret set too until its end returns the set
 * (`FUN_00582540` D:L443143-443150; the clip on top, not the hold's `Stand`, so the move is integrated): `ReleaseTravel`
 * lays its 16 steps with no collision as the steer does; the walls are back from the end's command. Was: "the port's
 * release moves nothing then -- left as it was". Not applied after the move: the hold's push (`TURRET_HOLD_PUSH_READING`).
 */
export const TURRET_STEER_WALLS_READING = 'none: the turret set restores the unresolved move' as const;

/**
 * TURRET_RELEASE_SEQ_ADAPTATION (LATER 104, research 215 s4, s7.9; a network adaptation, no reading -- the original's
 * console runs the press and the clip on one actor with no network between): the release's first test refuses it while the
 * mount clip plays (`FUN_00545ee0` D:L411954-411966). The room cannot see the page's clip through the network's lag -- a
 * command lost mid-steer leaves its own steer a step behind the page's count (LATER 96) -- so it judges a dismount on the
 * page's numbering: refused 'mounting' iff the dismount's `seq` (the page's last command at the press) is below the mount's
 * `after` + `SeatSteer.ends` (the 16 steer steps and the hold's command: the command on which the page's own keyed clip
 * comes off). Taken on the first command above its `seq` the room runs, and -- the merge controller's ruling (b) -- never
 * while the room's own steer still runs: held, it is taken on the first command after the room's hold. The page, whose own
 * clip keys on the same count, so knows at the press whether its release will be taken and predicts it
 * (`../turretPage` `TurretPage.action`); a refusal the room tells it (`refused: 'mounting'`) undoes the prediction.
 * LATER 151: the window is never shorter than the release's wait (`TURRET_RELEASE_WAIT_TICKS`), with or without the clips.
 */
export const TURRET_RELEASE_SEQ_ADAPTATION = "refused 'mounting' iff seq < after + max(SeatSteer.ends, TURRET_RELEASE_WAIT_TICKS) (the page's own count)" as const;

/**
 * [reading] LATER 151 (research 215 s7.11; reading, pending review): the seconds from a mount before its release is
 * offered. Online (`DAT_0045a0c1`; the port's every match takes that branch: SOLO_IS_NETWORK_READING) the mount
 * `FUN_005463c0` sets the actor's `+0x22c` to the manager's clock (`FUN_0030d550`'s `+0x100`, milliseconds: research
 * 215 s7.10) + 1250 (D:L412209-412213), and the offer tests it: `FUN_005a8850` (D:L462975-462993) answers the held
 * turret (`+0xeb8`) alone offline, and online only once the clock has reached `+0x22c`; its one caller `FUN_005937c0`
 * (D:L452334-452338) offers the release (action 20, 0x100000) and returns on it. Before then the release is not in the
 * offer: no prompt (`action_dismount_turret.tif`), and the press dispatches no release (`FUN_00592d50` runs
 * `FUN_00545ee0` on the offer's 0x100000 alone, D:L452078-452087). Judged on the page's count as
 * TURRET_RELEASE_SEQ_ADAPTATION's window is (`TURRET_RELEASE_WAIT_TICKS` above the mount's `after`), not on a clock.
 */
export const TURRET_RELEASE_WAIT_READING = 1.25;

/** LATER 151: TURRET_RELEASE_WAIT_READING in the page's commands at `TICK_HZ` -- 75 at 60 Hz. */
export const TURRET_RELEASE_WAIT_TICKS = Math.round(TURRET_RELEASE_WAIT_READING * TICK_HZ);

/**
 * A1 (LATER 239, 217, 218, 243; a network adaptation, the merge controller's word 2026-10-21): the room's checks when it grants
 * a mount at the ask's command K -- alive, not stale, holding none, the turret free (PF.R28's lower seat id among one
 * step's), no traversal move, the kit's lock (LATER 175 `mountKitLocked`, LATER 223's wait, LATER 249's arrival tie), the
 * reach and facing (`canMount`, `FUN_003a90c0`); and, for a worded ask, the asker's own ask's refusals (`FUN_00546210`):
 * a knock-down fall on the body (D:L412059-412062, no locality gate; 'fall') and a `Stand -> Turret` clip playing, forward
 * or reversed (D:L412066-412069: the dismount's reversed clip; 'mounting'). Its third, the restraint or stab victim
 * `+0xeac` (D:L412071-412073), is the campaign's alone (research 189, 194): no multiplayer body sets it, so none is
 * checked. The original's host checks only that it is the master and the turret is unowned (`FUN_0061e6d0`
 * D:L529427-529428). The asker's console offered the mount past its own gate (`FUN_00593500`) and its ask's refusals
 * before it asked (`FUN_00546210` D:L412075-412084). The room is both, so it keeps the asker's gate and the ask's refusals
 * at K and judges a forged ask as an honest page's would be; an older page's (unworded) ask keeps its path from before A1,
 * without the ask's two refusals.
 */
export const MOUNT_GRANT_CHECKS_ADAPTATION = "the asker's offer gate and reach, judged by the room at the ask's command" as const;

/**
 * A1 (a network adaptation; the merge controller's word 2026-10-21): the seconds a reservation waits for its page's take
 * word (`mountTake`) before the room takes the body on its own count (`steer.after` the last command run; the page re-keys
 * on it). This is the ask's window (`../turretPage` TURRET_MOUNT_ASK_WINDOW_READING, pinned equal by a test): no honest page
 * re-asks inside it, and a page that never names its take (forged, or its socket lost) holds the turret no longer. It
 * applies only to an ask that carried `word`.
 */
export const MOUNT_WORD_BOUND_ADAPTATION = 2;
export const MOUNT_WORD_BOUND_TICKS = Math.round(MOUNT_WORD_BOUND_ADAPTATION * TICK_HZ);

/**
 * T81-4: the steer's move laid on the mover's place, with no collision (`TURRET_STEER_WALLS_READING`), its height the floor's
 * there as `holdStep` takes it (`FUN_0059afd0`, D:L413943-413946; the ground step's floor pick from the feet +
 * `STEP_PROBE_LIFT_READING`). With no floor there, nothing moves (false).
 */
function steerMove(w: SeatMover & { grid: Grid }, dx: number, dz: number): boolean {
  const s = w.state, x = s.x + dx, z = s.z + dz;
  const floor = selectFloor(probeGround(w.grid, x, z), s.y + STEP_PROBE_LIFT_READING, s.y);
  if (!floor) return false;
  s.x = x; s.z = z; s.y = floor.y;
  if (w.airborne) w.setAirborne?.(false);
  return true;
}

/** One mount's steer of a mover onto its seat (`TURRET_SEAT_READING`): `FUN_005b3340`, one tick at a time. */
export class SeatSteer {
  /** NU-1c: the one-shot branch's clock, weight and turn, shared with the climbs (`OneShotSteer`). */
  private readonly steer: OneShotSteer;
  /** The actor's facing as the steer turns it (degrees), from the mover's at the first tick; null before. */
  private yaw: number | null = null;
  /** `refPt` as the clip root's travel has moved it (D:L468947-468951). */
  private readonly ref: V3;
  private constructor(
    private readonly t: Pick<TurretPlacement, 'origin'>, private readonly shape: MountShape,
    /** The facing recorded at the mount (degrees, the body's yaw): the gun's flattened forward then (D:L412268-412297). */
    readonly toward: number,
  ) {
    this.ref = [shape.refPt[0], shape.refPt[1], shape.refPt[2]];
    this.steer = new OneShotSteer(shape.seconds, shape.keys, toward);
  }

  /** The clip's run so far (seconds): the steered ticks' dt. */
  private get run(): number {
    return this.steer.run;
  }

  /** LATER 173: the mount clip's phase now (`mountPhase`), for its `NoFire` (`room.ts` `aim`). */
  get phase(): number {
    return mountPhase(this.shape, this.run);
  }

  /**
   * The steer for a mount, or null without the clip's shape (no steer then). The one-shot branch abandons none. `facing`:
   * the gun's yaw at the mount (`TurretState.gunYaw`, the page's drawn aim); absent, the placement's own (a gun at rest).
   */
  static start(t: Pick<TurretPlacement, 'origin' | 'facing'>, shape: MountShape | null, _feet?: readonly number[], facing = t.facing): SeatSteer | null {
    return shape ? new SeatSteer(t, shape, facing) : null;
  }

  /**
   * The seat this tick's steer aims at: `seatTarget` at the recorded facing, `refPt` as moved so far, the root at (0, y, 0)
   * -- its y the pose the last tick drew (the first tick's the stand's: the port's key 0, unused -- the height is the floor's).
   */
  target(): V3 {
    return seatTarget({ origin: this.t.origin, facing: this.toward }, this.ref, [0, mountRootAt(this.shape, this.run)[1], 0]);
  }

  /** The actor's facing as the steer has turned it (degrees), or null before its first tick. */
  facing(): number | null {
    return this.yaw;
  }

  /** RESUME-MOUNTED: the ticks this steer has run so far, for a resume mid-steer (`room.ts` `resumeEvent`'s `steer`). */
  steered(): number {
    return this.steer.steered;                    // the shared clock's (NU-1c's merge with RESUME-MOUNTED)
  }

  /**
   * LATER 104 (`TURRET_RELEASE_SEQ_ADAPTATION`): the steps of `dt` this steer takes through the one on which the clip comes
   * off -- the steer's own ticks (`mountSteerTicks`: the driver's end test `FUN_0028c6e0` D:L134283-134308 asked before each
   * tick's advance, `step`'s first test) and that one, on which the hold places the body (`FUN_0057a330` runs `FUN_00585cd0`
   * that tick, D:L438897-438898). The room's mount comes off on the `ends`th command it runs above the broadcast's `after`,
   * and the page's own keyed clip on the `ends`th it sends (LATER 96).
   */
  ends(dt: number): number {
    return mountSteerTicks(playbackOf(this.shape), this.shape.keys, dt) + 1;
  }

  /**
   * One tick of `dt` seconds on the mover; true when the clip comes off. First the driver's end test on the phase before
   * this tick's advance (`mountPlayedOut`): passed, nothing moves and the facing is laid on the recorded one, as the hold
   * lays it that tick (`FUN_00585cd0`) -- true. Else the advance, then the offset to the seat times `sqrt(steerEase(phase))`
   * laid on the place with no collision, on the floor there (`steerMove`, T81-4: `TURRET_STEER_WALLS_READING`; a mover
   * without the ground takes it through its own `glide` -- was every mover's, PB-2); the facing turned by `seatTurn`
   * through `face`; then `refPt` moved by the root's velocity x dt.
   */
  step(w: SeatMover, dt: number): boolean {
    const s = w.state;
    if (this.yaw === null) this.yaw = s.yaw;
    s.vx = 0; s.vz = 0;
    if (mountPlayedOut(this.run, playbackOf(this.shape), this.shape.keys)) {
      this.yaw = wrapYaw(this.toward);
      w.face?.(this.yaw);
      return true;
    }
    const at = this.target();
    const { phase: p, k, yaw } = this.steer.advance(this.yaw, dt);
    const dx = (at[0] - s.x) * k, dz = (at[2] - s.z) * k;
    if (w.grid) steerMove(w as SeatMover & { grid: Grid }, dx, dz);
    else w.glide?.(dx, dz);
    this.yaw = yaw;
    w.face?.(this.yaw);
    const v = mountRootVelocity(this.shape, p);
    for (let a = 0; a < 3; a++) this.ref[a] = this.ref[a]! + v[a]! * dt;
    s.vx = 0; s.vz = 0;
    return false;
  }
}

/**
 * [reading, pending review] LATER 109 (research 215 s7.9): a dismount's body is carried by the mount clip played reversed.
 * The release (`FUN_00545ee0` D:L411941-412028) writes nothing of the actor's place and pushes the hand's mount clip
 * reversed (`FUN_005a6eb0` D:L462136-462170: `FUN_00588bc0(actor, motion, 0, 1, 0)`, the 1 reaching `FUN_0028c160`
 * D:L134080-134097, which sets the play's reversed bit, the entry's direction `+0x24` to -1 and the phase to the end
 * e = (n - 1) / n); the new play's record is clear (`FUN_0028dc90` -> `FUN_0028cc10` D:L134518), so no steer runs and the
 * root's velocity is not zeroed (D:L439092-439106). Each tick the actor's driver (`FUN_00550ef0`, the vtable 0x6691a0's
 * `+0x18`, the ELF's words) asks the end test first (`FUN_0028c6e0` D:L134283-134308: the stored phase less half a game
 * frame's step under 0; D:L418193), then `FUN_0057a330` (D:L418454) advances the phase by -dt / (playback x e)
 * (D:L438901, `FUN_0028c4f0`), takes the key `floor(phase x n)` (D:L438909, `FUN_0028d670`) and writes the root's
 * velocity into `+0x2c` -- `FUN_0028c250` (D:L438910, D:L134145-134181) through `FUN_00289bb0` (D:L132691-132754): the
 * root's change from that key to the next x n / playback, times the direction -1 -- x `DAT_0064fc80` = 1 (D:L438985,
 * D:L418170); then `FUN_0054d9a0` (the vtable's `+0x28`) turns it by the body's orientation (D:L416479-416490,
 * D:L416515) into `+0xf44` x dt (D:L416520), and `FUN_005483d0` integrates it with no wall (TURRET_STEER_WALLS_READING,
 * widened). On the disc's `seal_stand2turret` (and `seal_p_stand2turret`, the same root): 16 steps at 60 Hz, the last at
 * key 0.964, the body carried (-0.062, 3.165) in its own frame (x right, z behind) -- 3.165 back along the gun's line; at
 * the game's frame 8 steps, (-0.045, 3.163). The vertical is the floor's (D:L416472-416478 zero a one-shot's; the floor's
 * height after the move, D:L413943-413946). The 17th step is the end test's: the set returns (`FUN_00582540`
 * D:L443143-443150 -> `FUN_0058c350`), the walls are back. Open, named: the release's push in the game's frame (the first
 * step on the press's frame or the next; the mount's own open item), a turn of the body during the clip (the travel follows
 * the body's yaw each step either way), the root track's zero-velocity bit (`FUN_00289bb0` D:L132704-132708, unread for
 * the in-memory track; PB-2c's mount travel rests on the same). Owed: capture B 13 (a dismount filmed: the body's path).
 */
export const TURRET_RELEASE_TRAVEL_READING = "the reversed mount clip's root velocity (FUN_0028c250 x -1) into the move, walls off: 3.165 back over 16 steps" as const;

/**
 * [placeholder] LATER 109 (research 215 s7.9): the commands through which a dismount's stick moves nothing -- the 16 steps
 * of the reversed clip and the end's command, the 17th (`ReleaseTravel.ends`); the stick walks from the 18th. Read: no walk
 * motion can be pushed in the turret set -- neither its own four types nor its `GLOBAL` include hold one (`animset.rdr`),
 * and `FUN_00588bc0` refuses a type the set's table lacks (D:L446077-446081; `FUN_005e3d90` D:L495844-495884) -- and the
 * stick's velocity inputs of a player's controller (`+0x198`, `+0x1a4`, added D:L416463-416467, D:L416516-416519) have no
 * writer but the construction's zeroing (`FUN_00598280` D:L454816-454819) and an AI controller's follow (`FUN_0056fd00`
 * D:L433164-433167, the vtable 0x6693f0's, not the player's 0x6694b0). Unknown: the first tick the stick walks -- the 17th
 * (the set returns before the advance) or the 18th (the locomotion's pick, D:L418132 / D:L418155, runs before the end
 * test, D:L418193); the build holds it through the 17th. Owed: capture B 13 (a dismount with the stick held: the frame the
 * body first walks).
 */
export const TURRET_RELEASE_STICK_PLACEHOLDER = 'held through the end command (the 17th at 60 Hz); walks from the 18th' as const;

/**
 * [placeholder] LATER 109 (the review's F2 and F4; research 215 s7.9): what a dismount's other presses and asks do while its
 * reversed clip runs -- the 16 steps and the end's command, as `TURRET_RELEASE_STICK_PLACEHOLDER`. Strict: refused through
 * the clip -- the room takes the jump, the stance, the leans and the swap off the commands, offers no climb or ladder
 * (`climbLock`) and drops a door, a switch's action, a throw, a bomb action, a hostage order and a pickup asked meanwhile
 * ('releasing'); the page's walk lock holds them on its side. Read (the review's, re-read here): the jump is refused under
 * the turret set (`FUN_005b4340(actor, 0xb)` D:L469466-469475, asked at D:L453211-453213 and D:L440806-440807; the jump wants
 * a looped clip on top, D:L440810); the lean is refused (`FUN_005b4340(actor, 1)` -> `FUN_00587c20` D:L469345-469346,
 * D:L469391-469392; a reversed play is interrupted only below phase 1 - NoInterrupt, D:L445549-445564, and the mount clips'
 * NoInterrupt is 1); a climb or a ladder (action 2) is refused under the turret set. Unsettled, so strict by default: the
 * stance is KEPT PENDING in the original, not refused -- `FUN_00552ec0` takes it only under a looped clip
 * (D:L418927-418930) and the request at `+0x374` is asked each tick (`FUN_00552d60` D:L418875), so it is taken after the
 * clip; the port strips it (the page's lock with it) and owes the deferral; the swap, the doors and the pickups are not
 * settled by the read. The remount is ALLOWED (`FUN_005a6fc0` D:L462181-462190 pushes the forward clip over the reversed
 * one): the room allows it (`resolveMounts`), but the page offers none during the travel (its walk lock: `../actionWiring`
 * keeps the picker off) -- owed (the review's F4). The rifle's fire is refused too, strict by the controller's rule: the
 * mount clips carry `NoFire` (`motion.rdr`), whose test on a reversed play is unread -- the room drops a claim 'releasing',
 * the page holds its trigger (`../turretPage` `TurretPage.travelling`). Left as they were (the re-review's F-C, named): the
 * rifle's reload is gated on neither side (its test under the turret set unread); the bomb plant's hold -- the room still
 * counts Action held from the command (`bomb.command`), which an honest page, its walk locked, never sends; the aim and the
 * binoculars are kept by both. The refusals are judged by the command an ask names, against the clip's span in the page's
 * numbering (the dismount's seq + 1 through + 16), a round at the command it is decided on (the re-review's F-A). A stretch the room drops (a backlog, the intake's cut) lays its commands inside the span, through the end's command (+ 17), with the same strip (LATER 140). Named, not settled (LATER 140's review, F3): the room's travel steps only on the commands `run` runs, so after a stretch dropped mid-clip it runs on past the span -- a cut of dseq + 3 .. + 22 leaves it two steps in, and `run` holds the stick and strips the presses of dseq + 23 .. + 37, which the page ran free from dseq + 18 (a jump on dseq + 25 is laid on the page and refused in the room until the reconcile); and a dismount pending across a stretch takes the mounted branch (none of its presses laid), the release and its travel starting that many commands late, at the first command the room runs above it. Immediate asks (a door, a switch's action, a pickup, a placed charge, a bomb action) are judged on arrival by the seq the client names, so a modified page naming a seq past the span -- or none, on a door, an action or a bomb action -- passes mid-clip; honest pages, and the fire (judged at its command), are exact; queuing them to their command is LATER 116, the online lane's. Owed: capture B 13 (a dismount with each press during the clip:
 * a crouch asked mid-clip, a swap, a door in reach, a remount).
 */
export const TURRET_RELEASE_ACTIONS_PLACEHOLDER = 'strict: refused through the reversed clip (the stance taken after it in the original)' as const;

/**
 * The reversed play's end test (`FUN_0028c6e0` D:L134283-134308 on the reversed bit): the stored phase -- `run` seconds of
 * the reversed clip from its end e, `e - run / (playback x e)` -- plus half of `dt x (-1) / (playback x e)` with dt the
 * game's frame (`GAME_FRAME_DT`, as `mountPlayedOut`), under 0. The same count of steps as the forward mount's end.
 */
export function releasePlayedOut(run: number, playback: number, keys: number): boolean {
  const e = oneShotEnd(keys);
  return e - Math.max(0, run) / (playback * e) - GAME_FRAME_DT / (2 * playback * e) < 0;
}

/** One dismount's reversed mount clip on a mover (`TURRET_RELEASE_TRAVEL_READING`), one tick at a time. */
export class ReleaseTravel {
  private ticks = 0;
  private dt = 0;
  private constructor(private readonly shape: MountShape) {}

  /** The travel for a dismount from the hand's mount clip, or null without its shape (no travel then: no clips). */
  static start(shape: MountShape | null): ReleaseTravel | null {
    return shape ? new ReleaseTravel(shape) : null;
  }

  /** The steps of `dt` through the one on which the clip comes off (the set's return): its 16 at 60 Hz and that 17th. */
  ends(dt: number): number {
    if (!(dt > 0)) return 0;
    let j = 0;
    while (!releasePlayedOut(j * dt, playbackOf(this.shape), this.shape.keys)) j++;
    return j + 1;
  }

  /** The steps taken so far. */
  steps(): number {
    return this.ticks;
  }

  /** The reversed play's phase after the steps so far: e less the run over playback x e, held at 0 (`FUN_0028c4f0`). */
  phase(): number {
    const e = oneShotEnd(this.shape.keys);
    return Math.max(0, e - (this.ticks * this.dt) / (playbackOf(this.shape) * e));
  }

  /** The key the play stands on after the steps so far (`phase x n`, `FUN_0028d670`). */
  key(): number {
    return this.phase() * this.shape.keys;
  }

  /**
   * One tick of `dt` seconds on the mover; true when the clip comes off (nothing moves then: the set returns, the walls are
   * back). Else the advance, then minus the root's velocity at that phase (`mountRootVelocity`, the direction -1) turned by
   * the body's own yaw (its orientation, D:L416515), x dt, laid on the place with no collision on the floor there
   * (`steerMove`, TURRET_STEER_WALLS_READING); a mover without the ground takes it through its own `glide`. `yaw`: the body's
   * yaw the step turns by -- the mover's own by default (the room steps before the command's move); the page, which steps
   * after its walker's move, hands the yaw the mover held before that move, so the two turn each step alike.
   */
  step(w: SeatMover, dt: number, yaw = w.state.yaw): boolean {
    const s = w.state;
    s.vx = 0; s.vz = 0;
    if (releasePlayedOut(this.ticks * dt, playbackOf(this.shape), this.shape.keys)) return true;
    this.ticks++;
    this.dt = dt;
    const v = mountRootVelocity(this.shape, this.phase());
    const y = yaw * DEG, c = Math.cos(y), sn = Math.sin(y);
    const dx = -(v[0] * c + v[2] * sn) * dt, dz = -(-v[0] * sn + v[2] * c) * dt;
    if (w.grid) steerMove(w as SeatMover & { grid: Grid }, dx, dz);
    else w.glide?.(dx, dz);
    s.vx = 0; s.vz = 0;
    return false;
  }
}

/**
 * [reading] PAR-44 (research 215 s7.5; reviewed 2026-10-11): the hold's offset of the body from the turret's place, in the
 * body's frame (x right, y up, z behind: `seatTarget`'s) -- -3.257 and 4.282 as float32 (bits `c05072b0` and `40890625`,
 * inline immediates at ELF 0x585ec4-0x585ed0; `FUN_00585cd0` D:L444603-444605). Each frame of the hold `FUN_00585cd0` writes
 * the actor's next position `+0xf54` as the turret's place (`turret+0x1c`: the yaw part's parent's world origin,
 * `FUN_003a8f50` D:L300412-300413 -- the placement's `origin` on Crossroads' two and Vigilance's four, the `scene` turrets
 * test) plus this offset turned by the shortest arc from (0, 0, -1) to the gun's flattened forward (`FUN_00306d40`
 * D:L444622, applied by `FUN_00306fd0` D:L444624-444625). The body stands 3.257 left of the gun's line and 4.282 behind
 * its place, and orbits it with the gun's yaw. Owed: capture B 13 (the mounted body at both yaw stops).
 */
export const TURRET_HOLD_OFFSET_READING: readonly [number, number, number] = Object.freeze([Math.fround(-3.257), 0, Math.fround(4.282)] as [number, number, number]);

/**
 * [reading] The push the mover runs on the hold's place (`FUN_005483d0` D:L413920-413941): under `DAT_0066b000` or the
 * controller's `+0x171` / `+0x172` flags, `FUN_00516f10` (D:L385265-385282: a table at 0x66a1b0 by the actor's byte, then
 * `FUN_005169b0`) answers a vector, held to `DAT_0064fd20` long, added to the place. What it meets -- the flags, the table,
 * the length -- is unread; it is not the walls' resolution (that one takes the velocity's part into a wall, D:L413380-413560,
 * and the hold adds no velocity: the move at D:L413914-413919 is skipped). Null: not applied -- the hold's place stands as
 * written, its height from the floor. Owed: `FUN_005169b0` and the 0x66a1b0 table read, or capture B 13 (a mounted body at
 * both yaw stops beside a wall).
 */
export const TURRET_HOLD_PUSH_READING: null = null;

/**
 * The hold's place at an aim's yaw (degrees, the body's): the turret's place plus `TURRET_HOLD_OFFSET_READING` turned by
 * the yaw -- the gun's flattened facing, the port's clamped aim (TURRET_HOLD_FACING_READING) -- its height the place's
 * (the mover takes its own from the floor).
 */
export function holdPlace(t: Pick<TurretPlacement, 'origin'>, yaw: number): V3 {
  const a = yaw * DEG, c = Math.cos(a), s = Math.sin(a), [x, y, z] = TURRET_HOLD_OFFSET_READING;
  return [t.origin[0] + x * c + z * s, t.origin[1] + y, t.origin[2] - x * s + z * c];
}

/** The mover the hold places: its state, the ground it stands on and whether it falls (`Walker`). */
export interface HoldMover {
  /** `pitch` (degrees, the mover's aim, `Walker.state.pitch`): read by the page's own gun (`../turretPage` `holdTick`), not by the hold. */
  state: { x: number; y: number; z: number; yaw: number; vx: number; vz: number; pitch?: number };
  readonly grid: Grid;
  /** Whether the mover falls (`Walker.airborne`); absent, it does not. */
  readonly airborne?: boolean;
  /** `Walker.setAirborne`: `false` stands it on the floor where it is. */
  setAirborne?(on: boolean): void;
}

/**
 * One tick of the hold on a mounted mover past the mount's steer (research 215 s7.5), after the tick's own move: the
 * mover's place written as `FUN_00585cd0` writes `+0xf54` -- the hold's place at its own yaw, the aim the command laid --
 * and its height taken from the floor there as `FUN_005483d0` takes it (`FUN_0059afd0`, D:L413943-413947; the port's floor
 * pick is the ground step's, `selectFloor` from the feet + `STEP_PROBE_LIFT_READING`); its velocity zeroed. No wall test:
 * the game's mover skips its own move in the hold (D:L413914-413919), so the walls' resolution, which acts on that move's
 * velocity, does not stop it, and the push it does run is unread (`TURRET_HOLD_PUSH_READING`). On Crossroads' turret 1 a
 * wall 1.07 behind the place lies inside the body's 3.5: a move through the walk's collision (`Walker.glide`) stops 2.43
 * short. A mover the tick left falling (its push-out off an edge) is stood on that floor: the hold's body is on the
 * floor. With no floor there, nothing moves (false). The room runs it after the mounted command's move, the page's own
 * prediction after each tick's (`../walk` `WalkMode.setTurretHold`), so the two agree.
 */
export function holdStep(t: Pick<TurretPlacement, 'origin'>, w: HoldMover): boolean {
  const s = w.state, at = holdPlace(t, s.yaw);
  s.vx = 0; s.vz = 0;
  const floor = selectFloor(probeGround(w.grid, at[0], at[2]), s.y + STEP_PROBE_LIFT_READING, s.y);
  if (!floor) return false;
  s.x = at[0]; s.z = at[2]; s.y = floor.y;
  if (w.airborne) w.setAirborne?.(false);
  return true;
}

/**
 * [reading] The node a mounted round's muzzle effect is placed on: the turret's firepoint, turned with the gun -- the node
 * the turret's own fire hands its effect (`FUN_003a8d20` D:L300364: `FUN_00272bb0(effect, 3, 3, +0x288, ...)`, `+0x288`
 * the firepoint, `FUN_003a8f50` D:L300411-300430). The mounted player's round leaves the kit the mount handed the turret's
 * weapon (`FUN_005bc5d0`, D:L412217), whose fire (`FUN_005c5340`) places its flash on the kit's weapon node; which node
 * that is while mounted is unread. Owed: capture B 13 (a mounted burst's flash).
 */
export const TURRET_MUZZLE_NODE_READING = 'firepoint' as const;

/**
 * The firepoint's world matrix at an aim (degrees): its rest matrix (`TurretPlacement.firepointMatrix`) turned about the
 * gun's pivot by `gunDelta` -- 16 floats, three's column-major order. Null without the rest matrix.
 */
export function firepointFrame(t: Pick<TurretPlacement, 'facing' | 'gunOrigin' | 'firepointMatrix'>, yaw: number, pitch: number): Float32Array | null {
  const b = t.firepointMatrix;
  if (!b || b.length !== 16) return null;
  const a = gunDelta(t, yaw, pitch), out = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let v = 0;
    for (let k = 0; k < 4; k++) v += a[k * 4 + r]! * b[c * 4 + k]!;
    out[c * 4 + r] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// The held weapon while mounted (PB-2, research 215 s7.3; PB-2b's rework).

/**
 * [reading, pending review] Where a mounted body's own rifle is drawn while it holds `seal_turret_poses`: on its carry --
 * `character.rdr`'s "rifle" gear on `spinelo` (`./heldItem`'s `carry`). The mount clip stows it: `FUN_00588bc0`
 * (D:L446318-446343) gives `Stand -> Turret` (`DAT_003df108`) a phase callback, `FUN_005a73c0` forward and `FUN_005a7520`
 * reversed, at 0.5 (`TURRET_STOW_PHASE`); the tick its phase crosses it fires it (`FUN_0057a330` D:L438996-439003 through
 * `FUN_0028c7c0`), and a play that ends uncrossed fires it at its end (D:L443133-443141), so every console runs it.
 * `FUN_005a73c0` (D:L462281-462303) moves the rifle's node (`+0x350`) from under `rhand` (`+0x300`) to `spinelo` (`+0x2fc`;
 * the body's look-ups D:L419615-419617), clears the `rifle` slot (`FUN_0028e780(.., DAT_003df148, 0)`) and lays the node's
 * local at the "rifle" gear (`FUN_0058b040(actor, +0x390, +0x394)`, D:L447233-447266; the gear D:L447281-447282). While
 * the mount is the top play `FUN_005a7980(actor, 1)` answers 1 (`DAT_003df108` / `DAT_003df110` on its list,
 * D:L462471-462499), so the pose skips `FUN_005763e0`'s re-slotting (D:L437436-437448); in the hold the clip has no
 * `rifle` or `weapon` track to re-slot it: the rifle stays on its carry. The release's reversed clip runs `FUN_005a7520`
 * (D:L462328-462347) past the same phase: back under `rhand`, the slot re-pointed. *Was* `'hand'` (PB-2b: the node kept the
 * mount clip's last local on `rhand`, the stow unread) and before it `'carry'` (PB-2, `turretHeldMounts`, while the
 * untracked node's write was unread). Owed: capture B 13 (a mounted body from behind and from the side).
 */
export const TURRET_HELD_WEAPON_READING = 'carry' as const satisfies Mount;

/**
 * The mount clips' stow phases (`FUN_00588bc0` D:L446318-446343: the callback's `+0x60`): `Stand -> Turret` 0.5
 * (0x3f000000), `Pistol stand -> Turret` 0.4 (0x3ecccccd, float32) -- the motion's phase, its one-shot end at
 * (n - 1) / n (`FUN_0028cc10`), so key 13 and 10.4 of the 26.
 */
export const TURRET_STOW_PHASE = Object.freeze({ rifle: 0.5, pistol: Math.fround(0.4) });

/**
 * The weapon the turret's mount clip has stowed at `phase` of the hand's clip (0 the rifle's, 1 the pistol's), as mounts
 * over the kit's (`./play` `drawnMounts`): forward (the mount), at or past the phase (`FUN_0028c7c0`: from <= t <= to);
 * `reversed` (the release), above it -- at or below it the reversed callback has handed it back. The rifle's clip:
 * `FUN_005a73c0` puts the rifle on its carry, `FUN_005a7520` back in the hand; the pistol's: `FUN_005a75d0`
 * (D:L462350-462372) moves the pistol (`+0x354`) to `rthigh` (`+0x318`, D:L419628-419629) with the "pistol" gear's local
 * (`FUN_0058b040(+0x398, +0x39c)`; the gear D:L447283-447284) -- `./heldItem`'s `holster` -- and `FUN_005a7730`
 * (D:L462397-462416) back under `rhand`. With the pistol in the hand the rifle is on its carry already.
 */
export function turretStow(hand: 0 | 1, phase: number, reversed: boolean): { rifle?: Mount; pistol?: Mount } {
  const at = hand === 1 ? TURRET_STOW_PHASE.pistol : TURRET_STOW_PHASE.rifle;
  const stowed = reversed ? phase > at : phase >= at;
  if (!stowed) return {};
  return hand === 1 ? { pistol: 'holster' } : { rifle: TURRET_HELD_WEAPON_READING };
}

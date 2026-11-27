/**
 * R4P-301 (LATER 1416; ATLAS L176): the standing turn in place's FOOT PLANT, pure and headless -- the same code on the
 * page's walker and the room's (`./mover` `Walker`, through `./net/moverSim`), so the two move the feet identically,
 * tick for tick, and the room stays authoritative. Reading, pending review (`docs/research/<R4P-301 note>`).
 *
 * The original (r0004 `FUN_00553870`, D4:L455508-455563; r0001 `FUN_0054ea80`, D:L416913-416969; the read
 * `docs/atlas/readings/turn-slide-foot-plant.md`, its Codex second read and atlas-waves' re-read): called by the mover
 * right after it writes the tick's displacement `+0xf44` = dt x velocity (D4:L455110-455118), it OVERWRITES that
 * displacement so that one foot's sole stays on a world anchor while the facing turns -- the body pivots about the
 * planted foot:
 *
 *   `+0xf44` = anchor - R(new facing `+0x70`) x footPoint - position `+0x1c`
 *
 * Its gates: the body is the camera's own (`+0xe0` bit 2; or one of up to 3 eligible bodies within 500 u -- remote
 * bodies are NOT built here: LATER 1491, IQ-104 captured them planting), both foot nodes exist, the top action loops
 * with `+0x105e` bit 4 (the turn in place's Step, set by its push `FUN_00586050`, cleared by the return to stand and
 * the walks), posture `+0x174` 0 (standing), the mode word (`+0x133a` r0004) 0, `+0x1061` bit 3 clear, and the raise
 * envelope's RETURNED weight (`FUN_00288020` r0004 / `FUN_00286c90` r0001, the port's `../weaponRaise` `Envelope.linear`)
 * exactly 0.0 -- the rifle lowered, which is why the rifle up does not slide (`TURN_SLIDE_RIFLE_UP_READING`), and
 * posture is why crouched and prone do not. The foot: by the top action's phase, outside 0.65 +/- 0.2499 the left,
 * inside it the right (image words r0004 0x64e458, 0x64e460); its point 1.09 along the foot node's local x (r0004
 * 0x41eb10) through the posed skeleton into model space. A foot's anchor is that point's world position, latched on
 * the first tick it is the planted one (`+0xf8c` left, `+0xf9c` right; flags `+0x1060` bits 6/7), the flags cleared
 * when Step starts (`FUN_005b8270`).
 *
 * The port's way (`TURN_SLIDE_MECHANISM_READING`): the posed point is not taken from a drawn skeleton (the page's
 * animator steps by the drawn frame, the room's by its tick) but posed here, tick by tick, from `seal_step`'s and
 * `seal_stand`'s own clips -- the clip data the page and the room already load through the repository's readers
 * (`setTurnStepClips`: `./play` on the page, the match server's `loadSimClips` in the room), sampled by the port's own
 * `sampleClipInto` -- through the leg's eight bones: the point is the clips' alone (every SEAL and Terrorist model on
 * MP2 gives the same, its model matrix the identity; `test/footPlantDisc.test.ts`). The phase is the walker's own
 * clock of the play (`FootPlant`), run as `../animator` runs it.
 */
import { sampleClipInto, SEAL_TUNING, type MotionClip, type PartPose } from '@s2u/scene';
import { blendWeight } from './locomotion';
import { RaiseFeed, WeaponRaise } from './weaponRaise';

/**
 * The port's mechanism, named (`docs/research/457-the-turn-slide-foot-plant.md`): the plant in the walker, its leg posed
 * from the loaded clips (no drawn skeleton), its phase the walker's own clock, page and room alike. Without the clips
 * (no `MOTION_P.ZAR`: `setTurnStepClips` never called) the plant does not run.
 */
export const TURN_SLIDE_MECHANISM_READING = "the walker's plant over the loaded seal_step and seal_stand, page and room alike" as const;

/** The clips the plant poses the leg from: `seal_step` (the Step) and `seal_stand` (the idle the cross-fade leaves). */
export const TURN_STEP_CLIP_NAMES = Object.freeze(['seal_step', 'seal_stand'] as const);

/** The leg's chains, foot to root (`CLIB_GEO.ZED`'s parents, checked by `test/footPlantDisc.test.ts`). */
const LEG = Object.freeze({
  left: ['lfoot', 'lcalf', 'lthigh', 'hips', 'skel_root'] as const,
  right: ['rfoot', 'rcalf', 'rthigh', 'hips', 'skel_root'] as const,
});

interface LoadedClips { step: MotionClip; stand: MotionClip; stepAt: Map<string, number>; standAt: Map<string, number> }
let loaded: LoadedClips | null = null;

/**
 * The clips the plant reads, from the pack a process has loaded (the page's play data, the room's sim clips): found by
 * name; null (or a pack without either clip, or a chain bone) leaves the plant off. One per process: the page and the
 * room each load the same `MOTION_P.ZAR`, so their walkers pose the same leg.
 */
export function setTurnStepClips(clips: readonly MotionClip[] | null): void {
  const step = clips?.find((c) => c.name === 'seal_step'), stand = clips?.find((c) => c.name === 'seal_stand');
  if (!step || !stand) { loaded = null; return; }
  const at = (c: MotionClip): Map<string, number> => new Map(c.parts.map((p, k) => [p.name, k]));
  const stepAt = at(step), standAt = at(stand);
  const bones = [...LEG.left, ...LEG.right];
  loaded = bones.every((n) => stepAt.has(n) && standAt.has(n)) ? { step, stand, stepAt, standAt } : null;
}

/** Whether the plant has its clips (`setTurnStepClips`). */
export function turnStepClipsLoaded(): boolean {
  return loaded !== null;
}

/**
 * The plays' phase rates a second at speed 1, `../locomotion` `phaseRate` of `motion.rdr`'s entries (READERC.ZAR,
 * pinned): `seal_step` playback 0.65, K 1 (no root travel) -> 1 / 0.65; `seal_stand` playback 6 -> 1 / 6, the idle's
 * rate raised or lowered -- the rifle-up idle `seal_fp_stand` is an overlay on the same play, copying its node's speed
 * (Tick_0 `FUN_0057f580` D4:L479363, AddOverlay `FUN_0028d160` D4:L479393, D4:L141720-141731; atlas-waves), so the
 * raise re-pushes no play and runs no clock of its own. And `seal_step`'s BlendTime 0.9: the cross-fade into the Step
 * (`FUN_0028dc90`; the plant reads the bones after it, `FUN_0057bc40` runs before the mover, D4:L457158-457159).
 */
export const TURN_STEP_CLIPS_READING = Object.freeze({ stepRate: 1 / 0.65, standRate: 1 / 6, stepBlend: 0.9 });

/** The foot's point along its node's local x (r0004 image word 0x41eb10; r0001 0x3f3430). */
export const FOOT_PLANT_POINT_X = 1.09;
/** The phase window: inside `centre +/- tolerance` (inclusive) the right foot plants, outside it the left (0x64e458, 0x64e460). */
export const FOOT_PLANT_PHASE = Object.freeze({ centre: 0.65, tolerance: 0.2499 });

/**
 * The latches (atlas-waves, r0004, 2026-11-24; reading, pending review): a set bit REUSES its stored anchor, and
 * planting one foot clears the other's bit -- left: bit 6 clear latches `+0xf8c`, sets bit 6, clears bit 7
 * (D4:L455540-455544; D:L416945-416948), the right the mirror (D4:L455551-455555; D:L416956-416959) -- so every SWAP
 * latches afresh, and gates failing mid-stint then passing on the same foot reuse its anchor. The only other writer is
 * TurnSetup `FUN_005be840` (D4:L512893-512903), from StandTurning (D4:L485354) when it pushes a NEW Step only.
 */
export const FOOT_PLANT_LATCH_READING = 'per-swap' as const;

/**
 * The latch tick's frame (atlas-waves, r0004): the node's matrix `*(body+0x28)` times this tick's posed point
 * (D4:L455539-455541), the matrix written only at the end of the apply `FUN_0054cf30` after the mover
 * (D4:L454188-454193) -- the PREVIOUS tick's facing and position; the new facing enters through R(`+0x70`) x point
 * alone (D4:L455545-455547).
 */
export const FOOT_PLANT_LATCH_FRAME_READING = 'previous-facing' as const;

/**
 * The Step's phase at its push (atlas-waves, r0004): StandTurning `FUN_0058b680` (D4:L485313-485362) takes
 * trunc(old top phase x 60) before the push (D4:L141903); PushBlend `FUN_0028f020` carries the old top's phase into a
 * looped play from a looped one (D4:L142910, D4:L142975-142978); 17..47 sets 0.5 (D4:L485347-485353). The walker's
 * clock (`FootPlant.phase`) runs the standing idle from 0 when that idle starts -- a play pushed with no old top starts
 * at 0 (PushBlend with no current top, D4:L142903-142907; `FUN_0028dfa0` D4:L142265-142275), so a placing restarts it;
 * whether a respawn empties the original's stack first is open -- at `seal_stand`'s rate whether raised or lowered
 * (`TURN_STEP_CLIPS_READING`). The phase a walk or run carries into the idle is not tracked (a turn begun within one
 * idle cycle of stopping may start from another phase).
 */
export const STEP_START_PHASE_READING = 'idle-clock' as const;

/**
 * The Step's phase rate (atlas-waves, r0004): signed, weight x speed x K / T (`FUN_0028e900` D4:L142602, `FUN_0028d880`
 * D4:L141990-142045), speed `FUN_00588f60` (D4:L484159-484205) = min(0.6, 0.6 x |2 x axis|) standing, negated for a
 * left turn (axis > 0). `../animator` `turnStepSpeed` holds it for every stance; the walker's copy here is the standing
 * row (`stepSpeedStanding`), pinned equal to it by `test/turnSlide.test.ts` (an import would close a module cycle:
 * the animator imports the mover).
 */
export const TURN_STEP_STAND_SHARE = 0.6;
export function stepSpeedStanding(turn: number): number {
  const axis = turn / SEAL_TUNING.turnMaxRate, speed = Math.min(TURN_STEP_STAND_SHARE, Math.abs(2 * axis) * TURN_STEP_STAND_SHARE);
  return -axis * 2 < 0 ? -speed : speed;
}

/**
 * The raise gate's weight (`TURN_SLIDE_RIFLE_UP_READING`): the plant's own `../weaponRaise` `WeaponRaise`, fed each tick
 * the command's raise state alone (`Walker.raised`, ER-2's +0xf74), as a remote copy's is fed (`RaiseFeed`, ER-2) --
 * the same on the page's walker and the room's, and kept on the walker across the page's replays. Its RETURNED weight
 * (`Envelope.linear`, `FUN_00288020` r0004) exactly 0 passes. The slot's own times are not fed: the rifle's
 * (`RAISE_TIMES`) for every hand, a named simplification for the pistol's.
 */
export const TURN_SLIDE_RIFLE_UP_READING = 'the returned raise weight 0, fed by the command raise state' as const;

/**
 * The bodies that plant (`+0xe0` bit 2): a player's own walker, page and room (`Walker.idleFrame`, laid from the seat's
 * kind on each command by `./net/moverSim` `prepare`: a pad's seat). A bot's does not -- in the room no bot is a
 * console's camera body; the original's plant of up to 3 other bodies within 500 u of a viewer (FUN_00557a10; IQ-104
 * captured a remote body planting) is not built here: LATER 1491.
 */
export const TURN_SLIDE_BODIES_READING = "a player's own walker; no bot, no remote copy" as const;

/**
 * The review's F3 (named, unread): the anchor stays latched while something other than the plant moves the body -- the
 * steep slide (`../steepSlide`, which replaces the move on its ticks), a wall's response -- so a turning body on a slope's
 * face is drawn back toward the anchor when the slide lets go. The original's interplay of its slope slide `FUN_0054edf0`
 * (run after the plant) with the latches is not read; the atlas read covers open flat ground. Settles it: a capture of a
 * rifle-down turn at a slope's foot (`+0xf8c`/`+0xf9c` and `+0xf44` per frame).
 */
export const FOOT_PLANT_SLIDE_READING = 'the anchor kept through a slide' as const;

/**
 * The cross-fade into the Step (the main controller's ruling 2026-11-24 after IQ-178 (B); atlas-waves' non-author second
 * read, reading pending review): `FUN_0057bc40` (D4:L477267-477362) runs after the body tick and before the mover
 * (D4:L457158-457159), `+0x178 -= dt`, w = ease(`+0x178` / `+0x17c`) running 1 -> 0 (`FUN_00288880`), and SmoothAnims
 * `FUN_0028f460` (D4:L143053-143076; r0001 `FUN_0028e0d0` D:L135283-135306) pulls every part toward the snapshot --
 * its translation lerped and its rotation blended (`FUN_00323e80`: a normalised lerp above a dot of 0.95, else a
 * slerp) -- so the plant (`FUN_00287d60`) reads the faded leg. The port blends the leg's eight bones toward
 * `seal_stand`'s first key: the original's snapshot is the previous tick's DRAWN pose (`FUN_0057b6c0`, `FUN_0028f770`
 * D4:L143157-143182), with the rifle lowered `seal_stand` at its phase, under 0.005 from its first key
 * (`test/footPlantDisc.test.ts`). Not built: the second 0.4 s fade on `+0x10d0` (`FUN_0057bae0`) after the cross-fade.
 * *Was* (the review's F4, retired): the stand POINT eased toward the Step's point -- the low cluster's path 2 % long.
 */
export const FOOT_PLANT_FADE_READING = "the leg's bones slerped toward seal_stand's first key" as const;

/**
 * The review's F4 (named departures): two of the original's gates have no port twin -- the mode word `+0x133a` (its
 * setters seen are AI's: a player's walker is mode 0) and `+0x1061` bit 3 (not read) -- taken as passed on a player's
 * walker.
 */
export const TURN_SLIDE_GATES_READING = 'the mode word and +0x1061 bit 3 taken as passed' as const;

/** Which foot plants at play phase `phase` (wrapped into [0, 1)): the float32 subtraction and inclusive bounds. */
export function plantedFoot(phase: number): 'left' | 'right' {
  const f = Math.fround;
  const d = f(f(phase) - f(FOOT_PLANT_PHASE.centre));
  const t = f(FOOT_PLANT_PHASE.tolerance);
  return d >= -t && d <= t ? 'right' : 'left';
}

const stepPose: PartPose[] = [], standPose: PartPose[] = [];
const T: [number, number, number] = [0, 0, 0], Q: [number, number, number, number] = [0, 0, 0, 0];

/**
 * The planted foot's point, model space (x right, z behind): `seal_step` posed at play phase `phase` (`sampleClipInto`,
 * the port's own keys and slerp), each of the chain's bones faded toward `seal_stand`'s first key by `1 - w`
 * (`FOOT_PLANT_FADE_READING`), the point `FOOT_PLANT_POINT_X` along the foot's local x carried up the chain to the root,
 * the root's x/z zeroed (the step branch, `FUN_0057f580` D4:L479633-479672). Null without the clips.
 */
export function legPoint(foot: 'left' | 'right', phase: number, w: number): [number, number] | null {
  const c = loaded;
  if (!c) return null;
  sampleClipInto(c.step, wrap(phase) * c.step.duration, { loop: true }, stepPose);
  sampleClipInto(c.stand, 0, { loop: true }, standPose);
  const chain = LEG[foot], k = 1 - w;
  let px = FOOT_PLANT_POINT_X, py = 0, pz = 0;
  for (let n = 0; n < chain.length; n++) {
    const a = stepPose[c.stepAt.get(chain[n]!)!]!, b = standPose[c.standAt.get(chain[n]!)!]!;
    slerp(a.rotation, b.rotation, k, Q);
    if (n > 0) { px += T[0]; py += T[1]; pz += T[2]; }           // the child's translation, in this bone's frame
    [px, py, pz] = rotate(Q, px, py, pz);
    for (let i = 0; i < 3; i++) T[i] = a.translation[i]! + (b.translation[i]! - a.translation[i]!) * k;
  }
  return [px, pz];                                               // the root's own translation: x/z zeroed, y unread
}

/**
 * v (a row vector) through the rotation `partMatrixInto` builds from q (x y z w; three.js's order) -- the skeleton's own
 * formula, so a key a hair off unit length (the disc's keys: up to 5e-5) poses as the page's and the room's skeletons do.
 */
function rotate(q: readonly number[], x: number, y: number, z: number): [number, number, number] {
  const qx = q[0]!, qy = q[1]!, qz = q[2]!, qw = q[3]!;
  const xx = qx * qx, yy = qy * qy, zz = qz * qz, xy = qx * qy, xz = qx * qz, yz = qy * qz, wx = qw * qx, wy = qw * qy, wz = qw * qz;
  return [
    x * (1 - 2 * (yy + zz)) + y * 2 * (xy - wz) + z * 2 * (xz + wy),
    x * 2 * (xy + wz) + y * (1 - 2 * (xx + zz)) + z * 2 * (yz - wx),
    x * 2 * (xz - wy) + y * 2 * (yz + wx) + z * (1 - 2 * (xx + yy)),
  ];
}

/**
 * SmoothAnims' rotation blend (`FUN_00323e80`, the shorter arc; atlas-waves' second read): a normalised lerp when the
 * keys' dot is over 0.95, else a slerp -- every leg bone of the Step against `seal_stand` key 0 dots 0.978-1.000, so
 * the lerp in practice; at an end the key itself.
 */
function slerp(a: readonly number[], b: readonly number[], t: number, out: [number, number, number, number]): void {
  // At an end the key itself, as `sampleClipInto` hands over a key (its raw words, up to 5e-5 off unit length).
  if (t <= 0) { out[0] = a[0]!; out[1] = a[1]!; out[2] = a[2]!; out[3] = a[3]!; return; }
  if (t >= 1) { out[0] = b[0]!; out[1] = b[1]!; out[2] = b[2]!; out[3] = b[3]!; return; }
  let bx = b[0]!, by = b[1]!, bz = b[2]!, bw = b[3]!;
  const ax = a[0]!, ay = a[1]!, az = a[2]!, aw = a[3]!;
  let dot = ax * bx + ay * by + az * bz + aw * bw;
  if (dot < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; dot = -dot; }
  let wa = 1 - t, wb = t;
  if (dot <= 0.95) {
    const theta = Math.acos(Math.min(1, dot)), sn = Math.sin(theta);
    wa = Math.sin((1 - t) * theta) / sn;
    wb = Math.sin(t * theta) / sn;
  }
  const x = wa * ax + wb * bx, y = wa * ay + wb * by, z = wa * az + wb * bz, ww = wa * aw + wb * bw;
  const len = Math.hypot(x, y, z, ww) || 1;
  out[0] = x / len; out[1] = y / len; out[2] = z / len; out[3] = ww / len;
}

/** A model-space point to the world's x/z at the feet `x`, `z` and `yawDeg` (`./play` `actorToWorld`). */
export function footToWorld(x: number, z: number, yawDeg: number, p: readonly [number, number]): [number, number] {
  const r = (yawDeg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [x + p[0] * c + p[1] * s, z - p[0] * s + p[1] * c];
}

/** What the walker hands the plant each tick (`Walker` `step60`, after the facing is advanced and before the move). */
export interface FootPlantTick {
  /** Standing, posture standing, on the ground, the stick at rest, no action or hold on top (the ground state runs). */
  standingStill: boolean;
  /** `Walker.turn`, radians a second, left positive (the look gate's, `./net/lookGate`, page and room). */
  turn: number;
  /** The command's raise state (`Walker.raised`). */
  raised: boolean;
  /** A player's own walker (`TURN_SLIDE_BODIES_READING`); false: the plant does not run. */
  player: boolean;
  /** The facing this tick (degrees, already advanced) and the last tick's. */
  yaw: number;
  prevYaw: number;
  x: number;
  z: number;
  dt: number;
}

/**
 * The walker's turn-in-place play clock, its raise envelope and the plant's latches -- `+0x105e` bit 4, the top
 * action's phase, the cross-fade's timer, `+0x1160`, `+0xf8c` / `+0xf9c` and their bits. `tick` returns the
 * displacement that overwrites the tick's (x, z), or null when the plant does not run.
 */
export class FootPlant {
  /** `+0x105e` bit 4: the Step on top. */
  stepping = false;
  /** The play's phase in [0, 1): the standing idle's while not stepping, the Step's while it plays. */
  phase = 0;
  private fade = 0;
  private wasStill = false;
  private anchors: { left: [number, number] | null; right: [number, number] | null } = { left: null, right: null };
  private readonly raise = new WeaponRaise();
  private readonly feed = new RaiseFeed();

  reset(): void {
    this.stepping = false; this.phase = 0; this.fade = 0; this.wasStill = false;
    this.anchors = { left: null, right: null };
    this.raise.reset(); this.feed.reset();
  }

  /** The raise envelope's returned weight now (`Envelope.linear`). */
  raiseWeight(): number {
    return this.raise.envelope.linear();
  }

  tick(i: FootPlantTick): [number, number] | null {
    this.raise.frame(i.dt, this.feed.input({ hold: null }, false, { trigger: false, aiming: false, raised: i.raised }, null));
    if (!i.standingStill) { this.stepping = false; this.wasStill = false; this.phase = 0; return null; }
    if (!this.wasStill) { this.wasStill = true; this.phase = 0; }      // STEP_START_PHASE_READING: the idle from 0
    if (i.turn === 0) {
      this.stepping = false;                                        // the return to stand clears bit 4
      this.phase = wrap(this.phase + TURN_STEP_CLIPS_READING.standRate * i.dt);   // one play: the Fire idle an overlay
      return null;
    }
    if (!this.stepping) {                                           // StandTurning's push of a new Step
      this.stepping = true;
      const at = Math.trunc(this.phase * 60);
      if (at >= 17 && at <= 47) this.phase = 0.5;
      this.fade = 0;
      this.anchors = { left: null, right: null };                   // TurnSetup: both bits cleared
    }
    // The body tick before the mover (D4:L457158-457159): the play advances, then the cross-fade.
    this.phase = wrap(this.phase + stepSpeedStanding(i.turn) * TURN_STEP_CLIPS_READING.stepRate * i.dt);
    this.fade = Math.min(this.fade + i.dt, TURN_STEP_CLIPS_READING.stepBlend);
    if (!i.player || this.raiseWeight() !== 0) return null;        // `+0xe0` bit 2; the raise gate, exactly 0
    const foot = plantedFoot(this.phase), other = foot === 'left' ? 'right' : 'left';
    const w = blendWeight(this.fade / TURN_STEP_CLIPS_READING.stepBlend);
    const p = legPoint(foot, this.phase, w);
    if (!p) return null;                                          // no clips: TURN_SLIDE_MECHANISM_READING
    if (!this.anchors[foot]) { this.anchors[foot] = footToWorld(i.x, i.z, i.prevYaw, p); this.anchors[other] = null; }
    const anchor = this.anchors[foot]!, at = footToWorld(i.x, i.z, i.yaw, p);
    return [anchor[0] - at[0], anchor[1] - at[1]];
  }
}

function wrap(p: number): number {
  return ((p % 1) + 1) % 1;
}

import { weaponCategory } from '@s2u/scene';
import { PISTOL_ANIMS, SEAL_ANIMS } from '../locomotion';
import { ACTION_CLIPS, HOLD_CLIPS, type MoverActionName, type TraversalHooks, type Walker } from '../mover';
import type { MotionEntry, MotionTable } from '../motionTable';
import { PISTOL_CLIMB_CLIPS, TRAVERSAL_CLIP } from '../traversal';

/**
 * The fire's permission from the body's playing motion (PF-17; research 194 A02, 218 s1; ruling PF.R36), headless and
 * shared: the page's `WalkMode.fireAllowed` (its `Fire.source.ready`) and the room's `aim()` (recorded per command in
 * `AimFrame.fire`, `./shotCone`) ask the same two functions of the same mover code.
 *
 * - **The field.** `motion.rdr`'s `NoFire`, read by `FUN_00287620` into the motion's `+0x2c` (D:L131397-131429): absent
 *   0, bare 1.0, numeric the float (`../motionTable` `MotionEntry.noFire`).
 * - **The consumer.** `FUN_005c0ae0` (D:L476375-476378, 476442-476444) asks `FUN_005a7de0` before a round: states 0, 1, 2,
 *   3 and 6 only (D:L462612); the throw/toss, reload/swap and paired/CQB families refused (D:L462620-462678, the port's
 *   own gates: `Walker.swapProgress`, the reload lock, `./grenade`); then, for the ordinary firearm, the top stack
 *   entry's phase (`+0x1c`) against each of its leaves' `+0x2c` through `FUN_0058a8c0` (D:L462695-462705, the reverse
 *   flag the entry's `+0x28` bit 0x20).
 * - **The comparator** (`FUN_0058a8c0`, D:L446897-446915; 194 A02's `scalar.txt` executed it): forward play allows a
 *   round only at **phase > NoFire**, reverse play only at **phase < 1 - NoFire**, both strict -- so a bare `NoFire`
 *   refuses through phase 1 either way, and `seal_crouch2prone`'s 0.8 opens strictly past 0.8.
 * - **The phase.** The stack's `+0x1c`, the same phase and the same reverse bit `FUN_00587c20` compares with
 *   `NoInterrupt` (D:L445553-445570): the port's `t / (playback x (n - 1) / n)` (`Walker.actionInterruptible`,
 *   `holdCut`), not the brief's `t / seconds` (which runs `n / (n - 1)` faster) -- one clock for both fields of the
 *   motion (`NOFIRE_PHASE_READING`). The port's own convention (`Walker.clipVelocity`): the run `t / (playback x
 *   (n - 1) / n)`, the phase that run forward and `(n - 1) / n - run` backwards, held in [0, (n - 1) / n] -- a key k
 *   stands at phase k / n either way.
 *
 * No blanket airborne or any-action lock (194 A02): the standing jump, the fall, the soft landing and the six short
 * flinches carry no `NoFire` and fire throughout; the running jump's launch (`seal_runningjump_launch`, and the pistol's)
 * carries its own 0.2, so a running jump refuses rounds for its first 0.2 x 2.4 x 24/25 = 0.461 s, as any clip's
 * `NoFire` does. The still crouched and prone reload holds carry a bare `NoFire` too: past the reload's lock the rest
 * of such a hold is refused here (research 218 s1.4).
 */

/** What the body is playing, as the gate reads it: the clip's name, its phase and whether it plays backwards. */
export interface PlayingMotion {
  clip: string;
  /** The clip's phase (the stack's `+0x1c`, `NOFIRE_PHASE_READING`): forward from 0, backwards from (n - 1) / n down. */
  phase: number;
  reversed: boolean;
  /** The moves' actor state is one the gate refuses whatever the clip (`TraversalHooks.clip`, `NOFIRE_STATE_READING`). */
  stateRefused?: boolean;
  /** The clip's own `NoFire` where the motion carries its row (the victory dance's, research 303); absent, the table's. */
  noFire?: number | null;
  /**
   * R4P-211 (`NOFIRE_LEAF_AGGREGATE_READING`): the top's leaves in their linked order, where a caller knows a blended top;
   * each leaf's own `NoFire`, absent the table's. Absent: the one clip is the one leaf (the port's `motionOf` today).
   */
  leaves?: readonly { clip: string; noFire?: number | null }[];
}

/**
 * R4P-211: what the kit holds, as the gate's placed-charge term reads it -- the kit's current item's id (`+0x7c`, whose
 * class the gate takes through `FUN_003d1e10`, the port's `weaponCategory`) and the actor's hand byte `+0xf79` (1 the
 * rifle, 2 the pistol, 4 the raised launcher: `../weaponLine`, `FUN_005a6d30` D:L462119).
 */
export interface FireHeld {
  itemId: number;
  handByte: number;
}

/**
 * NOFIRE_LEAF_AGGREGATE_READING (218 s5): which of the playing leaves the gate reads. `FUN_005a7de0`'s loop over the top
 * entry's blended leaves (D:L462695-462705) overwrites its result each leaf -- the last leaf's answer stands, not an
 * AND. The port plays one clip at a time on the stack (`Walker.action`, the hold, the move's clip), so it reads that
 * one ('top'). R4P-211 (r0004 0x5adae0, D4:L503765-503777, `FUN_0058fec0` D4:L487564-487582; reading, pending review):
 * `fireAllowed` takes a top's ordered leaves where a caller gives them (`PlayingMotion.leaves`): the answer starts at
 * refused and each leaf replaces it, so the last leaf decides and an empty top refuses; `motionOf` gives none yet. Owed:
 * the leaf order of a blended top (the crate/medium climb's two nodes) and a capture at a boundary (C11).
 */
export const NOFIRE_LEAF_AGGREGATE_READING = 'top' as const;

/**
 * NOFIRE_ABSENT_READING (218 s5): a motion with no `NoFire` (the loader's 0) is open. `FUN_0058a8c0` strictly refuses
 * phase 0 itself (0 > 0 is false) -- the instant of a push -- and the port's landing is pushed after its tick's clock
 * ran (`Walker.land`), so its first command would stand at exactly 0 for a whole 60 Hz tick where the original's next
 * frame has moved on. Owed: a capture of a round at a soft landing's first frame.
 */
export const NOFIRE_ABSENT_READING = 'open' as const;

/**
 * R4_TRAVERSAL_NOFIRE_READING (R4P-211, research 218 s6; reading, pending review): the clips of the six traversal actions
 * r0004's `CanFire` (0x5adae0) refuses outright, before the timing and whatever their `NoFire` (D4:L503736-503751, through
 * the action query r0004 0x57d220, D4:L478054-478068: the action or its anim-set equivalent): Climb crate (0x2a), Climb
 * medium, Stand -> Hang (0x21), Climb over, Step up and Stand -> Ladder (0x2c) -- the port's `TRAVERSAL_CLIP` for each,
 * and the Seal anim set's pistol versions it holds (`PISTOL_CLIMB_CLIPS`: the crate, the medium, Stand -> Hang), with
 * `seal_p_stand2ladder` (in `motion.rdr`, the golden `motion-rdr.json`; the review's F6 -- the port's ladder mount plays
 * the rifle's clip, so it changes nothing today). r0001
 * has no such test (D:L462679-462686). The reading is the action-to-clip mapping by name (a move's clip standing for the
 * actor's action `+0x534`) and the leaves each action plays; owed: `motion.rdr`'s NoFire on those leaves and their
 * pistol variants through the repository's reader, and capture C11 (a press during each traversal, r0001 against r0004).
 */
export const R4_TRAVERSAL_NOFIRE_READING: readonly string[] = Object.freeze([
  TRAVERSAL_CLIP.climbLow, TRAVERSAL_CLIP.climbMed, TRAVERSAL_CLIP.toHang, TRAVERSAL_CLIP.over, TRAVERSAL_CLIP.stepUp,
  TRAVERSAL_CLIP.toLadder,
  PISTOL_CLIMB_CLIPS[TRAVERSAL_CLIP.climbLow]!, PISTOL_CLIMB_CLIPS[TRAVERSAL_CLIP.climbMed]!, PISTOL_CLIMB_CLIPS[TRAVERSAL_CLIP.toHang]!,
  'seal_p_stand2ladder',
]);
const TRAVERSAL_REFUSED: ReadonlySet<string> = new Set(R4_TRAVERSAL_NOFIRE_READING);

/**
 * FIRE_PLACED_CHARGE_HAND_READING (R4P-211, research 218 s5-s6; reading, pending review; *was* the C4-only constant,
 * the review's F1 of bbf2fc03d3): the gate's charge term compares the CLASS of the kit's current item --
 * `FUN_003d1e10` (D:L462690-462691) returns `FUN_003d1a60` of the id byte `+0x7c` (D:L324460-324465), which files every
 * id 0x97-0xaa under 0x97 (D:L324345-324346; the port's `weaponCategory`): C4 0x97, the satchel 0x98, the claymore
 * 0x99, MPBOMB 0x9a and the PMN 0x9e are one class. r0001 asks that class only under its two action predicates
 * (`FUN_00587f50` / `FUN_00587f10`, the jump and the landings, D:L462687-462693; not in `fireAllowed`:
 * `ACTION_GATE_C4_AIR_READING`'s and `NOFIRE_EQUIPMENT_CLASS_READING`'s); r0004 keeps that compare and also enters it
 * with the hand byte `+0xf79` at 4 (D4:L503756-503766). The port's reading: the byte 4 is the raised launcher
 * (`FUN_005a6d30` D:L462119; `../weaponLine`'s mounts). No caller tells `fireAllowed` what the kit holds yet (the
 * placing start asks no fire gate in the port, `../grenadeCore` `startPlacing`; research 392 s3 (a)), so the term is the
 * shared function's alone. Owed: the placing start asking the gate with the held id and the hand byte, and the
 * class-0x97 hand-state-4 case in capture C11.
 */
export const FIRE_PLACED_CHARGE_HAND_READING = Object.freeze({ itemClass: 0x97, handByte: 4 } as const);

/** Each mover action's clip (`SEAL_ANIMS`; the fall plays the in-air clip). */
const ACTION_CLIP_NAMES: Readonly<Record<MoverActionName, string>> = {
  jump: SEAL_ANIMS.jump, launch: SEAL_ANIMS.launch, fall: SEAL_ANIMS.inAir, land: SEAL_ANIMS.land, landHard: SEAL_ANIMS.landHard,
  standToCrouch: SEAL_ANIMS.standToCrouch, crouchToProne: SEAL_ANIMS.crouchToProne, standToProne: SEAL_ANIMS.standToProne,
  hit: SEAL_ANIMS.hit, hitStomach: SEAL_ANIMS.hitStomach, landDeath: SEAL_ANIMS.landDeath, getUp: SEAL_ANIMS.getUp,
  swapStand: SEAL_ANIMS.swapStand, swapCrouch: SEAL_ANIMS.swapCrouch, swapProne: SEAL_ANIMS.swapProne,
  fallForward: SEAL_ANIMS.fallForward, fallBackwards: SEAL_ANIMS.fallBackwards, landBackwards: SEAL_ANIMS.landBackwards,
  getUpBackwards: SEAL_ANIMS.getUpBackwards,
  proneCover: SEAL_ANIMS.proneCover,                             // PF-19: `NoFire ()` bare -- no round through it
  // PAR-84: the launcher's raise and still lower, `NoFire ()` bare (research 230 section 5.2.6) -- no round through them.
  rifleToLauncher: SEAL_ANIMS.rifleToLauncher, pistolToLauncher: SEAL_ANIMS.pistolToLauncher,
  // NU-5 X1 / research 324 P2: the pick-up's `Swap rifle`, `NoFire ()` bare -- no round through it (research 211).
  swapRifleExchange: SEAL_ANIMS.swapRifleExchange, swapRifleClaim: SEAL_ANIMS.swapRifleClaim,
  // LATER 1188: a hostage's flashbang cower (a hostage's action alone: no player's mover, no round through it).
  cowerStand: SEAL_ANIMS.cowerStand, cowerStand2: SEAL_ANIMS.cowerStand2,
  cowerCrouch: SEAL_ANIMS.cowerCrouch, cowerCrouch2: SEAL_ANIMS.cowerCrouch2,
};

/**
 * NOFIRE_PHASE_READING (218 s5): the phase the gate compares is the stack's (`+0x1c`), the one `FUN_00587c20` compares
 * `NoInterrupt` with (D:L445553-445570), on the port's own clock for it (`Walker.clipVelocity`, `actionInterruptible`):
 * the run `t / (period x (n - 1) / n)`, forward that run and backwards `(n - 1) / n - run`, held in [0, (n - 1) / n].
 */
export const NOFIRE_PHASE_READING = 'stack' as const;

/** A one-shot's stack phase `t` seconds in, forward or backwards (`NOFIRE_PHASE_READING`). */
function stackPhase(t: number, period: number, frames: number, reversed: boolean): number {
  const end = frames < 2 ? 1 : (frames - 1) / frames;
  const run = period > 0 ? t / (period * end) : 0;
  return Math.min(end, Math.max(0, reversed ? end - run : run));
}

/**
 * The motion on top of the body's stack, or null (the ground state's loops: no `NoFire`). In order: a move holding the
 * mover (a ladder, a climb, a hang: `TraversalHooks.clip`), the victory dance (research 303), the kit's hold (a throw,
 * the claymore, a still reload), the mover's action (a jump, a landing, a stance change, a get-up, a swap) -- the
 * pistol's version of its clip with the sidearm in hand (`PISTOL_ANIMS`, `FUN_0058c9e0`) -- and last the peek's lean
 * clip (state 3: it fires).
 */
export function motionOf(walker: Walker, moves: TraversalHooks | null | undefined, pistol = false): PlayingMotion | null {
  if (moves?.busy()) {
    const m = moves.clip?.();
    if (m) return { clip: m.clip, phase: m.phase, reversed: m.reversed, stateRefused: m.stateRefused };
  }
  // Research 303: the victory dance pushed on top (`FUN_0057dcc0`), its row's bare `NoFire` (motion.rdr) with it.
  const v = walker.victoryMotion;
  if (v) return { clip: v.clip, phase: stackPhase(v.elapsed, v.playback, v.frames, false), reversed: false, noFire: v.noFire };
  const h = walker.holding;
  if (h) return { clip: h.clip, phase: stackPhase(h.t, h.period, HOLD_CLIPS[h.clip].frames, false), reversed: false };
  const a = walker.action;
  if (a) {
    const base = ACTION_CLIP_NAMES[a.name];
    const clip = pistol ? PISTOL_ANIMS[base] ?? base : base;
    const c = a.name === 'fall' ? null : ACTION_CLIPS[a.name];
    return { clip, phase: c ? stackPhase(a.t, c.playback, c.frames, a.reversed) : 0, reversed: a.reversed };
  }
  const m = moves?.clip?.();
  return m ? { clip: m.clip, phase: m.phase, reversed: m.reversed, stateRefused: m.stateRefused } : null;
}

/** One leaf's answer (`FUN_0058a8c0`): forward `phase > NoFire`, reversed `phase < 1 - NoFire`; no `NoFire`, open. */
function leafAllows(phase: number, reversed: boolean, noFire: number | null): boolean {
  if (noFire === null) return true;                               // NOFIRE_ABSENT_READING
  return reversed ? phase < 1 - noFire : phase > noFire;
}

/**
 * Whether a firearm's round may leave over `motion` (`FUN_005a7de0`'s firearm branch, `FUN_0058a8c0`): the hard
 * refusals first -- a placed charge (class 0x97) in hand state 4 (`FIRE_PLACED_CHARGE_HAND_READING`, `held`), a state the gate refuses, one of r0004's six
 * traversal actions (`R4_TRAVERSAL_NOFIRE_READING`) -- then the timing: each leaf's `NoFire` in order, forward
 * `phase > NoFire`, reversed `phase < 1 - NoFire`, the last leaf's answer standing and an empty top refused
 * (`NOFIRE_LEAF_AGGREGATE_READING`); with no leaves told, the clip's own. No motion, no table, or a clip without
 * `NoFire`: open (`NOFIRE_ABSENT_READING`).
 */
export function fireAllowed(motion: PlayingMotion | null, table: ReadonlyMap<string, Pick<MotionEntry, 'noFire'>> | null, held: FireHeld | null = null): boolean {
  if (held && held.handByte === FIRE_PLACED_CHARGE_HAND_READING.handByte
    && weaponCategory(held.itemId) === FIRE_PLACED_CHARGE_HAND_READING.itemClass) return false;   // D4:L503756-503766
  if (!motion) return true;
  if (motion.stateRefused) return false;
  if (TRAVERSAL_REFUSED.has(motion.clip)) return false;           // R4P-211: r0004 D4:L503736-503751, before the timing
  if (motion.leaves) {
    let allowed = false;                                          // the loop's answer starts at 0 (D4:L503765-503777)
    for (const leaf of motion.leaves) {
      const noFire = leaf.noFire !== undefined ? leaf.noFire : table?.get(leaf.clip)?.noFire ?? null;
      allowed = leafAllows(motion.phase, motion.reversed, noFire);
    }
    return allowed;
  }
  const noFire = motion.noFire !== undefined ? motion.noFire : table?.get(motion.clip)?.noFire ?? null;
  return leafAllows(motion.phase, motion.reversed, noFire);
}

/** The body's playing motion and the round's permission over it: what `AimFrame` records at each command. */
export function fireCapability(walker: Walker, moves: TraversalHooks | null | undefined, pistol: boolean, table: MotionTable | null): { motion: PlayingMotion | null; fire: boolean } {
  const motion = motionOf(walker, moves, pistol);
  return { motion, fire: fireAllowed(motion, table) };
}

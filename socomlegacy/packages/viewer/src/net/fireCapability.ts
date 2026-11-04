import { PISTOL_ANIMS, SEAL_ANIMS } from '../locomotion';
import { ACTION_CLIPS, HOLD_CLIPS, type MoverActionName, type TraversalHooks, type Walker } from '../mover';
import type { MotionEntry, MotionTable } from '../motionTable';

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
}

/**
 * NOFIRE_LEAF_AGGREGATE_READING (218 s5): which of the playing leaves the gate reads. `FUN_005a7de0`'s loop over the top
 * entry's blended leaves (D:L462695-462705) overwrites its result each leaf -- the last leaf's answer stands, not an
 * AND. The port plays one clip at a time on the stack (`Walker.action`, the hold, the move's clip), so it reads that
 * one ('top'). Owed: the leaf order of a blended top (the crate/medium climb's two nodes) and a capture at a boundary.
 */
export const NOFIRE_LEAF_AGGREGATE_READING = 'top' as const;

/**
 * NOFIRE_ABSENT_READING (218 s5): a motion with no `NoFire` (the loader's 0) is open. `FUN_0058a8c0` strictly refuses
 * phase 0 itself (0 > 0 is false) -- the instant of a push -- and the port's landing is pushed after its tick's clock
 * ran (`Walker.land`), so its first command would stand at exactly 0 for a whole 60 Hz tick where the original's next
 * frame has moved on. Owed: a capture of a round at a soft landing's first frame.
 */
export const NOFIRE_ABSENT_READING = 'open' as const;

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

/**
 * Whether a firearm's round may leave over `motion` (`FUN_005a7de0`'s firearm branch, `FUN_0058a8c0`): refused in a
 * state the gate refuses, else by the clip's `NoFire` -- forward `phase > NoFire`, reversed `phase < 1 - NoFire`. No
 * motion, no table, or a clip without `NoFire`: open (`NOFIRE_ABSENT_READING`).
 */
export function fireAllowed(motion: PlayingMotion | null, table: ReadonlyMap<string, Pick<MotionEntry, 'noFire'>> | null): boolean {
  if (!motion) return true;
  if (motion.stateRefused) return false;
  const noFire = motion.noFire !== undefined ? motion.noFire : table?.get(motion.clip)?.noFire ?? null;
  if (noFire === null) return true;
  return motion.reversed ? motion.phase < 1 - noFire : motion.phase > noFire;
}

/** The body's playing motion and the round's permission over it: what `AimFrame` records at each command. */
export function fireCapability(walker: Walker, moves: TraversalHooks | null | undefined, pistol: boolean, table: MotionTable | null): { motion: PlayingMotion | null; fire: boolean } {
  const motion = motionOf(walker, moves, pistol);
  return { motion, fire: fireAllowed(motion, table) };
}

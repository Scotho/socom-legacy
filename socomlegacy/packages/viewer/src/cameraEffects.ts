import { GAME_FRAME_DT, type EffectOp } from '@s2u/scene';
import type { OpTick } from './effectRunner';

/**
 * LATER 1246 (research 428 s8.6; reading, pending review): the scene node `camera_effects`, whose rotation the original's
 * camera multiplies into its view each frame. The camera looks the node up by name under its follow target
 * (`FUN_002956e0` D:L139743-139746, the string at 0x3efd88, kept at `cam+0xb8`) and, after the mode's routine has placed
 * the view, multiplies the node's matrix by the view's (`FUN_002998f0` D:L142020-142024, `FUN_001bfc30`: node x camera,
 * row vectors) before the view goes to the camera node (D:L142025) and the reticle's ray (D:L142028). With the node's
 * translation zero (the capture L1246b: the eye, the target and the root constant while the sway runs) that turns the
 * look about the eye, in the camera's own axes (`FUN_0029bc90` D:L143081ff: x right, y up, z back).
 *
 * What turns the node on the disc's multiplayer maps: the autostart `camera_jiggle` (19 maps, research 428 s8.6) -- a
 * `OBJECT_ROTATE_STATE` to (0, 0, 0), four `OBJECT_MOTION` angular legs, `LOOP` -1. This module is the node: its
 * rotation as the original keeps it (a quaternion, `FUN_00315790` writing it through `FUN_00307170`), the two commands'
 * effects on it, and the turn a view takes from it. `./worldState` runs the commands on the page's world; `./playerCamera`
 * `view()` turns the look by `cameraEffectsTurn()`.
 */

type Quat = [number, number, number, number];

/** `FUN_00307360` (D:L206240ff), called `(y, x, z)` (D:L110368): half angles, sin `FUN_001b3720`, cos `FUN_001b3548`. */
function eulerQuat(x: number, y: number, z: number): Quat {
  const s1 = Math.sin(y / 2), c1 = Math.cos(y / 2), s2 = Math.sin(x / 2), c2 = Math.cos(x / 2), s3 = Math.sin(z / 2), c3 = Math.cos(z / 2);
  return [s1 * c2 * s3 + c1 * s2 * c3, s1 * c2 * c3 - c1 * s2 * s3, c1 * c2 * s3 - s1 * s2 * c3, s1 * s2 * s3 + c1 * c2 * c3];
}

/** `FUN_003070c0` (D:L206148-206162): a x b (`FUN_001bfc78`) + b.w a + a.w b; w = a.w b.w - a . b. */
function quatMul(a: Quat, b: Quat): Quat {
  return [
    a[1] * b[2] - a[2] * b[1] + b[3] * a[0] + a[3] * b[0],
    a[2] * b[0] - a[0] * b[2] + b[3] * a[1] + a[3] * b[1],
    a[0] * b[1] - a[1] * b[0] + b[3] * a[2] + a[3] * b[2],
    a[3] * b[3] - (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]),
  ];
}

/** `FUN_00307270` (D:L206210ff): to unit length. */
function normalize(q: Quat): Quat {
  const l = Math.hypot(q[0], q[1], q[2], q[3]);
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

/** `FUN_00307170` (D:L206168ff): the node's 3x3, row-major, for row vectors (`p' = p M`). */
function quatMatrix(q: Quat): number[] {
  const [x, y, z, w] = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y),
    2 * (x * y - w * z), 1 - 2 * (z * z + x * x), 2 * (y * z + w * x),
    2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y),
  ];
}

/**
 * CAMERA_EFFECTS_SET_EULER_READING (LATER 1246, research 101; reading, pending review): `OBJECT_ROTATE_STATE`'s flag 1
 * sets the node's rotation from its euler (`FUN_00263730` D:L111246-111249, through `FUN_00315760` -> `FUN_003083c0`,
 * whose order is not read). Every rotate of `camera_effects` on the disc writes (0, 0, 0) -- the identity in any order
 * (research 428 s8.6's sweep) -- so the port builds the rotation in the angular step's order (`FUN_00307360`, `(y, x, z)`).
 * Settled by a read of `FUN_003083c0`.
 */
export const CAMERA_EFFECTS_SET_EULER_READING = 'angularStepOrder' as const;

/**
 * CAMERA_EFFECTS_PHASE_READING (LATER 1246, research 101; reading, pending review): where the jiggle's 4 s loop stands
 * against the round. The port starts it with the page world's autostarts -- the map's load (`WorldState.applyInitial`)
 * and each round's reset (`WorldState.reset`), as `FUN_002232a0` starts the sets again (D:L75850-75866,
 * `AUTOSTART_RESET_READING`). Not read or measured: the original's phase at a round's start, whether the sets' restart
 * restarts this program, and whether two consoles' phases agree (a page's phase is its own; the room runs no jiggle).
 * Settled by a capture of the sway matrix (L1246b's read) across a round's reset on two consoles.
 */
export const CAMERA_EFFECTS_PHASE_READING = 'pageWorldSetStart' as const;

/**
 * CAMERA_EFFECTS_STEP_READING (LATER 1246, research 101; reading, pending review): the node's commands tick once a game
 * frame (`GAME_FRAME_DT`, 525/15734 s), whatever the page's frame -- each leg a forward step of w x dt then w += accel x
 * dt on the frame's grid, a leg's end handing the frame's rest to the next leg (D:L109966-109976), and a pass's end
 * (`LOOP`) dropping it, the next pass starting on the next frame (the runner's once-a-tick `LOOP`, `./effectRunner`). So
 * a pass is 120 game frames, 4.004 s, and the yaw's peak k (1/2 + dt/2) = 4.51e-4 rad -- the capture L1246b's 4.003 s
 * and +-0.00045 -- where the page's 60 Hz step would give 4.000 s and 4.44e-4. Not read: that the scene's runner ticks
 * at the game frame (only the capture's agreement), and the original `LOOP`'s rest (`FUN_0025ede0`). Settled by a read
 * of the scene runner's tick in the frame loop and of `FUN_0025ede0`.
 */
export const CAMERA_EFFECTS_STEP_READING = 'gameFrame' as const;

/** The node's name (`FUN_002956e0`'s string at 0x3efd88; the disc programs' node reference). */
export const CAMERA_EFFECTS_NODE = 'camera_effects';

/** A whole game frame within this much counts as covered (float sums of the page's frames). */
const FRAME_EPS = 1e-9;

/** The node `camera_effects`: its rotation, the commands that turn it, and the game-frame clock they tick on. */
export class CameraEffects {
  private q: Quat = [0, 0, 0, 1];
  /** Page time handed to the node (`CAMERA_EFFECTS_STEP_READING`) and game time its commands have run. */
  private clock = 0;
  private ran = 0;
  /** How far into the current game frame the commands have run (a leg's end mid-frame). */
  private phase = 0;

  /** Back to no turn and a fresh clock (a world's autostarts started). */
  reset(): void {
    this.q = [0, 0, 0, 1];
    this.clock = 0; this.ran = 0; this.phase = 0;
  }

  /**
   * `OBJECT_ROTATE_STATE` (`FUN_00263730` D:L111211-111262) on the node, with no reference node (the disc's): flag 1 sets
   * the euler (`CAMERA_EFFECTS_SET_EULER_READING`), flag 2 would add to the node's own (not on the disc for this node:
   * left as it is), flag 4 keeps the node's own. At a pass's start: the frame's rest is dropped
   * (`CAMERA_EFFECTS_STEP_READING`).
   */
  rotate(op: Extract<EffectOp, { op: 'rotate' }>): void {
    if (this.phase > 0) { this.ran += GAME_FRAME_DT - this.phase; this.phase = 0; }
    if ((op.flags & 1) !== 0) this.q = normalize(eulerQuat(op.xyz[0], op.xyz[1], op.xyz[2]));
  }

  /**
   * `OBJECT_MOTION`'s angular block on the node (flag 0x100): the begin copies the record's w into the running one
   * (`FUN_00262690` D:L110995-110999); each game frame's tick (`FUN_00261370`) clips the step to the lifetime when flag 1
   * is set (D:L109966-109976: the step is what is left of the lifetime, and the rest of the frame goes on), turns the
   * node by w x step -- the euler quaternion of the step (`FUN_00307360` D:L110368) after the node's own (`FUN_003070c0`
   * D:L110369), to unit length (D:L110370) -- and adds accel x step to w (D:L110373-110375). Only the angular block: a
   * launch, gravity or a tumble on this node is no disc command's. Without flag 1 the command never ends. The runner's
   * `dt` is page time: the node runs the game frames it covers, and a leg done answers `true` (its rest stays on the
   * node's clock for the next leg, never handed back).
   */
  motion(op: Extract<EffectOp, { op: 'motion' }>): OpTick {
    const m = op.motion, ang = m.angular;
    const w: [number, number, number] = ang ? [ang.w[0], ang.w[1], ang.w[2]] : [0, 0, 0];
    const a = ang ? ang.accel : [0, 0, 0];
    const timed = (m.flags & 1) !== 0, angular = ang !== null && (m.flags & 0x100) !== 0;
    let elapsed = 0;
    const turn = (step: number): void => {
      if (!angular || !(step > 0)) return;
      this.q = normalize(quatMul(this.q, eulerQuat(w[0] * step, w[1] * step, w[2] * step)));
      w[0] += a[0]! * step; w[1] += a[1]! * step; w[2] += a[2]! * step;
    };
    return (dt) => {
      this.clock += dt;
      for (;;) {
        const frame = GAME_FRAME_DT - this.phase;              // this frame's time not yet run
        if (this.ran + frame > this.clock + FRAME_EPS) return false;   // the frame is not over on the page yet
        if (timed && m.lifetime < frame + elapsed) {          // the leg ends inside it: its part, the rest to the next leg
          const step = m.lifetime - elapsed;
          turn(step);
          elapsed += step; this.ran += step; this.phase += step;
          return true;
        }
        turn(frame);
        elapsed += frame; this.ran += frame; this.phase = 0;
      }
    };
  }

  /** The node's 3x3 (row-major, row vectors), or null at no turn. */
  turn(): number[] | null {
    const q = this.q;
    return q[0] === 0 && q[1] === 0 && q[2] === 0 ? null : quatMatrix(q);
  }
}

/** The node the page's camera reads: the one the page's world runs (`publishCameraEffects`), or none. */
let page: CameraEffects | null = null;

/**
 * The page's world hands its node over when it starts its autostarts (`WorldState.applyInitial`, `reset`); the room's
 * world never does (its world runs no autostart program, `runAutostartPrograms`), so no room's camera reads one.
 */
export function publishCameraEffects(node: CameraEffects | null): void {
  page = node;
}

/** The page's `camera_effects` turn now (row-major 3x3, row vectors), or null (no turn, or no page world runs one). */
export function cameraEffectsTurn(): number[] | null {
  return page?.turn() ?? null;
}

type V3 = [number, number, number];

/**
 * A look from `eye` to `at`, turned by `turn` as `FUN_002998f0`'s node x camera turns it: the camera's axes from the
 * eye and the look (`FUN_0029bc90` D:L143081ff: x = the level right, z = back, y = x x forward), the look's local
 * coordinates turned by the node's 3x3 (row vectors), and back to the world. Its length is kept.
 */
export function turnLook(eye: readonly number[], at: readonly number[], turn: readonly number[]): V3 {
  const v: V3 = [at[0]! - eye[0]!, at[1]! - eye[1]!, at[2]! - eye[2]!];
  const len = Math.hypot(v[0], v[1], v[2]);
  if (!(len > 0)) return [at[0]!, at[1]!, at[2]!];
  const f: V3 = [v[0] / len, v[1] / len, v[2] / len];
  const h = Math.hypot(f[0], f[2]);
  if (!(h > 0)) return [at[0]!, at[1]!, at[2]!];                          // straight up or down: no level right (not the walk's)
  const x: V3 = [-f[2] / h, 0, f[0] / h];
  const y: V3 = [x[1] * f[2] - x[2] * f[1], x[2] * f[0] - x[0] * f[2], x[0] * f[1] - x[1] * f[0]];
  const z: V3 = [-f[0], -f[1], -f[2]];
  const l = [v[0] * x[0] + v[1] * x[1] + v[2] * x[2], v[0] * y[0] + v[1] * y[1] + v[2] * y[2], v[0] * z[0] + v[1] * z[1] + v[2] * z[2]];
  const t = turn;
  const r = [
    l[0]! * t[0]! + l[1]! * t[3]! + l[2]! * t[6]!,
    l[0]! * t[1]! + l[1]! * t[4]! + l[2]! * t[7]!,
    l[0]! * t[2]! + l[1]! * t[5]! + l[2]! * t[8]!,
  ];
  return [
    eye[0]! + r[0]! * x[0] + r[1]! * y[0] + r[2]! * z[0],
    eye[1]! + r[0]! * x[1] + r[1]! * y[1] + r[2]! * z[1],
    eye[2]! + r[0]! * x[2] + r[1]! * y[2] + r[2]! * z[2],
  ];
}

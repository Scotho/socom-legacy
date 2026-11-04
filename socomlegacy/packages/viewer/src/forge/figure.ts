import { Animator, type MoverSnapshot } from '../animator';
import type { LoadedBody } from '../body';
import { bodySkeleton, type PlayClips } from '../play';

/**
 * FG-21: an NPC marker's figure stands as a body stands still in the game -- the animator's own idle over the disc's
 * clips (`../animator`, the walk's `Play` drives the same), stepped a moment from the bind pose on a still mover. The
 * forge's editor drawing only; the match draws each NPC as it draws any seat.
 */

/** A still mover standing (no stick, on the ground, facing its own -z). */
const STILL: MoverSnapshot = { vx: 0, vy: 0, vz: 0, yaw: 0, airborne: false, crouched: false, landing: null, jumps: 0, stance: 'stand' };
/** How long the idle is played before the pose is taken: half a second at 60 Hz (the forge's own choice). */
const SETTLE_TICKS = 30;

/** The body's standing pose (one local matrix a part, as `BodyView.setPose` takes), or null where the clips will not play. */
export function standingPose(body: LoadedBody, clips: PlayClips): Float32Array[] | null {
  if (clips.clips.length === 0) return null;
  try {
    const skeleton = bodySkeleton(body);
    const animator = new Animator(skeleton, clips.clips, clips.table ? new Map(clips.table) : null);
    for (let i = 0; i < SETTLE_TICKS; i++) animator.step(1 / 60, STILL);
    return skeleton.local.map((m) => Float32Array.from(m));
  } catch {
    return null;
  }
}

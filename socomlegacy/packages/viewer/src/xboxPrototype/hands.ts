import type { Play } from '../play';
import { ThrowPose, throwPoseEnds } from '../throwPose';
import type { WalkMode } from '../walk';

/** The existing MatchThrow pose lifecycle without its renderer-owned equipment.
 * BombPage and later throwable equipment share this one layer. Hold ownership,
 * playback, cross-fades and callbacks remain ThrowPose's rules (PAR-85/NU-8b).
 * Equipment's take-up fade and held models are not mounted by this adapter.
 */
export function prototypeHands(d: {
  play: Pick<Play, 'motionSource' | 'addPoseLayer'>;
  walk: Pick<WalkMode, 'onActionEnd' | 'snapshot' | 'drawnFeet'>;
  callback(name: string, at: readonly [number, number, number] | null): void;
}) {
  const pose = new ThrowPose(() => d.play.motionSource());
  d.play.addPoseLayer(pose.layer);
  const off = d.walk.onActionEnd(end => { if (throwPoseEnds(end)) pose.cut(); });
  let disposed = false;
  return { pose,
    frame(dt: number) {
      if (disposed) return;
      // MatchThrow.poseFrame: a hold lost with its mover pops too; callbacks run
      // before Play samples this layer, using the current drawn body feet.
      pose.holdOn(!!d.walk.snapshot()?.hold);
      for (const name of pose.step(dt)) d.callback(name, d.walk.drawnFeet());
    },
    dispose() { if (disposed) return; disposed = true; off(); pose.stop(); },
  };
}

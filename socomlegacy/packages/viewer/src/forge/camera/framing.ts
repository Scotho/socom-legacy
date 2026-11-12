import type { Pose } from '../../camera';
import { poseOfShot, type ShotBounds, type Vec3 } from './driver';

/**
 * AX-16 (plan item 16; a browser adaptation, product track, no original): the poses `target.capture`'s presets frame a
 * picture from. Pure helpers: they only compute a pose in the page's own shape (`../../camera` `Pose`, yaw and pitch in
 * degrees, as `FlyCamera.lookFrom` turns a from/to pair into them -- `./driver` `poseOfShot`); the targets set it through
 * the page's existing camera paths (the facade's `camera.pose`, the room's `camera.set`) and restore the camera after.
 */

/** The fly camera's resting vertical field of view (`../../camera` `FOV`, 49 degrees), which these frame against. */
export const FRAMING_FOV_DEGREES_ADAPTATION = 49;
/** Straight down, just short of the fly camera's own clamp (`../../camera` `PITCH_LIMIT`, 89.9 degrees). */
export const TOP_VIEW_PITCH_DEGREES_ADAPTATION = -89.9;
/** A browser adaptation's margin around what a preset frames (a tenth either side). */
export const FRAMING_MARGIN_ADAPTATION = 1.2;
/** The nearest a preset stands to what it frames (game units): `../page` `focusOnBounds`'s floor of 80. */
export const FRAMING_MIN_REACH_ADAPTATION = 80;
/** The three-quarter view's direction from the framed centre: 45 degrees round, about 35 up (a unit vector's parts). */
const THREE_QUARTER: Vec3 = [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)];

/** The box around `points` (game units), or null with none. */
export function boundsOfPoints(points: readonly (readonly number[])[]): ShotBounds | null {
  if (!points.length) return null;
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of points) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k]!, p[k]!); max[k] = Math.max(max[k]!, p[k]!); }
  return { min, max };
}

const centre = (b: ShotBounds): Vec3 => [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
/** The distance at which a sphere of `radius` fills the frame's height at the framing field of view, with the margin. */
const reachFor = (radius: number): number =>
  Math.max(FRAMING_MIN_REACH_ADAPTATION, (radius * FRAMING_MARGIN_ADAPTATION) / Math.tan((FRAMING_FOV_DEGREES_ADAPTATION * Math.PI) / 360));

/**
 * `top`: over the box's centre, looking straight down, high enough above its top that its wider half-extent fills the
 * frame's height at the framing field of view (the frame is wider than tall, so its width holds it too). Yaw 0.
 */
export function topViewPose(bounds: ShotBounds): Pose {
  const [x, , z] = centre(bounds);
  const half = Math.max(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2]) / 2;
  return { x, y: bounds.max[1] + reachFor(half), z, yaw: 0, pitch: TOP_VIEW_PITCH_DEGREES_ADAPTATION };
}

/** `refs`: a three-quarter view looking at the box's centre from far enough that its bounding sphere fills the frame. */
export function threeQuarterPose(bounds: ShotBounds): Pose {
  const c = centre(bounds);
  const radius = Math.hypot(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]) / 2;
  const reach = reachFor(radius);
  return poseOfShot({ at: [c[0] + THREE_QUARTER[0] * reach, c[1] + THREE_QUARTER[1] * reach, c[2] + THREE_QUARTER[2] * reach], look: c });
}

/** A named objective in the test room: the look the Forge gives a point (`../page` `lookAtPoint`: 120 out, 80 up, at 10 up). */
export function pointViewPose(at: readonly [number, number, number]): Pose {
  return poseOfShot({ at: [at[0] + 120, at[1] + 80, at[2] + 120], look: [at[0], at[1] + 10, at[2]] });
}

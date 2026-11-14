import { CAM_MARGIN, localCamera } from '../src/cameraRig';
import { rootY } from '../src/mover';

/**
 * Where the RENDERING follow camera stands at rest, for the specs that find it by its place (`replayPaths.spec.ts` case
 * 3) -- derived from the camera's own geometry, not written as two numbers.
 *
 * The follow on a page that draws a world is `matchNet.ts` `spectateFollow`: a `PlayerCamera` ticked on the watched body
 * with the pitch `WATCHED_LOOK_PITCH_READING` (SPECTATE-PITCH, v0.4.21: 0 -- the original's follow camera aims along the
 * bound actor's look, which for a remote body is level; before it, the body's own pitch, -9.167 at rest). At rest on open
 * ground the rig's eye is `cameraRig.ts` `localCamera(root, pitch)`'s target plus its back axis times the distance, let
 * out by the obstruction pass's margin (`cameraPass`: the reach is the goal's length plus `CAM_MARGIN`, and with nothing
 * in the way the eye stands at the reach). In the actor's space +z is behind and y is up, so `behind` is the eye's z and
 * `over` its y over the feet.
 *
 * `spectatorView.ts` `FOLLOW_BEHIND` and `FOLLOW_OVER` (the non-rendering hosts' fallback pose) were this same place at
 * -9.167 degrees (24.906, 25.709). The spec pinned them on a rendering page, which held while the follow ticked at the
 * body's pitch and could not once it ticked level (28.75 behind, 21.484 over): case 3's "Right follows the player" timed
 * out on the v0.4.21 candidate's browser view. Since LATER 1017 the fallback is the level place (`FOLLOW_PITCH` 0).
 * `test/followPlace.test.ts` holds this derivation at both pitches against the product's `PlayerCamera`, the fallback
 * at its own, and this file's pitch against the reading.
 */

/** The pitch the rendering follow ticks at: `matchNet.ts` `WATCHED_LOOK_PITCH_READING` (held equal by the unit test). */
export const FOLLOW_WATCHED_PITCH = 0;

/** The follow camera's eye at rest: how far behind the body and how high over its feet (world units). */
export function followPlace(pitchDegrees: number = FOLLOW_WATCHED_PITCH, root: number = rootY('stand')): { behind: number; over: number } {
  const c = localCamera(root, pitchDegrees);
  const reach = c.dist + CAM_MARGIN;
  return { behind: c.target[2] + c.back[2] * reach, over: c.target[1] + c.back[1] * reach };
}

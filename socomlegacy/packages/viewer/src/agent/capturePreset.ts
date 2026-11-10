import { CAPTURE_SMALL_WIDTH_ADAPTATION, CaptureRefusal, type CaptureArgs } from '@s2u/forge-agent-protocol';
import type { Pose } from '../camera';
import type { CaptureCanvasOptions } from './install';

/**
 * AX-16 (plan item 16; a browser adaptation, product track): the steps both page targets take for a preset capture.
 * The camera is set through the page's own camera command (the Forge facade's `camera.pose`, the room's `camera.set`,
 * each of which ends a running camera shot `stopped` first), the picture taken, and the camera put back to the pose
 * read before -- on a failed capture too. A refused move takes no picture and moves nothing back: nothing moved.
 */
export type CameraCommand = (pose: Pose) => Promise<{ ok: boolean; code?: string }>;

/** `size: small` as the capture path's scale (`./install` `captureGameCanvas` `maxWidth`); `medium` and none: as it is. */
export const canvasOptionsOf = (args: CaptureArgs): CaptureCanvasOptions | undefined =>
  args.size === 'small' ? { maxWidth: CAPTURE_SMALL_WIDTH_ADAPTATION } : undefined;

/** Only the pose's five numbers (both camera commands refuse any other field). */
export const poseOf = (p: Pose): Pose => ({ x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch });
const finitePose = (p: unknown): p is Pose => !!p && typeof p === 'object'
  && (['x', 'y', 'z', 'yaw', 'pitch'] as const).every((k) => Number.isFinite((p as Record<string, unknown>)[k]));
/** The camera to restore, or a NOT_READY refusal when the page has none to read. */
export function savedPose(camera: unknown): Pose {
  if (!finitePose(camera)) throw new CaptureRefusal('NOT_READY', 'The page has no camera pose to restore yet: wait until it is ready, or take view "current".');
  return poseOf(camera);
}

export async function captureFramed(set: CameraCommand, pose: Pose, saved: Pose, take: () => Promise<Blob>): Promise<Blob> {
  const moved = await set(poseOf(pose));
  if (!moved.ok) throw new CaptureRefusal(moved.code ?? 'REFUSED');
  try { return await take(); }
  finally {
    // The restore is best effort past this point: a refused or failed restore must not hide the capture's own outcome.
    try { await set(saved); } catch { /* the camera stays where the preset put it; the person's own camera input still works */ }
  }
}

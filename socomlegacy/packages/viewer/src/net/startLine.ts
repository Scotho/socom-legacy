/**
 * The lines a round's start is measured on (SVC-23b, research 169 §7 measure 5 (b)): the room's refusal of a start a
 * wall stands before (`room.ts` `startRefused`) and the page's own test of its muzzle before a round leaves it
 * (`../fire` `ray`, LATER 366), one source for both (OT.R80).
 *
 * A check the port added, with no original: the console fires from the posed muzzle wherever it stands, a barrel poked
 * past a post's edge included. OT.R80 (Craig's option 1, 2026-10-23) retires that round, an intended divergence by the
 * owner's ruling: a muzzle these lines meet a wall on sends its round from the head, so the page and the room agree and
 * a round cannot pass the wall the barrel poked through.
 */
import { segmentHit, type Grid } from '@s2u/scene';
import { headEye } from '../cameraRig';
import { headPoint, targetHeight, type AimFrame } from './shotCone';

type V3 = [number, number, number];

/** The body a start is measured from: the server's mover at the command (`room.ts` `startBody`), or the page's. */
export type StartBody = Pick<AimFrame, 'feet' | 'yaw' | 'posture' | 'moveRoot' | 'peek' | 'groundNormalY'>;

/**
 * The two points a start's lines leave from: the head (`headPoint`) kept on the body's side of a wall along the page's
 * own `headEye` line, every polygon (PF-05: the head stands off the body's axis, past a face a body pressed to it
 * reaches), and the body's axis at the look-at target's height (BL-3's second line).
 */
export function startLines(grid: Grid, b: StartBody): { head: V3; axis: V3 } {
  const head = headEye(grid, b.feet, headPoint(b), () => true);
  const [x, y, z] = b.feet;
  return { head, axis: [x, y + targetHeight(b.posture, b.moveRoot), z] };
}

/** Whether a wall, any polygon, stands on the head's line or the axis's line to the start `to`. */
export function startWalled(grid: Grid, b: StartBody, to: readonly number[]): boolean {
  const { head, axis } = startLines(grid, b);
  const end: V3 = [to[0]!, to[1]!, to[2]!];
  return segmentHit(grid, head, end) !== null || segmentHit(grid, axis, end) !== null;
}

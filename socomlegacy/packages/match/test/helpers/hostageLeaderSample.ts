import type { AiLoc } from '@s2u/scene';
import type { Walker } from '../../../viewer/src/mover';
import type { FollowLeader, FollowTrail } from '../../src/hostageFollow';

type SampleMap = {
  locate(at: readonly [number, number, number]): AiLoc | null;
  traversable(cell: AiLoc): boolean;
  width(cell: AiLoc): number;
};
type LeaderBody = Pick<Walker['state'], 'x' | 'y' | 'z' | 'vx' | 'vy' | 'vz' | 'yaw'>;

/** Test adapter from a physical leader's Walker into the production follower's frame inputs. */
export function sampleFixtureLeader(body: LeaderBody, leader: FollowLeader, planner: SampleMap, trail: FollowTrail, dt: number): AiLoc | null {
  leader.feet = [body.x, body.y, body.z];
  leader.yaw = body.yaw;
  // ExtractionAuthority receives the Walker's physical velocity; collision/floor corrections in
  // its position are not extra speed for FOLLOW's throttle or its velocity-derived heading.
  leader.velocity = [body.vx, body.vy, body.vz];
  const cell = planner.locate(leader.feet);
  if (!cell) return null;
  // Same frame ordering as ExtractionAuthority.step: heading, then the navigable-cell sample.
  // FUN_005b7ba0 D:L471291-471324 records no new trail point on blocked soil.
  trail.updateHeading(dt, leader);
  if (planner.traversable(cell)) trail.add(cell, planner.width(cell));
  return cell;
}

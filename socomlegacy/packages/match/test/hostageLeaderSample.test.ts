import { expect, it } from 'vitest';
import { FollowTrail, type FollowLeader } from '../src/hostageFollow';
import { sampleFixtureLeader } from './helpers/hostageLeaderSample';

it('a positional correction is not leader velocity', () => {
  const trail = new FollowTrail();
  trail.add({ map: 0, x: 1, z: 1 });
  const leader: FollowLeader = { id: 1, feet: [10, 0, 10], yaw: 90, velocity: [0, 0, 0], topSpeed: 65, stance: 0 };
  const body = { x: 20, y: 5, z: 10, vx: 0, vy: 0, vz: 0, yaw: 0 };
  const planner = { locate: () => ({ map: 0, x: body.x / 10, z: 1 }),
    traversable: (cell: { x: number }) => cell.x !== 2, width: () => 0 };
  sampleFixtureLeader(body, leader, planner, trail, 1 / 30);
  expect(leader.feet).toEqual([20, 5, 10]);
  expect(leader.velocity).toEqual([0, 0, 0]);
  expect(trail.points).toEqual([{ map: 0, x: 1, z: 1, width: 0 }]);
  expect(trail.heading).toEqual([-0, -1]);

  // Return to navigable ground: the physical velocity and the new cell both reach the follower.
  Object.assign(body, { x: 30, y: 0, vx: 12, vy: -3, vz: 4 });
  sampleFixtureLeader(body, leader, planner, trail, 1 / 30);
  expect(leader.velocity).toEqual([12, -3, 4]);
  expect(trail.points[0]).toEqual({ map: 0, x: 3, z: 1, width: 0 });
});

it('a blocked raw-cell visit retains the navigable trail while heading still updates', () => {
  const trail = new FollowTrail();
  trail.add({ map: 0, x: 1, z: 1 });
  const leader: FollowLeader = { id: 1, feet: [10, 0, 10], yaw: 90, velocity: [0, 0, 0], topSpeed: 65, stance: 0 };
  const body = { x: 20, y: 0, z: 10, vx: 300, vy: 0, vz: 0, yaw: 0 };
  sampleFixtureLeader(body, leader, {
    locate: () => ({ map: 0, x: 2, z: 1 }), traversable: () => false, width: () => 0,
  }, trail, 1 / 30);
  expect(trail.points).toEqual([{ map: 0, x: 1, z: 1, width: 0 }]);
  expect(trail.heading).toEqual([-0, -1]);
});

it('an absent raw cell does not create a trail sample', () => {
  const trail = new FollowTrail();
  const leader: FollowLeader = { id: 1, feet: [0, 0, 0], yaw: 0, velocity: [0, 0, 0], topSpeed: 65, stance: 0 };
  const body = { x: 10, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0 };
  expect(sampleFixtureLeader(body, leader, { locate: () => null, traversable: () => true, width: () => 0 }, trail, 1 / 30)).toBeNull();
  expect(trail.points).toEqual([]);
});

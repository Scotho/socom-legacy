import { expect, it } from 'vitest';
import { EnemyNavigator, type NavPoint, type NavStep } from '../../src/zombies/navigation';
import { TrafficIndex, ZombieTraffic, crowdStepClear, laneBlocked, type TrafficBody } from '../../src/zombies/traffic';

const body = (id: number, x: number, z: number, y = 0): TrafficBody => ({ id, position: [x, y, z] });
const open: NavStep = (_from, x, z) => [x, 0, z];

it('rejects crossing another body even when the destination is clear', () => {
  expect(crowdStepClear(body(1, 0, 0), [30, 0, 0], [body(2, 15, 0)])).toBe(false);
  expect(crowdStepClear(body(1, 0, 0), [30, 0, 0], [body(2, 15, 0, 12)])).toBe(true);
  expect(crowdStepClear(body(1, 0, 0), [-1, 0, 0], [body(2, 3, 0)])).toBe(true);
  expect(crowdStepClear(body(1, 0, 0), [1, 0, 0], [body(2, 3, 0)])).toBe(false);
});

it('reserves moved bodies immediately across spatial cells', () => {
  const index = new TrafficIndex([body(1, 23, 0)]);
  index.update(1, [27, 0, 0]);
  expect(index.near([26, 0, 0], 1)).toEqual([body(1, 27, 0)]);
  expect(crowdStepClear(body(2, 40, 0), [30, 0, 0], index.near([40, 0, 0]))).toBe(false);
  index.update(1, [200, 0, 0]);
  expect(index.near([26, 0, 0], 1)).toEqual([]);
});

it('uses the next route segment, ignores neighbors behind it and separates floors', () => {
  const self = body(1, 0, 0);
  expect(laneBlocked(self, [20, 0, 0], [body(2, -5, 0)])).toBe(false);
  expect(laneBlocked(self, [20, 0, 0], [body(2, 5, 0)])).toBe(true);
  expect(laneBlocked(self, [20, 0, 0], [body(2, 5, 0, 12)])).toBe(false);
});

it('gives equal-depth doorway arrivals a consistent leader', () => {
  const a = body(1, 0, -3), b = body(2, 0, 3);
  expect(laneBlocked(a, [20, 0, -3], [b])).toBe(false);
  expect(laneBlocked(b, [20, 0, 3], [a])).toBe(true);
});

it('passes a stationary blocker only on a collision-clear side and commits to that side', () => {
  const traffic = new ZombieTraffic(open), self = body(2, 0, 0), others = [body(1, 8, 0)];
  let point: NavPoint | null = null;
  for (let i = 0; i < 20; i++) point = traffic.steer(self, [30, 0, 0], others, .05);
  expect(point).not.toBeNull();
  expect(Math.abs(point![2])).toBe(9);
  expect(traffic.steer(self, [30, 0, 0], others, .05)).toEqual(point);
});

it('waits in a narrow doorway instead of moving through a wall or another body', () => {
  const narrow: NavStep = (from, x, z) => Math.abs(z) > 1 ? null : [x, from[1], z];
  const traffic = new ZombieTraffic(narrow), self = body(2, 0, 0);
  for (let i = 0; i < 80; i++) expect(traffic.steer(self, [30, 0, 0], [body(1, 8, 0)], .05)).toBeNull();
  expect(traffic.steer(self, [30, 0, 0], [body(1, 20, 0)], .05)).toEqual([30, 0, 0]);
});

it('a single-file queue drains through a narrow doorway without permanent waits', () => {
  const narrow: NavStep = (_from, x, z) => Math.abs(z) > 1 ? null : [x, 0, z];
  const agents = Array.from({ length: 12 }, (_, i) => ({ body: body(i, -i * 9, 0), traffic: new ZombieTraffic(narrow) }));
  for (let tick = 0; tick < 600; tick++) for (const agent of agents) {
    if (agent.body.position[0] >= 40) continue;
    const next = agent.traffic.steer(agent.body, [40, 0, 0], agents.filter((a) => a.body.position[0] < 40).map((a) => a.body), .05);
    if (next) agent.body.position[0] = Math.min(40, agent.body.position[0] + .5);
  }
  expect(agents.every((a) => a.body.position[0] === 40)).toBe(true);
});

it('wall recovery alternates sides and traffic waits preserve the route', () => {
  const nav = new EnemyNavigator({} as never, open);
  nav.seed([[20, 0, 0]], [20, 0, 0]);
  for (let i = 0; i < 30; i++) { nav.steer([0, 0, 0], [20, 0, 0], .05); nav.wait([0, 0, 0]); }
  expect(nav.stats().recoveries).toBe(0);
  const sides: number[] = [];
  let before = 0;
  for (let i = 0; i < 150; i++) {
    const point = nav.steer([0, 0, 0], [20, 0, 0], .05);
    if (nav.stats().recoveries > before) { before = nav.stats().recoveries; if (point) sides.push(Math.sign(point[2])); }
  }
  expect(sides.length).toBeGreaterThanOrEqual(2);
  expect(sides[0]).toBe(-sides[1]!);
});

it('local neighbor filtering preserves doorway decisions across cell boundaries', () => {
  const bodies = Array.from({ length: 500 }, (_, id) => body(id, (id * 37) % 301 - 150, (id * 53) % 307 - 153, (id % 3) * 9));
  const index = new TrafficIndex(bodies);
  for (const self of bodies) for (const direction of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1]] as const) {
    const route: NavPoint = [self.position[0] + direction[0] * 30, self.position[1], self.position[2] + direction[1] * 30];
    expect(laneBlocked(self, route, index.near(self.position))).toBe(laneBlocked(self, route, bodies));
  }
});

it('local filtering preserves side-step choices and occupied-corridor rejection', () => {
  const self = body(2, 23, 23), others = [body(1, 31, 23), body(3, 25, 32), body(4, 200, 200)];
  const all = new ZombieTraffic(open), local = new ZombieTraffic(open), index = new TrafficIndex(others);
  for (let i = 0; i < 40; i++) expect(local.steer(self, [60, 0, 23], index.near(self.position), .05)).toEqual(all.steer(self, [60, 0, 23], others, .05));
});

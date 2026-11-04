import { describe, expect, it } from 'vitest';
import { HostageObstacleRecord, recoverySuffix, recoveryRequest, recoveryTarget, selectRecoveryRay, HostageRouteProbe } from '../src/hostageAvoidance';
const cell = { map: 0, x: 5, z: 6 };
describe('original persistent obstacle records (research334)', () => {
  it('uses elapsed time strictly over three seconds, not repeated contact count', () => {
    const r = new HostageObstacleRecord();
    for (let i = 0; i < 50; i++) r.hull([1, 0, 2], cell);
    expect(r.tick(3, cell, 1, 0)).toBeNull();
    expect(r.tick(0.001, cell, 1, 0)?.type).toBe(4);
  });
  it('restarts a hull contact at ten units of horizontal contact displacement', () => {
    const r = new HostageObstacleRecord(); r.hull([0, 0, 0], cell);
    r.tick(2, cell, 1, 0); r.hull([10, 100, 0], cell);
    expect(r.tick(2, cell, 1, 0)).toBeNull();
    expect(r.tick(1.01, cell, 1, 0)?.type).toBe(4);
  });
  it('AI-cell timeout uses max of signed commands and refuses a distant recorded cell', () => {
    const r = new HostageObstacleRecord(); r.ai(cell, 1 / 30);
    expect(r.tick(1, cell, 1, 0)).toBeNull();
    expect(r.tick(0.01, cell, 1, 0)?.type).toBe(2);
    const other = new HostageObstacleRecord(); other.ai(cell, 1 / 30);
    expect(other.tick(2, { ...cell, x: 7 }, 1, 0)).toBeNull();
    expect(other.type).toBe(0);
  });
  it('resets the missed-frame counter before comparing a repeated adjacent physical map contact', () => {
    const r = new HostageObstacleRecord(); r.ai(cell, 1);
    for (let i = 0; i < 3; i++) r.tick(0.5, cell, 0, 0);
    r.ai({ ...cell, x: 6 }, 1 / 30);
    expect(r.tick(1.51, cell, 0, 0)?.type).toBe(2);
  });
  it('hull contact has priority over AI cells, and absence decays only after five frames', () => {
    const r = new HostageObstacleRecord(); r.hull([0, 0, 0], cell); r.ai({ ...cell, x: 8 }, 1);
    expect(r.type).toBe(4);
    for (let i = 0; i < 5; i++) r.tick(0.1, cell, 0, 0);
    expect(r.type).toBe(4);
    for (let i = 0; i < 3; i++) r.tick(0.1, cell, 0, 0);
    expect(r.type).toBe(0);
  });
});

describe('original traversable-cell recovery (FUN_00603950)', () => {
  it('keeps the first route point more than three cells beyond the recorded obstacle', () => {
    const points = [5, 7, 8, 9, 12].map(x => ({ ...cell, x }));
    expect(recoverySuffix(points, cell).map(p => p.x)).toEqual([9, 12]);
  });
  it('retains the route when no point exceeds the three-cell clearance', () => {
    const points = [5, 7, 8].map(x => ({ ...cell, x }));
    expect(recoverySuffix(points, cell)).toEqual(points);
    expect(recoveryTarget(points, cell)?.x).toBe(8);
  });
  it('registers the saved pair as one request, and the next cell alone only when that registration is refused', () => {
    const calls: number[][] = [];
    const previous = { ...cell, x: 2 }, next = { ...cell, x: 10 };
    const register = (refuse: boolean) => (stops: readonly (typeof cell)[]) => {
      calls.push(stops.map(s => s.x));
      return refuse && stops.length === 3 ? null : `ticket ${stops.length}`;
    };
    expect(recoveryRequest(cell, previous, next, register(false))).toBe('ticket 3');
    expect(calls).toEqual([[cell.x, 2, 10]]);
    calls.length = 0;
    expect(recoveryRequest(cell, previous, next, register(true))).toBe('ticket 2');
    expect(calls).toEqual([[cell.x, 2, 10], [cell.x, 10]]);
  });
});

it('selects recovery rays by distance, tied drop, and positive-drop escape from a negative drop', () => {
  const rays = [
    { cell, distance: 2, height: 20 },
    { cell: { ...cell, x: 6 }, distance: 2, height: 15 },
    { cell: { ...cell, x: 7 }, distance: 8, height: 9 },
    { cell: { ...cell, x: 8 }, distance: 10, height: 0 },
  ];
  expect(selectRecoveryRay(rays, 10)?.x).toBe(7);
  expect(selectRecoveryRay(rays.slice(0, 2), 10)?.x).toBe(6);
  expect(selectRecoveryRay([{ cell, distance: 10, height: 0 }], 10)).toBeNull();
});

it('does not request a ray endpoint whose cell-height lookup fails', () => {
  expect(selectRecoveryRay([{ cell, distance: 1, height: null }], 10)).toBeNull();
});

it('map probes stop before the target, links and thirty units, and flag oblique action approaches', () => {
  const target = { ...cell, z: 0 };
  const sample = (x: number, z: number, word: number, distance: number) => ({ loc: { ...cell, x, z }, word, previousWord: null, distance, fraction: 0, direction: [0, 0, -1] as const, height: 0 });
  const p = new HostageRouteProbe(cell, target, [1, 0, 0]);
  expect(p.visit(sample(5, 6, 1, 0))).toBe(true);
  expect(p.visit(sample(5, 5, 20 | 128, 10))).toBe(false);
  expect(p.obstacle).toEqual({ ...cell, z: 5 });
  for (const s of [sample(5, 0, 9, 10), sample(5, 5, 9 | 256, 10), sample(5, 5, 9, 30)]) {
    const probe = new HostageRouteProbe(cell, target, [0, 0, -1]);
    expect(probe.visit(s)).toBe(false); expect(probe.obstacle).toBeNull();
  }
});
it('probe records alternate reseed/clear and do not refresh an existing physical contact', () => {
  const p = new HostageObstacleRecord(); p.ai(cell, 1, true);
  expect(p.type).toBe(2); p.ai(cell, 1, true); expect(p.type).toBe(0);
  const r = new HostageObstacleRecord(); r.ai(cell, 1);
  for (let i = 0; i < 5; i++) r.tick(.1, cell, 0, 0);
  r.ai(cell, 1, true);
  r.tick(3, cell, 0, 0);
  expect(r.type).toBe(0); // Probe restored the old missed-frame count, so physical weight decays.
});

it('uses occupancy bit5 for the actor probe and leaves width bit6 alone', () => {
  for (const [word, stops] of [[1 | 32, true], [1 | 64, false]] as const) {
    const probe = new HostageRouteProbe(cell, { ...cell, z: 0 }, [0, 0, -1]);
    expect(probe.visit({ loc: { ...cell, z: 5 }, word, previousWord: null, distance: 10, fraction: .5, direction: [0,0,-1], height: 0 })).toBe(!stops);
    expect(probe.actor !== null).toBe(stops);
  }
});

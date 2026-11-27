import { expect, it } from 'vitest';
import { Matrix4 } from 'three';
import { rayNearest, rayRecords, type HitBody } from '../src/net/hitVolumes';
import { prototypeTargets } from '../src/xboxPrototype/targets';

const body = (z: number): HitBody => ({ feet: [0, 0, z], yaw: 0, caps: null, boxes: [
  { part: 0, bone: 0, box: new Float32Array([-2, -2, -2, 2, 2, 2]), w: new Float32Array(new Matrix4().elements) },
  { part: 1, bone: 1, box: new Float32Array([-1, -1, -1, 1, 1, 1]), w: new Float32Array(new Matrix4().elements) },
] });
it('converges and penetrates on the same posed boxes as production including strict duplicate removal', () => {
  const targets = prototypeTargets(), near = body(-10), far = body(-20);
  targets.set(1, { alive: true, body: near, node: () => null });
  targets.set(2, { alive: true, body: far, node: () => null });
  targets.set(3, { alive: true, body: near, node: () => null });
  const expected: number[] = [];
  for (const target of [near, far, near]) rayRecords([0, 0, 0], [0, 0, -1], 100, target, (_part, distance) => expected.push(distance));
  expect(targets.records([0, 0, 0], [0, 0, -1], 100)).toEqual([...new Set(expected)].sort((a, b) => a - b));
  expect(targets.distance([0, 0, 0], [0, 0, -1], 100)).toBe(rayNearest([0, 0, 0], [0, 0, -1], 100, near));
  targets.keep(new Set([2])); expect(targets.distance([0, 0, 0], [0, 0, -1], 100)).toBe(18);
  targets.delete(2); targets.keep(new Set([2]));
  expect(targets.distance([0, 0, 0], [0, 0, -1], 100)).toBeNull();
  expect(targets.node(2, 'neck')).toBeNull();
});
it('excludes dead or hidden actors and releases removed actors', () => {
  const targets = prototypeTargets(); targets.set(1, { alive: false, body: body(-10), node: () => [1, 2, 3] });
  expect(targets.distance([0, 0, 0], [0, 0, -1], 100)).toBeNull();
  expect(targets.records([0, 0, 0], [0, 0, -1], 100)).toEqual([]);
  expect(targets.node(1, 'neck')).toEqual([1, 2, 3]); targets.clear(); expect(targets.node(1, 'neck')).toBeNull();
});

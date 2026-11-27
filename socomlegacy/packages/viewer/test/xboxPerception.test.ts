import { expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import type { FlyCamera } from '../src/camera';
import type { Play } from '../src/play';
import type { WalkMode } from '../src/walk';
import { prototypePerception } from '../src/xboxPrototype/perception';
import { prototypeTargets } from '../src/xboxPrototype/targets';
import type { WalkingMap } from '../src/xboxPrototype/runtimeAssets';

it('uses the shared sight mark before-query count order and clears inactive enemies on the same frame', () => {
  const targets = prototypeTargets(), teams = new Map([[1, 'seal'], [2, 'terrorist']] as const);
  const enemy = { alive: true, body: { feet: [0, 0, -100], yaw: 0, boxes: [], caps: null }, node: () => [0, 20, -100] as [number, number, number] };
  targets.set(2, enemy);
  const perception = prototypePerception({ map: {} as WalkingMap, targets, teams, ownId: () => 1, ownTeam: () => 'seal', online: () => true,
    zoom: () => ({ state: 0, target: 1 }), play: { nodeWorld: () => [0, 20, 0] } as unknown as Play,
    fly: { camera: new PerspectiveCamera() } as FlyCamera,
    walk: { feet: () => [0, 0, 0], fireAim: () => ({}), gameCamera: () => ({ eye: [0, 20, 0], target: [0, 20, -1] }), grid: () => null } as unknown as WalkMode });
  perception.frame(1 / 60);
  expect(perception.identified(2)).toBe(true); expect(perception.count()).toBe(0);
  perception.frame(1 / 60); expect(perception.count()).toBe(1);
  enemy.alive = false; perception.frame(1 / 60);
  expect(perception.identified(2)).toBe(false); expect(perception.count()).toBe(0);
  enemy.alive = true; perception.frame(1 / 60); perception.frame(1 / 60); expect(perception.count()).toBe(1);
  perception.clear(); expect(perception.count()).toBe(0); expect(perception.identified(2)).toBe(false);
});

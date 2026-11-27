import { expect, it } from 'vitest';
import { Matrix4, PerspectiveCamera } from 'three';
import { Play } from '../src/play';
import type { LoadedBody } from '../src/body';
import type { LoadedMap } from '../src/loadMap';
import { walkingAssets } from '../src/xboxPrototype/runtimeAssets';
import { prototypePlayBody } from '../src/xboxPrototype/playBody';
import { corpseShownS } from '../src/net/deaths';
import { bareMeta } from '../src/worldState';

const identity = () => new Float32Array(new Matrix4().elements);
function fixture() {
  const body = { model: 'test', at: null, height: 20, carries: null, parts: [
    { name: 'root', parent: -1, bindLocal: identity(), bindWorld: identity(), bbox: new Float32Array(6) },
    { name: 'rhand', parent: 0, bindLocal: identity(), bindWorld: identity(), bbox: new Float32Array(6) },
  ], fittings: [{ name: 'eye', model: 'eye_l', part: 0, offset: identity(), meshes: [{ positions: new Float32Array(999) }] }],
    subMeshes: [{ positions: new Float32Array(999) }] } as unknown as LoadedBody;
  const map = { ground: {}, origin: [0, 0, 0], metersPerUnit: 0.1, weapons: { test: { name: 'test', points: [{ name: 'firepoint', at: [1, 2, 3] }], parts: [{ positions: new Float32Array(999) }] } } } as unknown as LoadedMap;
  return { body, map };
}
it('copies only pose/fitting/weapon-point metadata across the upload lifetime boundary', () => {
  const { body, map } = fixture(), assets = walkingAssets(map, [body]);
  expect(assets.models[0]).not.toHaveProperty('subMeshes');
  expect(assets.models[0]!.fittings[0]).not.toHaveProperty('meshes');
  expect(assets.models[0]!.fittings[0]).not.toBe(body.fittings[0]);
  expect(assets.map).not.toHaveProperty('weapons');
  expect(assets.map.weaponPoints!.test).toBe(map.weapons!.test!.points);
});
it('retains door/scene simulation metadata without extending the decoded graphics lifetime', () => {
  const { body, map } = fixture();
  const meta = { ...bareMeta(), diagnostics: ['fixture diagnostic'], decodedGraphics: { positions: new Float32Array(999) } };
  map.meta = meta; map.doors = [];
  const assets = walkingAssets(map, [body]);
  expect(assets.map.doors).toBe(map.doors);
  expect(assets.map.meta).not.toBe(meta);
  expect(assets.map.meta?.instances).toBe(meta.instances);
  expect(assets.map.meta?.diagnostics).toEqual([]);
  expect(assets.map.meta).not.toHaveProperty('decodedGraphics');
});
it('keeps gate simulation metadata and only the crane control names across the upload boundary', () => {
  const { body, map } = fixture();
  map.gates = [];
  map.cranes = [{ control: { valve: 'crane_v1' }, mesh: { positions: new Float32Array(999) } }] as unknown as NonNullable<LoadedMap['cranes']>;
  const assets = walkingAssets(map, [body]);
  expect(assets.map.gates).toBe(map.gates);
  expect(assets.map.craneValves).toEqual(['crane_v1']);
  expect(assets.map).not.toHaveProperty('cranes');
});
it('lets the shared Play drive CPU props and a raw shader palette without decoded geometry', () => {
  const { body, map } = fixture(), rig = walkingAssets(map, [body]).models[0]!;
  const view = prototypePlayBody(rig), play = new Play();
  play.setBody(view, rig);
  const locals = view.skeleton.local.map(value => Float32Array.from(value));
  locals[0]![12] = 5; locals[1]![13] = 3;
  view.setPose(locals);
  expect(view.palette[12]).toBe(5); expect(view.palette[16 + 13]).toBe(3);
  view.place([10, 20, 30], 90); view.group.updateMatrixWorld(true);
  const hand = play.heldNode();
  expect(hand).not.toBeNull(); expect(hand!.parent!.name).toBe('rhand');
  expect(body.parts[0]!.bindLocal[12]).toBe(0);
  view.setVisible(false); expect(view.group.visible).toBe(false);
  play.setBody(null, null); play.setBody(view, rig);
  expect(play.heldNode()).toBe(hand);
  expect(view.group.getObjectByName('rhand')!.children.filter(child => child.name === 'rifle')).toHaveLength(1);
  play.setBody(null, null);
});
it('rejects an oversized body before creating a palette that could silently truncate bones', () => {
  const { body, map } = fixture(), rig = walkingAssets(map, [body]).models[0]!;
  rig.parts = Array.from({ length: 49 }, () => rig.parts[0]!);
  expect(() => prototypePlayBody(rig)).toThrow('bone limit');
});
it('hides the own raw body on the shared real-time corpse clock, not clamped simulation time', () => {
  const { body, map } = fixture(), rig = walkingAssets(map, [body]).models[0]!;
  const view = prototypePlayBody(rig), play = new Play(), camera = new PerspectiveCamera();
  play.setBody(view, rig); play.setFlyToggle(true);
  let dead = false;
  const walk = { snapshot: () => null, view: () => 'third' as const, isDead: () => dead };
  const limit = corpseShownS('respawn', 'own');
  play.frame(0.01, walk, camera, 0.01, limit); expect(view.group.visible).toBe(true);
  dead = true;
  play.frame(0.01, walk, camera, limit, limit);
  expect(play.ownCorpseExpired()).toBe(true); expect(view.group.visible).toBe(false);
  dead = false; play.frame(0.01, walk, camera, 0.01, limit);
  expect(play.ownCorpseExpired()).toBe(false); expect(view.group.visible).toBe(true);
  play.setBody(null, null);
});
it('lends stable numeric gear visibility with the authored satchel hidden until its carrier feed arrives', () => {
  const { body, map } = fixture(), rig = walkingAssets(map, [body]).models[0]!;
  rig.fittings.push({ name: 'Satchel', model: 'satchel', part: 0, offset: identity() });
  const view = prototypePlayBody(rig), gear = view.gearVisibility();
  expect(gear.get('Satchel')).toBe(false);
  expect(view.setGearVisible('Satchel', true)).toBe(true); expect(gear.get('Satchel')).toBe(true);
  expect(view.gearVisibility()).toBe(gear);
  expect(view.setGearVisible('unknown', true)).toBe(false); expect(gear.has('unknown')).toBe(false);
});

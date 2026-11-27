import { describe, expect, it } from 'vitest';
import { Matrix4 } from 'three';
import { prototypeDraws } from '../src/xboxPrototype/model';
import { bombModelFrame } from '../src/xboxPrototype/objectiveFrame';
import { gearVisible } from '../src/xboxPrototype/sceneFrame';
import { staticBounds } from '../src/xboxPrototype/bounds';
import type { LoadedMap } from '../src/loadMap';
import type { LoadedBody } from '../src/body';

describe('numeric objective presentation boundary', () => {
  it('places the authored Satchel at the room point without rotation, and removes it when carried', () => {
    const bomb = bombModelFrame(); expect(bomb.objects).toEqual([]);
    bomb.place([10, 20, 30]);
    expect(bomb.objects).toHaveLength(1); expect(bomb.objects[0]!.model).toBe('Satchel');
    expect([...bomb.objects[0]!.matrix]).toEqual(new Matrix4().makeTranslation(10, 20, 30).elements);
    const matrix = bomb.objects[0]!.matrix;
    bomb.place([20, 30, 40]); expect(bomb.objects[0]!.matrix).toBe(matrix);
    bomb.place(null); expect(bomb.objects).toEqual([]);
  });
  it('keeps satchels hidden by default and follows each body\'s actual gear flags', () => {
    expect(gearVisible('Satchel')).toBe(false); expect(gearVisible('Helmet')).toBe(true);
    const flags = new Map([['Satchel', true], ['Helmet', false]]);
    expect(gearVisible('Satchel', flags)).toBe(true); expect(gearVisible('Helmet', flags)).toBe(false);
  });
  it('uploads the bomb, the throwables and the carrier fitting once, borrowing their authored geometry', () => {
    const mesh = { positions: new Float32Array(9), normals: null, uvs: new Float32Array(6), indices: new Uint32Array([0, 1, 2]),
      textureName: null, fog: true, lit: true, alternate: false, order: 0, scroll: null };
    const body = { parts: [], subMeshes: [], at: null,
      fittings: [{ name: 'Satchel', part: 0, offset: new Matrix4().elements, meshes: [mesh] }] } as unknown as LoadedBody;
    const map = { world: [], props: [], origin: [0, 0, 0], textureFlags: {},
      grenade: { models: [{ name: 'Satchel', parts: [mesh] }, { name: 'grenade', parts: [mesh] }] } } as unknown as LoadedMap;
    const draws = prototypeDraws(map, body);
    expect(draws.filter(draw => draw.objectModel === 'Satchel')).toHaveLength(1);
    expect(draws.find(draw => draw.objectModel)?.positions).toBe(mesh.positions);
    expect(staticBounds(draws.find(draw => draw.objectModel)!)).toBeNull(); // A moved bomb has no authored static bound.
    expect(draws.filter(draw => draw.fitting?.name === 'Satchel')).toHaveLength(1);
    // The throwables' models are uploaded beside it, once each (`walkingGrenades`: another player's grenade in the air).
    expect(draws.filter(draw => draw.objectModel === 'grenade')).toHaveLength(1);
  });
});

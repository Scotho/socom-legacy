import { describe, expect, it } from 'vitest';
import { Matrix4 } from 'three';
import { prototypeDraws, PROTOTYPE_BONE_LIMIT_ADAPTATION } from '../src/xboxPrototype/model';
import type { LoadedMap } from '../src/loadMap';
import type { LoadedBody } from '../src/body';
import { PayloadBudget } from '../src/xboxPrototype/budget';

describe('isolated Xbox renderer asset adapter', () => {
  const mesh = () => ({ positions: new Float32Array(9), normals: new Float32Array(9), uvs: new Float32Array(6),
    colors: new Float32Array(12), indices: new Uint32Array([0, 1, 2]), textureName: null, fog: true, cull: true,
    lit: false, order: 1, orderEnd: 1, alternate: false, scroll: null });
  it('borrows decoded buffers, keeps prop instancing and hidden alternate states, and preserves skin weights', () => {
    const world = mesh(), prop = mesh(), matrices = new Float32Array(32);
    const skin = { ...mesh(), skinIndex: new Uint16Array(12), skinWeight: new Float32Array(12) };
    const body = { parts: [], subMeshes: [skin], fittings: [], at: null } as unknown as LoadedBody;
    const map = { world: [world, { ...mesh(), alternate: true }], props: [{ parts: [prop], matrices, order: 2, alternate: false }],
      origin: [0, 0, 0], textureFlags: {} } as unknown as LoadedMap;
    const draws = prototypeDraws(map, body);
    expect(draws).toHaveLength(4);
    expect(draws[0]!.positions).toBe(world.positions);
    expect(draws[1]!.world?.alternate).toBe(true);
    expect(draws[2]!.instances).toBe(matrices);
    expect(draws[3]!.skinWeight).toBe(skin.skinWeight);
    expect(draws[3]!.model.equals(new Matrix4())).toBe(true);
    const multiple = prototypeDraws(map, [body, body]);
    expect(multiple).toHaveLength(5);
    expect(multiple.filter(d => d.actor).map(d => d.modelIndex)).toEqual([0, 1]);
    expect(multiple[3]!.positions).toBe(multiple[4]!.positions);
  });
  it('refuses unsupported skeletons instead of silently truncating bones', () => {
    const body = { parts: Array(PROTOTYPE_BONE_LIMIT_ADAPTATION + 1) } as LoadedBody;
    expect(() => prototypeDraws({} as LoadedMap, body)).toThrow('bone limit');
  });
  it('retains authored texture scrolling and uploads each held model only once', () => {
    const world = { ...mesh(), scroll: [0.04, 0] }, weapon = mesh();
    const body = { parts: [], subMeshes: [], fittings: [], at: null } as unknown as LoadedBody;
    const map = { world: [world], props: [], origin: [0, 0, 0], textureFlags: {},
      weapons: { rifle: { parts: [weapon] } } } as unknown as LoadedMap;
    const draws = prototypeDraws(map, [body, body], ['rifle']);
    expect(draws).toHaveLength(2);
    expect(draws[0]!.scroll).toEqual([0.04, 0]);
    expect(draws[1]!.weapon).toBe('rifle');
    expect(draws[1]!.positions).toBe(weapon.positions);
  });
});

it('reserves GPU payload before allocation and releases a reservation only once', () => {
  const budget = new PayloadBudget(100);
  const release = budget.reserve(60);
  expect(() => budget.reserve(41)).toThrow('budget');
  expect(budget.current).toBe(60);
  release(); release();
  expect(budget.current).toBe(0);
  const last = budget.reserve(100);
  expect(budget.peak).toBe(100); last();
  expect(() => budget.reserve(NaN)).toThrow();
  expect(() => budget.reserve(-1)).toThrow();
});

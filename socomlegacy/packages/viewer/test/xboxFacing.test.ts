import { expect, it } from 'vitest';
import { Matrix4, Vector3 } from 'three';
import { facingPlacement } from '../src/xboxPrototype/facing';
import { staticBounds } from '../src/xboxPrototype/bounds';
import { prototypeDraws } from '../src/xboxPrototype/model';
import type { LoadedMap } from '../src/loadMap';
import type { LoadedBody } from '../src/body';

it('turns each facade about its own world position, removes authored scale and recovers from the pole', () => {
  const matrix = new Matrix4().makeRotationY(0.5).scale(new Vector3(2, 3, 4)).setPosition(7, 8, 9);
  const turn = facingPlacement(matrix, 2);
  expect(turn.frame(new Vector3(7, 8, 109))).toBe(true);
  expect(new Vector3().setFromMatrixPosition(matrix).toArray()).toEqual([7, 8, 9]);
  expect(new Vector3().setFromMatrixColumn(matrix, 0).length()).toBeCloseTo(1);
  expect(new Vector3().setFromMatrixColumn(matrix, 2).toArray()).toEqual([0, 0, -1]);
  expect(turn.frame(new Vector3(7, 108, 9))).toBe(false);
  expect(turn.frame(new Vector3(107, 8, 9))).toBe(true);
  new Vector3().setFromMatrixColumn(matrix, 2).toArray().forEach((value, i) => expect(value).toBeCloseTo([-1, 0, 0][i]!, 12));
});

it('retains the authored pose for a facade value the existing turn does not handle', () => {
  const matrix = new Matrix4().makeRotationY(0.5).scale(new Vector3(2, 3, 4)).setPosition(7, 8, 9), before = matrix.clone();
  expect(facingPlacement(matrix, 3).frame(new Vector3(1, 2, 3))).toBe(true);
  matrix.elements.forEach((value, i) => expect(value).toBeCloseTo(before.elements[i]!, 12));
});

it('keeps facade geometry shared, owns placement numbers and excludes it from static bounds', () => {
  const part = { positions: new Float32Array(9), normals: null, uvs: new Float32Array(6),
    indices: new Uint32Array([0, 1, 2]), textureName: null, fog: false, cull: false, lit: false,
    order: 1, orderEnd: 1, alternate: false, scroll: null };
  const matrices = Float32Array.from([...new Matrix4().elements, ...new Matrix4().makeTranslation(20, 0, 0).elements]);
  const map = { world: [], props: [{ parts: [part], matrices, facade: 1, lod: null, alternate: false, order: 1 }],
    origin: [5, 0, 0], textureFlags: {} } as unknown as LoadedMap;
  const body = { parts: [], subMeshes: [], fittings: [], at: null } as unknown as LoadedBody;
  const draws = prototypeDraws(map, body);
  expect(draws).toHaveLength(2);
  expect(draws[0]!.positions).toBe(draws[1]!.positions);
  expect(draws.map(draw => draw.model.elements[12])).toEqual([5, 25]);
  matrices.fill(0);
  expect(draws.map(draw => draw.model.elements[12])).toEqual([5, 25]);
  for (const draw of draws) { expect(draw.instances).toBeUndefined(); expect(staticBounds(draw)).toBeNull(); }
});

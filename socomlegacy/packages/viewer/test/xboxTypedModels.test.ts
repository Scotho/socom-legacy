import { expect, it } from 'vitest';
import type { LoadedBody } from '../src/body';
import type { LoadedMap } from '../src/loadMap';
import { typedModels } from '../src/xboxPrototype/runtimeAssets';

/** The lightweight match's bodies: the two sides' first, then each side's other character types, each uploaded once. */
const body = (parts: number): LoadedBody => ({ parts: new Array(parts).fill(null) }) as unknown as LoadedBody;

it('lists every decoded character type once and maps each side\'s types to its uploaded index', () => {
  const seal = body(40), terrorist = body(40), sealTwo = body(40), shared = body(40), tooMany = body(60);
  const map = { body: seal, terrorist, types: { seal: [seal, sealTwo, shared, undefined], terrorist: [terrorist, shared, tooMany] } } as unknown as LoadedMap;
  const { models, types } = typedModels(map, 48);
  expect(models).toEqual([seal, terrorist, sealTwo, shared]);            // index 0 and 1 as before; a shared body once
  expect(types.seal).toEqual([0, 2, 3, 0]);                              // a type the map did not decode: the side's first
  expect(types.terrorist).toEqual([1, 3, 1]);                            // one over the bone limit: the side's first
});

it('a map with no types keeps the two base bodies', () => {
  const seal = body(40);
  expect(typedModels({ body: seal } as unknown as LoadedMap, 48)).toEqual({ models: [seal], types: { seal: [], terrorist: [] } });
});

import { describe, expect, it } from 'vitest';
import { Matrix4 } from 'three';
import { worldFrame, worldChanges } from '../src/xboxPrototype/worldFrame';
import { worldPlacement } from '../src/xboxPrototype/worldPlacement';

describe('raw mutable world boundary (browser adaptation)', () => {
  it('keeps bounded last operations in order, with independent readers and owned numeric deltas', () => {
    const state = worldFrame(), first = worldChanges(), second = worldChanges();
    const delta = new Matrix4().makeTranslation(5, 0, 0).toArray(new Float32Array(16));
    state.move('root/door', delta); delta[12] = 99;
    state.visible('root/door', false); state.visible('root', true); state.visible('root/door', false);
    const a = first.take(state.frame);
    expect(a.map(op => op.kind)).toEqual(['move', 'visible', 'visible']);
    expect(a[0]).toMatchObject({ kind: 'move', value: expect.any(Float32Array) });
    expect((a[0]!.value as Float32Array)[12]).toBe(5);
    expect(first.take(state.frame)).toEqual([]); expect(second.take(state.frame)).toHaveLength(3);
    for (let i = 0; i < 1000; i++) state.move('root/door', delta);
    expect(state.frame.operations.size).toBe(3);
  });
  it('moves shared placements from the authored base, hides descendants, and never mutates input matrices', () => {
    const input = new Float32Array([...new Matrix4().makeTranslation(1, 0, 0).elements, ...new Matrix4().makeTranslation(2, 0, 0).elements]);
    const binding = worldPlacement({ paths: ['root/door=leaf', 'root/other'], matrices: input, alternate: false });
    const state = worldFrame(), changes = worldChanges();
    state.move('root/door', new Matrix4().makeTranslation(10, 0, 0).elements);
    expect(binding.apply(changes.take(state.frame))).toBe(true);
    expect(binding.matrices[12]).toBe(11); expect(binding.matrices[28]).toBe(2);
    state.visible('root', false); state.visible('root/door', true);
    binding.apply(changes.take(state.frame));
    expect(binding.matrices[12]).toBe(11); expect([...binding.matrices.slice(16)]).toEqual(new Array(16).fill(0));
    state.move('root/door', new Matrix4().makeTranslation(20, 0, 0).elements);
    binding.apply(changes.take(state.frame)); expect(binding.matrices[12]).toBe(21);
    state.visible('root/other', true); binding.apply(changes.take(state.frame)); expect(binding.matrices[28]).toBe(2);
    expect(input[12]).toBe(1); expect(input[28]).toBe(2); expect(binding.moved).toBe(true);
  });
  it('keeps alternates available but hidden, and matches standalone opacity / world-only UV routing', () => {
    const binding = worldPlacement({ path: 'root/outline', scrollPath: 'root/wash', alternate: true });
    expect(binding.visible).toBe(false);
    const state = worldFrame(), changes = worldChanges();
    state.visible('root', true); state.opacity('root', 0.1); state.opacity('root/outline', 0.4); state.scroll('root', 0.2, 0.3);
    binding.apply(changes.take(state.frame));
    expect(binding.visible).toBe(true); expect(binding.opacity).toBe(0.4); expect(binding.uv).toEqual([0.2, 0.3]);
    const instances = worldPlacement({ paths: ['root/outline', 'root/outline'], matrices: new Float32Array(32), alternate: false });
    instances.apply(worldChanges().take(state.frame)); expect(instances.opacity).toBe(1);
  });
});

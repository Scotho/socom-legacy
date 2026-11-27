import { describe, expect, it } from 'vitest';
import { Matrix4 } from 'three';
import { mirroringRefusal, NEGATIVE_SCALE_REFUSAL, typedScaleRefusal } from '../../src/forge/geometry/editor';

/**
 * PR #5's import (seat-forge, item D2): a typed scale of -1, or a gizmo drag through zero, turned an object inside out --
 * its faces wound the wrong way and its collision mirrored (`objectTransformMatrix`, `transformObject`). The editor now
 * refuses it, in words that send the player to Mirror, which flips an object properly. A browser adaptation (FG.R2): the
 * editor's own rule, nothing of the game's.
 */
describe('PR #5 D2: a negative scale is refused, pointing to Mirror', () => {
  it('a typed scale with any negative axis is refused; 0 keeps its own refusal; a positive one passes', () => {
    expect(typedScaleRefusal([-1, 1, 1])).toBe(NEGATIVE_SCALE_REFUSAL);
    expect(typedScaleRefusal([1, 1, -0.5])).toBe(NEGATIVE_SCALE_REFUSAL);
    expect(typedScaleRefusal([2, 0.5, 1])).toBeNull();
    expect(NEGATIVE_SCALE_REFUSAL).toMatch(/Mirror/);
  });
  it('a gizmo move that mirrors (a negative determinant) is refused; a turn, a move and a positive scale are not', () => {
    expect(mirroringRefusal(new Matrix4().makeScale(-1, 1, 1).elements)).toBe(NEGATIVE_SCALE_REFUSAL);
    expect(mirroringRefusal(new Matrix4().makeScale(-1, -1, -1).elements)).toBe(NEGATIVE_SCALE_REFUSAL);
    expect(mirroringRefusal(new Matrix4().makeScale(-1, -1, 1).elements), 'two flips are a half turn').toBeNull();
    expect(mirroringRefusal(new Matrix4().makeRotationY(1.2).elements)).toBeNull();
    expect(mirroringRefusal(new Matrix4().makeTranslation(5, 0, -3).elements)).toBeNull();
    expect(mirroringRefusal(new Matrix4().makeScale(2, 0.5, 3).elements)).toBeNull();
  });
});

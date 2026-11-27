import { expect, it } from 'vitest';
import { Matrix4, PerspectiveCamera, Vector3 } from 'three';
import { staticBounds } from '../src/xboxPrototype/bounds';
import { frameVisibility } from '../src/xboxPrototype/visibility';

const positions = new Float32Array([-1, -1, -1, 1, 1, 1]);
it('keeps intersecting static geometry and rejects geometry entirely beyond the view', () => {
  const camera = new PerspectiveCamera(60, 1, 0.1, 100); camera.updateMatrixWorld();
  const view = frameVisibility(); view.frame(camera);
  expect(view.visible(staticBounds({ positions, model: new Matrix4().makeTranslation(0, 0, -5), actor: false }))).toBe(true);
  expect(view.visible(staticBounds({ positions, model: new Matrix4().makeTranslation(100, 0, -5), actor: false }))).toBe(false);
  // A bound spanning the near plane must not disappear because its centre is behind it.
  expect(view.visible(staticBounds({ positions, model: new Matrix4(), actor: false }))).toBe(true);
});

it('bounds every instance after placement without retaining decoded geometry arrays', () => {
  const matrices = new Float32Array(32);
  new Matrix4().makeTranslation(-100, 0, -5).toArray(matrices, 0);
  new Matrix4().makeTranslation(0, 0, -5).toArray(matrices, 16);
  const bounds = staticBounds({ positions, instances: matrices, model: new Matrix4().makeTranslation(3, 0, 0), actor: false })!;
  for (const point of [[-98, -1, -6], [-96, 1, -4], [2, -1, -6], [4, 1, -4]]) {
    expect(bounds.containsPoint(new Vector3(point[0], point[1], point[2]))).toBe(true);
  }
  const camera = new PerspectiveCamera(60, 1, 0.1, 100); camera.updateMatrixWorld();
  const view = frameVisibility(); view.frame(camera); expect(view.visible(bounds)).toBe(true);
});

it('does not apply static bind-pose bounds to animated or held geometry', () => {
  expect(staticBounds({ positions, model: new Matrix4(), actor: true })).toBeNull();
  const view = frameVisibility(); expect(view.visible(null)).toBe(true);
});

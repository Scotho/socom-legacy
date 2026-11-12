import { describe, expect, it } from 'vitest';
import { BufferGeometry, Float32BufferAttribute, Frustum, Matrix4, Mesh, PerspectiveCamera, WebGPUCoordinateSystem } from 'three';
import { prepareWorldFrustum } from '../src/worldFrustum';

function mesh(points: number[]): Mesh {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
  geometry.computeBoundingSphere();
  const m = new Mesh(geometry); m.frustumCulled = false;
  return m;
}
function frustum(camera: PerspectiveCamera): Frustum {
  camera.updateMatrixWorld();
  return new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), camera.coordinateSystem);
}
describe('static world geometry frustum rejection', () => {
  it('rejects a wholly off-screen chunk, retaining boundary-crossing and camera-enclosing chunks', () => {
    const camera = new PerspectiveCamera(90, 1, 1, 100);
    for (const convention of [camera.coordinateSystem, WebGPUCoordinateSystem]) {
      camera.coordinateSystem = convention; camera.updateProjectionMatrix();
      const f = frustum(camera);
      const outside = mesh([100,0,-10, 101,0,-10, 100,1,-10]);
      const crossing = mesh([9,0,-10, 11,0,-10, 9,1,-10]);
      const huge = mesh([-1000,-1000,-1000,1000,-1000,-1000,0,1000,1000]);
      for (const m of [outside,crossing,huge]) prepareWorldFrustum(m);
      expect(outside.frustumCulled).toBe(true);
      expect(f.intersectsObject(outside)).toBe(false);
      expect(f.intersectsObject(crossing)).toBe(true);
      expect(f.intersectsObject(huge)).toBe(true);
    }
  });
  it('retains geometry touching every clipping plane after map-origin translation', () => {
    const camera = new PerspectiveCamera(90, 1, 1, 100);
    camera.position.set(12000, 300, -9000);
    const f = frustum(camera);
    for (const p of [[-10,0,-10],[10,0,-10],[0,-10,-10],[0,10,-10],[0,0,-1],[0,0,-100]]) {
      const m = mesh([...p,...p,...p]); prepareWorldFrustum(m);
      m.position.copy(camera.position); m.updateMatrixWorld();
      expect(f.intersectsObject(m), JSON.stringify(p)).toBe(true);
    }
  });
  it('pads bounds without changing vertices and keeps nonfinite bounds unculled', () => {
    const m = mesh([-1,0,-10,1,0,-10,0,1,-10]);
    const before = Array.from(m.geometry.getAttribute('position').array);
    const radius = m.geometry.boundingSphere!.radius;
    prepareWorldFrustum(m);
    expect(m.geometry.boundingSphere!.radius).toBeGreaterThan(radius);
    expect(Array.from(m.geometry.getAttribute('position').array)).toEqual(before);
    const invalid = mesh([0,0,0,1,0,0,0,1,0]);
    invalid.geometry.boundingSphere!.center.set(Infinity,0,0);
    prepareWorldFrustum(invalid); expect(invalid.frustumCulled).toBe(false);
  });
});

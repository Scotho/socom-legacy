import { Matrix4, OrthographicCamera, Scene, SkinnedMesh } from 'three';
import type { LoadedBody } from '../src/body';
import { buildBody, type BodyView } from '../src/bodyView';
import { DEFAULT_LIGHTING } from '../src/lighting';
import { createRenderer } from '../src/renderer';

/** Synthetic render comparison: separate map owners reproduce unshared resource allocation. No Xbox emulation. */
export async function compareBodyResources() {
  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  const app = await createRenderer(canvas);
  app.resize(128, 128); app.setPixelRatio(1); app.setClearColor([0, 0, 0]);
  const gl = canvas.getContext('webgl2')!;
  const camera = new OrthographicCamera(-0.5, 5, 5, -0.5, 0.1, 10);
  camera.position.z = 2;
  const identity = new Matrix4().toArray();
  const body = {
    character: null, model: 'shared-render-test', dressedBy: 'test',
    parts: [{ name: 'root', parent: -1, bindLocal: identity, bindWorld: identity }],
    subMeshes: [{ textureName: 'skin', fog: false,
      positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]), uvs: new Float32Array(6),
      indices: Uint32Array.from([0, 1, 2]), skinIndex: new Uint16Array(12),
      skinWeight: Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
    }],
    fittings: [], missing: [], at: null, height: 1, eye: null,
    stats: { vertices: 3, triangles: 1, parts: 1, subMeshes: 1, batches: 1, maxInfluences: 1, droppedWeight: 0, fittings: 0 },
  } as unknown as LoadedBody;
  const map = { textures: { skin: { width: 1, height: 1, data: new Uint8ClampedArray([220, 140, 80, 255]) } }, textureFlags: {} };
  const run = (shared: boolean) => {
    const scene = new Scene(), views: BodyView[] = [];
    const frame = () => {
      app.render(scene, camera);
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      if (gl.getError() !== gl.NO_ERROR || gl.isContextLost()) throw new Error('Body render failed');
      return pixels;
    };
    try {
      for (let i = 0; i < 16; i++) {
        const view = buildBody(body, shared ? map : { ...map }, DEFAULT_LIGHTING);
        views.push(view); scene.add(view.group); view.setVisible(true);
        view.place([(i % 4) * 1.2, Math.floor(i / 4) * 1.2, 0], 0);
        // Distinct poses and fades exercise the per-instance state while buffers are shared.
        view.setPose([new Matrix4().makeRotationZ(i * 0.01).toArray()]);
        if (i % 3 === 0) view.setOpacity(0.5);
      }
      const first = frame();
      const geometry = new Set(), textures = new Set();
      scene.traverse((object) => {
        if (object instanceof SkinnedMesh) {
          geometry.add(object.geometry);
          const material = object.material as { map?: unknown };
          textures.add(material.map);
        }
      });
      for (let i = 0; i < 8; i++) { scene.remove(views[i]!.group); views[i]!.dispose(); }
      const afterRemoval = frame();
      return { first, afterRemoval, geometry: geometry.size, textures: textures.size };
    } finally {
      views.forEach(view => view.dispose());
      scene.clear();
    }
  };
  try {
    const separate = run(false), shared = run(true);
    const differences = (a: Uint8Array, b: Uint8Array) => a.reduce((n, value, i) => n + (value === b[i] ? 0 : 1), 0);
    const lit = (pixels: Uint8Array) => pixels.reduce((n, value, i) => n + (i % 4 !== 3 && value > 10 ? 1 : 0), 0);
    return {
      backend: app.backend,
      separate: { geometry: separate.geometry, textures: separate.textures },
      shared: { geometry: shared.geometry, textures: shared.textures },
      firstDifferences: differences(separate.first, shared.first),
      removalDifferences: differences(separate.afterRemoval, shared.afterRemoval),
      firstLit: lit(shared.first), remainingLit: lit(shared.afterRemoval),
    };
  } finally {
    try { await app.renderer.dispose(); } finally { canvas.remove(); }
  }
}

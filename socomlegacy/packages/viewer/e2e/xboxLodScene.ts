import { Matrix4, PerspectiveCamera } from 'three';
import { lodOpacity, type LodBand } from '@s2u/scene';
import type { LoadedMap } from '../src/loadMap';
import type { LoadedBody } from '../src/body';
import { rawPrototype } from '../src/xboxPrototype/raw';
import type { SceneFrame } from '../src/xboxPrototype/sceneFrame';

/** Synthetic band/cutout probe. Tests actual GPU fades against the current pure
 * band and source-over rules, not a console capture or a full map comparison. */
export async function probeXboxLod() {
  const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64; document.body.append(canvas);
  const high: LodBand = { nearFade: [0, 0], farFade: [100, 120] }, low: LodBand = { nearFade: [100, 120], farFade: [420, 440] };
  const part = (textureName: string, order: number) => ({
    positions: new Float32Array([-400, -400, 0, 400, -400, 0, 0, 400, 0]), normals: null,
    uvs: new Float32Array(6), indices: new Uint32Array([0, 1, 2]), textureName,
    fog: true, cull: false, lit: false, order, orderEnd: order, alternate: false, scroll: null,
  });
  const prop = (lod: LodBand, texture: string, order: number) => ({ parts: [part(texture, order)], matrices: Float32Array.from(new Matrix4().elements),
    order, alternate: false, lod, modelName: texture, facade: 0 });
  const body = { parts: [], subMeshes: [], fittings: [], at: null } as unknown as LoadedBody;
  const camera = new PerspectiveCamera(55, 1, 1, 2000);
  const results = [];
  try {
    for (const shared of [false, true]) for (const blend of ['cutout', 'source', 'additive', 'destination']) for (const alpha of [192, 64]) {
      if (shared && blend !== 'cutout') continue;
      // Equal order deliberately exercises returning to a fade after the far
      // copy was opaque. A mutable stable sort alone reverses these draws.
      const carrier = blend === 'destination', clear = carrier ? [32, 48, 64] : [0, 0, 0];
      const props = [prop(high, 'high', 1), prop(low, 'low', 1)];
      if (shared) for (const p of props) p.matrices = Float32Array.from([...new Matrix4().elements, ...new Matrix4().makeTranslation(0, 0, 40).elements]);
      const map = { world: [], props, origin: [0, 0, 0],
        textureFlags: Object.fromEntries(['high', 'low'].map(name => [name, { transparent: true, graded: blend !== 'cutout', opaque: false, bilinear: false,
          gs: blend === 'cutout' ? null : { blend, alphaTest: null, wrapS: 'repeat', wrapT: 'repeat', bilinear: false, mipmaps: false } }])),
        textures: { high: { width: 1, height: 1, data: new Uint8ClampedArray([255, 0, 0, alpha]) },
          low: { width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 255, alpha]) } },
        camera: carrier ? { fogColor: clear, fogEnabled: true, fogNear: 0, fogFar: 200, fogAltitude: false } : null,
      } as unknown as LoadedMap;
      const renderer = await rawPrototype(canvas, map, body, 1024 * 1024);
      try {
        const phases = shared ? [[110, 1], [170, 1]] : [[90, 1], [110, 1], [130, 1], [500, 1], [330, 9]];
        for (const [distance, magnification] of phases) {
          camera.position.set(0, 0, distance!); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
          const frame: SceneFrame = { camera, magnification, others: [], body: { id: 0, modelIndex: 0,
            position: [0, 0, 0], yawRadians: 0, palette: new Float32Array(48 * 16), local: [], world: [] } };
          renderer.render(frame);
          const gl = canvas.getContext('webgl2')!, pixel = new Uint8Array(4);
          gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          const a = lodOpacity(high, distance! ** 2 / magnification!, false), b = lodOpacity(low, distance! ** 2 / magnification!, true);
          const opacityA = a * alpha / 255, opacityB = b * alpha / 255;
          const expected = shared ? (alpha <= 127 ? [0, 0, 0] : distance === 110 ? [255, 0, 0] : [0, 0, 255])
            : carrier ? clear.map(value => value * (1 + opacityA) * (1 + opacityB))
            : blend === 'additive' ? [255 * opacityA, 0, 255 * opacityB]
            : blend === 'source' ? [255 * opacityA * (1 - opacityB), 0, 255 * opacityB]
            : alpha <= 127 ? [0, 0, 0] : [255 * a * (1 - b), 0, 255 * b];
          results.push({ shared, blend, alpha, distance, magnification, pixel: [...pixel].slice(0, 3), expected, stats: { ...renderer.stats } });
        }
      } finally { renderer.dispose(); }
    }
    return results;
  } finally { canvas.remove(); }
}

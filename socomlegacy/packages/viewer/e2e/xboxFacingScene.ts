import { BufferAttribute, BufferGeometry, Color, Matrix4, Mesh, PerspectiveCamera, Scene, Vector3 } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { vec4, vertexColor } from 'three/tsl';
import { createRenderer } from '../src/renderer';
import { relightFacade, turnFacade } from '../src/facade';
import type { Lighting } from '../src/lighting';
import { rawPrototype } from '../src/xboxPrototype/raw';
import type { LoadedMap } from '../src/loadMap';
import type { LoadedBody } from '../src/body';
import type { SceneFrame } from '../src/xboxPrototype/sceneFrame';

/** Synthetic facade comparison against the existing turn, not a console capture. */
export async function probeXboxFacing() {
  const canvas = document.createElement('canvas'), rawCanvas = document.createElement('canvas');
  rawCanvas.width = 640; rawCanvas.height = 448; document.body.append(canvas, rawCanvas);
  const app = await createRenderer(canvas, { graphics: 'xbox', antialias: false });
  app.setPixelRatio(1); app.setPresentation('native'); app.resize(640, 448);
  const scene = new Scene(); scene.background = new Color(0, 0, 0);
  const geometry = new BufferGeometry(), positions = new Float32Array([-10, -10, 0, 0, 10, 0, 10, -10, 0]), indices = new Uint32Array([0, 1, 2]);
  geometry.setAttribute('position', new BufferAttribute(positions, 3)); geometry.setIndex(new BufferAttribute(indices, 1));
  const colours = Float32Array.from([0.8, 0.6, 0.4, 1, 0.8, 0.6, 0.4, 1, 0.8, 0.6, 0.4, 1]);
  const normals = Float32Array.from([0, 0, -1, 0, 0, -1, 0, 0, -1]), turnedNormals = new Float32Array(9);
  const colourAttribute = new BufferAttribute(new Float32Array(12), 4); geometry.setAttribute('color', colourAttribute);
  const material = new MeshBasicNodeMaterial({ toneMapped: false });
  material.vertexColors = false; material.colorNode = vec4(vertexColor()).clamp(0, 1);
  const lighting: Lighting = { brighten: 0, rigEverywhere: false, rig: { ambient: [0.1, 0.2, 0.3],
    directions: [[0, 0, 1], [1, 0, 0], [0, 1, 0]], colours: [[0.6, 0.4, 0.2], [0.2, 0.6, 0.4], [0.4, 0.2, 0.6]] } };
  const mesh = new Mesh(geometry, material); scene.add(mesh);
  const initial = new Matrix4().makeRotationY(Math.PI / 2).scale(new Vector3(2, 3, 4));
  const camera = new PerspectiveCamera(55, 640 / 448, 1, 2000);
  const body = { parts: [], subMeshes: [], fittings: [], at: null } as unknown as LoadedBody;
  const results = [];
  try {
    for (const facade of [1, 2]) for (const lit of [false, true]) for (const withNormals of [true, false]) {
      const normalData = withNormals ? normals : null;
      initial.decompose(mesh.position, mesh.quaternion, mesh.scale);
      const map = { world: [], props: [{ parts: [{ positions, indices, normals: normalData, uvs: new Float32Array(6),
        colors: colours, textureName: null,
        fog: false, cull: true, lit, order: 1, alternate: false, scroll: null }],
        matrices: Float32Array.from(initial.elements), facade, lod: null, order: 1, alternate: false }],
        textures: {}, textureFlags: {}, camera: null, lightRig: lighting.rig, origin: [0, 0, 0] } as unknown as LoadedMap;
      const renderer = await rawPrototype(rawCanvas, map, body, 1024 * 1024);
      try {
        for (const eye of [[0, 0, 100], [100, 0, 0], [50, 35, 80], [0, 100, 0], [0, 0, 100]]) {
          camera.position.set(eye[0]!, eye[1]!, eye[2]!); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
          turnFacade(mesh, facade, [0, 0, 0], eye);
          relightFacade({ colors: colours, normals: normalData, lit }, mesh.quaternion, lighting, turnedNormals, colourAttribute.array as Float32Array);
          colourAttribute.needsUpdate = true;
          app.render(scene, camera);
          const frame: SceneFrame = { camera, others: [], body: { id: 0, modelIndex: 0, position: [0, 0, 0],
            yawRadians: 0, palette: new Float32Array(48 * 16), local: [], world: [] } };
          renderer.render(frame);
          const read = (target: HTMLCanvasElement) => { const gl = target.getContext('webgl2')!, pixels = new Uint8Array(640 * 448 * 4);
            gl.readPixels(0, 0, 640, 448, gl.RGBA, gl.UNSIGNED_BYTE, pixels); return pixels; };
          const expected = read(canvas), actual = read(rawCanvas);
          let differences = 0, nonzero = 0;
          for (let i = 0; i < actual.length; i++) if (i % 4 !== 3) { if (actual[i] !== expected[i]) differences++; if (actual[i]! > 0) nonzero++; }
          results.push({ facade, eye, differences, lit: nonzero, lighting: lit, withNormals, stats: { ...renderer.stats } });
        }
      } finally { renderer.dispose(); }
    }
    return results;
  } finally { geometry.dispose(); material.dispose(); await app.renderer.dispose(); canvas.remove(); rawCanvas.remove(); }
}

import { DataTexture, Group, Matrix4, Mesh, OrthographicCamera, PlaneGeometry, RGBAFormat, Scene } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { texture } from 'three/tsl';
import type { LoadedBody } from '../src/body';
import { buildBody, type BodyView } from '../src/bodyView';
import { DEFAULT_LIGHTING } from '../src/lighting';
import { createRenderer } from '../src/renderer';
import { setStableSkinProgramsForTest } from '../src/stableSkinPrograms';
import { applyFog } from '../src/fog';
import { setNightVision } from '../src/nightVision';
import { nightLit } from '../src/nightVision';

/**
 * LATER 1168's draw-identity check (a rendered browser run; product track only if the draw is byte-identical): a world
 * (three world-style planes: shared render groups, so three's bind-group cache is hit -- the review's F1)
 * and 16 bodies of one model, each of TWO sub-meshes with different textures (a second material per body: a cache hit
 * too) -- distinct poses, a third faded -- under the scene's PS2 fog (`applyFog`), drawn with night vision off and on,
 * by three alone and with `./stableSkinPrograms`, each on a renderer of its own, read back and compared pixel for pixel;
 * and the WebGL2 programs each linked (`linkProgram` counted on the canvas's context). Not exercised here: the
 * characters' shadow pass (its override material), the glow target, the PS2 picture target, held weapons, a body's
 * fittings, `./world`'s own build (its reveal queues, detail blend). `worldDrew` counts the pixels the world-style planes
 * change (the frame read again with them hidden): the re-review's F1 found the fixture's world drawing nothing.
 */
export async function compareStableSkin() {
  const identity = new Matrix4().toArray();
  const body = {
    character: null, model: 'stable-skin-test', dressedBy: 'test',
    parts: [{ name: 'root', parent: -1, bindLocal: identity, bindWorld: identity }, { name: 'arm', parent: 0, bindLocal: identity, bindWorld: identity }],
    subMeshes: ['skin', 'vest'].map((textureName, k) => ({ textureName, fog: true,
      positions: Float32Array.from([0, k * 0.5, 0, 1, k * 0.5, 0, 0, 1, 0]),
      normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]), uvs: Float32Array.from([0, 0, 1, 0, 0, 1]),
      indices: Uint32Array.from([0, 1, 2]), skinIndex: Uint16Array.from([0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
      skinWeight: Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
    })),
    fittings: [], missing: [], at: null, height: 1, eye: null,
    stats: { vertices: 3, triangles: 1, parts: 2, subMeshes: 1, batches: 1, maxInfluences: 1, droppedWeight: 0, fittings: 0 },
  } as unknown as LoadedBody;
  const map = { textures: {
    skin: { width: 2, height: 2, data: new Uint8ClampedArray([220, 140, 80, 255, 40, 200, 90, 255, 30, 60, 210, 255, 250, 250, 250, 255]) },
    vest: { width: 2, height: 2, data: new Uint8ClampedArray([90, 90, 30, 255, 200, 40, 40, 255, 60, 160, 160, 255, 10, 10, 10, 255]) },
  }, textureFlags: {} };
  const run = async (on: boolean, night: boolean) => {
    setStableSkinProgramsForTest(on);
    setNightVision(night ? [40, 255, 60, 255] : null);
    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    const app = await createRenderer(canvas);
    try {
      app.resize(160, 160); app.setPixelRatio(1); app.setClearColor([0, 0, 0]);
      const gl = canvas.getContext('webgl2')!;
      let links = 0;
      const link = gl.linkProgram.bind(gl);
      gl.linkProgram = (p: WebGLProgram) => { links++; link(p); };
      const camera = new OrthographicCamera(-0.5, 5, 5, -0.5, 0.1, 10);
      camera.position.z = 2;
      const scene = new Scene(), views: BodyView[] = [];
      applyFog(scene, { enabled: true, near: 1, far: 6, color: [100, 120, 140], altitude: null });
      // World-style materials (`./world`'s colour through `nightLit`, the scene's fog): three planes, each its own
      // material and texture over the same shared render-group uniforms, so three's bind-group cache is hit (the review's
      // F1); facing the camera behind the bodies. (The fixture's own world, first used here, drew no pixel on PC 2.)
      const world = new Group();
      const worldParts: { geometry: PlaneGeometry; material: MeshBasicNodeMaterial; map: DataTexture }[] = [];
      for (let k = 0; k < 3; k++) {
        const map = new DataTexture(new Uint8Array([60 + 60 * k, 200 - 50 * k, 90, 255, 30, 90 + 40 * k, 220, 255, 240, 240, 40 * k, 255, 20, 20, 20, 255]), 2, 2, RGBAFormat);
        map.needsUpdate = true;
        const material = new MeshBasicNodeMaterial();
        material.colorNode = nightLit(texture(map));
        material.fog = true;
        const geometry = new PlaneGeometry(1.6, 4.6);
        const mesh = new Mesh(geometry, material);
        mesh.position.set(0.8 + 1.8 * k, 2.2, -1);
        world.add(mesh);
        worldParts.push({ geometry, material, map });
      }
      scene.add(world);
      for (let i = 0; i < 16; i++) {
        const view = buildBody(body, map, DEFAULT_LIGHTING);
        views.push(view); scene.add(view.group); view.setVisible(true);
        view.place([(i % 4) * 1.2, Math.floor(i / 4) * 1.2, 0], 0);
        view.setPose([new Matrix4().makeRotationZ(i * 0.02).toArray(), new Matrix4().makeTranslation(0.01 * i, 0, 0).toArray()]);
        if (i % 3 === 0) view.setOpacity(0.5);
      }
      app.render(scene, camera);
      const before = links;
      app.render(scene, camera);
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      if (gl.getError() !== gl.NO_ERROR || gl.isContextLost()) throw new Error('Body render failed');
      world.visible = false;                            // the world's own pixels: the frame again without it
      app.render(scene, camera);
      const without = new Uint8Array(pixels.length);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, without);
      let worldDrew = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] !== without[i] || pixels[i + 1] !== without[i + 1] || pixels[i + 2] !== without[i + 2]) worldDrew++;
      views.forEach((v) => v.dispose());
      for (const p of worldParts) { p.geometry.dispose(); p.material.dispose(); p.map.dispose(); }
      return { backend: app.backend, pixels, links: before, linksSecondFrame: links - before, worldDrew };
    } finally {
      try { await app.renderer.dispose(); } finally { canvas.remove(); }
    }
  };
  const compare = async (night: boolean) => {
    const off = await run(false, night), on = await run(true, night);
    let differences = 0, lit = 0, distinct = 0;
    for (let i = 0; i < off.pixels.length; i++) { if (off.pixels[i] !== on.pixels[i]) differences++; if (i % 4 !== 3 && on.pixels[i]! > 10) lit++; }
    const colours = new Set<number>();
    for (let i = 0; i < on.pixels.length; i += 4) colours.add((on.pixels[i]! << 16) | (on.pixels[i + 1]! << 8) | on.pixels[i + 2]!);
    distinct = colours.size;
    return { differences, lit, colours: distinct, worldDrew: [off.worldDrew, on.worldDrew], linksOff: off.links, linksOn: on.links, secondFrame: [off.linksSecondFrame, on.linksSecondFrame], pixels: on.pixels };
  };
  try {
    const { pixels: dayPixels, ...day } = await compare(false);
    const { pixels: nightPixels, ...night } = await compare(true);
    let dayVsNight = 0;
    for (let i = 0; i < dayPixels.length; i++) if (dayPixels[i] !== nightPixels[i]) dayVsNight++;
    const backend = (await run(true, false)).backend;
    return { backend, day, night, dayVsNight };
  } finally {
    setStableSkinProgramsForTest(true);
    setNightVision(null);
  }
}

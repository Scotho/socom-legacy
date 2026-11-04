import { Mesh, OrthographicCamera, PlaneGeometry, Scene } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { createRenderer, type Presentation } from '../src/renderer';

/** Synthetic edges, not disc art: exercise the application's real WebGL framebuffer and PS2 copy. */
export async function measureEdges(ratio: number) {
  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  const app = await createRenderer(canvas);
  app.resize(844, 390);
  app.setPixelRatio(ratio);
  app.setClearColor([0, 0, 0]);
  const scene = new Scene();
  const camera = new OrthographicCamera(-844 / 390, 844 / 390, 1, -1, 0.1, 10);
  camera.position.z = 2;
  const geometry = new PlaneGeometry(2.5, 1.1);
  const material = new MeshBasicNodeMaterial({ color: 0xffffff });
  const wall = new Mesh(geometry, material);
  wall.rotation.z = 0.19;
  scene.add(wall);
  const gl = canvas.getContext('webgl2')!;
  const measure = (presentation: Presentation) => {
    app.setPresentation(presentation);
    app.render(scene, camera);
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    // Read in the same task as the draw; preserveDrawingBuffer is deliberately not required.
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let intermediate = 0, white = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i]! > 2 && pixels[i]! < 253) intermediate++;
      if (pixels[i]! >= 253) white++;
    }
    return {
      presentation, width: canvas.width, height: canvas.height,
      antialias: gl.getContextAttributes()!.antialias,
      samples: gl.getParameter(gl.SAMPLES) as number,
      intermediate, white, error: gl.getError(),
    };
  };
  try {
    return { backend: app.backend, native: measure('native'), ps2: measure('ps2'), restored: measure('native') };
  } finally {
    geometry.dispose();
    material.dispose();
    app.renderer.dispose();
    canvas.remove();
  }
}

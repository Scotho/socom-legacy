import { Color, Group, Matrix4, PerspectiveCamera, Scene } from 'three';
import type { ParticleSource } from '@s2u/scene';
import type { GsState } from '@s2u/gs';
import { ParticleGeometry } from '../src/particleGeometry';
import { ParticleSystem } from '../src/particles';
import { effectBrighten } from '../src/effectMaterials';
import { applyFog } from '../src/fog';
import type { EffectTexture } from '../src/effectData';
import type { LoadedMap } from '../src/loadMap';
import { createRenderer } from '../src/renderer';
import { RawParticles } from '../src/xboxPrototype/rawParticles';
import { ParticleStyle } from '../src/xboxPrototype/particleStyle';
import { PayloadBudget } from '../src/xboxPrototype/budget';

/** Synthetic emitter, not a disc reading. Both paths execute the shared manager. */
const source: ParticleSource = {
  flagsA: 0x4013, flagsB: 0, name: 'fixture', setActive: true, node: -6, follow: true, perEvent: 1, events: -1, interval: 1,
  perDistance: true, type: 2, streak: null, spin: null, offset: [0, 0, 0], baseVelocity: [0, 0, 0], worldVelocity: [0, -5, 0],
  baseFrom: 'fixed', worldFrom: 'fixed', baseScale: 0, worldScale: 0, baseUnit: false, worldUnit: false, atContext: false,
  atNode: false, positionBlock: null, randomVelocity: [[0, 0], [0, 0], [0, 0]], box: [[0, 0], [0, 0], [0, 0]], accel: [0, 0, 0],
  friction: 0, size: [2, 2], startAge: [0, 0], lifetime: [100, 100], nearFade: null, farFade: null, textures: [], textureMode: 'first',
  texture: null, colours: [[0, 1, 0.75, 0.5, 0.6]], scales: [],
};

export async function probeXboxParticles() {
  const canvas = document.createElement('canvas'), rawCanvas = document.createElement('canvas');
  rawCanvas.width = 640; rawCanvas.height = 448; document.body.append(canvas, rawCanvas);
  const app = await createRenderer(canvas, { graphics: 'xbox', antialias: false });
  app.setPixelRatio(1); app.setPresentation('native'); app.resize(640, 448);
  const gl = rawCanvas.getContext('webgl2', { alpha: false, antialias: false, depth: true })!;
  const budget = new PayloadBudget(4 * 1024 * 1024), raw = new RawParticles(gl, budget);
  const current = new ParticleSystem(() => 0.5), core = new ParticleGeometry(() => 0.5, texture => new ParticleStyle(texture));
  const scene = new Scene(), parent = new Group(); parent.add(core.object); scene.add(current.object);
  const camera = new PerspectiveCamera(55, 640 / 448, 1, 1000);
  camera.position.set(0, 12, 30); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const results = [];
  let textureRefusal: { refused: boolean; retainedBuffersOnly: boolean; released: number } | undefined;
  const read = (context: WebGL2RenderingContext) => {
    const values = new Uint8Array(640*448*4); context.readPixels(0, 0, 640, 448, context.RGBA, context.UNSIGNED_BYTE, values); return values;
  };
  try {
    for (const blend of ['untextured', 'source', 'additive', 'destination', 'cutout'] as const)
      for (const type of [0, 1, 2, 3]) for (const fogMode of [0, 1, 2]) {
        const fogged = fogMode > 0, altitude = fogMode === 2;
        const gs: GsState = { blend: blend === 'cutout' || blend === 'untextured' ? 'source' : blend,
          alphaTest: blend === 'cutout' ? 0.5 : null, depthTest: true, bilinear: false, mipmaps: false, levels: 0, wrapS: 'repeat', wrapT: 'repeat' };
        const textures = new Map<string, EffectTexture>(['a', 'b'].map((name, i) => [name, { gs,
          rgba: { width: 2, height: 2, data: new Uint8ClampedArray(i
            ? [30, 220, 80, 64, 80, 180, 255, 192, 255, 50, 90, 64, 60, 110, 240, 192]
            : [220, 60, 40, 192, 20, 210, 40, 64, 40, 60, 220, 192, 160, 100, 30, 64]) } }]));
        const fog = { fogEnabled: fogged, fogNear: 10, fogFar: 80, fogAltitude: altitude,
          fogColor: [20, 30, 40], fogBottom: -1, fogTop: 1 } as NonNullable<LoadedMap['camera']>;
        scene.background = new Color(20/255, 30/255, 40/255);
        applyFog(scene, { enabled: fogged, near: 10, far: 80, color: [20, 30, 40], altitude: altitude ? { bottom: -1, top: 1 } : null });
        const brighten = fogged ? 1.25 : 1; effectBrighten.value = brighten;
        for (const system of [current, core]) {
          system.setTextures(textures);
          for (const [index, name] of ['a', 'b'].entries()) {
            const node = new Matrix4().makeTranslation(-1, 0, index*0.5);
            system.emit({ ...source, type, name, flagsA: source.flagsA | 0x80,
              textures: blend === 'untextured' ? [] : [{ name, t: 0 }], texture: blend === 'untextured' ? null : name },
              node, {}, 'probe', () => true, null, () => node);
            system.update(1/60, camera); node.elements[12] = 1;
            system.update(1/60, camera);
          }
        }
        app.render(scene, camera);
        gl.viewport(0, 0, 640, 448); gl.colorMask(true, true, true, true); gl.depthMask(true);
        gl.clearColor(20/255, 30/255, 40/255, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        raw.draw(core.object, camera, fog, brighten);
        const expected = read(canvas.getContext('webgl2')!), actual = read(gl);
        let differences = 0, maximum = 0, changed = 0;
        for (let i = 0; i < actual.length; i++) if (i % 4 !== 3) {
          const delta = Math.abs(actual[i]! - expected[i]!); if (delta) differences++;
          maximum = Math.max(maximum, delta); if (actual[i] !== [20, 30, 40][i % 4]) changed++;
        }
        const stats = { ...raw.stats };
        if (!textureRefusal) {
          // Enough for the fixed buffers, less than even the untextured 1x1 fallback.
          const tightBudget = new PayloadBudget(raw.stats.gpuBufferBytes + 3);
          const tight = new RawParticles(gl, tightBudget);
          let refused = false, retainedBuffersOnly = false;
          try {
            try { tight.draw(core.object, camera, fog, brighten); }
            catch (error) { refused = error instanceof Error && error.message === 'Prototype GPU payload budget exceeded'; }
            retainedBuffersOnly = tightBudget.current === tight.stats.gpuBufferBytes && tight.stats.textures === 0;
          } finally { tight.dispose(); }
          textureRefusal = { refused, retainedBuffersOnly, released: tightBudget.current };
        }
        parent.visible = false; raw.draw(core.object, camera, fog, brighten);
        const hiddenDraws = raw.stats.drawCalls; parent.visible = true;
        parent.position.x = 1;
        let transformed = false; try { raw.draw(core.object, camera, fog, brighten); } catch { transformed = true; }
        parent.position.x = 0;
        core.setTextures(new Map()); current.setTextures(new Map());
        results.push({ blend, type, fogMode, differences, maximum, changed, stats, hiddenDraws, transformed, graphicsError: gl.getError(),
          releasedToBufferBytes: budget.current === raw.stats.gpuBufferBytes, texturesAfterClear: raw.stats.textures });
      }
    const tooSmall = new PayloadBudget(1);
    let refused = false; try { new RawParticles(gl, tooSmall); } catch { refused = true; }
    raw.dispose(); raw.dispose();
    return { results, textureRefusal, refused, refusedBudget: tooSmall.current, released: budget.current, remainingStaging: raw.stats.cpuStagingBytes };
  } finally {
    effectBrighten.value = 1; core.setTextures(new Map()); current.setTextures(new Map()); raw.dispose();
    await app.renderer.dispose(); canvas.remove(); rawCanvas.remove();
  }
}

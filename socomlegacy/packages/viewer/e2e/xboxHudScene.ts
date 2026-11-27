import { OrthographicCamera, Scene } from 'three';
import { Hud } from '../src/hud';
import { HUD_LIBRARIES, type HudBitmaps } from '../src/hudAssets';
import { RawHud } from '../src/xboxPrototype/rawHud';
import { PayloadBudget } from '../src/xboxPrototype/budget';
import { createRenderer } from '../src/renderer';
import { Reticle, RETICLE_SETS } from '../src/reticle';
import { reticleDrawSet, reticleQuads, reticleTextures } from '../src/xboxPrototype/reticleFrame';
import type { ReticleBitmaps } from '../src/hudBitmaps';

/** Synthetic texture fixture compares two backends consuming identical original
 * layout/timing. Not a disc/console screenshot or a claim of full match parity. */
export async function compareXboxHud() {
  const canvas = document.createElement('canvas'), rawCanvas = document.createElement('canvas');
  document.body.append(canvas, rawCanvas); rawCanvas.width = 640; rawCanvas.height = 448;
  const app = await createRenderer(canvas, { graphics: 'xbox', antialias: false });
  app.setPixelRatio(1); app.setPresentation('native'); app.resize(640, 448); app.setClearColor([0, 0, 0]);
  const gl = rawCanvas.getContext('webgl2', { alpha: false, antialias: false })!;
  const budget = new PayloadBudget(32 * 1024 * 1024), raw = new RawHud(gl, budget), current = new Hud();
  try {
    const bitmaps: HudBitmaps = {};
    for (const name of Object.values(HUD_LIBRARIES).flat()) {
      const width = name.startsWith('font_') ? 512 : 64, height = name.startsWith('font_') ? 256 : 64;
      const data = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < data.length; i += 4) data.set([30 + (i / 4 % 137), 80 + (Math.floor(i / 4 / width) % 111), 170, 180 + (i / 4 % 76)], i);
      bitmaps[name] = { width, height, data };
    }
    const results: { phase: string; differences: number; maximum: number; lit: number }[] = [];
    const read = (context: WebGL2RenderingContext) => {
      const pixels = new Uint8Array(640 * 448 * 4);
      context.readPixels(0, 0, 640, 448, context.RGBA, context.UNSIGNED_BYTE, pixels); return pixels;
    };
    for (const phase of ['walking', 'scoreboard', 'spectator'] as const) {
      for (const hud of [raw, current]) {
        hud.setBitmaps(bitmaps); hud.setVisible(true);
        hud.patch({ settled: true, frozen: true, yaw: 37, health: 0.43, timer: 125, name: 'TEST PLAYER', rounds: 17, spare: 3, action: 'climb' });
        hud.setScoreboard(phase === 'scoreboard');
        hud.setSpectator(phase === 'spectator' ? { path: 'spectator', followed: null, stats: null } : null);
        hud.setOverlay(() => ({ quads: [{ element: 'tacmap', texture: 'white', layer: 1, x: 240, y: 190, w: 100, h: 20,
          turn: 0.24, u0: 0, v0: 0, u1: 1, v1: 1, rgba: [0.2, 0.6, 1, 0.7], alphaRight: 0.2 }],
          tris: [{ layer: 1, p: [300, 180, 340, 180, 320, 220], rgba: [1, 0.2, 0.1, 0.7] }] }));
      }
      app.render(new Scene(), new OrthographicCamera()); current.render(app.renderer);
      const expected = read(canvas.getContext('webgl2')!);
      gl.colorMask(true, true, true, true); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      raw.render(640, 448, 0); const actual = read(gl);
      let differences = 0, maximum = 0, lit = 0;
      for (let i = 0; i < actual.length; i++) if (i % 4 !== 3) {
        const delta = Math.abs(actual[i]! - expected[i]!); if (delta) differences++; maximum = Math.max(maximum, delta);
        if (actual[i]! > 10) lit++;
      }
      results.push({ phase, differences, maximum, lit });
    }
    const stats = { ...raw.stats }; raw.dispose();
    return { results, stats, remainingPayload: budget.current };
  } finally { raw.dispose(); current.dispose(); await app.renderer.dispose(); canvas.remove(); rawCanvas.remove(); }
}

export async function compareXboxReticle() {
  const canvas = document.createElement('canvas'), rawCanvas = document.createElement('canvas');
  document.body.append(canvas, rawCanvas); rawCanvas.width = 640; rawCanvas.height = 448;
  const app = await createRenderer(canvas, { graphics: 'xbox', antialias: false });
  app.setPixelRatio(1); app.setPresentation('native'); app.resize(640, 448); app.setClearColor([0, 0, 0]);
  const gl = rawCanvas.getContext('webgl2', { alpha: false, antialias: false })!;
  const budget = new PayloadBudget(32 * 1024 * 1024), raw = new RawHud(gl, budget), current = new Reticle(), overlay = new Hud();
  try {
    const bitmap = (width: number, height: number) => {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set([20 + x * 3, 40 + y * 3, 170, 100 + (x + y) % 156], (y * width + x) * 4);
      return { width, height, data };
    };
    const bitmaps: ReticleBitmaps = { fixed: bitmap(64, 64), floating: bitmap(32, 32), accuracy: null, sets: {} };
    for (const set of [0, 1, 2]) {
      const names = RETICLE_SETS[set]!;
      bitmaps.sets![names.fixed] = set === 1 ? bitmaps.fixed : bitmap(32, 24);
      bitmaps.sets![names.floating!] = set === 1 ? bitmaps.floating : bitmap(16, 12);
    }
    raw.setBitmaps(reticleTextures(bitmaps)); raw.setVisible(false); current.setBitmaps(bitmaps); current.setVisible(true);
    overlay.setBitmaps({});
    for (const hud of [raw, overlay]) {
      hud.patch({ settled: true, frozen: true });
      hud.setOverlay(() => ({ tris: [], quads: [{ element: 'tacmap', texture: 'white', layer: 1, x: 310, y: 230, w: 42, h: 60,
        turn: 0, u0: 0, v0: 0, u1: 1, v1: 1, rgba: [0.2, 0.5, 0.7, 0.5] }] }));
    }
    const results = [];
    const sizes = { ...raw.sizes() }; let drawnSet = 1;
    const phases = [1, 0, 2].flatMap(set => [false, true].map(covered => ({ set, covered, missing: false })));
    phases.push({ set: 0, covered: true, missing: true });
    for (const { set, covered, missing } of phases) {
      if (missing) {
        const names = RETICLE_SETS[set]!;
        delete bitmaps.sets![names.fixed]; delete bitmaps.sets![names.floating!];
        delete sizes[names.fixed]; delete sizes[names.floating!];
      }
      raw.setVisible(covered); overlay.setVisible(covered);
      const sight = { visible: true, aim: [0.47, 0.53] as [number, number], size: 15.5, offset: [2.5, -3.5] as [number, number], set };
      current.setSet(set); current.setAimPoint(...sight.aim); current.setSize(sight.size, sight.offset);
      app.render(new Scene(), new OrthographicCamera()); current.render(app.renderer); overlay.render(app.renderer);
      const expected = new Uint8Array(640 * 448 * 4), actual = new Uint8Array(expected.length);
      canvas.getContext('webgl2')!.readPixels(0, 0, 640, 448, gl.RGBA, gl.UNSIGNED_BYTE, expected);
      gl.colorMask(true, true, true, true); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      drawnSet = reticleDrawSet(set, drawnSet, sizes);
      raw.render(640, 448, 0, reticleQuads({ width: 640, height: 448 }, { ...sight, set: drawnSet }, sizes));
      gl.readPixels(0, 0, 640, 448, gl.RGBA, gl.UNSIGNED_BYTE, actual);
      let differences = 0, maximum = 0, lit = 0;
      for (let i = 0; i < actual.length; i++) if (i % 4 !== 3) {
        const delta = Math.abs(actual[i]! - expected[i]!); if (delta) differences++; maximum = Math.max(maximum, delta);
        if (actual[i]! > 10) lit++;
      }
      results.push({ set, covered, missing, differences, maximum, lit });
    }
    const stats = { ...raw.stats }; raw.dispose();
    return { results, stats, remainingPayload: budget.current };
  } finally { raw.dispose(); current.setBitmaps(null); overlay.dispose(); await app.renderer.dispose(); canvas.remove(); rawCanvas.remove(); }
}

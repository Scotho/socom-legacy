import { Scene, PerspectiveCamera } from 'three';
import { createRenderer } from '../src/renderer';
import { setTrueColourScale } from '../src/trueColourScale';
import { blindWash, WhiteOut } from '../src/flash';

/** An uncovered world pixel must receive the same wash as fog, then restore after the blind. */
export async function measureClear() {
  const canvas = document.createElement('canvas'); document.body.append(canvas);
  const app = await createRenderer(canvas); app.resize(640, 448); app.setPixelRatio(1);
  app.setClearColor([7, 7, 12]);
  const scene = new Scene(), camera = new PerspectiveCamera();
  const gl = canvas.getContext('webgl2')!;
  const read = () => {
    app.render(scene, camera);
    const p = new Uint8Array(4); gl.readPixels(10, 10, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
    return { rgb: [...p.slice(0, 3)], error: gl.getError() };
  };
  try {
    const results = [];
    for (const mode of ['native', 'ps2'] as const) {
      app.setPresentation(mode); setTrueColourScale(null); app.setGlow({ passes: 0, fix: 0 });
      const normal = read();
      setTrueColourScale(blindWash(3, 1));
      const wash = read();
      const repeatedWash = read();
      app.setClearColor([20, 30, 40]); const changedBase = read();
      app.setClearColor([7, 7, 12]);
      app.setGlow({ passes: 3, fix: 255 }); const flash = read();
      setTrueColourScale(null); app.setGlow({ passes: 0, fix: 0 }); const restored = read();
      results.push({ mode, normal, wash, repeatedWash, changedBase, flash, restored });
    }
    return results;
  } finally { setTrueColourScale(null); await app.renderer.dispose(); canvas.remove(); }
}

/** Audit the complete envelope through the real renderer, including saturated frames and recovery. */
export async function measureEnvelope() {
  const canvas = document.createElement('canvas'); document.body.append(canvas);
  const app = await createRenderer(canvas); app.resize(640, 448); app.setPixelRatio(1);
  app.setClearColor([7, 7, 12]);
  const scene = new Scene(), camera = new PerspectiveCamera(), blind = new WhiteOut();
  const gl = canvas.getContext('webgl2')!;
  const rows = [];
  try {
    for (const mode of ['native', 'ps2'] as const) {
      app.setPresentation(mode);
      for (const level of [1, 2, 3] as const) {
        blind.stop(); blind.start(level);
        let previous = 0;
        // Source key boundaries plus intermediate fade samples; times are seconds from detonation.
        const tail = level === 1 ? [0.7, 1.2, 1.7, 2, 2.1, 2.2, 2.25]
          : level === 2 ? [1.5, 1.7, 2.2, 2.7, 3.2, 3.7, 4, 4.1, 4.2, 4.25]
          : [8, 8.2, 8.45, 8.7, 8.95, 9.2, 9.45, 9.7, 9.95, 10, 10.1, 10.2, 10.25];
        const samples = [];
        for (const t of [0, 0.05, 0.1, 0.15, 0.2, ...tail]) {
          blind.update(t - previous); previous = t;
          app.setGlow(blind.glow()); app.render(scene, camera);
          const p = new Uint8Array(4); gl.readPixels(10, 10, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
          samples.push({ t, rgb: [...p.slice(0, 3)], error: gl.getError(), state: blind.state() });
        }
        rows.push({ mode, level, samples });
      }
    }
    return rows;
  } finally { blind.stop(); await app.renderer.dispose(); canvas.remove(); }
}


import type { PayloadBudget } from '../src/xboxPrototype/budget';
import type { ArenaInput, ArenaTarget } from '../src/xboxPrototype/bufferArena';

/** Browser-test baseline: the per-view allocation policy from raw.ts at f01a4bf13.
 * Playwright substitutes this module only for its separate-buffer comparison run.
 * Not a production fallback or a setting. Shader, assets, camera and frame stay identical.
 */
export async function uploadBufferArena(gl: WebGL2RenderingContext, budget: PayloadBudget, inputs: readonly ArenaInput[]) {
  const locations = new Map<ArrayBufferView, WebGLBuffer>(), releases: (() => void)[] = [];
  let payloadBytes = 0, disposed = false;
  const dispose = () => { if (disposed) return; disposed = true; for (const release of releases.reverse()) release(); locations.clear(); };
  const targetEnum = (target: ArenaTarget) => target === 'index' ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;
  try {
    for (const { data, target } of inputs) {
      if (locations.has(data)) continue;
      const release = budget.reserve(data.byteLength), buffer = gl.createBuffer();
      if (!buffer) { release(); throw new Error('Baseline buffer allocation failed'); }
      releases.push(() => { gl.deleteBuffer(buffer); release(); }); locations.set(data, buffer);
      gl.bindBuffer(targetEnum(target), buffer); gl.bufferData(targetEnum(target), data, gl.STATIC_DRAW);
      payloadBytes += data.byteLength;
      if (gl.getError() !== gl.NO_ERROR) throw new Error('Baseline buffer upload failed');
    }
    return { buffers: locations.size, sourceRanges: locations.size, payloadBytes,
      bind(data: ArrayBufferView, target: ArenaTarget) {
        const buffer = locations.get(data); if (!buffer) throw new Error('Unknown baseline view');
        gl.bindBuffer(targetEnum(target), buffer); return 0;
      },
      /** A later write into one view's own buffer (the arena's `writer`, which the renderer's world placements use). */
      writer(data: ArrayBufferView, target: ArenaTarget) {
        const buffer = locations.get(data); if (!buffer) throw new Error('Unknown baseline view');
        return (byteOffset: number, next: ArrayBufferView) => { gl.bindBuffer(targetEnum(target), buffer); gl.bufferSubData(targetEnum(target), byteOffset, next); };
      },
      finishBindings: () => locations.clear(), dispose,
    };
  } catch (error) { dispose(); throw error; }
}

import type { UiDrawItem } from '@s2u/ui';
import { CpuUiPresenter } from '../src/uiPresenter';
import { UiGpuSurfacePresenter, type UiGpuSurfaceCanvas, type UiGpuSurfaceStats } from '../src/uiGpuPresenter';
import { UiGpuSwitch } from '../src/uiGpuSwitch';
import { uiGpuLoseProbe, type UiGpuLoseProbeKind } from './uiGpuLoseProbe';

/**
 * GM-12a (the GPU menus plan, row GM-12a; product track, a test instrument -- never shipped, nothing of the game
 * changed): the loss harness page, `/?uiGpuLoss`. `./uiGpuLoss.spec.ts` serves it in place of the app (a routed document
 * whose module script imports this file), so the page holds one GPU canvas, one 2D canvas and one
 * `UiGpuSurfacePresenter` between them, and nothing else of the app runs. The hook (`window.__uiGpuLoss`) drives a frame
 * a `requestAnimationFrame` apart -- the context events arrive on the browser's own tasks -- and forces a loss with
 * `WEBGL_lose_context` (the browser's own simulated loss: the same events as a real one). Every answer carries the
 * surface's counters, the switch's read-out and the times, never only a verdict.
 */

export const UI_GPU_LOSS_HOOK = '__uiGpuLoss';

/** One frame's account: which canvas drew it, at what size, whether the shown canvas holds anything but black. */
export interface UiGpuLossFrame { path: 'gpu' | 'software' | null; state: string; width: number; height: number; litPixels: number }

export interface UiGpuLossReadout { stats: UiGpuSurfaceStats; contexts: number; kills: { reason: string; surface: string | null }[]; levels: Record<string, number> }

export interface UiGpuLossHarness {
  ready: true;
  /**
   * GM-11b box fold: `WEBGL_lose_context` on the GPU canvas's context (`./uiGpuLoseProbe.ts`): `ok` (the object kept --
   * a lost context gives none, so `restoreContext` goes through the object taken live), `absent` (a live context without
   * it: the only skip), `no-context` or `lost` (failures, review F1). Makes the surface's context first.
   */
  loseProbe(): UiGpuLoseProbeKind;
  /** `frames` frames at `scale`, a frame apart; each one's account. */
  run(frames: number, scale: number): Promise<UiGpuLossFrame[]>;
  /** `WEBGL_lose_context.loseContext()` (a simulated loss, its events on the browser's tasks). */
  lose(): void;
  /** `WEBGL_lose_context.restoreContext()`, and the ms until the surface draws on the GPU again (frames at `scale` meanwhile). */
  restoreAndWait(scale: number, maxFrames: number): Promise<{ ms: number | null; frames: UiGpuLossFrame[] }>;
  /** The match's `leave` and `returned`, as the front end calls them. */
  leave(): void;
  returned(): void;
  readout(): UiGpuLossReadout;
}

const frameItems = (k: number): UiDrawItem[] => [{ kind: 'clear', rgb: [40 + (k % 8), 80, 120] }];
const nextFrame = (): Promise<number> => new Promise((r) => requestAnimationFrame(r));

/** Pixels of the frame on `canvas` that are not black (a 2D canvas read; a GPU canvas drawn into the 2D one first). */
function lit(canvas: HTMLCanvasElement): number {
  const probe = document.createElement('canvas');
  probe.width = canvas.width; probe.height = canvas.height;
  const ctx = probe.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(canvas, 0, 0);
  const d = ctx.getImageData(0, 0, probe.width, probe.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i]! | d[i + 1]! | d[i + 2]!) n++;
  return n;
}

export function installUiGpuLossHarness(root: HTMLElement = document.body): UiGpuLossHarness {
  const gpuCanvas = document.createElement('canvas');
  const swCanvas = document.createElement('canvas');
  root.append(gpuCanvas, swCanvas);
  const ctx = swCanvas.getContext('2d')!;
  const swi = new UiGpuSwitch({ search: location.search, storage: () => null, devTools: true });
  const software = new CpuUiPresenter(ctx, {
    fit: (w, h) => { if (swCanvas.width !== w) swCanvas.width = w; if (swCanvas.height !== h) swCanvas.height = h; },
  });
  const surface = new UiGpuSurfacePresenter({
    canvas: gpuCanvas as unknown as UiGpuSurfaceCanvas, software, transparent: false, surface: 'front', host: swi,
    allowSoftwareAdapter: true,                    // the box's renderers are software adapters (SwiftShader, llvmpipe)
    clock: { now: () => performance.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as number) },
    log: (l) => console.warn(l),
  });
  let k = 0;
  const one = (scale: number): UiGpuLossFrame => {
    const out = surface.present(frameItems(k++), () => null, { scale });
    const path = surface.lastPath;
    return { path, state: surface.state, width: out.width, height: out.height, litPixels: lit(path === 'gpu' ? gpuCanvas : swCanvas) };
  };
  // GM-11b box fold: the extension taken once, on the live context, and kept. The box at 5650fe4fc asked for it again
  // after the loss and got null (a lost context gives no extension): "no WEBGL_lose_context" at `restoreAndWait`,
  // though the same run's `lose` had just used it -- the harness's error, not the renderer's.
  type LoseExt = { loseContext(): void; restoreContext(): void };
  let kept: { kind: UiGpuLoseProbeKind; ext: LoseExt | null } | null = null;
  const probe = (): { kind: UiGpuLoseProbeKind; ext: LoseExt | null } => {
    if (kept?.kind === 'ok' || kept?.kind === 'absent') return kept;   // a live context's answer is kept
    surface.create();
    kept = uiGpuLoseProbe<LoseExt>(gpuCanvas.getContext('webgl2'));
    return kept;
  };
  const loseExt = (): LoseExt => {
    const p = probe();
    if (!p.ext) throw new Error(`no WEBGL_lose_context to use (${p.kind})`);
    return p.ext;
  };
  const harness: UiGpuLossHarness = {
    ready: true,
    loseProbe() { return probe().kind; },
    async run(frames, scale) {
      const out: UiGpuLossFrame[] = [];
      for (let i = 0; i < frames; i++) { await nextFrame(); out.push(one(scale)); }
      return out;
    },
    lose() { loseExt().loseContext(); },
    async restoreAndWait(scale, maxFrames) {
      const t0 = performance.now();
      loseExt().restoreContext();
      const frames: UiGpuLossFrame[] = [];
      for (let i = 0; i < maxFrames; i++) {
        await nextFrame();
        const f = one(scale);
        frames.push(f);
        if (f.path === 'gpu') return { ms: performance.now() - t0, frames };
      }
      return { ms: null, frames };
    },
    leave() { surface.release(); },
    returned() { surface.returned(); },
    readout() {
      const r = swi.readout();
      return { stats: surface.stats, contexts: r.contexts, kills: r.kills.map((x) => ({ ...x })), levels: { ...r.levels } };
    },
  };
  (window as unknown as Record<string, unknown>)[UI_GPU_LOSS_HOOK] = harness;
  return harness;
}

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { DeviceClass } from '../src/deviceClass';
import { gpuSurfaceAllowed, UI_GPU_XBOX_ONE_CONTEXT_ADAPTATION, uiGpuSurfaceWiring } from '../src/uiGpuSurfaceMount';
import { UI_GPU_SURFACES } from '../src/uiGpuSwitch';

// GM-XBOX1 (the GPU menus plan's Log, 2026-11-10; research 380 §5; PRODUCT TRACK, a browser adaptation with no original):
// the shadow PC's Xbox GPU trace (mega 7cd782a5f against v0.4.17, the Xbox preset) found the loading screen's GPU surface
// (GM-23) live beside the match's WebGL context through the load -- two live contexts at READY where v0.4.17 held one --
// and the in-match Settings overlay's (GM-19a) a second beside the match's at its first open. On the Xbox device class
// the page withholds both surfaces' GPU option and hands each the 1x HD option with it (review F1: the menus' HD pack is
// not refused on Xbox in this tree, so a withheld surface's software would otherwise raster the pack's scale), so each
// draws the original 640 x 448 frame with no GPU canvas and no context, as v0.4.17's; the front end keeps its surface
// (released at `leave`, before the match's context). Evidence kind: unit tests (the helpers' tables) and source
// inspection (the page builds both options through `uiGpuSurfaceWiring`); the surfaces' behaviour under a 4x pack is in
// `loadingPanelGpu.test.ts` and `nativeSettingsGpu.test.ts` ("GM-XBOX1"). No browser ran, no Xbox.

const CLASSES: readonly DeviceClass[] = ['xbox', 'software', 'touch', 'lowMemory', 'standard', 'high'];
const src = (f: string): string => readFileSync(resolve(import.meta.dirname, '../src', f), 'utf8');

describe('GM-XBOX1: gpuSurfaceAllowed, the surfaces the page hands a GPU option by device class', () => {
  it('the adaptation names the loading screen and the overlay, both real surfaces', () => {
    expect([...UI_GPU_XBOX_ONE_CONTEXT_ADAPTATION].sort()).toEqual(['loading', 'overlay']);
    for (const s of UI_GPU_XBOX_ONE_CONTEXT_ADAPTATION) expect(UI_GPU_SURFACES).toContain(s);
    expect(Object.isFrozen(UI_GPU_XBOX_ONE_CONTEXT_ADAPTATION)).toBe(true);
  });

  it('the table: on xbox the front end and the ARMORY keep their surfaces, the loading screen and the overlay do not; every other class keeps all four', () => {
    const table = Object.fromEntries(CLASSES.map((c) => [c, Object.fromEntries(UI_GPU_SURFACES.map((s) => [s, gpuSurfaceAllowed(s, c)]))]));
    expect(table).toEqual({
      xbox: { front: true, armory: true, overlay: false, loading: false },
      software: { front: true, armory: true, overlay: true, loading: true },
      touch: { front: true, armory: true, overlay: true, loading: true },
      lowMemory: { front: true, armory: true, overlay: true, loading: true },
      standard: { front: true, armory: true, overlay: true, loading: true },
      high: { front: true, armory: true, overlay: true, loading: true },
    });
  });
});

describe('GM-XBOX1 review F1: uiGpuSurfaceWiring decides a surface\'s HD and GPU options together', () => {
  const HD4 = (): { scale: number } => ({ scale: 4 });

  it('withheld (xbox, loading or overlay): no GPU option, its factory never called, and the HD option answers scale 1 whatever the pack\'s', () => {
    for (const surface of ['loading', 'overlay'] as const) {
      const gpu = vi.fn(() => ({ made: true }));
      const w = uiGpuSurfaceWiring(surface, 'xbox', HD4, gpu);
      expect(w.gpu).toBeUndefined();
      expect(gpu).not.toHaveBeenCalled();
      expect(w.hd).not.toBe(HD4);
      expect(w.hd()).toEqual({ scale: 1 });
      // The test room's overlay has no HD option of its own: withheld, it is handed the 1x one (the same 640 x 448 frame).
      const none = uiGpuSurfaceWiring(surface, 'xbox', undefined, gpu);
      expect(none.gpu).toBeUndefined();
      expect(typeof none.hd === 'function' ? none.hd() : none.hd).toEqual({ scale: 1 });
    }
  });

  it('allowed (every other class or surface): the caller\'s HD option itself and its GPU option, made once', () => {
    for (const cls of CLASSES) {
      for (const surface of UI_GPU_SURFACES) {
        if (!gpuSurfaceAllowed(surface, cls)) continue;
        const option = { made: true };
        const gpu = vi.fn(() => option);
        const w = uiGpuSurfaceWiring(surface, cls, HD4, gpu);
        expect(w.hd, `${cls}/${surface}`).toBe(HD4);
        expect(w.gpu, `${cls}/${surface}`).toBe(option);
        expect(gpu).toHaveBeenCalledTimes(1);
        expect(uiGpuSurfaceWiring(surface, cls, undefined, gpu).hd).toBeUndefined();
      }
    }
  });
});

describe('GM-XBOX1: the page builds the loading screen\'s and the overlays\' options through uiGpuSurfaceWiring (source inspection)', () => {
  it('`./frontEnd`: the loading panel\'s and the match overlay\'s HD and GPU options both come from it; the front end\'s own surface is not gated', () => {
    const fe = src('frontEnd.ts');
    expect(fe).toMatch(/^import \{ uiGpuSurfaceLoader, uiGpuSurfaceWiring \} from '\.\/uiGpuSurfaceMount';$/m);
    expect(fe).toMatch(/\(\(w\) => new LoadingPanel\(doc, w\.hd, w\.gpu\)\)\(uiGpuSurfaceWiring\('loading', pageDeviceClass\(\), \(\) => hdMenus\?\.options\(\) \?\? \{ scale: 1 \}, \(\) => \(\{ resolveAt: \(s: number\) => uiGpu\.resolve\('loading', s\), [^\n]*\}\)\)\)\);/);
    expect(fe).toMatch(/new NativeSettings\(\{ doc, load: [^\n]*?, \.\.\.uiGpuSurfaceWiring\('overlay', pageDeviceClass\(\), \(\) => hdMenus\?\.options\(\) \?\? \{ scale: 1 \}, \(\) => \(\{ resolveAt: \(s: number\) => uiGpu\.resolve\('overlay', s\), [^\n]*\}\)\) \}\) : undefined;/);
    // Neither construction hands an HD or GPU option of its own beside the helper's (review F1: they cannot drift).
    expect(fe).not.toMatch(/new LoadingPanel\(doc, \(\) =>/);
    expect(fe).not.toMatch(/new NativeSettings\(\{ doc, load: [^\n]*?, (hd|gpu): /);
    // Each surface's loader is made only inside its wiring, and no other surface is wired.
    expect(fe.match(/uiGpuSurfaceLoader\(\{ surface: '(loading|overlay)'/g)).toHaveLength(2);
    expect(fe.match(/uiGpuSurfaceWiring\('[a-z]+'/g)).toEqual(["uiGpuSurfaceWiring('loading'", "uiGpuSurfaceWiring('overlay'"]);
  });

  it('`./main`: the test room\'s overlay option comes from it, with the device class read from `./deviceClass`', () => {
    const main = src('main.ts');
    expect(main).toMatch(/^import \{ uiGpuSurfaceLoader, uiGpuSurfaceWiring \} from '\.\/uiGpuSurfaceMount';$/m);
    expect(main).toMatch(/^import \{ pageDeviceClass \} from '\.\/deviceClass';$/m);
    const at = main.indexOf('const nativeSettings = new NativeSettings(');
    const ctor = main.slice(at, main.indexOf("globalThis.addEventListener?.('pagehide'", at));
    expect(ctor).toMatch(/\}, \.\.\.uiGpuSurfaceWiring\('overlay', pageDeviceClass\(\), undefined, \(\) => \(\{ resolveAt: \(\) => pageUiGpuSwitch\(\)\.resolveTestRoomOverlay\(\), [^\n]*\}\)\) \}\);/);
    expect(ctor).not.toMatch(/\b(hd|gpu): /);
  });

  it('the helpers stay type-only on the device class: the mount module adds no value import (the GPU modules\' static graph, GM.R15)', () => {
    expect(src('uiGpuSurfaceMount.ts')).toMatch(/^import type \{ DeviceClass \} from '\.\/deviceClass';$/m);
    expect(src('uiGpuSurfaceMount.ts')).not.toMatch(/^import \{[^}]*\} from '\.\/deviceClass';$/m);
  });
});

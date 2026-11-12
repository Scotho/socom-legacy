// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import type { LoadedMap } from '../../src/loadMap';
import { RENDER_SCALES, renderCapFor, VIDEO_SETTINGS_KEY, videoSettingsKeeper, type RenderScale } from '../../src/videoSettings';
import { freshSavesDb } from './fakeSaves';

/**
 * FP-2 (FP.R5; product track, a browser adaptation -- FG.R2: the game has no editor): the Forge editor's viewport draws
 * at the player's RENDER SCALE, the one stored value the launcher, VIDEO OPTIONS and matches read (`../../src/videoSettings`
 * `videoSettingsKeeper`, CPS.R7), wired as `../../src/matchMount` wires a match: `fit` caps the ratio at `renderCapFor`
 * for the viewport's box, `AdaptiveRatio` starts the renderer at the cap and trades under it each frame, held under
 * the PS2 picture. Mounted as `pageCamera.test.ts` mounts the page (only the GPU and disc I/O replaced); the renderer's
 * pixel ratio faked as `../matchMount.test.ts` fakes it, starting at `../../src/renderer`'s `min(devicePixelRatio, 2)`.
 */

const ratio = vi.hoisted(() => ({ now: 0, set: [] as number[] }));
vi.mock('../../src/renderer', () => ({ createRenderer: async () => ({
  backend: 'webgl2', resize: () => undefined, presentation: () => 'native', render: () => undefined,
  setPresentation: () => undefined, setClearColor: () => undefined,
  setPixelRatio: (r: number) => { ratio.set.push(r); ratio.now = r; }, pixelRatio: () => ratio.now,
}) }));
const archiveLoad = vi.hoisted(() => vi.fn<(stem: string) => Promise<LoadedMap>>());
vi.mock('../../src/forge/archives', () => ({ Archives: class {
  onProgress = null;
  clips = async () => null;
  list = async () => ({ entries: [], problems: [] });
  load = archiveLoad;
  sourceRequest = () => ({ kind: 'http', baseUrl: '/maps' });
}, labelOf: (_entries: unknown, _stem: string, fallback: string) => fallback }));

/** The test's device and the viewport's CSS box: tall enough that Balanced and Performance meet their height caps. */
const DPR = 2, BOX_W = 2400, BOX_H = 1800;
const capOf = (preset: RenderScale): number => renderCapFor(preset, DPR, false, BOX_W, BOX_H).ratioCap;

describe('FP-2: the mounted Forge viewport draws at the player\'s render scale (FP.R5)', () => {
  let queued: FrameRequestCallback[] = [];
  let clock = 0;
  /** One frame of the page at `ms` after the last: every callback asked for. */
  const frame = (ms = 1000 / 60): void => { clock += ms; for (const cb of queued.splice(0)) cb(clock); };
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    queued = []; clock = performance.now();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { queued.push(cb); return queued.length; });
    vi.stubGlobal('devicePixelRatio', DPR);
    // The stylesheet is not applied under jsdom: the viewport reads as positioned (so `fit` runs at once) with its box.
    const real = window.getComputedStyle.bind(window);
    vi.stubGlobal('getComputedStyle', (e: Element) => (e.classList?.contains('fx-viewport') ? ({ position: 'relative' } as CSSStyleDeclaration) : real(e)));
    for (const [k, v] of [['clientWidth', BOX_W], ['clientHeight', BOX_H]] as const) {
      Object.defineProperty(HTMLElement.prototype, k, { configurable: true, get(this: HTMLElement) { return this.classList.contains('fx-viewport') ? v : 0; } });
    }
    ratio.now = Math.min(DPR, 2); ratio.set = [];
    history.replaceState(null, '', '/forge?floor');
    localStorage.clear();
    freshSavesDb();
    archiveLoad.mockReset().mockRejectedValue(new Error('No disc supplied'));
  });
  afterEach(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    for (const k of ['clientWidth', 'clientHeight'] as const) delete (HTMLElement.prototype as Partial<Record<typeof k, number>>)[k];   // jsdom's own: on Element
    vi.unstubAllGlobals();
  });

  async function mounted(): Promise<ForgeAgentApi> {
    const { mountForge } = await import('../../src/forge/page');
    let api!: ForgeAgentApi;
    await mountForge(document, { onAgentReady: (a) => { api = a; } });
    return api;
  }

  it.each(RENDER_SCALES)('the stored preset %s gives the renderer renderCapFor\'s cap at the mount', async (preset) => {
    localStorage.setItem(VIDEO_SETTINGS_KEY, JSON.stringify({ renderScale: preset, shadows: true }));
    await mounted();
    expect(ratio.now).toBe(capOf(preset));
    expect(new Set(RENDER_SCALES.map(capOf)).size, 'the three presets differ at this device and box').toBe(3);
  }, 90_000);

  it('a render scale set after the mount moves the cap at the next tick; the PS2 picture holds the ratio', async () => {
    await mounted();
    expect(ratio.now).toBe(capOf('balanced'));                                  // nothing stored: CPS.R7's default
    videoSettingsKeeper().set({ renderScale: 'quality' });                       // the launcher's or VIDEO OPTIONS' step
    expect(ratio.now, 'not before the tick').toBe(capOf('balanced'));           // FP-2 review 2: met at the tick, not at the set
    frame(250);
    expect(ratio.now).toBe(capOf('quality'));
    videoSettingsKeeper().set({ renderScale: 'performance' });
    expect(ratio.now, 'not before the tick').toBe(capOf('quality'));
    frame(250);
    expect(ratio.now).toBe(capOf('performance'));
    videoSettingsKeeper().set({ renderScale: 'quality' });
    frame(250);
    expect(ratio.now).toBe(capOf('quality'));
    // The PS2 picture on: long frames for 4 s leave the ratio where it is (`AdaptiveRatio.frame`'s hold).
    const ps2 = document.querySelector<HTMLInputElement>('input[aria-label="PS2 picture (640×448)"]')!;
    ps2.checked = true;
    ps2.dispatchEvent(new Event('change'));
    const held = ratio.set.length;
    for (let i = 0; i < 40; i++) frame(100);
    expect(ratio.set.length).toBe(held);
    expect(ratio.now).toBe(capOf('quality'));
    // Off again, the same long frames trade pixels for frames: the hold, not the frames, kept it.
    ps2.checked = false;
    ps2.dispatchEvent(new Event('change'));
    for (let i = 0; i < 40; i++) frame(100);
    expect(ratio.now).toBeLessThan(capOf('quality'));
  }, 90_000);
});

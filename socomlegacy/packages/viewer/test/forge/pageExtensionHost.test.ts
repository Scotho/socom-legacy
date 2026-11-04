// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXTENSION_CODES, HANDLER_SLOTS, type PackRef } from '@s2u/creator-contracts';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import type { VisualSystem } from '../../src/packs/systems/host';
import type { ForgePanel } from '../../src/forge/shell/panel';
import type { ForgePanelContext } from '../../src/forge/shell/context';
import type { LoadedMap } from '../../src/loadMap';
import { VISUAL_TINT_PASS } from '../../src/packs/systems/visualTint';
import { freshSavesDb } from './fakeSaves';

/**
 * R7-2 (owed by FCW-07b-2; product track, a browser adaptation with no original -- the forge's extension host is the
 * port's own): the mounted Forge composes the extension host once its renderer is made -- the renderer's one seam
 * (`visualPostSeams`) and the page's one engine handler (`visualTintHandler`) -- and hands it to a panel as
 * `ctx.host`, so FCW-08's registrant reaches `catalogue()` and `register`. Nothing registers a system by itself: its
 * status is empty. The page's teardown disposes it: every later call answers HOST_DISPOSED. The renderer here is the
 * test's stand-in, bound to a real post slot as `createRenderer` binds its own.
 */

vi.mock('../../src/renderer', async () => {
  const { bindVisualPostSeam, createPostSlot } = await import('../../src/visualPostSeam');
  return { createRenderer: async () => {
    const renderer = {
      backend: 'webgl2', resize: () => undefined, presentation: () => 'native', render: () => undefined,
      setPresentation: () => undefined, setClearColor: () => undefined,
    };
    bindVisualPostSeam(renderer as never, createPostSlot(() => ({ presentation: 'native' })));
    return renderer;
  } };
});
const archiveLoad = vi.hoisted(() => vi.fn<(stem: string) => Promise<LoadedMap>>());
const archiveEntries = vi.hoisted(() => [] as { stem: string; path: string; label: string; campaign: boolean }[]);
vi.mock('../../src/forge/archives', () => ({ Archives: class {
  onProgress = null;
  clips = async () => null;
  list = async () => ({ entries: archiveEntries, problems: [] });
  load = archiveLoad;
  sourceRequest = () => ({ kind: 'http', baseUrl: '/maps' });
}, labelOf: (_entries: unknown, _stem: string, fallback: string) => fallback }));

const PACK: PackRef = { id: 'r7.tint', version: '1.0.0', hash: 'e'.repeat(64) };

describe('R7-2: the mounted Forge composes the extension host and hands it to a panel', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', () => 0);
    freshSavesDb();
    history.replaceState(null, '', '/forge?floor');
    localStorage.clear();
    archiveLoad.mockReset().mockRejectedValue(new Error('No disc supplied'));
    archiveEntries.length = 0;
  });
  afterEach(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); vi.unstubAllGlobals(); });

  async function mount(): Promise<ForgePanelContext> {
    const { mountForge } = await import('../../src/forge/page');
    let ctx: ForgePanelContext | null = null;
    const probe: ForgePanel = { id: 'probe', title: 'Probe', dock: 'right', order: 70, defaultOpen: false, padLegend: [],
      mount: (_host, c) => { ctx = c; return { dispose: () => undefined }; } };
    await mountForge(document, { panels: [probe] });
    await vi.waitFor(() => expect(ctx).not.toBeNull());
    return ctx as unknown as ForgePanelContext;
  }

  it('ctx.host: the catalogue lists visual.post and the tint handler; nothing is registered; a claim reaches the seam', async () => {
    const ctx = await mount();
    const host = ctx.host;
    expect(host, 'ctx.host').toBeDefined();
    const catalogue = host!.catalogue();
    expect(catalogue.slots).toEqual(HANDLER_SLOTS);
    expect(catalogue.slots.map((s) => s.id)).toContain('visual.post');
    expect(catalogue.handlers.map((h) => [h.id, h.slot])).toEqual([[VISUAL_TINT_PASS, 'visual.post']]);
    expect(host!.status()).toEqual([]);
    // The renderer's seam is the host's: a claim on the slot registers (the seam is there), and nothing is installed by it.
    const reg = host!.register(PACK, { slot: 'visual.post', handler: VISUAL_TINT_PASS }, () => ({
      install: () => undefined, enable: () => undefined, disable: () => undefined, dispose: () => undefined,
    }));
    expect(Array.isArray(reg), JSON.stringify(reg)).toBe(false);
    expect(host!.status().map((s) => s.state)).toEqual(['registered']);
    expect(await host!.unregister(`${PACK.id}/visual.post`)).toMatchObject({ ok: true });
    expect(host!.status()).toEqual([]);
  }, 30_000);

  it('the page\'s teardown disposes the host: every later call answers HOST_DISPOSED', async () => {
    const ctx = await mount();
    const host = ctx.host!;
    expect(host).toBeDefined();
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    const refused = host.register(PACK, { slot: 'visual.post', handler: VISUAL_TINT_PASS }, () => ({
      install: () => undefined, enable: () => undefined, disable: () => undefined, dispose: () => undefined,
    }));
    expect(Array.isArray(refused) ? refused.map((d) => d.code) : refused).toEqual([EXTENSION_CODES.hostDisposed]);
    expect((await host.enable(`${PACK.id}/visual.post`)).diagnostics.map((d) => d.code)).toEqual([EXTENSION_CODES.hostDisposed]);
    expect((await host.restore()).diagnostics.map((d) => d.code)).toEqual([EXTENSION_CODES.hostDisposed]);
  }, 30_000);
});

/** A synthetic map (a floor 1000 across) for a base change through the agent's `layout.base`. */
async function syntheticArchive(stem: string): Promise<LoadedMap> {
  const { blankLibraryMap, floorMesh } = await import('../../src/forge/matchMap');
  return { ...blankLibraryMap(stem, 1000), metersPerUnit: 0.1, path: `synthetic/${stem}`, name: stem, world: [floorMesh(1000)], props: [] };
}

/**
 * LATER 471 (product track, a browser adaptation with no original): the page schedules the host and ends its systems at a
 * map switch. dot's placement (2026-10-25T21:45Z): `extensions.frame(dt)` once a frame, after the match's early return and
 * before `created.render(scene, fly.camera)`, with the frame's own `dt` in seconds; `onMapSwitch()` at prepareBase's
 * successful synchronous commit, never during the asynchronous preparation (a failed one leaves the systems as they are).
 */
describe('LATER 471: the mounted Forge calls the host\'s frame(dt) and onMapSwitch()', () => {
  let queued: FrameRequestCallback[] = [];
  let clock = 0;
  /** One rendered frame of the page: every callback asked for, at the next 60 Hz instant. */
  const frame = (ms = 1000 / 60): void => { clock += ms; for (const cb of queued.splice(0)) cb(clock); };
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    queued = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { queued.push(cb); return queued.length; });
    freshSavesDb();
    history.replaceState(null, '', '/forge?floor');
    localStorage.clear();
    archiveLoad.mockReset().mockImplementation((stem) => (stem === 'BAD' ? Promise.reject(new Error('unreadable')) : syntheticArchive(stem)));
    archiveEntries.length = 0;
    archiveEntries.push({ stem: 'MP2', path: 'synthetic/MP2', label: 'Frostfire', campaign: false },
      { stem: 'BAD', path: 'synthetic/BAD', label: 'Unreadable', campaign: false });
  });
  afterEach(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); vi.unstubAllGlobals(); });

  async function mounted(): Promise<{ ctx: ForgePanelContext; api: ForgeAgentApi }> {
    const { mountForge } = await import('../../src/forge/page');
    let ctx: ForgePanelContext | null = null;
    let api: ForgeAgentApi | null = null;
    const probe: ForgePanel = { id: 'probe', title: 'Probe', dock: 'right', order: 70, defaultOpen: false, padLegend: [],
      mount: (_host, c) => { ctx = c; return { dispose: () => undefined }; } };
    await mountForge(document, { panels: [probe], onAgentReady: (target) => { api = target; } });
    await vi.waitFor(() => { expect(ctx).not.toBeNull(); expect(api).not.toBeNull(); });
    clock = performance.now();
    return { ctx: ctx as unknown as ForgePanelContext, api: api as unknown as ForgeAgentApi };
  }
  /** A system with every step spied, registered on visual.post and enabled through the page's host. */
  const spiedSystem = () => ({ install: vi.fn(), enable: vi.fn(), disable: vi.fn(), dispose: vi.fn(), frame: vi.fn<(dt: number) => void>() });
  async function enabledSystem(ctx: ForgePanelContext): Promise<ReturnType<typeof spiedSystem>> {
    const sys = spiedSystem();
    const asSystem: VisualSystem = sys;
    const reg = ctx.host!.register(PACK, { slot: 'visual.post', handler: VISUAL_TINT_PASS }, () => asSystem);
    expect(Array.isArray(reg), JSON.stringify(reg)).toBe(false);
    expect(await ctx.host!.enable(`${PACK.id}/visual.post`)).toMatchObject({ ok: true });
    expect(ctx.host!.status().map((s) => s.state)).toEqual(['enabled']);
    return sys;
  }

  it('frame(dt): an enabled system\'s frame runs once a page frame, with the frame\'s dt in seconds', async () => {
    const { ctx } = await mounted();
    const sys = await enabledSystem(ctx);
    expect(sys.frame).not.toHaveBeenCalled();
    frame(); frame(); frame();
    expect(sys.frame).toHaveBeenCalledTimes(3);
    expect(sys.frame.mock.calls[2]![0]).toBeCloseTo(1 / 60, 6);
  }, 30_000);

  it('onMapSwitch(): a base committed ends the enabled system; a base whose preparation fails leaves it running', async () => {
    const { ctx, api } = await mounted();
    const sys = await enabledSystem(ctx);
    // The preparation fails (the archive cannot be read): nothing is committed, the system stays enabled and scheduled.
    const failed = await api.execute('layout.base', { base: { kind: 'map', archive: 'BAD' } }, api.read().revision).catch((e: unknown) => e);
    expect(failed).not.toMatchObject({ ok: true });
    expect(ctx.host!.status().map((s) => s.state)).toEqual(['enabled']);
    expect(sys.disable).not.toHaveBeenCalled();
    expect(sys.dispose).not.toHaveBeenCalled();
    // A base committed: the host's onMapSwitch ended the system (disabled and disposed); its registration stays.
    expect(await api.execute('layout.base', { base: { kind: 'map', archive: 'MP2' } }, api.read().revision)).toMatchObject({ ok: true });
    expect(ctx.host!.status().map((s) => s.state)).toEqual(['disposed']);
    expect(sys.dispose).toHaveBeenCalledOnce();
    frame(); frame();
    expect(sys.frame).not.toHaveBeenCalled();
  }, 30_000);

  it('the placement (source): frame(dt) once, after the match\'s early return, before the render; onMapSwitch in prepareBase\'s commit only', () => {
    const page = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/forge/page.ts'), 'utf8');
    const loopAt = page.indexOf('const frame = (now: number): void => {');
    const loop = page.slice(loopAt, page.indexOf('\n  requestAnimationFrame(frame);\n', loopAt));
    expect(loopAt).toBeGreaterThan(0);
    expect(page.split('extensions?.frame(').length - 1).toBe(1);
    const call = loop.indexOf('extensions?.frame(dt);');
    expect(call).toBeGreaterThan(loop.indexOf('if (match) {'));
    expect(call).toBeGreaterThan(loop.indexOf('return;', loop.indexOf('if (match) {')));
    expect(call).toBeLessThan(loop.indexOf('created.render(scene, fly.camera);'));
    expect(page.split('extensions?.onMapSwitch(').length - 1).toBe(1);
    const prepareAt = page.indexOf('const prepareBase = async (b: LayoutBase) => {');
    const commitAt = page.indexOf('commit: (): void => {', prepareAt);
    const switchAt = page.indexOf('extensions?.onMapSwitch();');
    expect(prepareAt).toBeGreaterThan(0);
    expect(switchAt).toBeGreaterThan(commitAt);
    expect(switchAt).toBeLessThan(page.indexOf('const setBase = async', prepareAt));
  });
});

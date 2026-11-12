// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import * as shellState from '../../src/forge/shell/state';
import type { LoadedMap } from '../../src/loadMap';
import { freshSavesDb } from './fakeSaves';

/**
 * LATER 819 (product track, a browser adaptation with no original -- the game has no editor): a Saves card press (Save as,
 * Download, Share link) while the page is busy is refused -- the layout is half placed -- but in the words of what holds
 * it: an undo or a redo being put back, a Walk or a Play starting, a lobby's match starting, a lobby being made. "The
 * Forge is loading" stays the words of an open (the boot's first, `pageFirstOpen.test.ts` (A)). Before, every cause said
 * the loading words. The page is mounted as `pagePanels.test.ts` mounts it; IndexedDB is `fake-indexeddb`.
 */

vi.mock('../../src/renderer', () => ({ createRenderer: async () => ({
  backend: 'webgl2', resize: () => undefined, presentation: () => 'native', render: () => undefined,
  setPresentation: () => undefined, setClearColor: () => undefined,
}) }));
const archiveLoad = vi.hoisted(() => vi.fn<(stem: string) => Promise<LoadedMap>>());
const archiveEntries = vi.hoisted(() => [] as { stem: string; path: string; label: string; campaign: boolean }[]);
vi.mock('../../src/forge/archives', () => ({ Archives: class {
  onProgress = null;
  clips = async () => null;
  list = async () => ({ entries: archiveEntries, problems: [] });
  load = archiveLoad;
  sourceRequest = () => ({ kind: 'http', baseUrl: '/maps' });
}, labelOf: (_entries: unknown, _stem: string, fallback: string) => fallback }));

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
/** A synthetic archive: a floor and a crate prop on it. */
async function syntheticArchive(stem: string): Promise<LoadedMap> {
  const { blankLibraryMap, floorMesh } = await import('../../src/forge/matchMap');
  return {
    ...blankLibraryMap(stem, 1000), path: `synthetic/${stem}`, name: stem, world: [floorMesh(1000)],
    props: [{ modelName: 'crate', parts: [floorMesh(4)], matrices: IDENTITY.slice(), order: 0, alternate: false, facade: 0, lod: null, paths: ['world/crate'] }],
  } as unknown as LoadedMap;
}

const statusLine = (): string => document.querySelector('.fx-status-msg')?.textContent ?? '';
const saveAsButton = (): HTMLButtonElement | undefined =>
  [...document.querySelectorAll<HTMLButtonElement>('.fx-modal .fx-saves footer button')].find((b) => b.textContent === 'Save as');
const promptHeading = (): string | null => document.querySelector('.fx-modal form.fx-card h2')?.textContent ?? null;

describe('LATER 819: the busy refusal names what holds the page', () => {
  it('each cause has its own words; an open keeps "The Forge is loading"', () => {
    const words = (shellState as unknown as { forgeBusyRefusal?: (cause: string) => string }).forgeBusyRefusal;
    expect(typeof words, 'shell/state exports forgeBusyRefusal').toBe('function');
    expect(words!('open')).toBe('The Forge is loading');
    expect(words!('open')).toBe(shellState.FORGE_REFUSALS.busy);
    expect(words!('undo')).toBe('An undo or redo is still placing the layout');
    expect(words!('walk')).toBe('Walk is starting');
    expect(words!('play')).toBe('Play is starting');
    expect(words!('lobbyMatch')).toBe('The lobby’s match is starting');
    expect(words!('lobby')).toBe('The lobby is being made');
    const all = ['open', 'undo', 'walk', 'play', 'lobbyMatch', 'lobby'].map((c) => words!(c));
    expect(new Set(all).size, 'no two causes share words').toBe(all.length);
  });
});

describe('LATER 819: on the mounted page, Save as during an undo says the undo, not the loading words', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', () => 0);
    if (!('scrollIntoView' in Element.prototype)) Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: () => undefined });
    freshSavesDb();
    history.replaceState(null, '', '/forge');
    localStorage.clear();
    archiveEntries.length = 0;
    archiveEntries.push({ stem: 'MP2', path: 'synthetic/MP2', label: 'Frostfire', campaign: false });
    // One map a stem, as `Archives.load` keeps one promise a stem.
    const loaded = new Map<string, Promise<LoadedMap>>();
    archiveLoad.mockReset().mockImplementation((stem) => {
      let p = loaded.get(stem);
      if (!p) { p = syntheticArchive(stem); loaded.set(stem, p); }
      return p;
    });
  });
  afterEach(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); vi.unstubAllGlobals(); });

  it('Save as pressed while an undo puts its pieces back is refused in the undo\'s words; once put back it asks', async () => {
    const { mountForge } = await import('../../src/forge/page');
    let api!: ForgeAgentApi;
    await mountForge(document, { onAgentReady: (a) => { api = a; } });
    await vi.waitFor(() => expect(api.read().layout?.base).toBe('MP2'), { timeout: 3000 });
    expect(await api.execute('piece.place', { asset: 'MP2:crate', at: [0, 0, 0] }, api.read().revision)).toMatchObject({ ok: true });
    expect(await api.execute('piece.place', { asset: 'MP2:crate', at: [8, 0, 8] }, api.read().revision)).toMatchObject({ ok: true });
    // The undo's state holds one crate: its piece's archive read is held, so the undo is under way (`busy`).
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    const map = archiveLoad.getMockImplementation()!;
    archiveLoad.mockImplementation(async (stem) => { await held; return map(stem); });
    const calls = archiveLoad.mock.calls.length;
    document.querySelector<HTMLButtonElement>('[data-forge="undo"]')!.click();
    await vi.waitFor(() => expect(archiveLoad.mock.calls.length, 'the undo asks for its piece archive').toBeGreaterThan(calls), { timeout: 3000 });
    document.querySelector<HTMLButtonElement>('[data-forge="saves"]')!.click();
    await vi.waitFor(() => expect(saveAsButton()).toBeDefined(), { timeout: 3000 });
    saveAsButton()!.click();
    await new Promise((r) => setTimeout(r, 50));
    expect(promptHeading(), 'no prompt while the layout is half placed').toBeNull();
    expect(statusLine(), 'refused in the undo\'s words').toBe('An undo or redo is still placing the layout');
    release();
    await vi.waitFor(() => expect((api.read().refs as { asset: unknown }[]).filter((r) => r.asset !== null)).toHaveLength(1), { timeout: 3000 });
    saveAsButton()!.click();
    await vi.waitFor(() => expect(promptHeading()).toBe('Save this layout'), { timeout: 3000 });
  }, 60_000);
});

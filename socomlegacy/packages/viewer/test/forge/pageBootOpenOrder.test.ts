// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import { forgeAuthoringText } from '../../src/forge/rulesAuthoring';
import type { LoadedMap } from '../../src/loadMap';
import { freshSavesDb } from './fakeSaves';
import { vaultLayout } from './rulesFixture';

/**
 * LATER 818 (product track, a browser adaptation with no original -- the game has no editor): a layout file opened before
 * the boot asks for its first open. The boot asks `openLayout` only after `await savedLayout()` (the saves store's open,
 * a share code's decode); f8ea198e2's queue runs opens in the order asked, so a file opened in that gap queued first and
 * the boot's map, asked after it, replaced it. Here the saves store's open is held to make the press inside that gap on
 * any host; the page is mounted as `pageFirstOpen.test.ts` mounts it.
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
/** The saves store's open held while `held` is set; `asked` once the page has asked it. */
const savesHold = vi.hoisted(() => ({ held: null as Promise<void> | null, asked: false }));
vi.mock('../../src/forge/savesStore', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/forge/savesStore')>();
  class HeldForgeSaves extends real.ForgeSaves {
    override async open() {
      savesHold.asked = true;
      if (savesHold.held) await savesHold.held;
      return super.open();
    }
  }
  return { ...real, ForgeSaves: HeldForgeSaves };
});

/** A synthetic archive: a floor and nothing on it. */
async function syntheticArchive(stem: string): Promise<LoadedMap> {
  const { blankLibraryMap, floorMesh } = await import('../../src/forge/matchMap');
  return { ...blankLibraryMap(stem, 1000), path: `synthetic/${stem}`, name: stem, world: [floorMesh(1000)], props: [] } as unknown as LoadedMap;
}

describe('LATER 818: a layout file opened before the boot asks its first open is the layout open after the boot', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', () => 0);
    freshSavesDb();
    history.replaceState(null, '', '/forge');
    localStorage.clear();
    archiveEntries.length = 0;
    archiveEntries.push({ stem: 'MP2', path: 'synthetic/MP2', label: 'Frostfire', campaign: false });
    archiveLoad.mockReset().mockImplementation((stem) => syntheticArchive(stem));
    savesHold.held = null;
    savesHold.asked = false;
  });
  afterEach(() => {
    savesHold.held = null;
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    vi.unstubAllGlobals();
  });

  it('the file opened while the boot reads its saves stays open; the boot\'s MP2 never replaces it', async () => {
    let release!: () => void;
    savesHold.held = new Promise<void>((r) => { release = r; });
    const { mountForge } = await import('../../src/forge/page');
    let api = null as ForgeAgentApi | null;   // cast: assigned in the callback, never narrowed to null
    const mounted = mountForge(document, { onAgentReady: (a) => { api = a; } });
    // The boot is in its gap: the page wired, its saves read asked, its first open not yet asked.
    await vi.waitFor(() => expect(savesHold.asked).toBe(true), { timeout: 5000 });
    const made = forgeAuthoringText(await vaultLayout(), 'Vault');
    if (!('text' in made)) throw new Error(made.why);
    const input = document.querySelector<HTMLInputElement>('input[type=file][accept=".json,application/json"]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [new File([made.text], 'vault.json', { type: 'application/json' })] });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(api?.read().layout?.name).toBe('Vault'), { timeout: 3000 });
    release();
    await mounted;
    await new Promise((r) => setTimeout(r, 300));
    const l = api!.read().layout!;
    expect(l.name, 'the player\'s file, not the boot\'s map').toBe('Vault');
    expect(l.base, 'the file\'s blank floor, not the boot\'s MP2').toBe('blank:floor');
  }, 60_000);

  it('with no press in the gap, the boot opens its first map as before', async () => {
    let release!: () => void;
    savesHold.held = new Promise<void>((r) => { release = r; });
    const { mountForge } = await import('../../src/forge/page');
    let api = null as ForgeAgentApi | null;   // cast: assigned in the callback, never narrowed to null
    const mounted = mountForge(document, { onAgentReady: (a) => { api = a; } });
    await vi.waitFor(() => expect(savesHold.asked).toBe(true), { timeout: 5000 });
    release();
    await mounted;
    await vi.waitFor(() => expect(api?.read().layout?.base).toBe('MP2'), { timeout: 3000 });
  }, 60_000);
});

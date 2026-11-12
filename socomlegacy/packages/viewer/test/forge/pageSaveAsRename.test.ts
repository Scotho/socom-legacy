// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import type { LoadedMap } from '../../src/loadMap';
import { freshSavesDb, readStoredList, storedSaves } from './fakeSaves';

/**
 * LATER 804 (product track, a browser adaptation with no original -- the game has no editor): Saves > Save as renames the
 * open layout. The rename is the page's own edit, as the name field's was (`personEdit('layout.name')`): one undoable
 * step named "Rename layout", the autosave written with the new name, and refused where an edit is refused. Before, the
 * Save as set the name directly -- no history step, the autosave kept the old name until the next edit. The page is
 * mounted as `pageFirstOpen.test.ts` mounts it (only the GPU and disc I/O replaced); IndexedDB is `fake-indexeddb`.
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

/** A synthetic archive: a floor and nothing on it. */
async function syntheticArchive(stem: string): Promise<LoadedMap> {
  const { blankLibraryMap, floorMesh } = await import('../../src/forge/matchMap');
  return { ...blankLibraryMap(stem, 1000), path: `synthetic/${stem}`, name: stem, world: [floorMesh(1000)], props: [] } as unknown as LoadedMap;
}

const saveAsButton = (): HTMLButtonElement | undefined =>
  [...document.querySelectorAll<HTMLButtonElement>('.fx-modal .fx-saves footer button')].find((b) => b.textContent === 'Save as');
const prompt = (): HTMLFormElement | null => document.querySelector<HTMLFormElement>('.fx-modal form.fx-card');
const undoButton = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('[data-forge="undo"]')!;
const redoButton = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('[data-forge="redo"]')!;

/** Saves > Save as, the prompt answered with `name`. */
async function saveAs(name: string): Promise<void> {
  document.querySelector<HTMLButtonElement>('[data-forge="saves"]')!.click();
  await vi.waitFor(() => expect(saveAsButton()).toBeDefined(), { timeout: 3000 });
  saveAsButton()!.click();
  await vi.waitFor(() => expect(prompt()?.querySelector('h2')?.textContent).toBe('Save this layout'), { timeout: 3000 });
  const form = prompt()!;
  form.querySelector<HTMLInputElement>('input')!.value = name;
  form.dispatchEvent(new Event('submit', { cancelable: true }));
}

describe('LATER 804: Save as renames the layout through the page\'s own edit', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', () => 0);
    freshSavesDb();
    history.replaceState(null, '', '/forge');
    localStorage.clear();
    archiveEntries.length = 0;
    archiveEntries.push({ stem: 'MP2', path: 'synthetic/MP2', label: 'Frostfire', campaign: false });
    archiveLoad.mockReset().mockImplementation((stem) => syntheticArchive(stem));
  });
  afterEach(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); vi.unstubAllGlobals(); });

  it('one undoable step named "Rename layout", the autosave written with the new name; undo and redo take it back and forth', async () => {
    const { mountForge } = await import('../../src/forge/page');
    let api!: ForgeAgentApi;
    await mountForge(document, { onAgentReady: (a) => { api = a; } });
    await vi.waitFor(() => expect(api.read().layout).not.toBeNull(), { timeout: 3000 });
    const before = api.read().layout!.name ?? '';
    expect(before).not.toBe('Renamed');
    await saveAs('Renamed');
    await vi.waitFor(async () => expect((await storedSaves()).map((s) => s.name)).toContain('Renamed'), { timeout: 3000 });
    expect(api.read().layout!.name, 'the open layout takes the name').toBe('Renamed');
    expect(undoButton().title, 'the rename is the top undo step').toContain('Rename layout');
    // The autosave follows the rename (the edit's own write), not the next edit.
    await vi.waitFor(async () => expect((await readStoredList('autosave')).text ?? '').toMatch(/"name":\s*"Renamed"/), { timeout: 3000 });
    // One step back is the name before the Save as; one step forward the new name again.
    undoButton().click();
    await vi.waitFor(() => expect(api.read().layout!.name ?? '').toBe(before), { timeout: 3000 });
    redoButton().click();
    await vi.waitFor(() => expect(api.read().layout!.name).toBe('Renamed'), { timeout: 3000 });
  }, 60_000);

  it('a later edit undone keeps the Save as name (the rename is its own step, under the edit)', async () => {
    const { mountForge } = await import('../../src/forge/page');
    let api!: ForgeAgentApi;
    await mountForge(document, { onAgentReady: (a) => { api = a; } });
    await vi.waitFor(() => expect(api.read().layout).not.toBeNull(), { timeout: 3000 });
    await saveAs('Kept name');
    await vi.waitFor(() => expect(api.read().layout!.name).toBe('Kept name'), { timeout: 3000 });
    await vi.waitFor(() => expect(saveAsButton(), 'the Saves card back once the save is written').toBeDefined(), { timeout: 3000 });
    expect(await api.execute('settings.set', { settings: { timeOfDay: 0.38 } }, api.read().revision)).toMatchObject({ ok: true });
    expect(api.read().layout!.name).toBe('Kept name');
    undoButton().click();
    await new Promise((r) => setTimeout(r, 300));
    expect(api.read().layout!.name, 'the edit undone, the name stays').toBe('Kept name');
  }, 60_000);
});

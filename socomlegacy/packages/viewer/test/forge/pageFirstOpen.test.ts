// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import { forgeAuthoringText } from '../../src/forge/rulesAuthoring';
import type { LoadedMap } from '../../src/loadMap';
import { freshSavesDb } from './fakeSaves';
import { vaultLayout } from './rulesFixture';

/**
 * The e2e-mega lost press (product track, a browser adaptation with no original): a press the player makes while the page
 * opens its first layout. The rendered pass on a slow box (forgeRules.spec.ts, SwiftShader; the traces of
 * `aws-20261109t2209z`) pressed while the boot's MP2 was still decoding: (A) the Saves card's Save as did nothing -- no
 * prompt, nothing said (`onSaveAs`: `layoutForSave()` is null until a base is open, and it returned in silence); (B) a
 * layout file opened then came up and was replaced a second later by the boot's own MP2, which finished after it (two
 * `openLayout`s overlapping, the one started first committing last). Here the boot's archive load is held open to make
 * both presses inside it on any host.
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

/** The boot's first MP2 load held until `release()`; any later load answers at once. */
function holdFirstLoad(): { release: () => Promise<void> } {
  let release!: () => void;
  const held = new Promise<void>((r) => { release = r; });
  let first = true;
  archiveLoad.mockReset().mockImplementation(async (stem) => {
    if (first) { first = false; await held; }
    return syntheticArchive(stem);
  });
  return { release: async () => { release(); await new Promise((r) => setTimeout(r, 0)); } };
}

/** The Forge mounted, not awaited: its boot is under way once its first archive load has been asked. */
async function mountUnderWay(): Promise<{ api: () => ForgeAgentApi; mounted: Promise<unknown> }> {
  const { mountForge } = await import('../../src/forge/page');
  let api: ForgeAgentApi | null = null;
  const mounted = mountForge(document, { onAgentReady: (a) => { api = a; } });
  await vi.waitFor(() => expect(archiveLoad).toHaveBeenCalledWith('MP2'), { timeout: 5000 });
  return { api: () => api!, mounted };
}

const statusLine = (): string => document.querySelector('.fx-status-msg')?.textContent ?? '';
const saveAsButton = (): HTMLButtonElement | undefined =>
  [...document.querySelectorAll<HTMLButtonElement>('.fx-modal .fx-saves footer button')].find((b) => b.textContent === 'Save as');
const promptHeading = (): string | null => document.querySelector('.fx-modal form.fx-card h2')?.textContent ?? null;

describe('the e2e-mega lost press: a press during the first open is answered, and a layout opened then stays open', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', () => 0);
    freshSavesDb();
    history.replaceState(null, '', '/forge');
    localStorage.clear();
    archiveEntries.length = 0;
    archiveEntries.push({ stem: 'MP2', path: 'synthetic/MP2', label: 'Frostfire', campaign: false });
  });
  afterEach(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); vi.unstubAllGlobals(); });

  it('(A) Save as pressed while the first base loads is refused and said -- never a press that does nothing; once open it asks', async () => {
    const load = holdFirstLoad();
    const { mounted } = await mountUnderWay();
    document.querySelector<HTMLButtonElement>('[data-forge="saves"]')!.click();
    expect(saveAsButton(), 'the Saves card opens during the load (the trace: its card drawn, Save as pressed)').toBeDefined();
    saveAsButton()!.click();
    await new Promise((r) => setTimeout(r, 50));
    expect(promptHeading(), 'no prompt while there is no layout to save').toBeNull();
    expect(statusLine(), 'the press is answered: the refusal said in the line').toBe('The Forge is loading');
    await load.release();
    await mounted;
    saveAsButton()!.click();
    await vi.waitFor(() => expect(promptHeading()).toBe('Save this layout'), { timeout: 3000 });
  }, 60_000);

  it('(B) a layout file opened while the first base loads is the layout open after the load -- the boot never replaces it', async () => {
    const load = holdFirstLoad();
    const { api, mounted } = await mountUnderWay();
    const made = forgeAuthoringText(await vaultLayout(), 'Vault');
    if (!('text' in made)) throw new Error(made.why);
    const input = document.querySelector<HTMLInputElement>('input[type=file][accept=".json,application/json"]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [new File([made.text], 'vault.json', { type: 'application/json' })] });
    input.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 50));
    await load.release();
    await mounted;
    await vi.waitFor(() => {
      const l = api().read().layout!;
      expect(l.name).toBe('Vault');
      expect(l.base, 'the file\'s blank floor, not the boot\'s MP2').toBe('blank:floor');
    }, { timeout: 3000 });
    // and it stays: nothing still in flight replaces it
    await new Promise((r) => setTimeout(r, 300));
    expect(api().read().layout!.name).toBe('Vault');
  }, 60_000);
});

// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import type { ForgePanel } from '../../src/forge/shell/panel';
import type { ForgePanelContext } from '../../src/forge/shell/context';
import type { LoadedBody } from '../../src/body';
import type { LoadedMap } from '../../src/loadMap';
import { freshSavesDb } from './fakeSaves';

/**
 * R6 (the UI seat's palette seam to dot, 2026-10-25 17:23Z / 17:24Z; a browser adaptation, FG.R2 -- the game has no
 * editor): on the mounted Forge, (1) a panel reads the page's palette through `ForgePanelContext.palette` -- the rows
 * after the page's own search and All / Favourites filter, the favourites, the chosen row and the page's place mode, the
 * archives, the Characters and the NPC tool, the loading and empty reasons -- the page owning every piece of it;
 * (2) the left dock's list scrolls within the dock (FUI-22: its one list, no panel host); (5) the Starters toolbar button is gone, the panel reached from
 * START > Panels; (6) the open Props screen redraws when a palette loads. The page is mounted as `forgeAgentPage.test.ts`
 * mounts it (only the GPU and disc I/O replaced); IndexedDB is `fake-indexeddb`.
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

const here = dirname(fileURLToPath(import.meta.url));
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
/** A synthetic archive: a floor, the props `models` (one placement each) and, on MP2, one character a side. */
async function syntheticArchive(stem: string, models: readonly string[]): Promise<LoadedMap> {
  const { blankLibraryMap, floorMesh } = await import('../../src/forge/matchMap');
  const body = (character: string) => ({ character, model: `${character}_model`, dressedBy: 'synthetic', parts: [], subMeshes: [], fittings: [], missing: [],
    at: null, height: 70, eye: null, stats: {} }) as unknown as LoadedBody;
  return {
    ...blankLibraryMap(stem, 1000), path: `synthetic/${stem}`, name: stem, world: [floorMesh(1000)],
    props: models.map((modelName) => ({ modelName, parts: [floorMesh(4)], matrices: IDENTITY.slice(), order: 0, alternate: false, facade: 0, lod: null, paths: [`world/${modelName}`] })),
    ...(stem === 'MP2' ? { types: { seal: [body('seal_a')], terrorist: [body('terror_a')] } } : {}),
  } as LoadedMap;
}

/** A panel that keeps its context: what dot's Assets panel is handed. */
function probePanel(): { panel: ForgePanel; ctx: () => ForgePanelContext | null } {
  let ctx: ForgePanelContext | null = null;
  const panel: ForgePanel = { id: 'probe', title: 'Probe', dock: 'right', order: 70, defaultOpen: false, padLegend: [],
    mount: (_host, c) => { ctx = c; return { dispose: () => undefined }; } };
  return { panel, ctx: () => ctx };
}

describe('R6: the page\'s palette seam, the left dock, the Starters route and the Props screen on the mounted Forge', () => {
  let mp3: { resolve: (m: LoadedMap) => void } | null = null;
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', () => 0);
    freshSavesDb();
    history.replaceState(null, '', '/forge?floor');
    localStorage.clear();
    mp3 = null;
    archiveEntries.length = 0;
    archiveEntries.push({ stem: 'MP2', path: 'synthetic/MP2', label: 'Frostfire', campaign: false },
      { stem: 'MP3', path: 'synthetic/MP3', label: 'Other', campaign: false });
    archiveLoad.mockReset().mockImplementation((stem) => (stem === 'MP3' && mp3 === null
      ? new Promise<LoadedMap>((ok) => { mp3 = { resolve: ok }; })
      : syntheticArchive(stem, stem === 'MP2' ? ['crate', 'barrel'] : ['drum'])));
  });
  afterEach(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); vi.unstubAllGlobals(); });

  async function mounted(panels: ForgePanel[] = []): Promise<ForgeAgentApi> {
    const { mountForge } = await import('../../src/forge/page');
    let api!: ForgeAgentApi;
    await mountForge(document, { onAgentReady: (a) => { api = a; }, panels });
    expect(api.read().ready).toBe(true);
    // The map base whose palette and characters the page lists (the blank floor's library has none here).
    const based = await api.execute('layout.base', { base: { kind: 'map', archive: 'MP2' } }, api.read().revision);
    expect(based, JSON.stringify(based)).toMatchObject({ ok: true });
    return api;
  }
  const pageRows = (): string[] => [...document.querySelectorAll('.fx-left > ul.fx-assets > li .fx-asset-name')].map((n) => n.textContent ?? '');

  it('1: a panel sees the page\'s filtered rows, toggles a favourite, chooses a row (the page places it), lists and chooses the characters', async () => {
    const probe = probePanel();
    const api = await mounted([probe.panel]);
    await vi.waitFor(() => expect(probe.ctx()).not.toBeNull());
    const palette = probe.ctx()!.palette;
    expect(palette).toBeDefined();
    if (!palette) return;
    await vi.waitFor(() => expect(palette.rows().map((r) => r.assetId)).toEqual(['MP2:barrel', 'MP2:crate']));
    expect(palette.rows()[0]).toEqual({ assetId: 'MP2:barrel', name: 'barrel', archive: 'MP2', group: null, placed: 1, favourite: false, chosen: false });
    expect(palette.archives()).toEqual([{ id: 'MP2', label: 'Frostfire · MP2', chosen: true }, { id: 'MP3', label: 'Other · MP3', chosen: false }]);
    expect(palette.state()).toEqual({ loading: false, emptyReason: null });
    expect(palette.filter()).toEqual({ query: '', favouritesOnly: false });
    const heard = vi.fn();
    const off = palette.subscribe(heard);
    // the page's own search: the panel's query is the page's
    palette.setQuery('cra');
    expect(palette.rows().map((r) => r.name)).toEqual(['crate']);
    expect(palette.filter()).toEqual({ query: 'cra', favouritesOnly: false });
    // FUI-22 (D3): the search sits in the filter row now, the dock's own field still
    expect(document.querySelector<HTMLInputElement>('.fx-left > .fx-asset-filters > input.fx-search')!.value).toBe('cra');
    expect(pageRows()).toEqual(['crate']);
    expect(heard).toHaveBeenCalled();
    palette.setQuery('');
    // a favourite: the page's store and its order (favourites first, their section named)
    heard.mockClear();
    palette.favourite('MP2:crate', true);
    expect(heard).toHaveBeenCalled();
    expect(palette.rows().map((r) => [r.assetId, r.favourite, r.group])).toEqual([['MP2:crate', true, 'Favourites'], ['MP2:barrel', false, null]]);
    expect(JSON.parse(localStorage.getItem('s2u-forge-favourites') ?? '[]')).toEqual(['MP2:crate']);
    expect(pageRows()).toEqual(['crate', 'barrel']);
    palette.setFavouritesOnly(true);
    expect(palette.filter().favouritesOnly).toBe(true);
    expect(palette.rows().map((r) => r.assetId)).toEqual(['MP2:crate']);
    palette.setFavouritesOnly(false);
    palette.favourite('MP2:crate', false);
    expect(palette.rows().every((r) => !r.favourite)).toBe(true);
    // choose: the toolbar list's path -- the page in Place, the row the chosen one in both lists
    heard.mockClear();
    palette.choose('MP2:crate');
    expect(heard).toHaveBeenCalled();
    expect(palette.chosen()).toBe('MP2:crate');
    expect(palette.rows().find((r) => r.assetId === 'MP2:crate')!.chosen).toBe(true);
    expect((api.read().view as { tool: string }).tool).toBe('place');
    expect(document.querySelector('.fx-left > ul.fx-assets > li.is-on .fx-asset-name')?.textContent).toBe('crate');
    // the characters: the base's player models, each side's in order, and the NPC tool
    expect(palette.characters()).toEqual([
      { id: 'terrorist:0', name: 'Terrorist 1 · terror_a', side: 'terrorist', group: 'Terrorists', type: 0, model: 'terror_a_model', chosen: false },
      { id: 'seal:0', name: 'SEAL 1 · seal_a', side: 'seal', group: 'SEALs', type: 0, model: 'seal_a_model', chosen: false },
    ]);
    palette.chooseCharacter('seal:0');
    expect(palette.characters().find((c) => c.id === 'seal:0')!.chosen).toBe(true);
    expect((api.read().view as { tool: string }).tool).toBe('npc');
    // the page's empty reason
    palette.setQuery('nothing like it');
    expect(palette.rows()).toEqual([]);
    expect(palette.state().emptyReason).toMatch(/No props match/);
    palette.setQuery('');
    // the archive choice: the page's palette select, loading until the archive is read
    palette.chooseArchive('MP3');
    expect(palette.archives().find((a) => a.chosen)!.id).toBe('MP3');
    expect(palette.state().loading).toBe(true);
    mp3!.resolve(await syntheticArchive('MP3', ['drum']));
    await vi.waitFor(() => expect(palette.rows().map((r) => r.assetId)).toEqual(['MP3:drum']));
    expect(palette.state().loading).toBe(false);
    // unsubscribed: no more calls
    off();
    heard.mockClear();
    palette.setQuery('x');
    expect(heard).not.toHaveBeenCalled();
  }, 90_000);

  // FUI-22 (D5, FUI.R21): the pin of the left dock's panel host (dot's grid after the page's list, scrolling in its own
  // box) moved -- no panel sits in the left dock now; what it protected, nothing running off the dock, is the one list's:
  // it takes the dock's rest and scrolls inside it, the rows above it never shrunk.
  it('2: the left dock is the one list -- no panel host in it; the list scrolls within the dock, the filter row never shrunk', async () => {
    await mounted();
    await vi.waitFor(() => expect(document.querySelector('.fx-right [data-forge-panel="creator-assets"]')).not.toBeNull());
    expect(document.querySelector('.fx-left > details.fx-panel')).toBeNull();
    const css = readFileSync(resolve(here, '../../src/forge/forge.css'), 'utf-8').replace(/\r\n/g, '\n');
    const list = /\n\.fx-assets \{([^}]*)\}/.exec(css);
    expect(list, 'the list\'s rule').not.toBeNull();
    expect(list![1]).toMatch(/\bflex: 1 1 auto;/);
    expect(list![1]).toMatch(/\bmin-height: 0;/);
    expect(list![1]).toMatch(/\boverflow-y: auto;/);
    expect(/\n\.fx-asset-filters \{([^}]*)\}/.exec(css)?.[1]).toMatch(/\bflex: none;/);
    expect(document.querySelector('.fx-left > .fx-asset-filters')!.compareDocumentPosition(document.querySelector('.fx-left > ul.fx-assets')!)
      & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }, 90_000);

  it('5: no Starters button on the toolbar; START > Panels shows the Starter experiences', async () => {
    await mounted();
    expect(document.querySelector('[data-forge="examples"]')).toBeNull();
    expect([...document.querySelectorAll('header.fx-top button')].some((b) => /Starter/.test(b.textContent ?? '') || /starter/i.test(b.getAttribute('aria-label') ?? ''))).toBe(false);
    const starters = document.querySelector<HTMLDetailsElement>('[data-forge-panel="starters"]')!;
    expect(starters.open).toBe(false);
    document.querySelector<HTMLButtonElement>('[data-forge="menu"]')!.click();
    const row = await vi.waitFor(() => {
      const r = document.querySelector<HTMLElement>('.fx-menu li[data-forge-menu-row="panel-starters"]');
      expect(r).not.toBeNull();
      return r!;
    });
    row.click();
    expect(starters.open).toBe(true);
  }, 90_000);

  it('6: the Props screen open over a palette that loads shows its props without another press', async () => {
    await mounted();
    document.querySelector<HTMLButtonElement>('[data-forge="menu"]')!.click();
    const props = await vi.waitFor(() => {
      const r = document.querySelector<HTMLElement>('.fx-menu li[data-forge-menu-row="props"]');
      expect(r).not.toBeNull();
      return r!;
    });
    props.click();
    const cells = (): string[] => [...document.querySelectorAll<HTMLElement>('.fx-menu li[data-forge-menu-row^="prop-"]')].map((r) => r.dataset['forgeMenuRow']!);
    await vi.waitFor(() => expect(cells()).toEqual(['prop-MP2:barrel', 'prop-MP2:crate']));
    const select = document.querySelector<HTMLSelectElement>('.fx-left > select.fx-select')!;
    select.value = 'MP3';
    select.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(mp3).not.toBeNull());
    mp3!.resolve(await syntheticArchive('MP3', ['drum']));
    await vi.waitFor(() => expect(cells()).toEqual(['prop-MP3:drum']));
  }, 90_000);
});

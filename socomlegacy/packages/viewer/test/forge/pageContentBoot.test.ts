// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import type { ForgeContentSource } from '../../src/forge/page';
import { emptyLayout, type Layout } from '../../src/forge/layout';
import { recordOfLayout } from '../../src/forge/record';
import { encodeShare } from '../../src/forge/share';
import { FORGE_LAYOUT_KEY } from '../../src/pageStore';
import type { LoadedMap } from '../../src/loadMap';
import { MAP_PACK, minimalMapJson } from '../../../creator-contracts/test/contentMapFixtures';
import { freshSavesDb, readStoredList } from './fakeSaves';

/**
 * R6 fix-up (the review's blocking finding on item 7; product track, a browser adaptation with no original): a layout on
 * an authored map (a content base) whose pack is not here is a base this page does not hold, at the load as a map this
 * disc lacks is (#348's re-review, `./boot`). So a share link on one, opened over an earlier autosave with work, opens
 * the earlier layout instead; an own autosave on one opens a fallback and is kept until the player's own edit -- never
 * written over by the fallback's autosave. Both with a disc and without one. And on an authored map the base select
 * shows it, so choosing the blank floor asks as any other base change does. The page's content source is the default
 * (`NO_CONTENT_SOURCE`, nothing resolves) unless a case hands one in.
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

const SPAWN = { team: 'A' as const, p: [10, 0, 10] as [number, number, number], yaw: 0 };
/** The player's own work: a layout with a spawn on `base`. */
const work = (base: Layout['base'], name: string): Layout => ({ ...emptyLayout(base), name, spawns: [SPAWN] });
const onTheYard = (): Layout['base'] => ({ kind: 'content', ref: MAP_PACK, mapId: 'yard', library: 'MP2' } as Layout['base']);
const seedAutosave = (l: Layout): void => { localStorage.setItem(FORGE_LAYOUT_KEY, JSON.stringify(recordOfLayout(l, l.name ?? 'Autosave'))); };
const storedName = async (): Promise<string | null> => {
  const { text } = await readStoredList('autosave');
  return text ? (JSON.parse(text) as { name?: string }).name ?? null : null;
};
/** OT.R112: the current base is named on the forge menu's "New layout" row (`optionLabel(baseSel)`), as pageContent's pins read it. */
const menuBaseLabel = (): string => {
  document.querySelector<HTMLButtonElement>('[data-forge="menu"]')!.click();          // (re)drawn: an open menu keeps its rows
  return document.querySelector('.fx-menu li[data-forge-menu-row="base"] .fx-menu-value')?.textContent ?? '';
};
const closeMenu = (): void => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true })); };
const statusLine = (): string => document.querySelector('.fx-status-msg')?.textContent ?? '';
/** Past the page's 300 ms autosave window, twice over. */
const pastTheAutosave = (): Promise<void> => new Promise((r) => setTimeout(r, 700));

/** Mounts the Forge; `openLink` answers the share link's question ("Open the link") when it is asked. */
async function mount(o: { openLink?: boolean; content?: ForgeContentSource } = {}): Promise<ForgeAgentApi> {
  const { mountForge } = await import('../../src/forge/page');
  let api!: ForgeAgentApi;
  const mounted = mountForge(document, { onAgentReady: (a) => { api = a; }, ...(o.content ? { content: o.content } : {}) });
  if (o.openLink) {
    await vi.waitFor(() => {
      const yes = [...document.querySelectorAll<HTMLButtonElement>('.fx-card button')].find((b) => b.textContent === 'Open the link');
      expect(yes).toBeDefined();
      yes!.click();
    }, { timeout: 5000 });
  }
  await mounted;
  expect(api.read().ready).toBe(true);
  return api;
}

describe('R6 fix-up: a content base whose pack is not here is not held at the load', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', () => 0);
    freshSavesDb();
    history.replaceState(null, '', '/forge');
    localStorage.clear();
    archiveEntries.length = 0;
    archiveLoad.mockReset().mockImplementation((stem) => syntheticArchive(stem));
  });
  afterEach(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); vi.unstubAllGlobals(); });

  const shareOnTheYard = async (): Promise<void> => {
    const code = await encodeShare(recordOfLayout({ ...emptyLayout(onTheYard()), name: 'Their yard' }, 'Their yard'));
    history.replaceState(null, '', `/forge#forge=${code}`);
  };

  it('with a disc: a share on an authored map, opened over earlier work, opens the earlier layout and never writes over it', async () => {
    archiveEntries.push({ stem: 'MP2', path: 'synthetic/MP2', label: 'Frostfire', campaign: false });
    seedAutosave(work({ kind: 'map', archive: 'MP2' }, 'My work'));
    await shareOnTheYard();
    const api = await mount({ openLink: true });
    expect(api.read().layout!.name).toBe('My work');
    expect(statusLine()).toContain(`This layout needs pack ${MAP_PACK.id}@${MAP_PACK.version}`);
    expect(statusLine()).toContain('your earlier layout is open');
    await pastTheAutosave();
    expect(await storedName()).toBe('My work');
  }, 90_000);

  it('with a disc: an own autosave on an authored map whose pack has gone opens a fallback and is kept until the player edits', async () => {
    archiveEntries.push({ stem: 'MP2', path: 'synthetic/MP2', label: 'Frostfire', campaign: false });
    seedAutosave(work(onTheYard(), 'On the yard'));
    const api = await mount();
    expect(api.status().map).toBe('MP2');
    expect(statusLine()).toContain(`This layout needs pack ${MAP_PACK.id}@${MAP_PACK.version}`);
    expect(statusLine()).toContain('kept until you edit');
    await pastTheAutosave();
    expect(await storedName()).toBe('On the yard');
    // the player's own edit: theirs to keep from now
    expect(await api.execute('layout.name', { name: 'Fresh' }, api.read().revision)).toMatchObject({ ok: true });
    await vi.waitFor(async () => expect(await storedName()).toBe('Fresh'), { timeout: 3000 });
  }, 90_000);

  it('without a disc: a share on an authored map, opened over earlier work, opens the earlier layout and never writes over it', async () => {
    seedAutosave(work({ kind: 'blank', library: 'MP2' }, 'My work'));
    await shareOnTheYard();
    const api = await mount({ openLink: true });
    expect(api.read().layout!.name).toBe('My work');
    expect(statusLine()).toContain(`This layout needs pack ${MAP_PACK.id}@${MAP_PACK.version}`);
    expect(statusLine()).toContain('your earlier layout is open');
    await pastTheAutosave();
    expect(await storedName()).toBe('My work');
  }, 90_000);

  it('without a disc: an own autosave on an authored map whose pack has gone opens the blank floor and is kept until the player edits', async () => {
    seedAutosave(work(onTheYard(), 'On the yard'));
    const api = await mount();
    expect(api.status().map).toMatch(/^blank:/);
    expect(statusLine()).toContain(`This layout needs pack ${MAP_PACK.id}@${MAP_PACK.version}`);
    await pastTheAutosave();
    expect(await storedName()).toBe('On the yard');
    expect(await api.execute('layout.name', { name: 'Fresh' }, api.read().revision)).toMatchObject({ ok: true });
    await vi.waitFor(async () => expect(await storedName()).toBe('Fresh'), { timeout: 3000 });
  }, 90_000);

  // OT.R112 (the Forge's UI is its contributor's): no base select on the toolbar (the owner, 2026-11-06, daed4f539) --
  // the base is named on the forge menu's "New layout" row and another is chosen from New's own card, which asks it
  // (a base list, Cancel, Next) before any new layout. The authored map is no row of that list: never chosen there.
  it('on an authored map the menu names it, so the blank floor is chosen from New\'s card before a new layout', async () => {
    const content: ForgeContentSource = {
      asset: () => null, member: () => null,
      map: (ref) => (ref.pack.id === MAP_PACK.id && ref.assetId === 'yard' ? JSON.parse(JSON.stringify(minimalMapJson())) as unknown : null),
    };
    await shareOnTheYard();
    const api = await mount({ content });
    const own = `content:${MAP_PACK.id}@${MAP_PACK.version}/yard`;
    await vi.waitFor(() => expect(api.status().map).toBe(own));
    expect(menuBaseLabel()).toContain('Yard');
    closeMenu();
    document.querySelector<HTMLButtonElement>('button[title^="Start a new layout"]')!.click();
    await vi.waitFor(() => expect(document.querySelector('.fx-card select[aria-label="New layout"]')).not.toBeNull());
    const sel = document.querySelector<HTMLSelectElement>('.fx-card select[aria-label="New layout"]')!;
    expect([...sel.options].map((o) => o.value)).not.toContain(own);
    expect(api.status().map).toBe(own);                                // the card asks: nothing changed yet
    sel.value = 'blank';
    sel.closest('.fx-card')!.querySelector<HTMLButtonElement>('button.fx-primary')!.click();   // Next
    await vi.waitFor(() => expect(api.status().map).toMatch(/^blank:/));
    expect(menuBaseLabel()).not.toContain('Yard');
    closeMenu();
  }, 90_000);

  // R7-6 (round 6's finding): the boot asks whether it holds the base (`holdsContentBase`) and then loads it
  // (`loadContentWorld`); a source whose map() fetches read the member twice. One read a boot, with a disc and without.
  for (const disc of [false, true]) {
    it(`R7-6 (${disc ? 'with' : 'without'} a disc): the authored map's member is read once at the boot that opens it`, async () => {
      if (disc) archiveEntries.push({ stem: 'MP2', path: 'synthetic/MP2', label: 'Frostfire', campaign: false });
      const reads: string[] = [];
      const content: ForgeContentSource = {
        asset: () => null, member: () => null,
        map: (ref) => { reads.push(`${ref.pack.id}/${ref.assetId}`); return ref.pack.id === MAP_PACK.id && ref.assetId === 'yard' ? JSON.parse(JSON.stringify(minimalMapJson())) as unknown : null; },
      };
      await shareOnTheYard();
      const api = await mount({ content });
      await vi.waitFor(() => expect(api.status().map).toBe(`content:${MAP_PACK.id}@${MAP_PACK.version}/yard`));
      expect(reads).toEqual([`${MAP_PACK.id}/yard`]);
    }, 90_000);
  }
});

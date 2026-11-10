// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Camera, Scene } from 'three';
import { contentAssetKey, type CreatorLayoutRecord, type PackRef } from '@s2u/creator-contracts';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import type { ForgeContentSource } from '../../src/forge/page';
import { emptyLayout, type Layout } from '../../src/forge/layout';
import { recordOfLayout } from '../../src/forge/record';
import { saveNamed } from '../../src/forge/saves';
import type { CustomMapRecord } from '../../src/packs/customMaps';
import type { LoadedMap } from '../../src/loadMap';
import { MAP_PACK, minimalMapJson } from '../../../creator-contracts/test/contentMapFixtures';
import { freshSavesDb, readStoredList, storedSaves, writeStoredSaves } from './fakeSaves';

/**
 * FP-6 (FP.R4, FP.R12; product track, a browser adaptation with no original -- the Forge's picker is Crispy's, OT.R112):
 * the Custom Maps group on the mounted Forge. Its rows are New's card's (`chooseNewBase` lists `baseSel`'s groups, and
 * the pad's Base row opens that card), so the card is what is pinned: absent when nothing is installed or saved; else
 * after the page's own groups, bundles then bare content maps then saves; a row chosen opens its base.
 */
vi.mock('../../src/renderer', () => ({ createRenderer: async () => ({
  backend: 'webgl2', resize: () => undefined, presentation: () => 'native',
  render: (scene: Scene, camera: Camera) => { scene.updateMatrixWorld(); if (!camera.parent) camera.updateMatrixWorld(); },
  setPresentation: () => undefined, setClearColor: () => undefined,
}) }));
const archiveLoad = vi.hoisted(() => vi.fn<(stem: string) => Promise<LoadedMap>>());
vi.mock('../../src/forge/archives', () => ({ Archives: class {
  onProgress = null;
  clips = async () => null;
  list = async () => ({ entries: [], problems: [] });
  load = archiveLoad;
  sourceRequest = () => ({ kind: 'http', baseUrl: '/maps' });
}, labelOf: (_entries: unknown, _stem: string, fallback: string) => fallback }));

const OTHER: PackRef = { id: 'example.other', version: '2.0.0', hash: 'e'.repeat(64) };
const yardLayout = (): Layout => ({ ...emptyLayout({ kind: 'content', ref: MAP_PACK, mapId: 'yard', library: 'MP2' } as Layout['base']), name: 'Sample Yard',
  spawns: [{ team: 'A', p: [10, 0, 10], yaw: 0 }, { team: 'B', p: [-10, 0, -10], yaw: 0 }] });
const bundle = (over: Partial<CustomMapRecord> = {}): CustomMapRecord => ({ digest: 'abc123', name: 'Sample Yard',
  layout: recordOfLayout(yardLayout(), 'Sample Yard') as CreatorLayoutRecord, packs: [MAP_PACK], missing: [], importedAt: 1, ...over });
type IndexRow = { ref: { kind: 'pack'; pack: PackRef; assetId: string }; name: string };
/** The in-memory content source with FP-5's two listings: its map index and the kept custom maps. */
function source(opts: { records?: CustomMapRecord[]; index?: IndexRow[] } = {}): ForgeContentSource {
  return {
    asset: () => null, member: () => null,
    map: (ref) => (ref.assetId === 'yard' || ref.assetId === 'dunes' ? minimalMapJson({ mapId: ref.assetId }) : null),
    mapIndex: () => opts.index ?? [],
    customMaps: () => opts.records ?? [],
  };
}
const RECT = { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
const newCardSel = (): HTMLSelectElement | null => document.querySelector<HTMLSelectElement>('.fx-card select[aria-label="New layout"]');
const openNew = async (): Promise<HTMLSelectElement> => {
  document.querySelector<HTMLButtonElement>('button[title^="Start a new layout"]')!.click();
  await vi.waitFor(() => expect(newCardSel()).not.toBeNull());
  return newCardSel()!;
};
const groupsOf = (sel: HTMLSelectElement): [string, string[]][] => [...sel.querySelectorAll('optgroup')].map((g) => [g.label, [...g.querySelectorAll('option')].map((o) => o.value)]);
const choose = (sel: HTMLSelectElement, value: string): void => {
  sel.value = value;
  sel.closest('.fx-card')!.querySelector<HTMLButtonElement>('button.fx-primary')!.click();
};

describe('FP-6: Custom Maps on the mounted Forge', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', () => 0);
    freshSavesDb();
    history.replaceState(null, '', '/forge?floor');
    localStorage.clear();
    archiveLoad.mockReset().mockRejectedValue(new Error('No disc supplied'));
  });
  afterEach(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); for (const e of Array.from(document.body.children)) e.remove(); vi.unstubAllGlobals(); });

  async function mount(content?: ForgeContentSource, packs: readonly PackRef[] = []): Promise<ForgeAgentApi> {
    const { mountForge } = await import('../../src/forge/page');
    let api: ForgeAgentApi | null = null;
    await mountForge(document, { onAgentReady: (a) => { api = a; }, availablePacks: () => packs, ...(content ? { content } : {}) });
    await vi.waitFor(() => expect(api).not.toBeNull());
    await vi.waitFor(() => expect(api!.status().map).toMatch(/^blank:/));
    for (const e of document.querySelectorAll<HTMLElement>('.fx-viewport, .fx-input')) e.getBoundingClientRect = () => RECT;
    return api!;
  }

  it('1: nothing installed and nothing saved -- New\'s list is unchanged, no Custom Maps group', async () => {
    await mount(source());
    const sel = await openNew();
    expect(groupsOf(sel).map(([g]) => g)).not.toContain('Custom Maps');
    expect([...sel.options].map((o) => o.value)).toEqual(['blank']);
  }, 90_000);

  it('1: bundles, then bare content maps no bundle covers, then saves -- after the page\'s own rows; each opens its base', async () => {
    await writeStoredSaves((list) => saveNamed(list, 'My floor', recordOfLayout(emptyLayout({ kind: 'blank', library: 'MP2' }), 'My floor'), 5, 's1').saves);
    const api = await mount(source({ records: [bundle()], index: [
      { ref: { kind: 'pack', pack: MAP_PACK, assetId: 'yard' }, name: 'Yard' },
      { ref: { kind: 'pack', pack: OTHER, assetId: 'dunes' }, name: 'Dunes' },
    ] }), [MAP_PACK, OTHER]);
    const sel = await openNew();
    const groups = groupsOf(sel);
    expect(groups.at(-1)).toEqual(['Custom Maps', ['custom:abc123', `content:${OTHER.id}@${OTHER.version}/dunes`, 'save:s1']]);
    expect([...sel.querySelectorAll('optgroup')].at(-1)!.querySelector('option')!.textContent).toMatch(/^Sample Yard/);
    // A bare content map opens on its own base.
    choose(sel, `content:${OTHER.id}@${OTHER.version}/dunes`);
    await vi.waitFor(() => expect(api.status().map).toBe(`content:${OTHER.id}@${OTHER.version}/dunes`));
    // A save opens as the Saves card opens it.
    choose(await openNew(), 'save:s1');
    await vi.waitFor(() => expect(api.read().layout!.name).toBe('My floor'));
  }, 90_000);

  /** The page's messages so far (the Messages log, opened). */
  const messages = (): string[] => {
    const log = document.querySelector('.fx-notify-log');
    if (log?.hasAttribute('hidden') !== false) document.querySelector<HTMLButtonElement>('.fx-log-btn')!.click();
    return [...document.querySelectorAll('.fx-notify-log__item')].map((li) => li.textContent ?? '');
  };
  const CRATE = { kind: 'pack' as const, pack: OTHER, assetId: 'crate' };
  /** The yard's bundle with one piece of a pack this device lacks (OTHER's crate): it opens, the crate a stand-in. */
  const needy = (): CustomMapRecord => bundle({ layout: recordOfLayout({ ...yardLayout(),
    pieces: [{ asset: contentAssetKey(CRATE), m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 50, 0, 50, 1], content: CRATE }] }, 'Sample Yard') as CreatorLayoutRecord });

  it('2: each row caption is short, its title the readiness sentence; a switch says it once; the Check is unchanged', async () => {
    const api = await mount(source({ records: [needy()] }), [MAP_PACK]);
    const sel = await openNew();
    const row = [...sel.querySelectorAll('optgroup')].at(-1)!.querySelector('option')!;
    expect(row.textContent).toBe('Sample Yard · needs 1 pack');
    expect(row.title).toBe(`Needs 1 pack not here: ${OTHER.id} ${OTHER.version}`);
    choose(sel, 'custom:abc123');
    await vi.waitFor(() => expect(api.status().map).toBe(`content:${MAP_PACK.id}@${MAP_PACK.version}/yard`));
    await vi.waitFor(() => expect(messages()).toContain(`Needs 1 pack not here: ${OTHER.id} ${OTHER.version}`));
    expect(messages().filter((m) => m.startsWith('Needs 1 pack')).length).toBe(1);
    // The Check's rows as pageMissingPacks has them: the missing pack named, the layout open whole.
    document.querySelector<HTMLButtonElement>('[data-forge="check"]')!.click();
    await vi.waitFor(() => expect(document.querySelector('.fx-check-card')).not.toBeNull());
    expect(document.querySelector('.fx-check-card li[data-kind="missing-pack"]')!.textContent).toContain(`${OTHER.id}@${OTHER.version}`);
    expect(api.read().layout!.pieces).toHaveLength(1);
  }, 90_000);

  it('2: a ready bundle reads Sample Yard · Ready', async () => {
    await mount(source({ records: [bundle()] }), [MAP_PACK]);
    const row = [...(await openNew()).querySelectorAll('optgroup')].at(-1)!.querySelector('option')!;
    expect(row.textContent).toBe('Sample Yard · Ready');
    expect(row.title).toBe('Ready');
  }, 90_000);

  const saveButton = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('[data-forge="saves"]')!;

  it('3 (PR #756 P2): a bundle chosen and its "Save this layout first?" cancelled marks nothing -- the next open is an ordinary layout', async () => {
    await writeStoredSaves((list) => saveNamed(list, 'My floor', recordOfLayout(emptyLayout({ kind: 'blank', library: 'MP2' }), 'My floor'), 5, 's1').saves);
    // MP2 answers with a synthetic archive holding a crate, so a piece can be placed (no disc data).
    const { blankLibraryMap, floorMesh } = await import('../../src/forge/matchMap');
    const mp2 = { ...blankLibraryMap('MP2', 1000), path: 'synthetic/MP2', name: 'MP2', world: [floorMesh(1000)],
      props: [{ modelName: 'crate', parts: [floorMesh(4)], matrices: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), order: 0, alternate: false, facade: 0, lod: null, paths: ['world/crate'] }] } as unknown as LoadedMap;
    archiveLoad.mockReset().mockResolvedValue(mp2);
    const api = await mount({ ...source(), customMaps: () => [bundle()] }, [MAP_PACK]);
    // Work on the floor, so New asks to save it first.
    expect(await api.execute('piece.place', { asset: 'MP2:crate', at: [0, 0, 0] }, api.read().revision)).toMatchObject({ ok: true });
    const button = (words: string): HTMLButtonElement => [...document.querySelectorAll<HTMLButtonElement>('.fx-card button')].find((b) => b.textContent === words)!;
    choose(await openNew(), 'custom:abc123');
    await vi.waitFor(() => expect(button('Cancel')).toBeDefined());
    button('Cancel').click();                                          // the bundle's open cancelled: the layout stays
    await vi.waitFor(() => expect(button('Save first')).toBeUndefined());
    expect(api.status().map).toMatch(/^blank:/);
    choose(await openNew(), 'save:s1');                                // an unrelated open: the saved layout
    await vi.waitFor(() => expect(button('Don’t save')).toBeDefined());
    button('Don’t save').click();
    await vi.waitFor(() => expect(api.read().layout!.name).toBe('My floor'));
    expect(saveButton().textContent).toBe('Saves');                    // not "Save as": no bundle was opened
    // Its autosave on: the save chip is never the read-only "Host’s layout" a bundle's open turns it to (autosaveOff).
    expect(await api.execute('piece.place', { asset: 'MP2:crate', at: [8, 0, 8] }, api.read().revision)).toMatchObject({ ok: true });
    const chip = (): string => document.querySelector('[data-forge-chip="save"]')?.textContent ?? '';
    await vi.waitFor(() => expect(chip()).not.toBe(''));
    expect(chip()).not.toContain('Host’s layout');
  }, 90_000);

  it('3: a bundle opens as a read-only base -- no autosave of it, Save is Save as; Save as copies it into the saves and opens the copy', async () => {
    const records = [needy()];
    const api = await mount({ ...source(), customMaps: () => records }, [MAP_PACK]);
    await vi.waitFor(async () => expect((await readStoredList('autosave')).text ?? '').not.toBe(''));   // the floor's own autosave
    const before = (await readStoredList('autosave')).text;
    choose(await openNew(), 'custom:abc123');
    await vi.waitFor(() => expect(api.status().map).toBe(`content:${MAP_PACK.id}@${MAP_PACK.version}/yard`));
    expect(saveButton().textContent).toBe('Save as');
    // Item 6's development hook (`__forgeContentProps`): the yard's own content props drawn -- the fixture's map has none.
    expect((globalThis as { __forgeContentProps?: () => number }).__forgeContentProps?.()).toBe(0);
    await new Promise((r) => setTimeout(r, 500));                    // past the autosave's 300 ms
    expect((await readStoredList('autosave')).text).toBe(before);   // the bundle is never autosaved
    saveButton().click();
    await vi.waitFor(() => expect(document.querySelector('.fx-card input')).not.toBeNull());
    const card = document.querySelector('.fx-card input')!.closest('.fx-card')!;
    expect(document.querySelector<HTMLInputElement>('.fx-card input')!.value).toBe('Sample Yard');
    card.querySelector<HTMLButtonElement>('button.fx-primary')!.click();
    await vi.waitFor(async () => expect((await storedSaves()).map((x) => x.name)).toEqual(['Sample Yard']));
    const [copy] = await storedSaves();
    expect(copy!.id).not.toBe('abc123');
    expect(copy!.record.pieces).toEqual(records[0]!.layout.pieces);
    expect((copy!.record as CreatorLayoutRecord).requires).toEqual(records[0]!.layout.requires);
    expect((copy!.record as CreatorLayoutRecord).contentBase).toEqual(records[0]!.layout.contentBase);
    // The copy is open: an ordinary layout, Saves again, its autosave on.
    await vi.waitFor(() => expect(saveButton().textContent).toBe('Saves'));
    await vi.waitFor(async () => expect((await readStoredList('autosave')).text).toContain('Sample Yard'));
    // The record removed in MODS: the save stays, the group lists it alone.
    records.length = 0;
    const sel = await openNew();
    expect(groupsOf(sel).at(-1)).toEqual(['Custom Maps', [`save:${copy!.id}`]]);
    expect((await storedSaves()).length).toBe(1);
  }, 90_000);
});

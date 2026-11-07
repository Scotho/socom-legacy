// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contentAssetKey, type ContentRef, type PackRef } from '@s2u/creator-contracts';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import type { CreatorLayoutRecord } from '../../src/forge/record';
import { emptyLayout } from '../../src/forge/layout';
import { BLANK_LIBRARY } from '../../src/forge/matchMap';
import { FORGE_MATCHING_CLASS } from '../../src/forge/matchState';
import { recordOfLayout } from '../../src/forge/record';
import { FORGE_LAYOUT_KEY } from '../../src/pageStore';
import type { LoadedMap } from '../../src/loadMap';
import { freshSavesDb, readStoredList } from './fakeSaves';

/**
 * R3-B (5, FUI-14/16's minimum; 6; a browser adaptation, no original -- the forge and its packs are the port's own):
 * a layout whose packs are not here opens and edits as any other (every piece and reference kept); the open names how
 * many are missing, the Check sheet lists them by id@version, and Play and Create lobby are refused with that list
 * while any is missing -- the work never discarded. With every pack here, Create lobby is still refused, by the online
 * policy (`onlineRecordRefusal`, H273/H274: a lobby plays the disc's own content), in its own words; nothing is posted.
 */

vi.mock('../../src/renderer', () => ({ createRenderer: async () => ({
  backend: 'webgl2', resize: () => undefined, presentation: () => 'native', render: () => undefined,
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

const crates: PackRef = { id: 'crates', version: '1.0.0', hash: 'a'.repeat(64) };
const rules: PackRef = { id: 'rules', version: '2.0.0', hash: 'b'.repeat(64) };
const crate: ContentRef = { kind: 'pack', pack: crates, assetId: 'crate' };
/** A layout with a pack's piece, a declared pack, and a spawn: what the creator's tools write. */
const withPacks = () => recordOfLayout({
  ...emptyLayout({ kind: 'blank', library: BLANK_LIBRARY }), name: 'Packed',
  pieces: [{ asset: contentAssetKey(crate), m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 50, 0, 50, 1], content: crate }],
  spawns: [{ team: 'A', p: [10, 0, 10], yaw: 0 }], requires: [rules],
}, 'Packed');
const statusLine = (): string => document.querySelector('.fx-status-msg')?.textContent ?? '';

async function mount(available: readonly PackRef[] = []): Promise<ForgeAgentApi> {
  localStorage.setItem(FORGE_LAYOUT_KEY, JSON.stringify(withPacks()));         // moved into the store at the boot
  const { mountForge } = await import('../../src/forge/page');
  let api!: ForgeAgentApi;
  await mountForge(document, { onAgentReady: (a) => { api = a; }, availablePacks: () => available });
  expect(api.read().ready).toBe(true);
  return api;
}

describe('R3-B: missing packs and the online refusal on the mounted Forge', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', () => 0);
    freshSavesDb();
    history.replaceState(null, '', '/forge?floor');
    localStorage.clear();
    archiveLoad.mockReset().mockRejectedValue(new Error('No disc supplied'));
  });
  afterEach(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); vi.unstubAllGlobals(); });

  it('5: opens and edits a layout whose packs are not here; the Check lists them; Play is refused with that list, the work kept', async () => {
    const api = await mount();
    const opened = api.read().layout!;
    expect(opened.name).toBe('Packed');
    expect(opened.pieces).toHaveLength(1);
    expect(opened.assets).toEqual([crate]);                                    // the reference kept, never a disc id
    expect((opened as CreatorLayoutRecord).requires).toEqual([crates, rules]);
    // the open names the count
    expect(document.querySelector('.fx-live')?.textContent ?? '').toMatch(/2 packs/);
    // edits as any other layout
    expect(await api.execute('spawn.place', { team: 'B', at: [80, 0, 80] }, api.read().revision)).toMatchObject({ ok: true });
    expect(api.read().layout!.spawns).toHaveLength(2);
    expect(api.read().layout!.assets).toEqual([crate]);
    expect((api.read().layout as CreatorLayoutRecord).requires).toEqual([crates, rules]);
    // the Check sheet lists them by id@version
    document.querySelector<HTMLButtonElement>('[data-forge="check"]')!.click();
    await vi.waitFor(() => expect(document.querySelector('.fx-check-card')).not.toBeNull());
    const sheet = document.querySelector('.fx-check-card')!.textContent ?? '';
    expect(sheet).toContain('crates@1.0.0');
    expect(sheet).toContain('rules@2.0.0');
    document.querySelector<HTMLButtonElement>('.fx-check-card .fx-primary')!.click();
    // Play: refused with the list, nothing started, nothing discarded
    const before = api.read().layout;
    document.querySelector<HTMLButtonElement>('.fx-play')!.click();
    await vi.waitFor(() => expect(statusLine()).toContain('crates@1.0.0'));
    expect(statusLine()).toContain('rules@2.0.0');
    expect(document.body.classList.contains(FORGE_MATCHING_CLASS)).toBe(false);
    expect(document.querySelector('.fx-check-modal .fx-card')).toBeNull();      // refused before the check's card
    const agentPlay = await api.execute('play.start', { allowIssues: true }, api.read().revision);
    expect(agentPlay).toMatchObject({ ok: false, code: 'REQUIREMENTS_UNMET' });
    expect(agentPlay.message).toContain('crates@1.0.0');
    expect(api.read().layout).toEqual(before);
    // Create lobby: refused with the same list, nothing posted
    const fetches = vi.fn(async () => new Response('{}', { status: 500 }));
    vi.stubGlobal('fetch', fetches);
    document.querySelector<HTMLButtonElement>('[data-forge="lobby"]')!.click();
    await vi.waitFor(() => expect(statusLine()).toMatch(/lobby/i));
    expect(statusLine()).toContain('crates@1.0.0');
    expect(fetches).not.toHaveBeenCalled();
    expect(api.read().layout).toEqual(before);
  }, 90_000);

  it('the review (R3-B fix-up): a missing pack\'s piece duplicated, or copied and pasted, keeps its reference, and the autosave still writes', async () => {
    const api = await mount();
    const piecesStored = async (): Promise<number> => ((JSON.parse((await readStoredList('autosave')).text ?? '{}') as { pieces?: unknown[] }).pieces ?? []).length;
    expect(await api.execute('selection.set', { refs: ['piece:0'] }, api.read().revision)).toMatchObject({ ok: true });
    // the person's Duplicate (the toolbar's, pad Square, C)
    [...document.querySelectorAll<HTMLButtonElement>('button.fx-tool')].find((b) => b.title.startsWith('Duplicate'))!.click();
    await vi.waitFor(() => expect(api.read().layout!.pieces).toHaveLength(2));
    expect(api.read().layout!.assets).toEqual([crate]);
    await vi.waitFor(async () => expect(await piecesStored()).toBe(2), { timeout: 3000 });
    expect(statusLine()).not.toContain('not saved');
    // copied and pasted (the agent's paste over the person's clipboard)
    expect(await api.execute('selection.set', { refs: ['piece:0'] }, api.read().revision)).toMatchObject({ ok: true });
    expect(await api.execute('selection.copy', {}, api.read().revision)).toMatchObject({ ok: true });
    const pasted = await api.execute('selection.paste', { at: [120, 0, 120] }, api.read().revision);
    expect(pasted, JSON.stringify(pasted)).toMatchObject({ ok: true });
    expect(api.read().layout!.pieces).toHaveLength(3);
    expect(api.read().layout!.assets).toEqual([crate]);
    await vi.waitFor(async () => expect(await piecesStored()).toBe(3), { timeout: 3000 });
    expect(statusLine()).not.toContain('not saved');
  }, 90_000);

  it('R4 (8, the round 3 review): the person\'s own paste (Ctrl+V) and a group\'s Duplicate keep a missing pack piece\'s reference; the autosave still writes', async () => {
    const api = await mount();
    const piecesStored = async (): Promise<number> => ((JSON.parse((await readStoredList('autosave')).text ?? '{}') as { pieces?: unknown[] }).pieces ?? []).length;
    const key = (code: string): void => { window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code.slice(3).toLowerCase(), ctrlKey: true })); };
    // the person's copy and paste (Ctrl+C, Ctrl+V: `copySelection`, `pasteClipboard`), not the agent's
    expect(await api.execute('selection.set', { refs: ['piece:0'] }, api.read().revision)).toMatchObject({ ok: true });
    key('KeyC');
    key('KeyV');
    await vi.waitFor(() => expect(api.read().layout!.pieces).toHaveLength(2));
    expect((api.read().layout as CreatorLayoutRecord).pieces.map((p) => p[0])).toEqual([0, 0]);   // each row the one pack reference
    expect(api.read().layout!.assets).toEqual([crate]);
    await vi.waitFor(async () => expect(await piecesStored()).toBe(2), { timeout: 3000 });
    expect(statusLine()).not.toContain('not saved');
    // two picked: Duplicate is the group's (`duplicateGroup`, each piece through `copyOf`)
    expect(await api.execute('selection.set', { refs: ['piece:0', 'piece:1'] }, api.read().revision)).toMatchObject({ ok: true });
    [...document.querySelectorAll<HTMLButtonElement>('button.fx-tool')].find((b) => b.title.startsWith('Duplicate'))!.click();
    await vi.waitFor(() => expect(api.read().layout!.pieces).toHaveLength(4));
    expect((api.read().layout as CreatorLayoutRecord).pieces.map((p) => p[0])).toEqual([0, 0, 0, 0]);
    expect(api.read().layout!.assets).toEqual([crate]);
    await vi.waitFor(async () => expect(await piecesStored()).toBe(4), { timeout: 3000 });
    expect(statusLine()).not.toContain('not saved');
  }, 90_000);

  it('6: every pack here -- Play is not held, but Create lobby is refused by the online policy in its own words, nothing posted', async () => {
    const api = await mount([crates, rules]);
    expect((api.read().layout as CreatorLayoutRecord).requires).toEqual([crates, rules]);
    expect(document.querySelector('.fx-live')?.textContent ?? '').not.toMatch(/packs?.*not here/);
    const fetches = vi.fn(async () => new Response('{}', { status: 500 }));
    vi.stubGlobal('fetch', fetches);
    document.querySelector<HTMLButtonElement>('[data-forge="lobby"]')!.click();
    await vi.waitFor(() => expect(statusLine()).toContain('An online lobby plays the disc’s own content'.replace('’', '\'')));
    expect(fetches).not.toHaveBeenCalled();
    expect(document.querySelector('.fx-modal:not([hidden]) form')).toBeNull();  // no name asked: refused first
  }, 90_000);
});

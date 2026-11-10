// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contentAssetKey, type ContentRef, type PackRef } from '@s2u/creator-contracts';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import { emptyLayout, type Layout } from '../../src/forge/layout';
import { BLANK_LIBRARY } from '../../src/forge/matchMap';
import { recordOfLayout } from '../../src/forge/record';
import { FORGE_LAYOUT_KEY } from '../../src/pageStore';
import type { LoadedMap } from '../../src/loadMap';
import { freshSavesDb } from './fakeSaves';

/**
 * Codex on #741 (a browser adaptation, no original -- the forge's clipboard is the port's own): a placed respawn point
 * (`Layout.respawns`) copies and pastes as the duplicate paths make one (`../../src/forge/page.ts` `copyOf`/`duplicate`,
 * `respawnMarker`): alone, and inside a mixed selection, where the pasted count said agrees with the copied. The mount
 * is `./pageMissingPacks.test.ts`'s.
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
const crate: ContentRef = { kind: 'pack', pack: crates, assetId: 'crate' };
/** A piece (a pack's, its stand-in pasted with no disc here), a spawn A and a respawn point B. */
const mixed = () => recordOfLayout({
  ...emptyLayout({ kind: 'blank', library: BLANK_LIBRARY }), name: 'Respawns',
  pieces: [{ asset: contentAssetKey(crate), m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 50, 0, 50, 1], content: crate }],
  spawns: [{ team: 'A', p: [10, 0, 10], yaw: 0 }],
  respawns: [{ team: 'B', p: [30, 0, 30], yaw: 0 }],
} as Layout, 'Respawns');
const statusLine = (): string => document.querySelector('.fx-status-msg')?.textContent ?? '';
/** The record's rows (`@s2u/creator-contracts` `SpawnRow`: team, x, y, z, yaw), its spawns' and its respawns' alike. */
type Row = [team: 'A' | 'B', x: number, y: number, z: number, yaw: number];
type Rows = { spawns: Row[]; respawns?: Row[] };

async function mount(): Promise<ForgeAgentApi> {
  localStorage.setItem(FORGE_LAYOUT_KEY, JSON.stringify(mixed()));
  const { mountForge } = await import('../../src/forge/page');
  let api!: ForgeAgentApi;
  await mountForge(document, { onAgentReady: (a) => { api = a; }, availablePacks: () => [] });
  expect(api.read().ready).toBe(true);
  return api;
}

describe('a placed respawn point on the clipboard', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', () => 0);
    freshSavesDb();
    history.replaceState(null, '', '/forge?floor');
    localStorage.clear();
    archiveLoad.mockReset().mockRejectedValue(new Error('No disc supplied'));
  });
  afterEach(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); vi.unstubAllGlobals(); });

  it('one respawn point (team B) copied and pasted at a point: two respawns, both B, the second at the paste point', async () => {
    const api = await mount();
    expect((api.read().layout as unknown as Rows).respawns).toHaveLength(1);
    expect(await api.execute('selection.set', { refs: ['respawn:0'] }, api.read().revision)).toMatchObject({ ok: true });
    expect(await api.execute('selection.copy', {}, api.read().revision)).toMatchObject({ ok: true, data: { copied: 1 } });
    const pasted = await api.execute('selection.paste', { at: [120, 0, 120] }, api.read().revision);
    expect(pasted, JSON.stringify(pasted)).toMatchObject({ ok: true });
    const respawns = (api.read().layout as unknown as Rows).respawns ?? [];
    expect(respawns.map((r) => r[0])).toEqual(['B', 'B']);
    expect(respawns[1]![1]).toBeCloseTo(120, 1);
    expect(respawns[1]![3]).toBeCloseTo(120, 1);
  }, 90_000);

  it("a mixed selection (a spawn A, a respawn B, a piece) copied and pasted (Ctrl+C, Ctrl+V): all three kinds, 'pasted 3' after 'copied 3'", async () => {
    const api = await mount();
    const key = (code: string): void => { window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code.slice(3).toLowerCase(), ctrlKey: true })); };
    expect(await api.execute('selection.set', { refs: ['spawn:0', 'respawn:0', 'piece:0'] }, api.read().revision)).toMatchObject({ ok: true });
    key('KeyC');
    expect(statusLine()).toContain('copied 3');
    key('KeyV');
    await vi.waitFor(() => expect(statusLine()).toMatch(/pasted \d+/));
    expect(statusLine()).toContain('pasted 3');
    const l = api.read().layout!;
    expect((l as unknown as Rows).spawns.map((r) => r[0])).toEqual(['A', 'A']);
    expect(((l as unknown as Rows).respawns ?? []).map((r) => r[0])).toEqual(['B', 'B']);
    expect(l.pieces).toHaveLength(2);
  }, 90_000);
});

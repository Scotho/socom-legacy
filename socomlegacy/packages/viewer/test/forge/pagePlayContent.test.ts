// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Group, Matrix4, Object3D } from 'three';
import { contentAssetKey } from '@s2u/creator-contracts';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import type { ForgeContentSource } from '../../src/forge/page';
import { emptyLayout, type Layout } from '../../src/forge/layout';
import { BLANK_LIBRARY, type ContentPlacement } from '../../src/forge/matchMap';
import { recordOfLayout } from '../../src/forge/record';
import { readAssetDefinition, type AssetDefinition } from '../../src/packs/content/assets';
import { FORGE_LAYOUT_KEY } from '../../src/pageStore';
import type { LoadedMap } from '../../src/loadMap';
import { REF, solidJson } from '../packs/contentFixtures';
import { freshSavesDb } from './fakeSaves';

/**
 * LATER 456 (product track, a Forge adaptation with no original -- the original has no content props; H336, the owner's
 * call between (a) drawn in Play and (b) editor-only, answered (a) on 2026-10-26): with FORGE_PLAY_CONTENT_PROPS_ADAPTATION
 * on (the default since that answer), Play's mount takes a group holding one object per composed content placement
 * (`composeMatchMap`'s `content`), each at its placement's matrix -- the editor's transform -- through `startForgeMatch`'s
 * `extraWorld`; off ((b), kept as the alternative's record), the option is not passed at all. A start that fails after the
 * group is built disposes it once (the review's leak). The flag is read through `forgePlayContentProps.drawn` (the
 * test's spy). The match itself is the test's stand-in (`startForgeMatch` mocked; `./matchMount.test.ts` pins the
 * mount's own scene).
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
const started = vi.hoisted(() => ({ options: [] as Record<string, unknown>[], reject: false, dispose: null as (() => void) | null }));
vi.mock('../../src/forge/match', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/forge/match')>()),
  matchExtras: async () => ({ effects: null, sound: null }),
  startForgeMatch: async (_target: HTMLElement, o: Record<string, unknown>) => {
    started.options.push(o);
    if (started.reject) {
      // the room will not welcome: the group's dispose is wrapped first, so the test counts the page's call
      const g = o['extraWorld'] as { userData: Record<string, unknown> } | undefined;
      if (g) {
        const free = g.userData['dispose'] as () => void;
        started.dispose = vi.fn(free);
        g.userData['dispose'] = started.dispose;
      }
      throw new Error('the forge\'s room did not welcome the player');
    }
    return { ended: () => false, close: () => undefined };
  },
}));

const defOf = (json: Record<string, unknown>): AssetDefinition => {
  const got = readAssetDefinition(json, REF);
  if (Array.isArray(got)) throw new Error('the fixture does not read');
  return got as AssetDefinition;
};
/** The content source: the crate's definition, no GLB member (the piece is the bounds' stand-in, as the editor draws it). */
const source = (asset: AssetDefinition): ForgeContentSource => ({
  asset: (ref) => (ref.assetId === asset.ref.assetId && ref.pack.id === asset.ref.pack.id ? asset : null),
  member: () => null,
  map: () => null,
});
const CRATE_M = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 50, 0, 50, 1];
const CRATE_M2 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -40, 0, 30, 1];
/** A blank-floor layout with two of the pack's crates and a spawn. */
const withCrates = (): Layout => ({
  ...emptyLayout({ kind: 'blank', library: BLANK_LIBRARY }), name: 'Crated',
  pieces: [
    { asset: contentAssetKey(REF), m: CRATE_M, content: REF },
    { asset: contentAssetKey(REF), m: CRATE_M2, content: REF },
  ],
  spawns: [{ team: 'A', p: [10, 0, 10], yaw: 0 }],
});

describe('LATER 456: Play\'s content props behind FORGE_PLAY_CONTENT_PROPS_ADAPTATION', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', () => 0);
    freshSavesDb();
    history.replaceState(null, '', '/forge?floor');
    localStorage.clear();
    archiveLoad.mockReset().mockRejectedValue(new Error('No disc supplied'));
    started.options = [];
    started.reject = false;
    started.dispose = null;
  });
  afterEach(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  async function play(drawn: boolean | null, ok = true): Promise<Record<string, unknown>> {
    localStorage.setItem(FORGE_LAYOUT_KEY, JSON.stringify(recordOfLayout(withCrates(), 'Crated')));
    const page = await import('../../src/forge/page');
    if (drawn !== null) vi.spyOn(page.forgePlayContentProps, 'drawn').mockReturnValue(drawn);
    let api!: ForgeAgentApi;
    await page.mountForge(document, { onAgentReady: (a) => { api = a; }, availablePacks: () => [REF.pack], content: source(defOf(solidJson())) });
    expect(api.read().layout!.pieces).toHaveLength(2);
    const r = await api.execute('play.start', { allowIssues: true }, api.read().revision);
    if (ok) expect(r, JSON.stringify(r)).toMatchObject({ ok: true });
    await vi.waitFor(() => expect(started.options).toHaveLength(1));
    return started.options[0]!;
  }

  it('on by the owner\'s answer (H336): the props are drawn in Play', async () => {
    const page = await import('../../src/forge/page');
    expect(page.FORGE_PLAY_CONTENT_PROPS_ADAPTATION).toBe(true);
    expect(page.forgePlayContentProps.drawn()).toBe(true);
  }, 30_000);                                                                           // the page module's first load

  it('off ((b), the alternative\'s record): Play\'s mount is not passed the option at all', async () => {
    const o = await play(false);
    expect('extraWorld' in o).toBe(false);
  }, 30_000);

  it('on, the match will not start: the built group is disposed once (no leak on the failed start)', async () => {
    started.reject = true;
    const o = await play(true, false);
    expect(o['extraWorld']).toBeInstanceOf(Group);
    await vi.waitFor(() => expect(started.dispose).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));
    expect(started.dispose).toHaveBeenCalledTimes(1);
  }, 30_000);

  it('on: Play\'s mount takes one object per composed placement, each at its placement\'s matrix', async () => {
    const o = await play(true);
    const g = o['extraWorld'] as Group;
    expect(g).toBeInstanceOf(Group);
    expect(g.children).toHaveLength(2);
    const [a, b] = g.children as [Object3D, Object3D];
    expect(a.userData['forgeContentKey']).toBe(contentAssetKey(REF));
    // the layout's matrix as the record round-trips it (its turn back through cos/sin: within 1e-9 of the placed one)
    a.matrix.toArray().forEach((v, i) => expect(v, `a[${i}]`).toBeCloseTo(CRATE_M[i]!, 9));
    b.matrix.toArray().forEach((v, i) => expect(v, `b[${i}]`).toBeCloseTo(CRATE_M2[i]!, 9));
    // decomposed as the editor's own pieces are: its place and its quarter turn
    expect([a.position.x, a.position.y, a.position.z]).toEqual([50, 0, 50]);
    expect(a.rotation.y).toBeCloseTo(Math.PI / 2, 6);
    expect([b.position.x, b.position.z]).toEqual([-40, 30]);
  }, 30_000);
});

describe('LATER 456: contentPropsGroup, the group Play takes', () => {
  const def = defOf(solidJson());
  const at = (index: number, m: number[]): ContentPlacement => ({ index, def, m });

  it('one object per placement at its matrix; one that answers none or throws is left out and counted, never a throw', async () => {
    const { contentPropsGroup } = await import('../../src/forge/match');
    const pieces = [at(0, CRATE_M), at(1, CRATE_M2), at(2, CRATE_M), at(3, CRATE_M2)];
    const made: Object3D[] = [];
    const { group, failed } = await contentPropsGroup(pieces, async (p) => {
      if (p.index === 1) return null;
      if (p.index === 2) throw new Error('the GLB would not read');
      const o = new Object3D();
      o.name = `piece ${p.index}`;
      made.push(o);
      return o;
    });
    expect(failed).toBe(2);
    expect(group.children.map((c) => c.name)).toEqual(['piece 0', 'piece 3']);
    expect(group.children[0]!.matrix.toArray()).toEqual(CRATE_M);
    expect(group.children[1]!.matrix.toArray()).toEqual(new Matrix4().fromArray(CRATE_M2).toArray());
    expect(group.children[0]!.position.toArray()).toEqual([50, 0, 50]);
    expect(made).toHaveLength(2);
  });

  it('none placed: an empty group, nothing failed', async () => {
    const { contentPropsGroup } = await import('../../src/forge/match');
    const { group, failed } = await contentPropsGroup([], async () => new Object3D());
    expect(group.children).toHaveLength(0);
    expect(failed).toBe(0);
  });
});

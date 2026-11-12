// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { MountForgeOptions } from '../../src/forge/page';

/**
 * FP-5 item 5 (FP.R3; product track, a browser adaptation): the Forge's page loader (`pageEntry.ts` `PAGE_LOADERS.forge`)
 * hands the page the registry's content source (`../../src/packs/content/source` `pageContentSource`) as
 * `MountForgeOptions.content`, and its packs as `availablePacks` -- the page leaves `NO_CONTENT_SOURCE` behind. The page
 * and the source are replaced: what is pinned is what the loader passes. A source that cannot be read leaves the page
 * on its own defaults.
 */
const mountForge = vi.hoisted(() => vi.fn(async (_doc: Document, _options?: MountForgeOptions) => undefined));
vi.mock('../../src/forge/page', () => ({ mountForge }));
const YARD = { id: 'example.sample-yard', version: '0.1.1', hash: 'c'.repeat(64) };
const source = vi.hoisted(() => ({ availablePacks: vi.fn(() => [] as unknown[]), refresh: vi.fn(async () => {}),
  map: vi.fn(() => null), asset: vi.fn(() => null), member: vi.fn(async () => null) }));
const pageContentSource = vi.hoisted(() => vi.fn(async () => source));
const refreshOnPackChanges = vi.hoisted(() => vi.fn(() => ({ idle: async () => {}, dispose: () => {} })));
vi.mock('../../src/packs/content/source', () => ({ pageContentSource, refreshOnPackChanges }));

describe('FP-5 item 5: the Forge page loader hands the page the registry content source', () => {
  it('passes the source as content, and its packs as availablePacks', async () => {
    source.availablePacks.mockReturnValue([YARD]);
    const { PAGE_LOADERS } = await import('../../src/pageEntry');
    await (await PAGE_LOADERS.forge!()).mountForge(document);
    const options = mountForge.mock.calls[0]![1]!;
    expect(options.content).toBe(source);
    expect(options.availablePacks!()).toEqual([YARD]);
    expect(options.panels?.length).toBeGreaterThan(0);   // the agent dock still handed (entryPanels.test.ts)
  }, 90_000);

  it("the review's F3: the page's own local packs, once handed to its panels, refresh the source on a change", async () => {
    mountForge.mockClear();
    refreshOnPackChanges.mockClear();
    const { PAGE_LOADERS } = await import('../../src/pageEntry');
    await (await PAGE_LOADERS.forge!()).mountForge(document);
    const options = mountForge.mock.calls[0]![1]!;
    const packs = { subscribe: vi.fn(() => () => {}) };
    const factory = options.panels!.find((p) => typeof p === 'function') as (s: { packs: unknown }) => unknown;
    void Promise.resolve(factory({ packs })).catch(() => undefined);
    expect(refreshOnPackChanges).toHaveBeenCalledWith(source, { packs });
  }, 90_000);

  it('a source that cannot be read leaves the page its defaults', async () => {
    mountForge.mockClear();
    pageContentSource.mockRejectedValueOnce(new Error('no store'));
    const { PAGE_LOADERS } = await import('../../src/pageEntry');
    await (await PAGE_LOADERS.forge!()).mountForge(document);
    const options = mountForge.mock.calls[0]![1]!;
    expect(options.content).toBeUndefined();
    expect(options.availablePacks).toBeUndefined();
  }, 90_000);
});

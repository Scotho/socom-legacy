// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoadedMap } from '../../src/loadMap';
import { freshSavesDb } from './fakeSaves';

/**
 * FN-7 (ours; LATER 1034; product track, development builds only): the development bench (`/forge?bench`, page.ts's
 * `devBench`) is the forge's own block on a blank floor and reads no archive. Its blank floor's library and its block's
 * asset prefix are both `forge` (`base = { kind: 'blank', library: 'forge' }`; `FORGE_BLOCK` = 'forge:block'), a stem
 * no disc has. Seen at v0.4.22's cut: the bench's line at "forge: Opening the archive 0%". The chain, by reading: the
 * bench's `setMode('place')` -> `syncGhost` -> `ladderFrontOf(FORGE_BLOCK)` -> `parseAssetId` ('forge') ->
 * `hostageLibOf('forge')` -> `archives.load('forge')`.
 */

vi.mock('../../src/renderer', () => ({ createRenderer: async () => ({
  backend: 'webgl2', resize: () => undefined, presentation: () => 'native', render: () => undefined,
  setPresentation: () => undefined, setClearColor: () => undefined,
}) }));
const archiveLoad = vi.hoisted(() => vi.fn<(stem: string) => Promise<LoadedMap>>());
const archiveAsked = vi.hoisted(() => [] as string[]);
vi.mock('../../src/forge/archives', () => ({ Archives: class {
  onProgress = null;
  clips = async () => null;
  list = async () => { archiveAsked.push('list'); return { entries: [], problems: [] }; };
  load = archiveLoad;
  census = async (stem: string) => { archiveAsked.push(`census:${stem}`); return null; };
  scriptNames = async (stem: string) => { archiveAsked.push(`scriptNames:${stem}`); return null; };
  props = async (stem: string) => { archiveAsked.push(`props:${stem}`); return []; };
  weaponSounds = async () => { archiveAsked.push('weaponSounds'); return []; };
  sourceRequest = () => ({ kind: 'http', baseUrl: '/maps' });
}, labelOf: (_entries: unknown, _stem: string, fallback: string) => fallback }));

describe('the development bench asks the archive source for no archive (FN-7, LATER 1034)', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', () => 0);
    freshSavesDb();
    history.replaceState(null, '', '/forge?bench');
    localStorage.clear();
    archiveAsked.length = 0;
    // No disc has `forge`: a load of it fails, as a served tree's or a disc's would.
    archiveLoad.mockReset().mockImplementation((stem) => Promise.reject(new Error(`no archive ${stem}`)));
  });
  afterEach(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    history.replaceState(null, '', '/forge');
    vi.unstubAllGlobals();
  });

  it('opens on the blank floor and loads no archive, `forge` least of all, in the background', async () => {
    expect(import.meta.env.DEV, 'the bench is a development build\'s (`devBench` needs DEV)').toBe(true);
    const { mountForge } = await import('../../src/forge/page');
    await mountForge(document, {});                                              // the bench's start returns after `say('blank floor')`
    // The bench's own line (`say('blank floor')`): the base select is not on the contributor's page (`baseSel`, built
    // and never attached), so the runner's `fc2`-era read of it found nothing at both commits (fn7-59aca6d3c).
    expect(document.querySelector('.fx-status-msg')?.textContent, 'the bench is open: its blank floor said').toBe('blank floor');
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));   // the first draws' background asks
    expect(archiveLoad.mock.calls.map(([stem]) => stem), 'no archive loaded on the bench').toEqual([]);
    expect(archiveAsked, 'nor listed, censused or read for its names').toEqual([]);
  }, 60_000);
});

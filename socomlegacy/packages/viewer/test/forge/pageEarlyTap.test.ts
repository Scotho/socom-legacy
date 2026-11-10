// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoadedMap } from '../../src/loadMap';
import { freshSavesDb } from './fakeSaves';

/**
 * The early tap (product track, a browser adaptation with no original -- the game has no editor): a press on the Forge's
 * shell while the renderer starts. Shadow's GPU trace at 1da70bdac (e2e `forgeMenuPointer.spec.ts` :51 and :97 on a real
 * GPU): the shell is on the page (the menu button drawn at 13562 ms) while `createRenderer` (WebGPU's async start) is
 * awaited, the tap lands at 13760 ms on a button with no listener yet, and the menu never opens; SwiftShader's WebGL2
 * starts at once and never shows it. Here the renderer's start is held open to make the press inside it on any host:
 * the press is held and pressed once the page is wired (`./shell/earlyPress`), the controls that act on the scene are
 * inert meanwhile, and the loading card says the Forge is starting.
 */

const rendererStart = vi.hoisted(() => ({ held: null as Promise<void> | null, fail: null as Error | null }));
vi.mock('../../src/renderer', () => ({ createRenderer: async () => {
  if (rendererStart.held) await rendererStart.held;
  if (rendererStart.fail) throw rendererStart.fail;
  return {
    backend: 'webgl2', resize: () => undefined, presentation: () => 'native', render: () => undefined,
    setPresentation: () => undefined, setClearColor: () => undefined,
  };
} }));
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

/** The renderer's start held until `release()`. */
function holdRenderer(): { release: () => void } {
  let release!: () => void;
  rendererStart.held = new Promise<void>((r) => { release = r; });
  return { release: () => release() };
}

const menuButton = (): HTMLButtonElement | null => document.querySelector<HTMLButtonElement>('header.fx-top button[data-forge="menu"]');
const menuHost = (): HTMLElement | null => document.querySelector<HTMLElement>('.fx-padmenu');
const loadingCard = (): HTMLElement | null => document.querySelector<HTMLElement>('.fx-loading');
/**
 * The controls held inert until wired: the placing tools' row, the viewport, Play, and Open (the review's 1: its file
 * chooser needs the press's own user activation, which a replay after a slow start may have lost).
 */
const sceneControls = (): (HTMLElement | null)[] => [
  document.querySelector<HTMLElement>('nav.fx-tools-row'),
  document.querySelector<HTMLElement>('main.fx-viewport'),
  document.querySelector<HTMLElement>('header.fx-top .fx-play'),
  [...document.querySelectorAll<HTMLButtonElement>('header.fx-top button')].find((b) => b.title === 'Open a layout file') ?? null,
];

describe('the early tap: a press on the shell while the renderer starts is not lost', () => {
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
  afterEach(() => {
    rendererStart.held = null;
    rendererStart.fail = null;
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    vi.unstubAllGlobals();
  });

  it('the menu button pressed while the renderer starts opens the menu once the page is wired', async () => {
    const start = holdRenderer();
    const { mountForge } = await import('../../src/forge/page');
    const mounted = mountForge(document, {});
    await new Promise((r) => setTimeout(r, 0));
    const menu = menuButton();
    expect(menu, 'the shell is on the page while the renderer starts (the trace: the button drawn)').not.toBeNull();
    menu!.click();                                         // the trace's tap, inside the renderer's start
    start.release();
    await mounted;
    await vi.waitFor(() => {
      expect(menuButton()!.getAttribute('aria-expanded'), 'the press held and pressed: the menu open').toBe('true');
      expect(menuHost()!.hidden).toBe(false);
    }, { timeout: 5000 });
  }, 60_000);

  it('the scene\'s controls are inert and the loading card says so while the renderer starts; neither once the page is wired', async () => {
    const start = holdRenderer();
    const { mountForge } = await import('../../src/forge/page');
    const mounted = mountForge(document, {});
    await new Promise((r) => setTimeout(r, 0));
    for (const c of sceneControls()) {
      expect(c, 'each scene control is on the page').not.toBeNull();
      expect(c!.hasAttribute('inert'), `${c!.className}: inert while the renderer starts`).toBe(true);
    }
    expect(menuButton()!.hasAttribute('inert'), 'the menu button takes the press (held), never inert').toBe(false);
    expect(menuButton()!.closest('[inert]'), 'nor inside an inert container').toBeNull();
    expect(loadingCard()!.hidden, 'the loading card is shown while the renderer starts').toBe(false);
    expect(document.querySelector('.fx-loading-title')!.textContent).toBe('Starting the Forge');
    start.release();
    await mounted;
    for (const c of sceneControls()) expect(c!.hasAttribute('inert'), `${c!.className}: not inert once wired`).toBe(false);
    await vi.waitFor(() => expect(loadingCard()!.hidden, 'the loading card gone once the first layout is open').toBe(true), { timeout: 5000 });
    expect(menuButton()!.getAttribute('aria-expanded'), 'nothing pressed: the menu stays closed').toBe('false');
  }, 60_000);

  it('a renderer that does not start hides the loading card and says so in the line; the page stops as before (review finding 2)', async () => {
    rendererStart.fail = new Error('no adapter');
    const { mountForge } = await import('../../src/forge/page');
    await expect(mountForge(document, {})).rejects.toThrow('no adapter');
    expect(loadingCard()!.hidden, 'never left saying "Starting the Forge"').toBe(true);
    const line = document.querySelector<HTMLElement>('.fx-status-msg')!;
    expect(line.textContent).toBe('the renderer did not start: no adapter');
    expect(line.classList.contains('is-bad'), 'said as a failure').toBe(true);
  }, 60_000);
});

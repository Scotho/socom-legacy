// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoadedMap } from '../../src/loadMap';
import { freshSavesDb } from './fakeSaves';
import { menuOpen, toolbarButton } from './helpers/editor';

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

/**
 * FC2-4: the contributor's toolbar has no forge-menu button (EDITOR-MAP T1: built, never attached; his menu's pointer way
 * in is Controls > "Forge menu (M)", whose card sits outside the toolbar the early press holds). The press held while the
 * renderer starts is shown on a toolbar button of his that is on screen then and not inert: Docks (EDITOR-MAP D10), held
 * by `holdEarlyPresses` on the toolbar (page.ts:2170) and pressed at `release` (page.ts:13560), its press turning the docks
 * off (page.ts:11751) after the page has drawn them on (page.ts:12277).
 */
const docksButton = (): HTMLButtonElement | null => document.querySelector<HTMLButtonElement>('header.fx-top button[aria-label="Docks"]');
const docksOff = (): boolean => document.body.classList.contains('fx-docks-off');
const loadingCard = (): HTMLElement | null => document.querySelector<HTMLElement>('.fx-loading');
/**
 * The controls held inert until wired: the placing tools' row, the viewport, Play. (Open is inert too while the renderer
 * starts, then leaves the toolbar for his File menu once wired: page.ts:12233, EDITOR-MAP T3.)
 */
const sceneControls = (): (HTMLElement | null)[] => [
  document.querySelector<HTMLElement>('nav.fx-tools-row'),
  document.querySelector<HTMLElement>('main.fx-viewport'),
  document.querySelector<HTMLElement>('header.fx-top .fx-play'),
];
const openButton = (): HTMLButtonElement | null =>
  [...document.querySelectorAll<HTMLButtonElement>('header.fx-top button')].find((b) => b.title === 'Open a layout file') ?? null;

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

  it('a toolbar button (Docks) pressed while the renderer starts is pressed once the page is wired', async () => {
    const start = holdRenderer();
    const { mountForge } = await import('../../src/forge/page');
    const mounted = mountForge(document, {});
    await new Promise((r) => setTimeout(r, 0));
    const docks = docksButton();
    expect(docks, 'the shell is on the page while the renderer starts (the trace: the button drawn)').not.toBeNull();
    docks!.click();                                        // the trace's tap, inside the renderer's start
    start.release();
    await mounted;
    await vi.waitFor(() => expect(docksOff(), 'the press held and pressed: the docks off').toBe(true), { timeout: 5000 });
  }, 60_000);

  /**
   * FC2-6, the Forge menu's early press from Controls: Controls (wired early, page.ts:2303) then the help card's "Forge
   * menu (M)" (`data-help-menu`, page.ts:2112) while the renderer starts. The card's listener (page.ts:2304) presses the
   * menu's own button, which is never on the page (EDITOR-MAP T1) and whose listener is wired only after the await
   * (page.ts:12650): without the hold the press reached nothing and the menu never opened.
   */
  it('Controls > "Forge menu (M)" pressed while the renderer starts opens the forge menu once the page is wired (FC2-6)', async () => {
    const start = holdRenderer();
    const { mountForge } = await import('../../src/forge/page');
    const mounted = mountForge(document, {});
    await new Promise((r) => setTimeout(r, 0));
    toolbarButton(document, 'Controls').click();
    const way = document.querySelector<HTMLButtonElement>('.fx-help footer button[data-help-menu]');
    expect(way, 'the help card\'s Forge menu button is on the page while the renderer starts').not.toBeNull();
    way!.click();                                          // inside the renderer's start
    start.release();
    await mounted;
    await vi.waitFor(() => expect(menuOpen(document), 'the press held and pressed: the forge menu open').toBe(true), { timeout: 5000 });
    expect(document.querySelector('.fx-help')!.closest<HTMLElement>('.fx-modal')!.hidden, 'the help card hidden').toBe(true);
  }, 60_000);

  /**
   * FC2-6, found by the runner's `fc2-early-8c51788df` (an unhandled error in every run of the case above): Controls is
   * wired before the renderer's await (page.ts:2303), and his `setHelp` reads `playing` to pick the card's tab
   * (page.ts:2302), declared only after the await (page.ts:3431), so an early press of Controls threw (`Cannot access
   * 'playing' before initialization`) and the card never opened. On `main` `setHelp` read nothing of the kind.
   */
  it('Controls pressed while the renderer starts opens its card on the editor\'s tab, and throws nothing (FC2-6)', async () => {
    const thrown: unknown[] = [];
    const onError = (e: ErrorEvent): void => { thrown.push(e.error ?? e.message); e.preventDefault(); };
    window.addEventListener('error', onError);
    try {
      const start = holdRenderer();
      const { mountForge } = await import('../../src/forge/page');
      const mounted = mountForge(document, {});
      await new Promise((r) => setTimeout(r, 0));
      toolbarButton(document, 'Controls').click();                // inside the renderer's start
      expect(thrown.map(String), 'the press threw nothing').toEqual([]);
      expect(document.querySelector('.fx-help')!.closest<HTMLElement>('.fx-modal')!.hidden, 'the card open').toBe(false);
      expect(document.querySelector('.fx-help [data-help-tab="editor"]')?.getAttribute('aria-selected'), 'on the editor\'s tab').toBe('true');
      start.release();
      await mounted;
    } finally {
      window.removeEventListener('error', onError);
    }
  }, 60_000);

  it('the scene\'s controls are inert and the loading card says so while the renderer starts; neither once the page is wired', async () => {
    const start = holdRenderer();
    const { mountForge } = await import('../../src/forge/page');
    const mounted = mountForge(document, {});
    await new Promise((r) => setTimeout(r, 0));
    for (const c of [...sceneControls(), openButton()]) {
      expect(c, 'each scene control is on the page').not.toBeNull();
      expect(c!.hasAttribute('inert'), `${c!.className}: inert while the renderer starts`).toBe(true);
    }
    expect(docksButton()!.hasAttribute('inert'), 'Docks takes the press (held), never inert').toBe(false);
    expect(docksButton()!.closest('[inert]'), 'nor inside an inert container').toBeNull();
    expect(loadingCard()!.hidden, 'the loading card is shown while the renderer starts').toBe(false);
    expect(document.querySelector('.fx-loading-title')!.textContent).toBe('Starting the Forge');
    start.release();
    await mounted;
    for (const c of sceneControls()) expect(c!.hasAttribute('inert'), `${c!.className}: not inert once wired`).toBe(false);
    await vi.waitFor(() => expect(loadingCard()!.hidden, 'the loading card gone once the first layout is open').toBe(true), { timeout: 5000 });
    expect(docksOff(), 'nothing pressed: the docks stay shown').toBe(false);
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

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForgeAgentApi } from '../src/forge/agent/api';
import { saveNamed } from '../src/forge/saves';
import { freshSavesDb, storedSaves, writeStoredSaves } from './forge/fakeSaves';
import type { LoadedMap } from '../src/loadMap';

/**
 * PAD-1 (FUI.R2; the review's IA-2; a browser adaptation, FG.R2): the Saves card is not a pad dead end. Opened from
 * the START menu's Saves row, the pad's Circle and START close it, Esc closes it, and Cross on it changes nothing. The
 * page is mounted as `forgeAgentPage.test.ts` mounts it; the pad is a standard-mapping stub read by the page's own frame.
 */

const archiveLoad = vi.hoisted(() => vi.fn<(stem: string) => Promise<LoadedMap>>());

// Only the GPU and disc I/O are replaced (as forgeAgentPage.test.ts): the page, its pad path and its cards are real.
vi.mock('../src/renderer', () => ({ createRenderer: async () => ({
  backend: 'webgl2', resize: () => undefined, presentation: () => 'native', render: () => undefined,
  setPresentation: () => undefined, setClearColor: () => undefined,
}) }));
vi.mock('../src/forge/archives', () => ({ Archives: class {
  onProgress = null;
  clips = async () => null;
  list = async () => ({ entries: [], problems: [] });
  load = archiveLoad;
  sourceRequest = () => ({ kind: 'http', baseUrl: '/maps' });
}, labelOf: (_entries: unknown, _stem: string, fallback: string) => fallback }));

/** The pad's standard mapping (`../src/forge/pad`): Cross 0, Circle 1, START 9, d-pad up 12. */
const CROSS = 0, CIRCLE = 1, START = 9, UP = 12;

const pad = {
  id: 'Test pad', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
};
let frames: FrameRequestCallback[] = [];
let clock = 0;
/** One frame of the page: every callback it asked for runs at the next clock. */
const tick = (): void => { clock += 16; const run = frames; frames = []; run.forEach((cb) => cb(clock)); };
/** A press and its release, a frame each (Circle's tap is read at its release). */
const press = (button: number): void => {
  pad.buttons[button]!.pressed = true; pad.buttons[button]!.value = 1; tick();
  pad.buttons[button]!.pressed = false; pad.buttons[button]!.value = 0; tick();
};
const savesCard = (): HTMLElement | null => document.querySelector<HTMLElement>('.fx-saves');
const savesShown = (): boolean => { const c = savesCard(); return !!c && !(c.closest('.fx-modal') as HTMLElement).hidden; };
const menuShown = (): boolean => !document.querySelector<HTMLElement>('.fx-padmenu')!.hidden;
const menuRow = (): string => document.querySelector('.fx-menu li.is-on .fx-menu-label')?.textContent ?? '';
/** START, then the d-pad up to the Saves row (the list wraps), then Cross on it. */
const openSavesByPad = (): void => {
  press(START);
  expect(menuShown()).toBe(true);
  for (let n = 0; n < 60 && menuRow() !== 'Saves'; n++) press(UP);
  expect(menuRow()).toBe('Saves');
  press(CROSS);
};

describe('the Saves card on the pad (PAD-1)', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
    history.replaceState(null, '', '/forge?floor');
    localStorage.clear();
    freshSavesDb();                                               // R3-B: the page's lists are in IndexedDB
    archiveLoad.mockReset().mockRejectedValue(new Error('No disc supplied'));
  });
  afterEach(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'getGamepads');
  });

  it('opens from START > Saves; Cross changes nothing; Circle, START and Esc close it; START reopens the menu', async () => {
    const { mountForge } = await import('../src/forge/page');
    let api!: ForgeAgentApi;
    await mountForge(document, { onAgentReady: (target) => { api = target; } });
    expect(api.read().ready).toBe(true);
    await writeStoredSaves((saves) => saveNamed(saves, 'Keep me', api.read().layout!, 1, 'keep-me').saves);
    api.refreshExternalState();
    await vi.waitFor(async () => expect((await api.execute('saves.list', {})).data).toHaveLength(1));
    clock = performance.now() + 1000;
    tick(); tick();                                               // the pad arms on a frame at rest

    openSavesByPad();
    expect(savesShown()).toBe(true);
    expect(savesCard()!.textContent).toContain('Keep me');
    // Cross on the card: nothing destructive, the card stays.
    press(CROSS);
    expect(savesShown()).toBe(true);
    expect((await storedSaves()).map((s) => s.id)).toEqual(['keep-me']);
    // Circle closes it; the page is ready again (no check running) and the pad is the editor's.
    press(CIRCLE);
    expect(savesShown()).toBe(false);
    expect(api.read().ready).toBe(true);
    expect(menuShown()).toBe(false);

    // A second START opens the menu again (it is not swallowed by a card); Saves reopens; START closes it.
    openSavesByPad();
    expect(savesShown()).toBe(true);
    press(START);
    expect(savesShown()).toBe(false);
    expect(menuShown()).toBe(false);

    // Esc closes it as well (OT.R68), from the toolbar's button.
    document.querySelector<HTMLButtonElement>('[data-forge="saves"]')!.click();
    expect(savesShown()).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
    expect(savesShown()).toBe(false);
    expect((await storedSaves()).map((s) => s.id)).toEqual(['keep-me']);
  }, 20_000);
});

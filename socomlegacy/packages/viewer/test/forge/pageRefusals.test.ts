// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import type { LoadedMap } from '../../src/loadMap';

const archiveLoad = vi.hoisted(() => vi.fn<(stem: string) => Promise<LoadedMap>>());
// Only the GPU and disc I/O are replaced (as `./operations.test.ts`): the editor, its notifier and its menu are real.
vi.mock('../../src/renderer', () => ({ createRenderer: async () => ({
  backend: 'webgl2', resize: () => undefined, presentation: () => 'native', render: () => undefined,
  setPresentation: () => undefined, setClearColor: () => undefined,
}) }));
vi.mock('../../src/forge/archives', () => ({ Archives: class {
  onProgress = null;
  clips = async () => null;
  list = async () => ({ entries: [], problems: [] });
  load = archiveLoad;
  sourceRequest = () => ({ kind: 'http', baseUrl: '/maps' });
}, labelOf: (_entries: unknown, _stem: string, fallback: string) => fallback }));

/**
 * FUI.R19 (the batch review of 2026-10-26, R8-3; a browser adaptation, FG.R2): a refusal of the page's own is the
 * notifier's refused path -- a toast of kind refusal AND the assertive status line -- on the basic paths as `refuseEdit`
 * gives it: Place with no prop chosen, and the Outliner sub-screen's locked placement.
 */
describe('FUI.R19: the page\'s own refusals give the toast and the line', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', () => 0);
    history.replaceState(null, '', '/forge?floor');
    localStorage.clear();
    archiveLoad.mockReset().mockRejectedValue(new Error('No disc supplied'));
  });
  afterEach(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); vi.unstubAllGlobals(); });

  const mount = async (): Promise<ForgeAgentApi> => {
    const { mountForge } = await import('../../src/forge/page');
    let api!: ForgeAgentApi;
    await mountForge(document, { onAgentReady: (target) => { api = target; } });
    return api;
  };
  const toast = (): HTMLElement => document.querySelector<HTMLElement>('.fx-toast')!;
  const line = (): HTMLElement => document.querySelector<HTMLElement>('.fx-status-msg')!;
  const refusedBoth = (words: string): void => {
    expect([toast().textContent, toast().dataset['kind'], toast().classList.contains('is-on')]).toEqual([words, 'refusal', true]);
    expect([line().textContent, line().dataset['kind'], line().classList.contains('is-bad')]).toEqual([words, 'refusal', true]);
  };

  it('Place with no prop chosen: a refused toast and the line', async () => {
    await mount();
    const input = document.querySelector<HTMLElement>('.fx-input')!;
    input.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    Object.assign(input, { setPointerCapture: () => undefined, releasePointerCapture: () => undefined, hasPointerCapture: () => false });
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2', key: '2', bubbles: true }));   // the Place tool
    input.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 100, clientY: 50, bubbles: true }));
    input.dispatchEvent(new MouseEvent('pointerup', { button: 0, clientX: 100, clientY: 50, bubbles: true }));
    refusedBoth('choose a prop in the assets first');
  }, 90_000);

  it('the Outliner\'s locked placement: Cross gives the toast and the line', async () => {
    const api = await mount();
    expect(await api.execute('spawn.place', { team: 'A', at: [10, 0, 10] }, api.read().revision)).toMatchObject({ ok: true });
    expect(await api.execute('piece.lock', { refs: ['spawn:0'] }, api.read().revision)).toMatchObject({ ok: true });
    document.querySelector<HTMLButtonElement>('[data-forge="menu"]')!.click();
    const row = (pick: (li: HTMLElement) => boolean): HTMLElement =>
      [...document.querySelectorAll<HTMLElement>('.fx-menu li')].find(pick)!;
    row((li) => li.querySelector('.fx-menu-label')?.textContent === 'Outliner').click();
    const locked = (): HTMLElement => row((li) => li.querySelector('.fx-menu-value')?.textContent?.includes('Locked') === true);
    locked().click();                                                   // Cross on the locked row
    refusedBoth('Locked: Square unlocks it');
    expect(api.read().refs).toMatchObject([{ ref: 'spawn:0', locked: true }]);
  }, 90_000);
});

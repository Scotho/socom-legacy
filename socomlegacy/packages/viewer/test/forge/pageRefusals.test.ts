// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import type { LoadedMap } from '../../src/loadMap';
// FC2-4: found and pressed through the contributor's editor (`./helpers/EDITOR-MAP.md`).
import { menuOpen, openMenu, toolbarButton } from './helpers/editor';

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
    // The Place tool: its button (`keys.ts`, the Forge Overhaul: the Place tool has no key; the number keys are the
    // placing tools'). Map T6: found by its word, Place (its title is the contributor's own now).
    toolbarButton(document, 'Place').click();
    input.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 100, clientY: 50, bubbles: true }));
    input.dispatchEvent(new MouseEvent('pointerup', { button: 0, clientX: 100, clientY: 50, bubbles: true }));
    refusedBoth('choose a prop in the assets first');
  }, 90_000);

  it('the Outliner\'s locked placement: Cross selects it and looks (his rule); its Delete still gives the toast and the line', async () => {
    // The contributor's rule (MISSION OT.R112: the Forge's UI is his) replaces FUI.R19's refusal for this one press: Cross
    // on a locked placement's Outliner row selects it and looks at it, no toast (page.ts:12302-12307, its note "Locked:
    // Cross selects and looks (no edits)"). What the old refusal protected still holds: the row's Delete (Triangle) on a
    // locked placement is refused, the toast and the line (page.ts:12309), and the placement stays, locked.
    const api = await mount();
    expect(await api.execute('spawn.place', { team: 'A', at: [10, 0, 10] }, api.read().revision)).toMatchObject({ ok: true });
    expect(await api.execute('piece.lock', { refs: ['spawn:0'] }, api.read().revision)).toMatchObject({ ok: true });
    const row = (pick: (li: HTMLElement) => boolean): HTMLElement =>
      [...document.querySelectorAll<HTMLElement>('.fx-menu li')].find(pick)!;
    const outlinerScreen = (): void => {
      openMenu(document);                                               // map T1: Controls > Forge menu (M)
      row((li) => li.querySelector('.fx-menu-label')?.textContent === 'Outliner').click();
    };
    const locked = (): HTMLElement => row((li) => li.querySelector('.fx-menu-value')?.textContent?.includes('Locked') === true);
    outlinerScreen();
    locked().click();                                                   // Cross on the locked row
    expect(toast().dataset['kind'], 'no refusal').not.toBe('refusal');
    expect(api.read().selection, 'selected').toEqual(['spawn:0']);
    if (!menuOpen(document)) outlinerScreen();                          // Cross shut the menu (its card left in the hidden host)
    locked().querySelector<HTMLButtonElement>('.fx-menu-act[data-pad-press="remove"]')!.click();   // Triangle: Delete
    refusedBoth('Locked: Square unlocks it');
    expect(api.read().refs).toMatchObject([{ ref: 'spawn:0', locked: true }]);
  }, 90_000);
});

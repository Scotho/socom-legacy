// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForgeAgentApi } from '../src/forge/agent/api';
import type { LoadedMap } from '../src/loadMap';

/**
 * FUI-2 (the review's IA-1; a browser adaptation, FG.R2): the map check's list is a sheet beside the editor, not the
 * dialog's slot, so a Check followed by Saves leaves the check finished (`checking` false: the page is ready, Play and
 * Create lobby answer) and the Saves card on a host that takes the pointer. The check before Play is still a card --
 * on the stack, its host see-through (`fx-check-modal`, `forgeMapCheck.spec.ts`) -- and while a card is open the
 * toolbar refuses to open Saves over it. The page is mounted as `forgeAgentPage.test.ts` mounts it.
 */

const archiveLoad = vi.hoisted(() => vi.fn<(stem: string) => Promise<LoadedMap>>());
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

const toolbar = (label: string): HTMLButtonElement =>
  [...document.querySelectorAll<HTMLButtonElement>('.fx-top button.fx-tool')].find((b) => b.textContent?.trim() === label)!;
const saves = (): HTMLElement | null => document.querySelector<HTMLElement>('.fx-saves');
const flush = (): Promise<void> => new Promise((done) => { setTimeout(done, 0); });

describe('the map check beside the cards (FUI-2, IA-1)', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', () => 0);
    history.replaceState(null, '', '/forge?floor');
    localStorage.clear();
    archiveLoad.mockReset().mockRejectedValue(new Error('No disc supplied'));
  });
  afterEach(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); vi.unstubAllGlobals(); });

  async function mounted(): Promise<ForgeAgentApi> {
    const { mountForge } = await import('../src/forge/page');
    let api!: ForgeAgentApi;
    await mountForge(document, { onAgentReady: (target) => { api = target; } });
    expect(api.read().ready).toBe(true);
    return api;
  }

  it('a Check followed by Saves: the check is done (the page ready) and the Saves card sits on a host that takes the pointer', async () => {
    const api = await mounted();
    toolbar('Check').click();
    // The empty floor has no spawn (`checkMap`'s spawn-none), so the sheet may open on its problems: either heading.
    await vi.waitFor(() => expect(document.querySelector('.fx-check-card h2')?.textContent).toMatch(/^(?:Map check|This map has problems)$/));
    const sheet = document.querySelector<HTMLElement>('.fx-check-card')!;
    expect(sheet.closest('.fx-modal'), 'the list is a sheet, not the dialog').toBeNull();
    expect(api.read().ready, 'the check is not left running behind its list').toBe(true);
    toolbar('Saves').click();
    expect(saves()).not.toBeNull();
    const host = saves()!.closest<HTMLElement>('.fx-modal')!;
    expect(host.hidden).toBe(false);
    expect(host.classList.contains('fx-check-modal'), 'no see-through, pointer-less host under Saves').toBe(false);
    expect(saves()!.getAttribute('role')).toBe('dialog');
    [...saves()!.querySelectorAll<HTMLButtonElement>('footer button')].find((b) => b.textContent === 'Close')!.click();
    expect(saves()).toBeNull();
    expect(api.read().ready).toBe(true);
    // The sheet closes by its own Close (and Esc, Circle: the page's way back with no card open).
    [...sheet.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Close')!.click();
    expect(document.querySelector('.fx-check-card')).toBeNull();
    toolbar('Check').click();
    await vi.waitFor(() => expect(document.querySelector('.fx-check-card')).not.toBeNull());
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
    expect(document.querySelector('.fx-check-card')).toBeNull();
  }, 20_000);

  it('the check before Play is a card on the stack: the toolbar refuses Saves over it; Esc goes back and the page is ready', async () => {
    const api = await mounted();
    expect(await api.execute('spawn.place', { team: 'A', at: [0, 80, 0] }, api.read().revision)).toMatchObject({ ok: true });
    document.querySelector<HTMLButtonElement>('.fx-play')!.click();
    await vi.waitFor(() => expect(document.querySelector('.fx-check-card h2')?.textContent).toBe('This map has problems'));
    const card = document.querySelector<HTMLElement>('.fx-check-card')!;
    expect(card.closest('.fx-modal.fx-check-modal')).not.toBeNull();     // see-through, as forgeMapCheck.spec.ts reads it
    expect(card.getAttribute('role')).toBe('dialog');
    expect(document.activeElement?.textContent, 'Go back first, never Play anyway').toBe('Go back');
    toolbar('Saves').click();
    expect(saves(), 'Saves refused while a card is open').toBeNull();
    expect(card.isConnected && !card.hidden).toBe(true);
    expect(document.querySelector('.fx-toast')!.textContent).toMatch(/card/i);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
    await flush();
    expect(document.querySelector('.fx-check-card')).toBeNull();
    expect(document.body.classList.contains('is-matching')).toBe(false);
    expect(api.read().ready).toBe(true);
  }, 20_000);
});

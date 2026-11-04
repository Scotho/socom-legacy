// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import { saveNamed } from '../../src/forge/saves';
import { freshSavesDb, storedSaves, writeStoredSaves } from './fakeSaves';
import type { LoadedMap } from '../../src/loadMap';

/**
 * FUI-2 (the review's IA-1, IA-2, IA-13, PAD-1, PAD-2, UX-3, VP-10's focus half; a browser adaptation, FG.R2): one card
 * stack on the page's dialog host. A card is pushed with its way back (Esc and Circle call the top card's `onBack`), is
 * a dialog (role, aria-modal, aria-labelledby), traps the focus and gives it back; a destructive one starts on Cancel
 * and Cross presses the focused button, never yes blindly. The stack is tested over a plain host; the page (only the
 * GPU and disc I/O replaced, as `forgeAgentPage.test.ts` mounts it) for the Saves card's pad walk, the danger confirm
 * and the nested rename. The check card and the toolbar's refusal are `../forgeMapCheckSheet.test.ts`.
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

/** Read at run time (the RED run of a module not written yet fails per case, not at the file's import). */
const at = (name: string): string => `../../src/forge/shell/${name}`;
const cardsModule = () => import(/* @vite-ignore */ at('cards')) as Promise<typeof import('../../src/forge/shell/cards')>;

/** A question card: its heading, Cancel (the safe choice) and the act. */
function question(heading: string, yes = 'Delete'): { card: HTMLElement; no: HTMLButtonElement; ok: HTMLButtonElement; said: string[] } {
  const card = document.createElement('div');
  card.className = 'fx-card';
  const h = document.createElement('h2');
  h.textContent = heading;
  const no = document.createElement('button');
  no.textContent = 'Cancel';
  no.dataset['padItem'] = '';
  no.dataset['cardSafe'] = '';
  const ok = document.createElement('button');
  ok.textContent = yes;
  ok.dataset['padItem'] = '';
  const said: string[] = [];
  no.addEventListener('click', () => said.push('no'));
  ok.addEventListener('click', () => said.push('yes'));
  card.append(h, no, ok);
  return { card, no, ok, said };
}
function rig(): { host: HTMLElement; opener: HTMLButtonElement } {
  const opener = document.createElement('button');
  opener.textContent = 'Saves';
  const host = document.createElement('div');
  host.className = 'fx-modal';
  host.hidden = true;
  document.body.replaceChildren(opener, host);
  opener.focus();
  return { host, opener };
}
const keydown = (target: EventTarget, key: string, shift = false): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', { key, code: key, shiftKey: shift, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
};

describe('the card stack (FUI-2)', () => {
  it('a card is a dialog named by its heading; the host shows while one is open; close pops it and gives the focus back', async () => {
    const { createCardStack } = await cardsModule();
    const { host, opener } = rig();
    const stack = createCardStack(document, host);
    const q = question('Delete this save?');
    const back = vi.fn();
    const handle = stack.open(q.card, { onBack: back, initialFocus: q.ok, label: 'Delete this save?' });
    expect(host.hidden).toBe(false);
    expect(q.card.getAttribute('role')).toBe('dialog');
    expect(q.card.getAttribute('aria-modal')).toBe('true');
    const named = document.getElementById(q.card.getAttribute('aria-labelledby')!);
    expect(named?.textContent).toBe('Delete this save?');
    expect(document.activeElement).toBe(q.ok);
    expect(stack.isOpen()).toBe(true);
    expect(stack.top()).toBe(handle);
    handle.close();
    expect(handle.open).toBe(false);
    expect(host.hidden).toBe(true);
    expect(q.card.isConnected).toBe(false);
    expect(document.activeElement).toBe(opener);                         // the focus goes back where it was
    handle.close();                                                      // twice is once
    expect(back).not.toHaveBeenCalled();
  });

  it('a card with no heading is named by its label; one opened with no first focus focuses itself, no row held', async () => {
    const { createCardStack } = await cardsModule();
    const { host } = rig();
    const stack = createCardStack(document, host);
    const card = document.createElement('div');
    const row = document.createElement('button');
    row.dataset['padItem'] = '';
    card.append(row);
    stack.open(card, { onBack: () => undefined, initialFocus: null, label: 'Your disc' });
    expect(card.getAttribute('aria-label')).toBe('Your disc');
    expect(document.activeElement).toBe(card);
    expect(card.querySelector('.is-pad-focused')).toBeNull();
  });

  it('stacks: the card under is out of the host (one card in it); Esc and Circle call only the top card\'s onBack; its pop shows the one under, focus kept', async () => {
    const { createCardStack } = await cardsModule();
    const { host } = rig();
    const stack = createCardStack(document, host);
    const under = question('Saves', 'Open');
    const backUnder = vi.fn();
    const first = stack.open(under.card, { onBack: backUnder, initialFocus: null, label: 'Saves' });
    stack.pad('down');
    stack.pad('down');
    expect(document.activeElement).toBe(under.ok);
    const over = question('Rename this save', 'Rename');
    let second: { close(): void } | null = null;
    const backOver = vi.fn(() => second?.close());
    second = stack.open(over.card, { onBack: backOver, initialFocus: over.ok, label: 'Rename' });
    expect(stack.size()).toBe(2);
    expect(under.card.isConnected).toBe(false);                           // one card in the host: a locator into it meets that one
    expect(host.children.length).toBe(1);
    expect(over.card.parentElement).toBe(host);
    expect(keydown(over.ok, 'Escape').defaultPrevented).toBe(true);
    expect(backOver).toHaveBeenCalledTimes(1);
    expect(backUnder).not.toHaveBeenCalled();
    expect(under.card.parentElement).toBe(host);
    expect(document.activeElement).toBe(under.ok);                        // the place it had when covered
    expect(under.card.querySelector('.is-pad-focused')).toBe(under.ok);
    expect(stack.back()).toBe(true);                                      // Circle: the top's way back
    expect(backUnder).toHaveBeenCalledTimes(1);
    first.close();
    expect(stack.back()).toBe(false);                                     // nothing open
  });

  it('danger: Cancel is focused first and Cross presses the focused button; a second Cross does not say yes', async () => {
    const { createCardStack } = await cardsModule();
    const { host } = rig();
    const stack = createCardStack(document, host);
    const q = question('Start a new layout?', 'Start new');
    const handle = stack.open(q.card, { onBack: () => handle.close(), initialFocus: q.ok, label: 'Start a new layout?', danger: true });
    q.no.addEventListener('click', () => handle.close());
    expect(document.activeElement).toBe(q.no);
    expect(q.card.querySelector('.is-pad-focused')).toBe(q.no);
    expect(q.card.dataset['danger']).toBe('');
    stack.pad('act');
    expect(q.said).toEqual(['no']);
    expect(stack.isOpen()).toBe(false);
    stack.pad('act');                                                     // the second Cross: no card, nothing
    expect(q.said).toEqual(['no']);
  });

  it('Cross with no row held runs the card\'s onAct; the d-pad walks the top card; Square and Triangle press a row\'s own', async () => {
    const { createCardStack } = await cardsModule();
    const { host } = rig();
    const stack = createCardStack(document, host);
    const card = document.createElement('div');
    card.innerHTML = '<ul><li data-pad-item><button data-pad="act">Open</button><button data-pad="secondary">Rename</button><button data-pad="remove">Delete</button></li></ul>';
    const pressed: string[] = [];
    for (const b of card.querySelectorAll('button')) b.addEventListener('click', () => pressed.push(b.textContent!));
    const act = vi.fn();
    stack.open(card, { onBack: () => undefined, onAct: act, initialFocus: null, label: 'Saves' });
    stack.pad('act');
    expect(act).toHaveBeenCalledTimes(1);
    expect(pressed).toEqual([]);
    stack.pad('down');
    stack.pad('act');
    stack.pad('secondary');
    stack.pad('remove');
    expect(pressed).toEqual(['Open', 'Rename', 'Delete']);
    expect(act).toHaveBeenCalledTimes(1);
  });

  it('traps the focus: Tab past the last control comes to the first, Shift+Tab before the first to the last', async () => {
    const { createCardStack } = await cardsModule();
    const { host } = rig();
    const stack = createCardStack(document, host);
    const q = question('Delete this save?');
    stack.open(q.card, { onBack: () => undefined, initialFocus: q.ok, label: 'Delete' });
    expect(keydown(q.ok, 'Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(q.no);
    expect(keydown(q.no, 'Tab', true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(q.ok);
    q.no.focus();
    expect(keydown(q.no, 'Tab').defaultPrevented).toBe(false);             // inside: the browser's own step
  });

  it('R3-A (4): the trap holds with the focus outside the host -- a click on the scrim, then Tab or Shift+Tab, comes back into the card', async () => {
    const { createCardStack } = await cardsModule();
    const { host, opener } = rig();
    const stack = createCardStack(document, host);
    const q = question('Delete this save?');
    stack.open(q.card, { onBack: () => undefined, initialFocus: q.ok, label: 'Delete' });
    q.ok.blur();                                                       // the scrim clicked: the focus on the body
    expect(document.activeElement).toBe(document.body);
    expect(keydown(document, 'Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(q.no);
    q.no.blur();
    expect(keydown(document.body, 'Tab', true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(q.ok);
    // Behind the card (the opener it covers): the next Tab comes back into the card, not on along the page.
    opener.focus();
    expect(keydown(opener, 'Tab').defaultPrevented).toBe(true);
    expect(q.card.contains(document.activeElement)).toBe(true);
    // A see-through card (the check's host class) is trapped the same way.
    const check = question('Map check', 'Play anyway');
    stack.open(check.card, { onBack: () => undefined, initialFocus: check.no, label: 'Map check', hostClass: 'fx-check-modal' });
    check.no.blur();
    expect(keydown(document, 'Tab').defaultPrevented).toBe(true);
    expect(check.card.contains(document.activeElement)).toBe(true);
    // No card open: Tab is the browser's own again, and a disposed stack listens no more.
    stack.top()!.close();
    stack.top()!.close();
    opener.focus();
    expect(keydown(opener, 'Tab').defaultPrevented).toBe(false);
    stack.open(question('Again').card, { onBack: () => undefined, initialFocus: null, label: 'Again' });
    stack.dispose();
    opener.focus();
    expect(keydown(opener, 'Tab').defaultPrevented).toBe(false);
  });

  it('an Esc the page already took (defaultPrevented) is not a second way back', async () => {
    const { createCardStack } = await cardsModule();
    const { host } = rig();
    const stack = createCardStack(document, host);
    const q = question('Saves');
    const back = vi.fn();
    stack.open(q.card, { onBack: back, initialFocus: q.ok, label: 'Saves' });
    const taken = (e: Event): void => e.preventDefault();
    window.addEventListener('keydown', taken, true);
    keydown(q.ok, 'Escape');
    window.removeEventListener('keydown', taken, true);
    expect(back).not.toHaveBeenCalled();
  });

  it('replace redraws a card in place: its scroll and its held row kept, still a dialog, still on top', async () => {
    const { createCardStack } = await cardsModule();
    const { host } = rig();
    const stack = createCardStack(document, host);
    const draw = (): HTMLElement => {
      const card = document.createElement('div');
      card.innerHTML = `<h2>Saves</h2><ul class="fx-saves-list">${['a', 'b', 'c'].map((n) => `<li data-pad-item data-save-id="${n}"><button data-pad="act">Open</button></li>`).join('')}</ul>`;
      return card;
    };
    const handle = stack.open(draw(), { onBack: () => undefined, initialFocus: null, label: 'Saves' });
    stack.pad('down');
    stack.pad('down');
    handle.card.querySelector<HTMLElement>('ul')!.scrollTop = 40;
    const next = draw();
    handle.replace(next);
    expect(handle.card).toBe(next);
    expect(next.isConnected).toBe(true);
    expect(next.getAttribute('role')).toBe('dialog');
    expect(next.querySelector('ul')!.scrollTop).toBe(40);
    expect(next.querySelector('.is-pad-focused')?.getAttribute('data-save-id')).toBe('b');
    expect(document.activeElement).toBe(next.querySelector('[data-save-id="b"]'));
    expect(stack.top()).toBe(handle);
  });

  it('the host carries the top card\'s hostClass only while that card is on top; onChange tells each open and close', async () => {
    const { createCardStack } = await cardsModule();
    const { host } = rig();
    const stack = createCardStack(document, host);
    const changed = vi.fn();
    stack.onChange = changed;
    const check = question('This map has problems', 'Play anyway');
    const c = stack.open(check.card, { onBack: () => undefined, initialFocus: check.no, label: 'Map check', hostClass: 'fx-check-modal' });
    expect(host.classList.contains('fx-check-modal')).toBe(true);
    const over = question('Saves');
    const s = stack.open(over.card, { onBack: () => undefined, initialFocus: null, label: 'Saves' });
    expect(host.classList.contains('fx-check-modal')).toBe(false);       // the card on top is clickable
    s.close();
    expect(host.classList.contains('fx-check-modal')).toBe(true);
    c.close();
    expect(host.classList.contains('fx-check-modal')).toBe(false);
    expect(changed).toHaveBeenCalledTimes(4);
    stack.dispose();
    expect(stack.isOpen()).toBe(false);
  });
});

/* ---------- the mounted page ---------- */

/** The pad's standard mapping (`../../src/forge/pad`): Cross 0, Circle 1, Square 2, Triangle 3, START 9, d-pad up 12 / down 13. */
const CROSS = 0, CIRCLE = 1, SQUARE = 2, TRIANGLE = 3, START = 9, UP = 12, DOWN = 13;
const pad = {
  id: 'Test pad', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
};
let frames: FrameRequestCallback[] = [];
let clock = 0;
const tick = (): void => { clock += 16; const run = frames; frames = []; run.forEach((cb) => cb(clock)); };
const press = (button: number): void => {
  pad.buttons[button]!.pressed = true; pad.buttons[button]!.value = 1; tick();
  pad.buttons[button]!.pressed = false; pad.buttons[button]!.value = 0; tick();
};
const flush = (): Promise<void> => new Promise((done) => { setTimeout(done, 0); });
const savesCard = (): HTMLElement | null => document.querySelector<HTMLElement>('.fx-saves');
const menuRow = (): string => document.querySelector('.fx-menu li.is-on .fx-menu-label')?.textContent ?? '';
/** The card on top of the dialog host: the one not hidden. */
const topCard = (): HTMLElement | null => [...document.querySelectorAll<HTMLElement>('.fx-modal:not(.fx-padmenu) > .fx-card')].find((c) => !(c.parentElement as HTMLElement).hidden) ?? null;
const topHeading = (): string => topCard()?.querySelector('h2')?.textContent ?? '';
const menuTo = (label: string): void => {
  press(START);
  for (let n = 0; n < 60 && menuRow() !== label; n++) press(UP);
  expect(menuRow()).toBe(label);
};

describe('the mounted Forge: its cards on the stack (FUI-2)', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
    history.replaceState(null, '', '/forge?floor');
    localStorage.clear();
    freshSavesDb();                                                      // R3-B: the page's lists are in IndexedDB
    archiveLoad.mockReset().mockRejectedValue(new Error('No disc supplied'));
  });
  afterEach(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'getGamepads');
  });

  async function mounted(): Promise<ForgeAgentApi> {
    const { mountForge } = await import('../../src/forge/page');
    let api!: ForgeAgentApi;
    await mountForge(document, { onAgentReady: (target) => { api = target; } });
    expect(api.read().ready).toBe(true);
    // R3-B: another writer's list, through the store; the page reads it again on refreshExternalState
    await writeStoredSaves((saves) => saveNamed(saveNamed(saves, 'Yard', api.read().layout!, 1, 'yard').saves, 'Dock', api.read().layout!, 2, 'dock').saves);
    api.refreshExternalState();
    await vi.waitFor(async () => expect((await api.execute('saves.list', {})).data).toHaveLength(2));
    clock = performance.now() + 1000;
    tick(); tick();                                                      // the pad arms on a frame at rest
    return api;
  }

  it('Saves from START: a dialog the d-pad walks; Square renames and Triangle deletes behind a Cancel-first confirm; Circle backs out', async () => {
    await mounted();
    menuTo('Saves');
    press(CROSS);
    const card = savesCard()!;
    expect(card.getAttribute('role')).toBe('dialog');
    expect(card.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(card.getAttribute('aria-labelledby')!)?.textContent).toBe('Saves');
    press(DOWN);
    const row = (): HTMLElement | null => savesCard()?.querySelector<HTMLElement>('.is-pad-focused') ?? null;
    const first = card.querySelector<HTMLElement>('li[data-save-id]')!;
    const id = first.dataset['saveId'];
    expect(row()).toBe(first);
    // Square: Rename, a text card over Saves (a dialog too); Circle backs out of it to the same row.
    press(SQUARE);
    expect(topHeading()).toBe('Rename this save');
    expect(topCard()!.getAttribute('role')).toBe('dialog');
    expect(savesCard(), 'Saves out of the host while covered').toBeNull();
    press(CIRCLE);
    await flush();
    expect(topHeading()).toBe('Saves');
    expect(row()?.dataset['saveId']).toBe(id);
    // Triangle: Delete asks, Cancel focused first; Cross presses Cancel -- the save is kept.
    press(TRIANGLE);
    expect(topHeading()).toBe('Delete this save?');
    expect(document.activeElement?.textContent).toBe('Cancel');
    press(CROSS);
    await flush();
    expect((await storedSaves()).map((s) => s.id).sort()).toEqual(['dock', 'yard']);
    expect(topHeading()).toBe('Saves');
    // Circle closes Saves; the pad is the editor's again (START opens the menu).
    press(CIRCLE);
    expect(savesCard()).toBeNull();
    press(START);
    expect(document.querySelector<HTMLElement>('.fx-padmenu')!.hidden).toBe(false);
    press(START);
  }, 20_000);

  it('a destructive confirm (START > Base, Cross, Cross) starts on Cancel: the second Cross does not drop the layout', async () => {
    const api = await mounted();
    expect(await api.execute('spawn.place', { team: 'A', at: [0, 0, 0] }, api.read().revision)).toMatchObject({ ok: true });
    menuTo('Base');
    press(CROSS);
    expect(topHeading()).toBe('Start a new layout?');
    expect(document.activeElement?.textContent).toBe('Cancel');
    expect(topCard()!.querySelector('.is-pad-focused')?.textContent).toBe('Cancel');
    press(CROSS);
    await flush();
    await flush();
    expect(topCard()).toBeNull();
    expect(api.read().layout!.spawns).toHaveLength(1);
  }, 20_000);

  it('a nested rename reopens Saves at the same scroll, the renamed row in it', async () => {
    await mounted();
    document.querySelector<HTMLButtonElement>('[data-forge="saves"]')!.click();
    const list = savesCard()!.querySelector<HTMLElement>('.fx-saves-list')!;
    list.scrollTop = 40;
    const row = savesCard()!.querySelector<HTMLElement>('li[data-save-id="yard"]')!;
    [...row.querySelectorAll('button')].find((b) => b.textContent === 'Rename')!.click();
    expect(topHeading()).toBe('Rename this save');
    const form = topCard() as HTMLFormElement;
    form.querySelector('input')!.value = 'Renamed';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(savesCard()?.textContent ?? '').toContain('Renamed'));   // R3-B: the write awaited
    expect(topHeading()).toBe('Saves');
    expect((await storedSaves()).map((s) => s.name).sort()).toEqual(['Dock', 'Renamed']);
    expect(savesCard()!.querySelector<HTMLElement>('.fx-saves-list')!.scrollTop).toBe(40);
    // Esc closes it (the page's keys, OT.R68).
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
    expect(savesCard()).toBeNull();
  }, 20_000);
});
